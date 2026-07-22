import { MEDIA_ERROR_CODES, MediaError, normalizeMediaError } from '../../core/MediaErrors.js'
import { normalizeBilibiliCookie } from './BilibiliCookieService.js'

const API_BASE = 'https://api.bilibili.com'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'

function withTimeout(signal, timeoutMs = 30000) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal || timeout)
}

function isBilibiliHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'b23.tv' || host.endsWith('.b23.tv') || host === 'bilibili.com' || host.endsWith('.bilibili.com')
}

function pageNumberFrom(value) {
  try {
    const url = new URL(value)
    return Math.max(1, Math.trunc(Number(url.searchParams.get('p')) || 1))
  } catch {
    return 1
  }
}

function parseVideoIdentity(value) {
  const source = String(value || '').trim()
  const bvid = source.match(/BV[0-9A-Za-z]+/i)?.[0]
  if (bvid) return { bvid: `BV${bvid.slice(2)}`, aid: 0 }
  const aid = Number(source.match(/(?:^|\/|\b)(?:av)?(\d{5,})(?:\b|\/|\?|$)/i)?.[1]) || 0
  if (aid) return { bvid: '', aid }
  return null
}

export class BilibiliApiClient {
  constructor({ fetchImpl = fetch, cookieService = null } = {}) {
    this._fetch = fetchImpl
    this._cookies = cookieService
  }

  cookie() {
    return this._cookies?.getCookie?.() || ''
  }

  headers(bvid = '', { cookie } = {}) {
    const activeCookie = cookie === undefined ? this.cookie() : String(cookie || '')
    return {
      'User-Agent': USER_AGENT,
      Referer: bvid ? `https://www.bilibili.com/video/${bvid}/` : 'https://www.bilibili.com/',
      Accept: 'application/json,text/plain,*/*',
      ...(activeCookie ? { Cookie: activeCookie } : {}),
    }
  }

