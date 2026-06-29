<script setup>
import { ref, watch, nextTick, computed, onBeforeUnmount } from 'vue'
import ChatSlashCommandMenu from './chat/ChatSlashCommandMenu.vue'
import ChatContextPills from './chat/ChatContextPills.vue'
import ChatPopoverLayer from './chat/ChatPopoverLayer.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import TextEditContextMenu from '@/components/TextEditContextMenu.vue'
import { useAgentsStore } from '@/stores/agents'

const props = defineProps({
  isDark: Boolean,
  isStreaming: Boolean,
  isCompressing: Boolean,
  hasMessages: Boolean,
  selectedAgent: Object,
  ctxItems: Array,
  contextLength: { type: Number, default: 30 },
  allAgents: Array,
  availableWikis: { type: Array, default: () => [] },
  selectedWikiIds: { type: Array, default: () => [] },
  totalInputTokens: { type: Number, default: 0 },
  totalOutputTokens: { type: Number, default: 0 },
  lastLatencyMs: { type: Number, default: 0 },
  lastCost: { type: Number, default: 0 },
  commandInsertRequest: Object,
})

const emit = defineEmits([
  'send',
  'cancel',
  'select-agent',
  'remove-agent',
  'add-ctx',
  'remove-ctx',
  'toggle-wiki',
  'clear-wiki',
  'update-context-length',
  'compress-context',
  'clear-ctx',
  'clear-messages',
])

const inputText = ref('')
const activePopover = ref(null) // 'agent' | 'attach' | 'wiki' | 'ctx' | null
const popoverPos = ref({ left: 0, bottom: 0, arrowLeft: 18 })
const attachBtnRef = ref(null)
const agentBtnRef = ref(null)
const wikiBtnRef = ref(null)
const ctxBtnRef = ref(null)
const textareaRef = ref(null)
const textEditMenuRef = ref(null)
const MAX_INPUT_LENGTH = 2000
const msg = useMessage()
const agentsStore = useAgentsStore()
const slashContext = ref(null)
const slashActiveIndex = ref(0)
const lastSelection = ref({ start: 0, end: 0 })
let suppressSlashSync = false

const totalTokens = computed(() => props.totalInputTokens + props.totalOutputTokens)
const charCount = computed(() => inputText.value.length)
const selectedWikiCount = computed(() => props.selectedWikiIds?.length || 0)
const selectedWikiNames = computed(() => {
  const names = (props.availableWikis || [])
    .filter(wiki => props.selectedWikiIds?.includes(wiki.id))
    .map(wiki => wiki.name || wiki.id)
  return names
})
const wikiButtonLabel = computed(() => {
  if (!selectedWikiCount.value) return 'Wiki'
  if (selectedWikiCount.value === 1) return selectedWikiNames.value[0] || 'Wiki'
  return `Wiki ${selectedWikiCount.value}`
})

const canSend = computed(() => inputText.value.trim() && !props.isStreaming && charCount.value <= MAX_INPUT_LENGTH)

const agentSkills = computed(() => {
  if (!props.selectedAgent?.skills?.length) return []
  return props.selectedAgent.skills
    .map(sid => agentsStore.allAvailableSkills.find(s => s.id === sid))
    .filter(Boolean)
})

const slashCommandItems = computed(() => agentSkills.value.map(skill => {
  const description = skillDescription(skill)
  const keywords = [skill.id, skill.name, skill.category, description].filter(Boolean)
  return {
    type: 'skill',
    typeLabel: 'Skill',
    id: skill.id,
    label: `/${skill.id}`,
    name: skill.name || skill.id,
    description,
    insertText: `/${skill.id}`,
    icon: skill.icon || 'ri-magic-line',
    color: skill.color,
    keywords,
    searchText: keywords.join(' ').toLowerCase(),
    priority: 100,
  }
}))

const filteredSlashCommands = computed(() => {
  if (!slashContext.value) return []
  const query = slashContext.value.query.trim().toLowerCase()
  const items = [...slashCommandItems.value].sort((a, b) => (b.priority || 0) - (a.priority || 0))
  if (!query) return items
  return items.filter(item => item.searchText.includes(query))
})

const showSlashMenu = computed(() => !!slashContext.value && slashCommandItems.value.length > 0)
const activeSlashCommand = computed(() => filteredSlashCommands.value[slashActiveIndex.value] || null)

