import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from './MediaErrors.js'

const QUERY_MODES = Object.freeze(['metadata', 'transcript', 'search', 'chapters', 'frames', 'artifacts'])
const READY_RUN_STATUSES = new Set(['ready', 'partial'])
const DEFAULT_LIMITS = Object.freeze({ transcript: 100, search: 5, chapters: 50, frames: 24, artifacts: 100 })
const MAX_LIMITS = Object.freeze({ transcript: 500, search: 50, chapters: 200, frames: 100, artifacts: 200 })
const DEFAULT_MAX_CHARS = 12000
const MAX_MAX_CHARS = 30000
const SEARCH_INDEX_CACHE_LIMIT = 4

function clampInteger(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decodeCursor(cursor) {
  if (!cursor) return { offset: 0, charOffset: 0, searchKey: '' }
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
    return {
      offset: clampInteger(parsed?.offset, 0, 0, Number.MAX_SAFE_INTEGER),
      charOffset: clampInteger(parsed?.charOffset, 0, 0, Number.MAX_SAFE_INTEGER),
      searchKey: String(parsed?.searchKey || ''),
    }
  } catch {
    throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '无效的媒体读取 cursor。')
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function searchTerms(value) {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []
  const terms = []
  const append = (item) => {
    const term = normalizeSearchText(item)
    if (!term) return
    const compact = term.replace(/\s+/g, '')
    if (!compact) return
    terms.push(compact)
  }
  let segmented = false
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
    for (const item of segmenter.segment(normalized)) {
      if (item.isWordLike !== false) {
        append(item.segment)
        segmented = true
      }
    }
  }
  for (const item of normalized.split(/\s+/)) {
    if (!segmented || /[a-z0-9+#]/i.test(item)) append(item)
  }
  return [...new Set(terms)]
}

function searchBigrams(value) {
  const han = [...compactSearchText(value).replace(/[^\p{Script=Han}]/gu, '')]
  if (han.length < 3) return []
  const result = []
  for (let index = 0; index < han.length - 1; index += 1) result.push(`${han[index]}${han[index + 1]}`)
  return [...new Set(result)]
}

function createSearchProfile(value) {
  const normalized = normalizeSearchText(value)
  return {
    normalized,
    compact: normalized.replace(/\s+/g, ''),
    terms: searchTerms(normalized),
    bigrams: searchBigrams(normalized),
  }
}

function createSearchEntry(value, row = null) {
  const normalized = normalizeSearchText(value)
  return {
    row,
    normalized,
    compact: normalized.replace(/\s+/g, ''),
    terms: searchTerms(normalized),
  }
}

function searchTermWeight(term, index = null) {
  const length = [...String(term || '')].length
  const documentCount = Math.max(1, Number(index?.documentCount) || 1)
  const documentFrequency = Math.max(0, Number(index?.documentFrequency?.get?.(term)) || 0)
  const frequencyRatio = documentFrequency / documentCount
  let weight = Math.log((documentCount + 1) / (documentFrequency + 1)) + 1
  if (frequencyRatio >= 0.7) weight *= 0.15
  else if (frequencyRatio >= 0.45) weight *= 0.35
  else if (frequencyRatio >= 0.2) weight *= 0.65
  if (length <= 1) weight *= 0.35
  return Math.max(0.05, weight)
}

function scoreSearchEntry(entry, profile, index = null) {
  if (!entry?.normalized || !profile?.normalized) return null
  const exactMatch = entry.normalized.includes(profile.normalized)
    || (profile.compact.length >= 2 && entry.compact.includes(profile.compact))
  const matchedTerms = profile.terms.filter(term => entry.compact.includes(term))
  const totalTermWeight = profile.terms.reduce((sum, term) => sum + searchTermWeight(term, index), 0)
  const matchedTermWeight = matchedTerms.reduce((sum, term) => sum + searchTermWeight(term, index), 0)
  const termCoverage = totalTermWeight > 0 ? matchedTermWeight / totalTermWeight : 0
  const matchedBigrams = profile.bigrams.filter(term => entry.compact.includes(term))
  const bigramCoverage = profile.bigrams.length ? matchedBigrams.length / profile.bigrams.length : 0

  if (exactMatch) {
    return { score: 1000 + Math.min(200, profile.compact.length), exactMatch: true, termCoverage: 1, matchedTerms }
  }
  if (matchedTerms.length && termCoverage >= 0.5) {
    const specificity = matchedTerms.reduce((sum, term) => sum + searchTermWeight(term, index), 0) / matchedTerms.length
    return {
      score: Math.round(400 + termCoverage * 360 + Math.min(140, specificity * 35)),
      exactMatch: false,
      termCoverage,
      matchedTerms,
    }
  }
  if (profile.bigrams.length >= 2 && matchedBigrams.length >= 2 && bigramCoverage >= 0.45) {
    return {
      score: Math.round(180 + bigramCoverage * 260),
      exactMatch: false,
      termCoverage,
      matchedTerms: matchedTerms.length ? matchedTerms : matchedBigrams,
    }
  }
  return null
}

function scoreSearchText(value, profile, index = null) {
  return scoreSearchEntry(createSearchEntry(value), profile, index)
}

function findSearchAnchor(value, profile) {
  const normalized = String(value || '').normalize('NFKC').toLocaleLowerCase()
  const phrase = String(profile?.normalized || '')
  let index = phrase ? normalized.indexOf(phrase) : -1
  if (index >= 0) return index
  for (const term of profile?.terms || []) {
    index = normalized.indexOf(term)
    if (index >= 0) return index
  }
  return 0
}

function mergeSearchWindows(candidates, contextSegments, totalRows) {
  const ordered = candidates
    .map(candidate => ({
      startIndex: Math.max(0, candidate.index - contextSegments),
      endIndex: Math.min(totalRows - 1, candidate.index + contextSegments),
      matches: [candidate],
      score: candidate.score,
    }))
    .sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex)
  const merged = []
  for (const window of ordered) {
    const previous = merged[merged.length - 1]
    if (previous && window.startIndex <= previous.endIndex + 1) {
      previous.endIndex = Math.max(previous.endIndex, window.endIndex)
      previous.matches.push(...window.matches)
      previous.score = Math.max(previous.score, window.score)
    } else {
      merged.push(window)
    }
  }
  return merged.sort((left, right) => right.score - left.score || left.startIndex - right.startIndex)
}

function sanitizeDiagnosticText(value) {
  return String(value || '')
    .replace(/\bfile:\/\/\S+/gi, '[local-path]')
    .replace(/\b[a-z]:[\\/][^\s,;]+/gi, '[local-path]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
}

function publicRun(run) {
  if (!run) return null
  return {
    id: run.id,
    status: run.status,
    stage: run.stage || '',
    progress: Number(run.progress) || 0,
    message: sanitizeDiagnosticText(run.message),
    presetId: run.preset_id || '',
    pipelineVersion: Number(run.pipeline_version) || 1,
    sttProviderId: run.stt_provider_id || '',
    sttModelId: run.stt_model_id || '',
    warnings: Array.isArray(run.warnings) ? run.warnings.map(sanitizeDiagnosticText) : [],
    errorCode: run.error_code || '',
    errorMessage: sanitizeDiagnosticText(run.error_message),
    createdAt: run.created_at || '',
    startedAt: run.started_at || '',
    finishedAt: run.finished_at || '',
    updatedAt: run.updated_at || '',
  }
}

function publicArtifact(artifact) {
  return {
    id: artifact.id,
    type: artifact.type,
    variant: artifact.variant || '',
    status: artifact.status,
    mimeType: artifact.mime_type || '',
    sizeBytes: Number(artifact.size_bytes) || 0,
    providerId: artifact.provider_id || '',
    providerModel: artifact.provider_model || '',
    schemaVersion: Number(artifact.schema_version) || 1,
    errorCode: artifact.error_code || '',
    errorMessage: sanitizeDiagnosticText(artifact.error_message),
    createdAt: artifact.created_at || '',
    updatedAt: artifact.updated_at || '',
  }
}

function publicSegment(segment, chapterTitle = null, text = segment?.text || '') {
  return {
    id: segment.id,
    type: 'segment',
    startMs: Number(segment.start_ms) || 0,
    endMs: Number(segment.end_ms) || 0,
    text,
    language: segment.language || '',
    speaker: segment.speaker || null,
    confidence: Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null,
    chapterTitle,
  }
}

function publicPlainText(text, id = 'plain_transcript') {
  return {
    id,
    type: 'plain_text',
    startMs: null,
    endMs: null,
    text,
    language: '',
    speaker: null,
    confidence: null,
    chapterTitle: null,
  }
}

function isSameOrInside(target, root) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safeMediaVirtualPath(mediaId, value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..') || /^[a-z]:/i.test(normalized)) return ''
  const mediaPrefix = `context/media/${mediaId}/`
  const relative = normalized.startsWith(mediaPrefix) ? normalized.slice(mediaPrefix.length) : normalized
  return `/context/media/${mediaId}/${relative}`
}

function safeExportName(value) {
  const normalized = String(value || 'media-transcript').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return normalized.slice(0, 120) || 'media-transcript'
}

export class MediaQueryService {
  constructor({ mediaRepository, runRepository, artifactRepository, workDirService, subtitleService } = {}) {
    this._media = mediaRepository
    this._runs = runRepository
    this._artifacts = artifactRepository
    this._workDir = workDirService
    this._subtitles = subtitleService
    this._searchIndexCache = new Map()
  }

  _assertAuthorized(mediaId, context = {}) {
    const id = String(mediaId || '').trim()
    if (!id) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'mediaId 不能为空。')
    if (context.trustedInternal === true) return id
    const allowed = context.allowedMediaIds instanceof Set
      ? context.allowedMediaIds
      : new Set(Array.isArray(context.allowedMediaIds) ? context.allowedMediaIds.map(String) : [])
    if (!allowed.has(id)) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, '当前 Agent 运行未获授权读取该媒体。')
    }
    return id
  }

  _current(mediaId, context) {
    const id = this._assertAuthorized(mediaId, context)
    const source = this._media?.getMediaSource?.(id)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    const run = source.current_run_id ? this._runs?.getMediaRun?.(source.current_run_id) : null
    return { source, run }
  }

  _requirePublishedRun(source, run) {
    if (!run || run.media_id !== source.id || !READY_RUN_STATUSES.has(run.status)) {
      throw new MediaError(MEDIA_ERROR_CODES.RUN_NOT_FOUND, '媒体尚无可读取的已发布解析结果。')
    }
    return run
  }

  _chapterTitleMap(runId) {
    return new Map((this._artifacts?.listMediaChapters?.(runId) || []).map(chapter => [chapter.id, chapter.title || null]))
  }

  _plainTranscript(source, run) {
    const root = this._workDir?.getRootPath?.()
    if (!root) return null
    const artifact = (this._artifacts?.listMediaArtifacts?.(run.id) || []).find(item => (
      item.type === 'transcript'
      && (item.status === 'ready' || item.status === 'partial')
      && item.relative_path
    ))
    if (!artifact) return null
    const mediaRoot = path.resolve(root, 'context', 'media', source.id)
    const target = path.resolve(mediaRoot, String(artifact.relative_path))
    if (!isSameOrInside(target, mediaRoot) || !fs.existsSync(target)) return null
    try {
      const payload = JSON.parse(fs.readFileSync(target, 'utf8'))
      const text = String(payload?.text || '').trim()
      return text ? { text, language: String(payload?.language || '') } : null
    } catch {
      return null
    }
  }

  _allSegments(runId) {
    const result = []
    let offset = 0
    const pageSize = 2000
    while (true) {
      const page = this._artifacts.listMediaSegments(runId, { limit: pageSize, offset })
      result.push(...page)
      if (page.length < pageSize) break
      offset += page.length
    }
    return result
  }

  _searchIndex(run) {
    const cacheKey = `${run.id}:${run.updated_at || run.finished_at || ''}`
    const cached = this._searchIndexCache.get(cacheKey)
    if (cached) {
      this._searchIndexCache.delete(cacheKey)
      this._searchIndexCache.set(cacheKey, cached)
      return cached
    }
    const rows = this._allSegments(run.id)
    const entries = rows.map(row => createSearchEntry(row.text, row))
    const documentFrequency = new Map()
    for (const entry of entries) {
      for (const term of new Set(entry.terms)) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)
      }
    }
    const index = Object.freeze({
      cacheKey,
      rows,
      entries,
      documentCount: entries.length,
      documentFrequency,
    })
    for (const key of this._searchIndexCache.keys()) {
      if (key !== cacheKey && key.startsWith(`${run.id}:`)) this._searchIndexCache.delete(key)
    }
    this._searchIndexCache.set(cacheKey, index)
    while (this._searchIndexCache.size > SEARCH_INDEX_CACHE_LIMIT) {
      const oldestKey = this._searchIndexCache.keys().next().value
      this._searchIndexCache.delete(oldestKey)
    }
    return index
  }

  _exportRun(mediaId, runId, context) {
    const id = this._assertAuthorized(mediaId, context)
    const source = this._media.getMediaSource(id)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    const selectedRunId = String(runId || source.current_run_id || '')
    const run = selectedRunId ? this._runs.getMediaRun(selectedRunId) : null
    return { source, run: this._requirePublishedRun(source, run) }
  }

  query(request = {}, context = {}) {
    const mode = String(request.mode || 'metadata').trim().toLowerCase()
    if (!QUERY_MODES.includes(mode)) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, `不支持的媒体读取 mode：${mode}`)
    if (mode === 'metadata') return this.metadata(request.mediaId, context)
    if (mode === 'transcript') return this.transcript(request, context)
    if (mode === 'search') return this.search(request, context)
    if (mode === 'chapters') return this.chapters(request, context)
    if (mode === 'frames') return this.frames(request, context)
    return this.artifacts(request, context)
  }

  metadata(mediaId, context = {}) {
    const { source, run } = this._current(mediaId, context)
    const artifacts = run ? this._artifacts?.listMediaArtifacts?.(run.id) || [] : []
    const recentRuns = this._runs?.listMediaRuns?.(source.id, { limit: 20 }) || []
    const latestRun = recentRuns[0] || null
    const activeRun = recentRuns.find(item => item.status === 'queued' || item.status === 'running') || null
    const readyTypes = new Set(artifacts.filter(item => item.status === 'ready' || item.status === 'partial').map(item => item.type))
    const availableModes = ['metadata']
    if (run && READY_RUN_STATUSES.has(run.status)) availableModes.push('artifacts')
    if (readyTypes.has('transcript') || readyTypes.has('segments')) availableModes.push('transcript', 'search')
    if (readyTypes.has('chapters')) availableModes.push('chapters')
    if (source.media_type === 'video' && readyTypes.has('keyframes')) availableModes.push('frames')
    const uniqueAvailableModes = [...new Set(availableModes)]
    return {
      success: true,
      mode: 'metadata',
      media: {
        id: source.id,
        mediaType: source.media_type || '',
        title: sanitizeDiagnosticText(source.title || source.file_name || ''),
        fileName: source.file_name || '',
        mimeType: source.mime_type || '',
        fileSize: Number(source.file_size) || 0,
        durationMs: Number(source.duration_ms) || 0,
        width: Number(source.width) || 0,
        height: Number(source.height) || 0,
        contentAvailability: source.content_availability || 'none',
        currentRunId: source.current_run_id || '',
        createdAt: source.created_at || '',
        updatedAt: source.updated_at || '',
      },
      run: publicRun(run),
      latestRun: publicRun(latestRun),
      activeRun: publicRun(activeRun),
      availableModes: uniqueAvailableModes,
      readingGuidance: {
        strategy: 'adaptive',
        factMode: uniqueAvailableModes.includes('search') ? 'search' : null,
        continuousMode: uniqueAvailableModes.includes('transcript') ? 'transcript' : null,
        overviewMode: uniqueAvailableModes.includes('chapters') ? 'chapters_then_transcript' : (uniqueAvailableModes.includes('transcript') ? 'transcript' : null),
        visualMode: uniqueAvailableModes.includes('frames') ? 'frames' : null,
        searchDefaults: uniqueAvailableModes.includes('search') ? { limit: 5, maxChars: 5000, contextSegments: 2 } : null,
        stopRule: 'evidence_sufficient',
        discloseCoverage: true,
      },
      artifacts: artifacts.map(publicArtifact),
    }
  }

  transcript(request = {}, context = {}) {
    const { source, run: currentRun } = this._current(request.mediaId, context)
    const run = this._requirePublishedRun(source, currentRun)
    const limit = clampInteger(request.limit, DEFAULT_LIMITS.transcript, 1, MAX_LIMITS.transcript)
    const maxChars = clampInteger(request.maxChars, DEFAULT_MAX_CHARS, 200, MAX_MAX_CHARS)
    const cursor = decodeCursor(request.cursor)
    const startMs = Number.isFinite(Number(request.startMs)) ? Math.max(0, Math.trunc(Number(request.startMs))) : undefined
    const endMs = Number.isFinite(Number(request.endMs)) ? Math.max(0, Math.trunc(Number(request.endMs))) : undefined
    if (startMs !== undefined && endMs !== undefined && startMs > endMs) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'startMs 不能大于 endMs。')
    }
    const rows = this._artifacts.listMediaSegments(run.id, { startMs, endMs, limit: limit + 1, offset: cursor.offset })
    const hasTimelineSegments = rows.length > 0 || this._artifacts.listMediaSegments(run.id, { limit: 1, offset: 0 }).length > 0
    if (!hasTimelineSegments) {
      const plain = this._plainTranscript(source, run)
      if (plain) {
        const from = Math.min(cursor.charOffset, plain.text.length)
        const text = plain.text.slice(from, from + maxChars)
        const hasMore = from + text.length < plain.text.length
        return {
          success: true,
          mode: 'transcript',
          mediaId: source.id,
          runId: run.id,
          range: { startMs: startMs ?? null, endMs: endMs ?? null },
          rangeApplied: startMs === undefined && endMs === undefined,
          timelineAvailable: false,
          segments: text ? [{ ...publicPlainText(text), language: plain.language }] : [],
          returnedChars: text.length,
          truncated: hasMore,
          nextCursor: hasMore ? encodeCursor({ offset: 0, charOffset: from + text.length }) : null,
          warnings: startMs !== undefined || endMs !== undefined
            ? ['该转写服务只返回纯文本，无法按时间范围筛选。']
            : [],
        }
      }
    }
    const chapterTitles = this._chapterTitleMap(run.id)
    const segments = []
    let usedChars = 0
    let consumedRows = 0
    let nextCharOffset = cursor.charOffset
    let truncated = false

    for (const row of rows.slice(0, limit)) {
      const fullText = String(row.text || '')
      const from = consumedRows === 0 ? Math.min(cursor.charOffset, fullText.length) : 0
      const remaining = maxChars - usedChars
      if (remaining <= 0) { truncated = true; break }
      const text = fullText.slice(from, from + remaining)
      segments.push(publicSegment(row, chapterTitles.get(row.chapter_id) || null, text))
      usedChars += text.length
      if (from + text.length < fullText.length) {
        nextCharOffset = from + text.length
        truncated = true
        break
      }
      consumedRows += 1
      nextCharOffset = 0
    }

    const hasMore = truncated || rows.length > limit
    const nextCursor = hasMore
      ? encodeCursor({ offset: cursor.offset + consumedRows, charOffset: nextCharOffset })
      : null
    return {
      success: true,
      mode: 'transcript',
      mediaId: source.id,
      runId: run.id,
      range: { startMs: startMs ?? null, endMs: endMs ?? null },
      segments,
      timelineAvailable: true,
      returnedChars: usedChars,
      truncated: hasMore,
      nextCursor,
    }
  }

  search(request = {}, context = {}) {
    const profile = createSearchProfile(request.query)
    if (!profile.normalized) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'search mode 必须提供 query。')
    const { source, run: currentRun } = this._current(request.mediaId, context)
    const run = this._requirePublishedRun(source, currentRun)
    const limit = clampInteger(request.limit, DEFAULT_LIMITS.search, 1, MAX_LIMITS.search)
    const maxChars = clampInteger(request.maxChars, DEFAULT_MAX_CHARS, 200, MAX_MAX_CHARS)
    const contextSegments = clampInteger(request.contextSegments, 0, 0, 6)
    const cursor = decodeCursor(request.cursor)
    const searchKey = `${profile.normalized}|${contextSegments}`
    if (cursor.searchKey && cursor.searchKey !== searchKey) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'search cursor 与当前 query 或 contextSegments 不匹配。')
    }
    const chapterTitles = this._chapterTitleMap(run.id)
    const firstPage = this._artifacts.listMediaSegments(run.id, { limit: 1, offset: 0 })
    if (!firstPage.length) {
      const plain = this._plainTranscript(source, run)
      const match = plain ? scoreSearchText(plain.text, profile) : null
      let text = ''
      if (match) {
        const start = Math.max(0, findSearchAnchor(plain.text, profile) - 360)
        text = plain.text.slice(start, start + Math.min(maxChars, 1600))
      }
      return {
        success: true,
        mode: 'search',
        mediaId: source.id,
        runId: run.id,
        query: request.query,
        searchStrategy: 'hybrid_lexical',
        contextSegments: 0,
        timelineAvailable: false,
        results: match ? [{
          ...publicPlainText(text, 'plain_transcript_match'),
          language: plain.language,
          score: match.score,
          exactMatch: match.exactMatch,
          matchedTerms: match.matchedTerms,
          recommendedTranscriptRange: null,
        }] : [],
        returnedChars: text.length,
        truncated: false,
        nextCursor: null,
        warnings: plain ? ['该转写服务只返回纯文本，搜索结果没有时间戳。'] : [],
      }
    }

    const searchIndex = this._searchIndex(run)
    const rows = searchIndex.rows
    const candidates = []
    for (let index = 0; index < searchIndex.entries.length; index += 1) {
      const match = scoreSearchEntry(searchIndex.entries[index], profile, searchIndex)
      if (match) candidates.push({ ...match, index, row: rows[index] })
    }
    const windows = mergeSearchWindows(candidates, contextSegments, rows.length)
    const results = []
    let returnedChars = 0
    let consumedWindows = 0
    let responseTruncated = false

    for (const window of windows.slice(cursor.offset)) {
      if (results.length >= limit || returnedChars >= maxChars) break
      const contextRows = rows.slice(window.startIndex, window.endIndex + 1)
      if (!contextRows.length) continue
      const remaining = maxChars - returnedChars
      const fullText = contextRows.map(item => String(item.text || '').trim()).filter(Boolean).join('\n')
      if (!fullText) { consumedWindows += 1; continue }
      const text = fullText.slice(0, remaining)
      const first = contextRows[0]
      const last = contextRows[contextRows.length - 1]
      const chapters = [...new Set(contextRows.map(item => chapterTitles.get(item.chapter_id)).filter(Boolean))]
      const matchedTerms = [...new Set(window.matches.flatMap(item => item.matchedTerms || []))]
      const matchSegmentIds = [...new Set(window.matches.map(item => item.row.id))]
      const startMs = Number(first.start_ms) || 0
      const endMs = Number(last.end_ms) || Number(last.start_ms) || startMs
      results.push({
        id: `search_context_${first.id}_${last.id}`,
        type: 'segment',
        startMs,
        endMs,
        text,
        language: [...new Set(contextRows.map(item => item.language).filter(Boolean))].join(', '),
        speaker: null,
        confidence: null,
        chapterTitle: chapters.length === 1 ? chapters[0] : null,
        matchSegmentIds,
        matchedTerms,
        score: window.score,
        exactMatch: window.matches.some(item => item.exactMatch),
        contextSegmentCount: contextRows.length,
        recommendedTranscriptRange: {
          startMs: Math.max(0, startMs - 15000),
          endMs: endMs + 15000,
        },
      })
      returnedChars += text.length
      consumedWindows += 1
      if (text.length < fullText.length) {
        responseTruncated = true
        break
      }
    }
    const nextOffset = cursor.offset + consumedWindows
    const hasMore = nextOffset < windows.length

    return {
      success: true,
      mode: 'search',
      mediaId: source.id,
      runId: run.id,
      query: request.query,
      searchStrategy: 'hybrid_lexical',
      contextSegments,
      timelineAvailable: true,
      results,
      returnedChars,
      matchedWindows: windows.length,
      truncated: responseTruncated || hasMore,
      nextCursor: hasMore ? encodeCursor({ offset: nextOffset, charOffset: 0, searchKey }) : null,
    }
  }

  chapters(request = {}, context = {}) {
    const { source, run: currentRun } = this._current(request.mediaId, context)
    const run = this._requirePublishedRun(source, currentRun)
    const cursor = decodeCursor(request.cursor)
    const limit = clampInteger(request.limit, DEFAULT_LIMITS.chapters, 1, MAX_LIMITS.chapters)
    const all = this._artifacts.listMediaChapters(run.id)
    const selected = all.slice(cursor.offset, cursor.offset + limit)
    const nextOffset = cursor.offset + selected.length
    return {
      success: true,
      mode: 'chapters',
      mediaId: source.id,
      runId: run.id,
      code: all.length ? '' : MEDIA_ERROR_CODES.SOURCE_HAS_NO_CHAPTERS,
      chapters: selected.map(item => ({
        id: item.id,
        startMs: Number(item.start_ms) || 0,
        endMs: Number(item.end_ms) || 0,
        title: item.title || '',
        summary: item.summary || '',
        keywords: Array.isArray(item.keywords) ? item.keywords : [],
        sourceType: item.source_type || '',
      })),
      nextCursor: nextOffset < all.length ? encodeCursor({ offset: nextOffset, charOffset: 0 }) : null,
    }
  }

  frames(request = {}, context = {}) {
    const { source, run: currentRun } = this._current(request.mediaId, context)
    if (source.media_type !== 'video') {
      return { success: true, mode: 'frames', mediaId: source.id, unsupported: true, reason: 'audio_has_no_frames', frames: [], nextCursor: null }
    }
    const run = this._requirePublishedRun(source, currentRun)
    const cursor = decodeCursor(request.cursor)
    const limit = clampInteger(request.limit, DEFAULT_LIMITS.frames, 1, MAX_LIMITS.frames)
    const startMs = Number.isFinite(Number(request.startMs)) ? Math.max(0, Math.trunc(Number(request.startMs))) : null
    const endMs = Number.isFinite(Number(request.endMs)) ? Math.max(0, Math.trunc(Number(request.endMs))) : null
    if (startMs !== null && endMs !== null && startMs > endMs) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'startMs 不能大于 endMs。')
    }
    const rows = this._artifacts.listMediaFrames(run.id, {
      startMs: startMs ?? undefined,
      endMs: endMs ?? undefined,
      limit: limit + 1,
      offset: cursor.offset,
    })
    const selected = rows.slice(0, limit)
    const nextOffset = cursor.offset + selected.length
    return {
      success: true,
      mode: 'frames',
      mediaId: source.id,
      runId: run.id,
      frames: selected.map(item => ({
        id: item.id,
        type: 'frame',
        timestampMs: Number(item.timestamp_ms) || 0,
        path: safeMediaVirtualPath(source.id, item.image_path),
        thumbnailPath: safeMediaVirtualPath(source.id, item.thumbnail_path),
        linkedSegmentIds: Array.isArray(item.linked_segment_ids) ? item.linked_segment_ids : [],
      })),
      nextCursor: rows.length > limit ? encodeCursor({ offset: nextOffset, charOffset: 0 }) : null,
    }
  }

  artifacts(request = {}, context = {}) {
    const { source, run: currentRun } = this._current(request.mediaId, context)
    const run = this._requirePublishedRun(source, currentRun)
    const cursor = decodeCursor(request.cursor)
    const limit = clampInteger(request.limit, DEFAULT_LIMITS.artifacts, 1, MAX_LIMITS.artifacts)
    const all = this._artifacts.listMediaArtifacts(run.id)
    const selected = all.slice(cursor.offset, cursor.offset + limit)
    const nextOffset = cursor.offset + selected.length
    return {
      success: true,
      mode: 'artifacts',
      mediaId: source.id,
      run: publicRun(run),
      warnings: Array.isArray(run.warnings) ? run.warnings.map(sanitizeDiagnosticText) : [],
      artifacts: selected.map(publicArtifact),
      nextCursor: nextOffset < all.length ? encodeCursor({ offset: nextOffset, charOffset: 0 }) : null,
    }
  }

  exportTranscript(mediaId, { format = 'txt', runId = '' } = {}, context = {}) {
    const normalizedFormat = String(format || 'txt').trim().toLowerCase()
    if (!['txt', 'json', 'srt', 'vtt'].includes(normalizedFormat)) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, `不支持的转录导出格式：${normalizedFormat}`)
    }
    const { source, run } = this._exportRun(mediaId, runId, context)
    const rows = this._allSegments(run.id)
    const segments = rows.map(row => ({
      id: row.id,
      startMs: Number(row.start_ms) || 0,
      endMs: Number(row.end_ms) || 0,
      text: String(row.text || ''),
      language: row.language || '',
      speaker: row.speaker || null,
      confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    }))
    const plain = segments.length ? null : this._plainTranscript(source, run)
    const text = segments.length ? segments.map(item => item.text).filter(Boolean).join('\n') : String(plain?.text || '').trim()
    if (!text) throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_NOT_FOUND, '所选解析版本没有可导出的转录文本。')
    if ((normalizedFormat === 'srt' || normalizedFormat === 'vtt') && !segments.length) {
      throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_INVALID, '该转录没有时间戳，只能导出 TXT 或 JSON。')
    }
    let content = text
    let mimeType = 'text/plain; charset=utf-8'
    if (normalizedFormat === 'json') {
      content = JSON.stringify({
        schemaVersion: 1,
        mediaId: source.id,
        runId: run.id,
        title: sanitizeDiagnosticText(source.title || source.file_name || ''),
        language: plain?.language || segments[0]?.language || '',
        timelineAvailable: segments.length > 0,
        text,
        segments,
      }, null, 2)
      mimeType = 'application/json; charset=utf-8'
    } else if (normalizedFormat === 'srt') {
      content = this._subtitles.toSrt(segments)
      mimeType = 'application/x-subrip; charset=utf-8'
    } else if (normalizedFormat === 'vtt') {
      content = this._subtitles.toVtt(segments)
      mimeType = 'text/vtt; charset=utf-8'
    }
    return {
      success: true,
      mediaId: source.id,
      runId: run.id,
      format: normalizedFormat,
      mimeType,
      fileName: `${safeExportName(source.title || source.file_name)}.${normalizedFormat}`,
      timelineAvailable: segments.length > 0,
      content,
    }
  }

  history(mediaId, { limit = 50 } = {}, context = {}) {
    const id = this._assertAuthorized(mediaId, context)
    const source = this._media.getMediaSource(id)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    return {
      success: true,
      mediaId: id,
      currentRunId: source.current_run_id || '',
      runs: this._runs.listMediaRuns(id, { limit: clampInteger(limit, 50, 1, 200) }).map(publicRun),
    }
  }
}

export { QUERY_MODES, encodeCursor, decodeCursor, normalizeSearchText }
