import {
  ARTIFACT_LIST_COLUMNS,
  TASK_RESULT_LIST_COLUMNS,
  dynamicUpdate,
  parseJSON,
  stringifyJSON,
} from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

const SQLITE_UTC_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/
const TERMINAL_TASK_STATUSES = new Set(['completed', 'done', 'failed', 'cancelled'])

function toUtcIsoTimestamp(value, fallback = '') {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  const input = SQLITE_UTC_DATETIME.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw
  const timestamp = new Date(input).getTime()
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback
}

function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(String(status || '').toLowerCase())
}

export class TaskRepository extends BaseRepository {
  listTasks() {
    return this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
      .map(row => ({ ...row, steps: parseJSON(row.steps), params: parseJSON(row.params_json) }))
  }

  listTasksByGroup(groupId, toolIds) {
    let sql = `SELECT ${TASK_RESULT_LIST_COLUMNS} FROM tasks WHERE group_id = ?`
    const args = [groupId]
    if (Array.isArray(toolIds) && toolIds.length) {
      sql += ` AND tool_id IN (${toolIds.map(() => '?').join(',')})`
      args.push(...toolIds)
    }
    sql += ' ORDER BY created_at DESC'
    return this.db.prepare(sql).all(...args)
      .map(row => ({ ...row, params: parseJSON(row.params_json) }))
  }

  getTask(id) {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) return null
    return { ...row, steps: parseJSON(row.steps), params: parseJSON(row.params_json) }
  }

  createTask(data) {
    const id = data.id || 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const now = new Date().toISOString()
    const status = data.status || 'pending'
    const createdAt = toUtcIsoTimestamp(data.created_at || data.createdAt, now)
    const completedAt = toUtcIsoTimestamp(
      data.completed_at || data.completedAt,
      isTerminalTaskStatus(status) ? now : '',
    )
    this.db.prepare(`INSERT INTO tasks (id, name, type, status, architecture, space_id, agent_id, skill_type, progress, steps, result, error, tool_id, mode, conversation_id, group_id, params_json, artifact_id, cloud_task_id, created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.type || 'agent', status, data.architecture || '',
      data.space_id || '', data.agent_id || '', data.skill_type || '', data.progress || 0,
      stringifyJSON(data.steps || []), data.result || '', data.error || '',
      data.tool_id || '', data.mode || 'local',
      data.conversation_id || '', data.group_id || 'default',
      stringifyJSON(data.params || data.params_json || {}),
      data.artifact_id || '', data.cloud_task_id || '', createdAt, now, completedAt || null)
    return this.getTask(id)
  }

  updateTask(id, data = {}) {
    const now = new Date().toISOString()
    const payload = { ...data, updated_at: now }
    if (data.completed_at !== undefined || data.completedAt !== undefined) {
      payload.completed_at = toUtcIsoTimestamp(data.completed_at || data.completedAt, '')
      delete payload.completedAt
    }
    if (isTerminalTaskStatus(data.status) && !payload.completed_at) {
      payload.completed_at = now
    }
    if (data.params !== undefined && data.params_json === undefined) {
      payload.params_json = data.params
      delete payload.params
    }
    dynamicUpdate(this.db, 'tasks', id, payload, ['steps', 'params_json'])
    return { success: true }
  }

  deleteTask(id) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return { success: true }
  }

  listOutputs() {
    return this.db.prepare('SELECT * FROM outputs ORDER BY created_at DESC').all()
  }

  createOutput(data) {
    const id = data.id || 'out_' + Date.now()
    this.db.prepare(`INSERT INTO outputs (id, name, type, category, agent_name, skill_name, format, file_path, file_size, content, space_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.type || 'summary', data.category || 'desk',
      data.agent_name || '', data.skill_name || '', data.format || 'Markdown',
      data.file_path || '', data.file_size || '', data.content || '', data.space_id || '')
    return { id, ...data }
  }

  deleteOutput(id) {
    this.db.prepare('DELETE FROM outputs WHERE id = ?').run(id)
    return { success: true }
  }

  listArtifactsByGroup(groupId) {
    return this.db.prepare(`SELECT ${ARTIFACT_LIST_COLUMNS} FROM artifacts WHERE group_id = ? ORDER BY created_at DESC`).all(groupId)
  }

  getArtifact(id) {
    return this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
  }

  createArtifact(data) {
    const id = data.id || 'art_' + Date.now()
    this.db.prepare(`INSERT INTO artifacts (id, group_id, conversation_id, title, type, icon, color, storage_type, file_path, content, agent_name, skill_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.group_id || 'default', data.conversation_id || '',
      data.title || '', data.type || 'summary', data.icon || 'ri-file-line',
      data.color || 'brand', data.storage_type || 'data',
      data.file_path || '', data.content || '',
      data.agent_name || '', data.skill_name || '')
    return this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
  }

  deleteArtifact(id) {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id)
    return { success: true }
  }

  updateArtifact(id, data) {
    return dynamicUpdate(this.db, 'artifacts', id, data)
  }
}
