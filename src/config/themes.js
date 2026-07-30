export const BUILTIN_THEMES = Object.freeze([
  Object.freeze({
    id: 'default',
    name: '经典',
    description: 'Reviva 默认主题',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#4A6CFF',
    previewStyle: Object.freeze({ radius: 6, borderWidth: 1, elevation: 'soft' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#f8f7f6', sidebar: '#f1f0ef', panel: '#ffffff', accent: '#4A6CFF' }),
      dark: Object.freeze({ page: '#0e0e12', sidebar: '#171720', panel: '#252530', accent: '#6C8AFF' }),
    }),
  }),
  Object.freeze({
    id: 'clarity',
    name: '冷杉',
    description: '冷静紧凑的专业工作台',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#347A69',
    previewStyle: Object.freeze({ radius: 5, borderWidth: 1, elevation: 'flat' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#f3f7f6', sidebar: '#e8efed', panel: '#ffffff', accent: '#347A69', secondary: '#61777A', border: '#C5D3CF' }),
      dark: Object.freeze({ page: '#0e1413', sidebar: '#141c1a', panel: '#22302c', accent: '#63B59F', secondary: '#61777A', border: '#3B514A' }),
    }),
  }),
  Object.freeze({
    id: 'serene',
    name: '暮樱',
    description: '柔和舒展的阅读界面',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#A85D78',
    previewStyle: Object.freeze({ radius: 10, borderWidth: 1, elevation: 'soft' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#f8f5f7', sidebar: '#f1ebef', panel: '#ffffff', accent: '#A85D78', secondary: '#77658E', border: '#D8CBD3' }),
      dark: Object.freeze({ page: '#171316', sidebar: '#1f191e', panel: '#332a32', accent: '#D58AA3', secondary: '#A995C2', border: '#503F49' }),
    }),
  }),
  Object.freeze({
    id: 'contrast',
    name: '石墨',
    description: '高可读性与明确边界',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#1769D2',
    previewStyle: Object.freeze({ radius: 4, borderWidth: 2, elevation: 'flat' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#ffffff', sidebar: '#f1f2f3', panel: '#e9ebed', accent: '#1769D2', secondary: '#596168', border: '#59636C' }),
      dark: Object.freeze({ page: '#050607', sidebar: '#0d0f11', panel: '#202428', accent: '#70AEFF', secondary: '#AEB6BD', border: '#808B95' }),
    }),
  }),
  Object.freeze({
    id: 'neon-protocol',
    name: '霓虹协议',
    description: '冷峻终端、锐利边界与双强调光',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#12C8BD',
    previewStyle: Object.freeze({ radius: 4, borderWidth: 2, elevation: 'glow' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#eaf2f3', sidebar: '#dce9eb', panel: '#f8fcfc', accent: '#007F8F', secondary: '#D91B70', border: '#658F96' }),
      dark: Object.freeze({ page: '#050a0d', sidebar: '#071116', panel: '#102229', accent: '#20E3D2', secondary: '#FF4FA3', border: '#1F5963' }),
    }),
  }),
  Object.freeze({
    id: 'vermilion-archive',
    name: '朱印档案',
    description: '纸墨层级与朱红标记',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#B43A2F',
    previewStyle: Object.freeze({ radius: 4, borderWidth: 1, elevation: 'flat' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#f5f5f1', sidebar: '#eaeae5', panel: '#fcfcf9', accent: '#B43A2F', secondary: '#30444B', border: '#C7C3B8' }),
      dark: Object.freeze({ page: '#141412', sidebar: '#1b1b18', panel: '#2d2d28', accent: '#DF6457', secondary: '#8FA9AF', border: '#58554C' }),
    }),
  }),
  Object.freeze({
    id: 'amber-terminal',
    name: '琥珀终端',
    description: '复古计算机控制台',
    source: 'builtin',
    supports: Object.freeze(['light', 'dark']),
    accentHex: '#8F5A08',
    previewStyle: Object.freeze({ radius: 3, borderWidth: 1, elevation: 'offset' }),
    preview: Object.freeze({
      light: Object.freeze({ page: '#f3f4f0', sidebar: '#e6e8e1', panel: '#fafbf7', accent: '#8F5A08', secondary: '#2F7D52', border: '#B8BEB0' }),
      dark: Object.freeze({ page: '#090b08', sidebar: '#10130e', panel: '#20261c', accent: '#F0B84A', secondary: '#67C98A', border: '#6B5D36' }),
    }),
  }),
])

const BUILTIN_THEME_IDS = new Set(BUILTIN_THEMES.map(theme => theme.id))

export function normalizeThemeId(value) {
  return BUILTIN_THEME_IDS.has(value) ? value : 'default'
}

export function getBuiltinTheme(value) {
  const normalized = normalizeThemeId(value)
  return BUILTIN_THEMES.find(theme => theme.id === normalized) || BUILTIN_THEMES[0]
}

export function resolveThemeColorMode(supports, preference, systemPrefersDark = false) {
  const supportedModes = Array.isArray(supports)
    ? [...new Set(supports.filter(mode => mode === 'light' || mode === 'dark'))]
    : []
  const requested = preference === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : preference
  if (supportedModes.includes(requested)) return requested
  return supportedModes[0] || 'light'
}
