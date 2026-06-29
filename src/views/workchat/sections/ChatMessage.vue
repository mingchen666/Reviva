<script setup>
import MarkdownView from '@/components/MarkdownView.vue'
import { getErrorInfo } from '@/utils/errorCodes'
import { computed, ref } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import MessageDeleteConfirm from './MessageDeleteConfirm.vue'
import FileCard from './FileCard.vue'
import ToolCallCard from './ToolCallCard.vue'
import SubAgentCard from './SubAgentCard.vue'
import TodoListCard from './TodoListCard.vue'
import AuthCard from './AuthCard.vue'
import UserMessageBubble from './UserMessageBubble.vue'
import MessageActionsBar from './MessageActionsBar.vue'
import SourceRefBar from './SourceRefBar.vue'

const props = defineProps({
  msg: Object,
  isDark: Boolean,
  chatBusy: Boolean,
  isStreaming: Boolean,
  streamingContent: String,
  streamingThinking: { type: String, default: '' },
  streamingToolCalls: { type: Object, default: () => ({}) },
  streamingSubAgents: { type: Object, default: () => ({}) },
  streamingTodos: { type: Array, default: () => [] },
  streamingSteps: { type: Array, default: () => [] },
  streamingIteration: { type: Number, default: 0 },
  pendingAuthRequests: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'preview-file', 'retry', 'copy', 'edit', 'save-edit', 'delete',
  'compress-context', 'auth-approve', 'auth-deny',
])

const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const processBlockOpen = ref({})
const thinkingOpen = ref(false)
const showDeleteConfirm = ref(false)
const copied = ref(false)

const workRoot = computed(() => settingsStore.workDirRoot || '')

function onMarkdownFileClick(payload) {
  if (!payload?.path) return
  if (payload.previewable) {
    emit('preview-file', { path: payload.path, name: payload.name, fromMarkdown: true })
  } else {
    window.electronAPI?.openPath(payload.path).catch(() => {})
  }
}

const agent = computed(() => {
  if (!props.msg.meta?.agentId) return null
  return agentsStore.agents.find((a) => a.id === props.msg.meta.agentId)
})

const displayContent = computed(() => {
  if (props.isStreaming && props.streamingContent) return props.streamingContent
  return props.msg.content || ''
})

const isError = computed(() => props.msg.status === 'error')
const isPending = computed(() => props.msg.status === 'pending')
const isStreamingStatus = computed(() => props.msg.status === 'streaming')
const isCompleted = computed(() => props.msg.status === 'completed' || !props.msg.status)
const isCancelled = computed(() => props.msg.status === 'cancelled')
const isUser = computed(() => props.msg.role === 'user')
const isAssistant = computed(() => props.msg.role === 'assistant')

// ── Step data ──
const completedSteps = computed(() => props.msg.meta?.steps || [])

function resolveToolStatus(current, live) {
  if (current?.status === 'error' || live?.status === 'error') return 'error'
  if (current?.status === 'completed' || live?.status === 'completed' || current?.result || live?.result) return 'completed'
  return live?.status || current?.status || 'running'
}

function mergeDisplayToolCall(current, live) {
  if (!live) {
    if (current?.result && current.status === 'running') return { ...current, status: 'completed' }
    return current
  }
  return {
    ...current,
    ...live,
    name: current.name || live.name,
    status: resolveToolStatus(current, live),
    input: live.input || current.input,
    result: live.result || current.result,
  }
}

const displaySteps = computed(() => {
  const source = props.isStreaming && props.streamingSteps.length ? props.streamingSteps : completedSteps.value
  if (!source.length) return source
  const liveCalls = props.isStreaming ? props.streamingToolCalls : {}
  return source.map((step) => {
    if (!step.toolCalls?.length || !Object.keys(liveCalls).length) return step
    const mergedCalls = step.toolCalls.map((tc) => {
      const live = liveCalls[tc.id]
      return mergeDisplayToolCall(tc, live)
    })
    return { ...step, toolCalls: mergedCalls }
  })
})

const hasSteps = computed(() => displaySteps.value.some((s) => s.thinking || s.toolCalls?.length || s.content?.trim()))

const timelineBlocks = computed(() => {
  const blocks = []
  const steps = displaySteps.value
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si]
    if (step.thinking) blocks.push({ type: 'thinking', content: step.thinking, stepIndex: si })
    if (step.toolCalls?.length) blocks.push({ type: 'tools', toolCalls: step.toolCalls, stepIndex: si })
    if (step.content?.trim()) blocks.push({ type: 'text', content: step.content, stepIndex: si, isLast: si === steps.length - 1 })
  }
  return blocks
})

