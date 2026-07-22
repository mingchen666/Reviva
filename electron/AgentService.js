// electron/AgentService.js — DeepAgents-based Agent orchestration service
// Uses the DeepAgents framework (LangChain) for agent loop, tool calling, streaming
// Integrated: subagents, interruptOn (human-in-the-loop), skills, memory

import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeepAgent, GENERAL_PURPOSE_SUBAGENT } from 'deepagents'
import { AgentScopedBackend } from './agents/runtime/AgentScopedBackend.js'
import {
  HIDDEN_COMMAND_COMPATIBILITY_TOOL_NAMES,
} from './agents/runtime/constants.js'
import {
  buildMiddleware,
  createDeepAgentsBuiltinToolExclusionMiddleware,
  createFilesystemToolArgumentAliasMiddleware,
  normalizeSubagentKey,
} from './agents/runtime/middleware.js'
import { calcCost } from './agents/runtime/modelCosts.js'
import { iterateDeepStream } from './agents/runtime/streamDeepAgent.js'
import {
  filterWebSearchTools,
  normalizeNonNegativeLimit,
  recursionLimitForMaxIterations,
  withContextualAgentTools,
  withDefaultAgentTools,
  withPermissionAgentTools,
} from './agents/runtime/toolSelection.js'
import {
  MAX_VISION_IMAGE_BYTES,
  _attachImagesToUserMessages,
  _dateStamp,
  _decodeImageDataUrl,
  _ensureImageFilename,
  _isImageContextItem,
  _isMediaContextItem,
  _isUserMessage,
  _messageAttachments,
  _toWorkspaceVirtualPath,
  _uniqueDestPath,
  enrichMessagesWithCtx,
  streamDirectModel,
  toDirectMessages,
  toLangchainMessages,
  toPlainMessages,
} from './agents/messages/messageAdapters.js'

function stripYamlQuotes(value) {
  const str = String(value || '').trim()
  if (!str) return ''
  if (str.startsWith('"') && str.endsWith('"')) {
    try {
      return JSON.parse(str)
    } catch {
      return str.slice(1, -1)
    }
  }
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1).replace(/''/g, "'")
  }
  return str
}

function isTopLevelYamlKey(line) {
  return /^[A-Za-z0-9_-]+:\s*/.test(line)
}

function parseSkillFrontmatterSummary(content) {
  const match = String(content || '').replace(/^\uFEFF/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return {}

  const meta = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!lineMatch) continue

    const key = lineMatch[1]
    const value = lineMatch[2].trim()
    if (/^[>|][+-]?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && !isTopLevelYamlKey(lines[i + 1])) {
        block.push(lines[++i].replace(/^\s{1,4}/, ''))
      }
      meta[key] = value.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim()
      continue
    }

    meta[key] = stripYamlQuotes(value)
  }
  return meta
}

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAICompletions } from '@langchain/openai'
import { ChatOpenAIResponsesCompat, normalizeAnthropicApiUrl } from './agents/runtime/modelAdapters.js'
import { MemorySaver, InMemoryStore, Command } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import { getLangchainTools, getUserDefinedLangchainTools, setToolProviderConfig, setWorkDirService, setDbService, setWikiService as setWikiServiceForTools, setMcpService as setMcpServiceForTools, setMediaQueryService as setMediaQueryServiceForTools, setNoteFileService as setNoteFileServiceForTools, setVisionAnalyzeHandler, resetTaskCounters, setExecCommandConfig, setCloudContext, setToolRunContext } from './agents/langchainTools.js'
import { buildProjectSystemPrompt } from './agents/prompts/projectSystemPrompt.js'
import { TokenRecorder } from './agents/TokenRecorder.js'
import { ErrorClassifier } from './agents/ErrorClassifier.js'
import { RunStateManager } from './agents/RunStateManager.js'
import { TitleGenerator } from './agents/TitleGenerator.js'
import { VisionAnalyzeService } from './tools/VisionAnalyzeService.js'



export class AgentService {
  constructor(dbService, getWin, workDirService, mcpService, notificationHandlers = {}, noteFileService = null) {
    this._db = dbService
    this._getWin = getWin
    this._workDirService = workDirService
    this._mcpService = mcpService || null
    this._noteFileService = noteFileService || null
    this._mediaIngestionService = null
    this._tokenRecorder = new TokenRecorder(dbService)
    this._errorClassifier = new ErrorClassifier()
    this._runStateManager = new RunStateManager(dbService)
    this._titleGenerator = new TitleGenerator()
    this._visionAnalyzeService = new VisionAnalyzeService({
      workDirService: this._workDirService,
      createModel: (...args) => this._createModel(...args),
    })
    this._checkpointer = new MemorySaver()
    this._store = new InMemoryStore()
    this._notifyTask = typeof notificationHandlers.notifyTask === 'function'
      ? notificationHandlers.notifyTask
      : null

    setToolProviderConfig({})
    setToolRunContext({})
    this._activeRuns = new Map()
    this._activeStreams = new Map()
    this._activeNoteAiRuns = new Map()
    this._interruptedRuns = new Map() // threadId → { runId, request, agentConfig }
    this._gatewayEventListeners = new Set()
  }

  init() {
    // Inject WorkDirService into langchainTools for delete_file path validation
    setWorkDirService(this._workDirService)
    // Inject DatabaseService for reading security settings (allowFileDelete, deleteScope)
    setDbService(this._db)
    setNoteFileServiceForTools(this._noteFileService)
    setMcpServiceForTools(this._mcpService)
    setVisionAnalyzeHandler((args, context) => this._visionAnalyzeService.analyze(args, context))

    // Load builtin agent modules (创作中心 agents)
    this._builtinModules = this._loadBuiltinAgentModules()
    this._syncBuiltinAgentModules()
    console.log('[AgentService] Loaded builtin modules:', this._builtinModules.map(m => m.english_name))

    ipcMain.handle('agent:startRun', (_, req) => this.handleStartRun(req))
    ipcMain.handle('agent:cancelRun', (_, runId) => this.handleCancelRun(runId))
    ipcMain.handle('agent:executeTool', (_, req) => this.handleExecuteTool(req))
    ipcMain.handle('agent:runSubAgent', (_, req) => this.handleRunSubAgent(req))
    ipcMain.handle('agent:compressContext', (_, req) => this.handleCompressContext(req))
    ipcMain.handle('agent:getRunState', (_, runId) => this.handleGetRunState(runId))
    ipcMain.handle('agent:authRespond', (_, requestId, approved) => this.handleAuthRespond(requestId, approved))
    ipcMain.handle('agent:generateTitle', (_, req) => this.handleGenerateTitle(req))

    ipcMain.handle('chat:start', (_, req) => this.handleChatStart(req))
    ipcMain.handle('chat:cancel', (_, reqId) => this.handleChatCancel(reqId))
    ipcMain.handle('chat:authRespond', (_, requestId, approved) => this.handleAuthRespond(requestId, approved))

    ipcMain.handle('noteAi:run', (_, req) => this.handleNoteAiRun(req))
    ipcMain.handle('noteAi:cancel', (_, requestId) => this.handleNoteAiCancel(requestId))
  }

  _notifyAgentTask(kind, request, runId, errorMessage = '') {
    if (!this._notifyTask) return
    try {
      this._notifyTask({
        kind,
        runId,
        conversationId: request?.conversationId || '',
        errorMessage,
      })
    } catch (e) {
      console.warn('[AgentService] notify task failed:', e.message)
    }
  }

  setWikiService(wikiService) {
    setWikiServiceForTools(wikiService)
  }

  setMediaQueryService(mediaQueryService) {
    setMediaQueryServiceForTools(mediaQueryService)
  }

  setMediaModule(mediaModule) {
    this._mediaIngestionService = mediaModule?.ingestion || null
    setMediaQueryServiceForTools(mediaModule?.query || null)
  }

  async _registerPreparedMediaContextItems(items = [], request = {}) {
    if (!this._mediaIngestionService) return items
    const settings = this._db?.getSetting?.('pdfReadStrategy') || {}
    for (const [index, item] of items.entries()) {
      if (!item?.path || item.mediaId || item.media_id || !_isMediaContextItem(item)) continue
      try {
        const registration = await this._mediaIngestionService.registerSource({
          path: item.path,
          sourceType: 'attachment',
          title: item.name || '',
          owner: {
            type: 'message',
            id: request.userMessageId || request.conversationId || '',
            locator: `${request.msgId || 'attachment'}:${item.id || item.name || index}`,
          },
        })
        item.mediaId = registration.source.id
        request.allowedMediaIds = [...new Set([...(request.allowedMediaIds || []), registration.source.id])]
        if (settings.mediaAction === 'low_cost_auto' && !registration.source.current_run_id) {
          const run = this._mediaIngestionService.createRun(registration.source.id, {
            locationId: registration.location.id,
            presetId: settings.mediaPreset || 'subtitle_first',
            language: settings.mediaPreferredLanguage === 'auto' ? '' : settings.mediaPreferredLanguage,
            providerId: settings.mediaProviderId || 'auto',
            preferSubtitle: settings.mediaPreferSubtitle !== false,
            extractKeyframes: settings.mediaExtractKeyframes === true,
            keyframeLimit: settings.mediaKeyframeLimit || 12,
            sidecarCandidates: registration.sidecarCandidates || [],
          })
          item.mediaRunId = run?.id || ''
        }
      } catch (error) {
        item.mediaRegistrationError = error?.code || error?.message || 'MEDIA_REGISTER_FAILED'
        console.warn('[AgentService] Failed to register media context:', item.name || item.path, error.message)
      }
    }
    return items
  }

  _allowedMediaIdsFromRequest(request = {}, fallbackContext = {}) {
    const candidates = new Set()
    const add = (value) => {
      const id = String(value || '').trim()
      if (/^med_[a-z0-9]+$/i.test(id)) candidates.add(id)
    }
    const inspectItems = (items) => {
      for (const item of (Array.isArray(items) ? items : [])) {
        add(item?.mediaId || item?.media_id)
        add(item?.meta?.mediaId || item?.meta?.media_id)
        add(item?.metadata?.mediaId || item?.metadata?.media_id)
      }
    }
    for (const id of (request.allowedMediaIds || fallbackContext.allowedMediaIds || [])) add(id)
    inspectItems(request.ctxItems)
    inspectItems(request.ctxPaths)
    inspectItems(fallbackContext.ctxItems)
    inspectItems(fallbackContext.ctxPaths)
    for (const message of (request.messages || [])) {
      inspectItems(_messageAttachments(message))
      inspectItems(message?.meta?.ctx)
    }

    const mediaRepository = this._db?.mediaRepositories?.media
    if (!mediaRepository) return []
    return [...candidates].filter((mediaId) => {
      if (!mediaRepository.getMediaSource(mediaId)) return false
      return mediaRepository.listMediaSourceLinks(mediaId, { state: 'active' }).length > 0
    })
  }

  // ── Model Factory ────────────────────────────────────────────

  _isAnthropicFormat(providerId, apiFormat = '') {
    return this._normalizeApiFormat(providerId, apiFormat) === 'anthropic'
  }

