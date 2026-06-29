import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { encodeModelRef, parseModelRef } from '@/utils/modelRef'

// ─── Accent Presets ───
const ACCENT_PRESETS = [
  { key: 'brand', label: '靛蓝', hex: '#4A6CFF', rgb: '74,108,255' },
  { key: 'violet', label: '紫罗兰', hex: '#7C3AED', rgb: '124,58,237' },
  { key: 'emerald', label: '翡翠', hex: '#10B981', rgb: '16,185,129' },
  { key: 'rose', label: '玫瑰', hex: '#F43F5E', rgb: '244,63,94' },
  { key: 'amber', label: '琥珀', hex: '#F59E0B', rgb: '245,158,11' },
  { key: 'sky', label: '天蓝', hex: '#0EA5E9', rgb: '14,165,233' },
  { key: 'teal', label: '青碧', hex: '#14B8A6', rgb: '20,184,166' },
  { key: 'orange', label: '橙焰', hex: '#F97316', rgb: '249,115,22' },
  { key: 'lime', label: '柠绿', hex: '#84CC16', rgb: '132,204,22' },
  { key: 'pink', label: '桃粉', hex: '#EC4899', rgb: '236,72,153' },
]

// ─── Default Providers ───
function providerModel(id, name, options = {}) {
  return {
    id,
    name,
    ctx: options.ctx || '?',
    maxOutput: options.maxOutput || '8k',
    tier: options.tier || 'balanced',
    enabled: options.enabled ?? false,
    capabilities: {
      tool_calling: options.toolCalling ?? true,
      vision: options.vision ?? false,
      search: options.search ?? false,
      vector: options.vector ?? false,
      reranking: options.reranking ?? false,
    },
    costInput: options.costInput ?? 0,
    costOutput: options.costOutput ?? 0,
    costCacheRead: options.costCacheRead ?? 0,
    costCacheWrite: options.costCacheWrite ?? 0,
    addedBy: 'default',
  }
}

function providerPreset({ id, name, desc, iconName, logoBg, logoChar, baseUrl, enabled = false, models, apiKey = '', apiKeyOptional = false, local = false, region = 'CN', apiFormat = 'openai' }) {
  return {
    id,
    name,
    desc,
    region,
    iconName,
    logoBg,
    logoChar,
    builtin: true,
    local,
    apiFormat,
    apiKeyOptional,
    enabled,
    configured: !!apiKey,
    apiKey,
    baseUrl,
    models,
  }
}

function officialProviderModel(id, name, options = {}) {
  return {
    ...providerModel(id, name, {
      ...options,
      enabled: options.enabled ?? true,
      costInput: options.costInput ?? 0,
      costOutput: options.costOutput ?? 0,
      costCacheRead: options.costCacheRead ?? 0,
      costCacheWrite: options.costCacheWrite ?? options.costCacheRead ?? 0,
    }),
    billingUnit: 'points',
    requestMinPoints: options.requestMinPoints ?? 10,
    pointsPerCny: options.pointsPerCny ?? 100,
    minPositiveChargePoints: options.minPositiveChargePoints ?? 1,
    addedBy: 'official-default',
  }
}

function resolveOfficialLlmBaseUrl() {
  const rawBase = import.meta.env.VITE_CLOUD_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : 'http://localhost:8080')
  const base = String(rawBase || '').replace(/\/+$/, '')
  if (!base) return '/v1'
  return base.endsWith('/v1') ? base : `${base}/v1`
}

