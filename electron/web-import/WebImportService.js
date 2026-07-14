import { applyWebImportSettingsPatch, DEFAULT_WEB_IMPORT_SETTINGS, normalizeWebImportSettings, publicWebImportSettings, WEB_IMPORT_SETTINGS_KEY } from './WebImportSettings.js'
import { assertPublicWebUrl } from './WebImportSecurity.js'
import { normalizeRequestedFormats, WEB_IMPORT_PROVIDERS } from './WebImportTypes.js'
import { sanitizeWebHtml } from './WebImportContent.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError, normalizeWebImportError } from './WebImportErrors.js'
import { JinaWebProvider } from './providers/JinaWebProvider.js'
import { FirecrawlWebProvider } from './providers/FirecrawlWebProvider.js'
import { TavilyWebProvider } from './providers/TavilyWebProvider.js'

export class WebImportService {
  constructor({ dbService, providers, dnsLookup } = {}) {
    this._db = dbService
    this._dnsLookup = dnsLookup
    this._providers = new Map()
    const defaults = providers || [new JinaWebProvider(), new FirecrawlWebProvider(), new TavilyWebProvider()]
    for (const provider of defaults) this.registerProvider(provider)
  }

  registerProvider(provider) {
    if (!provider?.id || typeof provider.extract !== 'function') throw new Error('Invalid web import provider')
    this._providers.set(provider.id, provider)
  }

  getProviderInfo() {
    return Object.values(WEB_IMPORT_PROVIDERS)
  }

  getStoredSettings() {
    return normalizeWebImportSettings(this._db?.getSetting?.(WEB_IMPORT_SETTINGS_KEY) || DEFAULT_WEB_IMPORT_SETTINGS)
  }

  getSettings() {
    return { success: true, data: publicWebImportSettings(this.getStoredSettings()), providers: this.getProviderInfo() }
  }

  setSettings(patch = {}) {
    const next = applyWebImportSettingsPatch(this.getStoredSettings(), patch)
    this._db?.setSetting?.(WEB_IMPORT_SETTINGS_KEY, next)
    return { success: true, data: publicWebImportSettings(next), providers: this.getProviderInfo() }
  }

  _provider(id) {
    const provider = this._providers.get(id)
    if (!provider) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_CONFIGURED, '所选网页解析引擎不可用。', { provider: id })
    return provider
  }

  async extract(url, options = {}) {
    const settings = this.getStoredSettings()
    const providerId = options.providerId || settings.selectedProvider
    if (!providerId) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_SELECTED, '请先在文档解析设置中选择网页解析引擎。')
    const provider = this._provider(providerId)
    const formats = normalizeRequestedFormats(options.formats)
    provider.validateFormats(formats)
    const publicUrl = await assertPublicWebUrl(url, this._dnsLookup ? { lookup: this._dnsLookup } : undefined)
    const config = settings.providers[providerId]
    provider.validateConfig(config)
    const timeoutMs = Math.max(5000, Math.min(90000, settings.timeoutSeconds * 1000))
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = options.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal
    try {
      const result = await provider.extract(publicUrl.toString(), config, {
        formats,
        signal,
        maxResponseBytes: settings.maxResponseBytes,
      })
      if (formats.includes('html') && result.content?.html) {
        result.content.html = sanitizeWebHtml(result.content.html, result.finalUrl || publicUrl.toString())
      }
      return result
    } catch (error) {
      throw normalizeWebImportError(error, providerId)
    }
  }
}
