/**
 * McpSourceAdapter — MCP 知识源适配器
 *
 * 包装 McpService.callTool，将 MCP server 的知识库检索 tool 转为 KBP 标准格式。
 *
 * config 结构：
 * {
 *   serverId: "mcp_server_id",      // 对应 mcp_servers 表的 id
 *   searchTool: "kb_search",        // MCP server 上暴露的检索 tool 名
 *   queryParam: "query",            // tool 参数中 query 的字段名（默认 "query"）
 *   topKParam: "top_k",             // tool 参数中 top_k 的字段名（默认 "top_k"）
 *   resultPath: "result",           // 结果数组在 tool 返回中的 dot-notation 路径（默认 "result"）
*   contentField: "content",        // 每条结果中 content 的字段名（默认 "content"）
 *   listTool: "list_kb",            // 可选：列表工具名（自动发现，可不配）
 *   kbIdParam: "kb_id",             // 可选：搜索时传递知识库 ID 的参数名（默认 "kb_id"）
 * }
 */

import { getByPath } from './CustomHttpAdapter.js'

export class McpSourceAdapter {
  /**
   * @param {object} mcpService - McpService instance
   */
  constructor(mcpService) {
    this._mcpService = mcpService
  }

 getCapabilities(_config = {}) {
   return { interfaces: ['search'], content_types: ['text'] }
 }

 /**
  * Discover and call a list-type MCP tool (if the server exposes one) to get
  * the available knowledge bases / collections. Falls back to a single virtual
  * "全部知识" entry when no list tool is found or the call fails.
  * @returns {Promise<{ success: boolean, list: array }>}
  */
  async listKnowledgeBases(config = {}) {
    const serverId = config.serverId
    if (!serverId || !this._mcpService) {
      return { success: true, list: [{ id: '', name: '全部知识' }] }
    }

    // Try to find a list tool (explicit config or auto-discover from cache)
    let listTool = config.listTool || ''
    if (!listTool) {
      const tools = typeof this._mcpService.getCachedTools === 'function'
        ? this._mcpService.getCachedTools(serverId)
        : []
      listTool = this._discoverListTool(tools)
    }

    if (!listTool) {
      return { success: true, list: [{ id: '', name: '全部知识' }] }
    }

    // Call the list tool
    try {
      const callResult = await this._mcpService.callTool(serverId, listTool, {})
      if (!callResult.success) {
        return { success: true, list: [{ id: '', name: '全部知识' }] }
      }

      const raw = callResult.result
      let items = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.result) ? raw.result
        : Array.isArray(raw?.list) ? raw.list
        : Array.isArray(raw?.items) ? raw.items
        : null

      if (!items || !items.length) {
        return { success: true, list: [{ id: '', name: '全部知识' }] }
      }

      const list = items.map(item => {
        if (typeof item === 'string') return { id: item, name: item }
        return {
          id: String(item.id || item.uuid || item.key || item.name || ''),
          name: item.name || item.title || item.label || String(item.id || '未知'),
        }
      })

      return { success: true, list }
    } catch {
      return { success: true, list: [{ id: '', name: '全部知识' }] }
    }
  }

  /**
   * Auto-discover a list-type tool from the server's cached tools.
   * Priority: list+kb > list > collection > dataset.
   */
  _discoverListTool(tools) {
    if (!tools || !tools.length) return ''
    const listKb = tools.find(t => /list/i.test(t.name) && /(kb|knowledge|dataset|collection)/i.test(t.name))
    if (listKb) return listKb.name
    const listMatch = tools.find(t => /list/i.test(t.name))
    if (listMatch) return listMatch.name
    const collectionMatch = tools.find(t => /collection/i.test(t.name))
    if (collectionMatch) return collectionMatch.name
    return ''
  }

  /**
   * Execute a search via MCP server tool.
   * @param {object} config - source config
   * @param {object} params - { query, top_k }
   * @returns {Promise<{ status: string, result?: array, message?: string }>}
  */
  async search(config = {}, params = {}) {
    const { query = '', top_k = 5, kbId = '', extra_body } = params

    if (!query) {
      return { status: 'error', message: 'Missing query parameter' }
    }

    const serverId = config.serverId
    const searchTool = config.searchTool || 'kb_search'
    const queryParam = config.queryParam || 'query'
    const topKParam = config.topKParam || 'top_k'
    const kbIdParam = config.kbIdParam || 'kb_id'

    if (!serverId) {
      return { status: 'error', message: 'No MCP serverId configured' }
    }

    if (!this._mcpService) {
      return { status: 'error', message: 'McpService not available' }
    }

    const toolArgs = { [queryParam]: query }
    if (topKParam) toolArgs[topKParam] = top_k
    if (kbId && kbIdParam) toolArgs[kbIdParam] = kbId
    // Merge agent-supplied extra parameters, overriding defaults
    if (extra_body && typeof extra_body === 'object' && !Array.isArray(extra_body)) {
      Object.assign(toolArgs, extra_body)
    }

    let callResult
    try {
      callResult = await this._mcpService.callTool(serverId, searchTool, toolArgs)
    } catch (e) {
      return { status: 'error', message: e?.message || 'MCP callTool failed' }
    }

    if (!callResult.success) {
      return {
        status: 'error',
        message: callResult.error || 'MCP tool call failed',
      }
    }

    // Extract result array from the tool response
    const raw = callResult.result
    const resultPath = config.resultPath || 'result'
    const items = getByPath(raw, resultPath)

    // If resultPath didn't resolve to an array, try common alternatives
    let resultArray = Array.isArray(items) ? items : null
    if (!resultArray) {
      resultArray = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.results) ? raw.results
        : null
    }

    if (!resultArray) {
      // If still no array, wrap the raw result as a single item
      return {
        status: 'ok',
        result: [{ content: typeof raw === 'string' ? raw : JSON.stringify(raw) }],
      }
    }

    // Map fields to KBP standard format
    const contentField = config.contentField || 'content'
    const titleField = config.titleField || 'title'
    const sourceField = config.sourceField || 'source'

    const result = resultArray.map(item => {
      const mapped = {}
      if (typeof item === 'string') {
        mapped.content = item
      } else if (item && typeof item === 'object') {
        mapped.content = item[contentField] || item.text || item.snippet || JSON.stringify(item)
        if (item[titleField]) mapped.title = item[titleField]
        if (item[sourceField]) mapped.source = item[sourceField]
        // Preserve all original fields
        for (const [k, v] of Object.entries(item)) {
          if (!(k in mapped)) mapped[k] = v
        }
      } else {
        mapped.content = String(item)
      }
      return mapped
    })

    return { status: 'ok', result }
  }
}

// Singleton without mcpService — set via setMcpService before use
let _instance = null
export function getMcpSourceAdapter(mcpService) {
  if (!_instance) _instance = new McpSourceAdapter(mcpService)
  else if (mcpService) _instance._mcpService = mcpService
  return _instance
}
