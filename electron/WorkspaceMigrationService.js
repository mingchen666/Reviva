import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

const DATA_DIRS = ['docs', 'notes', 'wikis', 'context', 'agents', 'skills']
const META_DIR = '.reviva'
const EXCLUDED_META_FILES = new Set([
  'config.json',
  'reviva.db',
  'reviva.db-wal',
  'reviva.db-shm',
  'migration-state.json',
])

function isWithin(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function collectStats(rootPath, filter = () => true) {
  let files = 0
  let bytes = 0
  async function walk(currentPath, relativePath = '') {
    if (!await pathExists(currentPath)) return
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name
      if (!filter(nextRelative, entry)) continue
      const absolute = path.join(currentPath, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`迁移目录包含不支持的符号链接: ${nextRelative}`)
      if (entry.isDirectory()) await walk(absolute, nextRelative)
      else if (entry.isFile()) {
        const stat = await fs.promises.stat(absolute)
        files += 1
        bytes += stat.size
      }
    }
  }
  await walk(rootPath)
  return { files, bytes }
}

export class WorkspaceMigrationService {
  constructor({ dbService, registryService, getWin }) {
    this._db = dbService
    this._registry = registryService
    this._getWin = getWin
  }

  _emit(stage, progress, message) {
    this._getWin?.()?.webContents?.send('workspace:migrationProgress', { stage, progress, message })
  }

