// electron/agents/langchainTools.js — LangChain tool definitions using Zod schemas
// Custom tools for DeepAgents that supplement the built-in filesystem tools
// DeepAgents provides ls/read_file/write_file/edit_file/glob/grep via FilesystemBackend natively

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { tool } from 'langchain'
import { z } from 'zod'
import { create, all } from 'mathjs'
import { ToolsetRegistry } from '../tools/ToolsetRegistry.js'
import { createFfmpegTool } from '../tools/FfmpegToolService.js'
import { createPandocTool } from '../tools/PandocToolService.js'
import { createManimTool } from '../tools/ManimToolService.js'
import { createOfficeWriteTool } from '../tools/officecli/index.js'
import { PptxExportService } from '../PptxExportService.js'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../officeCliResolver.js'
import { getSystemEnv } from '../systemEnv.js'
import { SAFE_COMMAND_TOOL_DESCRIPTION, runSafeCommand, runSafeStructuredCommand, validateSafeCommand } from '../security/SafeCommandRunner.js'
import { createVfsPathResolver } from '../security/VfsPathResolver.js'

// Restricted mathjs instance — import/createUnit/evaluate/parse banned for safety
const math = create(all)
math.import({
  import: function () { throw new Error('Function import is disabled') },
  createUnit: function () { throw new Error('Function createUnit is disabled') },
  reviver: function () { throw new Error('Function reviver is disabled') },
}, { override: true })

// Per-agent tool provider config: { web_search_tavily: { apiKey, baseUrl, userParams }, ... }
let _toolProviderConfigs = {}

// WorkDirService injection for delete_file path validation
let _workDirService = null
// DatabaseService injection for reading security settings
let _dbService = null
let _wikiService = null
let _mcpService = null
let _toolRunContext = { agentEnglishName: '_shared', permissions: {} }
const _toolsetRegistry = new ToolsetRegistry()

// Per-task invocation counters (reset per agent run)
// All search tools share a combined counter
let _taskCounters = { web_search: 0, file_op: 0 }
let _taskLimits = { web_search: 10, file_op: 30 }

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
  }
}

// Cloud API context for kb_search: { baseUrl, token, defaultKbIds, defaultDocIds }
let _cloudCtx = { baseUrl: '', token: '', defaultKbIds: [], defaultDocIds: [] }
export function setCloudContext(ctx) {
  _cloudCtx = {
    baseUrl: ctx?.baseUrl || '',
    token: ctx?.token || '',
    defaultKbIds: Array.isArray(ctx?.defaultKbIds) ? ctx.defaultKbIds : [],
    defaultDocIds: Array.isArray(ctx?.defaultDocIds) ? ctx.defaultDocIds : [],
  }
}

export function resetTaskCounters() {
  _taskCounters = { web_search: 0, file_op: 0 }
  // Read limits from DB settings
  const searchLimit = _dbService?.getSetting('searchLimit')
  const fileOpLimit = _dbService?.getSetting('fileOpLimit')
  if (searchLimit && searchLimit !== '10') _taskLimits.web_search = Number(searchLimit) || 10
  if (fileOpLimit && fileOpLimit !== '30') _taskLimits.file_op = Number(fileOpLimit) || 30
}

// ── Execution Tool ──────────────────────────────────────────────

let _execCommandConfig = { whitelist: null, blacklist: null }
export function setExecCommandConfig(config) {
  _execCommandConfig = config || { whitelist: null, blacklist: null }
}

function _safeCommandContext() {
  return {
    dbService: _dbService,
    workDirService: _workDirService,
    execConfig: _execCommandConfig,
    vfsResolver: _vfsResolver(),
    vfsContext: _vfsContext(),
  }
}

function _validateCommand(command) {
  return validateSafeCommand(command, _safeCommandContext())
}

function _execCommandUnavailableMessage() {
  const toolIds = new Set(_toolRunContext.toolIds || [])
  if (!toolIds.has('exec_command')) {
    return '当前 Agent 未绑定“执行命令(exec_command)”工具，不能执行 shell 命令。请先在 Agent 工具中启用“执行命令”。'
  }
  const permissions = _toolRunContext.permissions || {}
  if (Object.prototype.hasOwnProperty.call(permissions, 'execCommand') && !permissions.execCommand) {
    return '当前 Agent 未开启 execCommand 权限，不能执行 shell 命令。请先在 Agent 权限中开启“执行命令”。'
  }
  return ''
}

export async function invokeCommandCompatibilityTool(input = {}, sourceTool = 'execute') {
  const unavailable = _execCommandUnavailableMessage()
  if (unavailable) {
    return JSON.stringify({
      status: 'unavailable',
      source_tool: sourceTool,
      message: unavailable,
    })
  }

  const args = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : { command: String(input || '') }

  if (args.cmd) {
    const result = await runSafeStructuredCommand({
      cmd: args.cmd,
      args: Array.isArray(args.args) ? args.args : [],
      cwd: args.cwd,
    }, _safeCommandContext())
    return JSON.stringify({ ...result, routed_from: sourceTool })
  }

  const command = args.command || ''
  if (!command) {
    return JSON.stringify({
      status: 'error',
      source_tool: sourceTool,
      message: `${sourceTool}: missing command or cmd`,
    })
  }
  const result = await runSafeCommand(command, _safeCommandContext())
  return JSON.stringify({ ...result, routed_from: sourceTool })
}

function _vfsResolver() {
  return _workDirService ? createVfsPathResolver({ workDirService: _workDirService }) : null
}

function _vfsContext(extra = {}) {
  const wikiContext = _toolRunContext.wikiContext || {}
  return {
    agentDirName: _toolRunContext.agentEnglishName || '_shared',
    boundSkillIds: _toolRunContext.boundSkillIds || [],
    allowedWikiIds: Array.isArray(wikiContext.wikiIds) ? wikiContext.wikiIds.filter(Boolean) : [],
    wikiContext,
    ...extra,
  }
}

function _resolveVfsPath(inputPath, op, toolName) {
  const resolver = _vfsResolver()
  if (!resolver) throw new Error('No workspace initialized')
  return resolver.resolve(inputPath, _vfsContext({ op, toolName }))
}

function _toVirtualWorkspacePath(absPath) {
  const resolver = _vfsResolver()
  if (resolver) return resolver.toVirtualPath(absPath, _vfsContext({ op: 'read' }))
  const root = _workDirService?.getRootPath?.()
  if (!root) return absPath.replace(/\\/g, '/')
  const rel = path.relative(root, absPath).replace(/\\/g, '/')
  return rel && !rel.startsWith('..') ? '/' + rel : absPath.replace(/\\/g, '/')
}

export const execCommand = tool(
  async ({ command, cmd, args, cwd }) => {
    const unavailable = _execCommandUnavailableMessage()
    if (unavailable) {
      return JSON.stringify({ status: 'unavailable', message: unavailable })
    }
    if (cmd) {
      const result = await runSafeStructuredCommand({ cmd, args, cwd }, _safeCommandContext())
      return JSON.stringify(result)
    }
    if (!command) throw new Error('exec_command: missing command or cmd')

    const result = await runSafeCommand(command, _safeCommandContext())
    return JSON.stringify(result)
  },
  {
    name: 'exec_command',
    description: SAFE_COMMAND_TOOL_DESCRIPTION,
    schema: z.object({
      command: z.string().optional().describe('兼容旧版：要执行的单条 shell 命令字符串。推荐改用 cmd/args/cwd。'),
      cmd: z.string().optional().describe('推荐：命令名，如 pnpm、node、python、git。不包含参数。'),
      args: z.array(z.string()).optional().describe('推荐：命令参数数组。文件路径请使用 /project、/docs、/context、/agents/... 虚拟路径。'),
      cwd: z.string().optional().describe('推荐：工作目录虚拟路径，如 /project 或 /agents/{agent}/outputs/YYYY-MM-DD。默认 /。'),
    }),
  },
)

