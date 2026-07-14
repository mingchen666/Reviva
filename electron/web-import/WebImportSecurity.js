import dns from 'node:dns/promises'
import net from 'node:net'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from './WebImportErrors.js'

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value))) return true
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || parts[0] >= 224
}

function isPrivateIpv6(address) {
  const value = address.toLowerCase().split('%')[0]
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')
}

export function isPrivateAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return true
}

export async function assertPublicWebUrl(value, { lookup = dns.lookup } = {}) {
  let url
  try { url = new URL(String(value || '').trim()) } catch {
    throw new WebImportError(WEB_IMPORT_ERROR_CODES.INVALID_URL, '请输入有效的网页 URL。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new WebImportError(WEB_IMPORT_ERROR_CODES.INVALID_URL, '网页 URL 仅支持 HTTP 或 HTTPS。')
  if (url.username || url.password) throw new WebImportError(WEB_IMPORT_ERROR_CODES.INVALID_URL, '网页 URL 不能包含用户名或密码。')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new WebImportError(WEB_IMPORT_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '不支持导入本机或局域网页面。')
  }
  const literalFamily = net.isIP(hostname)
  if (literalFamily && isPrivateAddress(hostname)) throw new WebImportError(WEB_IMPORT_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '不支持导入本机或局域网页面。')
  if (!literalFamily) {
    let records
    try { records = await lookup(hostname, { all: true, verbatim: true }) } catch {
      throw new WebImportError(WEB_IMPORT_ERROR_CODES.INVALID_URL, '无法解析网页域名。')
    }
    if (!records?.length || records.some(record => isPrivateAddress(record.address))) {
      throw new WebImportError(WEB_IMPORT_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '不支持导入本机或局域网页面。')
    }
  }
  url.hash = ''
  return url
}

export function redactUrlForLog(value) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    if (url.pathname.length > 160) url.pathname = `${url.pathname.slice(0, 157)}...`
    return url.toString()
  } catch { return '' }
}
