import { safeGetSetting, safeSetSetting } from '../security.js'
import { missingParam, invalidParam, notFound, DomainError } from '../errorResponse.js'
import { BUILTIN_THEMES, BUILTIN_THEME_IDS } from '../builtinThemes.js'

const ACCENT_PRESETS = ['brand', 'violet', 'emerald', 'rose', 'amber', 'sky', 'teal', 'orange', 'lime', 'pink']
const HEX_PATTERN = /^#[0-9a-f]{6}$/i
const THEME_MODES = ['light', 'dark', 'system']

function requireThemeService(ctx) {
  if (!ctx.themeService) {
    throw new DomainError('SERVICE_UNAVAILABLE', '主题服务未初始化', { hint: '尝试重启应用' })
  }
}

export function register(registry, _services) {
  // list_themes
  registry.register({
    domain: 'appearance', id: 'list_themes', name: '主题列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      let userThemes = []
      if (ctx.themeService?.listThemes) {
        const result = await ctx.themeService.listThemes()
        userThemes = (result.themes || []).map(t => ({ id: t.id, name: t.name, source: 'user' }))
      }
      return { data: { builtin: BUILTIN_THEMES, user: userThemes, all: [...BUILTIN_THEMES, ...userThemes] }, changedKeys: [] }
    },
  })

  // current_theme
  registry.register({
    domain: 'appearance', id: 'current_theme', name: '当前主题', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = {
        themeId: safeGetSetting(ctx.dbService, 'themeId'),
        themeMode: safeGetSetting(ctx.dbService, 'themeMode'),
        accentColor: safeGetSetting(ctx.dbService, 'accentColor'),
        customAccentHex: safeGetSetting(ctx.dbService, 'customAccentHex'),
      }
      return { data, changedKeys: [] }
    },
  })

  // read_theme_css
  registry.register({
    domain: 'appearance', id: 'read_theme_css', name: '读取主题CSS', write: false,
    params: 'themeId',
    example: { themeId: 'default' },
    execute: async (params, ctx) => {
      if (!params?.themeId) throw missingParam('themeId', 'theme id')
      if (BUILTIN_THEME_IDS.includes(params.themeId)) {
        return { data: { themeId: params.themeId, source: 'builtin', css: null, note: '内置主题CSS已编译到应用中,不在磁盘上' }, changedKeys: [] }
      }
      requireThemeService(ctx)
      const data = await ctx.themeService.readCss(params.themeId)
      return { data, changedKeys: [] }
    },
  })

  // set_theme
  registry.register({
    domain: 'appearance', id: 'set_theme', name: '切换主题', write: true,
    params: 'themeId',
    example: { themeId: 'dark-ocean' },
    execute: async (params, ctx) => {
      requireThemeService(ctx)
      if (!params?.themeId) throw missingParam('themeId', 'theme id')
      const result = await ctx.themeService.listThemes()
      const userIds = (result.themes || []).map(t => t.id)
      const ids = [...BUILTIN_THEME_IDS, ...userIds]
      if (!ids.includes(params.themeId)) {
        throw notFound('themeId', ids, `主题 '${params.themeId}' 不存在`)
      }
      safeSetSetting(ctx.dbService, 'themeId', params.themeId)
      return { data: { themeId: params.themeId }, changedKeys: ['themeId'] }
    },
  })

  // set_theme_mode
  registry.register({
    domain: 'appearance', id: 'set_theme_mode', name: '切换明暗模式', write: true,
    params: 'mode: light|dark|system',
    example: { mode: 'dark' },
    execute: async (params, ctx) => {
      if (!params?.mode) throw missingParam('mode', 'light|dark|system')
      if (!THEME_MODES.includes(params.mode)) {
        throw invalidParam('mode', THEME_MODES, `mode 无效`)
      }
      safeSetSetting(ctx.dbService, 'themeMode', params.mode)
      return { data: { themeMode: params.mode }, changedKeys: ['themeMode'] }
    },
  })

  // set_accent
  registry.register({
    domain: 'appearance', id: 'set_accent', name: '设置强调色', write: true,
    params: 'preset: 预设key 或 hex: #RRGGBB',
    example: { preset: 'violet' },
    execute: async (params, ctx) => {
      if (params?.preset) {
        if (!ACCENT_PRESETS.includes(params.preset)) {
          throw invalidParam('preset', ACCENT_PRESETS, `预设色无效`)
        }
        safeSetSetting(ctx.dbService, 'accentColor', params.preset)
        return { data: { accentColor: params.preset }, changedKeys: ['accentColor'] }
      }
      if (params?.hex) {
        if (!HEX_PATTERN.test(params.hex)) {
          throw invalidParam('hex', null, '#RRGGBB 格式')
        }
        safeSetSetting(ctx.dbService, 'accentColor', 'custom')
        safeSetSetting(ctx.dbService, 'customAccentHex', params.hex)
        return { data: { accentColor: 'custom', customAccentHex: params.hex }, changedKeys: ['accentColor', 'customAccentHex'] }
      }
      throw missingParam('preset 或 hex')
    },
  })

  // read_custom_css
  registry.register({
    domain: 'appearance', id: 'read_custom_css', name: '读取自定义CSS', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      requireThemeService(ctx)
      const data = await ctx.themeService.readCustomCss()
      return { data, changedKeys: [] }
    },
  })

  // stage_custom_css
  registry.register({
    domain: 'appearance', id: 'stage_custom_css', name: '暂存自定义CSS', write: true,
    params: 'css',
    example: { css: 'body { font-size: 14px; }' },
    execute: async (params, ctx) => {
      requireThemeService(ctx)
      if (!params?.css) throw missingParam('css', 'CSS 文本')
      const data = await ctx.themeService.stageCustomCss(params.css)
      return { data, changedKeys: [] }
    },
  })

  // commit_custom_css
  registry.register({
    domain: 'appearance', id: 'commit_custom_css', name: '应用自定义CSS', write: true,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      requireThemeService(ctx)
      const data = await ctx.themeService.commitCustomCss()
      return { data, changedKeys: ['customCss'] }
    },
  })

  // discard_custom_css
  registry.register({
    domain: 'appearance', id: 'discard_custom_css', name: '丢弃暂存CSS', write: true,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      requireThemeService(ctx)
      const data = await ctx.themeService.discardPendingCustomCss()
      return { data, changedKeys: ['customCss'] }
    },
  })

  // reset_custom_css
  registry.register({
    domain: 'appearance', id: 'reset_custom_css', name: '重置自定义CSS', write: true,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      requireThemeService(ctx)
      const data = await ctx.themeService.resetCustomCss()
      return { data, changedKeys: ['customCss'] }
    },
  })
}
