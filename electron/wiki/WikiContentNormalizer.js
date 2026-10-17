// wiki/WikiContentNormalizer.js — extracted from WikiService.js
// Page path resolution and Markdown content normalization.

import path from 'node:path'
import { safeSegment } from './wikiUtils.js'

function resolveWritablePagePath(pagePath, title = 'wiki-page') {
  const raw = String(pagePath || '').trim().replace(/\\/g, '/')
  const fallback = `pages/summaries/${safeSegment(title, 'wiki-page')}.md`
  let rel = raw || fallback
  rel = rel.replace(/^\/+/, '')
  if (!rel.toLowerCase().endsWith('.md')) rel += '.md'
  const normalized = path.posix.normalize(rel)
  if (!normalized || normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
    throw new Error('Invalid Wiki page path')
  }
  if (normalized === 'pages/index.md') return 'index.md'
  if (normalized === 'pages/overview.md') return 'overview.md'
  const allowedRootFiles = new Set(['index.md', 'overview.md'])
  if (allowedRootFiles.has(normalized)) return normalized
  if (normalized.startsWith('pages/')) return normalized
  return `pages/${normalized}`
}

function normalizePageContent({ relPath, title, content }) {
  const body = String(content || '').trim()
  const heading = title || path.posix.basename(relPath, '.md')
  const normalizedBody = body.startsWith('---') || /^#\s+/m.test(body)
    ? body
    : `# ${heading}\n\n${body || 'No content yet.'}`
  return `${normalizeMarkdownAssetImageRefs(normalizedBody, relPath)}\n`
}

function normalizeMarkdownAssetImageRefs(markdown, relPath) {
  return String(markdown || '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, label, rawTarget) => {
    const target = normalizeMarkdownImageTarget(rawTarget, relPath)
    return target ? `![${label}](${target})` : match
  })
}

function normalizeMarkdownImageTarget(rawTarget, relPath) {
  const text = String(rawTarget || '').trim()
  if (!text) return ''
  const match = text.match(/^(\S+)(\s+["'][\s\S]*["'])?$/)
  if (!match) return ''
  const rawRef = match[1].replace(/^<|>$/g, '')
  const title = match[2] || ''
  if (!rawRef || /^(https?:|data:|blob:|file:|reviva-file:|mailto:|#)/i.test(rawRef)) return ''
  if (/^[a-zA-Z]:[\\/]/.test(rawRef) || /^\\\\/.test(rawRef)) return ''

  const refMatch = rawRef.match(/^([^?#]*)([?#].*)?$/)
  const pathPart = String(refMatch?.[1] || rawRef).replace(/\\/g, '/')
  const suffix = refMatch?.[2] || ''
  const cleanPath = pathPart.replace(/^\/+/, '')
  const pagePath = String(relPath || 'index.md').replace(/\\/g, '/')
  const pageDir = pagePath.includes('/') ? pagePath.slice(0, pagePath.lastIndexOf('/')) : ''
  const candidate = pathPart.startsWith('/') || cleanPath.startsWith('assets/')
    ? path.posix.normalize(cleanPath)
    : path.posix.normalize(path.posix.join(pageDir || '.', cleanPath))

  if (!candidate.startsWith('assets/images/')) return ''
  const rel = path.posix.relative(pageDir || '.', candidate)
  const safeRel = rel && !rel.startsWith('.') ? rel : rel
  return `${safeRel || path.posix.basename(candidate)}${suffix}${title}`
}

function snippet(content, terms) {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  const index = terms.map(term => lower.indexOf(term)).filter(pos => pos >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(index - 80, 0)
  const end = Math.min(index + 220, text.length)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

export { resolveWritablePagePath, normalizePageContent, normalizeMarkdownAssetImageRefs, normalizeMarkdownImageTarget, snippet }
