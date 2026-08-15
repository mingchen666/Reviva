import fs from 'node:fs'
import path from 'node:path'
import {
  canonicalSourceRef,
  decodeCursor,
  encodeCursor,
  normalizePageLimit,
  sourceRefKey,
  validateWikiRelativePath,
} from './LearningTypes.js'

const READY_DOCUMENT_STATUSES = new Set(['ready', 'completed', 'succeeded'])
const WEB_READY_STATUSES = new Set(['succeeded', 'partial'])
const MEDIA_READY_STATUSES = new Set(['ready', 'partial'])
const READABLE_DOCUMENT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.html', '.htm', '.json', '.jsonl', '.csv', '.tsv', '.xml', '.yaml', '.yml', '.pdf', '.docx', '.xlsx', '.pptx'])

function inside(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
}

function safeDate(value) {
  const text = String(value || '')
  return Number.isFinite(Date.parse(text)) ? text : ''
}

function textSourceType(fileName, rawType) {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  if (ext === '.pdf' || String(rawType || '').toLowerCase() === 'pdf') return 'pdf'
  if (['.md', '.markdown', '.txt', '.html', '.htm'].includes(ext)) return 'document'
  return 'document'
}

function publicItem(item) {
  return {
    ref: item.ref,
    title: item.title,
    sourceType: item.sourceType,
    ...(item.container ? { container: item.container } : {}),
    status: item.status,
    progress: item.progress ?? null,
    capabilities: item.capabilities,
    updatedAt: item.updatedAt,
  }
}

function sourceSort(a, b) {
  const date = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  if (date) return date
  const title = String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
  if (title) return title
  return sourceRefKey(a.ref).localeCompare(sourceRefKey(b.ref))
}

function mediaStatus(source, runs, artifacts) {
  const current = source.current_run_id ? runs.get(source.current_run_id) : null
  const historical = [...runs.values()].find(run => MEDIA_READY_STATUSES.has(String(run?.status || '').toLowerCase()) && hasReadableMediaArtifacts(artifacts.get(run.id)))
  const selected = current || historical
  if (selected && MEDIA_READY_STATUSES.has(String(selected.status || '').toLowerCase()) && hasReadableMediaArtifacts(artifacts.get(selected.id))) return 'ready'
  const state = String(current?.status || '').toLowerCase()
  if (state === 'queued') return 'queued'
  if (state === 'running') return 'processing'
  if (['failed', 'cancelled', 'canceled'].includes(state)) return historical ? 'ready' : 'failed'
  return 'unavailable'
}

function hasReadableMediaArtifacts(artifacts = []) {
  return artifacts.some(item => ['transcript', 'segments'].includes(String(item?.type || '').toLowerCase()) && ['ready', 'partial'].includes(String(item?.status || '').toLowerCase()))
}

export class LearningSourceCatalog {
  constructor({ dbService = null, wikiService = null, workDirService = null, mediaModule = null } = {}) {
    this._db = dbService
    this._wiki = wikiService
    this._workDir = workDirService
    this._media = mediaModule
  }

  async list({ cursor = '', limit, type = '' } = {}) {
    const offset = decodeCursor(cursor)
    const pageLimit = normalizePageLimit(limit)
    const filter = String(type || '').trim().toLowerCase()
    const all = await this._descriptors()
    const filtered = filter ? all.filter(item => item.sourceType === filter || item.ref.type === filter) : all
    const data = filtered.slice(offset, offset + pageLimit).map(publicItem)
    const nextOffset = offset + data.length
    return {
      data,
      meta: {
        nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
        total: filtered.length,
        hasMore: nextOffset < filtered.length,
      },
    }
  }

  async resolve(ref) {
    const key = sourceRefKey(ref)
    const found = (await this._descriptors()).find(item => sourceRefKey(item.ref) === key)
    return found || null
  }

  async resolveMany(refs) {
    const descriptors = await this._descriptors()
    const byKey = new Map(descriptors.map(item => [sourceRefKey(item.ref), item]))
    return refs.map(ref => byKey.get(sourceRefKey(ref)) || null)
  }

  async _descriptors() {
    const [documents, webImports, media, wikiPages] = await Promise.all([
      this._documents(), this._webImports(), this._mediaSources(), this._wikiPages(),
    ])
    return [...documents, ...webImports, ...media, ...wikiPages].sort(sourceSort)
  }

