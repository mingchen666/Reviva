<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  lintReport: { type: Object, default: null },
  pages: { type: Array, default: () => [] },
  semanticAudit: { type: Object, default: null },
  semanticAuditEnabled: { type: Boolean, default: false },
  evaluation: { type: Object, default: null },
  health: { type: Object, default: null },
  linting: { type: Boolean, default: false },
  auditing: { type: Boolean, default: false },
  evaluating: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['run-lint', 'run-semantic-audit', 'run-evaluation', 'open-page'])
const lintSummary = computed(() => props.lintReport?.summary || { error: 0, warning: 0, info: 0 })
const severityFilter = ref('all')
const severities = [
  { value: 'error', label: '错误', icon: 'ri-close-circle-line' },
  { value: 'warning', label: '警告', icon: 'ri-alert-line' },
  { value: 'info', label: '提示', icon: 'ri-information-line' },
]
const issues = computed(() => (Array.isArray(props.lintReport?.issues) ? props.lintReport.issues : []).filter(item => item && typeof item === 'object'))
const filteredIssues = computed(() => issues.value.filter(item => severityFilter.value === 'all' || item.severity === severityFilter.value))
const filterLabel = computed(() => severities.find(item => item.value === severityFilter.value)?.label || '问题')
const hasMissingDetails = computed(() => ['error', 'warning', 'info'].some(severity =>
  Number(lintSummary.value[severity] || 0) > issues.value.filter(item => item.severity === severity).length,
))
const pagePaths = computed(() => new Set(props.pages.map(page => page.path)))

