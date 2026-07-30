// electron/DatabaseService.js — Database service class wrapping better-sqlite3
import path from 'node:path'
import fs from 'node:fs'
import { DatabaseContext, getDatabaseDriver } from './db/DatabaseContext.js'
import { SettingsRepository } from './db/repositories/SettingsRepository.js'
import { MemoryRepository } from './db/repositories/MemoryRepository.js'
import { LearningMemoryRepository } from './learning-memory/LearningMemoryRepository.js'
import { RecycleBinRepository } from './db/repositories/RecycleBinRepository.js'
import { UsageRepository } from './db/repositories/UsageRepository.js'
import { NotesRepository } from './db/repositories/NotesRepository.js'
import { WorkspaceRepository } from './db/repositories/WorkspaceRepository.js'
import { ExtensionRepository } from './db/repositories/ExtensionRepository.js'
import { TaskRepository } from './db/repositories/TaskRepository.js'
import { ConversationRepository } from './db/repositories/ConversationRepository.js'
import { AgentRepository } from './db/repositories/AgentRepository.js'
import { WikiRepository } from './db/repositories/WikiRepository.js'
import { PdfRepository } from './db/repositories/PdfRepository.js'
import { WebImportRepository } from './db/repositories/WebImportRepository.js'
import { QuickInputRepository } from './db/repositories/QuickInputRepository.js'
import { MediaRepository } from './media/persistence/MediaRepository.js'
import { MediaLocationRepository } from './media/persistence/MediaLocationRepository.js'
import { MediaRunRepository } from './media/persistence/MediaRunRepository.js'
import { MediaArtifactRepository } from './media/persistence/MediaArtifactRepository.js'
import { SchemaManager } from './db/schema/createSchema.js'
import { LegacyMigrationManager } from './db/schema/migrations/legacyMigrations.js'
import { VersionedMigrationManager } from './db/schema/migrations/versionedMigrations.js'
import { SeedManager } from './db/schema/seeds/baseSeeds.js'
import {
  DB_FILE_NAME,
  WORKSPACE_META_DIR,
} from './db/helpers.js'

export class DatabaseService {
  static workspaceDbPath(rootPath) {
    return path.join(path.resolve(rootPath), WORKSPACE_META_DIR, DB_FILE_NAME)
  }

