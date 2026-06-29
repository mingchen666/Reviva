import fs from 'node:fs'
import path from 'node:path'
import { officeRead, setDbService, setWorkDirService } from '../agents/langchainTools.js'

export const TEXT_CONTEXT_EXTS = new Set([
  'md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'yaml', 'yml', 'log',
  'html', 'htm', 'xml', 'js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp',
  'h', 'sql',
])
export const OFFICE_CONTEXT_EXTS = new Set(['docx', 'xlsx', 'pptx'])

export function isReadableLocalContextItem(item) {
  if (!item?.path || item.isDirectory || item.type === 'folder' || item.type === 'local_folder') return false
  const ext = fileExt(item.path || item.name)
  return TEXT_CONTEXT_EXTS.has(ext) || OFFICE_CONTEXT_EXTS.has(ext)
}

function fileExt(filePath) {
  return String(filePath || '').split('.').pop().toLowerCase()
}

export class FileContextReader {
  constructor({ db, workDirService }) {
    this._db = db
    this._workDir = workDirService
    setDbService(db)
    setWorkDirService(workDirService)
  }

  async read(ctxItems) {
    const blocks = []
    if (!Array.isArray(ctxItems) || !ctxItems.length) return blocks
    const MAX_FILES = 10
    const MAX_BYTES = 12 * 1024
    const candidates = this._collectCtxFilePaths(ctxItems, MAX_FILES)

    for (const item of candidates) {
      const ext = fileExt(item.path)
      try {
        if (TEXT_CONTEXT_EXTS.has(ext)) {
          const content = this._readTextFile(item.path, MAX_BYTES)
          if (content) blocks.push({ name: item.name || path.basename(item.path), content })
        } else if (OFFICE_CONTEXT_EXTS.has(ext)) {
          const content = await this._readOfficeFile(item.path, MAX_BYTES)
          if (content) blocks.push({ name: item.name || path.basename(item.path), content })
        }
      } catch (_) {
        // Skip unreadable files; the task can still use other selected context.
      }
    }
    return blocks
  }

  _readTextFile(filePath, maxBytes) {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return ''
    const buf = fs.readFileSync(filePath)
    const content = buf.slice(0, maxBytes).toString('utf-8')
    const truncated = buf.length > maxBytes ? '\n...(截断)' : ''
    return content + truncated
  }

  async _readOfficeFile(filePath, maxBytes) {
    const parts = []
    const overview = await this._invokeOfficeRead({
      path: filePath,
      mode: 'overview',
      maxChars: maxBytes,
      maxLines: 120,
    })
    if (overview?.content) parts.push(overview.content)

    const text = await this._invokeOfficeRead({
      path: filePath,
      mode: 'text',
      start: 1,
      maxLines: 120,
      maxChars: maxBytes,
    })
    if (text?.content && text.content !== overview?.content) parts.push(text.content)

    return parts.join('\n\n').slice(0, maxBytes * 2)
  }

  async _invokeOfficeRead(input) {
    const raw = await officeRead.invoke(input)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed?.success ? parsed : null
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
      files.push({ path: p, name: item.name || path.basename(p) })
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
