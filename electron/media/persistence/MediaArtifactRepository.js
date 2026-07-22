import { BaseRepository } from '../../db/repositories/BaseRepository.js'
import {
  MEDIA_ARTIFACT_STATUSES,
  MEDIA_ARTIFACT_TYPES,
  MEDIA_CONTENT_AVAILABILITIES,
  MEDIA_RUN_STATUSES,
  MEDIA_STAGES,
  makeMediaId,
} from '../core/MediaTypes.js'
import { assertEnum, nowIso, parseJsonOr, stringifyJSON } from './MediaRepositoryUtils.js'

export class MediaArtifactRepository extends BaseRepository {
  _parseArtifact(row) {
    return row ? {
      ...row,
      provider_meta: parseJsonOr(row.provider_meta_json, {}),
      depends_on: parseJsonOr(row.depends_on, []),
    } : null
  }

  _parseChapter(row) {
    return row ? { ...row, keywords: parseJsonOr(row.keywords_json, []) } : null
  }

  _parseFrame(row) {
    return row ? { ...row, linked_segment_ids: parseJsonOr(row.linked_segment_ids, []) } : null
  }

  getMediaArtifact(id) {
    return this._parseArtifact(this.db.prepare('SELECT * FROM media_artifacts WHERE id = ?').get(id))
  }

  getMediaFrameForMedia(mediaId, frameId) {
    return this._parseFrame(this.db.prepare(`SELECT f.* FROM media_frames f
      INNER JOIN media_analysis_runs r ON r.id = f.run_id
      WHERE f.id = ? AND r.media_id = ? LIMIT 1`).get(frameId, mediaId))
  }

  listMediaArtifacts(runId) {
    return this.db.prepare(`SELECT * FROM media_artifacts WHERE run_id = ?
      ORDER BY type ASC, variant ASC`).all(runId).map(row => this._parseArtifact(row))
  }

  listMediaSegments(runId, { startMs, endMs, limit = 500, offset = 0 } = {}) {
    const clauses = ['run_id = ?']
    const params = [runId]
    if (Number.isFinite(Number(startMs))) { clauses.push('end_ms >= ?'); params.push(Number(startMs)) }
    if (Number.isFinite(Number(endMs))) { clauses.push('start_ms <= ?'); params.push(Number(endMs)) }
    const normalizedLimit = Math.min(2000, Math.max(1, Math.trunc(Number(limit) || 500)))
    const normalizedOffset = Math.max(0, Math.trunc(Number(offset) || 0))
    return this.db.prepare(`SELECT * FROM media_segments WHERE ${clauses.join(' AND ')}
      ORDER BY start_ms ASC, id ASC LIMIT ? OFFSET ?`).all(...params, normalizedLimit, normalizedOffset)
  }

  listMediaChapters(runId) {
    return this.db.prepare(`SELECT * FROM media_chapters WHERE run_id = ?
      ORDER BY start_ms ASC, id ASC`).all(runId).map(row => this._parseChapter(row))
  }

  listMediaFrames(runId, { startMs, endMs, limit = 200, offset = 0 } = {}) {
    const clauses = ['run_id = ?']
    const params = [runId]
    if (Number.isFinite(Number(startMs))) { clauses.push('timestamp_ms >= ?'); params.push(Number(startMs)) }
    if (Number.isFinite(Number(endMs))) { clauses.push('timestamp_ms <= ?'); params.push(Number(endMs)) }
    const normalizedLimit = Math.min(1000, Math.max(1, Math.trunc(Number(limit) || 200)))
    const normalizedOffset = Math.max(0, Math.trunc(Number(offset) || 0))
    return this.db.prepare(`SELECT * FROM media_frames WHERE ${clauses.join(' AND ')}
      ORDER BY timestamp_ms ASC, id ASC LIMIT ? OFFSET ?`).all(...params, normalizedLimit, normalizedOffset)
      .map(row => this._parseFrame(row))
  }

  restorePublishedRun({ mediaId, runId, contentAvailability, restoredAt = new Date().toISOString() } = {}) {
    assertEnum(contentAvailability, MEDIA_CONTENT_AVAILABILITIES, 'content availability')
    const restore = this.db.transaction(() => {
      const run = this.db.prepare(`SELECT * FROM media_analysis_runs
        WHERE id = ? AND media_id = ? AND status IN ('ready', 'partial')`).get(runId, mediaId)
      if (!run) throw new Error('Media run is not restorable')
      const source = this.db.prepare('SELECT id FROM media_sources WHERE id = ?').get(mediaId)
      if (!source) throw new Error('Media source does not exist')
      this.db.prepare(`UPDATE media_sources SET current_run_id = ?, content_availability = ?,
        updated_at = ? WHERE id = ?`).run(runId, contentAvailability, restoredAt, mediaId)
    })
    restore()
    return {
      source: this.db.prepare('SELECT * FROM media_sources WHERE id = ?').get(mediaId),
      run: this.db.prepare('SELECT * FROM media_analysis_runs WHERE id = ?').get(runId),
      artifacts: this.listMediaArtifacts(runId),
    }
  }