const commandCompatibilitySchema = z.object({
  command: z.string().optional().describe('兼容输入：要执行的命令字符串。'),
  cmd: z.string().optional().describe('兼容输入：命令名。'),
  args: z.array(z.string()).optional().describe('兼容输入：命令参数数组。'),
  cwd: z.string().optional().describe('兼容输入：工作目录虚拟路径。'),
  description: z.string().optional().describe('兼容部分模型传入的说明字段，会被忽略。'),
})

function createHiddenCommandCompatibilityTool(name) {
  return tool(
    async (input) => invokeCommandCompatibilityTool(input, name),
    {
      name,
      description: 'Reviva 内部兼容工具。不要主动调用；命令执行请使用 exec_command。',
      schema: commandCompatibilitySchema,
    },
  )
}

export const hiddenCommandCompatibilityTools = [
  createHiddenCommandCompatibilityTool('bash'),
  createHiddenCommandCompatibilityTool('command'),
  createHiddenCommandCompatibilityTool('shell'),
]

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

const DEFAULT_KB_SEARCH_MODES = ['vector', 'fulltext', 'graph', 'summary']

function _cloudSearchQueryUrl(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/api\/v1\/app$/i.test(root)) return `${root}/search/query`
  if (/\/api\/v1$/i.test(root)) return `${root}/app/search/query`
  return `${root}/api/v1/app/search/query`
}

function _normalizeSearchTopK(topK) {
  const n = Number(topK)
  if (!Number.isFinite(n)) return 5
  return Math.min(100, Math.max(1, Math.trunc(n)))
}

function _formatSearchErrorDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object') {
    if (detail.code === 'INSUFFICIENT_POINTS') {
      return `积分不足：本次需要 ${detail.required_points ?? '-'}，当前余额 ${detail.points_balance ?? '-'}`
    }
    return detail.message || detail.error || detail.code || JSON.stringify(detail)
  }
  return String(detail)
}

export const kbSearch = tool(
  async ({ query, kb_ids, doc_ids, top_k, search_mode, search_modes, rerank, save_to_history }) => {
    const ctx = _cloudCtx
    if (!ctx.baseUrl || !ctx.token) {
      return JSON.stringify({
        status: 'unavailable',
        message: '云端知识库未登录或未配置 baseUrl。请用户先登录 Reviva 账号。',
      })
    }
    const hasSelectedScope = ctx.defaultKbIds.length || ctx.defaultDocIds.length
    if (!hasSelectedScope) {
      return JSON.stringify({
        status: 'unavailable',
        message: '当前未选择云端知识库或知识库文档，不能进行知识库检索。请用户先在侧边栏选择知识库范围。',
      })
    }
    const effectiveKbIds = (Array.isArray(kb_ids) && kb_ids.length) ? kb_ids : ctx.defaultKbIds
    const effectiveDocIds = (Array.isArray(doc_ids) && doc_ids.length) ? doc_ids : ctx.defaultDocIds
    const payload = {
      query,
      top_k: _normalizeSearchTopK(top_k),
      rerank: !!rerank,
      save_to_history: !!save_to_history,
    }
    if (effectiveKbIds.length) payload.kb_ids = effectiveKbIds
    if (effectiveDocIds.length) payload.doc_ids = effectiveDocIds
    if (Array.isArray(search_modes) && search_modes.length) payload.search_modes = search_modes
    else if (search_mode) payload.search_mode = search_mode
    else payload.search_modes = DEFAULT_KB_SEARCH_MODES

    try {
      const url = _cloudSearchQueryUrl(ctx.baseUrl)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ctx.token}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let body = null
        try { body = await res.json() } catch (_) {}
        const detail = body?.detail || body?.message || body?.error || ''
        return JSON.stringify({
          status: 'error',
          httpStatus: res.status,
          message: _formatSearchErrorDetail(detail) || `搜索请求失败 (HTTP ${res.status})`,
          detail,
        })
      }
      const data = await res.json()
      return JSON.stringify({
        status: 'ok',
        query: data?.query,
        scope: data?.scope,
        result: data?.result,
        charged_points: data?.charged_points,
        points_balance: data?.points_balance,
      })
    } catch (e) {
      return JSON.stringify({ status: 'error', message: e?.message || '网络错误' })
    }
  },
  {
    name: 'kb_search',
    description: '在云端知识库中检索相关内容。用户选择云端知识库或云端知识库文档后，必须用此工具获取内容；不要改用 read_file/file_read/office_read/pdf_read 读取云端知识库。通常只传 query，系统会自动使用当前选择的 kb_ids/doc_ids。默认 top_k=5；可根据任务用不同 query 多次检索，只有问题范围较宽、用户要求更全面或命中不足时才适度上调 top_k。',
    schema: z.object({
      query: z.string().describe('检索查询语句'),
      kb_ids: z.array(z.string()).optional().describe('限定知识库 ID 列表；不传则使用用户当前选择的范围'),
      doc_ids: z.array(z.string()).optional().describe('限定文档 ID 列表；不传则不限'),
      top_k: z.number().int().min(1).max(100).optional().describe('返回条数；不传默认 5。一般保持 5；复杂或宽泛问题可用 8-10，只有用户明确要求大量结果时才更高'),
      search_mode: z.enum(['vector', 'fulltext', 'graph', 'summary', 'vision', 'hybrid']).optional()
        .describe('单选检索模式；通常不需要传，默认使用 search_modes 的四种混合检索'),
      search_modes: z.array(z.enum(['vector', 'fulltext', 'graph', 'summary', 'vision'])).optional()
        .describe('检索模式组合；不传默认 vector/fulltext/graph/summary，不默认启用 vision'),
      rerank: z.boolean().optional().describe('是否对结果重排，默认 false'),
      save_to_history: z.boolean().optional().describe('是否保存检索历史，默认 false'),
    }),
  },
)

// ── Calculator ──────────────────────────────────────────────────
// Powered by mathjs: arithmetic, scientific functions, statistics, unit conversion,
// combinatorics, constants. Single expression entry point — let the LLM compose
// the right mathjs syntax based on the description below.

export const calculator = tool(
  async ({ expression }) => {
    if (!expression) throw new Error('calculator: missing expression')
    try {
      const raw = math.evaluate(expression)
      // Normalize result: BigNumber / Unit / Matrix / Complex → string via mathjs format
      let result
      if (raw === null || raw === undefined) {
        result = String(raw)
      } else if (typeof raw === 'number' || typeof raw === 'boolean') {
        result = raw
      } else if (typeof raw === 'string') {
        result = raw
      } else if (raw && typeof raw.toString === 'function') {
        result = math.format(raw, { precision: 14 })
      } else {
        result = String(raw)
      }
      return JSON.stringify({ expression, result })
    } catch (err) {
      throw new Error(`calculator error: ${err.message}`)
    }
  },
  {
    name: 'calculator',
    description: [
      '科学计算器，基于 mathjs 表达式求值。一个 expression 字段即可表达所有计算。支持：',
      '• 基础运算：2+3*4、2^10、(5-1)/2',
      '• 科学函数：sin(45 deg)、cos(pi/2)、log(100, 10)、ln(e)、exp(1)、sqrt(16)、abs(-5)、pow(2,8)',
      '• 统计与概率：mean([1,2,3,4,5])、median(...)、std(...)、variance(...)、sum(...)、min/max(...)、combinations(10,3)、permutations(10,3)、factorial(5)',
      '• 单位换算：12 inch to cm、5 km/h to m/s、100 fahrenheit to celsius、1 kJ to kcal、30 degC to K',
      '• 常量：pi、e、tau、phi、i',
      '• 矩阵与复数：[[1,2],[3,4]] * [[5],[6]]、(2+3i) * (4-i)',
      '注意角度计算需带 deg（如 sin(30 deg)），否则按弧度处理。返回 JSON {expression, result}。',
    ].join('\n'),
    schema: z.object({
      expression: z.string().describe('mathjs 表达式，如 "sin(45 deg) + sqrt(2)"、"mean([1,2,3,4])"、"12 inch to cm"'),
    }),
  },
)