  async resolveSource(source, { signal } = {}) {
    let value = String(source || '').trim()
    if (!value) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'B 站视频链接不能为空。')
    if (/^(BV[0-9A-Za-z]+|av\d+)$/i.test(value)) value = `https://www.bilibili.com/video/${value}/`
    let url
    try { url = new URL(value) } catch {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, 'B 站视频链接无效。')
    }
    if (!isBilibiliHost(url.hostname)) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '该链接不是受支持的 B 站视频地址。')
    const requestedPage = pageNumberFrom(url)
    if (url.hostname.toLowerCase().endsWith('b23.tv')) {
      for (let index = 0; index < 5; index++) {
        let response = await this._fetch(url, {
          method: 'HEAD', redirect: 'manual', headers: this.headers('', { cookie: '' }), signal: withTimeout(signal, 15000),
        })
        if (response.status === 405) response = await this._fetch(url, {
          method: 'GET', redirect: 'manual', headers: this.headers('', { cookie: '' }), signal: withTimeout(signal, 15000),
        })
        if (response.status < 300 || response.status >= 400) break
        const location = response.headers.get('location')
        if (!location) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, 'B 站短链接缺少跳转地址。', { stage: 'download' })
        url = new URL(location, url)
        if (!isBilibiliHost(url.hostname)) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, 'B 站短链接跳转到了不受支持的站点。')
      }
    }
    const identity = parseVideoIdentity(url.toString())
    if (!identity) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '无法从链接中识别 BV 号或 AV 号。')
    return { ...identity, requestedPage: pageNumberFrom(url) || requestedPage, resolvedUrl: url.toString() }
  }

  async _requestApi(pathname, params, { bvid = '', signal, cookie = '' } = {}) {
    const url = new URL(pathname, API_BASE)
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }
    let response
    try {
      response = await this._fetch(url, { headers: this.headers(bvid, { cookie }), signal: withTimeout(signal) })
    } catch (error) {
      throw normalizeMediaError(error, { code: MEDIA_ERROR_CODES.DOWNLOAD_FAILED, message: '访问 B 站公开接口失败。', stage: 'download', retryable: true })
    }
    if (!response.ok) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, `B 站公开接口请求失败（HTTP ${response.status}）。`, { stage: 'download', status: response.status, retryable: response.status >= 500 || response.status === 429 })
    let payload
    try { payload = await response.json() } catch (error) {
      throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'B 站公开接口返回了无效数据。', { stage: 'download', cause: error })
    }
    if (Number(payload?.code) !== 0) {
      const code = Number(payload?.code) || 0
      const auth = [-101, -400, -403, -404, 62002].includes(code)
      throw new MediaError(auth ? MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED : MEDIA_ERROR_CODES.DOWNLOAD_FAILED, `B 站接口错误：${payload?.message || code}`, { stage: 'download', status: code, retryable: !auth })
    }
    return payload.data || {}
  }

  async api(pathname, params, { bvid = '', signal, cookie, anonymousFallback = true } = {}) {
    const activeCookie = cookie === undefined ? this.cookie() : String(cookie || '')
    try {
      return await this._requestApi(pathname, params, { bvid, signal, cookie: activeCookie })
    } catch (error) {
      if (!activeCookie || anonymousFallback === false || error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      if (Number(error?.status) === -101) this._cookies?.markInvalid?.()
      return this._requestApi(pathname, params, { bvid, signal, cookie: '' })
    }
  }

  async validateCookie(cookie, { signal } = {}) {
    const normalized = normalizeBilibiliCookie(cookie)
    const data = await this._requestApi('/x/web-interface/nav', {}, {
      signal,
      cookie: normalized,
    })
    if (data.isLogin !== true) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, 'B 站 Cookie 无效或已过期。', { stage: 'download', status: -101 })
    }
    return {
      valid: true,
      userName: String(data.uname || ''),
      userId: String(data.mid || ''),
    }
  }

  async describe(source, { signal } = {}) {
    const identity = await this.resolveSource(source, { signal })
    const params = identity.bvid ? { bvid: identity.bvid } : { aid: identity.aid }
    const data = await this.api('/x/web-interface/view', params, { bvid: identity.bvid, signal })
    const pages = Array.isArray(data.pages) && data.pages.length ? data.pages : [{ page: 1, cid: data.cid, part: data.title, duration: data.duration }]
    const pageNumber = Math.min(pages.length, Math.max(1, identity.requestedPage || 1))
    const page = pages.find(item => Number(item.page) === pageNumber) || pages[pageNumber - 1] || pages[0]
    const bvid = data.bvid || identity.bvid
    return {
      bvid,
      aid: Number(data.aid || identity.aid) || 0,
      cid: Number(page?.cid) || 0,
      page: Number(page?.page) || pageNumber,
      pageCount: pages.length,
      title: String(data.title || page?.part || bvid),
      partTitle: String(page?.part || ''),
      durationMs: Math.max(0, Number(page?.duration || data.duration) || 0) * 1000,
      ownerName: String(data.owner?.name || ''),
      canonicalUrl: `https://www.bilibili.com/video/${bvid}/${pages.length > 1 ? `?p=${Number(page?.page) || pageNumber}` : ''}`,
      pages,
    }
  }

  async subtitleInfo(descriptor, { signal } = {}) {
    const data = await this.api('/x/player/v2', { bvid: descriptor.bvid, cid: descriptor.cid }, { bvid: descriptor.bvid, signal })
    return Array.isArray(data.subtitle?.subtitles) ? data.subtitle.subtitles : []
  }

  async subtitlePayload(track, descriptor, { signal } = {}) {
    const raw = String(track?.subtitle_url || '')
    if (!raw) throw new MediaError(MEDIA_ERROR_CODES.SUBTITLE_INVALID, 'B 站字幕地址为空。', { stage: 'subtitle' })
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw)
    const host = url.hostname.toLowerCase()
    if (!(host.endsWith('.hdslb.com') || host.endsWith('.bilibili.com') || host.endsWith('.bilivideo.com'))) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAUTHORIZED, 'B 站字幕地址不受信任。', { stage: 'subtitle' })
    }
    const response = await this._fetch(url, { headers: this.headers(descriptor.bvid, { cookie: '' }), signal: withTimeout(signal) })
    if (!response.ok) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, `B 站字幕下载失败（HTTP ${response.status}）。`, { stage: 'subtitle', status: response.status, retryable: true })
    return response.json()
  }

  async mediaInfo(descriptor, { signal } = {}) {
    const data = await this.api('/x/player/playurl', {
      bvid: descriptor.bvid, cid: descriptor.cid, qn: 120, fnval: 16, fourk: 1,
    }, { bvid: descriptor.bvid, signal })
    const audios = Array.isArray(data.dash?.audio) ? data.dash.audio : []
    const videos = Array.isArray(data.dash?.video) ? data.dash.video : []
    const selectedAudio = [...audios].sort((a, b) => Number(b.bandwidth || 0) - Number(a.bandwidth || 0))[0]
    const videoCodecRank = track => {
      const codec = String(track?.codecs || '').toLowerCase()
      if (codec.includes('avc1') || codec.includes('h264')) return 0
      if (codec.includes('hev1') || codec.includes('hvc1') || codec.includes('hevc')) return 1
      return 2
    }
    const selectedVideo = [...videos].sort((a, b) => (
      Number(b.height || 0) - Number(a.height || 0)
      || Number(b.width || 0) - Number(a.width || 0)
      || Number(b.bandwidth || 0) - Number(a.bandwidth || 0)
      || videoCodecRank(a) - videoCodecRank(b)
    ))[0]
    const normalizeTrack = track => track ? {
      url: track.baseUrl || track.base_url || '',
      bandwidth: Number(track.bandwidth) || 0,
      mimeType: track.mimeType || track.mime_type || '',
      codecs: track.codecs || '',
      width: Number(track.width) || 0,
      height: Number(track.height) || 0,
    } : null
    return {
      audio: normalizeTrack(selectedAudio),
      video: normalizeTrack(selectedVideo),
    }
  }

  async audioInfo(descriptor, options = {}) {
    const { audio } = await this.mediaInfo(descriptor, options)
    if (!audio?.url) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, 'B 站当前分 P 没有可下载的公开音轨。', { stage: 'download' })
    return audio
  }
}

export { isBilibiliHost, parseVideoIdentity }
