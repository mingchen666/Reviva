/**
 * CustomHttpAdapter — 自定义 HTTP 知识源适配器
 *
 * 按 config 中的 endpoint 定义组装 HTTP 请求，注入认证信息，
 * 按 response.items_path 定位结果数组，按 field_mapping 映射为 KBP 标准格式。
 *
 * KBP 标准输出：{ status: 'ok'|'error', result: [{ content, title?, source? }] }
 */

const DEFAULT_TIMEOUT_MS = 30000

/**
 * Resolve a dot-notation path on an object, supporting array indices.
 * Examples: "data.list", "data.0.title", "properties.title.0.plain_text"
 * @returns {*} the value at the path, or undefined if not found
 */
export function getByPath(obj, path) {
  if (!obj || !path) return undefined
  const segments = String(path).split('.')
  let current = obj
  for (const seg of segments) {
    if (current == null) return undefined
    if (Array.isArray(current) && /^\d+$/.test(seg)) {
      current = current[Number(seg)]
    } else if (current && typeof current === 'object') {
      current = current[seg]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Replace {placeholder} tokens in a string with values from params.
 */
function replacePlaceholders(str, params) {
  if (typeof str !== 'string') return str
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key]
    if (val === undefined || val === null) return ''
    return String(val)
  })
}

/**
 * If a string is exactly a single placeholder like "{top_k}", return the raw
 * value from params so numbers/booleans keep their type instead of becoming strings.
 * Otherwise do a normal string replacement.
 */
function smartReplace(str, params) {
  if (typeof str !== 'string') return str
  const exact = str.match(/^\{(\w+)\}$/)
  if (exact) {
    const val = params[exact[1]]
    if (val !== undefined && val !== null) return val
    return ''
  }
  return replacePlaceholders(str, params)
}

/**
 * Deep-replace placeholders, preserving types for single-placeholder values.
 */
function deepReplace(obj, params) {
  if (typeof obj === 'string') return smartReplace(obj, params)
  if (Array.isArray(obj)) return obj.map(v => deepReplace(v, params))
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) result[k] = deepReplace(v, params)
    return result
  }
  return obj
}

/**
 * Try to parse a string value back to its native JSON type.
 * "[]" -> [], "{}" -> {}, "true" -> true, "42" -> 42, "null" -> null.
 * Non-JSON strings are returned as-is.
 */
function coerceJsonString(val) {
  if (typeof val !== 'string') return val
  const trimmed = val.trim()
  if (trimmed === '' ) return val
  // Only coerce arrays, objects, booleans, null, and numbers — not quoted strings
  if (!/^[\[{]/.test(trimmed) && !/^(true|false|null|-?\d)/.test(trimmed)) return val
  try {
    return JSON.parse(trimmed)
  } catch {
    return val
  }
}

/**
 * Deep-coerce string values that look like JSON into their native types.
 * Fixes AI-generated configs where arrays/objects are stored as string literals.
 */
function deepCoerceJsonStrings(obj) {
  if (typeof obj === 'string') return coerceJsonString(obj)
  if (Array.isArray(obj)) return obj.map(deepCoerceJsonStrings)
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(obj)) result[k] = deepCoerceJsonStrings(v)
    return result
  }
  return obj
}

/**
 * Resolve {{USER_TOKEN}} style placeholders from config._form.
 * Custom HTTP sources store the API key in _form.USER_TOKEN while the
 * adapter config keeps the {{USER_TOKEN}} placeholder in auth.token/key.
 * Preset sources already have placeholders filled at save time, so this
 * is a no-op for them.
 */
function resolveUserTokens(config) {
  const form = config?._form
  if (!form) return config
  const json = JSON.stringify(config)
  if (!json.includes('{{')) return config
  const resolved = json.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = form[key]
    if (val === undefined || val === null) return ''
    return String(val).replace(/"/g, '\\"')
  })
  try { return JSON.parse(resolved) } catch { return config }
}

/**
 * Build auth headers from config.auth.
 * Supports: bearer, api_key, basic, none.
 */
function buildAuthHeaders(auth = {}) {
  const headers = {}
  switch (auth.type) {
    case 'bearer':
      headers['Authorization'] = 'Bearer ' + (auth.token || '')
      break
    case 'api_key':
      if (auth.header) headers[auth.header] = auth.key || ''
      break
    case 'basic':
      if (auth.username) {
        const cred = btoa(auth.username + ':' + (auth.password || ''))
        headers['Authorization'] = 'Basic ' + cred
      }
      break
  }
  return headers
}

/**
 * Build a URL from base_url + path, optionally appending query params.
 */
function buildUrl(baseUrl, path, queryParams) {
  const root = String(baseUrl || '').replace(/\/+$/, '')
  const suffix = String(path || '').replace(/^\/+/, '')
  let url = root + '/' + suffix
  if (queryParams && typeof queryParams === 'object') {
    const entries = Object.entries(queryParams).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length) {
      const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
      url += (url.includes('?') ? '&' : '?') + qs
    }
  }
  return url
}

/**
 * Map a raw result item to KBP standard format using field_mapping.
 * field_mapping keys are KBP standard fields, values are source field paths.
 * If no mapping is provided, return the item as-is.
 */
function mapItem(rawItem, fieldMapping = {}) {
  if (!fieldMapping || Object.keys(fieldMapping).length === 0) return rawItem
  const result = {}
  for (const [targetField, sourcePath] of Object.entries(fieldMapping)) {
    const value = getByPath(rawItem, sourcePath)
    if (value !== undefined) result[targetField] = value
  }
  // Preserve any unmapped fields from the raw item
  for (const [k, v] of Object.entries(rawItem)) {
    if (!(k in result)) result[k] = v
  }
  return result
}