const sendButtonClass = computed(() => {
  if (canSend.value) {
    return props.isDark
      ? 'bg-brand-500 text-white border border-brand-400/30 shadow-sm shadow-brand-500/20 hover:bg-brand-400 active:bg-brand-600'
      : 'bg-brand-600 text-white border border-brand-600 shadow-sm shadow-brand-500/20 hover:bg-brand-700 active:bg-brand-800'
  }
  return props.isDark
    ? 'bg-d3/80 text-wt-dim border border-d4/80 shadow-inner shadow-black/10 cursor-not-allowed'
    : 'bg-l3/80 text-lt-aux border border-bdrF shadow-inner shadow-white/70 cursor-not-allowed'
})

const stopButtonClass = computed(() =>
  props.isDark
    ? 'bg-red-500/90 text-white border border-red-400/30 shadow-sm shadow-red-500/20 hover:bg-red-500 active:bg-red-600'
    : 'bg-red-500 text-white border border-red-500 shadow-sm shadow-red-500/20 hover:bg-red-600 active:bg-red-700',
)
function formatTokenCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function skillDescription(skill) {
  return skill?.desc || skill?.description || skill?.category || ''
}

function calcPopoverPos(btnRef) {
  if (!btnRef) return { left: 0, bottom: 0, arrowLeft: 18 }
  const rect = btnRef.getBoundingClientRect()
  // Use viewport coordinates for fixed positioning
  return {
    left: rect.left,
    bottom: window.innerHeight - rect.top + 4,
    arrowLeft: Math.max(14, Math.min(rect.width / 2, 266)),
  }
}

function togglePopover(name) {
  if (activePopover.value === name) {
    activePopover.value = null
    return
  }
  activePopover.value = name
  const btnRef = name === 'attach'
    ? attachBtnRef.value
    : name === 'agent'
      ? agentBtnRef.value
      : name === 'wiki'
        ? wikiBtnRef.value
        : ctxBtnRef.value
  popoverPos.value = calcPopoverPos(btnRef)
}

function closePopover() {
  activePopover.value = null
}

function openTextEditMenu(event) {
  textEditMenuRef.value?.open(event, textareaRef.value)
}

function handleAddCtx(item) {
  emit('add-ctx', item)
  activePopover.value = null
}

function handleSend() {
  const trimmed = (inputText.value || '').trim()
  if (!trimmed || props.isStreaming) return
  // Require an agent selection before sending — guide the user instead of silently sending without one
  if (!props.selectedAgent) {
    msg.warning('请先在工具栏选择一个 Agent，再发送消息', { title: '未选择 Agent', duration: 3500 })
    togglePopover('agent')
    return
  }
  inputText.value = ''
  nextTick(autoResize)
  emit('send', trimmed)
}

function rememberSelection() {
  const el = textareaRef.value
  if (!el) return
  lastSelection.value = {
    start: el.selectionStart ?? inputText.value.length,
    end: el.selectionEnd ?? inputText.value.length,
  }
}

function getSlashContextAtPosition(cursor) {
  const prefix = inputText.value.slice(0, cursor)
  const match = prefix.match(/(^|\s)(\/[^\s]*)$/)
  if (!match) return null
  const token = match[2]
  return {
    start: cursor - token.length,
    end: cursor,
    token,
    query: token.slice(1),
  }
}

function getSlashContextAtCursor() {
  const el = textareaRef.value
  const cursor = el?.selectionStart ?? lastSelection.value.end ?? inputText.value.length
  return getSlashContextAtPosition(cursor)
}

function syncSlashContext() {
  rememberSelection()
  slashContext.value = getSlashContextAtCursor()
  if (!slashContext.value) slashActiveIndex.value = 0
}

function handleTextareaBlur() {
  rememberSelection()
  closeSlashMenu()
}

function closeSlashMenu() {
  slashContext.value = null
  slashActiveIndex.value = 0
}

