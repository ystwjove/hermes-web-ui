// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const chatApi = vi.hoisted(() => ({
  registerSessionHandlers: vi.fn(),
  unregisterSessionHandlers: vi.fn(),
  getChatRunSocket: vi.fn(() => ({ emit: vi.fn() })),
  sessionCommandHandlers: [] as Array<(event: any) => void>,
  peerUserMessageHandlers: [] as Array<(event: any) => void>,
}))

vi.mock('@/api/hermes/chat', () => ({
  startRunViaSocket: vi.fn(),
  resumeSession: vi.fn(),
  registerSessionHandlers: chatApi.registerSessionHandlers,
  unregisterSessionHandlers: chatApi.unregisterSessionHandlers,
  getChatRunSocket: chatApi.getChatRunSocket,
  respondToolApproval: vi.fn(),
  respondClarify: vi.fn(),
  onPeerUserMessage: vi.fn((handler: (event: any) => void) => {
    chatApi.peerUserMessageHandlers.push(handler)
    return vi.fn()
  }),
  onSessionCommand: vi.fn((handler: (event: any) => void) => {
    chatApi.sessionCommandHandlers.push(handler)
    return vi.fn()
  }),
}))

vi.mock('@/api/client', () => ({
  getActiveProfileName: () => 'default',
}))

vi.mock('@/api/hermes/sessions', () => ({
  deleteSession: vi.fn(),
  fetchSession: vi.fn(),
  fetchSessions: vi.fn(),
  setSessionModel: vi.fn(),
}))

vi.mock('@/api/hermes/download', () => ({
  getDownloadUrl: (_path: string, name: string) => `/download/${name}`,
}))

vi.mock('@/utils/completion-sound', () => ({
  primeCompletionSound: vi.fn(),
  playCompletionSound: vi.fn(),
}))

import { useChatStore, type Session } from '@/stores/hermes/chat'
import { setSessionModel } from '@/api/hermes/sessions'

function makeSession(): Session {
  return {
    id: 'session-1',
    title: 'session',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('chat store session.command fanout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    chatApi.sessionCommandHandlers = []
    chatApi.peerUserMessageHandlers = []
    setActivePinia(createPinia())
  })

  it('attaches to a goal resume run started from another window', () => {
    const store = useChatStore()
    const session = makeSession()
    store.sessions = [session]
    store.activeSessionId = 'session-1'
    store.activeSession = session

    expect(chatApi.sessionCommandHandlers).toHaveLength(1)

    chatApi.sessionCommandHandlers[0]({
      event: 'session.command',
      session_id: 'session-1',
      command: 'goal',
      action: 'resume',
      message: 'Goal resumed',
      started: true,
      terminal: false,
    })

    expect(store.isStreaming).toBe(true)
    expect(chatApi.registerSessionHandlers).toHaveBeenCalledWith('session-1', expect.objectContaining({
      onRunStarted: expect.any(Function),
      onSessionCommand: expect.any(Function),
    }))
    expect(store.messages).toEqual([
      expect.objectContaining({
        role: 'command',
        content: 'Goal resumed',
        commandAction: 'resume',
      }),
    ])
  })

  it('does not clear the transcript for goal done commands', () => {
    const store = useChatStore()
    const session = makeSession()
    session.messages = [
      { id: 'user-1', role: 'user', content: 'keep me', timestamp: 1 },
    ]
    store.sessions = [session]
    store.activeSessionId = 'session-1'
    store.activeSession = session

    chatApi.sessionCommandHandlers[0]({
      event: 'session.command',
      session_id: 'session-1',
      command: 'goal',
      action: 'clear',
      message: 'Goal cleared.',
      terminal: true,
    })

    expect(store.messages).toEqual([
      expect.objectContaining({ id: 'user-1', content: 'keep me' }),
      expect.objectContaining({
        role: 'command',
        content: 'Goal cleared.',
        commandAction: 'clear',
      }),
    ])
  })

  it('adds a system notification when the active session model changes', async () => {
    vi.mocked(setSessionModel).mockResolvedValue(true)
    const store = useChatStore()
    const session = makeSession()
    session.model = 'old-model'
    session.provider = 'deepseek'
    store.sessions = [session]
    store.activeSessionId = 'session-1'
    store.activeSession = session

    const ok = await store.switchSessionModel('new-model', 'openai', 'session-1')

    expect(ok).toBe(true)
    expect(setSessionModel).toHaveBeenCalledWith('session-1', 'new-model', 'openai')
    expect(session.model).toBe('new-model')
    expect(session.provider).toBe('openai')
    expect(session.messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('new-model'),
      }),
    ])
  })
})
