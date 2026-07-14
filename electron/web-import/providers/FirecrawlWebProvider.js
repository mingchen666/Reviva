import { BaseWebProvider } from './BaseWebProvider.js'
import { normalizeMarkdown, titleFromMarkdown } from '../WebImportContent.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from '../WebImportErrors.js'

function scrapeUrl(baseUrl) {
  const base = String(baseUrl).replace(/\/+$/, '')
  return base.endsWith('/scrape') ? base : `${base}/scrape`
}

export class FirecrawlWebProvider extends BaseWebProvider {
  constructor(options = {}) { super({ id: 'firecrawl', name: 'Firecrawl', formats: ['markdown', 'html'], ...options }) }

  async extract(url, config, { formats, signal, maxResponseBytes } = {}) {
    this.validateConfig(config)
    const requested = this.validateFormats(formats)
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const result = await this.request(scrapeUrl(config.baseUrl), {
      method: 'POST', headers, signal,
      body: JSON.stringify({ url, formats: requested }),
    }, { maxResponseBytes })
    let payload
    try { payload = JSON.parse(result.text) } catch { throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, 'Firecrawl 返回了无效响应。', { provider: this.id }) }
    if (payload.success === false) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, 'Firecrawl 无法解析该网页。', { provider: this.id })
    const data = payload.data || payload
    const markdown = normalizeMarkdown(data.markdown)
    if (!markdown.trim()) throw new WebImportError(WEB_IMPORT_ERROR_CODES.EMPTY_CONTENT, 'Firecrawl 未返回可用正文。', { provider: this.id })
    const finalUrl = data.metadata?.sourceURL || data.metadata?.url || url
    const title = data.metadata?.title || titleFromMarkdown(markdown, new URL(finalUrl).hostname)
    return { title, content: { markdown, html: requested.includes('html') ? (data.html || null) : null }, requestedUrl: url, finalUrl, provider: this.id, fetchedAt: new Date().toISOString(), metadata: { description: data.metadata?.description || '', language: data.metadata?.language || '', statusCode: data.metadata?.statusCode || result.response.status, requestId: payload.id || '', usage: payload.usage || null } }
  }
}
