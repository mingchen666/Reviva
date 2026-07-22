import crypto from 'node:crypto'
import { GatewayError, GATEWAY_ERROR_CODES } from '../core/GatewayErrors.js'

const KEY_HASH_SETTING = 'localGatewayApiKeyHash'
const KEY_VALUE_SETTING = 'localGatewayApiKeyValue'
const KEY_HINT_SETTING = 'localGatewayApiKeyHint'
const KEY_STATUS_SETTING = 'localGatewayApiKeyStatus'
const KEY_CREATED_SETTING = 'localGatewayApiKeyCreatedAt'
const KEY_LAST_USED_SETTING = 'localGatewayApiKeyLastUsedAt'

function hashKey(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function generateKey() {
  // 24 bytes = 192 bits, represented as 32 Base64URL characters.
  return `msk_${crypto.randomBytes(24).toString('base64url')}`
}

export class GatewayApiKeyService {
  constructor({ dbService, secretStore = null } = {}) {
    this._db = dbService
    this._secretStore = secretStore
    this._lastUsageWriteAt = 0
  }

  _get(key) { return this._db?.getSetting?.(key) }
  _set(key, value) { this._db?.setSetting?.(key, value) }

  _protect(value) {
    try {
      if (this._secretStore?.isEncryptionAvailable?.()) {
        return `safe:${this._secretStore.encryptString(value).toString('base64')}`
      }
    } catch { /* fallback for test/dev environments */ }
    return value
  }

  _unprotect(value) {
    const raw = String(value || '')
    if (!raw.startsWith('safe:')) return raw
    try {
      if (this._secretStore?.isEncryptionAvailable?.()) {
        return this._secretStore.decryptString(Buffer.from(raw.slice(5), 'base64'))
      }
    } catch { return '' }
    return ''
  }

  getStatus() {
    const hash = String(this._get(KEY_HASH_SETTING) || '')
    const status = String(this._get(KEY_STATUS_SETTING) || 'disabled')
    const hint = String(this._get(KEY_HINT_SETTING) || '')
    return {
      configured: !!hash,
      enabled: !!hash && status === 'enabled',
      hint,
      status,
      createdAt: this._get(KEY_CREATED_SETTING) || '',
      lastUsedAt: this._get(KEY_LAST_USED_SETTING) || '',
    }
  }

  createKey({ replace = false } = {}) {
    if (this.getStatus().configured && !replace) {
      throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_REQUEST, 'API Key 已存在，请使用重置操作。', { status: 409 })
    }
    const key = generateKey()
    const now = new Date().toISOString()
    this._set(KEY_HASH_SETTING, hashKey(key))
    this._set(KEY_VALUE_SETTING, this._protect(key))
    this._set(KEY_HINT_SETTING, key.slice(-4))
    this._set(KEY_STATUS_SETTING, 'enabled')
    this._set(KEY_CREATED_SETTING, now)
    this._set(KEY_LAST_USED_SETTING, '')
    return { key, status: this.getStatus() }
  }

  resetKey() { return this.createKey({ replace: true }) }

  getKey() {
    const value = this._unprotect(this._get(KEY_VALUE_SETTING))
    return value && this.verify(value) ? value : ''
  }

  setEnabled(enabled) {
    if (!this.getStatus().configured) return this.getStatus()
    this._set(KEY_STATUS_SETTING, enabled ? 'enabled' : 'disabled')
    return this.getStatus()
  }

  verify(value) {
    const candidate = String(value || '')
    const storedHash = String(this._get(KEY_HASH_SETTING) || '')
    const status = this.getStatus()
    if (!status.configured || status.status !== 'enabled') return false
    if (!/^msk_[A-Za-z0-9_-]{32}$/.test(candidate) || !/^[a-f0-9]{64}$/.test(storedHash)) return false
    const actual = Buffer.from(hashKey(candidate), 'hex')
    const expected = Buffer.from(storedHash, 'hex')
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  }

  authenticate(value) {
    if (!this.verify(value)) {
      throw new GatewayError(GATEWAY_ERROR_CODES.INVALID_API_KEY, 'API Key 无效或已失效。', { status: 401 })
    }
    const now = Date.now()
    if (now - this._lastUsageWriteAt >= 60_000) {
      this._set(KEY_LAST_USED_SETTING, new Date(now).toISOString())
      this._lastUsageWriteAt = now
    }
    return this.getStatus()
  }
}

export function extractBearerToken(headerValue) {
  const value = String(headerValue || '').trim()
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}
