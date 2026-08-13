import fs from 'node:fs'
import path from 'node:path'
import { documentRead, resetTaskCounters, setDbService, setWorkDirService } from '../agents/langchainTools.js'
import { stableEvidenceKey } from './EvidenceBudget.js'

export const TEXT_CONTEXT_EXTS = new Set([
  'md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'yaml', 'yml', 'log',
  'html', 'htm', 'xml', 'js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp',
  'h', 'sql',
])
export const OFFICE_CONTEXT_EXTS = new Set(['docx', 'xlsx', 'pptx'])
export const PDF_CONTEXT_EXTS = new Set(['pdf'])
export const AUDIO_CONTEXT_EXTS = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'])
export const VIDEO_CONTEXT_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v'])
export const MEDIA_CONTEXT_EXTS = new Set([...AUDIO_CONTEXT_EXTS, ...VIDEO_CONTEXT_EXTS])
export const MAX_LOCAL_FOLLOW_UP_READS = 4

function isMediaReference(filePath) {
  return String(filePath || '').toLowerCase().endsWith('.media.md')
}

export function isMediaContextItem(item) {
  const candidate = item?.path || item?.name || ''
  return MEDIA_CONTEXT_EXTS.has(fileExt(candidate)) || isMediaReference(candidate)
}

export function isReadableLocalContextItem(item) {
  if (!item?.path || item.isDirectory || item.type === 'folder' || item.type === 'local_folder') return false
  const ext = fileExt(item.path || item.name)
  return TEXT_CONTEXT_EXTS.has(ext) || OFFICE_CONTEXT_EXTS.has(ext) || PDF_CONTEXT_EXTS.has(ext) || isMediaContextItem(item)
}

function fileExt(filePath) {
  return String(filePath || '').split('.').pop().toLowerCase()
}

function sourceKind(filePath) {
  const ext = fileExt(filePath)
  if (PDF_CONTEXT_EXTS.has(ext)) return 'pdf'
  if (OFFICE_CONTEXT_EXTS.has(ext)) return 'office'
  if (MEDIA_CONTEXT_EXTS.has(ext) || isMediaReference(filePath)) return 'media'
  if (TEXT_CONTEXT_EXTS.has(ext)) return 'text'
  return 'unknown'
}

function normalizeNext(next) {
  if (!next || typeof next !== 'object' || Array.isArray(next)) return null
  const normalized = { ...next }
  delete normalized.tool
  delete normalized.path
  return Object.keys(normalized).length ? normalized : null
}

function readRangeKey(range) {
  return `range:${stableEvidenceKey(range)}`
}

function compactOverview(value, maxChars = 900) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

function rangeForRead(kind, request = {}) {
  if (kind === 'pdf') {
    return {
      mode: request.mode || 'text',
      startPage: Number(request.startPage) || 1,
      maxPages: Number(request.maxPages) || 1,
    }
  }
  if (kind === 'office') {
    return {
      mode: request.mode || 'text',
      start: Number(request.start ?? request.startPage) || 1,
      maxLines: Number(request.maxLines) || 100,
    }
  }
  return {
    mode: 'text',
    startByte: Number(request.startByte) || 0,
    maxBytes: Number(request.maxBytes) || 0,
  }
}

export class FileContextReader {
  constructor({ db, workDirService, getMediaQueryService = null }) {
    this._db = db
    this._workDir = workDirService
    this._getMediaQueryService = typeof getMediaQueryService === 'function' ? getMediaQueryService : () => null
    setDbService(db)
    setWorkDirService(workDirService)
  }

