import crypto from 'node:crypto'

function frozenEnum(values) {
  return Object.freeze({ ...values })
}

export const MEDIA_TYPES = frozenEnum({
  AUDIO: 'audio',
  VIDEO: 'video',
})

export const MEDIA_RUN_STATUSES = frozenEnum({
  QUEUED: 'queued',
  RUNNING: 'running',
  READY: 'ready',
  PARTIAL: 'partial',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
})

export const MEDIA_ARTIFACT_STATUSES = frozenEnum({
  PENDING: 'pending',
  RUNNING: 'running',
  READY: 'ready',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
  STALE: 'stale',
  MISSING: 'missing',
})

export const MEDIA_LOCATION_TYPES = frozenEnum({
  WORKSPACE_FILE: 'workspace_file',
  ATTACHMENT_CACHE: 'attachment_cache',
  PLATFORM_PAGE: 'platform_page',
  PUBLIC_MEDIA_URL: 'public_media_url',
  DOWNLOAD_CACHE: 'download_cache',
})

export const MEDIA_LOCATION_AVAILABILITIES = frozenEnum({
  AVAILABLE: 'available',
  MISSING: 'missing',
  TRASHED: 'trashed',
  EXPIRED: 'expired',
  BLOCKED: 'blocked',
})

export const MEDIA_LINK_OWNER_TYPES = frozenEnum({
  DOCS_FILE: 'docs_file',
  MESSAGE: 'message',
  WIKI_SOURCE: 'wiki_source',
  MEDIA_LIBRARY: 'media_library',
})

export const MEDIA_LINK_STATES = frozenEnum({
  ACTIVE: 'active',
  TRASHED: 'trashed',
})

export const MEDIA_CONTENT_AVAILABILITIES = frozenEnum({
  NONE: 'none',
  METADATA_ONLY: 'metadata_only',
  TRANSCRIPT_READY: 'transcript_ready',
  VISUAL_ONLY: 'visual_only',
})

export const MEDIA_STAGES = frozenEnum({
  PROBE: 'probe',
  SUBTITLE: 'subtitle',
  DOWNLOAD: 'download',
  FFMPEG: 'ffmpeg',
  STT: 'stt',
  WAITING_PROVIDER: 'waiting_provider',
  NORMALIZE: 'normalize',
  FRAMES: 'frames',
  PUBLISH: 'publish',
})

export const MEDIA_ARTIFACT_TYPES = frozenEnum({
  METADATA: 'metadata',
  TRANSCRIPT: 'transcript',
  SUBTITLE_SRT: 'subtitle_srt',
  SUBTITLE_VTT: 'subtitle_vtt',
  SEGMENTS: 'segments',
  CHAPTERS: 'chapters',
  KEYFRAMES: 'keyframes',
  TIMELINE_INDEX: 'timeline_index',
})

export const MEDIA_SOURCE_PROVIDER_IDS = frozenEnum({
  LOCAL_FILE: 'local_file',
  DOCUMENT_UPLOAD: 'document_upload',
  ATTACHMENT: 'attachment',
  DIRECT_URL: 'direct_url',
  BILIBILI: 'bilibili',
})

export const MEDIA_ID_PREFIXES = frozenEnum({
  MEDIA: 'med_',
  LOCATION: 'med_loc_',
  LINK: 'med_link_',
  RUN: 'med_run_',
  ARTIFACT: 'med_art_',
  SEGMENT: 'med_seg_',
  FRAME: 'med_frame_',
  CHAPTER: 'med_ch_',
})

export const MEDIA_ENUMS = Object.freeze({
  MEDIA_TYPES,
  MEDIA_RUN_STATUSES,
  MEDIA_ARTIFACT_STATUSES,
  MEDIA_LOCATION_TYPES,
  MEDIA_LOCATION_AVAILABILITIES,
  MEDIA_LINK_OWNER_TYPES,
  MEDIA_LINK_STATES,
  MEDIA_CONTENT_AVAILABILITIES,
  MEDIA_STAGES,
  MEDIA_ARTIFACT_TYPES,
  MEDIA_SOURCE_PROVIDER_IDS,
  MEDIA_ID_PREFIXES,
})

export function makeMediaId(kind, uuid = crypto.randomUUID()) {
  const prefix = MEDIA_ID_PREFIXES[String(kind || '').toUpperCase()]
  if (!prefix) throw new Error(`Unknown media ID kind: ${kind}`)
  return prefix + String(uuid).replace(/-/g, '')
}

/**
 * @typedef {Object} MediaSourceProvider
 * @property {string} id Stable provider ID.
 * @property {(input: object) => boolean} supports Returns whether the source can be handled.
 * @property {(input: object, context?: object) => Promise<object>} inspect Returns normalized lightweight metadata and subtitle candidates without downloading large media.
 */

/**
 * @typedef {Object} MediaDownloader
 * @property {string} id Stable downloader ID.
 * @property {(input: object, context: { tempDir: string, signal?: AbortSignal }) => Promise<{ localPath: string, sizeBytes: number, temporary: boolean, metadata?: object }>} download Downloads into the supplied run temp directory.
 */

/**
 * @typedef {Object} MediaQueryRequest
 * @property {string} mediaId
 * @property {'metadata'|'transcript'|'search'|'chapters'|'frames'|'artifacts'} mode
 * @property {number=} startMs
 * @property {number=} endMs
 * @property {string=} cursor
 * @property {number=} limit
 * @property {number=} maxChars
 * @property {string=} query
 * @property {number=} contextSegments
 */

/**
 * @typedef {Object} MediaQueryContext
 * @property {Set<string>|string[]=} allowedMediaIds
 * @property {boolean=} trustedInternal
 */
