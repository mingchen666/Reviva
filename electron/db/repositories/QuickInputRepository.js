import crypto from 'node:crypto'
import { BaseRepository } from './BaseRepository.js'

const QUICK_INPUT_TYPES = new Set(['command', 'context', 'format'])

function validationError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeQuickInput(data = {}, current = {}) {
  const title = String(data.title ?? current.title ?? '').trim()
  const type = String(data.type ?? current.type ?? 'command').trim()
  const content = String(data.content ?? current.content ?? '').trim()
  const description = String(data.description ?? current.description ?? '').trim()

  if (!title) throw validationError('QUICK_INPUT_TITLE_REQUIRED', '快捷输入名称不能为空')
  if (title.length > 20) throw validationError('QUICK_INPUT_TITLE_TOO_LONG', '快捷输入名称不能超过 20 个字符')
  if (!QUICK_INPUT_TYPES.has(type)) throw validationError('QUICK_INPUT_TYPE_INVALID', '快捷输入类型无效')
  if (!content) throw validationError('QUICK_INPUT_CONTENT_REQUIRED', '快捷输入内容不能为空')

  const enabledValue = data.enabled ?? current.enabled ?? true
  return {
    title,
    type,
    content,
    description,
    enabled: enabledValue !== false && enabledValue !== 0,
    sortOrder: Number.isFinite(Number(data.sortOrder ?? data.sort_order))
      ? Number(data.sortOrder ?? data.sort_order)
      : Number(current.sortOrder ?? 0),
  }
}

export class QuickInputRepository extends BaseRepository {
  _parse(row) {
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      content: row.content,
      description: row.description || '',
      enabled: !!row.enabled,
      sortOrder: Number(row.sort_order || 0),
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    }
  }

  listQuickInputs() {
    return this.db.prepare(`
      SELECT * FROM quick_inputs
      ORDER BY sort_order ASC, updated_at DESC, title COLLATE NOCASE ASC
    `).all().map(row => this._parse(row))
  }

  getQuickInput(id) {
    return this._parse(this.db.prepare('SELECT * FROM quick_inputs WHERE id = ?').get(id))
  }

  createQuickInput(data = {}) {
    const input = normalizeQuickInput(data)
    const id = data.id || `quick_${crypto.randomUUID()}`
    const maxSort = this.db.prepare('SELECT COALESCE(MAX(sort_order), -10) AS value FROM quick_inputs').get()?.value ?? -10
    const sortOrder = Number.isFinite(Number(data.sortOrder ?? data.sort_order))
      ? Number(data.sortOrder ?? data.sort_order)
      : Number(maxSort) + 10

    this.db.prepare(`
      INSERT INTO quick_inputs (id, title, type, content, description, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.title, input.type, input.content, input.description, input.enabled ? 1 : 0, sortOrder)
    return this.getQuickInput(id)
  }

  updateQuickInput(id, data = {}) {
    const current = this.getQuickInput(id)
    if (!current) throw validationError('QUICK_INPUT_NOT_FOUND', '快捷输入不存在')
    const input = normalizeQuickInput(data, current)
    this.db.prepare(`
      UPDATE quick_inputs
      SET title = ?, type = ?, content = ?, description = ?, enabled = ?, sort_order = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(input.title, input.type, input.content, input.description, input.enabled ? 1 : 0, input.sortOrder, id)
    return this.getQuickInput(id)
  }

  deleteQuickInput(id) {
    this.db.prepare('DELETE FROM quick_inputs WHERE id = ?').run(id)
    return { success: true }
  }

  reorderQuickInputs(ids = []) {
    const orderedIds = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))]
    const update = this.db.prepare("UPDATE quick_inputs SET sort_order = ?, updated_at = datetime('now') WHERE id = ?")
    const apply = this.db.transaction(() => {
      orderedIds.forEach((id, index) => update.run(index * 10, id))
    })
    apply()
    return this.listQuickInputs()
  }
}
