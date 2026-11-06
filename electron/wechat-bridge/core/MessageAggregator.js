// 入站消息聚合：同一微信用户 15s 窗口内的多条消息合并为一条文本。
// 首条到达即启动计时，窗口内后续消息追加，到点 flush；窗口被 flush 后清空。
// 聚合意义：用户习惯把一句话拆成几条发，合并后喂给 Agent 才完整。
const FLUSH_MS = 10 * 1000

export class MessageAggregator {
  constructor({ onFlush, logger = console } = {}) {
    this._onFlush = typeof onFlush === 'function' ? onFlush : null
    this._logger = logger
    this._buffers = new Map() // userId -> { parts[], contextToken, timer, firstAt }
  }

  /** 追加一条入站文本；contextToken 取最后有效值 */
  push(userId, text, contextToken = '') {
    if (!userId || !text) return
    let buf = this._buffers.get(userId)
    if (!buf) {
      buf = { parts: [], contextToken: '', timer: null, firstAt: Date.now() }
      this._buffers.set(userId, buf)
    }
    buf.parts.push(String(text))
    if (contextToken && !buf.contextToken) buf.contextToken = String(contextToken)
    if (buf.timer) clearTimeout(buf.timer)
    buf.timer = setTimeout(() => this._flush(userId), FLUSH_MS)
  }

  /** 立即冲刷指定用户（用于 /new 等需要立刻响应的命令） */
  flushNow(userId) { return this._flush(userId) }

  _flush(userId) {
    const buf = this._buffers.get(userId)
    if (!buf) return null
    this._buffers.delete(userId)
    if (buf.timer) { clearTimeout(buf.timer); buf.timer = null }
    const text = buf.parts.join('\n').trim()
    if (!text) return null
    const meta = { partCount: buf.parts.length, contextToken: buf.contextToken }
    Promise.resolve(this._onFlush && this._onFlush(userId, text, buf.contextToken, meta)).catch(e => {
      this._logger && this._logger.error && this._logger.error('[MessageAggregator] flush handler error:', e && e.message)
    })
    return meta
  }

  dispose() {
    for (const [, buf] of this._buffers) if (buf.timer) clearTimeout(buf.timer)
    this._buffers.clear()
  }
}