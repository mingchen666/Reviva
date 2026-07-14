<script setup>
import { computed, ref } from 'vue'
import MessageOutputMenu from './chat/MessageOutputMenu.vue'

const props = defineProps({
  msg: Object,
  isDark: Boolean,
  agent: { type: Object, default: null },
  isAssistant: Boolean,
  isCompleted: Boolean,
  isCancelled: Boolean,
  isStreamingStatus: Boolean,
  isError: Boolean,
  isStreaming: Boolean,
  hasContent: Boolean,
  copied: Boolean,
  branching: Boolean,
  exporting: Boolean,
})

const emit = defineEmits([
  'copy-raw', 'export-markdown', 'save-to-note',
  'retry', 'branch', 'delete', 'compress-context',
])

const outputMenuOpen = ref(false)

const showTokenBar = computed(() =>
  (props.msg.status === 'completed' || props.msg.status === 'cancelled' || props.msg.status === 'streaming') &&
  (props.msg.inputTokens || props.msg.outputTokens || props.msg.cacheReadTokens || props.msg.cacheWriteTokens || props.msg.thinkingTokens || props.msg.latencyMs || props.msg.cost)
)

const cacheTokens = computed(() => (props.msg.cacheReadTokens || 0) + (props.msg.cacheWriteTokens || 0))

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

const latencyDisplay = computed(() => {
  const ms = props.msg.latencyMs || 0
  if (!ms) return ''
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's'
})

const costDisplay = computed(() => {
  const cost = props.msg.cost || 0
  if (!cost) return ''
  return cost < 0.01 ? '$' + cost.toFixed(4) : '$' + cost.toFixed(2)
})
</script>

<template>
  <div v-if="(isCompleted || isCancelled || isStreamingStatus || isError) && !isStreaming && hasContent"
    class="flex items-center gap-2 mt-1.5 transition-opacity duration-150"
    :class="outputMenuOpen
      ? 'opacity-100 pointer-events-auto'
      : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'">
    <slot name="source-btn" />
    <div v-if="showTokenBar" class="flex items-center gap-2 text-[11px] select-none flex-1 min-w-0 overflow-hidden">
      <template v-if="showTokenBar">
        <div class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-arrow-down-line text-[10px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fmt(msg.inputTokens || 0) }}</span>
        </div>
        <div class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-arrow-up-line text-[10px]" :class="isDark ? 'text-output-400' : 'text-output-500'" />
          <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fmt(msg.outputTokens || 0) }}</span>
        </div>
        <div v-if="cacheTokens" class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-database-2-line text-[10px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
          <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fmt(cacheTokens) }}</span>
        </div>
        <div v-if="msg.thinkingTokens" class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-brain-line text-[10px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
          <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fmt(msg.thinkingTokens) }}</span>
        </div>
        <div v-if="latencyDisplay" class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-timer-line text-[10px]" />
          <span>{{ latencyDisplay }}</span>
        </div>
        <div v-if="costDisplay" class="flex items-center gap-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-money-dollar-circle-line text-[10px]" />
          <span>{{ costDisplay }}</span>
        </div>
      </template>
    </div>
    <div class="ml-auto flex items-center gap-0 shrink-0">
      <button v-if="isAssistant && isCompleted" @click="$emit('compress-context')" title="压缩上下文"
        aria-label="压缩上下文"
        class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
        :class="isDark ? 'text-white/65 hover:text-amber-400 hover:bg-white/6' : 'text-lt-aux hover:text-amber-500 hover:bg-l4'">
        <i class="ri-compress-line text-[14px]" />
      </button>
      <slot name="copy-btn" />
<<<<<<< HEAD
<<<<<<< HEAD
      <button v-if="isAssistant && isCompleted" @click="$emit('copy-raw')" title="复制MD"
        class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
        <i class="ri-markdown-line text-[12px]" />
=======
=======
>>>>>>> dev
      <button v-if="isAssistant && isCompleted" @click="$emit('copy-raw')" title="复制 Markdown"
        aria-label="复制 Markdown"
        class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
        :class="copied ? (isDark ? 'text-brand-400 bg-brand-400/8' : 'text-brand-500 bg-brand-50') : (isDark ? 'text-white/65 hover:text-white hover:bg-white/6' : 'text-lt-aux hover:text-lt-main hover:bg-l4')">
        <i :class="copied ? 'ri-check-line' : 'ri-markdown-line'" class="text-[14px]" />
        <span v-if="copied">已复制</span>
<<<<<<< HEAD
>>>>>>> dev
=======
>>>>>>> dev
      </button>
      <button v-if="isAssistant && isCompleted" @click="$emit('retry')" title="重试"
        aria-label="重试"
        class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors"
        :class="isDark ? 'text-white/65 hover:text-brand-400 hover:bg-white/6' : 'text-lt-aux hover:text-brand-500 hover:bg-l4'">
        <i class="ri-refresh-line text-[14px]" />
      </button>
      <slot name="delete-btn" />
      <MessageOutputMenu
        v-if="isAssistant && isCompleted"
        :is-dark="isDark"
        :exporting="exporting"
        :branching="branching"
        @open-change="outputMenuOpen = $event"
        @branch="$emit('branch')"
        @export-markdown="$emit('export-markdown')"
        @save-to-note="$emit('save-to-note')"
      />
    </div>
  </div>
</template>
