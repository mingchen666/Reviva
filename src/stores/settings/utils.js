// Pure helper functions for the settings store.
// No Vue/Pinia runtime dependencies.

import { encodeModelRef, parseModelRef } from '@/utils/modelRef'
import { DEFAULT_PROVIDERS, DEFAULT_DEFAULT_MODELS, DEFAULT_WIKI_WEB_RESEARCH_SETTINGS, normalizeProviderApiFormat } from './constants'
export function providerConfigured(provider) {
  if (!provider) return false
  return !!provider.baseUrl && !!provider.apiKey
}

const ANSWER_STYLE_KEYS = new Set([
  'default',
  'study_partner',
  'best_friend',
  'humorous',
  'gentle_tutor',
  'strict_mentor',
  'big_sister',
  'tsundere',
  'exam_trainer',
])

const CHAT_NAVIGATION_STYLE_KEYS = new Set(['directory', 'minimap'])

export function _sanitizeAnswerStyle(style) {
  return ANSWER_STYLE_KEYS.has(style) ? style : 'default'
}

export function _sanitizeChatNavigationStyle(style) {
  return CHAT_NAVIGATION_STYLE_KEYS.has(style) ? style : 'directory'
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export function darkenHex(hex, factor = 0.85) {
  const { r, g, b } = hexToRgb(hex)
  return '#' + [r, g, b].map(c => Math.round(c * factor).toString(16).padStart(2, '0')).join('')
}

export function mixHex(hex, target = '#ffffff', ratio = 0.5) {
  const sourceRgb = hexToRgb(hex)
  const targetRgb = hexToRgb(target)
  const channel = key => Math.round(sourceRgb[key] * (1 - ratio) + targetRgb[key] * ratio)
  return '#' + ['r', 'g', 'b'].map(key => channel(key).toString(16).padStart(2, '0')).join('')
}

export function buildAccentScale(hex) {
  if (hex.toUpperCase() === '#4A6CFF') {
    return {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
      400: '#6c8aff', 500: '#4a6cff', 600: '#3a5ced',
    }
  }
  return {
    50: mixHex(hex, '#ffffff', 0.93),
    100: mixHex(hex, '#ffffff', 0.85),
    200: mixHex(hex, '#ffffff', 0.7),
    300: mixHex(hex, '#ffffff', 0.45),
    400: mixHex(hex, '#ffffff', 0.18),
    500: hex,
    600: darkenHex(hex, 0.85),
  }
}

export function rgbStr(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `${r},${g},${b}`
}


export function _mergeBuiltinProviders(current) {
  if (!Array.isArray(current)) {
    return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)).map(p => ({
      ...p,
      apiFormat: normalizeProviderApiFormat(p.apiFormat, p.id),
    }))
  }
  const LEGACY_MIGRATION = { qwen: 'bailian' }
  const result = []
  for (const def of DEFAULT_PROVIDERS) {
    let existing = current.find(p => p.id === def.id)
    if (!existing) {
      const legacyId = Object.keys(LEGACY_MIGRATION).find(k => LEGACY_MIGRATION[k] === def.id)
      if (legacyId) existing = current.find(p => p.id === legacyId)
    }
    const merged = JSON.parse(JSON.stringify(def))
    if (existing) {
      merged.apiKey = existing.apiKey || def.apiKey || ''
      merged.apiKeyId = existing.apiKeyId || ''
      merged.baseUrl = def.official ? def.baseUrl : (existing.baseUrl || def.baseUrl)
      merged.enabled = existing.enabled ?? def.enabled
      merged.apiFormat = normalizeProviderApiFormat(existing.apiFormat || def.apiFormat || merged.apiFormat, merged.id)
      merged.apiKeyOptional = def.apiKeyOptional ?? existing.apiKeyOptional ?? merged.apiKeyOptional
      merged.local = def.local ?? existing.local ?? merged.local
      merged.configured = providerConfigured(merged)
      // Supplement models by id: keep user's existing models, add new defaults
      if (Array.isArray(existing.models) && existing.models.length > 0) {
        const existingIds = new Set(existing.models.map(m => m.id))
        merged.models = JSON.parse(JSON.stringify(existing.models))
        for (const dm of def.models) {
          if (!existingIds.has(dm.id)) merged.models.push(JSON.parse(JSON.stringify(dm)))
        }
      }
    }
    merged.apiFormat = normalizeProviderApiFormat(merged.apiFormat, merged.id)
    result.push(merged)
  }
  return result
}

export function _findModelRef(providers, ref, predicate = null) {
  const { providerId, modelId, scoped } = parseModelRef(ref)
  if (!modelId) return null

  if (scoped) {
    const provider = providers.find(p => p.id === providerId)
    const model = provider?.models?.find(m => m.id === modelId)
    return provider && model && (!predicate || predicate(model, provider)) ? { provider, model, ref: encodeModelRef(provider.id, model.id) } : null
  }

  for (const provider of providers) {
    const model = provider.models?.find(m => m.id === modelId)
    if (model && (!predicate || predicate(model, provider))) return { provider, model, ref: encodeModelRef(provider.id, model.id) }
  }
  return null
}

// Reset defaultModels entries that point to models no longer present.

export function _sanitizeDefaultModels(dm, providers) {
  const out = { ...dm }
  for (const key of Object.keys(DEFAULT_DEFAULT_MODELS)) {
    const predicate = key === 'vision' ? (model) => !!model.capabilities?.vision : null
    const match = _findModelRef(providers, out[key], predicate)
    const fallback = _findModelRef(providers, DEFAULT_DEFAULT_MODELS[key], predicate)
    out[key] = match?.ref || fallback?.ref || DEFAULT_DEFAULT_MODELS[key]
  }
  return out
}

let _systemThemeListener = null

export function normalizeWikiWebResearchSettings(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaultOrder = [...DEFAULT_WIKI_WEB_RESEARCH_SETTINGS.providerOrder]
  const order = Array.isArray(raw.providerOrder)
    ? [...new Set(raw.providerOrder.map(String).filter(Boolean))]
    : defaultOrder
  for (const provider of defaultOrder) if (!order.includes(provider)) order.push(provider)
  return {
    ...DEFAULT_WIKI_WEB_RESEARCH_SETTINGS,
    ...raw,
    enabled: !!raw.enabled,
    providerOrder: order,
    adaptiveBudget: raw.adaptiveBudget !== false,
    simpleLimit: Math.min(Math.max(Number(raw.simpleLimit || 3), 1), 10),
    normalLimit: Math.min(Math.max(Number(raw.normalLimit || 5), 1), 10),
    complexLimit: Math.min(Math.max(Number(raw.complexLimit || 8), 1), 10),
    hardLimit: Math.min(Math.max(Number(raw.hardLimit || 10), 1), 10),
    pageReadLimit: Math.min(Math.max(Number(raw.pageReadLimit || 12), 1), 12),
    sourceRegisterLimit: Math.min(Math.max(Number(raw.sourceRegisterLimit || 5), 1), 5),
    autoRegisterSources: raw.autoRegisterSources !== false,
    directWriteFromSearch: false,
    privacyFilter: true,
  }
}
