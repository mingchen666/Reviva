import fs from 'node:fs'
import path from 'node:path'
import { createVfsPathResolver } from '../security/VfsPathResolver.js'

function _dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function _safeName(name) {
  const parsed = path.parse(name || 'output')
  const base = (parsed.name || 'output')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'output'
  return base
}

function _safeDirName(name) {
  return String(name || '_shared')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || '_shared'
}

function _uniquePath(dir, filename) {
  const parsed = path.parse(filename)
  let candidate = path.join(dir, filename)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}_${index}${parsed.ext}`)
    index += 1
  }
  return candidate
}

export class ToolPathGuard {
  constructor(workDirService, { agentDirName = '' } = {}) {
    this._workDirService = workDirService
    this._agentDirName = _safeDirName(agentDirName || '_shared')
    this._resolver = createVfsPathResolver({ workDirService })
  }

  requireWorkspace() {
    if (!this._workDirService?.getRootPath?.()) {
      const err = new Error('未初始化工作空间。')
      err.code = 'NO_WORKSPACE'
      throw err
    }
  }

  resolveInput(inputPath, { allowedExts = null, maxBytes = 0 } = {}) {
    this.requireWorkspace()
    if (!inputPath || typeof inputPath !== 'string') {
      const err = new Error('缺少输入文件路径。')
      err.code = 'TOOL_INVALID_ARGUMENT'
      throw err
    }

    let resolved
    try {
      resolved = this._resolver.resolve(inputPath, this._ctx({ op: 'tool_input' })).realPath
    } catch (e) {
      const err = new Error(`安全限制：${e.message}`)
      err.code = 'TOOL_INPUT_NOT_ALLOWED'
      throw err
    }

    if (!fs.existsSync(resolved)) {
      const err = new Error('输入文件不存在。')
      err.code = 'FILE_NOT_FOUND'
      throw err
    }
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      const err = new Error('输入路径必须是文件。')
      err.code = 'TOOL_INVALID_ARGUMENT'
      throw err
    }
    if (maxBytes && stat.size > maxBytes) {
      const err = new Error(`输入文件过大，当前 ${(stat.size / 1024 / 1024).toFixed(1)}MB。`)
      err.code = 'TOOL_INPUT_TOO_LARGE'
      throw err
    }

    const ext = path.extname(resolved).toLowerCase()
    if (allowedExts && !allowedExts.has(ext)) {
      const err = new Error(`不支持的输入格式：${ext || '(无扩展名)'}`)
      err.code = 'TOOL_UNSUPPORTED_FORMAT'
      throw err
    }

    return resolved
  }

  ensureContextOutputDir(toolsetId) {
    this.requireWorkspace()
    const root = this._workDirService.getRootPath()
    const dir = path.join(root, 'context', toolsetId, _dateStamp())
    fs.mkdirSync(dir, { recursive: true })
    this._workDirService.resolveAndValidate(dir, 'any')
    return dir
  }

  ensureOutputDir(toolsetId) {
    this.requireWorkspace()
    const root = this._workDirService.getRootPath()
    const dir = path.join(root, 'agents', this._agentDirName, 'outputs', _dateStamp())
    fs.mkdirSync(dir, { recursive: true })
    this._resolver.resolve(dir, this._ctx({ op: 'tool_output' }))
    return dir
  }

  makeOutputPath(toolsetId, inputPath, { suffix = '', ext = '' } = {}) {
    const dir = this.ensureOutputDir(toolsetId)
    const base = _safeName(path.basename(inputPath || 'output'))
    const cleanSuffix = suffix ? `_${_safeName(suffix)}` : ''
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`
    return _uniquePath(dir, `${base}${cleanSuffix}${cleanExt}`)
  }

  makeOutputPattern(toolsetId, inputPath, { suffix = 'frame', ext = '.jpg' } = {}) {
    const dir = this.ensureOutputDir(toolsetId)
    const base = _safeName(path.basename(inputPath || 'output'))
    const cleanSuffix = _safeName(suffix)
    const patternDir = _uniquePath(dir, `${base}_${cleanSuffix}`)
    fs.mkdirSync(patternDir, { recursive: true })
    this._resolver.resolve(patternDir, this._ctx({ op: 'tool_output' }))
    return path.join(patternDir, `%04d${ext.startsWith('.') ? ext : `.${ext}`}`)
  }

  toVirtualPath(absPath) {
    try {
      return this._resolver.toVirtualPath(absPath, this._ctx({ op: 'read' }))
    } catch {
      const root = this._workDirService?.getRootPath?.()
      if (!root) return absPath.replace(/\\/g, '/')
      const rel = path.relative(root, absPath).replace(/\\/g, '/')
      return rel && !rel.startsWith('..') ? '/' + rel : absPath.replace(/\\/g, '/')
    }
  }

  _ctx(extra = {}) {
    return {
      agentDirName: this._agentDirName,
      ...extra,
    }
  }
}
