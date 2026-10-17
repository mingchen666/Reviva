import { safeGetSetting, safeSetSetting, SETTING_READ_WHITELIST } from '../security.js'
import { missingParam, invalidParam, invalidType } from '../errorResponse.js'

const ANSWER_STYLE_KEYS = ['default', 'study_partner', 'best_friend', 'humorous', 'gentle_tutor', 'strict_mentor', 'big_sister', 'tsundere', 'exam_trainer']
const CHAT_NAVIGATION_STYLE_KEYS = ['directory', 'minimap']

// Keys that are read-only (returned by get_all but cannot be set via preferences.set)
const READ_ONLY_KEYS = ['hitlMode', 'creationToolPreferences', 'agentSkillsPanelEnabled', 'themeId', 'themeMode', 'accentColor', 'customAccentHex']

const BOOLEAN_KEYS = [
  'chatNavigationEnabled', 'chatToolbarAttach', 'chatToolbarWiki', 'chatToolbarContext',
  'chatToolbarVoice', 'chatToolbarTokenCounter', 'chatToolbarLatency',
]

const STRING_VALUE_MAP = {
  answerStyle: ANSWER_STYLE_KEYS,
  chatNavigationStyle: CHAT_NAVIGATION_STYLE_KEYS,
}

function validateValue(key, value) {
  if (BOOLEAN_KEYS.includes(key)) {
    if (typeof value !== 'boolean') {
      throw invalidType(key, 'boolean', typeof value)
    }
    return
  }
  if (STRING_VALUE_MAP[key]) {
    if (typeof value !== 'string') {
      throw invalidType(key, 'string', typeof value)
    }
    if (!STRING_VALUE_MAP[key].includes(value)) {
      throw invalidParam(key, STRING_VALUE_MAP[key], `${key} 值无效`)
    }
  }
}

export function register(registry, _services) {
  // get_all
  registry.register({
    domain: 'preferences', id: 'get_all', name: '读取全部偏好', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const result = {}
      for (const key of SETTING_READ_WHITELIST) {
        try {
          result[key] = safeGetSetting(ctx.dbService, key)
        } catch {
          // skip if blocked
        }
      }
      return { data: result, changedKeys: [] }
    },
  })

  // get
  registry.register({
    domain: 'preferences', id: 'get', name: '读取偏好', write: false,
    params: 'key',
    example: { key: 'answerStyle' },
    execute: async (params, ctx) => {
      if (!params?.key) throw missingParam('key', 'setting key name')
      const value = safeGetSetting(ctx.dbService, params.key)
      return { data: { key: params.key, value }, changedKeys: [] }
    },
  })

  // set
  registry.register({
    domain: 'preferences', id: 'set', name: '修改偏好', write: true,
    params: 'key, value',
    example: { key: 'answerStyle', value: 'gentle_tutor' },
    execute: async (params, ctx) => {
      if (!params?.key) throw missingParam('key', 'setting key name')
      if (typeof params.value === 'undefined') throw missingParam('value', 'setting value')

      // Reject read-only keys
      if (READ_ONLY_KEYS.includes(params.key)) {
        throw invalidParam('key', null, `${params.key} 不可通过 preferences.set 修改，请使用对应领域操作`)
      }

      // Validate value
      validateValue(params.key, params.value)

      // safeSetSetting checks the write whitelist
      safeSetSetting(ctx.dbService, params.key, params.value)

      return { data: { key: params.key, value: params.value }, changedKeys: [params.key] }
    },
  })
}
