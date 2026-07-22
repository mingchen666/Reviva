import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ALIYUN_ASR_PRESET_MODELS,
  formatAliyunAsrLimit,
  getAliyunAsrModelCapability,
} from '@/constants/aliyunAsrModels'

export const SPEECH_PROVIDER_DEFINITIONS = Object.freeze([
  {
    id: 'local_asr',
    name: '本地 ASR 服务',
    shortName: '本地 HTTP ASR',
    icon: 'ri-cpu-line',
    accent: '#10B981',
    description: '连接本地的 OpenAI Transcriptions 兼容 HTTP 服务。',
  },
  {
    id: 'openai_whisper_compatible',
    name: 'OpenAI Whisper',
    shortName: 'OpenAI兼容接口',
    icon: 'ri-cloud-line',
    accent: '#6C8AFF',
    description: '使用兼容openai请求 /audio/transcriptions 文件上传接口。',
  },
  {
    id: 'aliyun_bailian_asr',
    name: '阿里云百炼',
    shortName: '百炼 ASR',
    icon: 'ri-mic-ai-line',
    accent: '#F59E0B',
    description: '阿里百炼服务，用于音视频url的异步长音频转录。',
  },
])

export const ALIYUN_ASR_MODELS = ALIYUN_ASR_PRESET_MODELS

export function createDefaultSpeechSettings() {
  return {
    version: 2,
    defaultProviderId: 'local_asr',
    providers: {
      local_asr: {
        enabled: false,
        baseUrl: '',
        apiKey: '',
        model: 'whisper-1',
        timestampLevel: 'segment',
      },
      openai_whisper_compatible: {
        enabled: false,
        baseUrl: '',
        apiKey: '',
        model: 'whisper-1',
        timestampLevel: 'segment',
      },
      aliyun_bailian_asr: {
        enabled: false,
        apiKey: '',
        workspaceId: '',
        region: 'cn-beijing',
        model: 'fun-asr',
        language: 'auto',
        enableTimestamps: true,
        enableDiarization: false,
      },
    },
  }
}

export function normalizeSpeechSettings(value = {}) {
  const defaults = createDefaultSpeechSettings()
  const input = value && typeof value === 'object' ? value : {}
  const providers = input.providers && typeof input.providers === 'object' ? input.providers : {}
  const normalizeTimestampLevel = (value, fallback) => ['none', 'segment', 'word'].includes(value) ? value : fallback
  const normalizeHttpProvider = (id) => {
    const source = providers[id] && typeof providers[id] === 'object' ? providers[id] : {}
    const providerDefaults = defaults.providers[id]
    const legacyLocalConfig = id === 'local_asr'
      && !String(source.baseUrl || '').trim()
      && ['backend', 'executablePath', 'device', 'computeType', 'vad'].some(key => Object.prototype.hasOwnProperty.call(source, key))
    const baseUrl = String(source.baseUrl ?? providerDefaults.baseUrl).trim()
    return {
      enabled: id === 'local_asr'
        ? Boolean(source.enabled && baseUrl)
        : Boolean(source.enabled),
      baseUrl,
      apiKey: String(source.apiKey ?? providerDefaults.apiKey),
      model: legacyLocalConfig
        ? providerDefaults.model
        : String(source.model ?? providerDefaults.model).trim(),
      timestampLevel: normalizeTimestampLevel(source.timestampLevel, providerDefaults.timestampLevel),
    }
  }
  const aliyunSource = providers.aliyun_bailian_asr && typeof providers.aliyun_bailian_asr === 'object'
    ? providers.aliyun_bailian_asr
    : {}
  const aliyunDefaults = defaults.providers.aliyun_bailian_asr
  const aliyunModel = String(aliyunSource.model ?? aliyunDefaults.model).trim() || aliyunDefaults.model
  const aliyunModelCapability = getAliyunAsrModelCapability(aliyunModel)
  const normalizedProviders = {
    local_asr: normalizeHttpProvider('local_asr'),
    openai_whisper_compatible: normalizeHttpProvider('openai_whisper_compatible'),
    aliyun_bailian_asr: {
      enabled: Boolean(aliyunSource.enabled),
      apiKey: String(aliyunSource.apiKey ?? aliyunDefaults.apiKey),
      workspaceId: String(aliyunSource.workspaceId ?? aliyunDefaults.workspaceId).trim(),
      region: String(aliyunSource.region ?? aliyunDefaults.region).trim() || aliyunDefaults.region,
      model: aliyunModel,
      language: String(aliyunSource.language ?? aliyunDefaults.language).trim() || aliyunDefaults.language,
      enableTimestamps: aliyunSource.enableTimestamps === undefined
        ? aliyunDefaults.enableTimestamps
        : Boolean(aliyunSource.enableTimestamps),
      enableDiarization: aliyunModelCapability?.supportsDiarization === false
        ? false
        : Boolean(aliyunSource.enableDiarization),
    },
  }
  const requestedDefaultProviderId = SPEECH_PROVIDER_DEFINITIONS.some(item => item.id === input.defaultProviderId)
    ? input.defaultProviderId
    : defaults.defaultProviderId
  const enabledProviderIds = SPEECH_PROVIDER_DEFINITIONS
    .map(item => item.id)
    .filter(id => normalizedProviders[id]?.enabled)
  const defaultProviderId = enabledProviderIds.length && !normalizedProviders[requestedDefaultProviderId]?.enabled
    ? enabledProviderIds[0]
    : requestedDefaultProviderId
  return {
    version: 2,
    defaultProviderId,
    providers: normalizedProviders,
  }
}

