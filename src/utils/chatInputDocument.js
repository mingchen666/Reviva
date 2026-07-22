const TOKEN_TYPES = new Set(['quick-input', 'skill'])

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

export function normalizeInputDocument(document, fallbackText = '') {
  const source = Array.isArray(document) ? document : []
  const result = []
  const pushText = (text) => {
    const normalized = normalizeText(text)
    if (!normalized) return
    const previous = result[result.length - 1]
    if (previous?.type === 'text') previous.text += normalized
    else result.push({ type: 'text', text: normalized })
  }

  for (const segment of source) {
    if (!segment || typeof segment !== 'object') continue
    if (segment.type === 'text') {
      pushText(segment.text)
      continue
    }
    if (!TOKEN_TYPES.has(segment.type)) continue
    const label = normalizeText(segment.label).trim()
    if (!label) continue
    result.push({
      type: segment.type,
      id: String(segment.id || ''),
      label,
      ...(segment.type === 'quick-input' ? { shortcutType: String(segment.shortcutType || 'command') } : {}),
      contentSnapshot: normalizeText(segment.contentSnapshot || label),
    })
  }

  if (!result.length && fallbackText) pushText(fallbackText)
  return result
}

export function inputDocumentFromText(text = '') {
  const value = normalizeText(text)
  return value ? [{ type: 'text', text: value }] : []
}

export function displayTextFromDocument(document, fallbackText = '') {
  const normalized = normalizeInputDocument(document, fallbackText)
  return normalized.map(segment => segment.type === 'text' ? segment.text : segment.label).join('')
}

export function resolvedTextFromDocument(document, fallbackText = '') {
  const normalized = normalizeInputDocument(document, fallbackText)
  return normalized.map(segment => segment.type === 'text' ? segment.text : segment.contentSnapshot).join('')
}

export function createQuickInputToken(item) {
  return {
    type: 'quick-input',
    id: String(item?.id || ''),
    label: `@${String(item?.title || '').trim()}`,
    shortcutType: String(item?.type || 'command'),
    contentSnapshot: normalizeText(item?.content || ''),
  }
}

export function createSkillToken(item) {
  const id = String(item?.id || '').trim()
  const label = String(item?.label || item?.insertText || `/${id}`).trim()
  return {
    type: 'skill',
    id,
    label,
    contentSnapshot: String(item?.insertText || label),
  }
}

export function isStructuredInputDocument(value) {
  return Array.isArray(value) && value.some(segment => TOKEN_TYPES.has(segment?.type))
}