  async _writeState(targetRoot, state) {
    const metaDir = path.join(targetRoot, META_DIR)
    await fs.promises.mkdir(metaDir, { recursive: true })
    const statePath = path.join(metaDir, 'migration-state.json')
    const tempPath = `${statePath}.tmp-${process.pid}-${Date.now()}`
    try {
      await fs.promises.writeFile(tempPath, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
      await fs.promises.rename(tempPath, statePath)
    } finally {
      await fs.promises.rm(tempPath, { force: true }).catch(() => {})
    }
  }

  async cleanupFailed(targetRoot) {
    const target = path.resolve(targetRoot)
    const statePath = path.join(target, META_DIR, 'migration-state.json')
    if (!await pathExists(statePath)) throw new Error('未找到失败迁移记录')
    let state
    try {
      state = JSON.parse(await fs.promises.readFile(statePath, 'utf-8'))
    } catch {
      throw new Error('迁移状态文件损坏，无法安全清理')
    }
    if (state.status !== 'failed' || path.resolve(state.targetRoot || '') !== target) {
      throw new Error('该目录不是可清理的失败迁移目标')
    }
    for (const dirName of DATA_DIRS) {
      await fs.promises.rm(path.join(target, dirName), { recursive: true, force: true })
    }
    await fs.promises.rm(path.join(target, META_DIR), { recursive: true, force: true })
    return { success: true, targetRoot: target }
  }

  async _assertTarget(sourceRoot, targetRoot) {
    const source = path.resolve(sourceRoot)
    const target = path.resolve(targetRoot)
    if (source === target) throw new Error('迁移目标不能与当前工作空间相同')
    if (isWithin(source, target) || isWithin(target, source)) throw new Error('源目录与目标目录不能互相嵌套')
    const reserved = [...DATA_DIRS, META_DIR]
    const conflicts = []
    for (const name of reserved) {
      if (await pathExists(path.join(target, name))) conflicts.push(name)
    }
    if (conflicts.length) throw new Error(`目标目录存在冲突内容: ${conflicts.join('、')}`)
    return { source, target }
  }

  async _checkDiskSpace(targetRoot, requiredBytes) {
    if (typeof fs.promises.statfs !== 'function') return
    try {
      const stat = await fs.promises.statfs(targetRoot)
      const available = Number(stat.bavail) * Number(stat.bsize)
      if (Number.isFinite(available) && available < requiredBytes * 1.1) throw new Error('目标磁盘可用空间不足')
    } catch (error) {
      if (error.message === '目标磁盘可用空间不足') throw error
    }
  }

  async migrate({ sourceRoot, targetRoot, name }) {
    this._registry.assertNoWorkspaceNesting(targetRoot)
    const { source, target } = await this._assertTarget(sourceRoot, targetRoot)
    await fs.promises.mkdir(target, { recursive: true })
    const workspaceId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const stateBase = { status: 'running', sourceRoot: source, targetRoot: target, workspaceId, createdAt }

    try {
      this._emit('scanning', 5, '正在检查迁移内容...')
      await this._writeState(target, { ...stateBase, stage: 'scanning' })
      const sourceStats = { files: 0, bytes: 0 }
      for (const dirName of DATA_DIRS) {
        const stats = await collectStats(path.join(source, dirName))
        sourceStats.files += stats.files
        sourceStats.bytes += stats.bytes
      }
      const metaFilter = (relativePath) => !EXCLUDED_META_FILES.has(path.basename(relativePath).toLowerCase())
      const metaStats = await collectStats(path.join(source, META_DIR), metaFilter)
      sourceStats.files += metaStats.files
      sourceStats.bytes += metaStats.bytes
      let requiredBytes = sourceStats.bytes
      try {
        const dbStat = await fs.promises.stat(path.join(source, META_DIR, 'reviva.db'))
        requiredBytes += dbStat.size
      } catch { /* database backup will provide the actionable error */ }
      await this._checkDiskSpace(target, requiredBytes)

      this._emit('database', 15, '正在备份数据库...')
      await this._writeState(target, { ...stateBase, stage: 'database', sourceStats })
      await this._db.backupTo(path.join(target, META_DIR, 'reviva.db'))

      this._emit('files', 30, '正在复制工作空间文件...')
      for (let index = 0; index < DATA_DIRS.length; index += 1) {
        const dirName = DATA_DIRS[index]
        const sourceDir = path.join(source, dirName)
        if (await pathExists(sourceDir)) {
          await fs.promises.cp(sourceDir, path.join(target, dirName), {
            recursive: true,
            force: false,
            errorOnExist: true,
            dereference: false,
          })
        } else {
          await fs.promises.mkdir(path.join(target, dirName), { recursive: true })
        }
        this._emit('files', 30 + Math.round(((index + 1) / DATA_DIRS.length) * 45), `正在复制 ${dirName}/...`)
      }

      const sourceMeta = path.join(source, META_DIR)
      if (await pathExists(sourceMeta)) {
        const entries = await fs.promises.readdir(sourceMeta, { withFileTypes: true })
        for (const entry of entries) {
          if (EXCLUDED_META_FILES.has(entry.name.toLowerCase())) continue
          if (entry.isSymbolicLink()) throw new Error(`迁移目录包含不支持的符号链接: .reviva/${entry.name}`)
          await fs.promises.cp(path.join(sourceMeta, entry.name), path.join(target, META_DIR, entry.name), {
            recursive: entry.isDirectory(),
            force: false,
            errorOnExist: true,
            dereference: false,
          })
        }
      }

      this._emit('verifying', 82, '正在验证迁移结果...')
      const targetStats = { files: 0, bytes: 0 }
      for (const dirName of DATA_DIRS) {
        const stats = await collectStats(path.join(target, dirName))
        targetStats.files += stats.files
        targetStats.bytes += stats.bytes
      }
      const targetMetaStats = await collectStats(path.join(target, META_DIR), metaFilter)
      targetStats.files += targetMetaStats.files
      targetStats.bytes += targetMetaStats.bytes
      if (sourceStats.files !== targetStats.files || sourceStats.bytes !== targetStats.bytes) {
        throw new Error('迁移文件校验失败，文件数量或大小不一致')
      }
      const integrity = this._db.constructor.checkDatabaseIntegrity(path.join(target, META_DIR, 'reviva.db'))
      if (!integrity.ok) throw new Error(`迁移数据库校验失败: ${integrity.error}`)

      const config = await this._registry.ensureWorkspaceConfig(target, { workspaceId, name, createdAt })
      await fs.promises.mkdir(path.join(target, META_DIR, 'trash'), { recursive: true })
      await fs.promises.mkdir(path.join(target, META_DIR, 'logs'), { recursive: true })
      await this._writeState(target, {
        ...stateBase,
        status: 'completed',
        stage: 'completed',
        sourceStats,
        targetStats,
        completedAt: new Date().toISOString(),
      })
      const workspace = await this._registry.registerWorkspace({
        id: config.workspaceId,
        name: config.name,
        rootPath: target,
        createdAt: config.createdAt,
      }, { setPending: true })
      this._emit('completed', 100, '工作空间迁移完成')
      return { success: true, workspace, sourceStats }
    } catch (error) {
      await this._writeState(target, { ...stateBase, status: 'failed', stage: 'failed', error: error.message }).catch(() => {})
      this._emit('failed', 100, error.message)
      return { success: false, error: error.message, targetRoot: target }
    }
  }
}
