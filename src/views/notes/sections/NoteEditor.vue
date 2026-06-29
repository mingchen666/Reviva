<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import NoteEmptyState from './NoteEmptyState.vue'
import NotePreview from './NotePreview.vue'
import MarkdownToolbar from './MarkdownToolbar.vue'
import AiSlashMenu from './AiSlashMenu.vue'
import AiSelectionBubble from './AiSelectionBubble.vue'
import AiConfigModal from './AiConfigModal.vue'
import AiResultCard from './AiResultCard.vue'
import { useNoteHistory } from '@/composables/useNoteHistory'
import { runNoteAiTask, NOTE_AI_PROMPTS, NOTE_AI_COMMANDS } from '@/composables/useNoteAi'

const notesStore = useNotesStore()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const message = useMessage()

const editMode = ref('split')
const localContent = ref('')
const localTitle = ref('')
const saveTimer = ref(null)
const lastSavedAt = ref(null)
const showDeleteModal = ref(false)
const SPLIT_RATIO_KEY = 'reviva:note-split-ratio'
const splitRatio = ref(loadSplitRatio())
const isResizing = ref(false)
const splitContainerRef = ref(null)
function loadSplitRatio() {
  try {
    const v = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) || '')
    if (Number.isFinite(v) && v >= 0.2 && v <= 0.8) return v
  } catch {}
  return 0.5
}
const props = defineProps({ showAiConfig: { type: Boolean, default: false } })
const emit = defineEmits(['create-note', 'update:showAiConfig'])
const showAiConfig = computed({
  get: () => props.showAiConfig,
  set: (v) => emit('update:showAiConfig', v),
})
const isSaving = ref(false)
const textareaRef = ref(null)
const editToolbarHostRef = ref(null)
const splitToolbarHostRef = ref(null)
const editorShellRef = ref(null)
let savedCursor = { start: 0, end: 0 }

const currentNote = computed(() => notesStore.currentNote)
const isEditing = computed(() => currentNote.value !== null)
const charCount = computed(() => localContent.value.length)

const saveStatus = computed(() => {
  if (isSaving.value) return 'saving'
  if (lastSavedAt.value) return 'saved'
  return 'idle'
})

function formatSavedTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  if (sameDay) return hm
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

const formattedSavedTime = computed(() => formatSavedTime(lastSavedAt.value))

const currentFolderName = computed(() => {
  if (!currentNote.value || !currentNote.value.folder_id) return ''
  const folder = notesStore.folders.find(f => f.id === currentNote.value.folder_id)
  return folder?.name || ''
})

// ─── History (undo/redo) ───
const history = useNoteHistory({ max: 50, throttleMs: 500 })

function currentState() {
  const t = textareaRef.value
  return {
    content: localContent.value,
    title: localTitle.value,
    cursor: t ? { start: t.selectionStart, end: t.selectionEnd } : { start: 0, end: 0 },
  }
}

function applySnapshot(snap) {
  if (!snap) return
  localContent.value = snap.content
  localTitle.value = snap.title
  nextTick(() => {
    if (textareaRef.value && snap.cursor) {
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(snap.cursor.start, snap.cursor.end)
    }
  })
}

function doUndo() {
  const snap = history.undo(currentState())
  if (snap) applySnapshot(snap)
}
function doRedo() {
  const snap = history.redo()
  if (snap) applySnapshot(snap)
}

// ─── AI Result Card ───
const AI_ACTION_META = NOTE_AI_COMMANDS

const aiResultShow = ref(false)
const aiResultText = ref('')
const aiResultStreaming = ref(false)
const aiResultError = ref(false)
const aiResultErrorMsg = ref('')
const aiResultKey = ref('')
const aiResultLabel = ref('')
const aiResultIcon = ref('')
const aiResultColor = ref('')
const aiAbortController = ref(null)
const aiFloatingStyle = ref({})
const aiUseFixed = ref(false)
let aiResultInsertStart = 0
let aiResultInsertEnd = 0
let aiResultScope = ''

function dismissAiResult() {
  aiResultShow.value = false
  aiResultText.value = ''
  aiResultStreaming.value = false
  aiResultError.value = false
  aiResultErrorMsg.value = ''
  aiResultKey.value = ''
  aiFloatingStyle.value = {}
  nextTick(() => { if (textareaRef.value) textareaRef.value.focus() })
}

