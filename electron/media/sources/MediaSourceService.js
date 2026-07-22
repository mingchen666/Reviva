import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'

export class MediaSourceService {
  constructor({ registry, mediaRepository, locationRepository } = {}) {
    this._registry = registry
    this._media = mediaRepository
    this._locations = locationRepository
  }

  async registerSource(input = {}) {
    const provider = this._registry?.resolve(input)
    if (!provider) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '没有可处理该来源的媒体 Provider。')
    const descriptor = await provider.inspect(input)
    const locationInput = descriptor.location || {}
    const existingLocation = this._locations.findMediaLocation(
      locationInput.locationType,
      locationInput.locator,
      { pathPlatform: input.pathPlatform },
    )

    let source = existingLocation ? this._media.getMediaSource(existingLocation.media_id) : null
    if (!source && locationInput.contentHash) source = this._media.findMediaSourceByContentHash(locationInput.contentHash)
    if (!source) {
      source = this._media.createMediaSource({
        mediaType: descriptor.mediaType,
        title: descriptor.title,
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        fileSize: descriptor.fileSize,
        contentHash: locationInput.contentHash || '',
        durationMs: descriptor.durationMs || 0,
      })
    } else {
      source = this._media.updateMediaSource(source.id, {
        mediaType: descriptor.mediaType || source.media_type,
        title: descriptor.title || source.title,
        fileName: descriptor.fileName || source.file_name,
        mimeType: descriptor.mimeType || source.mime_type,
        fileSize: descriptor.fileSize || source.file_size,
        contentHash: locationInput.contentHash || source.content_hash,
        durationMs: descriptor.durationMs || source.duration_ms,
      })
    }

    const location = this._locations.upsertMediaLocation({
      mediaId: source.id,
      ...locationInput,
      pathPlatform: input.pathPlatform,
    })
    const owner = input.owner || null
    const link = owner ? this._media.upsertMediaSourceLink({
      mediaId: source.id,
      ownerType: owner.type,
      ownerId: owner.id || '',
      ownerLocator: owner.locator,
      pathPlatform: input.pathPlatform,
    }) : null

    return {
      source,
      location,
      link,
      providerId: descriptor.providerId || provider.id,
      sidecarCandidates: descriptor.sidecarCandidates || [],
    }
  }
}
