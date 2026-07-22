import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { normalizeSpeechToTextCapabilities, SPEECH_TO_TEXT_PROVIDER_IDS, SPEECH_TO_TEXT_INPUT_MODES, SPEECH_TO_TEXT_TIMESTAMP_LEVELS } from './SpeechToTextTypes.js'
import {
  ALIYUN_ASR_PROTOCOLS,
  formatAliyunAsrLimit,
  getAliyunAsrModelCapability,
} from '../../../src/constants/aliyunAsrModels.js'

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELED', 'CANCELLED'])
const FUN_ASR_FLASH_MODEL = 'fun-asr-flash-2026-06-15'
const QWEN_FLASH_MODEL = 'qwen3-asr-flash'

function waitWithSignal(ms, signal, providerId) {
  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', abort)
      fn(value)
    }
    const abort = () => finish(reject, new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼转写已取消。', { provider: providerId, stage: 'waiting_provider' }))
    const timer = setTimeout(() => finish(resolve), ms)
    if (signal?.aborted) return abort()
    signal?.addEventListener?.('abort', abort, { once: true })
  })
}

function endpoint(config = '') {
  const raw = String(config || '').trim().replace(/\/+$/, '')
  return raw || ''
}

function hostFor(config = {}) {
  if (config.baseUrl) return endpoint(config.baseUrl)
  const workspace = String(config.workspaceId || '').trim()
  const region = String(config.region || 'cn-beijing').trim()
  if (!workspace) return `https://dashscope.aliyuncs.com/api/v1`
  return `https://${workspace}.${region}.maas.aliyuncs.com/api/v1`
}

function qwenCompatibleEndpoint(config = {}) {
  const base = hostFor(config)
  if (/\/compatible-mode\/v1(?:\/chat\/completions)?$/i.test(base)) {
    return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
  }
  return `${base.replace(/\/api\/v1$/i, '')}/compatible-mode/v1/chat/completions`
}

function parseResult(payload = {}, language = '') {
  const body = payload?.output && typeof payload.output === 'object' ? payload.output : payload
  const transcripts = Array.isArray(body.transcripts) ? body.transcripts : []
  const segments = []
  for (const transcript of transcripts) {
    for (const sentence of (transcript.sentences || [])) {
      const text = String(sentence.text || '').trim()
      if (!text) continue
      segments.push({
        startMs: Number(sentence.begin_time) || 0,
        endMs: Number(sentence.end_time) || Number(sentence.begin_time) || 0,
        text,
        language,
        speaker: sentence.speaker_id === undefined ? null : `speaker_${sentence.speaker_id}`,
      })
    }
  }
  const text = transcripts.map(item => item.text || '').filter(Boolean).join('\n').trim() || segments.map(item => item.text).join('\n')
  return { language, text, segments, usage: body.usage || payload.usage || {}, warnings: [] }
}

function mediaMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.flac') return 'audio/flac'
  if (ext === '.ogg' || ext === '.opus') return 'audio/ogg'
  if (ext === '.m4a' || ext === '.aac') return 'audio/mp4'
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  return 'audio/mpeg'
}

function audioFormat(filePath) {
  return path.extname(filePath).slice(1).toLowerCase() || 'wav'
}

function audioFormatFromUrl(value) {
  try { return audioFormat(new URL(value).pathname) } catch { return 'wav' }
}

export class AliyunBailianAsrProvider {
  constructor() {
    this.id = SPEECH_TO_TEXT_PROVIDER_IDS.ALIYUN_BAILIAN_ASR
  }

  getCapabilities(config = {}) {
    const model = String(config.model || 'fun-asr').trim()
    const modelCapability = getAliyunAsrModelCapability(model)
    return normalizeSpeechToTextCapabilities({
      inputModes: modelCapability?.inputModes || [SPEECH_TO_TEXT_INPUT_MODES.PUBLIC_URL],
      timestampLevels: [SPEECH_TO_TEXT_TIMESTAMP_LEVELS.SEGMENT, SPEECH_TO_TEXT_TIMESTAMP_LEVELS.WORD],
      supportsDiarization: modelCapability?.supportsDiarization === true,
      maxDurationMs: modelCapability?.maxDurationMs || 0,
      maxFileBytes: modelCapability?.maxFileBytes || 0,
    })
  }

