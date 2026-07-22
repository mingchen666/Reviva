import http from 'node:http'
import crypto from 'node:crypto'
import { URL } from 'node:url'
import { GatewayError, GATEWAY_ERROR_CODES, normalizeGatewayError } from '../core/GatewayErrors.js'
import { extractBearerToken } from '../auth/GatewayApiKeyService.js'
import { GatewayCorsPolicy } from '../security/GatewayCorsPolicy.js'
import { GatewayRouter } from './GatewayRouter.js'
import { GatewayRateLimiter } from '../security/GatewayRateLimiter.js'
import { GatewayAuditLog } from '../core/GatewayAuditLog.js'

function json(response, status, payload) {
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(body)
}

export class GatewayHttpServer {
  constructor({ apiKeyService, registry, appVersion = '', instanceId = '', logger = console } = {}) {
    this._apiKey = apiKeyService
    this._registry = registry
    this._appVersion = appVersion
    this._instanceId = instanceId
    this._logger = logger
    this._router = new GatewayRouter()
    this._server = null
    this._config = null
    this._startedAt = ''
    this._rateLimiter = new GatewayRateLimiter()
    this._auditLog = new GatewayAuditLog()
  }

  register(method, pathname, handler, options) {
    this._router.register(method, pathname, handler, options)
    return this
  }

  async start(config) {
    if (this._server) return this.getStatus()
    this._config = config
    this._cors = new GatewayCorsPolicy(config.allowedOrigins, {
      allowNullOrigin: config.host === '127.0.0.1' || config.host === 'localhost',
      allowExtensionOrigins: config.allowExtensionOrigins === true && (config.host === '127.0.0.1' || config.host === 'localhost'),
    })
    this._server = http.createServer((request, response) => {
      this._handle(request, response).catch(error => this._handleError(error, request, response))
    })
    this._server.requestTimeout = 30_000
    this._server.headersTimeout = 15_000
    this._server.keepAliveTimeout = 5_000
    this._server.on('clientError', (error, socket) => {
      this._logger.warn?.('[LocalGateway] HTTP client error:', error.message)
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })
    try {
      await new Promise((resolve, reject) => {
      const onError = error => {
        this._server?.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        this._server?.off('error', onError)
        resolve()
      }
      this._server.once('error', onError)
      this._server.once('listening', onListening)
      this._server.listen(config.port, config.host)
      })
    } catch (error) {
      this._server?.close?.()
      this._server = null
      throw error
    }
    this._startedAt = new Date().toISOString()
    this._logger.info?.(`[LocalGateway] Listening on ${this.getAddress()}`)
    return this.getStatus()
  }

  async stop() {
    if (!this._server) return
    const server = this._server
    this._server = null
    await new Promise(resolve => {
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
    this._startedAt = ''
  }

  getAddress() {
    const address = this._server?.address?.()
    if (address && typeof address === 'object') return `http://${address.address}:${address.port}`
    if (this._config) return `http://${this._config.host}:${this._config.port}`
    return ''
  }

  getStatus() {
    const address = this._server?.address?.()
    return {
      running: !!this._server,
      address: this.getAddress(),
      host: address?.address || this._config?.host || '',
      port: address?.port || this._config?.port || 0,
      startedAt: this._startedAt,
    }
  }

  getAuditLog(limit) { return this._auditLog.list(limit) }

  async _handle(request, response) {
    const requestId = crypto.randomUUID()
    const startedAt = Date.now()
    const audit = () => this._auditLog.add({ requestId, method: request.method, path: String(request.url || '').split('?')[0], status: response.statusCode || 200, durationMs: Date.now() - startedAt })
    response.once('finish', audit)
    if (!this._rateLimiter.allow(request.socket?.remoteAddress || 'unknown')) {
      json(response, 429, { error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId, retryable: true } })
      return
    }
    response.setHeader('X-Request-Id', requestId)
    response.setHeader('Cache-Control', 'no-store')
    this._cors.apply(request, response)
    if (request.method === 'OPTIONS') {
      this._cors.applyPreflight(response)
      response.statusCode = 204
      response.end()
      return
    }

    const url = new URL(request.url || '/', 'http://local-gateway')
    const resolved = this._router.resolve(request.method, url.pathname)
    if (!resolved) {
      json(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在。', requestId, retryable: false } })
      return
    }
    const { route, params } = resolved
    if (route.auth) this._apiKey.authenticate(extractBearerToken(request.headers.authorization))
    let body = null
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > (this._config?.maxJsonBodyBytes || 30 * 1024 * 1024)) {
          throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'request body is too large', { status: 413 })
        }
        chunks.push(chunk)
      }
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw) {
        try { body = JSON.parse(raw) } catch { throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'request body must be valid JSON', { status: 400 }) }
      }
    }
    await route.handler({ request, response, url, requestId, params, body })
  }

  _handleError(error, request, response) {
    const normalized = normalizeGatewayError(error)
    if (normalized.code === GATEWAY_ERROR_CODES.INTERNAL_ERROR) {
      this._logger.error?.('[LocalGateway] Request failed:', error)
    }
    const requestId = response.getHeader('X-Request-Id') || ''
    if (response.headersSent) {
      response.destroy()
      return
    }
    json(response, normalized.status || 500, {
      error: {
        code: normalized.code || GATEWAY_ERROR_CODES.INTERNAL_ERROR,
        message: normalized.message,
        requestId,
        retryable: !!normalized.retryable,
        details: normalized.details || null,
      },
    })
  }
}
