import path from 'node:path'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

export function normalizeDocsRelativePath(value = '') {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  const segments = normalized ? normalized.split('/').filter(Boolean) : []
  if (path.isAbsolute(normalized) || segments.some(segment => segment === '.' || segment === '..' || segment.includes(':'))) {
    throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'relativePath must be a safe relative Docs directory', { status: 400 })
  }
  return segments.join('/')
}

export function resolveDocsDirectory(workDirService, relativePath = '') {
  const docsRoot = workDirService?.getDocsPath?.()
  if (!docsRoot) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Docs workspace is unavailable', { status: 503 })
  const normalized = normalizeDocsRelativePath(relativePath)
  const root = path.resolve(docsRoot)
  const directory = path.resolve(root, ...normalized.split('/').filter(Boolean))
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'relativePath escapes Docs', { status: 400 })
  }
  return { docsRoot: root, directory, relativePath: normalized }
}