  publishMediaRun({
    mediaId,
    runId,
    status = MEDIA_RUN_STATUSES.READY,
    contentAvailability = MEDIA_CONTENT_AVAILABILITIES.TRANSCRIPT_READY,
    artifacts = [],
    segments = [],
    chapters = [],
    frames = [],
    warnings = [],
    finishedAt = new Date().toISOString(),
  } = {}) {
    assertEnum(status, MEDIA_RUN_STATUSES, 'media run status')
    assertEnum(contentAvailability, MEDIA_CONTENT_AVAILABILITIES, 'content availability')
    if (![MEDIA_RUN_STATUSES.READY, MEDIA_RUN_STATUSES.PARTIAL].includes(status)) {
      throw new Error('Only ready or partial media runs can be published')
    }
    const run = this.db.prepare('SELECT id, media_id FROM media_analysis_runs WHERE id = ?').get(runId)
    if (!run || run.media_id !== mediaId) throw new Error('Media run does not belong to the requested media source')

    const insertArtifact = this.db.prepare(`INSERT INTO media_artifacts (
      id, run_id, type, variant, status, relative_path, mime_type, size_bytes,
      content_hash, provider_id, provider_model, provider_meta_json, schema_version,
      depends_on, error_code, error_message, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertSegment = this.db.prepare(`INSERT INTO media_segments (
      id, run_id, chapter_id, start_ms, end_ms, text, language, speaker, confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertChapter = this.db.prepare(`INSERT INTO media_chapters (
      id, run_id, start_ms, end_ms, title, summary, keywords_json, source_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertFrame = this.db.prepare(`INSERT INTO media_frames (
      id, run_id, timestamp_ms, image_path, thumbnail_path, linked_segment_ids
    ) VALUES (?, ?, ?, ?, ?, ?)`)

    const publish = this.db.transaction(() => {
      this.db.prepare('DELETE FROM media_artifacts WHERE run_id = ?').run(runId)
      this.db.prepare('DELETE FROM media_segments WHERE run_id = ?').run(runId)
      this.db.prepare('DELETE FROM media_chapters WHERE run_id = ?').run(runId)
      this.db.prepare('DELETE FROM media_frames WHERE run_id = ?').run(runId)

      for (const item of artifacts) {
        const artifactStatus = assertEnum(item.status || MEDIA_ARTIFACT_STATUSES.READY, MEDIA_ARTIFACT_STATUSES, 'media artifact status')
        const artifactType = assertEnum(item.type, MEDIA_ARTIFACT_TYPES, 'media artifact type')
        const createdAt = nowIso(item.created_at || item.createdAt)
        insertArtifact.run(
          item.id || makeMediaId('artifact'), runId, artifactType, item.variant || '', artifactStatus,
          item.relative_path || item.relativePath || '', item.mime_type || item.mimeType || '',
          Number(item.size_bytes ?? item.sizeBytes) || 0, item.content_hash || item.contentHash || '',
          item.provider_id || item.providerId || '', item.provider_model || item.providerModel || '',
          stringifyJSON(item.provider_meta || item.providerMeta || item.provider_meta_json || {}),
          Number(item.schema_version ?? item.schemaVersion) || 1,
          stringifyJSON(item.depends_on || item.dependsOn || []), item.error_code || item.errorCode || '',
          item.error_message || item.errorMessage || '', createdAt, item.updated_at || item.updatedAt || createdAt,
        )
      }

      for (const item of segments) {
        insertSegment.run(
          item.id || makeMediaId('segment'), runId, item.chapter_id || item.chapterId || '',
          Math.max(0, Math.trunc(Number(item.start_ms ?? item.startMs) || 0)),
          Math.max(0, Math.trunc(Number(item.end_ms ?? item.endMs) || 0)),
          String(item.text || ''), item.language || '', item.speaker ?? null,
          Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
        )
      }

      for (const item of chapters) {
        insertChapter.run(
          item.id || makeMediaId('chapter'), runId,
          Math.max(0, Math.trunc(Number(item.start_ms ?? item.startMs) || 0)),
          Math.max(0, Math.trunc(Number(item.end_ms ?? item.endMs) || 0)),
          item.title || '', item.summary || '', stringifyJSON(item.keywords || item.keywords_json || []),
          item.source_type || item.sourceType || '',
        )
      }

      for (const item of frames) {
        insertFrame.run(
          item.id || makeMediaId('frame'), runId,
          Math.max(0, Math.trunc(Number(item.timestamp_ms ?? item.timestampMs) || 0)),
          item.image_path || item.imagePath || '', item.thumbnail_path || item.thumbnailPath || '',
          stringifyJSON(item.linked_segment_ids || item.linkedSegmentIds || []),
        )
      }

      this.db.prepare(`UPDATE media_analysis_runs SET status = ?, stage = ?, progress = 100,
        warnings_json = ?, error_code = '', error_message = '', finished_at = ?, updated_at = ?
        WHERE id = ?`).run(status, MEDIA_STAGES.PUBLISH, stringifyJSON(warnings), finishedAt, finishedAt, runId)
      this.db.prepare(`UPDATE media_sources SET current_run_id = ?, content_availability = ?,
        updated_at = ? WHERE id = ?`).run(runId, contentAvailability, finishedAt, mediaId)
    })

    publish()
    return {
      source: this.db.prepare('SELECT * FROM media_sources WHERE id = ?').get(mediaId),
      run: this.db.prepare('SELECT * FROM media_analysis_runs WHERE id = ?').get(runId),
      artifacts: this.listMediaArtifacts(runId),
    }
  }
}
