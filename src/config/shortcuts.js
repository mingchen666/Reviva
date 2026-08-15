import { ref } from 'vue'

const LEGACY_DEFAULT_GLOBAL_INVOKE = Object.freeze(['Ctrl', 'Shift', 'Space'])
const DEFAULT_GLOBAL_INVOKE = Object.freeze(['Ctrl', 'Alt', 'Space'])

// Keep this list limited to actions that are actually handled by the app.
// `@` and `/` are input trigger characters, rather than keyboard shortcuts,
// so they intentionally do not belong in the persisted bindings map.
export const DEFAULT_SHORTCUT_BINDINGS = Object.freeze({
  // Ctrl+Shift+Space is commonly claimed by Chinese IMEs and utility apps.
  global_invoke: [...DEFAULT_GLOBAL_INVOKE],
  app_new: ['Ctrl', 'N'],
  app_search: ['Ctrl', 'K'],
  app_switch: ['Ctrl', 'Tab'],
  // Keep the existing chat behavior as the default: Enter sends and
  // Shift+Enter inserts a line break. Both remain user-configurable.
  input_send: ['Enter'],
  input_newline: ['Shift', 'Enter'],
})

export const SHORTCUT_GROUPS = Object.freeze([
  {
    label: '全局快捷键',
    icon: 'ri-global-line',
    color: 'brand',
    items: [
      { key: 'global_invoke', name: '唤起应用', desc: '从任意位置呼出 Reviva 主窗口' },
    ],
  },
  {
    label: '应用内',
    icon: 'ri-apps-line',
    color: 'agent',
    items: [
      { key: 'app_new', name: '新建对话', desc: '快速开启一个新的对话' },
      { key: 'app_search', name: '命令面板', desc: '打开命令面板，搜索页面、设置和对话' },
      { key: 'app_switch', name: '切换对话', desc: '在最近访问的对话之间循环切换' },
    ],
  },
  {
    label: '输入框',
    icon: 'ri-input-method-line',
    color: 'amber',
    items: [
      { key: 'input_send', name: '发送消息', desc: '发送当前输入框内容' },
      { key: 'input_newline', name: '换行', desc: '在输入框中插入新行' },
    ],
  },
])

export const EDITABLE_SHORTCUT_KEYS = Object.freeze(Object.keys(DEFAULT_SHORTCUT_BINDINGS))
export const GLOBAL_SHORTCUT_KEYS = Object.freeze(['global_invoke'])
export const SHORTCUT_MODIFIERS = Object.freeze(['Ctrl', 'Shift', 'Alt'])

export function shortcutRequiresModifier(action) {
  return action !== 'input_send' && action !== 'input_newline'
}

export function isValidShortcutForAction(action, combo) {
  const normalized = normalizeShortcutCombo(combo)
  if (!normalized) return false
  if (shortcutRequiresModifier(action)) {
    return normalized.some(key => SHORTCUT_MODIFIERS.includes(key))
  }
  const nonModifier = normalized.find(key => !SHORTCUT_MODIFIERS.includes(key))
  // A bare printable character would fire while the user is typing. Input
  // shortcuts may be bare only for named control/function keys (Enter, Tab,
  // arrows, F-keys, etc.).
  if (!normalized.some(key => SHORTCUT_MODIFIERS.includes(key))
    && nonModifier?.length === 1
    && !SPECIAL_KEYS.has(nonModifier)
    && !/^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(nonModifier)) {
    return false
  }
  return true
}

const KEY_ALIASES = Object.freeze({
  Control: 'Ctrl',
  Meta: 'Ctrl',
  Command: 'Ctrl',
  Cmd: 'Ctrl',
  OS: 'Ctrl',
  AltGraph: 'Alt',
  Option: 'Alt',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Spacebar: 'Space',
})

const SPECIAL_KEYS = new Set([
  'Enter', 'Tab', 'Space', 'Esc', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'Up', 'Down', 'Left', 'Right', 'PageUp', 'PageDown', 'PrintScreen', 'Pause',
])

function cloneBindingMap(bindings) {
  return Object.fromEntries(Object.entries(bindings).map(([key, value]) => [key, [...value]]))
}

