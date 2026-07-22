import crypto from 'node:crypto'
import { stableStringify } from '../../db/helpers.js'
import { MEDIA_ERROR_CODES, MediaError } from './MediaErrors.js'
import { MEDIA_ARTIFACT_TYPES, MEDIA_RUN_STATUSES } from './MediaTypes.js'

function configHash(config) {
  return crypto.createHash('sha256').update(stableStringify(config || {})).digest('hex')
}

export class MediaIngestionService {
  constructor({ sourceService, mediaRepository, locationRepository, runRepository, jobRunner } = {}) {
    this._sources = sourceService
    this._media = mediaRepository
    this._locations = locationRepository
    this._runs = runRepository
    this._runner = jobRunner
  }

  registerSource(input = {}) {
    return this._sources.registerSource(input)
  }

  createRun(mediaId, options = {}) {
    const source = this._media.getMediaSource(mediaId)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    const availableLocations = this._locations.listMediaLocations(mediaId)
      .filter(location => location.availability === 'available' || location.availability === 'trashed')
    const location = options.locationId
      ? availableLocations.find(item => item.id === options.locationId)
      : availableLocations[0]
    if (!location) throw new MediaError(MEDIA_ERROR_CODES.LOCATION_UNAVAILABLE, '媒体没有可用于解析的位置。')

    const presetId = options.presetId || 'subtitle_first'
    const providerId = String(options.providerId || 'auto').trim() || 'auto'
    const config = {
      language: options.language || '',
      sidecarPath: options.sidecarPath || '',
      sidecarCandidates: options.sidecarCandidates || [],
      subtitleTrackIndex: Number.isFinite(Number(options.subtitleTrackIndex)) ? Number(options.subtitleTrackIndex) : null,
      providerId,
      preferSubtitle: options.preferSubtitle !== false,
      extractKeyframes: options.extractKeyframes === true || presetId === 'keyframe_enhanced',
      keyframeLimit: Math.min(60, Math.max(1, Math.trunc(Number(options.keyframeLimit) || 12))),
      localOnly: presetId === 'local_private',
      remoteDownloadMaxMb: Math.min(20480, Math.max(1, Math.trunc(Number(options.remoteDownloadMaxMb) || 2048))),
      bilibiliYtDlpFallback: options.bilibiliYtDlpFallback !== false,
    }
    const hash = configHash(config)
    const duplicate = this._runs.listActiveMediaRuns().find(run => (
      run.media_id === mediaId && run.source_location_id === location.id && run.config_hash === hash
    ))
    if (duplicate) return duplicate

    const run = this._runs.createMediaRun({
      mediaId,
      sourceLocationId: location.id,
      presetId,
      config,
      configHash: hash,
      requiredArtifacts: [MEDIA_ARTIFACT_TYPES.METADATA, MEDIA_ARTIFACT_TYPES.TRANSCRIPT, MEDIA_ARTIFACT_TYPES.SEGMENTS],
      optionalArtifacts: [MEDIA_ARTIFACT_TYPES.SUBTITLE_SRT, MEDIA_ARTIFACT_TYPES.SUBTITLE_VTT, MEDIA_ARTIFACT_TYPES.KEYFRAMES, MEDIA_ARTIFACT_TYPES.TIMELINE_INDEX],
      sttProviderId: providerId !== 'auto' ? providerId : '',
      status: MEDIA_RUN_STATUSES.QUEUED,
    })
    this._runner?.wake?.()
    return run
  }

  async registerAndAnalyze(sourceInput = {}, options = {}) {
    const registration = await this.registerSource(sourceInput)
    const run = this.createRun(registration.source.id, {
      ...options,
      locationId: registration.location.id,
      sidecarCandidates: registration.sidecarCandidates,
    })
    return { ...registration, run }
  }

  reanalyze(mediaId, options = {}) {
    return this.createRun(mediaId, options)
  }

  cancelRun(runId) {
    return this._runner.requestCancel(runId)
  }

  getRunStatus(runId) {
    return this._runs.getMediaRun(runId)
  }
}

export { configHash }
