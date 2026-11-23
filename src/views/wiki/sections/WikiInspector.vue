<script setup>
import { computed, ref, useId, watch } from 'vue'
import WikiSourcesPanel from './WikiSourcesPanel.vue'
import WikiOcrPanel from './WikiOcrPanel.vue'

const props = defineProps({
  wiki: { type: Object, default: null },
  agent: { type: Object, default: null },
  sources: { type: Array, default: () => [] },
  jobs: { type: Array, default: () => [] },
  maintaining: { type: Boolean, default: false },
  ocrProviders: { type: Array, default: () => [] },
  ocrJobs: { type: Array, default: () => [] },
  reparseSourceId: { type: String, default: '' },
  ocrSourceId: { type: String, default: '' },
  deleteSourceId: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
  initialTab: { type: String, default: 'status' },
  reviewCount: { type: Number, default: 0 },
})

const emit = defineEmits(['configure-ocr', 'reparse-source', 'run-ocr', 'delete-source', 'open-media', 'view-source-extract', 'run-maintenance', 'close', 'tab-change'])

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
const latestMaintenance = computed(() => [...props.jobs]
  .filter(job => job.type === 'wiki_agent')
  .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0] || null)
const maintenanceMeta = computed(() => latestMaintenance.value?.meta || {})
const maintenanceReasons = computed(() => maintenanceMeta.value.failure_reasons?.length
  ? maintenanceMeta.value.failure_reasons
  : (['failed', 'incomplete', 'skipped'].includes(latestMaintenance.value?.status) ? [latestMaintenance.value.message].filter(Boolean) : []))
const maintenanceStatus = computed(() => ({ running: '维护中', completed: '维护完成', failed: '维护失败', incomplete: '维护不完整', skipped: '维护未运行' }[latestMaintenance.value?.status] || '尚未维护'))

const statusText = computed(() => {
  if (!props.wiki) return '未选择 Wiki'
  if (props.agent?.status === 'running') return 'WikiAgent 正在整理知识页'
  if (props.agent?.status === 'failed') return 'WikiAgent 维护失败'
  if (props.agent?.status === 'incomplete') return '知识页维护不完整'
  if (activeJobs.value || sourceStats.value.processing) return '正在处理来源'
  if (sourceStats.value.waitingOcr) return enabledOcrCount.value ? 'OCR 正在等待队列' : '有来源需要配置 OCR'
  if (sourceStats.value.failed) return '有来源需要处理'
  if (sourceStats.value.ready) return '知识库已就绪'
  return '等待添加来源'
})
const statusTone = computed(() => {
  if (!props.wiki) return 'neutral'
  if (props.agent?.status === 'running') return 'running'
  if (props.agent?.status === 'failed') return 'error'
  if (props.agent?.status === 'incomplete') return 'warning'
  if (activeJobs.value || sourceStats.value.processing) return 'running'
  if (sourceStats.value.waitingOcr) return 'warning'
  if (sourceStats.value.failed) return 'error'
  return sourceStats.value.ready ? 'success' : 'neutral'
})

const tabs = [
  { value: 'status', label: '状态', icon: 'ri-dashboard-3-line' },
  { value: 'review', label: '审核', icon: 'ri-inbox-archive-line' },
  { value: 'checks', label: '检查', icon: 'ri-shield-check-line' },
]
const normalizeTab = value => tabs.some(tab => tab.value === value) ? value : 'status'
const activeTab = ref(normalizeTab(props.initialTab))
const tabId = useId()
watch(() => props.initialTab, value => { activeTab.value = normalizeTab(value) })
watch(() => props.wiki?.id, () => { activeTab.value = normalizeTab(props.initialTab) })
const busy = computed(() => props.maintaining || props.agent?.status === 'running')
const maintenanceTone = computed(() => busy.value ? 'running' : ({ completed: 'success', failed: 'error', incomplete: 'warning' }[latestMaintenance.value?.status] || 'neutral'))
const maintenanceIcon = computed(() => busy.value ? 'ri-loader-4-line spin' : ({ completed: 'ri-checkbox-circle-line', failed: 'ri-error-warning-line', incomplete: 'ri-error-warning-line' }[latestMaintenance.value?.status] || 'ri-robot-2-line'))
function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function selectTab(value) {
  activeTab.value = value
  emit('tab-change', value)
}
function moveTab(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const current = tabs.findIndex(tab => tab.value === activeTab.value)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  selectTab(tabs[next].value)
  event.currentTarget.querySelector(`[data-tab="${activeTab.value}"]`)?.focus()
}
</script>

