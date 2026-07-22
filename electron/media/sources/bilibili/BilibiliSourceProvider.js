import { MEDIA_LOCATION_TYPES, MEDIA_SOURCE_PROVIDER_IDS, MEDIA_TYPES } from '../../core/MediaTypes.js'

function safeName(value) {
  return String(value || 'bilibili-video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 160) || 'bilibili-video'
}

export class BilibiliSourceProvider {
  constructor({ client } = {}) {
    this.id = MEDIA_SOURCE_PROVIDER_IDS.BILIBILI
    this._client = client
  }

  supports(input = {}) {
    if (input.sourceType === this.id || input.providerId === this.id) return true
    const value = String(input.url || input.locator || '').trim()
    return /(?:b23\.tv|bilibili\.com\/video\/|^BV[0-9A-Za-z]+$|^av\d+$)/i.test(value)
  }

  async inspect(input = {}) {
    const descriptor = await this._client.describe(input.url || input.locator)
    const displayTitle = descriptor.pageCount > 1 && descriptor.partTitle
      ? `${descriptor.title} · P${descriptor.page} ${descriptor.partTitle}`
      : descriptor.title
    return {
      providerId: this.id,
      mediaType: MEDIA_TYPES.VIDEO,
      title: input.title || displayTitle,
      fileName: `${safeName(displayTitle)}.mp4`,
      mimeType: 'video/mp4',
      fileSize: 0,
      durationMs: descriptor.durationMs,
      location: {
        locationType: MEDIA_LOCATION_TYPES.PLATFORM_PAGE,
        locator: descriptor.canonicalUrl,
        platform: 'bilibili',
        platformSourceId: `${descriptor.bvid}:${descriptor.cid}:p${descriptor.page}`,
        availability: 'available',
        cachePolicy: 'temporary',
        expiresAt: '',
        authRef: '',
      },
      sidecarCandidates: [],
    }
  }
}
