// Static configuration data extracted from the settings store.
// Provider builder functions (providerModel, providerPreset, etc.) are private.

import { encodeModelRef } from '@/utils/modelRef'

// ─── Accent Presets ───
export const ACCENT_PRESETS = [
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

export const API_FORMAT_OPENAI = 'openai'
export const API_FORMAT_OPENAI_RESPONSES = 'openai_responses'
export const API_FORMAT_ANTHROPIC = 'anthropic'

export function normalizeProviderApiFormat(apiFormat, providerId = '') {
  const value = String(apiFormat || '').trim().toLowerCase()
  if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) {
    return API_FORMAT_OPENAI_RESPONSES
  }
  if (value === API_FORMAT_ANTHROPIC) return API_FORMAT_ANTHROPIC
  if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) {
    return API_FORMAT_OPENAI
  }
  return String(providerId || '').toLowerCase() === 'anthropic' ? API_FORMAT_ANTHROPIC : API_FORMAT_OPENAI
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
    apiFormat: normalizeProviderApiFormat(apiFormat, id),
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

export const DEFAULT_PROVIDERS = [
  {
    id: 'reviva', name: 'Reviva 官方服务', desc: '官方托管模型服务，登录后按账户积分余额计费', region: '官方',
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
    desc: '商汤Token Plan系列模型',
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
  providerPreset({
    id: 'customapi',
    name: '自定义服务商',
    desc: '任意 OpenAI 兼容或 Anthropic 兼容 API；填写 Base URL 和 API Key 后手动添加模型',
    iconName: '',
    logoBg: '#6366f1',
    logoChar: '自',
    baseUrl: '',
    enabled: false,
    apiFormat: 'openai',
    region: '自定义',
    models: [],
  }),

]

// IDs of built-in providers (used for merge logic / URL lock)
export const BUILTIN_PROVIDER_IDS = DEFAULT_PROVIDERS.filter(p => p.builtin).map(p => p.id)

export const DEFAULT_DEFAULT_MODELS = {
  chat: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  skill: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  agent: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  title: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  translation: encodeModelRef('deepseek', 'deepseek-v4-flash'),
  vision: encodeModelRef('openai', 'gpt-4o'),
  embedding: encodeModelRef('zhipu', 'embedding-3'),
}

export const DEFAULT_WIKI_WEB_RESEARCH_SETTINGS = Object.freeze({
  enabled: false,
  providerOrder: ['mcp:exa', 'web_search_bing', 'web_search_searxng', 'web_search_tavily'],
  adaptiveBudget: true,
  simpleLimit: 3,
  normalLimit: 5,
  complexLimit: 8,
  hardLimit: 10,
  pageReadLimit: 12,
  sourceRegisterLimit: 5,
  autoRegisterSources: true,
  directWriteFromSearch: false,
  privacyFilter: true,
})
