// AgentRunner：把微信用户消息喂给 Reviva Agent，拿回纯文本回复。
// 不自写 runForBot —— 直接复用 AgentService.handleStartRun（与本地网关 OpenAI 兼容层同款），
// 靠 subscribeGatewayEvents 收 agent:runDone（payload.content 即完整回复）。
// 对话历史从 DB 读取最近 N 轮拼进 messages，新消息由 handleStartRun 经 msgId 回写。
import crypto from 'node:crypto'

export class AgentRunner {
  constructor({ dbService, agentService, logger = console } = {}) {
    this._db = dbService
    this._agent = agentService
    this._logger = logger
  }

  // providers / defaultModels 这两个 setting 可能存成 JSON 字符串（saveDefaultModels 用 stringify），
  // 也可能是对象（getSetting 经 parseJSON）。统一兼容，避免拿到字符串后取属性得 undefined。
  static _parseJSON(v) {
    if (v == null) return null
    if (typeof v === 'string') { try { return JSON.parse(v) } catch (e) { return null } }
    return v
  }

  // 从 agent.model（providerId::modelId）或默认对话模型解出模型凭证。
  // fallback 链对齐 ChatView / AgentRuntime：agent.model -> defaultModels.chat -> defaultModels.agent
  _resolveModel(agent) {
    const providers = AgentRunner._parseJSON(this._db.getSetting('providers')) || []
    const defaults = AgentRunner._parseJSON(this._db.getSetting('defaultModels')) || {}
    const ref = String((agent && agent.model) || defaults.chat || defaults.agent || '')
    if (!ref) throw new Error('该 Agent 未绑定模型，且 Reviva 未设默认对话模型。请在 Agent 编辑页绑定模型，或在「设置 > 模型」配置默认对话模型。')
    const sep = ref.indexOf('::')
    const providerId = sep > 0 ? ref.slice(0, sep) : ''
    const modelId = sep > 0 ? ref.slice(sep + 2) : ref
    const provider = providerId
      ? providers.find(p => p.id === providerId && p.enabled !== false)
      : providers.find(p => p.enabled !== false && p.models && p.models.some(m => m.id === modelId && m.enabled !== false))
    const model = provider && provider.models ? provider.models.find(m => m.id === modelId && m.enabled !== false) : null
    if (!provider || !model || !provider.apiKey) throw new Error('模型「' + ref + '」未在 Reviva 找到可用配置（provider 或 apiKey 缺失）。请在「设置 > 模型」中配置。')
    return {
      providerId: provider.id,
      apiFormat: provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : 'openai'),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || '',
      model: model.id,
      modelHasVision: !!(model.capabilities && model.capabilities.vision),
    }
  }

  /**
   * 跑一次 Agent。
   * @returns {Promise<{content:string, thinkingContent:string, usage, runId, conversationId, latencyMs}>}
   */
  async run({ userId, text, conversationId = null, agentId = '', historyWindow = 10, storeHistory = true, ctxPaths = [], imagePaths = [], onChunk = null, agentTimeout = 5 }) {
    if (!this._agent || typeof this._agent.handleStartRun !== 'function') throw new Error('AgentService 不可用')
    if (!text) throw new Error('空消息')
    const db = this._db
    const agent = db.getAgent(agentId)
    if (!agent) throw new Error('未找到 Agent: ' + agentId)
    const modelConfig = this._resolveModel(agent)
    const runId = 'wxbot_' + crypto.randomUUID()
    const convId = conversationId || ('wx_' + userId)

    if (storeHistory && !db.getConv(convId)) {
      db.createConv({
        id: convId,
        agentId,
        groupId: 'wxbot',
        title: ('微信 Bot · ' + (agent.englishName || agent.name || agentId)).slice(0, 80),
      })
    }

    // 历史消息：取最近 historyWindow 轮（user+assistant 一对算一轮）已完成的
    const historyMsgs = storeHistory ? (db.listMsgs(convId) || []) : []
    const done = historyMsgs.filter(m => m.status === 'completed' && m.content)
    const keep = Math.max(0, done.length - historyWindow * 2)
    const recent = keep > 0 ? done.slice(keep) : done
    const messages = recent.map(m => ({ role: m.role, content: m.content }))
    const lastMsg = { role: 'user', content: text }
    if (imagePaths && imagePaths.length) lastMsg.attachments = imagePaths.map(p => ({ path: p }))
    messages.push(lastMsg)

    // assistant 占位消息：handleStartRun 会用 msgId 回写 content/status/usage
    const userMsgId = storeHistory ? ('msg_' + crypto.randomUUID()) : null
    const assistantMsgId = storeHistory ? ('msg_' + crypto.randomUUID()) : null
    if (storeHistory) {
      db.createMsg({ id: userMsgId, conversationId: convId, role: 'user', content: text, status: 'completed' })
      db.createMsg({ id: assistantMsgId, conversationId: convId, role: 'assistant', content: '', status: 'streaming' })
    }

    const requestPayload = {
      runId,
      conversationId: convId,
      agentId,
      agentEnglishName: agent.englishName || '',
      msgId: assistantMsgId,
      userMessageId: userMsgId,
      systemPrompt: agent.prompt || '',
      messages,
      ...modelConfig,
      maxIterations: agent.maxIter ?? 10,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      topP: agent.topP,
      thinkingMode: agent.thinkingMode,
      thinkingIntensity: agent.thinkingIntensity,
      toolIds: agent.tools || [],
      permissions: agent.permissions || {},
      skills: agent.skills || [],
      subAgents: agent.subAgents || [],
      toolProviderConfigs: db.getSetting('toolProviderConfigMap') || {},
      ctxPaths,
      learningProfileAllowed: false,
    }

    return await new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn, val) => {
        if (settled) return
        settled = true
        try { clearTimeout(timer) } catch (e) {}
        try { unsubscribe() } catch (e) {}
        if (fn === reject && storeHistory && assistantMsgId) {
          try { db.updateMsg(assistantMsgId, { status: 'failed', error_message: String((val && val.message) || 'agent run failed') }) } catch (e) {}
        }
        fn(val)
      }
      const timer = setTimeout(() => {
        finish(reject, new Error('Agent 处理超时，请稍后重试'))
        try { this._agent.handleCancelRun && this._agent.handleCancelRun(runId) } catch (e) {}
      }, (agentTimeout || 5) * 60000)
      const unsubscribe = this._agent.subscribeGatewayEvents((channel, payload) => {
        if (!payload || payload.runId !== runId) return
        if (channel === 'agent:chunk' && typeof onChunk === 'function') {
          const chunk = payload.chunk
          const chunkText = (chunk && (chunk.text || chunk.content)) || ''
          try { onChunk(chunkText, chunk) } catch (e) {}
        }
        if (channel === 'agent:runDone') {
          finish(resolve, {
            content: payload.content || '',
            thinkingContent: payload.thinkingContent || '',
            usage: payload.usage || null,
            runId,
            conversationId: convId,
            latencyMs: payload.latencyMs || 0,
          })
        }
        if (channel === 'agent:runError' || channel === 'agent:runCancelled') {
          finish(reject, new Error((payload.error && payload.error.message) || channel))
        }
      })
      this._agent.handleStartRun(requestPayload).catch(err => finish(reject, err))
    })
  }
}