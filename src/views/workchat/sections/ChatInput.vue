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
import { useMediaStore } from '@/stores/media'
import { useVoiceInput } from '@/composables/useVoiceInput'
import { useRouter } from 'vue-router'
import { displayTextFromDocument, isStructuredInputDocument, normalizeInputDocument, resolvedTextFromDocument } from '@/utils/chatInputDocument'
import { getAliyunAsrModelTypeLabel } from '@/constants/aliyunAsrModels'
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
const mediaStore = useMediaStore()
const router = useRouter()
const voiceBtnRef = ref(null)
const showVoiceModelDropdown = ref(false)
const voiceModelPos = ref({ left: 0, bottom: 0, arrowLeft: 18 })
const voiceStreamRef = ref(null)
const thinkingBtnRef = ref(null)
const showThinkingDropdown = ref(false)
const thinkingDropdownPos = ref({ left: 0, bottom: 0, arrowLeft: 18 })
const thinkingIntensity = computed(() => settingsStore.chatThinkingIntensity || 'auto')
const thinkingIntensityOptions = [
  { key: 'auto', label: '自动', icon: 'ri-magic-line', desc: '跟随默认配置', level: 0, group: 'mode' },
  { key: 'off', label: '关闭', icon: 'ri-shut-down-line', desc: '不使用思考', level: -1, group: 'mode' },
  { key: 'low', label: 'Low', icon: 'ri-flashlight-line', desc: '快速推理，适合简单任务', level: 1, group: 'intensity' },
  { key: 'medium', label: 'Medium', icon: 'ri-brain-line', desc: '平衡速度与深度', level: 2, group: 'intensity' },
  { key: 'high', label: 'High', icon: 'ri-mind-map', desc: '深入推理，适合复杂任务', level: 3, group: 'intensity' },
  { key: 'xhigh', label: 'XHigh', icon: 'ri-rocket-2-line', desc: '超深度推理，消耗较多 Token', level: 4, group: 'intensity' },
  { key: 'max', label: 'Max', icon: 'ri-fire-line', desc: '最大思考预算，最慢但最深', level: 5, group: 'intensity' },
]
const {
  status: voiceStatus,
  errorMsg: voiceErrorMsg,
  duration: voiceDuration,
  audioLevel: voiceAudioLevel,
  partialText: voicePartialText,
  selectedModelRef: voiceSelectedModelRef,
  availableModels: voiceAvailableModels,
  hasModels: voiceHasModels,
  selectedModel: voiceSelectedModel,
  isStreamingModel: voiceIsStreaming,
  isRealtimeModel: voiceIsRealtime,
  start: voiceStart,
  stop: voiceStop,
  cancel: voiceCancel,
  selectModel: voiceSelectModel,
  resetError: voiceResetError,
  formatDuration: voiceFormatDuration,
} = useVoiceInput()

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
const thinkingLabel = computed(() => {
  const opt = thinkingIntensityOptions.find(o => o.key === thinkingIntensity.value)
  return opt ? opt.label : '自动'
})

const canSend = computed(() => inputText.value.trim() && !props.isStreaming && charCount.value <= MAX_INPUT_LENGTH)

// Toolbar visibility from settings (Agent selector and Clear button are always visible)
const showAttach = computed(() => settingsStore.chatToolbarAttach !== false)
const showWiki = computed(() => settingsStore.chatToolbarWiki !== false)
const showContext = computed(() => settingsStore.chatToolbarContext !== false)
const showVoice = computed(() => settingsStore.chatToolbarVoice !== false)
const showTokenCounter = computed(() => settingsStore.chatToolbarTokenCounter !== false)
const showLatency = computed(() => settingsStore.chatToolbarLatency !== false)

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



// ─── Voice input ───
const voiceTitle = computed(() => {
  if (voiceStatus.value === 'recording') return '点击停止录音'
  if (voiceStatus.value === 'transcribing') return '语音识别中…'
  if (voiceStatus.value === 'error') return voiceErrorMsg.value || '语音输入出错，点击重试'
  const model = voiceSelectedModel.value
  return model ? `语音输入（${model.modelName || model.modelId}）` : '语音输入'
})

