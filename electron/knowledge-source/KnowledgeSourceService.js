/**
 * KnowledgeSourceService — IPC 服务层
 *
 * 提供知识源的 CRUD、测试连接、试搜和预设模板加载。
 * 通过 ipcMain.handle 注册 kb:* 通道。
 */

import { PRESETS } from './presets.js'

/**
 * Parse JSON field, returning original on failure.
 */
function _getByPath(obj, path) {
  if (!obj || !path) return undefined
  const segments = String(path).split('.')
  let cur = obj
  for (const seg of segments) {
    if (cur == null) return undefined
    if (Array.isArray(cur) && /^\d+$/.test(seg)) cur = cur[Number(seg)]
    else if (cur && typeof cur === 'object') cur = cur[seg]
    else return undefined
  }
  return cur
}

function parseJSON(field) {
  if (field === null || field === undefined) return field
  if (typeof field !== 'string') return field
  try { return JSON.parse(field) } catch { return field }
}

/**
 * Replace {{USER_TOKEN}} style placeholders in a preset template with user values.
 */
function fillPresetPlaceholders(template, userValues) {
  const json = JSON.stringify(template)
  let filled = json
  // Replace {{USER_TOKEN}} style (double-brace, auth fields)
  filled = filled.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = userValues[key]
    if (val === undefined || val === null) return ''
    return String(val).replace(/"/g, '\\"')
  })
  // Replace {DATASET_ID} style (single-brace, non-runtime fields)
  // Skip {query} and {top_k} which are runtime placeholders
  filled = filled.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (_, key) => {
    const val = userValues[key]
    if (val === undefined || val === null) return '{' + key + '}'
    return String(val).replace(/"/g, '\\"')
  })
  return JSON.parse(filled)
}

export class KnowledgeSourceService {
  /**
   * @param {object} dbService - DatabaseService instance
   * @param {object} registry  - KnowledgeSourceRegistry instance
   */
  constructor(dbService, registry) {
    this._dbService = dbService
    this._registry = registry
    this._createModelFn = null
  }

  /**
   * Set the model factory for AI-assisted adapter analysis.
   * The factory receives (providerId, apiKey, baseUrl, modelName, options) and returns a LangChain model.
   */
  setCreateModel(fn) {
    this._createModelFn = fn
  }

  get _db() {
    return this._dbService?.db
  }

  // ── CRUD ───────────────────────────────────────────────────

  listSources() {
    return this._registry.listSources()
  }

  getSource(id) {
    return this._registry.getSource(id)
  }

  addSource(data) {
    const id = data.id || 'ks_' + Date.now()
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
    this._db.prepare(
      'INSERT INTO knowledge_sources (id, name, type, preset, enabled, config, cached_capabilities, cached_tools, created_at, last_synced_at, last_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      data.name || '',
      data.type || 'http',
      data.preset || '',
      data.enabled === false ? 0 : 1,
      JSON.stringify(data.config || {}),
      JSON.stringify(data.cachedCapabilities || {}),
      JSON.stringify(data.cachedTools || []),
      now,
      '',
      'never_tested'
    )
    this._registry.reload()
    return this._registry.getSource(id)
  }

  updateSource(id, data) {
    const sets = []
    const values = []
   const jsonFields = { config: true, cached_capabilities: true, cached_tools: true }
   const updatableCols = new Set(['name', 'type', 'preset', 'enabled', 'config', 'cached_capabilities', 'cached_tools', 'last_synced_at', 'last_status'])

   for (const [key, value] of Object.entries(data)) {
     if (key === 'id') continue
     if (value === undefined || value === null) continue
     const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
     if (!updatableCols.has(col)) continue
     if (jsonFields[col]) {
        sets.push(col + ' = ?')
        values.push(JSON.stringify(value))
      } else if (col === 'enabled') {
        sets.push('enabled = ?')
        values.push(value ? 1 : 0)
      } else {
        sets.push(col + ' = ?')
        values.push(value)
      }
    }

    if (sets.length === 0) return this._registry.getSource(id)
    values.push(id)
    this._db.prepare('UPDATE knowledge_sources SET ' + sets.join(', ') + ' WHERE id = ?').run(...values)
    this._registry.reload()
    return this._registry.getSource(id)
  }

