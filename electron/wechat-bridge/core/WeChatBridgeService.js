// 微信 Bot 桥接主服务：生命周期、SDK monitor 长轮询、会话过期处理、自动恢复。
// 消息处理管线：入站 → MessageAggregator(15s) → AgentRunner(复用 handleStartRun)
//               → TypingKeepalive → chunkText → client.sendText
// 文件：FILE 消息下载到「微信bot文件」目录；纯链接导入为 .url.md；最近 10 个挂载为 Agent ctxPaths。
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@openilink/openilink-sdk-node'
import { ITEM_TYPE_TEXT, ITEM_TYPE_VOICE, ITEM_TYPE_FILE, ITEM_TYPE_IMAGE } from '@openilink/openilink-sdk-node'
import { QrLoginService } from './QrLoginService.js'
import { AgentRunner } from './AgentRunner.js'
import { MessageAggregator } from './MessageAggregator.js'
import { TypingKeepalive } from './TypingKeepalive.js'
import { chunkText } from './MessageChunker.js'
import { FileImporter, isPureUrl } from './FileImporter.js'
import { ReminderScheduler } from './ReminderScheduler.js'
import { FileContextManager } from './FileContextManager.js'
import { CommandHandler, normalizeCommandResult } from './CommandHandler.js'
import { RESPONSES } from './BotResponses.js'
import {
  loadBridgeConfig, saveBridgeConfig,
  loadBridgeCredentials, saveBridgeCredentials, clearBridgeCredentials,
  clearBridgeContextTokens,
  loadBridgeUserCtx, saveBridgeUserCtx, clearBridgeUserCtx,
} from './BridgeConfig.js'

const PAUSE_WINDOW_MS = 60 * 60 * 1000
const SEND_GAP_MS = 300 // 多段回复之间的间隔，避免刷屏

export class WeChatBridgeService {
  constructor({ dbService, secretStore, agentService = null, workDirService = null, getWin, logger = console }) {
    this.db = dbService
    this.secretStore = secretStore
    this.agentService = agentService
    this.workDirService = workDirService
    this.getWin = getWin
    this.logger = logger
    this.client = null
    this._connected = false
    this._monitorRunning = false
    this._shouldContinue = false
    this._botId = null
    this._userId = null
    this._expiredUntil = null
    this._userCtx = new Map() // userId -> contextToken
    this._runningUsers = new Set()
    this._aggregator = null
    this._agentRunner = null
    this._fileImporter = null
    this._fileCtx = null
    this._commandHandler = null
    this._convOverride = new Map()
    this._focusFiles = new Map()
    this._pendingImages = new Map()
    this._introPending = false
    this._scheduler = new ReminderScheduler({
      dbService: this.db, agentService: this.agentService,
      getClient: () => this.client, getUserCtx: () => this._userCtx, logger: this.logger,
    })
  }

  _send(channel, payload) {
    try {
      const win = typeof this.getWin === 'function' ? this.getWin() : null
      if (win && win.webContents && !win.isDestroyed()) win.webContents.send(channel, payload)
    } catch (e) {
      this.logger.warn && this.logger.warn('[WeChatBridge] send failed:', e && e.message)
    }
  }

  _initPipeline() {
    if (this._agentRunner) return
    this._agentRunner = new AgentRunner({ dbService: this.db, agentService: this.agentService, logger: this.logger })
    this._fileImporter = new FileImporter({ workDirService: this.workDirService, logger: this.logger })
    this._fileCtx = new FileContextManager({ workDirService: this.workDirService, logger: this.logger })
    this._commandHandler = new CommandHandler({ dbService: this.db, fileContextManager: this._fileCtx, logger: this.logger })
    this._commandHandler.setGetUserCtx(() => this._userCtx)
    this._aggregator = new MessageAggregator({
      logger: this.logger,
      onFlush: (userId, text, contextToken) => this._handleAggregated(userId, text, contextToken),
    })
  }

