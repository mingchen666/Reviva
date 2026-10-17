// agents/tools/vfsHelpers.js — extracted from langchainTools.js
// VFS path resolution helpers used by multiple tool groups.

import path from 'node:path'
import { createVfsPathResolver } from '../../security/VfsPathResolver.js'
import { _workDirService, _toolRunContext } from './toolContext.js'

export function _vfsResolver() {
  return _workDirService ? createVfsPathResolver({ workDirService: _workDirService }) : null
}

export function _vfsContext(extra = {}) {
  const wikiContext = _toolRunContext.wikiContext || {}
  return {
    agentDirName: _toolRunContext.agentEnglishName || '_shared',
    boundSkillIds: _toolRunContext.boundSkillIds || [],
    allowedWikiIds: Array.isArray(wikiContext.wikiIds) ? wikiContext.wikiIds.filter(Boolean) : [],
    wikiContext,
    ...extra,
  }
}

export function _resolveVfsPath(inputPath, op, toolName) {
  const resolver = _vfsResolver()
  if (!resolver) throw new Error('No workspace initialized')
  return resolver.resolve(inputPath, _vfsContext({ op, toolName }))
}

export function _toVirtualWorkspacePath(absPath) {
  const resolver = _vfsResolver()
  if (resolver) return resolver.toVirtualPath(absPath, _vfsContext({ op: 'read' }))
  const root = _workDirService?.getRootPath?.()
  if (!root) return absPath.replace(/\\/g, '/')
  const rel = path.relative(root, absPath).replace(/\\/g, '/')
  return rel && !rel.startsWith('..') ? '/' + rel : absPath.replace(/\\/g, '/')
}
