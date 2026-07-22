import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { MEDIA_ERROR_CODES, MediaError, normalizeMediaError } from '../core/MediaErrors.js'
import {
  DEFAULT_MAX_DOWNLOAD_BYTES,
  DEFAULT_MAX_REDIRECTS,
  assertDownloadContentType,
  parsePublicHttpUrl,
  resolvePublicAddresses,
} from './DownloadPolicy.js'

function sanitizeFileName(raw, fallback = 'remote-media') {
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch {}
  const cleaned = decoded.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180)
  return cleaned || fallback
}

function safeFileName(url, fallback = 'remote-media') {
  return sanitizeFileName(path.posix.basename(url.pathname) || fallback, fallback)
}

function requestFor(url, options) {
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const request = client.request(url, options, resolve)
    request.once('error', reject)
    request.once('timeout', () => request.destroy(new Error('Remote media request timed out')))
    request.end()
  })
}

export class DirectMediaDownloader {
  constructor({ dnsLookup, maxBytes = DEFAULT_MAX_DOWNLOAD_BYTES, maxRedirects = DEFAULT_MAX_REDIRECTS } = {}) {
    this.id = 'direct_media'
    this._dnsLookup = dnsLookup
    this._maxBytes = Math.max(1, Number(maxBytes) || DEFAULT_MAX_DOWNLOAD_BYTES)
    this._maxRedirects = Math.max(0, Math.trunc(Number(maxRedirects) || DEFAULT_MAX_REDIRECTS))
  }

  async _request(url, { signal, headers = {}, allowUnknownExtension = false } = {}) {
    const parsed = parsePublicHttpUrl(url, { allowUnknownExtension })
    const addresses = await resolvePublicAddresses(parsed, { lookup: this._dnsLookup })
    const selected = addresses[0]
    const lookup = (_hostname, options, callback) => {
      if (options?.all) return callback(null, addresses)
      callback(null, selected.address, selected.family)
    }
    const response = await requestFor(parsed, {
      method: 'GET',
      headers: {
        Accept: 'audio/*,video/*,application/octet-stream;q=0.8,*/*;q=0.1',
        'User-Agent': 'MindSpace-Desktop/1.0',
        ...headers,
      },
      lookup,
      signal,
      timeout: 30000,
    })
    return { response, url: parsed }
  }

  async download(input = {}, context = {}) {
    const targetDir = path.resolve(String(context.targetDir || context.tempDir || ''))
    if (!targetDir) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '下载缓存目录无效。')
    const maxBytes = Math.max(1, Number(input.maxBytes || context.maxBytes) || this._maxBytes)
    const allowUnknownExtension = input.allowUnknownExtension === true
    const maxRedirects = Math.max(0, Math.trunc(Number(input.maxRedirects) || this._maxRedirects))
    await fs.promises.mkdir(targetDir, { recursive: true })
    let currentUrl = parsePublicHttpUrl(input.url, { allowUnknownExtension })
    let response
    try {
      for (let redirectCount = 0; ; redirectCount++) {
        const requested = await this._request(currentUrl, {
          signal: context.signal,
          headers: input.headers,
          allowUnknownExtension,
        })
        response = requested.response
        currentUrl = requested.url
        const status = Number(response.statusCode) || 0
        if (status >= 300 && status < 400) {
          const location = response.headers.location
          response.resume()
          if (!location) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '远程媒体重定向缺少目标地址。', { stage: 'download' })
          if (redirectCount >= maxRedirects) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '远程媒体重定向次数过多。', { stage: 'download' })
          currentUrl = parsePublicHttpUrl(new URL(location, currentUrl).toString(), { allowUnknownExtension })
          continue
        }
        if (status < 200 || status >= 300) {
          response.resume()
          throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, `远程媒体下载失败（HTTP ${status || '未知'}）。`, {
            stage: 'download', status, retryable: status >= 500 || status === 408 || status === 429,
          })
        }
        break
      }

      const contentLength = Number(response.headers['content-length']) || 0
      if (contentLength > maxBytes) {
        response.destroy()
        throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_TOO_LARGE, '远程媒体超过允许的下载大小。', { stage: 'download' })
      }
      const contentType = assertDownloadContentType(response.headers['content-type'], { allowBinary: input.allowBinary !== false })
      const fileName = input.fileName
        ? sanitizeFileName(String(input.fileName), 'remote-media')
        : safeFileName(currentUrl, 'remote-media')
      const targetPath = path.join(targetDir, fileName)
      const partialPath = `${targetPath}.part`
      let sizeBytes = 0
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          sizeBytes += chunk.length
          if (sizeBytes > maxBytes) return callback(new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_TOO_LARGE, '远程媒体超过允许的下载大小。', { stage: 'download' }))
          callback(null, chunk)
        },
      })
      try {
        await pipeline(response, limiter, fs.createWriteStream(partialPath, { flags: 'wx' }), { signal: context.signal })
        await fs.promises.rename(partialPath, targetPath)
      } catch (error) {
        await fs.promises.rm(partialPath, { force: true }).catch(() => {})
        throw error
      }
      return {
        localPath: targetPath,
        fileName,
        sizeBytes,
        mimeType: contentType,
        temporary: true,
        finalUrl: currentUrl.toString(),
      }
    } catch (error) {
      response?.destroy?.()
      if (error instanceof MediaError) throw error
      throw normalizeMediaError(error, {
        code: MEDIA_ERROR_CODES.DOWNLOAD_FAILED,
        message: '远程媒体下载失败。',
        stage: 'download',
        retryable: true,
      })
    }
  }
}
