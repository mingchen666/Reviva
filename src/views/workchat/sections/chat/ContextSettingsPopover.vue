<script setup>
const props = defineProps({
  isDark: Boolean,
  contextLength: { type: Number, default: 30 },
  isCompressing: Boolean,
  isStreaming: Boolean,
})

const emit = defineEmits(['update-context-length', 'compress-context', 'close'])

function clickCompressContext() {
  if (props.isCompressing || props.isStreaming) return
  emit('compress-context')
}
</script>

<template>
  <div
    class="rounded-lg overflow-hidden"
    :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
    <div
      class="px-3 py-2.5 flex items-center justify-between"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">上下文设置</span>
      <button
        @click="emit('close')"
        class="h-5 w-5 rounded flex items-center justify-center transition-colors"
        :class="
          isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
        ">
        <i class="ri-close-line text-[12px]" />
      </button>
    </div>

    <div class="p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">上下文消息长度</span>
        <span class="text-[11px] font-semibold tabular-nums" :class="isDark ? 'text-brand-400' : 'text-brand-500'">
          {{ contextLength }}
        </span>
      </div>
      <input
        type="range"
        :value="contextLength"
        min="0"
        max="50"
        step="1"
        @input="emit('update-context-length', Number($event.target.value))"
        class="w-full h-1.5 rounded-full appearance-none cursor-pointer ctx-range"
        :class="isDark ? 'bg-d4' : 'bg-l4'" />
      <p class="text-[11px] mt-2 mb-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">超出时自动压缩早期上下文</p>
      <button
        @click="clickCompressContext"
        :disabled="isCompressing || isStreaming"
        class="w-full h-8 rounded-lg flex items-center justify-center gap-1.5 text-[12px] font-medium transition-colors"
        :class="
          isCompressing
            ? isDark
              ? 'bg-agent-400/12 text-agent-400'
              : 'bg-agent-50 text-agent-500'
            : isDark
              ? 'bg-amber-400/12 text-amber-400 hover:bg-amber-400/20'
              : 'bg-amber-50 text-amber-500 hover:bg-amber-100'
        ">
        <i
          :class="isCompressing ? 'ri-loader-4-line' : 'ri-compress-line'"
          class="text-[12px]"
          :style="isCompressing ? 'animation:spin 1s linear infinite' : ''" />
        {{ isCompressing ? '压缩中...' : '手动压缩上下文' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ctx-range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #6c8aff;
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
</style>
