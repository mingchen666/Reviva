// electron/BackupService.js — local backup package creation
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let BetterSqlite3 = null
try {
  BetterSqlite3 = require('better-sqlite3')
} catch {
  BetterSqlite3 = null
}

const BACKUP_FORMAT_VERSION = 1
const BACKUP_EXT = '.zip'
const RESTORE_STATE_DIR = 'backup-restore'
const RESTORE_PENDING_FILE = 'pending.json'
const RESTORE_RESULT_FILE = 'result.json'

const BACKUP_MODES = {
  database: {
    label: '数据库备份',
    description: 'Only includes a consistent SQLite database snapshot.',
  },
  compact: {
    label: '精简备份',
    description: 'Includes a sanitized database snapshot plus lightweight user files.',
  },
  full: {
    label: '完整数据备份',
    description: 'Includes the database snapshot and durable workspace files.',
  },
}

function normalizeMode(mode) {
  return Object.prototype.hasOwnProperty.call(BACKUP_MODES, mode) ? mode : 'full'
}

function timestampStamp() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

function safeBackupName(mode) {
  return `reviva-${mode}-backup-${timestampStamp()}${BACKUP_EXT}`
}

function slashPath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function isWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function checkSqliteIntegrity(dbPath) {
  if (!BetterSqlite3) return { ok: false, error: 'better-sqlite3 unavailable' }
  let db = null
  try {
    db = new BetterSqlite3(path.resolve(dbPath), { readonly: true, fileMustExist: true })
    const result = db.pragma('integrity_check', { simple: true })
    return result === 'ok' ? { ok: true } : { ok: false, error: String(result || 'integrity_check failed') }
  } catch (error) {
    return { ok: false, error: error.message }
  } finally {
    try { db?.close() } catch { /* noop */ }
  }
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

async function removeDirSafe(dirPath) {
  const resolved = path.resolve(dirPath)
  const tmpRoot = path.resolve(os.tmpdir())
  if (!isWithin(tmpRoot, resolved)) return
  await fs.promises.rm(resolved, { recursive: true, force: true })
}

async function writeJsonAtomic(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await fs.promises.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8')
  await fs.promises.rename(tempPath, filePath).catch(async error => {
    await fs.promises.rm(filePath, { force: true })
    await fs.promises.rename(tempPath, filePath).catch(() => { throw error })
  })
}

function safeArchivePath(value) {
  const normalized = slashPath(value).replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return ''
  const parts = normalized.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) return ''
  return normalized
}

function restoreStatePaths(stateRoot) {
  const root = path.join(path.resolve(stateRoot), RESTORE_STATE_DIR)
  return {
    root,
    pending: path.join(root, RESTORE_PENDING_FILE),
    result: path.join(root, RESTORE_RESULT_FILE),
  }
}

async function copyRestoredFile(sourcePath, targetPath) {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = `${targetPath}.restore-new-${process.pid}-${Date.now()}`
  await fs.promises.copyFile(sourcePath, tempPath)
  await fs.promises.rename(tempPath, targetPath).catch(async error => {
    await fs.promises.rm(targetPath, { force: true })
    await fs.promises.rename(tempPath, targetPath).catch(() => { throw error })
  })
}

