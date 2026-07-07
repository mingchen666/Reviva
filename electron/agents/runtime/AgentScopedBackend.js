import path from 'node:path'
import { FilesystemBackend } from 'deepagents'
import { createVfsPathResolver } from '../../security/VfsPathResolver.js'

/**
 * Policy wrapper for DeepAgents filesystem tools.
 * Keeps existing memory compatibility while enforcing:
 * - bound skills are read-only;
 * - writes/deletes are limited to this agent's outputs and tmp directory;
 * - .reviva and foreign agent memory are denied;
 * - reads are filtered through VFS policy.
 */
export class AgentScopedBackend extends FilesystemBackend {
  constructor(options, {
    workDirService,
    boundSkillIds = [],
    allowedAgentMemoryDir = '_shared',
    agentDirName = '_shared',
    wikiContext = {},
  } = {}) {
    super(options)
    this._resolver = createVfsPathResolver({ workDirService })
    this._boundSkillIds = new Set(boundSkillIds.map(id => String(id).replace(/\\/g, '/').replace(/^\/?skills\//i, '').replace(/\/+$/, '').toLowerCase()))
    this._allowedAgentMemoryDir = String(allowedAgentMemoryDir || '_shared').toLowerCase()
    this._agentDirName = String(agentDirName || allowedAgentMemoryDir || '_shared')
    this._wikiContext = wikiContext || {}
  }

  _normalizeVirtualPath(virtPath) {
    const norm = ('/' + String(virtPath || '/').replace(/\\/g, '/').replace(/^\/+/, '')).replace(/\/+/g, '/')
    const parts = []
    for (const part of norm.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') {
        throw new Error(`Access denied: parent directory segments are not allowed in path '${virtPath}'`)
      }
      parts.push(part)
    }
    return (parts.length ? `/${parts.join('/')}` : '/').toLowerCase()
  }

  _ctx(op) {
    return {
      op,
      agentDirName: this._agentDirName,
      allowedAgentMemoryDir: this._allowedAgentMemoryDir,
      boundSkillIds: [...this._boundSkillIds],
      allowedWikiIds: Array.isArray(this._wikiContext?.wikiIds) ? this._wikiContext.wikiIds.filter(Boolean) : [],
      wikiContext: this._wikiContext,
    }
  }

  _isUnboundSkillPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    const m = norm.match(/^\/skills\/([^\/]+)/)
    if (!m) return false
    return !this._boundSkillIds.has(m[1].toLowerCase())
  }

  _isForeignAgentMemoryPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    const m = norm.match(/^\/agents\/([^\/]+)\/memory(?:\/|$)/)
    if (!m) return false
    return m[1].toLowerCase() !== this._allowedAgentMemoryDir
  }

