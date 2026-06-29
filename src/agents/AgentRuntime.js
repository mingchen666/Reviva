// src/agents/AgentRuntime.js — Renderer-side orchestrator for Agent system
// Bridges UI (Pinia stores) ↔ IPC ↔ Main process (DeepAgents)
// DeepAgents handles: tool calling, subagent delegation, context compression, skill/memory injection
// Main process handles: project system prompt injection, output dir, context staging
// Renderer handles: IPC request building, streaming event routing, store updates
import { StreamRenderer } from './StreamRenderer'
import { genId, toPlain } from './utils'
import { useUserStore } from '@/stores/user'
import { BASE_URL } from '@/apis/http'
import { parseModelRef } from '@/utils/modelRef'

function _buildCloudContext(ctxItems) {
  try {
    const userStore = useUserStore()
    const defaultKbIds = []
    const defaultDocIds = []
    for (const it of (ctxItems || [])) {
      if (it.type === 'cloud_kb' && it.kbId) defaultKbIds.push(it.kbId)
      else if (it.type === 'cloud_doc') {
        if (it.kbId) defaultKbIds.push(it.kbId)
        if (it.docId) defaultDocIds.push(it.docId)
      }
    }
    return {
      baseUrl: _resolveCloudBaseUrl(),
      token: userStore.token || '',
      defaultKbIds: [...new Set(defaultKbIds)],
      defaultDocIds: [...new Set(defaultDocIds)],
    }
  } catch (_) {
    return { baseUrl: _resolveCloudBaseUrl(), token: '', defaultKbIds: [], defaultDocIds: [] }
  }
}

function _resolveCloudBaseUrl() {
  if (BASE_URL) return BASE_URL
  if (typeof window !== 'undefined' && /^https?:/i.test(window.location.origin)) return window.location.origin
  return ''
}

function _isImageContextItem(item) {
  if (!item) return false
  if (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) return true
  if (item.type === 'image') return true
  const name = String(item.name || item.path || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)
}

function _hasCloudKnowledgeContext(ctxItems) {
  return (ctxItems || []).some(i =>
    (i?.type === 'cloud_kb' && i.kbId) ||
    (i?.type === 'cloud_doc' && (i.kbId || i.docId)),
  )
}

function _buildRuntimeToolIds(agent, ctxItems, wikiContext) {
  const ids = [...(agent?.tools || [])]
  if (wikiContext?.enabled) ids.push('wiki_tool')
  if (_hasCloudKnowledgeContext(ctxItems)) ids.push('kb_search')
  return [...new Set(ids.filter(Boolean))]
}

function _toCtxMeta(ctxItems) {
  return (ctxItems || []).map(i => ({
    type: i.type,
    source: i.source || '',
    id: i.id,
    name: i.name,
    kbId: i.kbId || '',
    docId: i.docId || '',
    icon: i.icon || '',
    color: i.color || '',
    path: i.path || '',
    originalPath: i.originalPath || '',
    originalName: i.originalName || '',
    dataUrl: i.dataUrl || '',
    size: i.size || 0,
    mime: i.mime || i.typeHint || '',
    isDirectory: !!i.isDirectory,
  }))
}

function _toCtxPaths(ctxItems) {
  return (ctxItems || []).filter(i => i.path || i.dataUrl).map(i => ({
    path: i.path || '',
    originalPath: i.originalPath || '',
    dataUrl: i.dataUrl || '',
    name: i.name,
    originalName: i.originalName || '',
    size: i.size || 0,
    mime: i.mime || i.typeHint || '',
    type: i.type || (i.isDirectory ? 'folder' : 'file'),
    source: i.source || '',
    isDirectory: !!i.isDirectory,
  }))
}

function _isDoneTodo(status) {
  const value = String(status || '').toLowerCase().replace('-', '_')
  return value === 'completed' || value === 'done'
}

function _isActiveTodo(status) {
  const value = String(status || '').toLowerCase().replace('-', '_')
  return value === 'in_progress' || value === 'running' || value === 'pending' || value === 'todo'
}

