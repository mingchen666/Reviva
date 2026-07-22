import { dynamicUpdate } from '../../db/helpers.js'
import { BaseRepository } from '../../db/repositories/BaseRepository.js'
import { MEDIA_RUN_STATUSES, MEDIA_STAGES, makeMediaId } from '../core/MediaTypes.js'
import {
  asBoolean,
  assertEnum,
  normalizeProgress,
  nowIso,
  parseJsonOr,
  stringifyJSON,
} from './MediaRepositoryUtils.js'

const RUN_JSON_FIELDS = [
  'config_json',
  'required_artifacts_json',
  'optional_artifacts_json',
  'provider_job_meta_json',
  'warnings_json',
  'provider_usage_json',
]

export class MediaRunRepository extends BaseRepository {
  _parseRun(row) {
    if (!row) return null
    return {
      ...row,
      config: parseJsonOr(row.config_json, {}),
      required_artifacts: parseJsonOr(row.required_artifacts_json, []),
      optional_artifacts: parseJsonOr(row.optional_artifacts_json, []),
      provider_job_meta: parseJsonOr(row.provider_job_meta_json, {}),
      warnings: parseJsonOr(row.warnings_json, []),
      provider_usage: parseJsonOr(row.provider_usage_json, {}),
      cancel_requested: asBoolean(row.cancel_requested),
    }
  }

