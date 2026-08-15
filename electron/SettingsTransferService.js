export const SETTINGS_TRANSFER_FORMAT = 'reviva-settings'
export const SETTINGS_TRANSFER_VERSION = 1

const EXCLUDED_SETTING_KEYS = new Set([
  'workdir_root',
  'mediaSpeechSettings',
  'mediaSpeechDefaultProviderId',
  'defaultSttModelRef',
  'defaultTtsModelRef',
  'mediaBilibiliCookieValue',
  'mediaBilibiliCookieStatus',
])
const UNSAFE_SETTING_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const BOOLEAN_SETTING_KEYS = new Set([
  'animations', 'reducedMotion', 'proxyAuth', 'loopGuard', 'pathRedact',
  'allowFileDelete', 'allowExecCommand', 'notifyTaskDone', 'notifyTaskFailed',
  'notifySound', 'notifyDND', 'autoStart', 'minimizeToTray', 'trayIcon', 'singleInstance',
])
const NUMBER_SETTING_KEYS = new Set([
  'maxIter', 'maxTaskMin', 'searchLimit', 'fileOpLimit', 'toolCallLimit',
  'modelCallLimit', 'auditDays',
])
const STRING_SETTING_KEYS = new Set([
  'themeMode', 'accentColor', 'customAccentHex', 'fontSize', 'langPref',
  'answerStyle', 'conflictStrategy', 'proxyMode', 'proxyType', 'proxyHost',
  'proxyPort', 'proxyUser', 'proxyPass', 'notifySoundType', 'deleteScope',
])
const STRING_ARRAY_SETTING_KEYS = new Set(['commandWhitelist', 'commandBlacklist'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertStringArray(key, value) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`配置项 ${key} 必须是字符串数组`)
  }
}

function validateProviders(value) {
  if (!Array.isArray(value)) throw new Error('配置项 providers 必须是数组')
  for (const provider of value) {
    if (!isPlainObject(provider) || typeof provider.id !== 'string' || !provider.id.trim()) {
      throw new Error('配置项 providers 包含无效服务商')
    }
    if (provider.models !== undefined) {
      if (!Array.isArray(provider.models)) throw new Error(`服务商 ${provider.id} 的 models 必须是数组`)
      for (const model of provider.models) {
        if (!isPlainObject(model) || typeof model.id !== 'string' || !model.id.trim()) {
          throw new Error(`服务商 ${provider.id} 包含无效模型`)
        }
      }
    }
  }
}

function validateShortcutBindings(value) {
  if (!isPlainObject(value)) throw new Error('配置项 shortcutBindings 必须是对象')
  const modifiers = new Set(['Ctrl', 'Control', 'Meta', 'Shift', 'Alt'])
  const appActions = new Set(['global_invoke', 'app_new', 'app_search', 'app_switch'])
  const inputActions = new Set(['input_send', 'input_newline'])
  const fixedInputActions = new Map([['input_mention', '@'], ['input_command', '/']])
  const namedKeys = new Set(['Enter', 'Tab', 'Space', 'Esc', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'Up', 'Down', 'Left', 'Right', 'PageUp', 'PageDown', 'PrintScreen', 'Pause'])
  for (const [action, combo] of Object.entries(value)) {
    if (!Array.isArray(combo) || !combo.length || combo.some(key => typeof key !== 'string' || !key.trim())) {
      throw new Error(`快捷键 ${action} 格式无效`)
    }
    if (fixedInputActions.has(action)) {
      if (combo.length !== 1 || combo[0] !== fixedInputActions.get(action)) throw new Error(`快捷键 ${action} 只能使用固定触发符`)
      continue
    }
    if (combo.every(key => modifiers.has(key))) throw new Error(`快捷键 ${action} 必须包含一个实际按键`)
    if (appActions.has(action) && !combo.some(key => modifiers.has(key))) {
      throw new Error(`快捷键 ${action} 必须包含 Ctrl、Shift 或 Alt`)
    }
    if (inputActions.has(action) && combo.length === 1 && combo[0].length === 1 && !namedKeys.has(combo[0]) && !/^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(combo[0])) {
      throw new Error(`快捷键 ${action} 不能使用单个字母或符号`)
    }
  }
}

function validateKnownSetting(key, value) {
  if (BOOLEAN_SETTING_KEYS.has(key) && typeof value !== 'boolean') {
    throw new Error(`配置项 ${key} 必须是布尔值`)
  }
  if (NUMBER_SETTING_KEYS.has(key) && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`配置项 ${key} 必须是有效数字`)
  }
  if (STRING_SETTING_KEYS.has(key) && typeof value !== 'string') {
    throw new Error(`配置项 ${key} 必须是字符串`)
  }
  if (STRING_ARRAY_SETTING_KEYS.has(key)) assertStringArray(key, value)
  if (key === 'providers') validateProviders(value)
  if (key === 'defaultModels') {
    if (!isPlainObject(value) || Object.values(value).some(item => typeof item !== 'string')) {
      throw new Error('配置项 defaultModels 必须是字符串映射')
    }
  }
  if (key === 'shortcutBindings') validateShortcutBindings(value)
  if (key === 'wikiWebResearchSettings' && !isPlainObject(value)) {
    throw new Error('配置项 wikiWebResearchSettings 必须是对象')
  }
  if (key === 'trayMenuItems') {
    if (!Array.isArray(value) || value.some(item => !isPlainObject(item))) {
      throw new Error('配置项 trayMenuItems 必须是对象数组')
    }
  }
}

function portableSettings(settings) {
  if (!isPlainObject(settings)) throw new Error('配置内容必须是 JSON 对象')
  const result = {}
  for (const [key, value] of Object.entries(settings)) {
    if (EXCLUDED_SETTING_KEYS.has(key)) continue
    if (UNSAFE_SETTING_KEYS.has(key)) throw new Error(`配置项名称无效：${key}`)
    validateKnownSetting(key, value)
    result[key] = value
  }
  return result
}

export function serializeTransferredSetting(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  const serialized = JSON.stringify(value)
  if (typeof serialized !== 'string') throw new Error('配置项包含无法保存的值')
  return serialized
}

export function createSettingsTransfer(settings, { appVersion = '' } = {}) {
  return {
    format: SETTINGS_TRANSFER_FORMAT,
    formatVersion: SETTINGS_TRANSFER_VERSION,
    appVersion: String(appVersion || ''),
    exportedAt: new Date().toISOString(),
    data: {
      settings: portableSettings(settings),
    },
  }
}

export function parseSettingsTransfer(payload) {
  if (!isPlainObject(payload)) throw new Error('配置文件格式无效')

  if (payload.format !== undefined) {
    if (payload.format !== SETTINGS_TRANSFER_FORMAT) throw new Error('不是 Reviva 配置文件')
    if (payload.formatVersion !== SETTINGS_TRANSFER_VERSION) {
      throw new Error(`不支持的配置文件版本：${payload.formatVersion ?? '未知'}`)
    }
    if (!isPlainObject(payload.data) || !isPlainObject(payload.data.settings)) {
      throw new Error('配置文件缺少 settings 数据')
    }
    return {
      settings: portableSettings(payload.data.settings),
      legacy: false,
    }
  }

  if (!isPlainObject(payload.settings)) throw new Error('配置文件缺少 settings 数据')
  return {
    settings: portableSettings(payload.settings),
    legacy: true,
  }
}
