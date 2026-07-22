import { MEDIA_ERROR_CODES, MediaError } from '../../core/MediaErrors.js'

const COOKIE_VALUE_SETTING = 'mediaBilibiliCookieValue'
const COOKIE_STATUS_SETTING = 'mediaBilibiliCookieStatus'
const MAX_COOKIE_LENGTH = 16 * 1024

export function parseBilibiliCookie(value) {
  const raw = String(value || '').trim().replace(/^cookie\s*:\s*/i, '')
  if (!raw) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '请输入 B 站 Cookie。')
  if (raw.length > MAX_COOKIE_LENGTH || /[\x00-\x1f\x7f]/.test(raw)) {
    throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'B 站 Cookie 格式无效。')
  }

  const pairs = new Map()
  for (const part of raw.split(';')) {
    const item = part.trim()
    if (!item) continue
    const separator = item.indexOf('=')
    if (separator <= 0) continue
    const name = item.slice(0, separator).trim()
    const cookieValue = item.slice(separator + 1).trim()
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || /[\x00-\x1f\x7f;]/.test(cookieValue)) continue
    pairs.set(name, cookieValue)
  }
  if (!pairs.has('SESSDATA')) {
    throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'Cookie 中缺少 SESSDATA，请粘贴完整的 B 站登录 Cookie。')
  }
  return [...pairs.entries()]
}

export function normalizeBilibiliCookie(value) {
  return parseBilibiliCookie(value).map(([name, cookieValue]) => `${name}=${cookieValue}`).join('; ')
}

export class BilibiliCookieService {
  constructor({ database, secretStore } = {}) {
    this._database = database || null
    this._secretStore = secretStore || null
  }

  _get(key) { return this._database?.getSetting?.(key) }
  _set(key, value) { return this._database?.setSetting?.(key, value) }

  isStorageAvailable() {
    try {
      return this._secretStore?.isEncryptionAvailable?.() === true
    } catch {
      return false
    }
  }

  assertStorageAvailable() {
    if (!this.isStorageAvailable()) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, '系统安全存储当前不可用，无法保存 B 站 Cookie。')
    }
  }

  _protect(value) {
    this.assertStorageAvailable()
    return `safe:${this._secretStore.encryptString(value).toString('base64')}`
  }

  _unprotect(value) {
    const raw = String(value || '')
    if (!raw.startsWith('safe:') || !this.isStorageAvailable()) return ''
    try {
      return this._secretStore.decryptString(Buffer.from(raw.slice(5), 'base64'))
    } catch {
      return ''
    }
  }

  getStatus() {
    const storedValue = String(this._get(COOKIE_VALUE_SETTING) || '')
    const metadata = this._get(COOKIE_STATUS_SETTING) || {}
    const configured = storedValue.startsWith('safe:')
    const readable = configured && !!this._unprotect(storedValue)
    return {
      configured,
      valid: readable && metadata.state === 'valid',
      state: configured ? (readable ? (metadata.state || 'unverified') : 'unavailable') : 'empty',
      storageAvailable: this.isStorageAvailable(),
      userName: String(metadata.userName || ''),
      userId: String(metadata.userId || ''),
      validatedAt: String(metadata.validatedAt || ''),
    }
  }

  getCookie({ includeInvalid = false } = {}) {
    const status = this.getStatus()
    if (!status.configured || (!includeInvalid && !status.valid)) return ''
    return this._unprotect(this._get(COOKIE_VALUE_SETTING))
  }

  save(cookie, profile = {}) {
    const normalized = normalizeBilibiliCookie(cookie)
    this._set(COOKIE_VALUE_SETTING, this._protect(normalized))
    this.markValid(profile)
    return this.getStatus()
  }

  markValid(profile = {}) {
    this._set(COOKIE_STATUS_SETTING, {
      state: 'valid',
      userName: String(profile.userName || ''),
      userId: String(profile.userId || ''),
      validatedAt: new Date().toISOString(),
    })
    return this.getStatus()
  }

  markInvalid() {
    const previous = this._get(COOKIE_STATUS_SETTING) || {}
    this._set(COOKIE_STATUS_SETTING, {
      ...previous,
      state: 'invalid',
      validatedAt: new Date().toISOString(),
    })
    return this.getStatus()
  }

  clear() {
    this._set(COOKIE_VALUE_SETTING, null)
    this._set(COOKIE_STATUS_SETTING, null)
    return this.getStatus()
  }
}