  _validateInput(input = {}, config = {}) {
    const model = String(config.model || 'fun-asr').trim()
    const capability = getAliyunAsrModelCapability(model)
    const mode = String(input.mode || '')
    if (!capability) {
      if (mode !== SPEECH_TO_TEXT_INPUT_MODES.PUBLIC_URL) {
        throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, '百炼自定义模型按异步录音文件识别接口调用，需要公网 HTTP(S) 文件直链。', { provider: this.id, stage: 'stt' })
      }
      return { model, capability: null, warnings: [] }
    }
    if (!capability.inputModes.includes(mode)) {
      throw new MediaError(
        MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED,
        `${capability.name} 不支持本地文件输入；请在“音视频链接”中使用公网文件直链，或切换支持文件上传的服务商。`,
        { provider: this.id, stage: 'stt' },
      )
    }
    const sizeBytes = Math.max(0, Number(input.sizeBytes) || 0)
    const maxFileBytes = mode === SPEECH_TO_TEXT_INPUT_MODES.LOCAL_FILE
      ? (capability.maxLocalFileBytes || capability.maxFileBytes)
      : capability.maxFileBytes
    if (maxFileBytes && sizeBytes > maxFileBytes) {
      const sizeLimit = capability.maxLocalFileBytes && mode === SPEECH_TO_TEXT_INPUT_MODES.LOCAL_FILE
        ? `本地 Base64 输入最大 ${Math.round(capability.maxLocalFileBytes / 1024 / 1024)} MB`
        : formatAliyunAsrLimit(capability)
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, `${capability.name} 输入超过限制：${sizeLimit}。`, { provider: this.id, stage: 'stt' })
    }
    const durationMs = Math.max(0, Number(input.durationMs) || 0)
    if (capability.maxDurationMs && durationMs > capability.maxDurationMs) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, `${capability.name} 输入超过限制：${formatAliyunAsrLimit(capability)}。`, { provider: this.id, stage: 'stt' })
    }
    const warnings = []
    if (config.enableDiarization && !capability.supportsDiarization) {
      warnings.push(`${capability.name} 不支持说话人分离，已忽略该选项。`)
    } else if (
      config.enableDiarization
      && capability.diarizationRecommendedMaxDurationMs
      && durationMs > capability.diarizationRecommendedMaxDurationMs
    ) {
      warnings.push('当前音频超过 2 小时；百炼说话人分离可能识别失败或超时。')
    }
    return { model, capability, warnings }
  }

  async checkConfiguration(config = {}) {
    if (!String(config.apiKey || '').trim()) throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '阿里云百炼缺少 API Key。', { provider: this.id, stage: 'stt' })
    if (!String(config.workspaceId || '').trim() && !String(config.baseUrl || '').trim()) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '阿里云百炼缺少 Workspace ID。', { provider: this.id, stage: 'stt' })
    }
    const model = String(config.model || '').trim()
    if (!model) throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '阿里云百炼缺少模型 ID。', { provider: this.id, stage: 'stt' })
    const baseUrl = hostFor(config)
    let parsed
    try { parsed = new URL(baseUrl) } catch {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '阿里云百炼服务地址无效。', { provider: this.id, stage: 'stt' })
    }
    if (parsed.protocol !== 'https:') throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '阿里云百炼服务地址必须使用 HTTPS。', { provider: this.id, stage: 'stt' })
    return {
      ready: true,
      endpoint: baseUrl,
      model,
      localFileMode: this.getCapabilities(config).inputModes.includes(SPEECH_TO_TEXT_INPUT_MODES.LOCAL_FILE)
        ? `支持本地文件 · ${formatAliyunAsrLimit(getAliyunAsrModelCapability(model))}`
        : '不支持；请使用公网文件直链',
      publicUrlMode: getAliyunAsrModelCapability(model)?.protocol === ALIYUN_ASR_PROTOCOLS.QWEN_FLASH_CHAT
        ? '同步调用'
        : '异步任务',
      message: '配置格式有效；未提交计费转写任务。',
    }
  }

  _headers(config, json = false) {
    if (!config.apiKey) throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '阿里云百炼缺少 API Key。', { provider: this.id, stage: 'stt' })
    return {
      Authorization: `Bearer ${config.apiKey}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }
  }

  async submit({ url, language, config = {}, signal, onSubmitted, warnings: inputWarnings = [] } = {}) {
    if (!url || !/^https?:\/\//i.test(url)) throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, '阿里云百炼录音文件识别需要公网 HTTP(S) URL。', { provider: this.id, stage: 'stt' })
    const base = hostFor(config)
    const model = config.model || 'fun-asr'
    const qwenFileTrans = /^qwen3-asr-flash-filetrans/i.test(model)
    const warnings = [...inputWarnings]
    if (qwenFileTrans && config.enableDiarization) warnings.push('Qwen3-ASR Filetrans 不支持说话人分离，已忽略该选项。')
    const parameters = {
      channel_id: [0],
      ...(language && language !== 'auto' ? (qwenFileTrans ? { language } : { language_hints: [language] }) : {}),
      ...(config.enableDiarization && !qwenFileTrans ? { diarization_enabled: true } : {}),
      ...(qwenFileTrans ? { enable_words: true } : {}),
    }
    let response
    try {
      response = await fetch(`${base}/services/audio/asr/transcription`, {
        method: 'POST',
        headers: { ...this._headers(config, true), 'X-DashScope-Async': 'enable' },
        body: JSON.stringify({ model, input: qwenFileTrans ? { file_url: url } : { file_urls: [url] }, parameters }),
        signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼转写已取消。', { provider: this.id, stage: 'stt' })
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, '阿里云百炼提交任务失败。', { provider: this.id, stage: 'stt', retryable: true, cause: error })
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.output?.task_id) {
      const code = response.status === 401 || response.status === 403 ? MEDIA_ERROR_CODES.PROVIDER_AUTH_FAILED : response.status === 429 ? MEDIA_ERROR_CODES.PROVIDER_RATE_LIMITED : MEDIA_ERROR_CODES.STT_FAILED
      throw new MediaError(code, payload?.message || payload?.code || `阿里云百炼提交失败（HTTP ${response.status}）。`, { provider: this.id, stage: 'stt', status: response.status, retryable: response.status >= 500 || response.status === 429 })
    }
    const submitted = { providerJobId: payload.output.task_id, providerJobStatus: payload.output.task_status || 'PENDING', language: language || config.language || '', warnings: [...new Set(warnings)] }
    if (typeof onSubmitted === 'function') await onSubmitted(submitted)
    return submitted
  }

  async _flashInput(input = {}) {
    let data = String(input.url || '').trim()
    let format = String(input.format || '').trim() || (data ? audioFormatFromUrl(data) : '')
    if (input.localPath) {
      if (!fs.existsSync(input.localPath)) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAVAILABLE, '百炼本地音频文件不存在。', { provider: this.id, stage: 'stt' })
      const encoded = (await fs.promises.readFile(input.localPath)).toString('base64')
      data = `data:${mediaMime(input.localPath)};base64,${encoded}`
      format = audioFormat(input.localPath)
    }
    if (!data || (!/^https?:\/\//i.test(data) && !/^data:audio\//i.test(data))) {
      if (!/^data:video\//i.test(data)) {
        throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, '百炼短音频模型需要公网音视频 URL 或 Base64 Data URL。', { provider: this.id, stage: 'stt' })
      }
    }
    return { data, format }
  }

  async transcribeFunAsrFlash(input = {}, config = {}, context = {}) {
    const { data, format } = await this._flashInput(input)
    const model = String(config.model || FUN_ASR_FLASH_MODEL).trim()
    let response
    try {
      response = await fetch(`${hostFor(config)}/services/aigc/multimodal-generation/generation`, {
        method: 'POST',
        headers: { ...this._headers(config, true), 'X-DashScope-SSE': 'disable' },
        body: JSON.stringify({
          model,
          input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }] },
          parameters: { format: format || 'wav', sample_rate: '16000' },
        }),
        signal: context.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼转写已取消。', { provider: this.id, stage: 'stt' })
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, '阿里云百炼 Flash 网络请求失败。', { provider: this.id, stage: 'stt', retryable: true, cause: error })
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? MEDIA_ERROR_CODES.PROVIDER_AUTH_FAILED : response.status === 429 ? MEDIA_ERROR_CODES.PROVIDER_RATE_LIMITED : MEDIA_ERROR_CODES.STT_FAILED
      throw new MediaError(code, payload?.message || payload?.code || `阿里云百炼 Flash 请求失败（HTTP ${response.status}）。`, { provider: this.id, stage: 'stt', status: response.status, retryable: response.status === 429 || response.status >= 500 })
    }
    const sentence = payload?.output?.output?.sentence || payload?.output?.sentence || null
    const text = String(payload?.output?.text || sentence?.text || '').trim()
    if (!text) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, '阿里云百炼 Flash 没有返回转写文本。', { provider: this.id, stage: 'stt' })
    return {
      model,
      language: input.language || config.language || '',
      text,
      segments: sentence && (sentence.begin_time !== undefined || sentence.end_time !== undefined) ? [{
        startMs: Number(sentence.begin_time) || 0,
        endMs: Number(sentence.end_time) || Number(sentence.begin_time) || 0,
        text: sentence.text || text,
        speaker: sentence.speaker_id === undefined ? null : `speaker_${sentence.speaker_id}`,
      }] : [],
      usage: payload.usage || payload?.output?.usage || {},
      warnings: [...new Set(context.validationWarnings || [])],
    }
  }

  async transcribeQwenFlash(input = {}, config = {}, context = {}) {
    const { data } = await this._flashInput(input)
    const model = String(config.model || QWEN_FLASH_MODEL).trim()
    const language = String(input.language || config.language || '').trim()
    let response
    try {
      response = await fetch(qwenCompatibleEndpoint(config), {
        method: 'POST',
        headers: this._headers(config, true),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }],
          stream: false,
          asr_options: {
            ...(language && language !== 'auto' ? { language } : {}),
            enable_itn: false,
          },
        }),
        signal: context.signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼转写已取消。', { provider: this.id, stage: 'stt' })
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, 'Qwen3-ASR-Flash 网络请求失败。', { provider: this.id, stage: 'stt', retryable: true, cause: error })
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? MEDIA_ERROR_CODES.PROVIDER_AUTH_FAILED : response.status === 429 ? MEDIA_ERROR_CODES.PROVIDER_RATE_LIMITED : MEDIA_ERROR_CODES.STT_FAILED
      throw new MediaError(code, payload?.error?.message || payload?.message || payload?.code || `Qwen3-ASR-Flash 请求失败（HTTP ${response.status}）。`, { provider: this.id, stage: 'stt', status: response.status, retryable: response.status === 429 || response.status >= 500 })
    }
    const message = payload?.choices?.[0]?.message || {}
    const text = String(message.content || '').trim()
    if (!text) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Qwen3-ASR-Flash 没有返回转写文本。', { provider: this.id, stage: 'stt' })
    const detectedLanguage = message.annotations?.find?.(item => item?.type === 'audio_info')?.language || language
    return {
      model,
      language: detectedLanguage || '',
      text,
      segments: [],
      usage: payload.usage || {},
      warnings: [...new Set(context.validationWarnings || [])],
    }
  }

  async resume(job = {}, config = {}, { signal } = {}) {
    if (!job.providerJobId) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, '缺少阿里云百炼 task_id。', { provider: this.id, stage: 'waiting_provider' })
    const base = hostFor(config)
    let response
    try {
      response = await fetch(`${base}/tasks/${encodeURIComponent(job.providerJobId)}`, {
        method: 'GET',
        headers: this._headers(config),
        signal,
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼任务查询已取消。', { provider: this.id, stage: 'waiting_provider' })
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, '阿里云百炼任务查询网络失败。', { provider: this.id, stage: 'waiting_provider', retryable: true, cause: error })
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? MEDIA_ERROR_CODES.PROVIDER_AUTH_FAILED : response.status === 429 ? MEDIA_ERROR_CODES.PROVIDER_RATE_LIMITED : MEDIA_ERROR_CODES.STT_FAILED
      throw new MediaError(code, payload?.message || `阿里云百炼查询失败（HTTP ${response.status}）。`, { provider: this.id, stage: 'waiting_provider', status: response.status, retryable: response.status === 429 || response.status >= 500 })
    }
    const status = String(payload?.output?.task_status || '').toUpperCase()
    if (!TERMINAL.has(status)) return { pending: true, providerJobId: job.providerJobId, providerJobStatus: status || 'RUNNING' }
    if (status !== 'SUCCEEDED') {
      const result = payload?.output?.results?.find(item => item.subtask_status === 'FAILED')
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, result?.message || '阿里云百炼转写失败。', { provider: this.id, stage: 'waiting_provider', retryable: false })
    }
    const result = payload?.output?.results?.find(item => item.subtask_status === 'SUCCEEDED') || payload?.output?.result || null
    if (!result?.transcription_url) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, '阿里云百炼未返回 transcription_url。', { provider: this.id, stage: 'waiting_provider' })
    let transcriptionResponse
    try {
      transcriptionResponse = await fetch(result.transcription_url, { signal })
    } catch (error) {
      if (error?.name === 'AbortError') throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '阿里云百炼结果下载已取消。', { provider: this.id, stage: 'stt' })
      throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, '阿里云百炼转写结果下载网络失败。', { provider: this.id, stage: 'stt', retryable: true, cause: error })
    }
    const transcription = await transcriptionResponse.json().catch(() => ({}))
    if (!transcriptionResponse.ok) throw new MediaError(MEDIA_ERROR_CODES.STT_FAILED, '阿里云百炼转写结果下载失败。', { provider: this.id, stage: 'stt', retryable: true })
    const normalized = parseResult(transcription, job.language || config.language || '')
    normalized.warnings = [...new Set([...(normalized.warnings || []), ...(job.warnings || [])])]
    return { pending: false, providerJobId: job.providerJobId, providerJobStatus: status, ...normalized }
  }

  async transcribe(input = {}, config = {}, context = {}) {
    const normalizedInput = { ...input }
    if (normalizedInput.localPath && !Number(normalizedInput.sizeBytes) && fs.existsSync(normalizedInput.localPath)) {
      normalizedInput.sizeBytes = fs.statSync(normalizedInput.localPath).size
    }
    const validation = this._validateInput(normalizedInput, config)
    const protocol = validation.capability?.protocol || ALIYUN_ASR_PROTOCOLS.ASYNC_FILE_URLS
    const validatedContext = { ...context, validationWarnings: validation.warnings }
    if (protocol === ALIYUN_ASR_PROTOCOLS.QWEN_FLASH_CHAT) {
      return this.transcribeQwenFlash(normalizedInput, config, validatedContext)
    }
    if (protocol === ALIYUN_ASR_PROTOCOLS.FUN_ASR_FLASH) {
      return this.transcribeFunAsrFlash(normalizedInput, config, validatedContext)
    }
    if (normalizedInput.mode !== SPEECH_TO_TEXT_INPUT_MODES.PUBLIC_URL || !normalizedInput.url) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, '阿里云百炼长文件转写需要公网 URL。', { provider: this.id, stage: 'stt' })
    }
    const submitted = await this.submit({
      url: normalizedInput.url,
      language: normalizedInput.language,
      config,
      signal: context.signal,
      onSubmitted: context.onProviderJobSubmitted,
      warnings: validation.warnings,
    })
    if (context.deferAsync) return { pending: true, ...submitted }
    const deadline = Date.now() + (Number(config.timeoutMinutes) || 1440) * 60 * 1000
    let result = { pending: true, ...submitted }
    while (result.pending && Date.now() < deadline) {
      await waitWithSignal(30000, context.signal, this.id)
      result = await this.resume(result, config, context)
    }
    if (result.pending) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_JOB_TIMEOUT, '阿里云百炼转写等待超时。', { provider: this.id, stage: 'waiting_provider', retryable: true })
    return result
  }
}

export { hostFor, parseResult }