  // Bot conversations are grouped under a dedicated group (id wxbot)
  _ensureBotGroup() {
    try {
      const groups = (this.db && typeof this.db.listConvGroups === 'function') ? this.db.listConvGroups() : []
      const exists = groups.some(g => g.id === 'wxbot')
      if (!exists && this.db && typeof this.db.createConvGroup === 'function') {
        this.db.createConvGroup({ id: 'wxbot', name: 'Bot 对话', sort_order: 100 })
      }
    } catch (e) { this.logger.warn && this.logger.warn('[WeChatBridge] ensure bot group failed:', e && e.message) }
  }

  _attachClient(client) {
    this.client = client
    if (this._fileImporter) this._fileImporter.setClient(client)
    this._restoreUserCtx(client)
  }

  // 回填持久化的 context_token：Reviva 重启后内存 _userCtx 与 SDK 的
  // client.contextTokens 都是空的，到点提醒会因无 token 静默跳过。
  // 这里从 KV 读回，灌进 _userCtx 和 client.contextTokens。
  _restoreUserCtx(client) {
    try {
      const persisted = loadBridgeUserCtx(this.db)
      if (!persisted.size) return
      for (const [userId, token] of persisted) {
        if (!this._userCtx.has(userId)) this._userCtx.set(userId, token)
        if (client && typeof client.setContextToken === 'function') client.setContextToken(userId, token)
      }
      this.logger.info && this.logger.info('[WeChatBridge] restored ' + persisted.size + ' user context token(s) from kv')
    } catch (e) {
      this.logger.warn && this.logger.warn('[WeChatBridge] restore user ctx failed:', e && e.message)
    }
  }

  getStatus() {
    let expired = false
    let retryAfterMs = null
    if (this._expiredUntil) {
      const remain = this._expiredUntil - Date.now()
      if (remain > 0) { expired = true; retryAfterMs = remain }
      else { this._expiredUntil = null }
    }
    const connected = this._connected && !expired
    let botId = this._botId
    let userId = this._userId
    if (!botId || !userId) {
      const creds = loadBridgeCredentials(this.db, this.secretStore)
      if (creds) { botId = botId || creds.botId; userId = userId || creds.userId }
    }
    return { running: this._monitorRunning, connected, expired, retryAfterMs, botId: botId || null, userId: userId || null }
  }

  getConfig() { return loadBridgeConfig(this.db) }

  async setConfig(patch) {
    const next = saveBridgeConfig(this.db, patch || {})
    if (patch && patch.enabled !== undefined) {
      if (patch.enabled === true) await this.start()
      else await this.stop()
    }
    return { success: true, config: next }
  }

  getAgents() {
    const list = (this.db && typeof this.db.listAgents === 'function') ? this.db.listAgents() : []
    return {
      agents: list.map(a => ({
        id: a.id,
        name: a.name || a.title || '',
        description: a.desc || a.description || '',
        model: a.model || '',
        icon: a.icon || '',
        englishName: a.englishName || a.english_name || '',
      })),
    }
  }

  listFiles() {
    const files = this._fileCtx ? this._fileCtx.listFiles() : []
    return { files, dirPath: this._fileCtx ? this._fileCtx.getDir() : null }
  }

  listImages() {
    return this._fileImporter ? this._fileImporter.listImages() : []
  }

  listReminders() { return { reminders: this.db.listWxReminders() } }

  addReminder(r) {
    const reminder = this.db.addWxReminder(r || {})
    return { success: true, reminder }
  }

  deleteReminder(id) {
    return this.db.deleteWxReminder(id)
  }

  updateReminder(id, data) {
    const reminder = this.db.updateWxReminder(id, data || {})
    return { success: true, reminder }
  }

  // 推送历史记录：分页查（limit/offset），返回 { logs, total }
  listReminderLogs(opts) {
    return { logs: this.db.listWxReminderLogs(opts), total: this.db.countWxReminderLogs() }
  }

  clearReminderLogs() { return this.db.clearWxReminderLogs() }

