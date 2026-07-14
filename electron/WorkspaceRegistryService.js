import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

const REGISTRY_FILE = 'workspaces.json'
const LEGACY_POINTER_FILE = 'workspace-root.json'
const META_DIR = '.reviva'
const CONFIG_FILE = 'config.json'
const DB_FILE = 'reviva.db'
const WORKSPACE_DIRS = ['docs', 'notes', 'wikis', 'context', 'agents', 'skills']

function nowIso() {
  return new Date().toISOString()
}

function normalizeName(name, rootPath) {
  const value = String(name || '').trim()
  if (value) return value.slice(0, 80)
  return path.basename(rootPath) || '未命名工作空间'
}

export class WorkspaceRegistryService {
  constructor(userDataPath) {
    this._userDataPath = path.resolve(userDataPath)
    this._registryPath = path.join(this._userDataPath, REGISTRY_FILE)
    this._legacyPointerPath = path.join(this._userDataPath, LEGACY_POINTER_FILE)
    this._data = this._emptyRegistry()
  }

  _emptyRegistry() {
    return { version: 1, activeWorkspaceId: null, pendingWorkspaceId: null, workspaces: [] }
  }

  normalizeRoot(rootPath) {
    if (!rootPath || typeof rootPath !== 'string') return ''
    return path.resolve(rootPath)
  }

  _pathKey(rootPath) {
    const normalized = this.normalizeRoot(rootPath).replace(/[\\/]+$/, '')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }

  assertNoWorkspaceNesting(rootPath, { allowSamePath = false } = {}) {
    const normalizedRoot = this.normalizeRoot(rootPath)
    for (const workspace of this._data.workspaces) {
      const samePath = this._pathKey(workspace.rootPath) === this._pathKey(normalizedRoot)
      if (samePath && allowSamePath) continue
      if (samePath) throw new Error('该目录已在工作空间列表中')
      const relativeToExisting = path.relative(workspace.rootPath, normalizedRoot)
      const relativeToCandidate = path.relative(normalizedRoot, workspace.rootPath)
      const insideExisting = relativeToExisting && !relativeToExisting.startsWith('..') && !path.isAbsolute(relativeToExisting)
      const containsExisting = relativeToCandidate && !relativeToCandidate.startsWith('..') && !path.isAbsolute(relativeToCandidate)
      if (insideExisting || containsExisting) throw new Error(`工作空间不能与“${workspace.name}”互相嵌套`)
    }
  }

  async init() {
    await fs.promises.mkdir(this._userDataPath, { recursive: true })
    this._data = await this._readRegistry()
    if (!this._data.workspaces.length) await this._importLegacyPointer()
    this._sanitizeReferences()
    await this._writeRegistry()
    return this.getState()
  }

  async _readRegistry() {
    try {
      if (!fs.existsSync(this._registryPath)) return this._emptyRegistry()
      const parsed = JSON.parse(await fs.promises.readFile(this._registryPath, 'utf-8'))
      const workspaces = Array.isArray(parsed?.workspaces)
        ? parsed.workspaces.map(item => this._normalizeEntry(item)).filter(Boolean)
        : []
      return {
        version: 1,
        activeWorkspaceId: typeof parsed?.activeWorkspaceId === 'string' ? parsed.activeWorkspaceId : null,
        pendingWorkspaceId: typeof parsed?.pendingWorkspaceId === 'string' ? parsed.pendingWorkspaceId : null,
        workspaces: this._dedupe(workspaces),
      }
    } catch (error) {
      console.warn('[WorkspaceRegistry] Registry read failed:', error.message)
      try {
        if (fs.existsSync(this._registryPath)) {
          await fs.promises.copyFile(this._registryPath, `${this._registryPath}.corrupt-${Date.now()}`)
        }
      } catch { /* preserve startup even if the corrupt backup cannot be written */ }
      return this._emptyRegistry()
    }
  }

  _normalizeEntry(entry) {
    const rootPath = this.normalizeRoot(entry?.rootPath)
    if (!rootPath) return null
    return {
      id: String(entry?.id || crypto.randomUUID()),
      name: normalizeName(entry?.name, rootPath),
      rootPath,
      createdAt: entry?.createdAt || nowIso(),
      lastOpenedAt: entry?.lastOpenedAt || '',
    }
  }

  _dedupe(entries) {
    const seenIds = new Set()
    const seenPaths = new Set()
    return entries.filter(entry => {
      const pathKey = this._pathKey(entry.rootPath)
      if (seenIds.has(entry.id) || seenPaths.has(pathKey)) return false
      seenIds.add(entry.id)
      seenPaths.add(pathKey)
      return true
    })
  }