export async function applyPendingBackupRestore({ stateRoot } = {}) {
  if (!stateRoot) return null
  const paths = restoreStatePaths(stateRoot)
  if (!(await pathExists(paths.pending))) return null
  let pending = null
  try {
    pending = JSON.parse(await fs.promises.readFile(paths.pending, 'utf-8'))
    if (!pending?.stagingDir || !pending?.targetRoot) throw new Error('恢复任务信息不完整')
    const stagingDir = path.resolve(String(pending.stagingDir))
    const targetRoot = path.resolve(String(pending.targetRoot))
    if (!isWithin(paths.root, stagingDir)) throw new Error('恢复暂存目录无效')
    if (!targetRoot || targetRoot === path.parse(targetRoot).root) throw new Error('恢复目标目录无效')
    const manifest = pending.manifest || {}
    for (const file of manifest.files || []) {
      const archivePath = safeArchivePath(file.path)
      if (!archivePath) throw new Error(`恢复清单包含非法路径: ${file.path || ''}`)
      const stagedPath = path.join(stagingDir, archivePath)
      if (!isWithin(stagingDir, stagedPath) || !(await pathExists(stagedPath))) throw new Error(`恢复暂存文件缺失: ${archivePath}`)
      const buffer = await fs.promises.readFile(stagedPath)
      if (Number(file.size) !== buffer.length || String(file.sha256 || '') !== hashBuffer(buffer)) {
        throw new Error(`恢复暂存文件校验失败: ${archivePath}`)
      }
    }
    const stagedDbIntegrity = checkSqliteIntegrity(path.join(stagingDir, 'database', 'reviva.db'))
    if (!stagedDbIntegrity.ok) throw new Error(`恢复数据库校验失败: ${stagedDbIntegrity.error}`)
    for (const file of manifest.files || []) {
      const archivePath = safeArchivePath(file.path)
      if (!archivePath?.startsWith('workspace/')) continue
      const relative = archivePath.slice('workspace/'.length)
      if (!relative || relative.toLowerCase() === '.reviva/config.json') continue
      const sourcePath = path.join(stagingDir, archivePath)
      const targetPath = path.join(targetRoot, relative)
      if (!isWithin(targetRoot, targetPath)) throw new Error(`恢复文件路径越界: ${archivePath}`)
      await copyRestoredFile(sourcePath, targetPath)
    }

    const stagedDb = path.join(stagingDir, 'database', 'reviva.db')
    const targetDb = path.join(targetRoot, '.reviva', 'reviva.db')
    if (!(await pathExists(stagedDb))) throw new Error('恢复包缺少数据库快照')
    await fs.promises.mkdir(path.dirname(targetDb), { recursive: true })
    const previousDb = `${targetDb}.restore-previous-${pending.id}`
    await fs.promises.rm(`${targetDb}-wal`, { force: true })
    await fs.promises.rm(`${targetDb}-shm`, { force: true })
    await fs.promises.rm(previousDb, { force: true })
    if (await pathExists(targetDb)) await fs.promises.rename(targetDb, previousDb)
    try {
      await copyRestoredFile(stagedDb, targetDb)
    } catch (error) {
      if (await pathExists(previousDb)) await fs.promises.rename(previousDb, targetDb)
      throw error
    }
    await fs.promises.rm(previousDb, { force: true })

    const result = {
      success: true,
      restoredAt: new Date().toISOString(),
      mode: manifest.mode || '',
      sourceFileName: pending.sourceFileName || '',
      safetyBackupPath: pending.safetyBackupPath || '',
    }
    await writeJsonAtomic(paths.result, result)
    await fs.promises.rm(paths.pending, { force: true })
    await fs.promises.rm(stagingDir, { recursive: true, force: true })
    return result
  } catch (error) {
    const result = {
      success: false,
      restoredAt: new Date().toISOString(),
      error: error?.message || '恢复失败',
      sourceFileName: pending?.sourceFileName || '',
      safetyBackupPath: pending?.safetyBackupPath || '',
      stagingDir: pending?.stagingDir || '',
    }
    await writeJsonAtomic(paths.result, result).catch(() => {})
    await fs.promises.rm(paths.pending, { force: true }).catch(() => {})
    return result
  }
}

function shouldSkipWorkspaceEntry(relPath, stat, outputPath, absPath = '') {
  const normalized = slashPath(relPath)
  const lower = normalized.toLowerCase()
  const parts = lower.split('/').filter(Boolean)
  const base = parts[parts.length - 1] || ''

  if (outputPath && absPath && path.resolve(outputPath) === path.resolve(absPath)) return true
  if (base.endsWith(BACKUP_EXT)) return true
  if (parts.includes('node_modules')) return true
  if (parts.includes('.git')) return true
  if (parts.includes('cache') || parts.includes('.cache') || parts.includes('tmp') || parts.includes('temp')) return true
  if (lower.startsWith('.reviva/logs/') || lower === '.reviva/logs') return true
  if (lower.startsWith('.reviva/trash/') || lower === '.reviva/trash') return true
  if (lower === '.reviva/reviva.db' || lower.startsWith('.reviva/reviva.db-')) return true
  if (stat?.isFile?.() && /\.(tmp|temp|log)$/i.test(base)) return true
  return false
}