const voiceButtonClass = computed(() => {
  if (voiceStatus.value === 'recording') {
    return props.isDark ? 'voice-mic-active text-rose-400 bg-rose-400/10' : 'voice-mic-active text-rose-500 bg-rose-50'
  }
  if (voiceStatus.value === 'transcribing') {
    return props.isDark ? 'text-amber-400 bg-amber-400/10' : 'text-amber-500 bg-amber-50'
  }
  if (showVoiceModelDropdown.value) {
    return props.isDark ? 'text-brand-400 bg-brand-400/10' : 'text-brand-500 bg-brand-50'
  }
  return props.isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
})

const voiceShowStreamingText = computed(() =>
  voicePartialText.value && (
    voiceStatus.value === 'transcribing' ||
    (voiceStatus.value === 'recording' && (voiceIsRealtime.value))
  )
)

const voiceLevelBars = computed(() => {
  const level = voiceAudioLevel.value
  return [
    Math.max(0.12, level * 0.4),
    Math.max(0.18, level * 0.65),
    Math.max(0.22, level * 0.95),
    Math.max(0.18, level * 0.75),
    Math.max(0.12, level * 0.5),
  ]
})

watch(() => voicePartialText.value, () => {
  nextTick(() => {
    const el = voiceStreamRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

async function handleVoiceClick() {
  if (voiceStatus.value === 'idle' || voiceStatus.value === 'error') {
    voiceResetError()
    const ok = await voiceStart()
    if (!ok && voiceErrorMsg.value) {
      msg.error(voiceErrorMsg.value, { duration: 3500 })
    }
  } else if (voiceStatus.value === 'recording') {
    const text = await voiceStop()
    if (text) {
      const el = tokenEditorRef.value?.getElement?.()
      if (el) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        const currentText = el.textContent || ''
        const prefix = currentText && !/\s$/.test(currentText) ? ' ' : ''
        tokenEditorRef.value?.insertText?.(prefix + text)
      } else {
        tokenEditorRef.value?.insertText?.(text)
      }
    } else if (voiceErrorMsg.value) {
      msg.error(voiceErrorMsg.value, { duration: 3500 })
    }
  }
}

function toggleVoiceModelDropdown() {
  if (showVoiceModelDropdown.value) {
    showVoiceModelDropdown.value = false
    return
  }
  activePopover.value = null
  showThinkingDropdown.value = false
  showVoiceModelDropdown.value = true
  voiceModelPos.value = calcPopoverPos(voiceBtnRef.value)
}

function toggleThinkingDropdown() {
  if (showThinkingDropdown.value) {
    showThinkingDropdown.value = false
    return
  }
  activePopover.value = null
  showVoiceModelDropdown.value = false
  showThinkingDropdown.value = true
  thinkingDropdownPos.value = calcPopoverPos(thinkingBtnRef.value)
}

function selectThinkingIntensity(key) {
 settingsStore.savePreference('chatThinkingIntensity', key)
 showThinkingDropdown.value = false
}

function selectVoiceModel(ref) {
  voiceSelectModel(ref)
  showVoiceModelDropdown.value = false
}

function goToSpeechSettings() {
  showVoiceModelDropdown.value = false
  router.push('/settings/speech-models')
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
  showVoiceModelDropdown.value = false
  showThinkingDropdown.value = false
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
 emit('send', { content, inputDocument: hasTokens ? documentSnapshot : [], resolvedContent: hasTokens ? resolvedContent : content, thinkingIntensity: thinkingIntensity.value })
}

watch(() => props.selectedAgent?.id, () => tokenEditorRef.value?.closeMenu?.())

watch(() => props.commandInsertRequest?.id, () => {
  const request = props.commandInsertRequest
  if (!request?.text) return
  if (request.type === 'skill') tokenEditorRef.value?.insertSkill?.({ id: request.skillId, label: request.text, insertText: request.text })
  else tokenEditorRef.value?.insertText?.(request.text)
})

watch(() => settingsStore.workDirRoot, () => quickInputsStore.load().catch(() => {}))

onMounted(() => {
  quickInputsStore.load().catch(() => {})
  mediaStore.loadSpeechSettings().catch(() => {})
})

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
  if (!activePopover.value && !showVoiceModelDropdown.value && !showThinkingDropdown.value) return
  const popoverEl = document.getElementById('chat-popover-content')
  const voiceModelEl = document.getElementById('voice-model-dropdown')
  const thinkingEl = document.getElementById('thinking-dropdown')
  const attachBtn = attachBtnRef.value
  const agentBtn = agentBtnRef.value
  const wikiBtn = wikiBtnRef.value
  const ctxBtn = ctxBtnRef.value
  if (popoverEl && popoverEl.contains(e.target)) return
  if (voiceModelEl && voiceModelEl.contains(e.target)) return
  if (thinkingEl && thinkingEl.contains(e.target)) return
  if (attachBtn && attachBtn.contains(e.target)) return
  if (agentBtn && agentBtn.contains(e.target)) return
  if (wikiBtn && wikiBtn.contains(e.target)) return
  if (ctxBtn && ctxBtn.contains(e.target)) return
  const voiceBtn = voiceBtnRef.value
  if (voiceBtn && voiceBtn.contains(e.target)) return
  const thinkingBtn = thinkingBtnRef.value
  if (thinkingBtn && thinkingBtn.contains(e.target)) return
  activePopover.value = null
  showVoiceModelDropdown.value = false
  showThinkingDropdown.value = false
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
          v-show="voiceStatus === 'idle'"
          class="absolute right-4 bottom-2.5 text-[12px] tabular-nums select-none pointer-events-none transition-colors"
          :class="
            charCount > MAX_INPUT_LENGTH ? 'text-red-500 font-600' : isDark ? 'text-wt-dim/120' : 'text-lt-aux/60'
          ">
          {{ charCount }} / {{ MAX_INPUT_LENGTH }}
        </div>

        <!-- Voice status overlay (absolute, no height impact) -->
        <div
          v-if="voiceStatus !== 'idle'"
          class="voice-status-overlay absolute inset-x-1 sm:inset-x-4 bottom-1 z-20 rounded-lg pointer-events-auto"
          :class="[
            voiceStatus === 'recording' ? (isDark ? 'voice-bg-rec-dark' : 'voice-bg-rec-light') : '',
            voiceStatus === 'transcribing' ? (isDark ? 'voice-bg-load-dark' : 'voice-bg-load-light') : '',
            voiceStatus === 'error' ? (isDark ? 'voice-bg-err-dark' : 'voice-bg-err-light') : ''
          ]">
          <!-- Recording with waveform -->
          <div v-if="voiceStatus === 'recording' && !voiceShowStreamingText"
               class="voice-rec-row flex items-center justify-center gap-2.5 py-0.5">
            <span class="voice-rec-dot shrink-0" style="width:6px;height:6px" />
            <span class="text-[12px] font-medium" :class="isDark ? 'text-red-400' : 'text-red-500'">录音中</span>
            <div class="voice-waveform flex items-center gap-[2px] h-[20px]">
              <span v-for="(bar, i) in voiceLevelBars" :key="i"
                    class="voice-wave-bar rounded-full"
                    :class="isDark ? 'bg-red-400' : 'bg-red-500'"
                    :style="{ height: Math.round(bar * 18 + 2) + 'px', opacity: 0.35 + bar * 0.65 }" />
            </div>
            <span class="text-[12px] tabular-nums" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ voiceFormatDuration() }}</span>
            <button @click.stop="voiceCancel"
                    class="voice-cancel-btn text-[11px] px-1.5 py-0.5 rounded-md transition-colors"
                    :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
              取消
            </button>
          </div>
          <!-- Streaming text card -->
          <div
            v-else-if="voiceShowStreamingText"
            ref="voiceStreamRef"
            class="voice-stream-card max-h-[120px] overflow-y-auto py-2 px-1"
            :class="voiceIsRealtime ? (isDark ? 'voice-card-realtime-dark' : 'voice-card-realtime-light') : (isDark ? 'voice-card-dark' : 'voice-card-light')">
            <div v-if="voiceStatus === 'recording'" class="flex items-center gap-1 mb-1.5">
              <span class="voice-rec-dot shrink-0" style="width:6px;height:6px" />
              <span class="text-[11px] font-medium" :class="isDark ? 'text-amber-400' : 'text-amber-600'">实时识别</span>
              <div class="voice-waveform voice-waveform-sm flex items-center gap-[1.5px] h-[12px]">
                <span v-for="(bar, i) in voiceLevelBars" :key="i"
                      class="voice-wave-bar rounded-full"
                      :class="isDark ? 'bg-amber-400' : 'bg-amber-500'"
                      :style="{ height: Math.round(bar * 10 + 2) + 'px', opacity: 0.35 + bar * 0.65 }" />
              </div>
              <span class="text-[11px] tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ voiceFormatDuration() }}</span>
            </div>
            <p class="text-[14px] leading-relaxed m-0" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ voicePartialText }}<span class="voice-cursor" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            </p>
          </div>
          <!-- Loading -->
          <div v-else-if="voiceStatus === 'transcribing'" class="flex items-center justify-center gap-2 py-0.5">
            <i class="ri-loader-4-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" style="animation: spin 1s linear infinite" />
            <span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">语音识别中</span>
            <span class="voice-dots" />
          </div>
          <!-- Error -->
          <div v-else-if="voiceStatus === 'error'" class="flex items-center justify-center gap-2 py-0.5">
            <i class="ri-error-warning-line text-[14px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
            <span class="text-[12px] flex-1 min-w-0 truncate" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ voiceErrorMsg }}</span>
            <button @click.stop="voiceResetError"
                    class="voice-retry-btn text-[11px] px-1.5 py-0.5 rounded-md transition-colors shrink-0"
                    :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
              重试
            </button>
            <button @click.stop="voiceResetError"
                    class="shrink-0 text-[16px] px-1 leading-none opacity-50 hover:opacity-100 transition-opacity"
                    :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
                    title="关闭">
              <i class="ri-close-line" />
            </button>
          </div>
        </div>
      </div>

      <!-- Toolbar 工具按钮栏-->
      <div class="chat-toolbar flex items-center gap-1 sm:gap-1 px-2 sm:px-3 pb-2 min-w-0">
        <div class="chat-toolbar-left flex items-center gap-1 sm:gap-1 min-w-0 flex-1 overflow-hidden">
          <!-- Attach button -->
          <button
            ref="attachBtnRef"
            v-if="showAttach"
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
          <!-- Thinking 强度 -->
          <div ref="thinkingBtnRef" class="flex items-center gap-0.5 shrink-0">
            <button
              @click="toggleThinkingDropdown"
              :title="'思考强度：' + thinkingLabel"
              class="toolbar-btn toolbar-btn-secondary h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors"
              :class="
                showThinkingDropdown || thinkingIntensity !== 'auto'
                  ? isDark
                    ? 'text-brand-400 bg-brand-400/10'
                    : 'text-brand-500 bg-brand-50'
                  : isDark
                    ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5'
                    : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
              ">
              <i class="ri-brain-line text-[12px]" />
              <span class="toolbar-label toolbar-label-optional">{{ thinkingLabel }}</span>
            </button>
          </div>
          <!-- Wiki context button -->
          <button
            ref="wikiBtnRef"
            v-if="showWiki"
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
            v-if="showContext"
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



         <!-- Voice input -->
          <div v-if="showVoice" ref="voiceBtnRef" class="flex items-center gap-0.5 shrink-0">
            <button
              @click="handleVoiceClick"
              :title="voiceTitle"
              :disabled="voiceStatus === 'transcribing'"
              class="voice-mic-btn toolbar-btn toolbar-btn-secondary h-8 px-2 sm:px-2.5 rounded-lg flex items-center gap-1 text-[0.8125rem] transition-colors duration-200"
              :class="voiceButtonClass">
              <i
                :class="voiceStatus === 'recording' ? 'ri-mic-fill' : voiceStatus === 'transcribing' ? 'ri-loader-4-line' : 'ri-mic-line'"
                class="text-[12px]"
                :style="voiceStatus === 'recording' ? 'animation: voicePulse 1.2s ease-in-out infinite' : voiceStatus === 'transcribing' ? 'animation: spin 1s linear infinite' : ''" />
              <span class="toolbar-label toolbar-label-optional">
                {{ voiceStatus === 'recording' ? voiceFormatDuration() : voiceStatus === 'transcribing' ? '识别中' : '语音' }}
              </span>
              <span
                v-if="voiceIsStreaming && voiceStatus === 'idle'"
                class="text-[9px] px-1 py-0.5 rounded font-medium leading-none self-center"
                :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">
                流式
              </span>
              <span
                v-if="voiceIsRealtime && voiceStatus === 'idle'"
                class="text-[9px] px-1 py-0.5 rounded font-medium leading-none self-center"
                :class="isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'">
                实时
              </span>
            </button>
            <button
              v-if="voiceStatus === 'idle'"
              @click.stop="toggleVoiceModelDropdown"
              :title="'选择语音模型'"
              class="h-8 w-5 rounded-lg flex items-center justify-center transition-colors"
              :class="
                showVoiceModelDropdown
                  ? isDark ? 'text-brand-400 bg-brand-400/10' : 'text-brand-500 bg-brand-50'
                  : isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
             ">
              <i :class="showVoiceModelDropdown ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'" class="text-[12px]" />
            </button>
          </div>

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
            v-if="showTokenCounter && totalTokens > 0"
            class="chat-token-counter flex items-center gap-1.2 text-[12px] tabular-nums shrink-0"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-coin-line text-[12px]" />
            <span :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ formatTokenCount(totalInputTokens) }}↓</span>
            <span :class="isDark ? 'text-output-400' : 'text-output-500'">
              {{ formatTokenCount(totalOutputTokens) }}↑
            </span>
            <span v-if="showLatency && lastLatencyMs" class="chat-token-extra flex items-center gap-0.5">
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
          class="chat-send-btn h-9 px-3.5 rounded-md flex items-center gap-1 text-sm font-medium transition-colors shrink-0"
          :class="stopButtonClass">
          <i class="ri-stop-circle-line text-[14px]" />
          <span class="send-label">停止</span>
        </button>
        <button
          v-else
          @click="handleSend"
          class="chat-send-btn h-9 px-3.5 rounded-md flex items-center gap-1 text-sm font-500 transition-colors shrink-0"
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
  <!-- Voice model dropdown -->
  <Teleport to="body">
    <div
      v-if="showVoiceModelDropdown"
      id="voice-model-dropdown"
      class="fixed z-[9999] rounded-xl shadow-2xl"
      :class="isDark ? 'shadow-black/50' : 'shadow-black/20'"
      :style="{ left: voiceModelPos.left + 'px', bottom: voiceModelPos.bottom + 'px', width: '260px' }">
      <span
        class="pointer-events-none absolute -bottom-[5px] h-2.5 w-2.5 rotate-45"
        :class="isDark ? 'bg-d2 border-r border-b border-d4' : 'bg-l2 border-r border-b border-bdrF'"
        :style="{ left: voiceModelPos.arrowLeft + 'px' }" />
      <div
        class="rounded-lg overflow-hidden"
        :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
        <div
          class="px-3 py-2.5 flex items-center justify-between"
          :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-1">
            <i class="ri-mic-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">语音模型</span>
          </div>
          <button
            @click="showVoiceModelDropdown = false"
            class="h-5 w-5 rounded flex items-center justify-center transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
            <i class="ri-close-line text-[16px]" />
          </button>
        </div>
        <div class="p-2 max-h-[240px] overflow-y-auto">
          <button
            v-for="model in voiceAvailableModels"
            :key="model.ref"
            @click="selectVoiceModel(model.ref)"
            class="voice-model-card w-full px-2.5 py-2 rounded-lg flex items-center gap-2 transition-all text-left relative"
            :class="
              model.ref === voiceSelectedModelRef
                ? isDark ? 'bg-brand-400/10 text-brand-400 voice-card-active-dark' : 'bg-brand-50 text-brand-500 voice-card-active-light'
                : isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'
            ">
            <i
              :class="model.ref === voiceSelectedModelRef ? 'ri-check-line' : 'ri-mic-line'"
              class="text-[12px] shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-[12px] font-medium truncate">{{ model.modelName || model.modelId }}</div>
              <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ model.providerName }}
                <span v-if="model.streaming" class="ml-1 px-1 rounded text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-500'">流式</span>
                <span v-if="model.providerId === 'aliyun_bailian_asr' && getAliyunAsrModelTypeLabel(model.modelId)" class="ml-1 px-1 rounded text-[9px] font-medium" :class="isDark ? 'bg-cyan-400/10 text-cyan-400' : 'bg-cyan-50 text-cyan-600'" :title="`${getAliyunAsrModelTypeLabel(model.modelId)}调用`">{{ getAliyunAsrModelTypeLabel(model.modelId) }}</span>
                <span v-if="model.realtime" class="ml-1 px-1 rounded text-[9px]" :class="isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'">实时</span>
              </div>
            </div>
          </button>
          <div v-if="!voiceAvailableModels.length" class="py-4 text-center">
            <i class="ri-mic-off-line text-[20px] block mb-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未配置可用模型</p>
          </div>
        </div>
        <div
          class="p-2"
          :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button
            @click="goToSpeechSettings"
            class="w-full h-7 rounded-lg flex items-center justify-center gap-1 text-[11px] font-medium transition-colors"
            :class="isDark ? 'text-brand-400 hover:bg-brand-400/10' : 'text-brand-500 hover:bg-brand-50'">
            <i class="ri-settings-3-line text-[12px]" />
            语音模型设置
          </button>
        </div>
      </div>
   </div>
 </Teleport>
  <!-- Thinking intensity dropdown -->
  <Teleport to="body">
    <div
      v-if="showThinkingDropdown"
      id="thinking-dropdown"
      class="fixed z-[9999] rounded-xl shadow-2xl"
      :class="isDark ? 'shadow-black/50' : 'shadow-black/20'"
      :style="{ left: thinkingDropdownPos.left + 'px', bottom: thinkingDropdownPos.bottom + 'px', width: '240px' }">
      <span
        class="pointer-events-none absolute -bottom-[5px] h-2.5 w-2.5 rotate-45"
        :class="isDark ? 'bg-d2 border-r border-b border-d4' : 'bg-l2 border-r border-b border-bdrF'"
        :style="{ left: thinkingDropdownPos.arrowLeft + 'px' }" />
      <div
        class="rounded-lg overflow-hidden"
        :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
        <div
          class="px-3 py-2.5 flex items-center justify-between"
          :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-1">
            <i class="ri-brain-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">思考强度</span>
          </div>
          <button
            @click="showThinkingDropdown = false"
            class="h-5 w-5 rounded flex items-center justify-center transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
            <i class="ri-close-line text-[16px]" />
          </button>
       </div>
       <div class="p-1.5 max-h-[340px] overflow-y-auto">
         <button
           v-for="opt in thinkingIntensityOptions"
           :key="opt.key"
           @click="selectThinkingIntensity(opt.key)"
           class="w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition-all text-left"
           :class="
             thinkingIntensity === opt.key
               ? isDark ? 'bg-brand-400/10' : 'bg-brand-50'
               : isDark ? 'hover:bg-white/5' : 'hover:bg-l4'
           ">
           <i
             :class="[opt.icon, 'text-[15px] shrink-0',
               thinkingIntensity === opt.key
                 ? isDark ? 'text-brand-400' : 'text-brand-500'
                 : isDark ? 'text-wt-dim' : 'text-lt-aux'
             ]" />
           <div class="flex-1 min-w-0">
             <span class="text-[12px] font-medium"
               :class="thinkingIntensity === opt.key ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ opt.label }}</span>
             <span class="text-[10px] block mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ opt.desc }}</span>
           </div>
           <i v-if="thinkingIntensity === opt.key" class="ri-check-line text-[14px] shrink-0" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
           <i v-else-if="opt.group === 'intensity'" class="ri-arrow-right-s-line text-[12px] shrink-0 opacity-30" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
         </button>
       </div>
     </div>
   </div>
 </Teleport>
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

