<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import { useSettingsStore } from '@/stores/settings'
import { useAgentsStore } from '@/stores/agents'
import { encodeModelRef } from '@/utils/modelRef'

const appStore = useAppStore()
const tokenUsage = useTokenUsageStore()
const settingsStore = useSettingsStore()
const agentsStore = useAgentsStore()
const isDark = computed(() => appStore.isDark)

/* ── 时间范围 ── */
const usageRange = ref('today')
const customDate = ref('')
const customMonth = ref('')
const activeRange = computed(() => customDate.value || customMonth.value || usageRange.value)
const rangeOptions = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
]
function onPresetClick(val) {
  usageRange.value = val
  customDate.value = ''
  customMonth.value = ''
}
function saveRangePref(val) {
  try {
    const p = window.electronAPI?.db?.settings?.set?.('usageRange', val)
    if (p?.catch) p.catch(e => console.error('saveRangePref error:', e))
  } catch (e) { console.error('saveRangePref error:', e) }
}
function onCustomDateChange() { if (customDate.value) customMonth.value = '' }
function onCustomMonthChange() { if (customMonth.value) customDate.value = '' }

/* ── 颜色 & 分段 ── */
const tokenColors = {
  input:       { dark: '#6C8AFF', light: '#4A6CFF' },
  output:      { dark: '#A78BFA', light: '#7C3AED' },
  cache_read:  { dark: '#38BDF8', light: '#0EA5E9' },
  cache_write: { dark: '#FACC15', light: '#D9A406' },
  thinking:    { dark: '#F472B6', light: '#EC4899' },
}
function tokenColor(type) {
  return isDark.value ? tokenColors[type].dark : tokenColors[type].light
}
const tokenSegments = [
  { key: 'input_tokens', type: 'input', label: '输入' },
  { key: 'output_tokens', type: 'output', label: '输出' },
  { key: 'cache_read_tokens', type: 'cache_read', label: '缓存读' },
  { key: 'cache_write_tokens', type: 'cache_write', label: '缓存写' },
  { key: 'thinking_tokens', type: 'thinking', label: '推理' },
]

/* ── 汇总 ── */
const summary = computed(() => tokenUsage.summary || {
  total_tokens: 0, input_tokens: 0, output_tokens: 0,
  cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0,
  total_cost: 0, call_count: 0, avg_latency: 0,
})

const breakdownPercent = computed(() => {
  const s = summary.value
  const t = (s.input_tokens || 0) + (s.output_tokens || 0) + (s.cache_read_tokens || 0) +
    (s.cache_write_tokens || 0) + (s.thinking_tokens || 0) || 1
  return {
    input: (s.input_tokens || 0) / t * 100,
    output: (s.output_tokens || 0) / t * 100,
    cache_read: (s.cache_read_tokens || 0) / t * 100,
    cache_write: (s.cache_write_tokens || 0) / t * 100,
    thinking: (s.thinking_tokens || 0) / t * 100,
  }
})

/* ── 缓存命中率（分母 = 全部输入侧 token） ── */
const chartReady = ref(false)
const cacheStats = computed(() => {
  const s = summary.value
  const read = s.cache_read_tokens || 0
  const inputSide = read + (s.cache_write_tokens || 0) + (s.input_tokens || 0)
  return { read, rate: inputSide > 0 ? read / inputSide : 0 }
})

