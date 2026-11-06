// 打字状态保活：周期性 sendTyping(status=TYPING) 让微信显示"对方正在输入..."。
// 微信"正在输入"状态维持期只有几秒，必须 ~4s 内持续刷新才能维持，间隔太长会闪烁/消失。
// typing_ticket 来自 getConfig(userId, contextToken)，缓存复用，sendTyping 失败时重取；
// 上限 5 分钟；stop 时发 CANCEL_TYPING 与 TYPING 配对。status=1/2 必须配对。
import { TYPING, CANCEL_TYPING } from '@openilink/openilink-sdk-node'

const TICK_MS = 4 * 1000 // 微信正在输入维持期短，4s 刷新保证不中断
const MAX_MS = 5 * 60 * 1000

export class TypingKeepalive {
  constructor({ client, getUserId, getContextToken, logger = console } = {}) {
    this._client = client
    this._getUserId = typeof getUserId === 'function' ? getUserId : null
    this._getContextToken = typeof getContextToken === 'function' ? getContextToken : null
    this._logger = logger
    this._timer = null
    this._startedAt = 0
    this._lastTicket = ''
    this._userId = ''
    this._running = false
  }

  async start() {
    const userId = this._getUserId && this._getUserId()
    const contextToken = this._getContextToken && this._getContextToken()
    if (!userId || !contextToken || !this._client) return false
    this._userId = userId
    this._running = true
    this._startedAt = Date.now()
    // 首次取 ticket + 发一次 typing；失败不致命，interval 里会重试
    await this._refreshTicket().catch(e => { this._logger && this._logger.warn && this._logger.warn('[TypingKeepalive] first ticket failed:', e && e.message) })
    await this._sendTyping().catch(() => {})
    this._timer = setInterval(() => {
      if (!this._running) return
      if (Date.now() - this._startedAt >= MAX_MS) { this.stop().catch(() => {}); return }
      this._sendTyping().catch(async () => {
        // sendTyping 失败：ticket 可能过期，重新取再发
        await this._refreshTicket().catch(() => {})
      })
    }, TICK_MS)
    return true
  }

  async _refreshTicket() {
    const ctx = await this._client.getConfig(this._userId, (this._getContextToken && this._getContextToken()) || '')
    const ticket = (ctx && ctx.typing_ticket) || ''
    if (ticket) this._lastTicket = ticket
  }

  async _sendTyping() {
    if (!this._lastTicket) await this._refreshTicket()
    if (!this._lastTicket || !this._client) return
    await this._client.sendTyping(this._userId, this._lastTicket, TYPING)
  }

  async stop() {
    this._running = false
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    if (this._userId && this._lastTicket && this._client) {
      try { await this._client.sendTyping(this._userId, this._lastTicket, CANCEL_TYPING) }
      catch (e) { /* 配对失败可忽略：会话自然过期，不影响后续发送 */ }
    }
    this._userId = ''
    this._lastTicket = ''
  }
}