const timelineToolIds = computed(() => {
  const ids = new Set()
  for (const step of displaySteps.value) {
    for (const tc of (step.toolCalls || [])) {
      if (tc.id) ids.add(tc.id)
    }
  }
  return ids
})
const activeToolCalls = computed(() =>
  Object.values(props.streamingToolCalls).filter(tc =>
    tc.status === 'running' && !timelineToolIds.value.has(tc.id),
  ),
)

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function hasSkillFrontmatter(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '')
  return /---\s*(?:\\n|\r?\n)?\s*name:\s*[a-z0-9_-]+/i.test(text)
}

function isInternalSkillSubAgent(sa) {
  if (!sa) return false
  return (isUuidLike(sa.name) || isUuidLike(sa.id) || isUuidLike(sa.subRunId)) && hasSkillFrontmatter(sa.result || sa.task)
}

const activeSubAgents = computed(() => Object.values(props.streamingSubAgents).filter(sa => !isInternalSkillSubAgent(sa)))
const completedSubAgents = computed(() => (props.msg.meta?.subAgents || []).filter(sa => !isInternalSkillSubAgent(sa)))
const displayTodos = computed(() => props.isStreaming ? props.streamingTodos : (props.msg.meta?.todos || []))

const showLoading = computed(() =>
  (isPending.value && !props.isStreaming) ||
  (props.isStreaming && !displayContent.value && !activeToolCalls.value.length && !activeSubAgents.value.length && !displayTodos.value.length && !displaySteps.value.length)
)

const showThinking = computed(() => {
  if (displaySteps.value.length) return false
  if (props.isStreaming && props.streamingThinking) return true
  return !!props.msg.thinkingContent
})

const thinkingContent = computed(() => {
  if (props.isStreaming && props.streamingThinking) return props.streamingThinking
  return props.msg.thinkingContent || ''
})

const thinkingDuration = computed(() => {
  const tokens = props.msg.thinkingTokens || 0
  if (!tokens) return ''
  const seconds = Math.max(1, Math.round(tokens / 10))
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm' + (seconds % 60) + 's'
})

const authEventMap = computed(() => {
  const map = {}
  for (const ae of (props.msg.meta?.authEvents || [])) map[ae.toolName] = ae
  return map
})

const errorInfo = computed(() => getErrorInfo(props.msg.errorCode))
const displayErrorMessage = computed(() => {
  const message = props.msg.errorMessage || ''
  const match = message.match(/invoked agent of type\s+([^,\s]+).*only allowed types are\s+(.+)$/i)
  if (!match) return message || '未知错误'
  const requested = match[1]
  const allowed = match[2]
  return `Agent 调用了不存在的子任务类型 ${requested}。当前可用类型只有 ${allowed}，请重试，系统会自动改用通用子任务。`
})
const flatToolCalls = computed(() => props.msg.meta?.toolCalls || [])

// ── Source references ──
const kbSources = computed(() => props.msg.meta?.kbSources || [])

// Preprocess content: convert bare [N] references to [N](kb:N) links when kbSources exist
const mdContent = computed(() => {
  const raw = displayContent.value
  if (!raw || !kbSources.value.length) return raw
  // Replace [N] that aren't already markdown links with [N](kb:N)
  return raw.replace(/\[(\d+)\](?!\()/g, (m, id) => {
    const num = Number(id)
    return kbSources.value.find(s => s.refId === num) || kbSources.value[num - 1] ? `[${id}](kb:${id})` : m
  })
})

const attachments = computed(() => props.msg.meta?.attachments || [])
function isImageAttachment(item) {
  if (!item) return false
  if (item.type === 'image') return true
  if (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) return true
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(item.name || item.path || ''))
}
const imageAttachments = computed(() => attachments.value.filter(isImageAttachment))
const fileAttachments = computed(() => attachments.value.filter((a) => !isImageAttachment(a)))

const iterationDisplay = computed(() => {
  if (props.isStreaming && props.streamingIteration > 1) return '步骤 ' + props.streamingIteration
  return ''
})