  async read(ctxItems, { topic = '' } = {}) {
    const blocks = []
    const warnings = []
    if (!Array.isArray(ctxItems) || !ctxItems.length) return { blocks, warnings }
    resetTaskCounters()
    // Keep the selected-source catalog complete enough for a fair context pack.
    // The final prompt still has a token budget, but a hard cap of ten here
    // meant later user-selected documents were silently invisible.
    const MAX_FILES = 20
    const MAX_BYTES = 12 * 1024
    const candidates = this._collectCtxFilePaths(ctxItems, MAX_FILES)

    const localSources = []
    for (const [index, item] of candidates.entries()) {
      const ext = fileExt(item.path)
      const kind = sourceKind(item.path)
      const source = {
        sourceId: `local_${String(index + 1).padStart(2, '0')}`,
        name: item.name || path.basename(item.path),
        path: item.path,
        kind,
        overview: '',
        next: null,
        readCount: 0,
        followUpReadCount: 0,
        readRanges: [],
        readKeys: [],
        exhausted: false,
      }
      let readResult = null
      try {
        if (isMediaContextItem(item)) {
          const media = await this._readMediaFile(item, { topic, maxChars: MAX_BYTES })
          readResult = {
            content: media.content,
            sourceType: 'media',
            mediaId: media.mediaId || '',
            warning: media.warning,
            exhausted: true,
          }
          if (media.warning) warnings.push({ name: item.name || path.basename(item.path), message: media.warning })
        } else if (TEXT_CONTEXT_EXTS.has(ext)) {
          readResult = this._readTextFile(item.path, MAX_BYTES)
        } else if (OFFICE_CONTEXT_EXTS.has(ext)) {
          readResult = await this._readOfficeFile(item.path, MAX_BYTES)
        } else if (PDF_CONTEXT_EXTS.has(ext)) {
          readResult = await this._readPdfFile(item.path, MAX_BYTES)
        }
      } catch (error) {
        // Skip unreadable files; the task can still use other selected context.
        warnings.push({ name: source.name, message: error?.message || '本地资料读取失败' })
      }
      if (readResult) {
        source.overview = compactOverview(readResult.overview || readResult.content)
        source.next = normalizeNext(readResult.next)
        source.exhausted = readResult.exhausted === true || !source.next
        if (readResult.content) {
          source.readCount = 1
          if (readResult.range) source.readRanges.push(readResult.range)
          if (readResult.range) source.readKeys.push(readRangeKey(readResult.range))
          blocks.push({
            name: source.name,
            content: readResult.content,
            sourceId: source.sourceId,
            sourceType: readResult.sourceType || kind,
            mediaId: readResult.mediaId || '',
            range: readResult.range || null,
          })
        }
      }
      localSources.push(source)
    }
    return { blocks, warnings, localSources }
  }

  catalog(localSources = []) {
    return (Array.isArray(localSources) ? localSources : []).map(source => ({
      sourceId: source.sourceId,
      name: source.name,
      kind: source.kind,
      overview: compactOverview(source.overview),
      next: source.next ? { ...source.next } : null,
      readCount: source.readCount || 0,
      followUpReadCount: source.followUpReadCount || 0,
      readRanges: Array.isArray(source.readRanges) ? source.readRanges.slice(-4) : [],
      readKeys: Array.isArray(source.readKeys) ? source.readKeys.slice(-8) : [],
      maxFollowUpReads: MAX_LOCAL_FOLLOW_UP_READS,
      exhausted: source.exhausted === true || !source.next,
    }))
  }

  async readFollowUp(source, { abortSignal } = {}) {
    if (!source || source.exhausted || !source.next || abortSignal?.aborted) {
      return { success: false, skipped: true, reason: '没有可继续读取的本地资料区段' }
    }
    if ((source.followUpReadCount || 0) >= MAX_LOCAL_FOLLOW_UP_READS) {
      source.exhausted = true
      return { success: false, skipped: true, reason: `单个本地资料最多连续深读 ${MAX_LOCAL_FOLLOW_UP_READS} 次` }
    }
    const cursor = { ...source.next }
    const requestedRangeKey = readRangeKey(rangeForRead(source.kind, cursor))
    if (Array.isArray(source.readKeys) && source.readKeys.includes(requestedRangeKey)) {
      source.exhausted = true
      return { success: false, skipped: true, reason: '该本地资料区段已经读取过' }
    }
    try {
      let result
      if (source.kind === 'text') {
        result = this._readTextFile(source.path, cursor.maxBytes || 12 * 1024, { startByte: cursor.startByte || 0 })
      } else if (source.kind === 'office' || source.kind === 'pdf') {
        result = await this._invokeDocumentRead({ path: source.path, ...cursor })
        if (!result?.success) {
          source.exhausted = true
          return { success: false, warning: result?.content || result?.message || 'document_read 读取失败', result }
        }
        result = {
          content: result.content || '',
          next: result.next,
          range: rangeForRead(source.kind, cursor),
          sourceType: source.kind,
        }
      } else {
        source.exhausted = true
        return { success: false, skipped: true, reason: '该本地资料类型不支持续读' }
      }

      const content = String(result?.content || '').trim()
      const next = normalizeNext(result?.next)
      source.next = next
      source.readCount = (source.readCount || 0) + 1
      source.followUpReadCount = (source.followUpReadCount || 0) + 1
      source.exhausted = !next || source.followUpReadCount >= MAX_LOCAL_FOLLOW_UP_READS
      if (result?.range) source.readRanges = [...(source.readRanges || []), result.range].slice(-8)
      source.readKeys = [
        ...(source.readKeys || []),
        requestedRangeKey,
        result?.range ? readRangeKey(result.range) : '',
      ].filter(Boolean).slice(-16)
      if (!content) return { success: false, warning: '本次续读没有返回可用内容', next, range: result?.range || null }
      return {
        success: true,
        block: {
          name: source.name,
          content,
          sourceId: source.sourceId,
          sourceType: result.sourceType || source.kind,
          range: result.range || null,
          isFollowUp: true,
        },
        next,
        range: result.range || null,
      }
    } catch (error) {
      source.exhausted = true
      return { success: false, warning: error?.message || '本地资料续读失败' }
    }
  }

