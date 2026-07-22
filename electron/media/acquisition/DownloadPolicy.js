import dns from 'node:dns'
import net from 'node:net'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'

export const DEFAULT_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024
export const DEFAULT_MAX_REDIRECTS = 5

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])
const STREAM_EXTENSIONS = new Set(['.m3u8', '.mpd'])

function ipv4Number(address) {
  const parts = String(address || '').split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0
}

function inIpv4Range(value, base, bits) {
  const address = ipv4Number(value)
  const network = ipv4Number(base)
  if (address === null || network === null) return false
  const size = 2 ** (32 - bits)
  return Math.floor(address / size) === Math.floor(network / size)
}

export function isBlockedIpAddress(address) {
  const version = net.isIP(String(address || ''))
  if (version === 4) {
    return [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([base, bits]) => inIpv4Range(address, base, bits))
  }
  if (version === 6) {
    const normalized = String(address).toLowerCase().split('%')[0]
    if (normalized === '::' || normalized === '::1') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true
    if (normalized.startsWith('ff')) return true
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isBlockedIpAddress(mapped[1]) : false
  }
  return true
}

export function parsePublicHttpUrl(value, { allowUnknownExtension = false } = {}) {
  let url
  try { url = new URL(String(value || '').trim()) } catch {
    throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '公网媒体 URL 无效。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '公网媒体 URL 仅支持 HTTP(S)。')
  if (url.username || url.password) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, '公网媒体 URL 不允许包含用户名或密码。')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new MediaError(MEDIA_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '不支持本机或内网媒体地址。')
  }
  if (net.isIP(hostname) === 6) {
    throw new MediaError(MEDIA_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, 'v1 不接受 IPv6 字面量媒体地址。')
  }
  if (net.isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new MediaError(MEDIA_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '不支持本机、内网或保留地址。')
  }
  const extension = path.posix.extname(url.pathname).toLowerCase()
  if (STREAM_EXTENSIONS.has(extension)) throw new MediaError(MEDIA_ERROR_CODES.STREAM_URL_UNSUPPORTED, 'v1 不支持 HLS、DASH 或直播流地址。')
  if (!allowUnknownExtension && !AUDIO_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) {
    throw new MediaError(MEDIA_ERROR_CODES.CODEC_UNSUPPORTED, '公网直链必须指向受支持的音频或视频文件。')
  }
  url.hash = ''
  return url
}

export async function resolvePublicAddresses(url, { lookup = dns.promises.lookup } = {}) {
  const parsed = url instanceof URL ? url : parsePublicHttpUrl(url, { allowUnknownExtension: true })
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname)) return [{ address: hostname, family: net.isIP(hostname) }]
  let addresses
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '无法解析公网媒体地址。', { stage: 'download', retryable: true, cause: error })
  }
  if (!addresses?.length) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '公网媒体地址没有可用的 DNS 记录。', { stage: 'download', retryable: true })
  if (addresses.some(item => isBlockedIpAddress(item.address))) {
    throw new MediaError(MEDIA_ERROR_CODES.PRIVATE_URL_UNSUPPORTED, '媒体地址解析到了本机、内网或保留地址。', { stage: 'download' })
  }
  return addresses
}

export function assertDownloadContentType(contentType, { allowBinary = true } = {}) {
  const value = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (!value) return ''
  if (value.startsWith('audio/') || value.startsWith('video/')) return value
  if (allowBinary && ['application/octet-stream', 'binary/octet-stream'].includes(value)) return value
  if (value.includes('mpegurl') || value.includes('dash+xml')) {
    throw new MediaError(MEDIA_ERROR_CODES.STREAM_URL_UNSUPPORTED, 'v1 不支持 HLS、DASH 或直播流。', { stage: 'download' })
  }
  throw new MediaError(MEDIA_ERROR_CODES.CODEC_UNSUPPORTED, '远程地址返回的不是可下载音视频文件。', { stage: 'download' })
}

export function mediaExtension(url) {
  return path.posix.extname((url instanceof URL ? url : new URL(url)).pathname).toLowerCase()
}

export const DIRECT_AUDIO_EXTENSIONS = AUDIO_EXTENSIONS
export const DIRECT_VIDEO_EXTENSIONS = VIDEO_EXTENSIONS
