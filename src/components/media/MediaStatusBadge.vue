<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  mediaId: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})

const metadata = ref(null)
const error = ref('')
let pollTimer = null

const activeRun = computed(() => metadata.value?.activeRun || null)
const status = computed(() => {
  if (error.value) return { label: '状态异常', tone: 'error', icon: 'ri-error-warning-line' }
  const active = activeRun.value
  if (active?.status === 'queued') return { label: '排队中', tone: 'pending', icon: 'ri-time-line' }
  if (active?.status === 'running') return { label: props.compact ? `${active.progress || 0}%` : `解析中 ${active.progress || 0}%`, tone: 'running', icon: 'ri-loader-4-line' }
  if (!metadata.value?.run && metadata.value?.latestRun?.status === 'failed') return { label: '解析失败', tone: 'error', icon: 'ri-close-circle-line' }
  if (!metadata.value?.run) return { label: '未解析', tone: 'idle', icon: 'ri-circle-line' }
  if (metadata.value?.media?.contentAvailability === 'transcript_ready') return { label: '转录可读', tone: 'ready', icon: 'ri-checkbox-circle-line' }
  if (metadata.value?.media?.contentAvailability === 'visual_only') return { label: '画面可读', tone: 'partial', icon: 'ri-gallery-line' }
  return { label: '部分可用', tone: 'partial', icon: 'ri-information-line' }
})

function clearPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

async function load() {
  clearPoll()
  metadata.value = null
  error.value = ''
  if (!props.mediaId) return
  try {
    const result = await window.electronAPI?.media?.query?.({ mediaId: props.mediaId, mode: 'metadata' })
    if (!result?.success) throw new Error(result?.message || '状态读取失败')
    metadata.value = result
  } catch (err) {
    error.value = err?.message || '状态读取失败'
  }
  if (activeRun.value) pollTimer = setTimeout(load, 2500)
}

watch(() => props.mediaId, load, { immediate: true })
onBeforeUnmount(clearPoll)
</script>

<template>
  <span class="media-status" :class="[`media-status--${status.tone}`, { 'media-status--compact': compact }]" :title="status.label">
    <i :class="[status.icon, { 'animate-spin': status.tone === 'running' }]" />
    <span>{{ status.label }}</span>
  </span>
</template>

<style scoped>
.media-status { display: inline-flex; align-items: center; gap: 3px; min-height: 18px; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; }
.media-status--compact { padding-inline: 5px; }
.media-status--ready { color: #10b981; background: rgba(16,185,129,.09); border-color: rgba(16,185,129,.16); }
.media-status--running { color: #6c8aff; background: rgba(108,138,255,.1); border-color: rgba(108,138,255,.18); }
.media-status--pending,.media-status--partial { color: #f59e0b; background: rgba(245,158,11,.09); border-color: rgba(245,158,11,.16); }
.media-status--error { color: #ef4444; background: rgba(239,68,68,.08); border-color: rgba(239,68,68,.15); }
.media-status--idle { color: #94a3b8; background: rgba(148,163,184,.08); border-color: rgba(148,163,184,.14); }
</style>
