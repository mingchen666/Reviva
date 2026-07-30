<script setup>
import { ref } from 'vue'
import { useDraggable } from '@vueuse/core'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const accentHex = computed(() => settingsStore.currentAccentHex)
const isDark = computed(() => appStore.isDark)
const props = defineProps({
  side: { type: String, default: 'left' },
})

const emit = defineEmits(['resize'])

const handleRef = ref()
let lastX = 0

const { x, isDragging } = useDraggable(handleRef, {
  axis: 'x',
  initialValue: { x: 0, y: 0 },
  onStart(pos) {
    lastX = pos.x
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  },
  onMove(pos) {
    const deltaX = pos.x - lastX
    lastX = pos.x
    const dir = props.side === 'left' ? 1 : -1
    emit('resize', deltaX * dir)
  },
  onEnd() {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    x.value = 0
  },
})
</script>

<template>
  <div ref="handleRef"
    class="w-[5px] shrink-0 cursor-col-resize relative z-10 "
    :class="isDark ? '':'bg-l0'">
    <div
      class="absolute inset-y-0 left-0 w-[5px] rounded-sm transition-colors duration-150"
      :style="{ backgroundColor: isDragging ? accentHex : 'transparent' }"
    />
  </div>
  <!-- rgba(108,138,255,0.4) -->
</template>