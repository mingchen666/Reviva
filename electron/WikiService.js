import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { WikiAgentService } from './wiki/WikiAgentService.js'
import { normalizeAssetRecord } from './wiki/WikiAssetRegistry.js'
import { WikiDocumentParser, detectSourceType } from './wiki/WikiDocumentParser.js'
import { normalizeWikiAssetPath } from './wiki/WikiImagePolicy.js'
import { WikiLintService } from './wiki/WikiLintService.js'
import { normalizeWikiPageContent, parseFrontmatter } from './wiki/WikiMarkdownMetadata.js'
import { buildWikiNavigationLines, upsertWikiAutoNavigation } from './wiki/WikiNavigationPolicy.js'
import { WikiOcrService } from './wiki/WikiOcrService.js'
import { WikiPageRegistryService } from './wiki/WikiPageRegistryService.js'
import { WikiSchemaService } from './wiki/WikiSchemaService.js'
import { WikiSearchService } from './wiki/WikiSearchService.js'
import { WikiSemanticAuditService } from './wiki/WikiSemanticAuditService.js'

import { nowIso, mediaTimestamp, safeSegment, safeTitle, parseModelRef, hasModelRunConfig, readJson, readJsonSync, writeJson, isPathInside, MODEL_REF_SEPARATOR } from './wiki/wikiUtils.js'
import { WikiModelConfig, normalizeAgentConfig } from './wiki/WikiModelConfig.js'
import { resolveWritablePagePath, normalizePageContent, normalizeMarkdownAssetImageRefs, normalizeMarkdownImageTarget, snippet } from './wiki/WikiContentNormalizer.js'
import { schemaTemplate, indexTemplate, overviewTemplate } from './wiki/WikiPageTemplates.js'
import { WikiOcrCrud } from './wiki/WikiOcrCrud.js'
import {
  fetchPublicWikiWebSource,
  htmlToWikiMarkdown,
  normalizeWikiWebResearchSettings,
  readWikiWebResponseText,
  webSourceId,
} from './wiki/WikiWebResearchService.js'
import { mediaExtractMarkdown, extractMarkdownLinks, normalizeWikiPageLink, uniqueNavigationLinks, rankNavigationLinks, queryTerms, clipQueryText, citationRecord, resultCitation, snippetWrapper, sourceRemovalMarkers, pageReferencesRemainingSource, buildAgentMaintenanceInstruction, sourceSummaryPath, fallbackSourceSummaryContent, markdownFence, hashFile, walkMarkdown } from './wiki/wikiQueryUtils.js'

const REGISTRY_FILE = 'registry.json'
const LEGACY_WIKI_ROOT = 'wiki'
const LEGACY_NESTED_WIKIS_DIR = 'wikis'











export class WikiService {
  constructor(workDirService, dbService = null, agentService = null, mediaModule = null) {
    this._workDir = workDirService
    this._db = dbService
    this._modelConfig = new WikiModelConfig({ db: dbService, wikiDirResolver: (id) => this._wikiDir(id) })
    this._ocrCrud = new WikiOcrCrud({ db: dbService })
    this._agentService = agentService
    this._mediaModule = mediaModule
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
    this._pageRegistryServices = new Map()
    this._searchServices = new Map()
    this._pageMetadataReady = new Set()
    this._pageMetadataPromises = new Map()
    this._wikiMutationChains = new Map()
    this._activeWikiOperations = new Map()
    this._deletingWikis = new Set()
    this._wikiLifecycleVersions = new Map()
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
    ipcMain.handle('wiki:addMediaSource', (_, id, mediaId, options) => this.addMediaSource(id, mediaId, options))
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
    ipcMain.handle('wiki:runLint', (_, id) => this.runLint(id, { reason: 'manual' }))
    ipcMain.handle('wiki:getLintReport', (_, id) => this.getLintReport(id))
    ipcMain.handle('wiki:runSemanticAudit', (_, id) => this.runSemanticAudit(id, { reason: 'manual' }))
    ipcMain.handle('wiki:getSemanticAudit', (_, id) => this.getSemanticAudit(id))
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

  _pageRegistryService(id) {
    const wikiDir = this._wikiDir(id)
    if (!this._pageRegistryServices.has(wikiDir)) {
      this._pageRegistryServices.set(wikiDir, new WikiPageRegistryService({ wikiDir }))
    }
    return this._pageRegistryServices.get(wikiDir)
  }

  _searchService(id) {
    const wikiDir = this._wikiDir(id)
    if (!this._searchServices.has(wikiDir)) {
      this._searchServices.set(wikiDir, new WikiSearchService({ wikiDir }))
    }
    return this._searchServices.get(wikiDir)
  }

  _wikiRuntimeKey(id) {
    return safeSegment(id, String(id || '').toLowerCase())
  }

  getWikiLifecycleVersion(id) {
    return this._wikiLifecycleVersions.get(this._wikiRuntimeKey(id)) || 0
  }

  _bumpWikiLifecycle(id) {
    const key = this._wikiRuntimeKey(id)
    const next = (this._wikiLifecycleVersions.get(key) || 0) + 1
    this._wikiLifecycleVersions.set(key, next)
    return next
  }

  _isWikiLifecycleCurrent(id, version) {
    if (!id || this._deletingWikis.has(this._wikiRuntimeKey(id))) return false
    if (version !== undefined && version !== null && Number(version) !== this.getWikiLifecycleVersion(id)) return false
    return fs.existsSync(path.join(this._wikiDir(id), 'wiki.json'))
  }

  _canPersistWiki(id) {
    return !!id
      && !this._deletingWikis.has(this._wikiRuntimeKey(id))
      && fs.existsSync(path.join(this._wikiDir(id), 'wiki.json'))
  }

  _assertWikiMutable(id, expectedLifecycleVersion) {
    if (!id) throw new Error('Wiki id is required')
    const key = this._wikiRuntimeKey(id)
    if (this._deletingWikis.has(key)) throw new Error('Wiki is being deleted')
    if (!fs.existsSync(path.join(this._wikiDir(id), 'wiki.json'))) throw new Error('Wiki not found')
    if (expectedLifecycleVersion !== undefined && expectedLifecycleVersion !== null
      && Number(expectedLifecycleVersion) !== this.getWikiLifecycleVersion(id)) {
      throw new Error('Wiki lifecycle changed; stale maintenance write was rejected')
    }
  }

  async _withWikiMutation(id, operation, options = {}) {
    const key = this._wikiRuntimeKey(id)
    const previous = this._wikiMutationChains.get(key) || Promise.resolve()
    const run = previous.catch(() => {}).then(async () => {
      this._assertWikiMutable(id, options.expectedLifecycleVersion)
      return operation()
    })
    const tail = run.catch(() => {})
    this._wikiMutationChains.set(key, tail)
    return run.finally(() => {
      if (this._wikiMutationChains.get(key) === tail) this._wikiMutationChains.delete(key)
    })
  }

  async _waitForWikiMutations(id) {
    const tail = this._wikiMutationChains.get(this._wikiRuntimeKey(id))
    if (tail) await tail.catch(() => {})
  }

  async _trackWikiOperation(id, operation) {
    const key = this._wikiRuntimeKey(id)
    const active = this._activeWikiOperations.get(key) || new Set()
    const run = Promise.resolve().then(operation)
    active.add(run)
    this._activeWikiOperations.set(key, active)
    try {
      return await run
    } finally {
      active.delete(run)
      if (!active.size) this._activeWikiOperations.delete(key)
    }
  }

  async _waitForActiveWikiOperations(id) {
    const active = this._activeWikiOperations.get(this._wikiRuntimeKey(id))
    if (active?.size) await Promise.allSettled([...active])
  }

  _clearWikiRuntimeCaches(id, resolvedWikiDir = '') {
    const wikiDir = resolvedWikiDir || this._wikiDir(id)
    const key = this._wikiRuntimeKey(id)
    this._pageRegistryServices.delete(wikiDir)
    this._searchServices.delete(wikiDir)
    this._pageMetadataReady.delete(wikiDir)
    this._pageMetadataPromises.delete(wikiDir)
    this._wikiMutationChains.delete(key)
    this._activeWikiOperations.delete(key)
  }

  _lintService(id) {
    return new WikiLintService({
      wikiDir: this._wikiDir(id),
      pageRegistry: this._pageRegistryService(id),
    })
  }

  async getWikiSchema(id) {
    const wiki = await this.getWiki(id)
    const title = wiki.success ? (wiki.data?.name || id) : id
    return new WikiSchemaService({
      wikiDir: this._wikiDir(id),
      fallbackFactory: value => this._schemaTemplate(value),
    }).read(title)
  }

  getWebResearchSettings(id) {
    const globalSettings = normalizeWikiWebResearchSettings(this._db?.getSetting?.('wikiWebResearchSettings') || {})
    if (!id) return globalSettings
    const meta = readJsonSync(path.join(this._wikiDir(id), 'wiki.json'), null)
    const agent = this._normalizeAgentConfig(meta?.agent || this._db?.getWiki?.(id)?.agent_config || {})
    const mode = agent.web_research?.mode || 'inherit'
    return {
      ...globalSettings,
      enabled: mode === 'enabled' ? true : (mode === 'disabled' ? false : globalSettings.enabled),
      wiki_mode: mode,
    }
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
      const lowerPath = String(originalPath).toLowerCase()
      const mediaExtensions = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])
      if (lowerPath.endsWith('.media.md') || mediaExtensions.has(path.extname(lowerPath))) {
        let mediaId = ''
        if (lowerPath.endsWith('.media.md')) {
          const reference = await fs.promises.readFile(originalPath, 'utf-8')
          mediaId = reference.match(/^mediaId:\s*([a-z0-9_]+)\s*$/im)?.[1] || ''
        } else {
          const link = this._mediaModule?.repositories?.media?.findActiveMediaSourceLink?.({
            ownerType: 'docs_file',
            ownerId: '',
            ownerLocator: originalPath,
          })
          mediaId = link?.media_id || ''
        }
        if (!mediaId) throw new Error('远程媒体引用缺少有效的 mediaId')
        return await this.addMediaSource(id, mediaId, { referencePath: originalPath, title: data.title || '' })
      }

