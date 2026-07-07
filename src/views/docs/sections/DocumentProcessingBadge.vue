<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const visible = computed(() => !!props.status?.label)

const icon = computed(() => {
  const map = {
    ready: 'ri-check-line',
    running: 'ri-loader-4-line',
    warning: 'ri-error-warning-line',
    pending: 'ri-time-line',
    future: 'ri-time-line',
    error: 'ri-close-circle-line',
  }
  return map[props.status?.tone] || 'ri-information-line'
})

const toneClass = computed(() => {
  const tone = props.status?.tone || 'pending'
  if (tone === 'ready') {
    return props.isDark
      ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20'
      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
  }
  if (tone === 'warning') {
    return props.isDark
      ? 'bg-amber-400/10 text-amber-300 border-amber-400/20'
      : 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (tone === 'error') {
    return props.isDark
      ? 'bg-red-400/10 text-red-300 border-red-400/20'
      : 'bg-red-50 text-red-600 border-red-200'
  }
  if (tone === 'future') {
    return props.isDark
      ? 'bg-violet-400/10 text-violet-300 border-violet-400/20'
      : 'bg-violet-50 text-violet-600 border-violet-200'
  }
  return props.isDark
    ? 'bg-white/5 text-wt-dim border-white/10'
    : 'bg-l4 text-lt-aux border-bdrF'
})
</script>

<template>
  <span
    v-if="visible"
    class="processing-badge"
    :class="[toneClass, compact ? 'processing-badge--compact' : '']"
    :title="status.detail || status.label">
    <i :class="[icon, status.tone === 'running' ? 'processing-badge__spin' : '']" />
    <span>{{ status.label }}</span>
  </span>
</template>

<style scoped>
.processing-badge {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  border: 1px solid;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.processing-badge--compact {
  max-width: 100%;
}

.processing-badge--compact span {
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes processing-spin {
  to { transform: rotate(360deg); }
}

.processing-badge__spin {
  animation: processing-spin 1s linear infinite;
}
</style>
