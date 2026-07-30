import { RELEASE_CONFIG } from '@/config/release'
import { getAppVersion } from '@/utils/tools'

const DEFAULT_TIMEOUT_MS = 6500

function parseVersion(value) {
  return String(value || '')
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(num => (Number.isFinite(num) ? num : 0))
}

export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  const length = Math.max(left.length, right.length, 3)
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function normalizeUpdateInfo(raw, source = {}) {
  if (!raw) return null
  const version = raw.version || raw.latestVersion || raw.tag_name || source.version || source.latestVersion
  if (!version) return null
  const downloadUrl = raw.downloadUrl || raw.fallbackUrl || raw.html_url || raw.url || source.downloadUrl
  return {
    version: String(version).replace(/^v/i, ''),
    releaseDate: raw.releaseDate || raw.published_at || raw.date || source.releaseDate || '',
    releaseName: raw.releaseName || raw.name || source.name || source.label || '',
    releaseNotes: raw.releaseNotes || raw.body || raw.notes || source.releaseNotes || '',
    fallbackUrl: downloadUrl || RELEASE_CONFIG.downloadUrl || '',
    sourceId: source.id || raw.sourceId || 'manual',
    sourceName: source.name || source.label || raw.sourceName || '备用发布通道',
    canAutoDownload: raw.canAutoDownload ?? source.canAutoDownload ?? false,
  }
}

function configuredSources() {
  const configured = Array.isArray(RELEASE_CONFIG.updateSources) ? RELEASE_CONFIG.updateSources : []
  const hasDownloadFallback = configured.some(source => source?.downloadUrl === RELEASE_CONFIG.downloadUrl)
  const fallbackSource = RELEASE_CONFIG.downloadUrl && !hasDownloadFallback
    ? [{
        id: 'release-fallback',
        type: 'manual',
        name: '备用发布通道',
        version: RELEASE_CONFIG.latestVersion || RELEASE_CONFIG.version,
        downloadUrl: RELEASE_CONFIG.downloadUrl,
        releaseNotes: RELEASE_CONFIG.releaseNotes || '',
        canAutoDownload: false,
      }]
    : []
  return [...configured, ...fallbackSource].filter(source => source && source.enabled !== false)
}

async function fetchJsonWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

async function readSource(source) {
  if (source.type === 'github' && source.url) {
    const payload = await fetchJsonWithTimeout(source.url, source.timeoutMs)
    const releases = Array.isArray(payload) ? payload : [payload]
    const release = releases.find(item => item && !item.draft && item.tag_name)
    return normalizeUpdateInfo(release, source)
  }
  if (source.type === 'manifest' && source.url) {
    const payload = await fetchJsonWithTimeout(source.url, source.timeoutMs)
    return normalizeUpdateInfo(payload, source)
  }
  if (source.type === 'manual') {
    return normalizeUpdateInfo(source, source)
  }
  return null
}

export async function checkUpdateSources(options = {}) {
  const currentVersion = options.currentVersion || getAppVersion()
  const sources = configuredSources()
  const errors = []
  let latestInfo = null

  for (const source of sources) {
    try {
      const info = await readSource(source)
      if (!info) continue
      if (!latestInfo || compareVersions(info.version, latestInfo.version) > 0) {
        latestInfo = info
      }
      if (compareVersions(info.version, currentVersion) > 0) {
        return { updateInfo: info, latestInfo: info, errors }
      }
    } catch (error) {
      errors.push({
        sourceId: source.id || source.url || source.type || 'unknown',
        message: error?.message || '更新源检查失败',
      })
    }
  }

  return { updateInfo: null, latestInfo, errors }
}
