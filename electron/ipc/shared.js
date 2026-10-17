import path from 'node:path'
import fs from 'node:fs'

const PERCENT_BYTES_RE = /(?:%[0-9A-Fa-f]{2})+/g
const QUOTE_BOUNDARY_RE = /^[`'"\u201c\u201d\u2018\u2019<]+|[`'"\u201c\u201d\u2018\u2019>]+$/g

export function decodePercentRuns(value) {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value.replace(PERCENT_BYTES_RE, seq => {
      try { return decodeURIComponent(seq) } catch { return seq }
    })
  }
}

export function normalizeIncomingPath(inputPath) {
  if (typeof inputPath !== 'string') return inputPath
  let p = inputPath.trim().replace(QUOTE_BOUNDARY_RE, '')
  if (/^(file|reviva-file):\/\//i.test(p)) {
    try {
      const url = new URL(p)
      p = decodePercentRuns(url.pathname || '')
      if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1)
    } catch {
      // Keep the original value and still try percent-decoding below.
    }
  }
  return decodePercentRuns(p)
}

/**
 * Creates path-validation helpers bound to a WorkDirService instance.
 * Returns { validateFsPath, validateShellPath, toWorkspaceVirtualPath }.
 */
export function createPathHelpers(workDirService) {
  function validateFsPath(inputPath) {
    const normalizedPath = normalizeIncomingPath(inputPath)
    if (!workDirService || !workDirService.getRootPath()) return normalizedPath
    return workDirService.resolveAndValidate(normalizedPath, 'any')
  }

  function validateShellPath(inputPath) {
    const normalizedPath = normalizeIncomingPath(inputPath)
    if (!workDirService || !workDirService.getRootPath()) return normalizedPath
    const resolved = path.resolve(normalizedPath)
    const root = path.resolve(workDirService.getRootPath())
    if (resolved.toLowerCase() === root.toLowerCase()) return resolved
    return workDirService.resolveAndValidate(normalizedPath, 'any')
  }

  function toWorkspaceVirtualPath(absPath) {
    const rootPath = workDirService?.getRootPath?.()
    if (!rootPath) return String(absPath || '').replace(/\\/g, '/')
    const rel = path.relative(rootPath, absPath).replace(/\\/g, '/')
    return rel && !rel.startsWith('..') ? '/' + rel : String(absPath || '').replace(/\\/g, '/')
  }

  return { validateFsPath, validateShellPath, toWorkspaceVirtualPath }
}

export async function ensureWorkspaceDirs(workDirService) {
  const rootPath = workDirService?.getRootPath?.()
  if (!rootPath) return
  const dirs = [
    path.join(rootPath, 'docs'),
    path.join(rootPath, 'notes'),
    path.join(rootPath, 'wikis'),
    path.join(rootPath, 'context'),
    path.join(rootPath, 'agents'),
    path.join(rootPath, 'skills'),
    path.join(rootPath, '.reviva'),
    path.join(rootPath, '.reviva', 'trash'),
    path.join(rootPath, '.reviva', 'logs'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
  }
}
