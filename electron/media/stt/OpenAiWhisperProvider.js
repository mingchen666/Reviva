import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { normalizeSpeechToTextCapabilities, SPEECH_TO_TEXT_PROVIDER_IDS, SPEECH_TO_TEXT_INPUT_MODES, SPEECH_TO_TEXT_TIMESTAMP_LEVELS } from './SpeechToTextTypes.js'

function transcriptionUrl(baseUrl = '') {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (/\/audio\/transcriptions$/i.test(raw)) return raw
  if (/\/v1$/i.test(raw)) return `${raw}/audio/transcriptions`
  return `${raw}/v1/audio/transcriptions`
}

function audioMimeType(filePath = '') {
  const extension = path.extname(filePath).toLowerCase()
  return ({
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.aac': 'audio/aac',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
  })[extension] || 'application/octet-stream'
}

function asSegments(payload = {}) {
  return (Array.isArray(payload.segments) ? payload.segments : []).map((segment) => ({
    startMs: Math.round(Number(segment.start || 0) * 1000),
    endMs: Math.round(Number(segment.end || 0) * 1000),
    text: String(segment.text || '').trim(),
    language: payload.language || '',
  })).filter(segment => segment.text)
}

function asWordSegments(payload = {}) {
  const sourceWords = Array.isArray(payload.words)
    ? payload.words
    : (Array.isArray(payload.segments) ? payload.segments.flatMap(segment => Array.isArray(segment.words) ? segment.words : []) : [])
  const words = sourceWords
    .map(word => ({
      raw: String(word.word ?? word.text ?? ''),
      startMs: Math.max(0, Math.round(Number(word.start || 0) * 1000)),
      endMs: Math.max(0, Math.round(Number(word.end ?? word.start ?? 0) * 1000)),
      confidence: Number.isFinite(Number(word.confidence ?? word.probability)) ? Number(word.confidence ?? word.probability) : null,
    }))
    .filter(word => word.raw.trim())
  if (!words.length) return []
  const result = []
  let group = []
  const flush = () => {
    if (!group.length) return
    const confidences = group.map(word => word.confidence).filter(value => value !== null)
    result.push({
      startMs: group[0].startMs,
      endMs: Math.max(group[0].startMs, group[group.length - 1].endMs),
      text: group.map(word => word.raw).join('').replace(/\s+/g, ' ').trim(),
      language: payload.language || '',
      confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    })
    group = []
  }
  for (const word of words) {
    const previous = group[group.length - 1]
    if (previous && word.startMs - previous.endMs > 800) flush()
    group.push(word)
    const sentenceEnd = /[。！？!?；;：:]\s*$/.test(word.raw)
    if (sentenceEnd || group.length >= 12) flush()
  }
  flush()
  return result.filter(segment => segment.text)
}

export class OpenAiWhisperProvider {
  constructor({ id = SPEECH_TO_TEXT_PROVIDER_IDS.OPENAI_WHISPER_COMPATIBLE, displayName = 'Whisper Compatible' } = {}) {
    this.id = id
    this.displayName = displayName
  }

  getCapabilities() {
    return normalizeSpeechToTextCapabilities({
      inputModes: [SPEECH_TO_TEXT_INPUT_MODES.LOCAL_FILE],
      timestampLevels: [SPEECH_TO_TEXT_TIMESTAMP_LEVELS.NONE, SPEECH_TO_TEXT_TIMESTAMP_LEVELS.SEGMENT, SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD],
    })
  }

