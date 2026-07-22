import crypto from 'node:crypto'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GatewayApiKeyService } from './auth/GatewayApiKeyService.js'
import { CapabilityRegistry, registerBuiltinCapabilities } from './capabilities/CapabilityRegistry.js'
import { loadGatewayConfig, saveGatewayConfig } from './core/GatewayConfig.js'
import { GatewayError, GATEWAY_ERROR_CODES } from './core/GatewayErrors.js'
import { GatewayHttpServer } from './http/GatewayHttpServer.js'
import { registerOpenAiCompatibility } from './openai/OpenAiCompatibility.js'
import { registerResponsesCompatibility } from './openai/ResponsesCompatibility.js'
import { registerKnowledgeGateway } from './knowledge/KnowledgeGateway.js'
import { registerFileGateway } from './files/FileGateway.js'
import { registerDocumentGateway } from './documents/DocumentGateway.js'
import { registerDocsFolderGateway } from './documents/DocsFolderGateway.js'
import { registerDownloadGateway } from './downloads/DownloadGateway.js'
import { registerGatewayDiagnostics } from './core/GatewayDiagnostics.js'
import { registerWebImportGateway } from './web/WebImportGateway.js'
import { registerMediaGateway } from './media/MediaGateway.js'
import { registerUrlImportGateway } from './imports/UrlImportGateway.js'
import { registerNotesGateway } from './notes/NotesGateway.js'
import { AgentAdapter, NoteAdapter, TaskAdapter, ConversationAdapter, DocumentAdapter, ExecutionAdapter, OutputAdapter } from './adapters/ResourceAdapters.js'

const INSTANCE_ID_SETTING = 'localGatewayInstanceId'

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(body)
}

function sendSse(response, event, payload) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function getOrCreateInstanceId(dbService) {
  const existing = String(dbService?.getSetting?.(INSTANCE_ID_SETTING) || '')
  if (existing) return existing
  const next = crypto.randomUUID()
  dbService?.setSetting?.(INSTANCE_ID_SETTING, next)
  return next
}

function effectiveListenConfig(config) {
  return {
    ...config,
    host: config.lanEnabled && config.lanHost ? config.lanHost : '127.0.0.1',
  }
}

function isLanActive(config) {
  return config.lanEnabled === true && !!config.lanHost
}

function resolveAgentModel(dbService, agent) {
  const providers = dbService?.getSetting?.('providers') || []
  const defaults = dbService?.getSetting?.('defaultModels') || {}
  const ref = String(agent?.model || defaults.agent || defaults.chat || '')
  const separator = ref.indexOf('::')
  const providerId = separator > 0 ? ref.slice(0, separator) : ''
  const modelId = separator > 0 ? ref.slice(separator + 2) : ref
  const provider = providerId
    ? providers.find(item => item.id === providerId && item.enabled !== false)
    : providers.find(item => item.enabled !== false && item.models?.some(model => model.id === modelId && model.enabled !== false))
  const model = provider?.models?.find(item => item.id === modelId && item.enabled !== false)
  if (!provider || !model || !provider.apiKey) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Agent model is not configured in MindSpace', { status: 503 })
  return { providerId: provider.id, apiFormat: provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : 'openai'), apiKey: provider.apiKey, baseUrl: provider.baseUrl || '', model: model.id, modelHasVision: !!model.capabilities?.vision }
}