const DEFAULT_PROVIDERS = [
  {
    id: 'reviva', name: 'Reviva 官方模型', desc: '官方托管模型服务，登录后按账户积分余额计费', region: '官方',
    iconName: 'reviva', logoBg: 'linear-gradient(135deg, #4A6CFF 0%, #10B981 100%)', logoChar: 'M', builtin: true,
    official: true, recommended: true, managedKey: true,
    enabled: true, configured: false,
    apiKey: '', apiKeyId: '', baseUrl: resolveOfficialLlmBaseUrl(),
    models: [
      officialProviderModel('deepseek-v4-flash', 'DeepSeek-V4-Flash', { ctx: '1000k', maxOutput: '384k', tier: 'fast', costInput: 30, costOutput: 60, costCacheRead: 10, requestMinPoints: 5 }),
    ],
  },
  providerPreset({
    id: 'openai',
    name: 'OpenAI',
    desc: 'OpenAI GPT系列模型，支持自定义',
    iconName: 'openai',
    logoBg: '#0F172A',
    logoChar: 'O',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      providerModel('gpt-4o', 'GPT-4o', { ctx: '128k', maxOutput: '16k', tier: 'flagship', enabled: true, vision: true, costInput: 18, costOutput: 72, costCacheRead: 1.8, costCacheWrite: 9 }),
    ],
  }),
  providerPreset({
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude 官方 API 或兼容 Anthropic Messages API 的代理网关',
    iconName: 'claude',
    logoBg: '#D97757',
    logoChar: 'C',
    baseUrl: 'https://api.anthropic.com/v1',
    enabled: false,
    apiFormat: 'anthropic',
    region: '海外',
    models: [
      providerModel('claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet', { ctx: '200k', maxOutput: '8k', tier: 'flagship', enabled: true, vision: true, costInput: 21, costOutput: 105, costCacheRead: 2.1, costCacheWrite: 26.25 }),
      providerModel('claude-3-5-haiku-latest', 'Claude 3.5 Haiku', { ctx: '200k', maxOutput: '8k', tier: 'fast', enabled: true, vision: true, costInput: 5.6, costOutput: 28, costCacheRead: 0.56, costCacheWrite: 7 }),
      providerModel('claude-3-opus-latest', 'Claude 3 Opus', { ctx: '200k', maxOutput: '4k', tier: 'flagship', enabled: false, vision: true, costInput: 105, costOutput: 525, costCacheRead: 10.5, costCacheWrite: 131.25 }),
    ],
  }),

  {
    id: 'deepseek', name: 'DeepSeek', desc: '深度求索，高性价比推理模型', region: '国内',
    iconName: 'deepseek', logoBg: '#4D6BFE', logoChar: 'D', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://api.deepseek.com/v1',
    models: [
      {
        id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', ctx: '1000k', maxOutput: '384k', tier: 'balanced', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 3, costOutput: 6, costCacheRead: 0.025, costCacheWrite: 0.025, addedBy: 'default'
      },
      {
        id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', ctx: '1000k', maxOutput: '384k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 1, costOutput: 2, costCacheRead: 0.02, costCacheWrite: 0.02, addedBy: 'default'
      },
    ],
  },
  {
    id: 'mimo', name: 'Mimo Token Plan', desc: '小米mimo高性价比推理模型', region: '国内',
    iconName: 'mimo', logoBg: '#4D6BFE', logoChar: 'M', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    models: [
      {
        id: 'mimo-v2.5-pro', name: 'Mimo-V2.5-Pro', ctx: '1000k', maxOutput: '128k', tier: 'balanced', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 3, costOutput: 6, costCacheRead: 0.025, costCacheWrite: 0.025, addedBy: 'default'
      },
      {
        id: 'mimo-v2.5', name: 'Mimo-V2.5', ctx: '1000k', maxOutput: '128k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false },
        costInput: 1, costOutput: 2, costCacheRead: 0.02, costCacheWrite: 0.02, addedBy: 'default'
      },
    ],
  },
  {
    id: 'zhipu', name: '智谱 GLM', desc: 'GLM-4 系列大模型', region: '国内',
    iconName: 'zhipu', logoBg: '#3859F7', logoChar: '智', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      {
        id: 'glm-5.1', name: 'GLM-5.1', ctx: '200k', maxOutput: '128k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 8, costOutput: 28, costCacheRead: 1.3, costCacheWrite: 1.3, addedBy: 'default'
      }
    ],
  },
  {
    id: 'bailian', name: '通义千问 (百炼)', desc: '阿里云百炼平台', region: '国内',
    iconName: 'bailian', logoBg: '#615CED', logoChar: '阿', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      {
        id: 'qwen3.6-plus', name: 'Qwen-3.6-Plus', ctx: '1000k', maxOutput: '100k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: false },
        costInput: 2, costOutput: 12, costCacheRead: 0.2, costCacheWrite: 0.2, addedBy: 'default'
      },

    ],
  },
  {
    id: 'moonshot', name: '月之暗面 Kimi', desc: '超长上下文，K2 系列', region: '国内',
    iconName: 'kimi', logoBg: '#000000', logoChar: 'K', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      {
        id: 'kimi-k2.6', name: 'Kimi K2.6', ctx: '256k', maxOutput: '128k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false },
        costInput: 6.5, costOutput: 27, costCacheRead: 1.1, costCacheWrite: 1.1, addedBy: 'default'
      },
    ],
  },
  {
    id: 'minimax', name: 'MiniMax', desc: '稀宇科技 abab 系列', region: '国内',
    iconName: 'minimax', logoBg: '#F23F5D', logoChar: 'M', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://api.minimax.com/v1',
    models: [
      {
        id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', ctx: '200k', maxOutput: '40k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 2.1, costOutput: 8.4, costCacheRead: 0.42, costCacheWrite: 2.625, addedBy: 'default'
      }
    ],
  },
  {
    id: 'stepfun', name: '阶跃星辰 StepFun', desc: 'Step 系列多模态模型', region: '国内',
    iconName: 'stepfun', logoBg: '#0160FF', logoChar: 'S', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://api.stepfun.com/v1',
    models: [
      {
        id: 'step-3.7-flash', name: 'Step-3.7-Flash', ctx: '256k', maxOutput: '100k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 1.35, costOutput: 8.1, costCacheRead: 0.27, costCacheWrite: 0.27, addedBy: 'default'
      },
      {
        id: 'step-3.5-flash-2603', name: 'Step-3.5-Flash', ctx: '256k', maxOutput: '100k', tier: 'balanced', enabled: false,
        capabilities: { tool_calling: false, vision: true, search: false, vector: false, reranking: false },
        costInput: 0.7, costOutput: 2.1, costCacheRead: 0.14, costCacheWrite: 0.14, addedBy: 'default'
      },
    ],
  },
  {
    id: 'siliconflow', name: '硅基流动', desc: 'SiliconCloud 模型聚合', region: '国内',
    iconName: 'siliconflow', logoBg: '#6E29F6', logoChar: '硅', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      {
        id: 'Pro/deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (Pro)', ctx: '64k', maxOutput: '8k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 2, costOutput: 8, costCacheRead: 0, costCacheWrite: 0, addedBy: 'default'
      },
    ],
  },
  {
    id: 'sense', name: '商汤 SenseNova', desc: '日日新大模型体系', region: '国内',
    iconName: 'sensenova', logoBg: '#06FDB7', logoChar: '商', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://token.sensenova.cn/v1',
    models: [
      {
        id: 'SenseNova-5', name: 'SenseNova-5', ctx: '32k', maxOutput: '4k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 16, costOutput: 16, costCacheRead: 2, costCacheWrite: 8, addedBy: 'default'
      },
      {
        id: 'SenseNova-5-Lite', name: 'SenseNova-5-Lite', ctx: '8k', maxOutput: '4k', tier: 'fast', enabled: false,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 4, costOutput: 4, costCacheRead: 0.5, costCacheWrite: 2, addedBy: 'default'
      },
      {
        id: 'SenseChat-5', name: 'SenseChat-5', ctx: '32k', maxOutput: '4k', tier: 'balanced', enabled: false,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 8, costOutput: 8, costCacheRead: 1, costCacheWrite: 4, addedBy: 'default'
      },
    ],
  },
  {
    id: 'agnes', name: 'Agnes', desc: 'Agnes全模态免费模型', region: '',
    iconName: 'agnes', logoBg: '#4D6BFE', logoChar: 'A', builtin: true,
    enabled: true, configured: false,
    apiKey: '', baseUrl: 'https://apihub.agnes-ai.com/v1',
    models: [
      {
        id: 'agnes-2.0-flash', name: 'Agnes-2.0-Flash', ctx: '256k', maxOutput: '65k', tier: 'balanced', enabled: true,
        capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false },
        costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0, addedBy: 'default'
      },

    ],
  },
  {
    id: 'doubao', name: '豆包 (字节)', desc: '字节跳动 Doubao 大模型', region: '国内',
    iconName: 'doubao', logoBg: '#1E37FC', logoChar: '豆', builtin: true,
    enabled: false, configured: false,
    apiKey: '', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      {
        id: 'doubao-1.5-pro-256k', name: 'Doubao-1.5-Pro-256k', ctx: '256k', maxOutput: '32k', tier: 'flagship', enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 4, costOutput: 16, costCacheRead: 0.4, costCacheWrite: 2, addedBy: 'default'
      },
    ],
  },
  providerPreset({
    id: 'qianfan',
    name: 'Baidu Qianfan',
    desc: 'Baidu ERNIE models, OpenAI-compatible',
    iconName: 'baidu',
    logoBg: '#2468F2',
    logoChar: 'B',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: [
      providerModel('ernie-5.1', 'ERNIE 5.1', { ctx: '128k', tier: 'balanced', enabled: true, costInput: 2, costOutput: 8 }),
    ],
  }),
  providerPreset({
    id: 'xunfei',
    name: '讯飞Mass',
    desc: 'SparkDesk models, OpenAI-compatible',
    iconName: 'spark',
    logoBg: '#C7000B',
    logoChar: 'X',
    baseUrl: 'https://maas-api.cn-huabei-1.xf-yun.com/v1',
    models: [
      providerModel('spark-x2', 'spark-x2', { ctx: '192k', tier: 'flagship', enabled: true, costInput: 3, costOutput: 3 }),
    ],
  }),

  providerPreset({
    id: 'bailian-token-plan',
    name: '百炼 Token Plan',
    desc: 'Independent Qwen entry for coding and planning',
    iconName: 'bailian',
    logoBg: '#615CED',
    logoChar: 'Q',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode',
    models: [
      providerModel('qwen3.6-plus', 'Qwen3.6-Plus', { ctx: '1000k', tier: 'flagship', enabled: false, costInput: 6, costOutput: 30, costCacheRead: 0.6, costCacheWrite: 3 }),
    ],
  }),
  providerPreset({
    id: 'minimax-token-plan',
    name: 'MiniMax Token Plan',
    desc: 'Independent MiniMax entry for coding and planning',
    iconName: 'minimax',
    logoBg: '#F23F5D',
    logoChar: 'M',
    baseUrl: 'https://api.minimax.com/v1',
    models: [
      providerModel('MiniMax-M3', 'MiniMax-M3', { ctx: '1m', maxOutput: '40k', tier: 'flagship', enabled: false, costInput: 8, costOutput: 24 }),
    ],
  }),
  providerPreset({
    id: 'sense-token-plan',
    name: '商汤Token Plan',
    desc: 'Independent SenseNova entry for coding and planning',
    iconName: 'sensenova',
    logoBg: '#06FDB7',
    logoChar: 'S',
    baseUrl: 'https://token.sensenova.cn/v1',
    models: [
      providerModel('deepseek-v4-flash', 'Deepseek-V4-Flash', { ctx: '256k', maxOutput: '64k', tier: 'flagship', enabled: true, costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 }),
      providerModel('sensenova-6.7-flash-lite', 'Sensenova-6.7-Flash-Lite', { ctx: '256k', maxOutput: '64k', tier: 'balanced', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0, capabilities: { vision: true } }),
    ],
  }),
  providerPreset({
    id: 'custom',
    name: 'Ollama',
    desc: '本地模型或自建 OpenAI-compatible 服务；Ollama 可使用任意 API Key',
    iconName: 'ollama',
    logoBg: '#111827',
    logoChar: 'O',
    baseUrl: 'http://localhost:11434/v1',
    enabled: false,
    apiKey: 'ollama',
    apiKeyOptional: false,
    local: true,
    region: '本地',
    models: [
      providerModel('qwen2.5:7b', 'Qwen2.5 7B', { ctx: '128k', tier: 'balanced', enabled: false, costInput: 0, costOutput: 0 }),
    ],
  }),

]