/* ── 名称解析 ── */
function normalizeAgentId(id) {
  const key = String(id || '').trim()
  const lower = key.toLowerCase()
  if (lower.startsWith('wiki-agent:') || ['wikiagent', 'wiki_agent', 'wiki-agent'].includes(lower)) return 'wikiagent'
  return key
}
function resolveAgentName(id) {
  const normalizedId = normalizeAgentId(id)
  if (!normalizedId) return '未知'
  if (normalizedId === 'wikiagent') return 'WikiAgent'
  const a = agentsStore.agents.find(x => x.id === normalizedId || x.englishName === normalizedId || x.english_name === normalizedId)
  return a?.name || normalizedId
}
function resolveProviderName(providerId) {
  if (!providerId) return ''
  return settingsStore.providers.find(p => p.id === providerId)?.name || providerId
}
function resolveModelName(providerId, modelId) {
  const scopedRef = encodeModelRef(providerId, modelId)
  const scopedName = settingsStore.getModelName(scopedRef)
  if (scopedName && scopedName !== scopedRef) return scopedName
  const providerName = resolveProviderName(providerId)
  if (providerName && modelId) return `${providerName} / ${modelId}`
  if (modelId) return settingsStore.getModelName(modelId) || modelId
  if (providerName) return providerName
  return '未知模型'
}

/* ── 聚合工具 ── */
function tokenTotal(item) {
  return (item.input_tokens || 0) + (item.output_tokens || 0) +
    (item.cache_read_tokens || 0) + (item.cache_write_tokens || 0) + (item.thinking_tokens || 0)
}
function mergeUsageTotals(target, item) {
  target.calls += item.call_count || 0
  target.input_tokens += item.input_tokens || 0
  target.output_tokens += item.output_tokens || 0
  target.cache_read_tokens += item.cache_read_tokens || 0
  target.cache_write_tokens += item.cache_write_tokens || 0
  target.thinking_tokens += item.thinking_tokens || 0
  target.cost += item.cost || 0
}

/* ── 按模型（Token / 成本 切换） ── */
const modelMetric = ref('tokens')
const modelUsage = computed(() => (tokenUsage.byModel || []).map(m => ({
  name: resolveModelName(m.provider_id || '', m.model_id || ''),
  rawId: encodeModelRef(m.provider_id || '', m.model_id || '') || m.model_id || '',
  input_tokens: m.input_tokens || 0,
  output_tokens: m.output_tokens || 0,
  cache_read_tokens: m.cache_read_tokens || 0,
  cache_write_tokens: m.cache_write_tokens || 0,
  thinking_tokens: m.thinking_tokens || 0,
  total: tokenTotal(m),
  cost: m.cost || 0,
})))
const maxModelTotal = computed(() => Math.max(1, ...modelUsage.value.map(m => m.total)))
const modelGrandTotal = computed(() => modelUsage.value.reduce((s, m) => s + m.total, 0))
const maxModelCost = computed(() => Math.max(0.01, ...modelUsage.value.map(m => m.cost)))
const modelCostTotal = computed(() => modelUsage.value.reduce((s, m) => s + m.cost, 0))

/* ── 按 Agent ── */
const agentUsage = computed(() => {
  const grouped = new Map()
  for (const item of tokenUsage.byAgent || []) {
    const rawId = item.agent_id || ''
    const normalizedId = normalizeAgentId(rawId)
    const key = normalizedId || 'unknown'
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: resolveAgentName(normalizedId || rawId),
        rawId: normalizedId, sourceIds: [], calls: 0,
        input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
        cache_write_tokens: 0, thinking_tokens: 0, cost: 0,
      })
    }
    const target = grouped.get(key)
    if (rawId && !target.sourceIds.includes(rawId)) target.sourceIds.push(rawId)
    mergeUsageTotals(target, item)
  }
  return [...grouped.values()]
    .map(a => ({ ...a, total: tokenTotal(a) }))
    .sort((a, b) => b.total - a.total)
})
const maxAgentTotal = computed(() => Math.max(1, ...agentUsage.value.map(a => a.total)))
const agentGrandTotal = computed(() => agentUsage.value.reduce((s, a) => s + a.total, 0))

/* ── 每日趋势（>31 天按月聚合） ── */
const dailyUsage = computed(() => (tokenUsage.daily || []).map(d => ({
  date: d.date || '',
  day: d.date ? d.date.slice(5) : '',
  month: d.date ? d.date.slice(0, 7) : '',
  input_tokens: d.input_tokens || 0,
  output_tokens: d.output_tokens || 0,
  cache_read_tokens: d.cache_read_tokens || 0,
  cache_write_tokens: d.cache_write_tokens || 0,
  thinking_tokens: d.thinking_tokens || 0,
  total: tokenTotal(d),
})))