function getActiveToolbarHost() {
  if (editMode.value === 'split') return splitToolbarHostRef.value
  return editToolbarHostRef.value
}

function updateAiResultPosition() {
  if (!aiResultShow.value) return
  const host = getActiveToolbarHost()
  const shell = editorShellRef.value
  if (!host || !shell) return
  const hostRect = host.getBoundingClientRect()
  const shellRect = shell.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const width = Math.max(320, Math.min(hostRect.width - 8, 560))
  const left = Math.max(12, Math.min(hostRect.left + 4, viewportWidth - width - 12))
  const top = hostRect.bottom + 6
  const maxHeight = Math.max(180, Math.min(window.innerHeight - top - 20, shellRect.bottom - top - 12, 320))
  aiUseFixed.value = true
  aiFloatingStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    height: `${maxHeight}px`,
  }
}

function scheduleAiResultPositionUpdate() {
  nextTick(() => updateAiResultPosition())
}

function cancelAiResult() {
  aiAbortController.value?.abort()
  aiResultStreaming.value = false
}

function applyAiResult() {
  const ta = textareaRef.value
  if (!ta) return
  history.pushNow(currentState())
  const key = aiResultKey.value
  const text = aiResultText.value
  if (!text) { dismissAiResult(); return }

  let insertStart = aiResultInsertStart
  let insertEnd = aiResultInsertEnd
  if (aiResultScope !== 'selection' && (key === 'continue' || key === 'outline' || key === 'formula')) {
    insertStart = aiResultInsertEnd
    insertEnd = aiResultInsertEnd
  }

  const before = localContent.value.slice(0, insertStart)
  const after = localContent.value.slice(insertEnd)
  const prefix = key === 'continue' ? (before.endsWith('\n') ? '' : '\n') : ''
  localContent.value = before + prefix + text + after
  nextTick(() => {
    if (ta) {
      const cursorAt = before.length + prefix.length + text.length
      ta.focus()
      ta.setSelectionRange(cursorAt, cursorAt)
    }
  })
  dismissAiResult()
}

function copyAiResult() {
  navigator.clipboard.writeText(aiResultText.value)
    .then(() => message.success('已复制'))
    .catch(() => message.error('复制失败'))
}

// ─── Sync note ───
watch(() => notesStore.currentNoteId, () => {
  if (saveTimer.value) { clearTimeout(saveTimer.value); saveTimer.value = null }
  isSaving.value = false
  if (aiResultShow.value) { aiAbortController.value?.abort(); dismissAiResult() }
  if (currentNote.value) {
    localTitle.value = currentNote.value.title
    localContent.value = currentNote.value.content
    lastSavedAt.value = currentNote.value.updated_at ? new Date(currentNote.value.updated_at) : null
    history.init({ content: localContent.value, title: localTitle.value, cursor: { start: 0, end: 0 } })
    nextTick(() => { if (textareaRef.value) textareaRef.value.focus() })
  } else {
    localTitle.value = ''
    localContent.value = ''
    lastSavedAt.value = null
    history.clear()
  }
})

watch(localContent, () => {
  if (!currentNote.value) return
  scheduleSave()
  history.record(currentState())
})
watch(localTitle, () => {
  if (!currentNote.value) return
  scheduleSave()
  history.record(currentState())
})

// Preserve cursor across mode switches
watch(editMode, () => {
  if (textareaRef.value) {
    savedCursor.start = textareaRef.value.selectionStart
    savedCursor.end = textareaRef.value.selectionEnd
  }
  if (aiResultShow.value) scheduleAiResultPositionUpdate()
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(savedCursor.start, savedCursor.end)
    }
  })
})

function scheduleSave() {
  isSaving.value = true
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(async () => {
    if (!currentNote.value) { isSaving.value = false; return }
    await notesStore.updateNote(currentNote.value.id, { title: localTitle.value, content: localContent.value })
    lastSavedAt.value = new Date()
    saveTimer.value = null
    isSaving.value = false
  }, 500)
}

async function deleteCurrentNote() {
  if (!currentNote.value) return
  await notesStore.deleteNote(currentNote.value.id)
  showDeleteModal.value = false
}

