<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NSwitch, NSelect, NText, useMessage } from 'naive-ui'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { useModelsStore } from '@/stores/hermes/models'
import { useAppStore } from '@/stores/hermes/app'
import { updateDefaultModel } from '@/api/hermes/system'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useI18n()
const profilesStore = useProfilesStore()
const modelsStore = useModelsStore()
const appStore = useAppStore()
const message = useMessage()

const showModal = ref(true)
const loading = ref(false)
const name = ref('')
const clone = ref(false)
const selectedModel = ref<string | null>(null)
const nameValidationMessage = ref('')

onMounted(() => {
  if (modelsStore.allModels.length === 0) {
    void modelsStore.fetchProviders()
  }
})

const modelOptions = computed(() => {
  const groups = new Map<string, { label: string; models: string[] }>()
  for (const model of modelsStore.allModels) {
    const group = groups.get(model.provider) || { label: model.label, models: [] }
    group.models.push(model.id)
    groups.set(model.provider, group)
  }

  return Array.from(groups.entries()).map(([provider, group]) => ({
    type: 'group' as const,
    label: group.label,
    key: provider,
    children: group.models.map(modelId => ({
      label: modelId,
      value: `${provider}::${modelId}`,
    })),
  }))
})

function handleNameInput(value: string) {
  // 过滤掉不符合规则的字符，只保留小写字母、数字、下划线和连字符
  const filtered = value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (filtered !== value) {
    nameValidationMessage.value = t('profiles.nameValidation')
  } else {
    nameValidationMessage.value = ''
  }
  name.value = filtered
}

async function handleSave() {
  if (!name.value) {
    message.warning(t('profiles.namePlaceholder'))
    return
  }

  if (!/^[a-z0-9_-]+$/.test(name.value)) {
    message.error(t('profiles.nameValidation'))
    return
  }

  loading.value = true
  try {
    const res = await profilesStore.createProfile(name.value.trim(), clone.value)
    if (res.success) {
      const stripped = res.strippedCredentials ?? []
      const disabled = res.disabledPlatforms ?? []
      const cfgStripped = res.strippedConfigCredentials ?? []
      if (clone.value && (stripped.length > 0 || disabled.length > 0 || cfgStripped.length > 0)) {
        const parts: string[] = []
        if (stripped.length > 0) parts.push(t('profiles.cloneStrippedCredentials', { count: stripped.length, list: stripped.join(', ') }))
        if (disabled.length > 0) parts.push(t('profiles.cloneDisabledPlatforms', { count: disabled.length, list: disabled.join(', ') }))
        if (cfgStripped.length > 0) parts.push(t('profiles.cloneStrippedConfigCredentials', { count: cfgStripped.length, list: cfgStripped.join(', ') }))
        message.info(`${t('profiles.createSuccess', { name: name.value.trim() })}\n${parts.join('\n')}`, { duration: 6000 })
      } else {
        message.success(t('profiles.createSuccess', { name: name.value.trim() }))
      }
      if (selectedModel.value) {
        const [provider, ...modelParts] = selectedModel.value.split('::')
        const modelId = modelParts.join('::')
        if (provider && modelId) {
          try {
            await updateDefaultModel({
              default: modelId,
              provider,
              profile: name.value.trim(),
            })
            await appStore.reloadModels()
          } catch {
            message.warning(t('profiles.modelSetFailed'))
          }
        }
      }
      emit('saved')
    } else {
      const errorMsg = res.error || t('profiles.createFailed')
      message.error(errorMsg)
    }
  } finally {
    loading.value = false
  }
}

function handleClose() {
  showModal.value = false
  setTimeout(() => emit('close'), 200)
}
</script>

<template>
  <NModal
    v-model:show="showModal"
    preset="card"
    :title="t('profiles.create')"
    :style="{ width: 'min(420px, calc(100vw - 32px))' }"
    :mask-closable="!loading"
    @after-leave="emit('close')"
  >
    <NForm label-placement="top">
      <NFormItem :label="t('profiles.name')" required>
        <NInput
          v-model:value="name"
          :placeholder="t('profiles.namePlaceholder')"
          @input="handleNameInput"
        />
      </NFormItem>
      <NText v-if="nameValidationMessage" depth="3" type="warning" style="font-size: 12px;">
        {{ nameValidationMessage }}
      </NText>

      <NFormItem :label="t('profiles.cloneFromCurrent')">
        <NSwitch v-model:value="clone" />
      </NFormItem>
      <NText v-if="clone" depth="3" style="font-size: 12px;">
        {{ t('profiles.cloneCleanupNotice') }}
      </NText>

      <NFormItem :label="t('profiles.selectModel')" class="model-form-item">
        <NSelect
          v-model:value="selectedModel"
          :options="modelOptions"
          :placeholder="t('profiles.selectModelPlaceholder')"
          :loading="modelsStore.loading"
          clearable
          filterable
        />
      </NFormItem>
      <NText depth="3" style="font-size: 12px;">
        {{ t('profiles.selectModelHint') }}
      </NText>
    </NForm>

    <template #footer>
      <div class="modal-footer">
        <NButton @click="handleClose">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="loading" @click="handleSave">
          {{ t('common.create') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