const trendData = computed(() => {
  const raw = dailyUsage.value
  if (raw.length <= 31) return raw.map(d => ({ ...d, label: d.day }))
  const map = new Map()
  for (const d of raw) {
    const key = d.month || d.day
    if (!map.has(key)) {
      map.set(key, {
        label: key.length >= 7 ? key.slice(2) : key,
        input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
        cache_write_tokens: 0, thinking_tokens: 0, total: 0,
      })
    }
    const t = map.get(key)
    t.input_tokens += d.input_tokens
    t.output_tokens += d.output_tokens
    t.cache_read_tokens += d.cache_read_tokens
    t.cache_write_tokens += d.cache_write_tokens
    t.thinking_tokens += d.thinking_tokens
    t.total += d.total
  }
  return [...map.values()]
})
const maxTrend = computed(() => Math.max(1, ...trendData.value.map(d => d.total)))

function barHeight(total) {
  return Math.max(3, (total / maxTrend.value) * 78)
}
function showTrendLabel(i) {
  const n = trendData.value.length
  if (n <= 16) return true
  if (n <= 32) return i % 2 === 0
  return i % 3 === 0
}
function tooltipPosClass(i) {
  const n = trendData.value.length
  if (n > 1 && i === 0) return 'left-0'
  if (n > 1 && i === n - 1) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}
function segWidth(row, seg) {
  return ((row[seg.key] || 0) / (row.total || 1)) * 100 + '%'
}
function pctOf(v, total) {
  return ((v || 0) / (total || 1) * 100).toFixed(1)
}

/* ── 消耗热点 ── */
function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'K'
  return n.toString()
}
function fmtCost(n) {
  const v = n || 0
  if (v > 0 && v < 0.01) return v.toFixed(4)
  return v.toFixed(2)
}
const topDailyUsage = computed(() => [...dailyUsage.value].sort((a, b) => b.total - a.total)[0] || null)
const hotspotItems = computed(() => {
  const day = topDailyUsage.value
  const model = modelUsage.value[0] || null
  const agent = agentUsage.value[0] || null
  const total = summary.value.total_tokens || 1
  return [
    {
      key: 'day', label: '峰值日期', icon: 'ri-calendar-event-line', tone: 'emerald',
      name: day?.day || '暂无', value: day ? fmtTokens(day.total) : '0', meta: '当日 Token',
      percent: day ? Math.min(100, day.total / total * 100) : 0,
    },
    {
      key: 'model', label: '最高模型', icon: 'ri-cpu-line', tone: 'brand',
      name: model?.name || '暂无', value: model ? fmtTokens(model.total) : '0',
      meta: model ? `¥${fmtCost(model.cost)}` : '无成本',
      percent: model ? Math.min(100, model.total / total * 100) : 0,
    },
    {
      key: 'agent', label: '最高 Agent', icon: 'ri-sparkling-2-line', tone: 'agent',
      name: agent?.name || '暂无', value: agent ? fmtTokens(agent.total) : '0',
      meta: agent ? `${agent.calls} 次` : '无调用',
      percent: agent ? Math.min(100, agent.total / total * 100) : 0,
    },
  ]
})
function hotspotToneClass(tone) {
  const classes = {
    emerald: isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    brand: isDark.value ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-600',
    agent: isDark.value ? 'bg-agent-400/10 text-agent-400' : 'bg-agent-50 text-agent-500',
  }
  return classes[tone] || classes.brand
}
function hotspotBarColor(tone) {
  const colors = {
    emerald: isDark.value ? '#34D399' : '#10B981',
    brand: isDark.value ? '#6C8AFF' : '#4A6CFF',
    agent: isDark.value ? '#A78BFA' : '#7C3AED',
  }
  return colors[tone] || colors.brand
}
function hotspotBarWidth(percent) {
  return percent > 0 ? `${Math.max(6, percent)}%` : '0%'
}

