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

const usageRange = ref('today')
const customDate = ref('')
const customMonth = ref('')

const activeRange = computed(() => {
  if (customDate.value) return customDate.value
  if (customMonth.value) return customMonth.value
  return usageRange.value
})

const rangeOptions = [
  { value: 'today', label: '今日' },
  { value: 'yesterday', label: '昨日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
]

const tokenColors = {
  input:       { dark: '#6C8AFF', light: '#4A6CFF' },
  output:      { dark: '#A78BFA', light: '#7C3AED' },
  cache_read:  { dark: '#38BDF8', light: '#0ea5e9' },
  cache_write: { dark: '#FACC15', light: '#eab308' },
  thinking:    { dark: '#8B5CF6', light: '#7c3aed' },
}

function tokenColor(type) {
  return isDark.value ? tokenColors[type].dark : tokenColors[type].light
}

const summary = computed(() => tokenUsage.summary || { total_tokens: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, thinking_tokens: 0, total_cost: 0, call_count: 0, avg_latency: 0 })

const breakdownItems = computed(() => [
  { key: 'input_tokens', label: '输入', type: 'input' },
  { key: 'output_tokens', label: '输出', type: 'output' },
  { key: 'cache_read_tokens', label: '缓存读', type: 'cache_read' },
  { key: 'cache_write_tokens', label: '缓存写', type: 'cache_write' },
  { key: 'thinking_tokens', label: '推理', type: 'thinking' },
])

const totalForBreakdown = computed(() => {
  const s = summary.value
  return (s.input_tokens || 0) + (s.output_tokens || 0) + (s.cache_read_tokens || 0) + (s.cache_write_tokens || 0) + (s.thinking_tokens || 0) || 1
})

const breakdownPercent = computed(() => {
  const s = summary.value
  const t = totalForBreakdown.value
  return {
    input: ((s.input_tokens || 0) / t) * 100,
    output: ((s.output_tokens || 0) / t) * 100,
    cache_read: ((s.cache_read_tokens || 0) / t) * 100,
    cache_write: ((s.cache_write_tokens || 0) / t) * 100,
    thinking: ((s.thinking_tokens || 0) / t) * 100,
  }
})

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
  const provider = settingsStore.providers.find(p => p.id === providerId)
  return provider?.name || providerId
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

function tokenTotal(item) {
  return (item.input_tokens || 0) +
    (item.output_tokens || 0) +
    (item.cache_read_tokens || 0) +
    (item.cache_write_tokens || 0) +
    (item.thinking_tokens || 0)
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

const modelUsage = computed(() => {
  const data = tokenUsage.byModel || []
  return data.map(m => ({
    name: resolveModelName(m.provider_id || '', m.model_id || ''),
    rawId: encodeModelRef(m.provider_id || '', m.model_id || '') || m.model_id || '',
    providerId: m.provider_id || '',
    providerName: resolveProviderName(m.provider_id || ''),
    modelId: m.model_id || '',
    input_tokens: m.input_tokens || 0,
    output_tokens: m.output_tokens || 0,
    cache_read_tokens: m.cache_read_tokens || 0,
    cache_write_tokens: m.cache_write_tokens || 0,
    thinking_tokens: m.thinking_tokens || 0,
    total: tokenTotal(m),
    cost: m.cost || 0,
  }))
})

const agentUsage = computed(() => {
  const data = tokenUsage.byAgent || []
  const grouped = new Map()
  for (const item of data) {
    const rawId = item.agent_id || ''
    const normalizedId = normalizeAgentId(rawId)
    const key = normalizedId || 'unknown'
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: resolveAgentName(normalizedId || rawId),
        rawId: normalizedId,
        sourceIds: [],
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        thinking_tokens: 0,
        cost: 0,
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

const dailyUsage = computed(() => {
  const data = tokenUsage.daily || []
  return data.map(d => ({
    day: d.date ? d.date.slice(5) : '',
    input_tokens: d.input_tokens || 0,
    output_tokens: d.output_tokens || 0,
    cache_read_tokens: d.cache_read_tokens || 0,
    cache_write_tokens: d.cache_write_tokens || 0,
    thinking_tokens: d.thinking_tokens || 0,
    total: (d.input_tokens || 0) + (d.output_tokens || 0) + (d.cache_read_tokens || 0) + (d.cache_write_tokens || 0) + (d.thinking_tokens || 0),
  }))
})

const maxDaily = computed(() => {
  const vals = dailyUsage.value.map(d => d.total)
  return vals.length ? Math.max(...vals) : 1
})

const maxModelTotal = computed(() => {
  const vals = modelUsage.value.map(m => m.total)
  return vals.length ? Math.max(...vals) : 1
})

const maxAgentTotal = computed(() => {
  const vals = agentUsage.value.map(a => a.total)
  return vals.length ? Math.max(...vals) : 1
})

const topDailyUsage = computed(() =>
  [...dailyUsage.value].sort((a, b) => b.total - a.total)[0] || null
)

const hotspotItems = computed(() => {
  const day = topDailyUsage.value
  const model = modelUsage.value[0] || null
  const agent = agentUsage.value[0] || null
  const total = summary.value.total_tokens || 1
  return [
    {
      key: 'day',
      label: '峰值日期',
      icon: 'ri-calendar-event-line',
      tone: 'emerald',
      name: day?.day || '暂无',
      value: day ? fmtTokens(day.total) : '0',
      meta: '当日 Token',
      percent: day ? Math.min(100, (day.total / total) * 100) : 0,
    },
    {
      key: 'model',
      label: '最高模型',
      icon: 'ri-cpu-line',
      tone: 'brand',
      name: model?.name || '暂无',
      value: model ? fmtTokens(model.total) : '0',
      meta: model ? `¥${model.cost.toFixed(2)}` : '无成本',
      percent: model ? Math.min(100, (model.total / total) * 100) : 0,
    },
    {
      key: 'agent',
      label: '最高 Agent',
      icon: 'ri-sparkling-2-line',
      tone: 'agent',
      name: agent?.name || '暂无',
      value: agent ? fmtTokens(agent.total) : '0',
      meta: agent ? `${agent.calls} 次` : '无调用',
      percent: agent ? Math.min(100, (agent.total / total) * 100) : 0,
    },
  ]
})

function fmtTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'K'
  return n.toString()
}

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

function barHeight(total) {
  const ratio = total / maxDaily.value
  return Math.max(4, ratio * 100)
}

function onPresetClick(val) {
  usageRange.value = val
  customDate.value = ''
  customMonth.value = ''
}

function onCustomDateChange() {
  if (customDate.value) {
    customMonth.value = ''
  }
}

function onCustomMonthChange() {
  if (customMonth.value) {
    customDate.value = ''
  }
}

async function loadPrefs() {
  if (!window.electronAPI?.db?.settings) return
  try {
    const savedRange = await window.electronAPI.db.settings.get('usageRange')
    if (savedRange) usageRange.value = savedRange
  } catch (e) { console.error('loadPrefs error:', e) }
}

async function refreshData() {
  await tokenUsage.fetchAll(activeRange.value)
}

watch(activeRange, refreshData)

onMounted(async () => {
  await loadPrefs()
  await refreshData()
})
</script>

<template>
  <div class="usage-section max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">

    <!-- Time Range Pills + Date Pickers -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-1.5">
        <button
          v-for="opt in rangeOptions"
          :key="opt.value"
          class="ctx-pill cursor-pointer transition-all"
          :class="activeRange === opt.value
            ? (isDark ? 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200')
            : (isDark ? 'bg-d3 text-wt-aux border border-transparent hover:border-d4' : 'bg-l3 text-lt-aux border border-transparent hover:border-bdrF')"
          @click="onPresetClick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <div class="usage-date-field" :class="isDark ? 'dark-field' : 'light-field'">
          <i class="ri-calendar-line date-field-icon" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <input type="date" v-model="customDate"
            aria-label="选择日期"
            class="date-picker-input usage-date-input"
            :class="isDark ? 'bg-d3 text-wt-sub border-bdr' : 'bg-l3 text-lt-sub border-bdrF'"
            @change="onCustomDateChange" />
        </div>
        <div class="usage-date-field" :class="isDark ? 'dark-field' : 'light-field'">
          <i class="ri-calendar-2-line date-field-icon" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <input type="month" v-model="customMonth"
            aria-label="选择月份"
            class="date-picker-input usage-date-input"
            :class="isDark ? 'bg-d3 text-wt-sub border-bdr' : 'bg-l3 text-lt-sub border-bdrF'"
            @change="onCustomMonthChange" />
        </div>
      </div>
    </div>

    <!-- Stats Tiles -->
    <div class="grid grid-cols-4 gap-3">
      <!-- Total Tokens -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-coin-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">总 Token</span>
        </div>
        <div class="text-[24px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ fmtTokens(summary.total_tokens) }}</div>
      </div>

      <!-- Total Cost -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <i class="ri-money-cny-circle-line text-[16px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">总成本</span>
        </div>
        <div class="text-[24px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">&yen;{{ summary.total_cost.toFixed(2) }}</div>
        <div class="text-[11px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本周期成本</div>
      </div>

      <!-- Call Count -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-agent-400/8' : 'bg-agent-50'">
            <i class="ri-pulse-line text-[16px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">调用次数</span>
        </div>
        <div class="text-[24px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ summary.call_count }}</div>
        <div class="text-[11px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本周期请求</div>
      </div>

      <!-- Avg Response -->
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-output-400/8' : 'bg-output-50'">
            <i class="ri-timer-line text-[16px]" :class="isDark ? 'text-output-400' : 'text-output-500'" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均响应</span>
        </div>
        <div class="text-[24px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ (summary.avg_latency / 1000).toFixed(1) }}s</div>
        <div class="text-[11px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均延迟</div>
      </div>
    </div>

    <!-- Usage Hotspots -->
    <div v-if="summary.call_count > 0" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex">
        <div class="w-1 shrink-0 bg-sky-400" />
        <div class="flex-1 px-4 pt-2 pb-4">
          <div class="section-title flex items-center gap-2 mb-3">
            <i class="ri-radar-line text-[16px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
            <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">消耗热点</span>
          </div>
          <div class="hotspot-grid" :class="isDark ? 'dark-grid' : 'light-grid'">
            <div v-for="item in hotspotItems" :key="item.key" class="hotspot-item">
              <div class="flex items-center gap-2 mb-2">
                <span class="hotspot-icon" :class="hotspotToneClass(item.tone)">
                  <i :class="item.icon" />
                </span>
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.label }}</span>
              </div>
              <div class="text-[15px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'" :title="item.name">
                {{ item.name }}
              </div>
              <div class="mt-2 flex items-center justify-between gap-3">
                <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.value }}</span>
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.meta }}</span>
              </div>
              <div class="mt-2 h-1 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
                <div class="h-full rounded-full" :style="{ width: hotspotBarWidth(item.percent), backgroundColor: hotspotBarColor(item.tone) }" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Token Breakdown Card -->
    <div v-if="summary.call_count > 0" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex">
        <div class="w-1 shrink-0 bg-brand-400" />
        <div class="flex-1 px-4 pt-2 pb-4">
          <div class="section-title flex items-center gap-2 mb-3">
            <i class="ri-pie-chart-2-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Token 构成</span>
          </div>

          <!-- Stacked Bar -->
          <div class="h-3 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
            <div class="h-full flex">
              <div v-for="item in breakdownItems" :key="item.type"
                class="transition-all duration-300"
                :style="{ width: breakdownPercent[item.type] + '%', backgroundColor: tokenColor(item.type) }" />
            </div>
          </div>

          <!-- Detail Rows -->
          <div class="grid grid-cols-5 gap-3 mt-3">
            <div v-for="item in breakdownItems" :key="item.key" class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: tokenColor(item.type) }" />
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.label }}</span>
              <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ fmtTokens(summary[item.key]) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Daily Trend Stacked Bar Chart -->
    <div v-if="dailyUsage.length > 0" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex">
        <div class="w-1 shrink-0 bg-emerald-400" />
        <div class="flex-1 px-5 pt-1 pb-5">
          <div class="section-title flex items-center gap-2 mb-8">
            <i class="ri-bar-chart-grouped-line text-[16px]" :class="isDark ? 'text-emerald-400' : 'text-emerald-500'" />
            <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">每日趋势</span>
          </div>

          <div class="flex items-end gap-3 h-[120px]">
            <div v-for="d in dailyUsage" :key="d.day" class="flex-1 flex flex-col items-center gap-1.5">
              <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fmtTokens(d.total) }}</span>
              <div class="w-full relative" style="height: 100px">
                <div class="absolute bottom-0 w-full flex rounded-t-md overflow-hidden transition-all duration-300"
                  :style="{ height: barHeight(d.total) + '%' }">
                  <div :style="{ width: (d.input_tokens / d.total * 100) + '%', backgroundColor: tokenColor('input') }" />
                  <div :style="{ width: (d.output_tokens / d.total * 100) + '%', backgroundColor: tokenColor('output') }" />
                  <div :style="{ width: (d.cache_read_tokens / d.total * 100) + '%', backgroundColor: tokenColor('cache_read') }" />
                  <div :style="{ width: (d.cache_write_tokens / d.total * 100) + '%', backgroundColor: tokenColor('cache_write') }" />
                  <div :style="{ width: (d.thinking_tokens / d.total * 100) + '%', backgroundColor: tokenColor('thinking') }" />
                </div>
              </div>
              <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ d.day }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Model & Agent Distribution (2-column) -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Model Distribution -->
      <div v-if="modelUsage.length > 0" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <div class="flex">
          <div class="w-1 shrink-0 bg-brand-400" />
          <div class="flex-1 px-5 pt-2 pb-5">
            <div class="section-title flex items-center gap-2 mb-3">
              <i class="ri-cpu-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
              <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">按模型分布</span>
            </div>
            <div class="space-y-3">
              <div v-for="m in modelUsage" :key="m.rawId">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[13px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" :title="m.rawId">{{ m.name }}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ fmtTokens(m.total) }}</span>
                    <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">&yen;{{ m.cost.toFixed(2) }}</span>
                  </div>
                </div>
                <div class="h-2 rounded-full overflow-hidden flex" :class="isDark ? 'bg-d4' : 'bg-l4'">
                  <div class="h-full transition-all duration-400" :style="{ width: (m.input_tokens / maxModelTotal * 100) + '%', backgroundColor: tokenColor('input') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (m.output_tokens / maxModelTotal * 100) + '%', backgroundColor: tokenColor('output') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (m.cache_read_tokens / maxModelTotal * 100) + '%', backgroundColor: tokenColor('cache_read') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (m.cache_write_tokens / maxModelTotal * 100) + '%', backgroundColor: tokenColor('cache_write') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (m.thinking_tokens / maxModelTotal * 100) + '%', backgroundColor: tokenColor('thinking') }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Agent Distribution -->
      <div v-if="agentUsage.length > 0" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
        <div class="flex">
          <div class="w-1 shrink-0 bg-agent-400" />
          <div class="flex-1 px-5 pt-2 pb-5">
            <div class="section-title flex items-center gap-2 mb-3">
              <i class="ri-sparkling-2-line text-[16px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
              <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">按 Agent 分布</span>
            </div>
            <div class="space-y-3">
              <div v-for="a in agentUsage" :key="a.rawId || a.name">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[13px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'" :title="a.rawId">{{ a.name }}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ fmtTokens(a.total) }}</span>
                    <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.calls }} 次</span>
                  </div>
                </div>
                <div class="h-2 rounded-full overflow-hidden flex" :class="isDark ? 'bg-d4' : 'bg-l4'">
                  <div class="h-full transition-all duration-400" :style="{ width: (a.input_tokens / maxAgentTotal * 100) + '%', backgroundColor: tokenColor('input') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (a.output_tokens / maxAgentTotal * 100) + '%', backgroundColor: tokenColor('output') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (a.cache_read_tokens / maxAgentTotal * 100) + '%', backgroundColor: tokenColor('cache_read') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (a.cache_write_tokens / maxAgentTotal * 100) + '%', backgroundColor: tokenColor('cache_write') }" />
                  <div class="h-full transition-all duration-400" :style="{ width: (a.thinking_tokens / maxAgentTotal * 100) + '%', backgroundColor: tokenColor('thinking') }" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state when no data -->
    <div v-if="summary.call_count === 0" class="rounded-xl p-8 flex flex-col items-center justify-center gap-3" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <i class="ri-bar-chart-box-line text-[32px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span class="text-[14px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无使用数据</span>
      <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">与 AI 对话后将自动记录 Token 消耗</span>
    </div>

  </div>
</template>

<style scoped>
.ctx-pill {
  font-size: 12px;
  border-radius: 7px;
  padding: 5px 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all .15s;
  line-height: 1.35;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.hotspot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.hotspot-item {
  min-width: 0;
  padding: 0 16px;
}
.hotspot-item:first-child {
  padding-left: 0;
}
.hotspot-item:last-child {
  padding-right: 0;
}
.hotspot-item + .hotspot-item {
  border-left: 1px solid;
}
.hotspot-grid.dark-grid .hotspot-item + .hotspot-item {
  border-color: rgba(255, 255, 255, 0.08);
}
.hotspot-grid.light-grid .hotspot-item + .hotspot-item {
  border-color: rgba(20, 24, 40, 0.08);
}
.hotspot-icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
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
.usage-date-field:hover {
  border-color: rgba(16, 185, 129, 0.42);
}
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
.usage-section .usage-date-input {
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
.usage-section .dark-field .usage-date-input {
  color-scheme: dark;
}
.usage-section .usage-date-input::-webkit-calendar-picker-indicator {
  width: 18px;
  height: 18px;
  padding: 5px;
  margin-right: -2px;
  border-radius: 7px;
  opacity: .7;
  transition: background-color .15s ease, opacity .15s ease;
}
.usage-section .usage-date-input::-webkit-calendar-picker-indicator:hover {
  background-color: rgba(16, 185, 129, 0.12);
  opacity: 1;
}
</style>
