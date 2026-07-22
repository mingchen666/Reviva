import { dynamicUpdate } from '../../db/helpers.js'
import { BaseRepository } from '../../db/repositories/BaseRepository.js'
import {
  MEDIA_LOCATION_AVAILABILITIES,
  MEDIA_LOCATION_TYPES,
  makeMediaId,
} from '../core/MediaTypes.js'
import { assertEnum, normalizeMediaLocator, nowIso } from './MediaRepositoryUtils.js'

export class MediaLocationRepository extends BaseRepository {
  _parseLocation(row) {
    return row ? { ...row } : null
  }

  getMediaLocation(id) {
    return this._parseLocation(this.db.prepare('SELECT * FROM media_source_locations WHERE id = ?').get(id))
  }

  listMediaLocations(mediaId, { availability } = {}) {
    if (availability !== undefined) {
      assertEnum(availability, MEDIA_LOCATION_AVAILABILITIES, 'media location availability')
      return this.db.prepare(`SELECT * FROM media_source_locations WHERE media_id = ? AND availability = ?
        ORDER BY updated_at DESC, created_at DESC`).all(mediaId, availability).map(row => this._parseLocation(row))
    }
    return this.db.prepare(`SELECT * FROM media_source_locations WHERE media_id = ?
      ORDER BY updated_at DESC, created_at DESC`).all(mediaId).map(row => this._parseLocation(row))
  }

  listLocalFileLocations() {
    return this.db.prepare(`SELECT * FROM media_source_locations
      WHERE location_type IN ('workspace_file', 'attachment_cache', 'download_cache')
      ORDER BY updated_at DESC`).all().map(row => this._parseLocation(row))
  }

  findMediaLocation(locationType, locator, { pathPlatform } = {}) {
    const normalizedType = assertEnum(locationType, MEDIA_LOCATION_TYPES, 'media location type')
    const normalizedLocator = normalizeMediaLocator(normalizedType, locator, { platform: pathPlatform || process.platform })
    return this._parseLocation(this.db.prepare(`SELECT * FROM media_source_locations
      WHERE location_type = ? AND normalized_locator = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(normalizedType, normalizedLocator))
  }

  upsertMediaLocation(data = {}) {
    const mediaId = String(data.media_id || data.mediaId || '')
    const locationType = assertEnum(data.location_type || data.locationType, MEDIA_LOCATION_TYPES, 'media location type')
    const locator = String(data.locator || '').trim()
    const normalizedLocator = normalizeMediaLocator(locationType, locator, {
      platform: data.pathPlatform || process.platform,
    })
    const availability = assertEnum(
      data.availability || MEDIA_LOCATION_AVAILABILITIES.AVAILABLE,
      MEDIA_LOCATION_AVAILABILITIES,
      'media location availability',
    )
    if (!mediaId) throw new Error('Media location media ID is required')
    if (!locator || !normalizedLocator) throw new Error('Media location locator is required')
    const existing = this.db.prepare(`SELECT * FROM media_source_locations
      WHERE location_type = ? AND normalized_locator = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(locationType, normalizedLocator)
    if (existing) {
      return this.updateMediaLocation(existing.id, { ...data, media_id: mediaId, normalized_locator: normalizedLocator, availability })
    }

    const id = data.id || makeMediaId('location')
    const createdAt = nowIso(data.created_at || data.createdAt)
    this.db.prepare(`INSERT INTO media_source_locations (
      id, media_id, location_type, locator, locator_ref, normalized_locator, platform,
      platform_source_id, cache_policy, availability, file_size, mtime_ms,
      file_identity_hash, content_hash, expires_at, auth_ref, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, mediaId, locationType, locator,
      data.locator_ref || data.locatorRef || '', normalizedLocator,
      data.platform || '', data.platform_source_id || data.platformSourceId || '',
      data.cache_policy || data.cachePolicy || 'none', availability,
      Number(data.file_size ?? data.fileSize) || 0,
      Number(data.mtime_ms ?? data.mtimeMs) || 0,
      data.file_identity_hash || data.fileIdentityHash || '',
      data.content_hash || data.contentHash || '',
      data.expires_at || data.expiresAt || '', data.auth_ref || data.authRef || '',
      createdAt, data.updated_at || data.updatedAt || createdAt,
    )
    return this.getMediaLocation(id)
  }

  updateMediaLocation(id, patch = {}) {
    const payload = { ...patch }
    const aliases = {
      mediaId: 'media_id', locationType: 'location_type', locatorRef: 'locator_ref',
      platformSourceId: 'platform_source_id', cachePolicy: 'cache_policy', fileSize: 'file_size',
      mtimeMs: 'mtime_ms', fileIdentityHash: 'file_identity_hash', contentHash: 'content_hash',
      expiresAt: 'expires_at', authRef: 'auth_ref',
    }
    for (const [alias, field] of Object.entries(aliases)) {
      if (payload[alias] !== undefined && payload[field] === undefined) payload[field] = payload[alias]
      delete payload[alias]
    }
    const existing = this.getMediaLocation(id)
    const locationType = payload.location_type || existing?.location_type
    if (payload.location_type !== undefined) assertEnum(payload.location_type, MEDIA_LOCATION_TYPES, 'media location type')
    if (payload.availability !== undefined) assertEnum(payload.availability, MEDIA_LOCATION_AVAILABILITIES, 'media location availability')
    if (payload.locator !== undefined && payload.normalized_locator === undefined) {
      payload.normalized_locator = normalizeMediaLocator(locationType, payload.locator, {
        platform: patch.pathPlatform || process.platform,
      })
    }
    delete payload.pathPlatform
    dynamicUpdate(this.db, 'media_source_locations', id, payload)
    return this.getMediaLocation(id)
  }

  deleteMediaLocation(id) {
    const result = this.db.prepare('DELETE FROM media_source_locations WHERE id = ?').run(id)
    return { success: true, changes: result.changes }
  }
}