export function speechProviderReady(providerId, settings) {
  const provider = settings?.providers?.[providerId]
  if (!provider?.enabled) return false
  if (providerId === 'local_asr') return !!provider.baseUrl?.trim() && !!provider.model?.trim()
  if (providerId === 'openai_whisper_compatible') return !!provider.baseUrl?.trim() && !!provider.model?.trim()
  if (providerId === 'aliyun_bailian_asr') {
    return !!provider.apiKey?.trim() && !!provider.workspaceId?.trim() && !!provider.model
  }
  return false
}

export const useMediaStore = defineStore('media', () => {
  const speechSettings = ref(createDefaultSpeechSettings())
  const speechSettingsLoaded = ref(false)
  const speechSettingsSaving = ref(false)

  const configuredSpeechProviders = computed(() => SPEECH_PROVIDER_DEFINITIONS
    .filter(provider => speechProviderReady(provider.id, speechSettings.value))
    .map(provider => {
      const providerSettings = speechSettings.value.providers[provider.id] || {}
      const model = providerSettings.model || ''
      const modelCapability = provider.id === 'aliyun_bailian_asr'
        ? getAliyunAsrModelCapability(model)
        : null
      return {
        ...provider,
        model,
        modelName: modelCapability?.name || model,
        modelCapability,
        modelLimitText: provider.id === 'aliyun_bailian_asr' ? formatAliyunAsrLimit(modelCapability) : '',
        enableDiarization: providerSettings.enableDiarization === true,
        active: speechSettings.value.defaultProviderId === provider.id,
      }
    }))

  const defaultSpeechProvider = computed(() => configuredSpeechProviders.value.find(item => item.active)
    || configuredSpeechProviders.value[0]
    || null)

  async function loadSpeechSettings({ force = false } = {}) {
    if (speechSettingsLoaded.value && !force) return speechSettings.value
    try {
      const stored = await window.electronAPI?.db?.settings?.get('mediaSpeechSettings')
      const normalized = normalizeSpeechSettings(stored || {})
      speechSettings.value = normalized
      if (stored && JSON.stringify(stored) !== JSON.stringify(normalized)) {
        await window.electronAPI?.db?.settings?.set('mediaSpeechSettings', normalized)
      }
    } catch (error) {
      console.warn('[Media] load speech settings failed:', error)
      speechSettings.value = createDefaultSpeechSettings()
    } finally {
      speechSettingsLoaded.value = true
    }
    return speechSettings.value
  }

  async function saveSpeechSettings(nextSettings = speechSettings.value) {
    speechSettingsSaving.value = true
    try {
      const normalized = normalizeSpeechSettings(nextSettings)
      await window.electronAPI?.db?.settings?.set('mediaSpeechSettings', normalized)
      speechSettings.value = normalized
      speechSettingsLoaded.value = true
      return { success: true, data: normalized }
    } catch (error) {
      console.error('[Media] save speech settings failed:', error)
      return { success: false, error: error?.message || '保存语音模型配置失败' }
    } finally {
      speechSettingsSaving.value = false
    }
  }

  return {
    speechSettings,
    speechSettingsLoaded,
    speechSettingsSaving,
    configuredSpeechProviders,
    defaultSpeechProvider,
    loadSpeechSettings,
    saveSpeechSettings,
  }
})
