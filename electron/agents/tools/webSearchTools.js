// agents/tools/webSearchTools.js — extracted from langchainTools.js
// Web search tools: Tavily, SearXNG, Bing.

import { tool } from 'langchain'
import { z } from 'zod'
import { _toolProviderConfigs, _taskCounters, _taskLimits } from './toolContext.js'

// ── Web Search — Tavily ──────────────────────────────────────────

export const webSearchTavily = tool(
  async ({ query, max_results, language }) => {
    _taskCounters.web_search++
    if (_taskCounters.web_search > _taskLimits.web_search) {
      return JSON.stringify({ status: 'limit_reached', message: `本任务搜索次数已达上限 (${_taskLimits.web_search} 次)，请总结已有信息继续回答。` })
    }
    const config = _toolProviderConfigs.web_search_tavily || {}
    const apiKey = config.apiKey || ''
    const baseUrl = (config.baseUrl || 'https://api.tavily.com').replace(/\/+$/, '')
    const maxRes = max_results || config.userParams?.max_results || 5
    const lang = language || config.userParams?.language || 'zh-CN'

    if (!apiKey) {
      return JSON.stringify({ status: 'not_configured', message: '请先在工具设置中配置 Tavily API Key' })
    }

    try {
      // Use direct HTTP request to support custom baseUrl
      // Tavily API: POST /search with api_key in body or Authorization header
      const resp = await fetch(`${baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxRes,
          search_depth: 'basic',
          include_answer: false,
          language: lang,
        }),
      })
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        return JSON.stringify({ status: 'error', message: `HTTP ${resp.status}: ${errBody.substring(0, 200)}`, query })
      }
      const data = await resp.json()
      if (data.results) {
        const results = data.results.slice(0, maxRes).map(r => ({ title: r.title, url: r.url, snippet: r.content }))
        return JSON.stringify(results)
      }
      return JSON.stringify({ status: 'error', message: data.detail || data.error || '未知错误', query })
    } catch (e) {
      return JSON.stringify({ status: 'error', message: e.message, query })
    }
  },
  {
    name: 'web_search_tavily',
    description: '使用 Tavily 高质量搜索 API 搜索互联网。专为 AI 应用设计，支持自定义 API 地址。返回搜索结果标题、URL和摘要。',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      max_results: z.number().optional().describe('最大返回结果数，默认5'),
      language: z.string().optional().describe('搜索语言偏好，如 zh-CN / en-US'),
    }),
  },
)

// ── Web Search — SearXNG ─────────────────────────────────────────

export const webSearchSearxng = tool(
  async ({ query, max_results, language }) => {
    _taskCounters.web_search++
    if (_taskCounters.web_search > _taskLimits.web_search) {
      return JSON.stringify({ status: 'limit_reached', message: `本任务搜索次数已达上限 (${_taskLimits.web_search} 次)，请总结已有信息继续回答。` })
    }
    const config = _toolProviderConfigs.web_search_searxng || {}
    const baseUrl = (config.baseUrl || 'https://searx.be').replace(/\/+$/, '')
    const apiKey = config.apiKey || ''
    const maxRes = max_results || config.userParams?.max_results || 5
    const lang = language || config.userParams?.language || 'zh-CN'

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: lang,
      })
      const headers = { 'Accept': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      const resp = await fetch(`${baseUrl}/search?${params}`, {
        signal: AbortSignal.timeout(15000),
        headers,
      })
      const data = await resp.json()
      const results = (data.results || []).slice(0, maxRes).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
      }))
      return JSON.stringify(results)
    } catch (e) {
      return JSON.stringify({ status: 'error', message: e.message, query })
    }
  },
  {
    name: 'web_search_searxng',
    description: '使用 SearXNG 开源元搜索引擎搜索互联网。可自建实例，免费使用。部分实例需要 API Key。返回搜索结果标题、URL和摘要。',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      max_results: z.number().optional().describe('最大返回结果数，默认5'),
      language: z.string().optional().describe('搜索语言偏好，如 zh-CN / en-US'),
    }),
  },
)

// ── Web Search — Bing ─────────────────────────────────────────────

function _parseBingHtml(html, maxRes) {
  const results = []
  // Split HTML into b_algo blocks using a non-greedy approach
  // Bing wraps each organic result in <li class="b_algo">
  const blocks = html.split(/<li class="b_algo"/gi).slice(1) // skip preamble
  for (const block of blocks) {
    if (results.length >= maxRes) break
    // Find the closing </li> for this block
    const endIdx = block.indexOf('</li>')
    if (endIdx === -1) continue
    const content = block.substring(0, endIdx)

    // Extract title from <h2> — Bing wraps each result in <li class="b_algo"><h2><a href="...">
    // Some results have a <div class="b_tpcn"> with site icon/domain before the title text
    const h2Match = content.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    if (!h2Match) continue
    const h2Content = h2Match[1]
    const hrefMatch = h2Content.match(/href="([^"]+)"/i)
    if (!hrefMatch) continue
    const url = hrefMatch[1]
    // Skip non-http URLs (javascript:, /search, etc.)
    if (!url.startsWith('http')) continue
    // Iteratively strip inner <div>...</div> blocks to handle nesting (b_tpcn etc.)
    let stripped = h2Content
    let prev = ''
    while (prev !== stripped) {
      prev = stripped
      stripped = stripped.replace(/<div[^>]*>[\s\S]*?<\/div\s*>/gi, '')
    }
    const title = stripped.replace(/<[^>]+>/g, '').trim()
    if (!title) continue

    // Extract snippet — try b_caption > p first, then any <p> in the block
    let snippet = ''
    const capPMatch = content.match(/<div class="b_caption[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
    if (capPMatch) {
      snippet = capPMatch[1].replace(/<[^>]+>/g, '').trim()
    } else {
      // Fallback: first <p> in the block after the h2
      const h2End = content.indexOf('</h2>')
      const pMatch = content.substring(h2End + 5).match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      if (pMatch) snippet = pMatch[1].replace(/<[^>]+>/g, '').trim()
    }

    // Decode common HTML entities in snippet
    snippet = snippet
      .replace(/&ensp;/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .trim()

    // Remove date prefixes like "2024年5月20日 · "
    snippet = snippet.replace(/^\d{4}[年月日]+\s*[·•—–-]\s*/, '')

    results.push({ title, url, snippet })
  }
  return results
}

export const webSearchBing = tool(
  async ({ query, max_results, language }) => {
    _taskCounters.web_search++
    if (_taskCounters.web_search > _taskLimits.web_search) {
      return JSON.stringify({ status: 'limit_reached', message: `本任务搜索次数已达上限 (${_taskLimits.web_search} 次)，请总结已有信息继续回答。` })
    }
    const config = _toolProviderConfigs.web_search_bing || {}
    const maxRes = max_results || config.userParams?.max_results || 5
    const lang = language || config.userParams?.language || 'zh-CN'

    try {
      const params = new URLSearchParams({
        q: query,
        count: String(Math.min(maxRes + 5, 15)), // request extra to filter out non-http URLs
        setlang: lang,
      })
      // Use cn.bing.com directly to avoid redirect issues and get China-optimized results
      const resp = await fetch(
        'https://cn.bing.com/search?' + params,
        {
          signal: AbortSignal.timeout(15000),
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': lang + ',en;q=0.9',
          },
        },
      )
      const html = await resp.text()

      // Check if we got a real search page
      if (!html.includes('b_algo') || html.length < 5000) {
        return JSON.stringify({ status: 'error', message: 'Bing 返回了非搜索页面，可能被验证拦截', query })
      }

      const results = _parseBingHtml(html, maxRes)
      if (results.length === 0) {
        return JSON.stringify({ status: 'no_results', message: '未找到相关搜索结果', query })
      }
      return JSON.stringify(results)
    } catch (e) {
      return JSON.stringify({ status: 'error', message: e.message, query })
    }
  },
  {
    name: 'web_search_bing',
    description: '通过本地请求 Bing 搜索互联网，免费无需 API Key。返回搜索结果标题、URL和摘要。',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      max_results: z.number().optional().describe('最大返回结果数，默认5'),
      language: z.string().optional().describe('搜索语言偏好，如 zh-CN / en-US'),
    }),
  },
)

// ── Knowledge Base Search ───────────────────────────────────────

