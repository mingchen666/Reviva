// 提醒推送调度：自定义提醒列表（每日 / 每周 / 一次性），到点主动推送。
// 主动推送用 client.sendText(userId, text, contextToken)；无 contextToken（用户未发过消息）则跳过。

const CHECK_MS = 60 * 1000

export class ReminderScheduler {
  constructor({ dbService, agentService = null, getClient, getUserCtx, logger = console } = {}) {
    this._db = dbService
    this._agent = agentService
    this._getClient = typeof getClient === 'function' ? getClient : null
    this._getUserCtx = typeof getUserCtx === 'function' ? getUserCtx : null
    this._logger = logger
    this._timer = null
    this._fired = {} // reminderId|HH:MM -> 已触发标记，防同一分钟重复
  }

  start() {
    if (this._timer) return
    this._timer = setInterval(() => this._tick(), CHECK_MS)
    this._tick()
    this._logger.info && this._logger.info('[ReminderScheduler] started, check every ' + (CHECK_MS / 1000) + 's')
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  _tick() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const hhmm = hh + ':' + mm
    try { this._doTickBody(now, hhmm) } catch (e) {
      this._logger.warn && this._logger.warn('[ReminderScheduler] tick error:', e && e.message)
    }
  }

  _doTickBody(now, hhmm) {
    const weekday = now.getDay()
    // 自定义提醒
    const list = this._listReminders()
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
    for (const r of list) {
      if (r.enabled === false) continue
      const key = r.id || r.name
      if (this._fired[key] === hhmm) continue
      const timeOk = r.time === hhmm
      let dayOk = true
      if (r.type === 'weekly') {
        const days = Array.isArray(r.weekdays) ? r.weekdays : (r.weekday != null ? [Number(r.weekday)] : [])
        dayOk = days.includes(weekday)
      }
      else if (r.type === 'onetime') dayOk = r.date === todayStr
      if (timeOk && dayOk) {
        this._fired[key] = hhmm
        this._pushAll('【' + (r.name || '提醒') + '】' + (r.content || ''), { reminderId: r.id, reminderName: r.name, content: r.content })
        // 一次性提醒触发后标记完成，避免重复推送
        if (r.type === 'onetime' && this._db && typeof this._db.markWxReminderDone === 'function') {
          try { this._db.markWxReminderDone(r.id) } catch (e) {}
        }
      }
    }
    // 清理过期 fired 标记（跨分钟后）
    const todayKey = hhmm
    for (const k of Object.keys(this._fired)) {
      if (this._fired[k] !== todayKey) delete this._fired[k]
    }
  }

  _listReminders() {
    if (this._db && typeof this._db.listEnabledWxReminders === 'function') return this._db.listEnabledWxReminders()
    return []
  }

  _pushAll(text, meta = {}) {
    const client = this._getClient && this._getClient()
    const userCtx = this._getUserCtx && this._getUserCtx()
    if (!client) {
      this._logger.warn && this._logger.warn('[ReminderScheduler] push skipped: bot client 未就绪（未连接或登录中）')
      this._logPush(meta, '', 'skipped', 'bot client 未就绪（未连接或登录中）')
      return
    }
    if (!userCtx || userCtx.size === 0) {
      this._logger.warn && this._logger.warn('[ReminderScheduler] push skipped: 无 context_token。提醒需用户先在微信里给 bot 发过一条消息建立 context_token，重启 Reviva 后也会从 KV 自动回填；若仍为空，请用微信给 bot 发任意一条消息。')
      this._logPush(meta, '', 'skipped', '无 context_token（用户未给 bot 发过消息）')
      return
    }
    for (const [userId, token] of userCtx) {
      // 优先用 service 缓存的 token；缺则回退到 SDK 内部 contextTokens（monitor 自动维护）
      const useToken = token || (typeof client.getContextToken === 'function' ? client.getContextToken(userId) : '')
      if (!useToken) {
        this._logger.warn && this._logger.warn('[ReminderScheduler] push skipped for', userId, ': 该用户无 context_token')
        this._logPush(meta, userId, 'skipped', '该用户无 context_token')
        continue
      }
      // SDK sendText 有 15s 超时，iLink 服务器临时慢会被 abort。
      // 提醒很重要，超时类错误重试一次（2s 后），其他错误直接记失败。
      const trySend = (attempt) => {
        Promise.resolve(client.sendText(userId, text, useToken)).then(() => {
          this._logger.info && this._logger.info('[ReminderScheduler] pushed to', userId, ':', String(text).slice(0, 48))
          this._logPush(meta, userId, 'success', null)
        }).catch(e => {
          const msg = e && e.message
          if (attempt < 1 && /abort|timeout|ETIMEDOUT|ECONNRESET|fetch/i.test(msg || '')) {
            this._logger.warn && this._logger.warn('[ReminderScheduler] push retry (' + (attempt + 1) + ') for', userId, ':', msg)
            setTimeout(() => trySend(attempt + 1), 2000)
            return
          }
          this._logger.warn && this._logger.warn('[ReminderScheduler] push failed for', userId, ':', msg)
          this._logPush(meta, userId, 'failed', msg)
        })
      }
      trySend(0)
    }
  }

  // 每次推送（成功/失败/跳过）落一条到 wechat_bot_reminder_log，
  // 前端"推送记录"分页查看，确认提醒到底有没有发出去、为什么没发。
  _logPush(meta, targetUserId, status, error) {
    if (!this._db || typeof this._db.addWxReminderLog !== 'function') return
    try {
      this._db.addWxReminderLog({
        reminderId: meta.reminderId || null,
        reminderName: meta.reminderName || '',
        content: meta.content || '',
        targetUserId: targetUserId || '',
        status, error,
      })
    } catch (e) {}
  }
}
