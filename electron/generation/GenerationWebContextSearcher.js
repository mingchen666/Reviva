import { resetTaskCounters, setToolProviderConfig } from '../agents/langchainTools.js'
import {
  assertPublicWikiWebUrl,
  normalizeWikiWebResearchSettings,
  WikiWebResearchService,
} from '../wiki/WikiWebResearchService.js'
import { GENERATION_WEB_PROVIDERS } from './GenerationSourceScope.js'

const PAGE_READ_LIMIT = 2
const PAGE_READ_CHAR_LIMIT = 4500
const PAGE_READ_TIMEOUT_MS = 15_000

function uniqueToolIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(id => String(id || '').trim())
    .filter(Boolean))]
}

function matchesProviderBinding(toolId, providerId) {
  return toolId === providerId || toolId.startsWith(`${providerId}:`)
}

export function generationWebToolPolicy(moduleConfig = {}) {
  const boundToolIds = uniqueToolIds(moduleConfig?.tools)
  const searchProviderIds = GENERATION_WEB_PROVIDERS.filter(providerId =>
    boundToolIds.some(toolId => matchesProviderBinding(toolId, providerId)),
  )
  const mcpSearchToolIds = boundToolIds.filter(toolId =>
    searchProviderIds.some(providerId => providerId.startsWith('mcp:') && matchesProviderBinding(toolId, providerId)),
  )
  const pageReaderToolIds = boundToolIds.filter(toolId => toolId.startsWith('mcp:'))
  return {
    searchProviderIds,
    mcpSearchToolIds,
    pageReaderToolIds,
    canSearch: searchProviderIds.length > 0,
    canReadPages: pageReaderToolIds.length > 0,
  }
}

function providerOrder(provider, allowedProviders = []) {
  const defaults = uniqueToolIds(allowedProviders)
  if (!provider || provider === 'auto' || !defaults.includes(provider)) return defaults
  return [provider, ...defaults.filter(id => id !== provider)]
}

function providerEntries(localTools, mcpTools) {
  return [
    ...(localTools || []).map(tool => ({ providerId: tool.name, tool })),
    ...(mcpTools || []).map(tool => ({
      providerId: String(tool?._mcp_server_id || '').toLowerCase().includes('exa')
        ? 'mcp:exa'
        : `mcp:${tool?._mcp_server_id || 'unknown'}`,
      tool,
    })),
  ]
}

function toolName(tool) {
  return String(tool?._mcp_tool_name || tool?.name || '').toLowerCase()
}

function inputSchemaKeys(tool) {
  const schema = tool?.schema || tool?._mcp_input_schema || tool?.inputSchema || {}
  const shape = schema?.shape || schema?.properties || {}
  return Object.keys(shape || {}).map(key => String(key).toLowerCase())
}

function isPageReaderTool(tool) {
  const name = toolName(tool)
  if (!name || /(^|[_-])search([_-]|$)/i.test(name)) return false
  return /(contents?|read|crawl|scrape|extract|fetch|reader)/i.test(name)
}

