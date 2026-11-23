<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  proposals: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  reviewBusy: { type: Boolean, default: false },
  actionError: { type: String, default: '' },
  selectedProposal: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['refresh', 'select', 'reject', 'confirm', 'apply'])

const selectedProposal = computed(() => props.selectedProposal)
const showApplyConfirm = ref(false)
const highRiskAcknowledged = ref(false)

const statusLabels = {
  pending_review: '待审核',
  confirmed: '已确认',
  applied: '已应用',
  rejected: '已拒绝',
}
const riskLabels = { low: '低风险', medium: '中风险', high: '高风险' }

const selectedId = computed(() => selectedProposal.value?.proposal_id || '')
const contentMode = ref('diff')
const contentTabs = [
  { value: 'diff', label: '变更对比' },
  { value: 'old_content', label: '原内容' },
  { value: 'new_content', label: '新内容' },
]
const applyConfirmText = computed(() => {
  const title = selectedProposal.value?.title || '该提案'
  return selectedProposal.value?.risk === 'high' ? `确认应用高风险提案「${title}」？` : `确认应用提案「${title}」？`
})
const canApplySelected = computed(() =>
  selectedProposal.value &&
  ['pending_review', 'confirmed'].includes(selectedProposal.value.status) &&
  (!selectedProposal.value ||
    selectedProposal.value.risk !== 'high' ||
    highRiskAcknowledged.value),
)

function statusLabel(status) {
  return statusLabels[status] || status || '-'
}

