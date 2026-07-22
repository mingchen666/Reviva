import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { SPEECH_TO_TEXT_PROVIDER_IDS, assertSpeechToTextProvider } from './SpeechToTextTypes.js'

export class SpeechToTextRegistry {
  constructor(providers = []) {
    this._providers = new Map()
    for (const provider of providers) this.register(provider)
  }

  register(provider) {
    const normalized = assertSpeechToTextProvider(provider)
    this._providers.set(normalized.id, normalized)
    return normalized
  }

  get(providerId) {
    return this._providers.get(providerId) || null
  }

  resolve(providerId, { mode = 'local_file', config = {} } = {}) {
    const id = providerId && providerId !== 'auto'
      ? providerId
      : SPEECH_TO_TEXT_PROVIDER_IDS.LOCAL_ASR
    const provider = this.get(id)
    if (!provider) throw new MediaError(MEDIA_ERROR_CODES.STT_PROVIDER_UNAVAILABLE, `未找到语音转文字服务商：${id}`)
    const capabilities = provider.getCapabilities?.(config) || {}
    if (Array.isArray(capabilities.inputModes) && !capabilities.inputModes.includes(mode)) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, `当前服务商不支持 ${mode} 输入。`, { provider: id })
    }
    return provider
  }

  async check(providerId, config = {}, context = {}) {
    const provider = this.get(providerId)
    if (!provider) throw new MediaError(MEDIA_ERROR_CODES.STT_PROVIDER_UNAVAILABLE, `未找到语音转文字服务商：${providerId}`)
    const result = typeof provider.checkConfiguration === 'function'
      ? await provider.checkConfiguration(config, context)
      : { ready: true, message: '服务商配置已识别。' }
    return {
      success: true,
      providerId: provider.id,
      capabilities: provider.getCapabilities?.(config) || {},
      ...result,
    }
  }

  list() {
    return [...this._providers.values()].map(provider => ({
      id: provider.id,
      capabilities: provider.getCapabilities?.() || {},
    }))
  }
}