// ─── Markdown toolbar shortcuts ───
function insertMd(type) {
  const ta = textareaRef.value
  if (!ta) return
  history.pushNow(currentState())
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const sel = localContent.value.substring(start, end)

  const replaceSelection = (text, cursorStart = text.length, cursorEnd = cursorStart) => {
    localContent.value = localContent.value.substring(0, start) + text + localContent.value.substring(end)
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(start + cursorStart, start + cursorEnd)
    })
  }

  const headingLevel = /^h([1-6])$/.exec(type)?.[1]
  if (headingLevel) {
    const prefix = `${'#'.repeat(Number(headingLevel))} `
    const text = sel || '标题'
    const repl = text.includes('\n') ? text.split('\n').map(line => prefix + line).join('\n') : prefix + text
    replaceSelection(repl, sel ? 0 : prefix.length, sel ? repl.length : prefix.length + text.length)
    return
  }

  if (type === 'list' || type === 'ordered-list' || type === 'task-list' || type === 'quote') {
    const text = sel || (type === 'task-list' ? '待办事项' : type === 'quote' ? '引用' : '列表项')
    const lines = text.split('\n')
    const repl = lines.map((line, idx) => {
      if (type === 'ordered-list') return `${idx + 1}. ${line}`
      if (type === 'task-list') return `- [ ] ${line}`
      if (type === 'quote') return `> ${line}`
      return `- ${line}`
    }).join('\n')
    const offset = type === 'ordered-list' ? 3 : type === 'task-list' ? 6 : 2
    replaceSelection(repl, sel ? 0 : offset, sel ? repl.length : offset + text.length)
    return
  }

  if (type === 'table') {
    const table = '\n\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n\n'
    replaceSelection(table, 4, 7)
    return
  }

  if (type === 'hr') {
    const prefix = start > 0 && !localContent.value.slice(0, start).endsWith('\n') ? '\n\n' : ''
    const line = `${prefix}---\n`
    replaceSelection(line)
    return
  }

  let prefix = '', suffix = '', ph = ''
  switch (type) {
    case 'bold':      prefix = '**';      suffix = '**'; ph = '粗体'; break
    case 'italic':    prefix = '*';       suffix = '*';  ph = '斜体'; break
    case 'strike':    prefix = '~~';      suffix = '~~'; ph = '删除线'; break
    case 'code':      prefix = '`';       suffix = '`';  ph = '代码'; break
    case 'codeblock': prefix = '\n```\n'; suffix = '\n```\n'; ph = '代码块'; break
    case 'link':      prefix = '[';       suffix = '](url)'; ph = '链接'; break
    case 'image':     prefix = '![';      suffix = '](url)'; ph = '图片描述'; break
    case 'formula':   prefix = '\n$$\n';  suffix = '\n$$\n'; ph = 'a^2 + b^2 = c^2'; break
    default: return
  }
  const text = sel || ph
  const repl = prefix + text + suffix
  replaceSelection(repl, prefix.length, prefix.length + text.length)
}

// ─── Slash menu ───
const slashShow = ref(false)
const slashPos = ref({ x: 0, y: 0 })
const slashQuery = ref('')
const slashRef = ref(null)
let slashStartIdx = -1

function maybeOpenSlash(e) {
  // Open when typing `/` at the start of input or after whitespace/newline
  const ta = textareaRef.value
  if (!ta) return
  const pos = ta.selectionStart
  if (e.data === '/' && (pos === 1 || /\s|\n/.test(localContent.value.charAt(pos - 2) || ''))) {
    slashStartIdx = pos - 1
    slashQuery.value = ''
    nextTick(() => {
      const coords = getCaretCoordinates(ta, pos)
      slashPos.value = { x: coords.x, y: coords.y + 18 }
      slashShow.value = true
    })
  } else if (slashShow.value) {
    // Update query based on current text after slashStartIdx
    if (slashStartIdx >= 0 && pos > slashStartIdx) {
      const q = localContent.value.slice(slashStartIdx + 1, pos)
      if (/\s|\n/.test(q)) { closeSlash(); return }
      slashQuery.value = q
    }
  }
}

function closeSlash() {
  slashShow.value = false
  slashStartIdx = -1
  slashQuery.value = ''
}

function openSlashAtCaret() {
  const ta = textareaRef.value
  if (!ta) return
  ta.focus()
  const pos = ta.selectionStart
  const coords = getCaretCoordinates(ta, pos)
  slashPos.value = { x: coords.x, y: coords.y + 18 }
  slashStartIdx = pos
  slashQuery.value = ''
  slashShow.value = true
}

