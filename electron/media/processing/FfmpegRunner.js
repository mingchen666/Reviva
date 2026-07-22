import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'

function isSameOrInside(target, root) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function clip(value, max = 4000) {
  const text = String(value || '')
  return text.length > max ? text.slice(0, max) : text
}

function spawnCommand(command, args, { timeoutMs, maxBuffer, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    let bytes = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', abort)
      resolve(result)
    }
    const append = (target, chunk) => {
      bytes += chunk.length
      if (bytes <= maxBuffer) target.push(chunk)
    }
    const abort = () => {
      try { child.kill() } catch {}
      finish({ code: 130, stdout: '', stderr: 'cancelled', cancelled: true })
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: `${command} timeout`, timedOut: true })
    }, timeoutMs)

    if (signal?.aborted) return abort()
    signal?.addEventListener?.('abort', abort, { once: true })
    child.stdout.on('data', chunk => append(stdout, chunk))
    child.stderr.on('data', chunk => append(stderr, chunk))
    child.on('error', error => finish({
      code: error.code === 'ENOENT' ? 127 : 1,
      stdout: '',
      stderr: error.message,
    }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }))
  })
}

export class FfmpegRunner {
  constructor({ workDirService, executor = spawnCommand, ffmpegCommand = 'ffmpeg', ffprobeCommand = 'ffprobe' } = {}) {
    this._workDir = workDirService
    this._executor = executor
    this._ffmpeg = ffmpegCommand
    this._ffprobe = ffprobeCommand
  }

