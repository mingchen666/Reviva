export function normalizeAssetVision(asset = {}) {
  const nested = asset.vision && typeof asset.vision === 'object' ? asset.vision : {}
  return {
    status: String(nested.status || asset.vision_status || 'none'),
    summary: String(nested.summary || asset.vision_summary || ''),
    model: String(nested.model || asset.vision_model || ''),
    updated_at: String(nested.updated_at || asset.vision_updated_at || ''),
    error: String(nested.error || asset.vision_error || ''),
  }
}

export function mergeAssetRecord(existing = {}, next = {}) {
  const existingVision = normalizeAssetVision(existing)
  const nextHasVision = !!next.vision || next.vision_status !== undefined || next.vision_summary !== undefined
  const nextVision = nextHasVision ? normalizeAssetVision(next) : {}
  return {
    ...existing,
    ...next,
    vision: {
      status: nextVision.status || existingVision.status || 'none',
      summary: nextVision.summary || existingVision.summary || '',
      model: nextVision.model || existingVision.model || '',
      updated_at: nextVision.updated_at || existingVision.updated_at || '',
      error: nextVision.error || existingVision.error || '',
    },
  }
}

export function normalizeAssetRecord(asset = {}) {
  return mergeAssetRecord({}, asset)
}
