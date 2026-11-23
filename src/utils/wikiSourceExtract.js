// Registry and passage paths are literal Wiki-relative paths, not URLs.
// Do not decode '%' or strip '#' / '?' from stored filenames.
export function normalizeSourceExtractPath(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f:]/.test(value)) return ''
  const normalized = value.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length < 3 || parts[0] !== 'sources' || parts[1] !== 'extracts' || !/\.md$/i.test(normalized)) return ''
  if (parts.some(part => !part || part === '.' || part === '..')) return ''
  return normalized
}

export function sourceExtractLocation(passage) {
  const extractPath = normalizeSourceExtractPath(passage?.page_path)
  const startLine = passage?.start_line
  const endLine = passage?.end_line
  if (!extractPath || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) return null
  return { extractPath, startLine, endLine }
}

export function matchSourceExtractLocation(location, source, lineCount) {
  const valid = sourceExtractLocation({ page_path: location?.extractPath, start_line: location?.startLine, end_line: location?.endLine })
  if (!valid || valid.extractPath !== normalizeSourceExtractPath(source?.extract_path) || valid.endLine > lineCount) return null
  return valid
}

export const SOURCE_EXTRACT_PAGE_SIZE = 200

export function sourceExtractFrontmatterRange(lines) {
  if (!Array.isArray(lines) || lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  return end > 0 ? { startLine: 1, endLine: end + 1 } : null
}

export function sourceExtractHeadings(lines, limit = 80) {
  if (!Array.isArray(lines)) return []
  const items = []
  const metadataEnd = sourceExtractFrontmatterRange(lines)?.endLine || 0
  let fence = null
  for (let index = metadataEnd; index < lines.length && items.length < limit; index++) {
    const line = String(lines[index] || '')
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      continue
    }
    if (fence) continue
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (match) items.push({ line: index + 1, level: match[1].length, title: match[2] })
  }
  return items
}

export function sourceExtractPageForLine(line) {
  return Math.floor((line - 1) / SOURCE_EXTRACT_PAGE_SIZE)
}

export function findSourceExtractLines(lines, query) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return []
  const matches = []
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].toLowerCase().includes(needle)) matches.push(index + 1)
  }
  return matches
}

// Text segments are rendered through Vue interpolation, never as HTML.
export function sourceExtractSearchSegments(line, query) {
  const text = String(line || '')
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return [{ text: text || ' ', match: false }]
  const lower = text.toLowerCase()
  const parts = []
  let offset = 0
  let at
  while ((at = lower.indexOf(needle, offset)) !== -1) {
    if (at > offset) parts.push({ text: text.slice(offset, at), match: false })
    parts.push({ text: text.slice(at, at + needle.length), match: true })
    offset = at + needle.length
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false })
  return parts.length ? parts : [{ text: text || ' ', match: false }]
}
