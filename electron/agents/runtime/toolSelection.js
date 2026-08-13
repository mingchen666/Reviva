import { UNLIMITED_RECURSION_LIMIT } from './constants.js'

const DEFAULT_AGENT_TOOL_IDS = ['document_read', 'media_read']
const VISION_AGENT_TOOL_IDS = ['vision_analyze']
const CLOUD_KNOWLEDGE_TOOL_IDS = new Set(['kb_search'])

export function withDefaultAgentTools(toolIds, { modelHasVision = false, visionAvailable = modelHasVision } = {}) {
  return [...new Set([
    ...(toolIds || []),
    ...DEFAULT_AGENT_TOOL_IDS,
    ...(visionAvailable ? VISION_AGENT_TOOL_IDS : []),
  ])]
}

export function withPermissionAgentTools(toolIds, permissions = {}) {
  const ids = [...(toolIds || [])]
  if (permissions?.execCommand) ids.push('exec_command')
  if (permissions?.noteRead || permissions?.noteWrite) ids.push('note_tool')
  return [...new Set(ids)]
}

export function hasCloudKnowledgeScope(cloudContext) {
  return !!(
    (Array.isArray(cloudContext?.defaultKbIds) && cloudContext.defaultKbIds.length) ||
    (Array.isArray(cloudContext?.defaultDocIds) && cloudContext.defaultDocIds.length)
  )
}

export function withContextualAgentTools(toolIds, cloudContext, { modelHasVision = false, visionAvailable = modelHasVision } = {}) {
  const hasScope = hasCloudKnowledgeScope(cloudContext)
  const ids = withDefaultAgentTools(toolIds, { modelHasVision, visionAvailable })
    .filter(id => hasScope || !CLOUD_KNOWLEDGE_TOOL_IDS.has(id))
    .filter(id => visionAvailable || !VISION_AGENT_TOOL_IDS.includes(id))
  if (hasScope) ids.push('kb_search')
  return [...new Set(ids)]
}

export function isWebSearchToolId(toolId) {
  const id = String(toolId || '').toLowerCase()
  if (id === 'web_search' || id.startsWith('web_search_')) return true
  if (id.startsWith('mcp:')) {
    return /(search|web|browser|crawl|scrape|exa|jina|bing|tavily|searx|firecrawl|brave|serp)/i.test(id)
  }
  return false
}

export function filterWebSearchTools(toolIds, enabled = true) {
  if (enabled) return toolIds || []
  return (toolIds || []).filter(id => !isWebSearchToolId(id))
}

// A server-level MCP binding (for example `mcp:exa`) permits its own child tools,
// while a tool-level binding permits only that exact tool. This keeps skills and
// subagents from silently reintroducing a web capability the parent Agent removed.
export function restrictWebSearchToolsToBindings(toolIds, boundToolIds) {
  if (!Array.isArray(boundToolIds)) return toolIds || []
  const bindings = boundToolIds
    .map(id => String(id || '').trim().toLowerCase())
    .filter(Boolean)
  return (toolIds || []).filter((toolId) => {
    if (!isWebSearchToolId(toolId)) return true
    const id = String(toolId || '').trim().toLowerCase()
    return bindings.some(binding => id === binding || id.startsWith(`${binding}:`))
  })
}

export function normalizeNonNegativeLimit(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function recursionLimitForMaxIterations(value) {
  const maxIterations = normalizeNonNegativeLimit(value, 10)
  return maxIterations > 0 ? Math.max(maxIterations * 4, 100) : UNLIMITED_RECURSION_LIMIT
}
