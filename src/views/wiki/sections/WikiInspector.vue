<script setup>
import { computed } from 'vue'
import WikiSourcesPanel from './WikiSourcesPanel.vue'
import WikiOcrPanel from './WikiOcrPanel.vue'

const props = defineProps({
  wiki: { type: Object, default: null },
  agent: { type: Object, default: null },
  sources: { type: Array, default: () => [] },
  jobs: { type: Array, default: () => [] },
  ocrProviders: { type: Array, default: () => [] },
  ocrJobs: { type: Array, default: () => [] },
  reparseSourceId: { type: String, default: '' },
  ocrSourceId: { type: String, default: '' },
  deleteSourceId: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['configure-ocr', 'reparse-source', 'run-ocr', 'delete-source'])

const enabledOcrCount = computed(() =>
  props.ocrProviders.filter(item =>
    item.enabled !== false &&
    ['mineru', 'paddleocr'].includes(String(item.type || '').toLowerCase()) &&
    item.base_url &&
    item.api_key_ref
  ).length,
)

const sourceStats = computed(() => {
  const stats = { total: props.sources.length, ready: 0, processing: 0, waitingOcr: 0, failed: 0 }
  for (const source of props.sources) {
    if (source.status === 'ingested' && source.parser_status === 'complete') stats.ready += 1
    else if (['extracting'].includes(source.status) || ['pending', 'running', 'ocr_queued', 'ocr_running'].includes(source.parser_status)) stats.processing += 1
    else if (source.parser_status === 'needs_ocr') stats.waitingOcr += 1
    else if (source.status === 'failed' || ['failed', 'ocr_failed'].includes(source.parser_status)) stats.failed += 1
  }
  return stats
})

const activeJobs = computed(() => props.jobs.filter(job => ['pending', 'running'].includes(job.status)).length)

const statusText = computed(() => {
  if (!props.wiki) return '未选择 Wiki'
  if (props.agent?.status === 'running') return 'WikiAgent 正在整理知识页'
  if (activeJobs.value || sourceStats.value.processing) return '正在处理来源'
  if (sourceStats.value.waitingOcr) return enabledOcrCount.value ? 'OCR 正在等待队列' : '有来源需要配置 OCR'
  if (sourceStats.value.failed) return '有来源需要处理'
  if (sourceStats.value.ready) return '知识库已就绪'
  return '等待添加来源'
})
</script>

<template>
  <aside class="h-full flex flex-col" :class="isDark ? 'bg-d1' : 'bg-l1'">
    <div class="h-12 px-4 flex items-center gap-2.5 border-b" :class="isDark ? 'border-d4' : 'border-bdrL'">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'">
        <i class="ri-dashboard-3-line text-[14px]" />
      </div>
      <div>
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">知识库状态</span>
        <p class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">自动处理、来源、配置</p>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      <section class="rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 min-w-0">
          <i class="ri-loader-4-line text-[14px] shrink-0" :class="activeJobs || agent?.status === 'running' ? 'spin text-brand-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')" />
          <h2 class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ statusText }}</h2>
        </div>
        <p class="mt-1 text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">添加来源后会自动解析、OCR 和维护知识页</p>
        <div class="mt-3 grid grid-cols-4 gap-1.5">
          <div class="stat-mini" :class="isDark ? 'bg-d0' : 'bg-white'">
            <span class="text-[15px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ sourceStats.total }}</span>
            <span class="text-[9px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">来源</span>
          </div>
          <div class="stat-mini" :class="isDark ? 'bg-d0' : 'bg-white'">
            <span class="text-[15px] font-bold leading-none text-emerald-400">{{ sourceStats.ready }}</span>
            <span class="text-[9px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">就绪</span>
          </div>
          <div class="stat-mini" :class="isDark ? 'bg-d0' : 'bg-white'">
            <span class="text-[15px] font-bold leading-none" :class="sourceStats.processing ? 'text-amber-400' : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ sourceStats.processing }}</span>
            <span class="text-[9px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">处理中</span>
          </div>
          <div class="stat-mini" :class="isDark ? 'bg-d0' : 'bg-white'">
            <span class="text-[15px] font-bold leading-none" :class="(sourceStats.failed + sourceStats.waitingOcr) ? 'text-red-400' : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ sourceStats.failed + sourceStats.waitingOcr }}</span>
            <span class="text-[9px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">异常</span>
          </div>
        </div>
      </section>

      <WikiOcrPanel
        :providers="ocrProviders"
        :jobs="ocrJobs"
        :is-dark="isDark"
        @configure="emit('configure-ocr')"
      />

      <WikiSourcesPanel
        :sources="sources"
        :busy-source-id="reparseSourceId"
        :busy-ocr-source-id="ocrSourceId"
        :busy-delete-source-id="deleteSourceId"
        :ocr-configured="enabledOcrCount > 0"
        :is-dark="isDark"
        @reparse="emit('reparse-source', $event)"
        @run-ocr="emit('run-ocr', $event)"
        @delete="emit('delete-source', $event)"
      />
    </div>
  </aside>
</template>

<style scoped>
.stat-mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 8px 4px;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spin {
  animation: spin 1s linear infinite;
}
</style>
