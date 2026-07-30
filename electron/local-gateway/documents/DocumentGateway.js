import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import { resolveStagedFile } from '../files/FileGateway.js'
import { resolveDocsDirectory } from './DocsPath.js'

export function importStagedDocument({ fileId, spaceId, name, relativePath = '', dbService, workDirService }) {
  const file = resolveStagedFile(String(fileId || ''))
  if (!file) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'staged file not found', { status: 404 })
  const normalizedSpaceId = String(spaceId || '').trim()
  if (!normalizedSpaceId || !dbService?.getSpace?.(normalizedSpaceId)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'valid spaceId is required', { status: 400 })
  const target = resolveDocsDirectory(workDirService, relativePath)
  const directory = target.directory
  fs.mkdirSync(directory, { recursive: true })
  const targetPath = path.join(directory, `${Date.now()}-${file.filename}`)
  fs.copyFileSync(file.absolutePath, targetPath, fs.constants.COPYFILE_EXCL)
  const ext = path.extname(file.filename).slice(1).toLowerCase()
  const document = dbService?.createDoc?.({ id: `doc_${crypto.randomUUID()}`, space_id: normalizedSpaceId, name: String(name || file.filename), type: ext, size: file.size, status: 'ready', progress: 100, file_path: targetPath })
  return { id: document?.id, spaceId: normalizedSpaceId, name: document?.name || file.filename, type: ext, size: file.size, status: 'ready', relativePath: path.relative(target.docsRoot, targetPath).replace(/\\/g, '/') }
}

function safeDocsFileName(value, fallback) {
  const sanitized = String(value || fallback || 'document')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 180)
  return sanitized || fallback || 'document'
}

export function importStagedFileToDocs({ fileId, fileName, relativePath = '', workDirService }) {
  const file = resolveStagedFile(String(fileId || ''))
  if (!file) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'staged file not found', { status: 404 })
  const target = resolveDocsDirectory(workDirService, relativePath)
  fs.mkdirSync(target.directory, { recursive: true })
  const sourceExt = path.extname(file.filename)
  const requested = safeDocsFileName(fileName, file.filename)
  const requestedExt = path.extname(requested)
  const base = path.basename(requested, requestedExt || sourceExt)
  const extension = requestedExt || sourceExt
  let storedName = `${base}${extension}`
  let sequence = 2
  while (fs.existsSync(path.join(target.directory, storedName))) storedName = `${base} (${sequence++})${extension}`
  const targetPath = path.join(target.directory, storedName)
  fs.copyFileSync(file.absolutePath, targetPath, fs.constants.COPYFILE_EXCL)
  const stat = fs.statSync(targetPath)
  return {
    id: file.fileId,
    name: storedName,
    type: extension.replace(/^\./, '').toLowerCase(),
    size: stat.size,
    status: 'ready',
    progress: 100,
    relativePath: path.relative(target.docsRoot, targetPath).replace(/\\/g, '/'),
  }
}

export function registerDocumentGateway({ server, registry, dbService, workDirService, sendJson }) {
  registry.registerAction({ id: 'documents.import', description: 'Import a staged file into a Reviva workspace', riskLevel: 'medium' })
  server.register('POST', '/api/v1/documents/import', ({ response, body }) => {
    const result = String(body?.targetType || body?.target?.type || '').toLowerCase() === 'docs'
      ? importStagedFileToDocs({ fileId: body?.fileId, fileName: body?.fileName || body?.name, relativePath: body?.relativePath, workDirService })
      : importStagedDocument({ fileId: body?.fileId, spaceId: body?.spaceId, name: body?.name, relativePath: body?.relativePath, dbService, workDirService })
    sendJson(response, 201, { data: result })
  })
}
