import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../../core/MediaErrors.js'
import {
  MEDIA_LOCATION_TYPES,
  MEDIA_SOURCE_PROVIDER_IDS,
  MEDIA_TYPES,
} from '../../core/MediaTypes.js'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'])
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt'])

const MIME_TYPES = Object.freeze({
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.mp4': 'video/mp4',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.m4v': 'video/x-m4v', '.avi': 'video/x-msvideo',
})

function fileIdentityHash(filePath, stat) {
  const identity = [stat.dev || '', stat.ino || '', stat.size || 0, stat.birthtimeMs || 0]
  if (!stat.ino) identity.push(path.resolve(filePath).toLowerCase())
  return crypto.createHash('sha256').update(identity.join(':')).digest('hex')
}

export class LocalFileSourceProvider {
  constructor({ workDirService } = {}) {
    this.id = MEDIA_SOURCE_PROVIDER_IDS.LOCAL_FILE
    this.aliases = [MEDIA_SOURCE_PROVIDER_IDS.DOCUMENT_UPLOAD, MEDIA_SOURCE_PROVIDER_IDS.ATTACHMENT]
    this._workDir = workDirService
  }

  supports(input = {}) {
    const ext = path.extname(String(input.path || input.locator || '')).toLowerCase()
    return AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)
  }

  _resolve(inputPath) {
    return this._workDir?.resolveAndValidate
      ? this._workDir.resolveAndValidate(inputPath, 'any')
      : path.resolve(inputPath)
  }

  _sidecars(mediaPath, explicitSidecarPath) {
    const candidates = []
    const add = (candidate, explicit = false) => {
      if (!candidate) return
      const resolved = this._resolve(candidate)
      const ext = path.extname(resolved).toLowerCase()
      if (!SUBTITLE_EXTENSIONS.has(ext)) {
        if (explicit) throw new MediaError(MEDIA_ERROR_CODES.SUBTITLE_INVALID, '仅支持 SRT 或 VTT 外部字幕。')
        return
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        if (explicit) throw new MediaError(MEDIA_ERROR_CODES.SUBTITLE_INVALID, '指定的外部字幕文件不存在。')
        return
      }
      if (!candidates.some(item => item.path === resolved)) candidates.push({ path: resolved, format: ext.slice(1), explicit })
    }
    add(explicitSidecarPath, true)
    const base = mediaPath.slice(0, mediaPath.length - path.extname(mediaPath).length)
    add(`${base}.srt`)
    add(`${base}.vtt`)
    return candidates
  }

  async inspect(input = {}) {
    const requestedPath = input.path || input.locator
    if (!requestedPath) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '本地媒体路径不能为空。')
    const resolved = this._resolve(requestedPath)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAVAILABLE, '本地媒体文件不存在。')
    }
    const extension = path.extname(resolved).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) {
      throw new MediaError(MEDIA_ERROR_CODES.CODEC_UNSUPPORTED, '当前版本不承诺支持该媒体扩展名。')
    }
    const stat = await fs.promises.stat(resolved)
    const sourceType = input.sourceType || MEDIA_SOURCE_PROVIDER_IDS.LOCAL_FILE
    const locationType = sourceType === MEDIA_SOURCE_PROVIDER_IDS.ATTACHMENT
      ? MEDIA_LOCATION_TYPES.ATTACHMENT_CACHE
      : MEDIA_LOCATION_TYPES.WORKSPACE_FILE
    return {
      providerId: sourceType,
      mediaType: AUDIO_EXTENSIONS.has(extension) ? MEDIA_TYPES.AUDIO : MEDIA_TYPES.VIDEO,
      title: input.title || path.basename(resolved),
      fileName: path.basename(resolved),
      mimeType: MIME_TYPES[extension] || '',
      fileSize: stat.size,
      location: {
        locationType,
        locator: resolved,
        availability: 'available',
        fileSize: stat.size,
        mtimeMs: stat.mtimeMs,
        fileIdentityHash: fileIdentityHash(resolved, stat),
        contentHash: input.contentHash || '',
        cachePolicy: input.cachePolicy || 'none',
      },
      sidecarCandidates: this._sidecars(resolved, input.sidecarPath),
    }
  }
}

export { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, fileIdentityHash }