  _sanitizeReferences() {
    const ids = new Set(this._data.workspaces.map(item => item.id))
    if (!ids.has(this._data.activeWorkspaceId)) this._data.activeWorkspaceId = null
    if (!ids.has(this._data.pendingWorkspaceId)) this._data.pendingWorkspaceId = null
  }

  async _importLegacyPointer() {
    try {
      if (!fs.existsSync(this._legacyPointerPath)) return
      const data = JSON.parse(await fs.promises.readFile(this._legacyPointerPath, 'utf-8'))
      const rootPath = this.normalizeRoot(data?.rootPath)
      if (!rootPath) return
      const config = await this.ensureWorkspaceConfig(rootPath)
      const entry = this._normalizeEntry({
        id: config.workspaceId,
        name: config.name,
        rootPath,
        createdAt: config.createdAt,
        lastOpenedAt: nowIso(),
      })
      this._data.workspaces = [entry]
      this._data.activeWorkspaceId = entry.id
    } catch (error) {
      console.warn('[WorkspaceRegistry] Legacy pointer import failed:', error.message)
    }
  }

  async _writeRegistry() {
    await this._writeJsonAtomic(this._registryPath, this._data)
  }

  async _writeJsonAtomic(filePath, data) {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
      await fs.promises.rename(tempPath, filePath)
    } finally {
      await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    }
  }

  async _writeLegacyPointer(rootPath) {
    if (!rootPath) return
    const tempPath = `${this._legacyPointerPath}.tmp-${process.pid}-${Date.now()}`
    await fs.promises.writeFile(tempPath, JSON.stringify({ rootPath, updatedAt: nowIso() }, null, 2), 'utf-8')
    await fs.promises.rename(tempPath, this._legacyPointerPath)
  }

  async readWorkspaceConfig(rootPath) {
    const configPath = path.join(this.normalizeRoot(rootPath), META_DIR, CONFIG_FILE)
    if (!fs.existsSync(configPath)) return null
    try {
      return JSON.parse(await fs.promises.readFile(configPath, 'utf-8'))
    } catch {
      return null
    }
  }

  async ensureWorkspaceConfig(rootPath, options = {}) {
    const normalizedRoot = this.normalizeRoot(rootPath)
    const metaDir = path.join(normalizedRoot, META_DIR)
    await fs.promises.mkdir(metaDir, { recursive: true })
    const existing = await this.readWorkspaceConfig(normalizedRoot)
    const config = {
      version: 2,
      workspaceId: String(existing?.workspaceId || options.workspaceId || crypto.randomUUID()),
      name: normalizeName(options.name || existing?.name, normalizedRoot),
      rootPath: normalizedRoot,
      createdAt: existing?.createdAt || options.createdAt || nowIso(),
    }
    await this._writeJsonAtomic(path.join(metaDir, CONFIG_FILE), config)
    return config
  }

  async prepareWorkspace(rootPath, options = {}) {
    const normalizedRoot = this.normalizeRoot(rootPath)
    await fs.promises.mkdir(normalizedRoot, { recursive: true })
    for (const dirName of WORKSPACE_DIRS) {
      await fs.promises.mkdir(path.join(normalizedRoot, dirName), { recursive: true })
    }
    await fs.promises.mkdir(path.join(normalizedRoot, META_DIR, 'trash'), { recursive: true })
    await fs.promises.mkdir(path.join(normalizedRoot, META_DIR, 'logs'), { recursive: true })
    return this.ensureWorkspaceConfig(normalizedRoot, options)
  }

  async validateWorkspace(rootPath, { requireDatabase = true, allowLegacyConfig = false } = {}) {
    const normalizedRoot = this.normalizeRoot(rootPath)
    if (!normalizedRoot || !fs.existsSync(normalizedRoot)) return { valid: false, error: '工作目录不存在' }
    const config = await this.readWorkspaceConfig(normalizedRoot)
    if ((!config || !config.workspaceId) && !allowLegacyConfig) return { valid: false, error: '缺少有效的 .reviva/config.json' }
    const dbPath = path.join(normalizedRoot, META_DIR, DB_FILE)
    if (requireDatabase && !fs.existsSync(dbPath)) return { valid: false, error: '缺少 .reviva/reviva.db' }
    const migrationPath = path.join(normalizedRoot, META_DIR, 'migration-state.json')
    if (fs.existsSync(migrationPath)) {
      try {
        const migration = JSON.parse(await fs.promises.readFile(migrationPath, 'utf-8'))
        if (migration.status && migration.status !== 'completed') return { valid: false, error: '该工作空间迁移尚未完成' }
      } catch {
        return { valid: false, error: '迁移状态文件损坏' }
      }
    }
    return { valid: true, rootPath: normalizedRoot, config: config || null, dbPath }
  }

  async validateRegisteredWorkspace(workspace, { repairLegacyConfig = true } = {}) {
    if (!workspace?.id || !workspace?.rootPath) return { valid: false, error: '工作空间注册记录无效' }
    const validation = await this.validateWorkspace(workspace.rootPath, {
      allowLegacyConfig: repairLegacyConfig,
    })
    if (!validation.valid) return validation

    const configuredId = validation.config?.workspaceId
    if (configuredId && configuredId !== workspace.id) {
      return { ...validation, valid: false, error: '工作空间 ID 与注册记录不一致' }
    }

    if (!configuredId && repairLegacyConfig) {
      const config = await this.ensureWorkspaceConfig(validation.rootPath, {
        workspaceId: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
      })
      return { ...validation, config, repairedLegacyConfig: true }
    }
    return validation
  }

  findById(id) {
    return this._data.workspaces.find(item => item.id === id) || null
  }

  findByPath(rootPath) {
    const key = this._pathKey(rootPath)
    return this._data.workspaces.find(item => this._pathKey(item.rootPath) === key) || null
  }

  async registerWorkspace(data, { setPending = false, setActive = false } = {}) {
    const normalized = this._normalizeEntry(data)
    if (!normalized) throw new Error('工作空间路径无效')
    const byPath = this.findByPath(normalized.rootPath)
    const byId = this.findById(normalized.id)
    if (!byPath && !byId) this.assertNoWorkspaceNesting(normalized.rootPath)
    const existing = byPath || byId
    const entry = existing
      ? Object.assign(existing, normalized, { id: existing.id })
      : normalized
    if (!existing) this._data.workspaces.push(entry)
    if (setPending) this._data.pendingWorkspaceId = entry.id === this._data.activeWorkspaceId ? null : entry.id
    if (setActive) {
      this._data.activeWorkspaceId = entry.id
      this._data.pendingWorkspaceId = null
      entry.lastOpenedAt = nowIso()
    }
    await this._writeRegistry()
    if (setActive) await this._writeLegacyPointer(entry.rootPath)
    return { ...entry }
  }

  async setPending(id) {
    const entry = this.findById(id)
    if (!entry) throw new Error('工作空间不存在')
    this._data.pendingWorkspaceId = id === this._data.activeWorkspaceId ? null : id
    await this._writeRegistry()
    return this.getState()
  }

  async cancelPending() {
    this._data.pendingWorkspaceId = null
    await this._writeRegistry()
    return this.getState()
  }

  async markActive(id) {
    const entry = this.findById(id)
    if (!entry) throw new Error('工作空间不存在')
    this._data.activeWorkspaceId = id
    this._data.pendingWorkspaceId = null
    entry.lastOpenedAt = nowIso()
    await this._writeRegistry()
    await this._writeLegacyPointer(entry.rootPath)
    return { ...entry }
  }

  async renameWorkspace(id, name) {
    const entry = this.findById(id)
    if (!entry) throw new Error('工作空间不存在')
    entry.name = normalizeName(name, entry.rootPath)
    const config = await this.ensureWorkspaceConfig(entry.rootPath, { name: entry.name, workspaceId: entry.id, createdAt: entry.createdAt })
    entry.name = config.name
    await this._writeRegistry()
    return { ...entry }
  }

  async removeWorkspace(id) {
    if (id === this._data.activeWorkspaceId) throw new Error('当前工作空间不能从列表移除')
    this._data.workspaces = this._data.workspaces.filter(item => item.id !== id)
    if (this._data.pendingWorkspaceId === id) this._data.pendingWorkspaceId = null
    await this._writeRegistry()
    return this.getState()
  }

  getStartupCandidates() {
    const pending = this.findById(this._data.pendingWorkspaceId)
    const active = this.findById(this._data.activeWorkspaceId)
    const candidates = [pending, active].filter(Boolean)
    return candidates.filter((item, index) => candidates.findIndex(other => other.id === item.id) === index)
  }

  getState() {
    const workspaces = this._data.workspaces.map(item => ({ ...item }))
    return {
      version: 1,
      activeWorkspaceId: this._data.activeWorkspaceId,
      pendingWorkspaceId: this._data.pendingWorkspaceId,
      activeWorkspace: workspaces.find(item => item.id === this._data.activeWorkspaceId) || null,
      pendingWorkspace: workspaces.find(item => item.id === this._data.pendingWorkspaceId) || null,
      workspaces,
    }
  }
}
