export const MEDIA_ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: 'MEDIA_INVALID_ARGUMENT',
  SOURCE_NOT_FOUND: 'MEDIA_SOURCE_NOT_FOUND',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  SOURCE_UNAUTHORIZED: 'MEDIA_SOURCE_UNAUTHORIZED',
  LOCATION_NOT_FOUND: 'MEDIA_LOCATION_NOT_FOUND',
  LOCATION_UNAVAILABLE: 'MEDIA_LOCATION_UNAVAILABLE',
  RUN_NOT_FOUND: 'MEDIA_RUN_NOT_FOUND',
  RUN_STATE_INVALID: 'MEDIA_RUN_STATE_INVALID',
  RUN_NOT_RESTORABLE: 'MEDIA_RUN_NOT_RESTORABLE',
  RUN_INTERRUPTED: 'MEDIA_RUN_INTERRUPTED',
  ARTIFACT_NOT_FOUND: 'MEDIA_ARTIFACT_NOT_FOUND',
  ARTIFACT_INVALID: 'MEDIA_ARTIFACT_INVALID',
  ARTIFACT_MISSING: 'MEDIA_ARTIFACT_MISSING',
  PUBLISH_FAILED: 'MEDIA_PUBLISH_FAILED',
  FFMPEG_UNAVAILABLE: 'MEDIA_FFMPEG_UNAVAILABLE',
  FFPROBE_UNAVAILABLE: 'MEDIA_FFPROBE_UNAVAILABLE',
  CODEC_UNSUPPORTED: 'MEDIA_CODEC_UNSUPPORTED',
  CORRUPTED: 'MEDIA_CORRUPTED',
  DRM_UNSUPPORTED: 'MEDIA_DRM_UNSUPPORTED',
  SUBTITLE_INVALID: 'MEDIA_SUBTITLE_INVALID',
  STT_NOT_CONFIGURED: 'MEDIA_STT_NOT_CONFIGURED',
  STT_PROVIDER_UNAVAILABLE: 'MEDIA_STT_PROVIDER_UNAVAILABLE',
  STT_MODEL_UNSUPPORTED: 'MEDIA_STT_MODEL_UNSUPPORTED',
  STT_INPUT_UNSUPPORTED: 'MEDIA_STT_INPUT_UNSUPPORTED',
  STT_FAILED: 'MEDIA_STT_FAILED',
  PROVIDER_AUTH_FAILED: 'MEDIA_PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED: 'MEDIA_PROVIDER_RATE_LIMITED',
  PROVIDER_JOB_TIMEOUT: 'PROVIDER_JOB_TIMEOUT',
  PROVIDER_RESPONSE_INVALID: 'MEDIA_PROVIDER_RESPONSE_INVALID',
  DOWNLOAD_FAILED: 'MEDIA_DOWNLOAD_FAILED',
  DOWNLOAD_TOO_LARGE: 'MEDIA_DOWNLOAD_TOO_LARGE',
  PRIVATE_URL_UNSUPPORTED: 'MEDIA_PRIVATE_URL_UNSUPPORTED',
  STREAM_URL_UNSUPPORTED: 'MEDIA_STREAM_URL_UNSUPPORTED',
  SOURCE_HAS_NO_CHAPTERS: 'SOURCE_HAS_NO_CHAPTERS',
  CANCELLED: 'MEDIA_CANCELLED',
  INTERNAL: 'MEDIA_INTERNAL_ERROR',
})

export class MediaError extends Error {
  constructor(code, message, options = {}) {
    super(message || '媒体解析失败。')
    this.name = 'MediaError'
    this.code = code || MEDIA_ERROR_CODES.INTERNAL
    this.retryable = options.retryable === true
    this.stage = options.stage || ''
    this.provider = options.provider || ''
    this.status = Number(options.status) || 0
    this.cause = options.cause
  }

  toPublicResult() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      stage: this.stage,
      provider: this.provider,
      status: this.status,
    }
  }
}

export function normalizeMediaError(error, fallback = {}) {
  if (error instanceof MediaError) return error
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new MediaError(MEDIA_ERROR_CODES.CANCELLED, '媒体解析已取消或超时。', {
      ...fallback,
      retryable: true,
      cause: error,
    })
  }
  return new MediaError(
    fallback.code || MEDIA_ERROR_CODES.INTERNAL,
    fallback.message || '媒体解析失败，请稍后重试。',
    { ...fallback, cause: error },
  )
}