// Explain the deterministic lint codes without suggesting an automatic write.
const issueHelp = {
  SCHEMA_MISSING: ['缺少 Wiki 规则文件', '补充 schema.md 后重新检查。'],
  SCHEMA_TOO_LARGE: ['Wiki 规则文件过长', '精简 schema.md，保留页面规范和必要的维护规则。'],
  REQUIRED_PAGE_MISSING: ['缺少导航页', '补充所列导航页，并链接已有知识页。'],
  FRONTMATTER_INVALID: ['页面元数据格式无效', '检查页面开头的 YAML 元数据及分隔符格式。'],
  PAGE_ID_MISSING: ['页面缺少 ID', '在页面元数据中补充唯一的 id。'],
  PAGE_TYPE_INVALID: ['页面类型无效', '核对 type 是否与页面所在分类一致。'],
  PAGE_STATUS_INVALID: ['页面状态无效', '核对 status，可用值为 active、stale、unsupported、review_required。'],
  SOURCE_IDS_INVALID: ['来源列表格式错误', '将 source_ids 写为 YAML 列表，填写当前 Wiki 的真实来源 ID。'],
  SOURCE_REFERENCE_MISSING: ['引用的来源不存在', '核对来源是否已移除，补充有效证据或修订失去支持的内容。'],
  SUMMARY_SOURCE_MISSING: ['摘要未关联来源', '核对摘要对应的原文，在 source_ids 中补充真实来源 ID。'],
  PAGE_SOURCE_MISSING: ['知识页缺少来源依据', '核对页面事实，为 source_ids 补充有效来源。'],
  PAGE_ID_DUPLICATE: ['页面 ID 重复', '为所列页面设置不同的稳定 ID。'],
  PAGE_TITLE_DUPLICATE: ['页面标题重复', '核对是否为同一主题；不同主题应使用可区分的标题。'],
  PAGE_REGISTRY_MISSING: ['页面未登记', '刷新 Wiki 后重新检查，确认页面已纳入索引。'],
  PAGE_REGISTRY_STALE: ['页面索引已过期', '刷新 Wiki 后重新检查，确认索引与当前页面一致。'],
  LINK_BROKEN: ['链接失效', '检查目标页面是否存在，以及链接是否相对当前页面填写。例如摘要页链接到概念页应使用 ../concepts/文件名.md。'],
  ASSET_MISSING: ['图片资源不存在', '核对图片路径及资源文件是否仍在当前 Wiki 中。'],
  INDEX_COVERAGE_MISSING: ['首页导航未收录此页', '在 index.md 中添加指向该知识页的链接。'],
  PAGE_ORPHAN: ['页面没有入站链接', '从导航页或相关知识页添加指向此页的链接。'],
  SOURCE_SUMMARY_MISSING: ['已解析来源缺少摘要', '为该来源生成有证据支持的正式摘要页。'],
  PAGE_REGISTRY_ORPHAN: ['索引引用了不存在的页面', '核对页面是否已删除或移动，再刷新 Wiki 索引。'],
}
function issueTitle(item) {
  return issueHelp[item.code]?.[0] || item.code || '检查发现问题'
}
function issueSuggestion(item) {
  return issueHelp[item.code]?.[1] || '根据检查结果核对相关内容，修改后重新检查。'
}
function issueDescription(item) {
  return String(item.message || '').replace(/^Linked page does not exist: /, '链接指向的页面不存在：')
    .replace(/^Unresolved (?:markdown|wikilink) link: /, '无法解析链接：')
    .replace(/^Image asset does not exist: /, '图片资源不存在：')
}
function severityLabel(value) {
  return severities.find(item => item.value === value)?.label || '问题'
}
function openIssuePage(item) {
  if (pagePaths.value.has(item.page_path)) emit('open-page', item.page_path)
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function metricValue(value) {
  return typeof value === 'number' ? `${Math.round(value * 1000) / 10}%` : '—'
}
</script>

<template>
  <div class="wiki-checks-content" :class="{ 'is-dark': isDark }">
    <section class="check-section" aria-label="健康检查">
      <div class="section-heading">
        <div><h3><i class="ri-shield-check-line" />健康检查</h3><p class="muted">检查链接、引用和页面结构</p></div>
        <button class="action-button" :disabled="linting" @click="emit('run-lint')"><i :class="linting ? 'ri-loader-4-line spin' : 'ri-play-line'" />{{ linting ? '检查中' : '检查' }}</button>
      </div>
      <template v-if="lintReport">
        <div class="check-counts" role="group" aria-label="按问题级别筛选">
          <button v-for="severity in severities" :key="severity.value" type="button" :class="[`metric-${severity.value}`, { selected: severityFilter === severity.value }]"
            :aria-pressed="severityFilter === severity.value" @click="severityFilter = severity.value">
            <i :class="severity.icon" /><b>{{ lintSummary[severity.value] || 0 }}</b> {{ severity.label }}
          </button>
        </div>
        <div class="issues-heading">
          <span role="status">{{ severityFilter === 'all' ? '全部问题' : `${filterLabel}详情` }} · {{ filteredIssues.length }} 条</span>
          <button type="button" class="show-all" :aria-pressed="severityFilter === 'all'" @click="severityFilter = 'all'">查看全部</button>
        </div>
        <p v-if="hasMissingDetails" class="empty-hint">这份报告的部分问题详情缺失，请点击“检查”重新生成完整报告。</p>
        <ol v-if="filteredIssues.length" class="issue-list" aria-label="健康检查问题列表">
          <li v-for="(item, index) in filteredIssues" :key="`${item.code}:${item.page_path || item.source_id || ''}:${index}`" class="issue-card">
            <div class="issue-title"><span class="issue-severity" :class="`metric-${item.severity}`">{{ severityLabel(item.severity) }}</span><h4>{{ issueTitle(item) }}</h4></div>
            <button v-if="pagePaths.has(item.page_path)" type="button" class="issue-page" :aria-label="`打开页面 ${item.page_path}`" @click="openIssuePage(item)"><i class="ri-file-text-line" /><span>{{ item.page_path }}</span><i class="ri-arrow-right-up-line" /></button>
            <p v-else-if="item.page_path" class="issue-location">涉及页面：{{ item.page_path }}（不在当前页面列表中）</p>
            <p v-if="item.source_id" class="issue-location">来源：{{ item.source_id }}</p>
            <p v-if="item.message" class="issue-description">{{ issueDescription(item) }}</p>
            <p class="issue-suggestion"><strong>处理建议</strong>{{ issueSuggestion(item) }}</p>
            <details v-if="item.code" class="issue-technical"><summary>检查代码</summary><code>{{ item.code }}</code></details>
          </li>
        </ol>
        <p v-else-if="!hasMissingDetails" class="empty-hint">{{ issues.length ? `本次检查没有${filterLabel}。可切换其他级别查看。` : '本次检查未发现问题。' }}</p>
      </template>
      <p v-else class="empty-hint">尚未检查，可随时运行本地检查。</p>
    </section>

    <section class="check-section" aria-label="AI 语义巡检">
      <div class="section-heading">
        <div><h3><i class="ri-sparkling-2-line" />AI 语义巡检</h3><p class="muted">检查知识内容的语义一致性</p></div>
        <button class="action-button" :disabled="!semanticAuditEnabled || auditing" @click="emit('run-semantic-audit')"><i :class="auditing ? 'ri-loader-4-line spin' : 'ri-play-line'" />{{ auditing ? '巡检中' : '巡检' }}</button>
      </div>
      <p class="empty-hint">{{ semanticAuditEnabled ? (semanticAudit?.created_at ? `最近巡检 ${formatDate(semanticAudit.created_at)}` : '已启用，尚未运行') : '可在 WikiAgent 设置中开启' }}</p>
    </section>

    <section class="check-section" aria-label="检索评估">
      <div class="section-heading">
        <div><h3><i class="ri-line-chart-line" />检索评估</h3><p class="muted">检查检索命中与引用质量，不改动页面。</p></div>
        <button class="action-button" :disabled="evaluating" @click="emit('run-evaluation')"><i :class="evaluating ? 'ri-loader-4-line spin' : 'ri-play-line'" />{{ evaluating ? '评估中' : '运行评估' }}</button>
      </div>
      <p v-if="!evaluation" class="empty-hint">尚无评估报告。运行后可查看当前 Wiki 的检索表现。</p>
      <template v-else>
        <div class="evaluation-meta"><span>{{ evaluation.case_count || 0 }} 条用例</span><span>{{ evaluation.status === 'empty' ? '评估集为空' : '最近一次评估' }}</span><time>{{ formatDate(evaluation.created_at) }}</time></div>
        <div class="evaluation-metrics">
          <div><span>Recall@5</span><strong :class="{ 'has-value': evaluation.metrics?.recall_at_5 != null }">{{ metricValue(evaluation.metrics?.recall_at_5) }}</strong></div>
          <div><span>Recall@10</span><strong :class="{ 'has-value': evaluation.metrics?.recall_at_10 != null }">{{ metricValue(evaluation.metrics?.recall_at_10) }}</strong></div>
          <div><span>MRR</span><strong :class="{ 'has-value': evaluation.metrics?.mrr != null }">{{ metricValue(evaluation.metrics?.mrr) }}</strong></div>
          <div><span>引用有效率</span><strong :class="{ 'has-value': evaluation.metrics?.citation_validity != null, 'fully-valid': evaluation.metrics?.citation_validity === 1 }">{{ metricValue(evaluation.metrics?.citation_validity) }}</strong></div>
        </div>
        <details v-if="health?.scores" class="health-details"><summary>质量指标</summary><div class="health-scores"><span>搜索 <b>{{ metricValue(health.scores.search) }}</b></span><span>引用 <b>{{ metricValue(health.scores.citation) }}</b></span><span>覆盖 <b>{{ metricValue(health.scores.coverage) }}</b></span><span>结构 <b>{{ metricValue(health.scores.lint) }}</b></span></div></details>
      </template>
    </section>
  </div>
</template>

<style scoped>
.wiki-checks-content { display: flex; flex-direction: column; gap: 24px; color: var(--ui-text-main); min-width: 0; font-size: 12px; --wiki-info: var(--ui-brand-600); --wiki-success: #047857; --wiki-warning: #b45309; --wiki-error: #b91c1c; }
.wiki-checks-content.is-dark { --wiki-info: var(--ui-brand-400); --wiki-success: #6ee7b7; --wiki-warning: #fcd34d; --wiki-error: #fca5a5; }
.check-section + .check-section { padding-top: 24px; border-top: 1px solid var(--ui-border-panel); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 13px; font-weight: 650; }
h3 i { color: var(--wiki-info); font-size: 15px; }
.muted { margin: 5px 0 0; color: var(--ui-text-aux); font-size: 11px; line-height: 1.7; }
.action-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 0 10px; border: 1px solid var(--ui-border-card); border-radius: 7px; color: var(--ui-text-sub); font-size: 12px; white-space: nowrap; flex-shrink: 0; transition: background-color .15s; }
.action-button:hover { background: var(--ui-bg-3); }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, summary:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: 3px; }
.empty-hint { margin: 14px 0 0; padding: 12px 14px; background: var(--ui-bg-2); border-radius: 8px; font-size: 11px; line-height: 1.8; color: var(--ui-text-aux); }
.check-counts { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 14px; font-size: 11px; }
.check-counts > button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border: 1px solid transparent; border-radius: 6px; background: color-mix(in srgb, currentColor 7%, var(--ui-bg-1)); font-weight: 550; white-space: nowrap; cursor: pointer; }
.check-counts > button:hover { background: color-mix(in srgb, currentColor 13%, var(--ui-bg-1)); }
.check-counts > button.selected { border-color: currentColor; }
.check-counts b { color: inherit; font-weight: 650; font-size: 14px; font-variant-numeric: tabular-nums; }
.metric-info { color: var(--wiki-info); }
.metric-warning { color: var(--wiki-warning); }
.metric-error { color: var(--wiki-error); }
.issues-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; color: var(--ui-text-aux); font-size: 11px; }
.show-all { color: var(--wiki-info); padding: 5px 0 5px 8px; cursor: pointer; }
.issue-list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 10px; }
.issue-card { border: 1px solid var(--ui-border-card); border-radius: 8px; padding: 12px; background: var(--ui-bg-2); }
.issue-title { display: flex; align-items: center; gap: 8px; }
.issue-title h4 { margin: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.issue-severity { font-size: 10px; padding: 2px 5px; border-radius: 4px; background: color-mix(in srgb, currentColor 8%, var(--ui-bg-2)); white-space: nowrap; }
.issue-page { display: flex; align-items: flex-start; gap: 5px; width: 100%; text-align: left; color: var(--wiki-info); font-size: 11px; line-height: 1.7; margin-top: 9px; padding: 3px 0; cursor: pointer; }
.issue-page span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.issue-page:hover span { text-decoration: underline; }
.issue-location { color: var(--ui-text-aux); font-size: 11px; line-height: 1.7; margin-top: 8px; overflow-wrap: anywhere; }
.issue-description { color: var(--ui-text-sub); font-size: 11px; line-height: 1.8; margin: 8px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.issue-suggestion { color: var(--ui-text-aux); font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; }
.issue-suggestion strong { display: block; color: var(--ui-text-sub); font-size: 10px; font-weight: 550; margin-bottom: 3px; }
.issue-technical summary { padding-bottom: 0; color: var(--ui-text-aux); font-size: 10px; }
.issue-technical code { display: block; font-size: 10px; color: var(--ui-text-aux); margin-top: 6px; overflow-wrap: anywhere; }
.evaluation-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; font-size: 10px; color: var(--ui-text-aux); }
.evaluation-meta time { margin-left: auto; }
.evaluation-metrics { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px 24px; margin-top: 18px; }
.evaluation-metrics > div { display: flex; flex-direction: column; gap: 6px; }
.evaluation-metrics span { font-size: 11px; color: var(--ui-text-aux); }
.evaluation-metrics strong { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
.evaluation-metrics strong.has-value { color: var(--wiki-info); }
.evaluation-metrics strong.fully-valid { color: var(--wiki-success); }
.health-details { margin-top: 16px; border-top: 1px solid var(--ui-border-card); }
summary { padding: 10px 0; color: var(--ui-text-sub); cursor: pointer; font-size: 11px; }
.health-scores { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; color: var(--ui-text-aux); font-size: 11px; }
.health-scores b { color: var(--wiki-info); font-weight: 600; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .action-button { transition: none; } }
</style>