  async start() {
    const config = loadBridgeConfig(this.db)
    if (!config.enabled) return this.getStatus()
    this._ensureBotGroup()
    const creds = loadBridgeCredentials(this.db, this.secretStore)
    this._initPipeline()
    if (creds && creds.token) {
      this._botId = creds.botId
      this._userId = creds.userId
      this._connected = true
      this._expiredUntil = null
      const client = new Client(creds.token, { base_url: creds.baseUrl })
      this._attachClient(client)
      this._send('wechat-bridge:connected', { botId: creds.botId, userId: creds.userId, baseUrl: creds.baseUrl })
      this._beginMonitor(client)
    } else {
      this._connected = false
    }
    return this.getStatus()
  }

  async stop() {
    this._shouldContinue = false
    this._connected = false
    this._scheduler.stop()
    if (this._aggregator) this._aggregator.dispose()
    return this.getStatus()
  }

  async login() {
    this._initPipeline()
    const loginClient = new Client()
    const qr = new QrLoginService({ client: loginClient, send: (c, p) => this._send(c, p), logger: this.logger })
    const result = await qr.login()
    if (result && result.connected) {
      saveBridgeCredentials(this.db, this.secretStore, { token: result.bot_token, baseUrl: result.base_url, botId: result.bot_id, userId: result.user_id })
      saveBridgeConfig(this.db, { enabled: true })
      this._botId = result.bot_id
      this._userId = result.user_id
      this._connected = true
      this._expiredUntil = null
      this._send('wechat-bridge:connected', { botId: result.bot_id, userId: result.user_id, baseUrl: result.base_url })
      this._introPending = true
      const monitorClient = new Client(result.bot_token, { base_url: result.base_url })
      this._attachClient(monitorClient)
      this._beginMonitor(monitorClient)
    }
    return this.getStatus()
  }

  async logout() {
    this._shouldContinue = false
    this._connected = false
    this._botId = null
    this._userId = null
    this._userCtx.clear()
    this._runningUsers.clear()
    this._convOverride.clear()
    this._focusFiles.clear()
    this._clearPendingImages()
    this._introPending = false
    this._scheduler.stop()
    if (this._aggregator) this._aggregator.dispose()
    clearBridgeCredentials(this.db)
    clearBridgeContextTokens(this.db)
    clearBridgeUserCtx(this.db)
    saveBridgeConfig(this.db, { enabled: false })
    this._send('wechat-bridge:disconnected', { reason: 'logout' })
    return this.getStatus()
  }

  _beginMonitor(client) {
    this._attachClient(client)
    this._shouldContinue = true
    this._monitorRunning = true
    this._scheduler.start()
    Promise.resolve(this._runMonitor(client)).catch(e => {
      this._monitorRunning = false
      this.logger.error && this.logger.error('[WeChatBridge] monitor crashed:', e && e.message)
    })
  }

  async _runMonitor(client) {
    try {
      await client.monitor(async (msg) => this._onMessage(msg), {
        should_continue: () => this._shouldContinue,
        on_session_expired: () => this._handleSessionExpired(),
        on_error: (err) => {
          this.logger.error && this.logger.error('[WeChatBridge] monitor error:', err && err.message)
          this._send('wechat-bridge:error', { message: (err && err.message) || 'monitor error' })
        },
      })
    } finally {
      this._monitorRunning = false
    }
  }

  _handleSessionExpired() {
    clearBridgeCredentials(this.db)
    clearBridgeContextTokens(this.db)
    clearBridgeUserCtx(this.db)
    this._expiredUntil = Date.now() + PAUSE_WINDOW_MS
    this._connected = false
    this._shouldContinue = false
    this._userCtx.clear()
    this._convOverride.clear()
    this._focusFiles.clear()
    this._clearPendingImages()
    this._introPending = false
    this._scheduler.stop()
    this._send('wechat-bridge:disconnected', { reason: 'session_expired', retryAfterMs: PAUSE_WINDOW_MS })
  }