function onSlashSelect(key) {
  // Remove the slash + query text from content
  if (slashStartIdx >= 0 && textareaRef.value) {
    const ta = textareaRef.value
    const end = ta.selectionStart
    history.pushNow(currentState())
    localContent.value = localContent.value.slice(0, slashStartIdx) + localContent.value.slice(end)
    nextTick(() => ta.setSelectionRange(slashStartIdx, slashStartIdx))
  }
  closeSlash()
  runAiCommand(key, 'document')
}

// ─── Selection bubble ───
const bubbleShow = ref(false)
const bubblePos = ref({ x: 0, y: 0 })
const bubbleBusy = ref('')

function updateBubble() {
  const ta = textareaRef.value
  if (!ta || document.activeElement !== ta) { bubbleShow.value = false; return }
  const start = ta.selectionStart
  const end = ta.selectionEnd
  if (start === end || end - start < 2) { bubbleShow.value = false; return }
  const coords = getCaretCoordinates(ta, start)
  bubblePos.value = { x: coords.x + 60, y: coords.y }
  bubbleShow.value = true
}

function onBubbleAction(key) {
  runAiCommand(key, 'selection')
}

// ─── Run AI commands (slash + selection) ───
async function runAiCommand(key, scope) {
  const ta = textareaRef.value
  if (!ta) return
  let selStart = ta.selectionStart
  let selEnd = ta.selectionEnd
  const fullDocument = localContent.value
  const fullDocumentTrimmed = fullDocument.trim()
  const hasSelection = selStart !== selEnd
  const selectionText = hasSelection ? fullDocument.slice(selStart, selEnd) : ''
  const beforeCursor = fullDocument.slice(0, selStart)
  const afterCursor = fullDocument.slice(selEnd)
  const paragraphStart = fullDocument.lastIndexOf('\n\n', Math.max(0, selStart - 2))
  const paragraphEndRaw = fullDocument.indexOf('\n\n', selEnd)
  const paragraphStartIdx = paragraphStart === -1 ? 0 : paragraphStart + 2
  const paragraphEndIdx = paragraphEndRaw === -1 ? fullDocument.length : paragraphEndRaw
  const currentSegment = hasSelection
    ? selectionText
    : fullDocument.slice(paragraphStartIdx, paragraphEndIdx).trim()
  const continuationPrefix = beforeCursor.slice(Math.max(0, beforeCursor.length - 1200))
  const continuationSuffix = afterCursor.slice(0, 400)
  const documentHead = fullDocumentTrimmed.slice(0, 1600)
  const documentTail = fullDocumentTrimmed.length > 1600 ? fullDocumentTrimmed.slice(-1000) : ''
  const documentForOverview = [documentHead, currentSegment, documentTail]
    .filter(Boolean)
    .filter((part, idx, arr) => arr.indexOf(part) === idx)
    .join('\n\n')

  let target = ''
  let promptDef
  let effectiveScope = scope
  let insertStart = selStart
  let insertEnd = selEnd

  if (scope === 'selection') {
    target = selectionText
  } else {
    switch (key) {
      case 'continue':
        target = continuationPrefix || fullDocumentTrimmed
        insertStart = selEnd
        insertEnd = selEnd
        promptDef = NOTE_AI_PROMPTS.continue({
          title: localTitle.value,
          prefix: continuationPrefix,
          suffix: continuationSuffix,
        })
        break
      case 'summarize':
      case 'outline':
        target = documentForOverview || fullDocumentTrimmed
        promptDef = NOTE_AI_PROMPTS[key]({
          title: localTitle.value,
          fullDocument: target,
        })
        break
      case 'formula':
      case 'explain':
        target = currentSegment || beforeCursor.slice(Math.max(0, beforeCursor.length - 1000)).trim()
        effectiveScope = currentSegment ? 'document' : 'selection'
        promptDef = NOTE_AI_PROMPTS[key]({
          title: localTitle.value,
          scope: effectiveScope,
          text: target,
          fullDocument: effectiveScope === 'document' ? '' : '',
        })
        break
      case 'translate':
      case 'translate-zh':
      case 'polish':
      case 'expand':
      case 'shorten':
        target = currentSegment || fullDocumentTrimmed
        effectiveScope = currentSegment ? 'document' : 'selection'
        promptDef = key === 'translate'
          ? NOTE_AI_PROMPTS.translate({
            title: localTitle.value,
            scope: effectiveScope,
            text: target,
            fullDocument: '',
            target: '英文',
          })
          : key === 'translate-zh'
            ? NOTE_AI_PROMPTS.translate({
              title: localTitle.value,
              scope: effectiveScope,
              text: target,
              fullDocument: '',
              target: '中文',
            })
            : NOTE_AI_PROMPTS[key]?.({
              title: localTitle.value,
              scope: effectiveScope,
              text: target,
              fullDocument: '',
            })
        break
      default:
        return
    }
  }

  if (!promptDef) {
    switch (key) {
      case 'polish':
      case 'expand':
      case 'shorten':
      case 'explain':
      case 'formula':
        promptDef = NOTE_AI_PROMPTS[key]({
          title: localTitle.value,
          scope: 'selection',
          text: target,
          fullDocument: '',
        })
        break
      case 'translate':
        promptDef = NOTE_AI_PROMPTS.translate({
          title: localTitle.value,
          scope: 'selection',
          text: target,
          fullDocument: '',
          target: '英文',
        })
        break
      case 'translate-zh':
        promptDef = NOTE_AI_PROMPTS.translate({
          title: localTitle.value,
          scope: 'selection',
          text: target,
          fullDocument: '',
          target: '中文',
        })
        break
      default:
        return
    }
  }

  if (!target.trim()) {
    message.warning('没有可处理的内容')
    return
  }

  const ai = notesStore.aiSettings
  const hasDefaultSkillModel = !!(settingsStore.defaultModels?.skill || settingsStore.defaultModels?.chat)
  if ((!ai.noteProviderId || !ai.noteModelId) && !hasDefaultSkillModel) {
    message.warning('请先在 AI 配置中选择模型')
    showAiConfig.value = true
    return
  }

  const meta = AI_ACTION_META[key] || { icon: 'ri-magic-line', label: key, color: 'agent' }

  aiResultInsertStart = insertStart
  aiResultInsertEnd = insertEnd
  aiResultScope = effectiveScope
  aiResultKey.value = key
  aiResultLabel.value = meta.label
  aiResultIcon.value = meta.icon
  aiResultColor.value = meta.color
  aiResultShow.value = true
  aiResultStreaming.value = true
  aiResultText.value = ''
  aiResultError.value = false
  aiResultErrorMsg.value = ''
  bubbleShow.value = false
  bubbleBusy.value = scope === 'selection' ? key : ''
  scheduleAiResultPositionUpdate()

  aiAbortController.value = new AbortController()

  try {
    await runNoteAiTask({
      systemPrompt: promptDef.system,
      userPrompt: promptDef.user,
      providerId: notesStore.aiSettings.noteProviderId || undefined,
      model: notesStore.aiSettings.noteModelId || undefined,
      temperature: 0.6,
      maxTokens: key === 'summarize' || key === 'outline' ? 1600 : 1200,
      signal: aiAbortController.value.signal,
      onChunk: (_chunk, full) => {
        aiResultText.value = full
      },
    })
    aiResultStreaming.value = false
  } catch (e) {
    if (aiAbortController.value.signal.aborted) {
      aiResultStreaming.value = false
    } else {
      aiResultError.value = true
      aiResultErrorMsg.value = e.message
      aiResultStreaming.value = false
    }
  } finally {
    bubbleBusy.value = ''
  }
}

