<script setup>
import { computed } from 'vue'

const props = defineProps({
  isCompressing: Boolean,
  isStreaming: Boolean,
  isDark: Boolean,
})

const emit = defineEmits(['compress'])

const disabled = computed(() => props.isCompressing || props.isStreaming)
</script>

<template>
  <button @click="emit('compress')" :disabled="disabled"
    class="h-7 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all"
    :class="[
      disabled
        ? (isDark ? 'text-wt-dim opacity-50' : 'text-lt-aux opacity-50')
        : (isDark ? 'text-agent-400 hover:bg-agent-400/12' : 'text-agent-500 hover:bg-agent-50'),
      isCompressing ? 'pulse-compress' : '',
    ]">
    <i :class="isCompressing ? 'ri-loader-4-line' : 'ri-compress-line'"
      class="text-[12px]"
      :style="isCompressing ? 'animation:spin 1s linear infinite' : ''" />
    {{ isCompressing ? '压缩中...' : '压缩上下文' }}
  </button>
</template>

<style scoped>
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.pulse-compress { animation: pulse-glow 2s ease-in-out infinite; }
@keyframes pulse-glow { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }
</style>