  // ── 入站消息：提取文本 → 聚合；文件 → 导入目录 ──
  _onMessage(msg) {
    const userId = String((msg && msg.from_user_id) || '')
    if (!userId) return
    if (msg && msg.context_token) {
      this._userCtx.set(userId, String(msg.context_token))
      // 持久化 context_token：Reviva 重启后仍能主动推送提醒
      try { saveBridgeUserCtx(this.db, this._userCtx) } catch (e) {
        this.logger.warn && this.logger.warn('[WeChatBridge] persist user ctx failed:', e && e.message)
      }
    }
    const contextToken = this._userCtx.get(userId) || ''
    const item = (msg && msg.item_list && msg.item_list[0]) || null
    let type = 'text'
    let content = ''
    let replyable = false
    if (item) {
      if (item.type === ITEM_TYPE_TEXT) {
        type = 'text'
        content = String((item.text_item && item.text_item.text) || '')
        replyable = !!content.trim()
      } else if (item.type === ITEM_TYPE_VOICE) {
        type = 'voice'
        const transcript = (item.voice_item && item.voice_item.text) ? item.voice_item.text : ''
        content = transcript || '[语音]'
        replyable = !!transcript.trim()
      } else if (item.type === ITEM_TYPE_IMAGE) {
        type = 'image'
        content = '[图片]'
        replyable = false
        this._importImage(userId, item.image_item)
      } else if (item.type === ITEM_TYPE_FILE) {
        type = 'file'
        content = String((item.file_item && item.file_item.file_name) || '[文件]')
        replyable = false
        this._importFile(userId, item.file_item, contextToken)
      }
    }
    this._send('wechat-bridge:message', {
      userId, direction: 'inbound', type, content,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    })
    if (replyable && this._aggregator) {
      // 命令（/开头 或 帮助关键词）立即处理，不走防抖；普通消息才聚合
      if (CommandHandler.isCommand(content)) {
        this._aggregator.flushNow(userId)
        Promise.resolve(this._handleAggregated(userId, content, contextToken)).catch(e => {
          this.logger.warn && this.logger.warn('[WeChatBridge] command handle failed:', e && e.message)
        })
      } else {
        this._aggregator.push(userId, content, contextToken)
      }
    }
  }

  // 文件消息：下载到「微信bot文件」目录（异步，不阻塞消息流）
  _importFile(userId, fileItem, contextToken) {
    if (!this._fileImporter) return
    Promise.resolve(this._fileImporter.importFileMessage(fileItem)).then(info => {
      if (info) {
        this._send('wechat-bridge:message', {
          userId, direction: 'inbound', type: 'file-imported',
          content: info.name, fileName: info.name, filePath: info.path, fileSize: info.size,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        })
        this.logger.info && this.logger.info('[WeChatBridge] file imported:', info.name)
       // 文件保存成功后通知用户
       this._reply(userId, RESPONSES.fileImported(info.name, this._humanSize(info.size)), contextToken).catch(e => {
         this.logger.warn && this.logger.warn('[WeChatBridge] file import notify failed:', e && e.message)
       })
      }
    }).catch(e => {
      this.logger.warn && this.logger.warn('[WeChatBridge] file import failed:', e && e.message)
     // 导入失败也通知用户
     const fileName = String((fileItem && fileItem.file_name) || '文件')
     this._reply(userId, RESPONSES.fileImportFail(fileName), contextToken).catch(() => {})
    })
  }

  _humanSize(bytes) {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }
  // 图片消息：下载到临时文件存 pending，等用户发文本时作为多模态附件带给 Agent（单独发图不回复）
  _importImage(userId, imageItem) {
    if (!this._fileImporter) return
    Promise.resolve(this._fileImporter.downloadImageToTemp(imageItem)).then(tmp => {
      if (!tmp) return
      if (!this._pendingImages.has(userId)) this._pendingImages.set(userId, [])
      const arr = this._pendingImages.get(userId)
      arr.push(tmp)
      if (arr.length > 4) arr.shift() // 单次最多挂 4 张历史图，防积压
      this.logger.info && this.logger.info('[WeChatBridge] image pending:', tmp, 'for', userId)
      this._send('wechat-bridge:pending-images', this._pendingImagesSnapshot())
    }).catch(e => {
      this.logger.warn && this.logger.warn('[WeChatBridge] image download failed:', e && e.message)
    })
  }