  createMediaRun(data = {}) {
    const mediaId = String(data.media_id || data.mediaId || '')
    const status = assertEnum(data.status || MEDIA_RUN_STATUSES.QUEUED, MEDIA_RUN_STATUSES, 'media run status')
    const stage = assertEnum(data.stage || '', MEDIA_STAGES, 'media stage', { allowEmpty: true })
    if (!mediaId) throw new Error('Media run media ID is required')
    const id = data.id || makeMediaId('run')
    const createdAt = nowIso(data.created_at || data.createdAt)
    this.db.prepare(`INSERT INTO media_analysis_runs (
      id, media_id, source_location_id, preset_id, pipeline_version, model_catalog_version,
      config_json, config_hash, required_artifacts_json, optional_artifacts_json,
      stt_provider_id, stt_model_id, provider_job_id, provider_job_status,
      provider_job_meta_json, provider_cancel_status, result_download_status, next_poll_at,
      retry_count, last_retry_at, last_error_code, retry_of_run_id, status, stage,
      progress, message, error_code, error_message, cancel_requested, abandoned_at,
      warnings_json, input_duration_ms, processed_duration_ms, input_bytes, output_bytes,
      elapsed_ms, provider_usage_json, estimated_cost, heartbeat_at, started_at,
      finished_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, mediaId, data.source_location_id || data.sourceLocationId || null,
      data.preset_id || data.presetId || '', Number(data.pipeline_version ?? data.pipelineVersion) || 1,
      Number(data.model_catalog_version ?? data.modelCatalogVersion) || 1,
      stringifyJSON(data.config || data.config_json || {}), data.config_hash || data.configHash || '',
      stringifyJSON(data.required_artifacts || data.requiredArtifacts || data.required_artifacts_json || []),
      stringifyJSON(data.optional_artifacts || data.optionalArtifacts || data.optional_artifacts_json || []),
      data.stt_provider_id || data.sttProviderId || '', data.stt_model_id || data.sttModelId || '',
      data.provider_job_id || data.providerJobId || '', data.provider_job_status || data.providerJobStatus || '',
      stringifyJSON(data.provider_job_meta || data.providerJobMeta || data.provider_job_meta_json || {}),
      data.provider_cancel_status || data.providerCancelStatus || '',
      data.result_download_status || data.resultDownloadStatus || '',
      data.next_poll_at || data.nextPollAt || '', Number(data.retry_count ?? data.retryCount) || 0,
      data.last_retry_at || data.lastRetryAt || '', data.last_error_code || data.lastErrorCode || '',
      data.retry_of_run_id || data.retryOfRunId || '', status, stage, normalizeProgress(data.progress),
      data.message || '', data.error_code || data.errorCode || '', data.error_message || data.errorMessage || '',
      data.cancel_requested || data.cancelRequested ? 1 : 0, data.abandoned_at || data.abandonedAt || '',
      stringifyJSON(data.warnings || data.warnings_json || []),
      Number(data.input_duration_ms ?? data.inputDurationMs) || 0,
      Number(data.processed_duration_ms ?? data.processedDurationMs) || 0,
      Number(data.input_bytes ?? data.inputBytes) || 0, Number(data.output_bytes ?? data.outputBytes) || 0,
      Number(data.elapsed_ms ?? data.elapsedMs) || 0,
      stringifyJSON(data.provider_usage || data.providerUsage || data.provider_usage_json || {}),
      data.estimated_cost ?? data.estimatedCost ?? null,
      data.heartbeat_at || data.heartbeatAt || '', data.started_at || data.startedAt || '',
      data.finished_at || data.finishedAt || '', createdAt, data.updated_at || data.updatedAt || createdAt,
    )
    return this.getMediaRun(id)
  }

  getMediaRun(id) {
    return this._parseRun(this.db.prepare('SELECT * FROM media_analysis_runs WHERE id = ?').get(id))
  }

  listMediaRuns(mediaId, { limit = 50 } = {}) {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)))
    return this.db.prepare(`SELECT * FROM media_analysis_runs WHERE media_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`).all(mediaId, normalizedLimit).map(row => this._parseRun(row))
  }

  listQueuedMediaRuns(limit = 20) {
    const normalizedLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)))
    return this.db.prepare(`SELECT * FROM media_analysis_runs WHERE status = 'queued'
      ORDER BY created_at ASC, id ASC LIMIT ?`).all(normalizedLimit).map(row => this._parseRun(row))
  }

  listActiveMediaRuns(limit = 100) {
    const normalizedLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)))
    return this.db.prepare(`SELECT * FROM media_analysis_runs WHERE status IN ('queued', 'running')
      ORDER BY created_at ASC, id ASC LIMIT ?`).all(normalizedLimit).map(row => this._parseRun(row))
  }

  listActiveMediaRunsForMedia(mediaId) {
    return this.db.prepare(`SELECT * FROM media_analysis_runs
      WHERE media_id = ? AND status IN ('queued', 'running')
      ORDER BY created_at ASC, id ASC`).all(mediaId).map(row => this._parseRun(row))
  }

  listWaitingProviderRuns(now = new Date().toISOString(), limit = 50) {
    const normalizedLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 50)))
    return this.db.prepare(`SELECT * FROM media_analysis_runs
      WHERE status = 'running' AND stage = 'waiting_provider' AND next_poll_at != '' AND next_poll_at <= ?
      ORDER BY next_poll_at ASC LIMIT ?`).all(now, normalizedLimit).map(row => this._parseRun(row))
  }

  getNextWaitingProviderRun() {
    return this._parseRun(this.db.prepare(`SELECT * FROM media_analysis_runs
      WHERE status = 'running' AND stage = 'waiting_provider' AND next_poll_at != ''
      ORDER BY next_poll_at ASC LIMIT 1`).get())
  }

  updateMediaRun(id, patch = {}) {
    const payload = { ...patch }
    const aliases = {
      mediaId: 'media_id', sourceLocationId: 'source_location_id', presetId: 'preset_id',
      pipelineVersion: 'pipeline_version', modelCatalogVersion: 'model_catalog_version',
      configHash: 'config_hash', sttProviderId: 'stt_provider_id', sttModelId: 'stt_model_id',
      providerJobId: 'provider_job_id', providerJobStatus: 'provider_job_status',
      providerCancelStatus: 'provider_cancel_status', resultDownloadStatus: 'result_download_status',
      nextPollAt: 'next_poll_at', retryCount: 'retry_count', lastRetryAt: 'last_retry_at',
      lastErrorCode: 'last_error_code', retryOfRunId: 'retry_of_run_id', errorCode: 'error_code',
      errorMessage: 'error_message', cancelRequested: 'cancel_requested', abandonedAt: 'abandoned_at',
      inputDurationMs: 'input_duration_ms', processedDurationMs: 'processed_duration_ms',
      inputBytes: 'input_bytes', outputBytes: 'output_bytes', elapsedMs: 'elapsed_ms',
      estimatedCost: 'estimated_cost', heartbeatAt: 'heartbeat_at', startedAt: 'started_at', finishedAt: 'finished_at',
    }
    for (const [alias, field] of Object.entries(aliases)) {
      if (payload[alias] !== undefined && payload[field] === undefined) payload[field] = payload[alias]
      delete payload[alias]
    }
    const jsonAliases = {
      config: 'config_json', requiredArtifacts: 'required_artifacts_json', optionalArtifacts: 'optional_artifacts_json',
      providerJobMeta: 'provider_job_meta_json', warnings: 'warnings_json', providerUsage: 'provider_usage_json',
    }
    for (const [alias, field] of Object.entries(jsonAliases)) {
      if (payload[alias] !== undefined && payload[field] === undefined) payload[field] = payload[alias]
      delete payload[alias]
    }
    if (payload.status !== undefined) assertEnum(payload.status, MEDIA_RUN_STATUSES, 'media run status')
    if (payload.stage !== undefined) assertEnum(payload.stage, MEDIA_STAGES, 'media stage', { allowEmpty: true })
    if (payload.progress !== undefined) payload.progress = normalizeProgress(payload.progress)
    dynamicUpdate(this.db, 'media_analysis_runs', id, payload, RUN_JSON_FIELDS, ['cancel_requested'])
    return this.getMediaRun(id)
  }

  listRetainedMediaRuns(mediaId) {
    const source = this.db.prepare('SELECT current_run_id FROM media_sources WHERE id = ?').get(mediaId)
    const currentId = source?.current_run_id || ''
    const rows = []
    if (currentId) {
      const current = this.getMediaRun(currentId)
      if (current) rows.push(current)
    }
    const historical = this.db.prepare(`SELECT * FROM media_analysis_runs
      WHERE media_id = ? AND id != ? AND status IN ('ready', 'partial')
      ORDER BY finished_at DESC, updated_at DESC, created_at DESC LIMIT 1`).get(mediaId, currentId)
    if (historical) rows.push(this._parseRun(historical))
    return rows
  }

  deleteMediaRun(id, { allowCurrent = false } = {}) {
    const run = this.getMediaRun(id)
    if (!run) return { success: true, changes: 0 }
    const source = this.db.prepare('SELECT current_run_id FROM media_sources WHERE id = ?').get(run.media_id)
    if (source?.current_run_id === id && !allowCurrent) throw new Error('Cannot delete the current media run before switching versions')
    const remove = this.db.transaction(() => {
      if (source?.current_run_id === id) {
        this.db.prepare(`UPDATE media_sources SET current_run_id = '', content_availability = 'none',
          updated_at = datetime('now') WHERE id = ?`).run(run.media_id)
      }
      return this.db.prepare('DELETE FROM media_analysis_runs WHERE id = ?').run(id)
    })
    const result = remove()
    return { success: true, changes: result.changes }
  }
}