      const registry = await this._loadSources(id)
      const contentHash = await hashFile(originalPath)
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

  async _readMediaForWiki(mediaId) {
    const query = this._mediaModule?.query
    if (!query) throw new Error('媒体读取服务尚未初始化')
    const metadata = query.query({ mediaId, mode: 'metadata' }, { trustedInternal: true })
    if (!metadata?.success || !metadata.run) throw new Error('该媒体尚未完成解析，请先生成可读转录')

    const segments = []
    let transcriptCursor = null
    let timelineAvailable = true
    for (let page = 0; page < 2000; page++) {
      const result = query.query({
        mediaId,
        mode: 'transcript',
        cursor: transcriptCursor,
        limit: 500,
        maxChars: 30000,
      }, { trustedInternal: true })
      if (!result?.success) throw new Error(result?.message || '媒体转录读取失败')
      segments.push(...(result.segments || []))
      timelineAvailable = timelineAvailable && result.timelineAvailable !== false
      transcriptCursor = result.nextCursor || null
      if (!transcriptCursor) break
      if (page === 1999) throw new Error('媒体转录内容过长，无法完整导入 Wiki')
    }

    const chapters = []
    let chapterCursor = null
    for (let page = 0; page < 100; page++) {
      const result = query.query({ mediaId, mode: 'chapters', cursor: chapterCursor, limit: 200 }, { trustedInternal: true })
      if (!result?.success) break
      chapters.push(...(result.chapters || []))
      chapterCursor = result.nextCursor || null
      if (!chapterCursor) break
    }
    return { metadata, segments, chapters, timelineAvailable }
  }

  _upsertMediaSourceLink(wikiId, source, mediaId) {
    const repository = this._mediaModule?.repositories?.media
    if (!repository?.upsertMediaSourceLink) return null
    return repository.upsertMediaSourceLink({
      mediaId,
      ownerType: 'wiki_source',
      ownerId: wikiId,
      ownerLocator: source.id,
    })
  }

  _removeMediaSourceLink(wikiId, source) {
    if (source?.type !== 'media') return false
    const repository = this._mediaModule?.repositories?.media
    const link = repository?.findActiveMediaSourceLink?.({
      ownerType: 'wiki_source',
      ownerId: wikiId,
      ownerLocator: source.id,
    })
    if (!link) return false
    repository.deleteMediaSourceLink(link.id)
    return true
  }

