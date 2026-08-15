<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ChatSlashCommandMenu from './ChatSlashCommandMenu.vue'
import ChatQuickInputMenu from './ChatQuickInputMenu.vue'
import { QUICK_INPUT_TYPES } from '@/stores/quickInputs'
import {
  createQuickInputToken,
  createSkillToken,
  normalizeInputDocument,
} from '@/utils/chatInputDocument'
import { shortcutBindings, shortcutEventMatches } from '@/config/shortcuts'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  isDark: Boolean,
  slashItems: { type: Array, default: () => [] },
  quickItems: { type: Array, default: () => [] },
  quickEnabled: { type: Boolean, default: true },
  placeholder: { type: String, default: '' },
  menuDirection: { type: String, default: 'up' },
  ariaLabel: { type: String, default: '消息输入框' },
})

const emit = defineEmits(['update:modelValue', 'submit', 'focus', 'blur', 'paste', 'contextmenu'])

const editorRef = ref(null)
const menuContext = ref(null)
const activeIndex = ref(0)
const menuPosition = ref({ left: 0, top: 0, width: 360, listHeight: 280, placement: 'up' })
const composing = ref(false)
const lastEmittedSignature = ref('')
const menuId = `token-menu-${Math.random().toString(36).slice(2)}`

const menuItems = computed(() => {
  if (menuContext.value?.kind === 'at') {
    return props.quickItems.map(item => {
      const typeMeta = QUICK_INPUT_TYPES[item.type] || QUICK_INPUT_TYPES.command
      const keywords = [item.title, item.description, item.content, typeMeta.label].filter(Boolean)
      return {
        type: 'quick-input',
        typeLabel: typeMeta.label,
        id: item.id,
        label: `@${item.title}`,
        name: item.description || typeMeta.label,
        description: item.content,
        icon: typeMeta.icon,
        keywords,
        searchText: keywords.join(' ').toLowerCase(),
        source: item,
      }
    })
  }
  return props.slashItems
})

const filteredItems = computed(() => {
  const query = String(menuContext.value?.query || '').trim().toLowerCase()
  if (!query) return menuItems.value
  return menuItems.value.filter(item => String(item.searchText || [item.label, item.name, item.description].join(' ')).toLowerCase().includes(query))
})

const menuEmptyText = computed(() => {
  const query = String(menuContext.value?.query || '').trim()
  const target = menuContext.value?.kind === 'at' ? '快捷输入' : '技能'
  return query ? `没有匹配“${query}”的${target}` : `暂无可用${target}`
})

const menuStyle = computed(() => ({
  left: `${menuPosition.value.left}px`,
  top: `${menuPosition.value.top}px`,
  width: `${menuPosition.value.width}px`,
  transform: menuPosition.value.placement === 'up' ? 'translateY(-100%)' : 'none',
}))

function signature(document) {
  return JSON.stringify(normalizeInputDocument(document))
}

function isInsideEditor(node) {
  return !!editorRef.value && (node === editorRef.value || editorRef.value.contains(node))
}

function getSelectionRange(collapsedOnly = true) {
  const selection = window.getSelection?.()
  if (!selection || !selection.rangeCount || (collapsedOnly && !selection.isCollapsed)) return null
  const range = selection.getRangeAt(0)
  return isInsideEditor(range.startContainer) ? range : null
}

function caretOffset(range) {
  const before = document.createRange()
  before.selectNodeContents(editorRef.value)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

function pointAtOffset(root, target) {
  let remaining = Math.max(0, target)
  let lastText = null
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      lastText = node
      const length = node.nodeValue?.length || 0
      if (remaining <= length) return { node, offset: remaining }
      remaining -= length
      return null
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-chat-token')) {
      const textNode = node.firstChild || node.appendChild(document.createTextNode(node.textContent || ''))
      lastText = textNode
      const length = textNode.nodeValue?.length || 0
      if (remaining <= length) return { node: textNode, offset: remaining }
      remaining -= length
      return null
    }
    for (const child of [...(node.childNodes || [])]) {
      const result = walk(child)
      if (result) return result
    }
    return null
  }
  return walk(root) || (lastText ? { node: lastText, offset: lastText.nodeValue?.length || 0 } : { node: root, offset: root.childNodes.length })
}

