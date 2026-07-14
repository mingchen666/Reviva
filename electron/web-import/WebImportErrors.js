export const WEB_IMPORT_ERROR_CODES = Object.freeze({
  PROVIDER_NOT_SELECTED: 'WEB_IMPORT_PROVIDER_NOT_SELECTED',
  PROVIDER_NOT_CONFIGURED: 'WEB_IMPORT_PROVIDER_NOT_CONFIGURED',
  FORMAT_UNSUPPORTED: 'WEB_IMPORT_FORMAT_UNSUPPORTED',
  INVALID_URL: 'WEB_IMPORT_INVALID_URL',
  PRIVATE_URL_UNSUPPORTED: 'WEB_IMPORT_PRIVATE_URL_UNSUPPORTED',
  TARGET_MISSING: 'WEB_IMPORT_TARGET_MISSING',
  TIMEOUT: 'WEB_IMPORT_TIMEOUT',
  AUTH_FAILED: 'WEB_IMPORT_AUTH_FAILED',
  RATE_LIMITED: 'WEB_IMPORT_RATE_LIMITED',
  QUOTA_EXCEEDED: 'WEB_IMPORT_QUOTA_EXCEEDED',
  EMPTY_CONTENT: 'WEB_IMPORT_EMPTY_CONTENT',
  RESPONSE_TOO_LARGE: 'WEB_IMPORT_RESPONSE_TOO_LARGE',
  PROVIDER_ERROR: 'WEB_IMPORT_PROVIDER_ERROR',
  WRITE_FAILED: 'WEB_IMPORT_WRITE_FAILED',
  HTML_FAILED: 'WEB_IMPORT_HTML_FAILED',
  INTERRUPTED: 'WEB_IMPORT_INTERRUPTED',
  DUPLICATE: 'WEB_IMPORT_DUPLICATE',
})

export class WebImportError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'WebImportError'
    this.code = code || WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR
    this.provider = options.provider || ''
    this.retryable = options.retryable === true
    this.status = Number(options.status) || 0
    this.cause = options.cause
  }

  toPublicResult() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      provider: this.provider,
      retryable: this.retryable,
      status: this.status,
    }
  }
}

export function providerHttpError(provider, status, fallbackMessage = '') {
  if (status === 401 || status === 403) {
    return new WebImportError(WEB_IMPORT_ERROR_CODES.AUTH_FAILED, '服务商鉴权失败，请检查 API Key。', { provider, status })
  }
  if (status === 429) {
    return new WebImportError(WEB_IMPORT_ERROR_CODES.RATE_LIMITED, '当前服务商的免费额度或速率限制已达到。', { provider, status, retryable: true })
  }
  if (status >= 500) {
    return new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, '网页解析服务暂时不可用，请稍后重试。', { provider, status, retryable: true })
  }
  return new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, fallbackMessage || `网页解析服务请求失败（HTTP ${status}）。`, { provider, status })
}

export function normalizeWebImportError(error, provider = '') {
  if (error instanceof WebImportError) return error
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new WebImportError(WEB_IMPORT_ERROR_CODES.TIMEOUT, '网页解析请求超时。', { provider, retryable: true, cause: error })
  }
  return new WebImportError(WEB_IMPORT_ERROR_CODES.PROVIDER_ERROR, '网页解析失败，请稍后重试。', { provider, cause: error })
}
