import { dynamicUpdate } from '../../db/helpers.js'
import { BaseRepository } from '../../db/repositories/BaseRepository.js'
import {
  MEDIA_CONTENT_AVAILABILITIES,
  MEDIA_LINK_OWNER_TYPES,
  MEDIA_LINK_STATES,
  MEDIA_TYPES,
  makeMediaId,
} from '../core/MediaTypes.js'
import { asBoolean, assertEnum, normalizeOwnerLocator, nowIso } from './MediaRepositoryUtils.js'

export class MediaRepository extends BaseRepository {
  _parseSource(row) {
    return row ? { ...row, pinned: asBoolean(row.pinned) } : null
  }

  _parseLink(row) {
    return row ? { ...row } : null
  }

  createMediaSource(data = {}) {
    const mediaType = assertEnum(data.media_type || data.mediaType || '', MEDIA_TYPES, 'media type', { allowEmpty: true })
    const contentAvailability = assertEnum(
      data.content_availability || data.contentAvailability || MEDIA_CONTENT_AVAILABILITIES.NONE,
      MEDIA_CONTENT_AVAILABILITIES,
      'content availability',
    )
    const id = data.id || makeMediaId('media')
    const createdAt = nowIso(data.created_at || data.createdAt)
    this.db.prepare(`INSERT INTO media_sources (
      id, media_type, title, file_name, mime_type, file_size, content_hash,
      duration_ms, width, height, current_run_id, content_availability,
      artifact_retention_policy, pinned, last_accessed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      mediaType,
      data.title || '',
      data.file_name || data.fileName || '',
      data.mime_type || data.mimeType || '',
      Number(data.file_size ?? data.fileSize) || 0,
      data.content_hash || data.contentHash || '',
      Number(data.duration_ms ?? data.durationMs) || 0,
      Number(data.width) || 0,
      Number(data.height) || 0,
      data.current_run_id || data.currentRunId || '',
      contentAvailability,
      data.artifact_retention_policy || data.artifactRetentionPolicy || 'referenced',
      data.pinned ? 1 : 0,
      data.last_accessed_at || data.lastAccessedAt || '',
      createdAt,
      data.updated_at || data.updatedAt || createdAt,
    )
    return this.getMediaSource(id)
  }

  getMediaSource(id) {
    return this._parseSource(this.db.prepare('SELECT * FROM media_sources WHERE id = ?').get(id))
  }

  listMediaSources({ limit = 1000, offset = 0 } = {}) {
    const normalizedLimit = Math.min(5000, Math.max(1, Math.trunc(Number(limit) || 1000)))
    const normalizedOffset = Math.max(0, Math.trunc(Number(offset) || 0))
    return this.db.prepare(`SELECT * FROM media_sources
      ORDER BY updated_at ASC, created_at ASC LIMIT ? OFFSET ?`)
      .all(normalizedLimit, normalizedOffset).map(row => this._parseSource(row))
  }

  findMediaSourceByContentHash(contentHash) {
    if (!contentHash) return null
    return this._parseSource(this.db.prepare(`SELECT * FROM media_sources
      WHERE content_hash = ? ORDER BY updated_at DESC LIMIT 1`).get(String(contentHash)))
  }

  updateMediaSource(id, patch = {}) {
    const payload = { ...patch }
    if (payload.mediaType !== undefined && payload.media_type === undefined) payload.media_type = payload.mediaType
    if (payload.fileName !== undefined && payload.file_name === undefined) payload.file_name = payload.fileName
    if (payload.mimeType !== undefined && payload.mime_type === undefined) payload.mime_type = payload.mimeType
    if (payload.fileSize !== undefined && payload.file_size === undefined) payload.file_size = payload.fileSize
    if (payload.contentHash !== undefined && payload.content_hash === undefined) payload.content_hash = payload.contentHash
    if (payload.durationMs !== undefined && payload.duration_ms === undefined) payload.duration_ms = payload.durationMs
    if (payload.currentRunId !== undefined && payload.current_run_id === undefined) payload.current_run_id = payload.currentRunId
    if (payload.contentAvailability !== undefined && payload.content_availability === undefined) payload.content_availability = payload.contentAvailability
    if (payload.artifactRetentionPolicy !== undefined && payload.artifact_retention_policy === undefined) payload.artifact_retention_policy = payload.artifactRetentionPolicy
    if (payload.lastAccessedAt !== undefined && payload.last_accessed_at === undefined) payload.last_accessed_at = payload.lastAccessedAt
    if (payload.media_type !== undefined) assertEnum(payload.media_type, MEDIA_TYPES, 'media type', { allowEmpty: true })
    if (payload.content_availability !== undefined) assertEnum(payload.content_availability, MEDIA_CONTENT_AVAILABILITIES, 'content availability')
    for (const key of ['mediaType', 'fileName', 'mimeType', 'fileSize', 'contentHash', 'durationMs', 'currentRunId', 'contentAvailability', 'artifactRetentionPolicy', 'lastAccessedAt']) delete payload[key]
    dynamicUpdate(this.db, 'media_sources', id, payload, [], ['pinned'])
    return this.getMediaSource(id)
  }

  deleteMediaSource(id) {
    const result = this.db.prepare('DELETE FROM media_sources WHERE id = ?').run(id)
    return { success: true, changes: result.changes }
  }

  upsertMediaSourceLink(data = {}) {
    const mediaId = String(data.media_id || data.mediaId || '')
    const ownerType = assertEnum(data.owner_type || data.ownerType, MEDIA_LINK_OWNER_TYPES, 'media owner type')
    const ownerId = String(data.owner_id ?? data.ownerId ?? '')
    const ownerLocator = normalizeOwnerLocator(ownerType, data.owner_locator || data.ownerLocator, {
      platform: data.pathPlatform || process.platform,
    })
    const state = assertEnum(data.state || MEDIA_LINK_STATES.ACTIVE, MEDIA_LINK_STATES, 'media link state')
    const trashId = String(data.trash_id ?? data.trashId ?? '')
    if (!mediaId) throw new Error('Media link media ID is required')
    if (!ownerLocator) throw new Error('Media link owner locator is required')

    const existing = this.db.prepare(`SELECT * FROM media_source_links
      WHERE owner_type = ? AND owner_id = ? AND owner_locator = ? AND trash_id = ? LIMIT 1`)
      .get(ownerType, ownerId, ownerLocator, trashId)
    if (existing) {
      dynamicUpdate(this.db, 'media_source_links', existing.id, { media_id: mediaId, state })
      return this._parseLink(this.db.prepare('SELECT * FROM media_source_links WHERE id = ?').get(existing.id))
    }

    const id = data.id || makeMediaId('link')
    const createdAt = nowIso(data.created_at || data.createdAt)
    this.db.prepare(`INSERT INTO media_source_links (
      id, media_id, owner_type, owner_id, owner_locator, state, trash_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, mediaId, ownerType, ownerId, ownerLocator, state, trashId,
      createdAt, data.updated_at || data.updatedAt || createdAt,
    )
    return this._parseLink(this.db.prepare('SELECT * FROM media_source_links WHERE id = ?').get(id))
  }

  getMediaSourceLink(id) {
    return this._parseLink(this.db.prepare('SELECT * FROM media_source_links WHERE id = ?').get(id))
  }

  listMediaSourceLinks(mediaId, { state } = {}) {
    if (state !== undefined) {
      assertEnum(state, MEDIA_LINK_STATES, 'media link state')
      return this.db.prepare(`SELECT * FROM media_source_links WHERE media_id = ? AND state = ?
        ORDER BY updated_at DESC, created_at DESC`).all(mediaId, state).map(row => this._parseLink(row))
    }
    return this.db.prepare(`SELECT * FROM media_source_links WHERE media_id = ?
      ORDER BY updated_at DESC, created_at DESC`).all(mediaId).map(row => this._parseLink(row))
  }

  listDocsFileLinks() {
    return this.db.prepare(`SELECT * FROM media_source_links WHERE owner_type = 'docs_file'
      ORDER BY updated_at DESC`).all().map(row => this._parseLink(row))
  }

  listMediaSourceLinksByOwner(ownerType, ownerIds = []) {
    const normalizedType = assertEnum(ownerType, MEDIA_LINK_OWNER_TYPES, 'media owner type')
    const ids = [...new Set((Array.isArray(ownerIds) ? ownerIds : [ownerIds]).map(value => String(value || '')).filter(Boolean))]
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(', ')
    return this.db.prepare(`SELECT * FROM media_source_links
      WHERE owner_type = ? AND owner_id IN (${placeholders})
      ORDER BY updated_at DESC`).all(normalizedType, ...ids).map(row => this._parseLink(row))
  }

  findActiveMediaSourceLink({ ownerType, ownerId = '', ownerLocator, pathPlatform } = {}) {
    const normalizedType = assertEnum(ownerType, MEDIA_LINK_OWNER_TYPES, 'media owner type')
    const normalizedLocator = normalizeOwnerLocator(normalizedType, ownerLocator, { platform: pathPlatform || process.platform })
    return this._parseLink(this.db.prepare(`SELECT * FROM media_source_links
      WHERE owner_type = ? AND owner_id = ? AND owner_locator = ? AND state = 'active'
      ORDER BY updated_at DESC LIMIT 1`).get(normalizedType, String(ownerId), normalizedLocator))
  }

  updateMediaSourceLink(id, patch = {}) {
    const payload = { ...patch }
    if (payload.mediaId !== undefined && payload.media_id === undefined) payload.media_id = payload.mediaId
    if (payload.ownerId !== undefined && payload.owner_id === undefined) payload.owner_id = payload.ownerId
    if (payload.trashId !== undefined && payload.trash_id === undefined) payload.trash_id = payload.trashId
    if (payload.state !== undefined) assertEnum(payload.state, MEDIA_LINK_STATES, 'media link state')
    if (payload.ownerLocator !== undefined || payload.owner_locator !== undefined) {
      const existing = this.getMediaSourceLink(id)
      payload.owner_locator = normalizeOwnerLocator(
        patch.owner_type || patch.ownerType || existing?.owner_type,
        patch.owner_locator || patch.ownerLocator,
        { platform: patch.pathPlatform || process.platform },
      )
    }
    for (const key of ['mediaId', 'ownerId', 'ownerType', 'ownerLocator', 'trashId', 'pathPlatform']) delete payload[key]
    dynamicUpdate(this.db, 'media_source_links', id, payload)
    return this.getMediaSourceLink(id)
  }

  countMediaSourceLinks(mediaId, states = [MEDIA_LINK_STATES.ACTIVE, MEDIA_LINK_STATES.TRASHED]) {
    const normalizedStates = [...new Set(states.map(state => assertEnum(state, MEDIA_LINK_STATES, 'media link state')))]
    if (!normalizedStates.length) return 0
    const placeholders = normalizedStates.map(() => '?').join(', ')
    return this.db.prepare(`SELECT COUNT(*) AS count FROM media_source_links
      WHERE media_id = ? AND state IN (${placeholders})`).get(mediaId, ...normalizedStates)?.count || 0
  }

  deleteMediaSourceLink(id) {
    const result = this.db.prepare('DELETE FROM media_source_links WHERE id = ?').run(id)
    return { success: true, changes: result.changes }
  }
}
