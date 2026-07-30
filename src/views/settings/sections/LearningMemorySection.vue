<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const mbox = useMessageBox()

const DEFAULT_SETTINGS = {
  enabled: false,
  allowConversationAnalysis: true,
}

const EMPTY_OVERVIEW = {
  settings: { ...DEFAULT_SETTINGS },
  tracks: [],
  concepts: [],
  capabilities: [],
  preferences: [],
  recentEvents: [],
}

const settings = reactive({ ...DEFAULT_SETTINGS })
const overview = ref({ ...EMPTY_OVERVIEW })
const runtime = ref({ mode: 'agent_tool', toolBound: false })
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
let refreshTimer = null
let stopUpdatedListener = null

const learningApi = () => window.electronAPI?.learningMemory

async function callApi(method, ...args) {
  const handler = learningApi()?.[method]
  if (typeof handler !== 'function') throw new Error('成长画像服务暂不可用，请重启应用后重试')
  const result = await handler(...args)
  if (!result?.success) throw new Error(result?.error || '操作失败')
  return result.data
}

async function loadAll({ silent = false } = {}) {
  if (!learningApi()) {
    loading.value = false
    return
  }
  if (!silent) loading.value = true
  try {
    const [savedSettings, savedOverview, savedRuntime] = await Promise.all([
      callApi('getSettings'),
      callApi('getOverview'),
      callApi('getRuntimeStatus'),
    ])
    Object.assign(settings, DEFAULT_SETTINGS, savedSettings || savedOverview?.settings || {})
    overview.value = savedOverview || { ...EMPTY_OVERVIEW }
    runtime.value = savedRuntime || { mode: 'agent_tool', toolBound: settings.enabled }
    loadError.value = ''
  } catch (error) {
    loadError.value = error?.message || '加载成长画像失败'
    if (!silent) msg.error(loadError.value, { title: '成长画像加载失败', duration: 5000 })
  } finally {
    loading.value = false
  }
}

function queueRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    loadAll({ silent: true })
  }, 160)
}

/* ── 派生状态 ── */
const DIMENSION_KEYS = ['tracks', 'concepts', 'capabilities', 'preferences']

const totalItems = computed(() =>
  DIMENSION_KEYS.reduce((sum, key) => sum + (overview.value[key]?.length || 0), 0),
)
const pendingCount = computed(() =>
  DIMENSION_KEYS.reduce(
    (sum, key) => sum + (overview.value[key] || []).filter(item => item.status === 'hypothesis').length,
    0,
  ),
)
const hasData = computed(() => totalItems.value > 0)

const toolStatus = computed(() => {
  if (!settings.enabled) return { label: '未启用', tone: 'muted', icon: 'ri-link-unlink-m' }
  if (!runtime.value?.toolBound) return { label: '暂不可用', tone: 'warning', icon: 'ri-link-unlink-m' }
  return { label: '对话中可用', tone: 'success', icon: 'ri-link-m' }
})

/* ── 最近更新 ── */
const EVENT_LABELS = {
  goal_declared: '记录长期目标',
  preference_declared: '记录学习与协作偏好',
  strategy_feedback: '记录辅导策略反馈',
  concept_exposed: '更新概念学习状态',
  misconception_observed: '记录概念误区',
  explanation_attempt: '记录解释表现',
  assessment_attempt: '记录评测表现',
  problem_solving_observed: '记录问题解决过程',
  capability_demonstrated: '记录能力表现',
  capability_gap_observed: '记录能力缺口',
}

function eventText(ev) {
  const action = EVENT_LABELS[ev?.eventType] || '更新成长画像'
  const target = ev?.targetLabel || ev?.targetMeaning || ''
  return target ? `${action}：${target}` : action
}
function eventTime(ev) {
  return formatDate(ev?.occurredAt || ev?.createdAt || '')
}
const recentEvents = computed(() => (overview.value.recentEvents || []).slice(0, 6))
const olderEventCount = computed(() =>
  Math.max(0, (overview.value.recentEvents || []).length - recentEvents.value.length),
)
const lastEventAt = computed(() => {
  const latest = (overview.value.recentEvents || [])[0]
  return latest ? eventTime(latest) : ''
})

