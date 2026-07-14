import crypto from 'node:crypto'
import dns from 'node:dns'
import net from 'node:net'

function numberInRange(value, fallback, min, max) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback
}

export function normalizeWikiWebResearchSettings(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = ['mcp:exa', 'web_search_bing', 'web_search_searxng', 'web_search_tavily']
  const providerOrder = Array.isArray(raw.providerOrder)
    ? [...new Set(raw.providerOrder.map(String).filter(Boolean))]
    : [...defaults]
  for (const provider of defaults) if (!providerOrder.includes(provider)) providerOrder.push(provider)
  return {
    enabled: !!raw.enabled,
    providerOrder,
    adaptiveBudget: raw.adaptiveBudget !== false,
    simpleLimit: numberInRange(raw.simpleLimit, 3, 1, 10),
    normalLimit: numberInRange(raw.normalLimit, 5, 1, 10),
    complexLimit: numberInRange(raw.complexLimit, 8, 1, 10),
    hardLimit: numberInRange(raw.hardLimit, 10, 1, 10),
    pageReadLimit: numberInRange(raw.pageReadLimit, 12, 1, 12),
    sourceRegisterLimit: numberInRange(raw.sourceRegisterLimit, 5, 1, 5),
    autoRegisterSources: raw.autoRegisterSources !== false,
    directWriteFromSearch: false,
    privacyFilter: true,
  }
}

export function sanitizeWikiResearchQuery(value = '') {
  return String(value || '')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local-path]')
    .replace(/\\\\[^\s"']+/g, '[network-path]')
    .replace(/\bsrc_[a-z0-9_-]+\b/gi, '[source]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function isPrivateNetworkAddress(value = '') {
  const address = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  const family = net.isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 192 && b === 0 && c === 2)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224
  }
  if (family === 6) {
    if (address === '::' || address === '::1') return true
    if (/^(?:fc|fd)/.test(address) || /^fe[89ab]/.test(address) || /^ff/.test(address) || /^2001:db8/.test(address)) return true
    const mapped = address.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? isPrivateNetworkAddress(mapped) : false
  }
  return true
}

export async function assertPublicWikiWebUrl(value = '') {
  let parsed
  try {
    parsed = new URL(String(value || ''))
  } catch {
    throw new Error('A valid HTTP(S) URL is required')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) web sources are allowed')
  if (parsed.username || parsed.password) throw new Error('Web source URLs cannot contain credentials')
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Local or private network web sources are not allowed')
  }
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.promises.lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateNetworkAddress(item.address))) {
    throw new Error('Local or private network web sources are not allowed')
  }
  return parsed
}

export async function readWikiWebResponseText(response, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!response?.body?.getReader) throw new Error('Web source response body is unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let totalBytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value?.byteLength || 0
      if (totalBytes > maxBytes) {
        await reader.cancel('Web source size limit exceeded').catch(() => {})
        throw new Error(`Web source is larger than the ${Math.floor(maxBytes / (1024 * 1024))} MB fetch limit`)
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    reader.releaseLock?.()
  }
}

function tryParse(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return ''
  try { return JSON.parse(text) } catch { return text }
}

function toolPayload(result) {
  if (result?.content && Array.isArray(result.content)) {
    const text = result.content.map(item => item?.text || '').filter(Boolean).join('\n')
    return tryParse(text)
  }
  return tryParse(result)
}

function isUseful(payload) {
  if (Array.isArray(payload)) return payload.length > 0
  if (payload && typeof payload === 'object') {
    if (['error', 'not_configured', 'no_results', 'limit_reached'].includes(payload.status)) return false
    return !!(payload.results?.length || payload.data?.length || payload.url || payload.content)
  }
  return typeof payload === 'string' && /https?:\/\//i.test(payload)
}

function providerTool(entries, providerId) {
  if (providerId === 'mcp:exa') {
    return entries.find(entry => entry.providerId === providerId && /search/i.test(entry.tool?.name || entry.tool?._mcp_tool_name || ''))
      || entries.find(entry => entry.providerId === providerId)
  }
  return entries.find(entry => entry.providerId === providerId || entry.tool?.name === providerId)
}

