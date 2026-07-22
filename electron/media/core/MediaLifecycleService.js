import path from 'node:path'

function relativeIfMatched(candidate, root, isDirectory) {
  const resolvedCandidate = path.resolve(String(candidate || ''))
  const resolvedRoot = path.resolve(String(root || ''))
  const relative = path.relative(resolvedRoot, resolvedCandidate)
  if (relative === '') return ''
  if (!isDirectory || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative
}

function targetPath(root, relative) {
  return relative ? path.join(root, relative) : root
}

export class MediaLifecycleService {
  constructor({ mediaRepository, locationRepository, runRepository, artifactService, jobRunner } = {}) {
    this._media = mediaRepository
    this._locations = locationRepository
    this._runs = runRepository
    this._artifacts = artifactService
    this._runner = jobRunner
  }

  prepareMoveToTrash(inputPath, { isDirectory = false } = {}) {
    const locations = this._locations.listLocalFileLocations()
      .map(location => ({ location, relative: relativeIfMatched(location.locator, inputPath, isDirectory) }))
      .filter(item => item.relative !== null)
      .map(({ location, relative }) => ({ id: location.id, mediaId: location.media_id, relative }))
    const links = this._media.listDocsFileLinks()
      .map(link => ({ link, relative: relativeIfMatched(link.owner_locator, inputPath, isDirectory) }))
      .filter(item => item.relative !== null)
      .map(({ link, relative }) => ({ id: link.id, mediaId: link.media_id, relative }))
    if (!locations.length && !links.length) return null
    return { originalPath: inputPath, isDirectory, locations, links }
  }

  onRenamed(oldPath, newPath, { isDirectory = false } = {}) {
    const snapshot = this.prepareMoveToTrash(oldPath, { isDirectory })
    if (!snapshot) return { updatedLocations: 0, updatedLinks: 0 }
    for (const item of snapshot.locations) {
      this._locations.updateMediaLocation(item.id, { locator: targetPath(newPath, item.relative), availability: 'available' })
    }
    for (const item of snapshot.links) {
      this._media.updateMediaSourceLink(item.id, { ownerLocator: targetPath(newPath, item.relative), state: 'active', trashId: '' })
    }
    return { updatedLocations: snapshot.locations.length, updatedLinks: snapshot.links.length }
  }

  onMovedToTrash(trashId, snapshot) {
    if (!snapshot) return { updatedLocations: 0, updatedLinks: 0 }
    for (const item of snapshot.locations || []) this._locations.updateMediaLocation(item.id, { availability: 'trashed' })
    for (const item of snapshot.links || []) this._media.updateMediaSourceLink(item.id, { state: 'trashed', trashId })
    return { updatedLocations: snapshot.locations?.length || 0, updatedLinks: snapshot.links?.length || 0 }
  }

  onRestored(record, restoredPath) {
    const payload = record?.payload_json ? JSON.parse(record.payload_json) : {}
    const snapshot = payload.mediaLifecycle
    if (!snapshot) return { updatedLocations: 0, updatedLinks: 0 }
    for (const item of snapshot.locations || []) {
      this._locations.updateMediaLocation(item.id, { locator: targetPath(restoredPath, item.relative), availability: 'available' })
    }
    for (const item of snapshot.links || []) {
      this._media.updateMediaSourceLink(item.id, { ownerLocator: targetPath(restoredPath, item.relative), state: 'active', trashId: '' })
    }
    return { updatedLocations: snapshot.locations?.length || 0, updatedLinks: snapshot.links?.length || 0 }
  }

  async _cleanupUnreferenced(mediaIds) {
    let removedSources = 0
    let preservedSources = 0
    for (const mediaId of mediaIds) {
      if (!mediaId) continue
      if (this._media.countMediaSourceLinks(mediaId) > 0) {
        preservedSources += 1
        if (this._media.getMediaSource(mediaId)) this._media.updateMediaSource(mediaId, { lastAccessedAt: new Date().toISOString() })
        continue
      }
      if (this._runner?.cancelMediaRuns) {
        await this._runner.cancelMediaRuns(mediaId)
      } else if (this._runs?.listActiveMediaRunsForMedia?.(mediaId)?.length) {
        throw new Error('媒体解析任务仍在运行，暂未清理解析数据。')
      }
      if (!this._artifacts?.removeMediaRoot) throw new Error('媒体文件清理服务不可用。')
      await this._artifacts.removeMediaRoot(mediaId)
      const result = this._media.deleteMediaSource(mediaId)
      if (result?.changes) removedSources += 1
    }
    return { removedSources, preservedSources }
  }

  async onPermanentlyDeleted(record) {
    const payload = record?.payload_json ? JSON.parse(record.payload_json) : {}
    const snapshot = payload.mediaLifecycle
    if (!snapshot) return { removedLinks: 0, missingLocations: 0 }
    const affectedMediaIds = new Set()
    for (const item of snapshot.links || []) {
      affectedMediaIds.add(item.mediaId)
      this._media.deleteMediaSourceLink(item.id)
    }
    for (const item of snapshot.locations || []) {
      affectedMediaIds.add(item.mediaId)
      if (this._locations.getMediaLocation(item.id)) this._locations.updateMediaLocation(item.id, { availability: 'missing' })
    }
    const cleanup = await this._cleanupUnreferenced(affectedMediaIds)
    return { removedLinks: snapshot.links?.length || 0, missingLocations: snapshot.locations?.length || 0, ...cleanup }
  }

  _messageLinks(messageIds = []) {
    return this._media.listMediaSourceLinksByOwner?.('message', messageIds) || []
  }

  onMessagesDeleted(messageIds = []) {
    const links = this._messageLinks(messageIds)
    const affectedMediaIds = new Set()
    for (const link of links) {
      affectedMediaIds.add(link.media_id)
      this._media.deleteMediaSourceLink(link.id)
    }
    for (const mediaId of affectedMediaIds) {
      if (mediaId) this._media.updateMediaSource(mediaId, { lastAccessedAt: new Date().toISOString() })
    }
    return { removedLinks: links.length }
  }

  prepareConversationTrash(messageIds = []) {
    const links = this._messageLinks(messageIds)
    return links.length ? {
      messageLinks: links.map(link => ({ id: link.id, mediaId: link.media_id, ownerId: link.owner_id })),
    } : null
  }

  onConversationTrashed(trashId, snapshot) {
    for (const link of snapshot?.messageLinks || []) {
      this._media.updateMediaSourceLink(link.id, { state: 'trashed', trashId })
    }
    return { updatedLinks: snapshot?.messageLinks?.length || 0 }
  }

  onConversationRestored(snapshot, messageIdMap = {}) {
    for (const link of snapshot?.messageLinks || []) {
      this._media.updateMediaSourceLink(link.id, {
        ownerId: messageIdMap[link.ownerId] || link.ownerId,
        state: 'active',
        trashId: '',
      })
    }
    return { updatedLinks: snapshot?.messageLinks?.length || 0 }
  }

  async onConversationPermanentlyDeleted(snapshot) {
    const affectedMediaIds = new Set()
    for (const link of snapshot?.messageLinks || []) {
      affectedMediaIds.add(link.mediaId)
      this._media.deleteMediaSourceLink(link.id)
    }
    const cleanup = await this._cleanupUnreferenced(affectedMediaIds)
    return { removedLinks: snapshot?.messageLinks?.length || 0, ...cleanup }
  }
}
