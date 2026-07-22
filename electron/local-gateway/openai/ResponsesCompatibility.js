import crypto from 'node:crypto'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

const CREATION_CENTER = new Set(['quiz-generator', 'ppt-generator', 'mindmap-generator', 'graph-generator', 'flashcard-generator', 'chart-generator', 'deep-researcher', 'lab-report-assistant'])
const WEB_SEARCH_TOOLS = new Set(['web_search', 'web_search_tavily', 'web_search_searxng', 'web_search_bing', 'browser_search', 'mcp:exa', 'mcp:jina-mcp-server'])
const created = () => Math.floor(Date.now() / 1000)

function responseUsage(usage = {}) {
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens) || 0
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens) || 0
  return { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens, input_tokens_details: { cached_tokens: Number(usage.cacheReadTokens ?? usage.cache_read_tokens) || 0 }, output_tokens_details: { reasoning_tokens: Number(usage.thinkingTokens ?? usage.thinking_tokens) || 0 } }
}

function extendedUsage(usage = {}, latencyMs = 0) {
  return { cache_write_tokens: Number(usage.cacheWriteTokens ?? usage.cache_write_tokens) || 0, thinking_tokens: Number(usage.thinkingTokens ?? usage.thinking_tokens) || 0, cost: Number(usage.cost) || 0, latency_ms: Number(latencyMs ?? usage.latencyMs ?? usage.latency_ms) || 0 }
}

function inputMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }]
  if (!Array.isArray(input)) return []
  return input.map(item => ({ role: item?.role || 'user', content: item?.content || '' }))
}

function inputText(messages) {
  const value = [...messages].reverse().find(item => item.role === 'user')?.content
  if (typeof value === 'string') return value
  return Array.isArray(value) ? value.filter(item => item?.type === 'input_text' || item?.type === 'text').map(item => item.text || '').join('\n') : ''
}

function reasoningEffort(value, fallback = 'medium') {
  const normalized = String(value || '').toLowerCase()
  if (!normalized) return fallback || 'medium'
  if (normalized === 'minimal') return 'low'
  if (normalized === 'xhigh') return 'high'
  if (['low', 'medium', 'high'].includes(normalized)) return normalized
  throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'reasoning.effort must be minimal, low, medium, high or xhigh', { status: 400 })
}