export class CustomHttpAdapter {
  /**
   * Get capabilities from the source config.
   * @returns {{ interfaces: string[], content_types: string[] }}
   */
  getCapabilities(config = {}) {
    return config.capabilities || { interfaces: ['search'], content_types: ['text'] }
  }

 /**
  * Execute a search against the custom HTTP endpoint.
  * @param {object} config - full knowledge source config (base_url, auth, endpoints)
  * @param {object} params - { query, top_k, ... }
  * @returns {Promise<{ status: string, result?: array, message?: string }>}
  */
async search(config = {}, params = {}) {
 config = resolveUserTokens(config)
 const { query = '', top_k = 5 } = params
  const endpoint = config.endpoints?.search

   if (!endpoint) {
     return { status: 'error', message: 'No search endpoint configured' }
   }
   if (!query) {
     return { status: 'error', message: 'Missing query parameter' }
   }

  const callParams = { ...params, query, top_k }

   // Build URL
   const queryParams = endpoint.query_params
     ? deepReplace(endpoint.query_params, callParams)
     : undefined
   const url = buildUrl(config.base_url, endpoint.path, queryParams)

   // Build headers
   const headers = {
     'Content-Type': 'application/json',
     ...(config.default_headers || {}),
     ...buildAuthHeaders(config.auth),
   }

   // Build fetch options
   const fetchOpts = { method: endpoint.method || 'POST', headers }
  if (endpoint.method !== 'GET' && endpoint.body) {
    let body = deepCoerceJsonStrings(deepReplace(endpoint.body, callParams))
    // Merge agent-supplied extra fields, overriding config static values
    if (params.extra_body && typeof params.extra_body === 'object' && !Array.isArray(params.extra_body)) {
      body = { ...body, ...params.extra_body }
    }
    fetchOpts.body = JSON.stringify(body)
  }

   // Send request
   let resp
   try {
     resp = await fetch(url, {
       ...fetchOpts,
       signal: AbortSignal.timeout(endpoint.timeout_ms || DEFAULT_TIMEOUT_MS),
     })
   } catch (e) {
     return { status: 'error', message: e?.message || 'Network error' }
   }

   if (!resp.ok) {
     const errBody = await resp.text().catch(() => '')
     return {
       status: 'error',
       httpStatus: resp.status,
       message: 'HTTP ' + resp.status + ': ' + errBody.substring(0, 300),
     }
   }

   let data
   try {
     data = await resp.json()
   } catch (e) {
     return { status: 'error', message: 'Response is not valid JSON: ' + (e?.message || '') }
   }

   // Extract result array
   const responseConfig = endpoint.response || {}
   const itemsPath = responseConfig.items_path || 'data'
   const items = getByPath(data, itemsPath)

   if (!Array.isArray(items)) {
     return {
       status: 'error',
       message: 'items_path "' + itemsPath + '" did not resolve to an array (got ' + typeof items + ')',
     }
   }

   // Map fields to KBP standard format
   const fieldMapping = responseConfig.field_mapping || {}
   const result = items.map(item => mapItem(item, fieldMapping))

   // Optional total count
   const total = responseConfig.total_path
     ? getByPath(data, responseConfig.total_path)
     : undefined

   const response = { status: 'ok', result }
   if (total !== undefined) response.total = total
   return response
 }
 
  /**
   * List available knowledge bases from the source's list endpoint.
   * Only works if config.endpoints.list is configured.
   * @param {object} config - full knowledge source config
   * @returns {Promise<{ success: boolean, list?: array, error?: string }>}
   */
 async listKnowledgeBases(config = {}) {
   config = resolveUserTokens(config)
    const endpoint = config.endpoints?.list
    if (!endpoint) {
      return { success: false, error: '此知识源不支持获取知识库列表' }
    }

    const callParams = {}
    const queryParams = endpoint.query_params ? deepReplace(endpoint.query_params, callParams) : undefined
    const url = buildUrl(config.base_url, endpoint.path, queryParams)

    const headers = {
      'Content-Type': 'application/json',
      ...(config.default_headers || {}),
      ...buildAuthHeaders(config.auth),
    }

    const fetchOpts = { method: endpoint.method || 'GET', headers }
   if (endpoint.method !== 'GET' && endpoint.body) {
      fetchOpts.body = JSON.stringify(deepCoerceJsonStrings(deepReplace(endpoint.body, callParams)))
   }

    let resp
    try {
      resp = await fetch(url, { ...fetchOpts, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
    } catch (e) {
      return { success: false, error: e?.message || 'Network error' }
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return { success: false, error: 'HTTP ' + resp.status + ': ' + errText.substring(0, 200) }
    }

    let data
    try {
      data = await resp.json()
    } catch (e) {
      return { success: false, error: 'Response is not valid JSON: ' + (e?.message || '') }
    }

    const itemsPath = endpoint.response?.items_path || 'data'
    const items = getByPath(data, itemsPath)
    if (!Array.isArray(items)) {
      return { success: false, error: '无法解析知识库列表' }
    }

    const idField = endpoint.response?.field_mapping?.id || 'id'
    const nameField = endpoint.response?.field_mapping?.name || 'name'
    const list = items.map(item => ({
      id: String(getByPath(item, idField) || ''),
      name: String(getByPath(item, nameField) || '(未命名)'),
    })).filter(item => item.id)

    return { success: true, list }
  }
}

export const customHttpAdapter = new CustomHttpAdapter()