function _resolveNonNegativeLimit(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function _todoStatusLabel(status) {
  const value = String(status || '').toLowerCase().replace('-', '_')
  if (value === 'completed' || value === 'done') return '已完成'
  if (value === 'in_progress' || value === 'running') return '进行中'
  if (value === 'cancelled' || value === 'blocked') return '暂停'
  return '待办'
}

function _tryParseToolArgs(value) {
  if (value === undefined || value === null) return {}
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return {}
  try { return JSON.parse(text) } catch (_) { return null }
}

function _isValidToolArgs(args) {
  return !!args && typeof args === 'object' && !Array.isArray(args)
}

function _hasToolResult(tc) {
  return tc && Object.prototype.hasOwnProperty.call(tc, 'result') && tc.result !== undefined && tc.result !== null
}

function _isTerminalToolStatus(status) {
  const value = String(status || '').toLowerCase()
  return value === 'completed' || value === 'done' || value === 'error' || value === 'failed'
}

function _normalizeSubAgentKey(value) {
  return String(value || '')
    .trim()
    .replace(/^sa_/i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

function _subAgentKeys(subAgent) {
  const rawKeys = [
    subAgent?.id,
    subAgent?.name,
    subAgent?.key,
    subAgent?.runtimeName,
    subAgent?.englishName,
    subAgent?.english_name,
    ...(Array.isArray(subAgent?.aliases) ? subAgent.aliases : []),
  ]
  return new Set(rawKeys.map(_normalizeSubAgentKey).filter(Boolean))
}

function _findSubAgent(subAgentList, id) {
  const target = _normalizeSubAgentKey(id)
  if (!target) return null
  const list = subAgentList || []
  const exactList = [...list].reverse()
  return exactList.find(sa => _normalizeSubAgentKey(sa?.id) === target) ||
    exactList.find(sa => _normalizeSubAgentKey(sa?.runtimeName) === target) ||
    list.find(sa => _subAgentKeys(sa).has(target)) ||
    null
}

function _resolveAgentEnglishName(agent) {
  const explicit = agent?.englishName || agent?.english_name
  if (explicit) return explicit
  return {
    agent_researcher: 'deep-researcher',
    agent_ppt: 'ppt-generator',
    agent_lab_report: 'lab-report-assistant',
    agent_mindmap: 'mindmap-generator',
    agent_graph: 'graph-generator',
  }[agent?.id] || ''
}

function _subAgentRuntimeName(subAgent, requestedId) {
  const requested = String(requestedId || '').trim()
  if (requested && !/^sub_/i.test(requested)) return requested.replace(/^sa_/i, '')
  if (subAgent?.runtimeName) return subAgent.runtimeName
  const id = String(subAgent?.id || '').trim()
  if (id && !/^sub_/i.test(id)) return id.replace(/^sa_/i, '')
  return String(subAgent?.name || requested || id || 'subagent').trim()
}

function _agentSubAgentIds(agent) {
  const ids = [
    ...(Array.isArray(agent?.subAgents) ? agent.subAgents : []),
    ...(Array.isArray(agent?.sub_agents) ? agent.sub_agents : []),
  ]
  return [...new Set(ids.filter(Boolean))]
}

function _buildSubAgentConfigs(agent, subAgentList) {
  return _agentSubAgentIds(agent).map(saId => {
    const sa = _findSubAgent(subAgentList, saId)
    if (!sa) return null
    return {
      name: _subAgentRuntimeName(sa, saId),
      description: sa.description || sa.desc || '',
      systemPrompt: sa.prompt || '',
      tools: sa.tools || [],
      model: parseModelRef(sa.model || '').modelId || '',
    }
  }).filter(Boolean)
}

function _agentAndSubAgentToolIds(agent, subAgentConfigs = []) {
  return [...new Set([
    ...(Array.isArray(agent?.tools) ? agent.tools : []),
    ...subAgentConfigs.flatMap(sa => Array.isArray(sa.tools) ? sa.tools : []),
  ].filter(Boolean))]
}

function _sanitizeReplayableToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return []
  return toolCalls
    .map(tc => {
      const id = String(tc?.id || '').trim()
      const name = String(tc?.name || '').trim()
      const args = _tryParseToolArgs(tc?.input ?? tc?.args)
      if (!id || !name || !_isValidToolArgs(args)) return null
      if (!_hasToolResult(tc)) return null
      return {
        ...tc,
        id,
        name,
        input: args,
        result: tc.result,
        status: tc.status || 'completed',
      }
    })
    .filter(Boolean)
}

function _messageHasContinuityMeta(msg) {
  const meta = msg?.meta || {}
  return !!(
    (Array.isArray(meta.todos) && meta.todos.length) ||
    (Array.isArray(meta.steps) && meta.steps.length) ||
    (Array.isArray(meta.toolCalls) && meta.toolCalls.length) ||
    (Array.isArray(meta.subAgents) && meta.subAgents.length)
  )
}

function _shouldIncludeInAgentContext(msg) {
  if (!msg) return false
  if (msg.status === 'streaming' || msg.status === 'pending') return false
  if (msg.status === 'completed' || !msg.status) return true
  if (msg.status === 'cancelled' || msg.status === 'error') {
    return !!(msg.content || msg.thinkingContent || _messageHasContinuityMeta(msg))
  }
  return false
}

function _hasContinuationWork(msg) {
  const meta = msg?.meta || {}
  const todos = Array.isArray(meta.todos) ? meta.todos : []
  const toolCalls = Array.isArray(meta.toolCalls) ? meta.toolCalls : []
  const subAgents = Array.isArray(meta.subAgents) ? meta.subAgents : []
  const interrupted = msg?.status === 'cancelled' || msg?.status === 'error'
  return !!(
    interrupted ||
    todos.some(todo => !_isDoneTodo(todo.status) || _isActiveTodo(todo.status)) ||
    toolCalls.some(tc => !_isTerminalToolStatus(tc.status) || String(tc.status || '').toLowerCase() === 'error') ||
    subAgents.some(sa => sa.status === 'running' || sa.status === 'error')
  )
}

function _appendContinuityContext(msg, content) {
  if (!_hasContinuationWork(msg)) return content || ''

  const todos = Array.isArray(msg?.meta?.todos) ? msg.meta.todos : []
  const unfinished = todos.filter(todo => !_isDoneTodo(todo.status))
  const lines = todos.slice(0, 20).map(todo => {
    const text = todo.content || todo.task || todo.text || todo.title || ''
    return text ? `- [${_todoStatusLabel(todo.status)}] ${text}` : ''
  }).filter(Boolean)
  const toolCalls = Array.isArray(msg?.meta?.toolCalls) ? msg.meta.toolCalls : []
  const pendingTools = toolCalls
    .filter(tc => !_isTerminalToolStatus(tc.status))
    .slice(0, 8)
    .map(tc => `- [${tc.status || 'running'}] ${tc.name || 'tool'}`)
  const failedTools = toolCalls
    .filter(tc => String(tc.status || '').toLowerCase() === 'error')
    .slice(0, 8)
    .map(tc => `- [error] ${tc.name || 'tool'}`)

  const note = [
    '[Reviva 上轮任务状态]',
    msg.status === 'cancelled' || msg.status === 'error'
      ? '上一轮任务没有完整结束。用户如果表达“继续/接着/往下做”，先沿用已有进度和未完成项继续；不要重新生成一套无关计划。'
      : '上一轮任务仍有可延续事项。用户如果要求继续，应优先从未完成项继续；若用户明确提出新方向，则按新方向处理。',
    unfinished.length ? `未完成 todo 数量: ${unfinished.length}` : (todos.length ? 'todo 已全部完成。' : '上一轮没有可用 todo，请结合已有内容和工具结果判断下一步。'),
    lines.length ? 'todo 状态:' : '',
    ...lines,
    pendingTools.length ? '未完成工具调用:' : '',
    ...pendingTools,
    failedTools.length ? '失败工具调用:' : '',
    ...failedTools,
  ].filter(Boolean).join('\n')

  return `${content || ''}\n\n${note}`.trim()
}

function _toAgentPlainMessage(m) {
  const replayableToolCalls = m.role === 'assistant' ? _sanitizeReplayableToolCalls(m.meta?.toolCalls) : []
  const ctxItems = m.role === 'user'
    ? (m.meta?.ctx?.length ? m.meta.ctx : (m.meta?.attachments || []))
    : []
  const base = {
    role: m.role,
    content: _appendContinuityContext(m, m.content || ''),
    ...(ctxItems.length ? { attachments: _toCtxPaths(ctxItems) } : {}),
    ...(replayableToolCalls.length ? { toolCalls: replayableToolCalls } : {}),
    ...(m.meta?.toolResult ? { toolCallId: m.meta.toolCallId, toolResult: true } : {}),
  }
  // Embed user-attached file/folder references directly into the message content for the model
  // Only include names — virtual paths are injected by the main process in the system prompt
  if (ctxItems.length) {
    const ctxRefs = ctxItems.map(i => {
      if (i.type === 'image') return `📷 ${i.name}`
      if (i.type === 'folder' || i.type === 'local_folder') return `📁 ${i.name}`
      if (i.type === 'kb') return `📚 ${i.name}`
      if (i.type === 'cloud_kb') return `📚 云端知识库检索范围:${i.name}（使用 kb_search，不是本地文件）`
      if (i.type === 'cloud_doc') return `📚 云端知识库文档检索范围:${i.name}（使用 kb_search，不是本地文件）`
      return `📄 ${i.name}`
    })
    base.content = (base.content || '') + '\n\n[附件: ' + ctxRefs.join(', ') + ']'
  }
  return base
}

export class AgentRuntime {
  /**
   * @param {object} convStore - useConversationsStore
   * @param {object} agentsStore - useAgentsStore
   * @param {object} settingsStore - useSettingsStore
   */
  constructor(convStore, agentsStore, settingsStore) {
    this.convStore = convStore
    this.agentsStore = agentsStore
    this.settingsStore = settingsStore

    // Sub-modules (only UI-side helpers)
    this.streamRenderer = new StreamRenderer(convStore)

    // Current run tracking
    this._runs = new Map() // runId -> { convId, msgId, startTime }
    this._currentRunId = null
    this._currentMsgId = null
    this._currentConvId = null
    this._listenersRegistered = false
    this._runStartTime = null
  }

  // ── IPC Listener Registration ────────────────────────────────

  registerListeners() {
    if (this._listenersRegistered) return
    this._listenersRegistered = true

    const agent = window.electronAPI.agent

    // Run started — update message status from 'pending' to 'streaming'
    agent.onRunStarted((data) => {
      const ctx = this._getRunContext(data.runId, data)
      this.convStore.setStreamingIteration(0, ctx.convId)
      this.convStore.setStreamingMsgId(ctx.convId, data.msgId)
      const convId = ctx.convId
      const msgs = this.convStore.messages[convId]
      if (msgs) {
        const msg = msgs.find(m => m.id === data.msgId)
        if (msg) msg.status = 'streaming'
      }
    })

    // Streaming chunks (all event types flow through this single channel)
    agent.onChunk((data) => {
      const chunk = data.chunk
      if (!chunk) return
      const ctx = this._getRunContext(data.runId)
      const convId = ctx?.convId || ''

      switch (chunk.type) {
        case 'content':
          this.streamRenderer.emitTextDelta(chunk.text || '', convId)
          break
        case 'thinking':
          this.streamRenderer.emitThinkingDelta(chunk.text || '', convId)
          break
        case 'tool_start':
          this.streamRenderer.emitToolStart(chunk.toolId, chunk.toolName, chunk.input, convId)
          break
        case 'tool_input':
          this.streamRenderer.emitToolInput(chunk.toolId, chunk.partialInput, convId)
          break
        case 'tool_end':
          this.streamRenderer.emitToolEnd(chunk.toolId, chunk.result, convId)
          break
        case 'tool_error':
          this.streamRenderer.emitToolError(chunk.toolId, chunk.error, convId)
          break
        case 'subagent_start':
          this.streamRenderer.emitSubAgentStart(chunk.subRunId || chunk.runId, chunk.name, chunk.task || '', convId)
          break
        case 'subagent_chunk':
          this.streamRenderer.emitSubAgentChunk(chunk.subRunId || chunk.runId, chunk.name, chunk.text || '', convId)
          break
        case 'subagent_end':
          this.streamRenderer.emitSubAgentEnd(chunk.subRunId || chunk.runId, chunk.name, chunk.result || '', convId)
          break
        case 'subagent_error':
          this.streamRenderer.emitSubAgentError(chunk.subRunId || chunk.runId, chunk.name, chunk.error || chunk.result || '', convId)
          break
        case 'todos':
          this.streamRenderer.emitTodos(chunk.todos || [], convId)
          break
        case 'iteration':
          this.convStore.setStreamingIteration(chunk.iteration || 0, convId)
          break
        case 'step':
          this.convStore.addStreamingStep(chunk.step, chunk.index, convId)
          break
        case 'usage':
          this.convStore.updateStreamingUsage(chunk.usage || {}, convId)
          break
      }
    })

    // Auth request from DeepAgents interruptOn
    agent.onAuthRequest((data) => {
      const ctx = this._getRunContext(data.requestId || data.runId)
      this.streamRenderer.emitAuthRequest(data.requestId, data.actionRequests, data.reviewConfigs, {
        runId: data.requestId || data.runId || '',
        convId: ctx?.convId || '',
        msgId: ctx?.msgId || '',
      })
    })

    // Run completed — data.content from IPC is authoritative, streamingContent is fallback
    agent.onDone(async (data) => {
      const ctx = this._getRunContext(data.runId)
      const live = this.convStore.getStreamingState(ctx?.convId)
      const content = data.content || live.content || ''
      const thinkingContent = data.thinkingContent || live.thinking || ''
      const convId = ctx?.convId
      // If stopReason is recursion_limit, treat as cancelled (agent hit iteration limit)
      const status = data.stopReason === 'recursion_limit' ? 'cancelled' : 'completed'
      // Use renderer-side timing for consistency (includes IPC overhead + thinking time)
      const latencyMs = ctx?.startTime ? Date.now() - ctx.startTime : (data.latencyMs || 0)
      this.convStore.finalizeStreamingMsg({
        convId,
        runId: data.runId,
        msgId: ctx?.msgId || data.msgId,
        status,
        content,
        thinkingContent,
        usage: data.usage,
        cost: data.cost || data.usage?.cost || 0,
        latencyMs,
        steps: data.steps,
        todos: data.todos,
        errorCode: data.stopReason === 'recursion_limit' ? 'RECURSION_LIMIT' : undefined,
        errorMessage: data.stopReason === 'recursion_limit' ? '迭代次数已达上限，任务中途停止' : undefined,
      })
      await this._autoGenerateTitle(convId, content)
      this._clearRunState(data.runId)
    })

    // Run error — still pass latency, partial content, and partial usage
    agent.onError((data) => {
      const ctx = this._getRunContext(data.runId)
      const live = this.convStore.getStreamingState(ctx?.convId)
      const latencyMs = ctx?.startTime ? Date.now() - ctx.startTime : 0
      const content = live.content || ''
      const thinkingContent = live.thinking || ''
      const partialUsage = live.usage?.inputTokens || live.usage?.outputTokens
        ? { ...live.usage }
        : undefined
      this.convStore.finalizeStreamingMsg({
        convId: ctx?.convId,
        runId: data.runId,
        msgId: ctx?.msgId || data.msgId,
        status: 'error',
        content,
        thinkingContent,
        errorMessage: typeof data.error?.message === 'string' ? data.error.message : (typeof data.error === 'string' ? data.error : '未知错误'),
        errorCode: data.error?.code || 'API_ERROR',
        latencyMs,
        usage: partialUsage,
      })
      this._clearRunState(data.runId)
    })

    // Run cancelled — still pass latency, partial content, and partial usage
    agent.onCancelled((data) => {
      const ctx = this._getRunContext(data.runId)
      const live = this.convStore.getStreamingState(ctx?.convId)
      const latencyMs = ctx?.startTime ? Date.now() - ctx.startTime : 0
      const content = live.content || data.content || ''
      const thinkingContent = live.thinking || ''
      const partialUsage = live.usage?.inputTokens || live.usage?.outputTokens
        ? { ...live.usage }
        : undefined
      this.convStore.finalizeStreamingMsg({
        convId: ctx?.convId,
        runId: data.runId,
        msgId: ctx?.msgId || data.msgId,
        status: 'cancelled',
        content,
        thinkingContent,
        latencyMs,
        usage: partialUsage,
      })
      this._clearRunState(data.runId)
    })

    // Max iterations reached
    agent.onMaxIterations((data) => {
      const ctx = this._getRunContext(data.runId)
      this.convStore.setStreamingIteration(data.iterations, ctx?.convId)
    })

    // Forward artifact-created IPC to window event for WorkspaceTab listeners
    agent.onArtifactsCreated?.((data) => {
      window.dispatchEvent(new CustomEvent('reviva:artifacts-created', { detail: data || {} }))
    })
  }

  removeListeners() {
    window.electronAPI.agent.removeRunListeners()
    window.electronAPI.chat?.removeListeners()
    this._listenersRegistered = false
    this._clearRunState()
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Start a chat with an agent
   * Renderer only sends: agent prompt + messages + ctxPaths
   * Main process handles: project system prompt injection, context staging, output dir, skills/memory
   */
  async startChat({ convId, userText, agentId, ctxItems, wikiContext }) {
    // 1. Add user message — ctx items stored as both meta.ctx (for message building) and meta.attachments (for UI rendering)
    const ctxMeta = _toCtxMeta(ctxItems)
    await this.convStore.addMessage(convId, {
      role: 'user',
      content: userText,
      meta: {
        agentId: agentId || null,
        ctx: ctxMeta,
        attachments: ctxMeta, // For ChatMessage.vue FileCard/Image rendering
        wikiContext: wikiContext || null,
      },
    })

    // 2. Create placeholder assistant message
    const placeholder = await this.convStore.addMessage(convId, {
      role: 'assistant',
      content: '',
      status: 'pending',
      meta: { agentId: agentId || '' },
    })

    // 3. Resolve agent → model → provider
    const agent = agentId
      ? this.agentsStore.agents.find(a => a.id === agentId)
      : null
    const modelRef = agent?.model || this.settingsStore.defaultModels?.chat || ''
    const providerMatch = this._findProviderForModel(modelRef)
    const model = parseModelRef(modelRef).modelId || modelRef

    if (!providerMatch) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: '未找到匹配的 AI 服务提供商，请先在设置中配置',
        errorCode: 'NO_PROVIDER',
      })
      return
    }

    const { providerId, provider, modelObj } = providerMatch
    if (!this._providerConfigured(provider)) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: `${provider?.name || providerId} 未完成模型配置`,
        errorCode: 'NO_PROVIDER_CONFIG',
      })
      return
    }
    if ((ctxItems || []).some(_isImageContextItem) && !modelObj?.capabilities?.vision) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: `当前模型 ${model} 不支持图片识别。请切换到支持视觉能力的模型后再发送图片。`,
        errorCode: 'VISION_MODEL_REQUIRED',
      })
      return
    }

    // 4. Build sub-agents config for DeepAgents
    const subAgentConfigs = _buildSubAgentConfigs(agent, this.agentsStore.subAgentList)

    // 5. Build agent system prompt (only the agent's own prompt — main process injects project rules + answer style)
    const systemPrompt = agent?.prompt || ''

    // 6. Build messages (convert store format → plain format for IPC)
    // User messages with ctx items get file/folder references appended so the model knows what the user attached
    const allMessages = this.convStore.messages[convId] || []
    const plainMessages = allMessages
      .filter(_shouldIncludeInAgentContext)
      .slice(-50) // keep last 50 messages
      .map(_toAgentPlainMessage)

    // 7. Set streaming state
    const runId = genId('run')
    this.convStore.startStreaming(convId, placeholder, runId)
    this._trackRun(runId, convId, placeholder.id)

    // 8. Build tool provider configs (per-agent: web_search Tavily/SearXNG/Bing)
    const toolProviderConfigs = {}
    for (const toolId of _agentAndSubAgentToolIds(agent, subAgentConfigs)) {
      const savedConfig = this.agentsStore.toolProviderConfigMap[toolId]
      if (savedConfig) {
        toolProviderConfigs[toolId] = {
          provider: savedConfig.provider || 'tavily',
          apiKey: savedConfig.apiKey || '',
          baseUrl: savedConfig.baseUrl || '',
          userParams: savedConfig.userParams || {},
        }
      }
    }

    // 9. Send request via IPC — main process handles all system prompt injection & context staging
    this.registerListeners()
    try {
      await window.electronAPI.agent.startRun(toPlain({
        runId,
        conversationId: convId,
        agentId: agentId || '',
        agentEnglishName: _resolveAgentEnglishName(agent),
        msgId: placeholder.id,
        providerId,
        apiFormat: this._providerApiFormat(provider),
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model,
        modelHasVision: !!modelObj?.capabilities?.vision,
        systemPrompt,
        messages: plainMessages,
        maxIterations: _resolveNonNegativeLimit(agent?.maxIter, agent?.max_iterations, this.settingsStore?.maxIter, 10),
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens || 4096,
        topP: agent?.topP,
        thinkingMode: agent?.thinkingMode || 'auto',
        thinkingIntensity: agent?.thinkingIntensity || 'medium',
        reviewerModel: parseModelRef(agent?.reviewerModel || '').modelId || '',
        useSameModel: agent?.useSameModel ?? true,
        toolCallLimit: _resolveNonNegativeLimit(agent?.toolCallLimit, this.settingsStore?.toolCallLimit, 0),
        modelCallLimit: _resolveNonNegativeLimit(agent?.modelCallLimit, this.settingsStore?.modelCallLimit, 0),
        toolIds: _buildRuntimeToolIds(agent, ctxItems, wikiContext),
        subAgents: subAgentConfigs,
        permissions: agent?.permissions || {},
        skills: agent?.skills || [],
        toolProviderConfigs,
        cloudContext: _buildCloudContext(ctxItems),
        wikiContext: wikiContext || {},
        ctxPaths: _toCtxPaths(ctxItems),
        answerStyle: this.settingsStore?.answerStyle || 'default',
      }))
    } catch (err) {
      this.convStore.finalizeStreamingMsg({
        convId,
        runId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: err.message || '请求失败',
        errorCode: 'API_ERROR',
      })
      this._clearRunState(runId)
    }
  }

  /**
   * Cancel the current run
   */
  cancel(convId = this.convStore.currentConvId) {
    const runId = this.convStore.getStreamingState(convId)?.runId
    if (runId && window.electronAPI?.agent?.cancelRun) {
      window.electronAPI.agent.cancelRun(runId)
    }
  }

  /**
   * Context compression is handled by Agents built-in offloading + summarization
   */
  compressContext() {
    return { compressed: false, reason: '系统自动管理上下文压缩，无需手动操作' }
  }

  /**
   * Retry a failed/cancelled message
   */
  async retryMessage(convId, targetMsgId) {
    const msgs = this.convStore.messages[convId] || []
    const targetIdx = msgs.findIndex(m => m.id === targetMsgId)
    if (targetIdx < 0) return

    const targetMsg = msgs[targetIdx]
    const userIdx = targetMsg.role === 'user' ? targetIdx : targetIdx - 1
    if (userIdx < 0) return
    const userMsg = msgs[userIdx]
    if (userMsg?.role !== 'user') return

    const deleteStart = targetMsg.role === 'user' ? userIdx + 1 : targetIdx
    const toDelete = []
    for (let i = deleteStart; i < msgs.length; i++) {
      if (msgs[i].role === 'user') break
      toDelete.push(msgs[i])
    }
    for (const msg of toDelete) {
      await this.convStore.deleteMessage(convId, msg.id)
    }

    const agentId = userMsg.meta?.agentId || ''
    const ctxItems = userMsg.meta?.ctx?.length ? userMsg.meta.ctx : (userMsg.meta?.attachments || [])
    const wikiContext = userMsg.meta?.wikiContext || {}
    const agent = agentId
      ? this.agentsStore.agents.find(a => a.id === agentId)
      : null

    const subAgentConfigs = _buildSubAgentConfigs(agent, this.agentsStore.subAgentList)

    const placeholder = await this.convStore.addMessage(convId, {
      role: 'assistant',
      content: '',
      status: 'pending',
      meta: { agentId },
    })

    const modelRef = agent?.model || this.settingsStore.defaultModels?.chat || ''
    const providerMatch = this._findProviderForModel(modelRef)
    const model = parseModelRef(modelRef).modelId || modelRef

    if (!providerMatch) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: '未找到匹配的 AI 服务提供商',
        errorCode: 'NO_PROVIDER',
      })
      return
    }

    const { providerId, provider, modelObj } = providerMatch
    if (!this._providerConfigured(provider)) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: `${provider?.name || providerId} 未完成模型配置`,
        errorCode: 'NO_PROVIDER_CONFIG',
      })
      return
    }
    if ((ctxItems || []).some(_isImageContextItem) && !modelObj?.capabilities?.vision) {
      this.convStore.finalizeStreamingMsg({
        convId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: `当前模型 ${model} 不支持图片识别。请切换到支持视觉能力的模型后再发送图片。`,
        errorCode: 'VISION_MODEL_REQUIRED',
      })
      return
    }

    const systemPrompt = agent?.prompt || ''

    const allMessages = this.convStore.messages[convId] || []
    const plainMessages = allMessages
      .filter(_shouldIncludeInAgentContext)
      .slice(-50)
      .map(_toAgentPlainMessage)

    const toolProviderConfigs = {}
    for (const toolId of _agentAndSubAgentToolIds(agent, subAgentConfigs)) {
      const savedConfig = this.agentsStore.toolProviderConfigMap[toolId]
      if (savedConfig) {
        toolProviderConfigs[toolId] = {
          provider: savedConfig.provider || 'tavily',
          apiKey: savedConfig.apiKey || '',
          baseUrl: savedConfig.baseUrl || '',
          userParams: savedConfig.userParams || {},
        }
      }
    }

    const runId = genId('run')
    this.convStore.startStreaming(convId, placeholder, runId)
    this._trackRun(runId, convId, placeholder.id)

    this.registerListeners()
    try {
      await window.electronAPI.agent.startRun(toPlain({
        runId,
        conversationId: convId,
        agentId,
        agentEnglishName: _resolveAgentEnglishName(agent),
        msgId: placeholder.id,
        providerId,
        apiFormat: this._providerApiFormat(provider),
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model,
        modelHasVision: !!modelObj?.capabilities?.vision,
        systemPrompt,
        messages: plainMessages,
        maxIterations: _resolveNonNegativeLimit(agent?.maxIter, agent?.max_iterations, this.settingsStore?.maxIter, 10),
        temperature: agent?.temperature,
        maxTokens: agent?.maxTokens || 4096,
        topP: agent?.topP,
        thinkingMode: agent?.thinkingMode || 'auto',
        thinkingIntensity: agent?.thinkingIntensity || 'medium',
        reviewerModel: parseModelRef(agent?.reviewerModel || '').modelId || '',
        useSameModel: agent?.useSameModel ?? true,
        toolCallLimit: _resolveNonNegativeLimit(agent?.toolCallLimit, this.settingsStore?.toolCallLimit, 0),
        modelCallLimit: _resolveNonNegativeLimit(agent?.modelCallLimit, this.settingsStore?.modelCallLimit, 0),
        toolIds: _buildRuntimeToolIds(agent, ctxItems, wikiContext),
        subAgents: subAgentConfigs,
        permissions: agent?.permissions || {},
        skills: agent?.skills || [],
        toolProviderConfigs,
        cloudContext: _buildCloudContext(ctxItems),
        wikiContext,
        ctxPaths: _toCtxPaths(ctxItems),
        answerStyle: this.settingsStore?.answerStyle || 'default',
      }))
    } catch (err) {
      this.convStore.finalizeStreamingMsg({
        convId,
        runId,
        msgId: placeholder.id,
        status: 'error',
        errorMessage: err.message || '请求失败',
        errorCode: 'API_ERROR',
      })
      this._clearRunState(runId)
    }
  }

  /**
   * Respond to an auth request
   */
  respondAuth(requestId, approved) {
    // Save auth event to message meta BEFORE removing from store (so it persists in completed message)
    const authReq = this.convStore.pendingAuthRequests.find(r => r.requestId === requestId)
    if (authReq) {
      const ctx = this._getRunContext(authReq.runId || requestId)
      const convId = authReq.convId || ctx?.convId
      const msgId = authReq.msgId || ctx?.msgId
      const msgs = this.convStore.messages[convId]
      if (msgs) {
        const msg = msgs.find(m => m.id === msgId)
        if (msg) {
          if (!msg.meta) msg.meta = {}
          if (!msg.meta.authEvents) msg.meta.authEvents = []
          msg.meta.authEvents.push({
            requestId,
            toolName: authReq.toolName,
            description: authReq.description,
            params: authReq.params,
            riskLevel: authReq.riskLevel,
            decision: approved ? 'approved' : 'denied',
            createdAt: authReq.createdAt,
            respondedAt: Date.now(),
          })
        }
      }
    }
    this.convStore.removeAuthRequest(requestId)
    if (window.electronAPI?.agent?.respondAuth) {
      window.electronAPI.agent.respondAuth(requestId, approved)
    }
  }

  // ── Internal ─────────────────────────────────────────────────

  async _autoGenerateTitle(convId, assistantContent) {
    if (!convId) return
    const conv = this.convStore.conversations.find(c => c.id === convId)
    if (!conv || conv.title !== '新对话') return

    const msgs = this.convStore.messages[convId] || []
    const userMsg = msgs.find(m => m.role === 'user')
    if (!userMsg) return

    const modelRef = this.settingsStore.defaultModels?.title || this.settingsStore.defaultModels?.chat || ''
    const providerMatch = this._findProviderForModel(modelRef)
    if (!this._providerConfigured(providerMatch?.provider)) return

    const { providerId, provider } = providerMatch
    const model = parseModelRef(modelRef).modelId || modelRef
    const prompt = `根据以下对话，生成2到15个字的中文标题（不要标点、不要引号、不要解释，只输出标题）:\n用户: ${(userMsg.content || '').slice(0, 200)}\n助手: ${(assistantContent || '').slice(0, 300)}`

    try {
      let title = ''
      if (this._providerApiFormat(provider) === 'anthropic') {
        title = await this._callAnthropic(provider, model, prompt)
      } else {
        title = await this._callOpenAICompatible(provider, model, prompt)
      }
      title = title.trim().replace(/["""。！？,.!?]/g, '').slice(0, 15)
      if (title && title !== '新对话') {
        await this.convStore.updateConv(convId, { title })
        this.convStore.titleAnimation = { convId, newTitle: title }
      }
    } catch (e) {
      console.warn('[AgentRuntime] title generation failed:', e.message)
    }
  }

  async _callOpenAICompatible(provider, model, prompt) {
    let baseUrl = (provider.baseUrl || '').replace(/\/+$/, '')
    if (!baseUrl.endsWith('/chat/completions')) baseUrl += '/chat/completions'
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` }
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model, messages: [{ role: 'user', content: prompt }],
        temperature: 0.3, max_tokens: 30,
      }),
    })
    const json = await res.json()
    return json.choices?.[0]?.message?.content || ''
  }

  async _callAnthropic(provider, model, prompt) {
    let baseUrl = (provider.baseUrl || '').replace(/\/+$/, '')
    if (!baseUrl.endsWith('/messages')) baseUrl += '/messages'
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model, max_tokens: 30,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const json = await res.json()
    return json.content?.[0]?.text || ''
  }

  _trackRun(runId, convId, msgId) {
    const context = { runId, convId, msgId, startTime: Date.now() }
    this._runs.set(runId, context)
    this._currentRunId = runId
    this._currentMsgId = msgId
    this._currentConvId = convId
    this._runStartTime = context.startTime
    return context
  }

  _getRunContext(runId, fallback = {}) {
    if (runId && this._runs.has(runId)) return this._runs.get(runId)
    const convId = fallback.conversationId || fallback.convId || ''
    const msgId = fallback.msgId || ''
    if (runId && convId) return this._trackRun(runId, convId, msgId)
    if (runId) {
      const live = this.convStore.getStreamingStateByRunId(runId)
      if (live?.active) return this._trackRun(runId, live.convId, live.msgId)
    }
    return null
  }

  _clearRunState(runId = '') {
    if (!runId) {
      this._runs.clear()
      this._currentRunId = null
      this._currentMsgId = null
      this._currentConvId = null
      this._runStartTime = null
      return
    }
    this._runs.delete(runId)
    if (this._currentRunId === runId) {
      const last = Array.from(this._runs.values()).at(-1)
      this._currentRunId = last?.runId || null
      this._currentMsgId = last?.msgId || null
      this._currentConvId = last?.convId || null
      this._runStartTime = last?.startTime || null
    }
  }

  /**
   * Find a provider that supports the given model
   */
  _findProviderForModel(modelRef) {
    const { providerId, modelId, scoped } = parseModelRef(modelRef)
    if (!modelId) return null

    if (scoped) {
      const p = this.settingsStore.providers.find(p => p.id === providerId)
      const modelObj = p?.models?.find(m => m.id === modelId && m.enabled)
      if (modelObj && p.enabled && this._providerConfigured(p)) {
        return { providerId: p.id, provider: p, modelObj }
      }
      return null
    }

    for (const p of this.settingsStore.providers) {
      const modelObj = p.models?.find(m => m.id === modelId && m.enabled)
      if (modelObj && p.enabled && this._providerConfigured(p)) {
        return { providerId: p.id, provider: p, modelObj }
      }
    }
    const fallback = this.settingsStore.providers.find(p => p.enabled && this._providerConfigured(p))
    const fallbackModel = fallback?.models?.find(m => m.enabled && m.tier !== 'embedding')
    return fallback ? { providerId: fallback.id, provider: fallback, modelObj: fallbackModel } : null
  }

  _providerConfigured(provider) {
    return this.settingsStore?.providerConfigured
      ? this.settingsStore.providerConfigured(provider)
      : !!(provider?.baseUrl && provider.apiKey)
  }

  _providerApiFormat(provider) {
    return provider?.apiFormat || (provider?.id === 'anthropic' ? 'anthropic' : 'openai')
  }
}