// ── Delete File (with safety constraints) ───────────────────────

function _hasPathSegment(filePath, segment) {
  const expected = String(segment || '').toLowerCase()
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .some(part => part.toLowerCase() === expected)
}

export const deleteFile = tool(
  async ({ path: filePath }) => {
    if (!_workDirService) return JSON.stringify({ error: 'No workspace initialized' })

    // Check file op limit
    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return JSON.stringify({ error: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` })
    }

    // Check global security settings from DB
    const allowFileDelete = _dbService?.getSetting('allowFileDelete') ?? true
    if (!allowFileDelete) {
      return JSON.stringify({ error: '安全限制：文件删除功能已被全局禁用。请在设置 > 沙箱保护 > Agent 安全策略中开启"允许文件删除"。' })
    }

    const deleteScope = _dbService?.getSetting('deleteScope') ?? 'outputs-only'

    let resolved
    let virtualPath = filePath
    try {
      const vfsPath = _resolveVfsPath(filePath, 'delete', 'delete_file')
      resolved = vfsPath.realPath
      virtualPath = vfsPath.virtualPath
    } catch (e) {
      return JSON.stringify({ error: `安全限制：${e.message}，只能删除当前 Agent 输出目录内的文件` })
    }

    const normalized = resolved.replace(/\\/g, '/').toLowerCase()

    // Safety: protect app metadata, memory, skills, memories directories — always enforced
    if (normalized.includes('/.reviva/') || normalized.includes('/memory/') || normalized.includes('/skills/') || normalized.includes('/memories/')) {
      return JSON.stringify({ error: '安全限制：不能删除系统目录、记忆目录或技能目录下的文件' })
    }

    // Enforce deleteScope setting
    if (deleteScope === 'outputs-only') {
      // Allow deleting files under any authorized directory segment named outputs,
      // e.g. /agents/{name}/outputs/... or /context/{task}/outputs/...
      if (!_hasPathSegment(resolved, 'outputs')) {
        return JSON.stringify({ error: '安全限制：当前删除范围设置为"仅 outputs/ 目录"，只能删除任意层级 outputs/ 目录内的文件或目录。如需更宽范围请在设置中调整。' })
      }
    }
    // VFS policy keeps Agent deletes scoped to this agent's outputs even if the legacy setting says workspace.

    try {
      const stat = fs.statSync(resolved)
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true })
      } else {
        fs.unlinkSync(resolved)
      }
      return JSON.stringify({ success: true, path: virtualPath, message: `已删除: ${virtualPath}` })
    } catch (err) {
      return JSON.stringify({ error: `删除失败: ${err.message}` })
    }
  },
  {
    name: 'delete_file',
    description: '删除当前 Agent 输出目录内的文件或目录。受全局安全设置约束，系统目录、记忆目录、技能目录始终受保护。此操作需要用户授权确认。',
    schema: z.object({
      path: z.string().describe('要删除的文件路径'),
    }),
  },
)

// ── Office Read (officecli, read-only) ──────────────────────────

const OFFICE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const OFFICE_MODES = new Set(['overview', 'text', 'outline', 'stats', 'issues', 'images'])
const OFFICE_DEFAULT_MAX_CHARS = 40000
const OFFICE_MAX_CHARS = 80000
const OFFICE_DEFAULT_MAX_LINES = 100
const OFFICE_MAX_LINES = 300

function _clipText(text, maxChars) {
  const content = String(text || '')
  if (content.length <= maxChars) return { content, truncated: false }
  return { content: content.slice(0, maxChars), truncated: true }
}

function _parseOfficeCliOutput(stdout, stderr) {
  const raw = (stdout || stderr || '').trim()
  if (!raw) return { raw: '', structured: null }
  try {
    return { raw, structured: JSON.parse(raw) }
  } catch {
    return { raw, structured: null }
  }
}

function _collectOfficeImagePaths(value, results = []) {
  if (!value) return results
  if (Array.isArray(value)) {
    for (const item of value) _collectOfficeImagePaths(item, results)
    return results
  }
  if (typeof value !== 'object') return results
  const itemPath = value.path || value.Path || value.domPath || value.dom_path
  const type = String(value.type || value.kind || value.nodeType || value.element || '').toLowerCase()
  if (itemPath && (!type || type.includes('picture') || type.includes('image') || type.includes('pic'))) {
    results.push({
      path: String(itemPath),
      name: String(value.name || value.alt || value.title || ''),
      width: value.width || value.w || '',
      height: value.height || value.h || '',
      relId: value.relId || value.rId || value.relationshipId || '',
    })
  }
  for (const item of Object.values(value)) _collectOfficeImagePaths(item, results)
  return results
}

function _parseOfficeImageQueryOutput(stdout, stderr = '') {
  const parsed = _parseOfficeCliOutput(stdout, stderr)
  const items = _collectOfficeImagePaths(parsed.structured)
  const raw = parsed.raw || String(stdout || stderr || '')
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    const match = text.match(/^(\/\S+)\s+\((picture|image|pic)\)\b/i) || text.match(/^(\/\S+)/)
    if (!match) continue
    const nameMatch = text.match(/\bname=("[^"]+"|'[^']+'|\S+)/i)
    const widthMatch = text.match(/\bwidth=([^\s]+)/i)
    const heightMatch = text.match(/\bheight=([^\s]+)/i)
    const relIdMatch = text.match(/\brelId=([^\s]+)/i)
    items.push({
      path: match[1],
      name: nameMatch ? nameMatch[1].replace(/^["']|["']$/g, '') : '',
      width: widthMatch ? widthMatch[1] : '',
      height: heightMatch ? heightMatch[1] : '',
      relId: relIdMatch ? relIdMatch[1] : '',
    })
  }
  const seen = new Set()
  return items.filter(item => item.path && !seen.has(item.path) && seen.add(item.path))
}

async function _getOfficeCliEnv() {
  try {
    return getOfficeCliSpawnEnv(await getSystemEnv())
  } catch {
    return getOfficeCliSpawnEnv(process.env)
  }
}

async function _spawnOfficeCli(command, args, { timeoutMs = 20000, maxBuffer = 2 * 1024 * 1024, shell = true, label = '' } = {}) {
  const env = await _getOfficeCliEnv()
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell,
      windowsHide: true,
      env,
    })
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'officecli timeout', via: label })
    }, timeoutMs)

    child.stdout.on('data', d => append(stdoutChunks, d))
    child.stderr.on('data', d => append(stderrChunks, d))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message, via: label }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      via: label,
    }))
  })
}

async function _runOfficeCli(args, options = {}) {
  const attempts = getOfficeCliCommandCandidates(args)
  let lastResult = { code: 127, stdout: '', stderr: 'officecli not found' }
  let bundledFailure = null
  for (const attempt of attempts) {
    const result = await _spawnOfficeCli(attempt.cmd, attempt.args, {
      ...options,
      shell: attempt.shell !== false,
      label: attempt.label,
    })
    lastResult = result
    if (_isOfficeCliNotFound(result)) continue
    if (attempt.source === 'bundled' && result.code !== 0) {
      bundledFailure = result
      continue
    }
    return result
  }
  return bundledFailure || lastResult
}

async function _runOfficeCliWithRetry(args, options = {}, retries = 1) {
  let result = await _runOfficeCli(args, options)
  for (let attempt = 0; attempt < retries && [124, 127].includes(result.code); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250))
    result = await _runOfficeCli(args, options)
  }
  return result
}

function _isOfficeCliNotFound(result) {
  if (result.code === 127) return true
  const out = `${result.stdout || ''}\n${result.stderr || ''}`
  return [
    /is not recognized as an internal or external command/i,
    /command not found/i,
    /不是内部或外部命令/,
    /系统找不到/,
    /no such file or directory/i,
  ].some(re => re.test(out))
}

async function _runOfficeView(resolvedPath, mode, options = {}) {
  const args = ['view', resolvedPath, mode, '--json']
  if (mode === 'text') {
    if (options.start) args.push('--start', String(options.start))
    if (options.end) args.push('--end', String(options.end))
    if (options.maxLines) args.push('--max-lines', String(options.maxLines))
  }
  if (mode === 'issues') {
    args.push('--limit', String(Math.min(Number(options.maxLines) || 50, 100)))
  }
  return _runOfficeCli(args)
}

function _officeError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

export const officeRead = tool(
  async ({ path: filePath, mode = 'overview', start, end, maxLines, maxChars }) => {
    if (!_workDirService) {
      return _officeError('NO_WORKSPACE', '未初始化工作空间，无法读取 Office 文档。')
    }

    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return _officeError('FILE_OP_LIMIT_REACHED', `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。`)
    }

    if (!filePath) return _officeError('MISSING_PATH', 'office_read 缺少 path 参数。')

    let resolved
    let virtualPath
    try {
      const vfsPath = _resolveVfsPath(filePath, 'read', 'office_read')
      resolved = vfsPath.realPath
      virtualPath = vfsPath.virtualPath
    } catch (e) {
      return _officeError('PATH_NOT_ALLOWED', `安全限制：${e.message}，只能读取授权目录内的文件。`)
    }

    const ext = path.extname(resolved).toLowerCase()
    if (!OFFICE_EXTS.has(ext)) {
      return _officeError('UNSUPPORTED_OFFICE_FORMAT', 'office_read 仅支持 .docx、.xlsx、.pptx 文件。', { path: filePath })
    }
    if (!fs.existsSync(resolved)) {
      return _officeError('FILE_NOT_FOUND', '文件不存在。', { path: filePath })
    }

    const safeMode = OFFICE_MODES.has(mode) ? mode : 'overview'
    const safeMaxChars = Math.min(Math.max(Number(maxChars) || OFFICE_DEFAULT_MAX_CHARS, 1000), OFFICE_MAX_CHARS)
    const safeMaxLines = Math.min(Math.max(Number(maxLines) || OFFICE_DEFAULT_MAX_LINES, 1), OFFICE_MAX_LINES)
    const safeStart = Math.max(Number(start) || 1, 1)
    const safeEnd = end ? Math.max(Number(end), safeStart) : undefined
    const format = ext.slice(1)

    const versionCheck = await _runOfficeCliWithRetry(['--version'], { timeoutMs: 5000, maxBuffer: 64 * 1024 }, 1)
    if (versionCheck.code === 127) {
      return _officeError(
        'OFFICECLI_NOT_INSTALLED',
        '读取 Office 文档需要 officecli。请到 设置 > 环境检测 检查本机或内置 officecli。',
        { path: virtualPath, format },
      )
    }
    if (versionCheck.code !== 0) {
      return _officeError('OFFICECLI_UNAVAILABLE', 'officecli 当前不可用，无法读取 Office 文档。', {
        path: virtualPath,
        format,
        detail: (versionCheck.stderr || versionCheck.stdout || '').slice(0, 1000),
      })
    }

    if (safeMode === 'overview') {
      const stats = await _runOfficeView(resolved, 'stats')
      const outline = await _runOfficeView(resolved, 'outline')
      if (stats.code !== 0 && outline.code !== 0) {
        return _officeError('OFFICECLI_READ_FAILED', 'officecli 无法读取该 Office 文档。', {
          path: virtualPath,
          format,
          detail: (stats.stderr || outline.stderr || '').slice(0, 1200),
        })
      }

      const parsedStats = _parseOfficeCliOutput(stats.stdout, stats.stderr)
      const parsedOutline = _parseOfficeCliOutput(outline.stdout, outline.stderr)
      const combined = [
        parsedStats.raw ? `## Stats\n${parsedStats.raw}` : '',
        parsedOutline.raw ? `## Outline\n${parsedOutline.raw}` : '',
      ].filter(Boolean).join('\n\n')
      const clipped = _clipText(combined, safeMaxChars)
      return JSON.stringify({
        success: true,
        path: virtualPath,
        format,
        mode: safeMode,
        content: clipped.content,
        structured: clipped.truncated ? null : { stats: parsedStats.structured, outline: parsedOutline.structured },
        truncated: clipped.truncated,
        next: { mode: 'text', start: 1, maxLines: safeMaxLines, maxChars: safeMaxChars },
        note: '默认只返回结构概览。需要正文时请按 next 分段调用 office_read(mode="text")，不要一次性读取全文。',
      })
    }

    if (safeMode === 'images') {
      const queryItems = []
      const errors = []
      for (const selector of ['picture', 'image']) {
        const result = await _runOfficeCli(['query', resolved, selector, '--json'], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
        if (result.code === 0) {
          queryItems.push(..._parseOfficeImageQueryOutput(result.stdout, result.stderr))
        } else {
          const textResult = await _runOfficeCli(['query', resolved, selector], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
          if (textResult.code === 0) queryItems.push(..._parseOfficeImageQueryOutput(textResult.stdout, textResult.stderr))
          else errors.push({ selector, detail: (result.stderr || result.stdout || textResult.stderr || textResult.stdout || '').slice(0, 600) })
        }
      }
      const seen = new Set()
      const images = queryItems.filter(item => item.path && !seen.has(item.path) && seen.add(item.path))
      return JSON.stringify({
        success: true,
        path: virtualPath,
        format,
        mode: safeMode,
        images,
        image_count: images.length,
        errors,
        note: '图片路径是 officecli DOM path，可用于定位嵌入图片；Wiki 来源解析会自动提取并登记图片资产。',
      })
    }

    const result = await _runOfficeView(resolved, safeMode, {
      start: safeStart,
      end: safeEnd,
      maxLines: safeMaxLines,
    })
    if (result.code !== 0) {
      return _officeError('OFFICECLI_READ_FAILED', 'officecli 读取失败。', {
        path: virtualPath,
        format,
        mode: safeMode,
        detail: (result.stderr || result.stdout || '').slice(0, 1200),
      })
    }

    const parsed = _parseOfficeCliOutput(result.stdout, result.stderr)
    const clipped = _clipText(parsed.raw, safeMaxChars)
    const nextStart = safeMode === 'text' ? safeStart + safeMaxLines : null
    const hasContent = clipped.content.trim().length > 0
    return JSON.stringify({
      success: true,
      path: virtualPath,
      format,
      mode: safeMode,
      content: clipped.content,
      structured: clipped.truncated ? null : parsed.structured,
      truncated: clipped.truncated,
      next: safeMode === 'text' && hasContent && (clipped.truncated || safeMaxLines)
        ? { mode: 'text', start: nextStart, maxLines: safeMaxLines, maxChars: safeMaxChars }
        : null,
    })
  },
  {
    name: 'office_read',
    description: [
      '读取 Office 文档的受控工具，支持 .docx、.xlsx、.pptx。不要用 read_file 读取 Office 文件。',
      '默认 mode=overview，只返回结构概览和下一步建议，避免长文档撑爆上下文。',
      '需要正文时使用 mode=text，并用 start/maxLines 分段读取。还支持 outline、stats、issues。',
      '依赖本机或随应用内置的 officecli；不可用时会返回 OFFICECLI_NOT_INSTALLED。',
    ].join('\n'),
    schema: z.object({
      path: z.string().describe('Office 文件路径，必须位于授权工作空间内。'),
      mode: z.enum(['overview', 'text', 'outline', 'stats', 'issues', 'images']).optional().describe('读取模式。默认 overview；正文用 text 分段读取；images 只列出嵌入图片 DOM 路径。'),
      start: z.number().optional().describe('text/html 等支持分页/分段模式的起始位置，默认 1。'),
      end: z.number().optional().describe('text/html 等支持分页/分段模式的结束位置。'),
      maxLines: z.number().optional().describe('text 模式最多读取行数，默认 100，最大 300。'),
      maxChars: z.number().optional().describe('返回内容最大字符数，默认 40000，最大 80000。'),
    }),
  },
)

// ── PDF Read (Python pypdf, read-only) ──────────────────────────

const PDF_EXTS = new Set(['.pdf'])
const PDF_MODES = new Set(['overview', 'text', 'metadata'])
const PDF_DEFAULT_MAX_CHARS = 40000
const PDF_MAX_CHARS = 80000
const PDF_DEFAULT_MAX_PAGES = 5
const PDF_MAX_PAGES = 20
const PDF_PYTHON_SCRIPT = String.raw`
import json
import sys

try:
    from pypdf import PdfReader
except Exception as exc:
    print(json.dumps({"success": False, "code": "PYPDF_NOT_INSTALLED", "detail": str(exc)}, ensure_ascii=False))
    raise SystemExit(2)

def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)

try:
    req = json.load(sys.stdin)
    file_path = req.get("path")
    mode = req.get("mode") or "overview"
    start_page = max(int(req.get("startPage") or 1), 1)
    max_pages = min(max(int(req.get("maxPages") or 5), 1), 20)
    max_chars = min(max(int(req.get("maxChars") or 40000), 1000), 80000)

    reader = PdfReader(file_path)
    encrypted = bool(getattr(reader, "is_encrypted", False))
    if encrypted:
        try:
            reader.decrypt("")
        except Exception:
            pass

    page_count = len(reader.pages)
    metadata = {}
    try:
        for key, value in dict(reader.metadata or {}).items():
            metadata[str(key).lstrip("/")] = "" if value is None else str(value)
    except Exception:
        metadata = {}

    if mode == "metadata":
        emit({"success": True, "mode": mode, "pageCount": page_count, "encrypted": encrypted, "metadata": metadata})

    def page_text(index):
        try:
            return reader.pages[index].extract_text() or ""
        except Exception as exc:
            return "[Page %s extraction failed: %s]" % (index + 1, exc)

    if mode == "overview":
        preview_pages = min(page_count, min(max_pages, 3))
        sections = []
        for index in range(preview_pages):
            text = page_text(index).strip()
            if text:
                sections.append("## Page %s\n%s" % (index + 1, text))
        content = "\n\n".join(sections)
        truncated = len(content) > max_chars
        if truncated:
            content = content[:max_chars]
        emit({
            "success": True,
            "mode": mode,
            "pageCount": page_count,
            "encrypted": encrypted,
            "metadata": metadata,
            "content": content,
            "truncated": truncated,
            "next": {"mode": "text", "startPage": 1, "maxPages": max_pages, "maxChars": max_chars} if page_count else None,
            "note": "Overview includes metadata and a short first-page preview. Use text mode by page ranges for details.",
        })

    start_index = min(start_page - 1, page_count)
    end_index = min(page_count, start_index + max_pages)
    sections = []
    for index in range(start_index, end_index):
        sections.append("## Page %s\n%s" % (index + 1, page_text(index).strip()))
    content = "\n\n".join(sections)
    truncated = len(content) > max_chars
    if truncated:
        content = content[:max_chars]
    next_page = end_index + 1 if end_index < page_count else None
    emit({
        "success": True,
        "mode": "text",
        "pageCount": page_count,
        "startPage": start_page,
        "endPage": end_index,
        "content": content,
        "truncated": truncated,
        "next": {"mode": "text", "startPage": next_page, "maxPages": max_pages, "maxChars": max_chars} if next_page else None,
    })
except SystemExit:
    raise
except Exception as exc:
    emit({"success": False, "code": "PDF_READ_FAILED", "detail": str(exc)}, 1)
`

const PDF_PYTHON_CANDIDATES = [
  { command: 'python', args: [], label: 'python' },
  { command: 'py', args: ['-3'], label: 'py -3' },
  { command: 'py', args: [], label: 'py' },
  { command: 'python3', args: [], label: 'python3' },
]

function _runPdfPython(candidate, payload, { timeoutMs = 30000, maxBuffer = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(candidate.command, [...candidate.args, '-c', PDF_PYTHON_SCRIPT], {
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'pdf_read timeout', via: candidate.label })
    }, timeoutMs)

    child.stdout.on('data', d => append(stdoutChunks, d))
    child.stderr.on('data', d => append(stderrChunks, d))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message, via: candidate.label }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      via: candidate.label,
    }))

    try {
      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
    } catch (e) {
      finish({ code: 1, stdout: '', stderr: e.message, via: candidate.label })
    }
  })
}