export function normalizeShortcutKey(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (KEY_ALIASES[raw]) return KEY_ALIASES[raw]
  if (SHORTCUT_MODIFIERS.includes(raw)) return raw
  if (SPECIAL_KEYS.has(raw)) return raw
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/i.test(raw)) return raw.toUpperCase()
  if (raw.length === 1) return raw.toUpperCase()
  return ''
}

export function normalizeShortcutCombo(combo) {
  if (!Array.isArray(combo)) return null
  const normalized = []
  for (const part of combo) {
    const key = normalizeShortcutKey(part)
    if (!key) continue
    if (SHORTCUT_MODIFIERS.includes(key)) {
      if (!normalized.includes(key)) normalized.push(key)
      continue
    }
    // A shortcut must have one non-modifier key. Ignore extra keys rather than
    // allowing an accelerator that Electron/the browser cannot interpret.
    if (normalized.some(item => !SHORTCUT_MODIFIERS.includes(item))) return null
    normalized.push(key)
  }
  const nonModifier = normalized.find(item => !SHORTCUT_MODIFIERS.includes(item))
  if (!nonModifier) return null
  const modifiers = SHORTCUT_MODIFIERS.filter(item => normalized.includes(item))
  return [...modifiers, nonModifier]
}

export function normalizeShortcutBindings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const result = cloneBindingMap(DEFAULT_SHORTCUT_BINDINGS)
  for (const key of EDITABLE_SHORTCUT_KEYS) {
    const combo = isValidShortcutForAction(key, source[key]) ? normalizeShortcutCombo(source[key]) : null
    if (combo) result[key] = combo
  }
  return result
}

export function shortcutComboKey(combo) {
  const normalized = normalizeShortcutCombo(combo)
  return normalized ? normalized.join('+').toLowerCase() : ''
}

function isLegacyDefaultGlobalInvoke(combo) {
  return shortcutComboKey(combo) === shortcutComboKey(LEGACY_DEFAULT_GLOBAL_INVOKE)
}

export function keyboardEventKey(event) {
  if (!event) return ''
  const raw = event.key === ' ' ? 'Space' : event.key
  return normalizeShortcutKey(raw)
}

export function shortcutEventMatches(event, combo, options = {}) {
  const normalized = normalizeShortcutCombo(combo)
  if (!normalized || !event) return false
  const expected = new Set(normalized)
  const hasCtrl = !!(event.ctrlKey || event.metaKey)
  const hasShift = !!event.shiftKey
  const hasAlt = !!event.altKey
  if (hasCtrl !== expected.has('Ctrl')) return false
  if (!options.ignoreShift && hasShift !== expected.has('Shift')) return false
  if (options.ignoreShift && expected.has('Shift') && !hasShift) return false
  if (hasAlt !== expected.has('Alt')) return false
  return keyboardEventKey(event).toLowerCase() === normalized.find(key => !SHORTCUT_MODIFIERS.includes(key)).toLowerCase()
}

// A tiny shared reactive source keeps settings and runtime listeners in sync
// without making either side import the other component.
export const shortcutBindings = ref(normalizeShortcutBindings())

export function setShortcutBindings(value) {
  shortcutBindings.value = normalizeShortcutBindings(value)
  return shortcutBindings.value
}

export async function loadShortcutBindings() {
  if (typeof window === 'undefined' || !window.electronAPI?.db?.settings) return shortcutBindings.value
  try {
    const saved = await window.electronAPI.db.settings.get('shortcutBindings')
    const normalized = normalizeShortcutBindings(saved)
    // Move the former default away from a shortcut frequently reserved by IMEs.
    // Only the old shipped default is migrated; every other user choice stays intact.
    if (isLegacyDefaultGlobalInvoke(saved?.global_invoke)) {
      normalized.global_invoke = [...DEFAULT_GLOBAL_INVOKE]
      await window.electronAPI.db.settings.set('shortcutBindings', JSON.stringify(normalized))
    }
    return setShortcutBindings(normalized)
  } catch (_) {
    return shortcutBindings.value
  }
}
