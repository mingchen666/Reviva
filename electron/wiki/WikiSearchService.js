import fs from 'node:fs'
import path from 'node:path'
import { pageContentHash, parseFrontmatter } from './WikiMarkdownMetadata.js'

const CACHE_VERSION = 1

function addCount(target, token, weight = 1) {
  if (!token) return
  target[token] = (target[token] || 0) + weight
}

export function tokenizeWikiText(value = '') {
  const text = String(value || '').toLowerCase()
  const tokens = []
  for (const match of text.matchAll(/[a-z0-9]+(?:[_-][a-z0-9]+)*/g)) tokens.push(match[0])
  for (const match of text.matchAll(/[\p{Script=Han}]+/gu)) {
    const segment = match[0]
    if (segment.length === 1) tokens.push(segment)
    else {
      if (segment.length <= 16) tokens.push(segment)
      for (let i = 0; i < segment.length - 1; i += 1) tokens.push(segment.slice(i, i + 2))
    }
  }
  return tokens
}

function headingTexts(content = '') {
  return [...String(content || '').matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1])
}

function buildCounts({ content, title, relPath }) {
  const counts = {}
  const headings = headingTexts(content)
  const body = String(content || '').replace(/^#{1,6}\s+.+$/gm, ' ')
  for (const token of tokenizeWikiText(body)) addCount(counts, token, 1)
  for (const token of tokenizeWikiText(title)) addCount(counts, token, 4)
  for (const heading of headings) {
    for (const token of tokenizeWikiText(heading)) addCount(counts, token, 3)
  }
  for (const token of tokenizeWikiText(relPath)) addCount(counts, token, 2)
  return {
    counts,
    length: Math.max(tokenizeWikiText(body).length, 1),
    headings,
  }
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) } catch { return fallback }
}

async function walkMarkdown(absDir, relDir, out) {
  if (!fs.existsSync(absDir)) return
  for (const entry of await fs.promises.readdir(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name)
    const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/')
    if (entry.isDirectory()) await walkMarkdown(abs, rel, out)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push({ abs, rel, kind: 'page' })
  }
}