  deleteSource(id) {
    this._db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id)
    this._registry.reload()
    return { success: true }
  }

  // ── Active source ──────────────────────────────────────────

  getActiveSourceId() {
    return this._dbService?.getSetting?.('activeKnowledgeSourceId') || ''
  }

  setActiveSource(id) {
    this._dbService?.setSetting?.('activeKnowledgeSourceId', id || '')
    return { success: true }
  }

  // ── Test & Search ──────────────────────────────────────────

  async testConnection(id) {
    const source = this._registry.getSource(id)
    if (!source) return { success: false, error: 'Knowledge source not found' }
    try {
      const result = await this._registry.search(id, { query: 'test', top_k: 1 })
      const ok = result.status === 'ok'
      // Update last_status and last_synced_at
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
      this.updateSource(id, { lastStatus: ok ? 'connected' : 'error', lastSyncedAt: now })
      return { success: ok, result, message: ok ? '' : (result.message || 'Connection failed') }
    } catch (e) {
      this.updateSource(id, { lastStatus: 'error' })
      return { success: false, error: e?.message || 'Test failed' }
    }
  }

  async search(id, params = {}) {
    return this._registry.search(id, params)
  }

  // ── Presets ────────────────────────────────────────────────

  /**
   * List available preset templates from the presets/ directory.
   * @returns {array} preset metadata list
   */
  getPresets() {
    const presets = []
    for (const template of PRESETS) {
      presets.push({
        preset: template.preset || '',
        name: template.name || template.preset || '',
        type: template.type || 'http',
        base_url: template.base_url || '',
        capabilities: template.capabilities || { interfaces: ['search'], content_types: ['text'] },
        authFields: this._extractAuthFields(template.auth),
        userFields: this._extractAllPlaceholders(template),
      })
    }
    return presets
  }

  /**
   * Get a full preset template by name, with user values injected.
   * @param {string} presetName - preset file name without .json
   * @param {object} userValues - { USER_TOKEN: 'xxx', ... }
   * @returns {object|null} filled config for CustomHttpAdapter
   */
  getPresetConfig(presetName, userValues = {}) {
    const template = PRESETS.find(p => p.preset === presetName)
    if (!template) return null
    return fillPresetPlaceholders(template, userValues)
  }

  /**
   * Extract placeholder field names from an auth config.
   * {{USER_TOKEN}} -> 'USER_TOKEN'
   */
  _extractAuthFields(auth = {}) {
    const fields = []
    if (!auth || typeof auth !== 'object') return fields
    const checkValue = (val) => {
      if (typeof val !== 'string') return
      const match = val.match(/\{\{(\w+)\}\}/)
      if (match) fields.push(match[1])
    }
    for (const value of Object.values(auth)) {
      if (typeof value === 'object') {
        for (const v of Object.values(value)) checkValue(v)
      } else {
        checkValue(value)
      }
    }
    return [...new Set(fields)]
  }

  /**
   * Extract all {PLACEHOLDER} field names from the entire template JSON.
   * Excludes runtime placeholders {query} and {top_k}.
   * Returns an array of { name, label } objects.
   */
  _extractAllPlaceholders(template) {
    const found = new Set()
    const json = JSON.stringify(template)
    // Match {WORD} but not {{WORD}} (double-brace auth placeholders)
    const regex = /\{([A-Z][A-Z0-9_]*)\}/g
    let match
    while ((match = regex.exec(json)) !== null) {
      const name = match[1]
      if (name !== 'query' && name !== 'top_k') {
        found.add(name)
      }
    }
    // Also check {{USER_TOKEN}} style
    const authFields = this._extractAuthFields(template.auth)
    for (const f of authFields) found.add(f)
    return [...found].map(name => ({
      name,
      label: name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
      isAuth: authFields.includes(name),
    }))
  }

  // ── IPC Registration ───────────────────────────────────────
  // ── AI-Assisted Adapter ────────────────────────────────────

  /**
   * Analyze a request/response example using the user's configured LLM
   * and generate a CustomHttpAdapter config.
   * @param {object} params - { requestExample, responseExample, baseUrl, createModel }
   * @returns {Promise<{ success: boolean, config?: object, error?: string }>}
  */
  async analyzeRequestResponse({ requestExample, responseExample, listRequestExample, listResponseExample, baseUrl, createModel }) {
    if (!this._createModelFn && !createModel) {
      return { success: false, error: 'No model factory configured' }
    }

    const systemPrompt = [
      'You are an API integration expert. Analyze the HTTP request/response examples or API documentation provided by the user and generate a JSON configuration for a custom HTTP knowledge base adapter.',
      'The user may paste the request and response together in a single text block, or provide them separately. Parse the HTTP method, URL, headers, body from the request, and the JSON structure from the response.',
      '',
      '## OUTPUT SCHEMA',
      '',
      'The output JSON must have this structure:',
      '{',
      '  "base_url": "https://api.example.com/v1",',
      '  "auth": { "type": "bearer", "token": "{{USER_TOKEN}}" },',
      '  "capabilities": { "interfaces": ["search"], "content_types": ["text"] },',
      '  "endpoints": {',
      '    "search": {',
      '      "method": "POST",',
      '      "path": "/api/search",',
      '      "body": { "query": "{query}", "top_k": "{top_k}" },',
      '      "query_params": {},',
      '      "response": {',
      '        "items_path": "data.results",',
      '        "field_mapping": { "content": "content", "title": "title", "source": "url", "score": "score" },',
      '        "total_path": "data.total"',
      '      }',
      '    }',
      '  }',
      '}',
      '',
      'For a GET API, parameters go in query_params instead of body:',
      '{',
      '  "endpoints": {',
      '    "search": {',
      '      "method": "GET",',
      '      "path": "/api/search",',
      '      "body": {},',
      '      "query_params": { "q": "{query}", "limit": "{top_k}" },',
      '      "response": { ... }',
      '    }',
      '  }',
      '}',
      '',
      'Optional "list" endpoint (only if the API exposes a knowledge base listing API):',
      '  "list": {',
      '    "method": "GET|POST",',
      '    "path": "/api/kb/list",',
      '    "response": {',
      '      "items_path": "data",',
      '      "field_mapping": { "id": "id", "name": "name" }',
      '    }',
      '  }',
      '',
      '## RULES',
      '',
      '1. body vs query_params: For POST requests, put parameters in "body". For GET requests, put them in "query_params" and leave "body" as {}.',
      '2. CRITICAL: body and query_params KEYS must be the ACTUAL parameter names the target API expects. Extract them from the request example or API docs. If the request body is {"query": "hello", "scope": "all", "limit": 5}, the config must use keys "query", "scope", "limit" - NOT "query_param_name" or any placeholder word.',
      '3. Runtime values must be wrapped in braces: "{query}" for the search text, "{top_k}" for result count. Plain strings without braces are sent verbatim (e.g. {"scope": "all"} sends the literal string "all").',
      '4. Include ALL required fields the API expects. If the request example has additional fields beyond query and limit/count, include them all with their values from the example. Do not silently drop any field.',
      '4a. Non-query fields in body/query_params are DEFAULT values, not fixed constants. Write them with the default values from the request example. At runtime an AI agent may override any of these fields, so just provide sensible defaults — do not treat them as immutable. Only {query} and {top_k} are runtime placeholders; everything else is an overridable default.',
     '5. Nested body structures are supported. If the API expects {"filter": {"query": "...", "limit": 5}}, generate {"filter": {"query": "{query}", "limit": "{top_k}"}}.',
      '6. "path" is the URL path RELATIVE to base_url, without the leading domain. If the full URL is https://api.example.com/v1/knowledge/search and base_url is https://api.example.com/v1, then path is "/knowledge/search".',
      '7. "items_path" locates the result array in the response JSON using dot notation (e.g. "data.results", "records", "data.list"). Look at the response example and find where the array of search results lives.',
      '8. "field_mapping" maps KBP standard fields to source field paths in each result item: content (main text), title, source (URL or reference), score. Use dot notation for nested fields (e.g. "segment.content").',
      '9. auth.type: "bearer" for Authorization: Bearer headers, "api_key" for custom headers, "none" if no auth. Use "{{USER_TOKEN}}" as the token value so the user API key is injected at runtime.',
      '10. The "list" endpoint is OPTIONAL. Only include it if the user clearly shows a knowledge base/collection listing API. If unsure, omit it.',
      '11. Output ONLY the JSON. No markdown fences, no explanation, no comments.',
    ].join('\n')

    let userPrompt = 'Base URL: ' + (baseUrl || '(unknown)') + '\n\nSearch API examples (request and/or response, may be mixed together):\n' + (requestExample || '(not provided)')
    if (responseExample) {
      userPrompt += '\n\nSearch API Response Example:\n' + responseExample
    }
    if (listRequestExample || listResponseExample) {
      userPrompt += '\n\nList API examples (request and/or response, may be mixed together):\n' + (listRequestExample || '(not provided)')
      if (listResponseExample) {
        userPrompt += '\n\nList API Response Example:\n' + listResponseExample
      }
    }
    userPrompt += '\n\nGenerate the adapter configuration JSON.'

    try {
    const modelFn = createModel || this._createModelFn
    const model = typeof modelFn === 'function' ? modelFn() : modelFn
    const result = await model.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    let text = typeof result === 'string' ? result : (result?.content || result?.text || '')
    if (typeof text !== 'string') text = JSON.stringify(text)

    // Strip markdown fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    const config = JSON.parse(text)
    return { success: true, config }
    } catch (e) {
      const detail = e?.message || String(e)
      const status = e?.response?.status || e?.status || e?.lc_error?.status || ''
      const cause = e?.cause?.message || e?.lc_error?.message || ''
      const errStr = [status ? `[${status}]` : '', detail, cause ? `(${cause})` : ''].filter(Boolean).join(' ')
      console.error('[KB AI Analyze] error:', errStr, '\nFull error:', e)
      return { success: false, error: errStr }
    }
  }

  /**
   * Fetch available knowledge bases from a preset platform's list endpoint.
   * Only Dify and FastGPT have list endpoints; IMA returns error.
   */
  async fetchKnowledgeBases(presetName, userValues = {}) {
    const template = PRESETS.find(p => p.preset === presetName)
    if (!template) return { success: false, error: '预设不存在' }
    const listEp = template.endpoints?.list
    if (!listEp) return { success: false, error: '此预设不支持获取知识库列表，请手动填写' }

    const config = fillPresetPlaceholders(template, userValues)
    if (userValues.base_url) config.base_url = userValues.base_url

    const root = String(config.base_url || '').replace(/\/+$/, '')
    const suffix = String(listEp.path || '').replace(/^\/+/, '')
    const url = root + '/' + suffix

    const headers = { 'Content-Type': 'application/json', ...(config.default_headers || {}) }
    if (config.auth?.type === 'bearer') headers['Authorization'] = 'Bearer ' + (config.auth.token || '')
    else if (config.auth?.type === 'api_key' && config.auth.header) headers[config.auth.header] = config.auth.key || ''

    const opts = { method: listEp.method || 'GET', headers }
    if ((listEp.method || 'GET') !== 'GET' && listEp.body) opts.body = JSON.stringify(listEp.body)

    try {
      const resp = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        return { success: false, error: 'HTTP ' + resp.status + ': ' + errText.substring(0, 200) }
      }
      const data = await resp.json()
      const items = _getByPath(data, listEp.response?.items_path || 'data')
      if (!Array.isArray(items)) return { success: false, error: '无法解析知识库列表' }

      const idField = listEp.response?.field_mapping?.id || 'id'
      const nameField = listEp.response?.field_mapping?.name || 'name'
      const list = items.map(item => ({
        id: String(_getByPath(item, idField) || ''),
        name: String(_getByPath(item, nameField) || '(未命名)'),
      })).filter(item => item.id)

      return { success: true, list }
    } catch (e) {
     return { success: false, error: e?.message || '请求失败' }
   }
 }

  /**
   * List available knowledge bases from any saved source (preset/custom/mcp).
   * Routes through the Registry to the source's adapter.
   * @param {string} sourceId
   * @returns {Promise<{ success: boolean, list?: array, error?: string }>}
   */
  async listKnowledgeBases(sourceId) {
    return this._registry.listKnowledgeBases(sourceId)
  }

  registerIpc(ipcMain) {
    ipcMain.handle('kb:fetchKnowledgeBases', async (_, presetName, userValues) => this.fetchKnowledgeBases(presetName, userValues))
    ipcMain.handle('kb:listKnowledgeBases', (_, sourceId) => this.listKnowledgeBases(sourceId))
   ipcMain.handle('kb:listSources', () => this.listSources())
    ipcMain.handle('kb:getSource', (_, id) => this.getSource(id))
    ipcMain.handle('kb:addSource', (_, data) => this.addSource(data))
    ipcMain.handle('kb:updateSource', (_, id, data) => this.updateSource(id, data))
    ipcMain.handle('kb:deleteSource', (_, id) => this.deleteSource(id))
    ipcMain.handle('kb:testConnection', (_, id) => this.testConnection(id))
    ipcMain.handle('kb:search', (_, id, params) => this.search(id, params))
    ipcMain.handle('kb:getPresets', () => this.getPresets())
    ipcMain.handle('kb:getPresetConfig', (_, presetName, userValues) => this.getPresetConfig(presetName, userValues))
    ipcMain.handle('kb:getActiveSourceId', () => this.getActiveSourceId())
    ipcMain.handle('kb:setActiveSource', (_, id) => this.setActiveSource(id))
    ipcMain.handle('kb:analyzeRequestResponse', async (_, params) => {
      // params: { requestExample, responseExample, baseUrl, providerId, apiKey, baseUrl, model }
    const { providerId, apiKey, model: modelName, baseUrl: modelBaseUrl } = params || {}
    // Fallback: look up provider baseUrl and apiFormat from DB if not provided by frontend
    let resolvedBaseUrl = modelBaseUrl
    let resolvedApiFormat = params?.apiFormat || ''
    if (!resolvedBaseUrl && providerId && this._dbService) {
      try {
        const providers = this._dbService.getSetting('providers') || []
        const p = providers.find(x => x.id === providerId)
        if (p) {
          resolvedBaseUrl = p.baseUrl || ''
          resolvedApiFormat = resolvedApiFormat || p.apiFormat || ''
        }
      } catch {}
    }
    const createModel = this._createModelFn
        ? () => this._createModelFn(providerId, apiKey, resolvedBaseUrl, modelName, { streaming: false, timeout: 300000, apiFormat: resolvedApiFormat })
        : null
      return this.analyzeRequestResponse({ ...params, createModel })
    })
  }
}
