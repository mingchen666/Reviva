import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

const LOOPBACK_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/

export class GatewayCorsPolicy {
  constructor(allowedOrigins = [], { allowNullOrigin = false, allowExtensionOrigins = false } = {}) {
    this._allowedOrigins = new Set((allowedOrigins || []).map(value => String(value || '').trim()).filter(Boolean))
    this._allowNullOrigin = allowNullOrigin === true
    this._allowExtensionOrigins = allowExtensionOrigins === true
  }

  apply(request, response) {
    const origin = String(request.headers.origin || '').trim()
    response.setHeader('Vary', 'Origin')
    if (!origin) return
    if (origin === 'null' && this._allowNullOrigin) {
      response.setHeader('Access-Control-Allow-Origin', 'null')
      return
    }
    const extensionAllowed = this._allowExtensionOrigins && LOOPBACK_EXTENSION_ORIGIN.test(origin)
    if (!extensionAllowed && !this._allowedOrigins.has(origin)) {
      throw new GatewayError(GATEWAY_ERROR_CODES.ORIGIN_DENIED, '请求来源未被 Gateway 允许。', { status: 403 })
    }
    response.setHeader('Access-Control-Allow-Origin', origin)
  }

  applyPreflight(response) {
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key')
    response.setHeader('Access-Control-Max-Age', '600')
  }
}