/* === Voice status overlay === */
.voice-status-overlay {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  max-height: 120px;
  overflow-y: auto;
}

.voice-status-overlay.voice-bg-rec-dark {
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.03));
}
.voice-status-overlay.voice-bg-rec-light {
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.06), rgba(239, 68, 68, 0.02));
}
.voice-status-overlay.voice-bg-load-dark {
  background: linear-gradient(to bottom, rgba(99, 102, 241, 0.08), rgba(99, 102, 241, 0.03));
}
.voice-status-overlay.voice-bg-load-light {
  background: linear-gradient(to bottom, rgba(99, 102, 241, 0.06), rgba(99, 102, 241, 0.02));
}
.voice-status-overlay.voice-bg-err-dark {
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.03));
}
.voice-status-overlay.voice-bg-err-light {
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.06), rgba(239, 68, 68, 0.02));
}

.voice-rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  animation: voiceRecPulse 1.2s ease-in-out infinite;
}

@keyframes voiceRecPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { transform: scale(0.85); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

@keyframes voicePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* === Voice waveform === */
.voice-waveform { overflow: hidden; }
.voice-wave-bar {
  width: 2.5px;
  min-height: 2px;
  border-radius: 9999px;
  transition: height 80ms ease-out, opacity 80ms ease-out;
}
.voice-waveform-sm .voice-wave-bar { width: 2px; }

/* === Mic button === */
.voice-mic-btn {
  min-height: 2rem;
  max-height: 2rem;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}
.voice-mic-active { animation: voiceMicGlow 1.8s ease-in-out infinite; }
@keyframes voiceMicGlow {
  0%, 100% { opacity: 0.82; }
  50% { opacity: 1; }
}

/* === Animated dots === */
.voice-dots::after { content: ''; animation: voiceDots 1.5s steps(1) infinite; }
@keyframes voiceDots {
  0% { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
  100% { content: ''; }
}

/* === Cancel / Retry === */
.voice-cancel-btn, .voice-retry-btn { border: 1px solid transparent; line-height: 1.4; }
.voice-cancel-btn:hover, .voice-retry-btn:hover { border-color: currentColor; }

/* === Model card === */
.voice-model-card { overflow: hidden; }
.voice-card-active-dark::before, .voice-card-active-light::before {
  content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 2.5px; height: 60%; border-radius: 0 2px 2px 0;
}
.voice-card-active-dark::before { background: rgba(129, 140, 248, 0.6); }
.voice-card-active-light::before { background: rgba(99, 102, 241, 0.7); }

/* === Streaming card === */
.voice-stream-card {
  border-radius: 10px; padding-left: 12px !important; padding-right: 12px !important;
  border-left: 2px solid transparent;
}
.voice-card-dark {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.07), rgba(99, 102, 241, 0.01));
  border-left-color: rgba(129, 140, 248, 0.3);
}
.voice-card-light {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(99, 102, 241, 0.01));
  border-left-color: rgba(99, 102, 241, 0.25);
}
.voice-card-realtime-dark {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.01));
  border-left-color: rgba(251, 191, 36, 0.3);
}
.voice-card-realtime-light {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(245, 158, 11, 0.01));
  border-left-color: rgba(245, 158, 11, 0.25);
}

.voice-cursor {
  display: inline-block; width: 2px; height: 1em; margin-left: 1px;
  vertical-align: text-bottom; border-radius: 1px;
  animation: voiceCursorBlink 0.8s step-end infinite;
}
@keyframes voiceCursorBlink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

</style>