function _parsePdfPythonResult(result) {
  const raw = (result.stdout || result.stderr || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw.split(/\r?\n/).find(line => line.trim().startsWith('{')) || raw)
  } catch {
    return null
  }
}

async function _runPdfRead(payload) {
  let lastMissing = null
  let lastNotFound = null
  for (const candidate of PDF_PYTHON_CANDIDATES) {
    const result = await _runPdfPython(candidate, payload)
    const parsed = _parsePdfPythonResult(result)
    if (result.code === 127) {
      lastNotFound = result
      continue
    }
    if (parsed?.code === 'PYPDF_NOT_INSTALLED') {
      lastMissing = { ...parsed, via: result.via }
      continue
    }
    if (parsed) return { ...parsed, via: result.via }
    return { success: false, code: result.code === 124 ? 'PDF_READ_TIMEOUT' : 'PDF_READ_FAILED', detail: (result.stderr || result.stdout || '').slice(0, 1200), via: result.via }
  }
  if (lastMissing) return { success: false, code: 'PYPDF_NOT_INSTALLED', message: '当前 Python 环境缺少 pypdf。', detail: lastMissing.detail || '', via: lastMissing.via }
  return { success: false, code: 'PYTHON_NOT_FOUND', message: '未找到可用的 Python。', detail: lastNotFound?.stderr || '' }
}

