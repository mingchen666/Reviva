import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tool } from 'langchain'
import { z } from 'zod'
import { ToolPathGuard } from './ToolPathGuard.js'

const MEDIA_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'])
const AUDIO_FORMATS = new Set(['mp3', 'm4a', 'wav'])
const SUBTITLE_FORMATS = new Set(['srt', 'vtt'])
const IMAGE_FORMATS = new Set(['jpg', 'png', 'webp'])
const CLIP_FORMATS = new Set(['mp4', 'm4a', 'mp3', 'wav'])
const MAX_INPUT_BYTES = 4 * 1024 * 1024 * 1024
const MAX_FRAMES = 60
const MAX_CLIP_SECONDS = 60 * 30

function _jsonError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

function _clip(text, max = 30000) {
  const value = String(text || '')
  return value.length > max ? value.slice(0, max) : value
}

function _num(value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function _run(command, args, { timeoutMs = 120000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: `${command} timeout` })
    }, timeoutMs)

    child.stdout.on('data', data => append(stdoutChunks, data))
    child.stderr.on('data', data => append(stderrChunks, data))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    }))
  })
}

export class FfmpegToolService {
  constructor(workDirService, options = {}) {
    this._paths = new ToolPathGuard(workDirService, options)
  }

  async invoke(input = {}, allowedOperations = []) {
    const operation = String(input.operation || '')
    if (!allowedOperations.includes(operation)) {
      return _jsonError('TOOL_OPERATION_NOT_ALLOWED', `当前 Agent 未启用 FFmpeg 子工具：${operation || '(未指定)'}`)
    }

    const dependency = await this._checkDependency(operation)
    if (!dependency.success) return JSON.stringify(dependency)

    try {
      switch (operation) {
        case 'probe':
          return await this._probe(input)
        case 'extract_audio':
          return await this._extractAudio(input)
        case 'extract_subtitles':
          return await this._extractSubtitles(input)
        case 'extract_frames':
          return await this._extractFrames(input)
        case 'thumbnail':
          return await this._thumbnail(input)
        case 'clip':
          return await this._clipSegment(input)
        default:
          return _jsonError('TOOL_UNSUPPORTED_OPERATION', `不支持的 FFmpeg operation：${operation}`)
      }
    } catch (err) {
      return _jsonError(err.code || 'TOOL_EXECUTION_FAILED', err.message || 'FFmpeg 工具执行失败')
    }
  }

  async _checkDependency(operation) {
    const checks = operation === 'probe'
      ? [['ffprobe', ['-version']]]
      : [['ffmpeg', ['-version']], ['ffprobe', ['-version']]]
    for (const [command, args] of checks) {
      const result = await _run(command, args, { timeoutMs: 5000, maxBuffer: 64 * 1024 })
      if (result.code === 127) {
        return {
          success: false,
          code: 'TOOL_DEPENDENCY_MISSING',
          message: `缺少 ${command}。请到“设置 > 环境检测”安装或修复 FFmpeg。`,
        }
      }
      if (result.code !== 0) {
        return {
          success: false,
          code: 'TOOL_DEPENDENCY_UNAVAILABLE',
          message: `${command} 当前不可用。`,
          detail: _clip(result.stderr || result.stdout, 1200),
        }
      }
    }
    return { success: true }
  }

  _resolveMedia(inputPath) {
    return this._paths.resolveInput(inputPath, { allowedExts: MEDIA_EXTS, maxBytes: MAX_INPUT_BYTES })
  }

  async _probe({ path: inputPath }) {
    const resolved = this._resolveMedia(inputPath)
    const result = await _run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', resolved], {
      timeoutMs: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    if (result.code !== 0) {
      return _jsonError('TOOL_EXECUTION_FAILED', '读取媒体信息失败。', { detail: _clip(result.stderr || result.stdout, 2000) })
    }
    let structured = null
    try { structured = JSON.parse(result.stdout) } catch {}
    return JSON.stringify({
      success: true,
      operation: 'probe',
      path: this._paths.toVirtualPath(resolved),
      structured,
      content: _clip(result.stdout, 40000),
    })
  }

