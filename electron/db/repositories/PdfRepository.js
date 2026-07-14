import crypto from 'node:crypto'
import { parseJSON, stringifyJSON, dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class PdfRepository extends BaseRepository {
  _parsePdfDocument(row) {
    if (!row) return null
    return {
      ...row,
      owners: parseJSON(row.owners_json) || [],
    }
  }

  _parsePdfParseRun(row) {
    if (!row) return null
    return {
      ...row,
      page_ranges: parseJSON(row.page_ranges_json) || [],
      metrics: parseJSON(row.metrics_json) || {},
    }
  }

  _parsePdfSourceLink(row) {
    if (!row) return null
    return { ...row }
  }


  getPdfDocument(id) {
    return this._parsePdfDocument(this.db.prepare('SELECT * FROM pdf_documents WHERE id = ?').get(id))
  }

  upsertPdfDocument(data = {}) {
    const existing = data?.id ? this.getPdfDocument(data.id) : null
    if (existing) return this.updatePdfDocument(data.id, data)
    const id = data.id || 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO pdf_documents (id, workspace_id, file_name, real_path_hash, file_size, mtime_ms, content_hash, page_count, pdf_text_mode, cache_path, status, owners_json, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.workspace_id || '',
      data.file_name || '',
      data.real_path_hash || '',
      data.file_size || 0,
      data.mtime_ms || 0,
      data.content_hash || '',
      data.page_count || 0,
      data.pdf_text_mode || '',
      data.cache_path || '',
      data.status || 'pending',
      stringifyJSON(data.owners || data.owners_json || []),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
      data.last_accessed_at || '',
    )
    return this.getPdfDocument(id)
  }

  updatePdfDocument(id, data = {}) {
    const payload = { ...data }
    if (payload.owners !== undefined && payload.owners_json === undefined) {
      payload.owners_json = payload.owners
      delete payload.owners
    }
    return this._parsePdfDocument(dynamicUpdate(this.db, 'pdf_documents', id, payload, ['owners_json']))
  }

  findPdfDocumentByPathHash(realPathHash) {
    if (!realPathHash) return null
    return this._parsePdfDocument(this.db.prepare('SELECT * FROM pdf_documents WHERE real_path_hash = ? ORDER BY updated_at DESC LIMIT 1').get(realPathHash))
  }

  deletePdfDocument(id) {
    const remove = this.db.transaction(() => {
      this.db.prepare('DELETE FROM pdf_source_links WHERE pdf_id = ?').run(id)
      this.db.prepare('DELETE FROM pdf_parse_runs WHERE pdf_id = ?').run(id)
      this.db.prepare('DELETE FROM pdf_documents WHERE id = ?').run(id)
    })
    remove()
    return { success: true }
  }

  listPdfSourceLinks() {
    return this.db.prepare('SELECT * FROM pdf_source_links ORDER BY updated_at DESC, created_at DESC').all().map(row => this._parsePdfSourceLink(row))
  }

  listPdfSourceLinksForPdf(pdfId) {
    return this.db.prepare('SELECT * FROM pdf_source_links WHERE pdf_id = ? ORDER BY updated_at DESC, created_at DESC').all(pdfId).map(row => this._parsePdfSourceLink(row))
  }

  listPdfSourceLinksByTrashId(trashId) {
    if (!trashId) return []
    return this.db.prepare('SELECT * FROM pdf_source_links WHERE trash_id = ? ORDER BY updated_at DESC, created_at DESC').all(trashId).map(row => this._parsePdfSourceLink(row))
  }

  upsertPdfSourceLink(data = {}) {
    const ownerType = String(data.owner_type || data.ownerType || 'workspace_file').trim() || 'workspace_file'
    const ownerId = String(data.owner_id || data.ownerId || '').trim()
    const ownerLocator = String(data.owner_locator || data.ownerLocator || '').trim().replace(/\\/g, '/')
    if (!data.pdf_id || !ownerLocator) return null
    const existing = this.db.prepare(`SELECT * FROM pdf_source_links
      WHERE owner_type = ? AND owner_id = ? AND owner_locator = ? COLLATE NOCASE
        AND state = 'active' AND trash_id = '' LIMIT 1`).get(ownerType, ownerId, ownerLocator)
    if (existing) {
      const reactivate = !!data.reactivate
      const state = reactivate ? (data.state || 'active') : (existing.state === 'trashed' ? 'trashed' : (data.state || existing.state || 'active'))
      const trashId = reactivate ? '' : (existing.state === 'trashed' ? existing.trash_id : (data.trash_id ?? existing.trash_id ?? ''))
      dynamicUpdate(this.db, 'pdf_source_links', existing.id, {
        pdf_id: data.pdf_id,
        state,
        trash_id: trashId,
      })
      return this._parsePdfSourceLink(this.db.prepare('SELECT * FROM pdf_source_links WHERE id = ?').get(existing.id))
    }
    const id = data.id || `pdf_link_${crypto.randomUUID()}`
    this.db.prepare(`INSERT INTO pdf_source_links
      (id, pdf_id, owner_type, owner_id, owner_locator, state, trash_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.pdf_id,
      ownerType,
      ownerId,
      ownerLocator,
      data.state || 'active',
      data.trash_id || '',
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this._parsePdfSourceLink(this.db.prepare('SELECT * FROM pdf_source_links WHERE id = ?').get(id))
  }

  updatePdfSourceLink(id, data = {}) {
    return this._parsePdfSourceLink(dynamicUpdate(this.db, 'pdf_source_links', id, data))
  }

  markPdfSourceLinksTrashed(linkIds = [], trashId = '') {
    const ids = [...new Set((linkIds || []).filter(Boolean))]
    if (!ids.length) return []
    const update = this.db.prepare("UPDATE pdf_source_links SET state = 'trashed', trash_id = ?, updated_at = datetime('now') WHERE id = ?")
    this.db.transaction(() => {
      for (const id of ids) update.run(trashId, id)
    })()
    return ids.map(id => this._parsePdfSourceLink(this.db.prepare('SELECT * FROM pdf_source_links WHERE id = ?').get(id))).filter(Boolean)
  }

  restorePdfSourceLink(id, ownerLocator) {
    return this.updatePdfSourceLink(id, {
      owner_locator: String(ownerLocator || '').replace(/\\/g, '/'),
      state: 'active',
      trash_id: '',
    })
  }

  deletePdfSourceLinks(linkIds = []) {
    const ids = [...new Set((linkIds || []).filter(Boolean))]
    if (!ids.length) return { success: true, changes: 0 }
    const remove = this.db.prepare('DELETE FROM pdf_source_links WHERE id = ?')
    let changes = 0
    this.db.transaction(() => {
      for (const id of ids) changes += remove.run(id).changes
    })()
    return { success: true, changes }
  }

  countPdfSourceLinks(pdfId) {
    if (!pdfId) return 0
    return this.db.prepare('SELECT COUNT(*) AS count FROM pdf_source_links WHERE pdf_id = ?').get(pdfId)?.count || 0
  }

  hasActivePdfSourceLink(pdfId) {
    if (!pdfId) return false
    return !!this.db.prepare("SELECT 1 FROM pdf_source_links WHERE pdf_id = ? AND state = 'active' LIMIT 1").get(pdfId)
  }

  listPdfParseRuns(pdfId) {
    return this.db.prepare('SELECT * FROM pdf_parse_runs WHERE pdf_id = ? ORDER BY updated_at DESC, created_at DESC').all(pdfId).map(r => this._parsePdfParseRun(r))
  }

  getPdfParseRun(id) {
    return this._parsePdfParseRun(this.db.prepare('SELECT * FROM pdf_parse_runs WHERE id = ?').get(id))
  }

  cancelPdfParseRuns(pdfIds = [], message = 'PDF source is no longer active.') {
    const ids = [...new Set((pdfIds || []).filter(Boolean))]
    if (!ids.length) return { success: true, changes: 0 }
    const update = this.db.prepare(`UPDATE pdf_parse_runs
      SET status = 'cancelled', progress = 100, error_code = 'PDF_SOURCE_INACTIVE', error_message = ?, updated_at = datetime('now')
      WHERE pdf_id = ? AND status IN ('pending', 'running')`)
    let changes = 0
    this.db.transaction(() => {
      for (const pdfId of ids) changes += update.run(message, pdfId).changes
    })()
    return { success: true, changes }
  }

  cancelInterruptedPdfParseRuns() {
    const result = this.db.prepare(`UPDATE pdf_parse_runs
      SET status = 'cancelled', progress = 100, error_code = 'PDF_RUN_INTERRUPTED',
          error_message = 'PDF parsing was interrupted before the application restarted.', updated_at = datetime('now')
      WHERE status IN ('pending', 'running')`).run()
    return { success: true, changes: result.changes }
  }

  createPdfParseRun(data = {}) {
    const id = data.id || 'pdf_run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO pdf_parse_runs (id, pdf_id, mode, provider_id, provider_type, ocr_profile_key, page_ranges_json, status, progress, output_path, error_code, error_message, metrics_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.pdf_id,
      data.mode || '',
      data.provider_id || '',
      data.provider_type || '',
      data.ocr_profile_key || '',
      stringifyJSON(data.page_ranges || data.page_ranges_json || []),
      data.status || 'pending',
      data.progress || 0,
      data.output_path || '',
      data.error_code || '',
      data.error_message || '',
      stringifyJSON(data.metrics || data.metrics_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this._parsePdfParseRun(this.db.prepare('SELECT * FROM pdf_parse_runs WHERE id = ?').get(id))
  }

  updatePdfParseRun(id, data = {}) {
    const existing = this.getPdfParseRun(id)
    if (!existing) return null
    if (existing.status === 'cancelled' && data.status && data.status !== 'cancelled') return existing
    const payload = { ...data }
    if (payload.page_ranges !== undefined && payload.page_ranges_json === undefined) {
      payload.page_ranges_json = payload.page_ranges
      delete payload.page_ranges
    }
    if (payload.metrics !== undefined && payload.metrics_json === undefined) {
      payload.metrics_json = payload.metrics
      delete payload.metrics
    }
    return this._parsePdfParseRun(dynamicUpdate(this.db, 'pdf_parse_runs', id, payload, ['page_ranges_json', 'metrics_json']))
  }

}