// IDs of built-in providers (used for merge logic / URL lock)
const BUILTIN_PROVIDER_IDS = DEFAULT_PROVIDERS.filter(p => p.builtin).map(p => p.id)

const DEFAULT_DEFAULT_MODELS = {
  chat: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  skill: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  agent: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  title: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  translation: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  embedding: encodeModelRef('zhipu', 'embedding-3'),
}

function providerConfigured(provider) {
  if (!provider) return false
  return !!provider.baseUrl && !!provider.apiKey
}

const ANSWER_STYLE_KEYS = new Set([
  'default',
  'study_partner',
  'best_friend',
  'humorous',
  'gentle_tutor',
  'strict_mentor',
  'big_sister',
  'tsundere',
  'exam_trainer',
])

function _sanitizeAnswerStyle(style) {
  return ANSWER_STYLE_KEYS.has(style) ? style : 'default'
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

function darkenHex(hex, factor = 0.85) {
  const { r, g, b } = hexToRgb(hex)
  return '#' + [r, g, b].map(c => Math.round(c * factor).toString(16).padStart(2, '0')).join('')
}

function rgbStr(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `${r},${g},${b}`
}

// Merge built-in providers into user's stored providers.
// Only built-in providers (DEFAULT_PROVIDERS) survive — unknown legacy entries
// are dropped. For each built-in, user state
// (apiKey / baseUrl / enabled) from storage is preserved. Models are
// merged by id: existing user models keep their edits, new default models
// are automatically supplemented.
function _mergeBuiltinProviders(current) {
  if (!Array.isArray(current)) return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS))
  const LEGACY_MIGRATION = { qwen: 'bailian' }
  const result = []
  for (const def of DEFAULT_PROVIDERS) {
    let existing = current.find(p => p.id === def.id)
    if (!existing) {
      const legacyId = Object.keys(LEGACY_MIGRATION).find(k => LEGACY_MIGRATION[k] === def.id)
      if (legacyId) existing = current.find(p => p.id === legacyId)
    }
    const merged = JSON.parse(JSON.stringify(def))
    if (existing) {
      merged.apiKey = existing.apiKey || def.apiKey || ''
      merged.apiKeyId = existing.apiKeyId || ''
      merged.baseUrl = def.official ? def.baseUrl : (existing.baseUrl || def.baseUrl)
      merged.enabled = existing.enabled ?? def.enabled
      merged.apiFormat = def.apiFormat || existing.apiFormat || merged.apiFormat || 'openai'
      merged.apiKeyOptional = def.apiKeyOptional ?? existing.apiKeyOptional ?? merged.apiKeyOptional
      merged.local = def.local ?? existing.local ?? merged.local
      merged.configured = providerConfigured(merged)
      // Supplement models by id: keep user's existing models, add new defaults
      if (Array.isArray(existing.models) && existing.models.length > 0) {
        const existingIds = new Set(existing.models.map(m => m.id))
        merged.models = JSON.parse(JSON.stringify(existing.models))
        for (const dm of def.models) {
          if (!existingIds.has(dm.id)) merged.models.push(JSON.parse(JSON.stringify(dm)))
        }
      }
    }
    result.push(merged)
  }
  return result
}

