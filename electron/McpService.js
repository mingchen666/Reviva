// electron/McpService.js — MCP (Model Context Protocol) remote-server client manager
// Uses @langchain/mcp-adapters MultiServerMCPClient for HTTP / SSE transports.
// Tools returned are LangChain-compatible and can be fed directly into deepagents.
//
// Runtime lifecycle: Agent runs use lazy proxy tools from cached capabilities.
// A proxy opens a short-lived MCP client only when that specific tool is called.

import { MultiServerMCPClient } from '@langchain/mcp-adapters'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import fs from 'node:fs'
import path from 'node:path'

export class McpService {
  constructor(dbService) {
    this._db = dbService
  }

  // Install bundled MCP server presets from one aggregate JSON file:
  // { "mcpServers": { "exa": { "url": "https://...", "type": "http" } } }
  // Existing rows are never overwritten, so user edits win.
  installAllBuiltinServers(dir) {
    const configPath = path.join(dir, 'builtin.json')
    if (!fs.existsSync(configPath)) {
      console.log('[McpService] No builtin MCP config found, skipping')
      return { installed: 0, skipped: 0, invalid: 0 }
    }

    let raw
    try {
      raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (err) {
      console.error('[McpService] Failed to read builtin MCP config:', err.message)
      return { installed: 0, skipped: 0, invalid: 1 }
    }

    const entries = raw?.mcpServers && typeof raw.mcpServers === 'object' && !Array.isArray(raw.mcpServers)
      ? Object.entries(raw.mcpServers)
      : []
    if (!entries.length) {
      console.warn('[McpService] builtin MCP config has no mcpServers entries')
      return { installed: 0, skipped: 0, invalid: 0 }
    }

    const existingRows = this._db.listMcpServers()
    const existingIds = new Set(existingRows.map(s => s.id))
    const existingUrls = new Set(existingRows.map(s => String(s.url || '').trim()).filter(Boolean))
    let installed = 0
    let skipped = 0
    let invalid = 0

    for (const [id, cfg] of entries) {
      const normalized = this._normalizeBuiltinServer(id, cfg)
      if (!normalized) {
        invalid += 1
        continue
      }
      if (existingIds.has(normalized.id) || existingUrls.has(normalized.url)) {
        skipped += 1
        continue
      }

      this._db.createMcpServer(normalized)
      existingIds.add(normalized.id)
      existingUrls.add(normalized.url)
      installed += 1
      console.log('[McpService] Installed builtin MCP server:', normalized.id)
    }

    return { installed, skipped, invalid }
  }

  _normalizeBuiltinServer(rawId, cfg) {
    const id = String(rawId || '').trim()
    if (!id || !cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null
    if (cfg.command || cfg.args) {
      console.warn('[McpService] Skipping stdio builtin MCP server:', id)
      return null
    }
    if (!cfg.url || typeof cfg.url !== 'string') {
      console.warn('[McpService] Skipping builtin MCP server without url:', id)
      return null
    }

    let transport = cfg.transport || cfg.type || 'http'
    transport = String(transport).toLowerCase()
    if (transport === 'streamable_http' || transport === 'streamable-http' || transport === 'streamable') transport = 'http'
    if (transport !== 'http' && transport !== 'sse') {
      console.warn('[McpService] Skipping builtin MCP server with unsupported transport:', id, transport)
      return null
    }

    return {
      id,
      name: String(cfg.name || id).trim(),
      transport,
      url: cfg.url.trim(),
      headers: cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers) ? cfg.headers : {},
      enabled: cfg.enabled === false ? false : true,
      disabled_tools: Array.isArray(cfg.disabled_tools)
        ? cfg.disabled_tools
        : (Array.isArray(cfg.disabledTools) ? cfg.disabledTools : []),
    }
  }

  // Build the mcpServers config object that MultiServerMCPClient expects.
  // Only includes enabled servers, only includes valid transports (http/sse).
  _buildClientConfig(serverRows) {
    const mcpServers = {}
    for (const row of serverRows) {
      if (!row.enabled) continue
      if (!row.url) continue
      const transport = (row.transport || 'http').toLowerCase()
      if (transport !== 'http' && transport !== 'sse') continue

      mcpServers[row.id] = {
        transport,
        url: row.url,
        headers: row.headers || {},
        ...(transport === 'sse' ? {
          useNodeEventSource: true,
          reconnect: { enabled: true, maxAttempts: 3, delayMs: 1500 },
        } : {}),
      }
    }
    return mcpServers
  }

  // Test connection + list tools for a single server config (does NOT persist).
  // Used by the "test connection" button in the UI.
  async testServer({ id, name, transport, url, headers }) {
    if (!url) return { success: false, error: 'URL is required' }
    const safeTransport = (transport || 'http').toLowerCase()
    if (safeTransport !== 'http' && safeTransport !== 'sse') {
      return { success: false, error: `Unsupported transport: ${transport}` }
    }

    const clientId = id || 'mcp_test'
    const client = new MultiServerMCPClient({
      throwOnLoadError: false,
      prefixToolNameWithServerName: false,
      mcpServers: {
        [clientId]: {
          transport: safeTransport,
          url,
          headers: headers || {},
          ...(safeTransport === 'sse' ? {
            useNodeEventSource: true,
            reconnect: { enabled: true, maxAttempts: 1, delayMs: 1000 },
          } : {}),
        },
      },
    })

    try {
      const rawClient = await client.getClient(clientId)
      if (!rawClient) return { success: false, error: 'MCP server did not initialize' }
      const tools = await this._safeListTools(rawClient)
      const resources = await this._safeListResources(rawClient)
      const resourceTemplates = await this._safeListResourceTemplates(rawClient)
      const prompts = await this._safeListPrompts(rawClient)
      const capabilities = rawClient.getServerCapabilities?.() || {}
      const serverInfo = rawClient.getServerVersion?.() || {}
      const instructions = rawClient.getInstructions?.() || ''
      return {
        success: true,
        name,
        tools,
        resources,
        resourceTemplates,
        prompts,
        capabilities,
        serverInfo,
        instructions,
        count: tools.length,
        counts: {
          tools: tools.length,
          resources: resources.length,
          resourceTemplates: resourceTemplates.length,
          prompts: prompts.length,
        },
      }
    } catch (err) {
      return { success: false, error: err.message || String(err) }
    } finally {
      try { await client.close() } catch {}
    }
  }

  // Sync a server's MCP capabilities to the DB. The method name is kept for IPC compatibility.
  async syncServerTools(serverId) {
    const row = this._db.getMcpServer(serverId)
    if (!row) return { success: false, error: 'Server not found' }

    const res = await this.testServer(row)
    const now = new Date().toISOString()

    if (res.success) {
      this._db.updateMcpServer(serverId, {
        tools_cache: res.tools,
        resources_cache: res.resources,
        resource_templates_cache: res.resourceTemplates,
        prompts_cache: res.prompts,
        capabilities_cache: res.capabilities,
        server_info_cache: res.serverInfo,
        instructions: res.instructions || '',
        last_status: 'connected',
        last_error: '',
        last_synced_at: now,
      })
    } else {
      this._db.updateMcpServer(serverId, {
        last_status: 'error',
        last_error: res.error || '',
        last_synced_at: now,
      })
    }
    return res
  }

  async readResource(serverId, uri) {
    const row = this._db.getMcpServer(serverId)
    if (!row) return { success: false, error: 'Server not found' }
    if (!row.enabled) return { success: false, error: 'Server is disabled' }
    if (!uri) return { success: false, error: 'Resource uri is required' }

    const client = this._createSingleServerClient(row)
    try {
      const rawClient = await client.getClient(row.id)
      if (!rawClient) return { success: false, error: 'MCP server did not initialize' }
      const result = await rawClient.readResource({ uri })
      return {
        success: true,
        serverId: row.id,
        uri,
        contents: (result?.contents || []).map(c => ({
          uri: c.uri || uri,
          mimeType: c.mimeType || '',
          text: typeof c.text === 'string' ? c.text : '',
          blob: typeof c.blob === 'string' ? c.blob : '',
        })),
      }
    } catch (err) {
      return { success: false, error: err.message || String(err), serverId: row.id, uri }
    } finally {
      try { await client.close() } catch {}
    }
  }

  async getPrompt(serverId, name, args = {}) {
    const row = this._db.getMcpServer(serverId)
    if (!row) return { success: false, error: 'Server not found' }
    if (!row.enabled) return { success: false, error: 'Server is disabled' }
    if (!name) return { success: false, error: 'Prompt name is required' }

    const client = this._createSingleServerClient(row)
    try {
      const rawClient = await client.getClient(row.id)
      if (!rawClient) return { success: false, error: 'MCP server did not initialize' }
      const result = await rawClient.getPrompt({ name, arguments: args && typeof args === 'object' ? args : {} })
      return {
        success: true,
        serverId: row.id,
        name,
        description: result?.description || '',
        messages: result?.messages || [],
      }
    } catch (err) {
      return { success: false, error: err.message || String(err), serverId: row.id, name }
    } finally {
      try { await client.close() } catch {}
    }
  }

  async callTool(serverId, toolName, args = {}) {
    const row = this._db.getMcpServer(serverId)
    if (!row) return { success: false, error: 'Server not found', serverId, toolName }
    if (!row.enabled) return { success: false, error: 'Server is disabled', serverId: row.id, toolName }
    if (!toolName) return { success: false, error: 'Tool name is required', serverId: row.id, toolName }
    if ((row.disabled_tools || []).includes(toolName)) {
      return { success: false, error: 'Tool is disabled', serverId: row.id, toolName }
    }

    const client = this._createSingleServerClient(row)
    try {
      const rawClient = await client.getClient(row.id)
      if (!rawClient) return { success: false, error: 'MCP server did not initialize', serverId: row.id, toolName }
      const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
      let result
      if (typeof rawClient.callTool === 'function') {
        result = await rawClient.callTool({ name: toolName, arguments: safeArgs })
      } else {
        const tools = await client.getTools()
        const target = tools.find(t => t.name === toolName)
        if (!target) return { success: false, error: `Tool ${toolName} not found`, serverId: row.id, toolName }
        result = await target.invoke(safeArgs)
      }
      return {
        success: true,
        serverId: row.id,
        toolName,
        result: this._plain(result) || result,
      }
    } catch (err) {
      return { success: false, error: err.message || String(err), serverId: row.id, toolName }
    } finally {
      try { await client.close() } catch {}
    }
  }

  // Build LangChain-compatible proxy tools from cached tools_cache only.
  // No network connection is opened here; each proxy calls MCP lazily on invoke.
  async getLazyToolsForRun(toolIds = []) {
    const requested = this._parseRequestedMcpTools(toolIds)
    if (!requested.hasRequests) return { tools: [], clients: [] }

    const rows = this._db.listMcpServers()
      .filter(row => row.enabled && row.url && requested.serverWanted(row.id))

    const tools = []
    for (const row of rows) {
      const disabled = new Set(row.disabled_tools || [])
      const cachedTools = Array.isArray(row.tools_cache) ? row.tools_cache : []
      for (const meta of cachedTools) {
        const name = String(meta?.name || '').trim()
        if (!name || disabled.has(name) || !requested.toolWanted(row.id, name)) continue
        tools.push(this._createLazyTool(row, meta))
      }
    }
    return { tools, clients: [] }
  }

  // Returns a LangChain tools array aggregated from all enabled MCP servers.
  // Each tool is tagged with _mcp_server_id so the agent runtime can filter by
  // agent.tools entries shaped like `mcp:{serverId}:{toolName}`.
  // Caller is responsible for calling closeClients() when the run finishes.
  async getActiveTools() {
    const allRows = this._db.listMcpServers()
    const clients = []
    const taggedTools = []

    for (const row of allRows) {
      if (!row.enabled || !row.url) continue
      const transport = (row.transport || 'http').toLowerCase()
      if (transport !== 'http' && transport !== 'sse') continue

      const client = new MultiServerMCPClient({
        throwOnLoadError: false,
        onConnectionError: 'ignore',
        prefixToolNameWithServerName: false,
        mcpServers: {
          [row.id]: {
            transport,
            url: row.url,
            headers: row.headers || {},
            ...(transport === 'sse' ? {
              useNodeEventSource: true,
              reconnect: { enabled: true, maxAttempts: 2, delayMs: 1500 },
            } : {}),
          },
        },
      })

      try {
        const tools = await client.getTools()
        const disabled = new Set(row.disabled_tools || [])
        for (const t of tools) {
          if (disabled.has(t.name)) continue
          // Tag tool with its source server so AgentService can filter by agent.tools list
          t._mcp_server_id = row.id
          t._mcp_tool_name = t.name
          taggedTools.push(t)
        }
        clients.push(client)
      } catch (err) {
        console.error(`[McpService] Server ${row.id} (${row.name}) failed:`, err.message)
        try { await client.close() } catch {}
      }
    }

    return { tools: taggedTools, clients }
  }

  // Close every client returned from getActiveTools.
  async closeClients(clients) {
    if (!clients?.length) return
    for (const c of clients) {
      try { await c.close() } catch {}
    }
  }

  // Legacy alias for the single-client case (kept so existing callers don't break).
  async closeClient(clientOrClients) {
    if (!clientOrClients) return
    if (Array.isArray(clientOrClients)) return this.closeClients(clientOrClients)
    try { await clientOrClients.close() } catch {}
  }

  _parseRequestedMcpTools(toolIds = []) {
    const wantServers = new Set()
    const wantTools = new Set()
    for (const id of toolIds || []) {
      if (typeof id !== 'string' || !id.startsWith('mcp:')) continue
      const parts = id.split(':')
      if (parts.length === 2 && parts[1]) wantServers.add(parts[1])
      else if (parts.length >= 3 && parts[1]) wantTools.add(`${parts[1]}:${parts.slice(2).join(':')}`)
    }
    return {
      hasRequests: wantServers.size > 0 || wantTools.size > 0,
      serverWanted: serverId => wantServers.has(serverId) || [...wantTools].some(key => key.startsWith(`${serverId}:`)),
      toolWanted: (serverId, toolName) => wantServers.has(serverId) || wantTools.has(`${serverId}:${toolName}`),
    }
  }

  _createLazyTool(row, meta) {
    const toolName = meta.name
    const schemaText = this._formatToolSchema(meta.inputSchema || meta.schema)
    const description = [
      meta.description || `MCP tool ${toolName}`,
      `MCP server: ${row.name || row.id} (${row.id}).`,
      'This tool connects to the MCP server only when invoked.',
      schemaText ? `Input schema: ${schemaText}` : '',
    ].filter(Boolean).join('\n')

    const lazyTool = tool(
      async (input = {}) => {
        const result = await this.callTool(row.id, toolName, input)
        return this._formatToolResult(result)
      },
      {
        name: toolName,
        description,
        schema: z.record(z.string(), z.any()),
      },
    )
    lazyTool._mcp_server_id = row.id
    lazyTool._mcp_tool_name = toolName
    lazyTool._mcp_lazy = true
    return lazyTool
  }

  _formatToolSchema(schema) {
    if (!schema) return ''
    try {
      return JSON.stringify(schema).slice(0, 4000)
    } catch {
      return ''
    }
  }

  _formatToolResult(result) {
    if (!result?.success) {
      return JSON.stringify({
        success: false,
        code: 'MCP_TOOL_CALL_FAILED',
        serverId: result?.serverId,
        toolName: result?.toolName,
        message: result?.error || 'MCP tool call failed.',
      })
    }

    const content = result.result?.content
    if (Array.isArray(content)) {
      const text = content
        .filter(item => item?.type === 'text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n')
      const hasOnlyText = content.every(item => item?.type === 'text')
      if (text && hasOnlyText) return this._clipText(text)
    }

    return this._clipText(JSON.stringify({
      success: true,
      serverId: result.serverId,
      toolName: result.toolName,
      result: result.result,
    }))
  }

  _clipText(value, limit = 60000) {
    const text = String(value || '')
    return text.length > limit ? `${text.slice(0, limit)}\n\n[内容已截断：超过 ${limit} 字符]` : text
  }

  // Convert a zod schema to a plain JSON-serializable shape for the renderer.
  _serializeSchema(schema) {
    if (!schema) return null
    try {
      if (typeof schema._def === 'object') {
        // Zod schema → best-effort to a minimal description
        return { type: 'zod', summary: schema._def?.typeName || 'object' }
      }
      // JSON Schema or object — try direct JSON
      JSON.stringify(schema)
      return schema
    } catch {
      return null
    }
  }

  _createSingleServerClient(row) {
    const transport = (row.transport || 'http').toLowerCase()
    return new MultiServerMCPClient({
      throwOnLoadError: false,
      prefixToolNameWithServerName: false,
      mcpServers: {
        [row.id]: {
          transport,
          url: row.url,
          headers: row.headers || {},
          ...(transport === 'sse' ? {
            useNodeEventSource: true,
            reconnect: { enabled: true, maxAttempts: 1, delayMs: 1000 },
          } : {}),
        },
      },
    })
  }

  async _safeListTools(client) {
    try {
      const result = await client.listTools()
      return (result?.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        schema: this._serializeSchema(t.inputSchema || t.schema),
        inputSchema: this._serializeSchema(t.inputSchema),
        annotations: this._plain(t.annotations),
      }))
    } catch {
      return []
    }
  }

  async _safeListResources(client) {
    try {
      const result = await client.listResources()
      return (result?.resources || []).map(r => ({
        uri: r.uri,
        name: r.title || r.name || r.uri,
        description: r.description || '',
        mimeType: r.mimeType || '',
        size: typeof r.size === 'number' ? r.size : undefined,
        annotations: this._plain(r.annotations),
      }))
    } catch {
      return []
    }
  }

  async _safeListResourceTemplates(client) {
    try {
      const result = await client.listResourceTemplates()
      return (result?.resourceTemplates || []).map(t => ({
        uriTemplate: t.uriTemplate,
        name: t.title || t.name || t.uriTemplate,
        description: t.description || '',
        mimeType: t.mimeType || '',
        annotations: this._plain(t.annotations),
      }))
    } catch {
      return []
    }
  }

  async _safeListPrompts(client) {
    try {
      const result = await client.listPrompts()
      return (result?.prompts || []).map(p => ({
        name: p.name,
        description: p.description || '',
        arguments: Array.isArray(p.arguments) ? p.arguments.map(a => ({
          name: a.name,
          description: a.description || '',
          required: !!a.required,
        })) : [],
      }))
    } catch {
      return []
    }
  }

  _plain(value) {
    if (value === undefined || value === null) return undefined
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return undefined
    }
  }
}
