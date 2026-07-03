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
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    return { sanitized: true }
  } finally {
    db.close()
  }
}

export class BackupService {
  constructor(dbService, workDirService, { appVersion = '' } = {}) {
    this._dbService = dbService
    this._workDirService = workDirService
    this._appVersion = appVersion
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
        'docs',
        'wikis',
        'agents outputs',
        'context attachments',
        'file-backed artifacts',
        'outputs',
        'running parse/OCR jobs',
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
