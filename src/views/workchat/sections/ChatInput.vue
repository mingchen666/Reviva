<script setup>
import { ref, watch, computed, onBeforeUnmount, onMounted } from 'vue'
import ChatTokenEditor from './chat/ChatTokenEditor.vue'
import ChatContextPills from './chat/ChatContextPills.vue'
import ChatPopoverLayer from './chat/ChatPopoverLayer.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import TextEditContextMenu from '@/components/TextEditContextMenu.vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import { useQuickInputsStore } from '@/stores/quickInputs'
import { displayTextFromDocument, isStructuredInputDocument, normalizeInputDocument, resolvedTextFromDocument } from '@/utils/chatInputDocument'
import {
  canCreateAttachmentFromFile,
  collectFilesFromDataTransfer,
  createAttachmentContextItems,
} from './chat/attachmentContext'

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

const inputDocument = ref([])
const activePopover = ref(null) // 'agent' | 'attach' | 'wiki' | 'ctx' | null
const popoverPos = ref({ left: 0, bottom: 0, arrowLeft: 18 })
const attachBtnRef = ref(null)
const agentBtnRef = ref(null)
const wikiBtnRef = ref(null)
const ctxBtnRef = ref(null)
const tokenEditorRef = ref(null)
const textEditMenuRef = ref(null)
const MAX_INPUT_LENGTH = 2000
const msg = useMessage()
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const quickInputsStore = useQuickInputsStore()

const totalTokens = computed(() => props.totalInputTokens + props.totalOutputTokens)
const inputText = computed(() => displayTextFromDocument(inputDocument.value))
const resolvedInputText = computed(() => resolvedTextFromDocument(inputDocument.value))
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

function openTextEditMenu(payload) {
  const event = payload?.event || payload
  const element = payload?.element || tokenEditorRef.value?.getElement?.()
  textEditMenuRef.value?.open(event, element)
}

function handleAddCtx(item) {
  emit('add-ctx', item)
  activePopover.value = null
}

function handleSend() {
  const content = (inputText.value || '').trim()
  const resolvedContent = (resolvedInputText.value || '').trim()
  if (!content || props.isStreaming || charCount.value > MAX_INPUT_LENGTH) return
  // Require an agent selection before sending — guide the user instead of silently sending without one
  if (!props.selectedAgent) {
    msg.warning('请先在工具栏选择一个 Agent，再发送消息', { title: '未选择 Agent', duration: 3500 })
    togglePopover('agent')
    return
  }
  const documentSnapshot = normalizeInputDocument(inputDocument.value)
  const hasTokens = isStructuredInputDocument(documentSnapshot)
  inputDocument.value = []
  emit('send', { content, inputDocument: hasTokens ? documentSnapshot : [], resolvedContent: hasTokens ? resolvedContent : content })
}

watch(() => props.selectedAgent?.id, () => tokenEditorRef.value?.closeMenu?.())

watch(() => props.commandInsertRequest?.id, () => {
  const request = props.commandInsertRequest
  if (!request?.text) return
  if (request.type === 'skill') tokenEditorRef.value?.insertSkill?.({ id: request.skillId, label: request.text, insertText: request.text })
  else tokenEditorRef.value?.insertText?.(request.text)
})

watch(() => settingsStore.workDirRoot, () => quickInputsStore.load().catch(() => {}))

onMounted(() => quickInputsStore.load().catch(() => {}))