function emptyGuide(kind) {
  const subjects = {
    tracks: '明确表达的长期目标',
    concepts: '概念学习状态和稳定知识缺口',
    capabilities: '你亲自展示的能力证据',
    preferences: '稳定的学习与协作偏好',
  }
  const subject = subjects[kind] || '这类画像信息'
  if (!settings.enabled) {
    return { type: 'info', text: `开启上方“成长画像”后，对话 Agent 才能记录${subject}。` }
  }
  if (!runtime.value?.toolBound) {
    return { type: 'info', text: `画像工具当前不可用，恢复后才能记录${subject}。` }
  }
  if (kind === 'capabilities' && settings.allowConversationAnalysis === false) {
    return { type: 'info', text: '开启“从普通对话观察成长线索”后，对话 Agent 才能从你亲自展示的过程中记录能力证据。' }
  }

  const guides = {
    tracks: { type: 'example', text: '我想在半年内入门 Rust，每周投入 3 小时。' },
    concepts: { type: 'info', text: '当你明确说明正在学习的概念或稳定知识缺口时，对话 Agent 会判断是否记录相关学习状态。' },
    capabilities: { type: 'info', text: 'Agent 只根据你亲自展示的推理、解题、验证或纠错过程记录，不会把它代做的结果算作你的能力。' },
    preferences: { type: 'example', text: '我喜欢先看大纲再动手；代码评审请直接指出问题。' },
  }
  return guides[kind]
}

/* ── 概览卡片 ── */
const overviewCards = computed(() => {
  const tracks = overview.value.tracks || []
  const concepts = overview.value.concepts || []
  const capabilities = overview.value.capabilities || []
  const preferences = overview.value.preferences || []
  return [
    {
      key: 'tracks', title: '长期目标', icon: 'ri-route-line', color: 'brand',
      empty: '还没有长期目标。',
      guide: emptyGuide('tracks'),
      total: tracks.length,
      items: tracks.slice(0, 5).map(item => ({ ...item, label: item.title, meaning: item.goal, evidenceCount: null })),
    },
    {
      key: 'concepts', title: '概念学习状态', icon: 'ri-book-open-line', color: 'violet',
      empty: '还没有概念记录。',
      guide: emptyGuide('concepts'),
      total: concepts.length,
      items: concepts.slice(0, 5),
    },
    {
      key: 'capabilities', title: '能力与方法', icon: 'ri-tools-line', color: 'emerald',
      empty: '还没有可观察的能力证据。',
      guide: emptyGuide('capabilities'),
      total: capabilities.length,
      items: capabilities.slice(0, 5),
    },
    {
      key: 'preferences', title: '学习与协作偏好', icon: 'ri-compass-3-line', color: 'amber',
      empty: '还没有稳定偏好。',
      guide: emptyGuide('preferences'),
      total: preferences.length,
      items: preferences.slice(0, 5).map(item => ({
        ...item,
        label: item.strategy,
        meaning: [item.meaning, ...Object.values(item.conditions || {}).filter(Boolean)].filter(Boolean).join(' · '),
      })),
    },
  ]
})

/* ── 样式工具 ── */
function toneClass(tone) {
  const map = {
    muted: isDark.value ? 'bg-d4 text-wt-dim border-d4' : 'bg-l4 text-lt-aux border-bdrF',
    brand: isDark.value ? 'bg-brand-400/10 text-brand-400 border-brand-400/20' : 'bg-brand-50 text-brand-600 border-brand-200',
    success: isDark.value ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200',
    warning: isDark.value ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 'bg-amber-50 text-amber-600 border-amber-200',
  }
  return `border ${map[tone] || map.muted}`
}

function statusTone(status) {
  if (status === 'hypothesis') return 'warning'
  if (['reliable', 'stable', 'active', 'completed'].includes(status)) return 'success'
  if (['rejected', 'paused'].includes(status)) return 'muted'
  return 'brand'
}

function colorClasses(color) {
  const map = {
    brand: isDark.value ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-600',
    violet: isDark.value ? 'bg-violet-400/12 text-violet-400' : 'bg-violet-50 text-violet-600',
    emerald: isDark.value ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    amber: isDark.value ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-600',
  }
  return map[color] || map.brand
}

function colorText(color) {
  const map = {
    brand: isDark.value ? 'text-brand-400' : 'text-brand-600',
    violet: isDark.value ? 'text-violet-400' : 'text-violet-600',
    emerald: isDark.value ? 'text-emerald-400' : 'text-emerald-600',
    amber: isDark.value ? 'text-amber-400' : 'text-amber-600',
  }
  return map[color] || map.brand
}

