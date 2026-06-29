<script setup>
import { useAppStore } from '@/stores/app'
import { computed } from 'vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  padding: { type: String, default: 'p-0' },
})

const classes = computed(() => [
  'flex-1 overflow-auto',
  isDark.value ? 'bg-d2' : 'bg-l2',
  props.padding,
])
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