  async _extractAudio({ path: inputPath, outputFormat = 'mp3' }) {
    const resolved = this._resolveMedia(inputPath)
    const format = AUDIO_FORMATS.has(outputFormat) ? outputFormat : 'mp3'
    const outputPath = this._paths.makeOutputPath('ffmpeg', resolved, { suffix: 'audio', ext: format })
    const codecArgs = format === 'wav'
      ? ['-acodec', 'pcm_s16le']
      : format === 'm4a'
        ? ['-acodec', 'aac', '-b:a', '192k']
        : ['-acodec', 'libmp3lame', '-q:a', '2']
    const result = await _run('ffmpeg', ['-nostdin', '-hide_banner', '-i', resolved, '-vn', ...codecArgs, outputPath], { timeoutMs: 180000 })
    return this._outputResult(result, 'extract_audio', outputPath, '提取音频失败。')
  }

  async _extractSubtitles({ path: inputPath, streamIndex = 0, outputFormat = 'srt' }) {
    const resolved = this._resolveMedia(inputPath)
    const format = SUBTITLE_FORMATS.has(outputFormat) ? outputFormat : 'srt'
    const outputPath = this._paths.makeOutputPath('ffmpeg', resolved, { suffix: 'subtitles', ext: format })
    const codec = format === 'vtt' ? 'webvtt' : 'srt'
    const index = Math.max(Number(streamIndex) || 0, 0)
    const result = await _run('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-i', resolved,
      '-map', `0:s:${index}`,
      '-c:s', codec,
      outputPath,
    ], { timeoutMs: 120000 })
    return this._outputResult(result, 'extract_subtitles', outputPath, '提取字幕失败，可能没有内嵌字幕轨道。')
  }

  async _extractFrames({ path: inputPath, startTime = 0, intervalSeconds = 30, maxFrames = 12, imageFormat = 'jpg', width = 1280 }) {
    const resolved = this._resolveMedia(inputPath)
    const format = IMAGE_FORMATS.has(imageFormat) ? imageFormat : 'jpg'
    const safeStart = _num(startTime, 0, { min: 0 })
    const safeInterval = _num(intervalSeconds, 30, { min: 1, max: 600 })
    const safeFrames = Math.floor(_num(maxFrames, 12, { min: 1, max: MAX_FRAMES }))
    const safeWidth = Math.floor(_num(width, 1280, { min: 160, max: 3840 }))
    const pattern = this._paths.makeOutputPattern('ffmpeg', resolved, { suffix: 'frames', ext: format })
    const result = await _run('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-ss', String(safeStart),
      '-i', resolved,
      '-vf', `fps=1/${safeInterval},scale=${safeWidth}:-2`,
      '-frames:v', String(safeFrames),
      pattern,
    ], { timeoutMs: 180000 })
    if (result.code !== 0) {
      return _jsonError('TOOL_EXECUTION_FAILED', '抽帧失败。', { detail: _clip(result.stderr || result.stdout, 2000) })
    }
    const dir = path.dirname(pattern)
    const files = fs.readdirSync(dir)
      .filter(name => name.toLowerCase().endsWith('.' + format))
      .sort()
      .map(name => {
        const abs = path.join(dir, name)
        return { path: this._paths.toVirtualPath(abs), bytes: fs.statSync(abs).size }
      })
    return JSON.stringify({
      success: true,
      operation: 'extract_frames',
      outputDir: this._paths.toVirtualPath(dir),
      files,
      count: files.length,
      stderr: _clip(result.stderr, 2000),
    })
  }

  async _thumbnail({ path: inputPath, time = 5, imageFormat = 'jpg', width = 1280 }) {
    const resolved = this._resolveMedia(inputPath)
    const format = IMAGE_FORMATS.has(imageFormat) ? imageFormat : 'jpg'
    const safeTime = _num(time, 5, { min: 0 })
    const safeWidth = Math.floor(_num(width, 1280, { min: 160, max: 3840 }))
    const outputPath = this._paths.makeOutputPath('ffmpeg', resolved, { suffix: 'thumbnail', ext: format })
    const result = await _run('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-ss', String(safeTime),
      '-i', resolved,
      '-frames:v', '1',
      '-vf', `scale=${safeWidth}:-2`,
      outputPath,
    ], { timeoutMs: 60000 })
    return this._outputResult(result, 'thumbnail', outputPath, '生成封面图失败。')
  }

  async _clipSegment({ path: inputPath, startTime = 0, durationSeconds = 60, outputFormat = 'mp4' }) {
    const resolved = this._resolveMedia(inputPath)
    const format = CLIP_FORMATS.has(outputFormat) ? outputFormat : 'mp4'
    const safeStart = _num(startTime, 0, { min: 0 })
    const safeDuration = _num(durationSeconds, 60, { min: 1, max: MAX_CLIP_SECONDS })
    const outputPath = this._paths.makeOutputPath('ffmpeg', resolved, { suffix: 'clip', ext: format })
    const result = await _run('ffmpeg', [
      '-nostdin',
      '-hide_banner',
      '-ss', String(safeStart),
      '-t', String(safeDuration),
      '-i', resolved,
      '-c', 'copy',
      outputPath,
    ], { timeoutMs: 180000 })
    return this._outputResult(result, 'clip', outputPath, '截取片段失败。')
  }

  _outputResult(result, operation, outputPath, failureMessage) {
    if (result.code !== 0) {
      return _jsonError(result.code === 124 ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED', failureMessage, {
        detail: _clip(result.stderr || result.stdout, 2000),
      })
    }
    const exists = fs.existsSync(outputPath)
    return JSON.stringify({
      success: true,
      operation,
      outputPath: exists ? this._paths.toVirtualPath(outputPath) : '',
      bytes: exists ? fs.statSync(outputPath).size : 0,
      stderr: _clip(result.stderr, 2000),
    })
  }
}

