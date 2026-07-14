import { BaseWebProvider } from './BaseWebProvider.js'
import { normalizeMarkdown, titleFromMarkdown } from '../WebImportContent.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from '../WebImportErrors.js'

function extractUrl(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, '')
  return base.endsWith('/extract') ? base : `${base}/extract`
}

export class TavilyWebProvider extends BaseWebProvider {
  constructor(options = {}) { super({ id: 'tavily', name: 'Tavily Extract', formats: ['markdown'], ...options }) }

  async extract(url, config, { formats, signal, maxResponseBytes } = {}) {
    this.validateConfig(config)
    this.validateFormats(formats)
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    else headers['X-Tavily-Access-Mode'] = 'keyless'
    const result = await this.request(extractUrl(config.baseUrl), {
      method: 'POST', headers, signal,
      body: JSON.stringify({ urls: [url], format: 'markdown', extract_depth: 'basic', include_images: false }),
    }, { maxResponseBytes })
    let payload
    try { payload = JSON.parse(result.text) } catch { throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, 'Tavily 返回了无效响应。', { provider: this.id }) }
    if (payload.failed_results?.length) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, 'Tavily 无法解析该网页。', { provider: this.id })
    const item = payload.results?.[0]
    const markdown = normalizeMarkdown(item?.raw_content || item?.content || '')
    if (!markdown.trim()) throw new WebImportError(WEB_IMPORT_ERROR_CODES.EMPTY_CONTENT, 'Tavily 未返回可用正文。', { provider: this.id })
    const finalUrl = item.url || url
    const title = item.title || titleFromMarkdown(markdown, new URL(finalUrl).hostname)
    return { title, content: { markdown, html: null }, requestedUrl: url, finalUrl, provider: this.id, fetchedAt: new Date().toISOString(), metadata: { statusCode: result.response.status, requestId: payload.request_id || '', usage: payload.usage || null } }
  }
}