  _resolveInput(inputPath) {
    const resolved = this._workDir?.resolveAndValidate
      ? this._workDir.resolveAndValidate(inputPath, 'any')
      : path.resolve(inputPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAVAILABLE, '媒体源文件不存在或不可读取。')
    }
    return resolved
  }

  _resolveOutput(outputPath) {
    const resolved = this._workDir?.resolveAndValidate
      ? this._workDir.resolveAndValidate(outputPath, 'any')
      : path.resolve(outputPath)
    const root = this._workDir?.getRootPath?.()
    if (root && !isSameOrInside(resolved, path.join(root, 'context', 'media'))) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '媒体处理输出只能写入受控媒体目录。')
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    return resolved
  }

  async checkDependencies({ requireFfmpeg = true, requireFfprobe = true, signal } = {}) {
    const checks = requireFfprobe ? [[this._ffprobe, MEDIA_ERROR_CODES.FFPROBE_UNAVAILABLE]] : []
    if (requireFfmpeg) checks.push([this._ffmpeg, MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE])
    for (const [command, errorCode] of checks) {
      const result = await this._executor(command, ['-version'], { timeoutMs: 5000, maxBuffer: 64 * 1024, signal })
      if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '媒体依赖检测已取消。')
      if (result.code !== 0) {
        throw new MediaError(errorCode, `缺少或无法运行 ${command}。请在“设置 > 环境检测”中安装或修复 FFmpeg。`, {
          stage: 'probe',
          retryable: false,
        })
      }
    }
    return true
  }

  async probe(inputPath, { signal } = {}) {
    const resolved = this._resolveInput(inputPath)
    const result = await this._executor(this._ffprobe, [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', resolved,
    ], { timeoutMs: 30000, maxBuffer: 4 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '媒体探测已取消。', { stage: 'probe' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFPROBE_UNAVAILABLE, '缺少 ffprobe。', { stage: 'probe' })
    if (result.code !== 0) {
      throw new MediaError(MEDIA_ERROR_CODES.CORRUPTED, '无法读取媒体信息，文件可能损坏或格式不受支持。', {
        stage: 'probe',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    try {
      return JSON.parse(result.stdout)
    } catch (error) {
      throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'ffprobe 返回了无效数据。', {
        stage: 'probe',
        cause: error,
      })
    }
  }

  async extractSubtitle(inputPath, { subtitleIndex = 0, format = 'srt', outputPath, signal } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedOutput = this._resolveOutput(outputPath)
    const normalizedFormat = format === 'vtt' ? 'vtt' : 'srt'
    const codec = normalizedFormat === 'vtt' ? 'webvtt' : 'srt'
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-map', `0:s:${Math.max(0, Math.trunc(Number(subtitleIndex) || 0))}`,
      '-c:s', codec,
      resolvedOutput,
    ], { timeoutMs: 120000, maxBuffer: 2 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '字幕提取已取消。', { stage: 'subtitle' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '缺少 ffmpeg。', { stage: 'subtitle' })
    if (result.code !== 0 || !fs.existsSync(resolvedOutput)) {
      throw new MediaError(MEDIA_ERROR_CODES.SUBTITLE_INVALID, '提取内嵌字幕失败。', {
        stage: 'subtitle',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    return resolvedOutput
  }

  async extractAudio(inputPath, { outputPath, signal, sampleRate = 16000, channels = 1, codec = 'flac' } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedOutput = this._resolveOutput(outputPath)
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-map', '0:a:0', '-vn', '-ac', String(Math.max(1, Math.trunc(Number(channels) || 1))),
      '-ar', String(Math.max(8000, Math.trunc(Number(sampleRate) || 16000))), '-c:a', codec === 'pcm_s16le' ? 'pcm_s16le' : 'flac',
      resolvedOutput,
    ], { timeoutMs: 300000, maxBuffer: 2 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '音频提取已取消。', { stage: 'ffmpeg' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '缺少 ffmpeg。', { stage: 'ffmpeg' })
    if (result.code !== 0 || !fs.existsSync(resolvedOutput)) {
      throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '无法从媒体中提取音频。', {
        stage: 'ffmpeg',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    return resolvedOutput
  }

  async remuxAudio(inputPath, { outputPath, signal, container = 'm4a' } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedOutput = this._resolveOutput(outputPath)
    const normalizedContainer = ['m4a', 'webm', 'ogg'].includes(String(container || '').toLowerCase())
      ? String(container).toLowerCase()
      : 'm4a'
    const format = normalizedContainer === 'm4a' ? 'ipod' : normalizedContainer
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-map', '0:a:0', '-vn', '-c:a', 'copy', '-f', format,
      resolvedOutput,
    ], { timeoutMs: 300000, maxBuffer: 2 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '音轨重封装已取消。', { stage: 'ffmpeg' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '缺少 ffmpeg。', { stage: 'ffmpeg' })
    if (result.code !== 0 || !fs.existsSync(resolvedOutput)) {
      throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '无法无损重封装音轨。', {
        stage: 'ffmpeg',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    return resolvedOutput
  }

  async extractAudioChunks(inputPath, { outputPattern, signal, segmentSeconds = 225, sampleRate = 16000, channels = 1 } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedPattern = this._resolveOutput(outputPattern)
    const normalizedSegmentSeconds = Math.min(300, Math.max(30, Number(segmentSeconds) || 225))
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-map', '0:a:0', '-vn', '-ac', String(Math.max(1, Math.trunc(Number(channels) || 1))),
      '-ar', String(Math.max(8000, Math.trunc(Number(sampleRate) || 16000))), '-c:a', 'flac',
      '-f', 'segment', '-segment_time', String(normalizedSegmentSeconds), '-reset_timestamps', '1',
      resolvedPattern,
    ], { timeoutMs: 900000, maxBuffer: 4 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '音频分段已取消。', { stage: 'ffmpeg' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '缺少 ffmpeg。', { stage: 'ffmpeg' })
    if (result.code !== 0) {
      throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '无法为语音转写切分音轨。', {
        stage: 'ffmpeg',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    const directory = path.dirname(resolvedPattern)
    const patternName = path.basename(resolvedPattern)
    const patternMatch = /^(.*)%0?(\d*)d(.*)$/.exec(patternName)
    const files = patternMatch && fs.existsSync(directory)
      ? fs.readdirSync(directory)
        .filter(name => name.startsWith(patternMatch[1]) && name.endsWith(patternMatch[3]))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : []
    if (!files.length) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '音频分段没有生成可转写文件。', { stage: 'ffmpeg' })
    return files.map((name, index) => ({
      path: path.join(directory, name),
      offsetMs: Math.round(index * normalizedSegmentSeconds * 1000),
    }))
  }

  async extractKeyframes(inputPath, { outputPattern, durationMs = 0, limit = 12, signal, maxWidth = 1920 } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedPattern = this._resolveOutput(outputPattern)
    const normalizedLimit = Math.min(60, Math.max(1, Math.trunc(Number(limit) || 12)))
    const durationSeconds = Math.max(0, Number(durationMs) || 0) / 1000
    const intervalSeconds = Math.max(1, durationSeconds > 0 ? durationSeconds / normalizedLimit : 30)
    const filter = `fps=1/${intervalSeconds.toFixed(3)},showinfo,scale=${Math.max(320, Math.trunc(Number(maxWidth) || 1920))}:-2:force_original_aspect_ratio=decrease`
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-map', '0:v:0', '-vf', filter, '-frames:v', String(normalizedLimit),
      '-q:v', '3', resolvedPattern,
    ], { timeoutMs: 300000, maxBuffer: 8 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '关键帧抽取已取消。', { stage: 'frames' })
    if (result.code === 127) throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '缺少 ffmpeg。', { stage: 'frames' })
    if (result.code !== 0) {
      throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '视频关键帧抽取失败。', {
        stage: 'frames',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    const directory = path.dirname(resolvedPattern)
    const patternName = path.basename(resolvedPattern)
    const patternMatch = /^(.*)%0?(\d*)d(.*)$/.exec(patternName)
    const files = patternMatch && fs.existsSync(directory)
      ? fs.readdirSync(directory)
        .filter(name => name.startsWith(patternMatch[1]) && name.endsWith(patternMatch[3]))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .slice(0, normalizedLimit)
      : []
    const timestamps = [...String(result.stderr || '').matchAll(/pts_time:([0-9.]+)/g)].map(match => Math.max(0, Math.round(Number(match[1]) * 1000)))
    return files.map((name, index) => ({
      path: path.join(directory, name),
      timestampMs: timestamps[index] ?? Math.round(index * intervalSeconds * 1000),
    }))
  }

  async createImageThumbnail(inputPath, { outputPath, signal, maxWidth = 360 } = {}) {
    const resolvedInput = this._resolveInput(inputPath)
    const resolvedOutput = this._resolveOutput(outputPath)
    const filter = `scale=${Math.max(160, Math.trunc(Number(maxWidth) || 360))}:-2:force_original_aspect_ratio=decrease`
    const result = await this._executor(this._ffmpeg, [
      '-nostdin', '-hide_banner', '-y', '-i', resolvedInput,
      '-vf', filter, '-frames:v', '1', '-q:v', '5', resolvedOutput,
    ], { timeoutMs: 60000, maxBuffer: 2 * 1024 * 1024, signal })
    if (result.cancelled) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '关键帧缩略图生成已取消。', { stage: 'frames' })
    if (result.code !== 0 || !fs.existsSync(resolvedOutput)) {
      throw new MediaError(MEDIA_ERROR_CODES.FFMPEG_UNAVAILABLE, '关键帧缩略图生成失败。', {
        stage: 'frames',
        cause: new Error(clip(result.stderr || result.stdout)),
      })
    }
    return resolvedOutput
  }
}