export function createFfmpegTool(workDirService, allowedOperations = [], options = {}) {
  const service = new FfmpegToolService(workDirService, options)
  const allowed = [...new Set(allowedOperations)]
  return tool(
    async (input) => service.invoke(input, allowed),
    {
      name: 'ffmpeg_tool',
      description: [
        'FFmpeg 工具集的受控路由工具。只允许当前 Agent 已启用的 operation。',
        `当前允许的 operation：${allowed.join(', ') || '无'}`,
        '适合学习场景中的课程视频、讲座、播客处理：读取媒体信息、提取音频、提取字幕、抽帧、生成封面图、截取片段。',
        '输入 path 必须位于授权工作区内；输出会写入 /agents/{agent}/outputs/YYYY-MM-DD/。',
      ].join('\n'),
      schema: z.object({
        operation: z.enum(['probe', 'extract_audio', 'extract_subtitles', 'extract_frames', 'thumbnail', 'clip']).describe('要执行的 FFmpeg 子操作。'),
        path: z.string().describe('输入音视频文件路径，支持 /docs/... 或 /context/... 虚拟路径。'),
        outputFormat: z.enum(['mp3', 'm4a', 'wav', 'srt', 'vtt', 'mp4']).optional().describe('输出格式。音频：mp3/m4a/wav；字幕：srt/vtt；片段：mp4/m4a/mp3/wav。'),
        streamIndex: z.number().optional().describe('字幕轨道索引，默认 0。'),
        startTime: z.number().optional().describe('开始时间，单位秒。抽帧和截片段使用，默认 0。'),
        durationSeconds: z.number().optional().describe('截取片段时长，单位秒，最大 1800。'),
        intervalSeconds: z.number().optional().describe('抽帧间隔，单位秒，默认 30。'),
        maxFrames: z.number().optional().describe('最多抽取帧数，默认 12，最大 60。'),
        imageFormat: z.enum(['jpg', 'png', 'webp']).optional().describe('图片输出格式，默认 jpg。'),
        width: z.number().optional().describe('输出图片宽度，默认 1280。'),
        time: z.number().optional().describe('生成封面图的时间点，单位秒，默认 5。'),
      }),
    },
  )
}
