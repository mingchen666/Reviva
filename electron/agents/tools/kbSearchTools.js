// agents/tools/kbSearchTools.js — extracted from langchainTools.js
// Knowledge base search tools.

import { tool } from 'langchain'
import { z } from 'zod'
import { _cloudCtx, _externalKbBodyFields, _kbRegistry } from './toolContext.js'

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
    // When a knowledge source is activated via the Registry, route through it
   // instead of the legacy inline ApeRAG path.
    if (ctx.activeSourceId && _kbRegistry) {
      try {
        const result = await _kbRegistry.search(ctx.activeSourceId, {
          query, top_k,
          kbId: ctx.externalKbId || '',
        })
       return JSON.stringify(result)
      } catch (e) {
        return JSON.stringify({ status: 'error', message: e?.message || 'Registry search failed' })
      }
    }
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
    description: '在云端知识库中检索相关内容。用户选择云端知识库或云端知识库文档后，必须用此工具获取内容；不要改用 read_file/file_read/document_read/office_read/pdf_read 读取云端知识库。通常只传 query，系统会自动使用当前选择的 kb_ids/doc_ids。默认 top_k=5；可根据任务用不同 query 多次检索，只有问题范围较宽、用户要求更全面或命中不足时才适度上调 top_k。',
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

// ── External KB Search (Dify / FastGPT / Custom HTTP / MCP) ────────────────
// Minimal schema: only query, top_k, and extra_body.
// getLangchainTools swaps this in when _cloudCtx.activeSourceId is set.
// Factory: creates a fresh kb_search tool instance with a dynamic description
// that includes the actual body fields of the active external knowledge source.
export function createKbSearchExternal() {
  const fieldHint = _externalKbBodyFields
    ? `当前知识库支持的 extra_body 字段：${_externalKbBodyFields}。`
    : ''
  const noKbHint = !_cloudCtx.externalKbId
    ? '注意：当前未选择具体知识库，检索可能无法定位到正确的数据集。如果检索失败，请提示用户在侧边栏选择一个知识库。'
    : ''
  return tool(
    async ({ query, top_k, extra_body }) => {
      const ctx = _cloudCtx
      if (!ctx.activeSourceId || !_kbRegistry) {
        return JSON.stringify({ status: 'error', message: 'No external knowledge source active' })
      }
      try {
        const result = await _kbRegistry.search(ctx.activeSourceId, {
          query, top_k, extra_body,
          kbId: ctx.externalKbId || '',
        })
        return JSON.stringify(result)
      } catch (e) {
        return JSON.stringify({ status: 'error', message: e?.message || 'Registry search failed' })
      }
    },
    {
      name: 'kb_search',
      description: '在外部知识库中检索相关内容（Dify/FastGPT/自定义 HTTP/MCP）。通常只需传 query；默认 top_k=5，命中不足或问题宽泛时可上调。如需根据用户意图调整检索范围，可通过 extra_body 传递额外请求体字段，覆盖知识源配置中的默认值。' + fieldHint + noKbHint,
      schema: z.object({
        query: z.string().describe('检索查询语句'),
        top_k: z.number().int().min(1).max(100).optional().describe('返回条数；不传默认 5'),
        extra_body: z.record(z.any()).optional().describe('额外请求体字段，键名必须与目标 API 的 body 字段名一致。传入的值会覆盖配置中的默认值'),
      }),
    },
  )
}
