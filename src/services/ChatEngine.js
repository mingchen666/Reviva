// src/services/ChatEngine.js — Renderer-side orchestrator: builds request, manages IPC streaming, updates store
import { ContextManager } from './ContextManager'
import { parseModelRef } from '@/utils/modelRef'

const contextManager = new ContextManager()

function _isImageContextItem(item) {
  if (!item) return false
  if (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) return true
  if (item.type === 'image') return true
  const name = String(item.name || item.path || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)
}

function _toCtxMeta(ctxItems) {
  return (ctxItems || []).map(i => ({
    type: i.type,
    source: i.source || '',
    id: i.id,
    name: i.name,
    path: i.path || '',
    originalPath: i.originalPath || '',
    dataUrl: i.dataUrl || '',
    isDirectory: !!i.isDirectory,
  }))
}

function _toCtxPaths(ctxItems) {
  return (ctxItems || []).filter(i => i.path || i.dataUrl).map(i => ({
    path: i.path || '',
    originalPath: i.originalPath || '',
    dataUrl: i.dataUrl || '',
    name: i.name,
    type: i.type || (i.isDirectory ? 'folder' : 'file'),
    source: i.source || '',
    isDirectory: !!i.isDirectory,
  }))
}

export class ChatEngine {
  constructor(convStore, agentsStore, settingsStore) {
    this._convStore = convStore
    this._agentsStore = agentsStore
    this._settingsStore = settingsStore
    this._currentRequestId = null
    this._listenersRegistered = false
  }

  registerListeners() {
    if (this._listenersRegistered) return
    this._listenersRegistered = true

    const chat = window.electronAPI.chat

    chat.onStarted((data) => {
      const { requestId, msgId, conversationId } = data
      this._currentRequestId = requestId
      this._convStore.setStreamingMsgId(conversationId, msgId)
    })

    chat.onChunk((data) => {
      const { chunk } = data
      if (chunk?.type === 'content' && chunk.text) {
        this._convStore.appendToStreamingMsg(chunk.text)
      }
      if (chunk?.type === 'thinking' && chunk.text) {
        this._convStore.appendToStreamingThinking(chunk.text)
      }
      // Tool call chunks
      if (chunk?.type === 'tool_start' && chunk.toolId) {
        this._convStore.addStreamingToolCall(chunk.toolId, chunk.toolName || '', chunk.input)
      }
      if (chunk?.type === 'tool_input' && chunk.toolId) {
        this._convStore.appendStreamingToolInput(chunk.toolId, chunk.partialInput || '')
      }
      if (chunk?.type === 'tool_end' && chunk.toolId) {
        this._convStore.completeStreamingToolCall(chunk.toolId, chunk.result || '')
      }
      if (chunk?.type === 'tool_error' && chunk.toolId) {
        this._convStore.errorStreamingToolCall(chunk.toolId, chunk.result || chunk.error || '')
      }
    })

    chat.onDone((data) => {
      const { msgId, usage, thinkingContent, latencyMs, cost } = data
      this._convStore.finalizeStreamingMsg({
        msgId, usage, thinkingContent, latencyMs, cost, status: 'completed',
      })
      this._currentRequestId = null
    })

    chat.onError((data) => {
      const { msgId, error, code } = data
      this._convStore.finalizeStreamingMsg({
        msgId, status: 'error', errorMessage: error, errorCode: code,
      })
      this._currentRequestId = null
    })

    chat.onCancelled((data) => {
      const { msgId } = data
      this._convStore.finalizeStreamingMsg({
        msgId, status: 'error', errorMessage: '已取消',
      })
      this._currentRequestId = null
    })

    // Auth request listener
    if (chat.onAuthRequest) {
      chat.onAuthRequest((data) => {
        this._convStore.addAuthRequest(data)
      })
    }
  }

  removeListeners() {
    window.electronAPI.chat.removeListeners()
    this._listenersRegistered = false
    this._currentRequestId = null
  }

  respondAuth(requestId, approved) {
    this._convStore.removeAuthRequest(requestId)
    if (window.electronAPI?.chat?.respondAuth) {
      window.electronAPI.chat.respondAuth(requestId, approved)
    }
  }