  async checkConfiguration(config = {}) {
    const url = transcriptionUrl(config.baseUrl)
    if (!url || !config.model) throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, `${this.displayName} 缺少 Base URL 或模型。`, { provider: this.id, stage: 'stt' })
    let parsed
    try { parsed = new URL(url) } catch {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, `${this.displayName} Base URL 无效。`, { provider: this.id, stage: 'stt' })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, `${this.displayName} 仅支持 HTTP(S) 地址。`, { provider: this.id, stage: 'stt' })
    return {
      ready: true,
      endpoint: url,
      model: String(config.model),
      authenticated: Boolean(config.apiKey),
      message: '配置格式有效；为避免产生转写费用，未发送音频请求。',
    }
  }

  async transcribe(input = {}, config = {}, context = {}) {
    if (input.mode !== SPEECH_TO_TEXT_INPUT_MODES.LOCAL_FILE || !input.localPath) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, `${this.displayName} 只接受本地文件上传。`, { provider: this.id, stage: 'stt' })
    }
    const url = transcriptionUrl(config.baseUrl)
    if (!url || !config.model) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, `${this.displayName} 缺少 Base URL 或模型。`, { provider: this.id, stage: 'stt' })
    }
    const level = config.timestampLevel || SPEECH_TO_TEXT_TIMESTAMP_LEVELS.SEGMENT
    const fileData = await fs.promises.readFile(input.localPath)
    const send = async ({ minimal = false } = {}) => {
      const form = new FormData()
      form.append('file', new Blob([fileData], { type: audioMimeType(input.localPath) }), path.basename(input.localPath))
      form.append('model', config.model)
      if (input.language && input.language !== 'auto') form.append('language', input.language)
      if (!minimal) {
        form.append('response_format', level === SPEECH_TO_TEXT_TIMESTAMP_LEVELS.NONE ? 'json' : 'verbose_json')
        if (level !== SPEECH_TO_TEXT_TIMESTAMP_LEVELS.NONE) {
          form.append('timestamp_granularities[]', level === SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD ? 'word' : 'segment')
          if (level === SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD) form.append('timestamp_granularities[]', 'segment')
        }
      }
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
          body: form,
          signal: context.signal,
        })
      } catch (error) {
        if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, `${this.displayName} 转写已取消。`, { provider: this.id, stage: 'stt' })
        throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, `${this.displayName} 网络请求失败。`, { provider: this.id, stage: 'stt', retryable: true, cause: error })
      }
      const rawBody = await response.text().catch(() => '')
      let payload
      try {
        const parsed = JSON.parse(rawBody)
        payload = typeof parsed === 'string'
          ? { text: parsed }
          : (parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        payload = response.ok ? { text: rawBody } : { error: rawBody }
      }
      return { response, payload }
    }
    let { response, payload } = await send()
    let usedMinimalFallback = false
    if (response.status === 400 && level !== SPEECH_TO_TEXT_TIMESTAMP_LEVELS.NONE) {
      const fallback = await send({ minimal: true })
      response = fallback.response
      payload = fallback.payload
      usedMinimalFallback = response.ok
    }
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? MEDIA_ERROR_CODES.PROVIDER_AUTH_FAILED
        : response.status === 429
          ? MEDIA_ERROR_CODES.PROVIDER_RATE_LIMITED
          : [413, 415].includes(response.status)
            ? MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED
            : MEDIA_ERROR_CODES.STT_FAILED
      const providerMessage = payload?.error?.message || (typeof payload?.error === 'string' ? payload.error : '') || payload?.message
      const fallbackMessage = response.status === 413
        ? `${this.displayName} 拒绝了当前文件：上传请求超过服务端大小限制（HTTP 413）。`
        : response.status === 415
          ? `${this.displayName} 不支持当前媒体格式（HTTP 415）。`
          : `${this.displayName} 请求失败（HTTP ${response.status}）。`
      const message = [413, 415].includes(response.status) ? fallbackMessage : (providerMessage || fallbackMessage)
      const originalContainerHint = /-audio-original\./i.test(path.basename(input.localPath))
        ? ' 当前正在直接上传 B 站原始音轨；如果服务商不兼容，请在“设置 > 环境管理”安装或修复 FFmpeg 后重试。'
        : ''
      throw new MediaError(code, `${message}${originalContainerHint}`, { provider: this.id, stage: 'stt', status: response.status, retryable: response.status >= 500 || response.status === 429 })
    }
    const wordSegments = level === SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD ? asWordSegments(payload) : []
    const segments = wordSegments.length ? wordSegments : asSegments(payload)
    const warnings = []
    if (usedMinimalFallback) {
      warnings.push('服务商不支持当前时间戳扩展参数，已使用同一服务商、模型和文件完成纯文本转写。')
    } else if (level === SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD && !wordSegments.length) {
      warnings.push('服务商未返回 word timestamps，已回退到 segment timestamps。')
    }
    return {
      language: payload.language || input.language || '',
      text: String(payload.text || '').trim(),
      segments,
      usage: payload.usage || {},
      warnings,
    }
  }
}

export { transcriptionUrl, asSegments, asWordSegments }
