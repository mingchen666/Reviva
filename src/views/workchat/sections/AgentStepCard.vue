<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  step: Object,
  iteration: Number,
  isDark: Boolean,
  isStreaming: Boolean,
})

const showDetails = ref(false)

const typeLabel = computed(() => {
  const t = props.step.type
  if (t === 'tool_use') return '工具调用'
  if (t === 'thinking') return '思考'
  if (t === 'sub_agent') return '子智能体'
  return '文本回复'
})

const typeIcon = computed(() => {
  const t = props.step.type
  if (t === 'tool_use') return 'ri-tools-line'
  if (t === 'thinking') return 'ri-brain-line'
  if (t === 'sub_agent') return 'ri-robot-line'
  return 'ri-chat-smile-2-line'
})

const typeBadge = computed(() => {
  const t = props.step.type
  if (t === 'tool_use') return props.isDark ? 'bg-sky-400/8 text-sky-400' : 'bg-sky-50 text-sky-500'
  if (t === 'thinking') return props.isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'
  if (t === 'sub_agent') return props.isDark ? 'bg-purple-400/8 text-purple-400' : 'bg-purple-50 text-purple-500'
  return props.isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500'
})

const toolNames = computed(() => {
  return props.step.toolCalls || []
})

const hasToolNames = computed(() => toolNames.value.length > 0)

const statusIcon = computed(() => {
  if (props.isStreaming) return 'ri-loader-4-line'
  const reason = props.step.stopReason
  if (reason === 'end_turn') return 'ri-check-line'
  if (reason === 'max_tokens') return 'ri-alert-line'
  return 'ri-check-line'
})
</script>

<template>
  <div class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg"
    :class="isDark ? 'bg-d4/50' : 'bg-l4/50'">
    <div class="flex items-center gap-2">
      <!-- Iteration badge -->
      <span class="text-[10px] font-bold px-1 py-0.5 rounded"
        :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">#{{ iteration }}</span>
      <!-- Type badge -->
     <i 
  :class="[
    typeIcon,
    'text-[11px]',
    isDark ? 'text-wt-dim' : 'text-lt-aux'
  ]" 
/>
      <span class="text-[10px] px-1.5 py-0.5 rounded font-medium" :class="typeBadge">{{ typeLabel }}</span>
      <!-- Tool names -->
      <template v-if="hasToolNames">
        <span v-for="name in toolNames" :key="name"
          class="text-[10px] px-1 py-0.5 rounded"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux'">{{ name }}</span>
      </template>
      <!-- Status -->
     <i 
  :class="[
    statusIcon,
    'text-[10px]',
    'ml-auto',
    isStreaming 
      ? (isDark ? 'text-agent-400' : 'text-agent-500') 
      : (isDark ? 'text-wt-dim' : 'text-lt-aux')
  ]"
  :style="isStreaming ? 'animation:spin 1s linear infinite' : ''"
/>
    </div>
    <!-- Expandable details -->
    <div v-if="showDetails && step.usage" class="mt-1.5 text-[10px] flex items-center gap-2"
      :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <span v-if="step.usage.inputTokens">输入 {{ step.usage.inputTokens }}</span>
      <span v-if="step.usage.outputTokens">输出 {{ step.usage.outputTokens }}</span>
    </div>
    <!-- Expand toggle -->
    <button v-if="step.usage || hasToolNames" @click="showDetails = !showDetails"
      class="mt-0.5 text-[10px] transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
      {{ showDetails ? '收起' : '详情' }}
    </button>
  </div>
</template>

<style scoped>
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
</style>