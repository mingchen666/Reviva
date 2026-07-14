import crypto from 'node:crypto'
import path from 'node:path'

export const WIKI_PAGE_TYPES = new Set([
  'summary',
  'concept',
  'entity',
  'question',
  'comparison',
  'overview',
  'index',
])

export const WIKI_PAGE_STATUSES = new Set([
  'active',
  'stale',
  'unsupported',
  'review_required',
])

const RESERVED_KEYS = new Set([
  'id',
  'type',
  'title',
  'status',
  'source_ids',
  'schema_version',
  'created_at',
  'updated_at',
  'verified_at',
])

function quoteYaml(value) {
  return JSON.stringify(String(value ?? ''))
}

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

export function splitFrontmatter(content = '') {
  const text = String(content || '').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { raw: '', body: text, hasFrontmatter: false }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end < 0) return { raw: '', body: text, hasFrontmatter: false, invalid: true }
  return {
    raw: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n').replace(/^\s*\n/, ''),
    hasFrontmatter: true,
  }
}

export function parseFrontmatter(content = '') {
  const split = splitFrontmatter(content)
  const attributes = {}
  const lines = split.raw ? split.raw.split(/\r?\n/) : []
  let currentKey = ''
  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/)
    if (keyMatch) {
      currentKey = keyMatch[1]
      const rest = keyMatch[2] || ''
      attributes[currentKey] = rest ? scalarValue(rest) : []
      continue
    }
    const listMatch = line.match(/^\s+-\s*(.*)$/)
    if (currentKey && listMatch) {
      if (!Array.isArray(attributes[currentKey])) attributes[currentKey] = []
      attributes[currentKey].push(scalarValue(listMatch[1]))
    }
  }
  return { ...split, attributes }
}

function frontmatterBlocks(raw = '') {
  const lines = String(raw || '').split(/\r?\n/)
  const blocks = []
  let current = null
  const preamble = []
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s|$)/)
    if (match) {
      if (current) blocks.push(current)
      current = { key: match[1], lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else if (line.trim()) {
      preamble.push(line)
    }
  }
  if (current) blocks.push(current)
  return { preamble, blocks }
}

export function inferPageType(relPath = '') {
  const normalized = String(relPath || '').replace(/\\/g, '/').toLowerCase()
  if (normalized === 'index.md') return 'index'
  if (normalized === 'overview.md') return 'overview'
  if (normalized.startsWith('pages/summaries/')) return 'summary'
  if (normalized.startsWith('pages/concepts/')) return 'concept'
  if (normalized.startsWith('pages/entities/')) return 'entity'
  if (normalized.startsWith('pages/questions/')) return 'question'
  if (normalized.startsWith('pages/comparisons/')) return 'comparison'
  return 'concept'
}

export function normalizeSourceIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean))]
}

function stablePageId(relPath = '') {
  const hash = crypto.createHash('sha256').update(String(relPath || '')).digest('hex').slice(0, 16)
  return `page_${hash}`
}

function headingTitle(body = '', fallback = '') {
  const match = String(body || '').match(/^#\s+(.+)$/m)
  return String(match?.[1] || fallback || '').trim().slice(0, 160)
}

function reservedLines(meta) {
  const lines = [
    `id: ${meta.id}`,
    `type: ${meta.type}`,
    `title: ${quoteYaml(meta.title)}`,
    `status: ${meta.status}`,
    ...(meta.source_ids.length ? ['source_ids:', ...meta.source_ids.map(id => `  - ${id}`)] : ['source_ids: []']),
    `schema_version: ${meta.schema_version}`,
    `created_at: ${meta.created_at}`,
    `updated_at: ${meta.updated_at}`,
    `verified_at: ${meta.verified_at || '""'}`,
  ]
  return lines
}

export function normalizeWikiPageContent({
  relPath,
  title = '',
  content = '',
  sourceIds = null,
  status = '',
  requireSourceEvidence = false,
  existingContent = '',
  now = new Date().toISOString(),
} = {}) {
  const incoming = parseFrontmatter(content)
  const existing = parseFrontmatter(existingContent)
  const incomingAttrs = incoming.attributes || {}
  const existingAttrs = existing.attributes || {}
  const bodyFallback = String(content || '').trim()
  let body = incoming.hasFrontmatter ? incoming.body.trim() : bodyFallback
  const fallbackTitle = path.posix.basename(String(relPath || 'wiki-page.md').replace(/\\/g, '/'), '.md')
  const resolvedTitle = String(title || incomingAttrs.title || existingAttrs.title || headingTitle(body, fallbackTitle)).trim().slice(0, 160)
  if (!body) body = `# ${resolvedTitle || fallbackTitle}\n\nNo content yet.`
  if (!/^#\s+/m.test(body)) body = `# ${resolvedTitle || fallbackTitle}\n\n${body}`

  const typeCandidate = String(incomingAttrs.type || existingAttrs.type || inferPageType(relPath))
  const type = WIKI_PAGE_TYPES.has(typeCandidate) ? typeCandidate : inferPageType(relPath)
  const normalizedSources = normalizeSourceIds(
    Array.isArray(sourceIds)
      ? sourceIds
      : (Array.isArray(incomingAttrs.source_ids) ? incomingAttrs.source_ids : existingAttrs.source_ids),
  )
  const lacksRequiredEvidence = requireSourceEvidence && !['index', 'overview'].includes(type) && normalizedSources.length === 0
  const statusCandidate = String(lacksRequiredEvidence ? 'review_required' : (status || incomingAttrs.status || existingAttrs.status || 'active'))
  const normalizedStatus = WIKI_PAGE_STATUSES.has(statusCandidate) ? statusCandidate : 'review_required'
  const isNavigationPage = ['index', 'overview'].includes(type)
  const canVerify = normalizedStatus === 'active' && (isNavigationPage || normalizedSources.length > 0)
  const previousVerifiedAt = String(existingAttrs.verified_at || incomingAttrs.verified_at || '')
  const metadata = {
    id: String(existingAttrs.id || incomingAttrs.id || stablePageId(relPath)),
    type,
    title: resolvedTitle || fallbackTitle,
    status: normalizedStatus,
    source_ids: normalizedSources,
    schema_version: 1,
    created_at: String(existingAttrs.created_at || incomingAttrs.created_at || now),
    updated_at: now,
    verified_at: canVerify ? now : (normalizedStatus === 'active' ? '' : previousVerifiedAt),
  }

  const sourceRaw = incoming.hasFrontmatter ? incoming.raw : existing.raw
  const { preamble, blocks } = frontmatterBlocks(sourceRaw)
  const customLines = [
    ...preamble,
    ...blocks.filter(block => !RESERVED_KEYS.has(block.key)).flatMap(block => block.lines),
  ]
  const frontmatter = [...reservedLines(metadata), ...(customLines.length ? ['', ...customLines] : [])].join('\n')
  return {
    content: `---\n${frontmatter}\n---\n\n${body.trim()}\n`,
    metadata,
  }
}

export function pageContentHash(content = '') {
  return `sha256:${crypto.createHash('sha256').update(String(content || '')).digest('hex')}`
}
