<script setup>
import { useAppStore } from '@/stores/app'
import { computed, ref, watch } from 'vue'
import ResizeHandle from './ResizeHandle.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  width: { type: Number, default: 320 },
  closable: { type: Boolean, default: true },
  resizable: { type: Boolean, default: false },
  minWidth: { type: Number, default: 240 },
  maxWidth: { type: Number, default: 420 },
  modelValue: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])

const currentWidth = ref(props.width)
const isVisible = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  isVisible.value = val
})

function onResize(delta) {
  const newWidth = Math.min(props.maxWidth, Math.max(props.minWidth, currentWidth.value + delta))
  currentWidth.value = newWidth
}

function close() {
  isVisible.value = false
  emit('update:modelValue', false)
}
</script>

<template>
  <template v-if="isVisible">
    <ResizeHandle v-if="resizable" side="right" @resize="onResize" />
    <div
      class="shrink-0 flex flex-col overflow-hidden"
      :class="isDark ? 'bg-d1' : 'bg-l1'"
      :style="{ width: currentWidth + 'px', borderLeft: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }"
    >
      <!-- Close button -->
      <div v-if="closable" class="flex items-center justify-end px-2 py-1.5 shrink-0">
        <button
          class="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          @click="close"
        >
          <i class="ri-side-bar-line text-[14px]" />
        </button>
      </div>
      <slot />
    </div>
  </template>
</template>
