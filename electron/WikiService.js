import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { WikiAgentService } from './wiki/WikiAgentService.js'
import { normalizeAssetRecord } from './wiki/WikiAssetRegistry.js'
import { WikiDocumentParser, detectSourceType } from './wiki/WikiDocumentParser.js'
import { WikiOcrService } from './wiki/WikiOcrService.js'

const REGISTRY_FILE = 'registry.json'
const LEGACY_WIKI_ROOT = 'wiki'
const LEGACY_NESTED_WIKIS_DIR = 'wikis'
const MODEL_REF_SEPARATOR = '::'

function nowIso() {
  return new Date().toISOString()
}

function safeSegment(value, fallback = '') {
  const raw = String(value || '').trim().toLowerCase()
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return ascii || fallback
}

function safeTitle(value) {
  return String(value || '').trim().slice(0, 120)
}

function parseModelRef(ref) {
  const value = String(ref || '')
  const idx = value.indexOf(MODEL_REF_SEPARATOR)
  if (idx <= 0) return { providerId: '', modelId: value, scoped: false }
  return {
    providerId: value.slice(0, idx),
    modelId: value.slice(idx + MODEL_REF_SEPARATOR.length),
    scoped: true,
  }
}

function hasModelRunConfig(req = {}) {
  return !!(req.providerId && req.apiKey && req.model)
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function readJsonSync(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function isPathInside(parent, child) {
  const parentPath = path.resolve(parent).toLowerCase()
  const childPath = path.resolve(child).toLowerCase()
  return childPath === parentPath || childPath.startsWith(parentPath + path.sep)
}

export class WikiService {
  constructor(workDirService, dbService = null, agentService = null) {
    this._workDir = workDirService
    this._db = dbService
    this._wikiAgent = new WikiAgentService({
      workDirService,
      wikiService: this,
      agentService,
    })
    this._ocrService = new WikiOcrService({ dbService })
    this._parseQueue = []
    this._parseQueueRunning = false
    this._ocrQueue = []
    this._ocrQueueRunning = false
    this._agentQueue = []
    this._agentQueueRunning = false
  }

  init() {
    ipcMain.handle('wiki:list', () => this.listWikis())
    ipcMain.handle('wiki:get', (_, id) => this.getWiki(id))
    ipcMain.handle('wiki:create', (_, data) => this.createWiki(data))
    ipcMain.handle('wiki:delete', (_, id) => this.deleteWiki(id))
    ipcMain.handle('wiki:listPages', (_, id) => this.listPages(id))
    ipcMain.handle('wiki:readPage', (_, id, pagePath) => this.readPage(id, pagePath))
    ipcMain.handle('wiki:listSources', (_, id) => this.listSources(id))
    ipcMain.handle('wiki:addSource', (_, id, data) => this.addSource(id, data))
    ipcMain.handle('wiki:addNoteSource', (_, id, noteId) => this.addNoteSource(id, noteId))
    ipcMain.handle('wiki:reparseSource', (_, id, sourceId) => this.reparseSource(id, sourceId))
    ipcMain.handle('wiki:deleteSource', (_, id, sourceId) => this.deleteSource(id, sourceId))
    ipcMain.handle('wiki:listOcrProviders', () => this.listOcrProviders())
    ipcMain.handle('wiki:createOcrProvider', (_, data) => this.createOcrProvider(data))
    ipcMain.handle('wiki:updateOcrProvider', (_, providerId, data) => this.updateOcrProvider(providerId, data))
    ipcMain.handle('wiki:deleteOcrProvider', (_, providerId) => this.deleteOcrProvider(providerId))
    ipcMain.handle('wiki:listOcrJobs', (_, id, sourceId) => this.listOcrJobs(id, sourceId))
    ipcMain.handle('wiki:runOcr', (_, id, sourceId, providerId) => this.runOcr(id, sourceId, providerId))
    ipcMain.handle('wiki:getJobs', (_, id) => this.getJobs(id))
    ipcMain.handle('wiki:updateAgentConfig', (_, id, patch) => this.updateAgentConfig(id, patch))
    ipcMain.handle('wiki:agentDraft', (_, req) => this.agentDraft(req))
    ipcMain.handle('wiki:agentRun', (_, req) => this.agentRun(req))
    ipcMain.handle('wiki:tool', (_, req) => this.wikiTool(req))
    setTimeout(() => this.restorePendingOcrJobs().catch(err => {
      console.warn('[WikiService] Failed to restore OCR queue:', err.message)
    }), 0)
    setTimeout(() => this.restorePendingParseJobs().catch(err => {
      console.warn('[WikiService] Failed to restore parse queue:', err.message)
    }), 0)
  }

  _rootPath() {
    const root = this._workDir?.getWikiPath?.()
    if (!root) throw new Error('Workspace is not initialized')
    return this._workDir.resolveAndValidate(root, 'wiki')
  }

  _registryPath() {
    return path.join(this._rootPath(), REGISTRY_FILE)
  }

  _legacyRootPath() {
    const workspaceRoot = this._workDir?.getRootPath?.()
    if (!workspaceRoot) return null
    return this._workDir.resolveAndValidate(path.join(workspaceRoot, LEGACY_WIKI_ROOT), 'wiki')
  }

  _legacyRegistryPath() {
    const legacyRoot = this._legacyRootPath()
    return legacyRoot ? path.join(legacyRoot, REGISTRY_FILE) : null
  }

  async _loadWikiMetaIfExists(id) {
    const metaPath = path.join(this._wikiDir(id), 'wiki.json')
    if (!fs.existsSync(metaPath)) return null
    return readJson(metaPath, null)
  }

  async _removeWikiFromRegistryFile(registryPath, id) {
    if (!registryPath || !fs.existsSync(registryPath)) return
    const registry = await readJson(registryPath, { version: 1, wikis: [] })
    const before = Array.isArray(registry.wikis) ? registry.wikis.length : 0
    registry.wikis = (registry.wikis || []).filter(item => item?.id !== id)
    if (registry.wikis.length !== before) await writeJson(registryPath, registry)
  }

  _wikiDir(id) {
    const safeId = safeSegment(id)
    const directPath = path.join(this._rootPath(), safeId)
    const legacyRoot = this._legacyRootPath()
    const legacyDirectPath = legacyRoot ? path.join(legacyRoot, safeId) : ''
    const legacyNestedPath = legacyRoot ? path.join(legacyRoot, LEGACY_NESTED_WIKIS_DIR, safeId) : ''
    let target = directPath
    if (!fs.existsSync(directPath)) {
      if (legacyDirectPath && fs.existsSync(legacyDirectPath)) target = legacyDirectPath
      else if (legacyNestedPath && fs.existsSync(legacyNestedPath)) target = legacyNestedPath
    }
    return this._workDir.resolveAndValidate(target, 'wiki')
  }

  getWikiVirtualPath(id) {
    const workspaceRoot = this._workDir?.getRootPath?.()
    if (!workspaceRoot) return `/wikis/${safeSegment(id)}`
    const rel = path.relative(workspaceRoot, this._wikiDir(id)).replace(/\\/g, '/')
    return '/' + rel.replace(/^\/+/, '')
  }

  async _ensureRoot() {
    const root = this._rootPath()
    await fs.promises.mkdir(root, { recursive: true })
    const registryPath = this._registryPath()
    if (!fs.existsSync(registryPath)) {
      await writeJson(registryPath, { version: 1, wikis: [] })
    }
  }

  async _loadRegistry() {
    await this._ensureRoot()
    const registry = await readJson(this._registryPath(), { version: 1, wikis: [] })
    if (!Array.isArray(registry.wikis)) registry.wikis = []
    const legacyRegistryPath = this._legacyRegistryPath()
    const legacyRegistry = legacyRegistryPath ? await readJson(legacyRegistryPath, null) : null
    if (Array.isArray(legacyRegistry?.wikis)) {
      const existing = new Set(registry.wikis.map(w => w.id))
      for (const item of legacyRegistry.wikis) {
        if (item?.id && !existing.has(item.id)) {
          registry.wikis.push(item)
          existing.add(item.id)
        }
      }
    }
    return registry
  }

  async _saveRegistry(registry) {
    registry.version = registry.version || 1
    registry.wikis = Array.isArray(registry.wikis) ? registry.wikis : []
    await writeJson(this._registryPath(), registry)
  }

  async _uniqueId(baseId) {
    const registry = await this._loadRegistry()
    const existing = new Set(registry.wikis.map(w => w.id))
    if (this._db?.listWikis) {
      for (const wiki of this._db.listWikis()) {
        if (wiki.id) existing.add(wiki.id)
        if (wiki.slug) existing.add(wiki.slug)
      }
    }
    const rootId = safeSegment(baseId) || `wiki-${Date.now().toString(36)}`
    let id = rootId
    let index = 2
    while (
      existing.has(id) ||
      fs.existsSync(path.join(this._rootPath(), id)) ||
      fs.existsSync(path.join(this._legacyRootPath() || '', id)) ||
      fs.existsSync(path.join(this._legacyRootPath() || '', LEGACY_NESTED_WIKIS_DIR, id))
    ) {
      id = `${rootId}-${index}`
      index += 1
    }
    return id
  }

  async listWikis() {
    try {
      const byId = new Map()
      if (this._db?.listWikis) {
        const dbWikis = this._db.listWikis()
        for (const w of dbWikis) {
          const meta = await this._loadWikiMetaIfExists(w.id)
          if (!meta) continue
          const agent = this._normalizeAgentConfig(w.agent_config || {})
          if ((w.agent_config || {}).default_write_policy !== agent.default_write_policy) {
            this._db?.updateWiki?.(w.id, { agent_config: agent, updated_at: nowIso() })
          }
          byId.set(w.id, {
            ...w,
            agent_config: agent,
            agent,
          })
        }
      }

      const registry = await this._loadRegistry()
      for (const item of registry.wikis) {
        const hasDbWiki = byId.has(item.id)
        const metaPath = path.join(this._wikiDir(item.id), 'wiki.json')
        const meta = await readJson(metaPath, null)
        if (!meta && !hasDbWiki) continue
        const migratedMeta = meta ? await this._migrateWikiMeta(item.id, meta) : null
        const agent = this._normalizeAgentConfig(migratedMeta?.agent || item.agent || {})
        const merged = {
          ...(byId.get(item.id) || {}),
          ...item,
          ...(migratedMeta || {}),
          agent_config: agent,
          agent,
          path: item.path || item.id,
        }
        byId.set(item.id, merged)
        if (!hasDbWiki && this._db?.upsertWiki && migratedMeta) {
          this._db.upsertWiki({
            ...migratedMeta,
            slug: item.id,
            path: item.path || item.id,
            agent_config: agent,
          })
        }
      }
      const wikis = [...byId.values()]
        .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      return { success: true, data: wikis }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async getWiki(id) {
    try {
      const dir = this._wikiDir(id)
      const meta = await readJson(path.join(dir, 'wiki.json'), null)
      if (!meta) return { success: false, error: 'Wiki not found' }
      await this._migrateWikiMeta(id, meta)
      const dbWiki = this._db?.getWiki?.(id)
      const jobs = await this.getJobs(id)
      return {
        success: true,
        data: {
          ...(dbWiki || {}),
          ...meta,
          agent: meta.agent || dbWiki?.agent_config || {},
          jobs: jobs.success ? jobs.data : [],
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async listSources(id) {
    try {
      const byId = new Map()
      if (this._db?.listWikiSources) {
        const dbSources = this._db.listWikiSources(id)
        for (const source of dbSources) {
          if (source?.id) byId.set(source.id, source)
        }
      }
      const registry = await this._loadSources(id)
      for (const source of registry.sources || []) {
        if (!source?.id) continue
        const merged = {
          ...(byId.get(source.id) || {}),
          ...source,
        }
        byId.set(source.id, merged)
        if (!this._db?.getWikiSource?.(source.id) && this._db?.upsertWikiSource) {
          this._db.upsertWikiSource({
            ...merged,
            wiki_id: id,
          })
        }
      }
      const sources = Array.from(byId.values())
        .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      return { success: true, data: sources }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async listAssets(id, options = {}) {
    try {
      const limit = Math.min(Math.max(Number(options.limit || 200), 1), 1000)
      const sourceId = String(options.sourceId || options.source_id || '').trim()
      const kind = String(options.kind || '').trim()
      const registry = await readJson(path.join(this._wikiDir(id), 'assets', 'registry.json'), { version: 1, assets: [] })
      const assets = (Array.isArray(registry.assets) ? registry.assets : [])
        .map(asset => normalizeAssetRecord(asset))
        .filter(asset => !sourceId || asset.source_id === sourceId)
        .filter(asset => !kind || asset.kind === kind)
        .sort((a, b) => (
          String(a.source_id || '').localeCompare(String(b.source_id || '')) ||
          Number(a.page || 0) - Number(b.page || 0) ||
          String(a.path || '').localeCompare(String(b.path || ''))
        ))
        .slice(0, limit)
        .map(asset => ({
          id: asset.id,
          source_id: asset.source_id || '',
          kind: asset.kind || '',
          path: asset.path || '',
          page: asset.page || 0,
          name: asset.name || '',
          dom_path: asset.dom_path || '',
          original_path: asset.original_path || '',
          original_url: asset.original_url || '',
          content_hash: asset.content_hash || '',
          size: asset.size || 0,
          vision: asset.vision,
          updated_at: asset.updated_at || '',
        }))
      return { success: true, data: assets }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async addSource(id, data = {}) {
    try {
      const filePath = data.filePath || data.path
      if (!filePath) throw new Error('Source file path is required')

      const originalPath = this._workDir.resolveAndValidate(filePath, 'docs')
      const stat = await fs.promises.stat(originalPath)
      if (!stat.isFile()) throw new Error('Only files can be added as sources')

      const registry = await this._loadSources(id)
      const contentHash = await this._hashFile(originalPath)
      const originalUri = this._workspaceUri(originalPath)
      const existing = registry.sources.find(src => src.original_uri === originalUri)
      if (existing && existing.content_hash === contentHash) {
        await this._ensureSourceSummaryFallbacks(id)
        return { success: true, data: existing, duplicate: true }
      }

      const createdAt = nowIso()
      const sourceId = `src_${Date.now().toString(36)}_${safeSegment(path.basename(originalPath, path.extname(originalPath)), 'file')}`
      const source = {
        id: sourceId,
        type: data.type || detectSourceType(originalPath),
        title: safeTitle(data.title || path.basename(originalPath)),
        original_uri: originalUri,
        original_path: originalPath,
        content_hash: contentHash,
        status: 'extracting',
        size: stat.size,
        extract_path: '',
        parser_status: 'pending',
        parser_message: '',
        created_at: createdAt,
        updated_at: createdAt,
      }

      if (existing) {
        Object.assign(existing, source, {
          id: existing.id,
          status: 'changed',
          created_at: existing.created_at || createdAt,
          updated_at: createdAt,
        })
      } else {
        registry.sources.push(source)
      }
      await this._saveSources(id, registry)
      const targetSource = existing || source
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_parse_queued`,
        type: 'source_ingest',
        name: `Parse ${targetSource.title}`,
        source_id: targetSource.id,
        status: 'pending',
        progress: 0,
        message: 'Document parsing queued',
        created_at: createdAt,
        updated_at: nowIso(),
      })
      this._enqueueParseTask({
        wikiId: id,
        sourceId: targetSource.id,
        type: 'source_ingest',
        name: `Ingest ${targetSource.title}`,
        createdAt,
      })

      return { success: true, data: targetSource, queued: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async reparseSource(id, sourceId) {
    try {
      if (!sourceId) throw new Error('Source id is required')
      const registry = await this._loadSources(id)
      const source = registry.sources.find(src => src.id === sourceId)
      if (!source) throw new Error('Source not found')
      if (source.type === 'note') {
        return { success: false, error: 'Note sources are refreshed by adding the note source again' }
      }

      const originalPath = this._workDir.resolveAndValidate(source.original_path, 'docs')
      const stat = await fs.promises.stat(originalPath)
      if (!stat.isFile()) throw new Error('Source file is not available')

      source.original_path = originalPath
      source.content_hash = await this._hashFile(originalPath)
      source.size = stat.size
      source.status = 'extracting'
      source.parser_status = 'pending'
      source.parser_message = ''
      source.updated_at = nowIso()
      await this._saveSources(id, registry)

      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_reparse_queued`,
        type: 'source_reparse',
        name: `Reparse ${source.title}`,
        source_id: source.id,
        status: 'pending',
        progress: 0,
        message: 'Document parsing queued',
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      this._enqueueParseTask({
        wikiId: id,
        sourceId,
        type: 'source_reparse',
        name: `Reparse ${source.title}`,
      })
      return { success: true, data: source, queued: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async deleteSource(id, sourceId) {
    try {
      if (!id) throw new Error('Wiki id is required')
      if (!sourceId) throw new Error('Source id is required')
      const registry = await this._loadSources(id)
      const index = registry.sources.findIndex(src => src.id === sourceId)
      if (index < 0) throw new Error('Source not found')
      const [source] = registry.sources.splice(index, 1)

      this._parseQueue = this._parseQueue.filter(task => !(task.wikiId === id && task.sourceId === sourceId))
      this._ocrQueue = this._ocrQueue.filter(task => !(task.wikiId === id && task.sourceId === sourceId))

      await this._saveSources(id, registry)
      await this._removeSourceArtifacts(id, source)
      const removedPages = await this._removeSourceKnowledgePages(id, source, registry.sources)
      await this._removeSourceJobsCache(id, sourceId)
      this._db?.deleteWikiSource?.(id, sourceId)
      await this._refreshWikiSourceCount(id)
      await this.listPages(id).catch(() => {})
      await this._refreshWikiAssetCount(id)
      await this._appendLog(id, `delete_source | ${sourceId} | ${safeTitle(source.title || '')}`)
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_source_deleted`,
        type: 'source_delete',
        name: `Remove ${source.title || source.id}`,
        source_id: '',
        status: 'completed',
        progress: 100,
        message: `${source.title || source.id} removed from Wiki`,
        meta: {
          source_id: sourceId,
          source_title: source.title || '',
          original_uri: source.original_uri || '',
          removed_pages: removedPages,
        },
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      this._enqueueAgentMaintenance(id, `source_deleted:${sourceId}:${safeTitle(source.title || '')}`)
      return { success: true, data: { id: sourceId, title: source.title || '' } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async addNoteSource(id, noteId) {
    try {
      if (!this._db?.getNote) throw new Error('Notes database is not available')
      const note = this._db.getNote(noteId)
      if (!note) throw new Error('Note not found')

      const registry = await this._loadSources(id)
      const createdAt = nowIso()
      const sourceId = `src_${Date.now().toString(36)}_note_${safeSegment(note.title || note.id) || note.id}`
      const originalUri = `note:${note.id}`
      const content = String(note.content || '')
      const contentHash = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`
      const existing = registry.sources.find(src => src.original_uri === originalUri)
      if (existing && existing.content_hash === contentHash) {
        await this._ensureSourceSummaryFallbacks(id)
        return { success: true, data: existing, duplicate: true }
      }

      const targetSource = existing || {
        id: sourceId,
        created_at: createdAt,
      }
      Object.assign(targetSource, {
        type: 'note',
        title: safeTitle(note.title || 'Untitled Note'),
        original_uri: originalUri,
        original_path: note.file_path || '',
        content_hash: contentHash,
        status: 'ingested',
        size: content.length,
        extract_path: `sources/extracts/${targetSource.id}.md`,
        parser_status: 'complete',
        parser_message: '',
        updated_at: nowIso(),
      })

      const extractPath = path.join(this._wikiDir(id), targetSource.extract_path)
      await fs.promises.mkdir(path.dirname(extractPath), { recursive: true })
      await fs.promises.writeFile(extractPath, [
        '---',
        `source_id: ${targetSource.id}`,
        'source_type: note',
        `note_id: ${note.id}`,
        `title: ${JSON.stringify(targetSource.title)}`,
        '---',
        '',
        content,
      ].join('\n'), 'utf-8')

      if (!existing) registry.sources.push(targetSource)
      await this._saveSources(id, registry)
      await this._refreshWikiSourceCount(id)
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_note`,
        type: 'source_ingest',
        name: `Ingest ${targetSource.title}`,
        source_id: targetSource.id,
        status: 'completed',
        progress: 100,
        created_at: createdAt,
        updated_at: nowIso(),
      })
      await this._ensureSourceSummaryFallbacks(id)
      this._enqueueAgentMaintenance(id, 'note_source_ingested')
      return { success: true, data: targetSource }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async createWiki(data = {}) {
    try {
      await this._ensureRoot()
      const title = safeTitle(data.name) || 'Untitled Wiki'
      const id = await this._uniqueId(data.id || title)
      const createdAt = nowIso()
      const dir = this._wikiDir(id)

      const dirs = [
        dir,
        path.join(dir, 'pages'),
        path.join(dir, 'pages', 'summaries'),
        path.join(dir, 'pages', 'concepts'),
        path.join(dir, 'pages', 'entities'),
        path.join(dir, 'pages', 'questions'),
        path.join(dir, 'pages', 'comparisons'),
        path.join(dir, 'sources'),
        path.join(dir, 'sources', 'extracts'),
        path.join(dir, 'sources', 'ocr'),
        path.join(dir, 'sources', 'web'),
        path.join(dir, 'sources', 'kb'),
        path.join(dir, 'assets'),
        path.join(dir, 'assets', 'images'),
        path.join(dir, 'history'),
        path.join(dir, '.cache'),
        path.join(dir, '.cache', 'agent'),
        path.join(dir, '.cache', 'ocr'),
      ]
      for (const targetDir of dirs) await fs.promises.mkdir(targetDir, { recursive: true })

      const meta = {
        version: 1,
        id,
        name: title,
        description: safeTitle(data.description || ''),
        status: 'ready',
        page_count: 2,
        source_count: 0,
        asset_count: 0,
        index_status: 'empty',
        agent: {
          mode: 'supervised',
          status: 'idle',
          default_write_policy: 'direct',
        },
        created_at: createdAt,
        updated_at: createdAt,
      }

      await writeJson(path.join(dir, 'wiki.json'), meta)
      await writeJson(path.join(dir, 'sources', 'registry.json'), { version: 1, sources: [] })
      await writeJson(path.join(dir, 'assets', 'registry.json'), { version: 1, assets: [] })
      await writeJson(path.join(dir, '.cache', 'jobs.json'), { version: 1, jobs: [] })

      await fs.promises.writeFile(path.join(dir, 'schema.md'), this._schemaTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'index.md'), this._indexTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'overview.md'), this._overviewTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'log.md'), `# ${title} Log\n\n- ${createdAt}: Wiki created.\n`, 'utf-8')

      const registry = await this._loadRegistry()
      registry.wikis.push({
        id,
        name: title,
        path: id,
        status: 'ready',
        created_at: createdAt,
        updated_at: createdAt,
      })
      await this._saveRegistry(registry)
      this._db?.upsertWiki?.({
        ...meta,
        slug: id,
        path: id,
        agent_config: meta.agent,
      })

      return { success: true, data: meta }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async deleteWiki(id) {
    try {
      if (!id) throw new Error('Wiki id is required')
      const safeId = safeSegment(id)
      const dir = this._wikiDir(safeId)
      const target = path.resolve(dir)
      const allowedRoots = [this._rootPath(), this._legacyRootPath()].filter(Boolean).map(item => path.resolve(item).toLowerCase())
      const targetLower = target.toLowerCase()
      const allowed = allowedRoots.some(root => targetLower === root || targetLower.startsWith(root + path.sep))
      if (!allowed) {
        throw new Error('Wiki path is outside workspace wikis directory')
      }

      this._parseQueue = this._parseQueue.filter(task => task.wikiId !== safeId)
      this._ocrQueue = this._ocrQueue.filter(task => task.wikiId !== safeId)
      this._agentQueue = this._agentQueue.filter(task => task.wikiId !== safeId)

      const registry = await this._loadRegistry()
      registry.wikis = (registry.wikis || []).filter(item => item.id !== safeId)
      await this._saveRegistry(registry)
      await this._removeWikiFromRegistryFile(this._legacyRegistryPath(), safeId)

      if (fs.existsSync(target)) {
        await fs.promises.rm(target, { recursive: true, force: true })
      }
      this._db?.deleteWiki?.(safeId)
      return { success: true, data: { id: safeId } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async listPages(id) {
    try {
      const dir = this._wikiDir(id)
      const pageRoots = ['index.md', 'overview.md']
      const pages = []
      for (const fileName of pageRoots) {
        const filePath = path.join(dir, fileName)
        if (fs.existsSync(filePath)) {
          const stat = await fs.promises.stat(filePath)
          pages.push({ path: fileName, title: fileName.replace(/\.md$/i, ''), type: 'root', updated_at: stat.mtime.toISOString() })
        }
      }
      await this._walkMarkdown(path.join(dir, 'pages'), 'pages', pages, new Set(['pages/index.md']))
      await this._refreshWikiPageCount(id, pages.length)
      return { success: true, data: pages }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async readPage(id, pagePath) {
    try {
      const dir = this._wikiDir(id)
      const target = path.resolve(dir, String(pagePath || 'index.md'))
      const root = path.resolve(dir)
      if (target.toLowerCase() !== root.toLowerCase() && !target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
        throw new Error('Page path is outside wiki')
      }
      const content = await fs.promises.readFile(target, 'utf-8')
      return {
        success: true,
        data: {
          path: path.relative(dir, target).replace(/\\/g, '/'),
          content,
          root_path: dir,
          workspace_root: this._workDir?.getRootPath?.() || '',
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async writePage(id, data = {}) {
    try {
      const dir = this._wikiDir(id)
      const title = safeTitle(data.title || '')
      const relPath = this._resolveWritablePagePath(data.pagePath || data.path, title || 'wiki-page')
      const absPath = path.join(dir, relPath)
      const createdAt = nowIso()
      const content = this._normalizePageContent({
        relPath,
        title,
        content: data.content,
      })

      await this._snapshotPage(dir, relPath, data.reason || 'wiki_write')
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
      await fs.promises.writeFile(absPath, content, 'utf-8')
      await this._appendLog(id, `write | ${relPath} | ${safeTitle(data.reason || title || 'WikiAgent update')}`)
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_wiki_write`,
        type: 'wiki_write',
        name: `Update ${relPath}`,
        status: 'completed',
        progress: 100,
        message: relPath,
        meta: {
          reason: data.reason || '',
          source_ids: Array.isArray(data.sourceIds) ? data.sourceIds : [],
        },
        created_at: createdAt,
        updated_at: nowIso(),
      })
      await this._touchWiki(id)
      await this.listPages(id)
      return { success: true, data: { path: relPath, title: title || path.basename(relPath, '.md') } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async writeCandidatePage(id, data = {}) {
    try {
      const title = safeTitle(data.title || 'Candidate')
      return await this.writePage(id, {
        pagePath: data.pagePath || `pages/summaries/${safeSegment(title) || `page-${Date.now().toString(36)}`}.md`,
        title,
        content: data.content,
        reason: data.reason || 'legacy_page_write',
      })
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async agentDraft(req = {}) {
    return this.agentRun(req)
  }

  async agentRun(req = {}) {
    const wikiId = req.wikiId || req.id
    const createdAt = nowIso()
    const runId = req.runId || `wiki_run_${Date.now().toString(36)}_${safeSegment(wikiId || 'wiki', 'wiki')}`
    try {
      if (!wikiId) throw new Error('wikiId is required')
      const modelConfig = hasModelRunConfig(req)
        ? {
            providerId: req.providerId,
            apiFormat: req.apiFormat || (req.providerId === 'anthropic' ? 'anthropic' : 'openai'),
            apiKey: req.apiKey,
            baseUrl: req.baseUrl || '',
            model: req.model,
            pricing: req.pricing || this._modelPricing(req.providerId, req.model),
            runId,
          }
        : this._resolveWikiAgentModelConfig(wikiId, runId)

      if (wikiId) {
        await this._setWikiAgentStatus(wikiId, 'running')
        await this._appendJob(wikiId, {
          id: `job_${Date.now().toString(36)}_wiki_agent`,
          type: 'wiki_agent',
          name: 'Run WikiAgent',
          status: 'running',
          progress: 20,
          meta: {
            run_id: runId,
            provider_id: modelConfig.providerId,
            model_id: modelConfig.model,
          },
          created_at: createdAt,
          updated_at: nowIso(),
        })
      }
      const result = await this._wikiAgent.run({
        ...req,
        ...modelConfig,
        wikiId,
        runId,
      })
      if (wikiId && result.success) {
        const fallbackSummaries = await this._ensureSourceSummaryFallbacks(wikiId)
        if (fallbackSummaries.length) {
          result.data = {
            ...(result.data || {}),
            fallbackSummaries,
          }
        }
      }
      if (wikiId) {
        await this._setWikiAgentStatus(wikiId, result.success ? 'idle' : 'failed')
        await this._appendJob(wikiId, {
          id: `job_${Date.now().toString(36)}_wiki_agent_done`,
          type: 'wiki_agent',
          name: 'Run WikiAgent',
          status: result.success ? 'completed' : 'failed',
          progress: 100,
          message: result.success ? 'WikiAgent completed' : (result.error || 'WikiAgent failed'),
          meta: {
            run_id: runId,
            provider_id: modelConfig.providerId,
            model_id: modelConfig.model,
            usage: result.data?.usage || {},
            cost: result.data?.cost || 0,
            latency_ms: result.data?.latencyMs || 0,
          },
          created_at: createdAt,
          updated_at: nowIso(),
        })
      }
      return result
    } catch (err) {
      if (wikiId) {
        await this._setWikiAgentStatus(wikiId, 'failed').catch(() => {})
        await this._appendJob(wikiId, {
          id: `job_${Date.now().toString(36)}_wiki_agent_failed`,
          type: 'wiki_agent',
          name: 'Run WikiAgent',
          status: 'failed',
          progress: 100,
          message: err.message || 'WikiAgent failed',
          meta: { run_id: runId },
          created_at: createdAt,
          updated_at: nowIso(),
        }).catch(() => {})
      }
      return { success: false, error: err.message }
    }
  }

  async updateAgentConfig(id, patch = {}) {
    try {
      const dir = this._wikiDir(id)
      const metaPath = path.join(dir, 'wiki.json')
      const meta = await readJson(metaPath, null)
      if (!meta) return { success: false, error: 'Wiki not found' }

      const nextAgent = {
        mode: 'supervised',
        status: 'idle',
        default_write_policy: 'direct',
        ...(meta.agent || {}),
      }
      if (patch.mode !== undefined) {
        nextAgent.mode = ['supervised', 'disabled'].includes(patch.mode) ? patch.mode : 'supervised'
      }
      if (patch.default_write_policy !== undefined) {
        nextAgent.default_write_policy = 'direct'
      }
      if (patch.model_ref !== undefined) nextAgent.model_ref = String(patch.model_ref || '')
      if (patch.instruction !== undefined) nextAgent.instruction = String(patch.instruction || '').trim().slice(0, 2000)

      meta.agent = nextAgent
      meta.updated_at = nowIso()
      await writeJson(metaPath, meta)
      this._db?.updateWiki?.(id, {
        agent_config: nextAgent,
        updated_at: meta.updated_at,
      })

      const registry = await this._loadRegistry()
      const item = registry.wikis.find(w => w.id === id)
      if (item) {
        item.updated_at = meta.updated_at
        item.agent = nextAgent
        await this._saveRegistry(registry)
      }

      return this.getWiki(id)
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async wikiTool(req = {}) {
    try {
      const action = String(req.action || '').trim()
      if (!action) throw new Error('wiki_tool action is required')
      const enforceWikiSelection = !!req.enforceWikiSelection
      const allowedWikiIds = this._allowedWikiIdsFromRequest(req)
      if (action === 'list_wikis') {
        const result = await this.listWikis()
        if (!enforceWikiSelection) return result
        const allowed = new Set(allowedWikiIds)
        return {
          ...result,
          data: (result.data || []).filter(wiki => allowed.has(wiki.id)),
          meta: { ...(result.meta || {}), restricted: true, allowed_wiki_ids: allowedWikiIds },
        }
      }

      if (action === 'search_wikis') return this.searchWikis({
        query: req.query,
        wikiIds: req.wikiIds || req.wiki_ids,
        wikiContext: req.wikiContext || req.wiki_context,
        allowedWikiIds,
        enforceWikiSelection,
        scope: req.scope,
        limit: req.limit,
      })
      if (action === 'query_wikis') return this.queryWikis({
        query: req.query,
        wikiIds: req.wikiIds || req.wiki_ids,
        wikiContext: req.wikiContext || req.wiki_context,
        allowedWikiIds,
        enforceWikiSelection,
        scope: req.scope,
        limit: req.limit,
        maxChars: req.maxChars || req.max_chars,
      })

      const wikiId = req.wikiId || req.id || this._defaultWikiIdFromContext(req.wikiContext || req.wiki_context)
      if (!wikiId) throw new Error('wikiId is required')
      if (enforceWikiSelection && !allowedWikiIds.includes(wikiId)) {
        throw new Error('Wiki is not selected for this chat run')
      }

      if (action === 'list_pages') return this.listPages(wikiId)
      if (action === 'read_page') return this.readPage(wikiId, req.pagePath || req.path)
      if (action === 'list_sources') return this.listSources(wikiId)
      if (action === 'read_source') return this.readSource(wikiId, req.sourceId || req.source_id)
      if (action === 'list_assets') return this.listAssets(wikiId, {
        sourceId: req.sourceId || req.source_id,
        kind: req.kind,
        limit: req.limit,
      })
      if (action === 'search') return this.searchWiki(wikiId, {
        query: req.query,
        scope: req.scope,
        limit: req.limit,
      })
      if ((action === 'write_page' || action === 'append_log') && !req.allowWrite) {
        throw new Error('wiki_tool is read-only in normal agent runs')
      }
      if (action === 'write_page') return this.writePage(wikiId, {
        pagePath: req.pagePath || req.path,
        title: req.title,
        content: req.content,
        reason: req.reason,
        sourceIds: req.sourceIds || req.source_ids,
      })
      if (action === 'append_log') {
        await this._appendLog(wikiId, `note | ${safeTitle(req.message || req.content || '')}`)
        await this._touchWiki(wikiId)
        return { success: true, data: { appended: true } }
      }
      if (action === 'recent_changes') return this.recentChanges(wikiId, req.limit)
      throw new Error(`Unsupported wiki_tool action: ${action}`)
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  _defaultWikiIdFromContext(wikiContext = {}) {
    const ids = Array.isArray(wikiContext?.wikiIds) ? wikiContext.wikiIds.filter(Boolean) : []
    if (ids.length === 1) return ids[0]
    return ''
  }

  _allowedWikiIdsFromRequest(req = {}) {
    const direct = Array.isArray(req.allowedWikiIds)
      ? req.allowedWikiIds
      : (Array.isArray(req.allowed_wiki_ids) ? req.allowed_wiki_ids : [])
    const ctx = req.wikiContext || req.wiki_context || {}
    const contextual = Array.isArray(ctx.wikiIds) ? ctx.wikiIds : []
    return [...new Set([...(direct || []), ...(contextual || [])].filter(Boolean).map(id => String(id)))]
  }

  async _wikiIdsForQuery(options = {}) {
    const explicit = Array.isArray(options.wikiIds)
      ? options.wikiIds
      : (Array.isArray(options.wiki_ids) ? options.wiki_ids : [])
    const ctx = options.wikiContext || options.wiki_context || {}
    const contextual = Array.isArray(ctx.wikiIds) ? ctx.wikiIds : []
    const mode = String(ctx.mode || '').toLowerCase()
    const requested = explicit.length ? explicit : contextual
    const allResult = await this.listWikis()
    const all = allResult.data || []
    const validIds = new Set(all.map(wiki => wiki.id))
    const enforceWikiSelection = !!options.enforceWikiSelection
    const allowedWikiIds = Array.isArray(options.allowedWikiIds)
      ? options.allowedWikiIds
      : (Array.isArray(options.allowed_wiki_ids) ? options.allowed_wiki_ids : [])
    const allowedByRun = [...new Set((allowedWikiIds || []).filter(id => validIds.has(id)))]
    if (enforceWikiSelection && !allowedByRun.length) return []
    if (mode === 'all' || requested.includes('*') || requested.includes('all')) {
      return enforceWikiSelection
        ? allowedByRun
        : all.map(wiki => wiki.id).filter(Boolean)
    }
    const allowed = enforceWikiSelection ? new Set(allowedByRun) : validIds
    return [...new Set(requested.filter(id => allowed.has(id)))]
  }

  async searchWikis(options = {}) {
    try {
      const query = String(options.query || '').trim()
      if (!query) return { success: true, data: [] }
      const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50)
      const wikiIds = await this._wikiIdsForQuery(options)
      if (!wikiIds.length) return { success: true, data: [], meta: { reason: 'no_wiki_selected' } }
      const wikis = (await this.listWikis()).data || []
      const wikiMap = new Map(wikis.map(wiki => [wiki.id, wiki]))
      const perWikiLimit = Math.min(Math.max(limit, 5), 50)
      const results = []

      for (const wikiId of wikiIds) {
        const result = await this.searchWiki(wikiId, {
          query,
          scope: options.scope || 'all',
          limit: perWikiLimit,
        })
        const wiki = wikiMap.get(wikiId) || { id: wikiId, name: wikiId }
        for (const item of result.data || []) {
          results.push({
            ...item,
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
            citation: this._resultCitation(wiki, item),
          })
        }
        const scope = String(options.scope || 'all').toLowerCase()
        if (scope === 'all' || scope === 'assets') {
          const assetResults = await this._searchWikiAssets(wikiId, query, Math.min(perWikiLimit, 10))
          for (const item of assetResults) {
            results.push({
              ...item,
              wiki_id: wikiId,
              wiki_name: wiki.name || wikiId,
              citation: this._resultCitation(wiki, item),
            })
          }
        }
      }

      results.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.title || '').localeCompare(String(b.title || '')))
      return {
        success: true,
        data: results.slice(0, limit),
        meta: { query, wiki_ids: wikiIds, total: results.length },
      }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async queryWikis(options = {}) {
    try {
      const query = String(options.query || '').trim()
      const limit = Math.min(Math.max(Number(options.limit || 8), 1), 20)
      const maxChars = Math.min(Math.max(Number(options.maxChars || 16000), 2000), 50000)
      const wikiIds = await this._wikiIdsForQuery(options)
      if (!wikiIds.length) {
        return { success: true, data: { query, results: [], context: '', citations: [], navigation_links: [] }, meta: { reason: 'no_wiki_selected' } }
      }
      const wikis = (await this.listWikis()).data || []
      const wikiMap = new Map(wikis.map(wiki => [wiki.id, wiki]))
      const contextParts = []
      const citations = []
      const results = []
      const navigationLinks = []
      const fallbackHits = []
      let usedChars = 0
      const perWikiPageLimit = Math.max(2, Math.ceil(limit / Math.max(wikiIds.length, 1)))
      const queryTerms = this._queryTerms(query)

      for (const wikiId of wikiIds) {
        const wiki = wikiMap.get(wikiId) || { id: wikiId, name: wikiId }
        const indexRead = await this.readPage(wikiId, 'index.md')
        const overviewRead = await this.readPage(wikiId, 'overview.md')
        const rootPages = [
          indexRead.success ? { path: 'index.md', title: 'index', content: indexRead.data.content || '' } : null,
          overviewRead.success ? { path: 'overview.md', title: 'overview', content: overviewRead.data.content || '' } : null,
        ].filter(Boolean)

        const wikiLinks = this._uniqueNavigationLinks(rootPages.flatMap(page =>
          this._extractMarkdownLinks(page.content, page.path).map(link => ({
            ...link,
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
          }))
        ))
        const rankedLinks = this._rankNavigationLinks(wikiLinks, query)
        navigationLinks.push(...rankedLinks)

        const rootText = [
          `## Wiki: ${wiki.name || wikiId} (${wikiId})`,
          ...rootPages.map(page => [
            `### ${page.path}`,
            this._clipQueryText(page.content, Math.max(1200, Math.floor(maxChars / Math.max(wikiIds.length * 3, 1)))),
          ].join('\n')),
          rankedLinks.length
            ? [
                '### Navigation links',
                ...rankedLinks.slice(0, 20).map(link => `- [${link.title || link.path}](${link.path})${link.context ? ` — ${safeTitle(link.context)}` : ''}`),
              ].join('\n')
            : '',
        ].filter(Boolean).join('\n\n')
        if (rootText && usedChars < maxChars) {
          const chunk = this._clipQueryText(rootText, maxChars - usedChars)
          if (chunk) {
            contextParts.push(chunk)
            usedChars += chunk.length
            for (const page of rootPages) {
              citations.push(this._citationRecord({
                kind: 'navigation',
                wiki_id: wikiId,
                wiki_name: wiki.name || wikiId,
                title: page.title,
                path: page.path,
                citation: `${wiki.name || wikiId}:${page.path}`,
              }))
            }
          }
        }

        const selectedLinks = rankedLinks
          .filter(link => !['index.md', 'overview.md'].includes(link.path))
          .filter(link => !queryTerms.length || Number(link.score || 0) > 0)
          .slice(0, perWikiPageLimit)
        for (const link of selectedLinks) {
          const read = await this.readPage(wikiId, link.path)
          if (!read.success) continue
          const result = {
            kind: 'page',
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
            path: link.path,
            title: link.title || path.basename(link.path, '.md'),
            score: link.score || 0,
            snippet: link.context || '',
            citation: `${wiki.name || wikiId}:${link.path}`,
            via: 'index',
          }
          results.push(result)
          const chunk = [
            `### ${result.wiki_name} / ${result.path}`,
            `Citation: ${result.citation}`,
            this._clipQueryText(read.data.content || '', Math.max(1000, Math.floor(maxChars / Math.max(limit, 1)))),
          ].join('\n')
          if (usedChars < maxChars) {
            const clipped = this._clipQueryText(chunk, maxChars - usedChars)
            if (clipped) {
              contextParts.push(clipped)
              usedChars += clipped.length
            }
          }
          citations.push(this._citationRecord(result))
        }

        const search = query
          ? await this.searchWiki(wikiId, { query, scope: options.scope || 'all', limit: Math.max(3, perWikiPageLimit) })
          : { success: true, data: [] }
        for (const item of search.data || []) {
          const hit = {
            ...item,
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
            citation: this._resultCitation(wiki, item),
            via: 'fallback_search',
          }
          fallbackHits.push(hit)
        }
      }

      const resultKeys = new Set(results.map(item => `${item.wiki_id}:${item.kind}:${item.path || item.source_id || item.id || item.title || ''}`))
      if (!results.length && fallbackHits.length) {
        for (const hit of fallbackHits.slice(0, limit)) {
          const key = `${hit.wiki_id}:${hit.kind}:${hit.path || hit.source_id || hit.id || hit.title || ''}`
          if (resultKeys.has(key)) continue
          const chunkBody = await this._queryContextChunk(hit, Math.max(1000, Math.floor(maxChars / Math.max(limit, 1))))
          const chunk = [
            `### ${hit.wiki_name || hit.wiki_id} / ${hit.path || hit.source_id || hit.id || hit.title || 'fallback hit'}`,
            `Citation: ${hit.citation || this._resultCitation(wikiMap.get(hit.wiki_id), hit)}`,
            chunkBody,
          ].filter(Boolean).join('\n')
          if (usedChars < maxChars) {
            const clipped = this._clipQueryText(chunk, maxChars - usedChars)
            if (clipped) {
              contextParts.push(clipped)
              usedChars += clipped.length
            }
          }
          results.push(hit)
          citations.push(this._citationRecord(hit))
          resultKeys.add(key)
          if (results.length >= limit) break
        }
      }
      const sortedNavigationLinks = [...navigationLinks]
        .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.wiki_name || a.wiki_id || '').localeCompare(String(b.wiki_name || b.wiki_id || '')) || String(a.path || '').localeCompare(String(b.path || '')))

      return {
        success: true,
        data: {
          query,
          strategy: 'index_first',
          results: results.slice(0, limit),
          navigation_links: sortedNavigationLinks.slice(0, Math.max(limit * 5, 20)),
          fallback_hits: fallbackHits.slice(0, limit),
          context: contextParts.join('\n\n'),
          citations,
        },
        meta: { query, wiki_ids: wikiIds, strategy: 'index_first', fallback_hits: fallbackHits.length },
      }
    } catch (err) {
      return { success: false, error: err.message, data: { query: options.query || '', results: [], context: '', citations: [], navigation_links: [] } }
    }
  }

  async restorePendingOcrJobs() {
    if (!this._db?.listWikiOcrJobs) return { success: true, data: [] }
    const wikisResult = await this.listWikis()
    const restored = []
    for (const wiki of wikisResult.data || []) {
      const jobs = this._db.listWikiOcrJobs(wiki.id) || []
      const activeJobs = jobs.filter(job => ['pending', 'running'].includes(job.status))
      if (!activeJobs.length) continue

      const registry = await this._loadSources(wiki.id).catch(() => null)
      if (!registry) continue
      let changed = false
      for (const job of activeJobs) {
        const source = registry.sources.find(src => src.id === job.source_id)
        if (!source) continue
        if (!['ocr_queued', 'ocr_running'].includes(source.parser_status)) {
          source.status = 'extracting'
          source.parser_status = 'ocr_queued'
          source.parser_message = 'OCR job restored'
          source.updated_at = nowIso()
          changed = true
        }
        restored.push({ wikiId: wiki.id, sourceId: source.id, providerId: job.provider_id || '' })
        this._enqueueOcrTask({ wikiId: wiki.id, sourceId: source.id, providerId: job.provider_id || '' })
      }
      if (changed) await this._saveSources(wiki.id, registry)
    }
    return { success: true, data: restored }
  }

  async restorePendingParseJobs() {
    const wikisResult = await this.listWikis()
    const restored = []
    for (const wiki of wikisResult.data || []) {
      const registry = await this._loadSources(wiki.id).catch(() => null)
      if (!registry) continue
      let changed = false
      for (const source of registry.sources || []) {
        if (source.type === 'note') continue
        if (['needs_ocr', 'ocr_queued', 'ocr_running', 'ocr_failed'].includes(source.parser_status)) continue
        const shouldRestore = ['extracting', 'changed'].includes(source.status) ||
          ['pending', 'running'].includes(source.parser_status)
        if (!shouldRestore) continue
        source.status = 'extracting'
        source.parser_status = 'pending'
        source.parser_message = 'Document parsing restored'
        source.updated_at = nowIso()
        changed = true
        restored.push({ wikiId: wiki.id, sourceId: source.id })
        this._enqueueParseTask({
          wikiId: wiki.id,
          sourceId: source.id,
          type: 'source_parse',
          name: `Parse ${source.title || source.id}`,
        })
      }
      if (changed) await this._saveSources(wiki.id, registry)
    }
    return { success: true, data: restored }
  }

  async searchWiki(id, options = {}) {
    try {
      const query = String(options.query || '').trim()
      if (!query) return { success: true, data: [] }
      const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50)
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
      const scope = String(options.scope || 'all').toLowerCase()
      const results = []

      if (scope === 'all' || scope === 'pages' || scope === 'wiki') {
        const pagesResult = await this.listPages(id)
        for (const page of pagesResult.data || []) {
          const read = await this.readPage(id, page.path)
          if (!read.success) continue
          const haystack = `${page.path}\n${read.data.content}`.toLowerCase()
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
          if (!score) continue
          results.push({
            kind: 'page',
            path: page.path,
            title: page.title,
            score,
            snippet: this._snippet(read.data.content, terms),
          })
        }
      }

      if (scope === 'all' || scope === 'sources' || scope === 'source') {
        const sources = (await this.listSources(id)).data || []
        for (const source of sources) {
          const read = await this.readSource(id, source.id)
          const content = read.success ? read.data.content : ''
          const haystack = `${source.title}\n${source.original_uri}\n${content}`.toLowerCase()
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
          if (!score) continue
          results.push({
            kind: 'source',
            source_id: source.id,
            path: source.extract_path || source.original_uri || source.original_path,
            title: source.title,
            parser_status: source.parser_status,
            score,
            snippet: this._snippet(content || source.parser_message || '', terms),
          })
        }
      }

      results.sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
      return { success: true, data: results.slice(0, limit) }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async _searchWikiAssets(id, query, limit = 10) {
    const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    const assetsResult = await this.listAssets(id, { limit: 1000 })
    const assets = assetsResult.data || []
    const results = []
    for (const asset of assets) {
      const vision = asset.vision || {}
      const haystack = [
        asset.id,
        asset.source_id,
        asset.path,
        asset.original_path,
        asset.original_url,
        vision.summary,
        vision.status,
      ].filter(Boolean).join('\n').toLowerCase()
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
      if (!score) continue
      results.push({
        kind: 'asset',
        id: asset.id,
        source_id: asset.source_id || '',
        path: asset.path || '',
        title: path.basename(asset.path || asset.id || 'asset'),
        page: asset.page || 0,
        score,
        snippet: vision.summary || asset.path || '',
        vision,
      })
    }
    return results
      .sort((a, b) => b.score - a.score || String(a.path).localeCompare(String(b.path)))
      .slice(0, Math.min(Math.max(Number(limit || 10), 1), 50))
  }

  _extractMarkdownLinks(content = '', basePath = 'index.md') {
    const text = String(content || '')
    const links = []
    const re = /(?<!!)\[([^\]]{1,160})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    let match
    while ((match = re.exec(text))) {
      const title = safeTitle(match[1] || '')
      const rawHref = String(match[2] || '').trim()
      const normalized = this._normalizeWikiPageLink(rawHref, basePath)
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
      const normalized = this._normalizeWikiPageLink(rawHref, basePath)
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

  _normalizeWikiPageLink(href = '', basePath = 'index.md') {
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

  _uniqueNavigationLinks(links = []) {
    const byPath = new Map()
    for (const link of links || []) {
      if (!link?.path) continue
      const key = `${link.wiki_id || ''}:${link.path}`
      if (!byPath.has(key)) byPath.set(key, link)
    }
    return Array.from(byPath.values())
  }

  _rankNavigationLinks(links = [], query = '') {
    const terms = this._queryTerms(query)
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

  _queryTerms(query = '') {
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

  async _queryContextChunk(result, maxChars = 2000) {
    const limit = Math.min(Math.max(Number(maxChars || 2000), 500), 10000)
    if (result.kind === 'page' && result.path) {
      const read = await this.readPage(result.wiki_id, result.path)
      if (!read.success) return result.snippet || ''
      return this._clipQueryText(read.data.content || '', limit)
    }
    if (result.kind === 'source' && result.source_id) {
      const read = await this.readSource(result.wiki_id, result.source_id)
      if (!read.success) return result.snippet || ''
      return this._clipQueryText(read.data.content || read.data.source?.parser_message || '', limit)
    }
    if (result.kind === 'asset') {
      const lines = [
        `Asset path: ${result.path || ''}`,
        result.source_id ? `Source ID: ${result.source_id}` : '',
        result.page ? `Page: ${result.page}` : '',
        result.vision?.summary ? `Vision summary: ${result.vision.summary}` : '',
        result.snippet ? `Snippet: ${result.snippet}` : '',
      ].filter(Boolean)
      return this._clipQueryText(lines.join('\n'), limit)
    }
    return this._clipQueryText(result.snippet || '', limit)
  }

  _clipQueryText(text, maxChars = 2000) {
    const content = String(text || '').trim()
    const limit = Math.max(Number(maxChars || 0), 0)
    if (!limit) return ''
    if (content.length <= limit) return content
    const suffix = '\n...[truncated]'
    if (limit <= suffix.length) return content.slice(0, limit)
    return `${content.slice(0, limit - suffix.length)}${suffix}`
  }

  _citationRecord(result) {
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

  _resultCitation(wiki, result) {
    const wikiName = wiki?.name || wiki?.id || result.wiki_id || ''
    if (result.kind === 'page') return `${wikiName}:${result.path || result.title || ''}`
    if (result.kind === 'source') return `${wikiName}:source:${result.source_id || result.title || ''}`
    if (result.kind === 'asset') return `${wikiName}:asset:${result.path || result.id || ''}`
    return wikiName
  }

  async readSource(id, sourceId) {
    try {
      if (!sourceId) throw new Error('sourceId is required')
      const registry = await this._loadSources(id)
      const source = registry.sources.find(src => src.id === sourceId)
      if (!source) throw new Error('Source not found')
      let content = ''
      if (source.extract_path) {
        const extractPath = path.resolve(this._wikiDir(id), source.extract_path)
        const root = path.resolve(this._wikiDir(id))
        if (extractPath.toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
          content = await fs.promises.readFile(extractPath, 'utf-8').catch(() => '')
        }
      }
      return { success: true, data: { source, content } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async recentChanges(id, limit = 10) {
    try {
      const jobs = (await this.getJobs(id)).data || []
      const logPath = path.join(this._wikiDir(id), 'log.md')
      const log = await fs.promises.readFile(logPath, 'utf-8').catch(() => '')
      const entries = log.split('\n').filter(line => /^- \d{4}-\d{2}-\d{2}T/.test(line)).slice(-Math.max(Number(limit || 10), 1))
      return { success: true, data: { jobs: jobs.slice(0, Math.max(Number(limit || 10), 1)), log: entries } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async getJobs(id) {
    try {
      if (this._db?.listWikiJobs) {
        const jobs = this._db.listWikiJobs(id)
        if (jobs.length) return { success: true, data: jobs }
      }
      const data = await readJson(path.join(this._wikiDir(id), '.cache', 'jobs.json'), { version: 1, jobs: [] })
      return { success: true, data: Array.isArray(data.jobs) ? data.jobs : [] }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async listOcrProviders() {
    try {
      return { success: true, data: this._db?.listOcrProviders?.() || [] }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async createOcrProvider(data = {}) {
    try {
      if (!this._db?.createOcrProvider) throw new Error('OCR provider storage is not available')
      return { success: true, data: this._db.createOcrProvider(data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async updateOcrProvider(providerId, data = {}) {
    try {
      if (!providerId) throw new Error('Provider id is required')
      if (!this._db?.updateOcrProvider) throw new Error('OCR provider storage is not available')
      return { success: true, data: this._db.updateOcrProvider(providerId, data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async deleteOcrProvider(providerId) {
    try {
      if (!providerId) throw new Error('Provider id is required')
      if (!this._db?.deleteOcrProvider) throw new Error('OCR provider storage is not available')
      return this._db.deleteOcrProvider(providerId)
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async listOcrJobs(id, sourceId = '') {
    try {
      return { success: true, data: this._db?.listWikiOcrJobs?.(id, sourceId) || [] }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  _resolveWritablePagePath(pagePath, title = 'wiki-page') {
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

  _normalizePageContent({ relPath, title, content }) {
    const body = String(content || '').trim()
    const heading = title || path.posix.basename(relPath, '.md')
    const normalizedBody = body.startsWith('---') || /^#\s+/m.test(body)
      ? body
      : `# ${heading}\n\n${body || 'No content yet.'}`
    return `${this._normalizeMarkdownAssetImageRefs(normalizedBody, relPath)}\n`
  }

  _normalizeMarkdownAssetImageRefs(markdown, relPath) {
    return String(markdown || '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, label, rawTarget) => {
      const target = this._normalizeMarkdownImageTarget(rawTarget, relPath)
      return target ? `![${label}](${target})` : match
    })
  }

  _normalizeMarkdownImageTarget(rawTarget, relPath) {
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

  async _snapshotPage(wikiDir, relPath, reason = '') {
    const sourcePath = path.join(wikiDir, relPath)
    if (!fs.existsSync(sourcePath)) return null
    const stamp = nowIso().replace(/[:.]/g, '-')
    const parsed = path.posix.parse(relPath.replace(/\\/g, '/'))
    const historyRel = path.posix.join('history', parsed.dir, `${parsed.name}.${stamp}${parsed.ext || '.md'}`)
    const historyPath = path.join(wikiDir, historyRel)
    await fs.promises.mkdir(path.dirname(historyPath), { recursive: true })
    const previous = await fs.promises.readFile(sourcePath, 'utf-8')
    const header = [
      '<!--',
      `snapshot_of: ${relPath}`,
      `snapshot_at: ${nowIso()}`,
      `reason: ${String(reason || '').replace(/\r?\n/g, ' ').slice(0, 200)}`,
      '-->',
      '',
    ].join('\n')
    await fs.promises.writeFile(historyPath, header + previous, 'utf-8')
    return historyRel
  }

  async _appendLog(id, message) {
    const dir = this._wikiDir(id)
    const logPath = path.join(dir, 'log.md')
    await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
    await fs.promises.appendFile(logPath, `- ${nowIso()}: ${String(message || '').replace(/\r?\n/g, ' ').trim()}\n`, 'utf-8')
  }

  _snippet(content, terms) {
    const text = String(content || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    const lower = text.toLowerCase()
    const index = terms.map(term => lower.indexOf(term)).filter(pos => pos >= 0).sort((a, b) => a - b)[0] ?? 0
    const start = Math.max(index - 80, 0)
    const end = Math.min(index + 220, text.length)
    return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
  }

  async runOcr(id, sourceId, providerId = '') {
    try {
      if (!sourceId) throw new Error('Source id is required')
      const wikiDir = this._wikiDir(id)
      const registry = await this._loadSources(id)
      const source = registry.sources.find(src => src.id === sourceId)
      if (!source) throw new Error('Source not found')
      if (source.type !== 'pdf' && source.parser_status !== 'needs_ocr' && source.parser_status !== 'ocr_failed') {
        throw new Error('当前来源不需要 OCR')
      }

      source.status = 'extracting'
      source.parser_status = 'ocr_queued'
      source.parser_message = 'OCR job queued'
      source.updated_at = nowIso()
      await this._saveSources(id, registry)
      const job = await this._ocrService.registerPendingJob({
        wikiId: id,
        wikiDir,
        source,
        providerId,
      })
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_ocr_queued`,
        type: 'source_ocr',
        name: `OCR ${source.title}`,
        source_id: source.id,
        status: 'pending',
        progress: 0,
        message: 'OCR job queued',
        meta: { ocr_job_id: job?.id || '', provider_id: providerId || '' },
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      this._enqueueOcrTask({ wikiId: id, sourceId, providerId })
      return { success: true, data: { source, job, queued: true } }
    } catch (err) {
      try {
        const registry = await this._loadSources(id)
        const source = registry.sources.find(src => src.id === sourceId)
        if (source) {
          source.status = 'pending'
          source.parser_status = 'ocr_failed'
          source.parser_message = err.message || 'OCR failed'
          source.updated_at = nowIso()
          await this._saveSources(id, registry)
        }
      } catch {}
      return { success: false, error: err.message }
    }
  }

  _enqueueParseTask(task) {
    if (!task?.wikiId || !task?.sourceId) return
    const exists = this._parseQueue.some(item => item.wikiId === task.wikiId && item.sourceId === task.sourceId)
    if (!exists) this._parseQueue.push(task)
    this._drainParseQueue()
  }

  async _drainParseQueue() {
    if (this._parseQueueRunning) return
    this._parseQueueRunning = true
    try {
      while (this._parseQueue.length) {
        const task = this._parseQueue.shift()
        await this._executeParseTask(task)
      }
    } finally {
      this._parseQueueRunning = false
    }
  }

  async _executeParseTask(task) {
    const { wikiId, sourceId } = task || {}
    if (!wikiId || !sourceId) return
    const registry = await this._loadSources(wikiId)
    const source = registry.sources.find(src => src.id === sourceId)
    if (!source) return
    await this._parseRegisteredSource(wikiId, registry, source, {
      type: task.type || 'source_parse',
      name: task.name || `Parse ${source.title || source.id}`,
      createdAt: task.createdAt || nowIso(),
    })
  }

  _enqueueOcrTask(task) {
    if (!task?.wikiId || !task?.sourceId) return
    const exists = this._ocrQueue.some(item => item.wikiId === task.wikiId && item.sourceId === task.sourceId)
    if (!exists) this._ocrQueue.push(task)
    this._drainOcrQueue()
  }

  async _drainOcrQueue() {
    if (this._ocrQueueRunning) return
    this._ocrQueueRunning = true
    try {
      while (this._ocrQueue.length) {
        const task = this._ocrQueue.shift()
        await this._executeOcrTask(task)
      }
    } finally {
      this._ocrQueueRunning = false
    }
  }

  async _executeOcrTask({ wikiId, sourceId, providerId = '' }) {
    const wikiDir = this._wikiDir(wikiId)
    const registry = await this._loadSources(wikiId)
    const source = registry.sources.find(src => src.id === sourceId)
    if (!source) return

    try {
      source.status = 'extracting'
      source.parser_status = 'ocr_running'
      source.parser_message = ''
      source.updated_at = nowIso()
      await this._saveSources(wikiId, registry)
      await this._appendJob(wikiId, {
        id: `job_${Date.now().toString(36)}_ocr_running`,
        type: 'source_ocr',
        name: `OCR ${source.title}`,
        source_id: source.id,
        status: 'running',
        progress: 20,
        created_at: nowIso(),
        updated_at: nowIso(),
      })

      const result = await this._ocrService.runJob({
        wikiId,
        wikiDir,
        source,
        providerId,
      })

      const latestRegistry = await this._loadSources(wikiId)
      const latestSource = latestRegistry.sources.find(item => item.id === source.id)
      if (!latestSource) {
        await this._removeSourceArtifacts(wikiId, {
          ...source,
          extract_path: result.extract_path || source.extract_path,
        })
        return
      }

      Object.assign(latestSource, {
        status: 'ingested',
        extract_path: result.extract_path,
        parser_status: 'complete',
        parser_message: '',
        meta: {
          ...(latestSource.meta || {}),
          ocr: {
            manifest_path: result.manifest_path,
            job_id: result.job?.id || '',
            metrics: result.metrics || {},
          },
          parse_stats: {
            ...(latestSource.meta?.parse_stats || {}),
            ...(result.metrics || {}),
            parser: 'ocr',
          },
        },
        updated_at: nowIso(),
      })
      await this._saveSources(wikiId, latestRegistry)
      await this._refreshWikiSourceCount(wikiId)
      await this._refreshWikiAssetCount(wikiId)
      await this._appendJob(wikiId, {
        id: `job_${Date.now().toString(36)}_ocr_done`,
        type: 'source_ocr',
        name: `OCR ${latestSource.title}`,
        source_id: latestSource.id,
        status: 'completed',
        progress: 100,
        message: result.extract_path,
        meta: {
          ocr_job_id: result.job?.id || '',
          manifest_path: result.manifest_path,
          parse_stats: result.metrics || {},
        },
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      await this._ensureSourceSummaryFallbacks(wikiId)
      this._enqueueAgentMaintenance(wikiId, 'ocr_source_completed')
    } catch (err) {
      const latestRegistry = await this._loadSources(wikiId)
      const latestSource = latestRegistry.sources.find(item => item.id === source.id)
      if (!latestSource) return
      latestSource.status = 'pending'
      latestSource.parser_status = 'ocr_failed'
      latestSource.parser_message = err.message || 'OCR failed'
      latestSource.updated_at = nowIso()
      await this._saveSources(wikiId, latestRegistry)
      await this._appendJob(wikiId, {
        id: `job_${Date.now().toString(36)}_ocr_failed`,
        type: 'source_ocr',
        name: `OCR ${latestSource.title}`,
        source_id: latestSource.id,
        status: 'failed',
        progress: 100,
        message: latestSource.parser_message,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }
  }

  async _loadSources(id) {
    const filePath = path.join(this._wikiDir(id), 'sources', 'registry.json')
    const registry = await readJson(filePath, { version: 1, sources: [] })
    if (!Array.isArray(registry.sources)) registry.sources = []
    return registry
  }

  async _saveSources(id, registry) {
    await writeJson(path.join(this._wikiDir(id), 'sources', 'registry.json'), {
      version: registry.version || 1,
      sources: registry.sources || [],
    })
    for (const source of registry.sources || []) {
      this._db?.upsertWikiSource?.({
        ...source,
        wiki_id: id,
      })
    }
  }

  async _sourceExists(id, sourceId) {
    const registry = await this._loadSources(id)
    return registry.sources.some(source => source.id === sourceId)
  }

  async _removeWikiPath(id, relOrAbsPath) {
    const wikiDir = this._wikiDir(id)
    const raw = String(relOrAbsPath || '').trim()
    if (!raw) return
    const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(wikiDir, raw)
    const root = path.resolve(wikiDir)
    if (target === root || !isPathInside(root, target)) return
    await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
  }

  async _removeSourceArtifacts(id, source) {
    const sourceId = source?.id || ''
    if (!sourceId) return
    const safeSourceId = safeSegment(sourceId, sourceId)

    await this._removeWikiPath(id, source.extract_path)
    await this._removeWikiPath(id, `sources/extracts/${sourceId}.md`)
    await this._removeWikiPath(id, `sources/ocr/${safeSourceId}`)
    await this._removeWikiPath(id, `sources/ocr/${sourceId}`)
    await this._removeWikiPath(id, `.cache/ocr/${safeSourceId}`)
    await this._removeWikiPath(id, `.cache/ocr/${sourceId}`)
    await this._removeWikiPath(id, `assets/images/${safeSourceId}`)
    await this._removeWikiPath(id, `assets/images/${sourceId}`)

    const registryPath = path.join(this._wikiDir(id), 'assets', 'registry.json')
    const registry = await readJson(registryPath, { version: 1, assets: [] })
    const assets = Array.isArray(registry.assets) ? registry.assets : []
    const nextAssets = assets.filter(asset => asset.source_id !== sourceId)
    if (nextAssets.length !== assets.length) {
      await writeJson(registryPath, {
        version: registry.version || 1,
        assets: nextAssets,
      })
    }
  }

  _sourceRemovalMarkers(source) {
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

  _pageReferencesSource(content, pagePath, source) {
    const haystack = `${pagePath}\n${content}`.replace(/\\/g, '/').toLowerCase()
    return this._sourceRemovalMarkers(source).some(marker => haystack.includes(marker))
  }

  _pageReferencesRemainingSource(content, remainingSources = [], removedSourceId = '') {
    const haystack = String(content || '').toLowerCase()
    return remainingSources.some(source => {
      const sourceId = String(source?.id || '').trim().toLowerCase()
      return sourceId && sourceId !== String(removedSourceId || '').toLowerCase() && haystack.includes(sourceId)
    })
  }

  async _removeSourceKnowledgePages(id, source, remainingSources = []) {
    const sourceId = source?.id || ''
    if (!sourceId) return []
    const pagesResult = await this.listPages(id)
    const generatedPages = (pagesResult.data || [])
      .filter(page => String(page.path || '').startsWith('pages/'))
    const removed = []
    for (const page of generatedPages) {
      const read = await this.readPage(id, page.path)
      if (!read.success) continue
      const content = String(read.data.content || '')
      const pagePath = String(page.path || '')
      if (!this._pageReferencesSource(content, pagePath, source)) continue

      const isSourceOwnedPage = pagePath.startsWith('pages/summaries/') || pagePath.toLowerCase().includes(sourceId.toLowerCase())
      const hasOtherSourceEvidence = this._pageReferencesRemainingSource(content, remainingSources, sourceId)
      if (!isSourceOwnedPage && hasOtherSourceEvidence) continue

      await this._snapshotPage(this._wikiDir(id), pagePath, 'source_page_removed').catch(() => {})
      await this._removeWikiPath(id, pagePath)
      removed.push(pagePath)
    }
    return removed
  }

  async _removeSourceJobsCache(id, sourceId) {
    const jobsPath = path.join(this._wikiDir(id), '.cache', 'jobs.json')
    const data = await readJson(jobsPath, { version: 1, jobs: [] })
    const jobs = Array.isArray(data.jobs) ? data.jobs : []
    const nextJobs = jobs.filter(job => job.source_id !== sourceId && job.sourceId !== sourceId)
    if (nextJobs.length !== jobs.length) {
      await writeJson(jobsPath, { version: data.version || 1, jobs: nextJobs.slice(0, 100) })
    }
  }

  async _parseRegisteredSource(id, registry, source, options = {}) {
    const createdAt = options.createdAt || nowIso()
    const wikiDir = options.wikiDir || this._wikiDir(id)
    const jobType = options.type || 'source_parse'
    const jobName = options.name || `Parse ${source.title || source.id}`

    await this._appendJob(id, {
      id: `job_${Date.now().toString(36)}`,
      type: jobType,
      name: jobName,
      source_id: source.id,
      status: 'running',
      progress: 20,
      created_at: createdAt,
      updated_at: nowIso(),
    })

    try {
      source.status = 'extracting'
      source.parser_status = 'running'
      source.parser_message = ''
      source.updated_at = nowIso()
      const parser = new WikiDocumentParser({
        wikiDir,
        docsRootPath: this._workDir?.getDocsPath?.() || '',
      })
      const parseResult = await parser.parseSource(source)
      Object.assign(source, parseResult, { updated_at: nowIso() })
    } catch (err) {
      Object.assign(source, {
        status: 'failed',
        parser_status: 'failed',
        parser_message: err.message || 'Document parsing failed',
        updated_at: nowIso(),
      })
    }

    const latestRegistry = await this._loadSources(id)
    const latestSource = latestRegistry.sources.find(item => item.id === source.id)
    if (!latestSource) {
      await this._removeSourceArtifacts(id, source)
      return
    }
    Object.assign(latestSource, source)
    registry = latestRegistry
    source = latestSource

    await this._saveSources(id, registry)
    if (source.parser_status === 'needs_ocr') {
      const providerId = this._defaultOcrProviderId()
      const job = await this._ocrService.registerPendingJob({
        wikiId: id,
        wikiDir,
        source,
        providerId,
      })
      if (providerId) {
        source.status = 'extracting'
        source.parser_status = 'ocr_queued'
        source.parser_message = 'OCR job queued automatically'
        source.updated_at = nowIso()
        await this._saveSources(id, registry)
        await this._appendJob(id, {
          id: `job_${Date.now().toString(36)}_ocr_auto_queued`,
          type: 'source_ocr',
          name: `OCR ${source.title}`,
          source_id: source.id,
          status: 'pending',
          progress: 0,
          message: 'OCR job queued automatically',
          meta: { ocr_job_id: job?.id || '', provider_id: providerId },
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        this._enqueueOcrTask({ wikiId: id, sourceId: source.id, providerId })
      }
    }
    await this._refreshWikiSourceCount(id)
    await this._refreshWikiAssetCount(id)
    await this._appendJob(id, {
      id: `job_${Date.now().toString(36)}_done`,
      type: jobType,
      name: jobName,
      source_id: source.id,
      status: source.status === 'ingested' ? 'completed' : (source.status === 'failed' ? 'failed' : 'pending'),
      progress: source.status === 'ingested' ? 100 : (source.status === 'failed' ? 100 : 40),
      message: source.parser_message || '',
      meta: {
        parser_status: source.parser_status || '',
        parse_stats: source.meta?.parse_stats || {},
        parser_code: source.meta?.parser_code || '',
      },
      created_at: createdAt,
      updated_at: nowIso(),
    })
    if (source.status === 'ingested' && source.parser_status === 'complete') {
      await this._ensureSourceSummaryFallbacks(id)
      this._enqueueAgentMaintenance(id, `${jobType}_completed`)
    }
  }

  async _refreshWikiSourceCount(id) {
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return
    const sources = await this._loadSources(id)
    meta.source_count = sources.sources.length
    meta.updated_at = nowIso()
    await writeJson(metaPath, meta)
    this._db?.updateWiki?.(id, {
      source_count: meta.source_count,
      status: meta.status,
      updated_at: meta.updated_at,
    })

    const registry = await this._loadRegistry()
    const item = registry.wikis.find(w => w.id === id)
    if (item) {
      item.status = meta.status
      item.updated_at = meta.updated_at
      await this._saveRegistry(registry)
    }
  }

  async _migrateWikiMeta(id, meta) {
    if (!meta || typeof meta !== 'object') return meta
    const agent = this._normalizeAgentConfig(meta.agent || {})
    let changed = false
    if (agent.default_write_policy !== 'direct') {
      agent.default_write_policy = 'direct'
      changed = true
    }
    if (!meta.agent || meta.agent.default_write_policy !== agent.default_write_policy) {
      meta.agent = agent
      changed = true
    }
    if (changed) {
      meta.updated_at = nowIso()
      await writeJson(path.join(this._wikiDir(id), 'wiki.json'), meta)
      this._db?.updateWiki?.(id, {
        agent_config: agent,
        updated_at: meta.updated_at,
      })
    }
    return meta
  }

  _modelPricing(providerId, modelId) {
    const providers = this._db?.getSetting?.('providers') || []
    const provider = Array.isArray(providers) ? providers.find(p => p.id === providerId) : null
    const model = provider?.models?.find(m => m.id === modelId)
    return model ? {
      costInput: Number(model.costInput) || 0,
      costOutput: Number(model.costOutput) || 0,
      costCacheRead: Number(model.costCacheRead) || 0,
      costCacheWrite: Number(model.costCacheWrite ?? model.costCacheRead) || 0,
    } : {}
  }

  _defaultOcrProviderId() {
    const providers = this._db?.listOcrProviders?.() || []
    const provider = providers.find(item =>
      item?.enabled !== false &&
      ['mineru', 'paddleocr'].includes(String(item.type || '').toLowerCase()) &&
      item.base_url &&
      item.api_key_ref
    )
    return provider?.id || ''
  }

  _resolveWikiAgentModelConfig(id, runId = '') {
    const providers = this._db?.getSetting?.('providers') || []
    const defaultModels = this._db?.getSetting?.('defaultModels') || {}
    if (!Array.isArray(providers) || !providers.length) {
      throw new Error('请先在设置中配置可用的聊天模型')
    }

    const dbWiki = this._db?.getWiki?.(id)
    const meta = readJsonSync(path.join(this._wikiDir(id), 'wiki.json'), null)
    const agentConfig = {
      ...(meta?.agent || {}),
      ...(dbWiki?.agent_config || {}),
    }
    const ref = agentConfig.model_ref || defaultModels.chat || defaultModels.agent || ''
    const parsed = parseModelRef(ref)
    if (!parsed.modelId) throw new Error('请先配置 WikiAgent 模型或全局聊天模型')

    let provider = null
    if (parsed.scoped) {
      provider = providers.find(p => p.id === parsed.providerId && p.enabled !== false)
    } else {
      provider = providers.find(p => p.enabled !== false && p.models?.some(m => m.id === parsed.modelId && m.enabled !== false))
    }
    const model = provider?.models?.find(m => m.id === parsed.modelId && m.enabled !== false)
    if (!provider || !model) throw new Error(`模型 ${parsed.modelId} 无可用供应商或未启用`)
    if (!provider.apiKey) throw new Error(`模型供应商 ${provider.name || provider.id} 还没有配置 API Key`)

    return {
      providerId: provider.id,
      apiFormat: provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : 'openai'),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || '',
      model: model.id,
      pricing: {
        costInput: Number(model.costInput) || 0,
        costOutput: Number(model.costOutput) || 0,
        costCacheRead: Number(model.costCacheRead) || 0,
        costCacheWrite: Number(model.costCacheWrite ?? model.costCacheRead) || 0,
      },
      runId,
    }
  }

  _enqueueAgentMaintenance(wikiId, reason = 'source_changed') {
    if (!wikiId) return
    const exists = this._agentQueue.some(item => item.wikiId === wikiId)
    if (!exists) this._agentQueue.push({ wikiId, reason })
    this._drainAgentQueue()
  }

  async _drainAgentQueue() {
    if (this._agentQueueRunning) return
    this._agentQueueRunning = true
    try {
      while (this._agentQueue.length) {
        const task = this._agentQueue.shift()
        await this._executeAgentMaintenance(task)
      }
    } finally {
      this._agentQueueRunning = false
    }
  }

  async _executeAgentMaintenance({ wikiId, reason }) {
    try {
      const wiki = await this.getWiki(wikiId)
      const agent = this._normalizeAgentConfig(wiki.data?.agent || {})
      if (agent.mode === 'disabled') {
        await this._appendJob(wikiId, {
          id: `job_${Date.now().toString(36)}_wiki_agent_skipped`,
          type: 'wiki_agent',
          name: 'Run WikiAgent',
          status: 'skipped',
          progress: 0,
          message: 'WikiAgent 已停用',
          meta: { reason },
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        return
      }
      const config = this._resolveWikiAgentModelConfig(wikiId)
      await this.agentRun({
        wikiId,
        ...config,
        instruction: this._buildAgentMaintenanceInstruction(reason),
      })
    } catch (err) {
      await this._appendJob(wikiId, {
        id: `job_${Date.now().toString(36)}_wiki_agent_skipped`,
        type: 'wiki_agent',
        name: 'Run WikiAgent',
        status: 'skipped',
        progress: 0,
        message: err.message || 'WikiAgent skipped',
        meta: { reason },
        created_at: nowIso(),
        updated_at: nowIso(),
      }).catch(() => {})
      await this._setWikiAgentStatus(wikiId, 'idle').catch(() => {})
    }
  }

  _buildAgentMaintenanceInstruction(reason = 'source_changed') {
    const text = String(reason || 'source_changed')
    const parts = [
      `Maintain this Wiki after ${text}.`,
      'Read recent_changes, list_sources, and existing pages before writing.',
      'For each parser_status=complete source that is not yet represented, maintain at least one concise source summary page under pages/summaries/.',
      'If a summary page has frontmatter status: fallback, replace or upgrade it with a real human-readable summary instead of treating it as complete.',
      'Create pages/concepts entries only when the source contains durable reusable concepts, definitions, mechanisms, formulas, or domain terms.',
      'Refresh index.md and overview.md as navigation pages when summaries, concepts, entities, questions, comparisons, or source coverage change.',
      'index.md must be a routing table with Markdown relative links and one-line descriptions so query agents can read it first and choose relevant pages without full-text search.',
      'Preserve human-readable source citations.',
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

  async _ensureSourceSummaryFallbacks(id) {
    const registry = await this._loadSources(id)
    const sources = (registry.sources || []).filter(source =>
      source?.status === 'ingested' &&
      source?.parser_status === 'complete'
    )
    if (!sources.length) return []

    const pagesResult = await this.listPages(id)
    const summaryPages = (pagesResult.data || []).filter(page => String(page.path || '').startsWith('pages/summaries/'))
    const summaries = []
    for (const page of summaryPages) {
      const read = await this.readPage(id, page.path)
      if (read.success) summaries.push({ path: page.path, content: read.data.content || '' })
    }

    const created = []
    for (const source of sources) {
      const markers = [
        source.id,
        source.original_uri,
        source.title,
      ].filter(Boolean).map(item => String(item).toLowerCase())
      const fallbackSummary = summaries.find(page => {
        const haystack = `${page.path}\n${page.content}`.toLowerCase()
        return haystack.includes('status: fallback') &&
          haystack.includes(`source_id: ${String(source.id || '').toLowerCase()}`)
      })
      if (fallbackSummary) {
        const currentHash = String(source.content_hash || '').toLowerCase()
        const fallbackContent = String(fallbackSummary.content || '').toLowerCase()
        const hasCurrentHash = !currentHash || fallbackContent.includes(`source_hash: "${currentHash}"`) || fallbackContent.includes(`source_hash: ${currentHash}`)
        if (!hasCurrentHash) {
          const extractPreview = await this._readSourceExtractPreview(id, source, 3600)
          const content = this._fallbackSourceSummaryContent(source, extractPreview)
          const written = await this.writePage(id, {
            pagePath: fallbackSummary.path,
            title: `${source.title || source.id} Summary`,
            content,
            reason: 'refresh_fallback_source_summary',
            sourceIds: [source.id],
          })
          if (written.success) {
            fallbackSummary.content = content
            created.push({ source_id: source.id, path: fallbackSummary.path, updated: true })
          }
        }
        continue
      }
      const represented = summaries.some(page => {
        const haystack = `${page.path}\n${page.content}`.toLowerCase()
        return markers.some(marker => marker && haystack.includes(marker))
      })
      if (represented) continue

      const pagePath = this._sourceSummaryPath(source)
      const extractPreview = await this._readSourceExtractPreview(id, source, 3600)
      const content = this._fallbackSourceSummaryContent(source, extractPreview)
      const written = await this.writePage(id, {
        pagePath,
        title: `${source.title || source.id} Summary`,
        content,
        reason: 'fallback_source_summary',
        sourceIds: [source.id],
      })
      if (written.success) {
        summaries.push({ path: pagePath, content })
        created.push({ source_id: source.id, path: pagePath })
      }
    }
    return created
  }

  _sourceSummaryPath(source) {
    const title = safeSegment(source?.title || '', 'source')
    const sourceId = safeSegment(source?.id || '', `src-${Date.now().toString(36)}`)
    return `pages/summaries/${title}-${sourceId}.md`
  }

  async _readSourceExtractPreview(id, source, limit = 3600) {
    const rel = source?.extract_path || (source?.id ? `sources/extracts/${source.id}.md` : '')
    if (!rel) return ''
    const wikiDir = this._wikiDir(id)
    const target = path.resolve(wikiDir, rel)
    const root = path.resolve(wikiDir)
    if (target !== root && !isPathInside(root, target)) return ''
    const content = await fs.promises.readFile(target, 'utf-8').catch(() => '')
    return String(content || '').trim().slice(0, limit)
  }

  _fallbackSourceSummaryContent(source, extractPreview = '') {
    const updatedAt = nowIso()
    const title = safeTitle(source?.title || source?.id || 'Source')
    const meta = source?.meta || {}
    const parseStats = meta.parse_stats ? JSON.stringify(meta.parse_stats).slice(0, 1200) : ''
    const previewFence = this._markdownFence(extractPreview || '')
    const lines = [
      '---',
      `id: summary-${source.id}`,
      'type: source_summary',
      `source_id: ${source.id}`,
      `source_title: ${JSON.stringify(title)}`,
      `source_uri: ${JSON.stringify(source.original_uri || '')}`,
      `source_hash: ${JSON.stringify(source.content_hash || '')}`,
      'status: fallback',
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

  _markdownFence(content = '') {
    const matches = String(content || '').match(/`{3,}/g) || []
    const max = matches.reduce((len, item) => Math.max(len, item.length), 3)
    return '`'.repeat(max + 1)
  }

  async _setWikiAgentStatus(id, status) {
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return
    meta.agent = this._normalizeAgentConfig({
      ...(meta.agent || {}),
      status: status || 'idle',
    })
    meta.updated_at = nowIso()
    await writeJson(metaPath, meta)
    this._db?.updateWiki?.(id, {
      agent_config: meta.agent,
      updated_at: meta.updated_at,
    })

    const registry = await this._loadRegistry()
    const item = registry.wikis.find(w => w.id === id)
    if (item) {
      item.agent = meta.agent
      item.updated_at = meta.updated_at
      await this._saveRegistry(registry)
    }
  }

  _normalizeAgentConfig(agent = {}) {
    return {
      ...agent,
      mode: ['supervised', 'disabled'].includes(agent.mode) ? agent.mode : 'supervised',
      status: agent.status || 'idle',
      default_write_policy: 'direct',
    }
  }

  async _touchWiki(id) {
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return
    meta.updated_at = nowIso()
    await writeJson(metaPath, meta)
    this._db?.updateWiki?.(id, { updated_at: meta.updated_at })

    const registry = await this._loadRegistry()
    const item = registry.wikis.find(w => w.id === id)
    if (item) {
      item.updated_at = meta.updated_at
      await this._saveRegistry(registry)
    }
  }

  async _refreshWikiAssetCount(id) {
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return
    const registry = await readJson(path.join(dir, 'assets', 'registry.json'), { version: 1, assets: [] })
    meta.asset_count = Array.isArray(registry.assets) ? registry.assets.length : 0
    meta.updated_at = nowIso()
    await writeJson(metaPath, meta)
    this._db?.updateWiki?.(id, {
      asset_count: meta.asset_count,
      updated_at: meta.updated_at,
    })
  }

  async _refreshWikiPageCount(id, pageCount) {
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return
    if (meta.page_count === pageCount) return
    meta.page_count = pageCount
    meta.updated_at = nowIso()
    await writeJson(metaPath, meta)
    this._db?.updateWiki?.(id, {
      page_count: meta.page_count,
      updated_at: meta.updated_at,
    })
  }

  async _appendJob(id, job) {
    const jobsPath = path.join(this._wikiDir(id), '.cache', 'jobs.json')
    const data = await readJson(jobsPath, { version: 1, jobs: [] })
    const jobs = Array.isArray(data.jobs) ? data.jobs : []
    jobs.unshift(job)
    await writeJson(jobsPath, { version: 1, jobs: jobs.slice(0, 100) })
    this._db?.createWikiJob?.({
      ...job,
      wiki_id: id,
      message: job.message || '',
    })
  }

  async _hashFile(filePath) {
    const hash = crypto.createHash('sha256')
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath)
      stream.on('data', chunk => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', resolve)
    })
    return `sha256:${hash.digest('hex')}`
  }

  _workspaceUri(absPath) {
    const root = this._workDir?.getRootPath?.()
    if (!root) return absPath
    const rel = path.relative(root, absPath).replace(/\\/g, '/')
    if (rel.startsWith('..')) return absPath
    return `workspace:${rel}`
  }

  async _walkMarkdown(absDir, relDir, out, skip = new Set()) {
    if (!fs.existsSync(absDir)) return
    const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name)
      const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/')
      if (entry.isDirectory()) {
        await this._walkMarkdown(abs, rel, out, skip)
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

  _schemaTemplate(title) {
    return `# ${title} Schema\n\n## Layers\n\n- sources: immutable raw files and parsed extracts. The Wiki Agent may read them but must not modify them.\n- pages: LLM-maintained Markdown knowledge pages.\n- assets: local images and other attachments referenced from Markdown by relative paths.\n- history: automatic snapshots created before page writes.\n\n## Page Types\n\n- summaries: source-level summaries.\n- concepts: reusable concept pages.\n- entities: people, organizations, products, projects, and named objects.\n- questions: reusable Q&A pages.\n- comparisons: structured comparisons.\n\n## Write Policy\n\nThe built-in Wiki Agent maintains official Wiki pages directly through the wiki_tool write_page action. Every write should preserve citations, update index.md or overview.md when useful, and rely on automatic history snapshots plus log.md for traceability.\n\n## Citation Policy\n\nImportant claims should cite source ids and locators when available. Uncertain or inferred claims must be marked explicitly.\n`
  }

  _indexTemplate(title) {
    return `---\nid: index\nstatus: active\nupdated_at: ${nowIso()}\n---\n\n# ${title}\n\nThis Wiki is ready. Add sources to let the Wiki Agent build and maintain Markdown knowledge pages.\n\n## Entry\n\n- [Overview](overview.md)\n`
  }

  _overviewTemplate(title) {
    return `---\nid: overview\nstatus: active\nupdated_at: ${nowIso()}\n---\n\n# ${title} Overview\n\nNo sources have been ingested yet.\n`
  }

}