function toggleProcessBlock(key) { processBlockOpen.value[key] = !processBlockOpen.value[key] }
function fmtTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}
function copyContent() {
  navigator.clipboard.writeText(props.msg.content || '')
    .then(() => { copied.value = true; setTimeout(() => { copied.value = false }, 1500) })
    .catch(() => {})
  emit('copy')
}
function copyRawMarkdown() {
  navigator.clipboard.writeText(props.msg.content || '')
    .then(() => { copied.value = true; setTimeout(() => { copied.value = false }, 1500) })
    .catch(() => {})
}
function confirmDelete() { emit('delete'); showDeleteConfirm.value = false }

// Handle kb: link clicks from markdown content
const activeKbRef = ref(null)
function onMarkdownLinkClick({ href }) {
  if (href.startsWith('kb:')) {
    const id = Number(href.split(':')[1] || 0)
    activeKbRef.value = activeKbRef.value === id ? null : id
  }
}
</script>

<template>
  <!-- ═══ User Message ═══ -->
  <UserMessageBubble v-if="isUser"
    :msg="msg" :is-dark="isDark"
    :chat-busy="chatBusy"
    :image-attachments="imageAttachments" :file-attachments="fileAttachments"
    @preview-file="(f) => emit('preview-file', f)"
    @copy="copyContent"
    @edit="emit('edit')"
    @save-edit="(d) => emit('save-edit', d)"
    @retry="emit('retry')"
    @delete="emit('delete')" />

  <!-- ═══ Assistant Message ═══ -->
  <div v-if="isAssistant" class="group relative flex gap-3 max-w-[95%] sm:max-w-[82%] fade-up">
    <!-- Avatar -->
    <div class="w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 mt-0.5"
      :class="agent ? (isDark ? 'bg-agent-400/12 border-[1.5px] border-agent-400/30' : 'bg-agent-50 border-[1.5px] border-agent-100') : (isDark ? 'bg-brand-400/12 border border-brand-400/20' : 'bg-brand-50 border border-brand-100')">
      <i :class="agent ? (agent.icon || 'ri-sparkling-2-line') + ' text-agent-400' : 'ri-robot-2-line text-brand-400'" class="text-[13px]" />
    </div>
    <!-- Content column -->
    <div class="flex-1 min-w-0">
      <!-- Agent badge -->
      <div v-if="agent" class="flex items-center gap-2 mb-1.5">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">{{ agent.name }}</span>
        <span v-if="iterationDisplay" class="text-[10px] px-1 py-0.5 rounded animate-fade-in" :class="isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500'">{{ iterationDisplay }}</span>
      </div>

      <!-- ══ Message body bubble ══ -->
      <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d3' : 'bg-l3'">
        <!-- ── Timeline blocks ── -->
        <template v-if="timelineBlocks.length">
          <template v-for="(block, bi) in timelineBlocks" :key="bi">
            <!-- Thinking -->
            <div v-if="block.type === 'thinking'" class="px-4 pt-2.5 pb-1">
              <button @click="toggleProcessBlock('thinking-' + bi)"
                class="flex items-center gap-1.5 text-[11px] font-medium leading-none transition-colors py-1.5 px-2 -ml-2 rounded-md"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
                <i :class="processBlockOpen['thinking-' + bi] ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[12px] leading-none transition-transform" />
                <i class="ri-brain-line text-[11px] leading-none" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
                <span class="leading-none" v-if="isStreaming && block.stepIndex === displaySteps.length - 1">思考中...</span>
                <span class="leading-none" v-else>思考过程</span>
                <span v-if="!isStreaming" class="ml-0.5 text-[10px] leading-none tabular-nums px-1.5 py-[3px] rounded"
                  :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ Math.max(1, Math.round(block.content.length / 40)) }}s</span>
              </button>
              <Transition name="thinking-slide">
                <div v-if="processBlockOpen['thinking-' + bi]"
                  class="mt-1.5 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed overflow-auto max-h-[320px] thin-scroll"
                  :class="isDark ? 'bg-d4/60 border border-d4 border-l-2 border-l-agent-400/40 text-wt-dim' : 'bg-l4/80 border border-bdrF border-l-2 border-l-agent-300 text-lt-aux'">
                  <MarkdownView :content="block.content" :is-dark="isDark" :work-root="workRoot" @file-click="onMarkdownFileClick" />
                </div>
              </Transition>
            </div>
            <!-- Tool calls -->
            <div v-else-if="block.type === 'tools'" class="px-4 py-1.5">
              <button @click="toggleProcessBlock('tools-' + bi)"
                class="flex items-center gap-1.5 text-[11px] font-medium transition-colors py-0.5 w-full"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                <i :class="processBlockOpen['tools-' + bi] ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[11px]" />
                <i class="ri-tools-line text-[10px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
                <span>工具调用 ({{ block.toolCalls.length }})</span>
              </button>
              <Transition name="thinking-slide">
                <div v-if="processBlockOpen['tools-' + bi]" class="mt-1.5 space-y-1.5 pb-1">
                  <ToolCallCard v-for="tc in block.toolCalls" :key="tc.id" :tool-call="tc" :is-dark="isDark" :auth-event="authEventMap[tc.name]" />
                </div>
              </Transition>
            </div>
            <!-- Text -->
            <div v-else-if="block.type === 'text'" class="px-4 py-2.5">
              <div class="text-[12px] leading-relaxed md-content"
                :class="[isDark ? 'text-wt-main' : 'text-lt-main', agent && block.isLast ? 'border-l-2 border-l-agent-400' : '']">
                <MarkdownView :content="block.content" :is-dark="isDark" :work-root="workRoot" @file-click="onMarkdownFileClick" />
              </div>
            </div>
          </template>
          <!-- Active streaming items -->
          <div v-if="activeToolCalls.length && isStreaming" class="px-4 py-1.5">
            <div class="flex items-center gap-1.5 text-[11px] font-medium py-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-loader-4-line text-[10px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" style="animation: spin 1s linear infinite" />
              <span>工具调用中...</span>
            </div>
            <div class="mt-1.5 space-y-1.5">
              <ToolCallCard v-for="tc in activeToolCalls" :key="tc.id" :tool-call="tc" :is-dark="isDark" />
            </div>
          </div>
          <div v-if="activeSubAgents.length && isStreaming" class="px-4 py-1.5 space-y-1.5">
            <SubAgentCard v-for="sa in activeSubAgents" :key="sa.id || sa.subRunId || sa.name" :sub-agent="sa" :is-dark="isDark" />
          </div>
          <div v-if="completedSubAgents.length && !isStreaming" class="px-4 py-1.5 space-y-1.5">
            <SubAgentCard v-for="sa in completedSubAgents" :key="sa.id || sa.subRunId || sa.name" :sub-agent="sa" :is-dark="isDark" />
          </div>
          <div v-if="displayTodos.length" class="px-4 py-1.5">
            <TodoListCard :todos="displayTodos" :is-dark="isDark" />
          </div>
          <div v-if="isStreaming && pendingAuthRequests.length" class="px-4 py-1.5 space-y-1.5">
            <AuthCard v-for="ar in pendingAuthRequests" :key="ar.requestId" :auth-request="ar" :is-dark="isDark" @approve="(d) => emit('auth-approve', d)" @deny="(d) => emit('auth-deny', d)" />
          </div>
          <div v-if="isStreaming" class="px-4 pb-2">
            <span class="loading-dots inline-flex items-center gap-1.5">
              <span class="dot w-[5px] h-[5px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              <span class="dot w-[5px] h-[5px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              <span class="dot w-[5px] h-[5px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            </span>
          </div>
        </template>

        <!-- ── No steps: simple content ── -->
        <template v-else>
          <div v-if="activeToolCalls.length && isStreaming" class="px-4 pt-3 space-y-1.5">
            <ToolCallCard v-for="tc in activeToolCalls" :key="tc.id" :tool-call="tc" :is-dark="isDark" />
          </div>
          <div v-if="flatToolCalls.length && !isStreaming" class="px-4 pt-3 space-y-1.5">
            <ToolCallCard v-for="tc in flatToolCalls" :key="tc.id" :tool-call="tc" :is-dark="isDark" />
          </div>
          <div v-if="activeSubAgents.length && isStreaming" class="px-4 pt-3 space-y-1.5">
            <SubAgentCard v-for="sa in activeSubAgents" :key="sa.id || sa.subRunId || sa.name" :sub-agent="sa" :is-dark="isDark" />
          </div>
          <div v-if="completedSubAgents.length && !isStreaming" class="px-4 pt-3 space-y-1.5">
            <SubAgentCard v-for="sa in completedSubAgents" :key="sa.id || sa.subRunId || sa.name" :sub-agent="sa" :is-dark="isDark" />
          </div>
          <div v-if="displayTodos.length" class="px-4 pt-3">
            <TodoListCard :todos="displayTodos" :is-dark="isDark" />
          </div>
          <div v-if="showThinking" class="px-4 pt-3">
            <button @click="thinkingOpen = !thinkingOpen"
              class="flex items-center gap-1.5 text-[11px] font-medium leading-none transition-colors py-1.5 px-2 -ml-2 rounded-md"
              :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i :class="thinkingOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[12px] leading-none transition-transform" />
              <i class="ri-brain-line text-[11px] leading-none" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
              <span class="leading-none" v-if="isStreaming">思考中...</span>
              <span class="leading-none" v-else-if="thinkingDuration">已思考 {{ thinkingDuration }}</span>
              <span class="leading-none" v-else>思考过程</span>
              <span v-if="msg.thinkingTokens" class="ml-0.5 text-[10px] leading-none tabular-nums px-1.5 py-[3px] rounded"
                :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ fmtTokens(msg.thinkingTokens) }} tokens</span>
            </button>
            <Transition name="thinking-slide">
              <div v-if="thinkingOpen"
                class="mt-1.5 px-3 py-2.5 rounded-lg text-[12px] leading-relaxed overflow-auto max-h-[320px] thin-scroll"
                :class="isDark ? 'bg-d4/60 border border-d4 border-l-2 border-l-agent-400/40 text-wt-dim' : 'bg-l4/80 border border-bdrF border-l-2 border-l-agent-300 text-lt-aux'">
                <MarkdownView :content="thinkingContent" :is-dark="isDark" :is-streaming="isStreaming" :work-root="workRoot" @file-click="onMarkdownFileClick" />
              </div>
            </Transition>
          </div>
          <div v-if="showLoading" class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="loading-dots flex items-center gap-1">
                <span class="dot w-[6px] h-[6px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
                <span class="dot w-[6px] h-[6px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
                <span class="dot w-[6px] h-[6px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              </div>
              <span class="text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">思考中...</span>
            </div>
          </div>
          <div v-if="displayContent && !isError" class="px-4 py-3">
            <div class="text-[12px] leading-relaxed md-content"
              :class="[isDark ? 'text-wt-main' : 'text-lt-main', agent ? 'border-l-2 border-l-agent-400' : '']">
              <MarkdownView :content="mdContent" :is-dark="isDark" :is-streaming="isStreaming" :work-root="workRoot" @file-click="onMarkdownFileClick" @link-click="onMarkdownLinkClick" />
            </div>
            <span v-if="isCancelled" class="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium" :class="isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-500'">
              <i class="ri-stop-circle-line text-[10px]" /> 已停止
            </span>
            <span v-if="isStreaming" class="loading-dots inline-flex items-center gap-1.5 ml-1">
              <span class="dot w-[4px] h-[4px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              <span class="dot w-[4px] h-[4px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              <span class="dot w-[4px] h-[4px] rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            </span>
          </div>
          <div v-if="!displayContent && msg.content && !showLoading && !isError"
            class="px-4 py-3 text-[13px] leading-relaxed"
            :class="[isDark ? 'text-wt-main' : 'text-lt-main', agent ? 'border-l-2 border-l-agent-400' : '']">
            {{ msg.content }}
          </div>
        </template>

        <!-- Error -->
        <div v-if="isError" class="px-4 py-3 border-t" :class="isDark ? 'border-d4 bg-red-500/6' : 'border-bdrF bg-red-50/50'">
          <div class="flex items-center gap-2 mb-1">
            <i :class="[errorInfo.icon, 'text-[14px]', isDark ? 'text-red-400' : 'text-red-600']" />
            <span class="text-[13px] font-medium" :class="isDark ? 'text-red-400' : 'text-red-600'">{{ errorInfo.title }}</span>
            <span v-if="msg.errorCode" class="text-[10px] px-1.5 py-0.5 rounded" :class="isDark ? 'bg-red-500/12 text-red-400' : 'bg-red-100 text-red-500'">{{ msg.errorCode }}</span>
          </div>
          <p class="text-[12px] opacity-80" :class="isDark ? 'text-red-400' : 'text-red-600'">{{ displayErrorMessage }}</p>
          <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-lightbulb-line text-[10px]" /> {{ errorInfo.suggestion }}</p>
          <button @click="emit('retry')" class="mt-2 h-7 px-3 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5" :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
            <i class="ri-refresh-line text-[12px]" /> 重试
          </button>
        </div>
        <!-- Cancelled no content -->
        <div v-if="isCancelled && !displayContent && !hasSteps" class="px-4 py-3">
          <div class="flex items-center gap-1.5 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-stop-circle-line text-[12px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
            <span>已停止生成</span>
          </div>
        </div>
      </div>

      <!-- ══ Bottom actions bar ══ -->
      <MessageActionsBar
        :msg="msg" :is-dark="isDark"
        :is-assistant="isAssistant" :is-completed="isCompleted"
        :is-cancelled="isCancelled" :is-streaming-status="isStreamingStatus"
        :is-error="isError" :is-streaming="isStreaming"
        :has-content="!!(displayContent || hasSteps || isError)"
        :copied="copied"
        @copy-raw="copyRawMarkdown" @retry="emit('retry')"
        @delete="showDeleteConfirm = true"
        @compress-context="emit('compress-context')">
        <template #source-btn>
          <SourceRefBar v-if="kbSources.length" :kb-sources="kbSources" :is-dark="isDark" />
        </template>
        <template #copy-btn>
          <button @click="copyContent" title="复制"
            class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
            :class="copied ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
            <i :class="copied ? 'ri-check-line' : 'ri-file-copy-line'" class="text-[12px]" />
            <span v-if="copied">已复制</span>
          </button>
        </template>
        <template #delete-btn>
          <button @click="showDeleteConfirm = true" title="删除"
            class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-500'">
            <i class="ri-delete-bin-line text-[12px]" />
          </button>
        </template>
      </MessageActionsBar>

      <!-- File cards -->
      <div v-if="fileAttachments.length" class="flex flex-col gap-2 mt-2">
        <FileCard v-for="f in fileAttachments" :key="f.path" :file="f" :is-dark="isDark" @preview="emit('preview-file', f)" />
      </div>
      <MessageDeleteConfirm v-if="showDeleteConfirm" :is-dark="isDark" @confirm="confirmDelete" @cancel="showDeleteConfirm = false" />
    </div>
  </div>
</template>

<style scoped>
.md-content h1, .md-content h2, .md-content h3, .md-content h4 { font-weight: 700; margin: 0.6em 0 0.3em; }
.md-content h1 { font-size: 1.2em; }
.md-content h2 { font-size: 1.1em; }
.md-content h3 { font-size: 1.05em; }
.md-content p { margin: 0.4em 0; }
.md-content ul, .md-content ol { padding-left: 1.5em; margin: 0.4em 0; }
.md-content li { margin: 0.2em 0; }
.md-content code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.88em; padding: 2px 5px; border-radius: 4px; }
.md-content pre { border-radius: 8px; padding: 12px 16px; margin: 0.6em 0; overflow-x: auto; font-size: 0.85em; }
.md-content pre code { padding: 0; background: none; }
.md-content a { color: #6c8aff; cursor: pointer; }
.md-content a:hover { text-decoration: underline; }
/* kb:N citation links render as superscript pill tags */
.md-content a[href^="kb:"] {
  vertical-align: super;
  font-size: 10px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.14);
  color: #A78BFA;
  text-decoration: none;
  font-weight: 600;
  margin: 0 1px;
}
.md-content a[href^="kb:"]:hover {
  background: rgba(167, 139, 250, 0.14);
}
.md-content blockquote { border-left: 3px solid #6c8aff; padding-left: 12px; margin: 0.5em 0; opacity: 0.85; }
.md-content table { border-collapse: collapse; margin: 0.5em 0; }
.md-content th, .md-content td { border: 1px solid #353542; padding: 6px 10px; }
.md-content th { font-weight: 600; }
.md-content img { max-width: 100%; border-radius: 8px; }
.fade-up { animation: fadeUp 0.2s ease-out; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.loading-dots .dot { animation: dotPulse 1.4s ease-in-out infinite; }
.loading-dots .dot:nth-child(1) { animation-delay: 0s; }
.loading-dots .dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dots .dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes dotPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.thinking-slide-enter-active { transition: opacity 0.25s ease-out, transform 0.25s ease-out; }
.thinking-slide-leave-active { transition: opacity 0.15s ease-in, transform 0.15s ease-in; }
.thinking-slide-enter-from { opacity: 0; transform: translateY(-10px); }
.thinking-slide-leave-to { opacity: 0; transform: translateY(-10px); }
.animate-fade-in { animation: fadeIn 0.15s ease-out; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