// ─── Keydown: undo / redo / slash nav ───
function onKeyDown(e) {
  // Slash menu first
  if (slashShow.value && slashRef.value?.onKeydown) {
    slashRef.value.onKeydown(e)
    if (e.defaultPrevented) return
  }

  const isMod = e.ctrlKey || e.metaKey
  if (isMod && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    doUndo()
    return
  }
  if (isMod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault()
    doRedo()
    return
  }
}

function onInput(e) {
  maybeOpenSlash(e)
}

function onSelect() {
  updateBubble()
}

function onBlur() {
  setTimeout(() => { bubbleShow.value = false; closeSlash() }, 150)
}

// ─── Caret coordinates helper (mirror div technique) ───
function getCaretCoordinates(textarea, position) {
  const rect = textarea.getBoundingClientRect()
  const mirror = document.createElement('div')
  const style = getComputedStyle(textarea)
  const props = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
    'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
    'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize', 'whiteSpace', 'wordWrap',
  ]
  props.forEach(p => { mirror.style[p] = style[p] })
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '0'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.textContent = textarea.value.slice(0, position)
  const span = document.createElement('span')
  span.textContent = textarea.value.slice(position) || '.'
  mirror.appendChild(span)
  document.body.appendChild(mirror)
  const spanRect = span.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  document.body.removeChild(mirror)
  return {
    x: rect.left + (spanRect.left - mirrorRect.left) - textarea.scrollLeft,
    y: rect.top + (spanRect.top - mirrorRect.top) - textarea.scrollTop,
  }
}