function riskLabel(risk) {
  return riskLabels[risk] || risk || '-'
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function idList(ids) {
  return (Array.isArray(ids) ? ids : []).join(', ') || '无'
}

function openApplyConfirm() {
  highRiskAcknowledged.value = false
  showApplyConfirm.value = true
}

watch(selectedProposal, () => { highRiskAcknowledged.value = false; showApplyConfirm.value = false })
watch(selectedId, () => { contentMode.value = 'diff' })

function confirmApply() {
  if (props.reviewBusy || !canApplySelected.value) return
  emit('apply', selectedProposal.value)
  highRiskAcknowledged.value = false
  showApplyConfirm.value = false
}
</script>

<template>
  <div class="wiki-review-content" :class="{ 'is-dark': isDark }">
    <section class="review-section" aria-label="提案审核">
      <div class="section-heading">
        <div><h3>待审核提案 <span class="count-badge" :class="{ pending: proposals.length > 0 }">{{ proposals.length }}</span></h3><p class="muted">低、中风险可自动应用；高风险需人工确认。</p></div>
        <button class="action-button" :disabled="loading || reviewBusy" @click="emit('refresh')"><i :class="loading ? 'ri-loader-4-line spin' : 'ri-refresh-line'" />刷新</button>
      </div>
      <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p>
      <div v-if="loading && !proposals.length" class="empty-state" role="status"><i class="ri-loader-4-line spin" /><p>正在加载当前 Wiki 的提案</p></div>
      <div v-else-if="!proposals.length" class="empty-state"><i class="ri-inbox-archive-line" /><h4>当前 Wiki 没有待审核提案</h4><p>需要人工确认的改动会出现在这里。</p></div>
      <div v-else class="proposal-list">
        <button v-for="proposal in proposals" :key="proposal.proposal_id" class="proposal-item" :class="{ selected: selectedId === proposal.proposal_id }"
          :aria-pressed="selectedId === proposal.proposal_id" :disabled="reviewBusy" @click="emit('select', proposal)">
          <div class="proposal-title"><span :title="proposal.title">{{ proposal.title }}</span><span class="risk-badge" :class="proposal.risk">{{ riskLabel(proposal.risk) }}</span></div>
          <p class="page-path" :title="proposal.page_path">{{ proposal.page_path }}</p>
          <div class="proposal-meta"><span class="status-badge" :class="proposal.status">{{ statusLabel(proposal.status) }}</span><span>{{ (proposal.source_ids || []).length }} 来源 · {{ (proposal.passage_ids || []).length }} 证据</span><time>{{ formatDate(proposal.created_at) }}</time></div>
          <p v-if="proposal.auto_apply_failed" class="inline-error">自动应用失败：{{ proposal.auto_apply_failed }}</p>
        </button>
      </div>

      <section v-if="selectedProposal" class="proposal-detail" aria-label="提案详情">
        <div class="detail-heading"><span class="eyebrow">提案详情</span><span class="status-badge" :class="selectedProposal.status">{{ statusLabel(selectedProposal.status) }}</span></div>
        <h4 class="detail-title">{{ selectedProposal.title }}</h4>
        <p class="detail-path">{{ selectedProposal.page_path }}</p>
        <div v-if="selectedProposal.risk === 'high'" class="notice warning"><strong><i class="ri-alert-line" />高风险修改</strong><p>可能删除、替换或大幅改写内容，请检查下方改动后再应用。</p></div>
        <p v-if="selectedProposal.auto_apply_failed" class="notice error">自动应用失败：{{ selectedProposal.auto_apply_failed }}</p>
        <div class="reason-block"><h5>修改原因</h5><p>{{ selectedProposal.reason || '未提供说明' }}</p></div>
        <div class="content-preview">
          <div class="preview-tabs" role="group" aria-label="查看提案内容">
            <button v-for="item in contentTabs" :key="item.value" :aria-pressed="contentMode === item.value" :class="{ active: contentMode === item.value }" @click="contentMode = item.value">{{ item.label }}</button>
          </div>
          <pre tabindex="0" :aria-label="contentTabs.find(item => item.value === contentMode)?.label">{{ selectedProposal[contentMode] || (contentMode === 'diff' ? '（无变化）' : '（空）') }}</pre>
        </div>
        <details class="evidence-details"><summary>引用依据 <span>{{ (selectedProposal.source_ids || []).length }} 来源 · {{ (selectedProposal.passage_ids || []).length }} 证据</span></summary><h5>来源 ID</h5><p>{{ idList(selectedProposal.source_ids) }}</p><h5>证据片段 ID</h5><p>{{ idList(selectedProposal.passage_ids) }}</p></details>
        <div class="review-actions">
          <button class="action-button" :disabled="reviewBusy || selectedProposal.status !== 'pending_review'" @click="emit('reject', selectedProposal)">拒绝</button>
          <button class="action-button" :disabled="reviewBusy || selectedProposal.status !== 'pending_review'" @click="emit('confirm', selectedProposal)">标记确认</button>
          <button class="action-button primary" :disabled="reviewBusy || !['pending_review', 'confirmed'].includes(selectedProposal.status)" @click="openApplyConfirm"><i :class="reviewBusy ? 'ri-loader-4-line spin' : 'ri-check-line'" />应用提案</button>
        </div>
        <div v-if="showApplyConfirm" class="apply-confirm" :class="{ 'high-risk': selectedProposal.risk === 'high' }" role="group" aria-label="确认写入提案">
          <h5>{{ applyConfirmText }}</h5><p>应用后将更新此 Wiki 的页面。若页面已被修改，会要求重新生成提案。</p>
          <label v-if="selectedProposal.risk === 'high'"><input v-model="highRiskAcknowledged" type="checkbox" /><span>我已检查内容，确认应用这项高风险修改。</span></label>
          <div class="confirm-actions"><button class="action-button" :disabled="reviewBusy" @click="showApplyConfirm = false">取消</button><button class="action-button primary" :disabled="reviewBusy || !canApplySelected" @click="confirmApply">确认写入</button></div>
        </div>
      </section>
    </section>

  </div>
</template>

<style scoped>
.wiki-review-content { display: flex; flex-direction: column; gap: 28px; color: var(--ui-text-main); min-width: 0; font-size: 12px; }
.wiki-review-content { --wiki-info: var(--ui-brand-600); --wiki-success: #047857; --wiki-warning: #b45309; --wiki-error: #b91c1c; }
.wiki-review-content.is-dark { --wiki-info: var(--ui-brand-400); --wiki-success: #6ee7b7; --wiki-warning: #fcd34d; --wiki-error: #fca5a5; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; }
.count-badge, .status-badge { font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 5px; background: var(--ui-bg-3); color: var(--ui-text-sub); }
.count-badge.pending, .status-badge.pending_review { color: var(--wiki-warning); background: color-mix(in srgb, var(--wiki-warning) 10%, var(--ui-bg-1)); }
.status-badge.confirmed, .status-badge.applied { color: var(--wiki-success); background: color-mix(in srgb, var(--wiki-success) 10%, var(--ui-bg-1)); }
.muted { margin-top: 5px; color: var(--ui-text-aux); font-size: 11px; line-height: 1.7; }
.action-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; padding: 0 10px; border: 1px solid var(--ui-border-card); border-radius: 7px; color: var(--ui-text-sub); font-size: 12px; white-space: nowrap; flex-shrink: 0; transition: background-color .15s; }
.action-button:hover { background: var(--ui-bg-3); }
.action-button.primary { background: var(--ui-brand-500); border-color: transparent; color: white; }
.action-button.primary:hover { background: var(--ui-brand-600); }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible, summary:focus-visible, input:focus-visible, pre:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: 3px; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 30px 16px; margin-top: 18px; border: 1px dashed var(--ui-border-card); border-radius: 10px; text-align: center; }
.empty-state > i { color: var(--ui-text-aux); font-size: 25px; margin-bottom: 12px; }
.empty-state h4 { font-size: 12px; font-weight: 550; margin: 0; }
.empty-state p { color: var(--ui-text-aux); font-size: 11px; margin: 6px 0 0; line-height: 1.7; }
.proposal-list { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; max-height: 320px; overflow-y: auto; padding: 3px; margin-left: -3px; margin-right: -3px; }
.proposal-item { text-align: left; padding: 14px; border: 1px solid var(--ui-border-card); border-radius: 9px; background: var(--ui-bg-2); }
.proposal-item:hover { background: var(--ui-bg-3); }
.proposal-item.selected { border-color: var(--ui-brand-400); background: rgba(var(--ui-brand-400-rgb), .06); }
.proposal-title { display: flex; align-items: flex-start; gap: 10px; }
.proposal-title > span:first-child { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; line-height: 1.6; }
.risk-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; }
.risk-badge.high { color: var(--wiki-error); background: color-mix(in srgb, var(--wiki-error) 10%, var(--ui-bg-2)); }
.risk-badge.medium { color: var(--wiki-warning); background: color-mix(in srgb, var(--wiki-warning) 10%, var(--ui-bg-2)); }
.risk-badge.low { color: var(--wiki-success); background: color-mix(in srgb, var(--wiki-success) 10%, var(--ui-bg-2)); }
.page-path { font-size: 10px; color: var(--ui-text-aux); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 6px 0 10px; }
.proposal-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--ui-text-aux); font-size: 10px; }
.proposal-meta time { margin-left: auto; }
.inline-error { margin: 10px 0 0; color: var(--wiki-error); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.proposal-detail { border-top: 1px solid var(--ui-border-panel); padding-top: 20px; margin-top: 22px; }
.detail-heading { display: flex; align-items: center; justify-content: space-between; }
.eyebrow { font-size: 11px; color: var(--ui-text-aux); }
.detail-title { margin: 10px 0 4px; font-size: 14px; line-height: 1.6; font-weight: 600; overflow-wrap: anywhere; }
.detail-path { color: var(--ui-text-aux); font-size: 11px; overflow-wrap: anywhere; }
.notice { margin: 14px 0; padding: 12px; border-radius: 8px; background: var(--ui-bg-3); color: var(--ui-text-sub); line-height: 1.8; overflow-wrap: anywhere; font-size: 11px; }
.notice strong { display: flex; gap: 6px; align-items: center; font-weight: 600; }
.notice.error { color: var(--wiki-error); border-left: 2px solid var(--wiki-error); background: color-mix(in srgb, var(--wiki-error) 8%, var(--ui-bg-1)); }
.notice.warning { color: var(--wiki-warning); border-left: 2px solid var(--wiki-warning); background: color-mix(in srgb, var(--wiki-warning) 8%, var(--ui-bg-1)); }
.notice p { margin: 5px 0 0; }
.reason-block { margin: 18px 0; }
h5 { margin: 0 0 6px; font-size: 11px; font-weight: 600; }
.reason-block p { margin: 0; font-size: 12px; line-height: 1.8; color: var(--ui-text-sub); overflow-wrap: anywhere; }
.content-preview { border: 1px solid var(--ui-border-card); border-radius: 8px; overflow: hidden; }
.preview-tabs { display: flex; gap: 4px; padding: 6px; background: var(--ui-bg-2); border-bottom: 1px solid var(--ui-border-card); }
.preview-tabs button { padding: 6px 10px; border-radius: 5px; color: var(--ui-text-aux); font-size: 11px; }
.preview-tabs button.active { color: var(--wiki-info); background: color-mix(in srgb, var(--wiki-info) 10%, var(--ui-bg-2)); }
pre { margin: 0; padding: 14px; max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.8 ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--ui-text-sub); }
.evidence-details { margin-top: 12px; }
summary { padding: 10px 0; color: var(--ui-text-sub); cursor: pointer; font-size: 11px; }
.evidence-details summary span { color: var(--ui-text-aux); margin-left: 8px; }
.evidence-details p { overflow-wrap: anywhere; font-size: 10px; line-height: 1.8; color: var(--ui-text-aux); margin-bottom: 12px; }
.review-actions { display: flex; align-items: center; gap: 8px; padding-top: 16px; }
.review-actions .primary { margin-left: auto; }
.apply-confirm { padding: 14px; background: var(--ui-bg-2); border: 1px solid var(--ui-border-card); border-radius: 8px; margin-top: 14px; }
.apply-confirm.high-risk { border-color: var(--wiki-warning); }
.apply-confirm.high-risk h5 { color: var(--wiki-warning); }
.apply-confirm h5 { line-height: 1.8; font-size: 12px; }
.apply-confirm p { color: var(--ui-text-aux); font-size: 11px; line-height: 1.8; }
.apply-confirm label { display: flex; align-items: flex-start; gap: 8px; line-height: 1.8; margin-top: 12px; }
.apply-confirm input { margin-top: 4px; accent-color: var(--ui-brand-500); }
.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } .action-button { transition: none; } }
</style>
