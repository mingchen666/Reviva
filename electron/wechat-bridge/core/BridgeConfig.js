// 微信 Bot 桥接配置 / 凭证 / 会话持久化。
// 与 local-gateway 一致：使用 dbService.getSetting/setSetting 的 KV settings 表，
// 不另建专属表（设计文档的 4 张表暂缓到消息记录页 Step8 再决定）。
// bot_token 用 Electron safeStorage 加密后以 base64 存入 JSON，渲染进程永不接触明文。

const CONFIG_KEY = 'wechatBridgeConfig'
const CRED_KEY = 'wechatBridgeCredentials'
const SESSION_KEY = 'wechatBridgeSession'
// 多用户 context_token 持久化 KV：{ tokens: { userId: token, ... } }
// 解决 Reviva 重启后 _userCtx 丢失、到点提醒无法主动推送的问题。
const USER_CTX_KEY = 'wechatBridgeUserCtx'

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  defaultAgentId: '',
  reminderTime: '20:00',
  reminderEnabled: true,
  conversationStorage: true,
  historyWindow: 10,
  agentTimeout: 5,
})

export function loadBridgeConfig(dbService) {
  const raw = dbService && typeof dbService.getSetting === 'function' ? dbService.getSetting(CONFIG_KEY) : null
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG }
  return {
    ...DEFAULT_CONFIG,
    enabled: raw.enabled === true,
    defaultAgentId: String(raw.defaultAgentId || ''),
    reminderTime: String(raw.reminderTime || '20:00'),
    reminderEnabled: raw.reminderEnabled !== false,
    conversationStorage: raw.conversationStorage !== false,
    historyWindow: Math.max(4, Math.min(50, Number(raw.historyWindow) || 10)),
    agentTimeout: Math.max(1, Math.min(30, Number(raw.agentTimeout) || 5)),
  }
}

export function saveBridgeConfig(dbService, patch = {}) {
  const next = { ...loadBridgeConfig(dbService), ...patch }
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(CONFIG_KEY, next)
  return next
}

function canEncrypt(secretStore) {
  return !!(secretStore && typeof secretStore.encryptString === 'function' && (!secretStore.isEncryptionAvailable || secretStore.isEncryptionAvailable()))
}

export function saveBridgeCredentials(dbService, secretStore, info) {
  const token = info ? info.token : ''
  let tokenEncryptedB64 = ''
  if (token && canEncrypt(secretStore)) {
    try {
      const buf = secretStore.encryptString(token)
      tokenEncryptedB64 = Buffer.from(buf).toString('base64')
    } catch (e) {
      tokenEncryptedB64 = ''
    }
  }
  const payload = {
    tokenEncryptedB64,
    baseUrl: String((info && info.baseUrl) || ''),
    botId: String((info && info.botId) || ''),
    userId: String((info && info.userId) || ''),
  }
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(CRED_KEY, payload)
  return payload
}

export function loadBridgeCredentials(dbService, secretStore) {
  const raw = dbService && typeof dbService.getSetting === 'function' ? dbService.getSetting(CRED_KEY) : null
  if (!raw || typeof raw !== 'object') return null
  const b64 = String(raw.tokenEncryptedB64 || '')
  let token = ''
  if (b64 && canEncrypt(secretStore)) {
    try {
      token = secretStore.decryptString(Buffer.from(b64, 'base64'))
    } catch (e) {
      token = ''
    }
  }
  if (!token) return null
  return {
    token,
    baseUrl: String(raw.baseUrl || ''),
    botId: String(raw.botId || ''),
    userId: String(raw.userId || ''),
  }
}

export function clearBridgeCredentials(dbService) {
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(CRED_KEY, {})
}

export function loadBridgeSession(dbService) {
  const raw = dbService && typeof dbService.getSetting === 'function' ? dbService.getSetting(SESSION_KEY) : null
  if (!raw || typeof raw !== 'object') return { currentAgentId: '', conversationId: '', contextToken: '', historyWindow: 10 }
  return {
    currentAgentId: String(raw.currentAgentId || ''),
    conversationId: String(raw.conversationId || ''),
    contextToken: String(raw.contextToken || ''),
    historyWindow: Number(raw.historyWindow) || 10,
  }
}

export function saveBridgeSession(dbService, userId, patch = {}) {
  const cur = loadBridgeSession(dbService)
  const next = { ...cur, ...patch, lastMessageAt: Date.now() }
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(SESSION_KEY, next)
  return next
}

export function clearBridgeContextTokens(dbService) {
  const cur = dbService && typeof dbService.getSetting === 'function' ? dbService.getSetting(SESSION_KEY) : null
  if (cur && typeof cur === 'object') {
    cur.contextToken = ''
    if (typeof dbService.setSetting === 'function') dbService.setSetting(SESSION_KEY, cur)
  }
}

// ── 多用户 context_token 持久化 ──
// _userCtx 是内存 Map，重启即丢；SDK 的 client.contextTokens 也是内存。
// 提醒推送必须有 context_token，否则到点 _pushAll 静默跳过。
// 这里把 userCtx Map 序列化为 { tokens: { userId: token } } 落 KV，start() 时回填。
export function loadBridgeUserCtx(dbService) {
  const raw = dbService && typeof dbService.getSetting === 'function' ? dbService.getSetting(USER_CTX_KEY) : null
  const map = new Map()
  if (raw && typeof raw === 'object' && raw.tokens && typeof raw.tokens === 'object') {
    for (const [userId, token] of Object.entries(raw.tokens)) {
      if (userId && token) map.set(String(userId), String(token))
    }
  }
  return map
}

export function saveBridgeUserCtx(dbService, userCtx) {
  const tokens = {}
  if (userCtx && typeof userCtx.forEach === 'function') {
    userCtx.forEach((token, userId) => {
      if (userId && token) tokens[String(userId)] = String(token)
    })
  } else if (userCtx && typeof userCtx === 'object') {
    for (const [userId, token] of Object.entries(userCtx)) {
      if (userId && token) tokens[String(userId)] = String(token)
    }
  }
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(USER_CTX_KEY, { tokens })
  return { tokens }
}

export function clearBridgeUserCtx(dbService) {
  if (dbService && typeof dbService.setSetting === 'function') dbService.setSetting(USER_CTX_KEY, { tokens: {} })
}
