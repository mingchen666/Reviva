<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  isDark: { type: Boolean, default: false },
})

const visible = ref(false)
const pos = ref({ left: 0, top: 0 })
const targetEl = ref(null)
const hasSelection = ref(false)
const canEdit = ref(false)

const menuClass = computed(() =>
  props.isDark
    ? 'bg-d3 border border-d4 shadow-black/45 text-wt-sub'
    : 'bg-white border border-bdrF shadow-black/12 text-lt-sub',
)

const itemHoverClass = computed(() =>
  props.isDark ? 'hover:bg-white/6' : 'hover:bg-l3',
)

function open(event, target) {
  const el = resolveEditable(target)
  if (!el) return
  event?.preventDefault?.()
  event?.stopPropagation?.()
  targetEl.value = el
  refreshState()
  const nextPos = clampPosition(event?.clientX || 0, event?.clientY || 0)
  pos.value = nextPos
  visible.value = true
  el.focus()
  addListeners()
}

function close() {
  visible.value = false
  targetEl.value = null
  removeListeners()
}

function refreshState() {
  const el = targetEl.value
  if (!el) {
    hasSelection.value = false
    canEdit.value = false
    return
  }
  hasSelection.value = selectionText(el).length > 0
  canEdit.value = !el.disabled && !el.readOnly
}

async function copySelection() {
  const text = selectionText(targetEl.value)
  if (!text) return
  await writeClipboardText(text)
  close()
}

async function cutSelection() {
  const el = targetEl.value
  const text = selectionText(el)
  if (!el || !text || !canEdit.value) return
  const copied = await writeClipboardText(text)
  if (!copied) return
  replaceSelection(el, '')
  close()
}

async function pasteClipboard() {
  const el = targetEl.value
  if (!el || !canEdit.value) return
  el.focus()
  try {
    const before = el.value
    const pastedByCommand = document.execCommand?.('paste')
    await nextTick()
    if (pastedByCommand && el.value !== before) {
      close()
      return
    }
  } catch (_) {}

  try {
    const text = await navigator.clipboard?.readText?.()
    if (text) replaceSelection(el, text)
  } catch (_) {}
  close()
}

function selectAllText() {
  const el = targetEl.value
  if (!el) return
  el.focus()
  el.select()
  refreshState()
  close()
}

function replaceSelection(el, text) {
  const start = Number.isFinite(el.selectionStart) ? el.selectionStart : el.value.length
  const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : start
  if (typeof el.setRangeText === 'function') {
    el.setRangeText(text, start, end, 'end')
  } else {
    el.value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`
    const cursor = start + text.length
    el.setSelectionRange?.(cursor, cursor)
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
}

function selectionText(el) {
  if (!el || typeof el.value !== 'string') return ''
  const start = Number.isFinite(el.selectionStart) ? el.selectionStart : 0
  const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : 0
  if (start === end) return ''
  return el.value.slice(Math.min(start, end), Math.max(start, end))
}

async function writeClipboardText(text) {
  if (!text) return false
  try {
    await navigator.clipboard?.writeText?.(text)
    return true
  } catch (_) {
    return fallbackCopyText(text)
  }
}

function fallbackCopyText(text) {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  el.style.top = '0'
  document.body.appendChild(el)
  el.select()
  let ok = false
  try { ok = document.execCommand?.('copy') === true } catch (_) {}
  document.body.removeChild(el)
  targetEl.value?.focus?.()
  return ok
}

function resolveEditable(target) {
  const el = target?.tagName ? target : target?.value
  if (!el) return null
  const tag = String(el.tagName || '').toLowerCase()
  return tag === 'textarea' || (tag === 'input' && isTextInput(el)) ? el : null
}

function isTextInput(el) {
  const type = String(el.type || 'text').toLowerCase()
  return ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(type)
}

function clampPosition(left, top) {
  const width = 152
  const height = 160
  const margin = 8
  return {
    left: Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin)),
    top: Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin)),
  }
}

function onDocumentPointerDown(event) {
  if (!visible.value) return
  const menu = document.getElementById('text-edit-context-menu')
  if (menu?.contains(event.target)) return
  close()
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') close()
}

function addListeners() {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown, true)
  window.addEventListener('resize', close, true)
  window.addEventListener('scroll', close, true)
}

function removeListeners() {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown, true)
  window.removeEventListener('resize', close, true)
  window.removeEventListener('scroll', close, true)
}

onBeforeUnmount(removeListeners)

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      id="text-edit-context-menu"
      class="fixed z-[10000] w-[152px] rounded-lg p-1 shadow-xl"
      :class="menuClass"
      :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
      @contextmenu.prevent
    >
      <button
        type="button"
        :disabled="!hasSelection"
        class="menu-item"
        :class="[itemHoverClass, !hasSelection ? 'opacity-45 cursor-not-allowed' : '']"
        @click="copySelection"
      >
        <i class="ri-file-copy-line text-[13px]" />
        <span>复制</span>
      </button>
      <button
        type="button"
        :disabled="!hasSelection || !canEdit"
        class="menu-item"
        :class="[itemHoverClass, !hasSelection || !canEdit ? 'opacity-45 cursor-not-allowed' : '']"
        @click="cutSelection"
      >
        <i class="ri-scissors-cut-line text-[13px]" />
        <span>剪切</span>
      </button>
      <button
        type="button"
        :disabled="!canEdit"
        class="menu-item"
        :class="[itemHoverClass, !canEdit ? 'opacity-45 cursor-not-allowed' : '']"
        @click="pasteClipboard"
      >
        <i class="ri-clipboard-line text-[13px]" />
        <span>粘贴</span>
      </button>
      <div class="my-1 h-px" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
      <button
        type="button"
        class="menu-item"
        :class="itemHoverClass"
        @click="selectAllText"
      >
        <i class="ri-select-all text-[13px]" />
        <span>全选</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.menu-item {
  width: 100%;
  height: 30px;
  border-radius: 6px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  transition: background-color 0.12s ease, opacity 0.12s ease;
}
</style>
