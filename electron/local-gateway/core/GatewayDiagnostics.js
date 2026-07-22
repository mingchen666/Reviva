export function registerGatewayDiagnostics({ server, registry, dbService, agentService, wikiService, sendJson }) {
  registry.registerResource({ id: 'gateway-diagnostics', description: 'Read non-sensitive Gateway diagnostics' })
  server.register('GET', '/api/v1/gateway/diagnostics', ({ response }) => {
    const status = server.getStatus()
    const dbReady = !!(dbService?.getSetting && dbService?.listAgents)
    const agentReady = !!agentService?.handleStartRun
    const knowledgeReady = !!wikiService?.listWikis
    sendJson(response, 200, {
      data: {
        status: status.running ? 'ready' : 'stopped',
        running: status.running,
        address: status.address,
        protocolVersion: '1.0',
        services: { database: dbReady, agent: agentReady, knowledgeBase: knowledgeReady },
        limits: { requestBodyBytes: 30 * 1024 * 1024, uploadBytes: 20 * 1024 * 1024, rateLimitPerMinute: 120 },
        security: { apiKeyRequired: true, loopbackDefault: true, httpsRequired: false, absolutePathsExposed: false },
      },
    })
  })
}
