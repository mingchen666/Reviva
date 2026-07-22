import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from './MediaErrors.js'
import {
  MEDIA_ARTIFACT_TYPES,
  MEDIA_CONTENT_AVAILABILITIES,
  MEDIA_RUN_STATUSES,
  MEDIA_STAGES,
} from './MediaTypes.js'

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new MediaError(MEDIA_ERROR_CODES.CANCELLED, '媒体解析已取消。')
}

export class LocalMediaPipeline {
  constructor({
    workDirService,
    mediaRepository,
    locationRepository,
    artifactService,
    probeService,
    subtitleService,
    timelineService,
    keyframeService,
    ffmpegRunner,
    segmentNormalizer,
    speechToTextRegistry,
    runRepository,
    acquisitionService,
    getSpeechSettings,
  } = {}) {
    this._workDir = workDirService
    this._media = mediaRepository
    this._locations = locationRepository
    this._artifactService = artifactService
    this._probe = probeService
    this._subtitles = subtitleService
    this._timeline = timelineService
    this._keyframes = keyframeService
    this._ffmpeg = ffmpegRunner
    this._segments = segmentNormalizer
    this._speechToText = speechToTextRegistry
    this._runs = runRepository
    this._acquisition = acquisitionService
    this._getSpeechSettings = typeof getSpeechSettings === 'function' ? getSpeechSettings : () => ({})
  }

  async _stage(onStage, stage, progress, message) {
    await onStage?.(stage, progress, message)
  }

  _resolveSidecar(inputPath, config = {}) {
    const candidates = []
    if (config.sidecarPath) candidates.push(config.sidecarPath)
    for (const candidate of config.sidecarCandidates || []) candidates.push(candidate.path || candidate)
    const base = inputPath.slice(0, inputPath.length - path.extname(inputPath).length)
    candidates.push(`${base}.srt`, `${base}.vtt`)
    for (const candidate of candidates.filter(Boolean)) {
      let resolved = String(candidate)
      try {
        if (this._workDir?.resolveAndValidate) resolved = this._workDir.resolveAndValidate(candidate, 'any')
      } catch {
        continue
      }
      const extension = path.extname(resolved).toLowerCase()
      if (!['.srt', '.vtt'].includes(extension)) continue
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved
    }
    return ''
  }

