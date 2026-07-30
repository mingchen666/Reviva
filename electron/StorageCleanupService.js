import fs from 'node:fs'
import path from 'node:path'

export function formatStorageSize(bytes) {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (safeBytes < 1024) return `${safeBytes} B`
  if (safeBytes < 1024 * 1024) return `${(safeBytes / 1024).toFixed(1)} KB`
  if (safeBytes < 1024 * 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export async function getDirectorySize(directoryPath) {
  if (!directoryPath) return 0

  let entries
  try {
    entries = await fs.promises.readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return 0
    throw error
  }

  let total = 0
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      total += await getDirectorySize(entryPath)
      continue
    }
    if (!entry.isFile()) continue
    try {
      const stat = await fs.promises.lstat(entryPath)
      total += stat.size
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return total
}

export function resolveWorkspaceTempPath(workspaceRoot) {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
    throw new Error('当前工作空间未就绪')
  }

  const root = path.resolve(workspaceRoot)
  const tempPath = path.resolve(root, 'tmp')
  if (path.dirname(tempPath) !== root || path.basename(tempPath).toLowerCase() !== 'tmp') {
    throw new Error('临时目录边界校验失败')
  }
  return tempPath
}

export class StorageCleanupService {
  async getTempSize(workspaceRoot) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
      return { bytes: 0, formatted: formatStorageSize(0) }
    }
    const bytes = await getDirectorySize(resolveWorkspaceTempPath(workspaceRoot))
    return { bytes, formatted: formatStorageSize(bytes) }
  }

  async clearTempFiles(workspaceRoot) {
    const tempPath = resolveWorkspaceTempPath(workspaceRoot)
    const clearedBytes = await getDirectorySize(tempPath)
    await fs.promises.rm(tempPath, { recursive: true, force: true })
    await fs.promises.mkdir(tempPath, { recursive: true })
    return {
      bytes: 0,
      formatted: formatStorageSize(0),
      clearedBytes,
    }
  }
}