function isCompactMediaArtifact(relPath) {
  const lower = slashPath(relPath).toLowerCase()
  if (!lower.startsWith('context/media/')) return false
  if (/^context\/media\/[^/]+\/current\.json$/.test(lower)) return true
  const runFile = lower.match(/^context\/media\/[^/]+\/runs\/[^/]+\/(.+)$/)
  if (!runFile) return false
  const insideRun = runFile[1]
  if (insideRun === 'manifest.json') return true
  return [
    'analysis/metadata.json',
    'analysis/transcript.json',
    'analysis/segments.json',
    'analysis/chapters.json',
    'analysis/subtitle.srt',
    'analysis/subtitle.vtt',
    'index/timeline_index.json',
  ].includes(insideRun)
}

async function walkFiles(rootPath, relRoot = '') {
  const result = []
  const absRoot = path.join(rootPath, relRoot)
  if (!(await pathExists(absRoot))) return result
  const entries = await fs.promises.readdir(absRoot, { withFileTypes: true })
  for (const entry of entries) {
    const rel = slashPath(path.join(relRoot, entry.name))
    const abs = path.join(rootPath, rel)
    const stat = await fs.promises.stat(abs)
    if (entry.isDirectory()) {
      result.push(...await walkFiles(rootPath, rel))
    } else if (entry.isFile()) {
      result.push({ abs, rel, stat })
    }
  }
  return result
}

function sanitizeCompactDatabase(dbPath) {
  if (!BetterSqlite3) return { sanitized: false, reason: 'better-sqlite3 unavailable' }
  const db = new BetterSqlite3(dbPath)
  try {
    const execIfTable = (table, sql) => {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table)
      if (row) db.exec(sql)
    }

    execIfTable('artifacts', `
      DELETE FROM artifacts
      WHERE COALESCE(file_path, '') <> ''
        OR LOWER(COALESCE(storage_type, '')) = 'file';
    `)
    execIfTable('outputs', `
      DELETE FROM outputs
      WHERE COALESCE(file_path, '') <> '';
    `)
    execIfTable('tasks', `
      UPDATE tasks
      SET artifact_id = '',
          result = CASE WHEN COALESCE(artifact_id, '') <> '' THEN '' ELSE result END
      WHERE COALESCE(artifact_id, '') <> '';
    `)
    execIfTable('documents', `
      UPDATE documents
      SET file_path = '',
          status = CASE WHEN status = 'ready' THEN 'missing' ELSE status END
      WHERE COALESCE(file_path, '') <> '';
    `)
    execIfTable('wiki_sources', `
      UPDATE wiki_sources
      SET original_path = '',
          extract_path = '',
          parser_status = '',
          parser_message = '文件未包含在精简备份中'
      WHERE COALESCE(original_path, '') <> ''
         OR COALESCE(extract_path, '') <> '';
    `)
    execIfTable('wiki_jobs', `DELETE FROM wiki_jobs;`)
    execIfTable('wiki_ocr_jobs', `DELETE FROM wiki_ocr_jobs;`)
    execIfTable('settings', `DELETE FROM settings WHERE key IN ('workdir_root', 'mediaSpeechSettings', 'mediaSpeechDefaultProviderId', 'defaultSttModelRef', 'defaultTtsModelRef');`)
    execIfTable('stt_provider_profiles', `DELETE FROM stt_provider_profiles;`)
    execIfTable('tts_provider_profiles', `DELETE FROM tts_provider_profiles;`)
    execIfTable('media_frames', `DELETE FROM media_frames;`)
    execIfTable('media_artifacts', `
      DELETE FROM media_artifacts
      WHERE type NOT IN ('metadata', 'transcript', 'subtitle_srt', 'subtitle_vtt', 'segments', 'chapters', 'timeline_index');
    `)
    execIfTable('media_source_locations', `
      UPDATE media_source_locations
      SET availability = 'missing', updated_at = datetime('now')
      WHERE location_type IN ('workspace_file', 'attachment_cache', 'download_cache');
      UPDATE media_source_locations
      SET locator = '[redacted]', normalized_locator = '[redacted]', locator_ref = '',
          availability = 'expired', expires_at = '', auth_ref = '', updated_at = datetime('now')
      WHERE location_type = 'public_media_url';
      UPDATE media_source_locations
      SET auth_ref = '', updated_at = datetime('now')
      WHERE auth_ref <> '';
    `)
    execIfTable('media_sources', `
      UPDATE media_sources
      SET content_availability = CASE
        WHEN EXISTS (
          SELECT 1 FROM media_artifacts a
          WHERE a.run_id = media_sources.current_run_id
            AND a.type IN ('transcript', 'segments')
            AND a.status IN ('ready', 'partial')
        ) THEN 'transcript_ready'
        WHEN EXISTS (
          SELECT 1 FROM media_artifacts a
          WHERE a.run_id = media_sources.current_run_id
            AND a.type = 'metadata'
            AND a.status IN ('ready', 'partial')
        ) THEN 'metadata_only'
        ELSE 'none'
      END,
      updated_at = datetime('now');
    `)
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    return { sanitized: true }
  } finally {
    db.close()
  }
}

