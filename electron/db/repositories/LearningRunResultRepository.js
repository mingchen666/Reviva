import { BaseRepository } from './BaseRepository.js'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const RESULT_STATUSES = new Set(['running', ...TERMINAL_STATUSES])

function parseJson(value, fallback) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function stringify(value, fallback) {
  try { return JSON.stringify(value ?? fallback) } catch { return JSON.stringify(fallback) }
}

function normalizeStatus(value, fallback = 'running') {
  const status = String(value || fallback).toLowerCase()
  if (status === 'canceled') return 'cancelled'
  return RESULT_STATUSES.has(status) ? status : fallback
}

function nowIso() { return new Date().toISOString() }

export class LearningRunResultRepository extends BaseRepository {
  _parse(row) {
    if (!row) return null
    return {
      runId: row.run_id,
      conversationId: row.conversation_id,
      agentId: row.agent_id,
      assistantMessageId: row.assistant_message_id || '',
      mode: row.mode,
      status: normalizeStatus(row.status),
      markdown: row.markdown || '',
      citations: parseJson(row.citations_json, []),
      sourceRefs: parseJson(row.source_refs_json, []),
      citationMap: parseJson(row.citation_map_json, {}),
      sourceStyle: row.source_style || 'footnotes',
      errorCode: row.error_code || '',
      errorMessage: row.error_message || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
      completedAt: row.completed_at || '',
    }
  }

  createLearningRunResult(data = {}) {
    const runId = String(data.runId || data.run_id || '').trim()
    const conversationId = String(data.conversationId || data.conversation_id || '').trim()
    const agentId = String(data.agentId || data.agent_id || '').trim()
    const mode = String(data.mode || '').trim()
    if (!runId || !conversationId || !agentId || !mode) throw new Error('Learning run result requires run, conversation, agent and mode')
    const existing = this.getLearningRunResult(runId)
    if (existing) return existing
    const createdAt = String(data.createdAt || data.created_at || nowIso())
    const status = normalizeStatus(data.status)
    const completedAt = TERMINAL_STATUSES.has(status) ? String(data.completedAt || data.completed_at || createdAt) : ''
    this.db.prepare(`INSERT INTO learning_run_results (
      run_id, conversation_id, agent_id, assistant_message_id, mode, status, markdown,
      citations_json, source_refs_json, citation_map_json, source_style,
      error_code, error_message, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        runId, conversationId, agentId, String(data.assistantMessageId || data.assistant_message_id || ''), mode, status,
        String(data.markdown || ''), stringify(data.citations || data.citations_json, []),
        stringify(data.sourceRefs || data.source_refs_json, []), stringify(data.citationMap || data.citation_map_json, {}),
        String(data.sourceStyle || data.source_style || 'footnotes'), String(data.errorCode || data.error_code || ''),
        String(data.errorMessage || data.error_message || ''), createdAt,
        String(data.updatedAt || data.updated_at || createdAt), completedAt,
      )
    return this.getLearningRunResult(runId)
  }

  getLearningRunResult(runId) {
    return this._parse(this.db.prepare('SELECT * FROM learning_run_results WHERE run_id = ?').get(String(runId || '')))
  }

  updateLearningRunResult(runId, patch = {}) {
    const existing = this.getLearningRunResult(runId)
    if (!existing || TERMINAL_STATUSES.has(existing.status)) return existing
    const nextStatus = patch.status === undefined ? existing.status : normalizeStatus(patch.status, existing.status)
    const terminal = TERMINAL_STATUSES.has(nextStatus)
    const citations = patch.citations === undefined && patch.citations_json === undefined ? existing.citations : (patch.citations ?? patch.citations_json)
    const citationMap = patch.citationMap === undefined && patch.citation_map_json === undefined ? existing.citationMap : (patch.citationMap ?? patch.citation_map_json)
    const sourceStyle = patch.sourceStyle === undefined && patch.source_style === undefined
      ? existing.sourceStyle
      : String((patch.sourceStyle ?? patch.source_style) || 'footnotes')
    const errorCode = patch.errorCode === undefined && patch.error_code === undefined
      ? existing.errorCode
      : String((patch.errorCode ?? patch.error_code) || '')
    const errorMessage = patch.errorMessage === undefined && patch.error_message === undefined
      ? existing.errorMessage
      : String((patch.errorMessage ?? patch.error_message) || '')
    const completedAt = terminal ? String(patch.completedAt || patch.completed_at || nowIso()) : existing.completedAt
    this.db.prepare(`UPDATE learning_run_results SET
      status = ?, markdown = ?, citations_json = ?, citation_map_json = ?, source_style = ?,
      error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
      WHERE run_id = ?`)
      .run(nextStatus, patch.markdown === undefined ? existing.markdown : String(patch.markdown || ''), stringify(citations, []),
        stringify(citationMap, {}), sourceStyle, errorCode, errorMessage, nowIso(), completedAt, String(runId))
    return this.getLearningRunResult(runId)
  }

  getLatestLearningRunResultByConversation(conversationId) {
    return this._parse(this.db.prepare(`SELECT * FROM learning_run_results
      WHERE conversation_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1`).get(String(conversationId || '')))
  }

  listRunningLearningRunResults() {
    return this.db.prepare(`SELECT * FROM learning_run_results WHERE status = 'running'
      ORDER BY updated_at ASC, created_at ASC`).all().map(row => this._parse(row))
  }
}
