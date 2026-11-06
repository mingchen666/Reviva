// 斜杠命令 + 关键词模糊匹配。固定文案统一从 BotResponses 引用，改文案只动那一个文件。
// 返回 { handled, reply?, action? }：handled=false 时交给 Agent；action 由 WeChatBridgeService 解释。
import { RESPONSES, HELP_KEYWORDS } from './BotResponses.js'

export class CommandHandler {
  constructor({ dbService, fileContextManager, logger = console } = {}) {
    this._db = dbService
    this._fileCtx = fileContextManager
    this._logger = logger
  }
  // 可选：注入 getUserCtx，让 /status 显示主动推送是否就绪
  setGetUserCtx(fn) { this._getUserCtx = typeof fn === 'function' ? fn : null }

  // 判断一段文本是否为命令（/开头 或 命中帮助关键词）。
  // 供 _onMessage 决定是否跳过防抖立即处理。
  static isCommand(text) {
    const t = String(text || '').trim()
    if (!t) return false
    if (t.startsWith('/')) return true
    return HELP_KEYWORDS.test(t) && t.length <= 12
  }

  handle({ userId, text }) {
    const t = String(text || '').trim()
    if (!t) return { handled: false }
    if (!CommandHandler.isCommand(t)) return { handled: false }
    // 关键词触发（非斜杠）= help
    if (!t.startsWith('/')) return { handled: true, reply: RESPONSES.help }
    const body = t.slice(1)
    const sp = body.indexOf(' ')
    const cmd = (sp > 0 ? body.slice(0, sp) : body).toLowerCase()
    const arg = sp > 0 ? body.slice(sp + 1).trim() : ''
    switch (cmd) {
      case 'help': case '?': case '？': return { handled: true, reply: RESPONSES.help }
      case 'new': return { handled: true, reply: RESPONSES.newConv, action: { type: 'new-conversation', userId } }
      case 'clear': return { handled: true, reply: RESPONSES.clearConv, action: { type: 'clear-conversation', userId } }
      case 'agent': return { handled: true, reply: this._agent(arg) }
      case 'status': return { handled: true, reply: this._status() }
      case 'files': return { handled: true, reply: this._files() }
      case 'doc': return this._doc(userId, arg)
      default: return { handled: true, reply: RESPONSES.unknownCmd(cmd) }
    }
  }

  _agents() {
    return (this._db && typeof this._db.listAgents === 'function') ? this._db.listAgents() : []
  }

  _currentAgentId() {
    const raw = this._db && typeof this._db.getSetting === 'function' ? this._db.getSetting('wechatBridgeConfig') : null
    return (raw && raw.defaultAgentId) || ''
  }

  _agent(arg) {
    const list = this._agents()
    if (!list.length) return RESPONSES.noAgents
    const curId = this._currentAgentId()
    if (!arg) {
      const lines = list.map(a => {
        const mark = a.id === curId ? ' ✓当前' : ''
        return '· ' + (a.name || a.id) + (a.model ? '（' + a.model + '）' : '') + mark
      })
      return RESPONSES.agentListTitle + '\n' + lines.join('\n') + RESPONSES.agentListHint
    }
    const kw = arg.toLowerCase()
    const exact = list.filter(a => {
      return (a.name || '').toLowerCase() === arg || (a.englishName || a.english_name || '').toLowerCase() === kw
    })
    if (exact.length === 1) return { __action: true, reply: RESPONSES.agentSwitched(exact[0].name || exact[0].id), action: { type: 'switch-agent', agentId: exact[0].id } }
    const fuzzy = list.filter(a => {
      const n = (a.name || '').toLowerCase()
      const e = (a.englishName || a.english_name || '').toLowerCase()
      const d = (a.desc || a.description || '').toLowerCase()
      return n.includes(kw) || e.includes(kw) || d.includes(kw)
    })
    if (exact.length > 1 || fuzzy.length === 1) {
      const pick = exact.length > 1 ? exact : fuzzy
      if (pick.length === 1) return { __action: true, reply: RESPONSES.agentSwitched(pick[0].name || pick[0].id), action: { type: 'switch-agent', agentId: pick[0].id } }
      return RESPONSES.agentMulti + '\n' + pick.map(a => '· ' + (a.name || a.id)).join('\n')
    }
    if (!fuzzy.length) return RESPONSES.agentNone(arg)
    return RESPONSES.agentMulti + '\n' + fuzzy.map(a => '· ' + (a.name || a.id)).join('\n')
  }

  _status() {
    const list = this._agents()
    const curId = this._currentAgentId()
    const agent = list.find(a => a.id === curId) || null
    if (!agent) return RESPONSES.statusNoAgent
    const userCtx = this._getUserCtx ? this._getUserCtx() : null
    const n = userCtx ? userCtx.size : 0
    const pushLine = n > 0 ? RESPONSES.statusPushReady(n) : RESPONSES.statusPushNoToken
    return RESPONSES.statusTitle + '\n' + RESPONSES.statusLine(agent.name || agent.id, agent.model || '未指定') + RESPONSES.statusConnected + pushLine
  }

  _files() {
    const files = this._fileCtx ? this._fileCtx.listFiles() : []
    if (!files.length) return RESPONSES.noFiles
    const lines = files.map((f, i) => {
      const mount = f.mounted ? ' [挂载]' : ''
      const kb = f.size ? ' ' + Math.round(f.size / 1024) + 'KB' : ''
      return (i + 1) + '. ' + f.name + kb + mount
    })
    return RESPONSES.filesTitle + '\n' + lines.join('\n')
  }

  _doc(userId, arg) {
    if (!arg) return { handled: true, reply: RESPONSES.docUsage }
    const files = this._fileCtx ? this._fileCtx.listFiles() : []
    if (!files.length) return { handled: true, reply: RESPONSES.noFiles }
    const kw = arg.toLowerCase()
    const match = files.find(f => f.name.toLowerCase().includes(kw))
    if (!match) return { handled: true, reply: RESPONSES.fileNotFound(arg) }
    return { __action: true, reply: RESPONSES.docMarked(match.name), action: { type: 'doc', userId, filePath: match.path } }
  }
}

// 把 _agent / _doc 可能返回的 { __action, reply, action } 归一化为 { handled, reply, action }
export function normalizeCommandResult(r) {
  if (r && r.__action) return { handled: true, reply: r.reply, action: r.action }
  if (typeof r === 'string') return { handled: true, reply: r }
  return r
}
