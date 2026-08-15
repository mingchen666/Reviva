import { onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationsStore } from '@/stores/conversations'
import {
  loadShortcutBindings,
  shortcutBindings,
  shortcutEventMatches,
} from '@/config/shortcuts'

const EDITABLE_TARGETS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(target) {
  return !!target && (EDITABLE_TARGETS.has(target.tagName) || target.isContentEditable)
}

function recentConversations(conversations) {
  return [...(conversations || [])]
    .filter(item => item?.id)
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt || a.createdAt || '') || 0
      const right = Date.parse(b.updatedAt || b.createdAt || '') || 0
      return right - left
    })
}

function dispatch(name, detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function useAppShortcuts(callbacks = {}) {
  const router = useRouter()
  const convStore = useConversationsStore()

  async function switchConversation(direction = 1) {
    const list = recentConversations(convStore.conversations)
    if (list.length < 2) return
    const currentIndex = list.findIndex(item => item.id === convStore.currentConvId)
    if (currentIndex < 0) {
      const first = list[0]
      if (!first) return
      await router.push('/workchat')
      convStore.setCurrentConv(first.id)
      dispatch('mindspace:workchat-activate-conversation', { conversationId: first.id })
      callbacks.onConversationSwitch?.(first)
      return
    }
    const nextIndex = (currentIndex + direction + list.length) % list.length
    const next = list[nextIndex]
    if (!next || next.id === convStore.currentConvId) return
    await router.push('/workchat')
    convStore.setCurrentConv(next.id)
    dispatch('mindspace:workchat-activate-conversation', { conversationId: next.id })
    callbacks.onConversationSwitch?.(next)
  }

  async function onKeydown(event) {
    const editable = isEditableTarget(event.target)
    // The chat editor owns its send/newline bindings. App-level shortcuts are
    // intentionally disabled while typing so Ctrl+B, Ctrl+N, etc. never
    // surprise the user or override native text editing behavior.
    if (editable) return

    if (shortcutEventMatches(event, shortcutBindings.value.app_new)) {
      event.preventDefault()
      await router.push('/workchat')
      const created = await convStore.createConv({ title: '新对话' })
      dispatch('mindspace:workchat-activate-conversation', { conversationId: created?.id })
      return
    }

    if (shortcutEventMatches(event, shortcutBindings.value.app_search)) {
      event.preventDefault()
      callbacks.openCommandPalette?.()
      return
    }

    const switchMatches = shortcutEventMatches(event, shortcutBindings.value.app_switch)
      || (event.shiftKey
        && !shortcutBindings.value.app_switch.includes('Shift')
        && shortcutEventMatches(event, shortcutBindings.value.app_switch, { ignoreShift: true }))
    if (switchMatches) {
      event.preventDefault()
      const reverse = event.shiftKey && !shortcutBindings.value.app_switch.includes('Shift')
      await switchConversation(reverse ? -1 : 1)
      return
    }

  }

  onMounted(async () => {
    await loadShortcutBindings()
    document.addEventListener('keydown', onKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
  })
}
