// Built-in theme metadata (copied from src/config/themes.js).
// Main process can't import from src/, so this is duplicated.
// Keep in sync with the source file.

export const BUILTIN_THEMES = Object.freeze([
  { id: 'default', name: '经典', description: 'Reviva 默认主题', source: 'builtin' },
  { id: 'clarity', name: '冷杉', description: '冷静紧凑的专业工作台', source: 'builtin' },
  { id: 'serene', name: '暮樱', description: '柔和舒展的阅读界面', source: 'builtin' },
  { id: 'contrast', name: '石墨', description: '高可读性与明确边界', source: 'builtin' },
  { id: 'neon-protocol', name: '霓虹协议', description: '冷峻终端、锐利边界与双强调光', source: 'builtin' },
  { id: 'vermilion-archive', name: '朱印档案', description: '深暖色档案风', source: 'builtin' },
  { id: 'amber-terminal', name: '琥珀终端', description: '暖色终端风', source: 'builtin' },
].map(t => Object.freeze(t)))

export const BUILTIN_THEME_IDS = Object.freeze(BUILTIN_THEMES.map(t => t.id))
