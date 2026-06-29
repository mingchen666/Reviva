const MODEL_REF_SEPARATOR = '::'

export function encodeModelRef(providerId, modelId) {
  if (!providerId || !modelId) return modelId || ''
  return `${providerId}${MODEL_REF_SEPARATOR}${modelId}`
}

export function parseModelRef(ref) {
  const value = String(ref || '')
  const idx = value.indexOf(MODEL_REF_SEPARATOR)
  if (idx <= 0) return { providerId: '', modelId: value, scoped: false }
  return {
    providerId: value.slice(0, idx),
    modelId: value.slice(idx + MODEL_REF_SEPARATOR.length),
    scoped: true,
  }
}

export function matchesModelRef(ref, providerId, modelId) {
  const parsed = parseModelRef(ref)
  if (!parsed.modelId) return false
  if (parsed.scoped) return parsed.providerId === providerId && parsed.modelId === modelId
  return parsed.modelId === modelId
}
