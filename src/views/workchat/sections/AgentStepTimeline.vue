<script setup>
import { ref, computed } from 'vue'
import AgentStepCard from './AgentStepCard.vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  isDark: Boolean,
  isStreaming: Boolean,
})

const expanded = ref(true)

const stepCount = computed(() => props.steps.length)
const collapsedLabel = computed(() => `${stepCount} 步执行`)
const hasSteps = computed(() => stepCount > 0)

// Auto-collapse when streaming ends and steps exist
function onStreamEnd() {
  if (stepCount > 1) expanded.value = false
}

defineExpose({ onStreamEnd })
</script>

<template>
  <div v-if="hasSteps" class="agent-step-timeline">
    <!-- Toggle header -->
    <button @click="expanded = !expanded"
      class="flex items-center gap-2 text-[11px] font-medium transition-colors w-full"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
      <i :class="expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" class="text-[11px]" />
      <span>{{ expanded ? '执行步骤' : collapsedLabel }}</span>
      <span v-if="isStreaming" class="text-[10px] px-1.5 py-0.5 rounded"
        :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
        运行中
      </span>
    </button>
    <!-- Steps list -->
    <div v-if="expanded" class="mt-2 ml-2 space-y-1.5">
      <div v-for="(step, idx) in steps" :key="idx" class="flex items-stretch gap-2.5">
        <!-- Timeline connector -->
        <div class="flex flex-col items-center w-[18px] shrink-0">
          <div class="w-[8px] h-[8px] rounded-full mt-1"
            :class="step.type === 'tool_use'
              ? (isDark ? 'bg-sky-400' : 'bg-sky-500')
              : step.type === 'thinking'
                ? (isDark ? 'bg-agent-400' : 'bg-agent-500')
                : (isDark ? 'bg-brand-400' : 'bg-brand-500')" />
          <div v-if="idx < steps.length - 1" class="w-[1.5px] flex-1 mt-1"
            :class="isDark ? 'bg-d4' : 'bg-l4'" />
        </div>
        <!-- Step card -->
        <AgentStepCard :step="step" :iteration="step.iteration || idx + 1" :is-dark="isDark"
          :is-streaming="isStreaming && idx === steps.length - 1" />
      </div>
    </div>
  </div>
</template>