onMounted(() => {
  if (currentNote.value) {
    localTitle.value = currentNote.value.title
    localContent.value = currentNote.value.content
    lastSavedAt.value = currentNote.value.updated_at ? new Date(currentNote.value.updated_at) : null
    history.init({ content: localContent.value, title: localTitle.value, cursor: { start: 0, end: 0 } })
  }
  window.addEventListener('resize', updateAiResultPosition)
  window.addEventListener('scroll', updateAiResultPosition, true)
})

// ─── Split pane resize ───
let resizeStartX = 0
let resizeStartRatio = 0.5

function onSplitResizeStart(e) {
  if (!splitContainerRef.value) return
  e.preventDefault()
  isResizing.value = true
  resizeStartX = e.clientX
  resizeStartRatio = splitRatio.value
  window.addEventListener('mousemove', onSplitResizeMove)
  window.addEventListener('mouseup', onSplitResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onSplitResizeMove(e) {
  if (!splitContainerRef.value) return
  const rect = splitContainerRef.value.getBoundingClientRect()
  if (rect.width <= 0) return
  const dx = e.clientX - resizeStartX
  const next = resizeStartRatio + dx / rect.width
  splitRatio.value = Math.max(0.2, Math.min(0.8, next))
}

function onSplitResizeEnd() {
  isResizing.value = false
  window.removeEventListener('mousemove', onSplitResizeMove)
  window.removeEventListener('mouseup', onSplitResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  try { localStorage.setItem(SPLIT_RATIO_KEY, String(splitRatio.value)) } catch {}
  if (aiResultShow.value) scheduleAiResultPositionUpdate()
}

function onSplitResizeReset() {
  splitRatio.value = 0.5
  try { localStorage.setItem(SPLIT_RATIO_KEY, '0.5') } catch {}
  if (aiResultShow.value) scheduleAiResultPositionUpdate()
}

onBeforeUnmount(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  window.removeEventListener('resize', updateAiResultPosition)
  window.removeEventListener('scroll', updateAiResultPosition, true)
  window.removeEventListener('mousemove', onSplitResizeMove)
  window.removeEventListener('mouseup', onSplitResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  aiAbortController.value?.abort()
})
</script>

<template>
  <!-- ═══ Empty State ═══ -->
  <NoteEmptyState v-if="!isEditing" />

  <!-- ═══ Editor View ═══ -->
  <div v-else class="h-full flex flex-col overflow-hidden" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <!-- Header bar -->
    <div class="h-12 flex items-center px-4 shrink-0 gap-3"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">

      <!-- Title + folder -->
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <input v-model="localTitle" type="text" placeholder="无标题"
          class="h-8 px-1 border-0 border-b-1 text-[16px] font-semibold tracking-tight outline-none flex-1 min-w-0 bg-transparent"
          :class="isDark ? 'text-wt-main placeholder:text-wt-dim caret-brand-400' : 'text-lt-main placeholder:text-lt-aux caret-brand-500'" />
        <span v-if="currentFolderName"
          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-medium max-w-[160px] shrink-0"
          :class="isDark ? 'text-amber-400/90 bg-amber-400/10' : 'text-amber-600 bg-amber-50'">
          <i class="ri-folder-3-line text-[10px] opacity-70 shrink-0" />
          <span class="truncate">{{ currentFolderName }}</span>
        </span>
      </div>

      <!-- Status: count · time -->
      <div class="flex items-center gap-1.5 text-[11px] font-medium tabular-nums shrink-0"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <span>{{ charCount.toLocaleString() }} 字</span>
        <span class="opacity-40">·</span>
        <span v-if="saveStatus === 'saving'" class="flex items-center gap-1"
          :class="isDark ? 'text-brand-400' : 'text-brand-500'">
          <i class="ri-loader-2-line text-[11px] animate-spin" />保存中
        </span>
        <span v-else-if="saveStatus === 'saved' && formattedSavedTime" class="flex items-center gap-1"
          :class="isDark ? 'text-emerald-400/90' : 'text-emerald-500'">
          <i class="ri-cloud-line text-[11px]" />{{ formattedSavedTime }}
        </span>
        <span v-else>未保存</span>
      </div>

      <!-- Divider -->
      <div class="w-px h-4 shrink-0" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />

      <!-- View toggle (segmented) -->
      <div class="flex items-center rounded-md p-0.5 shrink-0"
        :class="isDark ? 'bg-d3' : 'bg-l4'">
        <button v-for="m in [{k:'edit', i:'ri-edit-line', t:'编辑'}, {k:'split', i:'ri-layout-column-line', t:'分屏'}, {k:'preview', i:'ri-eye-line', t:'预览'}]" :key="m.k"
          @click="editMode = m.k" :title="m.t"
          class="h-6 px-2 border-0 flex items-center justify-center rounded transition-all duration-150 cursor-pointer"
          :class="editMode === m.k
            ? (isDark ? 'bg-d1 text-brand-400 shadow-[0_1px_2px_rgba(0,0,0,0.25)]' : 'bg-white text-brand-500 shadow-sm')
            : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
          <i :class="`${m.i} text-[13px]`" />
        </button>
      </div>

      <!-- Delete (icon-only) -->
      <button @click="showDeleteModal = true" title="删除笔记"
        class="w-7 h-7 rounded-md text-red-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
        <i class="ri-delete-bin-line text-[16px]" />
      </button>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-hidden p-2">
      <div ref="editorShellRef" class="h-full flex overflow-hidden rounded-xl"
        :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">

        <!-- EDIT only -->
        <div v-if="editMode === 'edit'" class="h-full w-full flex flex-col min-w-0">
          <div ref="editToolbarHostRef" class="relative shrink-0">
            <MarkdownToolbar :is-dark="isDark"
              :can-undo="history.canUndo.value" :can-redo="history.canRedo.value"
              @insert="insertMd" @undo="doUndo" @redo="doRedo" />
          </div>
          <div class="flex-1 relative overflow-hidden min-h-0">
            <textarea ref="textareaRef" v-model="localContent"
              class="absolute inset-0 p-5 text-[14px] leading-relaxed resize-none outline-none thin-scroll"
              :class="isDark ? 'bg-transparent text-wt-sub placeholder:text-wt-dim' : 'bg-transparent text-lt-sub placeholder:text-lt-aux'"
              style="font-family: 'Menlo','Consolas','Monaco',monospace"
              placeholder="开始记录你的笔记... 输入 / 唤起 AI 助手"
              @input="onInput" @keydown="onKeyDown" @select="onSelect" @blur="onBlur" @click="onSelect" @keyup="onSelect" />
          </div>
        </div>

        <!-- PREVIEW only -->
        <NotePreview v-if="editMode === 'preview'"
          :content="localContent" :is-dark="isDark" :show-header="true"
          header-label="预览" header-icon="ri-eye-line" />

        <!-- SPLIT -->
        <div v-if="editMode === 'split'" ref="splitContainerRef" class="h-full w-full flex overflow-hidden min-w-0 relative">
          <div class="h-full flex flex-col min-w-0 overflow-hidden"
            :style="{ width: `calc(${splitRatio * 100}% - 3px)` }">
            <div ref="splitToolbarHostRef" class="relative shrink-0">
              <MarkdownToolbar :is-dark="isDark"
                :can-undo="history.canUndo.value" :can-redo="history.canRedo.value"
                @insert="insertMd" @undo="doUndo" @redo="doRedo" />
            </div>
            <div class="flex-1 relative overflow-hidden min-h-0">
              <textarea ref="textareaRef" v-model="localContent"
                class="absolute border-0 inset-0 p-4 text-[13px] leading-relaxed resize-none outline-none thin-scroll"
                :class="isDark ? 'bg-transparent text-wt-sub placeholder:text-wt-dim' : 'bg-transparent text-lt-sub placeholder:text-lt-aux'"
                style="font-family: 'Menlo','Consolas','Monaco',monospace"
                placeholder="开始书写... 输入 / 唤起 AI 助手"
                @input="onInput" @keydown="onKeyDown" @select="onSelect" @blur="onBlur" @click="onSelect" @keyup="onSelect" />
            </div>
          </div>

          <!-- Drag handle -->
          <div
            class="split-handle shrink-0 relative cursor-col-resize select-none"
            :class="[
              isDark ? 'bg-d4' : 'bg-bdrL',
              isResizing ? 'split-handle--active' : '',
            ]"
            @mousedown="onSplitResizeStart"
            @dblclick="onSplitResizeReset"
            :title="`左 ${Math.round(splitRatio * 100)}% / 右 ${100 - Math.round(splitRatio * 100)}% · 拖动调整 · 双击重置`">
            <div class="split-handle__bar" />
            <div class="split-handle__grip" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              <span /><span /><span />
            </div>
          </div>

          <div class="h-full flex flex-col overflow-hidden min-w-0"
            :style="{ width: `calc(${(1 - splitRatio) * 100}% - 3px)` }">
            <NotePreview :content="localContent" :is-dark="isDark" :show-header="true"
              header-label="预览" header-icon="ri-eye-line" :compact="true" />
          </div>

          <!-- Overlay to keep iframe/select clean while resizing -->
          <div v-if="isResizing" class="absolute inset-0 z-10 cursor-col-resize" />
        </div>
      </div>
    </div>
  </div>

  <!-- AI result card -->
  <Teleport to="body">
    <Transition name="ai-result-slide">
      <AiResultCard v-if="aiResultShow"
        :is-dark="isDark"
        :action-key="aiResultKey"
        :action-label="aiResultLabel"
        :action-icon="aiResultIcon"
        :action-color="aiResultColor"
        :result-text="aiResultText"
        :is-streaming="aiResultStreaming"
        :is-error="aiResultError"
        :error-msg="aiResultErrorMsg"
        :floating-style="aiFloatingStyle"
        :use-fixed="aiUseFixed"
        @apply="applyAiResult" @copy="copyAiResult"
        @dismiss="dismissAiResult" @cancel="cancelAiResult" />
    </Transition>
  </Teleport>

  <!-- AI Slash menu -->
  <AiSlashMenu ref="slashRef" :show="slashShow" :x="slashPos.x" :y="slashPos.y" :query="slashQuery"
    @select="onSlashSelect" @close="closeSlash" />

  <!-- Selection bubble -->
  <AiSelectionBubble :show="bubbleShow" :x="bubblePos.x" :y="bubblePos.y" :busy="bubbleBusy"
    @action="onBubbleAction" />

  <!-- AI Config modal -->
  <AiConfigModal v-model:show="showAiConfig" />

  <!-- Delete Confirmation -->
  <MsModal v-if="showDeleteModal" v-model:show="showDeleteModal" :width="360" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
          <i class="ri-delete-bin-line text-[16px] text-red-400" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">删除笔记</span>
      </div>
    </template>
    <div>
      <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        确定要删除「{{ currentNote?.title }}」吗？此操作不可恢复。
      </p>
    </div>
    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="deleteCurrentNote(); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600">确认删除</button>
    </template>
  </MsModal>
</template>

<style scoped>
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08) }
.thin-scroll::-webkit-scrollbar { width: 5px }
.thin-scroll::-webkit-scrollbar-track { background: transparent }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25) }
.ai-result-slide-enter-active { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) }
.ai-result-slide-leave-active { transition: all 0.15s ease-in }
.ai-result-slide-enter-from { opacity: 0; transform: translateY(-6px) scaleY(0.96); transform-origin: top }
.ai-result-slide-leave-to { opacity: 0; transform: translateY(-4px) scaleY(0.96); transform-origin: top }

/* ─── Split pane drag handle ─── */
.split-handle { width: 6px; transition: background-color .15s; }
.split-handle__bar {
  position: absolute; top: 0; bottom: 0;
  left: 50%; transform: translateX(-50%);
  width: 2px; border-radius: 1px;
  background: transparent; transition: background-color .15s, height .15s;
  pointer-events: none;
}
.split-handle:hover .split-handle__bar { background: rgba(108,138,255, 0.4) }
.split-handle--active .split-handle__bar,
.split-handle--active:hover .split-handle__bar { background: #6C8AFF }
.split-handle__grip {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column;
  gap: 3px; opacity: 0;
  transition: opacity .2s;
  pointer-events: none;
}
.split-handle:hover .split-handle__grip,
.split-handle--active .split-handle__grip { opacity: .7 }
.split-handle__grip span {
  width: 3px; height: 3px; border-radius: 50%;
  background: currentColor;
}
</style>
