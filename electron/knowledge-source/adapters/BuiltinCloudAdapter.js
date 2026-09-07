/**
 * BuiltinCloudAdapter — 内置 ApeRAG 云端知识库适配器
 *
 * 迁移自 langchainTools.js 中 kbSearch 的 ApeRAG 调用逻辑，
 * 封装为统一的 adapter 接口。config 结构：
 * { baseUrl, token, defaultKbIds, defaultDocIds }
 */

const DEFAULT_KB_SEARCH_MODES = ['vector', 'fulltext', 'graph', 'summary']

/**
 * Build the ApeRAG search query URL from a base URL.
 * Handles /api/v1/app, /api/v1, and bare base URLs.
 */
function cloudSearchQueryUrl(baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  if (/\/api\/v1\/app$/i.test(root)) return root + '/search/query'
  if (/\/api\/v1$/i.test(root)) return root + '/app/search/query'
  return root + '/api/v1/app/search/query'
}

function normalizeSearchTopK(topK) {
  const n = Number(topK)
  if (!Number.isFinite(n)) return 5
  return Math.min(100, Math.max(1, Math.trunc(n)))
}

function formatSearchErrorDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object') {
    if (detail.code === 'INSUFFICIENT_POINTS') {
      return '积分不足：本次需要 ' + (detail.required_points ?? '-') + '，当前余额 ' + (detail.points_balance ?? '-')
    }
    return detail.message || detail.error || detail.code || JSON.stringify(detail)
  }
  return String(detail)
}

export class BuiltinCloudAdapter {
  /**
   * @returns {{ interfaces: string[], content_types: string[] }}
   */
  getCapabilities(_config = {}) {
    return { interfaces: ['search'], content_types: ['text', 'image'] }
  }

  /**
   * Execute a search against the ApeRAG cloud API.
   * @param {object} config - { baseUrl, token, defaultKbIds, defaultDocIds }
   * @param {object} params  - { query, top_k, kb_ids, doc_ids, search_mode, search_modes, rerank, save_to_history }
   * @returns {Promise<{ status: string, result?: array, message?: string }>}
   */
  async search(config = {}, params = {}) {
    const baseUrl = config.baseUrl || ''
    const token = config.token || ''
    const defaultKbIds = Array.isArray(config.defaultKbIds) ? config.defaultKbIds : []
    const defaultDocIds = Array.isArray(config.defaultDocIds) ? config.defaultDocIds : []

    if (!baseUrl || !token) {
      return {
        status: 'unavailable',
        message: '云端知识库未登录或未配置 baseUrl。请用户先登录 Reviva 账号。',
      }
    }

    const hasSelectedScope = defaultKbIds.length || defaultDocIds.length
    if (!hasSelectedScope) {
      return {
        status: 'unavailable',
        message: '当前未选择云端知识库或知识库文档，不能进行知识库检索。请用户先在侧边栏选择知识库范围。',
      }
    }

    const {
      query = '',
      top_k,
      kb_ids,
      doc_ids,
      search_mode,
      search_modes,
      rerank,
      save_to_history,
    } = params

    if (!query) {
      return { status: 'error', message: 'Missing query parameter' }
    }

    const effectiveKbIds = (Array.isArray(kb_ids) && kb_ids.length) ? kb_ids : defaultKbIds
    const effectiveDocIds = (Array.isArray(doc_ids) && doc_ids.length) ? doc_ids : defaultDocIds

    const payload = {
      query,
      top_k: normalizeSearchTopK(top_k),
      rerank: !!rerank,
      save_to_history: !!save_to_history,
    }
    if (effectiveKbIds.length) payload.kb_ids = effectiveKbIds
    if (effectiveDocIds.length) payload.doc_ids = effectiveDocIds
    if (Array.isArray(search_modes) && search_modes.length) payload.search_modes = search_modes
    else if (search_mode) payload.search_mode = search_mode
    else payload.search_modes = DEFAULT_KB_SEARCH_MODES

    try {
      const url = cloudSearchQueryUrl(baseUrl)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) {
        let body = null
        try { body = await res.json() } catch (_) {}
        const detail = body?.detail || body?.message || body?.error || ''
        return {
          status: 'error',
          httpStatus: res.status,
          message: formatSearchErrorDetail(detail) || '搜索请求失败 (HTTP ' + res.status + ')',
          detail,
        }
      }

      const data = await res.json()
      return {
        status: 'ok',
        query: data?.query,
        scope: data?.scope,
        result: data?.result,
        charged_points: data?.charged_points,
        points_balance: data?.points_balance,
      }
    } catch (e) {
      return { status: 'error', message: e?.message || '网络错误' }
    }
  }
}

export const builtinCloudAdapter = new BuiltinCloudAdapter()
