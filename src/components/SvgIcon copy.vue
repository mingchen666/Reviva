<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  color: { type: String, default: '' },
  className: { type: String, default: '' },
})

const svgPath = computed(() => {
  try {
    return new URL(`/src/assets/icons/${props.name}.svg`, import.meta.url).href
  } catch {
    return ''
  }
})
</script>

<template>
  <i
    v-if="name.startsWith('ri-')"
    :class="[name, className]"
    :style="{ fontSize: typeof size === 'number' ? `${size}px` : size, color: color || undefined }"
  />
  <img
    v-else
    :src="svgPath"
    :alt="name"
    :class="className"
    :style="{ width: typeof size === 'number' ? `${size}px` : size, height: typeof size === 'number' ? `${size}px` : size, color: color || undefined }"
  />
</template>
