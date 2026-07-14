import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PdfCache } from './PdfCache.js'

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
}

function hashPath(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function parsePayload(record) {
  try {
    const payload = typeof record?.payload_json === 'string' ? JSON.parse(record.payload_json) : record?.payload_json
    return payload?.pdfLifecycle && typeof payload.pdfLifecycle === 'object' ? payload.pdfLifecycle : null
  } catch {
    return null
  }
}

function ownerTypeForLocator(locator) {
  if (locator.startsWith('/docs/')) return 'docs_file'
  if (locator.startsWith('/context/')) return 'context_file'
  if (locator.startsWith('/wikis/') || locator.startsWith('/wiki/')) return 'wiki_file'
  return 'workspace_file'
}

export class PdfLifecycleService {
  constructor({ dbService = null, workDirService = null } = {}) {
    this._db = dbService
    this._workDir = workDirService
    this._cache = new PdfCache({ dbService, workDirService })
  }

  async prepareMoveToTrash(inputPath, { isDirectory = false } = {}) {
    const resolved = path.resolve(inputPath)
    const locator = this._toVirtualPath(resolved)
    await this._ensureLegacyLinks(resolved, locator, isDirectory)
    const links = this._matchingLinks(locator, isDirectory).filter(link => link.state === 'active')
    const pdfIds = [...new Set(links.map(link => link.pdf_id).filter(Boolean))]
    this._db?.cancelPdfParseRuns?.(pdfIds, 'PDF source moved to recycle bin.')
    return {
      version: 1,
      originalLocator: locator,
      isDirectory: !!isDirectory,
      pdfIds,
      links: links.map(link => ({
        id: link.id,
        pdfId: link.pdf_id,
        ownerType: link.owner_type,
        ownerId: link.owner_id,
        ownerLocator: link.owner_locator,
      })),
    }
  }

  onMovedToTrash(trashId, snapshot = null) {
    const linkIds = (snapshot?.links || []).map(link => link.id).filter(Boolean)
    if (!linkIds.length) return { success: true, pdfIds: snapshot?.pdfIds || [] }
    this._db?.markPdfSourceLinksTrashed?.(linkIds, trashId)
    return { success: true, pdfIds: snapshot?.pdfIds || [] }
  }

  async onRestored(record, restoredPath) {
    const snapshot = parsePayload(record)
    let links = this._db?.listPdfSourceLinksByTrashId?.(record?.id) || []
    if (!links.length && snapshot?.links?.length) {
      const allLinks = this._db?.listPdfSourceLinks?.() || []
      const ids = new Set(snapshot.links.map(link => link.id).filter(Boolean))
      links = allLinks.filter(link => ids.has(link.id))
    }
    const oldPdfIds = [...new Set(links.map(link => link.pdf_id).filter(Boolean))]
    const restored = []
    for (const link of links) {
      const newPath = this._restoredPathForLink(record, restoredPath, link.owner_locator)
      const newLocator = this._toVirtualPath(newPath)
      this._db?.restorePdfSourceLink?.(link.id, newLocator)
      let registeredPdfId = link.pdf_id
      try {
        const stat = await fs.promises.stat(newPath)
        if (stat.isFile() && path.extname(newPath).toLowerCase() === '.pdf') {
          const doc = await this._cache.documentFor(newPath, {
            virtualPath: newLocator,
            sourceInfo: {
              origin: 'recycle_restore',
              ownerType: link.owner_type,
              ownerId: link.owner_id,
              ownerLocator: newLocator,
              reactivateLink: true,
            },
          })
          registeredPdfId = doc.id
        }
      } catch (error) {
        console.warn('[PdfLifecycle] Could not re-register restored PDF:', newPath, error.message)
      }
      restored.push({ linkId: link.id, oldPdfId: link.pdf_id, pdfId: registeredPdfId, path: newPath, locator: newLocator })
    }
    await this._cleanupOrphanDocuments(oldPdfIds)
    return { success: true, restored }
  }

  async onRenamed(oldPath, newPath, { isDirectory = false } = {}) {
    const oldResolved = path.resolve(oldPath)
    const newResolved = path.resolve(newPath)
    const oldLocator = this._toVirtualPath(oldResolved)
    await this._ensureLegacyLinks(oldResolved, oldLocator, isDirectory)
    const links = this._matchingLinks(oldLocator, isDirectory).filter(link => link.state === 'active')
    const oldPdfIds = [...new Set(links.map(link => link.pdf_id).filter(Boolean))]
    for (const link of links) {
      const targetPath = this._mappedPath(oldResolved, newResolved, link.owner_locator, isDirectory)
      const targetLocator = this._toVirtualPath(targetPath)
      this._db?.updatePdfSourceLink?.(link.id, { owner_locator: targetLocator })
      try {
        const stat = await fs.promises.stat(targetPath)
        if (stat.isFile() && path.extname(targetPath).toLowerCase() === '.pdf') {
          await this._cache.documentFor(targetPath, {
            virtualPath: targetLocator,
            sourceInfo: {
              origin: 'docs_rename',
              ownerType: link.owner_type,
              ownerId: link.owner_id,
              ownerLocator: targetLocator,
              reactivateLink: true,
            },
          })
        }
      } catch (error) {
        console.warn('[PdfLifecycle] Could not update renamed PDF:', targetPath, error.message)
      }
    }
    await this._cleanupOrphanDocuments(oldPdfIds)
    return { success: true, count: links.length }
  }

  async onPermanentlyDeleted(record) {
    const snapshot = parsePayload(record)
    let links = this._db?.listPdfSourceLinksByTrashId?.(record?.id) || []
    if (!links.length && snapshot?.links?.length) {
      const linkIds = new Set(snapshot.links.map(link => link.id).filter(Boolean))
      links = (this._db?.listPdfSourceLinks?.() || []).filter(link => linkIds.has(link.id))
      this._db?.markPdfSourceLinksTrashed?.(links.map(link => link.id), record?.id || '')
    }
    const targetLinkIds = new Set(links.map(link => link.id).filter(Boolean))
    const pdfIds = [...new Set([
      ...links.map(link => link.pdf_id),
      ...(snapshot?.pdfIds || []),
    ].filter(Boolean))]
    this._db?.cancelPdfParseRuns?.(pdfIds, 'PDF source permanently deleted.')

    const purgePdfIds = []
    for (const pdfId of pdfIds) {
      const remaining = (this._db?.listPdfSourceLinksForPdf?.(pdfId) || []).filter(link => !targetLinkIds.has(link.id))
      if (remaining.length) continue
      await this._cache.removeDocumentCache(pdfId)
      purgePdfIds.push(pdfId)
    }

    this._db?.deletePdfSourceLinks?.([...targetLinkIds])
    for (const pdfId of purgePdfIds) this._db?.deletePdfDocument?.(pdfId)
    return { success: true, pdfIds, purgedPdfIds: purgePdfIds }
  }

  async _cleanupOrphanDocuments(pdfIds = []) {
    for (const pdfId of [...new Set(pdfIds.filter(Boolean))]) {
      if ((this._db?.countPdfSourceLinks?.(pdfId) || 0) > 0) continue
      await this._cache.removeDocumentCache(pdfId)
      this._db?.deletePdfDocument?.(pdfId)
    }
  }

  _matchingLinks(locator, isDirectory) {
    const target = toPosix(locator).replace(/\/$/, '').toLowerCase()
    return (this._db?.listPdfSourceLinks?.() || []).filter(link => {
      const value = toPosix(link.owner_locator).replace(/\/$/, '').toLowerCase()
      return isDirectory ? value === target || value.startsWith(target + '/') : value === target
    })
  }

  async _ensureLegacyLinks(resolvedPath, locator, isDirectory) {
    if (!isDirectory && this._matchingLinks(locator, false).length) return
    if (!isDirectory) {
      const existingByHash = this._db?.findPdfDocumentByPathHash?.(hashPath(path.resolve(resolvedPath)))
      if (existingByHash) {
        this._db?.upsertPdfSourceLink?.({
          pdf_id: existingByHash.id,
          owner_type: ownerTypeForLocator(locator),
          owner_locator: locator,
          state: 'active',
        })
      }
    }

    const root = this._workDir?.getRootPath?.()
    if (!root) return
    const contextRoot = path.join(root, 'context', 'pdf')
    let entries = []
    try {
      entries = await fs.promises.readdir(contextRoot, { withFileTypes: true })
    } catch {
      return
    }
    const target = toPosix(locator).replace(/\/$/, '').toLowerCase()
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('pdf_')) continue
      let manifest
      try {
        manifest = JSON.parse(await fs.promises.readFile(path.join(contextRoot, entry.name, 'manifest.json'), 'utf-8'))
      } catch {
        continue
      }
      const manifestLocator = toPosix(manifest?.virtualPath).replace(/\/$/, '')
      const value = manifestLocator.toLowerCase()
      const matches = isDirectory ? value === target || value.startsWith(target + '/') : value === target
      if (!matches || !this._db?.getPdfDocument?.(manifest?.pdfId || entry.name)) continue
      this._db?.upsertPdfSourceLink?.({
        pdf_id: manifest.pdfId || entry.name,
        owner_type: ownerTypeForLocator(manifestLocator),
        owner_locator: manifestLocator,
        state: 'active',
      })
    }
  }

  _restoredPathForLink(record, restoredPath, ownerLocator) {
    return this._mappedPath(record?.original_path || '', restoredPath, ownerLocator, !!record?.is_directory)
  }

  _mappedPath(oldRoot, newRoot, ownerLocator, isDirectory) {
    if (!isDirectory) return path.resolve(newRoot)
    const ownerPath = this._toAbsolutePath(ownerLocator)
    const relative = path.relative(path.resolve(oldRoot), ownerPath)
    if (!relative || relative === '.') return path.resolve(newRoot)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return path.join(path.resolve(newRoot), path.basename(ownerPath))
    return path.join(path.resolve(newRoot), relative)
  }

  _toVirtualPath(absPath) {
    const root = this._workDir?.getRootPath?.()
    const resolved = path.resolve(absPath)
    if (!root) return toPosix(resolved)
    const relative = path.relative(path.resolve(root), resolved)
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? '/' + toPosix(relative)
      : toPosix(resolved)
  }

  _toAbsolutePath(locator) {
    const value = String(locator || '')
    const root = this._workDir?.getRootPath?.()
    if (root && /^\/(docs|context|wikis|wiki|notes|agents|skills|\.reviva)(\/|$)/i.test(value)) {
      return path.resolve(root, ...value.replace(/^\/+/, '').split('/').filter(Boolean))
    }
    return path.resolve(value)
  }
}