  _normalizeApiFormat(providerId, apiFormat = '') {
    const value = String(apiFormat || '').trim().toLowerCase()
    if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) return 'openai_responses'
    if (value === 'anthropic') return 'anthropic'
    if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) return 'openai'
    return String(providerId || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
  }

  _normalizeThinkingMode(mode) {
    const value = String(mode || 'auto').toLowerCase()
    if (value === 'off') return 'disabled'
    if (value === 'on') return 'enabled'
    return ['auto', 'enabled', 'disabled'].includes(value) ? value : 'auto'
  }

  _resolveThinkingIntensity(intensity, fallback = 'medium') {
    const value = String(intensity || fallback).toLowerCase()
    return ['low', 'medium', 'high'].includes(value) ? value : fallback
  }

  _openAIReasoningEffort(providerId, modelName, options = {}) {
    const mode = this._normalizeThinkingMode(options.thinkingMode)
    if (mode === 'disabled') return ''
    const model = String(modelName || '').toLowerCase()
    const isOpenAI = String(providerId || '').toLowerCase() === 'openai'
    const isReasoningModel = /^(o\d|gpt-5)/.test(model)
    if (!isOpenAI || (mode === 'auto' && !isReasoningModel)) return ''
    return this._resolveThinkingIntensity(options.thinkingIntensity)
  }

  _deepSeekThinkingParams(providerId, modelName, options = {}) {
    const id = String(providerId || '').toLowerCase()
    const model = String(modelName || '').toLowerCase()
    if (id !== 'deepseek' && !(id === 'official' && model.startsWith('deepseek-'))) return null

    const mode = this._normalizeThinkingMode(options.thinkingMode)
    const params = {}
    if (mode === 'enabled' || mode === 'disabled') {
      params.thinking = { type: mode }
    }
    if (mode === 'enabled') {
      const intensity = this._resolveThinkingIntensity(options.thinkingIntensity)
      params.reasoning_effort = intensity
    }
    return Object.keys(params).length ? params : null
  }

  _createModel(providerId, apiKey, baseUrl, modelName, options = {}) {
    const common = { apiKey, model: modelName, maxRetries: 1 }
    if (options.temperature !== undefined) common.temperature = options.temperature
    if (options.maxTokens) common.maxTokens = options.maxTokens
    if (options.topP !== undefined) common.topP = options.topP

    if (this._isAnthropicFormat(providerId, options.apiFormat)) {
      const anthropicApiUrl = normalizeAnthropicApiUrl(baseUrl)
      const anthropicOpts = { ...common, timeout: 180000 }
      if (options.streaming === true) anthropicOpts.streaming = true
      if (options.disableStreaming === true) anthropicOpts.disableStreaming = true
      if (anthropicApiUrl) anthropicOpts.anthropicApiUrl = anthropicApiUrl
      if (this._normalizeThinkingMode(options.thinkingMode) === 'enabled') {
        const budgetMap = { low: 2000, medium: 10000, high: 32000 }
        anthropicOpts.thinking = {
          type: 'enabled',
          budget_tokens: budgetMap[this._resolveThinkingIntensity(options.thinkingIntensity)] || 10000,
        }
      }
      return new ChatAnthropic(anthropicOpts)
    }

    // OpenAI-compatible providers: choose the API surface explicitly from provider.apiFormat.
    const openaiOpts = { ...common, timeout: 180000 }
    if (options.streaming === true) openaiOpts.streaming = true
    if (options.disableStreaming === true) openaiOpts.disableStreaming = true
    if (baseUrl) {
      openaiOpts.configuration = { baseURL: baseUrl }
    }
    const deepSeekThinkingParams = this._deepSeekThinkingParams(providerId, modelName, options)
    if (deepSeekThinkingParams) openaiOpts.modelKwargs = { ...(openaiOpts.modelKwargs || {}), ...deepSeekThinkingParams }
    const reasoningEffort = options.reasoningEffort || this._openAIReasoningEffort(providerId, modelName, options)
    if (reasoningEffort) openaiOpts.reasoningEffort = reasoningEffort
    const ChatModel = this._normalizeApiFormat(providerId, options.apiFormat) === 'openai_responses'
      ? ChatOpenAIResponsesCompat
      : ChatOpenAICompletions
    return new ChatModel(openaiOpts)
  }

  _visionContextFromRequest(request = {}) {
    const fallback = request.visionModel || request.defaultVisionModel || null
    const defaultModel = fallback?.modelHasVision && fallback.providerId && fallback.model
      ? {
          modelHasVision: true,
          providerId: fallback.providerId || '',
          apiKey: fallback.apiKey || '',
          baseUrl: fallback.baseUrl || '',
          apiFormat: fallback.apiFormat || '',
          model: fallback.model || '',
        }
      : null
    const modelHasVision = !!request.modelHasVision
    const currentAvailable = modelHasVision && !!request.providerId && !!request.model
    return {
      modelHasVision,
      providerId: request.providerId || '',
      apiKey: request.apiKey || '',
      baseUrl: request.baseUrl || '',
      apiFormat: request.apiFormat || '',
      model: request.model || '',
      defaultModel,
      visionAvailable: currentAvailable || !!defaultModel,
    }
  }

  _visionToolOptionsFromRequest(request = {}) {
    const vision = this._visionContextFromRequest(request)
    return {
      modelHasVision: vision.modelHasVision,
      visionAvailable: vision.visionAvailable,
    }
  }

  // ── DeepAgents Config Builders ────────────────────────────────

  /**
   * Build DeepAgents subagents array from agent config
   */
  _buildSubagentTools(toolIds, allTools, skillIds = [], cloudContext = {}, options = {}) {
    const requestedIds = this._withSkillTools(toolIds, skillIds)
    if (!requestedIds.length) return allTools

    const effectiveIds = filterWebSearchTools(
      withContextualAgentTools(requestedIds, cloudContext, {
        modelHasVision: !!options.modelHasVision,
        visionAvailable: !!(options.visionAvailable ?? options.modelHasVision),
      }),
      options.webSearchEnabled !== false,
    )
    const tools = this._buildLocalRuntimeTools(effectiveIds, { includeDefaults: false })
    const mcpIds = effectiveIds.filter(id => typeof id === 'string' && id.startsWith('mcp:'))

    if (!mcpIds.length) return tools

    const wantServers = new Set()
    const wantTools = new Set()
    for (const id of mcpIds) {
      const parts = id.split(':')
      if (parts.length === 2) wantServers.add(parts[1])
      else if (parts.length >= 3) wantTools.add(`${parts[1]}:${parts.slice(2).join(':')}`)
    }

    const mcpTools = (allTools || []).filter(t =>
      t?._mcp_server_id && (
        wantServers.has(t._mcp_server_id) ||
        wantTools.has(`${t._mcp_server_id}:${t._mcp_tool_name}`)
      )
    )

    return [...tools, ...mcpTools]
  }

  _listEnabledCustomToolRows() {
    try {
      return (this._db?.listTools?.() || []).filter(t => t?.enabled !== false && t?.enabled !== 0)
    } catch {
      return []
    }
  }

  _normalizeSkillId(skillId) {
    return String(skillId || '')
      .replace(/\\/g, '/')
      .replace(/^\/?skills\//i, '')
      .replace(/\/+$/, '')
      .trim()
  }

  _readJsonIfExists(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  _builtinSkillConfigPath(skillId) {
    const electronDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'skills', skillId, 'config.json') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'builtin-assets', 'skills', skillId, 'config.json') : '',
      path.join(electronDir, 'builtin-assets', 'skills', skillId, 'config.json'),
    ].filter(Boolean)
    return candidates.find(p => fs.existsSync(p)) || ''
  }

  _skillAllowedTools(skillIds) {
    const ids = [...new Set((skillIds || []).map(id => this._normalizeSkillId(id)).filter(Boolean))]
    if (!ids.length) return []

    let dbSkills = []
    try {
      dbSkills = this._db?.listSkills?.() || []
    } catch {
      dbSkills = []
    }

    const workRoot = this._workDirService?.getRootPath?.() || ''
    const allowed = []
    for (const skillId of ids) {
      const workspaceConfig = workRoot
        ? this._readJsonIfExists(path.join(workRoot, 'skills', skillId, 'config.json'))
        : null
      const dbSkill = dbSkills.find(s => this._normalizeSkillId(s?.id) === skillId)
      const builtinConfig = this._readJsonIfExists(this._builtinSkillConfigPath(skillId))
      const sources = [workspaceConfig, dbSkill, builtinConfig]

      for (const source of sources) {
        const tools = source?.allowedTools || source?.allowed_tools
        if (Array.isArray(tools)) allowed.push(...tools.filter(Boolean))
      }
    }
    return [...new Set(allowed.map(String))]
  }

  _withSkillTools(toolIds, skillIds) {
    return [...new Set([...(toolIds || []), ...this._skillAllowedTools(skillIds)].filter(Boolean))]
  }

  _buildLocalRuntimeTools(toolIds, { includeDefaults = true, modelHasVision = false, visionAvailable = modelHasVision } = {}) {
    const effectiveIds = includeDefaults ? withDefaultAgentTools(toolIds, { modelHasVision, visionAvailable }) : (toolIds || [])
    const builtinTools = effectiveIds.length ? getLangchainTools(effectiveIds) : []
    const userTools = getUserDefinedLangchainTools(effectiveIds, this._listEnabledCustomToolRows())
    return [...builtinTools, ...userTools]
  }

  _buildSubagents(subAgentConfigs, allTools, request) {
    if (!subAgentConfigs?.length) return undefined

    const webSearchEnabled = request?.params?.enableWebSearch !== false && request?.params?.enable_web_search !== false
    return subAgentConfigs.map(sa => {
      const saRequestedTools = this._withSkillTools(sa.tools || [], sa.skills || [])
      const saTools = saRequestedTools.length
        ? this._buildSubagentTools(sa.tools, allTools, sa.skills, request.cloudContext, { webSearchEnabled, ...this._visionToolOptionsFromRequest(request) })
        : allTools // inherit parent tools if not specified

      const subConfig = {
        name: sa.name,
        description: sa.description,
        systemPrompt: sa.systemPrompt || '',
        tools: saTools,
        middleware: [createFilesystemToolArgumentAliasMiddleware(), createDeepAgentsBuiltinToolExclusionMiddleware(), ...(sa.middleware || [])],
      }

      // Determine model for this subagent
      let saModelId = sa.model

      // Visual reviewer gets reviewer model when configured
      if (sa.name === 'visual-reviewer' && request.reviewerModel) {
        saModelId = request.reviewerModel
      } else if (!saModelId) {
        // Subagents inherit the parent executor model unless explicitly configured.
        saModelId = request.model
      }

      if (saModelId) {
        subConfig.model = this._createModel(
          request.providerId,
          request.apiKey,
          request.baseUrl,
          saModelId,
          {
            temperature: request.temperature,
            maxTokens: request.maxTokens || 4096,
            thinkingMode: request.thinkingMode,
            thinkingIntensity: request.thinkingIntensity,
            apiFormat: request.apiFormat,
          },
        )
      }

      return subConfig
    })
  }

  _withGeneralPurposeSubagent(subagents, { model, tools, skills } = {}) {
    const list = Array.isArray(subagents) ? [...subagents] : []
    if (list.some(sa => sa?.name === GENERAL_PURPOSE_SUBAGENT.name)) return list
    list.unshift({
      ...GENERAL_PURPOSE_SUBAGENT,
      model,
      tools,
      skills,
      middleware: [createFilesystemToolArgumentAliasMiddleware(), createDeepAgentsBuiltinToolExclusionMiddleware()],
    })
    return list
  }

  _getBuiltinModule(englishName) {
    return this._builtinModules?.find(m => m.english_name === englishName) || null
  }

  _findSubAgentMeta(name, subAgentRows = null) {
    const target = normalizeSubagentKey(name)
    if (!target) return null
    const rows = subAgentRows || this._db.listSubAgents?.() || []
    const reversed = [...rows].reverse()
    return reversed.find(sa => normalizeSubagentKey(sa?.id) === target) ||
      reversed.find(sa => normalizeSubagentKey(sa?.runtimeName) === target) ||
      reversed.find(sa => normalizeSubagentKey(sa?.name) === target) ||
      null
  }

  _descriptionFromPrompt(prompt, fallback) {
    const line = String(prompt || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .find(s => s && !s.startsWith('#'))
    return (line || `${fallback} 子任务`).slice(0, 160)
  }

  _buildBuiltinTaskSubAgents(moduleConfig) {
    const names = moduleConfig?.sub_agents?.length
      ? moduleConfig.sub_agents
      : Object.keys(moduleConfig?.subagent_prompts || {})
    if (!names.length) return []

    let subAgentRows = []
    try { subAgentRows = this._db.listSubAgents?.() || [] } catch (_) { subAgentRows = [] }

    return names.map(name => {
      const meta = this._findSubAgentMeta(name, subAgentRows)
      const prompt = moduleConfig.subagent_prompts?.[name] || meta?.prompt || ''
      const configuredTools = moduleConfig.subagent_tools?.[name]
      return {
        name,
        description: meta?.description || this._descriptionFromPrompt(prompt, name),
        systemPrompt: prompt,
        tools: Array.isArray(configuredTools) ? configuredTools : (Array.isArray(meta?.tools) ? meta.tools : []),
        model: meta?.model || '',
      }
    })
  }

  async _loadMcpToolsForRun(toolIds = []) {
    const requested = (toolIds || []).filter(id => typeof id === 'string' && id.startsWith('mcp:'))
    if (!this._mcpService || !requested.length) return { tools: [], clients: [] }

    if (typeof this._mcpService.getLazyToolsForRun === 'function') {
      return await this._mcpService.getLazyToolsForRun(requested)
    }

    const mcpResult = await this._mcpService.getActiveTools()
    const clients = mcpResult.clients || []
    const allMcpTools = mcpResult.tools || []
    const wantServers = new Set()
    const wantTools = new Set()
    for (const id of requested) {
      const parts = id.split(':')
      if (parts.length === 2) wantServers.add(parts[1])
      else if (parts.length >= 3) wantTools.add(`${parts[1]}:${parts.slice(2).join(':')}`)
    }

    const tools = allMcpTools.filter(t =>
      wantServers.has(t._mcp_server_id) ||
      wantTools.has(`${t._mcp_server_id}:${t._mcp_tool_name}`)
    )
    return { tools, clients }
  }

  _buildBuiltinTaskUserText({ toolId, topic, params = {}, ctxItems = [] }) {
    const fileNames = (ctxItems || [])
      .map(i => i?.name || i?.path)
      .filter(Boolean)
      .join('、')
    const parts = []

    if (toolId === 'ppt') {
      const sceneLabel = { business: '商务汇报', tech: '技术分享', academic: '学术报告', creative: '创意提案', education: '教学课件', auto: '智能匹配' }
      const fmtLabel = { html: 'HTML 演示文稿', 'pptx-local': 'PPTX 本地导出', 'pptx-cloud': 'PPTX 云端高质量' }
      parts.push('[任务]\n' + (topic || `请根据以下资料生成演示文稿：${fileNames || '用户选择的资料'}`))
      parts.push(`[用户配置]\n场景: ${params.scene || 'auto'}（${sceneLabel[params.scene] || '智能匹配'}）\n输出格式: ${params.format || 'html'}（${fmtLabel[params.format] || 'HTML 演示文稿'}）\n页数: ${params.pages || 12}`)
      parts.push('[产物要求]\n按实际生成结果写入输出目录。可能只有 HTML、只有 PPTX，或同时包含 HTML/PPTX/PNG，不要假设某一种文件一定存在。')
    } else if (toolId === 'research') {
      parts.push('[研究要求]\n' + (topic || `请对以下资料进行深度研究分析：${fileNames || '用户选择的资料'}`))
      parts.push('[产物要求]\n同时生成 Markdown 研究报告和 HTML 可视化报告，分别写入深度研究输出目录。')
    } else {
      parts.push(topic || '请基于用户资料完成任务')
    }

    const webSearchEnabled = params.enableWebSearch !== false && params.enable_web_search !== false
    parts.push(webSearchEnabled
      ? '[联网搜索]\n本次已启用联网搜索。需要外部资料、最新信息或来源交叉验证时，使用当前已配置且可用的联网搜索、网页读取或公开来源检索工具；优先选择高质量、可核验来源，只有确有必要阅读全文时才读取网页原文。'
      : '[联网搜索]\n本次未启用联网搜索。禁止调用任何联网搜索、网页读取、浏览、爬取类工具；深度研究任务不要委托 web-researcher 子 agent。只使用用户选择的本地资料、知识库检索结果和模型已有常识，并在信息不足时说明限制。')
    return parts.join('\n\n')
  }

  async runBuiltinTask(request) {
    const startTime = Date.now()
    const runId = request.runId || `task_${request.taskId || crypto.randomUUID()}`
    const abortController = request.abortController || new AbortController()
    const onProgress = typeof request.onProgress === 'function' ? request.onProgress : () => {}
    let workRoot = ''
    let mcpClients = []
    let hardTimeout = null

    const agentEnglishName = request.agentEnglishName
    const moduleConfig = this._getBuiltinModule(agentEnglishName)
    if (!moduleConfig) throw new Error(`内置 agent 未就绪: ${agentEnglishName}`)

    this._activeRuns.set(runId, { abortController, request })

    try {
      onProgress(18, '准备上下文...')
      setToolProviderConfig(request.toolProviderConfigs || {})
      const agentDirName = this._agentRuntimeDirName(request.agentId || moduleConfig.id, agentEnglishName)
      const visionOptions = this._visionToolOptionsFromRequest(request)
      const allowedMediaIds = this._allowedMediaIdsFromRequest(request)
      setToolRunContext({ agentEnglishName: agentDirName, permissions: moduleConfig.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: moduleConfig.skills || [], allowedMediaIds, vision: this._visionContextFromRequest(request) })
      setExecCommandConfig({
        whitelist: moduleConfig.permissions?.execCommandWhitelist || null,
        blacklist: moduleConfig.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxItems || request.ctxPaths || [], workRoot)
      await this._registerPreparedMediaContextItems(preparedCtxPaths, request)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: moduleConfig.temperature ?? 0.4,
          maxTokens: moduleConfig.max_tokens || request.maxTokens || 8192,
          topP: request.topP,
          thinkingMode: moduleConfig.thinking_mode || request.thinkingMode,
          thinkingIntensity: moduleConfig.thinking_intensity || request.thinkingIntensity,
          streaming: false,
          apiFormat: request.apiFormat,
        },
      )

      onProgress(28, '加载技能和工具...')
      const skillData = this._buildSkillsPaths(moduleConfig.skills || [])
      const memoryDirName = agentDirName
      let systemPrompt = moduleConfig.prompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, agentDirName, skillData.info, request.answerStyle, memoryDirName, request.cloudContext, visionOptions)

      const agentDir = path.join(workRoot, 'agents', agentDirName)
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(path.join(agentDir, 'AGENT.md'), systemPrompt, 'utf-8')
      fs.writeFileSync(path.join(agentDir, 'skills.json'), JSON.stringify(moduleConfig.skills || [], null, 2), 'utf-8')

      const subAgentConfigs = this._buildBuiltinTaskSubAgents(moduleConfig)
      const allToolIds = [...new Set([
        ...(moduleConfig.tools || []),
        ...subAgentConfigs.flatMap(sa => Array.isArray(sa.tools) ? sa.tools : []),
      ].filter(Boolean))]

      const webSearchEnabled = request.params?.enableWebSearch !== false && request.params?.enable_web_search !== false
      const effectiveToolIds = filterWebSearchTools(withContextualAgentTools(withPermissionAgentTools(this._withSkillTools(allToolIds, [
        ...(moduleConfig.skills || []),
        ...subAgentConfigs.flatMap(sa => Array.isArray(sa.skills) ? sa.skills : []),
      ]), moduleConfig.permissions), request.cloudContext, visionOptions), webSearchEnabled)
      const preparedAllowedMediaIds = this._allowedMediaIdsFromRequest({ ...request, ctxPaths: preparedCtxPaths })
      setToolRunContext({ agentEnglishName: agentDirName, permissions: moduleConfig.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: skillData.boundSkillIds, toolIds: effectiveToolIds, allowedMediaIds: preparedAllowedMediaIds, vision: this._visionContextFromRequest(request) })
      const customTools = this._buildLocalRuntimeTools(effectiveToolIds, { includeDefaults: false })
      resetTaskCounters()

      let mcp = { tools: [], clients: [] }
      try {
        mcp = await this._loadMcpToolsForRun(effectiveToolIds)
        mcpClients = mcp.clients || []
        if (mcp.tools?.length) console.log('[AgentService] Builtin task MCP tools loaded:', mcp.tools.map(t => `${t._mcp_server_id}/${t._mcp_tool_name}`))
      } catch (err) {
        console.error('[AgentService] Builtin task MCP getActiveTools failed:', err.message)
      }

      const allCustomTools = [...customTools, ...(mcp.tools || [])]

      const subagents = this._buildSubagents(subAgentConfigs, allCustomTools, {
        ...request,
        providerId: request.providerId,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        model: request.model,
        temperature: moduleConfig.temperature ?? 0.4,
        maxTokens: moduleConfig.max_tokens || 8192,
      })
      const runtimeSubagents = this._withGeneralPurposeSubagent(subagents, {
        model,
        tools: allCustomTools,
        skills: skillData.paths,
      })

      onProgress(42, runtimeSubagents?.length ? `已加载 ${runtimeSubagents.length} 个子智能体` : '准备执行...')
      const interruptOn = this._buildInterruptOn(moduleConfig.permissions)
      this._injectSemanticMemories(workRoot)
      const memory = this._buildMemoryPaths({ agentId: request.agentId || moduleConfig.id, agentEnglishName })
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: skillData.boundSkillIds,
        allowedAgentMemoryDir: memoryDirName,
        agentDirName,
        wikiContext: request.wikiContext || {},
      })

      const agent = createDeepAgent({
        model,
        tools: allCustomTools,
        systemPrompt,
        subagents: runtimeSubagents,
        interruptOn,
        skills: skillData.paths,
        memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: agentEnglishName || moduleConfig.id || 'builtin-task-agent',
        middleware: buildMiddleware({
          toolCallLimit: moduleConfig.tool_call_limit || request.toolCallLimit,
          modelCallLimit: moduleConfig.model_call_limit || request.modelCallLimit,
          subagentNames: subagents?.map(s => s.name) || [],
        }),
      })

      const userText = request.userText || this._buildBuiltinTaskUserText({
        toolId: request.toolId,
        topic: request.topic,
        params: request.params,
        ctxItems: request.ctxItems || request.ctxPaths || [],
      })

      const preparedMessages = this._prepareMessageAttachments(
        [{ role: 'user', content: userText, attachments: request.ctxItems || request.ctxPaths || [] }],
        workRoot,
        preparedCtxPaths,
      )
      const plainMessages = toLangchainMessages(_attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      ))

      let streamProgress = 48
      const bump = (message, delta = 3) => {
        streamProgress = Math.min(90, streamProgress + delta)
        onProgress(streamProgress, message)
      }
      const sendFn = (chunk) => {
        if (chunk?.type === 'subagent_start') bump(`委托 ${chunk.name || '子智能体'}...`, 4)
        else if (chunk?.type === 'subagent_end') bump(`${chunk.name || '子智能体'} 已完成`, 3)
        else if (chunk?.type === 'tool_start') bump(`调用工具 ${chunk.toolName || ''}...`, 2)
        else if (chunk?.type === 'content') bump('整理最终结果...', 1)
        else if (chunk?.type === 'todos') bump('更新任务计划...', 1)
      }

      hardTimeout = setTimeout(() => abortController.abort(), moduleConfig.hard_timeout_ms || 600000)
      onProgress(50, '智能体执行中...')
      const result = await iterateDeepStream(
        agent,
        { messages: plainMessages },
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(moduleConfig.max_iterations),
        },
        sendFn,
        'task',
      )

      if (hardTimeout) clearTimeout(hardTimeout)
      hardTimeout = null
      if (abortController.signal.aborted) throw new Error('ABORTED')

      const { totalUsage } = result
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost
      this._tokenRecorder.record({
        providerId: request.providerId,
        modelId: request.model,
        usage: totalUsage,
        cost,
        latencyMs,
        agentId: agentEnglishName || moduleConfig.id || '',
        conversationId: request.conversationId || '',
        runId,
        iteration: 1,
      })

      onProgress(94, '扫描生成产物...')
      const artifacts = await this._registerArtifacts({
        conversationId: request.conversationId || '',
        groupId: request.groupId || 'default',
        agentEnglishName,
        agentDirName,
        workRoot,
        runStartTime: startTime,
      })

      return { ...result, runId, latencyMs, cost, artifacts }
    } finally {
      if (hardTimeout) clearTimeout(hardTimeout)
      this._activeRuns.delete(runId)
      this._removeInjectedMemories(workRoot)
      if (this._mcpService && mcpClients?.length) {
        await this._mcpService.closeClients(mcpClients)
      }
    }
  }

  /**
   * Build DeepAgents interruptOn config from agent permissions
   * Destructive or system-level tools require human approval.
   * File write/edit permissions mean the agent is already allowed to write inside the sandbox.
   */
  _buildInterruptOn(permissions) {
    if (!permissions) return undefined
    const interruptOn = {}

    // Keep HITL only for sensitive actions. write_file/edit_file are governed by agent permissions and workspace sandboxing.
    if (permissions.execCommand) {
      interruptOn.exec_command = { allowedDecisions: ['approve', 'reject'] }
      interruptOn.execute = { allowedDecisions: ['approve', 'reject'] }
      for (const name of HIDDEN_COMMAND_COMPATIBILITY_TOOL_NAMES) {
        interruptOn[name] = { allowedDecisions: ['approve', 'reject'] }
      }
    }
    if (permissions.fileDelete) interruptOn.delete_file = { allowedDecisions: ['approve', 'reject'] }

    return Object.keys(interruptOn).length ? interruptOn : undefined
  }

  /**
   * Build DeepAgents skills source path — global skills directory only
   * Skills are installed once at {workRoot}/skills/{skillId}/ and shared across agents
   * Isolation is enforced by AgentScopedBackend filtering /skills/ to boundSkillIds.
   * Returns { paths: string[], info: { id, name, desc }[], boundSkillIds: string[] }
   */
  _buildSkillsPaths(skillIds) {
    const normalizedSkillIds = [...new Set((skillIds || []).map(id => this._normalizeSkillId(id)).filter(Boolean))]
    if (!normalizedSkillIds.length) return { paths: undefined, info: [], boundSkillIds: [] }
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return { paths: undefined, info: [], boundSkillIds: [] }

    const globalSkillsDir = path.join(workRoot, 'skills')
    if (!fs.existsSync(globalSkillsDir)) {
      fs.mkdirSync(globalSkillsDir, { recursive: true })
    }

    const skillInfo = []
    const boundSkillIds = []
    for (const skillId of normalizedSkillIds) {
      const skillDir = path.join(globalSkillsDir, skillId)
      const skillFile = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        boundSkillIds.push(skillId)
        let skillName = skillId
        let skillDesc = ''
        try {
          const skillContent = fs.readFileSync(skillFile, 'utf-8')
          const meta = parseSkillFrontmatterSummary(skillContent)
          skillName = String(meta.name || skillId).trim()
          skillDesc = String(meta.description || '').trim()
          if (!skillDesc) {
            const titleMatch = skillContent.split(/\r?\n/).find(line => /^#\s+/.test(line))?.match(/^#\s+(.+)/)
            if (titleMatch) skillName = titleMatch[1].trim()
          }
        } catch { /* fallback to skillId */ }
        skillInfo.push({ id: skillId, name: skillName, desc: skillDesc || `路径: /skills/${skillId}/`, path: `/skills/${skillId}/` })
        console.log('[AgentService] Skill found:', skillId, '→', skillName)
      } else {
        console.warn('[AgentService] Skill not found:', skillId)
      }
    }

    return { paths: boundSkillIds.length ? ['/skills/'] : undefined, info: skillInfo, boundSkillIds }
  }

  /**
   * Build DeepAgents memory paths — per-agent isolated memory
   * Each agent gets its own memory at {workRoot}/agents/{englishName}/memory/AGENTS.md
   * Falls back to agentId/_shared when englishName is unavailable
   */
  _safeAgentDirName(value) {
    const safe = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    return safe || '_shared'
  }

  _agentRuntimeDirName(agentId, agentEnglishName) {
    const id = String(agentId || '').trim()
    const englishName = String(agentEnglishName || '').trim()
    // Built-in asset ids such as computer-network-agent are the stable routing key.
    // Legacy built-ins use ids like agent_researcher, so keep their english_name directories.
    if (id && !/^agent_/i.test(id)) return this._safeAgentDirName(id)
    if (englishName) return this._safeAgentDirName(englishName)
    return this._safeAgentDirName(id || '_shared')
  }

  _agentMemoryDirName(agentId, agentEnglishName) {
    return this._agentRuntimeDirName(agentId, agentEnglishName)
  }

  _buildMemoryPaths(agentRef = {}) {
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return undefined
    const agentId = typeof agentRef === 'object' ? agentRef.agentId : ''
    const agentEnglishName = typeof agentRef === 'object' ? agentRef.agentEnglishName : agentRef

    // 1. Global shared memory — all agents can read/write
    const globalMemDir = path.join(workRoot, 'memories')
    if (!fs.existsSync(globalMemDir)) fs.mkdirSync(globalMemDir, { recursive: true })
    const globalMd = path.join(globalMemDir, 'AGENTS.md')
    if (!fs.existsSync(globalMd)) {
      fs.writeFileSync(globalMd, '# Global Memory\n\n## 全局规则\n\n## 全局偏好\n\n', 'utf-8')
    }

    // 2. Per-agent private memory — only this agent can access
    const agentDirName = this._agentMemoryDirName(agentId, agentEnglishName)
    const agentMemDir = path.join(workRoot, 'agents', agentDirName, 'memory')
    if (!fs.existsSync(agentMemDir)) fs.mkdirSync(agentMemDir, { recursive: true })
    const agentMd = path.join(agentMemDir, 'AGENTS.md')
    if (!fs.existsSync(agentMd)) {
      fs.writeFileSync(agentMd, '# Agent Context\n\n## Preferences\n\n## Facts\n\n', 'utf-8')
    }

    const paths = [
      '/memories/AGENTS.md',                        // Global shared (all agents)
      `/agents/${agentDirName}/memory/AGENTS.md`,   // Per-agent private
    ]

    return paths
  }

  // ── Memory Injection: DB semantic memories → AGENTS.md ──────────

  _injectSemanticMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return

    // Read semantic memories from DB
    const rows = this._db.listMemories?.() || []
    const semanticRows = rows.filter(r => r.type === 'semantic')
    if (!semanticRows.length) return

    let content = fs.readFileSync(globalMd, 'utf-8')

    // Remove any existing injected block
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx !== -1) {
      const endIdx = content.indexOf(endTag, startIdx)
      if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      }
    }

    // Build injection block
    const items = semanticRows.map(r => `- ${r.content}`).join('\n')
    const block = `\n\n${startTag}\n## 用户语义记忆\n\n${items}\n${endTag}\n`

    fs.writeFileSync(globalMd, content.trimEnd() + block, 'utf-8')
  }

  _removeInjectedMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return

    let content = fs.readFileSync(globalMd, 'utf-8')
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx === -1) return

    const endIdx = content.indexOf(endTag, startIdx)
    if (endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      fs.writeFileSync(globalMd, content.trimEnd() + '\n', 'utf-8')
    }
  }

  // ── Agent Run Handler ────────────────────────────────────────

  async handleStartRun(request) {
    const startTime = Date.now()
    const runId = request.runId || crypto.randomUUID()
    const abortController = new AbortController()
    const msgId = request.msgId

    if (!msgId) {
      this._send('agent:runError', { runId, error: { message: 'Missing message ID', code: 'INVALID_REQUEST' } })
      return
    }

    this._activeRuns.set(runId, { abortController, msgId, request })

    this._runStateManager.create({
      id: runId,
      conversation_id: request.conversationId || '',
      agent_id: request.agentId || '',
      status: 'running',
      max_iterations: normalizeNonNegativeLimit(request.maxIterations, 10),
    })

    this._db.updateMsg(msgId, {
      status: 'streaming',
      model_id: request.model || '',
      provider_id: request.providerId || '',
    })

    this._send('agent:runStarted', { runId, msgId, conversationId: request.conversationId })

    let workRoot = ''
    let mcpClients = []
    const agentDirName = this._agentRuntimeDirName(request.agentId, request.agentEnglishName)

    try {
      // Set tool provider config (for web_search Tavily/SearXNG/Bing per-agent config)
      setToolProviderConfig(request.toolProviderConfigs || {})
      const visionOptions = this._visionToolOptionsFromRequest(request)
      const allowedMediaIds = this._allowedMediaIdsFromRequest(request)
      setToolRunContext({ agentEnglishName: agentDirName, permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || [], allowedMediaIds, vision: this._visionContextFromRequest(request) })
      setExecCommandConfig({
        whitelist: request.permissions?.execCommandWhitelist || null,
        blacklist: request.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      // Prepare context files: workspace docs keep their absolute paths; external attachments are staged under /context/YYYY-MM-DD/.
      workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxPaths || [], workRoot)
      await this._registerPreparedMediaContextItems(preparedCtxPaths, request)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens || 4096,
          topP: request.topP,
          thinkingMode: request.thinkingMode,
          thinkingIntensity: request.thinkingIntensity,
          apiFormat: request.apiFormat,
        },
      )
      console.log('[AgentService] Model created:', model.constructor.name,
        'provider:', request.providerId,
        'model:', request.model,
        'baseUrl:', request.baseUrl,
        'apiKey:', request.apiKey ? '(set, length:' + request.apiKey.length + ')' : '(empty)')

      // Build skills paths (global only — agents reference, not copy)
      const skillData = this._buildSkillsPaths(request.skills)
      console.log('[AgentService] Skills:', skillData.paths || 'none')

      // Renderer sends agent.prompt as systemPrompt; main process injects project rules + context paths + skills
      const memoryDirName = agentDirName
      let systemPrompt = request.systemPrompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, agentDirName, skillData.info, request.answerStyle, memoryDirName, request.cloudContext, visionOptions)

      // Write per-agent runtime files (AGENT.md, skills.json) to agent sandbox directory
      const agentDir = path.join(workRoot, 'agents', agentDirName)
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(path.join(agentDir, 'AGENT.md'), systemPrompt, 'utf-8')
      fs.writeFileSync(path.join(agentDir, 'skills.json'), JSON.stringify(request.skills || [], null, 2), 'utf-8')
      console.log('[AgentService] Wrote agent runtime files to:', agentDir)

      const subAgentToolIds = (request.subAgents || [])
        .filter(sa => sa && typeof sa === 'object')
        .flatMap(sa => Array.isArray(sa.tools) ? sa.tools : [])
      const subAgentSkillIds = (request.subAgents || [])
        .filter(sa => sa && typeof sa === 'object')
        .flatMap(sa => Array.isArray(sa.skills) ? sa.skills : [])
      const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(this._withSkillTools([
        ...(request.toolIds || []),
        ...subAgentToolIds,
      ], [
        ...(request.skills || []),
        ...subAgentSkillIds,
      ]), request.permissions), request.cloudContext, visionOptions)
      const preparedAllowedMediaIds = this._allowedMediaIdsFromRequest({ ...request, ctxPaths: preparedCtxPaths })
      setToolRunContext({ agentEnglishName: agentDirName, permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: skillData.boundSkillIds, toolIds: effectiveToolIds, allowedMediaIds: preparedAllowedMediaIds, vision: this._visionContextFromRequest(request) })
      const customTools = this._buildLocalRuntimeTools(effectiveToolIds, { includeDefaults: false })
      resetTaskCounters()
      console.log('[AgentService] Tools loaded:', customTools.map(t => t.name))

      // Build MCP tools lazily from synced caches. The proxy connects only when invoked.
      // agent.toolIds entries shaped like:
      //   `mcp:{serverId}`              ← server-level binding, includes every non-disabled tool from that server
      //   `mcp:{serverId}:{toolName}`   ← legacy per-tool entries from earlier versions, still honored for back-compat
      let mcpTools = []
      try {
        const mcpResult = await this._loadMcpToolsForRun(effectiveToolIds)
        mcpClients = mcpResult.clients || []
        mcpTools = mcpResult.tools || []
        if (mcpTools.length) console.log('[AgentService] MCP tools loaded:', mcpTools.map(t => `${t._mcp_server_id}/${t._mcp_tool_name}${t._mcp_lazy ? ':lazy' : ''}`))
      } catch (err) {
        console.error('[AgentService] MCP tool preparation failed:', err.message)
      }
      const allCustomTools = [...customTools, ...mcpTools]

      // Build DeepAgents subagents config
      const subagents = this._buildSubagents(request.subAgents, allCustomTools, request)
      const runtimeSubagents = this._withGeneralPurposeSubagent(subagents, {
        model,
        tools: allCustomTools,
        skills: skillData.paths,
      })
      console.log('[AgentService] Subagents:', runtimeSubagents?.map(s => s.name) || 'none')

      // Build interruptOn from permissions
      const interruptOn = this._buildInterruptOn(request.permissions)
      console.log('[AgentService] InterruptOn:', interruptOn || 'none')

      // Inject DB semantic memories into global AGENTS.md
      this._injectSemanticMemories(workRoot)

      // Build memory paths (per-agent isolated)
      const memory = this._buildMemoryPaths({ agentId: request.agentId, agentEnglishName: request.agentEnglishName })

      // Build backend: AgentScopedBackend restricts file tools by VFS policy.
      // DeepAgents expects POSIX-style rootDir (forward slashes) for virtualMode path resolution
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: skillData.boundSkillIds,
        allowedAgentMemoryDir: memoryDirName,
        agentDirName,
        wikiContext: request.wikiContext || {},
      })

      // Create DeepAgent — createDeepAgent is synchronous
      console.log('[AgentService] Creating DeepAgent...')
      const agent = createDeepAgent({
        model,
        tools: allCustomTools,
        systemPrompt,
        subagents: runtimeSubagents,
        interruptOn,
        skills: skillData.paths,
        memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: request.agentEnglishName || request.agentId || 'reviva-agent',
        middleware: buildMiddleware({
          toolCallLimit: request.toolCallLimit,
          modelCallLimit: request.modelCallLimit,
          subagentNames: subagents?.map(s => s.name) || [],
        }),
      })
      console.log('[AgentService] DeepAgent created, starting stream...')

      const preparedMessages = this._prepareMessageAttachments(
        toPlainMessages(request.messages || []),
        workRoot,
        preparedCtxPaths,
      )
      const plainMessages = toLangchainMessages(_attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      ))

      // Hard timeout — document/research generation agents get 10min, others 5min
      const longRunningAgents = new Set(['deep-researcher', 'lab-report-assistant'])
      const timeoutMs = longRunningAgents.has(request.agentEnglishName) ? 600000 : 300000
      const hardTimeout = setTimeout(() => abortController.abort(), timeoutMs)

      const sendFn = (chunk) => this._send('agent:chunk', { runId, chunk })

      const result = await iterateDeepStream(
        agent,
        { messages: plainMessages },
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(request.maxIterations),
        },
        sendFn,
        'agent',
      )

      clearTimeout(hardTimeout)

      // Check for human-in-the-loop interrupt after streaming completes
      // streamEvents() v3 doesn't return __interrupt__ in result — check agent state
      let interruptDetected = false
      try {
        const state = await agent.getState({ configurable: { thread_id: runId } })
        if (state?.next?.length && state?.tasks?.some(t => t.interrupts?.length)) {
          const interrupts = state.tasks
            .filter(t => t.interrupts?.length)
            .flatMap(t => t.interrupts)

          console.log('[AgentService] Interrupt detected via state:', interrupts)
          const actionRequests = interrupts.map(i => i.value?.actionRequests || []).flat()
          const reviewConfigs = interrupts.map(i => i.value?.reviewConfigs || []).flat()

          if (actionRequests.length) {
            interruptDetected = true

            // Store interrupted run for resume — include initial steps data so resumed run can offset
            this._interruptedRuns.set(runId, {
              runId,
              request,
              agentConfig: { model, tools: allCustomTools, toolIds: effectiveToolIds, systemPrompt, subagents: runtimeSubagents, interruptOn, skills: skillData.paths, boundSkillIds: skillData.boundSkillIds, memory, memoryDirName, agentDirName },
              msgId,
              initialSteps: result.steps,
              initialIteration: result.iteration,
              initialContent: result.fullContent,
              initialThinking: result.thinkingContent,
              initialUsage: result.totalUsage,
              initialTodos: result.todos || [],
              pendingActionRequests: actionRequests,
              pendingReviewConfigs: reviewConfigs,
            })

            this._send('agent:authRequest', {
              requestId: runId,
              actionRequests,
              reviewConfigs,
            })

            // Don't finalize — run is paused
            this._activeRuns.delete(runId)
            return
          }
        }
      } catch (e) {
        console.warn('[AgentService] Could not check interrupt state:', e.message)
      }

      // Legacy: also check result.__interrupt__ if available (non-streaming invoke)
      if (!interruptDetected && result.__interrupt__) {
        console.log('[AgentService] Interrupt detected in result:', result.__interrupt__)
        const interrupts = result.__interrupt__[0]?.value
        if (interrupts) {
          const actionRequests = interrupts.actionRequests || []
          const reviewConfigs = interrupts.reviewConfigs || []

          this._interruptedRuns.set(runId, {
            runId,
            request,
            agentConfig: { model, tools: allCustomTools, systemPrompt, subagents: runtimeSubagents, interruptOn, skills: skillData.paths, boundSkillIds: skillData.boundSkillIds, memory, memoryDirName, agentDirName },
            msgId,
            initialSteps: result.steps,
            initialIteration: result.iteration,
            initialContent: result.fullContent,
            initialThinking: result.thinkingContent,
            initialUsage: result.totalUsage,
            initialTodos: result.todos || [],
            pendingActionRequests: actionRequests,
            pendingReviewConfigs: reviewConfigs,
          })

          this._send('agent:authRequest', {
            requestId: runId,
            actionRequests,
            reviewConfigs,
          })

          this._activeRuns.delete(runId)
          return
        }
      }

      const { fullContent, thinkingContent, totalUsage, steps, recursionHit, todos } = result
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost
      const latencyMs = Date.now() - startTime

      // If recursion limit was hit, treat as cancelled with partial content instead of "completed"
      const finalStatus = recursionHit ? 'cancelled' : 'completed'
      const stopReason = recursionHit ? 'recursion_limit' : 'end_turn'

      this._tokenRecorder.record({
        providerId: request.providerId,
        modelId: request.model,
        usage: totalUsage,
        cost,
        latencyMs,
        agentId: request.agentId,
        conversationId: request.conversationId,
        runId,
        iteration: 1,
      })

      // Build meta for DB persistence (steps, toolCalls) — ensures intermediate process data survives even if renderer update fails
      const stepsMeta = {}
      if (steps?.length) stepsMeta.steps = steps
      if (todos?.length) stepsMeta.todos = todos
      const toolCallsFromSteps = steps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: fullContent,
        thinking_content: thinkingContent,
        status: finalStatus,
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost: totalUsage.cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._runStateManager.update(runId, {
        status: finalStatus,
        iterations: 1,
        total_input_tokens: totalUsage.inputTokens,
        total_output_tokens: totalUsage.outputTokens,
        total_cost: totalUsage.cost,
        completed_at: new Date().toISOString(),
      })

      this._send('agent:runDone', {
        runId,
        content: fullContent,
        thinkingContent,
        usage: totalUsage,
        stopReason,
        steps,
        todos,
        latencyMs,
        cost: totalUsage.cost,
      })

      this._notifyAgentTask(
        recursionHit ? 'failed' : 'done',
        request,
        runId,
        recursionHit ? '迭代次数已达上限，任务中途停止' : '',
      )

      // Register artifacts for builtin 创作中心 agents
      const moduleConfig = this._builtinModules?.find(m => m.english_name === request.agentEnglishName)
      if (moduleConfig) {
        this._registerArtifacts({
          conversationId: request.conversationId,
          agentEnglishName: request.agentEnglishName,
          agentDirName,
          workRoot,
          runStartTime: startTime,
        })
      }

    } catch (err) {
      const isAborted = err.name === 'AbortError' || err.message === 'ABORTED' || abortController.signal.aborted
      console.error('[AgentService] Run error:', err.message, '| aborted:', isAborted, '| code:', err.code || 'none')

      const partialLatencyMs = Date.now() - startTime

      if (isAborted) {
        this._db.updateMsg(msgId, { status: 'cancelled' })
        this._runStateManager.update(runId, { status: 'cancelled', completed_at: new Date().toISOString() })
        this._send('agent:runCancelled', { runId, latencyMs: partialLatencyMs })
      } else {
        const classified = this._errorClassifier.classify(err)
        console.error('[AgentService] Classified error:', classified.code, classified.userMessage)
        this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
        this._runStateManager.update(runId, {
          status: 'error',
          error_code: classified.code,
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        this._send('agent:runError', { runId, error: { message: classified.userMessage, code: classified.code } })
        this._notifyAgentTask('failed', request, runId, classified.userMessage)
      }

    } finally {
      this._activeRuns.delete(runId)
      this._removeInjectedMemories(workRoot)
      // Close MCP clients (HTTP/SSE connections to remote MCP servers)
      if (this._mcpService && mcpClients?.length) {
        await this._mcpService.closeClients(mcpClients)
      }
    }
  }

  handleCancelRun(runId) {
    const run = this._activeRuns.get(runId)
    if (run) run.abortController.abort()
  }

  // ── Human-in-the-Loop: Auth Resume ─────────────────────────────

  async handleAuthRespond(requestId, approved) {
    const startTime = Date.now()
    const interruptedRun = this._interruptedRuns.get(requestId)
    if (!interruptedRun) {
      console.warn('[AgentService] No interrupted run found for:', requestId)
      return { requestId, approved, error: 'No interrupted run found' }
    }

    const { runId, request, agentConfig, msgId, initialSteps, initialIteration, initialContent, initialThinking, initialUsage, initialTodos, pendingActionRequests } = interruptedRun
    this._interruptedRuns.delete(requestId)

    console.log('[AgentService] Resuming interrupted run:', runId, 'approved:', approved)

    let workRoot = ''

    try {
      // Restore tool provider config for resumed run
      setToolProviderConfig(request.toolProviderConfigs || {})
      const agentDirName = agentConfig.agentDirName || this._agentRuntimeDirName(request.agentId, request.agentEnglishName)
      const resumeToolIds = withPermissionAgentTools(agentConfig.toolIds || request.toolIds || [], request.permissions)
      const resumeSkillIds = agentConfig.boundSkillIds || request.skills || []
      const allowedMediaIds = this._allowedMediaIdsFromRequest(request)
      setToolRunContext({ agentEnglishName: agentDirName, permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: resumeSkillIds, toolIds: resumeToolIds, allowedMediaIds, vision: this._visionContextFromRequest(request) })
      setExecCommandConfig({
        whitelist: request.permissions?.execCommandWhitelist || null,
        blacklist: request.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      // Recreate the agent with same config (including backend)
      workRoot = this._workDirService?.getRootPath?.() || ''
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const resumeMemoryDirName = agentConfig.memoryDirName || agentDirName
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: resumeSkillIds,
        allowedAgentMemoryDir: resumeMemoryDirName,
        agentDirName,
        wikiContext: request.wikiContext || {},
      })

      // Re-inject semantic memories for resumed run
      this._injectSemanticMemories(workRoot)

      const agent = createDeepAgent({
        model: agentConfig.model,
        tools: agentConfig.tools,
        systemPrompt: agentConfig.systemPrompt,
        subagents: agentConfig.subagents,
        interruptOn: agentConfig.interruptOn,
        skills: agentConfig.skills,
        memory: agentConfig.memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: request.agentEnglishName || request.agentId || 'reviva-agent',
        middleware: buildMiddleware({
          toolCallLimit: request.toolCallLimit,
          modelCallLimit: request.modelCallLimit,
          subagentNames: agentConfig.subagents?.map(s => s.name) || [],
        }),
      })

      const decisionCount = Math.max(1, Array.isArray(pendingActionRequests) ? pendingActionRequests.length : 0)
      const decisions = Array.from({ length: decisionCount }, () => ({ type: approved ? 'approve' : 'reject' }))
      const abortController = new AbortController()
      this._activeRuns.set(runId, { abortController, msgId, request })

      const sendFn = (chunk) => this._send('agent:chunk', { runId, chunk })

      const result = await iterateDeepStream(
        agent,
        new Command({ resume: { decisions } }),
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(request.maxIterations),
        },
        sendFn,
        'agent',
        { stepIndex: (initialSteps || []).length, iteration: initialIteration || 0 },
      )

      // Check for another interrupt after resume (same logic as handleStartRun)
      // streamEvents() doesn't return __interrupt__ — check agent state
      let interruptDetected = false
      try {
        const state = await agent.getState({ configurable: { thread_id: runId } })
        if (state?.next?.length && state?.tasks?.some(t => t.interrupts?.length)) {
          const interrupts = state.tasks
            .filter(t => t.interrupts?.length)
            .flatMap(t => t.interrupts)

          console.log('[AgentService] Interrupt detected after resume via state:', interrupts)
          const actionRequests = interrupts.map(i => i.value?.actionRequests || []).flat()
          const reviewConfigs = interrupts.map(i => i.value?.reviewConfigs || []).flat()

          if (actionRequests.length) {
            interruptDetected = true

            this._interruptedRuns.set(runId, {
              runId, request, agentConfig, msgId,
              initialSteps: [...(initialSteps || []), ...result.steps],
              initialIteration: result.iteration,
              initialContent: (initialContent || '') + result.fullContent,
              initialThinking: (initialThinking || '') + result.thinkingContent,
              initialTodos: result.todos?.length ? result.todos : (initialTodos || []),
              initialUsage: {
                inputTokens: (initialUsage?.inputTokens || 0) + (result.totalUsage.inputTokens || 0),
                outputTokens: (initialUsage?.outputTokens || 0) + (result.totalUsage.outputTokens || 0),
                cacheReadTokens: (initialUsage?.cacheReadTokens || 0) + (result.totalUsage.cacheReadTokens || 0),
                cacheWriteTokens: (initialUsage?.cacheWriteTokens || 0) + (result.totalUsage.cacheWriteTokens || 0),
                thinkingTokens: (initialUsage?.thinkingTokens || 0) + (result.totalUsage.thinkingTokens || 0),
              },
              pendingActionRequests: actionRequests,
              pendingReviewConfigs: reviewConfigs,
            })

            this._send('agent:authRequest', {
              requestId: runId,
              actionRequests,
              reviewConfigs,
            })

            this._activeRuns.delete(runId)
            return { requestId, approved, resumed: true, nextInterrupt: true }
          }
        }
      } catch (e) {
        console.warn('[AgentService] Could not check interrupt state after resume:', e.message)
      }

      // Legacy: also check result.__interrupt__ if available (non-streaming invoke)
      if (!interruptDetected && result.__interrupt__) {
        const interrupts = result.__interrupt__[0]?.value
        if (interrupts) {
          this._interruptedRuns.set(runId, {
            runId, request, agentConfig, msgId,
            initialSteps: [...(initialSteps || []), ...result.steps],
            initialIteration: result.iteration,
            initialContent: (initialContent || '') + result.fullContent,
            initialThinking: (initialThinking || '') + result.thinkingContent,
            initialTodos: result.todos?.length ? result.todos : (initialTodos || []),
              initialUsage: {
                inputTokens: (initialUsage?.inputTokens || 0) + (result.totalUsage.inputTokens || 0),
                outputTokens: (initialUsage?.outputTokens || 0) + (result.totalUsage.outputTokens || 0),
                cacheReadTokens: (initialUsage?.cacheReadTokens || 0) + (result.totalUsage.cacheReadTokens || 0),
                cacheWriteTokens: (initialUsage?.cacheWriteTokens || 0) + (result.totalUsage.cacheWriteTokens || 0),
                thinkingTokens: (initialUsage?.thinkingTokens || 0) + (result.totalUsage.thinkingTokens || 0),
              },
              pendingActionRequests: interrupts.actionRequests || [],
              pendingReviewConfigs: interrupts.reviewConfigs || [],
            })
          this._send('agent:authRequest', {
            requestId: runId,
            actionRequests: interrupts.actionRequests || [],
            reviewConfigs: interrupts.reviewConfigs || [],
          })
          this._activeRuns.delete(runId)
          return { requestId, approved, resumed: true, nextInterrupt: true }
        }
      }

      // Combine initial + resumed steps and content for final result
      const allSteps = [...(initialSteps || []), ...result.steps]
      const allTodos = result.todos?.length ? result.todos : (initialTodos || [])
      const allContent = (initialContent || '') + result.fullContent
      const allThinking = (initialThinking || '') + result.thinkingContent
      const allUsage = { ...result.totalUsage }
      if (initialUsage) {
        allUsage.inputTokens += initialUsage.inputTokens || 0
        allUsage.outputTokens += initialUsage.outputTokens || 0
        allUsage.cacheReadTokens += initialUsage.cacheReadTokens || 0
        allUsage.cacheWriteTokens += initialUsage.cacheWriteTokens || 0
        allUsage.thinkingTokens += initialUsage.thinkingTokens || 0
      }
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, allUsage)
      allUsage.cost = cost

      // If recursion limit was hit during resume, treat as cancelled
      const finalStatus = result.recursionHit ? 'cancelled' : 'completed'
      const stopReason = result.recursionHit ? 'recursion_limit' : 'end_turn'

      // Build meta for DB persistence (steps, toolCalls) from allSteps
      const stepsMeta = {}
      if (allSteps?.length) stepsMeta.steps = allSteps
      if (allTodos?.length) stepsMeta.todos = allTodos
      const toolCallsFromSteps = allSteps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: allContent,
        thinking_content: allThinking,
        status: finalStatus,
        input_tokens: allUsage.inputTokens,
        output_tokens: allUsage.outputTokens,
        cache_read_tokens: allUsage.cacheReadTokens,
        cache_write_tokens: allUsage.cacheWriteTokens,
        thinking_tokens: allUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost: allUsage.cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._runStateManager.update(runId, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })

      this._send('agent:runDone', {
        runId,
        content: allContent,
        thinkingContent: allThinking,
        usage: allUsage,
        stopReason,
        steps: allSteps,
        todos: allTodos,
        latencyMs,
        cost: allUsage.cost,
      })

      this._notifyAgentTask(
        result.recursionHit ? 'failed' : 'done',
        request,
        runId,
        result.recursionHit ? '迭代次数已达上限，任务中途停止' : '',
      )

      return { requestId, approved, resumed: true }

    } catch (err) {
      const classified = this._errorClassifier.classify(err)
      this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
      this._send('agent:runError', { runId, error: { message: classified.userMessage, code: classified.code } })
      this._notifyAgentTask('failed', request, runId, classified.userMessage)
      this._activeRuns.delete(runId)
      return { requestId, approved, resumed: true, error: classified.code }
    } finally {
      this._removeInjectedMemories(workRoot)
    }
  }

  async handleExecuteTool(request) {
    setCloudContext(request.cloudContext || {})
    const agentDirName = this._agentRuntimeDirName(request.agentId, request.agentEnglishName)
    const visionOptions = this._visionToolOptionsFromRequest(request)
    const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(this._withSkillTools(request.toolIds, request.skills), request.permissions), request.cloudContext, visionOptions)
    const allowedMediaIds = this._allowedMediaIdsFromRequest(request)
    setToolRunContext({ agentEnglishName: agentDirName, permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || [], toolIds: effectiveToolIds, allowedMediaIds, vision: this._visionContextFromRequest(request) })
    const tools = this._buildLocalRuntimeTools(effectiveToolIds, visionOptions)
    const tool = tools.find(t => t.name === request.toolName)
    if (!tool) return { content: `Unknown tool: ${request.toolName}`, isError: true }
    try {
      const result = await tool.invoke(request.input)
      return { content: result, isError: false }
    } catch (e) {
      return { content: `Tool error: ${e.message}`, isError: true }
    }
  }

  async handleRunSubAgent(request) {
    // Fallback for manual sub-agent execution (not via DeepAgents task delegation)
    const { providerId, apiKey, baseUrl, apiFormat, model: modelName, context, task, toolIds } = request
    try {
      setCloudContext(request.cloudContext || context?.cloudContext || {})
      const agentDirName = this._agentRuntimeDirName(request.agentId || context?.agentId, request.agentEnglishName || context?.agentEnglishName)
      const mergedVisionRequest = { ...context, ...request, model: modelName, providerId, apiKey, baseUrl, apiFormat, modelHasVision: request.modelHasVision || context?.modelHasVision, visionModel: request.visionModel || context?.visionModel }
      const visionOptions = this._visionToolOptionsFromRequest(mergedVisionRequest)
      const skillData = this._buildSkillsPaths(request.skills || context?.skills || [])
      const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(
        this._withSkillTools(toolIds, request.skills || context?.skills),
        request.permissions || context?.permissions,
      ),
        request.cloudContext || context?.cloudContext,
        visionOptions,
      )
      const allowedMediaIds = this._allowedMediaIdsFromRequest(request, context || {})
      setToolRunContext({ agentEnglishName: agentDirName, permissions: request.permissions || context?.permissions || {}, wikiContext: request.wikiContext || context?.wikiContext || {}, boundSkillIds: skillData.boundSkillIds, toolIds: effectiveToolIds, allowedMediaIds, vision: this._visionContextFromRequest(mergedVisionRequest) })
      const subModel = this._createModel(providerId, apiKey, baseUrl, modelName, { streaming: false, apiFormat })
      const workRoot = this._workDirService?.getRootPath?.() || ''
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const memoryDirName = request.memoryDirName || context?.memoryDirName || agentDirName
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: skillData.boundSkillIds,
        allowedAgentMemoryDir: memoryDirName,
        agentDirName,
        wikiContext: request.wikiContext || context?.wikiContext || {},
      })
      const subAgent = createDeepAgent({
        model: subModel,
        systemPrompt: context?.systemPrompt || '',
        tools: this._buildLocalRuntimeTools(effectiveToolIds, visionOptions),
        backend,
        checkpointer: this._checkpointer,
        middleware: [createFilesystemToolArgumentAliasMiddleware(), createDeepAgentsBuiltinToolExclusionMiddleware()],
      })
      const result = await subAgent.invoke({
        messages: [new HumanMessage(task)],
      })
      const lastMsg = result.messages[result.messages.length - 1]
      return { summary: lastMsg?.content?.slice(0, 2000) || '子智能体执行完成', usage: {} }
    } catch (e) {
      return { summary: `子智能体执行失败: ${e.message}`, error: true }
    }
  }

  async handleCompressContext(request) {
    return { summary: request.messages?.slice(-5) || [], compressed: true }
  }

  async handleGenerateTitle(req) {
    try {
      const { userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model } = req
      const title = await this._titleGenerator.generate({ userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model })
      return { title }
    } catch (e) {
      console.error('[AgentService] generateTitle error:', e.message)
      return { title: '' }
    }
  }

  handleGetRunState(runId) {
    return this._runStateManager.get(runId)
  }

  // ── Legacy ChatService ───────────────────────────────────────

  async handleChatStart(request) {
    const startTime = Date.now()
    const requestId = request.requestId || crypto.randomUUID()
    const abortController = new AbortController()
    const msgId = request.msgId

    if (!msgId) {
      this._send('chat:error', { requestId, msgId: null, error: 'Missing message ID', code: 'INVALID_REQUEST' })
      return
    }

    this._db.updateMsg(msgId, {
      status: 'streaming',
      model_id: request.model || '',
      provider_id: request.providerId || '',
    })

    this._activeStreams.set(requestId, { abortController, msgId })
    this._send('chat:started', { requestId, msgId, conversationId: request.conversationId })

    try {
      const workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxPaths || [], workRoot)
      const preparedMessages = this._prepareMessageAttachments(request.messages || [], workRoot, preparedCtxPaths)
      const visionOptions = { modelHasVision: !!request.modelHasVision, visionAvailable: !!request.modelHasVision }
      const enrichedMessages = _attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      )
      const agentDirName = this._agentRuntimeDirName(request.agentId, request.agentEnglishName)
      const memoryDirName = agentDirName
      let systemPrompt = request.systemPrompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, agentDirName, [], request.answerStyle, memoryDirName, request.cloudContext, visionOptions)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens || 4096,
          topP: request.topP,
          apiFormat: request.apiFormat,
        },
      )

      const directMessages = toDirectMessages(systemPrompt, enrichedMessages)
      const sendFn = (text) => this._send('chat:chunk', { requestId, msgId, chunk: { type: 'content', text } })

      const result = await streamDirectModel(
        model,
        directMessages,
        abortController.signal,
        sendFn,
      )

      const { fullContent, thinkingContent, totalUsage, steps, todos } = result
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost

      const stepsMeta = {}
      if (steps?.length) stepsMeta.steps = steps
      if (todos?.length) stepsMeta.todos = todos
      const toolCallsFromSteps = steps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: fullContent,
        thinking_content: thinkingContent,
        status: 'completed',
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._db.createTokenUsage({
        provider_id: request.providerId,
        model_id: request.model,
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        cost,
        latency_ms: latencyMs,
        agent_id: request.agentId || '',
        conversation_id: request.conversationId,
      })

      this._send('chat:done', {
        requestId, msgId,
        content: fullContent,
        thinkingContent,
        usage: totalUsage,
        latencyMs, cost,
        steps,
        todos,
      })

      const chatModuleConfig = this._builtinModules?.find(m => m.english_name === request.agentEnglishName)
      if (chatModuleConfig) {
        this._registerArtifacts({
          conversationId: request.conversationId,
          agentEnglishName: request.agentEnglishName,
          agentDirName,
          workRoot,
          runStartTime: Date.now() - latencyMs,
        })
      }

    } catch (err) {
      const isAborted = err.name === 'AbortError' || err.message === 'ABORTED'
      if (isAborted) {
        this._db.updateMsg(msgId, { status: 'error', error_message: '已取消', error_code: 'ABORTED' })
        this._send('chat:cancelled', { requestId, msgId })
      } else {
        const classified = this._errorClassifier.classify(err)
        this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
        this._send('chat:error', { requestId, msgId, error: err.message, code: classified.code })
      }
    } finally {
      this._activeStreams.delete(requestId)
    }
  }

  handleChatCancel(requestId) {
    const stream = this._activeStreams.get(requestId)
    if (stream) stream.abortController.abort()
  }

  async handleNoteAiRun(request = {}) {
    const startTime = Date.now()
    const requestId = request.requestId || crypto.randomUUID()
    const abortController = new AbortController()

    if (!request.providerId) {
      this._send('noteAi:error', { requestId, error: '缺少服务商 ID', code: 'INVALID_REQUEST' })
      return { success: false, error: '缺少服务商 ID' }
    }
    if (!request.apiKey) {
      this._send('noteAi:error', { requestId, error: '缺少 API Key', code: 'INVALID_REQUEST' })
      return { success: false, error: '缺少 API Key' }
    }
    if (!request.baseUrl) {
      this._send('noteAi:error', { requestId, error: '缺少 Base URL', code: 'INVALID_REQUEST' })
      return { success: false, error: '缺少 Base URL' }
    }
    if (!request.model) {
      this._send('noteAi:error', { requestId, error: '缺少模型 ID', code: 'INVALID_REQUEST' })
      return { success: false, error: '缺少模型 ID' }
    }

    this._activeNoteAiRuns.set(requestId, { abortController })
    this._send('noteAi:started', { requestId })

    try {
      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens || 1200,
          topP: request.topP,
          apiFormat: request.apiFormat,
        },
      )

      const directMessages = toDirectMessages(request.systemPrompt || '', request.messages || [])
      const sendFn = (text) => this._send('noteAi:chunk', { requestId, text })
      const result = await streamDirectModel(model, directMessages, abortController.signal, sendFn)
      if (abortController.signal.aborted) throw new Error('ABORTED')
      const { fullContent, thinkingContent, totalUsage } = result
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost

      this._db.createTokenUsage({
        provider_id: request.providerId,
        model_id: request.model,
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        cost,
        latency_ms: latencyMs,
        agent_id: 'note_ai',
        conversation_id: 'note_oneshot',
      })

      this._send('noteAi:done', {
        requestId,
        content: fullContent,
        thinkingContent,
        usage: totalUsage,
        latencyMs,
        cost,
      })
      return { success: true, content: fullContent, usage: totalUsage, latencyMs, cost }
    } catch (err) {
      const isAborted = err.name === 'AbortError' || err.message === 'ABORTED' || abortController.signal.aborted
      if (isAborted) {
        this._send('noteAi:cancelled', { requestId })
        return { success: false, cancelled: true }
      }
      const classified = this._errorClassifier.classify(err)
      this._send('noteAi:error', { requestId, error: err.message, code: classified.code })
      return { success: false, error: err.message, code: classified.code }
    } finally {
      this._activeNoteAiRuns.delete(requestId)
    }
  }

  handleNoteAiCancel(requestId) {
    const run = this._activeNoteAiRuns.get(requestId)
    if (run) run.abortController.abort()
  }

  // ── Builtin Agent Modules ────────────────────────────────────

  _resolveBuiltinModulesDir() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const candidates = [
      path.join(__dirname, 'agents', 'builtin'),
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'agents', 'builtin') : '',
    ].filter(Boolean)

    const dir = candidates.find(p => fs.existsSync(path.join(p, 'ppt-generator', 'config.json')))
    if (dir) return dir
    console.warn('[AgentService] builtin modules dir not found, tried:', candidates)
    return candidates[0]
  }

  _loadBuiltinAgentModules() {
    const modulesDir = this._resolveBuiltinModulesDir()
    if (!fs.existsSync(modulesDir)) return []

    const modules = []
    for (const entry of fs.readdirSync(modulesDir)) {
      const configPath = path.join(modulesDir, entry, 'config.json')
      if (!fs.existsSync(configPath)) continue

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      // Load orchestrator prompt
      const promptFile = path.join(modulesDir, entry, config.prompt_file || 'orchestrator.md')
      if (fs.existsSync(promptFile)) {
        config.prompt = fs.readFileSync(promptFile, 'utf-8')
      }

      // Load sub-agent prompts
      const subagentDir = path.join(modulesDir, entry, config.subagent_dir || 'subagents')
      config.subagent_prompts = {}
      if (fs.existsSync(subagentDir)) {
        for (const saFile of fs.readdirSync(subagentDir)) {
          if (!saFile.endsWith('.md')) continue
          const saName = saFile.replace('.md', '')
          config.subagent_prompts[saName] = fs.readFileSync(path.join(subagentDir, saFile), 'utf-8')
        }
      }

      // Load artifact rules
      const rulesFile = path.join(modulesDir, entry, config.artifact_rules_file || 'artifact-rules.json')
      if (fs.existsSync(rulesFile)) {
        config.artifact_rules = JSON.parse(fs.readFileSync(rulesFile, 'utf-8'))
      }

      modules.push(config)
    }
    return modules
  }

  _builtinAgentTemplateFromConfig(config, prompt = config.prompt || '') {
    return {
      id: config.id,
      builtin_key: config.id,
      builtin_version: config.builtin_version || config.version || '1.0.0',
      name: config.name || '',
      english_name: config.english_name || '',
      description: config.description || '',
      icon: config.icon || 'ri-sparkling-2-line',
      color: config.color || '#A78BFA',
      architecture: config.architecture || 'react',
      permissions: config.permissions || {},
      tools: config.tools || [],
      skills: config.skills || [],
      sub_agents: config.sub_agents || [],
      prompt,
      max_iterations: normalizeNonNegativeLimit(config.max_iterations, 10),
      model: config.model || '',
      temperature: config.temperature ?? 0.7,
      top_p: config.top_p ?? 1.0,
      max_tokens: config.max_tokens || 4096,
      thinking_mode: config.thinking_mode || 'auto',
      thinking_intensity: config.thinking_intensity || 'medium',
      tool_call_limit: config.tool_call_limit || 0,
      model_call_limit: config.model_call_limit || 0,
      plan_steps: config.plan_steps ?? 5,
      reviewer_model: config.reviewer_model || '',
      use_same_model: config.use_same_model === undefined ? 1 : (config.use_same_model ? 1 : 0),
    }
  }

  _syncBuiltinAgentModules() {
    if (!this._db?.syncBuiltinAgentTemplate || !Array.isArray(this._builtinModules)) return
    for (const config of this._builtinModules) {
      try {
        this._db.syncBuiltinAgentTemplate(this._builtinAgentTemplateFromConfig(config))
      } catch (err) {
        console.error(`[AgentService] Failed to sync builtin module ${config.id || config.english_name}:`, err.message)
      }
    }
  }

  // Install all built-in conversational agents from electron/builtin-assets/agents/.
  // Each subfolder must contain config.json (+ optional PROMPT.md). Existing rows are
  // synced through DatabaseService so official template updates can merge with user overrides.
  async installAllBuiltinAgents(dir) {
    if (!dir || !fs.existsSync(dir)) {
      console.log('[AgentService] No builtin-assets/agents directory found, skipping')
      return
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const agentDir = path.join(dir, entry.name)
      const configPath = path.join(agentDir, 'config.json')
      const promptPath = path.join(agentDir, 'PROMPT.md')

      if (!fs.existsSync(configPath)) continue

      try {
        const config = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'))
        config.id = entry.name

        let prompt = config.prompt || ''
        if (fs.existsSync(promptPath)) {
          prompt = await fs.promises.readFile(promptPath, 'utf-8')
        }

        const synced = this._db.syncBuiltinAgentTemplate(this._builtinAgentTemplateFromConfig(config, prompt))
        console.log(`[AgentService] Synced builtin agent: ${synced?.id || config.id}`)
      } catch (err) {
        console.error(`[AgentService] Failed to install ${entry.name}:`, err.message)
      }
    }
  }

  async _registerArtifacts({ conversationId, groupId, agentEnglishName, agentDirName = '', workRoot, runStartTime }) {
    const date = new Date(runStartTime).toISOString().slice(0, 10)
    const runtimeDirName = agentDirName || this._agentRuntimeDirName('', agentEnglishName)
    const outputDir = path.join(workRoot, 'agents', runtimeDirName, 'outputs', date)

    if (!fs.existsSync(outputDir)) return []

    // Background generation tasks may not have a conversation yet.
    const conv = conversationId ? this._db.getConv(conversationId) : null
    const resolvedGroupId = groupId || conv?.group_id || 'default'

    // Find module config for artifact rules
    const moduleConfig = this._builtinModules?.find(m => m.english_name === agentEnglishName)
    const rules = moduleConfig?.artifact_rules
    const created = []

    // Scan for new files (mtime > runStartTime)
    for (const file of fs.readdirSync(outputDir)) {
      const filePath = path.join(outputDir, file)
      let stat
      try { stat = fs.statSync(filePath) } catch { continue }
      if (!stat.isFile()) continue
      if (stat.mtimeMs < runStartTime) continue

      const ext = file.split('.').pop().toLowerCase()
      const title = file.replace(/\.[^.]+$/, '')

      // Match file pattern from rules
      const pattern = rules?.file_patterns?.find(p => p.ext === ext)
      const icon = pattern?.icon || (ext === 'html' ? 'ri-bar-chart-box-line' : 'ri-file-text-line')
      const type = pattern?.type || 'research'

      const artifact = this._db.createArtifact({
        id: `art_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        group_id: resolvedGroupId,
        conversation_id: conversationId || '',
        title,
        type,
        icon,
        color: moduleConfig?.color || '#38BDF8',
        storage_type: 'file',
        file_path: filePath,
        content: null,
        agent_name: moduleConfig?.name || agentEnglishName,
        skill_name: moduleConfig?.skills?.[0] || '',
      })
      created.push(artifact)
    }

    // Notify renderer
    if (created.length) {
      this._send('agent:artifactsCreated', { groupId: resolvedGroupId, agentEnglishName, artifacts: created })
    }
    return created
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Build project-specific system prompt additions
   * Injects output rules, behavioral guidelines, and user-provided context file paths
   */
  _buildProjectSystemPrompt(workRoot, ctxPaths, agentDirName, skillInfo = [], answerStyle = 'default', agentMemoryDirName = null, cloudContext = {}, options = {}) {
    return buildProjectSystemPrompt({
      workRoot,
      ctxPaths,
      cloudContext,
      agentDirName,
      skillInfo,
      answerStyle,
      agentMemoryDirName,
      modelHasVision: !!options.modelHasVision,
      visionAvailable: !!(options.visionAvailable ?? options.modelHasVision),
    })
  }


  /**
   * Prepare context paths for agent runs.
   * - Workspace selections, especially docs/ files, keep their authorized absolute path.
   * - External attachments are copied into {workRoot}/context/YYYY-MM-DD/ and referenced by virtual path.
   */
  _prepareMessageAttachments(messages, workRoot, preparedCurrentCtxPaths = []) {
    const source = messages || []
    const lastUserIndex = (() => {
      for (let i = source.length - 1; i >= 0; i--) {
        if (_isUserMessage(source[i])) return i
      }
      return -1
    })()

    return source.map((message, index) => {
      if (!_isUserMessage(message)) return message
      const rawAttachments = index === lastUserIndex && preparedCurrentCtxPaths?.length
        ? preparedCurrentCtxPaths
        : _messageAttachments(message)
      if (!rawAttachments?.length) return message
      const attachments = index === lastUserIndex && rawAttachments === preparedCurrentCtxPaths
        ? preparedCurrentCtxPaths
        : this._prepareContextItems(rawAttachments, workRoot)
      return { ...message, attachments }
    })
  }

  _prepareContextItems(ctxPaths, workRoot) {
    if (!ctxPaths?.length || !workRoot) return ctxPaths || []

    const contextDir = path.join(workRoot, 'context', _dateStamp())
    const prepared = []

    for (const item of ctxPaths) {
      if (!item?.path && item?.dataUrl && _isImageContextItem(item)) {
        try {
          const decoded = _decodeImageDataUrl(item.dataUrl)
          if (!decoded) {
            prepared.push(item)
            continue
          }
          if (decoded.buffer.length > MAX_VISION_IMAGE_BYTES) {
            const err = new Error(`图片 ${item.name || '粘贴图片'} 过大，单张图片不能超过 10MB。请压缩后重试。`)
            err.code = 'VISION_IMAGE_TOO_LARGE'
            throw err
          }
          fs.mkdirSync(contextDir, { recursive: true })
          const imageName = _ensureImageFilename(item, decoded.ext)
          const dest = _uniqueDestPath(contextDir, imageName)
          fs.writeFileSync(dest, decoded.buffer)
          prepared.push({
            ...item,
            name: path.basename(dest),
            originalName: item.name || '',
            path: dest,
            isDirectory: false,
            source: item.source || 'attachment',
            accessPath: _toWorkspaceVirtualPath(dest, workRoot),
          })
          console.log('[AgentService] Staged pasted image context item:', item.name || imageName, '→', dest)
        } catch (e) {
          if (e.code === 'VISION_IMAGE_TOO_LARGE') throw e
          console.warn('[AgentService] Could not stage pasted image context item:', item.name || '(pasted image)', e.message)
          prepared.push(item)
        }
        continue
      }

      if (!item?.path) {
        prepared.push(item)
        continue
      }

      const name = item.name || path.basename(item.path)
      const isDirectory = !!(item.isDirectory || item.type === 'folder' || item.type === 'local_folder')

      try {
        const resolved = this._workDirService.resolveAndValidate(item.path, 'any')
        prepared.push({
          ...item,
          name,
          path: resolved,
          isDirectory,
          source: item.source || 'workspace',
          accessPath: _toWorkspaceVirtualPath(resolved, workRoot),
        })
        continue
      } catch {
        // Outside the authorized workspace: stage it as a temporary context attachment.
      }

      try {
        fs.mkdirSync(contextDir, { recursive: true })
        const dest = _uniqueDestPath(contextDir, name)
        if (isDirectory) {
          fs.cpSync(item.path, dest, { recursive: true })
        } else {
          fs.copyFileSync(item.path, dest)
        }
        prepared.push({
          ...item,
          name: path.basename(dest),
          originalPath: item.path,
          path: dest,
          isDirectory,
          source: item.source || 'attachment',
          accessPath: _toWorkspaceVirtualPath(dest, workRoot),
        })
        console.log('[AgentService] Staged external context item:', name, '→', dest)
      } catch (e) {
        console.warn('[AgentService] Could not stage context item:', name, e.message)
        prepared.push(item)
      }
    }

    return prepared
  }

  _send(channel, data) {
    for (const listener of this._gatewayEventListeners) {
      try { listener(channel, data) } catch (error) { console.warn('[AgentService] gateway event listener failed:', error.message) }
    }
    const win = this._getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    } else {
      console.warn('[AgentService] _send: BrowserWindow not available for', channel)
    }
  }

  subscribeGatewayEvents(listener) {
    if (typeof listener !== 'function') return () => {}
    this._gatewayEventListeners.add(listener)
    return () => this._gatewayEventListeners.delete(listener)
  }
}