function insertCommandText(rawText, range = null) {
  const command = String(rawText || '').trim()
  if (!command) return

  const text = inputText.value || ''
  const fallbackRange = {
    start: lastSelection.value.start ?? text.length,
    end: lastSelection.value.end ?? text.length,
  }
  const targetRange = range || slashContext.value || fallbackRange
  const start = Math.max(0, Math.min(targetRange.start ?? text.length, text.length))
  const end = Math.max(start, Math.min(targetRange.end ?? start, text.length))
  const before = text.slice(0, start)
  const after = text.slice(end)
  const leadingSpace = before && !/\s$/.test(before) ? ' ' : ''
  const trailingSpace = after && /^\s/.test(after) ? '' : ' '
  const insertText = `${leadingSpace}${command}${trailingSpace}`
  const cursor = before.length + insertText.length

  suppressSlashSync = true
  inputText.value = `${before}${insertText}${after}`
  lastSelection.value = { start: cursor, end: cursor }
  closeSlashMenu()

  nextTick(() => {
    const el = textareaRef.value
    el?.focus()
    el?.setSelectionRange(cursor, cursor)
    autoResize()
    rememberSelection()
    suppressSlashSync = false
    closeSlashMenu()
  })
}

function moveSlashActive(delta) {
  const count = filteredSlashCommands.value.length
  if (!count) return
  slashActiveIndex.value = (slashActiveIndex.value + delta + count) % count
}

function selectSlashCommand(item) {
  if (!item) return
  insertCommandText(item.insertText || item.label, slashContext.value)
}

function handleTextareaKeydown(event) {
  if (showSlashMenu.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSlashActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSlashActive(-1)
      return
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      event.preventDefault()
      if (activeSlashCommand.value) selectSlashCommand(activeSlashCommand.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSlashMenu()
      return
    }
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    if (!event.shiftKey) handleSend()
  }
}

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}
watch(inputText, () => nextTick(() => {
  autoResize()
  if (!suppressSlashSync) syncSlashContext()
}))

watch(filteredSlashCommands, (items) => {
  if (!items.length || slashActiveIndex.value >= items.length) slashActiveIndex.value = 0
})

watch(() => props.selectedAgent?.id, closeSlashMenu)

watch(() => props.commandInsertRequest?.id, () => {
  const request = props.commandInsertRequest
  if (!request?.text) return
  insertCommandText(request.text, slashContext.value || getSlashContextAtPosition(lastSelection.value.end) || lastSelection.value)
})

function imageExtFromType(type) {
  const value = String(type || '').toLowerCase()
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg'
  if (value.includes('webp')) return 'webp'
  if (value.includes('gif')) return 'gif'
  if (value.includes('bmp')) return 'bmp'
  return 'png'
}

function imageTimestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function normalizePastedImageName(file) {
  const original = String(file?.name || '').trim()
  const generic = !original || /^image(?:\s*\(\d+\))?\.(png|jpe?g|webp|gif|bmp)$/i.test(original)
  if (!generic) return original
  return `粘贴图片_${imageTimestamp()}_${Math.random().toString(36).slice(2, 6)}.${imageExtFromType(file?.type)}`
}

// Image paste support
function handlePaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const name = normalizePastedImageName(file)
      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const filePath = file.path || ''
      if (filePath) {
        emit('add-ctx', {
          type: 'image',
          source: 'attachment',
          id,
          name,
          icon: 'ri-image-line',
          path: filePath,
          size: file.size,
          mime: file.type || '',
        })
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          emit('add-ctx', {
            type: 'image',
            source: 'attachment',
            id,
            name,
            icon: 'ri-image-line',
            dataUrl: reader.result,
            size: file.size,
            mime: file.type || '',
          })
        }
        reader.readAsDataURL(file)
      }
      return
    }
  }
}