  _clearPendingImages() {
    this._pendingImages.clear()
    this._send('wechat-bridge:pending-images', this._pendingImagesSnapshot())
  }

  deleteImage(name) {
    if (this._fileImporter) this._fileImporter.deleteImage(name)
    for (const arr of this._pendingImages.values()) {
      const i = arr.findIndex(p => path.basename(p) === path.basename(String(name || '')))
      if (i >= 0) arr.splice(i, 1)
    }
    this._send('wechat-bridge:pending-images', this._pendingImagesSnapshot())
  }

  _pendingImagesSnapshot() {
    return this._fileImporter ? this._fileImporter.listImages() : []
  }

  clearPendingImages() {
    const u = this._userId
    if (u) this._pendingImages.delete(u)
    if (this._fileImporter) {
      for (const img of this._fileImporter.listImages()) {
        try { this._fileImporter.deleteImage(img.name) } catch (e) {}
      }
    }
    this._send('wechat-bridge:pending-images', this._pendingImagesSnapshot())
  }

  // ── 聚合 flush：跑 Agent → 回复 ──
  async _handleAggregated(userId, text, contextToken) {
    if (!this.client) return
    if (this._commandHandler) {
      const r = normalizeCommandResult(this._commandHandler.handle({ userId, text }))
      if (r.handled) {
        if (r.action) this._applyCommandAction(r.action)
        if (r.reply) await this._reply(userId, r.reply, contextToken)
        return
      }
    }
    const config = loadBridgeConfig(this.db)
    if (!config.defaultAgentId) {
      await this._reply(userId, RESPONSES.noAgent, contextToken)
      return
    }
    if (this._runningUsers.has(userId)) {
      await this._reply(userId, RESPONSES.busy, contextToken)
      return
    }
    const convId = this._convOverride.get(userId) || ('wx_' + userId)
    // 纯链接：导入为 .url.md，让 Agent 后续可读
    if (isPureUrl(text) && this._fileImporter) {
      try { await this._fileImporter.importUrl(text) } catch (e) {
        this.logger.warn && this.logger.warn('[WeChatBridge] url import failed:', e && e.message)
      }
    }
    let imagePaths = []
    this._runningUsers.add(userId)
    const typing = new TypingKeepalive({
      client: this.client,
      getUserId: () => userId,
      getContextToken: () => this._userCtx.get(userId) || contextToken,
      logger: this.logger,
    })
    let started = false
    let stillTimer = null
    try { started = await typing.start() } catch (e) {
      this.logger.warn && this.logger.warn('[WeChatBridge] typing start failed:', e && e.message)
    }
    try {
      // 超过 15s 未回复：补发一条"还在处理中"，避免用户以为卡死
      stillTimer = setTimeout(() => {
        this._reply(userId, RESPONSES.stillProcessing, contextToken).catch(() => {})
      }, 15000)
      const mounted = this._fileCtx ? this._fileCtx.getMountedPaths() : []
      const focus = this._focusFiles.get(userId) ? [...this._focusFiles.get(userId)] : []
      const ctxPaths = [...focus, ...mounted]
      imagePaths = this._pendingImages.get(userId) ? [...this._pendingImages.get(userId)] : []
      this._pendingImages.delete(userId)
      // 首条消息：先发引导语（每用户 session 内仅一次）
      if (this._introPending) {
        this._introPending = false
        await this._reply(userId, RESPONSES.intro, contextToken)
      }
      const hintSent = { thinking: false, tool: false }
      const onChunk = (_chunkText, chunk) => {
        const type = chunk && chunk.type
        if (!type) return
        if ((type === 'thinking' || type === 'reasoning') && !hintSent.thinking) {
          hintSent.thinking = true
          if (stillTimer) { clearTimeout(stillTimer); stillTimer = null }
          this._reply(userId, RESPONSES.thinking, contextToken).catch(() => {})
        } else if (type === 'tool_start' && !hintSent.tool) {
          hintSent.tool = true
          if (stillTimer) { clearTimeout(stillTimer); stillTimer = null }
          this._reply(userId, RESPONSES.toolStart(chunk.toolName || ''), contextToken).catch(() => {})
        }
      }
      const result = await this._agentRunner.run({
        userId,
        text,
        conversationId: convId,
        agentId: config.defaultAgentId,
        historyWindow: config.historyWindow,
        storeHistory: config.conversationStorage !== false,
        ctxPaths,
        imagePaths,
        agentTimeout: config.agentTimeout,
        onChunk,
      })
      const replyText = result.content || ''
      await this._reply(userId, replyText || RESPONSES.emptyReply, contextToken)
      this._send('wechat-bridge:conv-changed', { conversationId: convId, userId })
    } catch (e) {
      this.logger.error && this.logger.error('[WeChatBridge] agent run failed:', e && e.message)
      await this._reply(userId, RESPONSES.agentFail(e && e.message), contextToken)
    } finally {
      if (stillTimer) clearTimeout(stillTimer)
      this._send('wechat-bridge:pending-images', this._pendingImagesSnapshot())
      this._runningUsers.delete(userId)
      if (started) { try { await typing.stop() } catch (e) {} }
    }
  }