export function registerResponsesCompatibility({ server, registry, dbService, agentService, adapters, resolveAgentModel, sendJson, logger = console }) {
  registry.registerAction({ id: 'openai.responses', description: 'Invoke an Agent through the OpenAI Responses protocol', executionMode: 'stream', riskLevel: 'high' })
  server.register('POST', '/v1/responses', async ({ request, response, body }) => {
    if (!agentService?.handleStartRun) throw new GatewayError(GATEWAY_ERROR_CODES.SERVICE_DISABLED, 'Agent execution service is unavailable', { status: 503 })
    const agentId = String(body?.model || '').trim()
    const agent = dbService?.getAgent?.(agentId)
    if (!agent || CREATION_CENTER.has(String(agent.englishName || agent.english_name || '').toLowerCase())) throw new GatewayError(GATEWAY_ERROR_CODES.NOT_FOUND, 'The requested Agent is not available', { status: 404 })
    const messages = inputMessages(body?.input)
    const prompt = inputText(messages).trim()
    if (!prompt) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'input must contain a user message', { status: 400 })
    const requestedTools = Array.isArray(body?.tools) ? body.tools : []
    if (requestedTools.some(tool => tool?.type === 'function')) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'client-defined function tools are not supported', { status: 400 })
    if (requestedTools.some(tool => tool?.type && tool.type !== 'web_search')) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'unsupported Responses tool type', { status: 400 })
    if (requestedTools.some(tool => tool?.type === 'web_search') && !(agent.tools || []).some(tool => WEB_SEARCH_TOOLS.has(String(tool)) || /(?:search|web|browser|crawl|scrape|exa|jina|firecrawl)/i.test(String(tool)))) throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'this Agent is not allowed to use web search or web retrieval', { status: 400 })
    const persistent = !!body?.conversationId
    const conversationId = String(body?.conversationId || `gw_${crypto.randomUUID()}`)
    if (!adapters.conversations.get(conversationId)) dbService?.createConv?.({ id: conversationId, agentId, title: prompt.slice(0, 80) })
    const user = dbService?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'user', content: prompt })
    const assistant = dbService?.createMsg?.({ id: `msg_${crypto.randomUUID()}`, conversationId, role: 'assistant', content: '', status: 'streaming' })
    const responseId = `resp_${crypto.randomUUID()}`
    const cleanup = () => { if (!persistent) { dbService?.deleteMsg?.(user?.id); dbService?.deleteMsg?.(assistant?.id); dbService?.deleteConv?.(conversationId) } }
    const modelConfig = resolveAgentModel(dbService, agent)
    const systemPrompt = [agent.prompt || '', String(body?.instructions || '')].filter(Boolean).join('\n\n')
    const runRequest = { runId: responseId, conversationId, agentId, agentEnglishName: agent.englishName || '', msgId: assistant?.id, userMessageId: user?.id, systemPrompt, messages, ...modelConfig, maxIterations: agent.maxIter, temperature: body?.temperature ?? agent.temperature, maxTokens: body?.max_output_tokens ?? agent.maxTokens, topP: body?.top_p ?? agent.topP, thinkingMode: agent.thinkingMode, thinkingIntensity: reasoningEffort(body?.reasoning?.effort, agent.thinkingIntensity), toolIds: agent.tools || [], permissions: agent.permissions || {}, skills: agent.skills || [], subAgents: [], toolProviderConfigs: dbService?.getSetting?.('toolProviderConfigMap') || {} }

    if (body?.stream !== true) {
      try { await agentService.handleStartRun(runRequest) } catch (error) { cleanup(); throw error }
      const message = adapters.conversations.messages(conversationId).filter(item => item.role === 'assistant').pop()
      const output = []
      if (message?.thinkingContent) output.push({ type: 'reasoning', id: `rs_${crypto.randomUUID()}`, summary: [{ type: 'summary_text', text: message.thinkingContent }] })
      output.push({ type: 'message', id: `msg_${crypto.randomUUID()}`, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: message?.content || '', annotations: [] }] })
      cleanup()
      sendJson(response, 200, { id: responseId, object: 'response', created_at: created(), status: 'completed', model: agentId, output, error: null, usage: responseUsage(message), mindspace_usage: extendedUsage(message, message?.latencyMs), mindspace: { conversationId } })
      return
    }

    response.statusCode = 200
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache')
    response.setHeader('Connection', 'keep-alive')
    response.flushHeaders?.()
    let closed = false; let sequence = 0
    const emit = payload => { if (!closed && response.writable) response.write(`event: ${payload.type}\ndata: ${JSON.stringify({ ...payload, sequence_number: sequence++ })}\n\n`) }
    emit({ type: 'response.created', response: { id: responseId, object: 'response', created_at: created(), status: 'in_progress', model: agentId, output: [] } })
    const unsubscribe = agentService.subscribeGatewayEvents((channel, payload) => {
      if (payload?.runId !== responseId) return
      const chunk = payload.chunk || {}
      if (channel === 'agent:chunk' && (chunk.type === 'thinking' || chunk.type === 'reasoning')) emit({ type: 'response.reasoning_summary_text.delta', item_id: responseId, delta: chunk.text || '' })
      else if (channel === 'agent:chunk' && chunk.type === 'content') emit({ type: 'response.output_text.delta', item_id: assistant.id, output_index: 0, content_index: 0, delta: chunk.text || '' })
      else if (channel === 'agent:chunk' && chunk.type === 'tool_start') emit({ type: 'response.output_item.added', output_index: 0, item: { id: chunk.toolId || `tool_${crypto.randomUUID()}`, type: 'function_call', name: chunk.toolName || '', arguments: JSON.stringify(chunk.input || {}), status: 'in_progress' } })
      else if (channel === 'agent:chunk' && (chunk.type === 'tool_end' || chunk.type === 'tool_error')) emit({ type: 'response.output_item.done', output_index: 0, item: { id: chunk.toolId || '', type: 'function_call', name: chunk.toolName || '', status: chunk.type === 'tool_end' ? 'completed' : 'failed' } })
      else if (channel === 'agent:runDone') { cleanup(); emit({ type: 'response.completed', response: { id: responseId, object: 'response', status: 'completed', model: agentId, usage: responseUsage(payload.usage), mindspace_usage: extendedUsage(payload.usage, payload.latencyMs) } }); response.end(); unsubscribe() }
      else if (channel === 'agent:runError' || channel === 'agent:runCancelled') { cleanup(); emit({ type: 'response.failed', response: { id: responseId, object: 'response', status: 'failed', error: payload.error || { message: channel } } }); response.end(); unsubscribe() }
    })
    response.on('close', () => {
      if (response.writableEnded) return
      closed = true
      unsubscribe()
      agentService.handleCancelRun?.(responseId)
    })
    agentService.handleStartRun(runRequest).catch(error => { logger.error?.('[LocalGateway] Responses failed:', error); cleanup(); if (!closed) { emit({ type: 'response.failed', response: { id: responseId, status: 'failed', error: { message: error.message } } }); response.end() } unsubscribe() })
  })
}