  _speechProvider(run, mode = 'local_file') {
    const settings = this._getSpeechSettings() || {}
    const providers = settings.providers && typeof settings.providers === 'object' ? settings.providers : {}
    const configuredRunProviderId = String(run.config?.providerId || run.stt_provider_id || '').trim()
    const requestedId = run.config?.localOnly ? 'local_asr' : (configuredRunProviderId || 'auto')
    const explicit = requestedId && requestedId !== 'auto'
    const defaultProviderId = String(settings.defaultProviderId || '').trim()
    const candidates = explicit ? [requestedId] : [defaultProviderId].filter(Boolean)
    for (const providerId of candidates) {
      const providerConfig = { ...(providers[providerId] || {}) }
      if (!providerConfig.enabled) continue
      const provider = this._speechToText.get(providerId)
      const inputModes = provider?.getCapabilities?.(providerConfig)?.inputModes || []
      if (!provider || (inputModes.length && !inputModes.includes(mode))) continue
      return { providerId, providerConfig, provider }
    }
    if (explicit && !providers[requestedId]?.enabled) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '所选语音转文字服务尚未启用。', { stage: 'stt', provider: requestedId })
    }
    if (explicit) throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, `所选语音转文字服务不支持 ${mode} 输入。`, { stage: 'stt', provider: requestedId })
    if (defaultProviderId && providers[defaultProviderId]?.enabled) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, mode === 'public_url'
        ? '默认语音转文字服务不支持公网 URL 输入；请在媒体解析设置中明确选择其他服务商。'
        : '默认语音转文字服务不支持本地文件输入；请在媒体解析设置中明确选择其他服务商。', { stage: 'stt', provider: defaultProviderId })
    }
    throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '尚未启用默认语音转文字服务。', { stage: 'stt' })
  }

  _remoteInputMode(run) {
    const settings = this._getSpeechSettings() || {}
    const providers = settings.providers && typeof settings.providers === 'object' ? settings.providers : {}
    const configuredRunProviderId = String(run.config?.providerId || run.stt_provider_id || '').trim()
    const requestedId = run.config?.localOnly ? 'local_asr' : (configuredRunProviderId || 'auto')
    const providerId = requestedId && requestedId !== 'auto'
      ? requestedId
      : (providers[settings.defaultProviderId]?.enabled
          ? settings.defaultProviderId
          : (Object.keys(providers).find(id => providers[id]?.enabled) || ''))
    if (!providerId || !providers[providerId]?.enabled) {
      throw new MediaError(MEDIA_ERROR_CODES.STT_NOT_CONFIGURED, '尚未启用语音转文字服务。', { stage: 'stt', provider: providerId })
    }
    const provider = this._speechToText.get(providerId)
    const providerConfig = { ...(providers[providerId] || {}) }
    const inputModes = provider?.getCapabilities?.(providerConfig)?.inputModes || []
    if (inputModes.includes('public_url')) return 'public_url'
    if (inputModes.includes('local_file')) return 'local_file'
    throw new MediaError(MEDIA_ERROR_CODES.STT_INPUT_UNSUPPORTED, '所选语音转文字服务不支持远程媒体输入。', { stage: 'stt', provider: providerId })
  }

  async _transcribe(run, inputPath, metadata, { signal, onStage } = {}) {
    const { providerId, providerConfig, provider } = this._speechProvider(run, 'local_file')
    let sttInputs = [{ path: inputPath, offsetMs: 0 }]
    let temporaryAudioPath = ''
    const directUploadProvider = ['local_asr', 'openai_whisper_compatible', 'aliyun_bailian_asr'].includes(providerId)
    try {
      if (metadata.mediaType === 'video' && !directUploadProvider) {
        await this._stage(onStage, MEDIA_STAGES.FFMPEG, 45, '正在提取语音音轨')
        const paths = this._artifactService.paths(run.media_id, run.id)
        temporaryAudioPath = path.join(paths.tempDir, 'analysis', 'stt_input.flac')
        const extracted = await this._ffmpeg.extractAudio(inputPath, { outputPath: temporaryAudioPath, signal })
        sttInputs = [{ path: extracted, offsetMs: 0 }]
      }
      await this._stage(onStage, MEDIA_STAGES.STT, 55, '正在进行语音转文字')
      this._runs?.updateMediaRun?.(run.id, {
        sttProviderId: providerId,
        sttModelId: providerConfig.model || providerConfig.backend || '',
      })
      const texts = []
      const segments = []
      const warnings = []
      const usage = {}
      let partial = false
      let resultModel = providerConfig.model || providerConfig.backend || ''
      let resultLanguage = run.config?.language || providerConfig.language || ''
      for (let index = 0; index < sttInputs.length; index++) {
        throwIfCancelled(signal)
        if (sttInputs.length > 1) await this._stage(onStage, MEDIA_STAGES.STT, 55 + Math.round((index / sttInputs.length) * 9), `正在转写第 ${index + 1}/${sttInputs.length} 段音频`)
        const item = sttInputs[index]
        let result
        try {
          result = await provider.transcribe({
            mode: 'local_file',
            localPath: item.path,
            language: run.config?.language || providerConfig.language || '',
            sizeBytes: fs.existsSync(item.path) ? fs.statSync(item.path).size : 0,
            durationMs: sttInputs.length === 1 ? metadata.durationMs : 0,
          }, providerConfig, { signal })
        } catch (error) {
          if (!texts.length || error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
          partial = true
          warnings.push(`第 ${index + 1}/${sttInputs.length} 段转写失败，已保留此前结果：${error?.message || '未知错误'}`)
          break
        }
        resultLanguage = result.language || resultLanguage
        resultModel = result.model || resultModel
        const itemSegments = this._segments.normalize(result.segments || [], { offsetMs: item.offsetMs, language: resultLanguage })
        const itemText = String(result.text || this._segments.transcript(itemSegments)).trim()
        if (itemText) texts.push(itemText)
        segments.push(...itemSegments)
        warnings.push(...(result.warnings || []))
        for (const [key, value] of Object.entries(result.usage || {})) {
          if (Number.isFinite(Number(value))) usage[key] = (Number(usage[key]) || 0) + Number(value)
        }
      }
      const text = texts.join('\n').trim() || this._segments.transcript(segments)
      if (!text) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, '语音转文字服务没有返回文本。', { stage: 'stt', provider: providerId })
      this._runs?.updateMediaRun?.(run.id, { providerUsage: usage, sttModelId: resultModel })
      return {
        language: resultLanguage,
        text,
        segments,
        srt: this._subtitles.toSrt(segments),
        vtt: this._subtitles.toVtt(segments),
        sourceType: `stt_${providerId}`,
        providerId,
        providerModel: resultModel,
        warnings: [...new Set(warnings)],
        partial,
      }
    } finally {
      if (temporaryAudioPath) await fs.promises.rm(temporaryAudioPath, { force: true }).catch(() => {})
    }
  }

  _remoteMetadata(source, location) {
    const mediaType = source.media_type || 'audio'
    return {
      mediaType,
      fileName: source.file_name || source.title || 'remote-media',
      mimeType: source.mime_type || '',
      sizeBytes: Number(location.file_size) || 0,
      durationMs: Number(source.duration_ms) || 0,
      width: Number(source.width) || 0,
      height: Number(source.height) || 0,
      hasAudio: true,
      hasVideo: mediaType === 'video',
      audioTracks: [],
      videoTracks: [],
      subtitleTracks: [],
      sourceType: 'public_media_url',
    }
  }

  _normalizedProviderResult(run, providerId, providerConfig, result = {}) {
    const language = result.language || run.config?.language || providerConfig.language || ''
    const segments = this._segments.normalize(result.segments || [], { language })
    const text = String(result.text || this._segments.transcript(segments)).trim()
    if (!text) throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_RESPONSE_INVALID, '语音转文字服务没有返回文本。', { stage: 'stt', provider: providerId })
    return {
      language,
      text,
      segments,
      srt: this._subtitles.toSrt(segments),
      vtt: this._subtitles.toVtt(segments),
      sourceType: `stt_${providerId}`,
      providerId,
      providerModel: result.model || providerConfig.model || providerConfig.backend || '',
      warnings: result.warnings || [],
      usage: result.usage || {},
      partial: result.partial === true,
    }
  }

  async _publishRemoteTranscript(run, metadata, normalized, { signal, onStage } = {}) {
    await this._stage(onStage, MEDIA_STAGES.NORMALIZE, 78, '正在整理远端转写结果')
    throwIfCancelled(signal)
    const segments = normalized.segments || []
    await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/transcript.json', {
      language: normalized.language || '',
      text: normalized.text,
      segmentCount: segments.length,
      sourceType: normalized.sourceType,
    })
    await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/segments.json', segments)
    await this._artifactService.writeTempText(run.media_id, run.id, 'analysis/subtitle.srt', normalized.srt)
    await this._artifactService.writeTempText(run.media_id, run.id, 'analysis/subtitle.vtt', normalized.vtt)
    const artifactStatus = normalized.partial ? 'partial' : 'ready'
    const artifacts = [
      { type: MEDIA_ARTIFACT_TYPES.METADATA, path: 'analysis/metadata.json', status: 'ready' },
      { type: MEDIA_ARTIFACT_TYPES.TRANSCRIPT, path: 'analysis/transcript.json', status: artifactStatus, variant: normalized.sourceType, providerId: normalized.providerId, providerModel: normalized.providerModel },
      { type: MEDIA_ARTIFACT_TYPES.SEGMENTS, path: 'analysis/segments.json', status: segments.length ? artifactStatus : 'unsupported', variant: normalized.sourceType, providerId: normalized.providerId, providerModel: normalized.providerModel },
    ]
    if (segments.length) {
      artifacts.push(
        { type: MEDIA_ARTIFACT_TYPES.SUBTITLE_SRT, path: 'analysis/subtitle.srt', status: artifactStatus, variant: normalized.sourceType, providerId: normalized.providerId, providerModel: normalized.providerModel },
        { type: MEDIA_ARTIFACT_TYPES.SUBTITLE_VTT, path: 'analysis/subtitle.vtt', status: artifactStatus, variant: normalized.sourceType, providerId: normalized.providerId, providerModel: normalized.providerModel },
      )
    }
    const warnings = [...new Set([
      ...(normalized.warnings || []),
      ...(run.config?.extractKeyframes ? [metadata.sourceType === 'bilibili'
        ? '已优先使用 B 站字幕，当前未下载原视频，因此未生成关键帧。'
        : '公网直链异步转写不会下载原视频，因此未生成关键帧。'] : []),
    ])]
    const timeline = this._timeline.build({ segments, chapters: [], frames: [] })
    await this._artifactService.writeTempJson(run.media_id, run.id, 'index/timeline_index.json', timeline)
    artifacts.push({ type: MEDIA_ARTIFACT_TYPES.TIMELINE_INDEX, path: 'index/timeline_index.json', status: 'ready' })
    const status = normalized.partial ? MEDIA_RUN_STATUSES.PARTIAL : MEDIA_RUN_STATUSES.READY
    await this._artifactService.writeTempJson(run.media_id, run.id, 'manifest.json', {
      schemaVersion: 1,
      mediaId: run.media_id,
      runId: run.id,
      sourceLocationId: run.source_location_id,
      status,
      contentAvailability: MEDIA_CONTENT_AVAILABILITIES.TRANSCRIPT_READY,
      subtitleSource: normalized.sourceType,
      artifacts: artifacts.map(item => ({ type: item.type, path: item.path, variant: item.variant || '' })),
      warnings,
    })
    await this._stage(onStage, MEDIA_STAGES.PUBLISH, 92, '正在发布远端转写结果')
    throwIfCancelled(signal)
    return this._artifactService.publishRun({
      mediaId: run.media_id,
      runId: run.id,
      status,
      contentAvailability: MEDIA_CONTENT_AVAILABILITIES.TRANSCRIPT_READY,
      artifacts,
      segments,
      chapters: [],
      frames: [],
      warnings,
    })
  }

  async _executeRemote(run, location, { signal, onStage } = {}) {
    const source = this._media.getMediaSource(run.media_id)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    await this._artifactService.prepareRun(run.media_id, run.id, { reset: true })
    const metadata = this._remoteMetadata(source, location)
    await this._stage(onStage, MEDIA_STAGES.PROBE, 12, '正在校验公网媒体直链')
    await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/metadata.json', metadata)
    const { providerId, providerConfig, provider } = this._speechProvider(run, 'public_url')
    await this._stage(onStage, MEDIA_STAGES.STT, 45, '正在提交云端语音转写任务')
    this._runs.updateMediaRun(run.id, {
      sttProviderId: providerId,
      sttModelId: providerConfig.model || providerConfig.backend || '',
      inputBytes: Number(location.file_size) || 0,
    })
    const result = await provider.transcribe({
      mode: 'public_url',
      url: location.locator,
      language: run.config?.language || providerConfig.language || '',
      sizeBytes: metadata.sizeBytes,
      durationMs: metadata.durationMs,
    }, providerConfig, {
      signal,
      deferAsync: true,
      onProviderJobSubmitted: async submitted => {
        const providerJobMeta = {
          sourceMode: 'public_url',
          language: run.config?.language || providerConfig.language || '',
          warnings: submitted.warnings || [],
        }
        this._runs.updateMediaRun(run.id, {
          status: MEDIA_RUN_STATUSES.RUNNING,
          stage: MEDIA_STAGES.WAITING_PROVIDER,
          progress: 64,
          message: '云端任务已提交，正在持久化任务标识。',
          providerJobId: submitted.providerJobId,
          providerJobStatus: submitted.providerJobStatus || 'PENDING',
          providerJobMeta,
          nextPollAt: new Date(Date.now() + 30000).toISOString(),
          heartbeatAt: new Date().toISOString(),
        })
      },
    })
    if (result.pending) {
      const waiting = {
        waitingProvider: true,
        providerId,
        providerModel: providerConfig.model || '',
        providerJobId: result.providerJobId,
        providerJobStatus: result.providerJobStatus || 'PENDING',
        providerJobMeta: {
          sourceMode: 'public_url',
          language: run.config?.language || providerConfig.language || '',
          warnings: result.warnings || [],
        },
        pollAfterMs: 30000,
      }
      this._runs.updateMediaRun(run.id, {
        status: MEDIA_RUN_STATUSES.RUNNING,
        stage: MEDIA_STAGES.WAITING_PROVIDER,
        progress: 64,
        message: '云端正在转写，稍后继续查询。',
        providerJobId: waiting.providerJobId,
        providerJobStatus: waiting.providerJobStatus,
        providerJobMeta: waiting.providerJobMeta,
        nextPollAt: new Date(Date.now() + waiting.pollAfterMs).toISOString(),
      })
      return waiting
    }
    const normalized = this._normalizedProviderResult(run, providerId, providerConfig, result)
    this._runs.updateMediaRun(run.id, { providerUsage: normalized.usage })
    return this._publishRemoteTranscript(run, metadata, normalized, { signal, onStage })
  }

  async resumeProvider(run, { signal, onStage } = {}) {
    throwIfCancelled(signal)
    const location = this._locations.getMediaLocation(run.source_location_id)
    if (!location || location.location_type !== 'public_media_url') throw new MediaError(MEDIA_ERROR_CODES.LOCATION_UNAVAILABLE, '等待中的云端任务缺少公网媒体位置。')
    const source = this._media.getMediaSource(run.media_id)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    const providerRun = { ...run, config: { ...(run.config || {}), providerId: run.stt_provider_id } }
    const { providerId, providerConfig, provider } = this._speechProvider(providerRun, 'public_url')
    if (typeof provider.resume !== 'function') throw new MediaError(MEDIA_ERROR_CODES.RUN_STATE_INVALID, '当前语音服务不支持恢复异步任务。', { provider: providerId, stage: 'waiting_provider' })
    const timeoutMinutes = Math.max(1, Number(providerConfig.timeoutMinutes) || 1440)
    const createdAt = new Date(run.created_at || 0).getTime()
    if (createdAt && Date.now() - createdAt > timeoutMinutes * 60 * 1000) {
      throw new MediaError(MEDIA_ERROR_CODES.PROVIDER_JOB_TIMEOUT, '云端语音转写任务等待超时。', { provider: providerId, stage: 'waiting_provider', retryable: false })
    }
    await this._stage(onStage, MEDIA_STAGES.WAITING_PROVIDER, 64, '正在查询云端转写任务')
    const result = await provider.resume({
      providerJobId: run.provider_job_id,
      providerJobStatus: run.provider_job_status,
      ...(run.provider_job_meta || {}),
    }, providerConfig, { signal })
    if (result.pending) {
      return {
        waitingProvider: true,
        providerId,
        providerModel: run.stt_model_id || providerConfig.model || '',
        providerJobId: run.provider_job_id,
        providerJobStatus: result.providerJobStatus || run.provider_job_status || 'RUNNING',
        providerJobMeta: run.provider_job_meta || {},
        pollAfterMs: result.retryAfterMs || 30000,
      }
    }
    const paths = this._artifactService.paths(run.media_id, run.id)
    if (fs.existsSync(paths.runDir)) await fs.promises.rm(paths.runDir, { recursive: true, force: true })
    await this._artifactService.prepareRun(run.media_id, run.id, { reset: false })
    const metadata = this._remoteMetadata(source, location)
    const metadataPath = path.join(paths.tempDir, 'analysis', 'metadata.json')
    if (!fs.existsSync(metadataPath)) await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/metadata.json', metadata)
    const normalized = this._normalizedProviderResult(run, providerId, providerConfig, result)
    this._runs.updateMediaRun(run.id, { providerUsage: normalized.usage, resultDownloadStatus: 'downloaded' })
    return this._publishRemoteTranscript(run, metadata, normalized, { signal, onStage })
  }

  async _executeAcquired(run, location, { signal, onStage } = {}) {
    if (!this._acquisition) throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '远程媒体获取服务尚未初始化。', { stage: 'download' })
    await this._artifactService.prepareRun(run.media_id, run.id, { reset: true })
    const acquisition = await this._acquisition.acquire(run, location, { signal, onStage })
    try {
      if (acquisition.kind === 'subtitle') {
        const metadata = acquisition.metadata || this._remoteMetadata(this._media.getMediaSource(run.media_id), location)
        if (acquisition.visualPath) {
          return await this._executeLocalPath(run, location, acquisition.visualPath, {
            signal,
            onStage,
            prepareRun: false,
            sourceMetadata: metadata,
            preserveSourceMediaType: true,
            providedSubtitle: acquisition.normalizedSubtitle,
            visualPath: acquisition.visualPath,
            probeMediaType: 'video',
            transcriptionPath: '',
            extraWarnings: acquisition.warnings || [],
          })
        }
        this._media.updateMediaSource(run.media_id, {
          durationMs: metadata.durationMs || 0,
          width: metadata.width || 0,
          height: metadata.height || 0,
        })
        await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/metadata.json', metadata)
        return this._publishRemoteTranscript(run, metadata, {
          ...acquisition.normalizedSubtitle,
          warnings: [...new Set([...(acquisition.normalizedSubtitle?.warnings || []), ...(acquisition.warnings || [])])],
        }, { signal, onStage })
      }
      if (acquisition.kind !== 'local_file' || !acquisition.localPath) {
        throw new MediaError(MEDIA_ERROR_CODES.DOWNLOAD_FAILED, '远程媒体获取结果无效。', { stage: 'download' })
      }
      return await this._executeLocalPath(run, location, acquisition.localPath, {
        signal,
        onStage,
        prepareRun: false,
        sourceMetadata: acquisition.metadata || null,
        preserveSourceMediaType: acquisition.preserveSourceMediaType === true,
        visualPath: acquisition.visualPath || '',
        probeMediaType: acquisition.inputMediaType || 'audio',
        transcriptionPath: acquisition.localPath,
        extraWarnings: acquisition.warnings || [],
      })
    } finally {
      await this._acquisition.cleanup(acquisition)
    }
  }

  async _executeLocalPath(run, location, inputPath, {
    signal,
    onStage,
    prepareRun = true,
    sourceMetadata = null,
    preserveSourceMediaType = false,
    providedSubtitle = null,
    visualPath = '',
    probeMediaType = '',
    transcriptionPath = inputPath,
    extraWarnings = [],
  } = {}) {
    if (prepareRun) await this._artifactService.prepareRun(run.media_id, run.id, { reset: true })

    await this._stage(onStage, MEDIA_STAGES.PROBE, 10, '正在读取媒体信息')
    const probePath = visualPath || inputPath
    let probedMetadata
    let probeWarning = ''
    try {
      probedMetadata = await this._probe.probe(probePath, { signal, fileName: path.basename(probePath) })
    } catch (error) {
      if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      if (error?.code !== MEDIA_ERROR_CODES.FFPROBE_UNAVAILABLE) throw error
      const storedSource = this._media.getMediaSource(run.media_id)
      const extension = path.extname(probePath).toLowerCase()
      const videoExtensions = new Set(['.mp4', '.mov', '.mkv', '.m4v', '.avi'])
      const inferredMediaType = probeMediaType || storedSource?.media_type || (videoExtensions.has(extension) ? 'video' : 'audio')
      const stat = await fs.promises.stat(probePath)
      probedMetadata = {
        mediaType: inferredMediaType,
        fileName: path.basename(probePath),
        mimeType: sourceMetadata?.mimeType || storedSource?.mime_type || '',
        formatName: '',
        formatLongName: '',
        durationMs: sourceMetadata?.durationMs || Number(storedSource?.duration_ms) || 0,
        sizeBytes: stat.size,
        bitRate: 0,
        width: sourceMetadata?.width || Number(storedSource?.width) || 0,
        height: sourceMetadata?.height || Number(storedSource?.height) || 0,
        hasAudio: inferredMediaType === 'audio' || sourceMetadata?.hasAudio !== false,
        hasVideo: inferredMediaType === 'video',
        hasAttachedPicture: false,
        audioTracks: [],
        subtitleTracks: [],
        rawTags: {},
        primaryAudioStreamIndex: null,
        primaryVideoStreamIndex: null,
        sourceType: 'metadata_fallback',
      }
      probeWarning = '当前设备未安装 ffprobe，已根据文件与来源信息继续解析；内嵌字幕和精确媒体参数可能不可用。'
    }
    const metadata = sourceMetadata ? {
      ...probedMetadata,
      mediaType: sourceMetadata.mediaType || probedMetadata.mediaType,
      fileName: sourceMetadata.fileName || probedMetadata.fileName,
      mimeType: sourceMetadata.mimeType || probedMetadata.mimeType,
      durationMs: sourceMetadata.durationMs || probedMetadata.durationMs,
      width: probedMetadata.width || sourceMetadata.width || 0,
      height: probedMetadata.height || sourceMetadata.height || 0,
      hasAudio: sourceMetadata.hasAudio ?? probedMetadata.hasAudio,
      hasVideo: sourceMetadata.hasVideo ?? probedMetadata.hasVideo,
      remoteSource: sourceMetadata,
      sourceType: sourceMetadata.sourceType || probedMetadata.sourceType,
    } : probedMetadata
    throwIfCancelled(signal)
    const sourcePatch = {
      fileSize: metadata.sizeBytes || location.file_size,
      durationMs: sourceMetadata?.durationMs || metadata.durationMs,
      width: sourceMetadata?.width || metadata.width,
      height: sourceMetadata?.height || metadata.height,
    }
    if (!preserveSourceMediaType) {
      sourcePatch.mediaType = metadata.mediaType
      sourcePatch.fileName = metadata.fileName
    }
    this._media.updateMediaSource(run.media_id, sourcePatch)
    await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/metadata.json', metadata)

    await this._stage(onStage, MEDIA_STAGES.SUBTITLE, 35, '正在检查字幕')
    let normalizedSubtitle = providedSubtitle
    let subtitleSource = providedSubtitle?.sourceType || (providedSubtitle ? 'platform_subtitle' : '')
    const sidecarPath = normalizedSubtitle || run.config?.preferSubtitle === false ? '' : this._resolveSidecar(inputPath, run.config)
    if (!normalizedSubtitle && sidecarPath) {
      normalizedSubtitle = await this._subtitles.fromFile(sidecarPath, {
        language: run.config?.language || '',
      })
      subtitleSource = 'sidecar_subtitle'
    } else if (!normalizedSubtitle && run.config?.preferSubtitle !== false && metadata.subtitleTracks.length) {
      const requestedTrack = Number.isFinite(Number(run.config?.subtitleTrackIndex))
        ? Number(run.config.subtitleTrackIndex)
        : null
      const subtitleTrack = requestedTrack === null
        ? (metadata.subtitleTracks.find(track => track.default) || metadata.subtitleTracks[0])
        : (metadata.subtitleTracks.find(track => track.subtitleIndex === requestedTrack || track.streamIndex === requestedTrack)
          || metadata.subtitleTracks[0])
      const paths = this._artifactService.paths(run.media_id, run.id)
      const extractedPath = path.join(paths.tempDir, 'analysis', 'source_subtitle.srt')
      await this._ffmpeg.extractSubtitle(inputPath, {
        subtitleIndex: subtitleTrack.subtitleIndex,
        format: 'srt',
        outputPath: extractedPath,
        signal,
      })
      normalizedSubtitle = await this._subtitles.fromFile(extractedPath, {
        format: 'srt',
        language: subtitleTrack.language || run.config?.language || '',
      })
      subtitleSource = 'embedded_subtitle'
    }
    throwIfCancelled(signal)

    let sttWarning = ''
    if (!normalizedSubtitle && metadata.hasAudio && transcriptionPath) {
      try {
        normalizedSubtitle = await this._transcribe(run, transcriptionPath, metadata, { signal, onStage })
        subtitleSource = normalizedSubtitle.sourceType
      } catch (error) {
        if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
        sttWarning = error?.message || '语音转文字失败。'
        if (/-audio-original\./i.test(path.basename(transcriptionPath)) && !/FFmpeg/i.test(sttWarning)) {
          sttWarning += ' 当前正在直接上传 B 站原始音轨；如果服务商不兼容，请在“设置 > 环境管理”安装或修复 FFmpeg 后重试。'
        }
      }
    }

    await this._stage(onStage, MEDIA_STAGES.NORMALIZE, 65, '正在整理时间轴')
    const segments = normalizedSubtitle?.segments || []
    let frames = []
    let keyframeWarning = ''
    const frameInputPath = visualPath || (probedMetadata.hasVideo ? inputPath : '')
    if (run.config?.extractKeyframes && metadata.mediaType === 'video' && frameInputPath) {
      try {
        await this._stage(onStage, MEDIA_STAGES.FRAMES, 74, '正在抽取视频关键帧')
        frames = await this._keyframes.extract({
          mediaId: run.media_id,
          runId: run.id,
          inputPath: frameInputPath,
          durationMs: metadata.durationMs,
          limit: run.config?.keyframeLimit || 12,
          segments,
          signal,
        })
        await this._artifactService.writeTempJson(run.media_id, run.id, 'frames/frames.json', frames)
      } catch (error) {
        if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
        keyframeWarning = error?.message || '视频关键帧抽取失败。'
        const paths = this._artifactService.paths(run.media_id, run.id)
        await fs.promises.rm(path.join(paths.tempDir, 'frames'), { recursive: true, force: true }).catch(() => {})
      }
    }
    const timeline = this._timeline.build({ segments, chapters: [], frames })
    const artifactDefinitions = [
      { type: MEDIA_ARTIFACT_TYPES.METADATA, path: 'analysis/metadata.json', status: 'ready' },
    ]
    let status = MEDIA_RUN_STATUSES.PARTIAL
    let contentAvailability = metadata.mediaType === 'video' && !metadata.hasAudio
      ? MEDIA_CONTENT_AVAILABILITIES.VISUAL_ONLY
      : MEDIA_CONTENT_AVAILABILITIES.METADATA_ONLY
    const warnings = [...extraWarnings]
    if (probeWarning) warnings.push(probeWarning)
    if (keyframeWarning) warnings.push(keyframeWarning)

    if (normalizedSubtitle) {
      await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/transcript.json', {
        language: normalizedSubtitle.language || '',
        text: normalizedSubtitle.text,
        segmentCount: segments.length,
        sourceType: subtitleSource,
      })
      await this._artifactService.writeTempJson(run.media_id, run.id, 'analysis/segments.json', segments)
      await this._artifactService.writeTempText(run.media_id, run.id, 'analysis/subtitle.srt', normalizedSubtitle.srt)
      await this._artifactService.writeTempText(run.media_id, run.id, 'analysis/subtitle.vtt', normalizedSubtitle.vtt)
      artifactDefinitions.push(
        { type: MEDIA_ARTIFACT_TYPES.TRANSCRIPT, path: 'analysis/transcript.json', status: normalizedSubtitle.partial ? 'partial' : 'ready', variant: subtitleSource, providerId: normalizedSubtitle.providerId || '', providerModel: normalizedSubtitle.providerModel || '' },
        { type: MEDIA_ARTIFACT_TYPES.SEGMENTS, path: 'analysis/segments.json', status: segments.length ? (normalizedSubtitle.partial ? 'partial' : 'ready') : 'unsupported', variant: subtitleSource, providerId: normalizedSubtitle.providerId || '', providerModel: normalizedSubtitle.providerModel || '' },
      )
      if (segments.length) {
        artifactDefinitions.push(
          { type: MEDIA_ARTIFACT_TYPES.SUBTITLE_SRT, path: 'analysis/subtitle.srt', status: 'ready', variant: subtitleSource, providerId: normalizedSubtitle.providerId || '', providerModel: normalizedSubtitle.providerModel || '' },
          { type: MEDIA_ARTIFACT_TYPES.SUBTITLE_VTT, path: 'analysis/subtitle.vtt', status: 'ready', variant: subtitleSource, providerId: normalizedSubtitle.providerId || '', providerModel: normalizedSubtitle.providerModel || '' },
        )
      }
      warnings.push(...(normalizedSubtitle.warnings || []))
      status = normalizedSubtitle.partial ? MEDIA_RUN_STATUSES.PARTIAL : MEDIA_RUN_STATUSES.READY
      contentAvailability = MEDIA_CONTENT_AVAILABILITIES.TRANSCRIPT_READY
    } else if (metadata.hasAudio) {
      warnings.push(sttWarning || '当前媒体没有可用字幕，且尚未配置语音转文字服务。')
    } else {
      warnings.push('该视频没有音轨，当前版本仅保留媒体信息。')
    }

    if (frames.length) {
      artifactDefinitions.push({ type: MEDIA_ARTIFACT_TYPES.KEYFRAMES, path: 'frames/frames.json', status: 'ready' })
      if (!normalizedSubtitle) contentAvailability = MEDIA_CONTENT_AVAILABILITIES.VISUAL_ONLY
    }

    await this._artifactService.writeTempJson(run.media_id, run.id, 'index/timeline_index.json', timeline)
    artifactDefinitions.push({ type: MEDIA_ARTIFACT_TYPES.TIMELINE_INDEX, path: 'index/timeline_index.json', status: 'ready' })
    await this._artifactService.writeTempJson(run.media_id, run.id, 'manifest.json', {
      schemaVersion: 1,
      mediaId: run.media_id,
      runId: run.id,
      sourceLocationId: run.source_location_id,
      status,
      contentAvailability,
      subtitleSource,
      artifacts: artifactDefinitions.map(item => ({ type: item.type, path: item.path, variant: item.variant || '' })),
      warnings,
    })

    await this._stage(onStage, MEDIA_STAGES.PUBLISH, 90, '正在发布解析结果')
    throwIfCancelled(signal)
    return this._artifactService.publishRun({
      mediaId: run.media_id,
      runId: run.id,
      status,
      contentAvailability,
      artifacts: artifactDefinitions,
      segments,
      chapters: [],
      frames,
      warnings: [...new Set(warnings)],
    })
  }

  async execute(run, { signal, onStage } = {}) {
    throwIfCancelled(signal)
    const location = this._locations.getMediaLocation(run.source_location_id)
    if (!location || !['available', 'trashed'].includes(location.availability)) {
      throw new MediaError(MEDIA_ERROR_CODES.LOCATION_UNAVAILABLE, '解析任务绑定的媒体位置不可用。')
    }
    if (location.location_type === 'platform_page') return this._executeAcquired(run, location, { signal, onStage })
    if (location.location_type === 'public_media_url') {
      return this._remoteInputMode(run) === 'public_url'
        ? this._executeRemote(run, location, { signal, onStage })
        : this._executeAcquired(run, location, { signal, onStage })
    }
    return this._executeLocalPath(run, location, location.locator, { signal, onStage })
  }
}
