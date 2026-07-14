export function normalizeWikiAssetPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/')
  const marker = normalized.toLowerCase().indexOf('/assets/images/')
  if (marker >= 0) return normalized.slice(marker + 1)
  return normalized.replace(/^\/+/, '')
}
