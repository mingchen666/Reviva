import { WEB_IMPORT_ERROR_CODES, WebImportError, normalizeWebImportError, providerHttpError } from '../WebImportErrors.js'
import { normalizeRequestedFormats } from '../WebImportTypes.js'
import { readResponseText } from '../WebImportContent.js'

export class BaseWebProvider {
  constructor({ id, name, formats, fetchImpl = globalThis.fetch } = {}) {
    this.id = id || ''
    this.name = name || id || ''
    this.capabilities = { formats: formats || ['markdown'] }
    this.fetch = fetchImpl
  }

  validateConfig(config = {}) {
    if (!config.baseUrl) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_NOT_CONFIGURED, `${this.name} Base URL 未配置。`, { provider: this.id })
  }

  validateFormats(formats) {
    const normalized = normalizeRequestedFormats(formats)
    const unsupported = normalized.find(format => !this.capabilities.formats.includes(format))
    if (unsupported) throw new WebImportError(WEB_IMPORT_ERROR_CODES.FORMAT_UNSUPPORTED, `${this.name} 当前不支持 ${unsupported.toUpperCase()} 输出。`, { provider: this.id })
    return normalized
  }

  async request(url, options, { maxResponseBytes } = {}) {
    let response
    try { response = await this.fetch(url, options) } catch (error) { throw normalizeWebImportError(error, this.id) }
    if (!response.ok) throw providerHttpError(this.id, response.status)
    return { response, text: await readResponseText(response, { maxBytes: maxResponseBytes }) }
  }

}
