import fs from 'node:fs'
import path from 'node:path'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import { resolveDocsDirectory } from '../documents/DocsPath.js'

function publicRegistration(result) {
  return { media: { id: result?.source?.id || '', mediaType: result?.source?.media_type || '', title: result?.source?.title || result?.source?.file_name || '', fileName: result?.source?.file_name || '' }, run: result?.run ? { id: result.run.id, status: result.run.status, stage: result.run.stage || '', progress: result.run.progress || 0 } : null, providerId: result?.providerId || '' }
}

function safeReferenceBase(title) {
  return String(title || '远程音视频').replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80) || '远程音视频'
}

function createReferenceFile(workDirService, relativePath, title, sourceType) {
  const target = resolveDocsDirectory(workDirService, relativePath)
  fs.mkdirSync(target.directory, { recursive: true })
  const base = safeReferenceBase(title)
  for (let index = 1; index <= 999; index += 1) {
    const suffix = index === 1 ? '' : ` (${index})`
    const filename = `${base}${suffix}.media.md`
    const absolutePath = path.join(target.directory, filename)
    if (!fs.existsSync(absolutePath)) return { absolutePath, relativePath: path.relative(target.docsRoot, absolutePath).replace(/\\/g, '/'), sourceType }
  }
  const filename = `${base}-${Date.now().toString(36)}.media.md`
  const absolutePath = path.join(target.directory, filename)
  return { absolutePath, relativePath: path.relative(target.docsRoot, absolutePath).replace(/\\/g, '/'), sourceType }
}

function writeReferenceFile(reference, mediaId, title) {
  const displayTitle = String(title || '远程音视频').replace(/[\r\n]+/g, ' ').trim()
  fs.writeFileSync(reference.absolutePath, `---\nmindspaceMediaReference: 1\nmediaId: ${mediaId}\nsourceType: ${reference.sourceType}\n---\n\n# ${displayTitle}\n\n这是 MindSpace 的远程音视频安全引用。原始或签名 URL 不会写入本文档；请通过“解析详情”查看转录、关键帧和历史版本。\n`, { flag: 'wx' })
}

export async function importMediaToDocs({ mediaModule, workDirService, url, title, relativePath = '', presetId, language, providerId, extractKeyframes, maxDownloadMb }) {
  if (!mediaModule?.ingestion?.registerAndAnalyze) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Media service is unavailable', { status: 503 })
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'url is required', { status: 400 })
  const reference = createReferenceFile(workDirService, relativePath, title, 'direct_url')
  try {
    const result = await mediaModule.ingestion.registerAndAnalyze({ url: normalizedUrl, title: String(title || ''), sourceType: 'direct_url', owner: { type: 'docs_file', id: '', locator: reference.absolutePath } }, { presetId: presetId || 'subtitle_first', language: language || '', providerId: providerId || 'auto', extractKeyframes: extractKeyframes === true, remoteDownloadMaxMb: Math.min(Math.max(Number(maxDownloadMb) || 2048, 1), 20480) })
    const mediaId = result?.source?.id || ''
    writeReferenceFile(reference, mediaId, title || result?.source?.title)
    return { ...publicRegistration(result), mediaId, runId: result?.run?.id || '', status: result?.run?.status || 'queued', relativePath: reference.relativePath }
  } catch (error) {
    fs.rmSync(reference.absolutePath, { force: true })
    throw error
  }
}

export function registerMediaGateway({ server, registry, mediaModule, workDirService, sendJson }) {
  registry.registerAction({ id: 'media.import-url', description: 'Import and analyze a public audio or video URL', executionMode: 'async', riskLevel: 'medium' })
  registry.registerResource({ id: 'media', description: 'Read media metadata, transcripts and processing status' })
  server.register('POST', '/api/v1/media/import-from-url', async ({ response, body }) => {
    if (!mediaModule?.ingestion?.registerAndAnalyze) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Media service is unavailable', { status: 503 })
    const url = String(body?.url || '').trim()
    if (!url) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'url is required', { status: 400 })
    const result = await importMediaToDocs({ mediaModule, workDirService, url, title: body?.title, relativePath: body?.relativePath || body?.target?.relativePath, presetId: body?.presetId, language: body?.language, providerId: body?.providerId, extractKeyframes: body?.extractKeyframes, maxDownloadMb: body?.maxDownloadMb })
    sendJson(response, 202, { data: result })
  })
  server.register('GET', '/api/v1/media/runs/:id', ({ response, params }) => {
    const run = mediaModule?.ingestion?.getRunStatus?.(params.id)
    if (!run) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'media run not found', { status: 404 })
    sendJson(response, 200, { data: run })
  })
  server.register('POST', '/api/v1/media/runs/:id/cancel', ({ response, params }) => {
    const run = mediaModule?.ingestion?.cancelRun?.(params.id)
    if (!run) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'media run not found', { status: 404 })
    sendJson(response, 202, { data: run })
  })
  server.register('GET', '/api/v1/media/:id', ({ response, params }) => {
    if (!mediaModule?.query?.query) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Media service is unavailable', { status: 503 })
    sendJson(response, 200, { data: mediaModule.query.query({ mediaId: params.id, mode: 'metadata' }, { trustedInternal: true }) })
  })
  server.register('GET', '/api/v1/media/:id/transcript', ({ response, params, url }) => {
    if (!mediaModule?.query?.query) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Media service is unavailable', { status: 503 })
    sendJson(response, 200, { data: mediaModule.query.query({ mediaId: params.id, mode: 'transcript', cursor: url.searchParams.get('cursor') || '', limit: Number(url.searchParams.get('limit')) || 100 }, { trustedInternal: true }) })
  })
}
