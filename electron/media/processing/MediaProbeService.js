import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { MEDIA_TYPES } from '../core/MediaTypes.js'

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function durationMs(raw = {}) {
  const formatDuration = numberOrZero(raw.format?.duration)
  const streamDuration = Math.max(0, ...(raw.streams || []).map(stream => numberOrZero(stream.duration)))
  return Math.round(Math.max(formatDuration, streamDuration) * 1000)
}

function tags(stream) {
  return stream?.tags && typeof stream.tags === 'object' ? stream.tags : {}
}

export class MediaProbeService {
  constructor({ ffmpegRunner } = {}) {
    this._runner = ffmpegRunner
  }

  normalize(raw = {}, { fileName = '' } = {}) {
    const streams = Array.isArray(raw.streams) ? raw.streams : []
    const audioStreams = streams.filter(stream => stream.codec_type === 'audio')
    const allVideoStreams = streams.filter(stream => stream.codec_type === 'video')
    const videoStreams = allVideoStreams.filter(stream => Number(stream.disposition?.attached_pic || 0) !== 1)
    const attachedPictureStreams = allVideoStreams.filter(stream => Number(stream.disposition?.attached_pic || 0) === 1)
    const subtitleStreams = streams.filter(stream => stream.codec_type === 'subtitle')
    if (!audioStreams.length && !videoStreams.length) {
      throw new MediaError(MEDIA_ERROR_CODES.CODEC_UNSUPPORTED, '文件中没有可用的音频或视频轨道。', { stage: 'probe' })
    }

    const mediaType = videoStreams.length ? MEDIA_TYPES.VIDEO : MEDIA_TYPES.AUDIO
    const primaryVideo = videoStreams.find(stream => Number(stream.disposition?.default || 0) === 1) || videoStreams[0] || null
    const primaryAudio = audioStreams.find(stream => Number(stream.disposition?.default || 0) === 1) || audioStreams[0] || null
    return {
      mediaType,
      fileName,
      formatName: raw.format?.format_name || '',
      formatLongName: raw.format?.format_long_name || '',
      durationMs: durationMs(raw),
      sizeBytes: Math.max(0, Number(raw.format?.size) || 0),
      bitRate: Math.max(0, Number(raw.format?.bit_rate) || 0),
      width: Math.max(0, Number(primaryVideo?.width) || 0),
      height: Math.max(0, Number(primaryVideo?.height) || 0),
      hasAudio: audioStreams.length > 0,
      hasVideo: videoStreams.length > 0,
      hasAttachedPicture: attachedPictureStreams.length > 0,
      audioTracks: audioStreams.map((stream, audioIndex) => ({
        streamIndex: Number(stream.index),
        audioIndex,
        codec: stream.codec_name || '',
        language: tags(stream).language || '',
        title: tags(stream).title || '',
        channels: Math.max(0, Number(stream.channels) || 0),
        sampleRate: Math.max(0, Number(stream.sample_rate) || 0),
        default: Number(stream.disposition?.default || 0) === 1,
      })),
      subtitleTracks: subtitleStreams.map((stream, subtitleIndex) => ({
        streamIndex: Number(stream.index),
        subtitleIndex,
        codec: stream.codec_name || '',
        language: tags(stream).language || '',
        title: tags(stream).title || '',
        default: Number(stream.disposition?.default || 0) === 1,
        forced: Number(stream.disposition?.forced || 0) === 1,
      })),
      rawTags: raw.format?.tags && typeof raw.format.tags === 'object' ? raw.format.tags : {},
      primaryAudioStreamIndex: primaryAudio ? Number(primaryAudio.index) : null,
      primaryVideoStreamIndex: primaryVideo ? Number(primaryVideo.index) : null,
    }
  }

  async probe(inputPath, options = {}) {
    if (!this._runner?.probe) throw new MediaError(MEDIA_ERROR_CODES.FFPROBE_UNAVAILABLE, '媒体探测服务不可用。')
    const raw = await this._runner.probe(inputPath, options)
    return this.normalize(raw, { fileName: options.fileName || '' })
  }
}

