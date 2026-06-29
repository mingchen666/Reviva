import fs from 'node:fs'
import path from 'node:path'

const SYSTEM_DENIED_PREFIXES = ['/.reviva']
const READ_OPS = new Set(['read', 'tool_input', 'exec_arg', 'exec_cwd', 'memory_read'])
const WRITE_OPS = new Set(['write', 'edit', 'tool_output', 'memory_write', 'memory_edit'])

function posixPath(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

function ensureVirtualPath(value = '/') {
  const normalized = ('/' + posixPath(value).replace(/^\/+/, '')).replace(/\/+/g, '/')
  const parts = []
  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      throw makeVfsError('VFS_PARENT_SEGMENT_DENIED', `Parent directory segments are not allowed in VFS paths: ${value}`)
    }
    parts.push(part)
  }
  return parts.length ? `/${parts.join('/')}` : '/'
}

function lowerFsPath(value = '') {
  return path.resolve(String(value || '')).toLowerCase()
}

function isSameOrInside(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function safeDirName(name) {
  return String(name || '_shared')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || '_shared'
}

function decodeFileUrl(inputPath) {
  const raw = String(inputPath || '').trim()
  if (!/^file:\/\//i.test(raw)) return raw
  try {
    const url = new URL(raw)
    let pathname = decodeURIComponent(url.pathname || '')
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw
  }
}

function makeVfsError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function realpathIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  return fs.realpathSync.native(filePath)
}

function nearestExistingParent(filePath) {
  let current = path.resolve(filePath)
  if (fs.existsSync(current)) return current
  let parent = path.dirname(current)
  while (parent && parent !== current) {
    if (fs.existsSync(parent)) return parent
    current = parent
    parent = path.dirname(current)
  }
  return null
}

export class VfsPathResolver {
  constructor({ workDirService = null, projectRootProvider = null } = {}) {
    this._workDirService = workDirService
    this._projectRootProvider = projectRootProvider
  }

  workspaceRoot() {
    const root = this._workDirService?.getRootPath?.()
    if (!root) throw makeVfsError('VFS_NO_WORKSPACE', 'No workspace initialized')
    return path.resolve(root)
  }

  projectRoot() {
    const provided = typeof this._projectRootProvider === 'function'
      ? this._projectRootProvider()
      : this._projectRootProvider
    return provided ? path.resolve(provided) : ''
  }

  mounts() {
    const root = this.workspaceRoot()
    const projectRoot = this.projectRoot()
    const mounts = [
      { name: 'docs', virtualPrefix: '/docs', realRoot: path.join(root, 'docs') },
      { name: 'notes', virtualPrefix: '/notes', realRoot: path.join(root, 'notes') },
      { name: 'wikis', virtualPrefix: '/wikis', realRoot: path.join(root, 'wikis') },
      { name: 'wiki', virtualPrefix: '/wiki', realRoot: path.join(root, 'wiki') },
      { name: 'context', virtualPrefix: '/context', realRoot: path.join(root, 'context') },
      { name: 'agents', virtualPrefix: '/agents', realRoot: path.join(root, 'agents') },
      { name: 'skills', virtualPrefix: '/skills', realRoot: path.join(root, 'skills') },
      { name: 'memories', virtualPrefix: '/memories', realRoot: path.join(root, 'memories') },
    ]
    if (projectRoot) mounts.unshift({ name: 'project', virtualPrefix: '/project', realRoot: projectRoot })
    mounts.push({ name: 'workspace', virtualPrefix: '/', realRoot: root })
    return mounts.map(m => ({ ...m, realRoot: path.resolve(m.realRoot) }))
  }

  resolve(inputPath, ctx = {}) {
    const op = ctx.op || 'read'
    const raw = decodeFileUrl(inputPath)
    if (!raw) throw makeVfsError('VFS_INVALID_PATH', 'Path is required')

    const resolved = this._resolvePathShape(raw, ctx)
    this._assertRealpathWithinMount(resolved.realPath, resolved.mount, op)
    this.assertAllowed(resolved, { ...ctx, op })
    return { ...resolved, op }
  }

  resolveRead(inputPath, ctx = {}) {
    return this.resolve(inputPath, { ...ctx, op: 'read' })
  }

  resolveWrite(inputPath, ctx = {}) {
    return this.resolve(inputPath, { ...ctx, op: 'write' })
  }

  resolveDelete(inputPath, ctx = {}) {
    return this.resolve(inputPath, { ...ctx, op: 'delete' })
  }

  toVirtualPath(realPath, ctx = {}) {
    if (!realPath) return ''
    const absolute = path.resolve(String(realPath))
    const mounts = this.mounts()
      .slice()
      .sort((a, b) => b.realRoot.length - a.realRoot.length)
    for (const mount of mounts) {
      if (!isSameOrInside(absolute, mount.realRoot)) continue
      const rel = path.relative(mount.realRoot, absolute).replace(/\\/g, '/')
      const virtualPath = mount.virtualPrefix === '/'
        ? ensureVirtualPath(rel)
        : ensureVirtualPath(`${mount.virtualPrefix}/${rel}`)
      try {
        this.assertAllowed({ virtualPath, realPath: absolute, mount }, { ...ctx, op: ctx.op || 'read' })
      } catch {
        continue
      }
      return virtualPath
    }
    return posixPath(realPath)
  }

  redactText(text, ctx = {}) {
    let output = String(text || '')
    const mounts = this.mounts()
      .slice()
      .sort((a, b) => b.realRoot.length - a.realRoot.length)
    for (const mount of mounts) {
      const real = path.resolve(mount.realRoot)
      const virtual = mount.virtualPrefix
      output = output.split(real).join(virtual)
      output = output.split(posixPath(real)).join(virtual)
    }
    return output
  }

  resolveExecCommand({ cmd, args = [], cwd = '/' } = {}, ctx = {}) {
    const resolvedCwd = this.resolve(cwd || '/', { ...ctx, op: 'exec_cwd' })
    const realArgs = []
    const virtualArgs = []
    for (const arg of Array.isArray(args) ? args : []) {
      const value = String(arg)
      const parsed = this._looksLikePathArgument(value)
        ? this._resolveExecArg(value, ctx)
        : this._resolveInlineExecArg(value, ctx)
      realArgs.push(parsed?.realPath || value)
      virtualArgs.push(parsed?.virtualPath || value)
    }
    return {
      cmd: String(cmd || '').trim(),
      args: realArgs,
      cwd: resolvedCwd.realPath,
      virtual: {
        cwd: resolvedCwd.virtualPath,
        args: virtualArgs,
      },
    }
  }

  assertAllowed(resolved, ctx = {}) {
    const op = ctx.op || resolved.op || 'read'
    const virtualPath = ensureVirtualPath(resolved.virtualPath)
    const lowerVirtual = virtualPath.toLowerCase()
    for (const prefix of SYSTEM_DENIED_PREFIXES) {
      if (lowerVirtual === prefix || lowerVirtual.startsWith(prefix + '/')) {
        throw makeVfsError('VFS_SYSTEM_PATH_DENIED', `Access denied for system path: ${virtualPath}`)
      }
    }

    if (READ_OPS.has(op)) return this._assertReadAllowed(virtualPath, ctx)
    if (WRITE_OPS.has(op)) return this._assertWriteAllowed(virtualPath, ctx)
    if (op === 'delete') return this._assertDeleteAllowed(virtualPath, ctx)
    throw makeVfsError('VFS_OPERATION_DENIED', `Unsupported VFS operation: ${op}`)
  }

  _resolvePathShape(inputPath, ctx) {
    const mounts = this.mounts()
    if (this._isVirtualPath(inputPath)) return this._resolveVirtualPath(inputPath, mounts)
    if (ctx.allowRealPath === false) {
      throw makeVfsError('VFS_REAL_PATH_DENIED', `Real paths are not allowed here: ${inputPath}`)
    }
    return this._resolveRealPath(inputPath, mounts)
  }

  _isVirtualPath(inputPath) {
    const value = posixPath(inputPath)
    if (/^[a-zA-Z]:\//.test(value)) return false
    if (/^\/\/[^/]+/.test(value)) return false
    return value === '/' ||
      /^\/(project|docs|notes|context|wikis|wiki|agents|skills|memories)(\/|$)/i.test(value) ||
      /^\/\.reviva(\/|$)/i.test(value)
  }

  _resolveVirtualPath(inputPath, mounts) {
    const virtualPath = ensureVirtualPath(inputPath)
    const lowerVirtual = virtualPath.toLowerCase()
    const mount = mounts
      .slice()
      .sort((a, b) => b.virtualPrefix.length - a.virtualPrefix.length)
      .find(item => {
        const prefix = item.virtualPrefix.toLowerCase()
        return lowerVirtual === prefix || lowerVirtual.startsWith(prefix + '/') || prefix === '/'
      })
    if (!mount) throw makeVfsError('VFS_PATH_OUTSIDE_MOUNTS', `Path is outside VFS mounts: ${inputPath}`)
    const rel = mount.virtualPrefix === '/'
      ? virtualPath.replace(/^\/+/, '')
      : virtualPath.slice(mount.virtualPrefix.length).replace(/^\/+/, '')
    return {
      virtualPath,
      realPath: path.resolve(mount.realRoot, ...rel.split('/').filter(Boolean)),
      mount,
    }
  }

  _resolveRealPath(inputPath, mounts) {
    const absolute = path.resolve(inputPath)
    const mount = mounts
      .slice()
      .sort((a, b) => b.realRoot.length - a.realRoot.length)
      .find(item => isSameOrInside(absolute, item.realRoot))
    if (!mount) throw makeVfsError('VFS_PATH_OUTSIDE_MOUNTS', `Path is outside VFS mounts: ${inputPath}`)
    const rel = path.relative(mount.realRoot, absolute).replace(/\\/g, '/')
    const virtualPath = mount.virtualPrefix === '/'
      ? ensureVirtualPath(rel)
      : ensureVirtualPath(`${mount.virtualPrefix}/${rel}`)
    return { virtualPath, realPath: absolute, mount }
  }

  _assertRealpathWithinMount(realPath, mount, op) {
    const realRoot = realpathIfExists(mount.realRoot) || path.resolve(mount.realRoot)
    const targetReal = fs.existsSync(realPath)
      ? realpathIfExists(realPath)
      : realpathIfExists(nearestExistingParent(realPath))
    if (!targetReal) return
    if (!isSameOrInside(targetReal, realRoot)) {
      throw makeVfsError('VFS_REALPATH_ESCAPE', `Path escapes VFS mount via symlink or junction: ${realPath}`)
    }
    if (op === 'delete' && fs.existsSync(realPath)) {
      const stat = fs.statSync(realPath)
      if (stat.isDirectory() && !isSameOrInside(realpathIfExists(realPath) || realPath, realRoot)) {
        throw makeVfsError('VFS_REALPATH_ESCAPE', `Delete target escapes VFS mount: ${realPath}`)
      }
    }
  }

  _assertReadAllowed(virtualPath, ctx) {
    if (ctx.op === 'exec_cwd' && virtualPath === '/') return true
    if (ctx.op === 'memory_read' && this._isAllowedMemoryPath(virtualPath, ctx)) return true
    if (this._isAllowedSkill(virtualPath, ctx)) return true
    if (this._isAllowedWiki(virtualPath, ctx)) return true
    if (this._isSelfAgentOutput(virtualPath, ctx)) return true
    if (this._matchesAny(virtualPath, ['/docs', '/notes', '/context'])) return true
    if (virtualPath === '/project' || virtualPath.startsWith('/project/')) return true
    if (virtualPath === '/memories' || virtualPath.startsWith('/memories/')) return true
    throw makeVfsError('VFS_OPERATION_DENIED', `Read is not allowed for ${virtualPath}`)
  }

  _assertWriteAllowed(virtualPath, ctx) {
    if ((ctx.op === 'memory_write' || ctx.op === 'memory_edit') && this._isAllowedMemoryPath(virtualPath, ctx)) return true
    if (this._isSelfAgentOutput(virtualPath, ctx)) return true
    throw makeVfsError('VFS_OPERATION_DENIED', `Write is only allowed in this agent's outputs: ${virtualPath}`)
  }

  _assertDeleteAllowed(virtualPath, ctx) {
    if (this._isSelfAgentOutput(virtualPath, ctx)) return true
    throw makeVfsError('VFS_OPERATION_DENIED', `Delete is only allowed in this agent's outputs: ${virtualPath}`)
  }

  _isAllowedSkill(virtualPath, ctx) {
    const m = ensureVirtualPath(virtualPath).match(/^\/skills\/([^/]+)(?:\/|$)/i)
    if (!m) return false
    const bound = new Set((ctx.boundSkillIds || []).map(id => String(id).toLowerCase()))
    if (!bound.size) throw makeVfsError('VFS_UNBOUND_SKILL', `Skill is not bound to this agent: ${m[1]}`)
    if (!bound.has(m[1].toLowerCase())) {
      throw makeVfsError('VFS_UNBOUND_SKILL', `Skill is not bound to this agent: ${m[1]}`)
    }
    return true
  }

  _isAllowedWiki(virtualPath, ctx) {
    const m = ensureVirtualPath(virtualPath).match(/^\/wikis\/([^/]+)(?:\/|$)/i)
    if (!m) return false
    const allowed = new Set((ctx.allowedWikiIds || ctx.wikiContext?.wikiIds || []).map(id => String(id)))
    if (!allowed.size) throw makeVfsError('VFS_UNSELECTED_WIKI', `Wiki is not selected for this run: ${m[1]}`)
    if (!allowed.has(m[1])) throw makeVfsError('VFS_UNSELECTED_WIKI', `Wiki is not selected for this run: ${m[1]}`)
    return true
  }

  _isAllowedMemoryPath(virtualPath, ctx) {
    const pathValue = ensureVirtualPath(virtualPath)
    const lowerPath = pathValue.toLowerCase()
    if (lowerPath === '/memories' || lowerPath === '/memories/agents.md') return true
    const m = lowerPath.match(/^\/agents\/([^/]+)\/memory(?:\/|$)/i)
    if (!m) return false
    const allowedDir = safeDirName(ctx.allowedAgentMemoryDir || ctx.agentDirName || '_shared').toLowerCase()
    return m[1] === allowedDir
  }

  _isSelfAgentOutput(virtualPath, ctx) {
    const agentDirName = safeDirName(ctx.agentDirName || '_shared')
    const prefix = `/agents/${agentDirName}/outputs`
    const pathValue = ensureVirtualPath(virtualPath)
    return pathValue === prefix || pathValue.startsWith(prefix + '/')
  }

  _matchesAny(virtualPath, prefixes) {
    const pathValue = ensureVirtualPath(virtualPath)
    return prefixes.some(prefix => pathValue === prefix || pathValue.startsWith(prefix + '/'))
  }

  _looksLikePathArgument(value) {
    const text = String(value || '')
    return /^\/(project|docs|notes|context|wikis|wiki|agents|skills|memories)(\/|$)/i.test(text) ||
      /^[a-zA-Z]:[\\/]/.test(text) ||
      /^file:\/\//i.test(text)
  }

  _resolveExecArg(value, ctx) {
    return this.resolve(value, { ...ctx, op: 'exec_arg' })
  }

  _resolveInlineExecArg(value, ctx) {
    const match = String(value || '').match(/^([^=]+)=(\/(?:project|docs|notes|context|wikis|wiki|agents|skills|memories)(?:\/.*)?|[a-zA-Z]:[\\/].*)$/i)
    if (!match) return null
    const resolved = this.resolve(match[2], { ...ctx, op: 'exec_arg' })
    return {
      realPath: `${match[1]}=${resolved.realPath}`,
      virtualPath: `${match[1]}=${resolved.virtualPath}`,
    }
  }
}

export function createVfsPathResolver(options = {}) {
  return new VfsPathResolver(options)
}
