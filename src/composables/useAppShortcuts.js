import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationsStore } from '@/stores/conversations'
import { useAppStore } from '@/stores/app'

const defaultBindings = {
  app_new: ['Ctrl', 'N'],
  app_search: ['Ctrl', 'K'],
  app_switch: ['Ctrl', 'Tab'],
  app_sidebar: ['Ctrl', 'Shift', 'L'],
  app_sidebar2: ['Ctrl', 'B'],
}

const bindings = ref({ ...defaultBindings })

function comboMatches(e, combo) {
  if (!combo || !combo.length) return false
  const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey }
  const key = e.key

  let expectedMods = { ctrl: false, shift: false, alt: false }
  let expectedKey = ''

  for (const part of combo) {
    if (part === 'Ctrl') expectedMods.ctrl = true
    else if (part === 'Shift') expectedMods.shift = true
    else if (part === 'Alt') expectedMods.alt = true
    else expectedKey = part
  }

  if (mods.ctrl !== expectedMods.ctrl) return false
  if (mods.shift !== expectedMods.shift) return false
  if (mods.alt !== expectedMods.alt) return false

  if (!expectedKey) return false
  const keyLower = key.toLowerCase()
  const expectedLower = expectedKey.toLowerCase()
  return keyLower === expectedLower
}

async function loadBindings() {
  if (!window.electronAPI?.db?.settings) return
  try {
    const saved = await window.electronAPI.db.settings.get('shortcutBindings')
    if (saved && typeof saved === 'object') {
      bindings.value = { ...defaultBindings, ...saved }
    }
  } catch (e) { /* ignore */ }
}

export function useAppShortcuts(callbacks = {}) {
  const router = useRouter()
  const convStore = useConversationsStore()
  const appStore = useAppStore()

  async function onKeydown(e) {
    // Don't intercept when typing in input/textarea/contenteditable
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return

    // app_new: Ctrl+N → new conversation
    if (comboMatches(e, bindings.value.app_new)) {
      e.preventDefault()
      await router.push('/workchat')
      convStore.createConv({ title: '新对话' })
      return
    }

    // app_search: Ctrl+K → command palette
    if (comboMatches(e, bindings.value.app_search)) {
      e.preventDefault()
      callbacks.openCommandPalette?.()
      return
    }

    // app_switch: Ctrl+Tab → switch conversation (future)
    if (comboMatches(e, bindings.value.app_switch)) {
      e.preventDefault()
      // TODO: cycle through recent conversations
      return
    }

    // app_sidebar: Ctrl+Shift+L → toggle sidebar
    if (comboMatches(e, bindings.value.app_sidebar)) {
      e.preventDefault()
      appStore.toggleRightPanel()
      return
    }

    // app_sidebar2: Ctrl+B → toggle sidebar
    if (comboMatches(e, bindings.value.app_sidebar2)) {
      e.preventDefault()
      appStore.toggleRightPanel()
      return
    }
  }

  onMounted(async () => {
    await loadBindings()
    document.addEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
  })
}