function _findModelRef(providers, ref) {
  const { providerId, modelId, scoped } = parseModelRef(ref)
  if (!modelId) return null

  if (scoped) {
    const provider = providers.find(p => p.id === providerId)
    const model = provider?.models?.find(m => m.id === modelId)
    return provider && model ? { provider, model, ref: encodeModelRef(provider.id, model.id) } : null
  }

  for (const provider of providers) {
    const model = provider.models?.find(m => m.id === modelId)
    if (model) return { provider, model, ref: encodeModelRef(provider.id, model.id) }
  }
  return null
}

// Reset defaultModels entries that point to models no longer present.
// Legacy values stored as plain model ids are migrated to provider-scoped refs.
function _sanitizeDefaultModels(dm, providers) {
  const out = { ...dm }
  for (const key of Object.keys(DEFAULT_DEFAULT_MODELS)) {
    const match = _findModelRef(providers, out[key])
    const fallback = _findModelRef(providers, DEFAULT_DEFAULT_MODELS[key])
    out[key] = match?.ref || fallback?.ref || DEFAULT_DEFAULT_MODELS[key]
  }
  return out
}

let _systemThemeListener = null

export const useSettingsStore = defineStore('settings', () => {
  // ─── Workspace ───
  const workDirRoot = ref('')
  const isWorkspaceReady = computed(() => !!workDirRoot.value)

  // ─── Preferences ───
  const themeMode = ref('light')
  const accentColor = ref('brand')
  const customAccentHex = ref('#4A6CFF')
  const fontSize = ref('medium')
  const langPref = ref('zh')
  const animations = ref(true)
  const reducedMotion = ref(false)
  const answerStyle = ref('default')
  const conflictStrategy = ref('ask')

  // ─── Network ───
  const proxyMode = ref('system')
  const proxyType = ref('http')
  const proxyHost = ref('127.0.0.1')
  const proxyPort = ref('7890')
  const proxyAuth = ref(false)
  const proxyUser = ref('')
  const proxyPass = ref('')

  // ─── Sandbox ───
  const maxIter = ref(100)
  const maxTaskMin = ref(30)
  const searchLimit = ref(10)
  const fileOpLimit = ref(30)
  const toolCallLimit = ref(0)
  const modelCallLimit = ref(0)
  const loopGuard = ref(true)
  const auditDays = ref(30)
  const pathRedact = ref(true)
  const allowFileDelete = ref(true)
  const deleteScope = ref('outputs-only')
  const allowExecCommand = ref(false)
  const defaultCommandWhitelist = ['echo', 'where', 'which', 'whoami', 'hostname', 'ver', 'uname', 'pwd', 'dir', 'tree', 'ls', 'type', 'more', 'cat', 'findstr', 'grep', 'fc', 'diff', 'ipconfig', 'ifconfig', 'ping', 'nslookup', 'dig']
  const defaultCommandBlacklist = ['rm -rf', 'rm -r', 'format', 'del /s', 'del /q', 'rmdir /s', 'rmdir /q', 'mkfs', 'dd', 'shutdown', 'reboot', 'reg', 'regedit', 'powershell', 'cmd']
  const commandWhitelist = ref([...defaultCommandWhitelist])
  const commandBlacklist = ref([...defaultCommandBlacklist])

  // ─── Notifications ───
  const notifyTaskDone = ref(true)
  const notifyTaskFailed = ref(true)
  const notifySound = ref(true)
  const notifySoundType = ref('complete')
  const notifyDND = ref(false)
  const autoStart = ref(false)
  const minimizeToTray = ref(true)
  const trayIcon = ref(true)
  const singleInstance = ref(true)

  // ─── LLM Config ───
  const providers = ref(JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)))
  const defaultModels = ref({ ...DEFAULT_DEFAULT_MODELS })

  // ─── Accent Color Computed ───
  const currentAccentHex = computed(() => {
    if (accentColor.value === 'custom') return customAccentHex.value
    const preset = ACCENT_PRESETS.find(p => p.key === accentColor.value)
    return preset ? preset.hex : '#4A6CFF'
  })

  const currentAccentHover = computed(() => darkenHex(currentAccentHex.value, 0.85))
  const currentAccentRgb = computed(() => rgbStr(currentAccentHex.value))

  // ─── Model Computed ───
  const enabledProviders = computed(() => providers.value.filter(p => p.enabled))
  const availableModels = computed(() => enabledProviders.value.reduce((sum, p) => sum + p.models.filter(m => m.enabled).length, 0))

  const chatModelOptions = computed(() =>
    enabledProviders.value.map(p => ({
      type: 'group', label: p.name, key: p.id,
      children: p.models.filter(m => m.tier !== 'embedding' && m.enabled).map(m => ({ label: m.name, value: encodeModelRef(p.id, m.id) })),
    }))
  )

  const embeddingModelOptions = computed(() =>
    enabledProviders.value.flatMap(p =>
      p.models.filter(m => m.tier === 'embedding' && m.enabled).map(m => ({ label: `${p.name} / ${m.name}`, value: encodeModelRef(p.id, m.id) }))
    )
  )

  const modelCapabilitiesMap = computed(() => {
    const map = {}
    for (const p of providers.value) {
      for (const m of p.models) {
        const caps = m.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false }
        map[encodeModelRef(p.id, m.id)] = caps
        if (!map[m.id]) map[m.id] = caps
      }
    }
    return map
  })

  function getModelName(ref) {
    const match = _findModelRef(providers.value, ref)
    if (!match) return ref
    const duplicate = providers.value.some(p => p.id !== match.provider.id && p.models?.some(m => m.id === match.model.id))
    return parseModelRef(ref).scoped || duplicate ? `${match.provider.name} / ${match.model.name}` : match.model.name
  }

  // ─── Apply Accent Color ───
  function applyAccentColor() {
    const hex = currentAccentHex.value
    const hover = currentAccentHover.value
    const rgb = currentAccentRgb.value
    const el = document.documentElement
    el.style.setProperty('--brand', hex)
    el.style.setProperty('--brand-hover', hover)
    el.style.setProperty('--brand-rgb', rgb)
  }

  // ─── Apply Theme Mode ───
  function applyThemeMode() {
    // Remove previous system listener
    if (_systemThemeListener) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', _systemThemeListener)
      _systemThemeListener = null
    }
    const appStore = useAppStore()

    if (themeMode.value === 'dark') {
      appStore.isDark = true
    } else if (themeMode.value === 'light') {
      appStore.isDark = false
    } else {
      // system
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      appStore.isDark = mql.matches
      _systemThemeListener = (e) => { appStore.isDark = e.matches }
      mql.addEventListener('change', _systemThemeListener)
    }
  }

  // ─── Save Preferences ───
  async function savePreference(key, value) {
    const refsMap = {
      themeMode, accentColor, customAccentHex, fontSize,
      langPref, animations, reducedMotion, answerStyle, conflictStrategy,
      proxyMode, proxyType, proxyHost, proxyPort, proxyAuth, proxyUser, proxyPass,
      maxIter, maxTaskMin, searchLimit, fileOpLimit, toolCallLimit, modelCallLimit, loopGuard, auditDays, pathRedact, allowFileDelete, deleteScope, allowExecCommand, commandWhitelist, commandBlacklist,
      notifyTaskDone, notifyTaskFailed, notifySound, notifySoundType, notifyDND,
      autoStart, minimizeToTray, trayIcon, singleInstance,
    }
    if (refsMap[key]) refsMap[key].value = value

    // Persist to DB
    if (window.electronAPI?.db) {
      try { await window.electronAPI.db.settings.set(key, JSON.stringify(value)) } catch (e) { console.error('savePreference error:', e) }
    }

    // Apply effects
    if (key === 'accentColor' || key === 'customAccentHex') applyAccentColor()
    if (key === 'themeMode') applyThemeMode()
    // Sync startup/tray/notification settings to main process
    const syncMap = {
      autoStart: window.electronAPI?.setStartup,
      minimizeToTray: window.electronAPI?.setMinimizeToTray,
      trayIcon: window.electronAPI?.setTrayIcon,
      singleInstance: window.electronAPI?.setSingleInstance,
    }
    if (syncMap[key]) {
      try {
        const result = await syncMap[key](value)
        if (result && result.ok === false) console.error(`apply ${key} failed:`, result.error)
      } catch (e) {
        console.error(`apply ${key} error:`, e)
      }
    }
  }

  async function saveProviders() {
    if (window.electronAPI?.db) {
      try { await window.electronAPI.db.settings.set('providers', JSON.stringify(providers.value)) } catch (e) { console.error('saveProviders error:', e) }
    }
  }

  async function saveDefaultModels() {
    if (window.electronAPI?.db) {
      try { await window.electronAPI.db.settings.set('defaultModels', JSON.stringify(defaultModels.value)) } catch (e) { console.error('saveDefaultModels error:', e) }
    }
  }

  // ─── Load from DB ───
  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      // getAllSettings() returns already-parsed values via parseJSON
      const all = await window.electronAPI.db.settings.getAll()
      workDirRoot.value = all.workdir_root ?? ''

      // Preferences (no JSON.parse needed — getAllSettings already parsed)
      themeMode.value = all.themeMode ?? 'dark'
      accentColor.value = all.accentColor ?? 'brand'
      customAccentHex.value = all.customAccentHex ?? '#4A6CFF'
      fontSize.value = all.fontSize ?? 'medium'
      langPref.value = all.langPref ?? 'zh'
      animations.value = all.animations ?? true
      reducedMotion.value = all.reducedMotion ?? false
      answerStyle.value = _sanitizeAnswerStyle(all.answerStyle ?? 'default')
      conflictStrategy.value = all.conflictStrategy ?? 'ask'

      // Network
      proxyMode.value = all.proxyMode ?? 'system'
      proxyType.value = all.proxyType ?? 'http'
      proxyHost.value = all.proxyHost ?? '127.0.0.1'
      proxyPort.value = all.proxyPort ?? '7890'
      proxyAuth.value = all.proxyAuth ?? false
      proxyUser.value = all.proxyUser ?? ''
      proxyPass.value = all.proxyPass ?? ''

      // Sandbox
      maxIter.value = all.maxIter ?? 100
      toolCallLimit.value = all.toolCallLimit ?? 0
      modelCallLimit.value = all.modelCallLimit ?? 0
      maxTaskMin.value = all.maxTaskMin ?? 5
      searchLimit.value = all.searchLimit ?? 10
      fileOpLimit.value = all.fileOpLimit ?? 30
      loopGuard.value = all.loopGuard ?? true
      auditDays.value = all.auditDays ?? 30
      pathRedact.value = all.pathRedact ?? true
      allowFileDelete.value = all.allowFileDelete ?? true
      deleteScope.value = all.deleteScope ?? 'outputs-only'
      allowExecCommand.value = all.allowExecCommand ?? false
      commandWhitelist.value = all.commandWhitelist ?? [...defaultCommandWhitelist]
      commandBlacklist.value = all.commandBlacklist ?? [...defaultCommandBlacklist]

      // Notifications
      notifyTaskDone.value = all.notifyTaskDone ?? true
      notifyTaskFailed.value = all.notifyTaskFailed ?? true
      notifySound.value = all.notifySound ?? true
      notifyDND.value = all.notifyDND ?? false
      autoStart.value = all.autoStart ?? false
      minimizeToTray.value = all.minimizeToTray ?? true
      trayIcon.value = all.trayIcon ?? true
      singleInstance.value = all.singleInstance ?? true

      // LLM Config (objects/arrays — already parsed by getAllSettings)
      providers.value = _mergeBuiltinProviders(all.providers ?? JSON.parse(JSON.stringify(DEFAULT_PROVIDERS)))
      defaultModels.value = _sanitizeDefaultModels(all.defaultModels ?? { ...DEFAULT_DEFAULT_MODELS }, providers.value)

      // Update configured status based on apiKey presence
      providers.value.forEach(p => { p.configured = providerConfigured(p) })
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  // ─── Workspace methods ───
  async function selectWorkspaceRoot() {
    if (!window.electronAPI?.workdir) {
      console.error('electronAPI.workdir not available')
      return { error: 'Electron API 未就绪' }
    }
    try {
      const result = await window.electronAPI.workdir.selectRoot()
      if (result && !result.error) workDirRoot.value = result.rootPath
      return result
    } catch (e) { console.error('selectWorkspaceRoot error:', e); return { error: e.message } }
  }

  async function selectDirOnly() {
    if (!window.electronAPI?.workdir) {
      console.error('electronAPI.workdir not available')
      return { error: 'Electron API 未就绪' }
    }
    try {
      const result = await window.electronAPI.workdir.selectDir()
      return result
    } catch (e) { console.error('selectDirOnly error:', e); return { error: e.message } }
  }

  async function initWorkspace(rootPath) {
    if (!window.electronAPI?.workdir) return null
    try {
      const result = await window.electronAPI.workdir.init(rootPath)
      if (result && !result.error) workDirRoot.value = result.rootPath
      return result
    } catch (e) { console.error('initWorkspace error:', e); return null }
  }

  async function getWorkspaceStatus() {
    if (!window.electronAPI?.workdir) return { initialized: false }
    return window.electronAPI.workdir.getStatus()
  }

  function getDocsPath() {
    if (!workDirRoot.value) return ''
    return workDirRoot.value.replace(/[/\\]$/, '') + '/docs'
  }

  // ─── Model Management Actions ───
  function addModelToProvider(providerId, model) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    if (p.models.find(m => m.id === model.id)) return false
    p.models.push({
      ...model,
      capabilities: model.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false },
      addedBy: model.addedBy || 'user',
      enabled: model.enabled ?? false,
      maxOutput: model.maxOutput || '?',
      costInput: model.costInput ?? 0,
      costOutput: model.costOutput ?? 0,
      costCacheRead: model.costCacheRead ?? 0,
      costCacheWrite: model.costCacheWrite ?? 0,
    })
    return true
  }

  function removeModelFromProvider(providerId, modelId) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const idx = p.models.findIndex(m => m.id === modelId)
    if (idx < 0) return false
    p.models.splice(idx, 1)
    return true
  }

  function updateModelInProvider(providerId, modelId, updates) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const m = p.models.find(m => m.id === modelId)
    if (!m) return false
    Object.assign(m, updates)
    return true
  }

  function updateModelCapabilities(providerId, modelId, capabilities) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return false
    const m = p.models.find(m => m.id === modelId)
    if (!m) return false
    m.capabilities = capabilities
    return true
  }

  function addFetchedModels(providerId, models) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p) return
    for (const model of models) {
      if (p.models.find(m => m.id === model.id)) continue
      p.models.push(normalizeFetchedModel(model, null, { enabled: false, addedBy: 'fetch' }))
    }
  }

  function syncFetchedModels(providerId, models, options = {}) {
    const p = providers.value.find(p => p.id === providerId)
    if (!p || !Array.isArray(models)) return false
    const incomingIds = new Set(models.map(m => m.id).filter(Boolean))
    let changed = false

    for (const model of models) {
      if (!model?.id) continue
      const existing = p.models.find(m => m.id === model.id)
      const normalized = normalizeFetchedModel(model, existing, {
        enabled: options.enableNew ?? false,
        addedBy: options.addedBy || 'fetch',
      })
      if (existing) Object.assign(existing, normalized, { enabled: existing.enabled ?? normalized.enabled })
      else p.models.push(normalized)
      changed = true
    }

    if (options.replaceMissing) {
      const before = p.models.length
      p.models = p.models.filter(m => incomingIds.has(m.id))
      changed = changed || before !== p.models.length
    }
    return changed
  }

  function normalizeFetchedModel(model, existing, options = {}) {
    return {
      id: model.id,
      name: model.name || existing?.name || model.id,
      ctx: model.ctx || existing?.ctx || '?',
      maxOutput: model.maxOutput || existing?.maxOutput || '?',
      tier: model.tier || existing?.tier || guessTier(model.id),
      capabilities: model.capabilities || existing?.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false },
      costInput: model.costInput ?? existing?.costInput ?? 0,
      costOutput: model.costOutput ?? existing?.costOutput ?? 0,
      costCacheRead: model.costCacheRead ?? existing?.costCacheRead ?? 0,
      costCacheWrite: model.costCacheWrite ?? existing?.costCacheWrite ?? 0,
      billingUnit: model.billingUnit || existing?.billingUnit || undefined,
      requestMinPoints: model.requestMinPoints ?? existing?.requestMinPoints ?? undefined,
      pointsPerCny: model.pointsPerCny ?? existing?.pointsPerCny ?? undefined,
      minPositiveChargePoints: model.minPositiveChargePoints ?? existing?.minPositiveChargePoints ?? undefined,
      addedBy: model.addedBy || existing?.addedBy || options.addedBy || 'fetch',
      enabled: existing?.enabled ?? options.enabled ?? false,
    }
  }

  function getProviderDefaultBaseUrl(providerId) {
    const def = DEFAULT_PROVIDERS.find(p => p.id === providerId)
    return def?.baseUrl || ''
  }

  function resetProviderBaseUrl(providerId) {
    const p = providers.value.find(p => p.id === providerId)
    const baseUrl = getProviderDefaultBaseUrl(providerId)
    if (!p || !baseUrl) return false
    p.baseUrl = baseUrl
    return true
  }

  function guessTier(modelId) {
    const id = modelId.toLowerCase()
    if (id.includes('embed') || id.includes('rerank')) return 'embedding'
    if (id.includes('mini') || id.includes('turbo') || id.includes('haiku') || id.includes('flash') || id.includes('small')) return 'fast'
    if (id.includes('plus') || id.includes('balanced') || id.includes('sonnet') || id.includes('chat') || id.includes('pro')) return 'balanced'
    return 'flagship'
  }

  return {
    // Workspace
    workDirRoot, isWorkspaceReady,
    loadFromDb, selectWorkspaceRoot, selectDirOnly, initWorkspace, getWorkspaceStatus,
    getDocsPath,
    // Preferences
    themeMode, accentColor, customAccentHex, fontSize, langPref,
    animations, reducedMotion, answerStyle, conflictStrategy,
    ACCENT_PRESETS,
    // Network
    proxyMode, proxyType, proxyHost, proxyPort, proxyAuth, proxyUser, proxyPass,
    // Sandbox
    maxIter, maxTaskMin, searchLimit, fileOpLimit, toolCallLimit, modelCallLimit, loopGuard, auditDays, pathRedact, allowFileDelete, deleteScope, allowExecCommand, commandWhitelist, commandBlacklist,
    // Notifications
    notifyTaskDone, notifyTaskFailed, notifySound, notifySoundType, notifyDND,
    autoStart, minimizeToTray, trayIcon, singleInstance,
    // LLM Config
    providers, defaultModels,
    enabledProviders, availableModels,
    chatModelOptions, embeddingModelOptions, modelCapabilitiesMap, getModelName,
    // Model management
    addModelToProvider, removeModelFromProvider, updateModelInProvider, updateModelCapabilities, addFetchedModels, syncFetchedModels, getProviderDefaultBaseUrl, resetProviderBaseUrl, guessTier, providerConfigured,
    // Computed
    currentAccentHex, currentAccentHover, currentAccentRgb,
    // Methods
    savePreference, saveProviders, saveDefaultModels,
    applyAccentColor, applyThemeMode,
  }
}, {
  persist: {
    pick: ['workDirRoot'],
  },
})