function snippet(content, queryTokens, width = 320) {
  const compact = String(content || '').replace(/^---[\s\S]*?---\s*/m, '').replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const lower = compact.toLowerCase()
  let index = -1
  for (const token of queryTokens) {
    const current = lower.indexOf(token)
    if (current >= 0 && (index < 0 || current < index)) index = current
  }
  if (index < 0) index = 0
  const start = Math.max(index - Math.floor(width / 3), 0)
  const end = Math.min(start + width, compact.length)
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`
}

function bm25(queryTokens, doc, df, totalDocs, avgLength, k1 = 1.5, b = 0.75) {
  let score = 0
  for (const token of queryTokens) {
    const tf = Number(doc.counts?.[token] || 0)
    if (!tf) continue
    const freq = Number(df[token] || 0)
    const idf = Math.log(1 + (totalDocs - freq + 0.5) / (freq + 0.5))
    const denominator = tf + k1 * (1 - b + b * doc.length / Math.max(avgLength, 1))
    score += idf * ((tf * (k1 + 1)) / denominator)
  }
  return score
}

export class WikiSearchService {
  constructor({ wikiDir }) {
    this._wikiDir = wikiDir
    this._cachePath = path.join(wikiDir, '.cache', 'search', 'index.json')
  }

  async _documentFiles(sources = []) {
    const files = []
    for (const rootFile of ['index.md', 'overview.md']) {
      const abs = path.join(this._wikiDir, rootFile)
      if (fs.existsSync(abs)) files.push({ abs, rel: rootFile, kind: 'page', title: path.basename(rootFile, '.md') })
    }
    await walkMarkdown(path.join(this._wikiDir, 'pages'), 'pages', files)
    for (const source of sources || []) {
      const rel = String(source.extract_path || '').replace(/\\/g, '/')
      if (!rel) continue
      const abs = path.resolve(this._wikiDir, rel)
      if (!abs.toLowerCase().startsWith(path.resolve(this._wikiDir).toLowerCase() + path.sep)) continue
      if (!fs.existsSync(abs)) continue
      files.push({
        abs,
        rel,
        kind: 'source',
        title: source.title || source.id,
        source_id: source.id,
        parser_status: source.parser_status || '',
      })
    }
    return files
  }

  async build(sources = []) {
    const cached = await readJson(this._cachePath, { version: CACHE_VERSION, docs: {} })
    const previous = cached.version === CACHE_VERSION && cached.docs && typeof cached.docs === 'object' ? cached.docs : {}
    const files = await this._documentFiles(sources)
    const docs = {}
    let changed = false

    for (const file of files) {
      const stat = await fs.promises.stat(file.abs).catch(() => null)
      if (!stat?.isFile()) continue
      const key = `${file.kind}:${file.rel}:${file.source_id || ''}`
      const old = previous[key]
      const content = await fs.promises.readFile(file.abs, 'utf-8').catch(() => '')
      const contentHash = pageContentHash(content)
      const frontmatterTitle = file.kind === 'page' ? parseFrontmatter(content).attributes?.title : ''
      const resolvedTitle = String(frontmatterTitle || file.title || path.basename(file.rel, '.md'))
      if (old && old.content_hash === contentHash && old.title === resolvedTitle) {
        docs[key] = old
        continue
      }
      const built = buildCounts({ content, title: resolvedTitle, relPath: file.rel })
      docs[key] = {
        kind: file.kind,
        path: file.rel,
        title: resolvedTitle,
        source_id: file.source_id || '',
        parser_status: file.parser_status || '',
        content_hash: contentHash,
        mtime_ms: stat.mtimeMs,
        size: stat.size,
        counts: built.counts,
        length: built.length,
        headings: built.headings.slice(0, 60),
      }
      changed = true
    }
    if (Object.keys(previous).some(key => !docs[key])) changed = true
    if (changed) {
      await fs.promises.mkdir(path.dirname(this._cachePath), { recursive: true })
      await fs.promises.writeFile(this._cachePath, JSON.stringify({
        version: CACHE_VERSION,
        docs,
        updated_at: new Date().toISOString(),
      }), 'utf-8')
    }
    return Object.values(docs)
  }

  async search({ query, scope = 'all', limit = 10, sources = [] } = {}) {
    const queryText = String(query || '').trim()
    const queryTokens = [...new Set(tokenizeWikiText(queryText))]
    if (!queryTokens.length) return []
    const normalizedScope = String(scope || 'all').toLowerCase()
    const docs = (await this.build(sources)).filter(doc => {
      if (normalizedScope === 'all') return true
      if (['pages', 'wiki'].includes(normalizedScope)) return doc.kind === 'page'
      if (['sources', 'source'].includes(normalizedScope)) return doc.kind === 'source'
      return true
    })
    if (!docs.length) return []

    const df = {}
    for (const doc of docs) {
      for (const token of queryTokens) {
        if (doc.counts?.[token]) df[token] = (df[token] || 0) + 1
      }
    }
    const avgLength = docs.reduce((sum, doc) => sum + Number(doc.length || 0), 0) / docs.length
    const lowerQuery = queryText.toLowerCase()
    const scored = []
    for (const doc of docs) {
      let score = bm25(queryTokens, doc, df, docs.length, avgLength)
      if (String(doc.title || '').toLowerCase().includes(lowerQuery)) score += 4
      if (String(doc.path || '').toLowerCase().includes(lowerQuery)) score += 2
      if (doc.source_id && String(doc.source_id).toLowerCase() === lowerQuery) score += 8
      if (score <= 0) continue
      const abs = path.resolve(this._wikiDir, doc.path)
      const content = await fs.promises.readFile(abs, 'utf-8').catch(() => '')
      scored.push({
        kind: doc.kind,
        path: doc.path,
        title: doc.title,
        source_id: doc.source_id || '',
        parser_status: doc.parser_status || '',
        score: Number(score.toFixed(6)),
        snippet: snippet(content, queryTokens),
        search_backend: 'bm25',
      })
    }
    return scored
      .sort((a, b) => b.score - a.score || String(a.title || '').localeCompare(String(b.title || '')))
      .slice(0, Math.min(Math.max(Number(limit || 10), 1), 50))
  }
}

