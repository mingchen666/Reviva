<script setup>
import { useAppStore } from '@/stores/app'
import { computed, ref, watch } from 'vue'
import ResizeHandle from './ResizeHandle.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  width: { type: Number, default: 260 },
  resizable: { type: Boolean, default: false },
  minWidth: { type: Number, default: 180 },
  maxWidth: { type: Number, default: 360 },
  collapsible: { type: Boolean, default: false },
  modelValue: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])

const currentWidth = ref(props.width)
const isCollapsed = ref(!props.modelValue)

watch(() => props.modelValue, (val) => {
  isCollapsed.value = !val
})

function onResize(delta) {
  const newWidth = Math.min(props.maxWidth, Math.max(props.minWidth, currentWidth.value + delta))
  currentWidth.value = newWidth
}

function toggle() {
  isCollapsed.value = !isCollapsed.value
  emit('update:modelValue', !isCollapsed.value)
}
</script>

<template>
  <!-- Collapsed strip -->
  <div
    v-if="isCollapsed && collapsible"
    class="w-[6px] shrink-0 cursor-pointer transition-colors"
    :class="isDark ? 'bg-d1 hover:bg-brand-400/20' : 'bg-l1 hover:bg-brand-50'"
    @click="toggle"
  />

  <!-- Expanded panel -->
  <template v-else>
    <div
      class="shrink-0 flex flex-col overflow-hidden relative"
      :class="isDark ? 'bg-d1' : 'bg-l1'"
      :style="{ width: currentWidth + 'px', borderRight: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }"
    >
      <slot />
    </div>
    <ResizeHandle v-if="resizable" side="left" @resize="onResize" />
  </template>
</template>
