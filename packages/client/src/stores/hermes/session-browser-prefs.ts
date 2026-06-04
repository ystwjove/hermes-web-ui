import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useProfilesStore } from './profiles'

const PIN_KEY_PREFIX = 'hermes_session_pins_v1_'
const ARCHIVED_KEY_PREFIX = 'hermes_session_archived_v1_'
const HUMAN_ONLY_KEY_PREFIX = 'hermes_human_only_v1_'

function currentProfileName(): string {
  try {
    return useProfilesStore().activeProfileName || 'default'
  } catch {
    // Fallback during store initialization
    return localStorage.getItem('hermes_active_profile_name') || 'default'
  }
}

function pinsKey(profileName: string): string {
  return `${PIN_KEY_PREFIX}${profileName}`
}

function archivedKey(profileName: string): string {
  return `${ARCHIVED_KEY_PREFIX}${profileName}`
}

function humanOnlyKey(profileName: string): string {
  return `${HUMAN_ONLY_KEY_PREFIX}${profileName}`
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota/storage errors — fall back to in-memory only
  }
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export const useSessionBrowserPrefsStore = defineStore('session-browser-prefs', () => {
  const profileName = ref(currentProfileName())
  const pinnedIds = ref<string[]>(loadJson<string[]>(pinsKey(profileName.value), []))
  const archivedIds = ref<string[]>(loadJson<string[]>(archivedKey(profileName.value), []))
  const humanOnly = ref<boolean>(loadJson<boolean>(humanOnlyKey(profileName.value), true))

  function reload() {
    profileName.value = currentProfileName()
    pinnedIds.value = loadJson<string[]>(pinsKey(profileName.value), [])
    archivedIds.value = loadJson<string[]>(archivedKey(profileName.value), [])
    humanOnly.value = loadJson<boolean>(humanOnlyKey(profileName.value), true)
  }

  function persistPins() {
    saveJson(pinsKey(profileName.value), pinnedIds.value)
  }

  function persistHumanOnly() {
    saveJson(humanOnlyKey(profileName.value), humanOnly.value)
  }

  function isPinned(sessionId: string): boolean {
    return pinnedIds.value.includes(sessionId)
  }

  function togglePinned(sessionId: string) {
    if (isPinned(sessionId)) {
      pinnedIds.value = pinnedIds.value.filter(id => id !== sessionId)
    } else {
      pinnedIds.value = [...pinnedIds.value, sessionId]
    }
    persistPins()
  }

  function removePinned(sessionId: string): boolean {
    if (!isPinned(sessionId)) return false
    pinnedIds.value = pinnedIds.value.filter(id => id !== sessionId)
    persistPins()
    return true
  }

  function persistArchived() {
    saveJson(archivedKey(profileName.value), archivedIds.value)
  }

  function isArchived(sessionId: string): boolean {
    return archivedIds.value.includes(sessionId)
  }

  function toggleArchived(sessionId: string) {
    if (isArchived(sessionId)) {
      archivedIds.value = archivedIds.value.filter(id => id !== sessionId)
      persistArchived()
      return false
    } else {
      archivedIds.value = [...archivedIds.value, sessionId]
      if (isPinned(sessionId)) {
        pinnedIds.value = pinnedIds.value.filter(id => id !== sessionId)
        persistPins()
      }
      persistArchived()
      return true
    }
  }

  function removeArchived(sessionId: string): boolean {
    if (!isArchived(sessionId)) return false
    archivedIds.value = archivedIds.value.filter(id => id !== sessionId)
    persistArchived()
    return true
  }

  function setHumanOnly(value: boolean) {
    if (humanOnly.value === value) return
    humanOnly.value = value
    persistHumanOnly()
  }

  function pruneMissingSessions(existingIds: string[]): boolean {
    if (existingIds.length === 0) return false
    const existing = new Set(existingIds)
    const nextPinnedIds = pinnedIds.value.filter(id => existing.has(id))
    const nextArchivedIds = archivedIds.value.filter(id => existing.has(id))
    const pinnedChanged = !sameIds(nextPinnedIds, pinnedIds.value)
    const archivedChanged = !sameIds(nextArchivedIds, archivedIds.value)
    if (pinnedChanged) {
      pinnedIds.value = nextPinnedIds
      persistPins()
    }
    if (archivedChanged) {
      archivedIds.value = nextArchivedIds
      persistArchived()
    }
    return pinnedChanged || archivedChanged
  }

  watch(
    () => useProfilesStore().activeProfileName,
    () => reload(),
  )

  return {
    profileName,
    pinnedIds,
    archivedIds,
    humanOnly,
    reload,
    isPinned,
    togglePinned,
    removePinned,
    isArchived,
    toggleArchived,
    removeArchived,
    setHumanOnly,
    pruneMissingSessions,
  }
})