  _mediaIdFromItem(item) {
    const direct = String(item?.mediaId || item?.media_id || item?.meta?.mediaId || item?.metadata?.mediaId || '').trim()
    if (direct) return direct

    try {
      const mediaRepository = this._db?.mediaRepositories?.media
      const link = mediaRepository?.findActiveMediaSourceLink?.({
        ownerType: 'docs_file',
        ownerLocator: item?.path,
      })
      if (link?.media_id) return String(link.media_id)
    } catch (_) {}

    if (!isMediaReference(item?.path)) return ''
    try {
      const reference = fs.readFileSync(item.path, 'utf8').slice(0, 4096)
      return reference.match(/^mediaId:\s*([a-z0-9_]+)\s*$/im)?.[1] || ''
    } catch {
      return ''
    }
  }

  async _mediaQuery(request, mediaId) {
    const service = this._getMediaQueryService?.()
    if (!service?.query) throw new Error('媒体读取服务未就绪')
    return await service.query({ ...request, mediaId }, { allowedMediaIds: [mediaId] })
  }

  _formatMediaTime(value) {
    const totalSeconds = Math.max(0, Math.floor(Number(value || 0) / 1000))
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0')
    const hours = Math.floor(totalSeconds / 3600)
    return hours ? `${String(hours).padStart(2, '0')}:${minutes}:${seconds}` : `${minutes}:${seconds}`
  }

  _formatMediaChapters(chapters = []) {
    return chapters
      .map(chapter => {
        const range = `${this._formatMediaTime(chapter.startMs)}–${this._formatMediaTime(chapter.endMs)}`
        const title = String(chapter.title || '未命名章节').trim()
        const summary = String(chapter.summary || '').trim()
        const keywords = Array.isArray(chapter.keywords) && chapter.keywords.length ? `（${chapter.keywords.join('、')}）` : ''
        return `- [${range}] ${title}${keywords}${summary ? `：${summary}` : ''}`
      })
      .join('\n')
  }

  _formatMediaSegments(segments = []) {
    return segments
      .map(segment => {
        const hasTimeline = Number.isFinite(Number(segment.startMs)) && Number.isFinite(Number(segment.endMs))
        const range = hasTimeline ? `[${this._formatMediaTime(segment.startMs)}–${this._formatMediaTime(segment.endMs)}] ` : ''
        return `${range}${String(segment.text || '').trim()}`.trim()
      })
      .filter(Boolean)
      .join('\n')
  }

  async _readMediaFile(item, { topic, maxChars }) {
    const mediaId = this._mediaIdFromItem(item)
    if (!mediaId) {
      return { warning: '未找到已登记的媒体来源；请先在文档模块打开媒体详情并完成解析。' }
    }

    let metadata
    try {
      metadata = await this._mediaQuery({ mode: 'metadata' }, mediaId)
    } catch (error) {
      return { mediaId, warning: error?.message || '无法读取媒体解析状态。' }
    }

    const availableModes = new Set(metadata?.availableModes || [])
    if (!availableModes.has('chapters') && !availableModes.has('transcript') && !availableModes.has('search')) {
      const progress = metadata?.activeRun?.status === 'running' || metadata?.activeRun?.status === 'queued'
        ? '媒体仍在解析中'
        : '媒体尚未完成解析'
      return { mediaId, warning: `${progress}；本次生成不会读取其二进制内容。` }
    }

    const media = metadata?.media || {}
    const parts = [
      `[媒体资料] ${media.title || item.name || path.basename(item.path)}`,
      `类型：${media.mediaType || '媒体'}${media.durationMs ? `；时长：${this._formatMediaTime(media.durationMs)}` : ''}`,
    ]

    if (availableModes.has('chapters')) {
      try {
        const chapters = await this._mediaQuery({ mode: 'chapters', limit: 12 }, mediaId)
        const content = this._formatMediaChapters(chapters?.chapters)
        if (content) parts.push(`章节摘要：\n${content}`)
      } catch (_) {}
    }

    let segmentContent = ''
    if (topic && availableModes.has('search')) {
      try {
        const search = await this._mediaQuery({
          mode: 'search',
          query: String(topic).slice(0, 180),
          limit: 4,
          maxChars: Math.min(7000, maxChars),
          contextSegments: 2,
        }, mediaId)
        segmentContent = this._formatMediaSegments(search?.results)
      } catch (_) {}
    }

    if (!segmentContent && availableModes.has('transcript')) {
      try {
        const transcript = await this._mediaQuery({
          mode: 'transcript',
          limit: 80,
          maxChars: Math.min(9000, maxChars),
        }, mediaId)
        segmentContent = this._formatMediaSegments(transcript?.segments)
        if (segmentContent && transcript?.truncated) segmentContent += '\n...(媒体转录仅摘取局部内容；不可据此声称已完整观看或收听)'
      } catch (_) {}
    }

    if (segmentContent) parts.push(`转录证据：\n${segmentContent}`)
    if (parts.length <= 2) return { mediaId, warning: '媒体已有解析任务，但没有可用于本次生成的章节或转录内容。' }
    const content = parts.join('\n\n')
    return {
      mediaId,
      content: content.length > maxChars
        ? `${content.slice(0, maxChars)}\n...(为控制上下文长度，媒体证据已截断)`
        : content,
    }
  }

