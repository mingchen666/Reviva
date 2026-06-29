<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  msg: Object,
  isDark: Boolean,
})

const showDetail = ref(false)

// Model name from msg or meta
const modelName = computed(() => {
  return props.msg.modelId || props.msg.meta?.modelId || ''
})

// Iteration count from agentSteps in meta
const iterations = computed(() => {
  return props.msg.meta?.agentSteps?.length || 0
})

// Cost formatting (show ¥ for Chinese users, $ otherwise)
const costDisplay = computed(() => {
  const cost = props.msg.cost || 0
  if (cost === 0) return ''
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  return `$${cost.toFixed(4)}`
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 px-3 py-1.5 rounded-lg text-[11px] select-none"
    :class="isDark ? 'bg-d4/60' : 'bg-l4/60'">
    <!-- Model name -->
    <div v-if="modelName" class="flex items-center gap-1">
      <i class="ri-cpu-line text-[10px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ modelName }}</span>
    </div>
    <!-- Input -->
    <div class="flex items-center gap-1">
      <i class="ri-arrow-down-line text-[10px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
      <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">输入</span>
      <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ msg.inputTokens || 0 }}</span>
    </div>
    <!-- Output -->
    <div class="flex items-center gap-1">
      <i class="ri-arrow-up-line text-[10px]" :class="isDark ? 'text-output-400' : 'text-output-500'" />
      <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">输出</span>
      <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ msg.outputTokens || 0 }}</span>
    </div>
    <!-- Cache -->
    <div v-if="msg.cacheReadTokens" class="flex items-center gap-1">
      <i class="ri-flashlight-line text-[10px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
      <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">缓存</span>
      <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ msg.cacheReadTokens }}</span>
    </div>
    <!-- Iterations -->
    <div v-if="iterations > 1" class="flex items-center gap-1">
      <i class="ri-loop-left-line text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ iterations }} 步</span>
    </div>
    <!-- Latency -->
    <div v-if="msg.latencyMs" class="flex items-center gap-1">
      <i class="ri-timer-line text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ (msg.latencyMs / 1000).toFixed(1) }}s</span>
    </div>
    <!-- Cost -->
    <div v-if="costDisplay" class="flex items-center gap-1 ml-auto">
      <i class="ri-money-dollar-circle-line text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span class="font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ costDisplay }}</span>
    </div>
    <!-- Expand toggle -->
    <button v-if="msg.thinkingTokens || msg.cacheWriteTokens" @click="showDetail = !showDetail"
      class="h-5 w-5 rounded flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
      <i :class="showDetail ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[10px]" />
    </button>
    <!-- Detail row -->
    <template v-if="showDetail">
      <div v-if="msg.thinkingTokens" class="flex items-center gap-1 w-full">
        <i class="ri-brain-line text-[10px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
        <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">思考</span>
        <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ msg.thinkingTokens }}</span>
      </div>
      <div v-if="msg.cacheWriteTokens" class="flex items-center gap-1 w-full">
        <i class="ri-database-2-line text-[10px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
        <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">缓存写入</span>
        <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ msg.cacheWriteTokens }}</span>
      </div>
    </template>
  </div>
</template>