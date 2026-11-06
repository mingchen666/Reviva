import { BaseRepository } from './BaseRepository.js'

// 微信 Bot 提醒推送历史：每次到点推送（成功/失败/跳过）落一条，
// 供前端"推送记录"分页查看，确认提醒有没有真的发出去。
export class WechatBotReminderLogRepository extends BaseRepository {
  addLog(data = {}) {
    const id = (data.id && String(data.id)) || ('rlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7))
    const reminderId = data.reminderId != null ? String(data.reminderId) : null
    const reminderName = String(data.reminderName || '')
    const content = String(data.content || '')
    const targetUserId = String(data.targetUserId || '')
    const status = ['success', 'failed', 'skipped'].includes(data.status) ? data.status : 'pending'
    const error = data.error != null ? String(data.error) : null
    this.db.prepare('INSERT INTO wechat_bot_reminder_log (id, reminder_id, reminder_name, content, target_user_id, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, reminderId, reminderName, content, targetUserId, status, error)
    return this.getLog(id)
  }

  getLog(id) {
    return this._parseLog(this.db.prepare('SELECT * FROM wechat_bot_reminder_log WHERE id = ?').get(id))
  }

  // 分页查最近记录：limit 默认 50，offset 默认 0，新到旧
  listLogs({ limit = 50, offset = 0 } = {}) {
    const l = Math.max(1, Math.min(200, Number(limit) || 50))
    const o = Math.max(0, Number(offset) || 0)
    return this.db.prepare('SELECT * FROM wechat_bot_reminder_log ORDER BY fired_at DESC, rowid DESC LIMIT ? OFFSET ?').all(l, o).map(row => this._parseLog(row))
  }

  countLogs() {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM wechat_bot_reminder_log').get()
    return (row && Number(row.n)) || 0
  }

  // 清空所有历史（设置页"清空记录"用）
  clearLogs() {
    this.db.prepare('DELETE FROM wechat_bot_reminder_log').run()
    return { success: true }
  }

  _parseLog(row) {
    if (!row) return null
    return {
      id: row.id,
      reminderId: row.reminder_id || null,
      reminderName: row.reminder_name || '',
      content: row.content || '',
      targetUserId: row.target_user_id || '',
      status: row.status || 'pending',
      error: row.error || null,
      firedAt: row.fired_at || '',
    }
  }
}