// Clipboard files/images become local attachment context items; plain text paste keeps default behavior.
async function handlePaste(e) {
  const files = collectFilesFromDataTransfer(e.clipboardData)
  if (!files.length || !files.some(canCreateAttachmentFromFile)) return

  e.preventDefault()
  const items = await createAttachmentContextItems(files)
  for (const item of items) emit('add-ctx', item)
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
      class="chat-input-box relative rounded-xl transition-all"
      :class="
        isDark
          ? 'bg-d1 border border-d4 focus-within:border-brand-400/30 focus-within:shadow-lg focus-within:shadow-brand-400/8'
          : 'bg-l1 border border-bdrF focus-within:border-brand-400/40 focus-within:shadow-lg focus-within:shadow-brand-400/12'
      ">
      <!-- Token editor keeps the visible @/ labels separate from resolved message text. -->
      <div class="relative px-3 sm:px-4 pt-2 pb-1" @contextmenu.prevent.stop="openTextEditMenu">
        <ChatTokenEditor
          ref="tokenEditorRef"
          v-model="inputDocument"
          class="chat-input-token-editor"
          :is-dark="isDark"
          :slash-items="slashCommandItems"
          :quick-items="quickInputsStore.enabledItems"
          :quick-enabled="settingsStore.quickInputEnabled"
          :placeholder="selectedAgent ? `向 ${selectedAgent.name} 提问，输入 @ 使用快捷输入；输入 / 引用技能...` : '输入问题，选择 Agent 后再发送，输入 @ 使用快捷输入；输入 / 引用技能...'"
          :menu-direction="'up'"
          @submit="handleSend"
          @paste="handlePaste"
          @contextmenu="openTextEditMenu" />

        <!-- 右下角字数统计 -->
        <div
          class="absolute right-4 bottom-2.5 text-[12px] tabular-nums select-none pointer-events-none transition-colors"
          :class="
            charCount > MAX_INPUT_LENGTH ? 'text-red-500 font-medium' : isDark ? 'text-wt-dim/120' : 'text-lt-aux/60'
          ">
          {{ charCount }} / {{ MAX_INPUT_LENGTH }}
        </div>
      </div>

      <!-- Toolbar 工具按钮栏-->
      <div class="chat-toolbar flex items-center gap-1.5 sm:gap-1 px-2 sm:px-3 pb-2 min-w-0">
        <div class="chat-toolbar-left flex items-center gap-1.5 sm:gap-1 min-w-0 flex-1 overflow-hidden">
          <!-- Attach button -->
          <button
            ref="attachBtnRef"
            @click="togglePopover('attach')"
            title="附件"
            class="toolbar-btn toolbar-btn-secondary h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors shrink-0"
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
            <span class="toolbar-label toolbar-label-optional">附件</span>
          </button>

          <!-- Agent button -->
          <button
            ref="agentBtnRef"
            @click="togglePopover('agent')"
            :title="selectedAgent ? selectedAgent.name : 'Agent'"
            class="toolbar-btn toolbar-btn-agent h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors min-w-0"
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
            <span class="toolbar-label toolbar-label-primary toolbar-label-agent truncate">{{ selectedAgent ? selectedAgent.name : 'Agent' }}</span>
          </button>

          <!-- Wiki context button -->
          <button
            ref="wikiBtnRef"
            @click="togglePopover('wiki')"
            :title="selectedWikiNames.length ? selectedWikiNames.join('、') : 'Wiki'"
            class="toolbar-btn toolbar-btn-wiki h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors min-w-0"
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
            <span class="toolbar-label toolbar-label-primary toolbar-label-wiki truncate">{{ wikiButtonLabel }}</span>
          </button>

          <!-- Context settings button -->
          <button
            ref="ctxBtnRef"
            @click="togglePopover('ctx')"
            :title="isCompressing ? '压缩中' : '上下文'"
            class="toolbar-btn toolbar-btn-secondary h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors shrink-0"
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
            <span class="toolbar-label toolbar-label-optional">{{ isCompressing ? '压缩中' : '上下文' }}</span>
          </button>

          <!-- Clear messages button -->
          <button
            v-if="hasMessages && !isStreaming"
            @click="emit('clear-messages')"
            title="清空聊天记录"
            class="toolbar-btn toolbar-btn-secondary text-red h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors shrink-0"
            :class="
              isDark
                ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8'
                : 'text-lt-aux hover:text-red-500 hover:bg-red-50'
            ">
            <i class="ri-delete-bin-7-line text-[12px]" />
            <span class="toolbar-label toolbar-label-optional">清空</span>
          </button>

          <!-- Token counter -->
          <div
            v-if="totalTokens > 0"
            class="chat-token-counter flex items-center gap-1.2 text-[12px] tabular-nums shrink-0"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-coin-line text-[12px]" />
            <span :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ formatTokenCount(totalInputTokens) }}↓</span>
            <span :class="isDark ? 'text-output-400' : 'text-output-500'">
              {{ formatTokenCount(totalOutputTokens) }}↑
            </span>
            <span v-if="lastLatencyMs" class="chat-token-extra flex items-center gap-0.5">
              <i class="ri-timer-line text-[12px]" />
              {{ lastLatencyMs < 1000 ? lastLatencyMs + 'ms' : (lastLatencyMs / 1000).toFixed(1) + 's' }}
            </span>
            <span v-if="lastCost > 0" class="chat-token-extra flex items-center gap-0.5">
              <i class="ri-money-dollar-circle-line text-[12px]" />
              {{ lastCost < 0.01 ? '$' + lastCost.toFixed(4) : '$' + lastCost.toFixed(2) }}
            </span>
          </div>
        </div>

        <!-- Send / Stop -->
        <button
          v-if="isStreaming"
          @click="emit('cancel')"
          class="chat-send-btn h-9 px-3.5 rounded-md flex items-center gap-1.5 text-sm font-medium transition-colors shrink-0"
          :class="stopButtonClass">
          <i class="ri-stop-circle-line text-[14px]" />
          <span class="send-label">停止</span>
        </button>
        <button
          v-else
          @click="handleSend"
          class="chat-send-btn h-9 px-3.5 rounded-md flex items-center gap-1.5 text-sm font-500 transition-colors shrink-0"
          :class="sendButtonClass">
          <i class="ri-send-plane-line text-[14px]" />
          <span class="send-label">发送</span>
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
.chat-input-box {
  container-type: inline-size;
}