/* ── 总览环境光 ── */
const heroGlowStyle = computed(() => ({
  background: isDark.value
    ? 'radial-gradient(560px 240px at 6% -12%, rgba(108,138,255,0.12), transparent 70%), radial-gradient(420px 220px at 96% -4%, rgba(56,189,248,0.07), transparent 70%)'
    : 'radial-gradient(560px 240px at 6% -12%, rgba(74,108,255,0.08), transparent 70%), radial-gradient(420px 220px at 96% -4%, rgba(14,165,233,0.06), transparent 70%)',
}))

/* ── 加载 ── */
const loading = ref(false)
let refreshSeq = 0
async function loadPrefs() {
  if (!window.electronAPI?.db?.settings) return
  try {
    const savedRange = await window.electronAPI.db.settings.get('usageRange')
    if (savedRange && rangeOptions.some(o => o.value === savedRange)) usageRange.value = savedRange
  } catch (e) { console.error('loadPrefs error:', e) }
}
async function refreshData() {
  const seq = ++refreshSeq
  loading.value = true
  try {
    await tokenUsage.fetchAll(activeRange.value)
  } catch (e) {
    if (seq === refreshSeq) console.error('refreshData error:', e)
  } finally {
    if (seq === refreshSeq) loading.value = false
  }
}
watch(activeRange, refreshData, { immediate: true })
onMounted(async () => {
  await loadPrefs()
  requestAnimationFrame(() => { chartReady.value = true })
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-7 space-y-5 transition-opacity duration-200" :class="loading ? 'opacity-70' : ''">

    <!-- ═══ 时间范围 ═══ -->
    <div class="reveal flex items-center justify-between flex-wrap gap-3">
      <div class="inline-flex items-center gap-0.5 p-1 rounded-lg" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <button
          v-for="opt in rangeOptions"
          :key="opt.value"
          class="h-7.5 px-3 rounded-md text-12px font-500 transition-all duration-150"
          :class="activeRange === opt.value
            ? (isDark ? 'bg-emerald-400/15 text-emerald-400 shadow-sm' : 'bg-emerald-100 text-emerald-700 shadow-sm')
            : (isDark ? 'text-wt-aux hover:text-wt-main' : 'text-lt-aux hover:text-lt-main')"
          @click="onPresetClick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <i v-if="loading" class="ri-loader-4-line animate-spin text-15px shrink-0" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
        <div class="usage-date-field" :class="isDark ? 'dark-field' : 'light-field'">
          <i class="ri-calendar-line date-field-icon" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <input v-model="customDate" type="date" aria-label="选择日期"
            class="date-picker-input usage-date-input"
            :class="isDark ? 'bg-d3 text-wt-sub border-bdr' : 'bg-l3 text-lt-sub border-bdrF'"
            @change="onCustomDateChange" />
        </div>
        <div class="usage-date-field" :class="isDark ? 'dark-field' : 'light-field'">
          <i class="ri-calendar-2-line date-field-icon" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <input v-model="customMonth" type="month" aria-label="选择月份"
            class="date-picker-input usage-date-input"
            :class="isDark ? 'bg-d3 text-wt-sub border-bdr' : 'bg-l3 text-lt-sub border-bdrF'"
            @change="onCustomMonthChange" />
        </div>
      </div>
    </div>

    <!-- ═══ 总览面板 ═══ -->
    <div v-if="summary.call_count > 0" class="reveal reveal-1 relative overflow-hidden rounded-xl" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="pointer-events-none absolute inset-0" :style="heroGlowStyle" />

      <div class="relative grid grid-cols-1 lg:grid-cols-[1.5fr_1.3fr]">
        <!-- 左：总 Token + 构成条 + 图例 -->
        <div class="p-5 lg:p-6">
          <div class="flex items-center gap-2 mb-1.5">
            <i class="ri-coin-line text-15px" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            <span class="text-11px font-600 tracking-wide" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">总 TOKEN</span>
          </div>
          <div class="text-42px leading-none font-bold font-mono tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            {{ fmtTokens(summary.total_tokens) }}
          </div>

          <div class="mt-4.5 h-2.5 rounded-full overflow-hidden flex" :class="isDark ? 'bg-d4/70' : 'bg-l4'">
            <div
              v-for="seg in tokenSegments"
              :key="seg.type"
              class="h-full transition-all duration-500"
              :style="{ width: (chartReady ? breakdownPercent[seg.type] : 0) + '%', backgroundColor: tokenColor(seg.type) }"
            />
          </div>
          <div class="mt-3 flex items-center flex-wrap gap-x-4 gap-y-1.5">
            <div v-for="seg in tokenSegments" :key="seg.type" class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: tokenColor(seg.type) }" />
              <span class="text-11.5px" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ seg.label }}</span>
              <span class="text-11.5px font-mono font-600" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ fmtTokens(summary[seg.key]) }}</span>
              <span class="text-10.5px font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ breakdownPercent[seg.type].toFixed(1) }}%</span>
            </div>
          </div>
        </div>

        <!-- 右：四个指标，始终一行，图标常显 -->
        <div
          class="grid grid-cols-4 gap-px border-t lg:border-t-0 lg:border-l"
          :class="isDark ? 'bg-white/6 border-bdr' : 'bg-black/6 border-bdrF'"
        >
          <div class="px-3 sm:px-3.5 py-5 flex flex-col justify-center gap-1 transition-colors min-w-0" :class="isDark ? 'bg-d2 hover:bg-white/3' : 'bg-l2 hover:bg-black/3'">
            <div class="flex items-center gap-1 sm:gap-1.5">
              <i class="ri-money-cny-circle-line text-12px sm:text-13px shrink-0" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
              <span class="text-10px sm:text-11px font-500 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">总成本</span>
            </div>
            <div class="text-17px sm:text-20px font-bold font-mono tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">&yen;{{ summary.total_cost.toFixed(2) }}</div>
            <span class="text-10.5px truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本周期花费</span>
          </div>
          <div class="px-3 sm:px-3.5 py-5 flex flex-col justify-center gap-1 transition-colors min-w-0" :class="isDark ? 'bg-d2 hover:bg-white/3' : 'bg-l2 hover:bg-black/3'">
            <div class="flex items-center gap-1 sm:gap-1.5">
              <i class="ri-pulse-line text-12px sm:text-13px shrink-0" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
              <span class="text-10px sm:text-11px font-500 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">调用次数</span>
            </div>
            <div class="text-17px sm:text-20px font-bold font-mono tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ summary.call_count }}</div>
            <span class="text-10.5px truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本周期请求</span>
          </div>
          <div class="px-3 sm:px-3.5 py-5 flex flex-col justify-center gap-1 transition-colors min-w-0" :class="isDark ? 'bg-d2 hover:bg-white/3' : 'bg-l2 hover:bg-black/3'">
            <div class="flex items-center gap-1 sm:gap-1.5">
              <i class="ri-timer-line text-12px sm:text-13px shrink-0" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
              <span class="text-10px sm:text-11px font-500 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均响应</span>
            </div>
            <div class="text-17px sm:text-20px font-bold font-mono tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ (summary.avg_latency / 1000).toFixed(1) }}s</div>
            <span class="text-10.5px truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均延迟</span>
          </div>
          <div class="px-3 sm:px-3.5 py-5 flex flex-col justify-center gap-1 transition-colors min-w-0" :class="isDark ? 'bg-d2 hover:bg-white/3' : 'bg-l2 hover:bg-black/3'">
            <div class="flex items-center gap-1 sm:gap-1.5">
              <i class="ri-database-2-line text-12px sm:text-13px shrink-0" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
              <span class="text-10px sm:text-11px font-500 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">缓存命中率</span>
            </div>
            <div class="text-17px sm:text-20px font-bold font-mono tracking-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ (cacheStats.rate * 100).toFixed(0) }}%</div>
            <span class="text-10.5px truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">缓存读 {{ fmtTokens(cacheStats.read) }}</span>
          </div>
        </div>
      </div>

      <!-- 消耗热点 -->
      <div
        v-if="summary.call_count > 0"
        class="relative grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x border-t"
        :class="isDark ? 'divide-white/6 border-bdr' : 'divide-black/6 border-bdrF'"
      >
        <div
          v-for="item in hotspotItems"
          :key="item.key"
          class="px-5 py-3.5 transition-colors"
          :class="isDark ? 'hover:bg-white/2' : 'hover:bg-black/2'"
        >
          <div class="flex items-center gap-2 mb-1.5">
            <span class="w-6 h-6 rounded-md flex items-center justify-center text-13px shrink-0" :class="hotspotToneClass(item.tone)">
              <i :class="item.icon" />
            </span>
            <span class="text-11px font-500" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.label }}</span>
          </div>
          <div class="text-13.5px font-600 truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'" :title="item.name">{{ item.name }}</div>
          <div class="mt-0.5 flex items-baseline gap-2">
            <span class="text-12.5px font-mono font-600" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.value }}</span>
            <span class="text-11px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.meta }}</span>
          </div>
          <div class="mt-2 h-1.5 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
            <div class="h-full rounded-full transition-all duration-500" :style="{ width: hotspotBarWidth(item.percent), backgroundColor: hotspotBarColor(item.tone) }" />
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ 每日趋势 ═══ -->
    <section v-if="trendData.length > 0 && summary.call_count > 0" class="reveal reveal-2 rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="px-5 pt-4 pb-5">
        <div class="flex items-center gap-2.5 mb-5">
          <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-emerald-400/10' : 'bg-emerald-50'">
            <i class="ri-bar-chart-grouped-line text-15px" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
          </span>
          <span class="text-14px font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">每日趋势</span>
          <span class="ml-auto text-11px font-mono px-2 py-0.5 rounded-md" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">
            峰值 {{ fmtTokens(maxTrend) }}
          </span>
        </div>

        <div class="relative">
          <div class="absolute left-0 right-0 top-0 bottom-6 pointer-events-none">
            <div class="absolute inset-x-0 top-1/4 border-t border-dashed" :class="isDark ? 'border-white/8' : 'border-black/8'" />
            <div class="absolute inset-x-0 top-2/4 border-t border-dashed" :class="isDark ? 'border-white/8' : 'border-black/8'" />
            <div class="absolute inset-x-0 top-3/4 border-t border-dashed" :class="isDark ? 'border-white/8' : 'border-black/8'" />
          </div>

          <div class="relative flex items-stretch gap-1 sm:gap-2 h-44">
            <div
              v-for="(d, i) in trendData"
              :key="d.label + i"
              class="group flex-1 min-w-0 flex flex-col cursor-default"
            >
              <div
                class="relative flex-1 flex items-end justify-center">
                <div
                  class="pointer-events-none absolute z-20 hidden group-hover:block whitespace-nowrap rounded-md px-2 py-1 text-11px font-mono shadow-lg"
                  :class="[tooltipPosClass(i), isDark ? 'bg-d0 text-wt-main border border-d4' : 'bg-white text-lt-main border border-bdrF']"
                  :style="{ bottom: `calc(${barHeight(d.total)}% + 8px)` }"
                >
                  {{ d.label }} · {{ fmtTokens(d.total) }}
                </div>
                <div
                  class="w-full max-w-9 overflow-hidden rounded-t-md transition-all duration-300 group-hover:opacity-80"
                  :style="{ height: barHeight(d.total) + '%' }"
                >
                  <div class="h-full flex">
                    <div
                      v-for="seg in tokenSegments"
                      :key="seg.type"
                      class="h-full"
                      :style="{ width: segWidth(d, seg), backgroundColor: tokenColor(seg.type) }"
                    />
                  </div>
                </div>
              </div>
              <span
                class="mt-2 h-4 text-10px font-mono text-center truncate"
                :class="showTrendLabel(i) ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'opacity-0'"
              >{{ d.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 模型 / Agent 分布 ═══ -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <!-- 按模型（Token / 成本 切换） -->
      <section v-if="modelUsage.length > 0" class="reveal reveal-3 rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <div class="px-5 pt-4 pb-4">
          <div class="flex items-center gap-2.5 mb-3">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
              <i class="ri-cpu-line text-15px" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            </span>
            <span class="text-14px font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">按模型分布</span>
            <div class="ml-auto inline-flex items-center gap-0.5 p-0.5 rounded-md" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <button
                v-for="opt in [{ v: 'tokens', l: 'Token' }, { v: 'cost', l: '成本' }]"
                :key="opt.v"
                class="h-6 px-2 rounded text-11px font-500 transition-all duration-150"
                :class="modelMetric === opt.v
                  ? (isDark ? 'bg-d0 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
                  : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')"
                @click="modelMetric = opt.v"
              >
                {{ opt.l }}
              </button>
            </div>
          </div>

          <div class="space-y-1 max-h-88 overflow-y-auto thin-scroll pr-1">
            <div
              v-for="m in modelUsage"
              :key="m.rawId"
              class="group rounded-lg px-2.5 py-2 transition-colors"
              :class="isDark ? 'hover:bg-white/3' : 'hover:bg-black/3'"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <span class="flex-1 min-w-0 text-12.5px font-500 truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" :title="m.rawId">{{ m.name }}</span>
                <template v-if="modelMetric === 'tokens'">
                  <span class="shrink-0 text-12px font-mono font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ fmtTokens(m.total) }}</span>
                  <span class="shrink-0 w-11 text-right text-10.5px font-mono hidden sm:inline" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ pctOf(m.total, modelGrandTotal) }}%</span>
                  <span class="shrink-0 w-13 text-right text-11px font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">&yen;{{ fmtCost(m.cost) }}</span>
                </template>
                <template v-else>
                  <span class="shrink-0 text-12px font-mono font-600" :class="isDark ? 'text-amber-400' : 'text-amber-600'">&yen;{{ fmtCost(m.cost) }}</span>
                  <span class="shrink-0 w-11 text-right text-10.5px font-mono hidden sm:inline" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ pctOf(m.cost, modelCostTotal) }}%</span>
                  <span class="shrink-0 w-13 text-right text-11px font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fmtTokens(m.total) }}</span>
                </template>
              </div>

              <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4/70' : 'bg-l4'">
                <div
                  v-if="modelMetric === 'tokens'"
                  class="h-full flex overflow-hidden rounded-full transition-all duration-500"
                  :style="{ width: Math.max(2, m.total / maxModelTotal * 100) + '%' }"
                >
                  <div
                    v-for="seg in tokenSegments"
                    :key="seg.type"
                    class="h-full"
                    :style="{ width: segWidth(m, seg), backgroundColor: tokenColor(seg.type) }"
                  />
                </div>
                <div
                  v-else
                  class="h-full rounded-full transition-all duration-500"
                  :style="{ width: Math.max(2, m.cost / maxModelCost * 100) + '%', backgroundColor: isDark ? '#FBBF24' : '#F59E0B' }"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 按 Agent -->
      <section v-if="agentUsage.length > 0" class="reveal reveal-3 rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <div class="px-5 pt-4 pb-4">
          <div class="flex items-center gap-2.5 mb-3">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'">
              <i class="ri-sparkling-2-line text-15px" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
            </span>
            <span class="text-14px font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">按 Agent 分布</span>
            <span class="ml-auto text-11px font-mono px-2 py-0.5 rounded-md" :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">{{ agentUsage.length }} 个 Agent</span>
          </div>

          <div class="space-y-1 max-h-88 overflow-y-auto thin-scroll pr-1">
            <div
              v-for="a in agentUsage"
              :key="a.rawId || a.name"
              class="group rounded-lg px-2.5 py-2 transition-colors"
              :class="isDark ? 'hover:bg-white/3' : 'hover:bg-black/3'"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <span class="flex-1 min-w-0 text-12.5px font-500 truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" :title="a.rawId">{{ a.name }}</span>
                <span class="shrink-0 text-12px font-mono font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ fmtTokens(a.total) }}</span>
                <span class="shrink-0 w-11 text-right text-10.5px font-mono hidden sm:inline" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ pctOf(a.total, agentGrandTotal) }}%</span>
                <span class="shrink-0 w-13 text-right text-11px font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.calls }} 次</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4/70' : 'bg-l4'">
                <div
                  class="h-full flex overflow-hidden rounded-full transition-all duration-500"
                  :style="{ width: Math.max(2, a.total / maxAgentTotal * 100) + '%' }"
                >
                  <div
                    v-for="seg in tokenSegments"
                    :key="seg.type"
                    class="h-full"
                    :style="{ width: segWidth(a, seg), backgroundColor: tokenColor(seg.type) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ═══ 空状态 ═══ -->
    <div
      v-if="summary.call_count === 0"
      class="reveal reveal-2 rounded-xl py-14 flex flex-col items-center justify-center gap-2 border border-dashed"
      :class="isDark ? 'bg-d2/50 border-d4' : 'bg-l2 border-bdrF'"
    >
      <span class="w-12 h-12 rounded-full flex items-center justify-center mb-1" :class="isDark ? 'bg-emerald-400/10' : 'bg-emerald-50'">
        <i class="ri-bar-chart-box-line text-22px" :class="isDark ? 'text-emerald-400' : 'text-emerald-500'" />
      </span>
      <span class="text-14px font-600" :class="isDark ? 'text-wt-main' : 'text-lt-main'">暂无使用数据</span>
      <span class="text-12px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">与 AI 对话后将自动记录 Token 消耗</span>
    </div>
  </div>
