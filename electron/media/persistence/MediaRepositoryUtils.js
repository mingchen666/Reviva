import path from 'node:path'
import { parseJSON, stringifyJSON } from '../../db/helpers.js'

const FILE_LOCATION_TYPES = new Set(['workspace_file', 'attachment_cache', 'download_cache'])

export { parseJSON, stringifyJSON }

export function nowIso(value) {
  return value || new Date().toISOString()
}

export function parseJsonOr(value, fallback) {
  const parsed = parseJSON(value)
  if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback
  if (fallback && typeof fallback === 'object') {
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  }
  return typeof parsed === typeof fallback ? parsed : fallback
}

export function asBoolean(value) {
  return value === true || value === 1
}

export function assertEnum(value, enumObject, field, { allowEmpty = false } = {}) {
  const normalized = String(value ?? '')
  if (allowEmpty && !normalized) return normalized
  if (!Object.values(enumObject).includes(normalized)) throw new Error(`Invalid ${field}: ${normalized}`)
  return normalized
}

export function normalizeMediaLocator(locationType, locator, { platform = process.platform } = {}) {
  const value = String(locator || '').trim()
  if (!value) return ''
  if (FILE_LOCATION_TYPES.has(locationType)) {
    const pathApi = platform === 'win32' ? path.win32 : path.posix
    let normalized = pathApi.normalize(value).replace(/\\/g, '/')
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.replace(/\/+$/, '')
    return platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  if (locationType === 'public_media_url' || locationType === 'platform_page') {
    try {
      const url = new URL(value)
      url.hash = ''
      if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = ''
      return url.toString()
    } catch {
      return value
    }
  }
  return value.replace(/\\/g, '/')
}

export function normalizeOwnerLocator(ownerType, locator, options = {}) {
  if (ownerType === 'docs_file') return normalizeMediaLocator('workspace_file', locator, options)
  return String(locator || '').trim().replace(/\\/g, '/')
}

export function normalizeProgress(value) {
  return Math.min(100, Math.max(0, Math.trunc(Number(value) || 0)))
}