<template>
  <aside class="wiki-inspector-content" :class="{ 'is-dark': isDark }">
    <header class="inspector-heading">
      <div class="wiki-mark"><i class="ri-book-open-line" /></div>
      <div class="heading-copy">
        <span class="eyebrow">知识库管理</span>
        <h2 :title="wiki?.name">{{ wiki?.name || 'Wiki' }}</h2>
      </div>
      <button class="icon-button" aria-label="关闭知识库抽屉" @click="emit('close')"><i class="ri-close-line" /></button>
    </header>

    <div class="inspector-tabs" role="tablist" aria-label="知识库管理" @keydown="moveTab">
      <button v-for="tab in tabs" :id="`${tabId}-${tab.value}-tab`" :key="tab.value" :data-tab="tab.value"
        role="tab" :aria-selected="activeTab === tab.value" :aria-controls="`${tabId}-${tab.value}-panel`"
        :tabindex="activeTab === tab.value ? 0 : -1" :class="{ active: activeTab === tab.value }" @click="selectTab(tab.value)">
        <i :class="tab.icon" />{{ tab.label }}
        <span v-if="tab.value === 'review' && reviewCount" class="tab-count">{{ reviewCount }}</span>
      </button>
    </div>

    <div v-if="activeTab === 'status'" :id="`${tabId}-status-panel`" role="tabpanel" :aria-labelledby="`${tabId}-status-tab`" class="inspector-body" tabindex="0">
      <section class="maintenance-card">
        <div class="section-heading">
          <div><h3>WikiAgent 维护</h3><p class="muted">将已解析来源整理为可引用的知识页</p></div>
          <button class="action-button primary" :disabled="busy || !wiki" @click="emit('run-maintenance')">
            <i :class="busy ? 'ri-loader-4-line spin' : 'ri-play-line'" />{{ busy ? '维护中' : '立即维护' }}
          </button>
        </div>
        <div class="maintenance-state" :class="maintenanceTone" role="status">
          <i :class="maintenanceIcon" />
          <span>{{ busy ? '正在整理知识页' : maintenanceStatus }}</span>
          <time v-if="latestMaintenance" :datetime="latestMaintenance.updated_at">{{ formatDate(latestMaintenance.updated_at || latestMaintenance.created_at) }}</time>
        </div>
        <div v-if="maintenanceMeta.source_count !== undefined" class="maintenance-metrics">
          <div><strong class="metric-info">{{ maintenanceMeta.generated_page_count || 0 }}</strong><span>生成 / 更新页</span></div>
          <div><strong class="metric-info">{{ maintenanceMeta.source_count }}</strong><span>处理来源</span></div>
          <div><strong :class="maintenanceMeta.applied_count ? 'metric-success' : 'metric-muted'">{{ maintenanceMeta.applied_count || 0 }}<small> / {{ maintenanceMeta.proposal_count || 0 }}</small></strong><span>已应用提案</span></div>
        </div>
        <p v-else class="muted empty-hint">{{ busy ? '正在读取来源并准备页面提案，结果会在完成后更新。' : '添加来源后会自动维护，也可手动发起整理。' }}</p>
        <div v-if="maintenanceReasons.length" class="maintenance-notice" :class="maintenanceTone">
          <span class="notice-label"><i class="ri-information-line" />{{ maintenanceTone === 'error' ? '维护遇到问题' : '仍有内容需要处理' }}</span>
          <p>{{ maintenanceReasons[0] }}</p>
          <details v-if="maintenanceReasons.length > 1"><summary>查看其余 {{ maintenanceReasons.length - 1 }} 项原因</summary><ul><li v-for="reason in maintenanceReasons.slice(1)" :key="reason">{{ reason }}</li></ul></details>
          <p v-if="maintenanceReasons.some(reason => /429|rate.limit|tpm\/rpm/i.test(reason))">模型服务限流，请稍后重试或在 WikiAgent 设置中切换模型。</p>
        </div>
        <p v-if="maintenanceMeta.fallback_summary_count" class="muted"><b class="metric-warning">{{ maintenanceMeta.fallback_summary_count }}</b> 个占位摘要尚待正式整理。</p>
        <button v-if="maintenanceMeta.high_risk_count || maintenanceMeta.auto_apply_failed_count" class="review-link" @click="selectTab('review')">
          查看待处理提案 <i class="ri-arrow-right-line" />
        </button>
        <details v-if="latestMaintenance && (maintenanceMeta.generated_page_paths?.length || maintenanceMeta.tool_errors?.length || maintenanceMeta.proposal_count !== undefined)" class="run-details">
          <summary>本次维护明细</summary>
          <p class="muted">高风险 <b :class="maintenanceMeta.high_risk_count ? 'metric-warning' : 'metric-muted'">{{ maintenanceMeta.high_risk_count || 0 }}</b> · 自动应用失败 <b :class="maintenanceMeta.auto_apply_failed_count ? 'metric-error' : 'metric-muted'">{{ maintenanceMeta.auto_apply_failed_count || 0 }}</b> · 工具调用 <b class="metric-info">{{ maintenanceMeta.tool_call_count || 0 }}</b></p>
          <ul v-if="maintenanceMeta.generated_page_paths?.length" class="path-list"><li v-for="pagePath in maintenanceMeta.generated_page_paths" :key="pagePath">{{ pagePath }}</li></ul>
          <p v-for="(issue, index) in maintenanceMeta.tool_errors || []" :key="index" class="tool-error">{{ issue.action }}：{{ issue.error }}</p>
        </details>
      </section>

      <section class="status-section">
        <div class="section-heading"><h3>来源与解析</h3><span class="muted">{{ sourceStats.total }} 个来源</span></div>
        <p class="source-status" :class="statusTone"><i :class="activeJobs || busy ? 'ri-loader-4-line spin' : 'ri-information-line'" />{{ statusText }}</p>
        <div class="source-counts">
          <span class="metric-success"><b>{{ sourceStats.ready }}</b> 已解析</span>
          <span class="metric-info"><b>{{ sourceStats.processing }}</b> 处理中</span>
          <span class="metric-warning"><b>{{ sourceStats.failed + sourceStats.waitingOcr }}</b> 待处理</span>
        </div>
        <details class="secondary-details">
          <summary>来源文件 <i class="ri-arrow-down-s-line" /></summary>
          <WikiSourcesPanel :sources="sources" :busy-source-id="reparseSourceId" :busy-ocr-source-id="ocrSourceId" :busy-delete-source-id="deleteSourceId" :ocr-configured="enabledOcrCount > 0" :is-dark="isDark"
            @reparse="emit('reparse-source', $event)" @run-ocr="emit('run-ocr', $event)" @open-media="emit('open-media', $event)" @delete="emit('delete-source', $event)" @view-extract="emit('view-source-extract', $event)" />
        </details>
        <details class="secondary-details">
          <summary><span>OCR 与版面解析 <small><b :class="enabledOcrCount ? 'metric-success' : 'metric-muted'">{{ enabledOcrCount }}</b> 个服务可用</small></span><i class="ri-arrow-down-s-line" /></summary>
          <WikiOcrPanel :providers="ocrProviders" :jobs="ocrJobs" :is-dark="isDark" @configure="emit('configure-ocr')" />
        </details>
      </section>

    </div>
    <div v-else-if="activeTab === 'review'" :id="`${tabId}-review-panel`" role="tabpanel" :aria-labelledby="`${tabId}-review-tab`" class="inspector-body" tabindex="0">
      <slot name="review" />
    </div>
    <div v-else :id="`${tabId}-checks-panel`" role="tabpanel" :aria-labelledby="`${tabId}-checks-tab`" class="inspector-body" tabindex="0">
      <slot name="checks" />
    </div>
  </aside>
