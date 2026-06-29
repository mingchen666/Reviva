<script setup>
import { computed } from 'vue'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  busySourceId: { type: String, default: '' },
  busyOcrSourceId: { type: String, default: '' },
  busyDeleteSourceId: { type: String, default: '' },
  ocrConfigured: { type: Boolean, default: false },
})

const emit = defineEmits(['reparse', 'run-ocr', 'delete'])

const sources = computed(() => props.sources)
const isDark = computed(() => props.isDark)
const busySourceId = computed(() => props.busySourceId)
const busyOcrSourceId = computed(() => props.busyOcrSourceId)
const busyDeleteSourceId = computed(() => props.busyDeleteSourceId)

function sourceIcon(source) {
  return source?.type === 'note' ? 'ri-sticky-note-line' : 'ri-file-text-line'
}

function sourceStatusLabel(source) {
  if (source?.parser_status === 'needs_ocr') return props.ocrConfigured ? '等待 OCR' : '待配置 OCR'
  if (source?.parser_status === 'ocr_queued') return 'OCR 排队'
  if (source?.parser_status === 'ocr_running') return 'OCR 中'
  if (source?.parser_status === 'ocr_failed') return 'OCR 失败'
  const value = source?.status
  const map = {
    ingested: '已解析',
    extracting: '解析中',
    changed: '已变更',
    pending: '待处理',
    failed: '失败',
  }
  return map[value] || value || '未知'
}

function statusClass(source, isDark) {
  if (source.status === 'ingested') {
    return isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
  }
  if (source.status === 'failed' || source.parser_status === 'ocr_failed') {
    return isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'
  }
  return isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'
}

function canReparse(source) {
  return source.type !== 'note' && !canRunOcr(source) && ['pending', 'failed', 'changed'].includes(source.status)
}

function canRunOcr(source) {
  return source.parser_status === 'ocr_failed'
}
</script>

<template>
  <section>
    <div class="flex items-center justify-between">
      <h2 class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">来源</h2>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ sources.length }}</span>
    </div>
    <div v-if="sources.length === 0" class="empty-row" :class="isDark ? 'border-d4 text-wt-dim' : 'border-bdrL text-lt-aux'">
      暂无来源
    </div>
    <div v-else class="mt-2 space-y-2">
      <div v-for="source in sources" :key="source.id" class="source-row" :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l3'">
        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-medium truncate flex items-center gap-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <i :class="sourceIcon(source)" class="text-[12px] shrink-0 opacity-70" />
            <span class="truncate">{{ source.title }}</span>
          </p>
          <p class="mt-1 text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ source.original_uri }}</p>
          <p v-if="source.parser_message" class="mt-1 text-[10px] line-clamp-2" :class="source.status === 'failed' ? (isDark ? 'text-red-300' : 'text-red-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
            {{ source.parser_message }}
          </p>
        </div>
        <div class="source-actions">
          <span class="status-pill" :class="statusClass(source, isDark)">
            {{ sourceStatusLabel(source) }}
          </span>
          <button
            v-if="canReparse(source)"
            class="reparse-btn"
            :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l3'"
            :disabled="!!busySourceId || !!busyOcrSourceId || !!busyDeleteSourceId"
            title="重新解析"
            @click="emit('reparse', source.id)">
            <i :class="busySourceId === source.id ? 'ri-loader-4-line pulse' : 'ri-refresh-line'" />
          </button>
          <button
            v-if="canRunOcr(source)"
            class="reparse-btn"
            :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l3'"
            :disabled="!!busySourceId || !!busyOcrSourceId || !!busyDeleteSourceId"
            title="重试 OCR"
            @click="emit('run-ocr', source.id)">
            <i :class="busyOcrSourceId === source.id ? 'ri-loader-4-line pulse' : 'ri-scan-2-line'" />
          </button>
          <button
            class="reparse-btn"
            :class="isDark ? 'text-wt-dim hover:text-red-300 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-600 hover:bg-red-50'"
            :disabled="!!busyDeleteSourceId"
            title="移除来源"
            @click="emit('delete', source)">
            <i :class="busyDeleteSourceId === source.id ? 'ri-loader-4-line pulse' : 'ri-delete-bin-6-line'" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.empty-row {
  margin-top: 8px;
  border-width: 1px;
  border-style: solid;
  border-radius: 8px;
  padding: 14px 12px;
  text-align: center;
  font-size: 12px;
}
.source-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-radius: 8px;
  padding: 8px 6px;
  transition: background-color 0.15s;
}
.source-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-pill {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 10px;
}
.reparse-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, color 0.15s;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@keyframes pulse {
  0%, 100% { opacity: 1 }
  50% { opacity: .5 }
}
.pulse { animation: pulse 1.4s ease-in-out infinite }
</style>
