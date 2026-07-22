import path from 'node:path'
import fs from 'node:fs'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import { stageFileFromUrl } from '../files/FileGateway.js'
import { importStagedDocument, importStagedFileToDocs } from '../documents/DocumentGateway.js'
import { normalizeDocsRelativePath, resolveDocsDirectory } from '../documents/DocsPath.js'
import { importMediaToDocs } from '../media/MediaGateway.js'

const MEDIA_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.json', '.html', '.htm', '.rtf', '.epub'])

export function detectUrlImportKind(url, requestedKind, targetType) {
  if (requestedKind && requestedKind !== 'auto') return requestedKind
  if (targetType === 'wiki') return 'web'
  if (/(?:b23\.tv|bilibili\.com\/video\/(?:BV[0-9A-Za-z]+|av\d+))/i.test(url)) return 'media'
  let extension = ''
  try { extension = path.posix.extname(new URL(url).pathname).toLowerCase() } catch {}
  if (MEDIA_EXTENSIONS.has(extension)) return 'media'
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document'
  return 'web'
}

function normalizedFileName(body, url, kind) {
  const requested = String(body?.fileName || body?.filename || body?.title || '').trim()
  if (!requested) return undefined
  const safe = requested.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 180)
  if (!safe) return undefined
  if (kind !== 'document' || path.extname(safe)) return safe
  let extension = ''
  try { extension = path.posix.extname(new URL(url).pathname).toLowerCase() } catch {}
  return `${safe}${DOCUMENT_EXTENSIONS.has(extension) ? extension : ''}`
}

export function normalizeUrlImportRequest(body = {}) {
  const url = String(body?.url || '').trim()
  let parsed
  try { parsed = new URL(url) } catch { throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'url must be a valid absolute URL', { status: 400 }) }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'only http/https URLs without credentials are allowed', { status: 400 })
  }
  const targetType = String(body?.target?.type || body?.targetType || 'docs')
  const requestedKind = String(body?.kind || 'auto')
  const kind = detectUrlImportKind(parsed.toString(), requestedKind, targetType)
  if (!['web', 'document', 'media'].includes(kind)) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'kind must be auto, web, document or media', { status: 400 })
  return {
    url: parsed.toString(),
    kind,
    targetType,
    relativePath: normalizeDocsRelativePath(body?.relativePath || body?.target?.relativePath),
    fileName: normalizedFileName(body, parsed.toString(), kind),
    title: String(body?.title || body?.fileName || body?.filename || '').trim(),
  }
}

export function registerUrlImportGateway({ server, registry, dbService, workDirService, webImportJobService, mediaModule, sendJson }) {
  registry.registerAction({ id: 'imports.url', description: 'Automatically route a URL to web, document or media import', executionMode: 'async', riskLevel: 'medium' })
  server.register('POST', '/api/v1/imports/from-url', async ({ response, body }) => {
    const { url, kind, targetType, relativePath, fileName, title } = normalizeUrlImportRequest(body)

    if (kind === 'media') {
      if (!mediaModule?.ingestion?.registerAndAnalyze) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Media service is unavailable', { status: 503 })
      const result = await importMediaToDocs({ mediaModule, workDirService, url, title: title || fileName, relativePath, presetId: body?.presetId, language: body?.language, providerId: body?.providerId, extractKeyframes: body?.extractKeyframes, maxDownloadMb: body?.maxDownloadMb })
      sendJson(response, 202, { data: { kind, ...result } })
      return
    }

    if (kind === 'document') {
      const spaceId = String(body?.target?.spaceId || body?.spaceId || '')
      const staged = await stageFileFromUrl({ url, filename: fileName, relativePath: `url-imports/${relativePath}` })
      const document = targetType === 'docs' && !spaceId
        ? importStagedFileToDocs({ fileId: staged.fileId, fileName, relativePath, workDirService })
        : importStagedDocument({ fileId: staged.fileId, spaceId, name: title || fileName, relativePath, dbService, workDirService })
      sendJson(response, 201, { data: { kind, document, stagedFileId: staged.fileId } })
      return
    }

    if (!webImportJobService?.createJob) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Web Import service is unavailable', { status: 503 })
    let targetRef = String(body?.target?.wikiId || body?.wikiId || '')
    if (targetType === 'docs') {
      const target = resolveDocsDirectory(workDirService, relativePath)
      if (fs.existsSync(target.docsRoot)) fs.mkdirSync(target.directory, { recursive: true })
      targetRef = target.relativePath
    }
    const result = webImportJobService.createJob({ targetType, targetRef, url, fileName, includeHtml: body?.includeHtml === true })
    sendJson(response, 202, { data: { kind, job: result?.data || result } })
  })
}
