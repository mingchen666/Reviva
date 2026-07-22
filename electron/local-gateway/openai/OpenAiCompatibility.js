import crypto from 'node:crypto'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

const now = () => Math.floor(Date.now() / 1000)
const CREATION_CENTER_ENGLISH_NAMES = new Set([
  'quiz-generator', 'ppt-generator', 'mindmap-generator', 'graph-generator',
  'flashcard-generator', 'chart-generator', 'deep-researcher', 'lab-report-assistant',
])

function textContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n')
}

function normalizeContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => {
    if (part?.type === 'text') return { type: 'text', text: String(part.text || '') }
    if (part?.type === 'image_url') {
      const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url
      if (!url || (!url.startsWith('data:image/') && !url.startsWith('https://'))) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'image_url must be a data image or HTTPS URL', { status: 400 })
      if (url.length > 14 * 1024 * 1024) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'image content exceeds 10MB', { status: 400 })
      return { type: 'image_url', image_url: { url } }
    }
    throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'unsupported message content type', { status: 400 })
  })
}

function reasoningEffort(value, fallback = 'medium') {
  const normalized = String(value || '').toLowerCase()
  if (!normalized) return fallback || 'medium'
  if (normalized === 'minimal') return 'low'
  if (normalized === 'xhigh') return 'high'
  if (['low', 'medium', 'high'].includes(normalized)) return normalized
  throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'reasoning_effort must be minimal, low, medium, high or xhigh', { status: 400 })
}

function openAiChunk(id, model, delta, finishReason = null) {
  return { id, object: 'chat.completion.chunk', created: now(), model, choices: [{ index: 0, delta, finish_reason: finishReason }] }
}

function chatUsage(usage = {}) {
  const promptTokens = Number(usage.inputTokens ?? usage.input_tokens) || 0
  const completionTokens = Number(usage.outputTokens ?? usage.output_tokens) || 0
  return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, prompt_tokens_details: { cached_tokens: Number(usage.cacheReadTokens ?? usage.cache_read_tokens) || 0 }, completion_tokens_details: { reasoning_tokens: Number(usage.thinkingTokens ?? usage.thinking_tokens) || 0 } }
}

function mindspaceUsage(usage = {}, latencyMs = 0) {
  return { cache_write_tokens: Number(usage.cacheWriteTokens ?? usage.cache_write_tokens) || 0, thinking_tokens: Number(usage.thinkingTokens ?? usage.thinking_tokens) || 0, cost: Number(usage.cost) || 0, latency_ms: Number(latencyMs ?? usage.latencyMs ?? usage.latency_ms) || 0 }
}

