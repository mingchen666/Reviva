// wiki/wikiQueryUtils.js — extracted from WikiService.js
// Pure utility functions for wiki query, search, and source management.
// No instance-state dependency; safe to call from any module.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { mediaTimestamp, safeTitle, safeSegment, nowIso } from './wikiUtils.js'
import { snippet } from './WikiContentNormalizer.js'

export function mediaExtractMarkdown(source, payload) {
  const media = payload.metadata.media || {}
  const run = payload.metadata.run || {}
  const lines = [
    '---',
    `source_id: ${source.id}`,
    'source_type: media',
    `media_id: ${JSON.stringify(media.id || '')}`,
    `media_type: ${JSON.stringify(media.mediaType || '')}`,
    `title: ${JSON.stringify(source.title || '')}`,
    `duration_ms: ${Number(media.durationMs) || 0}`,
    `run_id: ${JSON.stringify(run.id || '')}`,
    `timeline_available: ${payload.timelineAvailable ? 'true' : 'false'}`,
    `content_hash: ${JSON.stringify(source.content_hash || '')}`,
    '---',
    '',
    `# ${source.title || '媒体转录'}`,
    '',
    `- Media ID: \`${media.id || ''}\``,
    `- Type: ${media.mediaType || 'media'}`,
    `- Duration: ${mediaTimestamp(media.durationMs) || '未知'}`,
    `- Timeline: ${payload.timelineAvailable ? 'available' : 'unavailable'}`,
    '',
  ]
  if (payload.chapters.length) {
    lines.push('## Source Chapters', '')
    for (const chapter of payload.chapters) {
      const range = [mediaTimestamp(chapter.startMs), mediaTimestamp(chapter.endMs)].filter(Boolean).join('–')
      lines.push(`### ${range ? `[${range}] ` : ''}${chapter.title || '未命名章节'}`, '')
      if (chapter.summary) lines.push(chapter.summary, '')
    }
  }
  lines.push('## Transcript', '')
  for (const segment of payload.segments) {
    const text = String(segment.text || '').trim()
    if (!text) continue
    if (payload.timelineAvailable && segment.startMs !== null && segment.endMs !== null) {
      lines.push(`- [${mediaTimestamp(segment.startMs)}–${mediaTimestamp(segment.endMs)}] ${text}`)
    } else {
      lines.push(text, '')
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function extractMarkdownLinks(content = '', basePath = 'index.md') {
  const text = String(content || '')
  const links = []
  const re = /(?<!!)\[([^\]]{1,160})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match
  while ((match = re.exec(text))) {
    const title = safeTitle(match[1] || '')
    const rawHref = String(match[2] || '').trim()
    const normalized = normalizeWikiPageLink(rawHref, basePath)
    if (!normalized) continue
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const lineEnd = text.indexOf('\n', match.index)
    const context = safeTitle(text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).replace(/\s+/g, ' '))
    links.push({
      title,
      path: normalized,
      href: rawHref,
      source_page: basePath,
      context,
    })
  }
  const wikiLinkRe = /\[\[([^\]]{1,240})\]\]/g
  while ((match = wikiLinkRe.exec(text))) {
    const inner = String(match[1] || '').trim()
    const [targetPart, titlePart] = inner.split('|')
    const rawHref = String(targetPart || '').split('#')[0].trim()
    const normalized = normalizeWikiPageLink(rawHref, basePath)
    if (!normalized) continue
    const title = safeTitle(titlePart || path.posix.basename(normalized, '.md') || rawHref)
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const lineEnd = text.indexOf('\n', match.index)
    const context = safeTitle(text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).replace(/\s+/g, ' '))
    links.push({
      title,
      path: normalized,
      href: rawHref,
      source_page: basePath,
      context,
    })
  }
  return links
}

export function normalizeWikiPageLink(href = '', basePath = 'index.md') {
  const raw = String(href || '').trim().replace(/\\/g, '/')
  if (!raw || raw.startsWith('#')) return ''
  if (/^(https?:|mailto:|data:|file:)/i.test(raw)) return ''
  const withoutHash = raw.split('#')[0].split('?')[0].trim()
  if (!withoutHash) return ''
  const hrefPath = withoutHash.startsWith('/') ? withoutHash.replace(/^\/+/, '') : withoutHash
  const baseDir = path.posix.dirname(String(basePath || 'index.md').replace(/\\/g, '/'))
  let resolved = path.posix.normalize(path.posix.join(withoutHash.startsWith('/') || baseDir === '.' ? '' : baseDir, hrefPath))
  if (!resolved || resolved === '.' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) return ''
  const ext = path.posix.extname(resolved).toLowerCase()
  if (ext && ext !== '.md') return ''
  if (!ext && !resolved.endsWith('/')) resolved = `${resolved}.md`
  if (resolved === 'pages/index.md') return 'index.md'
  if (resolved === 'pages/overview.md') return 'overview.md'
  return resolved
}