  _readTextFile(filePath, maxBytes, { startByte = 0 } = {}) {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return ''
    const buf = fs.readFileSync(filePath)
    let start = Math.max(0, Math.trunc(Number(startByte) || 0))
    if (start > 0 && start < buf.length) {
      const newline = buf.indexOf(0x0a, start)
      start = newline >= 0 ? newline + 1 : buf.length
    }
    const end = Math.min(buf.length, start + Math.max(1000, maxBytes))
    const content = buf.slice(start, end).toString('utf-8')
    const truncated = end < buf.length ? '\n...(截断)' : ''
    return {
      content: content + truncated,
      next: end < buf.length ? { kind: 'text', startByte: end, maxBytes: Math.max(1000, maxBytes) } : null,
      range: rangeForRead('text', { startByte: start, maxBytes: end - start }),
      sourceType: 'text',
    }
  }

  async _readOfficeFile(filePath, maxBytes) {
    const parts = []
    const overview = await this._invokeDocumentRead({
      path: filePath,
      mode: 'overview',
      maxChars: maxBytes,
    })
    if (overview?.content) parts.push(overview.content)

    const text = await this._invokeDocumentRead({
      path: filePath,
      mode: 'text',
      start: 1,
      maxLines: 120,
      maxChars: maxBytes,
    })
    if (text?.content && text.content !== overview?.content) parts.push(text.content)

    return {
      content: parts.join('\n\n').slice(0, maxBytes * 2),
      overview: overview?.content || '',
      next: text?.next || overview?.next || null,
      range: rangeForRead('office', { mode: 'text', start: 1, maxLines: 120 }),
      sourceType: 'office',
    }
  }

  async _invokeDocumentRead(input) {
    const raw = await documentRead.invoke(input)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed?.success ? parsed : null
  }

  async _readPdfFile(filePath, maxBytes) {
    const parts = []
    const overview = await this._invokeDocumentRead({
      path: filePath,
      mode: 'overview',
      maxChars: maxBytes,
      maxPages: 3,
    })
    if (overview?.content) parts.push(overview.content)

    const text = await this._invokeDocumentRead({
      path: filePath,
      mode: 'text',
      startPage: 1,
      maxPages: 5,
      maxChars: maxBytes,
    })
    if (text?.content && text.content !== overview?.content) parts.push(text.content)

    return {
      content: parts.join('\n\n').slice(0, maxBytes * 2),
      overview: overview?.content || '',
      next: text?.next || overview?.next || null,
      range: rangeForRead('pdf', { mode: 'text', startPage: 1, maxPages: 5 }),
      sourceType: 'pdf',
    }
  }

  _collectCtxFilePaths(ctxItems, limit) {
    const files = []
    const seen = new Set()
    for (const item of ctxItems || []) {
      if (files.length >= limit || !isReadableLocalContextItem(item)) continue
      const p = this._safeCtxPath(item.path)
      if (!p || seen.has(p)) continue
      try {
        const stat = fs.statSync(p)
        if (!stat.isFile()) continue
      } catch (_) {
        continue
      }
      seen.add(p)
      files.push({ ...item, path: p, name: item.name || path.basename(p) })
    }
    return files
  }

  _safeCtxPath(inputPath) {
    if (!inputPath) return ''
    try {
      if (this._workDir?.resolveAndValidate) return this._workDir.resolveAndValidate(inputPath, 'any')
    } catch (_) {
      try { return fs.existsSync(inputPath) ? path.resolve(inputPath) : '' } catch (_) { return '' }
    }
    return inputPath
  }
}