function pageReaderInput(tool, url) {
  const keys = inputSchemaKeys(tool)
  const input = {}
  if (keys.includes('urls')) input.urls = [url]
  else if (keys.includes('url_list')) input.url_list = [url]
  else if (keys.includes('links')) input.links = [url]
  else if (keys.includes('url')) input.url = url
  else if (keys.includes('link')) input.link = url
  else if (keys.includes('input')) input.input = url
  else if (/contents?/i.test(toolName(tool))) input.urls = [url]
  else return null

  if (keys.includes('max_depth')) input.max_depth = 0
  if (keys.includes('maxdepth')) input.maxDepth = 0
  if (keys.includes('depth')) input.depth = 0
  if (keys.includes('limit')) input.limit = 1
  if (keys.includes('max_results')) input.max_results = 1
  if (keys.includes('maxresults')) input.maxResults = 1
  return input
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function parsePossibleJson(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function extractUrls(value, result = [], seen = new Set(), depth = 0, limit = PAGE_READ_LIMIT) {
  if (depth > 5 || result.length >= limit) return result
  if (typeof value === 'string') {
    const matches = value.match(/https?:\/\/[^\s"'<>\\]+/gi) || []
    for (const match of matches) {
      const url = normalizeUrl(match.replace(/[),.;]+$/, ''))
      if (url && !seen.has(url)) {
        seen.add(url)
        result.push(url)
      }
      if (result.length >= limit) break
    }
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      extractUrls(item, result, seen, depth + 1, limit)
      if (result.length >= limit) break
    }
    return result
  }
  if (!value || typeof value !== 'object') return result

  const directUrlKeys = ['url', 'link', 'href', 'source_url', 'sourceurl', 'canonical_url', 'canonicalurl']
  for (const [key, item] of Object.entries(value)) {
    if (directUrlKeys.includes(String(key).toLowerCase())) extractUrls(item, result, seen, depth + 1, limit)
  }
  for (const item of Object.values(value)) {
    extractUrls(item, result, seen, depth + 1, limit)
    if (result.length >= limit) break
  }
  return result
}

function extractSearchUrls(blocks = [], limit = PAGE_READ_LIMIT) {
  const urls = []
  const seen = new Set()
  for (const block of Array.isArray(blocks) ? blocks : []) {
    extractUrls(parsePossibleJson(block?.content), urls, seen, 0, limit)
    if (urls.length >= limit) break
  }
  return urls
}

function selectRequestedPageUrls(requestedUrls, candidates) {
  const candidateMap = new Map((candidates || []).map(url => [normalizeUrl(url), url]).filter(([url]) => !!url))
  const selected = []
  const seen = new Set()
  for (const raw of Array.isArray(requestedUrls) ? requestedUrls : []) {
    const normalized = normalizeUrl(raw)
    const candidate = candidateMap.get(normalized)
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    selected.push(candidate)
    if (selected.length >= PAGE_READ_LIMIT) break
  }
  return selected
}

function payloadText(payload, maxChars = PAGE_READ_CHAR_LIMIT) {
  if (typeof payload === 'string') return payload.trim().slice(0, maxChars)
  if (payload && typeof payload === 'object') {
    const preferred = payload.content || payload.text || payload.markdown || payload.data?.content || payload.data?.text
    if (typeof preferred === 'string') return preferred.trim().slice(0, maxChars)
  }
  return formatPayload(payload, maxChars).trim()
}

function hasMeaningfulPageContent(content) {
  const prose = String(content || '')
    .replace(/https?:\/\/[^\s"'<>\\]+/gi, ' ')
    .replace(/[{}\[\]"',:_]/g, ' ')
    .replace(/\b(?:url|urls|link|links|status|id|data|results?|metadata)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return prose.length >= 120
}

function titleFromText(text, fallbackUrl) {
  const heading = String(text || '').match(/^\s*#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading.slice(0, 160)
  try { return new URL(fallbackUrl).hostname } catch { return '网页资料' }
}

function retrievalRounds(moduleConfig, maxRounds = 3) {
  const configured = Number(moduleConfig?.retrieval_iterations)
  const requested = Number.isFinite(configured) ? Math.trunc(configured) : 2
  return Math.min(maxRounds, Math.max(2, requested))
}

function sourceSeed(ctxItems = [], sourceScope = {}) {
  const names = [
    ...(Array.isArray(ctxItems) ? ctxItems : []).map(item => item?.name || item?.path),
    ...(Array.isArray(sourceScope?.wikiRefs) ? sourceScope.wikiRefs : []).map(item => item?.name || item?.id),
  ]
    .map(value => String(value || '').trim().split(/[\\/]/).pop() || '')
    .map(value => value.replace(/\.[^.]+$/, '').trim())
    .filter(Boolean)
  return [...new Set(names)].slice(0, 3).join(' ')
}

function buildQueries(toolId, topic, ctxItems, sourceScope) {
  const seed = String(topic || '').trim() || sourceSeed(ctxItems, sourceScope)
  if (!seed) return []
  const suffixes = {
    qa: ['常见问题 核心概念 解释', '原理 比较 应用场景 易错点'],
    glossary: ['专业术语 定义 缩写', '概念辨析 指标 方法 易混术语'],
    cheatsheet: ['公式 关键数据 步骤 规则', '边界条件 易错点 记忆要点'],
  }
  return [...new Set([seed, ...(suffixes[toolId] || ['核心要点', '实践边界']).map(suffix => `${seed} ${suffix}`)])]
}

function normalizeRequestedQueries(value) {
  const seen = new Set()
  return (Array.isArray(value) ? value : [])
    .map(query => String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(query => {
      if (!query || seen.has(query)) return false
      seen.add(query)
      return true
    })
    .slice(0, 2)
}

function mergeProviderConfigs(stored, requested) {
  const dbConfig = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  const requestConfig = requested && typeof requested === 'object' && !Array.isArray(requested) ? requested : {}
  return { ...dbConfig, ...requestConfig }
}

function formatPayload(payload, maxChars = 6000) {
  if (typeof payload === 'string') return payload.slice(0, maxChars)
  try { return JSON.stringify(payload).slice(0, maxChars) } catch { return String(payload || '').slice(0, maxChars) }
}

function mcpToolPayload(result) {
  if (result?.content && Array.isArray(result.content)) {
    return parsePossibleJson(result.content.map(item => item?.text || '').filter(Boolean).join('\n'))
  }
  return parsePossibleJson(result)
}

export class GenerationWebContextSearcher {
  constructor({ agentService, emitProgress }) {
    this._agentService = agentService
    this._emitProgress = emitProgress
  }

  candidateUrls(searchBlocks, limit = 6) {
    return extractSearchUrls(searchBlocks, Math.min(Math.max(1, Number(limit) || 6), 12))
  }

  async search({ taskId, toolId, topic, moduleConfig, ctxItems, sourceScope, toolProviderConfigs, abortSignal, queries: requestedQueries, queryOffset = 0, maxRounds: requestedRounds, progressStart = 54 }) {
    if (!sourceScope?.web?.enabled || moduleConfig?.permissions?.webSearch !== true) return []
    const agentService = this._agentService
    if (!agentService?._buildLocalRuntimeTools || !agentService?._loadMcpToolsForRun) return []

    const policy = generationWebToolPolicy(moduleConfig)
    if (!policy.canSearch) return []
    const order = providerOrder(sourceScope.web.provider, policy.searchProviderIds)
    try {
      const config = mergeProviderConfigs(
        agentService?._db?.getSetting?.('toolProviderConfigMap'),
        toolProviderConfigs,
      )
      setToolProviderConfig(config)
      resetTaskCounters()
      const localIds = order.filter(id => !id.startsWith('mcp:'))
      const localTools = agentService._buildLocalRuntimeTools(localIds, { includeDefaults: false })
      const mcp = await agentService._loadMcpToolsForRun(policy.mcpSearchToolIds)
      const plannedQueries = normalizeRequestedQueries(requestedQueries)
      const allQueries = plannedQueries.length ? plannedQueries : buildQueries(toolId, topic, ctxItems, sourceScope)
      const availableRounds = Math.min(allQueries.length, retrievalRounds(moduleConfig))
      const offset = Math.min(availableRounds, Math.max(0, Math.trunc(Number(queryOffset) || 0)))
      const rounds = Number.isFinite(Number(requestedRounds))
        ? Math.max(1, Math.trunc(Number(requestedRounds)))
        : availableRounds - offset
      const queries = allQueries.slice(offset, Math.min(availableRounds, offset + rounds))
      const settings = normalizeWikiWebResearchSettings({
        enabled: true,
        providerOrder: order,
        simpleLimit: Math.max(1, queries.length),
        normalLimit: Math.max(1, queries.length),
        complexLimit: Math.max(1, queries.length),
        hardLimit: Math.max(4, queries.length * 2),
      })
      const research = new WikiWebResearchService({ settings, toolEntries: providerEntries(localTools, mcp?.tools) })
      const blocks = []
      for (const [index, query] of queries.entries()) {
        if (abortSignal?.aborted) break
        const roundIndex = offset + index
        this._emitProgress?.(taskId, progressStart + index * 4, `联网搜索 ${roundIndex + 1}/${availableRounds}...`)
        const result = await research.search({ query, complexity: 'simple', maxResults: 5, language: 'zh-CN', signal: abortSignal })
        if (result?.success && result.results) {
          blocks.push({ query: result.query || query, provider: result.provider || 'auto', content: formatPayload(result.results) })
        }
      }
      return blocks
    } catch (error) {
      console.warn('[GenerationWebContextSearcher] web search skipped:', error?.message || error)
      return []
    }
  }

  async readPages({ taskId, moduleConfig, sourceScope, searchBlocks, requestedUrls, toolProviderConfigs, abortSignal, progressStart = 74 }) {
    if (!sourceScope?.web?.enabled || moduleConfig?.permissions?.webSearch !== true || abortSignal?.aborted) return []
    const policy = generationWebToolPolicy(moduleConfig)
    if (!policy.canReadPages) return []
    const candidates = this.candidateUrls(searchBlocks)
    const urls = selectRequestedPageUrls(requestedUrls, candidates)
    if (!urls.length && Array.isArray(requestedUrls) && requestedUrls.length) return []
    if (!urls.length) urls.push(...candidates.slice(0, PAGE_READ_LIMIT))
    if (!urls.length) return []

    let pageTools = []
    try {
      const config = mergeProviderConfigs(
        this._agentService?._db?.getSetting?.('toolProviderConfigMap'),
        toolProviderConfigs,
      )
      setToolProviderConfig(config)
      const mcp = await this._agentService?._loadMcpToolsForRun?.(policy.pageReaderToolIds)
      pageTools = (mcp?.tools || []).filter(isPageReaderTool)
    } catch (error) {
      console.warn('[GenerationWebContextSearcher] page reader tools skipped:', error?.message || error)
    }

    const pages = []
    for (const [index, url] of urls.entries()) {
      if (abortSignal?.aborted || pages.length >= PAGE_READ_LIMIT) break
      try {
        await assertPublicWikiWebUrl(url)
      } catch (error) {
        console.warn('[GenerationWebContextSearcher] unsafe page URL skipped:', error?.message || error)
        continue
      }
      this._emitProgress?.(taskId, progressStart + index * 3, `按需读取网页 ${index + 1}/${urls.length}...`)

      const page = await this._readWithMcp(pageTools, url, abortSignal)
      if (page?.content && hasMeaningfulPageContent(page.content)) pages.push(page)
    }
    return pages
  }

  async _readWithMcp(pageTools, url, abortSignal) {
    for (const tool of pageTools) {
      if (abortSignal?.aborted) return null
      const input = pageReaderInput(tool, url)
      if (!input) continue
      const controller = new AbortController()
      const abortFromParent = () => controller.abort(abortSignal?.reason)
      let timeout = null
      try {
        abortSignal?.addEventListener?.('abort', abortFromParent, { once: true })
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort(new Error('网页读取超时'))
            reject(new Error('网页读取超时'))
          }, PAGE_READ_TIMEOUT_MS)
        })
        const raw = await Promise.race([tool.invoke(input, { signal: controller.signal }), timeoutPromise])
        const content = payloadText(mcpToolPayload(raw))
        if (!hasMeaningfulPageContent(content)) continue
        const serverId = String(tool?._mcp_server_id || 'mcp').trim()
        return {
          name: titleFromText(content, url),
          url,
          provider: `mcp:${serverId}/${toolName(tool) || 'page-read'}`,
          content,
        }
      } catch (error) {
        console.warn('[GenerationWebContextSearcher] MCP page read skipped:', error?.message || error)
      } finally {
        if (timeout) clearTimeout(timeout)
        abortSignal?.removeEventListener?.('abort', abortFromParent)
      }
    }
    return null
  }

}