// Click outside to close popover
function onDocClick(e) {
  if (!activePopover.value) return
  const popoverEl = document.getElementById('chat-popover-content')
  const attachBtn = attachBtnRef.value
  const agentBtn = agentBtnRef.value
  const wikiBtn = wikiBtnRef.value
  const ctxBtn = ctxBtnRef.value
  if (popoverEl && popoverEl.contains(e.target)) return
  if (attachBtn && attachBtn.contains(e.target)) return
  if (agentBtn && agentBtn.contains(e.target)) return
  if (wikiBtn && wikiBtn.contains(e.target)) return
  if (ctxBtn && ctxBtn.contains(e.target)) return
  activePopover.value = null
}
document.addEventListener('click', onDocClick, true)
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div class="shrink-0 pb-4 pt-2 w-full px-3 sm:px-6" style="max-width: 960px; margin-left: auto; margin-right: auto;">
    <ChatContextPills
      :is-dark="isDark"
      :ctx-items="ctxItems"
      @remove-ctx="emit('remove-ctx', $event)"
      @clear-ctx="emit('clear-ctx')" />

    <!-- ═══ Input box ═══ -->
    <div
      class="relative rounded-xl transition-all"
      :class="
        isDark
          ? 'bg-d1 border border-d4 focus-within:border-brand-400/30 focus-within:shadow-lg focus-within:shadow-brand-400/8'
          : 'bg-l1 border border-bdrF focus-within:border-brand-400/40 focus-within:shadow-lg focus-within:shadow-brand-400/12'
      ">
      <ChatSlashCommandMenu
        v-if="showSlashMenu"
        class="absolute left-0 right-0 bottom-[calc(100%+8px)] z-40"
        :is-dark="isDark"
        :items="filteredSlashCommands"
        :active-index="slashActiveIndex"
        @hover="slashActiveIndex = $event"
        @select="selectSlashCommand" />

      <!-- Textarea 增加 relative 以便字数统计绝对定位-->
      <div class="relative px-3 sm:px-4 pt-2 pb-1" @contextmenu.prevent.stop="openTextEditMenu">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="w-full bg-transparent outline-none resize-none border-0 box-border text-[13px] leading-relaxed min-h-[48px] sm:min-h-[56px] pb-6"
          :class="isDark ? 'text-wt-main placeholder-wt-dim' : 'text-lt-main placeholder-lt-aux'"
          rows="3"
          :maxlength="MAX_INPUT_LENGTH"
          :placeholder="selectedAgent ? `向 ${selectedAgent.name} 提问，输入斜杠/ 查看和使用技能...` : '输入问题，选择Agent后再发送消息，输入斜杠/ 查看和使用技能...'"
          @keydown="handleTextareaKeydown"
          @keyup="syncSlashContext"
          @click="syncSlashContext"
          @focus="syncSlashContext"
          @blur="handleTextareaBlur"
          @paste="handlePaste"
          @contextmenu.prevent.stop="openTextEditMenu" />

        <!-- 右下角字数统计 -->
        <div
          class="absolute right-4 bottom-2.5 text-[11px] tabular-nums select-none pointer-events-none transition-colors"
          :class="
            charCount > MAX_INPUT_LENGTH ? 'text-red-500 font-medium' : isDark ? 'text-wt-dim/120' : 'text-lt-aux/60'
          ">
          {{ charCount }} / {{ MAX_INPUT_LENGTH }}
        </div>
      </div>

      <!-- Toolbar 工具按钮栏-->
      <div class="flex items-center gap-1.5 sm:gap-1 px-2 sm:px-3 pb-2">
        <!-- Attach button -->
        <button
          ref="attachBtnRef"
          @click="togglePopover('attach')"
          class="toolbar-btn h-7 px-1.5 sm:px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors shrink-0"
          :class="
            activePopover === 'attach'
              ? isDark
                ? 'text-brand-400 bg-brand-400/10'
                : 'text-brand-500 bg-brand-50'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <i class="ri-attachment-line text-[12px]" />
          <span class="hidden xs:inline">附件</span>
        </button>

        <!-- Agent button -->
        <button
          ref="agentBtnRef"
          @click="togglePopover('agent')"
          class="toolbar-btn h-7 px-1.5 sm:px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors shrink-0"
          :class="
            selectedAgent || activePopover === 'agent'
              ? isDark
                ? 'text-agent-400 bg-agent-400/10'
                : 'text-agent-500 bg-agent-50'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <i :class="selectedAgent ? 'ri-sparkling-2-line' : 'ri-at-line'" class="text-[12px]" />
          <span class="truncate max-w-[80px]">{{ selectedAgent ? selectedAgent.name : 'Agent' }}</span>
        </button>

        <!-- Wiki context button -->
        <button
          ref="wikiBtnRef"
          @click="togglePopover('wiki')"
          :title="selectedWikiNames.length ? selectedWikiNames.join('、') : 'Wiki'"
          class="toolbar-btn h-7 px-1.5 sm:px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors shrink-0"
          :class="
            selectedWikiCount || activePopover === 'wiki'
              ? isDark
                ? 'text-indigo-300 bg-indigo-400/10'
                : 'text-indigo-600 bg-indigo-50'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <i class="ri-book-2-line text-[12px]" />
          <span class="truncate max-w-[88px]">{{ wikiButtonLabel }}</span>
        </button>

        <!-- Context settings button -->
        <button
          ref="ctxBtnRef"
          @click="togglePopover('ctx')"
          class="toolbar-btn h-7 px-1.5 sm:px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors shrink-0"
          :class="
            activePopover === 'ctx' || isCompressing
              ? isDark
                ? 'text-wt-sub bg-white/6'
                : 'text-lt-sub bg-l3'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
          ">
          <i v-if="isCompressing" class="ri-loader-4-line text-[12px]" style="animation: spin 1s linear infinite" />
          <i v-else class="ri-text-wrap text-[12px]" />
          <span class="hidden xs:inline">{{ isCompressing ? '压缩中' : '上下文' }}</span>
        </button>

        <!-- Clear messages button -->
        <button
          v-if="hasMessages && !isStreaming"
          @click="emit('clear-messages')"
          title="清空聊天记录"
          class="toolbar-btn text-red h-7 px-1.5 sm:px-2 rounded-lg flex items-center gap-1 text-[12px] transition-colors shrink-0"
          :class="
            isDark
              ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8'
              : 'text-lt-aux hover:text-red-500 hover:bg-red-50'
          ">
          <i class="ri-delete-bin-7-line text-[12px]" />
          <span class="hidden xs:inline">清空</span>
        </button>

        <!-- Token counter -->
        <div
          v-if="totalTokens > 0"
          class="flex items-center gap-1.2 text-[11px] tabular-nums shrink-0"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-coin-line text-[12px]" />
          <span :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ formatTokenCount(totalInputTokens) }}↓</span>
          <span :class="isDark ? 'text-output-400' : 'text-output-500'">
            {{ formatTokenCount(totalOutputTokens) }}↑
          </span>
          <span v-if="lastLatencyMs" class="flex items-center gap-0.5">
            <i class="ri-timer-line text-[12px]" />
            {{ lastLatencyMs < 1000 ? lastLatencyMs + 'ms' : (lastLatencyMs / 1000).toFixed(1) + 's' }}
          </span>
          <span v-if="lastCost > 0" class="flex items-center gap-0.5">
            <i class="ri-money-dollar-circle-line text-[12px]" />
            {{ lastCost < 0.01 ? '$' + lastCost.toFixed(4) : '$' + lastCost.toFixed(2) }}
          </span>
        </div>

        <!-- Send / Stop -->
        <button
          v-if="isStreaming"
          @click="emit('cancel')"
          class="ml-auto h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] font-medium transition-colors shrink-0"
          :class="stopButtonClass">
          <i class="ri-stop-circle-line text-[14px]" />
          <span>停止</span>
        </button>
        <button
          v-else
          @click="handleSend"
          class="ml-auto h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] font-500 transition-colors shrink-0"
          :class="sendButtonClass">
          <i class="ri-send-plane-line text-[14px]" />
          <span>发送</span>
        </button>
      </div>
    </div>
  </div>

  <TextEditContextMenu ref="textEditMenuRef" :is-dark="isDark" />

  <ChatPopoverLayer
    :is-dark="isDark"
    :active-popover="activePopover"
    :popover-pos="popoverPos"
    :ctx-items="ctxItems"
    :all-agents="allAgents"
    :selected-agent="selectedAgent"
    :available-wikis="availableWikis"
    :selected-wiki-ids="selectedWikiIds"
    :context-length="contextLength"
    :is-compressing="isCompressing"
    :is-streaming="isStreaming"
    @add-ctx="handleAddCtx"
    @select-agent="emit('select-agent', $event)"
    @close="closePopover"
    @toggle-wiki="emit('toggle-wiki', $event)"
    @clear-wiki="emit('clear-wiki')"
    @update-context-length="emit('update-context-length', $event)"
    @compress-context="emit('compress-context')" />
</template>

<style scoped>
/* 工具栏按钮图标对齐修正 */
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn i {
  flex-shrink: 0;
  transform: translateY(0.5px);
}

/* 个别图标视觉重心偏上，额外下移 */
.toolbar-btn .ri-attachment-line,
.toolbar-btn .ri-at-line,
.toolbar-btn .ri-text-wrap,
.toolbar-btn .ri-delete-bin-7-line {
  transform: translateY(1px);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
