import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'
import fs from 'node:fs'
import { resolveDocsDirectory } from '../documents/DocsPath.js'

export function registerWebImportGateway({ server, registry, webImportJobService, workDirService, sendJson }) {
  registry.registerAction({ id: 'web.import', description: 'Parse a web page and import it into Docs or Wiki', executionMode: 'async', riskLevel: 'medium' })
  registry.registerResource({ id: 'web-import-jobs', description: 'Read web import job status' })
  server.register('POST', '/api/v1/web/import', ({ response, body }) => {
    if (!webImportJobService?.createJob) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Web Import service is unavailable', { status: 503 })
    const targetType = String(body?.targetType || 'docs')
    let targetRef = String(body?.wikiId || '')
    if (targetType === 'docs') {
      const target = resolveDocsDirectory(workDirService, body?.relativePath)
      if (fs.existsSync(target.docsRoot)) fs.mkdirSync(target.directory, { recursive: true })
      targetRef = target.relativePath
    }
    const result = webImportJobService.createJob({ targetType, targetRef, url: body?.url, fileName: body?.fileName, includeHtml: body?.includeHtml === true })
    sendJson(response, 202, { data: result?.data || result })
  })
  server.register('GET', '/api/v1/web/import-jobs', ({ response, url }) => {
    const filters = { targetType: url.searchParams.get('targetType') || undefined, targetRef: url.searchParams.get('targetRef') || undefined, limit: Math.min(Number(url.searchParams.get('limit')) || 50, 200), offset: Math.max(Number(url.searchParams.get('offset')) || 0, 0) }
    sendJson(response, 200, { data: webImportJobService?.listJobs?.(filters) || [] })
  })
  server.register('GET', '/api/v1/web/import-jobs/:id', ({ response, params }) => {
    const data = webImportJobService?.getJob?.(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'web import job not found', { status: 404 })
    sendJson(response, 200, { data })
  })
}
