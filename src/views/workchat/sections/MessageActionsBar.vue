<script setup>
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
})

const emit = defineEmits(['copy-raw', 'retry', 'delete', 'compress-context'])

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
    class="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
    <slot name="source-btn" />
    <div v-if="showTokenBar" class="flex items-center gap-2 text-[11px] select-none flex-1 min-w-0">
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
    <div class="ml-auto flex items-center gap-1 shrink-0">
      <button v-if="isAssistant && isCompleted" @click="$emit('compress-context')" title="压缩上下文"
        class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-amber-400' : 'text-lt-aux hover:text-amber-500'">
        <i class="ri-compress-line text-[12px]" />
      </button>
      <slot name="copy-btn" />
      <button v-if="isAssistant && isCompleted" @click="$emit('copy-raw')" title="复制源码"
        class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
        <i class="ri-markdown-line text-[12px]" />
      </button>
      <button v-if="isAssistant && isCompleted" @click="$emit('retry')" title="重试"
        class="h-6 px-1.5 rounded-md flex items-center gap-0.5 text-[11px] transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-brand-400' : 'text-lt-aux hover:text-brand-500'">
        <i class="ri-refresh-line text-[12px]" />
      </button>
      <slot name="delete-btn" class="text-[12px]"/>
    </div>
  </div>
</template>