  static checkDatabaseIntegrity(dbPath) {
    const BetterSqlite3 = getDatabaseDriver()
    if (!BetterSqlite3) return { ok: false, error: 'better-sqlite3 is unavailable' }
    const resolvedPath = path.resolve(dbPath)
    if (!fs.existsSync(resolvedPath)) return { ok: false, error: '数据库文件不存在' }
    let db = null
    try {
      db = new BetterSqlite3(resolvedPath, { readonly: true, fileMustExist: true })
      const result = db.pragma('integrity_check', { simple: true })
      return result === 'ok' ? { ok: true } : { ok: false, error: String(result || 'integrity_check failed') }
    } catch (error) {
      return { ok: false, error: error.message }
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }

  constructor() {
    this._context = new DatabaseContext()
    this._settingsRepository = new SettingsRepository(this._context)
    this._memoryRepository = new MemoryRepository(this._context)
    this._learningMemoryRepository = new LearningMemoryRepository(this._context)
    this._recycleBinRepository = new RecycleBinRepository(this._context)
    this._usageRepository = new UsageRepository(this._context)
    this._notesRepository = new NotesRepository(this._context)
    this._workspaceRepository = new WorkspaceRepository(this._context)
    this._extensionRepository = new ExtensionRepository(this._context)
    this._taskRepository = new TaskRepository(this._context)
    this._conversationRepository = new ConversationRepository(this._context)
    this._agentRepository = new AgentRepository(this._context)
    this._wikiRepository = new WikiRepository(this._context)
    this._pdfRepository = new PdfRepository(this._context)
    this._webImportRepository = new WebImportRepository(this._context)
    this._quickInputRepository = new QuickInputRepository(this._context)
    this._mediaRepository = new MediaRepository(this._context)
    this._mediaLocationRepository = new MediaLocationRepository(this._context)
    this._mediaRunRepository = new MediaRunRepository(this._context)
    this._mediaArtifactRepository = new MediaArtifactRepository(this._context)
    this._schemaManager = new SchemaManager(this._context)
    this._legacyMigrationManager = new LegacyMigrationManager(this._context)
    this._versionedMigrationManager = new VersionedMigrationManager(this._context)
    this._seedManager = new SeedManager(this._context)
  }

  get _db() { return this._context.db }
  set _db(value) { this._context.db = value }
  get _dbPath() { return this._context.dbPath }
  set _dbPath(value) { this._context.dbPath = value }

  init(dbPath) {
    const BetterSqlite3 = getDatabaseDriver()
    if (!BetterSqlite3) {
      console.warn('Database module not available')
      return null
    }
    if (!dbPath) {
      dbPath = ':memory:'
    } else {
      const dbDir = path.dirname(dbPath)
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    }
    this._dbPath = dbPath
    this._db = new BetterSqlite3(dbPath)
    this._db.pragma('journal_mode = WAL')
    this._db.pragma('foreign_keys = ON')
    this._createTables()
    this._migrateTables()
    this._runVersionedMigrations()
    this._seedBuiltinData()
    return this._db
  }

  close() {
    if (this._db) { this._db.close(); this._db = null }
  }

  async backupTo(filePath) {
    if (!this._db) throw new Error('Database is not initialized')
    const targetPath = path.resolve(filePath)
    const targetDir = path.dirname(targetPath)
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
    if (typeof this._db.backup === 'function') {
      await this._db.backup(targetPath)
      return targetPath
    }
    if (!this._dbPath || this._dbPath === ':memory:') throw new Error('Database backup API is unavailable')
    await fs.promises.copyFile(this._dbPath, targetPath)
    return targetPath
  }

  async relocateToWorkspace(rootPath) {
    const BetterSqlite3 = getDatabaseDriver()
    if (!rootPath || !BetterSqlite3 || !this._db) return false
    const dbDir = path.join(rootPath, WORKSPACE_META_DIR)
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    const newDbPath = DatabaseService.workspaceDbPath(rootPath)

    // If already at this path, skip
    if (path.resolve(this._dbPath) === path.resolve(newDbPath)) return true

    try {
      const workspaceDbExists = fs.existsSync(newDbPath)
      this._db.close()
      const newDb = new BetterSqlite3(newDbPath)
      newDb.pragma('journal_mode = WAL')
      newDb.pragma('foreign_keys = ON')
      this._db = newDb
      this._dbPath = newDbPath
      this._createTables()
      this._migrateTables()
      this._runVersionedMigrations()
      this._seedBuiltinData()
      this.setSetting('workdir_root', path.resolve(rootPath))
      console.log(workspaceDbExists ? '[DB] Switched to workspace database:' : '[DB] Created workspace database:', newDbPath)
      return true
    } catch (err) {
      console.error('[DB] Relocation error:', err)
      return false
    }
  }

  get db() { return this._db }

  get mediaRepositories() {
    return {
      media: this._mediaRepository,
      locations: this._mediaLocationRepository,
      runs: this._mediaRunRepository,
      artifacts: this._mediaArtifactRepository,
    }
  }

  // ─── Spaces ───

  listSpaces() { return this._workspaceRepository.listSpaces() }
  getSpace(id) { return this._workspaceRepository.getSpace(id) }
  createSpace(data) { return this._workspaceRepository.createSpace(data) }
  updateSpace(id, data) { return this._workspaceRepository.updateSpace(id, data) }
  deleteSpace(id) { return this._workspaceRepository.deleteSpace(id) }
  spaceDocCount(id) { return this._workspaceRepository.spaceDocCount(id) }

  // ─── Documents ───

  listDocs(spaceId) { return this._workspaceRepository.listDocs(spaceId) }
  createDoc(data) { return this._workspaceRepository.createDoc(data) }
  updateDoc(id, data) { return this._workspaceRepository.updateDoc(id, data) }
  deleteDoc(id) { return this._workspaceRepository.deleteDoc(id) }

  // ─── Conversations ───

  _parseConv(row) { return this._conversationRepository._parseConv(row) }
  _parseMsg(row) { return this._conversationRepository._parseMsg(row) }
  _parseConvGroup(row) { return this._conversationRepository._parseConvGroup(row) }
  listConvs(spaceId, groupId) { return this._conversationRepository.listConvs(spaceId, groupId) }
  getConv(id) { return this._conversationRepository.getConv(id) }
  createConv(data) { return this._conversationRepository.createConv(data) }
  updateConv(id, data) { return this._conversationRepository.updateConv(id, data) }
  deleteConv(id) { return this._conversationRepository.deleteConv(id) }
  createConversationBranch(data) { return this._conversationRepository.createConversationBranch(data) }

  // ─── Conversation Groups ───

  listConvGroups() { return this._conversationRepository.listConvGroups() }
  createConvGroup(data) { return this._conversationRepository.createConvGroup(data) }
  updateConvGroup(id, data) { return this._conversationRepository.updateConvGroup(id, data) }
  deleteConvGroup(id) { return this._conversationRepository.deleteConvGroup(id) }

  // ─── Messages ───

  listMsgs(convId) { return this._conversationRepository.listMsgs(convId) }
  getMsg(id) { return this._conversationRepository.getMsg(id) }
  getPreviousUserMsg(convId, assistantMsgId) { return this._conversationRepository.getPreviousUserMsg(convId, assistantMsgId) }
  listMsgsPaginated(convId, limit = 30, offset = 0) { return this._conversationRepository.listMsgsPaginated(convId, limit, offset) }
  countMsgs(convId) { return this._conversationRepository.countMsgs(convId) }
  createMsg(data) { return this._conversationRepository.createMsg(data) }
  deleteMsg(id) { return this._conversationRepository.deleteMsg(id) }
  updateMsg(id, data) { return this._conversationRepository.updateMsg(id, data) }

  // ─── Agents ───

  _normalizeAgentField(field, value) { return this._agentRepository._normalizeAgentField(field, value) }
  _normalizeBuiltinAgentTemplate(data = {}) { return this._agentRepository._normalizeBuiltinAgentTemplate(data) }
  _builtinAgentTemplatePayload(template) { return this._agentRepository._builtinAgentTemplatePayload(template) }
  _agentRowFieldValue(row, field) { return this._agentRepository._agentRowFieldValue(row, field) }
  _hasBuiltinTemplate(row) { return this._agentRepository._hasBuiltinTemplate(row) }
  _agentLooksUserEdited(row) { return this._agentRepository._agentLooksUserEdited(row) }
  _deriveBuiltinAgentOverrides(row, template) { return this._agentRepository._deriveBuiltinAgentOverrides(row, template) }
  _normalizeBuiltinAgentOverrides(row, storedOverrides = {}, nextTemplate = {}) { return this._agentRepository._normalizeBuiltinAgentOverrides(row, storedOverrides, nextTemplate) }
  _applyBuiltinAgentTemplateOverrides(templatePayload, overrides = {}) { return this._agentRepository._applyBuiltinAgentTemplateOverrides(templatePayload, overrides) }
  _applyBuiltinAgentOverrides(row, data = {}) { return this._agentRepository._applyBuiltinAgentOverrides(row, data) }
  _parseAgent(row) { return this._agentRepository._parseAgent(row) }
  syncBuiltinAgentTemplate(data = {}) { return this._agentRepository.syncBuiltinAgentTemplate(data) }
  listAgents() { return this._agentRepository.listAgents() }
  getAgent(id) { return this._agentRepository.getAgent(id) }
  createAgent(data) { return this._agentRepository.createAgent(data) }
  updateAgent(id, data) { return this._agentRepository.updateAgent(id, data) }
  deleteAgent(id) { return this._agentRepository.deleteAgent(id) }
  isEnglishNameUnique(englishName, excludeId = '') { return this._agentRepository.isEnglishNameUnique(englishName, excludeId) }
  // ─── Custom Skills ───

  _parseSkill(row) { return this._extensionRepository._parseSkill(row) }
  listSkills() { return this._extensionRepository.listSkills() }
  createSkill(data) { return this._extensionRepository.createSkill(data) }
  updateSkill(id, data) { return this._extensionRepository.updateSkill(id, data) }
  deleteSkill(id) { return this._extensionRepository.deleteSkill(id) }

  // ─── Custom Tools ───

  listTools() { return this._extensionRepository.listTools() }
  createTool(data) { return this._extensionRepository.createTool(data) }
  updateTool(id, data) { return this._extensionRepository.updateTool(id, data) }
  deleteTool(id) { return this._extensionRepository.deleteTool(id) }

  // ─── MCP Servers ───

  listMcpServers() { return this._extensionRepository.listMcpServers() }
  getMcpServer(id) { return this._extensionRepository.getMcpServer(id) }
  createMcpServer(data) { return this._extensionRepository.createMcpServer(data) }
  updateMcpServer(id, data) { return this._extensionRepository.updateMcpServer(id, data) }
  deleteMcpServer(id) { return this._extensionRepository.deleteMcpServer(id) }

  // ─── Quick Inputs ───

  listQuickInputs() { return this._quickInputRepository.listQuickInputs() }
  getQuickInput(id) { return this._quickInputRepository.getQuickInput(id) }
  createQuickInput(data) { return this._quickInputRepository.createQuickInput(data) }
  updateQuickInput(id, data) { return this._quickInputRepository.updateQuickInput(id, data) }
  deleteQuickInput(id) { return this._quickInputRepository.deleteQuickInput(id) }
  reorderQuickInputs(ids) { return this._quickInputRepository.reorderQuickInputs(ids) }

  // ─── Custom Sub Agents ───

  listSubAgents() { return this._extensionRepository.listSubAgents() }
  createSubAgent(data) { return this._extensionRepository.createSubAgent(data) }
  updateSubAgent(id, data) { return this._extensionRepository.updateSubAgent(id, data) }
  deleteSubAgent(id) { return this._extensionRepository.deleteSubAgent(id) }

  // ─── Tasks ───

  listTasks() { return this._taskRepository.listTasks() }
  listTasksByGroup(groupId, toolIds) { return this._taskRepository.listTasksByGroup(groupId, toolIds) }
  getTask(id) { return this._taskRepository.getTask(id) }
  createTask(data) { return this._taskRepository.createTask(data) }
  updateTask(id, data) { return this._taskRepository.updateTask(id, data) }
  deleteTask(id) { return this._taskRepository.deleteTask(id) }

  // ─── LLM Wiki ───

  _parseWiki(row) { return this._wikiRepository._parseWiki(row) }
  _parseWikiSource(row) { return this._wikiRepository._parseWikiSource(row) }
  _parseWikiJob(row) { return this._wikiRepository._parseWikiJob(row) }
  _parseOcrProvider(row) { return this._wikiRepository._parseOcrProvider(row) }
  _parseWikiOcrJob(row) { return this._wikiRepository._parseWikiOcrJob(row) }
  _parsePdfDocument(row) { return this._pdfRepository._parsePdfDocument(row) }
  _parsePdfParseRun(row) { return this._pdfRepository._parsePdfParseRun(row) }
  _parsePdfSourceLink(row) { return this._pdfRepository._parsePdfSourceLink(row) }

  listWikis() { return this._wikiRepository.listWikis() }
  getWiki(id) { return this._wikiRepository.getWiki(id) }
  createWiki(data) { return this._wikiRepository.createWiki(data) }
  upsertWiki(data) { return this._wikiRepository.upsertWiki(data) }
  updateWiki(id, data) { return this._wikiRepository.updateWiki(id, data) }
  deleteWiki(id) { return this._wikiRepository.deleteWiki(id) }
  deleteWikiSource(wikiId, sourceId) { return this._wikiRepository.deleteWikiSource(wikiId, sourceId) }
  listWikiSources(wikiId) { return this._wikiRepository.listWikiSources(wikiId) }
  getWikiSource(id) { return this._wikiRepository.getWikiSource(id) }
  upsertWikiSource(data) { return this._wikiRepository.upsertWikiSource(data) }
  updateWikiSource(id, data) { return this._wikiRepository.updateWikiSource(id, data) }
  listWikiJobs(wikiId) { return this._wikiRepository.listWikiJobs(wikiId) }


  // ─── Web Import Jobs ───

  _parseWebImportJob(row) { return this._webImportRepository._parseWebImportJob(row) }
  _validateWebImportJobFields(fields, options = {}) { return this._webImportRepository._validateWebImportJobFields(fields, options) }
  createWebImportJob(data = {}) { return this._webImportRepository.createWebImportJob(data) }
  getWebImportJob(id) { return this._webImportRepository.getWebImportJob(id) }
  listWebImportJobs(options = {}) { return this._webImportRepository.listWebImportJobs(options) }
  updateWebImportJob(id, patch = {}) { return this._webImportRepository.updateWebImportJob(id, patch) }
  deleteWebImportJob(id) { return this._webImportRepository.deleteWebImportJob(id) }
  clearFinishedWebImportJobs(options = {}) { return this._webImportRepository.clearFinishedWebImportJobs(options) }
  listPendingWebImportJobs() { return this._webImportRepository.listPendingWebImportJobs() }
  markRunningWebImportJobsInterrupted() { return this._webImportRepository.markRunningWebImportJobsInterrupted() }

  createWikiJob(data) { return this._wikiRepository.createWikiJob(data) }
  listOcrProviders() { return this._wikiRepository.listOcrProviders() }
  getOcrProvider(id) { return this._wikiRepository.getOcrProvider(id) }
  createOcrProvider(data = {}) { return this._wikiRepository.createOcrProvider(data) }
  updateOcrProvider(id, data = {}) { return this._wikiRepository.updateOcrProvider(id, data) }
  deleteOcrProvider(id) { return this._wikiRepository.deleteOcrProvider(id) }

  getPdfDocument(id) { return this._pdfRepository.getPdfDocument(id) }
  upsertPdfDocument(data = {}) { return this._pdfRepository.upsertPdfDocument(data) }
  updatePdfDocument(id, data = {}) { return this._pdfRepository.updatePdfDocument(id, data) }
  findPdfDocumentByPathHash(realPathHash) { return this._pdfRepository.findPdfDocumentByPathHash(realPathHash) }
  deletePdfDocument(id) { return this._pdfRepository.deletePdfDocument(id) }
  listPdfSourceLinks() { return this._pdfRepository.listPdfSourceLinks() }
  listPdfSourceLinksForPdf(pdfId) { return this._pdfRepository.listPdfSourceLinksForPdf(pdfId) }
  listPdfSourceLinksByTrashId(trashId) { return this._pdfRepository.listPdfSourceLinksByTrashId(trashId) }
  upsertPdfSourceLink(data = {}) { return this._pdfRepository.upsertPdfSourceLink(data) }
  updatePdfSourceLink(id, data = {}) { return this._pdfRepository.updatePdfSourceLink(id, data) }
  markPdfSourceLinksTrashed(linkIds = [], trashId = '') { return this._pdfRepository.markPdfSourceLinksTrashed(linkIds, trashId) }
  restorePdfSourceLink(id, ownerLocator) { return this._pdfRepository.restorePdfSourceLink(id, ownerLocator) }
  deletePdfSourceLinks(linkIds = []) { return this._pdfRepository.deletePdfSourceLinks(linkIds) }
  countPdfSourceLinks(pdfId) { return this._pdfRepository.countPdfSourceLinks(pdfId) }
  hasActivePdfSourceLink(pdfId) { return this._pdfRepository.hasActivePdfSourceLink(pdfId) }
  listPdfParseRuns(pdfId) { return this._pdfRepository.listPdfParseRuns(pdfId) }
  getPdfParseRun(id) { return this._pdfRepository.getPdfParseRun(id) }
  cancelPdfParseRuns(pdfIds = [], message = 'PDF source is no longer active.') { return this._pdfRepository.cancelPdfParseRuns(pdfIds, message) }
  cancelInterruptedPdfParseRuns() { return this._pdfRepository.cancelInterruptedPdfParseRuns() }
  createPdfParseRun(data = {}) { return this._pdfRepository.createPdfParseRun(data) }
  updatePdfParseRun(id, data = {}) { return this._pdfRepository.updatePdfParseRun(id, data) }
  listWikiOcrJobs(wikiId, sourceId = '') { return this._wikiRepository.listWikiOcrJobs(wikiId, sourceId) }
  getWikiOcrJob(id) { return this._wikiRepository.getWikiOcrJob(id) }
  createWikiOcrJob(data = {}) { return this._wikiRepository.createWikiOcrJob(data) }
  upsertWikiOcrJob(data = {}) { return this._wikiRepository.upsertWikiOcrJob(data) }
  updateWikiOcrJob(id, data = {}) { return this._wikiRepository.updateWikiOcrJob(id, data) }

  // ─── Outputs ───

  listOutputs() { return this._taskRepository.listOutputs() }
  createOutput(data) { return this._taskRepository.createOutput(data) }
  deleteOutput(id) { return this._taskRepository.deleteOutput(id) }

  // ─── Artifacts ───

  listArtifactsByGroup(groupId) { return this._taskRepository.listArtifactsByGroup(groupId) }
  getArtifact(id) { return this._taskRepository.getArtifact(id) }
  createArtifact(data) { return this._taskRepository.createArtifact(data) }
  deleteArtifact(id) { return this._taskRepository.deleteArtifact(id) }
  updateArtifact(id, data) { return this._taskRepository.updateArtifact(id, data) }

  // ─── Settings ───

  getSetting(key) { return this._settingsRepository.getSetting(key) }
  setSetting(key, value) { return this._settingsRepository.setSetting(key, value) }
  getAllSettings() { return this._settingsRepository.getAllSettings() }
  importSettings(settings) { return this._settingsRepository.importSettings(settings) }

  // ─── Memories ───

  listMemories() { return this._memoryRepository.listMemories() }
  createMemory(data) { return this._memoryRepository.createMemory(data) }
  updateMemory(id, data) { return this._memoryRepository.updateMemory(id, data) }
  deleteMemory(id) { return this._memoryRepository.deleteMemory(id) }

  // ─── Learning & capability memory ───

  getLearningMemorySettings() { return this._learningMemoryRepository.getSettings() }
  updateLearningMemorySettings(patch) { return this._learningMemoryRepository.updateSettings(patch) }
  insertLearningEvents(events) { return this._learningMemoryRepository.insertEvents(events) }
  getLearningMemoryOverview(options) { return this._learningMemoryRepository.getOverview(options) }
  getLearningSnapshotData() { return this._learningMemoryRepository.getSnapshotData() }
  findLearningProfileTargets(options) { return this._learningMemoryRepository.findProfileTargets(options) }
  applyLearningAgentOperations(operations) { return this._learningMemoryRepository.applyAgentOperations(operations) }
  findLearningTrackByTitle(title) { return this._learningMemoryRepository.findTrackByTitle(title) }
  retractLearningEvent(traceId, retractedBy) { return this._learningMemoryRepository.retractEvent(traceId, retractedBy) }
  deleteLearningByConversation(conversationId) { return this._learningMemoryRepository.deleteByConversation(conversationId) }
  deleteLearningByMessage(messageId) { return this._learningMemoryRepository.deleteByMessage(messageId) }
  clearLearningMemory() { return this._learningMemoryRepository.clearAll() }

  // ─── Recycle Bin ───

  listTrash() { return this._recycleBinRepository.listTrash() }
  listTrashByCategory(category) { return this._recycleBinRepository.listTrashByCategory(category) }
  getTrashItem(id) { return this._recycleBinRepository.getTrashItem(id) }
  createTrashItem(data) { return this._recycleBinRepository.createTrashItem(data) }
  deleteTrashItem(id) { return this._recycleBinRepository.deleteTrashItem(id) }
  deleteTrashItems(ids) { return this._recycleBinRepository.deleteTrashItems(ids) }
  emptyTrash() { return this._recycleBinRepository.emptyTrash() }
  trashItemCount() { return this._recycleBinRepository.trashItemCount() }

  // ─── Token Usage ───

  _getDateRangeFilter(range) { return this._usageRepository._getDateRangeFilter(range) }
  createTokenUsage(data) { return this._usageRepository.createTokenUsage(data) }
  listTokenUsage(filters = {}) { return this._usageRepository.listTokenUsage(filters) }
  getTokenUsageSummary(range = 'month') { return this._usageRepository.getTokenUsageSummary(range) }
  getTokenUsageByModel(range = 'month') { return this._usageRepository.getTokenUsageByModel(range) }
  getTokenUsageByAgent(range = 'month') { return this._usageRepository.getTokenUsageByAgent(range) }
  getTokenUsageDaily(range = 'month') { return this._usageRepository.getTokenUsageDaily(range) }
  deleteOldTokenUsage(beforeDate) { return this._usageRepository.deleteOldTokenUsage(beforeDate) }

  // ─── Agent Runs ───

  createAgentRun(data) { return this._usageRepository.createAgentRun(data) }
  getAgentRun(id) { return this._usageRepository.getAgentRun(id) }
  updateAgentRun(id, data) { return this._usageRepository.updateAgentRun(id, data) }
  listAgentRunsByConversation(convId) { return this._usageRepository.listAgentRunsByConversation(convId) }
  listAgentRunsByAgent(agentId) { return this._usageRepository.listAgentRunsByAgent(agentId) }
  deleteAgentRun(id) { return this._usageRepository.deleteAgentRun(id) }

  // ─── Note Folders ───

  listNoteFolders(parentId) { return this._notesRepository.listNoteFolders(parentId) }
  getNoteFolder(id) { return this._notesRepository.getNoteFolder(id) }
  createNoteFolder(data) { return this._notesRepository.createNoteFolder(data) }
  updateNoteFolder(id, data) { return this._notesRepository.updateNoteFolder(id, data) }
  deleteNoteFolder(id) { return this._notesRepository.deleteNoteFolder(id) }

  // ─── Notes ───

  listNotes(folderId) { return this._notesRepository.listNotes(folderId) }
  getNote(id) { return this._notesRepository.getNote(id) }
  createNote(data) { return this._notesRepository.createNote(data) }
  updateNote(id, data) { return this._notesRepository.updateNote(id, data) }
  deleteNote(id) { return this._notesRepository.deleteNote(id) }

  _ensureSchemaMigrationsTable() { return this._versionedMigrationManager._ensureSchemaMigrationsTable() }

  _getVersionedMigrations() { return this._versionedMigrationManager._getVersionedMigrations() }
  _ensureArtifactsTable() { return this._legacyMigrationManager._ensureArtifactsTable() }

  _ensureTaskGenerationColumns(taskCols = null) { return this._legacyMigrationManager._ensureTaskGenerationColumns(taskCols) }

  _ensureCreationCenterSubAgentSeeds() { return this._legacyMigrationManager._ensureCreationCenterSubAgentSeeds() }

  _ensureCreationCenterAgentPrompts() { return this._legacyMigrationManager._ensureCreationCenterAgentPrompts() }
  _runVersionedMigrations() { return this._versionedMigrationManager._runVersionedMigrations() }
  _migrateTables() { return this._legacyMigrationManager._migrateTables() }
  _createTables() { return this._schemaManager._createTables() }
  _seedBuiltinData() { return this._seedManager._seedBuiltinData() }
}
