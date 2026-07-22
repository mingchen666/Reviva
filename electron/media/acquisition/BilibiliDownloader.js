import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { parseBilibiliCookie } from '../sources/bilibili/BilibiliCookieService.js'

function chooseSubtitle(tracks = []) {
  return [...tracks].sort((a, b) => {
    const score = item => (/^zh/i.test(item.lan || '') ? 0 : 10) + (Number(item.ai_type) ? 1 : 0)
    return score(a) - score(b)
  })[0] || null
}

function runYtDlp(url, outputTemplate, { format, signal, cookieFile = '' } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--no-playlist']
    if (cookieFile) args.push('--cookies', cookieFile)
    args.push('-f', format, '-o', outputTemplate, url)
    const child = spawn('yt-dlp', args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: false,
    })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000) })
    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })
    child.once('error', error => {
      signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', code => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) return reject(new MediaError(MEDIA_ERROR_CODES.CANCELLED, '媒体解析已取消。'))
      if (code === 0) resolve()
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`))
    })
  })
}

async function createYtDlpCookieFile(cookie, cacheDir) {
  if (!cookie) return ''
  const lines = [
    '# Netscape HTTP Cookie File',
    ...parseBilibiliCookie(cookie).map(([name, value]) => `.bilibili.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`),
    '',
  ]
  const cookieFile = path.join(cacheDir, `.bilibili-cookies-${crypto.randomUUID()}.txt`)
  await fs.promises.writeFile(cookieFile, lines.join('\n'), { encoding: 'utf8', mode: 0o600 })
  return cookieFile
}

function trackUrl(track) {
  return String(track?.url || '')
}

function standardAudioContainer(track = {}, probe = {}) {
  const codec = `${track.codecs || ''} ${(probe.streams || []).find(stream => stream.codec_type === 'audio')?.codec_name || ''}`.toLowerCase()
  if (codec.includes('opus')) return 'webm'
  return 'm4a'
}

function audioMimeType(container) {
  return container === 'webm' ? 'audio/webm' : container === 'ogg' ? 'audio/ogg' : 'audio/mp4'
}

function originalAudioContainer(track = {}, rawPath = '') {
  const mimeType = String(track.mimeType || '').toLowerCase()
  const extension = path.extname(rawPath).toLowerCase()
  if (mimeType.includes('webm') || extension === '.webm') return 'webm'
  if (mimeType.includes('ogg') || ['.ogg', '.oga', '.opus'].includes(extension)) return 'ogg'
  return 'm4a'
}

function isFfmpegUnavailable(error) {
  return [MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, MEDIA_ERROR_CODES.FFPROBE_UNAVAILABLE].includes(error?.code)
}

function isLowResolutionVideo(track) {
  const height = Number(track?.height) || 0
  return height > 0 && height < 720
}

export class BilibiliDownloader {
  constructor({ client, directDownloader, subtitleAdapter, ffmpegRunner } = {}) {
    this.id = 'bilibili'
    this._client = client
    this._direct = directDownloader
    this._subtitleAdapter = subtitleAdapter
    this._ffmpeg = ffmpegRunner
  }

  _metadata(descriptor) {
    return {
      mediaType: 'video',
      fileName: `${descriptor.bvid}-p${descriptor.page}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: 0,
      durationMs: descriptor.durationMs,
      width: 0,
      height: 0,
      hasAudio: true,
      hasVideo: true,
      audioTracks: [],
      videoTracks: [],
      subtitleTracks: [],
      sourceType: 'bilibili',
      platform: 'bilibili',
      platformSourceId: `${descriptor.bvid}:${descriptor.cid}:p${descriptor.page}`,
      title: descriptor.title,
      partTitle: descriptor.partTitle,
    }
  }

  async _normalizeAudio(rawPath, track, descriptor, options) {
    try {
      if (!this._ffmpeg?.remuxAudio || !this._ffmpeg?.probe) {
        throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, 'FFmpeg 不可用。', { stage: 'ffmpeg' })
      }
      const probe = await this._ffmpeg.probe(rawPath, { signal: options.signal })
      const container = standardAudioContainer(track, probe)
      const outputPath = path.join(options.cacheDir, `${descriptor.bvid}-p${descriptor.page}-audio.${container}`)
      await this._ffmpeg.remuxAudio(rawPath, { outputPath, container, signal: options.signal })
      if (path.resolve(rawPath) !== path.resolve(outputPath)) await fs.promises.rm(rawPath, { force: true }).catch(() => {})
      const stat = await fs.promises.stat(outputPath)
      return {
        localPath: outputPath,
        fileName: path.basename(outputPath),
        sizeBytes: stat.size,
        mimeType: audioMimeType(container),
        temporary: true,
        remuxed: true,
        warnings: [],
      }
    } catch (error) {
      if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      if (!isFfmpegUnavailable(error)) throw error
    }

    const container = originalAudioContainer(track, rawPath)
    const outputPath = path.join(options.cacheDir, `${descriptor.bvid}-p${descriptor.page}-audio-original.${container}`)
    if (path.resolve(rawPath) !== path.resolve(outputPath)) {
      await fs.promises.rm(outputPath, { force: true }).catch(() => {})
      await fs.promises.rename(rawPath, outputPath)
    }
    const stat = await fs.promises.stat(outputPath)
    return {
      localPath: outputPath,
      fileName: path.basename(outputPath),
      sizeBytes: stat.size,
      mimeType: audioMimeType(container),
      temporary: true,
      remuxed: false,
      warnings: ['未能使用 FFmpeg 无损重封装，已保留 B 站原始音轨容器并直接交给语音转文字服务。'],
    }
  }

  async _canExtractKeyframes(signal) {
    if (!this._ffmpeg?.checkDependencies) return false
    try {
      await this._ffmpeg.checkDependencies({ requireFfmpeg: true, requireFfprobe: false, signal })
      return true
    } catch (error) {
      if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      if (isFfmpegUnavailable(error)) return false
      throw error
    }
  }

  async _downloadApiTrack(track, fileName, descriptor, options) {
    if (!trackUrl(track)) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, 'B 站当前分 P 缺少可下载媒体流。', { stage: 'download' })
    return this._direct.download({
      url: track.url,
      fileName,
      allowUnknownExtension: true,
      allowBinary: true,
      maxBytes: options.maxBytes,
      headers: this._client.headers(descriptor.bvid, { cookie: '' }),
    }, { targetDir: options.cacheDir, signal: options.signal })
  }

  async _findYtDlpFile(cacheDir, prefix) {
    const files = (await fs.promises.readdir(cacheDir, { withFileTypes: true }))
      .filter(item => item.isFile() && item.name.startsWith(prefix) && !item.name.endsWith('.part'))
      .map(item => path.join(cacheDir, item.name))
    return files[0] || ''
  }

  async _downloadYtDlp(descriptor, options, { kind }) {
    const prefix = `${descriptor.bvid}-p${descriptor.page}-${kind}-ytdlp`
    const outputTemplate = path.join(options.cacheDir, `${prefix}.%(ext)s`)
    let cookieFile = ''
    try {
      cookieFile = await createYtDlpCookieFile(this._client.cookie(), options.cacheDir)
      await runYtDlp(descriptor.canonicalUrl, outputTemplate, {
        signal: options.signal,
        cookieFile,
        format: kind === 'video' ? 'bv/bestvideo' : 'ba/bestaudio',
      })
    } finally {
      if (cookieFile) await fs.promises.rm(cookieFile, { force: true }).catch(() => {})
    }
    const localPath = await this._findYtDlpFile(options.cacheDir, prefix)
    if (!localPath) throw new Error(`yt-dlp did not create a ${kind} file`)
    const stat = await fs.promises.stat(localPath)
    if (stat.size > Number(options.maxBytes || Infinity)) {
      throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_TOO_LARGE, `B 站${kind === 'video' ? '视频流' : '音轨'}超过允许的下载大小。`, { stage: 'download' })
    }
    return { localPath, fileName: path.basename(localPath), sizeBytes: stat.size, temporary: true }
  }

  async acquire(location, options = {}) {
    const descriptor = await this._client.describe(location.locator, { signal: options.signal })
    const metadata = this._metadata(descriptor)
    const warnings = []
    let normalizedSubtitle = null
    if (options.preferSubtitle !== false) {
      try {
        const tracks = await this._client.subtitleInfo(descriptor, { signal: options.signal })
        const track = chooseSubtitle(tracks)
        if (track) {
          const payload = await this._client.subtitlePayload(track, descriptor, { signal: options.signal })
          const normalized = this._subtitleAdapter.normalize(payload, track)
          if (normalized.text) normalizedSubtitle = normalized
        }
      } catch (error) {
        if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
        warnings.push('B 站字幕读取失败，已降级尝试下载音轨。')
      }
    }

    const needsAudio = !normalizedSubtitle
    let needsVideo = options.extractKeyframes === true
    if (needsVideo && !(await this._canExtractKeyframes(options.signal))) {
      needsVideo = false
      warnings.push('当前设备未安装 FFmpeg，已跳过关键帧增强；字幕或语音转文字仍会继续。')
    }
    if (!needsAudio && !needsVideo) return { kind: 'subtitle', metadata, normalizedSubtitle, warnings }

    let mediaInfo = { audio: null, video: null }
    let mediaInfoError = null
    try {
      mediaInfo = await this._client.mediaInfo(descriptor, { signal: options.signal })
    } catch (error) {
      if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      mediaInfoError = error
    }

    let audioResult = null
    if (needsAudio) {
      let audioError = mediaInfoError
      if (trackUrl(mediaInfo.audio)) {
        try {
          const raw = await this._downloadApiTrack(mediaInfo.audio, `${descriptor.bvid}-p${descriptor.page}-audio.m4s`, descriptor, options)
          audioResult = await this._normalizeAudio(raw.localPath, mediaInfo.audio, descriptor, options)
          warnings.push(...(audioResult.warnings || []))
        } catch (error) {
          if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          audioError = error
        }
      }
      if (!audioResult && options.allowYtDlp !== false) {
        try {
          const raw = await this._downloadYtDlp(descriptor, options, { kind: 'audio' })
          audioResult = await this._normalizeAudio(raw.localPath, {}, descriptor, options)
          warnings.push(...(audioResult.warnings || []))
          warnings.push('B 站公开音轨接口不可用，已通过本机 yt-dlp 降级下载音轨。')
        } catch (error) {
          if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          audioError = error
        }
      }
      if (!audioResult) {
        throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, 'B 站没有可用字幕，公开音轨与可选 yt-dlp 下载均失败。', {
          stage: 'download', retryable: true, cause: audioError,
        })
      }
      warnings.push(audioResult.remuxed
        ? 'B 站当前分 P 没有可用字幕，已下载并无损重封装音轨进行语音转文字。'
        : 'B 站当前分 P 没有可用字幕，已下载原始音轨进行语音转文字。')
    }

    let visualPath = ''
    if (needsVideo) {
      let visualError = mediaInfoError
      let ytDlpAttempted = false
      const preferYtDlp = isLowResolutionVideo(mediaInfo.video)
      if (preferYtDlp && options.allowYtDlp !== false) {
        ytDlpAttempted = true
        try {
          const video = await this._downloadYtDlp(descriptor, options, { kind: 'video' })
          visualPath = video.localPath
          warnings.push('B 站公开接口返回的视频流清晰度不足，已通过本机 yt-dlp 尝试获取更高清的视频流用于关键帧。')
        } catch (error) {
          if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          visualError = error
        }
      }
      if (!visualPath && trackUrl(mediaInfo.video)) {
        try {
          const video = await this._downloadApiTrack(mediaInfo.video, `${descriptor.bvid}-p${descriptor.page}-video.m4s`, descriptor, options)
          visualPath = video.localPath
          metadata.width = mediaInfo.video.width || 0
          metadata.height = mediaInfo.video.height || 0
        } catch (error) {
          if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          visualError = error
        }
      }
      if (!visualPath && !ytDlpAttempted && options.allowYtDlp !== false) {
        try {
          const video = await this._downloadYtDlp(descriptor, options, { kind: 'video' })
          visualPath = video.localPath
          warnings.push('B 站公开视频流接口不可用，已通过本机 yt-dlp 降级下载视频流用于关键帧。')
        } catch (error) {
          if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          visualError = error
        }
      }
      if (!visualPath) warnings.push(`未能下载 B 站视频流，关键帧将不可用：${visualError?.message || '未知错误'}`)
    }

    if (normalizedSubtitle) {
      return { kind: 'subtitle', metadata, normalizedSubtitle, visualPath, warnings }
    }
    return {
      kind: 'local_file',
      ...audioResult,
      visualPath,
      metadata: { ...metadata, sourceType: 'bilibili_audio_download' },
      inputMediaType: 'audio',
      preserveSourceMediaType: true,
      warnings,
    }
  }
}