function _pdfError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

export const pdfRead = tool(
  async ({ path: filePath, mode = 'overview', startPage, maxPages, maxChars }) => {
    if (!_workDirService) {
      return _pdfError('NO_WORKSPACE', '未初始化工作空间，无法读取 PDF 文档。')
    }

    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return _pdfError('FILE_OP_LIMIT_REACHED', `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。`)
    }

    if (!filePath) return _pdfError('MISSING_PATH', 'pdf_read 缺少 path 参数。')

    let resolved
    let virtualPath
    try {
      const vfsPath = _resolveVfsPath(filePath, 'read', 'pdf_read')
      resolved = vfsPath.realPath
      virtualPath = vfsPath.virtualPath
    } catch (e) {
      return _pdfError('PATH_NOT_ALLOWED', `安全限制：${e.message}，只能读取授权目录内的文件。`)
    }

    const ext = path.extname(resolved).toLowerCase()
    if (!PDF_EXTS.has(ext)) {
      return _pdfError('UNSUPPORTED_PDF_FORMAT', 'pdf_read 仅支持 .pdf 文件。', { path: filePath })
    }
    if (!fs.existsSync(resolved)) {
      return _pdfError('FILE_NOT_FOUND', '文件不存在。', { path: filePath })
    }

    const safeMode = PDF_MODES.has(mode) ? mode : 'overview'
    const safeMaxChars = Math.min(Math.max(Number(maxChars) || PDF_DEFAULT_MAX_CHARS, 1000), PDF_MAX_CHARS)
    const safeMaxPages = Math.min(Math.max(Number(maxPages) || PDF_DEFAULT_MAX_PAGES, 1), PDF_MAX_PAGES)
    const safeStartPage = Math.max(Number(startPage) || 1, 1)
    const result = await _runPdfRead({
      path: resolved,
      mode: safeMode,
      startPage: safeStartPage,
      maxPages: safeMaxPages,
      maxChars: safeMaxChars,
    })

    if (!result.success) {
      return _pdfError(result.code || 'PDF_READ_FAILED', result.message || 'PDF 读取失败。', {
        path: virtualPath,
        detail: (result.detail || '').slice(0, 1200),
        via: result.via,
      })
    }

    return JSON.stringify({
      success: true,
      path: virtualPath,
      ...result,
    })
  },
  {
    name: 'pdf_read',
    description: [
      '读取 PDF 文档的受控工具，支持 .pdf。不要用 read_file 读取 PDF 文件。',
      '默认 mode=overview，返回页数、元数据和前几页预览。',
      '需要正文时使用 mode=text，并用 startPage/maxPages 按页分段读取。还支持 metadata。',
      '依赖 Python 包 pypdf；缺失时会返回 PYPDF_NOT_INSTALLED。',
    ].join('\n'),
    schema: z.object({
      path: z.string().describe('PDF 文件路径，必须位于授权工作空间内。'),
      mode: z.enum(['overview', 'text', 'metadata']).optional().describe('读取模式。默认 overview；正文用 text 按页分段读取。'),
      startPage: z.number().optional().describe('text 模式起始页码，默认 1。'),
      maxPages: z.number().optional().describe('最多读取页数，默认 5，最大 20。'),
      maxChars: z.number().optional().describe('返回内容最大字符数，默认 40000，最大 80000。'),
    }),
  },
)

