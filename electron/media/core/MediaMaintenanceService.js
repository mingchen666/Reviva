import fs from 'node:fs'
import path from 'node:path'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function isSameOrInside(target, root) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function statOrNull(target) {
  try { return await fs.promises.lstat(target) } catch { return null }
}

async function directorySize(target) {
  const stat = await statOrNull(target)
  if (!stat) return 0
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size || 0
  let total = 0
  const entries = await fs.promises.readdir(target, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) total += await directorySize(path.join(target, entry.name))
  return total
}

async function childDirectories(root) {
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => [])
  const result = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink?.()) continue
    const target = path.join(root, entry.name)
    const stat = await statOrNull(target)
    if (stat) result.push({ name: entry.name, path: target, mtimeMs: stat.mtimeMs || 0 })
  }
  return result
}

export class MediaMaintenanceService {
  constructor({ workDirService, mediaRepository, runRepository, artifactService, intervalMs = 6 * HOUR_MS } = {}) {
    this._workDir = workDirService
    this._media = mediaRepository
    this._runs = runRepository
    this._artifacts = artifactService
    this._intervalMs = Math.max(HOUR_MS, Number(intervalMs) || 6 * HOUR_MS)
    this._timer = null
    this._running = null
    this._started = false
  }

  _mediaRoot() {
    const root = this._workDir?.getRootPath?.()
    return root ? path.resolve(root, 'context', 'media') : ''
  }

  async start() {
    if (this._started) return
    this._started = true
    await this.runNow().catch(() => null)
    this._schedule()
  }

  stop() {
    this._started = false
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
  }

  _schedule() {
    if (!this._started || this._timer) return
    this._timer = setTimeout(() => {
      this._timer = null
      this.runNow().catch(() => null).finally(() => this._schedule())
    }, this._intervalMs)
    this._timer.unref?.()
  }

  async _removeInside(target, root) {
    if (!target || !root || !isSameOrInside(target, root) || path.resolve(target) === path.resolve(root)) return false
    await fs.promises.rm(target, { recursive: true, force: true })
    return true
  }

  async _cleanupAgeBased(activeRunIds, now) {
    const mediaRoot = this._mediaRoot()
    const result = { tempDirs: 0, cacheDirs: 0 }
    if (!mediaRoot || !fs.existsSync(mediaRoot)) return result
    for (const mediaDir of await childDirectories(mediaRoot)) {
      for (const candidate of await childDirectories(path.join(mediaDir.path, 'temp'))) {
        if (activeRunIds.has(candidate.name) || now - candidate.mtimeMs < DAY_MS) continue
        if (await this._removeInside(candidate.path, mediaRoot)) result.tempDirs += 1
      }
      for (const candidate of await childDirectories(path.join(mediaDir.path, 'cache'))) {
        if (activeRunIds.has(candidate.name) || now - candidate.mtimeMs < 7 * DAY_MS) continue
        if (await this._removeInside(candidate.path, mediaRoot)) result.cacheDirs += 1
      }
    }
    return result
  }

  async _enforceCacheQuota(activeRunIds, quotaBytes = 20 * 1024 * 1024 * 1024) {
    const mediaRoot = this._mediaRoot()
    const candidates = []
    if (!mediaRoot || !fs.existsSync(mediaRoot)) return { removed: 0, bytesBefore: 0, bytesAfter: 0 }
    for (const mediaDir of await childDirectories(mediaRoot)) {
      for (const candidate of await childDirectories(path.join(mediaDir.path, 'cache'))) {
        const sizeBytes = await directorySize(candidate.path)
        candidates.push({ ...candidate, sizeBytes, active: activeRunIds.has(candidate.name) })
      }
    }
    const bytesBefore = candidates.reduce((sum, item) => sum + item.sizeBytes, 0)
    let bytesAfter = bytesBefore
    let removed = 0
    for (const item of candidates.filter(item => !item.active).sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (bytesAfter <= quotaBytes) break
      if (await this._removeInside(item.path, mediaRoot)) {
        bytesAfter -= item.sizeBytes
        removed += 1
      }
    }
    return { removed, bytesBefore, bytesAfter }
  }

  async _pruneRuns(now) {
    const result = { runs: 0, bytes: 0 }
    const mediaRoot = this._mediaRoot()
    if (!mediaRoot) return result
    for (const source of this._media.listMediaSources({ limit: 5000 })) {
      if (source.pinned) continue
      const retained = new Set(this._runs.listRetainedMediaRuns(source.id).map(run => run.id))
      const runs = this._runs.listMediaRuns(source.id, { limit: 200 })
      for (const run of runs) {
        if (retained.has(run.id) || ['queued', 'running'].includes(run.status)) continue
        const terminalRecordOnly = ['failed', 'cancelled'].includes(run.status)
        const updatedAt = new Date(run.finished_at || run.updated_at || run.created_at || 0).getTime()
        if (terminalRecordOnly && (!updatedAt || now - updatedAt < 90 * DAY_MS)) continue
        const runDir = this._artifacts.paths(source.id, run.id).runDir
        const sizeBytes = await directorySize(runDir)
        if (fs.existsSync(runDir) && !(await this._removeInside(runDir, mediaRoot))) continue
        this._runs.deleteMediaRun(run.id)
        result.runs += 1
        result.bytes += sizeBytes
      }
    }
    return result
  }

  async _collectUnreferencedSources(now) {
    const result = { sources: 0, bytes: 0 }
    const mediaRoot = this._mediaRoot()
    if (!mediaRoot) return result
    for (const source of this._media.listMediaSources({ limit: 5000 })) {
      if (source.pinned || String(source.artifact_retention_policy || 'referenced') !== 'referenced') continue
      if (this._media.countMediaSourceLinks(source.id) > 0) continue
      if (this._runs.listMediaRuns(source.id, { limit: 20 }).some(run => ['queued', 'running'].includes(run.status))) continue
      const updatedAt = new Date(source.updated_at || source.created_at || 0).getTime()
      if (!updatedAt || now - updatedAt < DAY_MS) continue
      const sourceRoot = path.join(mediaRoot, source.id)
      const sizeBytes = await directorySize(sourceRoot)
      if (fs.existsSync(sourceRoot) && !(await this._removeInside(sourceRoot, mediaRoot))) continue
      this._media.deleteMediaSource(source.id)
      result.sources += 1
      result.bytes += sizeBytes
    }
    return result
  }

  runNow(options = {}) {
    if (this._running) return this._running
    this._running = (async () => {
      const now = Date.now()
      const activeRunIds = new Set(this._runs.listActiveMediaRuns(500).map(run => run.id))
      const ageCleanup = await this._cleanupAgeBased(activeRunIds, now)
      const quota = await this._enforceCacheQuota(activeRunIds, Number(options.quotaBytes) || 20 * 1024 * 1024 * 1024)
      const runPruning = await this._pruneRuns(now)
      const garbageCollection = await this._collectUnreferencedSources(now)
      return { success: true, ageCleanup, quota, runPruning, garbageCollection, finishedAt: new Date().toISOString() }
    })().finally(() => { this._running = null })
    return this._running
  }
}