function parseDocument() {
  const result = []
  const pushText = text => {
    if (!text) return
    const previous = result[result.length - 1]
    if (previous?.type === 'text') previous.text += text
    else result.push({ type: 'text', text })
  }
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.nodeValue || '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.hasAttribute('data-chat-token')) {
      try {
        const token = JSON.parse(node.dataset.chatToken || '')
        if (token?.type && token.label) result.push(token)
      } catch (_) {}
      return
    }
    if (node.tagName === 'BR') {
      pushText('\n')
      return
    }
    node.childNodes.forEach(walk)
  }
  editorRef.value?.childNodes.forEach(walk)
  return normalizeInputDocument(result)
}

function emitDocument() {
  let documentValue = parseDocument()
  if (documentValue.every(segment => segment.type === 'text' && !segment.text.replace(/\n/g, ''))) {
    editorRef.value?.replaceChildren()
    documentValue = []
  }
  const nextSignature = signature(documentValue)
  lastEmittedSignature.value = nextSignature
  emit('update:modelValue', documentValue)
}

function createTokenElement(token) {
  const element = document.createElement('span')
  element.className = `chat-token ${token.type === 'skill' ? 'chat-token-skill' : 'chat-token-quick'}`
  element.contentEditable = 'false'
  element.dataset.chatToken = JSON.stringify(token)
  element.title = token.contentSnapshot || token.label
  element.textContent = token.label
  return element
}

function renderDocument(documentValue) {
  const editor = editorRef.value
  if (!editor) return
  editor.replaceChildren()
  for (const segment of normalizeInputDocument(documentValue)) {
    if (segment.type === 'text') editor.appendChild(document.createTextNode(segment.text))
    else editor.appendChild(createTokenElement(segment))
  }
}

function focus() {
  const editor = editorRef.value
  editor?.focus()
  const selection = window.getSelection?.()
  if (!editor || (selection?.rangeCount && isInsideEditor(selection.getRangeAt(0).startContainer))) return
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  setCaret(range)
}

function setCaret(range) {
  const selection = window.getSelection?.()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

function insertTextAtCaret(text) {
  const range = getSelectionRange(false)
  if (!range) {
    focus()
    const fallback = document.createRange()
    fallback.selectNodeContents(editorRef.value)
    fallback.collapse(false)
    setCaret(fallback)
    return insertTextAtCaret(text)
  }
  range.deleteContents()
  const node = document.createTextNode(String(text || ''))
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  setCaret(range)
  emitDocument()
  syncContext()
}

function insertToken(item) {
  const context = menuContext.value
  const range = getSelectionRange()
  if (!context || !range) return
  const currentOffset = caretOffset(range)
  const target = document.createRange()
  const start = pointAtOffset(editorRef.value, Math.max(0, currentOffset - context.token.length))
  const end = pointAtOffset(editorRef.value, currentOffset)
  target.setStart(start.node, start.offset)
  target.setEnd(end.node, end.offset)
  target.deleteContents()
  const token = context.kind === 'at' ? createQuickInputToken(item.source) : createSkillToken(item)
  const tokenElement = createTokenElement(token)
  target.insertNode(tokenElement)
  const spacer = document.createTextNode(' ')
  tokenElement.after(spacer)
  const nextRange = document.createRange()
  nextRange.setStart(spacer, 1)
  nextRange.collapse(true)
  setCaret(nextRange)
  emitDocument()
  closeMenu()
  nextTick(() => focus())
}

function insertTokenAtCaret(token) {
  let range = getSelectionRange(false)
  if (!range) {
    focus()
    range = getSelectionRange(false)
  }
  if (!range) return
  range.deleteContents()
  const tokenElement = createTokenElement(token)
  range.insertNode(tokenElement)
  const spacer = document.createTextNode(' ')
  tokenElement.after(spacer)
  const nextRange = document.createRange()
  nextRange.setStart(spacer, 1)
  nextRange.collapse(true)
  setCaret(nextRange)
  emitDocument()
  closeMenu()
  nextTick(() => focus())
}

function directChild(node) {
  let current = node
  while (current && current.parentNode !== editorRef.value) current = current.parentNode
  return current
}

function removeAdjacentToken(direction) {
  const range = getSelectionRange()
  if (!range) return false
  const container = range.startContainer
  const offset = range.startOffset
  let candidate = null
  if (container === editorRef.value) {
    candidate = editorRef.value.childNodes[offset + (direction === 'backward' ? -1 : 0)]
  } else {
    const child = directChild(container)
    if (child?.hasAttribute?.('data-chat-token')) {
      const text = child.firstChild
      if ((direction === 'backward' && container === text && offset === 0) || (direction === 'forward' && container === text && offset === text.length)) candidate = child
    } else if (container.nodeType === Node.TEXT_NODE) {
      if (direction === 'backward' && offset === 0) candidate = child?.previousSibling
      if (direction === 'forward' && offset === container.nodeValue.length) candidate = child?.nextSibling
    }
  }
  if (!candidate?.hasAttribute?.('data-chat-token')) return false
  const previous = candidate.previousSibling
  const next = candidate.nextSibling
  candidate.remove()
  const target = direction === 'backward' ? previous : next
  const nextRange = document.createRange()
  if (target?.nodeType === Node.TEXT_NODE) nextRange.setStart(target, direction === 'backward' ? target.length : 0)
  else if (target) nextRange.setStartBefore(target)
  else nextRange.selectNodeContents(editorRef.value)
  nextRange.collapse(true)
  setCaret(nextRange)
  emitDocument()
  syncContext()
  return true
}

function handleKeydown(event) {
  // Let the IME consume Enter while the user is confirming a composition;
  // otherwise the configured send shortcut can submit half-finished text.
  if (event.isComposing || composing.value) return
  if (menuContext.value) {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); return }
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return }
    if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
      event.preventDefault()
      if (filteredItems.value[activeIndex.value]) insertToken(filteredItems.value[activeIndex.value])
      return
    }
  }
  if (event.key === 'Backspace' && removeAdjacentToken('backward')) { event.preventDefault(); return }
  if (event.key === 'Delete' && removeAdjacentToken('forward')) { event.preventDefault(); return }
  if (shortcutEventMatches(event, shortcutBindings.value.input_newline)) {
    event.preventDefault()
    insertTextAtCaret('\n')
    return
  }
  if (shortcutEventMatches(event, shortcutBindings.value.input_send)) {
    event.preventDefault()
    emit('submit')
  }
}

