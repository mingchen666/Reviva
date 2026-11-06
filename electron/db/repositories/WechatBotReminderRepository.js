import { dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

// weekday 列存逗号分隔字符串（如 "1,3,5"）；单天兼容旧数据（整数 1）。
function parseWeekdays(val) {
  if (val == null) return []
  const s = String(val).trim()
  if (!s) return []
  return s.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x))
}

// 微信 Bot 自定义提醒专属表：原 wechatBridgeReminders KV（JSON 数组）拆出，支持单条 CRUD 及 tick 索引查询。
export class WechatBotReminderRepository extends BaseRepository {
  listReminders() {
    return this.db.prepare("SELECT * FROM wechat_bot_reminders WHERE (type != 'onetime' OR done = 0) ORDER BY created_at ASC, rowid ASC").all().map(row => this._parseReminder(row))
  }

  listEnabledReminders() {
    return this.db.prepare("SELECT * FROM wechat_bot_reminders WHERE enabled = 1 AND (type != 'onetime' OR done = 0) ORDER BY created_at ASC, rowid ASC").all().map(row => this._parseReminder(row))
  }

  getReminder(id) {
    return this._parseReminder(this.db.prepare('SELECT * FROM wechat_bot_reminders WHERE id = ?').get(id))
  }

  addReminder(data = {}) {
    const id = (data.id && String(data.id)) || ('rm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7))
    const name = String(data.name || '提醒')
    const content = String(data.content || '')
    const time = String(data.time || '20:00')
    const type = ['daily', 'weekly', 'onetime'].includes(data.type) ? data.type : 'daily'
    const weekday = Array.isArray(data.weekday)
      ? (data.weekday.length ? data.weekday.join(',') : null)
      : (data.weekday != null && data.weekday !== '' ? String(data.weekday) : null)
    const date = data.type === 'onetime' ? String(data.date || '') : null
    const enabled = data.enabled === false ? 0 : 1
    this.db.prepare('INSERT INTO wechat_bot_reminders (id, name, content, time, type, weekday, date, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, content, time, type, weekday, date, enabled)
    return this.getReminder(id)
  }

  updateReminder(id, data = {}) {
    const clean = { ...data }
    if (Array.isArray(clean.weekday)) {
      clean.weekday = clean.weekday.length ? clean.weekday.join(',') : null
    }
    dynamicUpdate(this.db, 'wechat_bot_reminders', id, clean, [], ['enabled'])
    return this.getReminder(id)
  }

  deleteReminder(id) {
    this.db.prepare('DELETE FROM wechat_bot_reminders WHERE id = ?').run(id)
    return { success: true }
  }
  markDone(id) {
    this.db.prepare("UPDATE wechat_bot_reminders SET done = 1, updated_at = datetime('now') WHERE id = ?").run(id)
    return { success: true }
  }

  _parseReminder(row) {
    if (!row) return null
    const weekdays = parseWeekdays(row.weekday)
    return {
      id: row.id,
      name: row.name || '',
      content: row.content || '',
      time: row.time || '20:00',
      type: ['daily', 'weekly', 'onetime'].includes(row.type) ? row.type : 'daily',
      weekday: weekdays.length ? weekdays[0] : null,
      weekdays,
      date: row.date || null,
      done: !!row.done,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
