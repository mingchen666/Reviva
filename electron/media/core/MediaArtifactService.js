import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from './MediaErrors.js'

function assertSafeId(value, label) {
  const id = String(value || '')
  if (!id || !/^[a-z0-9_]+$/i.test(id)) throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, `无效的 ${label}。`)
  return id
}

function isSameOrInside(target, root) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export class MediaArtifactService {
  constructor({ workDirService, artifactRepository, mediaRepository, runRepository } = {}) {
    this._workDir = workDirService
    this._artifacts = artifactRepository
    this._media = mediaRepository
    this._runs = runRepository
  }

  _workspaceRoot() {
    const root = this._workDir?.getRootPath?.()
    if (!root) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_UNAVAILABLE, '工作区尚未初始化。')
    return path.resolve(root)
  }

  mediaRoot(mediaId) {
    const safeMediaId = assertSafeId(mediaId, 'mediaId')
    const root = path.join(this._workspaceRoot(), 'context', 'media')
    const target = path.join(root, safeMediaId)
    if (target === root || !isSameOrInside(target, root)) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '媒体目录路径越界。')
    }
    return target
  }

  paths(mediaId, runId) {
    const safeRunId = assertSafeId(runId, 'runId')
    const mediaRoot = this.mediaRoot(mediaId)
    return {
      mediaRoot,
      sourceDir: path.join(mediaRoot, 'source'),
      runsDir: path.join(mediaRoot, 'runs'),
      runDir: path.join(mediaRoot, 'runs', safeRunId),
      tempRoot: path.join(mediaRoot, 'temp'),
      tempDir: path.join(mediaRoot, 'temp', safeRunId),
      currentSnapshot: path.join(mediaRoot, 'current.json'),
    }
  }

  async prepareRun(mediaId, runId, { reset = false } = {}) {
    const paths = this.paths(mediaId, runId)
    if (reset && fs.existsSync(paths.tempDir)) await fs.promises.rm(paths.tempDir, { recursive: true, force: true })
    await fs.promises.mkdir(path.join(paths.tempDir, 'analysis'), { recursive: true })
    await fs.promises.mkdir(path.join(paths.tempDir, 'index'), { recursive: true })
    await fs.promises.mkdir(paths.runsDir, { recursive: true })
    return paths
  }

  _tempTarget(mediaId, runId, relativePath) {
    const paths = this.paths(mediaId, runId)
    const target = path.resolve(paths.tempDir, String(relativePath || ''))
    if (!isSameOrInside(target, paths.tempDir)) {
      throw new MediaError(MEDIA_ERROR_CODES.INVALID_ARGUMENT, '媒体产物路径越界。')
    }
    return target
  }

  async writeTempText(mediaId, runId, relativePath, content) {
    const target = this._tempTarget(mediaId, runId, relativePath)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.writeFile(target, String(content ?? ''), 'utf8')
    return target
  }

  async writeTempJson(mediaId, runId, relativePath, value) {
    return this.writeTempText(mediaId, runId, relativePath, JSON.stringify(value, null, 2))
  }

  async cleanupTemp(mediaId, runId) {
    const { tempDir } = this.paths(mediaId, runId)
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  }

  async removeMediaRoot(mediaId) {
    const mediaRoot = this.mediaRoot(mediaId)
    await fs.promises.rm(mediaRoot, { recursive: true, force: true })
    return { success: true, mediaRoot }
  }

  async restoreRun(mediaId, runId) {
    const source = this._media?.getMediaSource?.(mediaId)
    const run = this._runs?.getMediaRun?.(runId)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    if (!run || run.media_id !== mediaId || !['ready', 'partial'].includes(run.status)) {
      throw new MediaError(MEDIA_ERROR_CODES.RUN_NOT_RESTORABLE, '所选解析历史不能恢复。')
    }
    const paths = this.paths(mediaId, runId)
    const artifacts = this._artifacts.listMediaArtifacts(runId)
    if (!fs.existsSync(paths.runDir) || !artifacts.length) {
      throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_MISSING, '历史解析文件已不存在，无法恢复。')
    }
    for (const artifact of artifacts.filter(item => item.status === 'ready' || item.status === 'partial')) {
      const target = path.resolve(paths.mediaRoot, String(artifact.relative_path || ''))
      if (!artifact.relative_path || !isSameOrInside(target, paths.mediaRoot) || !fs.existsSync(target)) {
        throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_MISSING, `历史解析产物缺失：${artifact.type}`)
      }
    }
    const availableTypes = new Set(artifacts
      .filter(item => item.status === 'ready' || item.status === 'partial')
      .map(item => item.type))
    const contentAvailability = availableTypes.has('transcript')
      ? 'transcript_ready'
      : (availableTypes.has('keyframes') ? 'visual_only' : 'metadata_only')
    const result = this._artifacts.restorePublishedRun({ mediaId, runId, contentAvailability })
    try {
      await fs.promises.writeFile(paths.currentSnapshot, JSON.stringify({
        mediaId,
        runId,
        contentAvailability,
        restoredAt: new Date().toISOString(),
      }, null, 2), 'utf8')
    } catch {
      // The database remains the source of truth.
    }
    return result
  }

  async readFrameAsset(mediaId, frameId, { thumbnail = true } = {}) {
    assertSafeId(mediaId, 'mediaId')
    assertSafeId(frameId, 'frameId')
    const frame = this._artifacts.getMediaFrameForMedia(mediaId, frameId)
    if (!frame) throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_NOT_FOUND, '视频关键帧不存在。')
    const source = this._media?.getMediaSource?.(mediaId)
    if (!source) throw new MediaError(MEDIA_ERROR_CODES.SOURCE_NOT_FOUND, '媒体来源不存在。')
    const mediaRoot = this.paths(mediaId, frame.run_id).mediaRoot
    const relativePath = thumbnail ? (frame.thumbnail_path || frame.image_path) : frame.image_path
    const target = path.resolve(mediaRoot, String(relativePath || ''))
    if (!relativePath || !isSameOrInside(target, mediaRoot) || !fs.existsSync(target)) {
      throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_MISSING, '视频关键帧文件已丢失。')
    }
    const stat = await fs.promises.stat(target)
    if (stat.size > 12 * 1024 * 1024) throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_INVALID, '视频关键帧文件过大。')
    const extension = path.extname(target).toLowerCase()
    const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
    const data = await fs.promises.readFile(target)
    return { success: true, mediaId, frameId, mimeType, dataUrl: `data:${mimeType};base64,${data.toString('base64')}` }
  }

  async publishRun({ mediaId, runId, artifacts = [], ...payload } = {}) {
    const paths = this.paths(mediaId, runId)
    if (fs.existsSync(paths.tempDir)) {
      if (fs.existsSync(paths.runDir)) {
        throw new MediaError(MEDIA_ERROR_CODES.PUBLISH_FAILED, '目标解析版本目录已经存在。', { stage: 'publish' })
      }
      await fs.promises.mkdir(paths.runsDir, { recursive: true })
      await fs.promises.rename(paths.tempDir, paths.runDir)
    }
    if (!fs.existsSync(paths.runDir)) {
      throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_MISSING, '解析产物目录不存在，无法发布。', { stage: 'publish' })
    }

    const normalizedArtifacts = []
    for (const artifact of artifacts) {
      const insideRunPath = String(artifact.path || artifact.relativePath || '').replace(/^[/\\]+/, '')
      const absolutePath = path.resolve(paths.runDir, insideRunPath)
      if (!isSameOrInside(absolutePath, paths.runDir) || !fs.existsSync(absolutePath)) {
        throw new MediaError(MEDIA_ERROR_CODES.ARTIFACT_MISSING, `媒体产物缺失：${insideRunPath}`, { stage: 'publish' })
      }
      const stat = await fs.promises.stat(absolutePath)
      normalizedArtifacts.push({
        ...artifact,
        path: undefined,
        relativePath: path.relative(paths.mediaRoot, absolutePath).replace(/\\/g, '/'),
        sizeBytes: stat.size,
      })
    }

    const result = this._artifacts.publishMediaRun({ mediaId, runId, artifacts: normalizedArtifacts, ...payload })
    try {
      await fs.promises.writeFile(paths.currentSnapshot, JSON.stringify({
        mediaId,
        runId,
        contentAvailability: payload.contentAvailability,
        publishedAt: new Date().toISOString(),
      }, null, 2), 'utf8')
    } catch {
      // current.json is a portable snapshot; the database remains the source of truth.
    }
    return result
  }
}