function statusLabel(key, status) {
  const labels = {
    tracks: { hypothesis: '待确认', active: '进行中', paused: '已暂停', completed: '已完成' },
    concepts: { hypothesis: '待确认', exposed: '接触过', learning: '学习中', usable: '可使用', stable: '较稳定' },
    capabilities: { hypothesis: '待确认', observed: '已观察', developing: '发展中', reliable: '较稳定' },
    preferences: { hypothesis: '待确认', active: '已确认', rejected: '已拒绝' },
  }
  return labels[key]?.[status] || status || '未分类'
}

function formatDate(value) {
  if (!value) return ''
  const text = String(value).replace('T', ' ')
  return text.length > 16 ? text.slice(0, 16) : text
}

/* ── 操作 ── */
async function savePatch(patch, successText = '') {
  if (saving.value) return false
  saving.value = true
  try {
    const next = await callApi('updateSettings', patch)
    if (next) Object.assign(settings, next)
    if (successText) msg.success(successText, { duration: 2600 })
    await loadAll({ silent: true })
    return true
  } catch (error) {
    msg.error(error?.message || '保存成长画像设置失败', { title: '保存失败', duration: 5000 })
    await loadAll({ silent: true })
    return false
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(value) {
  await savePatch(
    { enabled: value },
    value ? '成长画像已启用，主 Agent 会根据对话中的明确线索更新画像' : '成长画像已暂停，已有画像不会被删除',
  )
}

async function toggleObservation(value) {
  await savePatch({ allowConversationAnalysis: value })
}

async function clearAll() {
  const confirmed = await mbox.confirm({
    title: '清除全部成长画像？',
    subtitle: '此操作不可撤销',
    message: '将永久删除长期目标、概念学习状态、能力方法、协作偏好及相关依据和历史记录。不会关闭功能开关，也不会影响普通记忆。',
    variant: 'danger',
    confirmText: '清除全部画像',
    cancelText: '取消',
  })
  if (!confirmed) return
  saving.value = true
  try {
    await callApi('clearAll')
    msg.success(
      settings.enabled ? '成长画像数据已清除，后续对话将从零开始积累' : '成长画像数据已清除，重新开启后将从零开始积累',
      { duration: 3200 },
    )
    await loadAll({ silent: true })
  } catch (error) {
    msg.error(error?.message || '清除成长画像失败', { title: '清除失败', duration: 5000 })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadAll()
  stopUpdatedListener = learningApi()?.onUpdated?.(() => queueRefresh()) || null
})

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  if (typeof stopUpdatedListener === 'function') stopUpdatedListener()
  else learningApi()?.removeUpdatedListeners?.()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 lg:px-6 py-5 space-y-4">
    <!-- 顶部介绍 -->
    <div class="rounded-xl p-4 flex items-start gap-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50 border border-brand-100'">
      <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/15' : 'bg-brand-100'">
        <i class="ri-seedling-line text-[17px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[13px] font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-600'">长期学习与能力成长画像</div>
        <div class="text-[12px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          开启后，对话 Agent 会记录对后续学习有用的长期目标、概念学习状态、解决问题的方法与稳定偏好，帮助延续进度并调整辅导方式。画像保存在当前工作区；对话时，相关片段会随请求发送给当前模型服务商。
        </div>
      </div>
      <div v-if="!loading && hasData" class="hidden sm:flex flex-col items-end shrink-0 text-right">
        <div class="text-[16px] font-bold leading-tight tabular-nums" :class="isDark ? 'text-brand-400' : 'text-brand-600'">{{ totalItems }}</div>
        <div class="text-[9.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">项记录{{ pendingCount ? ` · ${pendingCount} 项待确认` : '' }}</div>
      </div>
    </div>

    <div v-if="loadError" class="rounded-lg px-3 py-2 text-[11px]" :class="isDark ? 'bg-red-400/10 text-red-300 border border-red-400/20' : 'bg-red-50 text-red-600 border border-red-200'">
      <i class="ri-error-warning-line mr-1" />{{ loadError }}
    </div>

    <div v-if="loading" class="rounded-xl py-14 text-center" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <i class="ri-loader-4-line text-[22px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <div class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在加载成长画像…</div>
    </div>

    <template v-else>
      <!-- 设置 -->
      <section class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
<div class="px-4 py-3.5 flex items-center gap-3 border-b" :class="isDark ? 'border-bdr' : 'border-bdrF'">
  <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'"><i class="ri-leaf-line text-[16px]" /></div>
  <div class="min-w-0 flex-1">
    <div class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">成长画像</div>
    <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">开启后开始积累；关闭只是暂停更新，已有画像会保留</div>
    <div class="flex items-center gap-1 mt-0.5 text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <i class="ri-coin-line text-[11px]" :class="isDark ? 'text-amber-300' : 'text-amber-500'" />
      <span>注意：启用此功能时，会增加Tokens 消耗</span>
    </div>
  </div>
  <button class="toggle" :class="settings.enabled ? 'on' : (isDark ? 'off' : 'light-off')" :disabled="saving" role="switch" :aria-checked="settings.enabled" aria-label="启用成长画像" @click="toggleEnabled(!settings.enabled)" />
</div>

        <div class="px-4 py-3.5 flex items-center gap-3 border-b" :class="isDark ? 'border-bdr' : 'border-bdrF'">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'"><i class="ri-links-line text-[16px]" /></div>
          <div class="min-w-0 flex-1">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">在对话中使用画像</div>
            <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">画像工具只提供给对话Agent；画像不会写入普通记忆</div>
            <div v-if="settings.enabled && !runtime.toolBound" class="text-[10.5px] mt-0.5" :class="isDark ? 'text-amber-300' : 'text-amber-600'">画像工具暂不可用，请重启应用后重试</div>
          </div>
          <span class="ctx-pill text-[10px]" :class="toneClass(toolStatus.tone)"><i :class="`${toolStatus.icon} mr-1`" />{{ toolStatus.label }}</span>
        </div>

        <div class="px-4 py-3.5 flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'"><i class="ri-chat-history-line text-[16px]" /></div>
          <div class="min-w-0 flex-1">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">从普通对话观察成长线索</div>
            <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">关闭后不再观察能力表现；你明确表达长期目标、稳定偏好，或要求纠正、撤销时仍可更新</div>
          </div>
          <button class="toggle" :class="settings.allowConversationAnalysis ? 'on' : (isDark ? 'off' : 'light-off')" :disabled="saving || !settings.enabled" role="switch" :aria-checked="settings.allowConversationAnalysis" aria-label="允许从普通对话观察成长线索" @click="toggleObservation(!settings.allowConversationAnalysis)" />
        </div>
      </section>

      <!-- 画像概览 -->
      <section>
        <div class="flex items-center justify-between mb-2 px-1">
          <div>
            <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">当前画像概览</div>
            <div class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可在对话中要求对话 Agent 查询、纠正或撤销</div>
          </div>
          <span class="inline-flex items-center gap-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-shield-check-line text-[11px]" /> 当前工作区本地存储
          </span>
        </div>


        <!-- 暂停 / 白纸提示 -->
        <div v-if="!settings.enabled && hasData" class="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" :class="isDark ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-200'">
          <i class="ri-pause-circle-line text-[13px]" /> 画像已暂停更新——已有数据保留，重新开启后继续积累。
        </div>
        <div v-else-if="settings.enabled && !hasData" class="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/15' : 'bg-brand-50 text-brand-600 border border-brand-100'">
          <i class="ri-seedling-line text-[13px]" /> 画像还没有记录——正常进行学习和工作对话，有明确、可复用的线索时会自动更新。
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div v-for="(card, idx) in overviewCards" :key="card.key" class="ov-card fade-up rounded-xl overflow-hidden" :style="`animation-delay:${idx * 60}ms`" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
            <div class="px-4 pt-3.5 pb-2.5 flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="colorClasses(card.color)"><i :class="`${card.icon} text-[14px]`" /></div>
              <span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ card.title }}</span>
              <span class="text-[11px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ card.total }} 条<template v-if="card.total > 5"> · 最近 5 条</template>
              </span>
            </div>