  // ── 命令动作解释 ──
  _applyCommandAction(action) {
    if (!action || !action.type) return
    if (action.type === 'new-conversation') {
      const u = action.userId
      const newConvId = 'wx_' + u + '_' + Date.now()
      this._convOverride.set(u, newConvId)
      this._focusFiles.delete(u)
      // precreate the conversation row so workchat shows it at once under the Bot group
      try {
        if (this.db && typeof this.db.getConv === 'function' && !this.db.getConv(newConvId)) {
          const cfg = loadBridgeConfig(this.db)
          this.db.createConv({ id: newConvId, agentId: cfg.defaultAgentId || '', groupId: 'wxbot', title: '微信 Bot · 新对话' })
        }
      } catch (e) { this.logger.warn && this.logger.warn('[WeChatBridge] precreate conv failed:', e && e.message) }
      this._send('wechat-bridge:conv-changed', { conversationId: newConvId, userId: u })
    } else if (action.type === 'clear-conversation') {
      const u = action.userId
      const convId = this._convOverride.get(u) || ('wx_' + u)
      try {
        if (this.db && this.db._db) this.db._db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId)
      } catch (e) { this.logger.warn && this.logger.warn('[WeChatBridge] clear conv failed:', e && e.message) }
      this._send('wechat-bridge:conv-changed', { conversationId: convId, userId: u, cleared: true })
    } else if (action.type === 'switch-agent') {
      saveBridgeConfig(this.db, { defaultAgentId: action.agentId })
    } else if (action.type === 'doc') {
      const u = action.userId
      if (!this._focusFiles.has(u)) this._focusFiles.set(u, new Set())
      this._focusFiles.get(u).add(action.filePath)
    }
  }

  // ── 发送回复：markdown 已转纯文本，长文本切块逐条发 ──
  async _reply(userId, text, contextToken) {
    const token = this._userCtx.get(userId) || contextToken
    if (!token) return
    const chunks = chunkText(text)
    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.client.sendText(userId, chunks[i], token)
        this._send('wechat-bridge:message', {
          userId, direction: 'outbound', type: 'text', content: chunks[i],
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        })
      } catch (e) {
        this.logger.warn && this.logger.warn('[WeChatBridge] sendText failed:', e && e.message)
        this._send('wechat-bridge:error', { message: RESPONSES.sendFail(e && e.message) })
        return
      }
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, SEND_GAP_MS))
    }
  }
}
