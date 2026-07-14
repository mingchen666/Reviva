function scalarValue(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try { return JSON.parse(text) } catch { return text.slice(1, -1) }
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (text === '[]') return []
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text)
  return text
}

export function parseMarkdownFrontMatter(content = '') {
  const text = String(content || '').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { attributes: {}, body: text, hasFrontMatter: false }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { attributes: {}, body: text, hasFrontMatter: false, invalid: true }

  const attributes = {}
  let currentKey = ''
  for (const line of lines.slice(1, end)) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/)
    if (keyMatch) {
      currentKey = keyMatch[1]
      attributes[currentKey] = keyMatch[2] ? scalarValue(keyMatch[2]) : []
      continue
    }
    const listMatch = line.match(/^\s+-\s*(.*)$/)
    if (currentKey && listMatch) {
      if (!Array.isArray(attributes[currentKey])) attributes[currentKey] = []
      attributes[currentKey].push(scalarValue(listMatch[1]))
    }
  }

  return {
    attributes,
    body: lines.slice(end + 1).join('\n').replace(/^\s*\n/, ''),
    hasFrontMatter: true,
  }
}