.chat-input-token-editor :deep(.chat-token-editor-surface) {
  min-height: 64px;
  max-height: 200px;
  overflow-y: auto;
  padding-bottom: 28px;
}

.chat-toolbar-left {
  flex-basis: 0;
}

.chat-toolbar {
  gap: 6px;
}

.chat-toolbar-left {
  gap: 6px;
}

.chat-send-btn {
  flex: 0 0 auto;
}

/* 工具栏按钮图标对齐修正 */
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.toolbar-label {
  min-width: 0;
  white-space: nowrap;
}

.toolbar-label-primary {
  display: inline-block;
}

.toolbar-btn-secondary {
  flex: 0 0 auto;
}

.toolbar-btn-agent,
.toolbar-btn-wiki {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.toolbar-btn-agent {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 216px;
}

.toolbar-btn-wiki {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 196px;
}

.toolbar-label-agent {
  max-width: 180px;
}

.toolbar-label-wiki {
  max-width: 160px;
}

.chat-token-counter {
  min-width: 0;
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

@container (max-width: 760px) {
  .toolbar-btn {
    padding-left: 6px;
    padding-right: 6px;
  }

  .toolbar-btn-agent {
    flex-basis: auto;
    max-width: 176px;
  }

  .toolbar-btn-wiki {
    flex-basis: auto;
    max-width: 160px;
  }

  .chat-token-extra {
    display: none !important;
  }
}

@container (max-width: 600px) {
  .chat-token-counter {
    display: none !important;
  }

  .toolbar-btn-agent {
    flex-basis: auto;
    max-width: 160px;
  }

  .toolbar-btn-wiki {
    flex-basis: auto;
    max-width: 148px;
  }
}

@container (max-width: 560px) {
  .chat-toolbar,
  .chat-toolbar-left {
    gap: 4px;
  }

  .toolbar-btn {
    padding-left: 6px;
    padding-right: 6px;
  }

  .toolbar-btn-agent {
    flex-basis: auto;
    min-width: 0;
    max-width: 136px;
  }

  .toolbar-btn-wiki {
    flex-basis: auto;
    min-width: 0;
    max-width: 128px;
  }

  .toolbar-label-agent {
    max-width: 100px;
  }

  .toolbar-label-wiki {
    max-width: 92px;
  }
}

@container (max-width: 480px) {
  .toolbar-label-optional {
    display: none !important;
  }

  .toolbar-btn-secondary {
    width: 28px;
    min-width: 28px;
    padding-left: 0 !important;
    padding-right: 0 !important;
    justify-content: center;
  }

  .toolbar-btn-agent {
    flex-basis: auto;
    min-width: 0;
    max-width: 120px;
  }

  .toolbar-btn-wiki {
    flex-basis: auto;
    min-width: 0;
    max-width: 108px;
  }

  .toolbar-label-agent {
    max-width: 84px;
  }

  .toolbar-label-wiki {
    max-width: 72px;
  }
}

@container (max-width: 400px) {
  .toolbar-btn-agent {
    flex-basis: auto;
    min-width: 0;
    max-width: 96px;
  }

  .toolbar-btn-wiki {
    flex-basis: auto;
    min-width: 0;
    max-width: 88px;
  }

  .toolbar-label-agent {
    max-width: 62px;
  }

  .toolbar-label-wiki {
    max-width: 54px;
  }
}

@container (max-width: 340px) {
  .toolbar-label-wiki {
    display: none !important;
  }

  .toolbar-btn-wiki {
    flex: 0 0 28px;
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    padding-left: 0 !important;
    padding-right: 0 !important;
    justify-content: center;
  }
}

@container (max-width: 360px) {
  .chat-send-btn {
    width: 32px;
    padding-left: 0 !important;
    padding-right: 0 !important;
    justify-content: center;
  }

  .send-label {
    display: none !important;
  }
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
