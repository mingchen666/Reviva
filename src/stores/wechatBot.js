import { defineStore } from 'pinia'
import { useConversationsStore } from '@/stores/conversations'

/**
 * 微信 Bot 模块渲染进程状态。
 *
 * 连接状态机：disconnected -> scanning -> connected
 *                                   \-> expired ->(暂停窗口)-> disconnected
 *
 * 所有 IPC 调用都通过 window.electronAPI?.wechatBridge 守卫，主进程尚未接线时
 * 自动降级为默认状态，保证 Step1 骨架可独立运行。Step2 在 preload/main 注册
 * IPC 后即可点亮。
 */
export const useWechatBotStore = defineStore('wechatBot', {
  state: () => ({
    // —— 服务与连接 ——
    running: false, // Bot 服务循环是否在跑
    connectionStatus: 'disconnected', // disconnected | scanning | connected | expired
    botInfo: null, // { botId, userId, nickname?, avatarUrl? }
    qrUrl: null, // 扫码登录的二维码 URL
    retryAfterMs: null, // 会话过期后的暂停窗口剩余毫秒
    lastError: null,

    // —— 配置 ——
    config: {
      enabled: false, // Bot 总开关
      defaultAgentId: '', // 默认 Agent
      conversationStorage: true, // 对话存储开关（存到「Bot 对话」分组）
      historyWindow: 20, // 上下文窗口（轮 = 用户+回复一对）
    },

    // —— 数据 ——
    agents: [], // 可选 Agent 列表
    messageLog: [], // 消息记录（最近 100 条）
    files: [], // 「微信bot文件」目录文件
    fileDir: "", // bot file dir path
    pendingImages: [],
    reminders: [], // 提醒列表
    reminderLogs: [], // 推送历史记录（到点推送成功/失败/跳过）
    reminderLogsTotal: 0, // 历史记录总数
    reminderLogsPage: 1, // 当前页
    reminderLogsPageSize: 20, // 每页条数

    // —— UI ——
    loading: false,
    _listenersBound: false,
  }),

  getters: {
    isConnected: (s) => s.connectionStatus === 'connected',
    isExpired: (s) => s.connectionStatus === 'expired',
    isScanning: (s) => s.connectionStatus === 'scanning',
    // icon rail 顶部圆点颜色：green/amber/red/gray
    dotColor(s) {
      return (
        {
          connected: 'green',
          scanning: 'amber',
          expired: 'red',
          disconnected: 'gray',
        }[s.connectionStatus] || 'gray'
      )
    },
    statusText(s) {
      return (
        {
          connected: '已连接',
          scanning: '扫码中',
          expired: '已过期',
          disconnected: '未连接',
        }[s.connectionStatus] || '未连接'
      )
    },
    available() {
      return !!window.electronAPI?.wechatBridge
    },
  },

  actions: {
    _bridge() {
      return window.electronAPI?.wechatBridge
    },

    /** 进入页面时调用：拉状态/配置/Agent，并绑定 IPC 监听 */
    async init() {
      const b = this._bridge()
      if (!b) return // 主进程尚未接线，保持默认状态
      this.loading = true
      try {
        await Promise.all([this.refreshStatus(), this.loadConfig(), this.loadAgents(), this.loadFiles(), this.loadReminders()])
        this._setupListeners()
      } finally {
        this.loading = false
      }
    },

    /** 应用启动时调用：仅拉连接状态 + 绑定事件，让侧边栏绿点在任何页面都能实时反映连接状态 */
    async initStatus() {
      const b = this._bridge()
      if (!b) return
      await this.refreshStatus()
      this._setupListeners()
    },

    async refreshStatus() {
      const b = this._bridge()
      if (!b) return
      try {
        const s = await b.getStatus()
        this.running = !!s?.running
        if (s?.expired) this.connectionStatus = 'expired'
        else if (s?.connected) this.connectionStatus = 'connected'
        else this.connectionStatus = this.connectionStatus === 'scanning' ? 'scanning' : 'disconnected'
        this.retryAfterMs = s?.retryAfterMs ?? null
        this.botInfo = s?.botId ? { botId: s.botId, userId: s.userId, nickname: s.nickname, avatarUrl: s.avatarUrl } : null
      } catch (e) {
        this.lastError = e?.message || String(e)
      }
    },

    async loadConfig() {
      const b = this._bridge()
      if (!b) return
      try {
        const c = await b.getConfig()
        if (c) this.config = { ...this.config, ...c }
      } catch (e) {
        this.lastError = e?.message
      }
    },

    async loadFiles() {
      const b = this._bridge()
      if (!b) return
      try {
        const r = await b.listFiles()
        this.files = (r && r.files) ? r.files.map(f => ({ name: f.name, path: f.path, size: f.size, mounted: !!f.mounted, icon: f.icon || 'ri-file-3-line' })) : []
        this.fileDir = (r && r.dirPath) || ''
      } catch (e) {
        this.lastError = e && e.message
      }
    },
    async clearPendingImages() {
      const b = this._bridge()
      if (!b) return
      try { await b.clearPendingImages() } catch (e) {}
    },
    async loadImages() {
      const b = this._bridge()
      if (!b) return
      try { const r = await b.listImages(); this.pendingImages = Array.isArray(r) ? r : [] } catch (e) {}
    },
    async deleteImage(name) {
      const b = this._bridge()
      if (!b) return
      try { await b.deleteImage(name) } catch (e) {}
    },

    async loadReminders() {
      const b = this._bridge()
      if (!b) return
      try {
        const r = await b.listReminders()
        this.reminders = (r && r.reminders) ? r.reminders : []
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    async addReminder(r) {
      const b = this._bridge()
      if (!b) { this.reminders.push(r); return }
      try {
        const res = await b.addReminder(r)
        if (res && res.reminder) this.reminders.push(res.reminder)
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    async deleteReminder(id) {
      const b = this._bridge()
      if (!b) { this.reminders = this.reminders.filter(x => x.id !== id); return }
      try {
        await b.deleteReminder(id)
        this.reminders = this.reminders.filter(x => x.id !== id)
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    async setReminderEnabled(id, enabled) {
      const b = this._bridge()
      if (!b) {
        const r = this.reminders.find(x => x.id === id)
        if (r) r.enabled = enabled
        return
      }
      try {
        await b.updateReminder(id, { enabled })
        const r = this.reminders.find(x => x.id === id)
        if (r) r.enabled = enabled
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    async loadReminderLogs(page = 1) {
      const b = this._bridge()
      if (!b) return
      try {
        const limit = this.reminderLogsPageSize
        const offset = (page - 1) * limit
        const r = await b.listReminderLogs({ limit, offset })
        this.reminderLogs = (r && r.logs) ? r.logs : []
        this.reminderLogsTotal = (r && r.total) ? r.total : 0
        this.reminderLogsPage = Math.max(1, Number(page) || 1)
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    async clearReminderLogs() {
      const b = this._bridge()
      if (!b) return
      try {
        await b.clearReminderLogs()
        this.reminderLogs = []
        this.reminderLogsTotal = 0
        this.reminderLogsPage = 1
      } catch (e) {
        this.lastError = e && e.message
      }
    },

    clearMessageLog() {
      this.messageLog = []
    },

    async loadAgents() {
      const b = this._bridge()
      if (!b) return
      try {
        const r = await b.getAgents()
        this.agents = r?.agents || []
      } catch (e) {
        this.lastError = e?.message
      }
    },

    async setConfig(patch) {
      const b = this._bridge()
      if (!b) {
        // 未接线时仅本地更新，方便 Step1 调 UI
        this.config = { ...this.config, ...patch }
        return
      }
      try {
        await b.setConfig(patch)
        this.config = { ...this.config, ...patch }
      } catch (e) {
        this.lastError = e?.message
      }
    },

    async login() {
      const b = this._bridge()
      if (!b) return
      this.connectionStatus = 'scanning'
      this.qrUrl = null
      this.lastError = null
      try {
        await b.login()
      } catch (e) {
        this.connectionStatus = 'disconnected'
        this.lastError = e?.message
      }
    },

    async logout() {
      const b = this._bridge()
      if (!b) {
        this.connectionStatus = 'disconnected'
        this.botInfo = null
        this.qrUrl = null
        return
      }
      try {
        await b.logout()
        this.connectionStatus = 'disconnected'
        this.botInfo = null
        this.qrUrl = null
      } catch (e) {
        this.lastError = e?.message
      }
    },

    async start() {
      const b = this._bridge()
      if (!b) return
      try {
        await b.start()
        await this.refreshStatus()
      } catch (e) {
        this.lastError = e?.message
      }
    },

    async stop() {
      const b = this._bridge()
      if (!b) return
      try {
        await b.stop()
        await this.refreshStatus()
      } catch (e) {
        this.lastError = e?.message
      }
    },

    /** 绑定主进程 -> 渲染进程的 IPC 事件（幂等） */
    _setupListeners() {
      const b = this._bridge()
      if (!b || this._listenersBound) return
      b.onQrUrl?.((d) => {
        this.qrUrl = d?.url || null
        if (this.qrUrl) this.connectionStatus = 'scanning'
      })
      b.onScanned?.(() => {
        // 保持 scanning，等待手机端确认
        this.connectionStatus = 'scanning'
      })
      b.onConnected?.((d) => {
        this.connectionStatus = 'connected'
        this.botInfo = d || this.botInfo
        this.qrUrl = null
        this.retryAfterMs = null
      })
      b.onDisconnected?.((d) => {
        this.connectionStatus = d?.reason === 'session_expired' ? 'expired' : 'disconnected'
        this.retryAfterMs = d?.retryAfterMs ?? null
        this.botInfo = null
        this.qrUrl = null
      })
      b.onError?.((d) => {
        this.lastError = d?.message || '未知错误'
      })
      b.onMessage?.((d) => {
        if (!d) return
        this.messageLog.unshift(d)
        if (this.messageLog.length > 100) this.messageLog.length = 100
        // 文件导入后刷新 MemoryTab 的文件列表
        if (d.type === 'file-imported') this.loadFiles()
        if (d.type === 'image') this.loadImages()
      })
      b.onConvChanged?.((d) => {
        try {
          const cs = useConversationsStore()
          cs.loadFromDb()
          if (d && d.conversationId && cs.currentConvId === d.conversationId) cs.loadMessages(d.conversationId)
        } catch (e) {}
      })
      b.onPendingImages?.((d) => { this.pendingImages = Array.isArray(d) ? d : [] })
      this._listenersBound = true
    },
  },
})
