/**
 * KnowledgeSourceRegistry — 知识源注册中心
 *
 * 从 SQLite knowledge_sources 表加载所有知识源配置，
 * 按激活的知识源生成 LangChain tool，路由 tool 调用到对应 adapter。
 *
 * 支持的 source type:
 *   builtin -> BuiltinCloudAdapter (ApeRAG 云端)
 *   http    -> CustomHttpAdapter (自定义 HTTP)
 *   preset  -> CustomHttpAdapter (预设模板，Phase 3 扩展)
 *   mcp     -> McpSourceAdapter (Phase 3 扩展)
 */

import { tool } from 'langchain'
import { z } from 'zod'
import { builtinCloudAdapter } from './adapters/BuiltinCloudAdapter.js'
import { customHttpAdapter } from './adapters/CustomHttpAdapter.js'
import { getMcpSourceAdapter } from './adapters/McpSourceAdapter.js'

/**
 * Parse a JSON string field, returning the original value on parse failure.
 */
function parseJSON(field) {
  if (field === null || field === undefined) return field
  if (typeof field !== 'string') return field
  try { return JSON.parse(field) } catch { return field }
}

// Adapter routing by source type
const ADAPTERS = {
  builtin: builtinCloudAdapter,
  http: customHttpAdapter,
  preset: customHttpAdapter, // preset configs are HTTP-based; PresetHttpAdapter (Phase 3) will specialize
  mcp: getMcpSourceAdapter(),
}

export class KnowledgeSourceRegistry {
  /**
   * @param {object} dbService - DatabaseService instance (provides .db getter)
   */
  constructor(dbService) {
    this._dbService = dbService
    this._sources = new Map() // sourceId -> parsed source object
    this._loaded = false
  }

  /** Raw better-sqlite3 database instance */
  get _db() {
    return this._dbService?.db
  }

  /**
   * Load all knowledge sources from SQLite into the in-memory cache.
   * Call after CRUD operations or when source configs may have changed.
   */
  reload() {
    if (!this._db) return
    const rows = this._db.prepare('SELECT * FROM knowledge_sources ORDER BY created_at').all()
    this._sources.clear()
    for (const row of rows) {
      this._sources.set(row.id, this._parseSource(row))
    }
    this._loaded = true
  }

  /** Ensure sources are loaded before access */
  _ensureLoaded() {
    if (!this._loaded) this.reload()
  }

  /**
   * Parse a raw DB row into a source object with parsed JSON fields.
   */
  _parseSource(row) {
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      type: row.type,               // 'builtin' | 'preset' | 'mcp' | 'http'
      preset: row.preset || '',
      enabled: !!row.enabled,
      config: parseJSON(row.config) || {},
      cachedCapabilities: parseJSON(row.cached_capabilities) || {},
      cachedTools: parseJSON(row.cached_tools) || [],
      createdAt: row.created_at,
      lastSyncedAt: row.last_synced_at,
      lastStatus: row.last_status,  // 'connected' | 'error' | 'never_tested'
    }
  }

  /**
   * Get a single knowledge source by ID.
   */
  getSource(sourceId) {
    this._ensureLoaded()
    return this._sources.get(sourceId) || null
  }

  /**
   * List all knowledge sources.
   */
  listSources() {
    this._ensureLoaded()
    return Array.from(this._sources.values())
  }

  /**
   * Get the active (enabled) knowledge source by ID.
   * Returns null if not found or disabled.
   */
  getActiveSource(activeSourceId) {
    this._ensureLoaded()
    if (!activeSourceId) return null
    const source = this._sources.get(activeSourceId)
    if (!source || !source.enabled) return null
    return source
  }

  /**
   * Get the adapter instance for a source type.
   * @throws {Error} if type is unsupported
   */
  _getAdapter(type) {
    const adapter = ADAPTERS[type]
    if (!adapter) {
      throw new Error('Unsupported knowledge source type: ' + type)
    }
    return adapter
  }

  /**
   * Get capabilities for a knowledge source.
   * @returns {{ interfaces: string[], content_types: string[] } | null}
   */
  getCapabilities(sourceId) {
    const source = this.getSource(sourceId)
    if (!source) return null
    try {
      const adapter = this._getAdapter(source.type)
      return adapter.getCapabilities(source.config)
    } catch (e) {
      return null
    }
  }

  /**
   * Execute a search, routing to the appropriate adapter.
   * @param {string} sourceId
   * @param {object} params - { query, top_k, ... }
   * @returns {Promise<{ status: string, result?: array, message?: string }>}
   */
 async search(sourceId, params = {}) {
   const source = this.getSource(sourceId)
   if (!source) {
     return { status: 'error', message: 'Knowledge source not found: ' + sourceId }
   }
   if (!source.enabled) {
     return { status: 'error', message: 'Knowledge source is disabled: ' + source.name }
   }
  try {
     // Inject KB ID into config placeholders when provided (phase 4 sidebar selection)
     let config = source.config
     if (params.kbId) {
       config = this._injectKbId(config, params.kbId)
     }
     const adapter = this._getAdapter(source.type)
     return await adapter.search(config, params)
   } catch (e) {
     return { status: 'error', message: e?.message || 'Adapter error' }
   }
 }

  /**
   * Deep-clone config and replace {DATASET_ID} / {KB_ID} placeholders
   * with the selected knowledge base ID from the sidebar selector.
   */
  _injectKbId(config, kbId) {
    if (!config || !kbId) return config
    try {
      const json = JSON.stringify(config)
      const replaced = json
        .replace(/\{DATASET_ID\}/g, kbId)
        .replace(/\{KB_ID\}/g, kbId)
      return JSON.parse(replaced)
    } catch {
      return config
    }
}

  /**
   * List available knowledge bases from a source, routing to its adapter.
   * Returns { success, list } for sources that support listing.
   * @param {string} sourceId
   * @returns {Promise<{ success: boolean, list?: array, error?: string }>}
   */
  async listKnowledgeBases(sourceId) {
    const source = this.getSource(sourceId)
    if (!source) {
      return { success: false, error: 'Knowledge source not found: ' + sourceId }
    }
    try {
      const adapter = this._getAdapter(source.type)
      if (!adapter.listKnowledgeBases) {
        return { success: false, error: '此知识源类型不支持获取知识库列表' }
      }
      return await adapter.listKnowledgeBases(source.config)
    } catch (e) {
      return { success: false, error: e?.message || 'Adapter error' }
    }
  }

  /**
   * Generate a LangChain tool for a knowledge source.
   * The tool calls this.search(sourceId, params) when invoked.
   * @param {object} source - parsed source object (from getSource/getActiveSource)
   * @returns {Tool} LangChain tool instance
   */
  generateTool(source) {
    const sourceId = source.id
    const self = this
    return tool(
      async ({ query, top_k }) => {
        return JSON.stringify(await self.search(sourceId, { query, top_k }))
      },
      {
        name: 'kb_search',
        description: '在知识库"' + source.name + '"中检索相关内容。传入 query 进行检索，可选 top_k 控制返回条数（默认5）。只有需要从知识库获取信息时才使用此工具。',
        schema: z.object({
          query: z.string().describe('检索查询语句'),
          top_k: z.number().int().min(1).max(100).optional().describe('返回条数，默认5'),
        }),
      },
    )
  }
}
