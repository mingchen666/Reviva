// wiki/WikiModelConfig.js — extracted from WikiService.js
// Model/provider config resolution and agent config normalization.

import { readJsonSync, parseModelRef, MODEL_REF_SEPARATOR } from './wikiUtils.js'

export function normalizeAgentConfig(agent = {}) {
  const webResearch = agent.web_research && typeof agent.web_research === 'object' ? agent.web_research : {}
  const semanticAudit = agent.semantic_audit && typeof agent.semantic_audit === 'object' ? agent.semantic_audit : {}
  return {
    ...agent,
    mode: ['supervised', 'disabled'].includes(agent.mode) ? agent.mode : 'supervised',
    status: agent.status || 'idle',
    default_write_policy: 'direct',
    auto_maintain: agent.auto_maintain !== false,
    web_research: {
      ...webResearch,
      mode: ['inherit', 'enabled', 'disabled'].includes(webResearch.mode) ? webResearch.mode : 'inherit',
    },
    semantic_audit: {
      ...semanticAudit,
      enabled: !!semanticAudit.enabled,
      trigger: ['manual', 'after_maintenance'].includes(semanticAudit.trigger) ? semanticAudit.trigger : 'manual',
      auto_fix: false,
      model_ref: String(semanticAudit.model_ref || ''),
    },
  }
}

export class WikiModelConfig {
  constructor({ db, wikiDirResolver }) {
    this._db = db
    this._wikiDirResolver = wikiDirResolver
  }

  modelPricing(providerId, modelId) {
    const providers = this._db?.getSetting?.('providers') || []
    const provider = Array.isArray(providers) ? providers.find(p => p.id === providerId) : null
    const model = provider?.models?.find(m => m.id === modelId)
    return model ? {
      costInput: Number(model.costInput) || 0,
      costOutput: Number(model.costOutput) || 0,
      costCacheRead: Number(model.costCacheRead) || 0,
      costCacheWrite: Number(model.costCacheWrite ?? model.costCacheRead) || 0,
    } : {}
  }

  modelHasVision(providerId, modelId) {
    const providers = this._db?.getSetting?.('providers') || []
    const provider = Array.isArray(providers) ? providers.find(item => item.id === providerId) : null
    const model = provider?.models?.find(item => item.id === modelId)
    return !!model?.capabilities?.vision
  }

  defaultOcrProviderId() {
    const providers = this._db?.listOcrProviders?.() || []
    const provider = providers.find(item =>
      item?.enabled !== false &&
      ['mineru', 'paddleocr'].includes(String(item.type || '').toLowerCase()) &&
      item.base_url &&
      item.api_key_ref
    )
    return provider?.id || ''
  }

  resolveWikiAgentModelConfig(id, runId = '', overrideRef = '') {
    const providers = this._db?.getSetting?.('providers') || []
    const defaultModels = this._db?.getSetting?.('defaultModels') || {}
    if (!Array.isArray(providers) || !providers.length) {
      throw new Error('请先在设置中配置可用的聊天模型')
    }
  
    const dbWiki = this._db?.getWiki?.(id)
    const meta = readJsonSync(path.join(this._wikiDirResolver(id), 'wiki.json'), null)
    const agentConfig = {
      ...(meta?.agent || {}),
      ...(dbWiki?.agent_config || {}),
    }
    const ref = overrideRef || agentConfig.model_ref || defaultModels.chat || defaultModels.agent || ''
    const parsed = parseModelRef(ref)
    if (!parsed.modelId) throw new Error('请先配置 WikiAgent 模型或全局默认对话模型')
  
    let provider = null
    if (parsed.scoped) {
      provider = providers.find(p => p.id === parsed.providerId && p.enabled !== false)
    } else {
      provider = providers.find(p => p.enabled !== false && p.models?.some(m => m.id === parsed.modelId && m.enabled !== false))
    }
    const model = provider?.models?.find(m => m.id === parsed.modelId && m.enabled !== false)
    if (!provider || !model) throw new Error(`模型 ${parsed.modelId} 无可用供应商或未启用`)
    if (!provider.apiKey) throw new Error(`模型供应商 ${provider.name || provider.id} 还没有配置 API Key`)
  
    return {
      providerId: provider.id,
      apiFormat: provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : 'openai'),
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || '',
      model: model.id,
      modelHasVision: !!model.capabilities?.vision,
      pricing: {
        costInput: Number(model.costInput) || 0,
        costOutput: Number(model.costOutput) || 0,
        costCacheRead: Number(model.costCacheRead) || 0,
        costCacheWrite: Number(model.costCacheWrite ?? model.costCacheRead) || 0,
      },
      runId,
    }
  }

}