export function uniqueNavigationLinks(links = []) {
  const byPath = new Map()
  for (const link of links || []) {
    if (!link?.path) continue
    const key = `${link.wiki_id || ''}:${link.path}`
    if (!byPath.has(key)) byPath.set(key, link)
  }
  return Array.from(byPath.values())
}

export function rankNavigationLinks(links = [], query = '') {
  const terms = queryTerms(query)
  return [...(links || [])]
    .map(link => {
      const title = String(link.title || '').toLowerCase()
      const pathText = String(link.path || '').toLowerCase()
      const context = String(link.context || '').toLowerCase()
      const score = terms.length
        ? terms.reduce((sum, term) => {
            if (!term) return sum
            return sum +
              (title.includes(term) ? 4 : 0) +
              (pathText.includes(term) ? 3 : 0) +
              (context.includes(term) ? 2 : 0)
          }, 0)
        : 1
      return { ...link, score }
    })
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.path || '').localeCompare(String(b.path || '')))
}

export function queryTerms(query = '') {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return []
  const terms = new Set(normalized.split(/[\s,，。；;:：!?！？、/\\|()[\]{}"'`]+/).filter(Boolean))
  if (normalized.length <= 32) terms.add(normalized)
  const cjk = normalized.replace(/[^\p{Script=Han}]/gu, '')
  if (cjk.length >= 2 && cjk.length <= 24) {
    for (let i = 0; i < cjk.length - 1; i++) terms.add(cjk.slice(i, i + 2))
  }
  return Array.from(terms)
}

export function clipQueryText(text, maxChars = 2000) {
  const content = String(text || '').trim()
  const limit = Math.max(Number(maxChars || 0), 0)
  if (!limit) return ''
  if (content.length <= limit) return content
  const suffix = '\n...[truncated]'
  if (limit <= suffix.length) return content.slice(0, limit)
  return `${content.slice(0, limit - suffix.length)}${suffix}`
}

export function citationRecord(result) {
  return {
    wiki_id: result.wiki_id,
    wiki_name: result.wiki_name,
    kind: result.kind,
    title: result.title || '',
    path: result.path || '',
    source_id: result.source_id || '',
    asset_id: result.id && result.kind === 'asset' ? result.id : '',
    citation: result.citation || '',
  }
}

export function resultCitation(wiki, result) {
  const wikiName = wiki?.name || wiki?.id || result.wiki_id || ''
  if (result.kind === 'page') return `${wikiName}:${result.path || result.title || ''}`
  if (result.kind === 'source') return `${wikiName}:source:${result.source_id || result.title || ''}`
  if (result.kind === 'asset') return `${wikiName}:asset:${result.path || result.id || ''}`
  return wikiName
}

export function snippetWrapper(content, terms) {
  return snippet(content, terms)
}

export function sourceRemovalMarkers(source) {
  const sourceId = source?.id || ''
  if (!sourceId) return []
  const normalizedOriginalPath = String(source?.original_path || '').replace(/\\/g, '/')
  const markers = [
    sourceId,
    `source_id: ${sourceId}`,
    `source_id: "${sourceId}"`,
    `source_id: '${sourceId}'`,
    `source_id: \`${sourceId}\``,
    `Source ID: \`${sourceId}\``,
    source?.original_uri,
    normalizedOriginalPath,
    normalizedOriginalPath ? path.posix.basename(normalizedOriginalPath) : '',
    source?.content_hash,
    source?.extract_path,
  ]
  return [...new Set(markers
    .filter(Boolean)
    .map(item => String(item).trim().toLowerCase())
    .filter(item => item.length >= 6))]
}

export function pageReferencesRemainingSource(content, remainingSources = [], removedSourceId = '') {
  const haystack = String(content || '').toLowerCase()
  return remainingSources.some(source => {
    const sourceId = String(source?.id || '').trim().toLowerCase()
    return sourceId && sourceId !== String(removedSourceId || '').toLowerCase() && haystack.includes(sourceId)
  })
}

export function buildAgentMaintenanceInstruction(reason = 'source_changed') {
  const text = String(reason || 'source_changed')
  const parts = [
    `Maintain this Wiki after ${text}.`,
    'Read recent_changes, list_sources, and existing pages before writing.',
    'For each parser_status=complete source that is not yet represented, maintain at least one concise source summary page under pages/summaries/.',
    'If a summary page has frontmatter status: fallback, replace or upgrade it with a real human-readable summary instead of treating it as complete.',
    'Create pages/concepts entries only when the source contains durable reusable concepts, definitions, mechanisms, formulas, or domain terms.',
    'You MUST refresh index.md and overview.md whenever summaries, concepts, entities, questions, comparisons, or source coverage change. A completed source upload always counts as a source coverage change.',
    'index.md must be a routing table with Markdown relative links and one-line descriptions so query agents can read it first and choose relevant pages without full-text search.',
    'Preserve human-readable source citations.',
    'Handle images from every source format semantically, not by order. For each candidate image, first identify its visible meaning with wiki_vision_analyze when available; otherwise require a reliable original inline position, caption, or nearby source text found through its page, slide, sheet, or DOM location. Insert it only below the exact knowledge point it directly supports. Page, slide, sheet, DOM, file, and extraction order or filename alone are never sufficient evidence. Never dump images into a gallery or trailing image section. If confidence is low, omit the image.',
  ]
  if (text.startsWith('source_deleted:')) {
    const partsForDelete = text.split(':')
    const sourceId = partsForDelete[1] || ''
    const sourceTitle = partsForDelete.slice(2).join(':')
    parts.push(
      `A source was removed from this Wiki: source_id=${sourceId}${sourceTitle ? `, title=${sourceTitle}` : ''}.`,
      'Do not use removed source extracts or assets as evidence.',
      'Search existing pages for this source id/title and remove, rewrite, or mark unsupported claims and stale links. Do not delete unrelated knowledge that is still supported by remaining sources.',
    )
  }
  return parts.join(' ')
}

export function sourceSummaryPath(source) {
  const title = safeSegment(source?.title || '', 'source')
  const sourceId = safeSegment(source?.id || '', `src-${Date.now().toString(36)}`)
  return `pages/summaries/${title}-${sourceId}.md`
}

export function fallbackSourceSummaryContent(source, extractPreview = '') {
  const updatedAt = nowIso()
  const title = safeTitle(source?.title || source?.id || 'Source')
  const meta = source?.meta || {}
  const parseStats = meta.parse_stats ? JSON.stringify(meta.parse_stats).slice(0, 1200) : ''
  const previewFence = markdownFence(extractPreview || '')
  const lines = [
    '---',
    `id: summary-${source.id}`,
    'type: source_summary',
    `source_id: ${source.id}`,
    `source_title: ${JSON.stringify(title)}`,
    `source_uri: ${JSON.stringify(source.original_uri || '')}`,
    `source_hash: ${JSON.stringify(source.content_hash || '')}`,
    'status: review_required',
    'fallback: true',
    `updated_at: ${updatedAt}`,
    '---',
    '',
    `# ${title}`,
    '',
    '> This source summary was created automatically because WikiAgent did not write a dedicated summary page. Use it as an entry point; deeper concept/entity pages may be generated by later maintenance runs.',
    '',
    '## Source',
    '',
    `- Source ID: \`${source.id}\``,
    `- Type: \`${source.type || 'unknown'}\``,
    `- Original URI: \`${source.original_uri || ''}\``,
    `- Extract: \`${source.extract_path || ''}\``,
    `- Parser status: \`${source.parser_status || ''}\``,
    parseStats ? `- Parse stats: \`${parseStats.replace(/`/g, '\\`')}\`` : null,
    '',
    '## Extract Preview',
    '',
    extractPreview ? `${previewFence}markdown` : '',
    extractPreview || 'No extract preview is available. Use wiki_tool read_source for full source text if the source still exists.',
    extractPreview ? previewFence : '',
    '',
    '## Maintenance Notes',
    '',
    '- Important claims should be checked against the parsed source before being reused.',
    '- WikiAgent should replace this fallback with a concise human-readable summary when it next maintains this Wiki.',
    '',
  ]
  return lines.filter(line => line !== null).join('\n')
}

export function markdownFence(content = '') {
  const matches = String(content || '').match(/`{3,}/g) || []
  const max = matches.reduce((len, item) => Math.max(len, item.length), 3)
  return '`'.repeat(max + 1)
}

export async function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return `sha256:${hash.digest('hex')}`
}

export async function walkMarkdown(absDir, relDir, out, skip = new Set()) {
  if (!fs.existsSync(absDir)) return
  const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/')
    if (entry.isDirectory()) {
      await walkMarkdown(abs, rel, out, skip)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    if (skip.has(rel)) continue
    const stat = await fs.promises.stat(abs)
    out.push({
      path: rel,
      title: entry.name.replace(/\.md$/i, ''),
      type: 'page',
      updated_at: stat.mtime.toISOString(),
    })
  }
}