  _documents() {
    const docs = this._db?.listLearningDocuments?.() || []
    return docs.map(doc => {
      const filePath = String(doc.file_path || '')
      const exists = !!filePath && fs.existsSync(filePath)
      const readable = READABLE_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
      const rawStatus = String(doc.status || '').toLowerCase()
      const status = READY_DOCUMENT_STATUSES.has(rawStatus) && exists && readable
        ? 'ready'
        : (rawStatus === 'failed' ? 'failed' : (['queued', 'pending'].includes(rawStatus) ? 'queued' : (['processing', 'running'].includes(rawStatus) ? 'processing' : 'unavailable')))
      const ref = canonicalSourceRef({ type: 'document', id: doc.id })
      return {
        ref,
        title: String(doc.name || '未命名文档'),
        sourceType: textSourceType(doc.name, doc.type),
        container: { type: 'space', id: String(doc.space_id || ''), name: String(doc.space_name || '') },
        status,
        progress: Number.isFinite(Number(doc.progress)) ? Number(doc.progress) : null,
        capabilities: status === 'ready' ? ['read', 'cite'] : [],
        updatedAt: safeDate(doc.updated_at || doc.created_at),
        internal: { kind: 'document', filePath, document: doc },
      }
    })
  }

  _webImports() {
    const docsRoot = this._workDir?.getDocsPath?.() || ''
    const jobs = this._db?.listLearningDocsWebImportJobs?.() || []
    return jobs.map(job => {
      const markdown = (job.result_paths || []).find(item => /\.md$/i.test(String(item || '')))
      const candidate = markdown && docsRoot ? path.resolve(docsRoot, String(markdown)) : ''
      const exists = !!candidate && inside(docsRoot, candidate) && fs.existsSync(candidate)
      const state = String(job.status || '').toLowerCase()
      const status = WEB_READY_STATUSES.has(state) && exists ? 'ready' : (state === 'failed' || state === 'interrupted' ? 'failed' : (state === 'running' ? 'processing' : 'unavailable'))
      const ref = canonicalSourceRef({ type: 'document', id: job.id })
      return {
        ref,
        title: String(job.title || job.file_name || '网页导入资料'),
        sourceType: 'web',
        container: { type: 'docs', id: 'docs', name: 'Docs' },
        status,
        progress: Number.isFinite(Number(job.progress)) ? Number(job.progress) : null,
        capabilities: status === 'ready' ? ['read', 'cite'] : [],
        updatedAt: safeDate(job.updated_at || job.completed_at || job.created_at),
        internal: { kind: 'web', filePath: candidate, job },
      }
    })
  }

  _mediaSources() {
    const mediaRepository = this._db?.mediaRepositories?.media
    const runRepository = this._db?.mediaRepositories?.runs
    const artifactRepository = this._db?.mediaRepositories?.artifacts
    if (!mediaRepository?.listMediaSources) return []
    return mediaRepository.listMediaSources({ limit: 5000 }).map(source => {
      const runs = new Map((runRepository?.listMediaRuns?.(source.id, { limit: 50 }) || []).map(run => [run.id, run]))
      const artifacts = new Map([...runs.keys()].map(runId => [runId, artifactRepository?.listMediaArtifacts?.(runId) || []]))
      const status = mediaStatus(source, runs, artifacts)
      const type = String(source.media_type || '').toLowerCase()
      return {
        ref: canonicalSourceRef({ type: 'media', id: source.id }),
        title: String(source.title || source.file_name || '媒体资料'),
        sourceType: type === 'audio' || type === 'video' ? type : 'media',
        container: { type: 'media', id: 'media', name: '媒体' },
        status,
        progress: null,
        capabilities: status === 'ready' ? ['transcript', 'cite'] : [],
        updatedAt: safeDate(source.updated_at || source.created_at),
        internal: { kind: 'media', source, runs, artifacts },
      }
    })
  }

  async _wikiPages() {
    if (!this._wiki?.listWikis || !this._wiki?.listPages) return []
    const listed = await this._wiki.listWikis()
    if (!listed?.success) return []
    const groups = await Promise.all((listed.data || []).map(async wiki => {
      const pages = await this._wiki.listPages(wiki.id)
      if (!pages?.success) return []
      return (pages.data || []).flatMap(page => {
        try {
          const safePath = validateWikiRelativePath(page.path)
          return [{
            ref: canonicalSourceRef({ type: 'wiki_page', wikiId: wiki.id, path: safePath }),
            title: String(page.title || path.basename(safePath, path.extname(safePath))),
            sourceType: 'wiki_page',
            container: { type: 'wiki', id: String(wiki.id || ''), name: String(wiki.name || 'Wiki') },
            status: 'ready',
            progress: null,
            capabilities: ['read', 'cite'],
            updatedAt: safeDate(page.updated_at || wiki.updated_at || wiki.created_at),
            internal: { kind: 'wiki_page', wikiId: String(wiki.id || ''), path: safePath },
          }]
        } catch { return [] }
      })
    }))
    return groups.flat()
  }
}