export function createLocalGateway({ dbService, agentService = null, wikiService = null, workDirService = null, webImportJobService = null, mediaModule = null, noteFileService = null, secretStore = null, appVersion = '', logger = console } = {}) {
  let sessionEnabled = false
  const apiKeyService = new GatewayApiKeyService({ dbService, secretStore })
  const registry = registerBuiltinCapabilities(new CapabilityRegistry())
  const instanceId = getOrCreateInstanceId(dbService)
  const server = new GatewayHttpServer({ apiKeyService, registry, appVersion, instanceId, logger })
  const adapters = {
    agents: new AgentAdapter(dbService), notes: new NoteAdapter(dbService),
    tasks: new TaskAdapter(dbService), conversations: new ConversationAdapter(dbService),
    documents: new DocumentAdapter(dbService),
    executions: new ExecutionAdapter(dbService),
    outputs: new OutputAdapter(dbService),
  }

  server.register('GET', '/api/v1/health', ({ response }) => {
    sendJson(response, 200, {
      service: 'mindspace-local-gateway',
      status: 'ok',
      protocolVersion: '1.0',
      appVersion,
      instanceId,
      lanEnabled: isLanActive(loadGatewayConfig(dbService)),
    })
  }, { auth: false })

  server.register('GET', '/api/v1/capabilities', ({ response }) => {
    sendJson(response, 200, {
      protocolVersion: '1.0',
      ...registry.listPublic(),
    })
  }, { auth: false })

  server.register('GET', '/api/v1/gateway/status', ({ response }) => {
    sendJson(response, 200, gateway.getStatus())
  })
  server.register('GET', '/api/v1/gateway/audit-logs', ({ response, url }) => {
    sendJson(response, 200, { data: server.getAuditLog(url.searchParams.get('limit')) })
  })
  const registerResource = (name, adapter, listPath, detailPath) => {
    registry.registerResource({ id: name, version: '1.0', description: `Read ${name}` })
    server.register('GET', listPath, ({ response, url }) => {
      const all = name === 'notes'
        ? adapter.list(url.searchParams.get('folderId') || '')
        : name === 'documents' ? adapter.list(url.searchParams.get('spaceId') || undefined) : adapter.list()
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200)
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
      sendJson(response, 200, { data: all.slice(offset, offset + limit), meta: { total: all.length, limit, offset, hasMore: offset + limit < all.length } })
    })
    server.register('GET', detailPath, ({ response, params }) => {
      const data = adapter.get(params.id)
      if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, `${name} not found`, { status: 404 })
      sendJson(response, 200, { data })
    })
  }
  registerResource('agents', adapters.agents, '/api/v1/agents', '/api/v1/agents/:id')
  registerResource('notes', adapters.notes, '/api/v1/notes', '/api/v1/notes/:id')
  registerResource('tasks', adapters.tasks, '/api/v1/tasks', '/api/v1/tasks/:id')
  registerResource('conversations', adapters.conversations, '/api/v1/conversations', '/api/v1/conversations/:id')
  server.register('GET', '/api/v1/conversations/:id/messages', ({ response, params }) => {
    if (!adapters.conversations.get(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'conversation not found', { status: 404 })
    sendJson(response, 200, { data: adapters.conversations.messages(params.id) })
  })
  registerResource('documents', adapters.documents, '/api/v1/documents', '/api/v1/documents/:id')
  server.register('GET', '/api/v1/documents/:id/content', ({ response, params }) => {
    const data = adapters.documents.read(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'documents not found', { status: 404 })
    sendJson(response, 200, { data })
  })
  registry.registerAction({ id: 'internal.files.upload', version: '1.0', description: 'Legacy internal upload route', riskLevel: 'medium', enabled: false })
  server.register('POST', '/api/v1/internal/files', ({ response, body }) => {
    const filename = String(body?.filename || '').trim()
    const relativePath = String(body?.relativePath || '').trim().replace(/\\/g, '/')
    const encoded = String(body?.contentBase64 || '')
    if (!filename || !encoded || filename.includes('..') || /[\\/]/.test(filename)) {
      throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'filename and contentBase64 are required', { status: 400 })
    }
    const segments = relativePath ? relativePath.split('/').filter(Boolean) : []
    if (path.isAbsolute(relativePath) || segments.some(segment => segment === '..' || segment === '.' || segment.includes(':'))) {
      throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'relativePath must be a safe relative directory', { status: 400 })
    }
    const content = Buffer.from(encoded, 'base64')
    if (!content.length || content.length > 20 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'file size must be 1-20MB', { status: 400 })
    const root = path.join(os.tmpdir(), 'mindspace-gateway-uploads')
    const directory = path.resolve(root, ...segments)
    if (directory !== path.resolve(root) && !directory.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'relativePath escapes the upload directory', { status: 400 })
    }
    fs.mkdirSync(directory, { recursive: true })
    const extension = path.extname(filename)
    const basename = path.basename(filename, extension)
    let storedName = filename
    let sequence = 2
    while (fs.existsSync(path.join(directory, storedName))) {
      storedName = `${basename} (${sequence})${extension}`
      sequence += 1
    }
    const filePath = path.join(directory, storedName)
    fs.writeFileSync(filePath, content, { flag: 'wx' })
    const storedRelativePath = [...segments, storedName].join('/')
    sendJson(response, 201, { data: { fileId: crypto.randomUUID(), filename: storedName, relativePath: storedRelativePath, size: content.length, stored: true } })
  })
  registry.registerResource({ id: 'executions', version: '1.0', description: 'Read Agent execution status' })
  server.register('GET', '/api/v1/executions', ({ response, url }) => {
    const data = adapters.executions.list({ agentId: url.searchParams.get('agentId') || '', conversationId: url.searchParams.get('conversationId') || '' })
    sendJson(response, 200, { data })
  })
  server.register('GET', '/api/v1/executions/:id', ({ response, params }) => {
    const data = adapters.executions.get(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'execution not found', { status: 404 })
    sendJson(response, 200, { data })
  })
  registry.registerResource({ id: 'execution-events', version: '1.0', description: 'Stream Agent execution state changes with SSE', executionMode: 'stream' })
  server.register('GET', '/api/v1/executions/:id/events', async ({ request, response, params }) => {
    if (!adapters.executions.get(params.id)) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'execution not found', { status: 404 })
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Connection', 'keep-alive')
    response.setHeader('X-Accel-Buffering', 'no')
    response.flushHeaders?.()
    const unsubscribe = agentService?.subscribeGatewayEvents?.((channel, payload) => {
      if (payload?.runId !== params.id || !response.writable) return
      if (channel === 'agent:chunk') sendSse(response, 'chunk', payload.chunk)
      else if (channel === 'agent:runDone') sendSse(response, 'done', payload)
      else if (channel === 'agent:runError') sendSse(response, 'error', payload)
      else if (channel === 'agent:runCancelled') sendSse(response, 'cancelled', payload)
    })
    let lastSnapshot = ''
    let closed = false
    const terminal = new Set(['completed', 'failed', 'error', 'cancelled', 'canceled'])
    response.on('close', () => { if (!response.writableEnded) { closed = true; unsubscribe?.() } })
    await new Promise(resolve => {
      const emit = () => {
        if (closed) { unsubscribe?.(); return resolve() }
        const data = adapters.executions.get(params.id)
        if (!data) {
          sendSse(response, 'error', { code: 'NOT_FOUND', runId: params.id })
          response.end()
          unsubscribe?.()
          return resolve()
        }
        const snapshot = JSON.stringify(data)
        if (snapshot !== lastSnapshot) {
          sendSse(response, 'execution', data)
          lastSnapshot = snapshot
        } else response.write(': keep-alive\n\n')
        if (terminal.has(String(data.status || '').toLowerCase())) {
          sendSse(response, 'done', { runId: params.id, status: data.status })
          response.end()
          unsubscribe?.()
          return resolve()
        }
        setTimeout(emit, 1000)
      }
      emit()
    })
  })
  registry.registerAction({ id: 'executions.cancel', version: '1.0', description: 'Cancel a running Agent execution', riskLevel: 'medium' })
  server.register('POST', '/api/v1/executions/:id/cancel', ({ response, params }) => {
    if (!agentService?.handleCancelRun) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Agent execution service is unavailable', { status: 503 })
    agentService.handleCancelRun(params.id)
    sendJson(response, 202, { data: { runId: params.id, cancellationRequested: true } })
  })
  registry.registerAction({ id: 'agents.invoke', version: '1.0', description: 'Start an Agent run', executionMode: 'async', riskLevel: 'high' })
  server.register('POST', '/api/v1/agents/:id/invoke', async ({ response, params, body }) => {
    if (!agentService?.handleStartRun) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Agent execution service is unavailable', { status: 503 })
    const agent = adapters.agents.db?.getAgent?.(params.id)
    if (!agent) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'agent not found', { status: 404 })
    const prompt = String(body?.prompt || '').trim()
    if (!prompt) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'prompt is required', { status: 400 })
    const conversationId = String(body?.conversationId || `gw_${crypto.randomUUID()}`)
    if (!adapters.conversations.get(conversationId)) adapters.conversations.db?.createConv?.({ id: conversationId, agentId: params.id, title: prompt.slice(0, 80) })
    const userMessage = adapters.conversations.db?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'user', content: prompt })
    const assistantMessage = adapters.conversations.db?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'assistant', content: '', status: 'streaming' })
    const runId = String(body?.runId || `gw_run_${crypto.randomUUID()}`)
    const modelConfig = resolveAgentModel(dbService, agent)
    const request = {
      runId, conversationId, agentId: params.id, agentEnglishName: agent.englishName || agent.english_name || '',
      msgId: assistantMessage?.id, userMessageId: userMessage?.id, systemPrompt: agent.prompt || '',
      messages: [{ role: 'user', content: prompt }], ...modelConfig,
      maxIterations: body?.maxIterations ?? agent.maxIter, temperature: agent.temperature, maxTokens: agent.maxTokens,
      topP: agent.topP, thinkingMode: agent.thinkingMode, thinkingIntensity: agent.thinkingIntensity,
      toolIds: agent.tools || [], permissions: agent.permissions || {}, skills: agent.skills || [], subAgents: [],
      toolProviderConfigs: dbService?.getSetting?.('toolProviderConfigMap') || {},
    }
    if (!request.msgId) throw new GatewayError(GATEWAY_ERROR_CODES.INTERNAL_ERROR, 'failed to create Agent message', { status: 500 })
    Promise.resolve(agentService.handleStartRun(request)).catch(error => logger.error?.('[LocalGateway] Agent invoke failed:', error))
    sendJson(response, 202, { data: { runId, conversationId, messageId: assistantMessage.id, status: 'running' } })
  })
  server.register('POST', '/api/v1/internal/chat/completions', async ({ request, response, body }) => {
    const agentId = String(body?.model || '').trim()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const userMessage = [...messages].reverse().find(item => item?.role === 'user')
    const prompt = typeof userMessage?.content === 'string' ? userMessage.content : ''
    if (!agentId || !prompt) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'model(agentId) and messages are required', { status: 400 })
    const agent = adapters.agents.db?.getAgent?.(agentId)
    if (!agent) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'agent not found', { status: 404 })
    const modelConfig = resolveAgentModel(dbService, agent)
    const conversationId = String(body?.conversationId || `gw_${crypto.randomUUID()}`)
    if (!adapters.conversations.get(conversationId)) adapters.conversations.db?.createConv?.({ id: conversationId, agentId, title: prompt.slice(0, 80) })
    const user = adapters.conversations.db?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'user', content: prompt })
    const assistant = adapters.conversations.db?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'assistant', content: '', status: 'streaming' })
    if (!assistant?.id) throw new GatewayError(GATEWAY_ERROR_CODES.INTERNAL_ERROR, 'failed to create message', { status: 500 })
    const runId = `chatcmpl_${crypto.randomUUID()}`
    const requestPayload = { runId, conversationId, agentId, agentEnglishName: agent.englishName || '', msgId: assistant.id, userMessageId: user?.id, systemPrompt: agent.prompt || '', messages, ...modelConfig, maxIterations: agent.maxIter, temperature: agent.temperature, maxTokens: agent.maxTokens, topP: agent.topP, thinkingMode: agent.thinkingMode, thinkingIntensity: agent.thinkingIntensity, toolIds: agent.tools || [], permissions: agent.permissions || {}, skills: agent.skills || [], subAgents: [], toolProviderConfigs: dbService?.getSetting?.('toolProviderConfigMap') || {} }
    const stream = body?.stream === true
    if (!stream) {
      Promise.resolve(agentService.handleStartRun(requestPayload)).catch(error => logger.error?.('[LocalGateway] Chat completion failed:', error))
      let status = 'running'
      for (let i = 0; i < 600; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
        status = String(adapters.executions.get(runId)?.status || status).toLowerCase()
        if (['completed', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) break
      }
      const finalMessage = adapters.conversations.messages(conversationId).filter(item => item.role === 'assistant').pop()
      sendJson(response, 200, { id: runId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: agentId, choices: [{ index: 0, message: { role: 'assistant', content: finalMessage?.content || '' }, finish_reason: status === 'completed' ? 'stop' : 'length' }], mindspace: { conversationId, status } })
      return
    }
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders?.()
    let closed = false
    const write = payload => { if (!closed && response.writable) { response.write(`data: ${JSON.stringify(payload)}\n\n`) } }
    const unsubscribe = agentService?.subscribeGatewayEvents?.((channel, payload) => {
      if (payload?.runId !== runId) return
      if (channel === 'agent:chunk') write({ id: runId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: agentId, choices: [{ index: 0, delta: { content: payload.chunk?.text || payload.chunk?.content || '' }, finish_reason: null }] })
      if (channel === 'agent:runDone') { write({ id: runId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: agentId, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }); response.end('data: [DONE]\n\n'); unsubscribe?.() }
      if (channel === 'agent:runError' || channel === 'agent:runCancelled') { write({ error: { message: payload.error?.message || channel } }); response.end(); unsubscribe?.() }
    })
    request.on('close', () => { closed = true; unsubscribe?.() })
    Promise.resolve(agentService.handleStartRun(requestPayload)).catch(error => { if (!closed) { write({ error: { message: error.message } }); response.end() } unsubscribe?.() })
  })
  registerOpenAiCompatibility({ server, registry, dbService, agentService, adapters, resolveAgentModel, sendJson, logger })
  registerResponsesCompatibility({ server, registry, dbService, agentService, adapters, resolveAgentModel, sendJson, logger })
  registerKnowledgeGateway({ server, registry, dbService, wikiService, sendJson })
  registerFileGateway({ server, registry, sendJson })
  registerDocumentGateway({ server, registry, dbService, workDirService, sendJson })
  registerDocsFolderGateway({ server, registry, workDirService, sendJson })
  registerDownloadGateway({ server, registry, dbService, workDirService })
  registerGatewayDiagnostics({ server, registry, dbService, agentService, wikiService, sendJson })
  registerWebImportGateway({ server, registry, webImportJobService, workDirService, sendJson })
  registerMediaGateway({ server, registry, mediaModule, workDirService, sendJson })
  registerUrlImportGateway({ server, registry, dbService, workDirService, webImportJobService, mediaModule, sendJson })
  registerNotesGateway({ server, registry, dbService, noteFileService, sendJson })
  registerResource('outputs', adapters.outputs, '/api/v1/outputs', '/api/v1/outputs/:id')
  registry.registerResource({ id: 'artifacts', version: '1.0', description: 'Read generated artifacts' })
  server.register('GET', '/api/v1/artifacts', ({ response, url }) => {
    const groupId = String(url.searchParams.get('groupId') || 'default')
    sendJson(response, 200, { data: adapters.outputs.listArtifacts(groupId) })
  })
  server.register('GET', '/api/v1/artifacts/:id', ({ response, params }) => {
    const data = adapters.outputs.getArtifact(params.id)
    if (!data) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'artifact not found', { status: 404 })
    sendJson(response, 200, { data })
  })

  const gateway = {
    registry,
    apiKeyService,
    server,
    adapters,

    async start() {
      const config = loadGatewayConfig(dbService)
      if (!sessionEnabled) return this.getStatus()
      await server.start(effectiveListenConfig(config))
      return this.getStatus()
    },

    async stop() {
      await server.stop()
      return this.getStatus()
    },

    async restart() {
      await server.stop()
      return this.start()
    },

    async updateConfig(patch = {}) {
      if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) sessionEnabled = patch.enabled === true
      const current = loadGatewayConfig(dbService)
      const requestedLanEnabled = Object.prototype.hasOwnProperty.call(patch, 'lanEnabled') ? patch.lanEnabled === true : current.lanEnabled
      const requestedLanHost = String(Object.prototype.hasOwnProperty.call(patch, 'lanHost') ? patch.lanHost : current.lanHost || '').trim()
      if (requestedLanEnabled && net.isIP(requestedLanHost) !== 4) {
        throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, '局域网监听地址必须是有效的 IPv4 地址。', { status: 400 })
      }
      const config = saveGatewayConfig(dbService, patch)
      if (!sessionEnabled) {
        await server.stop()
        return this.getStatus()
      }
      await this.restart()
      return this.getStatus()
    },

    createKey() { return apiKeyService.createKey() },
    resetKey() { return apiKeyService.resetKey() },
    getKey() { return apiKeyService.getKey() },

    getStatus() {
      const config = loadGatewayConfig(dbService)
      return {
        ...server.getStatus(),
        enabled: sessionEnabled,
        lanEnabled: isLanActive(config),
        lanHost: config.lanHost || '',
        configuredPort: config.port,
        configuredHost: isLanActive(config) ? config.lanHost : '127.0.0.1',
        apiKey: apiKeyService.getStatus(),
        protocolVersion: '1.0',
        instanceId,
      }
    },
  }

  return gateway
}

export { GatewayApiKeyService } from './auth/GatewayApiKeyService.js'
export { CapabilityRegistry } from './capabilities/CapabilityRegistry.js'
export { GatewayHttpServer } from './http/GatewayHttpServer.js'
