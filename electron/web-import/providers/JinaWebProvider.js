import { BaseWebProvider } from './BaseWebProvider.js'
import { normalizeMarkdown, titleFromMarkdown } from '../WebImportContent.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from '../WebImportErrors.js'

function readerUrl(baseUrl, targetUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${targetUrl}`
}

export class JinaWebProvider extends BaseWebProvider {
  constructor(options = {}) { super({ id: 'jina', name: 'Jina Reader', formats: ['markdown', 'html'], ...options }) }

  async extract(url, config, { formats, signal, maxResponseBytes } = {}) {
    this.validateConfig(config)
    const requested = this.validateFormats(formats)
    const headers = { Accept: 'text/markdown' }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    const markdownResult = await this.request(readerUrl(config.baseUrl, url), { method: 'GET', headers, signal }, { maxResponseBytes })
    const markdown = normalizeMarkdown(markdownResult.text)
    if (!markdown.trim()) throw new WebImportError(WEB_IMPORT_ERROR_CODES.EMPTY_CONTENT, 'Jina Reader 未返回可用正文。', { provider: this.id })
    const finalUrl = markdownResult.response.headers.get('x-url') || url
    const title = markdownResult.response.headers.get('x-title') || titleFromMarkdown(markdown, new URL(finalUrl).hostname)
    let html = null
    let htmlError = null
    if (requested.includes('html')) {
      try {
        const htmlResult = await this.request(readerUrl(config.baseUrl, url), { method: 'GET', headers: { ...headers, Accept: 'text/html' }, signal }, { maxResponseBytes })
        html = htmlResult.text || null
        if (!html) throw new WebImportError(WEB_IMPORT_ERROR_CODES.EMPTY_CONTENT, 'Jina Reader 未返回 HTML。', { provider: this.id })
      } catch (error) { htmlError = error }
    }
    return { title, content: { markdown, html }, requestedUrl: url, finalUrl, provider: this.id, fetchedAt: new Date().toISOString(), metadata: { statusCode: markdownResult.response.status, requestId: markdownResult.response.headers.get('x-request-id') || '', usage: null }, htmlError }
  }
}