  async startChat({ convId, userText, agentId, ctxItems }) {
    // 1. Add user message to store
    await this._convStore.addMessage(convId, {
      role: 'user',
      content: userText,
      meta: {
        agentId: agentId || null,
        ctx: _toCtxMeta(ctxItems),
        attachments: _toCtxMeta(ctxItems),
      },
    })

    // 2. Create placeholder assistant message (status='pending')
    const placeholder = await this._convStore.addMessage(convId, {
      role: 'assistant',
      content: '',
      status: 'pending',
    })

    // 3. Resolve agent → model → provider
    const agent = agentId
      ? this._agentsStore.agents.find(a => a.id === agentId)
      : null
    const modelRef = agent?.model || this._settingsStore.defaultModels?.chat || ''
    const providerMatch = this._findProviderForModel(modelRef)
    const model = parseModelRef(modelRef).modelId || modelRef

    if (!providerMatch) {
      this._convStore.finalizeStreamingMsg({
        msgId: placeholder.id, status: 'error', errorMessage: '未找到匹配的 AI 服务提供商，请先在设置中配置',
      })
      return
    }

    const { providerId, provider, modelObj } = providerMatch
    if (!this._providerConfigured(provider)) {
      this._convStore.finalizeStreamingMsg({
        msgId: placeholder.id, status: 'error', errorMessage: `${provider?.name || providerId} 未完成模型配置`,
      })
      return
    }
    if ((ctxItems || []).some(_isImageContextItem) && !modelObj?.capabilities?.vision) {
      this._convStore.finalizeStreamingMsg({
        msgId: placeholder.id,
        status: 'error',
        errorMessage: `当前模型 ${model} 不支持图片识别。请切换到支持视觉能力的模型后再发送图片。`,
        errorCode: 'VISION_MODEL_REQUIRED',
      })
      return
    }

    // 4. Resolve agent skills
    const agentSkills = agent?.skills?.length
      ? this._resolveSkills(agent.skills)
      : []

    // 5. Build context messages
    const allMessages = this._convStore.messages[convId] || []
    const contextMessages = contextManager.buildContext({
      messages: allMessages,
      maxMessages: this._convStore.currentConv?.contextLength || 50,
    })

    // 6. Build system prompt (with skills + answer style)
    const systemPrompt = contextManager.buildSystemPrompt({
      agent,
      ctxItems: ctxItems || [],
      skills: agentSkills,
      answerStyle: this._settingsStore.answerStyle,
    })

    // 7. Build request
    const request = {
      requestId: crypto.randomUUID?.() || 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      msgId: placeholder.id,
      conversationId: convId,
      agentId: agentId || '',
      providerId,
      apiFormat: this._providerApiFormat(provider),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model,
      modelHasVision: !!modelObj?.capabilities?.vision,
      systemPrompt,
      messages: contextMessages,
      temperature: agent?.temperature,
      maxTokens: agent?.maxTokens || 4096,
      topP: agent?.topP,
      contextItems: (ctxItems || []).map(i => ({
        type: i.type === 'local_file' ? 'file' : i.type,
        source: i.source || '',
        filePath: i.path || '',
        name: i.name || '',
        content: i.content || '',
      })),
      ctxPaths: _toCtxPaths(ctxItems),
    }

    // 8. Set streaming state in store
    this._convStore.startStreaming(convId, placeholder)

    // 9. Send request via IPC
    this.registerListeners()
    await window.electronAPI.chat.start(request)
  }

  cancelChat() {
    if (this._currentRequestId) {
      window.electronAPI.chat.cancel(this._currentRequestId)
      this._currentRequestId = null
    }
  }

  async retryMessage(convId, failedMsgId) {
    // Find the failed message and the preceding user message
    const msgs = this._convStore.messages[convId] || []
    const failedIdx = msgs.findIndex(m => m.id === failedMsgId)
    if (failedIdx < 1) return

    const userMsg = msgs[failedIdx - 1]
    if (userMsg.role !== 'user') return

    // Delete the failed assistant message
    await this._convStore.deleteMessage(convId, failedMsgId)

    // Re-send the user message context
    const agentId = userMsg.meta?.agentId || ''
    const ctxItems = userMsg.meta?.ctx?.length ? userMsg.meta.ctx : (userMsg.meta?.attachments || [])

    await this.startChat({
      convId,
      userText: userMsg.content,
      agentId,
      ctxItems,
    })
  }

  _findProviderForModel(modelRef) {
    const { providerId, modelId, scoped } = parseModelRef(modelRef)
    if (!modelId) return null

    if (scoped) {
      const p = this._settingsStore.providers.find(p => p.id === providerId)
      const modelObj = p?.models?.find(m => m.id === modelId && m.enabled)
      if (modelObj && p.enabled && this._providerConfigured(p)) {
        return { providerId: p.id, provider: p, modelObj }
      }
      return null
    }

    for (const p of this._settingsStore.providers) {
      const modelObj = p.models?.find(m => m.id === modelId && m.enabled)
      if (modelObj && p.enabled && this._providerConfigured(p)) {
        return { providerId: p.id, provider: p, modelObj }
      }
    }
    const fallback = this._settingsStore.providers.find(p => p.enabled && this._providerConfigured(p))
    const fallbackModel = fallback?.models?.find(m => m.enabled && m.tier !== 'embedding')
    return fallback ? { providerId: fallback.id, provider: fallback, modelObj: fallbackModel } : null
  }

  _providerConfigured(provider) {
    return this._settingsStore?.providerConfigured
      ? this._settingsStore.providerConfigured(provider)
      : !!(provider?.baseUrl && provider.apiKey)
  }

  _providerApiFormat(provider) {
    return provider?.apiFormat || (provider?.id === 'anthropic' ? 'anthropic' : 'openai')
  }

  _resolveSkills(skillIds) {
    const allSkills = this._agentsStore.allAvailableSkills
    return skillIds
      .map(id => allSkills.find(s => s.id === id))
      .filter(Boolean)
  }
}
