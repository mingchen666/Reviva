import { WEB_IMPORT_PROVIDERS } from './WebImportTypes.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from './WebImportErrors.js'

export const WEB_IMPORT_SETTINGS_KEY = 'webImportSettings'
export const DEFAULT_WEB_IMPORT_SETTINGS = Object.freeze({
  version: 1,
  selectedProvider: '',
  timeoutSeconds: 60,
  maxResponseBytes: 10 * 1024 * 1024,
  providers: {
    jina: { baseUrl: 'https://r.jina.ai', apiKey: '' },
    firecrawl: { baseUrl: 'https://api.firecrawl.dev/v2', apiKey: '' },
    tavily: { baseUrl: 'https://api.tavily.com', apiKey: '' },
  },
})

function cleanBaseUrl(value, fallback) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '')
  let parsed
  try { parsed = new URL(raw) } catch {
    throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'Base URL 格式不正确。')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'Base URL 仅支持 HTTP 或 HTTPS。')
  }
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function maskKey(value) {
  const key = String(value || '')
  if (!key) return ''
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`
}

export function normalizeWebImportSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const selectedProvider = Object.hasOwn(WEB_IMPORT_PROVIDERS, source.selectedProvider) ? source.selectedProvider : ''
  const timeoutSeconds = Math.min(90, Math.max(5, Number(source.timeoutSeconds) || DEFAULT_WEB_IMPORT_SETTINGS.timeoutSeconds))
  const maxResponseBytes = Math.max(1024, Number(source.maxResponseBytes) || DEFAULT_WEB_IMPORT_SETTINGS.maxResponseBytes)
  const providers = {}
  for (const id of Object.keys(WEB_IMPORT_PROVIDERS)) {
    const defaults = DEFAULT_WEB_IMPORT_SETTINGS.providers[id]
    const config = source.providers?.[id] || {}
    providers[id] = {
      baseUrl: cleanBaseUrl(config.baseUrl, defaults.baseUrl),
      apiKey: String(config.apiKey || ''),
    }
  }
  return { version: 1, selectedProvider, timeoutSeconds, maxResponseBytes, providers }
}

export function publicWebImportSettings(value = {}) {
  const settings = normalizeWebImportSettings(value)
  return {
    ...settings,
    providers: Object.fromEntries(Object.entries(settings.providers).map(([id, config]) => [id, {
      baseUrl: config.baseUrl,
      apiKeyConfigured: !!config.apiKey,
      apiKeyMasked: maskKey(config.apiKey),
      capabilities: WEB_IMPORT_PROVIDERS[id],
    }])),
  }
}

export function applyWebImportSettingsPatch(currentValue, patch = {}) {
  const current = normalizeWebImportSettings(currentValue)
  const next = {
    ...current,
    selectedProvider: patch.selectedProvider ?? current.selectedProvider,
    timeoutSeconds: patch.timeoutSeconds ?? current.timeoutSeconds,
    providers: { ...current.providers },
  }
  for (const id of Object.keys(WEB_IMPORT_PROVIDERS)) {
    const incoming = patch.providers?.[id]
    if (!incoming) continue
    const existing = current.providers[id]
    let apiKey = existing.apiKey
    const action = incoming.apiKeyAction || 'keep'
    if (action === 'replace') apiKey = String(incoming.apiKey || '').trim()
    else if (action === 'clear') apiKey = ''
    else if (action !== 'keep') throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'API Key 操作无效。')
    next.providers[id] = { baseUrl: incoming.baseUrl ?? existing.baseUrl, apiKey }
  }
  return normalizeWebImportSettings(next)
}