</template>

<style scoped>
@keyframes usage-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.reveal { animation: usage-rise .5s cubic-bezier(.21, .75, .35, 1) both; }
.reveal-1 { animation-delay: .06s; }
.reveal-2 { animation-delay: .12s; }
.reveal-3 { animation-delay: .18s; }
@media (prefers-reduced-motion: reduce) {
  .reveal { animation: none; }
}

.usage-date-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 164px;
  height: 34px;
  border-radius: 9px;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.usage-date-field.dark-field {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.usage-date-field.light-field {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(20, 24, 40, 0.08);
  box-shadow: 0 1px 2px rgba(20, 24, 40, 0.04);
}
.usage-date-field:hover { border-color: rgba(16, 185, 129, 0.42); }
.usage-date-field:focus-within {
  border-color: rgba(16, 185, 129, 0.64);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}
.date-field-icon {
  position: absolute;
  left: 10px;
  z-index: 1;
  font-size: 15px;
  pointer-events: none;
}
.usage-date-input {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 8px;
  padding: 0 10px 0 32px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  line-height: 34px;
  color-scheme: light;
}
.dark-field .usage-date-input { color-scheme: dark; }
.usage-date-input::-webkit-calendar-picker-indicator {
  width: 18px;
  height: 18px;
  padding: 5px;
  margin-right: -2px;
  border-radius: 7px;
  opacity: .7;
  transition: background-color .15s ease, opacity .15s ease;
}
.usage-date-input::-webkit-calendar-picker-indicator:hover {
  background-color: rgba(16, 185, 129, 0.12);
  opacity: 1;
}
</style>