</template>

<style scoped>
.wiki-inspector-content { height: 100%; display: flex; flex-direction: column; min-width: 0; background: var(--ui-bg-1); color: var(--ui-text-main); font-size: 12px; }
.wiki-inspector-content { --wiki-info: var(--ui-brand-600); --wiki-success: #047857; --wiki-warning: #b45309; --wiki-error: #b91c1c; }
.wiki-inspector-content.is-dark { --wiki-info: var(--ui-brand-400); --wiki-success: #6ee7b7; --wiki-warning: #fcd34d; --wiki-error: #fca5a5; }
.inspector-heading { display: flex; align-items: center; gap: 12px; padding: 22px 24px 18px; }
.wiki-mark { width: 36px; height: 36px; border: 1px solid var(--ui-border-card); border-radius: 10px; display: grid; place-items: center; color: var(--ui-brand-500); font-size: 18px; }
.heading-copy { flex: 1; min-width: 0; }
.eyebrow { font-size: 11px; color: var(--ui-text-aux); }
h2 { margin: 3px 0 0; font-size: 16px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-button { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px; font-size: 20px; color: var(--ui-text-aux); }
.icon-button:hover { background: var(--ui-bg-3); color: var(--ui-text-main); }
.inspector-tabs { display: flex; gap: 24px; padding: 0 24px; border-bottom: 1px solid var(--ui-border-panel); }
.inspector-tabs button { display: flex; align-items: center; gap: 8px; position: relative; padding: 12px 2px; font-size: 13px; font-weight: 550; color: var(--ui-text-aux); }
.inspector-tabs button.active { color: var(--ui-brand-500); }
.inspector-tabs button.active::after { content: ''; position: absolute; bottom: -1px; height: 2px; left: 0; right: 0; background: currentColor; border-radius: 2px; }
.tab-count { background: color-mix(in srgb, var(--wiki-warning) 12%, var(--ui-bg-1)); color: var(--wiki-warning); padding: 0 6px; border-radius: 5px; font-size: 11px; font-variant-numeric: tabular-nums; }
.inspector-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 26px; }
.maintenance-card { padding: 18px; border: 1px solid var(--ui-border-card); border-radius: 12px; background: var(--ui-bg-2); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { margin: 0; font-size: 13px; font-weight: 650; }
.muted { margin: 5px 0 0; color: var(--ui-text-aux); font-size: 11px; line-height: 1.7; }
.action-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 0 10px; border: 1px solid var(--ui-border-card); border-radius: 7px; color: var(--ui-text-sub); font-size: 12px; white-space: nowrap; flex-shrink: 0; transition: background-color .15s; }
.action-button:hover { background: var(--ui-bg-3); }
.action-button.primary { background: var(--ui-brand-500); border-color: transparent; color: white; }
.action-button.primary:hover { background: var(--ui-brand-600); }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: 3px; }
.maintenance-state { display: flex; align-items: center; gap: 6px; margin-top: 22px; font-size: 12px; color: var(--ui-text-sub); }
.maintenance-state time { margin-left: auto; color: var(--ui-text-aux); font-size: 10px; }
.maintenance-state.success, .source-status.success { color: var(--wiki-success); }
.maintenance-state.error, .source-status.error { color: var(--wiki-error); }
.maintenance-state.warning, .source-status.warning { color: var(--wiki-warning); }
.maintenance-state.running, .source-status.running { color: var(--wiki-info); }
.maintenance-state > span { padding: 3px 8px; border-radius: 5px; background: color-mix(in srgb, currentColor 9%, var(--ui-bg-2)); font-weight: 600; }
.maintenance-metrics { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 10px; margin: 16px 0; }
.maintenance-metrics > div { display: flex; flex-direction: column; gap: 5px; }
.maintenance-metrics strong { font-size: 25px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.maintenance-metrics small { font-size: 14px; color: var(--ui-text-aux); font-weight: 400; }
.maintenance-metrics span { font-size: 11px; color: var(--ui-text-aux); }
.empty-hint { padding: 8px 0; }
.maintenance-notice { padding: 12px; border-radius: 8px; background: var(--ui-bg-3); margin: 14px 0; line-height: 1.7; color: var(--ui-text-sub); overflow-wrap: anywhere; }
.maintenance-notice.warning { color: var(--wiki-warning); background: color-mix(in srgb, var(--wiki-warning) 8%, var(--ui-bg-2)); border-left: 2px solid var(--wiki-warning); }
.maintenance-notice.error { color: var(--wiki-error); background: color-mix(in srgb, var(--wiki-error) 8%, var(--ui-bg-2)); border-left: 2px solid var(--wiki-error); }
.maintenance-notice summary { color: inherit; }
.notice-label { display: flex; align-items: center; gap: 6px; font-weight: 550; }
.maintenance-notice p { margin-top: 6px; font-size: 11px; }
.maintenance-notice ul { padding-left: 16px; font-size: 11px; }
.review-link { display: flex; align-items: center; gap: 6px; color: var(--ui-brand-500); margin-top: 12px; min-height: 28px; }
summary { cursor: pointer; color: var(--ui-text-sub); padding: 8px 0; font-size: 11px; }
.run-details { border-top: 1px solid var(--ui-border-card); margin-top: 14px; padding-top: 4px; }
.path-list { list-style: none; padding: 0; color: var(--ui-text-sub); font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.tool-error { font-size: 11px; overflow-wrap: anywhere; margin-top: 8px; color: var(--wiki-error); }
.status-section { padding: 0 2px; }
.source-status { display: flex; align-items: center; gap: 6px; color: var(--ui-text-sub); margin: 12px 0; }
.source-counts { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 0 14px; font-size: 11px; }
.source-counts > span { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border-radius: 6px; background: color-mix(in srgb, currentColor 7%, var(--ui-bg-1)); font-weight: 550; white-space: nowrap; }
.source-counts b { color: inherit; font-weight: 650; font-size: 14px; font-variant-numeric: tabular-nums; }
.metric-info { color: var(--wiki-info); }
.metric-success { color: var(--wiki-success); }
.metric-warning { color: var(--wiki-warning); }
.metric-error { color: var(--wiki-error); }
.metric-muted { color: var(--ui-text-aux); }
.secondary-details { border-top: 1px solid var(--ui-border-card); }
.secondary-details > summary { display: flex; align-items: center; justify-content: space-between; list-style: none; padding: 12px 0; font-size: 12px; }
.secondary-details > summary::-webkit-details-marker { display: none; }
.secondary-details summary small { margin-left: 6px; color: var(--ui-text-aux); font-size: 10px; }
.secondary-details[open] > summary > i { transform: rotate(180deg); }
.secondary-details > section { padding-bottom: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
@media (max-width: 480px) { .inspector-heading { padding: 18px 16px 14px; } .inspector-tabs { padding: 0 16px; } .inspector-body { padding: 18px 16px; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .action-button { transition: none; } }
</style>
