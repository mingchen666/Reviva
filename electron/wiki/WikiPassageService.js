import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, splitFrontmatter } from './WikiMarkdownMetadata.js'
import { tokenizeWikiText } from './WikiSearchService.js'

const CACHE_VERSION = 1
const PARSER_REVISION = 2
const TARGET_CHARS = 800
const MAX_CHARS = 1200
const MIN_CHARS = 80

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || '')).digest('hex')}`
}

function nowIso() {
  return new Date().toISOString()
}

function isBlank(line) {
  return !String(line || '').trim()
}

function isFence(line) {
  return /^\s*(?:```|~~~)/.test(String(line || ''))
}

function isTableLine(line) {
  return /^\s*\|.*\|\s*$/.test(String(line || ''))
}

function tableLength(lines, start) {
  let end = start
  while (end < lines.length && isTableLine(lines[end])) end += 1
  return Math.max(end - start, 1)
}

function headingLevel(line) {
  const match = String(line || '').match(/^(#{1,6})\s+/)
  return match ? match[1].length : 0
}

function headingTitle(line) {
  return String(line || '').replace(/^#{1,6}\s+/, '').trim().slice(0, 160)
}

function isMediaTimestamp(line) {
  return /^- \[[`"]?[\d:.,]+[`"]?\u2013[`"]?[\d:.,]+[`"]?\]\s+/.test(String(line || ''))
}

function mediaRange(line) {
  const match = String(line || '').match(/^-?\s*\[[`"]?([\d:.,]+)[`"]?\u2013[`"]?([\d:.,]+)[`"]?\]/)
  if (!match) return null
  const start = timestampToMs(match[1])
  const end = timestampToMs(match[2])
  if (start === null || end === null || end < start) return null
  return { start, end }
}

function timestampToMs(value = '') {
  const parts = String(value || '').split(':').map(part => Number(part))
  if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return null
  if (parts.length === 1) return Math.round(parts[0] * 1000)
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000)
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000)
  return null
}

function contentWithoutFrontmatter(content = '') {
  return splitFrontmatter(content).body
}

function buildPassageId(wikiId, pagePath, kind, sequence, contentHash) {
  const raw = [wikiId, pagePath, kind, sequence, contentHash].join('\n')
  return `passage_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`
}

function makePassage({ wikiId, kind, pagePath, sourceId, headingPath, lines, startLine, sequence, pdfPage, sourceHash, timeRange, metadata }) {
  const text = lines.join('\n').trim()
  const contentHash = sha256(text)
  const passageMetadata = sourceId ? (metadata || {}) : {}
  return {
    passage_id: buildPassageId(wikiId, pagePath, kind, sequence, contentHash),
    wiki_id: wikiId,
    kind,
    source_id: sourceId || '',
    page_path: pagePath,
    heading_path: headingPath,
    start_line: startLine,
    end_line: startLine + lines.length - 1,
    pdf_page: pdfPage || null,
    time_range_ms: timeRange ? { start: timeRange.start, end: timeRange.end } : null,
    anchor: '',
    text,
    content_hash: contentHash,
    source_hash: sourceHash || '',
    token_estimate: Math.ceil(tokenizeWikiText(text).length * 1.25),
    status: 'active',
    updated_at: nowIso(),
    ...(sourceId ? {
      media_id: String(passageMetadata.media_id || ''),
      media_type: String(passageMetadata.media_type || ''),
      run_id: String(passageMetadata.run_id || ''),
    } : {}),
  }
}

function splitLongLines(lines) {
  const output = []
  let current = []
  let currentChars = 0

  const flush = () => {
    if (current.length) output.push(current)
    current = []
    currentChars = 0
  }

  for (const line of lines) {
    current.push(line)
    currentChars += line.length + 1
    if (currentChars >= TARGET_CHARS) flush()
  }
  if (current.length) output.push(current)
  return output.filter(group => group.join('\n').trim().length > 0)
}

function splitSections(lines) {
  const sections = []
  let start = 0
  let heading = null
  for (let index = 0; index < lines.length; index += 1) {
    if (headingLevel(lines[index])) {
      if (index > start) sections.push({ heading, start, lines: lines.slice(start, index) })
      start = index
      heading = lines[index]
    }
  }
  if (start < lines.length) sections.push({ heading, start, lines: lines.slice(start) })
  return sections
}

function splitLongGroups(lines) {
  const groups = []
  let current = []
  let currentChars = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (isTableLine(lines[index])) {
      const length = tableLength(lines, index)
      if (current.length) groups.push(current)
      groups.push(lines.slice(index, index + length))
      index += length - 1
      current = []
      currentChars = 0
      continue
    }
    current.push(lines[index])
    currentChars += lines[index].length + 1
    if (isBlank(lines[index]) && currentChars >= TARGET_CHARS) {
      groups.push(current)
      current = []
      currentChars = 0
    }
  }
  if (current.length) groups.push(current)

  return groups.flatMap(group => {
    const joined = group.join('\n').trim()
    if (joined.length <= MAX_CHARS) return [group]
    return splitLongLines(group)
  }).filter(group => group.join('\n').trim().length > 0)
}

function splitSourceSection(lines) {
  const groups = []
  let current = []
  for (const line of lines) {
    if (isMediaTimestamp(line) && current.length) {
      groups.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length) groups.push(current)
  return groups.flatMap(group => splitLongGroups(group))
}

function shouldSplitPassage(current, next) {
  if (!current || !next) return false
  if (isTableLine(current.text.split('\n')[0]) || isFence(current.text.split('\n')[0])) return true
  if (isTableLine(next.text.split('\n')[0]) || isFence(next.text.split('\n')[0])) return true
  return current.text.length + next.text.length <= MAX_CHARS
}

function mergeShortPassages(passages) {
  const output = []
  for (const passage of passages) {
    const previous = output[output.length - 1]
    if (shouldSplitPassage(previous, passage)) {
      previous.text = `${previous.text}\n${passage.text}`
      previous.end_line = passage.end_line
      previous.content_hash = sha256(previous.text)
      previous.token_estimate = Math.ceil(tokenizeWikiText(previous.text).length * 1.25)
      continue
    }
    output.push(passage)
  }
  return output
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) } catch { return fallback }
}

export class WikiPassageService {
  constructor({ wikiDir }) {
    this._wikiDir = wikiDir
    this._cachePath = path.join(wikiDir, '.cache', 'search', 'passages-v1.json')
  }

  parseMarkdown(content = '', options = {}) {
    const normalized = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    const bodyText = contentWithoutFrontmatter(normalized)
    const body = bodyText.split('\n')
    const bodyStartLine = normalized.slice(0, normalized.length - bodyText.length).split('\n').length
    const sections = splitSections(body)
    const sourceMetadata = options.sourceId ? (parseFrontmatter(content).attributes || {}) : {}
    const passages = []
    let sequence = 0
    for (const section of sections) {
      const headingPath = [...(options.headingPath || [])]
      if (section.heading) headingPath.push(headingTitle(section.heading))
      let pdfPage = null
      let groupCursor = 0
      for (const group of splitLongGroups(section.lines)) {
        const groupStart = section.lines.indexOf(group[0], groupCursor)
        groupCursor = groupStart + group.length
        const first = group.find(line => line.trim()) || ''
        const pageMatch = first?.match(/^#{1,6}\s+Page\s+(\d+)/i)
        if (pageMatch) pdfPage = Number(pageMatch[1])
        sequence += 1
        passages.push(makePassage({
          wikiId: options.wikiId || '',
          kind: options.kind || 'page',
          pagePath: options.pagePath || '',
          sourceId: options.sourceId || '',
          headingPath,
          lines: group,
          startLine: (options.startLine || 0) + bodyStartLine + section.start + groupStart,
          sequence,
          pdfPage,
          sourceHash: options.sourceHash || '',
          metadata: sourceMetadata,
          ...(options.sourceId && group.find(line => isMediaTimestamp(line)) ? {
            timeRange: mediaRange(group.find(line => isMediaTimestamp(line))),
          } : {}),
        }))
      }
    }
    return mergeShortPassages(passages)
  }

  async build(wikiId, files = []) {
    const cached = await readJson(this._cachePath, null)
    const state = cached?.version === CACHE_VERSION && cached.documents && cached.passages
      ? cached
      : { version: CACHE_VERSION, documents: {}, passages: {} }
    const expected = new Set(files.map(file => file.rel))
    const parserChanged = state.parser_revision !== PARSER_REVISION
    let changed = parserChanged || Object.keys(state.documents).some(rel => !expected.has(rel))
    if (changed) for (const rel of Object.keys(state.documents)) {
      if (!expected.has(rel)) {
        for (const passageId of state.documents[rel].passages || []) delete state.passages[passageId]
        delete state.documents[rel]
      }
    }

    for (const file of files) {
      const content = await fs.promises.readFile(file.abs, 'utf-8').catch(() => null)
      if (content === null) {
        if (state.documents[file.rel]) {
          for (const passageId of state.documents[file.rel].passages || []) delete state.passages[passageId]
          delete state.documents[file.rel]
          changed = true
        }
        continue
      }
      const contentHash = sha256(content)
      if (!parserChanged && state.documents[file.rel]?.hash === contentHash) continue
      if (state.documents[file.rel]) {
        for (const passageId of state.documents[file.rel].passages || []) delete state.passages[passageId]
      }
      const passages = this.parseMarkdown(content, {
        wikiId,
        kind: file.kind,
        pagePath: file.rel,
        sourceId: file.source_id || '',
        sourceHash: contentHash,
      })
      for (const passage of passages) state.passages[passage.passage_id] = passage
      state.documents[file.rel] = {
        hash: contentHash,
        passages: passages.map(passage => passage.passage_id),
        updated_at: nowIso(),
      }
      changed = true
    }

    if (changed) {
      state.parser_revision = PARSER_REVISION
      await fs.promises.mkdir(path.dirname(this._cachePath), { recursive: true })
      await fs.promises.writeFile(this._cachePath, JSON.stringify(state), 'utf-8')
    }
    return Object.values(state.passages)
  }

  async search({ query, scope = 'all', limit = 10, passages = [] } = {}) {
    const queryTokens = [...new Set(tokenizeWikiText(query))]
    if (!queryTokens.length || !passages.length) return []
    const normalizedScope = String(scope || 'all').toLowerCase()
    const scoped = passages.filter(passage => {
      if (normalizedScope === 'all') return true
      if (['pages', 'wiki'].includes(normalizedScope)) return passage.kind === 'page'
      if (['sources', 'source'].includes(normalizedScope)) return passage.kind === 'source'
      return true
    })
    if (!scoped.length) return []
    const df = {}
    for (const passage of scoped) {
      const tokens = new Set(tokenizeWikiText(passage.text))
      for (const token of queryTokens) if (tokens.has(token)) df[token] = (df[token] || 0) + 1
    }
    const avgLength = scoped.reduce((sum, passage) => sum + tokenizeWikiText(passage.text).length, 0) / scoped.length
    return scoped.map(passage => {
      const tokens = [...new Set(tokenizeWikiText(passage.text))]
      let score = 0
      for (const token of queryTokens) {
        const tf = tokens.filter(item => item === token).length
        if (!tf) continue
        const freq = df[token] || 0
        const idf = Math.log(1 + (scoped.length - freq + 0.5) / (freq + 0.5))
        score += idf * ((tf * 2.5) / (tf + 1.5 * (1 - 0.75 + 0.75 * tokens.length / Math.max(avgLength, 1))))
      }
      return { passage, score }
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(Number(limit || 10), 1), 50))
      .map(({ passage, score }) => ({
        passage_id: passage.passage_id,
        wiki_id: passage.wiki_id,
        kind: passage.kind,
        source_id: passage.source_id,
        page_path: passage.page_path,
        heading_path: passage.heading_path,
        start_line: passage.start_line,
        end_line: passage.end_line,
        pdf_page: passage.pdf_page,
        media_id: passage.media_id || '',
        media_type: passage.media_type || '',
        run_id: passage.run_id || '',
        time_range_ms: passage.time_range_ms || null,
        snippet: passage.text,
        score: Number(score.toFixed(6)),
        citation: {
          type: 'passage',
          wiki_id: passage.wiki_id,
          passage_id: passage.passage_id,
          page_path: passage.page_path,
          heading_path: passage.heading_path,
          start_line: passage.start_line,
          end_line: passage.end_line,
          source_id: passage.source_id,
          pdf_page: passage.pdf_page,
          media_id: passage.media_id || '',
          run_id: passage.run_id || '',
          time_range_ms: passage.time_range_ms || null,
        },
      }))
  }

  async readPassage(passageId) {
    const state = await readJson(this._cachePath, { passages: {} })
    return state.passages?.[passageId] || null
  }

  async verifyCitation(citation = {}, sources = []) {
    const state = await readJson(this._cachePath, { passages: {}, documents: {} })
    const passageId = String(citation.passage_id || '').trim()
    const passage = state.passages?.[passageId] || null
    if (!passage) return { status: 'missing', valid: false, reason: 'passage_not_found' }

    if (citation.start_line !== undefined && Number(citation.start_line) !== passage.start_line) {
      return { status: 'line_drift', valid: false, reason: 'start_line_changed', current: passage }
    }
    if (citation.end_line !== undefined && Number(citation.end_line) !== passage.end_line) {
      return { status: 'line_drift', valid: false, reason: 'end_line_changed', current: passage }
    }
    if (citation.content_hash && citation.content_hash !== passage.content_hash) {
      return { status: 'hash_changed', valid: false, reason: 'content_hash_changed', current: passage }
    }
    if (passage.source_id) {
      const source = sources.find(item => item.id === passage.source_id)
      if (!source) return { status: 'missing', valid: false, reason: 'source_not_found', current: passage }
      if (citation.media_id !== undefined && String(citation.media_id) !== String(passage.media_id || '')) {
        return { status: 'media_run_changed', valid: false, reason: 'media_id_changed', current: passage }
      }
      if (citation.run_id !== undefined && String(citation.run_id) !== String(passage.run_id || '')) {
        return { status: 'media_run_changed', valid: false, reason: 'run_id_changed', current: passage }
      }
      if (citation.time_range_ms) {
        const expected = passage.time_range_ms
        const actual = citation.time_range_ms
        if (!expected || Number(actual.start) !== expected.start || Number(actual.end) !== expected.end) {
          return { status: 'time_range_invalid', valid: false, reason: 'time_range_changed', current: passage }
        }
      }
    }
    return { status: 'valid', valid: true, passage }
  }
}
