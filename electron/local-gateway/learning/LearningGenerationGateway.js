import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

export function registerLearningGenerationGateway({ server, registry, learningService, sendJson }) {
  registry.registerResource({ id: 'learning.sources', version: '1.0', description: 'Read safe learning source metadata' })
  registry.registerResource({ id: 'learning.generations', version: '1.0', description: 'Read durable learning generation results' })
  registry.registerAction({ id: 'learning.generations.create', version: '1.0', description: 'Start a learning generation', executionMode: 'async', riskLevel: 'high' })
  registry.registerAction({ id: 'learning.generations.cancel', version: '1.0', description: 'Cancel a learning generation through executions.cancel', riskLevel: 'medium' })

  server.register('GET', '/api/v1/learning/sources', async ({ response, url }) => {
    const page = await learningService.listSources({
      cursor: url.searchParams.get('cursor') || '',
      limit: url.searchParams.get('limit'),
      type: url.searchParams.get('type') || '',
    })
    sendJson(response, 200, page)
  })

  server.register('POST', '/api/v1/learning/generations', async ({ response, body }) => {
    const data = await learningService.start(body)
    sendJson(response, 202, { data })
  })

  server.register('GET', '/api/v1/learning/generations/:runId', ({ response, params }) => {
    const runId = String(params.runId || '')
    if (!runId) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'runId is required', { status: 400 })
    sendJson(response, 200, { data: learningService.get(runId) })
  })
}
