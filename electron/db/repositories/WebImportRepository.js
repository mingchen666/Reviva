import {
  WEB_IMPORT_TARGET_TYPES,
  WEB_IMPORT_STATUSES,
  WEB_IMPORT_STAGES,
  WEB_IMPORT_FINISHED_STATUSES,
  parseJSON,
  stringifyJSON,
  dynamicUpdate,
} from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class WebImportRepository extends BaseRepository {
  _parseWebImportJob(row) {
    if (!row) return null
    return {
      ...row,
      formats: parseJSON(row.formats_json) || ['markdown'],
      result_paths: parseJSON(row.result_paths_json) || [],
      usage: parseJSON(row.usage_json) || {},
    }
  }

  _validateWebImportJobFields({ target_type, status, stage }, { requireTarget = false } = {}) {
    if (requireTarget || target_type !== undefined) {
      if (!WEB_IMPORT_TARGET_TYPES.has(target_type)) throw new Error(`Invalid web import target type: ${target_type}`)
    }
    if (status !== undefined && !WEB_IMPORT_STATUSES.has(status)) throw new Error(`Invalid web import status: ${status}`)
    if (stage !== undefined && !WEB_IMPORT_STAGES.has(stage)) throw new Error(`Invalid web import stage: ${stage}`)
  }

  createWebImportJob(data = {}) {
    const targetType = String(data.target_type || data.targetType || '')
    const targetRef = String(data.target_ref ?? data.targetRef ?? '')
    const requestedUrl = String(data.requested_url || data.requestedUrl || '')
    const provider = String(data.provider || '')
    const status = String(data.status || 'pending')
    const stage = String(data.stage || 'queued')
    this._validateWebImportJobFields({ target_type: targetType, status, stage }, { requireTarget: true })
    if (!requestedUrl) throw new Error('Web import requested URL is required')
    if (!provider) throw new Error('Web import provider is required')

    const id = data.id || 'webjob_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
    const now = data.created_at || data.createdAt || new Date().toISOString()
    this.db.prepare(`INSERT INTO web_import_jobs (
      id, target_type, target_ref, requested_url, final_url, provider, formats_json,
      status, stage, progress, title, file_name, result_paths_json, source_id, error_code,
      error_message, usage_json, retry_of, created_at, started_at, completed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      targetType,
      targetRef,
      requestedUrl,
      data.final_url || data.finalUrl || '',
      provider,
      stringifyJSON(data.formats || data.formats_json || ['markdown']),
      status,
      stage,
      Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0,
      data.title || '',
      data.file_name || data.fileName || '',
      stringifyJSON(data.result_paths || data.result_paths_json || []),
      data.source_id || data.sourceId || '',
      data.error_code || data.errorCode || '',
      data.error_message || data.errorMessage || '',
      stringifyJSON(data.usage || data.usage_json || {}),
      data.retry_of || data.retryOf || '',
      now,
      data.started_at || data.startedAt || '',
      data.completed_at || data.completedAt || '',
      data.updated_at || data.updatedAt || now,
    )
    return this.getWebImportJob(id)
  }

  getWebImportJob(id) {
    return this._parseWebImportJob(this.db.prepare('SELECT * FROM web_import_jobs WHERE id = ?').get(id))
  }

  listWebImportJobs({ targetType, targetRef, limit = 20, offset = 0 } = {}) {
    const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))
    const normalizedOffset = Math.min(100000, Math.max(0, Math.trunc(Number(offset) || 0)))
    const clauses = []
    const params = []
    if (targetType !== undefined) {
      this._validateWebImportJobFields({ target_type: targetType })
      clauses.push('target_type = ?')
      params.push(targetType)
    }
    if (targetRef !== undefined) {
      clauses.push('target_ref = ?')
      params.push(String(targetRef))
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.db.prepare(`SELECT * FROM web_import_jobs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, normalizedLimit, normalizedOffset)
      .map(row => this._parseWebImportJob(row))
  }

  listLearningDocsWebImportJobs() {
    return this.db.prepare(`SELECT * FROM web_import_jobs WHERE target_type = 'docs'
      ORDER BY updated_at DESC, created_at DESC, id ASC`).all().map(row => this._parseWebImportJob(row))
  }

  getLearningDocsWebImportJob(id) {
    return this._parseWebImportJob(this.db.prepare(`SELECT * FROM web_import_jobs
      WHERE id = ? AND target_type = 'docs'`).get(String(id || '')))
  }

  updateWebImportJob(id, patch = {}) {
    const payload = { ...patch }
    if (payload.formats !== undefined && payload.formats_json === undefined) payload.formats_json = payload.formats
    if (payload.result_paths !== undefined && payload.result_paths_json === undefined) payload.result_paths_json = payload.result_paths
    if (payload.usage !== undefined && payload.usage_json === undefined) payload.usage_json = payload.usage
    delete payload.formats
    delete payload.result_paths
    delete payload.usage
    this._validateWebImportJobFields(payload)
    dynamicUpdate(this.db, 'web_import_jobs', id, payload, ['formats_json', 'result_paths_json', 'usage_json'])
    return this.getWebImportJob(id)
  }

  deleteWebImportJob(id) {
    const result = this.db.prepare('DELETE FROM web_import_jobs WHERE id = ?').run(id)
    return { success: true, changes: result.changes }
  }

  clearFinishedWebImportJobs({ targetType, targetRef } = {}) {
    this._validateWebImportJobFields({ target_type: targetType }, { requireTarget: true })
    const placeholders = WEB_IMPORT_FINISHED_STATUSES.map(() => '?').join(', ')
    const result = this.db.prepare(`DELETE FROM web_import_jobs
      WHERE target_type = ? AND target_ref = ? AND status IN (${placeholders})`)
      .run(targetType, String(targetRef ?? ''), ...WEB_IMPORT_FINISHED_STATUSES)
    return { success: true, changes: result.changes }
  }

  listPendingWebImportJobs() {
    return this.db.prepare("SELECT * FROM web_import_jobs WHERE status = 'pending' ORDER BY created_at ASC")
      .all()
      .map(row => this._parseWebImportJob(row))
  }

  markRunningWebImportJobsInterrupted() {
    const completedAt = new Date().toISOString()
    const result = this.db.prepare(`UPDATE web_import_jobs SET
      status = 'interrupted',
      error_code = 'WEB_IMPORT_INTERRUPTED',
      error_message = '任务因应用退出而中断，可以手动重新导入。',
      completed_at = ?,
      updated_at = ?
      WHERE status = 'running'`).run(completedAt, completedAt)
    return { success: true, changes: result.changes }
  }
}

