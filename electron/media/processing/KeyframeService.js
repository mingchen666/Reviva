import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { makeMediaId } from '../core/MediaTypes.js'

function linkedSegments(timestampMs, segments = []) {
  const containing = segments.filter(segment => timestampMs >= segment.startMs && timestampMs <= segment.endMs)
  if (containing.length) return containing.slice(0, 3).map(segment => segment.id).filter(Boolean)
  let nearest = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    const distance = Math.min(Math.abs(timestampMs - segment.startMs), Math.abs(timestampMs - segment.endMs))
    if (distance < nearestDistance) { nearest = segment; nearestDistance = distance }
  }
  return nearest?.id && nearestDistance <= 15000 ? [nearest.id] : []
}

export class KeyframeService {
  constructor({ ffmpegRunner, artifactService } = {}) {
    this._ffmpeg = ffmpegRunner
    this._artifacts = artifactService
  }

  async extract({ mediaId, runId, inputPath, durationMs, limit = 12, segments = [], signal } = {}) {
    const paths = this._artifacts.paths(mediaId, runId)
    const outputPattern = path.join(paths.tempDir, 'frames', 'frame_%06d.jpg')
    const extracted = await this._ffmpeg.extractKeyframes(inputPath, { outputPattern, durationMs, limit, signal })
    if (!extracted.length) throw new MediaError(MEDIA_ERROR_CODES.CODEC_UNSUPPORTED, 'FFmpeg 未能从视频中抽取关键帧。', { stage: 'frames' })
    const frames = []
    for (const item of extracted) {
      const relativeInRun = path.relative(paths.tempDir, item.path).replace(/\\/g, '/')
      const publishedPath = `runs/${runId}/${relativeInRun}`
      const thumbnailOutput = path.join(paths.tempDir, 'frames', 'thumbnails', path.basename(item.path))
      let thumbnailPublishedPath = publishedPath
      try {
        const thumbnailPath = await this._ffmpeg.createImageThumbnail(item.path, {
          outputPath: thumbnailOutput,
          maxWidth: 360,
          signal,
        })
        const relativeThumbnail = path.relative(paths.tempDir, thumbnailPath).replace(/\\/g, '/')
        thumbnailPublishedPath = `runs/${runId}/${relativeThumbnail}`
      } catch (error) {
        if (error?.code === MEDIA_ERROR_CODES.CANCELLED) throw error
      }
      frames.push({
        id: makeMediaId('frame'),
        timestampMs: item.timestampMs,
        imagePath: publishedPath,
        thumbnailPath: thumbnailPublishedPath,
        linkedSegmentIds: linkedSegments(item.timestampMs, segments),
      })
    }
    return frames
  }
}
