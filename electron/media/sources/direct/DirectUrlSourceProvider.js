import path from 'node:path'
import {
  DIRECT_AUDIO_EXTENSIONS,
  DIRECT_VIDEO_EXTENSIONS,
  parsePublicHttpUrl,
} from '../../acquisition/DownloadPolicy.js'
import {
  MEDIA_LOCATION_TYPES,
  MEDIA_SOURCE_PROVIDER_IDS,
  MEDIA_TYPES,
} from '../../core/MediaTypes.js'

const MIME_TYPES = Object.freeze({
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.m4v': 'video/x-m4v', '.avi': 'video/x-msvideo',
})

function safeFileName(url) {
  const raw = path.posix.basename(url.pathname) || 'remote-media'
  try { return decodeURIComponent(raw) } catch { return raw }
}

export class DirectUrlSourceProvider {
  constructor() {
    this.id = MEDIA_SOURCE_PROVIDER_IDS.DIRECT_URL
  }

  supports(input = {}) {
    return Boolean(input.url) || input.sourceType === this.id || input.providerId === this.id
  }

  async inspect(input = {}) {
    const url = parsePublicHttpUrl(input.url || input.locator)
    const extension = path.posix.extname(url.pathname).toLowerCase()
    const fileName = safeFileName(url)
    return {
      providerId: this.id,
      mediaType: DIRECT_AUDIO_EXTENSIONS.has(extension) ? MEDIA_TYPES.AUDIO : MEDIA_TYPES.VIDEO,
      title: input.title || fileName,
      fileName,
      mimeType: MIME_TYPES[extension] || '',
      fileSize: 0,
      location: {
        locationType: MEDIA_LOCATION_TYPES.PUBLIC_MEDIA_URL,
        locator: url.toString(),
        availability: 'available',
        cachePolicy: 'temporary',
        expiresAt: input.expiresAt || '',
        authRef: '',
      },
      sidecarCandidates: [],
    }
  }
}

export { parsePublicHttpUrl as assertPublicMediaUrl }