  async addMediaSource(id, mediaId, options = {}) {
    try {
      const normalizedMediaId = String(mediaId || '').trim()
      if (!normalizedMediaId) throw new Error('mediaId 不能为空')
      const payload = await this._readMediaForWiki(normalizedMediaId)
      const registry = await this._loadSources(id)
      const existing = registry.sources.find(source => source.type === 'media' && (
        source.meta?.media?.media_id === normalizedMediaId || source.original_uri === `media:${normalizedMediaId}`
      ))
      const media = payload.metadata.media || {}
      const run = payload.metadata.run || {}
      const contentHash = `sha256:${crypto.createHash('sha256').update(`${normalizedMediaId}:${run.id || ''}`).digest('hex')}`
      if (existing && existing.content_hash === contentHash && options.refresh !== true) {
        this._upsertMediaSourceLink(id, existing, normalizedMediaId)
        return { success: true, data: existing, duplicate: true }
      }

      const createdAt = existing?.created_at || nowIso()
      const sourceId = options.sourceId || existing?.id || `src_media_${safeSegment(normalizedMediaId, Date.now().toString(36))}`
      const relPath = `sources/extracts/${sourceId}.md`
      let referencePath = String(options.referencePath || existing?.original_path || '')
      if (referencePath) referencePath = this._workDir.resolveAndValidate(referencePath, 'docs')
      const source = existing || { id: sourceId, created_at: createdAt }
      Object.assign(source, {
        type: 'media',
        title: safeTitle(options.title || media.title || media.fileName || '媒体转录'),
        original_uri: `media:${normalizedMediaId}`,
        original_path: referencePath,
        content_hash: contentHash,
        status: 'ingested',
        extract_path: relPath,
        parser_status: 'complete',
        parser_message: payload.timelineAvailable ? '媒体时间轴已导入' : '已导入纯文本转录；来源没有时间戳',
        meta: {
          ...(source.meta || {}),
          media: {
            media_id: normalizedMediaId,
            media_type: media.mediaType || '',
            duration_ms: Number(media.durationMs) || 0,
            run_id: run.id || '',
            timeline_available: payload.timelineAvailable,
            segment_count: payload.segments.length,
            chapter_count: payload.chapters.length,
          },
        },
        updated_at: nowIso(),
      })
      const markdown = mediaExtractMarkdown(source, payload)
      source.size = Buffer.byteLength(markdown, 'utf-8')
      const extractPath = path.join(this._wikiDir(id), relPath)
      await fs.promises.mkdir(path.dirname(extractPath), { recursive: true })
      await fs.promises.writeFile(extractPath, markdown, 'utf-8')
      if (!existing) registry.sources.push(source)
      await this._saveSources(id, registry)
      this._upsertMediaSourceLink(id, source, normalizedMediaId)
      await this._refreshWikiSourceCount(id)
      await this._appendLog(id, `media_source | ${source.id} | ${normalizedMediaId}`)
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_media_source`,
        type: options.refresh ? 'source_reparse' : 'source_ingest',
        name: `${options.refresh ? 'Refresh' : 'Register'} ${source.title}`,
        source_id: source.id,
        status: 'completed',
        progress: 100,
        message: source.parser_message,
        meta: { media_id: normalizedMediaId, run_id: run.id || '' },
        created_at: createdAt,
        updated_at: nowIso(),
      })
      await this._ensureSourceSummaryFallbacks(id)
      this._enqueueAgentMaintenance(id, options.refresh ? 'media_source_refreshed' : 'media_source_ingested')
      return { success: true, data: source, duplicate: false }
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
      if (source.type === 'media') return await this.addMediaSource(id, source.meta?.media?.media_id || '', {
        sourceId: source.id,
        referencePath: source.original_path || '',
        title: source.title || '',
        refresh: true,
      })
      if (source.type === 'note') {
        return { success: false, error: 'Note sources are refreshed by adding the note source again' }
      }

      const originalPath = this._workDir.resolveAndValidate(source.original_path, 'docs')
      const stat = await fs.promises.stat(originalPath)
      if (!stat.isFile()) throw new Error('Source file is not available')

      source.original_path = originalPath
      source.content_hash = await hashFile(originalPath)
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
      return await this._withWikiMutation(id, () => this._deleteSourceUnlocked(id, sourceId))
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async _deleteSourceUnlocked(id, sourceId) {
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
      this._removeMediaSourceLink(id, source)
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
      await this.runLint(id, { reason: `source_deleted:${sourceId}` })
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

  async addWebSource(id, data = {}) {
    try {
      return await this._withWikiMutation(
        id,
        () => this._addWebSourceUnlocked(id, data),
        { expectedLifecycleVersion: data.expectedLifecycleVersion },
      )
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async registerWebImportDocument(id, document, context = {}) {
    try {
      return await this._withWikiMutation(
        id,
        () => this._registerWebImportDocumentUnlocked(id, document, context),
        { expectedLifecycleVersion: context.expectedLifecycleVersion },
      )
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async _registerWebImportDocumentUnlocked(id, document = {}, context = {}) {
    const markdown = String(document.content?.markdown || '').trim()
    if (!markdown) throw new Error('Web import document is empty')
    const requestedUrl = String(context.requestedUrl || document.requestedUrl || '').trim()
    const finalUrl = String(document.finalUrl || requestedUrl).trim()
    const title = safeTitle(document.title || new URL(finalUrl).hostname) || 'Web Source'
    const contentHash = `sha256:${crypto.createHash('sha256').update(markdown).digest('hex')}`
    const sourceId = webSourceId(finalUrl)
    const registry = await this._loadSources(id)
    const existing = registry.sources.find(source => source.original_uri === finalUrl || source.id === sourceId)
    if (existing && existing.content_hash === contentHash) return { success: true, data: existing, duplicate: true }

    const createdAt = existing?.created_at || nowIso()
    const relPath = `sources/web/${sourceId}.md`
    const source = existing || { id: sourceId, created_at: createdAt }
    const retrievedAt = document.fetchedAt || nowIso()
    Object.assign(source, {
      type: 'web',
      title,
      original_uri: finalUrl,
      original_path: '',
      content_hash: contentHash,
      status: 'ingested',
      size: Buffer.byteLength(markdown, 'utf-8'),
      extract_path: relPath,
      parser_status: 'complete',
      parser_message: '',
      meta: {
        ...(source.meta || {}),
        web: {
          query: String(context.query || '').slice(0, 500),
          provider: String(document.provider || context.provider || ''),
          requested_url: requestedUrl,
          final_url: finalUrl,
          content_type: 'text/markdown',
          retrieved_at: retrievedAt,
          request_id: String(document.metadata?.requestId || ''),
          usage: document.metadata?.usage || null,
        },
      },
      updated_at: nowIso(),
    })

    const absPath = path.join(this._wikiDir(id), relPath)
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
    await fs.promises.writeFile(absPath, [
      '---',
      `source_id: ${source.id}`,
      'source_type: web',
      `title: ${JSON.stringify(title)}`,
      `url: ${JSON.stringify(source.original_uri)}`,
      `requested_url: ${JSON.stringify(requestedUrl)}`,
      `retrieved_at: ${retrievedAt}`,
      `provider: ${JSON.stringify(source.meta.web.provider)}`,
      `content_hash: ${JSON.stringify(contentHash)}`,
      '---',
      '',
      markdown,
      '',
    ].join('\n'), 'utf-8')
    if (!existing) registry.sources.push(source)
    await this._saveSources(id, registry)
    await this._refreshWikiSourceCount(id)
    await this._appendLog(id, `web_source | ${source.id} | ${source.original_uri}`)
    await this._appendJob(id, {
      id: `job_${Date.now().toString(36)}_web_source`,
      type: 'source_ingest',
      name: `Register ${title}`,
      source_id: source.id,
      status: 'completed',
      progress: 100,
      message: source.original_uri,
      meta: { provider: source.meta.web.provider, requested_url: requestedUrl },
      created_at: createdAt,
      updated_at: nowIso(),
    })
    if (context.enqueueMaintenance !== false) {
      await this._ensureSourceSummaryFallbacks(id, { unlocked: true })
      this._enqueueAgentMaintenance(id, 'web_source_ingested')
    }
    return { success: true, data: source, duplicate: false }
  }

  async _addWebSourceUnlocked(id, data = {}) {
    try {
      const settings = this.getWebResearchSettings(id)
      if (!settings.enabled) throw new Error('Wiki web research is disabled')
      const url = String(data.url || '').trim()
      const { response, finalUrl } = await fetchPublicWikiWebSource(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RevivaWiki/1.0; +local-knowledge-research)',
          Accept: 'text/html,text/plain,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5',
        },
      })
      if (!response.ok) throw new Error(`Web source fetch failed: HTTP ${response.status}`)
      const contentLength = Number(response.headers.get('content-length') || 0)
      if (contentLength > 5 * 1024 * 1024) throw new Error('Web source is larger than the 5 MB fetch limit')
      const raw = (await readWikiWebResponseText(response, { maxBytes: 5 * 1024 * 1024 })).slice(0, 2_000_000)
      const contentType = response.headers.get('content-type') || ''
      const htmlTitle = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
      const title = safeTitle(data.title || htmlTitle || new URL(finalUrl).hostname) || 'Web Source'
      const markdown = /html|xhtml/i.test(contentType) || /<html\b/i.test(raw)
        ? htmlToWikiMarkdown(raw, title)
        : `# ${title}\n\n${raw.trim()}`
      const contentHash = `sha256:${crypto.createHash('sha256').update(markdown).digest('hex')}`
      const sourceId = webSourceId(finalUrl)
      const registry = await this._loadSources(id)
      const existing = registry.sources.find(source => source.original_uri === finalUrl || source.id === sourceId)
      if (existing && existing.content_hash === contentHash) return { success: true, data: existing, duplicate: true }

      const createdAt = existing?.created_at || nowIso()
      const relPath = `sources/web/${sourceId}.md`
      const source = existing || { id: sourceId, created_at: createdAt }
      Object.assign(source, {
        type: 'web',
        title,
        original_uri: finalUrl,
        original_path: '',
        content_hash: contentHash,
        status: 'ingested',
        size: Buffer.byteLength(markdown, 'utf-8'),
        extract_path: relPath,
        parser_status: 'complete',
        parser_message: '',
        meta: {
          ...(source.meta || {}),
          web: {
            query: String(data.query || '').slice(0, 500),
            provider: String(data.provider || ''),
            requested_url: url,
            final_url: finalUrl,
            content_type: contentType,
            retrieved_at: nowIso(),
          },
        },
        updated_at: nowIso(),
      })

      const absPath = path.join(this._wikiDir(id), relPath)
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
      await fs.promises.writeFile(absPath, [
        '---',
        `source_id: ${source.id}`,
        'source_type: web',
        `title: ${JSON.stringify(title)}`,
        `url: ${JSON.stringify(source.original_uri)}`,
        `retrieved_at: ${source.meta.web.retrieved_at}`,
        `provider: ${JSON.stringify(source.meta.web.provider)}`,
        `query: ${JSON.stringify(source.meta.web.query)}`,
        `content_hash: ${JSON.stringify(contentHash)}`,
        '---',
        '',
        markdown,
        '',
      ].join('\n'), 'utf-8')
      if (!existing) registry.sources.push(source)
      await this._saveSources(id, registry)
      await this._refreshWikiSourceCount(id)
      await this._appendLog(id, `web_source | ${source.id} | ${source.original_uri}`)
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_web_source`,
        type: 'source_ingest',
        name: `Register ${title}`,
        source_id: source.id,
        status: 'completed',
        progress: 100,
        message: source.original_uri,
        meta: { provider: source.meta.web.provider, query: source.meta.web.query },
        created_at: createdAt,
        updated_at: nowIso(),
      })
      if (data.enqueueMaintenance !== false) {
        await this._ensureSourceSummaryFallbacks(id, { unlocked: true })
        this._enqueueAgentMaintenance(id, 'web_source_ingested')
      }
      return { success: true, data: source }
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
      this._clearWikiRuntimeCaches(id)
      this._bumpWikiLifecycle(id)

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
        path.join(dir, '.cache', 'lint'),
        path.join(dir, '.cache', 'search'),
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
          auto_maintain: true,
          web_research: { mode: 'inherit' },
          semantic_audit: {
            enabled: false,
            trigger: 'manual',
            auto_fix: false,
            model_ref: '',
          },
        },
        created_at: createdAt,
        updated_at: createdAt,
      }

      await writeJson(path.join(dir, 'wiki.json'), meta)
      await writeJson(path.join(dir, 'sources', 'registry.json'), { version: 1, sources: [] })
      await writeJson(path.join(dir, 'assets', 'registry.json'), { version: 1, assets: [] })
      await writeJson(path.join(dir, 'pages', 'registry.json'), { version: 1, pages: {} })
      await writeJson(path.join(dir, '.cache', 'jobs.json'), { version: 1, jobs: [] })

      await fs.promises.writeFile(path.join(dir, 'schema.md'), this._schemaTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'index.md'), this._indexTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'overview.md'), this._overviewTemplate(title), 'utf-8')
      await fs.promises.writeFile(path.join(dir, 'log.md'), `# ${title} Log\n\n- ${createdAt}: Wiki created.\n`, 'utf-8')
      await this._ensurePageMetadata(id)

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
    let safeId = ''
    let runtimeKey = ''
    try {
      if (!id) throw new Error('Wiki id is required')
      safeId = safeSegment(id)
      runtimeKey = this._wikiRuntimeKey(safeId)
      if (this._deletingWikis.has(runtimeKey)) throw new Error('Wiki is already being deleted')
      if (!fs.existsSync(path.join(this._wikiDir(safeId), 'wiki.json'))) throw new Error('Wiki not found')
      const dir = this._wikiDir(safeId)
      const target = path.resolve(dir)
      const allowedRoots = [this._rootPath(), this._legacyRootPath()].filter(Boolean).map(item => path.resolve(item).toLowerCase())
      const targetLower = target.toLowerCase()
      const allowed = allowedRoots.some(root => targetLower === root || targetLower.startsWith(root + path.sep))
      if (!allowed) {
        throw new Error('Wiki path is outside workspace wikis directory')
      }
      this._deletingWikis.add(runtimeKey)
      this._bumpWikiLifecycle(safeId)

      this._parseQueue = this._parseQueue.filter(task => task.wikiId !== safeId)
      this._ocrQueue = this._ocrQueue.filter(task => task.wikiId !== safeId)
      this._agentQueue = this._agentQueue.filter(task => task.wikiId !== safeId)
      await this._waitForWikiMutations(safeId)
      await this._waitForActiveWikiOperations(safeId)

      const sourceRegistry = await this._loadSources(safeId).catch(() => ({ sources: [] }))

      const registry = await this._loadRegistry()
      registry.wikis = (registry.wikis || []).filter(item => item.id !== safeId)
      await this._saveRegistry(registry)
      await this._removeWikiFromRegistryFile(this._legacyRegistryPath(), safeId)

      if (fs.existsSync(target)) {
        await fs.promises.rm(target, { recursive: true, force: true })
      }
      for (const source of sourceRegistry.sources || []) this._removeMediaSourceLink(safeId, source)
      this._db?.deleteWiki?.(safeId)
      this._clearWikiRuntimeCaches(safeId, dir)
      return { success: true, data: { id: safeId } }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      if (runtimeKey) this._deletingWikis.delete(runtimeKey)
    }
  }

  async listPages(id) {
    try {
      const dir = this._wikiDir(id)
      await this._ensurePageMetadata(id)
      const pageRoots = ['index.md', 'overview.md']
      const pages = []
      for (const fileName of pageRoots) {
        const filePath = path.join(dir, fileName)
        if (fs.existsSync(filePath)) {
          const stat = await fs.promises.stat(filePath)
          pages.push({ path: fileName, title: fileName.replace(/\.md$/i, ''), type: 'root', updated_at: stat.mtime.toISOString() })
        }
      }
      await walkMarkdown(path.join(dir, 'pages'), 'pages', pages, new Set(['pages/index.md']))
      const pageRegistry = await this._pageRegistryService(id).load()
      for (const page of pages) {
        const record = pageRegistry.pages?.[page.path]
        if (!record) continue
        page.title = record.title || page.title
        page.page_type = record.type || ''
        page.status = record.status || 'active'
        page.source_ids = Array.isArray(record.source_ids) ? record.source_ids : []
      }
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
      return await this._withWikiMutation(
        id,
        () => this._writePageUnlocked(id, data),
        { expectedLifecycleVersion: data.expectedLifecycleVersion },
      )
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async _writePageUnlocked(id, data = {}) {
    try {
      const dir = this._wikiDir(id)
      const title = safeTitle(data.title || '')
      const relPath = this._resolveWritablePagePath(data.pagePath || data.path, title || 'wiki-page')
      const absPath = path.join(dir, relPath)
      const createdAt = nowIso()
      const existingContent = await fs.promises.readFile(absPath, 'utf-8').catch(() => '')
      const sourceIds = Array.isArray(data.sourceIds) ? [...new Set(data.sourceIds.map(String).filter(Boolean))] : null
      if (sourceIds) {
        const registry = await this._loadSources(id)
        const validSourceIds = new Set((registry.sources || []).map(source => String(source.id || '')).filter(Boolean))
        const invalid = sourceIds.filter(sourceId => !validSourceIds.has(sourceId))
        if (invalid.length) throw new Error(`Wiki page references unknown source ids: ${invalid.join(', ')}`)
      }
      let normalized = normalizeWikiPageContent({
        relPath,
        title,
        content: data.content,
        sourceIds,
        status: data.status,
        requireSourceEvidence: !!data.agentWrite,
        existingContent,
        now: createdAt,
      })
      let content = this._normalizeMarkdownAssetImageRefs(normalized.content, relPath)

      await this._snapshotPage(dir, relPath, data.reason || 'wiki_write')
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
      await fs.promises.writeFile(absPath, content, 'utf-8')
      await this._pageRegistryService(id).upsert(relPath, normalized.metadata, content)
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
      let lint = await this.runLint(id, { reason: `write_page:${relPath}` })
      const pageLintErrors = data.agentWrite && lint.success
        ? (lint.data?.issues || []).filter(item => item.severity === 'error' && item.page_path === relPath)
        : []
      if (pageLintErrors.length && normalized.metadata.status !== 'review_required') {
        normalized = normalizeWikiPageContent({
          relPath,
          title: normalized.metadata.title,
          content,
          sourceIds: normalized.metadata.source_ids,
          status: 'review_required',
          existingContent: content,
          now: nowIso(),
        })
        content = this._normalizeMarkdownAssetImageRefs(normalized.content, relPath)
        await fs.promises.writeFile(absPath, content, 'utf-8')
        await this._pageRegistryService(id).upsert(relPath, normalized.metadata, content)
        await this._appendLog(id, `review_required | ${relPath} | deterministic lint error`)
        lint = await this.runLint(id, { reason: `write_page_review_required:${relPath}` })
      }
      return {
        success: true,
        data: {
          path: relPath,
          title: normalized.metadata.title,
          metadata: normalized.metadata,
          lint: lint.success ? lint.data?.summary : null,
        },
      }
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
    let lifecycleVersion = req.lifecycleVersion
    try {
      if (!wikiId) throw new Error('wikiId is required')
      if (lifecycleVersion === undefined || lifecycleVersion === null) lifecycleVersion = this.getWikiLifecycleVersion(wikiId)
      if (!this._isWikiLifecycleCurrent(wikiId, lifecycleVersion)) throw new Error('Wiki not found or lifecycle changed')
      const modelConfig = hasModelRunConfig(req)
        ? {
            providerId: req.providerId,
            apiFormat: req.apiFormat || (req.providerId === 'anthropic' ? 'anthropic' : 'openai'),
            apiKey: req.apiKey,
            baseUrl: req.baseUrl || '',
            model: req.model,
            modelHasVision: req.modelHasVision === true || this._modelHasVision(req.providerId, req.model),
            pricing: req.pricing || this._modelPricing(req.providerId, req.model),
            runId,
          }
        : this._resolveWikiAgentModelConfig(wikiId, runId)

      if (wikiId) {
        await this._setWikiAgentStatus(wikiId, 'running', lifecycleVersion)
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
        lifecycleVersion,
      })
      if (!this._isWikiLifecycleCurrent(wikiId, lifecycleVersion)) {
        return { success: false, error: 'Wiki was deleted or recreated while maintenance was running' }
      }
      if (wikiId && result.success) {
        const fallbackSummaries = await this._ensureSourceSummaryFallbacks(wikiId, { expectedLifecycleVersion: lifecycleVersion })
        const lintResult = await this.runLint(wikiId, { reason: 'agent_maintenance_completed' })
        const wikiState = await this.getWiki(wikiId)
        const auditConfig = this._normalizeAgentConfig(wikiState.data?.agent || {}).semantic_audit
        const semanticAudit = auditConfig.enabled && auditConfig.trigger === 'after_maintenance'
          ? await this.runSemanticAudit(wikiId, { reason: 'after_maintenance', lifecycleVersion })
          : null
        if (fallbackSummaries.length) {
          result.data = {
            ...(result.data || {}),
            fallbackSummaries,
          }
        }
        result.data = {
          ...(result.data || {}),
          lint: lintResult.success ? lintResult.data : null,
          semanticAudit: semanticAudit?.success ? semanticAudit.data : null,
        }
      }
      if (wikiId && this._isWikiLifecycleCurrent(wikiId, lifecycleVersion)) {
        await this._setWikiAgentStatus(wikiId, result.success ? 'idle' : 'failed', lifecycleVersion)
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
      if (wikiId && this._isWikiLifecycleCurrent(wikiId, lifecycleVersion)) {
        await this._setWikiAgentStatus(wikiId, 'failed', lifecycleVersion).catch(() => {})
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
      if (patch.auto_maintain !== undefined) nextAgent.auto_maintain = !!patch.auto_maintain
      if (patch.web_research !== undefined) {
        const web = patch.web_research && typeof patch.web_research === 'object' ? patch.web_research : {}
        nextAgent.web_research = {
          ...(nextAgent.web_research || {}),
          mode: ['inherit', 'enabled', 'disabled'].includes(web.mode) ? web.mode : 'inherit',
        }
      }
      if (patch.semantic_audit !== undefined) {
        const audit = patch.semantic_audit && typeof patch.semantic_audit === 'object' ? patch.semantic_audit : {}
        nextAgent.semantic_audit = {
          ...(nextAgent.semantic_audit || {}),
          enabled: !!audit.enabled,
          trigger: ['manual', 'after_maintenance'].includes(audit.trigger) ? audit.trigger : 'manual',
          auto_fix: false,
          model_ref: String(audit.model_ref || ''),
        }
      }

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
        agentWrite: !!req.agentWrite,
        expectedLifecycleVersion: req.expectedLifecycleVersion,
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
            citation: resultCitation(wiki, item),
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
              citation: resultCitation(wiki, item),
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
      const queryTerms = queryTerms(query)

      for (const wikiId of wikiIds) {
        const wiki = wikiMap.get(wikiId) || { id: wikiId, name: wikiId }
        const indexRead = await this.readPage(wikiId, 'index.md')
        const overviewRead = await this.readPage(wikiId, 'overview.md')
        const rootPages = [
          indexRead.success ? { path: 'index.md', title: 'index', content: indexRead.data.content || '' } : null,
          overviewRead.success ? { path: 'overview.md', title: 'overview', content: overviewRead.data.content || '' } : null,
        ].filter(Boolean)

        const wikiLinks = uniqueNavigationLinks(rootPages.flatMap(page =>
          extractMarkdownLinks(page.content, page.path).map(link => ({
            ...link,
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
          }))
        ))
        const rankedLinks = rankNavigationLinks(wikiLinks, query)
        navigationLinks.push(...rankedLinks)

        const rootText = [
          `## Wiki: ${wiki.name || wikiId} (${wikiId})`,
          ...rootPages.map(page => [
            `### ${page.path}`,
            clipQueryText(page.content, Math.max(1200, Math.floor(maxChars / Math.max(wikiIds.length * 3, 1)))),
          ].join('\n')),
          rankedLinks.length
            ? [
                '### Navigation links',
                ...rankedLinks.slice(0, 20).map(link => `- [${link.title || link.path}](${link.path})${link.context ? ` — ${safeTitle(link.context)}` : ''}`),
              ].join('\n')
            : '',
        ].filter(Boolean).join('\n\n')
        if (rootText && usedChars < maxChars) {
          const chunk = clipQueryText(rootText, maxChars - usedChars)
          if (chunk) {
            contextParts.push(chunk)
            usedChars += chunk.length
            for (const page of rootPages) {
              citations.push(citationRecord({
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
            clipQueryText(read.data.content || '', Math.max(1000, Math.floor(maxChars / Math.max(limit, 1)))),
          ].join('\n')
          if (usedChars < maxChars) {
            const clipped = clipQueryText(chunk, maxChars - usedChars)
            if (clipped) {
              contextParts.push(clipped)
              usedChars += clipped.length
            }
          }
          citations.push(citationRecord(result))
        }

        const search = query
          ? await this.searchWiki(wikiId, { query, scope: options.scope || 'all', limit: Math.max(3, perWikiPageLimit) })
          : { success: true, data: [] }
        for (const item of search.data || []) {
          const hit = {
            ...item,
            wiki_id: wikiId,
            wiki_name: wiki.name || wikiId,
            citation: resultCitation(wiki, item),
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
            `Citation: ${hit.citation || resultCitation(wikiMap.get(hit.wiki_id), hit)}`,
            chunkBody,
          ].filter(Boolean).join('\n')
          if (usedChars < maxChars) {
            const clipped = clipQueryText(chunk, maxChars - usedChars)
            if (clipped) {
              contextParts.push(clipped)
              usedChars += clipped.length
            }
          }
          results.push(hit)
          citations.push(citationRecord(hit))
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
      const scope = String(options.scope || 'all').toLowerCase()
      const sources = (await this.listSources(id)).data || []
      try {
        const results = await this._searchService(id).search({ query, scope, limit, sources })
        return { success: true, data: results, meta: { backend: 'bm25' } }
      } catch (searchErr) {
        console.warn('[WikiService] BM25 search failed, using text fallback:', searchErr.message)
        const fallback = await this._legacySearchWiki(id, { query, scope, limit, sources })
        return { success: true, data: fallback, meta: { backend: 'text_fallback', warning: searchErr.message } }
      }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async _legacySearchWiki(id, { query, scope = 'all', limit = 10, sources = [] } = {}) {
    const terms = queryTerms(query)
    const results = []
    if (scope === 'all' || scope === 'pages' || scope === 'wiki') {
      const pagesResult = await this.listPages(id)
      for (const page of pagesResult.data || []) {
        const read = await this.readPage(id, page.path)
        if (!read.success) continue
        const haystack = `${page.path}\n${read.data.content}`.toLowerCase()
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
        if (!score) continue
        results.push({ kind: 'page', path: page.path, title: page.title, score, snippet: snippetWrapper(read.data.content, terms), search_backend: 'text_fallback' })
      }
    }
    if (scope === 'all' || scope === 'sources' || scope === 'source') {
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
          snippet: snippetWrapper(content || source.parser_message || '', terms),
          search_backend: 'text_fallback',
        })
      }
    }
    return results
      .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
      .slice(0, limit)
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

  async _queryContextChunk(result, maxChars = 2000) {
    const limit = Math.min(Math.max(Number(maxChars || 2000), 500), 10000)
    if (result.kind === 'page' && result.path) {
      const read = await this.readPage(result.wiki_id, result.path)
      if (!read.success) return result.snippet || ''
      return clipQueryText(read.data.content || '', limit)
    }
    if (result.kind === 'source' && result.source_id) {
      const read = await this.readSource(result.wiki_id, result.source_id)
      if (!read.success) return result.snippet || ''
      return clipQueryText(read.data.content || read.data.source?.parser_message || '', limit)
    }
    if (result.kind === 'asset') {
      const lines = [
        `Asset path: ${result.path || ''}`,
        result.source_id ? `Source ID: ${result.source_id}` : '',
        result.page ? `Page: ${result.page}` : '',
        result.vision?.summary ? `Vision summary: ${result.vision.summary}` : '',
        result.snippet ? `Snippet: ${result.snippet}` : '',
      ].filter(Boolean)
      return clipQueryText(lines.join('\n'), limit)
    }
    return clipQueryText(result.snippet || '', limit)
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

  async runLint(id, options = {}) {
    try {
      if (!id) throw new Error('Wiki id is required')
      const sources = (await this.listSources(id)).data || []
      const report = await this._lintService(id).run({
        sources,
        reason: options.reason || 'manual',
      })
      return { success: true, data: report }
    } catch (err) {
      return { success: false, error: err.message, data: null }
    }
  }

  async getLintReport(id) {
    try {
      if (!id) throw new Error('Wiki id is required')
      return { success: true, data: await this._lintService(id).latest() }
    } catch (err) {
      return { success: false, error: err.message, data: null }
    }
  }

  async runSemanticAudit(id, options = {}) {
    const createdAt = nowIso()
    const runId = options.runId || `wiki_audit_${Date.now().toString(36)}_${safeSegment(id || 'wiki', 'wiki')}`
    let lifecycleVersion = options.lifecycleVersion
    try {
      if (!id) throw new Error('Wiki id is required')
      if (lifecycleVersion === undefined || lifecycleVersion === null) lifecycleVersion = this.getWikiLifecycleVersion(id)
      if (!this._isWikiLifecycleCurrent(id, lifecycleVersion)) throw new Error('Wiki not found or lifecycle changed')
      const wikiResult = await this.getWiki(id)
      if (!wikiResult.success) throw new Error(wikiResult.error || 'Wiki not found')
      const agent = this._normalizeAgentConfig(wikiResult.data?.agent || {})
      if (!agent.semantic_audit?.enabled) throw new Error('AI semantic audit is disabled for this Wiki')
      if (!this._agentService?._createModel) throw new Error('Agent model factory is not available')
      const modelConfig = this._resolveWikiAgentModelConfig(id, runId, agent.semantic_audit.model_ref || '')
      const model = this._agentService._createModel(
        modelConfig.providerId,
        modelConfig.apiKey,
        modelConfig.baseUrl,
        modelConfig.model,
        { streaming: false, apiFormat: modelConfig.apiFormat },
      )
      const schema = await this.getWikiSchema(id)
      const lintResult = await this.runLint(id, { reason: `semantic_audit:${options.reason || 'manual'}` })
      const pages = (await this.listPages(id)).data || []
      const sources = (await this.listSources(id)).data || []
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_semantic_audit`,
        type: 'wiki_semantic_audit',
        name: 'Run semantic audit',
        status: 'running',
        progress: 20,
        message: options.reason || 'manual',
        created_at: createdAt,
        updated_at: nowIso(),
      })
      const result = await new WikiSemanticAuditService({ wikiDir: this._wikiDir(id) }).run({
        model,
        wiki: wikiResult.data,
        schema,
        lintReport: lintResult.data || {},
        pages,
        sources,
        pricing: modelConfig.pricing || {},
        canPersist: () => this._isWikiLifecycleCurrent(id, lifecycleVersion),
      })
      const usage = result.usage || {}
      const hasUsage = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'thinkingTokens']
        .some(key => Number(usage[key] || 0) > 0)
      if (hasUsage) {
        this._agentService?._tokenRecorder?.record?.({
          providerId: modelConfig.providerId,
          modelId: modelConfig.model,
          agentId: `wiki-semantic-audit:${id}`,
          conversationId: '',
          usage,
          cost: result.cost || 0,
          latencyMs: result.latency_ms || 0,
          runId,
          iteration: 1,
        })
      }
      if (!this._isWikiLifecycleCurrent(id, lifecycleVersion)) {
        return { success: false, error: 'Wiki was deleted or recreated while semantic audit was running' }
      }
      await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_semantic_audit_done`,
        type: 'wiki_semantic_audit',
        name: 'Run semantic audit',
        status: 'completed',
        progress: 100,
        message: 'Semantic audit completed (report only)',
        meta: {
          run_id: runId,
          model_id: modelConfig.model,
          provider_id: modelConfig.providerId,
          latency_ms: result.latency_ms,
          usage,
          cost: result.cost || 0,
        },
        created_at: createdAt,
        updated_at: nowIso(),
      })
      return { success: true, data: result }
    } catch (err) {
      if (id && this._isWikiLifecycleCurrent(id, lifecycleVersion)) await this._appendJob(id, {
        id: `job_${Date.now().toString(36)}_semantic_audit_failed`,
        type: 'wiki_semantic_audit',
        name: 'Run semantic audit',
        status: 'failed',
        progress: 100,
        message: err.message || 'Semantic audit failed',
        created_at: createdAt,
        updated_at: nowIso(),
      }).catch(() => {})
      return { success: false, error: err.message }
    }
  }

  async getSemanticAudit(id) {
    try {
      if (!id) throw new Error('Wiki id is required')
      return { success: true, data: await new WikiSemanticAuditService({ wikiDir: this._wikiDir(id) }).latest() }
    } catch (err) {
      return { success: false, error: err.message, data: null }
    }
  }

  async listOcrProviders() {
    return this._ocrCrud.listProviders()
  }

  async createOcrProvider(data = {}) {
    return this._ocrCrud.createProvider(data)
  }

  async updateOcrProvider(providerId, data = {}) {
    return this._ocrCrud.updateProvider(providerId, data)
  }

  async deleteOcrProvider(providerId) {
    return this._ocrCrud.deleteProvider(providerId)
  }

  async listOcrJobs(id, sourceId = '') {
    return this._ocrCrud.listJobs(id, sourceId)
  }

  _resolveWritablePagePath(pagePath, title = 'wiki-page') {
    return resolveWritablePagePath(pagePath, title)
  }

  _normalizePageContent({ relPath, title, content }) {
    return normalizePageContent({ relPath, title, content })
  }

  _normalizeMarkdownAssetImageRefs(markdown, relPath) {
    return normalizeMarkdownAssetImageRefs(markdown, relPath)
  }

  async recordAssetVision(id, assetPath, result = {}) {
    const normalizedPath = normalizeWikiAssetPath(assetPath)
    if (!normalizedPath.startsWith('assets/images/')) return false
    const registryPath = path.join(this._wikiDir(id), 'assets', 'registry.json')
    const registry = await readJson(registryPath, { version: 1, assets: [] })
    const asset = (registry.assets || []).find(item => normalizeWikiAssetPath(item.path) === normalizedPath)
    if (!asset) return false
    asset.vision = {
      status: result.success ? 'complete' : 'failed',
      summary: result.success ? String(result.content || '').trim() : '',
      model: String(result.model || ''),
      updated_at: nowIso(),
      error: result.success ? '' : String(result.message || result.error || ''),
    }
    await writeJson(registryPath, { version: registry.version || 1, assets: registry.assets || [] })
    return true
  }

  _normalizeMarkdownImageTarget(rawTarget, relPath) {
    return normalizeMarkdownImageTarget(rawTarget, relPath)
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
    if (!this._canPersistWiki(id)) return false
    const dir = this._wikiDir(id)
    const logPath = path.join(dir, 'log.md')
    await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
    await fs.promises.appendFile(logPath, `- ${nowIso()}: ${String(message || '').replace(/\r?\n/g, ' ').trim()}\n`, 'utf-8')
    return true
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
    if (!this._canPersistWiki(task.wikiId)) return
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
        await this._trackWikiOperation(task.wikiId, () => this._executeParseTask(task))
      }
    } finally {
      this._parseQueueRunning = false
    }
  }

  async _executeParseTask(task) {
    const { wikiId, sourceId } = task || {}
    if (!wikiId || !sourceId) return
    if (!this._canPersistWiki(wikiId)) return
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
    if (!this._canPersistWiki(task.wikiId)) return
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
        await this._trackWikiOperation(task.wikiId, () => this._executeOcrTask(task))
      }
    } finally {
      this._ocrQueueRunning = false
    }
  }

  async _executeOcrTask({ wikiId, sourceId, providerId = '' }) {
    if (!this._canPersistWiki(wikiId)) return
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

  _pageReferencesSource(content, pagePath, source) {
    const haystack = `${pagePath}\n${content}`.replace(/\\/g, '/').toLowerCase()
    return sourceRemovalMarkers(source).some(marker => haystack.includes(marker))
  }

  async _removeSourceKnowledgePages(id, source, remainingSources = []) {
    const sourceId = source?.id || ''
    if (!sourceId) return []
    await this._ensurePageMetadata(id)
    const pageRegistry = this._pageRegistryService(id)
    const linkedRecords = await pageRegistry.recordsForSource(sourceId)
    if (linkedRecords.length) {
      const removed = []
      for (const record of linkedRecords) {
        const pagePath = String(record.pagePath || '')
        if (!pagePath.startsWith('pages/')) continue
        if (record.type === 'summary') {
          await this._snapshotPage(this._wikiDir(id), pagePath, 'source_page_removed').catch(() => {})
          await this._removeWikiPath(id, pagePath)
          await pageRegistry.remove(pagePath)
          removed.push(pagePath)
          continue
        }
        const read = await this.readPage(id, pagePath)
        if (!read.success) continue
        const remainingSourceIds = (record.source_ids || []).filter(item => item !== sourceId)
        await this._writePageUnlocked(id, {
          pagePath,
          title: record.title || '',
          content: read.data.content || '',
          sourceIds: remainingSourceIds,
          status: remainingSourceIds.length ? 'stale' : 'unsupported',
          reason: remainingSourceIds.length ? 'source_removed_page_stale' : 'source_removed_page_unsupported',
        })
      }
      return removed
    }

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
      const hasOtherSourceEvidence = pageReferencesRemainingSource(content, remainingSources, sourceId)
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
    if (!meta.agent || JSON.stringify(meta.agent) !== JSON.stringify(agent)) {
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
    return this._modelConfig.modelPricing(providerId, modelId)
  }

  _modelHasVision(providerId, modelId) {
    return this._modelConfig.modelHasVision(providerId, modelId)
  }

  _defaultOcrProviderId() {
    return this._modelConfig.defaultOcrProviderId()
  }

  _resolveWikiAgentModelConfig(id, runId = '', overrideRef = '') {
    return this._modelConfig.resolveWikiAgentModelConfig(id, runId, overrideRef)
  }

  _enqueueAgentMaintenance(wikiId, reason = 'source_changed') {
    if (!wikiId) return
    if (!this._canPersistWiki(wikiId)) return
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
      if (!wiki.success || !this._canPersistWiki(wikiId)) return
      const agent = this._normalizeAgentConfig(wiki.data?.agent || {})
      if (agent.mode === 'disabled' || agent.auto_maintain === false) {
        await this._appendJob(wikiId, {
          id: `job_${Date.now().toString(36)}_wiki_agent_skipped`,
          type: 'wiki_agent',
          name: 'Run WikiAgent',
          status: 'skipped',
          progress: 0,
          message: agent.mode === 'disabled' ? 'WikiAgent 已停用' : 'WikiAgent 自动维护已关闭',
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
        instruction: buildAgentMaintenanceInstruction(reason),
      })
    } catch (err) {
      if (!this._canPersistWiki(wikiId)) return
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

  async _ensureSourceSummaryFallbacks(id, options = {}) {
    const withLifecycle = data => ({
      ...(data || {}),
      ...(options.expectedLifecycleVersion === undefined ? {} : { expectedLifecycleVersion: options.expectedLifecycleVersion }),
    })
    const writePage = options.unlocked
      ? (data => this._writePageUnlocked(id, withLifecycle(data)))
      : (data => this.writePage(id, withLifecycle(data)))
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
        return (haystack.includes('status: fallback') || haystack.includes('fallback: true')) &&
          haystack.includes(`source_id: ${String(source.id || '').toLowerCase()}`)
      })
      if (fallbackSummary) {
        const currentHash = String(source.content_hash || '').toLowerCase()
        const fallbackContent = String(fallbackSummary.content || '').toLowerCase()
        const hasCurrentHash = !currentHash || fallbackContent.includes(`source_hash: "${currentHash}"`) || fallbackContent.includes(`source_hash: ${currentHash}`)
        if (!hasCurrentHash) {
          const extractPreview = await this._readSourceExtractPreview(id, source, 3600)
          const content = fallbackSourceSummaryContent(source, extractPreview)
          const written = await writePage({
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

      const pagePath = sourceSummaryPath(source)
      const extractPreview = await this._readSourceExtractPreview(id, source, 3600)
      const content = fallbackSourceSummaryContent(source, extractPreview)
      const written = await writePage({
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
    await this._refreshRootNavigationFallbacks(id, {
      unlocked: !!options.unlocked,
      expectedLifecycleVersion: options.expectedLifecycleVersion,
    })
    return created
  }

  async _refreshRootNavigationFallbacks(id, options = {}) {
    const pagesResult = await this.listPages(id)
    const pages = (pagesResult.data || [])
      .filter(page => String(page.path || '').startsWith('pages/'))
      .sort((a, b) => String(a.title || a.path || '').localeCompare(String(b.title || b.path || ''), 'zh-CN'))
    const sourcesRegistry = await this._loadSources(id)
    const completeSources = (sourcesRegistry.sources || []).filter(source => source.status === 'ingested' && source.parser_status === 'complete')
    const navigationLines = buildWikiNavigationLines(pages)
    if (!navigationLines.length) return false
    const withLifecycle = data => ({
      ...data,
      ...(options.expectedLifecycleVersion === undefined ? {} : { expectedLifecycleVersion: options.expectedLifecycleVersion }),
    })
    const writePage = options.unlocked
      ? (data => this._writePageUnlocked(id, withLifecycle(data)))
      : (data => this.writePage(id, withLifecycle(data)))
    const wiki = await this.getWiki(id)
    const wikiTitle = safeTitle(wiki.data?.name || 'Wiki')
    const indexRead = await this.readPage(id, 'index.md')
    const overviewRead = await this.readPage(id, 'overview.md')
    const indexCurrent = indexRead.data?.content || this._indexTemplate(wikiTitle)
    const overviewCurrent = overviewRead.data?.content || this._overviewTemplate(wikiTitle)
    const indexContent = upsertWikiAutoNavigation(indexCurrent, {
      heading: '知识导航',
      navigationLines,
    })
    const overviewContent = upsertWikiAutoNavigation(overviewCurrent, {
      heading: '知识覆盖',
      intro: `当前已完成解析 ${completeSources.length} 个来源，共维护 ${pages.length} 个知识页面。`,
      navigationLines,
    })
    const indexChanged = String(parseFrontmatter(indexCurrent).body || indexCurrent).trim() !== indexContent.trim()
    const overviewChanged = String(parseFrontmatter(overviewCurrent).body || overviewCurrent).trim() !== overviewContent.trim()
    const indexWritten = indexChanged
      ? await writePage({
          pagePath: 'index.md',
          title: wikiTitle,
          content: indexContent,
          reason: 'sync_fallback_navigation',
        })
      : { success: true }
    const overviewWritten = overviewChanged
      ? await writePage({
          pagePath: 'overview.md',
          title: `${wikiTitle} Overview`,
          content: overviewContent,
          reason: 'sync_fallback_navigation',
        })
      : { success: true }
    return !!(indexWritten.success && overviewWritten.success)
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

  async _setWikiAgentStatus(id, status, expectedLifecycleVersion = undefined) {
    if (!this._canPersistWiki(id)) return false
    if (expectedLifecycleVersion !== undefined && !this._isWikiLifecycleCurrent(id, expectedLifecycleVersion)) return false
    const dir = this._wikiDir(id)
    const metaPath = path.join(dir, 'wiki.json')
    const meta = await readJson(metaPath, null)
    if (!meta) return false
    if (expectedLifecycleVersion !== undefined && !this._isWikiLifecycleCurrent(id, expectedLifecycleVersion)) return false
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
    return true
  }

  _normalizeAgentConfig(agent = {}) {
    return normalizeAgentConfig(agent)
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
    if (!this._canPersistWiki(id)) return false
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
    return true
  }

  _workspaceUri(absPath) {
    const root = this._workDir?.getRootPath?.()
    if (!root) return absPath
    const rel = path.relative(root, absPath).replace(/\\/g, '/')
    if (rel.startsWith('..')) return absPath
    return `workspace:${rel}`
  }

  async _ensurePageMetadata(id) {
    const wikiDir = this._wikiDir(id)
    if (this._pageMetadataReady.has(wikiDir)) return
    if (this._pageMetadataPromises.has(wikiDir)) return this._pageMetadataPromises.get(wikiDir)
    const run = this._ensurePageMetadataUnlocked(id, wikiDir)
    this._pageMetadataPromises.set(wikiDir, run)
    try {
      await run
    } finally {
      if (this._pageMetadataPromises.get(wikiDir) === run) this._pageMetadataPromises.delete(wikiDir)
    }
  }

  async _ensurePageMetadataUnlocked(id, wikiDir) {
    const files = []
    for (const rootFile of ['index.md', 'overview.md']) {
      const abs = path.join(wikiDir, rootFile)
      if (fs.existsSync(abs)) files.push({ abs, rel: rootFile })
    }
    const pages = []
    await walkMarkdown(path.join(wikiDir, 'pages'), 'pages', pages)
    for (const page of pages) files.push({ abs: path.join(wikiDir, page.path), rel: page.path })

    const sources = await this._loadSources(id)
    const validSourceIds = new Set((sources.sources || []).map(source => String(source.id || '')).filter(Boolean))
    const registryService = this._pageRegistryService(id)
    for (const file of files) {
      const current = await fs.promises.readFile(file.abs, 'utf-8').catch(() => '')
      if (!current) continue
      const parsed = parseFrontmatter(current)
      const meta = parsed.attributes || {}
      const hasRequired = meta.id && meta.type && meta.title && meta.status && Array.isArray(meta.source_ids) && Number(meta.schema_version) === 1
      if (hasRequired) {
        await registryService.upsert(file.rel, {
          id: String(meta.id),
          type: String(meta.type),
          title: String(meta.title),
          status: String(meta.status),
          source_ids: meta.source_ids.map(String),
          schema_version: Number(meta.schema_version || 1),
          updated_at: String(meta.updated_at || nowIso()),
        }, current)
        continue
      }
      const legacySources = [
        ...(Array.isArray(meta.source_ids) ? meta.source_ids : []),
        meta.source_id,
      ].map(String).filter(sourceId => validSourceIds.has(sourceId))
      const normalized = normalizeWikiPageContent({
        relPath: file.rel,
        title: String(meta.title || ''),
        content: meta.status === 'fallback'
          ? current.replace(/^status:\s*fallback\s*$/m, 'status: review_required\nfallback: true')
          : current,
        sourceIds: legacySources,
        status: meta.status === 'fallback' ? 'review_required' : '',
        existingContent: current,
        now: nowIso(),
      })
      await this._snapshotPage(wikiDir, file.rel, 'page_metadata_migration').catch(() => {})
      await fs.promises.writeFile(file.abs, normalized.content, 'utf-8')
      await registryService.upsert(file.rel, normalized.metadata, normalized.content)
    }
    this._pageMetadataReady.add(wikiDir)
  }

  _schemaTemplate(title) {
    return schemaTemplate(title)
  }

  _indexTemplate(title) {
    return indexTemplate(title)
  }

  _overviewTemplate(title) {
    return overviewTemplate(title)
  }

}