  _isAllowedMemoryPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    if (norm === '/memories' || norm === '/memories/agents.md') return true
    const m = norm.match(/^\/agents\/([^\/]+)\/memory(?:\/|$)/)
    if (!m) return false
    return m[1].toLowerCase() === this._allowedAgentMemoryDir
  }

  _deny(message) {
    return { error: message }
  }

  _assertAllowed(filePath, op) {
    const norm = this._normalizeVirtualPath(filePath)
    if (this._isForeignAgentMemoryPath(filePath)) {
      throw new Error(`Access denied: agent memory path '${filePath}' is not owned by this agent`)
    }
    if (norm === '/.reviva' || norm.startsWith('/.reviva/')) {
      throw new Error(`Access denied: system metadata path '${filePath}'`)
    }
    if (this._isUnboundSkillPath(filePath)) {
      throw new Error(`Access denied: skill path '${filePath}' is not bound to this agent`)
    }
    if (op === 'read' && this._isAllowedMemoryPath(filePath)) {
      this._resolver.resolve(filePath, this._ctx('memory_read'))
      return true
    }
    if ((op === 'write' || op === 'edit') && this._isAllowedMemoryPath(filePath)) {
      this._resolver.resolve(filePath, this._ctx(op === 'edit' ? 'memory_edit' : 'memory_write'))
      return true
    }
    if ((op === 'delete' || op === 'rename') && this._isAllowedMemoryPath(filePath)) {
      throw new Error(`Access denied: memory files cannot be deleted or renamed by file tools`)
    }
    this._resolver.resolve(filePath, this._ctx(op))
    return true
  }

  _canReadPath(filePath) {
    try {
      this._assertAllowed(filePath, 'read')
      return true
    } catch {
      return false
    }
  }

  async ls(dirPath = '/') {
    try {
      if (this._isForeignAgentMemoryPath(dirPath)) {
        return { files: [] }
      }
    } catch (err) {
      return this._deny(err.message)
    }
    const normalizedDir = dirPath.replace(/\\/g, '/').replace(/\/+$/, '/')

    if (normalizedDir === '/skills/') {
      const result = await super.ls(dirPath)
      if (result.files) {
        result.files = result.files.filter(f => {
          const dirName = f.path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || ''
          return this._boundSkillIds.has(dirName.toLowerCase())
        })
      }
      return result
    }

    const skillsMatch = normalizedDir.match(/^\/skills\/([^\/]+)\/?$/)
    if (skillsMatch && !this._boundSkillIds.has(skillsMatch[1].toLowerCase())) {
      return { files: [] }
    }

    if (normalizedDir !== '/' && !this._canReadPath(dirPath)) return { files: [] }
    const result = await super.ls(dirPath)
    if (result.files) {
      result.files = result.files.filter(f => this._canReadPath(f.path || path.posix.join(dirPath, f.name || '')))
    }
    return result
  }

  async read(filePath, offset, limit) {
    try { this._assertAllowed(filePath, 'read') } catch (err) { return this._deny(err.message) }
    return super.read(filePath, offset, limit)
  }

  async downloadFiles(paths = []) {
    const allowed = []
    const positions = []
    const responses = Array.from({ length: paths.length }, (_, idx) => ({
      path: paths[idx],
      content: null,
      error: null,
    }))

    for (let idx = 0; idx < paths.length; idx++) {
      const filePath = paths[idx]
      try {
        this._assertAllowed(filePath, 'read')
        allowed.push(filePath)
        positions.push(idx)
      } catch (err) {
        responses[idx].error = err.message
      }
    }

    if (allowed.length) {
      const allowedResponses = await super.downloadFiles(allowed)
      for (let idx = 0; idx < allowedResponses.length; idx++) {
        responses[positions[idx]] = allowedResponses[idx]
      }
    }
    return responses
  }

  async uploadFiles(files = []) {
    const allowed = []
    const positions = []
    const responses = Array.from({ length: files.length }, (_, idx) => ({
      path: Array.isArray(files[idx]) ? files[idx][0] : '',
      error: null,
    }))

    for (let idx = 0; idx < files.length; idx++) {
      const entry = files[idx]
      const filePath = Array.isArray(entry) ? entry[0] : ''
      try {
        this._assertAllowed(filePath, 'write')
        allowed.push(entry)
        positions.push(idx)
      } catch (err) {
        responses[idx].error = err.message
      }
    }

    if (allowed.length) {
      const allowedResponses = await super.uploadFiles(allowed)
      for (let idx = 0; idx < allowedResponses.length; idx++) {
        responses[positions[idx]] = allowedResponses[idx]
      }
    }
    return responses
  }

  async glob(pattern, searchPath) {
    try {
      if (this._isForeignAgentMemoryPath(searchPath || '/')) return { files: [] }
      if (this._isUnboundSkillPath(searchPath || '/')) return { files: [] }
    } catch {
      return { files: [] }
    }
    if (searchPath && searchPath !== '/' && !this._canReadPath(searchPath)) return { files: [] }
    const result = await super.glob(pattern, searchPath)
    if (result.files) {
      result.files = result.files.filter(f => this._canReadPath(f.path))
    }
    return result
  }

  async write(filePath, content) {
    try { this._assertAllowed(filePath, 'write') } catch (err) { return this._deny(err.message) }
    return super.write(filePath, content)
  }

  async edit(filePath, oldString, newString, replaceAll) {
    try { this._assertAllowed(filePath, 'edit') } catch (err) { return this._deny(err.message) }
    return super.edit(filePath, oldString, newString, replaceAll)
  }

  async delete(filePath) {
    try { this._assertAllowed(filePath, 'delete') } catch (err) { return this._deny(err.message) }
    return super.delete(filePath)
  }

  async rename(oldPath, newPath) {
    try {
      this._assertAllowed(oldPath, 'delete')
      this._assertAllowed(newPath, 'write')
    } catch (err) { return this._deny(err.message) }
    return super.rename(oldPath, newPath)
  }
}