function handleInput() {
  if (!composing.value) {
    emitDocument()
    syncContext()
  }
}

function handleCompositionStart() { composing.value = true }
function handleCompositionEnd() { composing.value = false; handleInput() }

function moveActive(delta) {
  const count = filteredItems.value.length
  if (!count) return
  activeIndex.value = (activeIndex.value + delta + count) % count
}

function updateMenuPosition() {
  if (!menuContext.value || !editorRef.value) return
  const rect = editorRef.value.getBoundingClientRect()
  const width = Math.min(Math.max(rect.width, 300), 560)
  const margin = 8
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
  const preferredDown = props.menuDirection === 'down'
  const roomDown = window.innerHeight - rect.bottom - margin
  const roomUp = rect.top - margin
  let down = preferredDown
  const preferredRoom = preferredDown ? roomDown : roomUp
  const alternateRoom = preferredDown ? roomUp : roomDown
  if (preferredRoom < 120 && alternateRoom > preferredRoom) down = !preferredDown
  const available = Math.max(80, down ? roomDown : roomUp)
  const listHeight = Math.max(72, Math.min(280, available - 40))
  const placement = down ? 'down' : 'up'
  const top = down ? rect.bottom + 6 : rect.top - 6
  menuPosition.value = { left, top, width, listHeight, placement }
}

function syncContext() {
  if (composing.value) return
  const range = getSelectionRange()
  if (!range) return
  const before = document.createRange()
  before.selectNodeContents(editorRef.value)
  before.setEnd(range.startContainer, range.startOffset)
  const prefix = before.toString()
  const match = prefix.match(/(^|\s)([@/])([^\s@/]*)$/)
  if (!match || (match[2] === '@' && !props.quickEnabled)) {
    closeMenu()
    return
  }
  const next = { kind: match[2] === '@' ? 'at' : 'slash', token: `${match[2]}${match[3]}`, query: match[3] }
  const changed = JSON.stringify(menuContext.value) !== JSON.stringify(next)
  menuContext.value = next
  if (changed) activeIndex.value = 0
  nextTick(updateMenuPosition)
}

function closeMenu() { menuContext.value = null; activeIndex.value = 0 }

function handleBlur(event) {
  setTimeout(() => closeMenu(), 120)
  emit('blur', event)
}

