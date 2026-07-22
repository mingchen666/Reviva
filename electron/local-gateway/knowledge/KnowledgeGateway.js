import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

function clean(value) {
  if (!value || typeof value !== 'object') return value
  const { file_path, root_path, storage_path, agent_config, ...rest } = value
  return rest
}

export function registerKnowledgeGateway({ server, registry, dbService, wikiService, sendJson }) {
  registry.registerResource({ id: 'spaces', version: '1.0', description: 'Read MindSpace workspaces' })
  registry.registerResource({ id: 'wikis', version: '1.0', description: 'Read and search MindSpace Wikis' })
  registry.registerResource({ id: 'wiki-pages', version: '1.0', description: 'Read Wiki page indexes and content' })

  server.register('GET', '/api/v1/spaces', ({ response }) => sendJson(response, 200, { data: (dbService?.listSpaces?.() || []).map(clean) }))
  server.register('GET', '/api/v1/spaces/:id', ({ response, params }) => {
    const data = clean(dbService?.getSpace?.(params.id))
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'space not found', { status: 404 })
    sendJson(response, 200, { data })
  })
  server.register('GET', '/api/v1/wikis', async ({ response }) => {
    const result = wikiService?.listWikis ? await wikiService.listWikis() : { data: dbService?.listWikis?.() || [] }
    sendJson(response, 200, { data: (result?.data || result || []).map(clean) })
  })
  server.register('GET', '/api/v1/wikis/:id', async ({ response, params }) => {
    const result = wikiService?.getWiki ? await wikiService.getWiki(params.id) : dbService?.getWiki?.(params.id)
    const data = clean(result?.data || result)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'wiki not found', { status: 404 })
    sendJson(response, 200, { data })
  })
  server.register('GET', '/api/v1/wikis/:id/pages', async ({ response, params }) => {
    if (!wikiService?.listPages) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'wiki pages are unavailable', { status: 503 })
    const result = await wikiService.listPages(params.id)
    sendJson(response, 200, { data: (result?.data || result || []).map(clean) })
  })
  server.register('GET', '/api/v1/wikis/:id/pages/content', async ({ response, params, url }) => {
    const pagePath = String(url.searchParams.get('path') || '').trim()
    if (!pagePath || pagePath.includes('..') || pagePath.startsWith('/') || pagePath.includes('\\')) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'a safe relative page path is required', { status: 400 })
    if (!wikiService?.readPage) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'wiki pages are unavailable', { status: 503 })
    const result = await wikiService.readPage(params.id, pagePath)
    if (!result) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'wiki page not found', { status: 404 })
    sendJson(response, 200, { data: typeof result === 'string' ? { path: pagePath, content: result } : clean(result) })
  })
  server.register('POST', '/api/v1/wikis/:id/search', async ({ response, params, body }) => {
    const query = String(body?.query || '').trim()
    if (!query) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'query is required', { status: 400 })
    if (!wikiService?.searchWiki) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'knowledge search is unavailable', { status: 503 })
    const result = await wikiService.searchWiki(params.id, { query, limit: Math.min(Math.max(Number(body?.limit) || 10, 1), 50), scope: body?.scope || 'all' })
    sendJson(response, 200, { data: result?.data || result || [] })
  })
}
