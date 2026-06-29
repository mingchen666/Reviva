<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  subAgent: Object,
  isDark: Boolean,
  isStreaming: Boolean,
})

const showDetails = ref(false)

const displayName = computed(() => {
  const name = String(props.subAgent?.name || '').trim()
  if (name === 'general-purpose') return '通用子任务'
  if (name === 'subagent') return '子任务'
  return name || '子智能体'
})

const statusLabel = computed(() => {
  if (props.subAgent.status === 'running') return '执行中'
  if (props.subAgent.status === 'completed') return '已完成'
  if (props.subAgent.status === 'error') return '失败'
  return '待执行'
})

const statusBadge = computed(() => {
  if (props.subAgent.status === 'running') return props.isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'
  if (props.subAgent.status === 'completed') return props.isDark ? 'bg-output-400/8 text-output-400' : 'bg-emerald-50 text-emerald-500'
  if (props.subAgent.status === 'error') return props.isDark ? 'bg-red-400/8 text-red-400' : 'bg-red-50 text-red-500'
  return props.isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'
})

const detailText = computed(() => {
  const parts = []
  if (props.subAgent?.task) parts.push(props.subAgent.task)
  if (props.subAgent?.result) parts.push(props.subAgent.result)
  if (props.subAgent?.error) parts.push(props.subAgent.error)
  return parts.join('\n\n')
})

const canToggleDetails = computed(() =>
  !!props.subAgent?.result ||
  !!props.subAgent?.error ||
  detailText.value.length > 120 ||
  detailText.value.includes('\n')
)
</script>

<template>
  <div class="px-3 py-2.5 rounded-lg"
    :class="isDark ? 'bg-purple-400/6 border border-purple-400/15' : 'bg-purple-50/60 border border-purple-100'">
    <!-- Header -->
    <div class="flex items-center gap-2">
      <div class="w-[18px] h-[18px] rounded-md flex items-center justify-center"
        :class="isDark ? 'bg-agent-400/12' : 'bg-agent-50'">
        <i class="ri-robot-2-line text-[11px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      </div>
      <span class="text-[12px] font-semibold" :class="isDark ? 'text-agent-400' : 'text-agent-500'">
        {{ displayName }}
      </span>
      <span class="text-[10px] px-1.5 py-0.5 rounded font-medium" :class="statusBadge">{{ statusLabel }}</span>
    </div>
    <!-- Task/result details -->
    <div v-if="detailText" class="mt-1.5 px-3 py-2 rounded-lg text-[11px] overflow-auto"
      :class="[
        isDark ? 'bg-d0 text-wt-dim' : 'bg-l1 text-lt-aux',
        showDetails ? 'max-h-[220px]' : 'max-h-[64px]'
      ]">
      <pre class="whitespace-pre-wrap leading-relaxed" :class="showDetails ? '' : 'subagent-clamp'">{{ detailText }}</pre>
    </div>
    <!-- Expand toggle -->
    <button v-if="canToggleDetails" @click="showDetails = !showDetails"
      class="mt-1 text-[10px] transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
      <i :class="showDetails ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[10px]" />
      {{ showDetails ? '收起详情' : '展开详情' }}
    </button>
  </div>
</template>

<style scoped>
.subagent-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