function budgetFor(settings, complexity) {
  const requested = complexity === 'complex'
    ? settings.complexLimit
    : (complexity === 'normal' ? settings.normalLimit : settings.simpleLimit)
  return Math.min(requested, settings.hardLimit)
}

export class WikiWebResearchService {
  constructor({ settings = {}, toolEntries = [] } = {}) {
    this.settings = normalizeWikiWebResearchSettings(settings)
    this.toolEntries = toolEntries
    this.searchQueries = 0
    this.providerCalls = 0
    this.registeredSources = 0
  }

  canRegisterSource() {
    return this.registeredSources < this.settings.sourceRegisterLimit
  }

  recordRegisteredSource() {
    this.registeredSources += 1
  }

  async search({ query, complexity = 'simple', maxResults = 5, language = 'zh-CN' } = {}) {
    if (!this.settings.enabled) return { success: false, code: 'WEB_RESEARCH_DISABLED', message: 'Wiki web research is disabled' }
    const cleanQuery = sanitizeWikiResearchQuery(query)
    if (!cleanQuery) return { success: false, code: 'EMPTY_QUERY', message: 'Search query is empty after privacy filtering' }
    const budget = budgetFor(this.settings, complexity)
    if (this.searchQueries >= budget) {
      return { success: false, code: 'SEARCH_BUDGET_REACHED', message: `Search budget reached (${Math.min(budget, this.settings.hardLimit)})` }
    }
    if (this.providerCalls >= this.settings.hardLimit) {
      return { success: false, code: 'SEARCH_HARD_LIMIT_REACHED', message: `Search provider call hard limit reached (${this.settings.hardLimit})` }
    }
    this.searchQueries += 1

    const attempts = []
    for (const providerId of this.settings.providerOrder) {
      if (this.providerCalls >= this.settings.hardLimit) break
      const entry = providerTool(this.toolEntries, providerId)
      if (!entry?.tool?.invoke) {
        attempts.push({ provider: providerId, status: 'unavailable' })
        continue
      }
      this.providerCalls += 1
      try {
        const input = providerId === 'mcp:exa'
          ? { query: cleanQuery, numResults: Math.min(Math.max(Number(maxResults || 5), 1), 10) }
          : { query: cleanQuery, max_results: Math.min(Math.max(Number(maxResults || 5), 1), 10), language }
        const raw = await entry.tool.invoke(input)
        const payload = toolPayload(raw)
        if (isUseful(payload)) {
          return {
            success: true,
            query: cleanQuery,
            provider: providerId,
            results: payload,
            attempts,
            query_calls: this.searchQueries,
            provider_calls: this.providerCalls,
            search_calls: this.providerCalls,
            budget,
          }
        }
        attempts.push({ provider: providerId, status: 'no_useful_results', detail: payload })
      } catch (err) {
        attempts.push({ provider: providerId, status: 'error', message: err.message })
      }
    }
    return {
      success: false,
      code: this.providerCalls >= this.settings.hardLimit ? 'SEARCH_HARD_LIMIT_REACHED' : 'NO_WEB_RESULTS',
      message: this.providerCalls >= this.settings.hardLimit
        ? `Search provider call hard limit reached (${this.settings.hardLimit})`
        : 'No configured web search provider returned useful results',
      query: cleanQuery,
      attempts,
      query_calls: this.searchQueries,
      provider_calls: this.providerCalls,
      search_calls: this.providerCalls,
      budget,
    }
  }
}

function decodeHtmlEntities(text = '') {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(text || '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, key) => {
      if (key[0] === '#') {
        const hex = key[1]?.toLowerCase() === 'x'
        const value = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10)
        return Number.isFinite(value) ? String.fromCodePoint(value) : _
      }
      return named[key.toLowerCase()] ?? _
    })
}

export function htmlToWikiMarkdown(html = '', title = '') {
  const cleaned = String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, text) => `\n${'#'.repeat(Number(tag[1]))} ${text}\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const body = decodeHtmlEntities(cleaned)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `# ${String(title || 'Web Source').trim()}\n\n${body}`.slice(0, 500000)
}

export function webSourceId(url = '') {
  return `src_web_${crypto.createHash('sha256').update(String(url || '')).digest('hex').slice(0, 18)}`
}