// ── PPTX Export (local, pptxgenjs) ───────────────────────────────

function _isInsideDir(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function _resolvePptxOutputPath(htmlPath, outputPath) {
  const requested = String(outputPath || '').trim()
  if (!requested) {
    return path.join(path.dirname(htmlPath), `${path.basename(htmlPath, path.extname(htmlPath))}.pptx`)
  }

  const resolved = _resolveVfsPath(requested, 'tool_output', 'pptx_export_local').realPath
  const ext = path.extname(resolved).toLowerCase()
  if (!ext) return `${resolved}.pptx`
  if (ext !== '.pptx') throw new Error('outputPath 必须是 .pptx 文件路径')
  return resolved
}

export const pptxExportLocal = tool(
  async ({ htmlPath, outputPath }) => {
    if (!_workDirService) {
      return JSON.stringify({ success: false, code: 'NO_WORKSPACE', message: '未初始化工作空间，无法导出 PPTX。' })
    }

    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return JSON.stringify({ success: false, code: 'FILE_OP_LIMIT_REACHED', message: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` })
    }

    if (!htmlPath) {
      return JSON.stringify({ success: false, code: 'MISSING_HTML_PATH', message: 'pptx_export_local 缺少 htmlPath 参数。' })
    }

    let resolvedHtml
    let resolvedOutput
    try {
      resolvedHtml = _resolveVfsPath(htmlPath, 'read', 'pptx_export_local').realPath
      const htmlExt = path.extname(resolvedHtml).toLowerCase()
      if (!['.html', '.htm'].includes(htmlExt)) {
        return JSON.stringify({ success: false, code: 'UNSUPPORTED_INPUT', message: 'pptx_export_local 仅支持 .html / .htm 输入。', path: htmlPath })
      }
      if (!fs.existsSync(resolvedHtml)) {
        return JSON.stringify({ success: false, code: 'HTML_NOT_FOUND', message: 'HTML 文件不存在。', path: htmlPath })
      }

      resolvedOutput = _resolvePptxOutputPath(resolvedHtml, outputPath)
      const agentsRoot = path.join(_workDirService.getRootPath(), 'agents')
      if (!_isInsideDir(resolvedOutput, agentsRoot)) {
        return JSON.stringify({ success: false, code: 'OUTPUT_SCOPE_DENIED', message: 'PPTX 导出只能写入 /agents/ 下的 Agent 输出目录。' })
      }
      fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
      _resolveVfsPath(resolvedOutput, 'tool_output', 'pptx_export_local')
    } catch (e) {
      return JSON.stringify({ success: false, code: 'PATH_NOT_ALLOWED', message: `安全限制：${e.message}` })
    }

    try {
      const exporter = new PptxExportService()
      const result = await exporter.exportLocal(resolvedHtml, resolvedOutput)
      return JSON.stringify({
        success: true,
        path: _toVirtualWorkspacePath(resolvedOutput),
        slideCount: result.slideCount || 0,
      })
    } catch (e) {
      return JSON.stringify({ success: false, code: 'PPTX_EXPORT_FAILED', message: e.message })
    }
  },
  {
    name: 'pptx_export_local',
    description: [
      '将 Agent 输出目录中的 HTML 演示文稿导出为可编辑的 PPTX 文件。',
      'htmlPath 必须是授权工作空间内的 .html/.htm 文件；outputPath 可省略，默认与 HTML 同目录同名 .pptx。',
      '输出路径只能位于当前 Agent 的 /agents/{agent}/outputs/ 下，返回 JSON {success, path, slideCount}。',
    ].join('\n'),
    schema: z.object({
      htmlPath: z.string().describe('HTML 演示文稿路径，如 /agents/ppt-generator/outputs/2026-06-03/demo.html'),
      outputPath: z.string().optional().describe('输出 PPTX 路径，必须位于 /agents/ 下；省略则与 HTML 同目录同名 .pptx'),
    }),
  },
)

export const wikiTool = tool(
  async (input = {}) => {
    if (!_wikiService?.wikiTool) {
      return JSON.stringify({
        success: false,
        code: 'WIKI_NOT_AVAILABLE',
        message: '本地 LLM-Wiki 服务不可用或工作区尚未初始化。',
      })
    }
    const runWikiContext = _toolRunContext.wikiContext || {}
    const allowedWikiIds = Array.isArray(runWikiContext.wikiIds)
      ? runWikiContext.wikiIds.filter(Boolean)
      : []
    const result = await _wikiService.wikiTool({
      ...(input || {}),
      wikiContext: runWikiContext,
      allowedWikiIds,
      enforceWikiSelection: true,
      allowWrite: false,
    })
    return JSON.stringify(result)
  },
  {
    name: 'wiki_tool',
    description: [
      '只读查询本地 LLM-Wiki 的统一工具。普通聊天 Agent 不能写入 Wiki。',
      '只能访问用户在本轮聊天输入区选择的 Wiki；未选择 Wiki 时不能读取任何 Wiki。模型传入 wikiIds 只能在已选择范围内缩小，不能扩大到全部 Wiki。',
      '先用 action=list_wikis 查看本轮允许访问的 Wiki；聊天界面选择了 Wiki 时，可直接用 search_wikis/query_wikis，系统会使用默认范围。',
      '常用动作：query_wikis 会先读取 index.md/overview.md 导航页，返回导航链接、优先页面和兜底搜索结果；search_wikis 是显式关键词兜底搜索；read_page/read_source 用于深读具体页面或来源。',
      '回答用户问题时必须引用 wiki_name、页面路径、source_id 或图片路径。',
    ].join('\n'),
    schema: z.object({
      action: z.enum([
        'list_wikis',
        'search',
        'search_wikis',
        'query_wikis',
        'list_pages',
        'read_page',
        'list_sources',
        'read_source',
        'list_assets',
        'recent_changes',
      ]).describe('要执行的 Wiki 动作。'),
      wikiId: z.string().optional().describe('Wiki id。action=list_wikis 不需要。'),
      wikiIds: z.array(z.string()).optional().describe('跨 Wiki 查询的 Wiki id 列表；不传时使用聊天界面选择的默认范围。'),
      query: z.string().optional().describe('search 动作的检索问题。'),
      scope: z.enum(['all', 'pages', 'sources', 'wiki', 'source', 'assets']).optional().describe('search 范围。'),
      limit: z.number().optional().describe('返回数量上限。'),
      maxChars: z.number().optional().describe('query_wikis 返回上下文最大字符数。'),
      pagePath: z.string().optional().describe('read_page 的相对 Markdown 路径，如 index.md 或 pages/concepts/topic.md。'),
      sourceId: z.string().optional().describe('read_source 的来源 id。'),
      kind: z.string().optional().describe('list_assets 的资产类型过滤，例如 ocr_image 或 source_image。'),
    }),
  },
)

// ── Aggregate custom tools ──────────────────────────────────────

const MCP_TOOL_OUTPUT_LIMIT = 60000

function _clipMcpText(value, limit = MCP_TOOL_OUTPUT_LIMIT) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n\n[内容已截断：超过 ${limit} 字符]` : text
}

function _mcpServerAllowed(serverId) {
  const allowed = _toolRunContext.mcpServerIds || []
  return allowed.includes(String(serverId || ''))
}

export const mcpResourceRead = tool(
  async (input = {}) => {
    const serverId = String(input.serverId || '').trim()
    const uri = String(input.uri || '').trim()
    if (!_mcpService?.readResource) {
      return JSON.stringify({ success: false, code: 'MCP_NOT_AVAILABLE', message: 'MCP 服务不可用。' })
    }
    if (!serverId || !uri) {
      return JSON.stringify({ success: false, code: 'TOOL_INVALID_ARGUMENT', message: 'serverId 和 uri 不能为空。' })
    }
    if (!_mcpServerAllowed(serverId)) {
      return JSON.stringify({ success: false, code: 'TOOL_OPERATION_NOT_ALLOWED', message: `当前 Agent 未绑定 MCP 服务器：${serverId}` })
    }
    const result = await _mcpService.readResource(serverId, uri)
    if (!result?.success) {
      return JSON.stringify({ success: false, code: 'MCP_RESOURCE_READ_FAILED', message: result?.error || '读取 MCP resource 失败。', serverId, uri })
    }
    return JSON.stringify({
      success: true,
      operation: 'read_resource',
      serverId,
      uri,
      contents: (result.contents || []).map(c => ({
        uri: c.uri,
        mimeType: c.mimeType || '',
        text: c.text ? _clipMcpText(c.text) : '',
        blob: c.blob ? _clipMcpText(c.blob, 12000) : '',
      })),
    })
  },
  {
    name: 'mcp_resource_read',
    description: [
      '读取当前 Agent 已绑定 MCP 服务器暴露的 resource 内容。',
      '先查看 MCP 管理页或已同步缓存中的 resource uri；resourceTemplates 需要先填好参数形成具体 uri。',
      '只能读取当前 Agent 工具配置中已绑定的 mcp:{serverId} 服务器。',
    ].join('\n'),
    schema: z.object({
      serverId: z.string().describe('MCP 服务器 ID，对应 Agent 工具里的 mcp:{serverId}。'),
      uri: z.string().describe('要读取的 MCP resource URI。'),
    }),
  },
)

export const mcpPromptGet = tool(
  async (input = {}) => {
    const serverId = String(input.serverId || '').trim()
    const name = String(input.name || '').trim()
    const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments) ? input.arguments : {}
    if (!_mcpService?.getPrompt) {
      return JSON.stringify({ success: false, code: 'MCP_NOT_AVAILABLE', message: 'MCP 服务不可用。' })
    }
    if (!serverId || !name) {
      return JSON.stringify({ success: false, code: 'TOOL_INVALID_ARGUMENT', message: 'serverId 和 name 不能为空。' })
    }
    if (!_mcpServerAllowed(serverId)) {
      return JSON.stringify({ success: false, code: 'TOOL_OPERATION_NOT_ALLOWED', message: `当前 Agent 未绑定 MCP 服务器：${serverId}` })
    }
    const result = await _mcpService.getPrompt(serverId, name, args)
    if (!result?.success) {
      return JSON.stringify({ success: false, code: 'MCP_PROMPT_GET_FAILED', message: result?.error || '获取 MCP prompt 失败。', serverId, name })
    }
    return JSON.stringify({
      success: true,
      operation: 'get_prompt',
      serverId,
      name,
      description: result.description || '',
      messages: (result.messages || []).map(m => ({
        role: m.role,
        content: m.content?.type === 'text'
          ? { ...m.content, text: _clipMcpText(m.content.text) }
          : m.content,
      })),
    })
  },
  {
    name: 'mcp_prompt_get',
    description: [
      '获取当前 Agent 已绑定 MCP 服务器提供的 prompt 模板实例。',
      '用于把 MCP prompt 转成可执行的消息内容；需要按该 prompt 的 arguments 填参数。',
      '只能访问当前 Agent 工具配置中已绑定的 mcp:{serverId} 服务器。',
    ].join('\n'),
    schema: z.object({
      serverId: z.string().describe('MCP 服务器 ID，对应 Agent 工具里的 mcp:{serverId}。'),
      name: z.string().describe('MCP prompt 名称。'),
      arguments: z.record(z.string(), z.any()).optional().describe('prompt 参数对象。'),
    }),
  },
)

const CUSTOM_TOOLS = [execCommand, webSearchTavily, webSearchSearxng, webSearchBing, kbSearch, wikiTool, calculator, deleteFile, officeRead, pdfRead, pptxExportLocal, mcpResourceRead, mcpPromptGet]
const TOOL_ID_ALIASES = {
  file_delete: 'delete_file',
}

const CUSTOM_SCRIPT_TOOLS_ENABLED = false
const CUSTOM_TOOL_OUTPUT_LIMIT = 30000
const CUSTOM_SCRIPT_MAX_BUFFER = 1024 * 1024
const CUSTOM_SCRIPT_TIMEOUT_MS = 30000
const CUSTOM_SCRIPT_EXTS = new Set(['.py', '.js', '.mjs', '.cjs'])

function _clipOutput(value, limit = CUSTOM_TOOL_OUTPUT_LIMIT) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text || text.length <= limit) return { text: text || '', truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function _normalizeCustomToolRecord(row) {
  return {
    id: row?.id || '',
    name: row?.name || row?.id || '自定义工具',
    description: row?.description || row?.desc || '',
    type: row?.type || 'api',
    apiUrl: row?.apiUrl || row?.api_url || '',
    method: String(row?.method || 'POST').toUpperCase(),
    headers: row?.headers || {},
    params: Array.isArray(row?.params) ? row.params : [],
    responseFormat: row?.responseFormat || row?.response_format || 'JSON',
    scriptPath: row?.scriptPath || row?.script_path || '',
    permReq: row?.permReq || row?.perm_required || '',
    enabled: row?.enabled !== false && row?.enabled !== 0,
  }
}

function _customToolSchema(params = []) {
  const shape = {}
  for (const p of params) {
    const name = String(p?.name || '').trim()
    if (!name) continue
    let schema = z.any()
    if (p?.desc) schema = schema.describe(String(p.desc))
    shape[name] = p?.required ? schema : schema.optional()
  }
  return z.object(shape).passthrough()
}

function _normalizeHeaders(headers) {
  const parsed = typeof headers === 'string'
    ? (() => { try { return JSON.parse(headers) } catch { return {} } })()
    : headers
  const out = {}
  for (const [key, value] of Object.entries(parsed || {})) {
    if (!key || value === undefined || value === null || value === '') continue
    out[key] = String(value)
  }
  return out
}

function _hasToolPermission(required) {
  if (!required) return true
  const permissions = _toolRunContext.permissions
  if (!permissions || !Object.prototype.hasOwnProperty.call(permissions, required)) return true
  return !!permissions[required]
}

async function _runApiCustomTool(def, input = {}) {
  if (!def.apiUrl) {
    return JSON.stringify({ success: false, code: 'CUSTOM_TOOL_NOT_CONFIGURED', message: '自定义 API 工具缺少 API URL。' })
  }
  if (!_hasToolPermission(def.permReq)) {
    return JSON.stringify({ success: false, code: 'TOOL_PERMISSION_DENIED', message: `当前 Agent 未开启 ${def.permReq} 权限。` })
  }

  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(def.method) ? def.method : 'POST'

  try {
    const url = new URL(def.apiUrl)
    const headers = _normalizeHeaders(def.headers)
    const init = {
      method,
      headers,
      signal: AbortSignal.timeout(30000),
    }

    if (method === 'GET') {
      for (const [key, value] of Object.entries(args)) {
        if (value === undefined || value === null) continue
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
      }
    } else {
      if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json'
      }
      init.body = JSON.stringify(args)
    }

    const resp = await fetch(url, init)
    const contentType = resp.headers.get('content-type') || ''
    const raw = await resp.text()
    let body = raw
    if (contentType.includes('application/json')) {
      try { body = JSON.parse(raw) } catch { body = raw }
    }
    const clipped = _clipOutput(body)
    return JSON.stringify({
      success: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      contentType,
      body: clipped.text,
      truncated: clipped.truncated,
    })
  } catch (e) {
    return JSON.stringify({ success: false, code: 'CUSTOM_API_TOOL_FAILED', message: e.message })
  }
}

function _scriptRunnerFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.py') return { command: 'python', args: [filePath], kind: 'python' }
  if (['.js', '.mjs', '.cjs'].includes(ext)) return { command: 'node', args: [filePath], kind: 'node' }
  return null
}

async function _runScriptCustomTool(def, input = {}) {
  if (!CUSTOM_SCRIPT_TOOLS_ENABLED) {
    return JSON.stringify({ success: false, code: 'CUSTOM_SCRIPT_TOOL_DISABLED', message: '自定义脚本工具暂未开放运行。' })
  }
  const required = def.permReq || 'execCommand'
  if (!_hasToolPermission(required)) {
    return JSON.stringify({ success: false, code: 'TOOL_PERMISSION_DENIED', message: `当前 Agent 未开启 ${required} 权限。` })
  }
  if (!_workDirService) {
    return JSON.stringify({ success: false, code: 'NO_WORKSPACE', message: '未初始化工作空间，无法执行自定义脚本工具。' })
  }
  if (!def.scriptPath) {
    return JSON.stringify({ success: false, code: 'CUSTOM_TOOL_NOT_CONFIGURED', message: '自定义脚本工具缺少脚本路径。' })
  }

  let resolved
  try {
    resolved = _workDirService.resolveAndValidate(def.scriptPath, 'any')
  } catch (e) {
    return JSON.stringify({ success: false, code: 'TOOL_INPUT_NOT_ALLOWED', message: `安全限制：${e.message}` })
  }

  const normalized = resolved.replace(/\\/g, '/').toLowerCase()
  if (normalized.includes('/.reviva/')) {
    return JSON.stringify({ success: false, code: 'TOOL_INPUT_NOT_ALLOWED', message: '安全限制：自定义脚本不能位于系统元数据目录。' })
  }
  if (!fs.existsSync(resolved)) {
    return JSON.stringify({ success: false, code: 'FILE_NOT_FOUND', message: '自定义脚本文件不存在。' })
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!CUSTOM_SCRIPT_EXTS.has(ext)) {
    return JSON.stringify({ success: false, code: 'UNSUPPORTED_SCRIPT_TYPE', message: '自定义脚本工具当前仅支持 .py、.js、.mjs、.cjs。' })
  }

  const runner = _scriptRunnerFor(resolved)
  const validationError = _validateCommand(`${runner.command} ${resolved}`)
  if (validationError) {
    return JSON.stringify({ success: false, exitCode: 126, stdout: '', stderr: validationError })
  }

  return new Promise((resolve) => {
    const child = spawn(runner.command, runner.args, {
      cwd: path.dirname(resolved),
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutSize = 0
    let stderrSize = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(JSON.stringify(result))
    }

    const append = (chunks, data, kind) => {
      if (kind === 'stdout') {
        stdoutSize += data.length
        if (stdoutSize <= CUSTOM_SCRIPT_MAX_BUFFER) chunks.push(data)
      } else {
        stderrSize += data.length
        if (stderrSize <= CUSTOM_SCRIPT_MAX_BUFFER) chunks.push(data)
      }
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ success: false, exitCode: 124, stdout: '', stderr: 'custom script timeout' })
    }, CUSTOM_SCRIPT_TIMEOUT_MS)

    child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
    child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
    child.on('error', err => finish({ success: false, exitCode: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      finish({
        success: code === 0,
        exitCode: code ?? 0,
        stdout: _clipOutput(stdout).text,
        stderr: _clipOutput(stderr, 8000).text,
        stdoutTruncated: stdoutSize > CUSTOM_SCRIPT_MAX_BUFFER,
        stderrTruncated: stderrSize > CUSTOM_SCRIPT_MAX_BUFFER,
      })
    })

    try {
      child.stdin.write(JSON.stringify(input && typeof input === 'object' ? input : {}))
      child.stdin.end()
    } catch (e) {
      finish({ success: false, exitCode: 1, stdout: '', stderr: e.message })
    }
  })
}

