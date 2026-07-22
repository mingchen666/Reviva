import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { MEDIA_LOCATION_TYPES, MEDIA_STAGES } from '../core/MediaTypes.js'

export class MediaAcquisitionService {
  constructor({ artifactService, directDownloader, bilibiliDownloader } = {}) {
    this._artifacts = artifactService
    this._direct = directDownloader
    this._bilibili = bilibiliDownloader
  }

  cacheDir(mediaId, runId) {
    const paths = this._artifacts.paths(mediaId, runId)
    return path.join(paths.mediaRoot, 'cache', runId)
  }

  async acquire(run, location, options = {}) {
    const cacheDir = this.cacheDir(run.media_id, run.id)
    await fs.promises.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
    await fs.promises.mkdir(cacheDir, { recursive: true })
    const onStage = options.onStage
    await onStage?.(MEDIA_STAGES.DOWNLOAD, 18, location.location_type === MEDIA_LOCATION_TYPES.PLATFORM_PAGE
      ? '正在读取平台字幕或音轨'
      : '正在安全下载远程媒体')
    try {
      if (location.location_type === MEDIA_LOCATION_TYPES.PUBLIC_MEDIA_URL) {
        const result = await this._direct.download({
          url: location.locator,
          fileName: run.config?.remoteFileName || '',
          maxBytes: Math.max(1, Number(run.config?.remoteDownloadMaxMb) || 2048) * 1024 * 1024,
        }, { targetDir: cacheDir, signal: options.signal })
        return { kind: 'local_file', cacheDir, ...result }
      }
      if (location.location_type === MEDIA_LOCATION_TYPES.PLATFORM_PAGE && location.platform === 'bilibili') {
        return {
          cacheDir,
          ...(await this._bilibili.acquire(location, {
            cacheDir,
            signal: options.signal,
            preferSubtitle: run.config?.preferSubtitle !== false,
            extractKeyframes: run.config?.extractKeyframes === true,
            allowYtDlp: run.config?.bilibiliYtDlpFallback !== false,
            maxBytes: Math.max(1, Number(run.config?.remoteDownloadMaxMb) || 2048) * 1024 * 1024,
          })),
        }
      }
      throw new MediaError(MEDIA_ERROR_CODES.LOCATION_UNAVAILABLE, '当前媒体位置不支持远程获取。', { stage: 'download' })
    } catch (error) {
      await fs.promises.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  }

  async cleanup(acquisition) {
    if (!acquisition?.cacheDir) return
    await fs.promises.rm(acquisition.cacheDir, { recursive: true, force: true }).catch(() => {})
  }
}
