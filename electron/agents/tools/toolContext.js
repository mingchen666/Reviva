// agents/tools/toolContext.js — extracted from langchainTools.js
// Shared mutable state for all agent tools. ES module live bindings ensure
// that imported values always reflect the latest setter call.

import { setMainWindowRef as _setNotifierMainWindowRef } from '../../tools/reviva/settingsNotifier.js'

// Per-agent tool provider config
let _toolProviderConfigs = {}
let _workDirService = null
let _dbService = null
let _wikiService = null
let _mcpService = null
let _mediaQueryService = null
let _noteFileService = null
let _toolRunContext = { agentEnglishName: '_shared', permissions: {} }
let _skillService = null
let _visionAnalyzeHandler = null
let _themeService = null
let _learningMemoryService = null
let _mainWindowRef = null
let _revivaWriteCount = 0
let _taskCounters = { web_search: 0, file_op: 0 }
let _taskLimits = { web_search: 10, file_op: 30 }
let _cloudCtx = { baseUrl: '', token: '', defaultKbIds: [], defaultDocIds: [], activeSourceId: '', externalKbId: '' }
let _externalKbBodyFields = ''
let _kbRegistry = null
let _execCommandConfig = { blacklist: null }

export function setToolProviderConfig(configs) {
  _toolProviderConfigs = configs || {}
}

export function setWorkDirService(wd) {
  _workDirService = wd
}

export function setDbService(db) {
  _dbService = db
}

export function setWikiService(service) {
  _wikiService = service
}

export function setMcpService(service) {
  _mcpService = service
}

export function setMediaQueryService(service) {
  _mediaQueryService = service || null
}

export function setNoteFileService(service) {
  _noteFileService = service || null
}

export function setSkillService(service) {
  _skillService = service || null
}

export function setThemeService(s) { _themeService = s }
export function setLearningMemoryService(s) { _learningMemoryService = s }
export function setMainWindowRef(win) {
  _mainWindowRef = win
  _setNotifierMainWindowRef(win)
}

export function setVisionAnalyzeHandler(handler) {
  _visionAnalyzeHandler = typeof handler === 'function' ? handler : null
}

export function setToolRunContext(ctx = {}) {
  const toolIds = (ctx.toolIds || ctx.tools || [])
    .filter(item => typeof item === 'string')
  const boundSkillIds = (ctx.boundSkillIds || ctx.skills || [])
    .map(item => String(item || '').replace(/\\/g, '/').replace(/^\/?skills\//i, '').replace(/\/+$/, ''))
    .filter(Boolean)
  const mcpServerIds = []
  for (const item of toolIds) {
    if (typeof item !== 'string' || !item.startsWith('mcp:')) continue
    const serverId = item.split(':')[1]
    if (serverId) mcpServerIds.push(serverId)
  }
  _toolRunContext = {
    agentEnglishName: ctx.agentEnglishName || '_shared',
    permissions: ctx.permissions || {},
    wikiContext: ctx.wikiContext || {},
    boundSkillIds,
    mcpServerIds: [...new Set(mcpServerIds)],
    toolIds: [...new Set(toolIds)],
    allowedMediaIds: [...new Set((ctx.allowedMediaIds || []).map(item => String(item || '')).filter(Boolean))],
    vision: ctx.vision || {},
  }
}

export function setCloudContext(ctx) {
  _cloudCtx = {
    baseUrl: ctx?.baseUrl || '',
    token: ctx?.token || '',
    defaultKbIds: Array.isArray(ctx?.defaultKbIds) ? ctx.defaultKbIds : [],
    defaultDocIds: Array.isArray(ctx?.defaultDocIds) ? ctx.defaultDocIds : [],
    activeSourceId: ctx?.activeSourceId || '',
    externalKbId: ctx?.externalKbId || '',
  }
  // When an external source is active, extract its search body field names
  // so we can describe them to the agent in the kb_search tool schema.
  _externalKbBodyFields = ''
  if (_cloudCtx.activeSourceId && _kbRegistry) {
    try {
      const src = _kbRegistry.getSource(_cloudCtx.activeSourceId)
      const body = src?.config?.endpoints?.search?.body
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const fields = Object.keys(body)
          .filter(k => !['query', 'top_k'].includes(k)) // skip runtime placeholders
        if (fields.length) {
          _externalKbBodyFields = fields.map(k => {
            const v = body[k]
            const valStr = typeof v === 'string' ? v : JSON.stringify(v)
            return `${k} (当前: ${valStr.length > 40 ? valStr.slice(0,40)+'…' : valStr})`
          }).join(', ')
        }
      }
    } catch {}
  }
}

export function setKnowledgeSourceRegistry(registry) {
  _kbRegistry = registry
}
export function getKnowledgeSourceRegistry() {
  return _kbRegistry
}

export function resetTaskCounters() {
  _taskCounters = { web_search: 0, file_op: 0 }
  _revivaWriteCount = 0
  // Read limits from DB settings
  const searchLimit = _dbService?.getSetting('searchLimit')
  const fileOpLimit = _dbService?.getSetting('fileOpLimit')
  if (searchLimit && searchLimit !== '10') _taskLimits.web_search = Number(searchLimit) || 10
  if (fileOpLimit && fileOpLimit !== '30') _taskLimits.file_op = Number(fileOpLimit) || 30
}

export function setRevivaWriteCount(n) { _revivaWriteCount = n }

export function setExecCommandConfig(config) {
  _execCommandConfig = config || { blacklist: null }
}

export {
  _toolProviderConfigs, _workDirService, _dbService, _wikiService,
  _mcpService, _mediaQueryService, _noteFileService, _toolRunContext,
  _skillService, _visionAnalyzeHandler, _themeService, _learningMemoryService,
  _mainWindowRef, _revivaWriteCount, _taskCounters, _taskLimits,
  _cloudCtx, _externalKbBodyFields, _kbRegistry, _execCommandConfig,
}