function _createUserDefinedTool(row) {
  const def = _normalizeCustomToolRecord(row)
  const typeText = def.type === 'script'
    ? '本地脚本工具暂未开放运行。'
    : '工具会把参数作为 HTTP 请求参数发送，并返回响应正文。'
  return tool(
    async (input) => {
      if (def.type === 'script') return _runScriptCustomTool(def, input)
      return _runApiCustomTool(def, input)
    },
    {
      name: def.id,
      description: [
        def.description || def.name,
        typeText,
        def.params.length ? `参数：${def.params.map(p => `${p.name}${p.required ? '(必填)' : ''}`).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
      schema: _customToolSchema(def.params),
    },
  )
}

export function getUserDefinedLangchainTools(toolIds, customToolRows = []) {
  if (!toolIds?.length || !customToolRows?.length) return []
  const idSet = new Set((toolIds || []).filter(id => typeof id === 'string'))
  return customToolRows
    .map(_normalizeCustomToolRecord)
    .filter(t => t.enabled && idSet.has(t.id) && (CUSTOM_SCRIPT_TOOLS_ENABLED || t.type !== 'script'))
    .map(_createUserDefinedTool)
}

function _normalizeToolIds(toolIds) {
  const normalized = new Set()
  for (const id of toolIds || []) {
    normalized.add(id)
    if (TOOL_ID_ALIASES[id]) normalized.add(TOOL_ID_ALIASES[id])
    if (typeof id === 'string' && id.startsWith('mcp:')) {
      normalized.add('mcp_resource_read')
      normalized.add('mcp_prompt_get')
    }
  }
  return normalized
}

function _createRouterTool(toolset) {
  const options = { agentDirName: _toolRunContext.agentEnglishName || '_shared', permissions: _toolRunContext.permissions || {} }
  if (toolset.id === 'ffmpeg') return createFfmpegTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'pandoc') return createPandocTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'manim') return createManimTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'office') return createOfficeWriteTool(_workDirService, toolset.allowedOperations, options)
  return null
}

function _createToolsetTools(toolIds) {
  return _toolsetRegistry
    .resolveRouterTools(toolIds)
    .map(_createRouterTool)
    .filter(Boolean)
}

/**
 * Get custom LangChain tool instances by tool IDs
 * Note: DeepAgents provides filesystem tools (ls/read_file/write_file/edit_file/glob/grep) via FilesystemBackend
 * These custom tools supplement the built-in ones
 * @param {string[]} toolIds - Optional filter by tool ID
 * @returns {StructuredTool[]} LangChain tool instances
 */
export function getLangchainTools(toolIds) {
  if (!toolIds?.length) return CUSTOM_TOOLS
  const toolsetTools = _createToolsetTools(toolIds)
  const idSet = _normalizeToolIds(toolIds)
  return [
    ...CUSTOM_TOOLS.filter(t => idSet.has(t.name)),
    ...toolsetTools,
  ]
}

export { CUSTOM_TOOLS }
