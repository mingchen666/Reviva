// Pure helper functions for the agents store.
// No Vue/Pinia runtime dependencies.

export const DISABLED_CUSTOM_TOOL_TYPES = new Set(['script'])

export function normalizeNonNegativeLimit(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function hasAnyKey(obj, keys) {
  return keys.some(k => Object.prototype.hasOwnProperty.call(obj || {}, k))
}

export function normalizeCustomToolRecord(tool = {}) {
  const type = tool.type || 'api'
  const permReq = tool.permReq || tool.perm_required || (type === 'script' ? 'execCommand' : '')
  const runtimeDisabled = DISABLED_CUSTOM_TOOL_TYPES.has(type)
  return {
    ...tool,
    desc: tool.desc || tool.description || '',
    cat: tool.cat || tool.category || 'custom',
    apiUrl: tool.apiUrl || tool.api_url || '',
    scriptPath: tool.scriptPath || tool.script_path || '',
    permReq,
    archCompat: tool.archCompat || tool.arch_compat || ['react', 'plan_exec', 'hybrid'],
    responseFormat: tool.responseFormat || tool.response_format || 'JSON',
    providerConfig: tool.providerConfig || tool.provider_config || {},
    enabled: tool.enabled !== false && tool.enabled !== 0,
    runtimeDisabled,
    unsupportedReason: runtimeDisabled ? '本地脚本工具暂未开放运行' : '',
    builtin: !!tool.builtin,
  }
}

export function customToolToDbPayload(tool = {}, { partial = false } = {}) {
  const data = {}
  const put = (keys, dbKey, value) => {
    if (!partial || hasAnyKey(tool, keys)) data[dbKey] = value
  }
  const type = tool.type || 'api'

  put(['name'], 'name', tool.name || '未命名工具')
  put(['icon'], 'icon', tool.icon || 'ri-tools-line')
  put(['color'], 'color', tool.color || '#4ADE80')
  put(['cat', 'category'], 'category', tool.cat || tool.category || 'custom')
  put(['desc', 'description'], 'description', tool.desc || tool.description || '')
  put(['type'], 'type', type)
  put(['apiUrl', 'api_url'], 'api_url', tool.apiUrl || tool.api_url || '')
  put(['method'], 'method', tool.method || 'POST')
  put(['headers'], 'headers', tool.headers || {})
  put(['params'], 'params', tool.params || [])
  put(['responseFormat', 'response_format'], 'response_format', tool.responseFormat || tool.response_format || 'JSON')
  put(['scriptPath', 'script_path'], 'script_path', tool.scriptPath || tool.script_path || '')
  put(['sandbox'], 'sandbox', tool.sandbox || '')
  put(['permReq', 'perm_required', 'type'], 'perm_required', tool.permReq || tool.perm_required || (type === 'script' ? 'execCommand' : ''))
  put(['archCompat', 'arch_compat'], 'arch_compat', tool.archCompat || tool.arch_compat || ['react', 'plan_exec', 'hybrid'])
  put(['enabled'], 'enabled', tool.enabled === false || tool.enabled === 0 ? 0 : 1)
  put(['providerConfig', 'provider_config'], 'provider_config', tool.providerConfig || tool.provider_config || {})
  return data
}

export function normalizeSubAgentRecord(subAgent) {
  const aliases = new Set(Array.isArray(subAgent.aliases) ? subAgent.aliases.filter(Boolean) : [])
  if (String(subAgent.id || '').startsWith('sa_')) aliases.add(String(subAgent.id).slice(3))
  return {
    ...subAgent,
    desc: subAgent.desc || subAgent.description || '',
    description: subAgent.description || subAgent.desc || '',
    aliases: [...aliases],
    abilities: Array.isArray(subAgent.abilities) ? subAgent.abilities : [],
  }
}