function handlePaste(event) {
  emit('paste', event)
  if (event.defaultPrevented) return
  const text = event.clipboardData?.getData('text/plain')
  if (text) {
    event.preventDefault()
    insertTextAtCaret(text)
  }
}

function handleContextMenu(event) { emit('contextmenu', { event, element: editorRef.value }) }

function onViewportChange() {
  if (menuContext.value) updateMenuPosition()
}

watch(() => props.modelValue, value => {
  const nextSignature = signature(value)
  if (nextSignature === lastEmittedSignature.value) {
    lastEmittedSignature.value = ''
    return
  }
  renderDocument(value)
  lastEmittedSignature.value = ''
}, { deep: true, immediate: true })

watch(filteredItems, items => {
  if (!items.length || activeIndex.value >= items.length) activeIndex.value = 0
})

watch(() => props.quickEnabled, enabled => {
  if (!enabled && menuContext.value?.kind === 'at') closeMenu()
})

onMounted(() => {
  renderDocument(props.modelValue)
  window.addEventListener('resize', onViewportChange, true)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportChange, true)
  window.removeEventListener('scroll', onViewportChange, true)
})

defineExpose({
  focus,
  getElement: () => editorRef.value,
  insertText: insertTextAtCaret,
  insertSkill: item => insertTokenAtCaret(createSkillToken(item)),
  closeMenu,
})
</script>

<template>
  <div class="chat-token-editor" :class="isDark ? 'chat-token-editor-dark' : 'chat-token-editor-light'">
    <div
      ref="editorRef"
      class="chat-token-editor-surface"
      contenteditable="true"
      role="textbox"
      :aria-label="ariaLabel"
      :data-placeholder="placeholder"
      spellcheck="true"
      @keydown="handleKeydown"
      @input="handleInput"
      @keyup="syncContext"
      @click="syncContext"
      @focus="emit('focus', $event)"
      @blur="handleBlur"
      @paste="handlePaste"
      @contextmenu.prevent="handleContextMenu"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd" />

    <Teleport to="body">
      <ChatQuickInputMenu
        v-if="menuContext?.kind === 'at'"
        :id="menuId"
        :data-chat-token-menu="menuId"
        class="chat-token-menu fixed z-[80]"
        :style="menuStyle"
        :is-dark="isDark"
        :items="filteredItems"
        :active-index="activeIndex"
        :empty-text="menuEmptyText"
        :max-height="menuPosition.listHeight"
        @hover="activeIndex = $event"
        @select="insertToken" />
      <ChatSlashCommandMenu
        v-else-if="menuContext"
        :id="menuId"
        :data-chat-token-menu="menuId"
        class="chat-token-menu fixed z-[80]"
        :style="menuStyle"
        :is-dark="isDark"
        :items="filteredItems"
        :active-index="activeIndex"
        :empty-text="menuEmptyText"
        :max-height="menuPosition.listHeight"
        @hover="activeIndex = $event"
        @select="insertToken" />
    </Teleport>
  </div>
</template>

<style>
.chat-token-editor-surface {
  min-height: 56px;
  width: 100%;
  outline: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: .875rem;
  line-height: 1.425;
  cursor: text;
}
.chat-token-editor-surface:empty::before { content: attr(data-placeholder); pointer-events: none; }
.chat-token-editor-light .chat-token-editor-surface { color: #172033; }
.chat-token-editor-light .chat-token-editor-surface:empty::before { color: #98a2b3; }
.chat-token-editor-dark .chat-token-editor-surface { color: #f8fafc; }
.chat-token-editor-dark .chat-token-editor-surface:empty::before { color: #7b8799; }
.chat-token {
  display: inline-flex;
  align-items: center;
  height: 24px;
  margin: 0 2px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid transparent;
  vertical-align: middle;
  user-select: all;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1;
  font-weight: 650;
}
.chat-token-quick { color: #3654db; background: #eef1ff; border-color: #b9c4ff; }
.chat-token-skill { color: #6d28d9; background: #f3e8ff; border-color: #d8b4fe; }
.chat-token-editor-dark .chat-token-quick { color: #b9c4ff; background: rgba(112, 132, 255, .15); border-color: rgba(143, 160, 255, .38); }
.chat-token-editor-dark .chat-token-skill { color: #d8b4fe; background: rgba(167, 139, 250, .14); border-color: rgba(167, 139, 250, .38); }
</style>