<div v-if="!card.items.length" class="px-4 pb-4">
  <div class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ card.empty }}</div>
  <div v-if="card.guide" class="mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10.5px] leading-relaxed" :class="isDark ? 'bg-d3/60 text-wt-sub' : 'bg-l3/70 text-lt-sub'">
    <span v-if="card.guide.type === 'example'" class="min-w-0 flex-1">
      <i class="ri-double-quotes-l inline-block text-[12px] leading-none align-[-1px] mr-1 opacity-80" :class="colorText(card.color)" />
      <span>{{ card.guide.text }}</span>
      <i class="ri-double-quotes-r inline-block text-[12px] leading-none align-[-1px] ml-1 opacity-80" :class="colorText(card.color)" />
    </span>
    <template v-else>
      <span class="w-4 h-[17px] inline-flex items-center justify-center shrink-0">
        <i class="ri-information-line text-[12px] leading-none opacity-80" :class="colorText(card.color)" />
      </span>
      <span class="min-w-0 flex-1">{{ card.guide.text }}</span>
    </template>
  </div>
</div>

            <div v-else class="px-3 pb-3 space-y-1">
              <div v-for="item in card.items" :key="item.id || item.conceptId || item.capabilityId || item.label" class="rounded-lg px-2.5 py-2" :class="isDark ? 'hover:bg-d3/70' : 'hover:bg-l3/70'">
                <div class="flex items-start gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-[11.5px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.label }}</div>
                    <div v-if="item.meaning" class="text-[10px] mt-0.5 leading-relaxed line-clamp-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.meaning }}</div>
                  </div>
                  <span class="ctx-pill shrink-0 text-[9px]" :class="toneClass(statusTone(item.status))">{{ statusLabel(card.key, item.status) }}</span>
                </div>
                <div class="flex items-center gap-2.5 mt-1 text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  <span v-if="item.evidenceCount !== null && item.evidenceCount !== undefined"><i class="ri-links-line mr-0.5" />证据 {{ item.evidenceCount }} 条</span>
                  <span v-if="item.lastEvidenceAt"><i class="ri-time-line mr-0.5" />最近 {{ formatDate(item.lastEvidenceAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 最近更新 -->
      <section v-if="recentEvents.length" class="fade-up rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <div class="px-4 py-3 flex items-center gap-2 border-b" :class="isDark ? 'border-bdr' : 'border-bdrF'">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'"><i class="ri-history-line text-[14px]" /></div>
          <span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">最近更新</span>
          <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">查看画像最近记录了什么</span>
          <span v-if="lastEventAt" class="ml-auto text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">最近 {{ lastEventAt }}</span>
        </div>
        <div class="px-4 py-2.5 space-y-0.5">
          <div v-for="(ev, idx) in recentEvents" :key="ev.traceId || ev.id || idx" class="flex items-start gap-2.5 rounded-lg px-2 py-1.5" :class="isDark ? 'hover:bg-d3/70' : 'hover:bg-l3/70'">
            <span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" :class="idx === 0 ? 'pulse-dot' : (isDark ? 'bg-d4' : 'bg-bdrF')" />
            <span class="text-[10px] shrink-0 mt-0.5 tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ eventTime(ev) || '—' }}</span>
            <span class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ eventText(ev) }}</span>
          </div>
          <div v-if="olderEventCount" class="px-2 pt-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">还有 {{ olderEventCount }} 条更早的更新</div>
        </div>
      </section>

      <!-- 危险区 -->
      <section class="rounded-xl p-4" :class="isDark ? 'bg-red-400/5 border border-red-400/15' : 'bg-red-50/70 border border-red-100'">
        <div class="flex items-start gap-3">
          <i class="ri-delete-bin-6-line text-[15px] mt-0.5" :class="isDark ? 'text-red-400' : 'text-red-500'" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-semibold" :class="isDark ? 'text-red-300' : 'text-red-600'">清除成长画像</div>
            <div class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">永久删除长期目标、概念学习状态、能力方法、协作偏好及相关依据和历史记录。不影响普通记忆，也不会改变当前开关；功能开启时，后续对话将从零开始积累。</div>
          </div>
          <button class="h-7 px-2.5 rounded-md text-[11px] font-medium shrink-0" :class="isDark ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20' : 'bg-white text-red-600 border border-red-200 hover:bg-red-100'" :disabled="saving" @click="clearAll">清除全部</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.toggle{width:30px;height:17px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle:disabled{opacity:.5;cursor:not-allowed}
.toggle::after{content:'';position:absolute;width:13px;height:13px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.toggle.on{background:var(--brand)}
.toggle.on::after{transform:translateX(13px)}
.toggle.off{background:#555568}
.toggle.light-off{background:#b0b0ba}
.ov-card{transition:transform .2s ease}
.ov-card:hover{transform:translateY(-1px)}
.fade-up{animation:fadeUp .45s cubic-bezier(.2,.7,.2,1) both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}}
.pulse-dot{background:var(--brand);animation:pulseRing 1.8s ease-out infinite}
@keyframes pulseRing{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--brand) 40%, transparent)}100%{box-shadow:0 0 0 6px transparent}}
</style>