export class BackupService {
  constructor(dbService, workDirService, { appVersion = '', restoreStateRoot = '' } = {}) {
    this._dbService = dbService
    this._workDirService = workDirService
    this._appVersion = appVersion
    this._restoreStateRoot = restoreStateRoot
  }

  getDefaultFileName(mode) {
    return safeBackupName(normalizeMode(mode))
  }

  getOutputPath(outputDir, mode) {
    if (!outputDir) throw new Error('缺少备份输出目录')
    return path.join(path.resolve(outputDir), this.getDefaultFileName(mode))
  }

  getModes() {
    return Object.entries(BACKUP_MODES).map(([id, item]) => ({ id, ...item }))
  }

  async createBackup({ mode = 'full', outputPath } = {}) {
    const backupMode = normalizeMode(mode)
    const workRoot = this._workDirService?.getRootPath?.()
    if (!workRoot) throw new Error('未配置授权根目录，无法创建备份')
    if (!outputPath) throw new Error('缺少备份输出路径')

    const resolvedOutput = path.resolve(outputPath)
    await fs.promises.mkdir(path.dirname(resolvedOutput), { recursive: true })

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-backup-'))
    const dbSnapshotPath = path.join(tempDir, 'reviva.db')
    const manifest = {
      app: 'Reviva',
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: this._appVersion,
      mode: backupMode,
      modeLabel: BACKUP_MODES[backupMode].label,
      createdAt: new Date().toISOString(),
      workspaceRootName: path.basename(path.resolve(workRoot)),
      includes: [],
      excludes: [],
      files: [],
      database: null,
      stats: {
        fileCount: 0,
        totalBytes: 0,
      },
    }

    try {
      await this._dbService.backupTo(dbSnapshotPath)
      if (backupMode === 'compact') {
        manifest.databaseSanitization = sanitizeCompactDatabase(dbSnapshotPath)
      }

      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      await this._addFile(zip, dbSnapshotPath, 'database/reviva.db', manifest)
      manifest.database = {
        path: 'database/reviva.db',
        mode: backupMode === 'compact' ? 'sanitized-snapshot' : 'snapshot',
      }
      manifest.includes.push('database')

      const relRoots = this._workspaceRootsForMode(backupMode)
      for (const relRoot of relRoots) {
        await this._addWorkspaceRoot(zip, workRoot, relRoot, resolvedOutput, manifest)
      }
      if (relRoots.length) manifest.includes.push(...relRoots.map(p => slashPath(`workspace/${p}`)))
      if (backupMode === 'compact') {
        const mediaFileCount = await this._addCompactMediaArtifacts(zip, workRoot, resolvedOutput, manifest)
        if (mediaFileCount > 0) manifest.includes.push('workspace/context/media (transcript core)')
        const mediaReferenceCount = await this._addCompactMediaReferences(zip, workRoot, resolvedOutput, manifest)
        if (mediaReferenceCount > 0) manifest.includes.push('workspace/docs (*.media.md references)')
      }

      manifest.excludes = this._excludesForMode(backupMode)
      zip.file('manifest.json', JSON.stringify(manifest, null, 2))

      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: backupMode === 'full' ? 6 : 9 },
      })
      await fs.promises.writeFile(resolvedOutput, buffer)

      const outStat = await fs.promises.stat(resolvedOutput)
      return {
        success: true,
        data: {
          mode: backupMode,
          path: resolvedOutput,
          fileName: path.basename(resolvedOutput),
          size: outStat.size,
          sourceBytes: manifest.stats.totalBytes,
          fileCount: manifest.stats.fileCount,
          includes: manifest.includes,
          excludes: manifest.excludes,
        },
      }
    } finally {
      await removeDirSafe(tempDir)
    }
  }

  async validateBackup(packagePath, { extractTo = '' } = {}) {
    const resolvedPackage = path.resolve(String(packagePath || ''))
    if (!(await pathExists(resolvedPackage))) throw new Error('备份文件不存在')
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await fs.promises.readFile(resolvedPackage), { checkCRC32: true })
    const manifestEntry = zip.file('manifest.json')
    if (!manifestEntry) throw new Error('不是有效的 Reviva 备份包：缺少 manifest.json')
    let manifest = null
    try { manifest = JSON.parse(await manifestEntry.async('string')) }
    catch { throw new Error('备份清单格式损坏') }
    if (manifest?.app !== 'Reviva' || Number(manifest?.formatVersion) !== BACKUP_FORMAT_VERSION) {
      throw new Error(`不支持的备份格式版本：${manifest?.formatVersion ?? '未知'}`)
    }
    if (!BACKUP_MODES[manifest.mode]) throw new Error('备份模式无效')
    if (!Array.isArray(manifest.files) || manifest.files.length > 200000) throw new Error('备份文件清单无效或过大')
    if (manifest.database?.path && safeArchivePath(manifest.database.path) !== 'database/reviva.db') throw new Error('备份数据库路径无效')
    const expected = new Map()
    for (const file of manifest.files) {
      const archivePath = safeArchivePath(file?.path)
      if (!archivePath || (!archivePath.startsWith('workspace/') && archivePath !== 'database/reviva.db')) {
        throw new Error(`备份包含非法路径：${file?.path || ''}`)
      }
      if (expected.has(archivePath)) throw new Error(`备份清单包含重复文件：${archivePath}`)
      expected.set(archivePath, file)
    }
    if (!expected.has('database/reviva.db')) throw new Error('备份清单缺少数据库快照')
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const archivePath = safeArchivePath(entry.name)
      if (!archivePath) throw new Error(`备份包含非法 ZIP 条目：${entry.name}`)
      if (archivePath !== 'manifest.json' && !expected.has(archivePath)) throw new Error(`备份包含未登记文件：${archivePath}`)
    }

    const extractionDir = extractTo
      ? path.resolve(extractTo)
      : await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-restore-validate-'))
    await fs.promises.mkdir(extractionDir, { recursive: true })
    try {
      let totalBytes = 0
      for (const [archivePath, file] of expected) {
        const entry = zip.file(archivePath)
        if (!entry) throw new Error(`备份缺少文件：${archivePath}`)
        const buffer = await entry.async('nodebuffer')
        totalBytes += buffer.length
        if (totalBytes > 64 * 1024 * 1024 * 1024) throw new Error('备份解压后超过 64GB 限制')
        if (Number(file.size) !== buffer.length) throw new Error(`备份文件大小校验失败：${archivePath}`)
        if (String(file.sha256 || '') !== hashBuffer(buffer)) throw new Error(`备份文件哈希校验失败：${archivePath}`)
        const outputPath = path.join(extractionDir, archivePath)
        if (!isWithin(extractionDir, outputPath)) throw new Error(`备份文件路径越界：${archivePath}`)
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
        await fs.promises.writeFile(outputPath, buffer)
      }
      const integrity = this._dbService.constructor.checkDatabaseIntegrity(path.join(extractionDir, 'database', 'reviva.db'))
      if (!integrity.ok) throw new Error(`数据库快照校验失败：${integrity.error}`)
      if (Number(manifest.stats?.fileCount || manifest.files.length) !== manifest.files.length) throw new Error('备份文件数量与清单统计不一致')
      return {
        success: true,
        manifest,
        extractionDir,
        temporaryExtraction: !extractTo,
        data: {
          mode: manifest.mode,
          createdAt: manifest.createdAt || '',
          appVersion: manifest.appVersion || '',
          fileCount: manifest.files.length,
          totalBytes,
          sourceFileName: path.basename(resolvedPackage),
        },
      }
    } catch (error) {
      if (!extractTo) await removeDirSafe(extractionDir)
      throw error
    }
  }

  async prepareRestore({ packagePath } = {}) {
    const workRoot = this._workDirService?.getRootPath?.()
    if (!workRoot) throw new Error('当前没有可恢复的工作空间')
    if (!this._restoreStateRoot) throw new Error('恢复状态目录未配置')
    const paths = restoreStatePaths(this._restoreStateRoot)
    await fs.promises.mkdir(paths.root, { recursive: true })
    if (await pathExists(paths.pending)) throw new Error('已有待执行的恢复任务，请先重启应用')
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const stagingDir = path.join(paths.root, `staging-${id}`)
    try {
      const validation = await this.validateBackup(packagePath, { extractTo: stagingDir })
      const safetyDir = path.join(workRoot, '.reviva', 'restore-safety')
      const safetyBackupPath = path.join(safetyDir, `reviva-before-restore-${timestampStamp()}${BACKUP_EXT}`)
      await this.createBackup({ mode: 'full', outputPath: safetyBackupPath })
      const pending = {
        id,
        targetRoot: path.resolve(workRoot),
        stagingDir,
        sourceFileName: path.basename(path.resolve(packagePath)),
        safetyBackupPath,
        createdAt: new Date().toISOString(),
        manifest: validation.manifest,
      }
      await writeJsonAtomic(paths.pending, pending)
      return { success: true, data: { ...validation.data, safetyBackupPath, restartRequired: true } }
    } catch (error) {
      if (isWithin(paths.root, stagingDir)) await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async consumeRestoreResult() {
    if (!this._restoreStateRoot) return null
    const paths = restoreStatePaths(this._restoreStateRoot)
    if (!(await pathExists(paths.result))) return null
    try {
      return JSON.parse(await fs.promises.readFile(paths.result, 'utf-8'))
    } finally {
      await fs.promises.rm(paths.result, { force: true }).catch(() => {})
    }
  }

  _workspaceRootsForMode(mode) {
    if (mode === 'database') return []
    if (mode === 'compact') return ['.reviva/config.json', 'notes', 'skills']
    return ['.reviva/config.json', 'docs', 'notes', 'wikis', 'agents', 'skills', 'context']
  }

  _excludesForMode(mode) {
    const common = ['.reviva/logs', '.reviva/trash', '.reviva/reviva.db*', 'cache', 'tmp', 'temp']
    if (mode === 'database') return ['workspace files']
    if (mode === 'compact') {
      return [
        ...common,
        'docs except remote media references',
        'wikis',
        'agents outputs',
        'context attachments',
        'file-backed artifacts',
        'outputs',
        'running parse/OCR jobs',
        'media source files and temporary downloads',
        'media keyframes and thumbnails',
      ]
    }
    return common
  }

  async _addWorkspaceRoot(zip, workRoot, relRoot, outputPath, manifest) {
    const abs = path.join(workRoot, relRoot)
    if (!(await pathExists(abs))) return
    const stat = await fs.promises.stat(abs)
    if (shouldSkipWorkspaceEntry(path.relative(workRoot, abs), stat, outputPath, abs)) return

    if (stat.isFile()) {
      await this._addFile(zip, abs, slashPath(path.join('workspace', relRoot)), manifest)
      return
    }

    const files = await walkFiles(workRoot, relRoot)
    for (const file of files) {
      if (shouldSkipWorkspaceEntry(file.rel, file.stat, outputPath, file.abs)) continue
      await this._addFile(zip, file.abs, slashPath(path.join('workspace', file.rel)), manifest)
    }
  }

  async _addCompactMediaArtifacts(zip, workRoot, outputPath, manifest) {
    const files = await walkFiles(workRoot, 'context/media')
    let count = 0
    for (const file of files) {
      if (!isCompactMediaArtifact(file.rel)) continue
      if (shouldSkipWorkspaceEntry(file.rel, file.stat, outputPath, file.abs)) continue
      await this._addFile(zip, file.abs, slashPath(path.join('workspace', file.rel)), manifest)
      count += 1
    }
    return count
  }

  async _addCompactMediaReferences(zip, workRoot, outputPath, manifest) {
    const files = await walkFiles(workRoot, 'docs')
    let count = 0
    for (const file of files) {
      if (!file.rel.toLowerCase().endsWith('.media.md')) continue
      if (shouldSkipWorkspaceEntry(file.rel, file.stat, outputPath, file.abs)) continue
      await this._addFile(zip, file.abs, slashPath(path.join('workspace', file.rel)), manifest)
      count += 1
    }
    return count
  }

  async _addFile(zip, absPath, archivePath, manifest) {
    const buffer = await fs.promises.readFile(absPath)
    const stat = await fs.promises.stat(absPath)
    const normalizedArchivePath = slashPath(archivePath)
    zip.file(normalizedArchivePath, buffer)
    manifest.files.push({
      path: normalizedArchivePath,
      size: stat.size,
      sha256: hashBuffer(buffer),
    })
    manifest.stats.fileCount += 1
    manifest.stats.totalBytes += stat.size
  }
}
