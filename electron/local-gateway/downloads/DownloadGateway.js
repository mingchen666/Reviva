import fs from 'node:fs'
import path from 'node:path'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import { resolveStagedFile } from '../files/FileGateway.js'

const MIME = { '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }

function sendFile(response, filePath, filename) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'file content is unavailable', { status: 404 })
  const safeName = String(filename || path.basename(filePath)).replace(/[\r\n"\\/]/g, '_')
  response.statusCode = 200
  response.setHeader('Content-Type', MIME[path.extname(safeName).toLowerCase()] || 'application/octet-stream')
  response.setHeader('Content-Length', fs.statSync(filePath).size)
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`)
  fs.createReadStream(filePath).pipe(response)
}

function workspaceFile(workDirService, filePath) {
  const rootValue = workDirService?.getRootPath?.()
  if (!rootValue) return ''
  const root = path.resolve(rootValue); const resolved = path.resolve(String(filePath || ''))
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : ''
}

export function registerDownloadGateway({ server, registry, dbService, workDirService }) {
  registry.registerResource({ id: 'resource-downloads', description: 'Download files by resource ID' })
  server.register('GET', '/api/v1/files/:id/content', ({ response, params }) => {
    const file = resolveStagedFile(params.id)
    if (!file) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'staged file not found', { status: 404 })
    sendFile(response, file.absolutePath, file.filename)
  })
  server.register('GET', '/api/v1/documents/:id/download', ({ response, params }) => {
    const document = (dbService?.listDocs?.() || []).find(item => item.id === params.id)
    if (!document) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'document not found', { status: 404 })
    sendFile(response, workspaceFile(workDirService, document.file_path), document.name || 'document')
  })
  server.register('GET', '/api/v1/artifacts/:id/download', ({ response, params }) => {
    const artifact = dbService?.getArtifact?.(params.id)
    if (!artifact) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'artifact not found', { status: 404 })
    sendFile(response, workspaceFile(workDirService, artifact.file_path), artifact.title || 'artifact')
  })
}