export function registerOpenAiCompatibility({ server, registry, dbService, agentService, adapters, resolveAgentModel, sendJson, logger = console }) {
  const cleanupEphemeral = (conversationId, messageIds, persistent) => {
    if (persistent) return
    for (const id of messageIds.filter(Boolean)) dbService?.deleteMsg?.(id)
    dbService?.deleteConv?.(conversationId)
  }
  registry.registerResource({ id: 'openai.models', version: '1.0', description: 'List MindSpace Agents as OpenAI-compatible models' })
  registry.registerAction({ id: 'openai.chat.completions', version: '1.0', description: 'Invoke an Agent through OpenAI Chat Completions', executionMode: 'stream', riskLevel: 'high' })

  server.register('GET', '/v1/models', ({ response }) => {
    const data = adapters.agents.list().filter(agent => !CREATION_CENTER_ENGLISH_NAMES.has(String(agent.englishName || agent.english_name || '').toLowerCase())).map(agent => ({ id: agent.id, object: 'model', created: 0, owned_by: 'mindspace', name: agent.name || agent.id }))
    sendJson(response, 200, { object: 'list', data })
  })
  server.register('GET', '/v1/models/:id', ({ response, params }) => {
    const agent = adapters.agents.get(params.id)
    if (!agent) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'The requested model does not exist', { status: 404 })
    if (CREATION_CENTER_ENGLISH_NAMES.has(String(agent.englishName || agent.english_name || '').toLowerCase())) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'The requested model is not available through OpenAI Chat Completions', { status: 404 })
    sendJson(response, 200, { id: agent.id, object: 'model', created: 0, owned_by: 'mindspace', name: agent.name || agent.id })
  })

  server.register('POST', '/v1/chat/completions', async ({ request, response, body }) => {
    if (!agentService?.handleStartRun) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Agent execution service is unavailable', { status: 503 })
    const agentId = String(body?.model || '').trim()
    const messages = Array.isArray(body?.messages) ? body.messages.map(message => ({ ...message, content: normalizeContent(message?.content) })) : []
    const prompt = textContent([...messages].reverse().find(item => item?.role === 'user')?.content).trim()
    if (!agentId || !prompt) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'model and messages are required', { status: 400 })
    const agent = dbService?.getAgent?.(agentId)
    if (!agent) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'The requested Agent does not exist', { status: 404 })
    const modelConfig = resolveAgentModel(dbService, agent)
    const persistentConversation = !!body?.conversationId
    const conversationId = String(body?.conversationId || `gw_${crypto.randomUUID()}`)
    if (!adapters.conversations.get(conversationId)) dbService?.createConv?.({ id: conversationId, agentId, title: prompt.slice(0, 80) })
    const user = dbService?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'user', content: prompt })
    const assistant = dbService?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'assistant', content: '', status: 'streaming' })
    if (!assistant?.id) throw new GatewayError(GATEWAY_ERROR_CODES.INTERNAL_ERROR, 'Failed to create Agent message', { status: 500 })
    const runId = `chatcmpl_${crypto.randomUUID()}`
    const systemPrompt = [agent.prompt || '', ...messages.filter(item => item?.role === 'system').map(item => textContent(item.content))].filter(Boolean).join('\n\n')
    const requestPayload = { runId, conversationId, agentId, agentEnglishName: agent.englishName || '', msgId: assistant.id, userMessageId: user?.id, systemPrompt, messages, ...modelConfig, maxIterations: agent.maxIter, temperature: body?.temperature ?? agent.temperature, maxTokens: body?.max_tokens ?? agent.maxTokens, topP: body?.top_p ?? agent.topP, thinkingMode: agent.thinkingMode, thinkingIntensity: reasoningEffort(body?.reasoning_effort, agent.thinkingIntensity), toolIds: agent.tools || [], permissions: agent.permissions || {}, skills: agent.skills || [], subAgents: [], toolProviderConfigs: dbService?.getSetting?.('toolProviderConfigMap') || {} }

    if (body?.stream !== true) {
      try { await agentService.handleStartRun(requestPayload) } catch (error) { cleanupEphemeral(conversationId, [user?.id, assistant?.id], persistentConversation); throw error }
      const finalMessage = adapters.conversations.messages(conversationId).filter(item => item.role === 'assistant').pop()
      cleanupEphemeral(conversationId, [user?.id, assistant?.id], persistentConversation)
      sendJson(response, 200, { id: runId, object: 'chat.completion', created: now(), model: agentId, choices: [{ index: 0, message: { role: 'assistant', content: finalMessage?.content || '', reasoning_content: finalMessage?.thinkingContent || '' }, finish_reason: 'stop' }], usage: chatUsage(finalMessage), mindspace_usage: mindspaceUsage(finalMessage, finalMessage?.latencyMs), mindspace: { conversationId } })
      return
    }

    response.statusCode = 200
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders?.()
    let closed = false
    const write = payload => { if (!closed && response.writable) response.write(`data: ${JSON.stringify(payload)}\n\n`) }
    write(openAiChunk(runId, agentId, { role: 'assistant', content: '' }))
    const unsubscribe = agentService.subscribeGatewayEvents((channel, payload) => {
      if (payload?.runId !== runId) return
      if (channel === 'agent:chunk') {
        const text = payload.chunk?.text || payload.chunk?.content || ''
        if (payload.chunk?.type === 'thinking' || payload.chunk?.type === 'reasoning') write(openAiChunk(runId, agentId, { reasoning_content: text }))
        else write(openAiChunk(runId, agentId, { content: text }))
      }
      if (channel === 'agent:runDone') { cleanupEphemeral(conversationId, [user?.id, assistant?.id], persistentConversation); write(openAiChunk(runId, agentId, {}, 'stop')); if (body?.stream_options?.include_usage === true) write({ id: runId, object: 'chat.completion.chunk', created: now(), model: agentId, choices: [], usage: chatUsage(payload.usage), mindspace_usage: mindspaceUsage(payload.usage, payload.latencyMs) }); response.end('data: [DONE]\n\n'); unsubscribe() }
      if (channel === 'agent:runError' || channel === 'agent:runCancelled') { cleanupEphemeral(conversationId, [user?.id, assistant?.id], persistentConversation); write({ error: { message: payload.error?.message || channel, type: 'mindspace_agent_error', code: payload.error?.code || null } }); response.end('data: [DONE]\n\n'); unsubscribe() }
    })
    response.on('close', () => {
      if (response.writableEnded) return
      closed = true
      unsubscribe()
      agentService.handleCancelRun?.(runId)
    })
    agentService.handleStartRun(requestPayload).catch(error => { logger.error?.('[LocalGateway] OpenAI chat failed:', error); cleanupEphemeral(conversationId, [user?.id, assistant?.id], persistentConversation); if (!closed) response.end(`data: ${JSON.stringify({ error: { message: error.message, type: 'mindspace_agent_error' } })}\n\ndata: [DONE]\n\n`) })
  })
}
