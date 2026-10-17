// Security: setting whitelists, safe getters/setters, output sanitization.

const SETTING_READ_WHITELIST = [
  'answerStyle', 'chatNavigationEnabled', 'chatNavigationStyle',
  'chatToolbarAttach', 'chatToolbarWiki', 'chatToolbarContext',
  'chatToolbarVoice', 'chatToolbarTokenCounter', 'chatToolbarLatency',
  'hitlMode', 'creationToolPreferences', 'agentSkillsPanelEnabled',
  'themeId', 'themeMode', 'accentColor', 'customAccentHex',
]

const SETTING_WRITE_WHITELIST = [
  'answerStyle', 'chatNavigationEnabled', 'chatNavigationStyle',
  'chatToolbarAttach', 'chatToolbarWiki', 'chatToolbarContext',
  'chatToolbarVoice', 'chatToolbarTokenCounter', 'chatToolbarLatency',
  'agentSkillsPanelEnabled', 'creationToolPreferences',
  'themeId', 'themeMode', 'accentColor', 'customAccentHex',
]

const HARD_EXCLUDE = [
  'providers', 'mediaSpeechSettings', 'imageModels',
  'proxyUser', 'proxyPass', 'proxyAuth',
  'defaultModels', 'commandBlacklist',
  'allowExecCommand', 'allowFileDelete', 'deleteScope',
  'allowRevivaManage',
  'workdir_root',
]

const SENSITIVE_PATTERN = /key|token|secret|password|pass|auth|credential/i

export class SecurityError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = 'SecurityError'
  }
}

export function safeGetSetting(dbService, key) {
  if (!SETTING_READ_WHITELIST.includes(key)) {
    throw new SecurityError('BLOCKED_READ', `blocked non-whitelisted setting: ${key}`)
  }
  return dbService.getSetting(key)
}

export function safeSetSetting(dbService, key, value) {
  if (!SETTING_WRITE_WHITELIST.includes(key)) {
    throw new SecurityError('BLOCKED_WRITE', `blocked non-whitelisted setting: ${key}`)
  }
  return dbService.setSetting(key, value)
}

export function sanitizeSettings(obj) {
  if (!obj || typeof obj !== 'object') return {}
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => {
      if (HARD_EXCLUDE.includes(k)) return false
      if (SENSITIVE_PATTERN.test(k)) return false
      return true
    })
  )
}

export { SETTING_READ_WHITELIST, SETTING_WRITE_WHITELIST, HARD_EXCLUDE }
