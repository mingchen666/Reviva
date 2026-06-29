<template>
  <div class="w-full h-full flex min-h-0" :class="isDark ? 'bg-d2' : 'bg-slate-50'">
    <aside class="w-[280px] shrink-0 flex flex-col min-h-0"
      :class="isDark ? 'bg-d3 border-r border-d4' : 'bg-white border-r border-slate-200'">
      <div class="p-4" :class="isDark ? 'border-b border-d4' : 'border-b border-slate-100'">
        <div class="text-sm font-semibold" :class="isDark ? 'text-wt-main' : 'text-slate-800'">图表列表</div>
        <div class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
          {{ charts.length }} 个图表
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        <button v-for="(chart, i) in charts" :key="chart.id || i"
          class="w-full flex items-center gap-2 p-2.5 rounded-lg transition-all text-left border"
          :class="(chart.id || String(i)) === activeId
            ? (isDark ? 'border-sky-400/40 bg-sky-400/10' : 'border-sky-300 bg-sky-50')
            : (isDark ? 'border-d4 hover:border-sky-400/25 hover:bg-white/4' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')"
          @click="selectChart(chart, i)">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-sky-400/10 text-sky-300' : 'bg-sky-50 text-sky-600'">
            <i :class="iconForType(chart.type)" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-slate-800'">
              {{ chart.title || 'Untitled' }}
            </div>
            <div class="text-[10px] mt-0.5 truncate" :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
              {{ typeLabel(chart.type) }}
            </div>
          </div>
          <div class="w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-slate-200 text-slate-600'">
            {{ i + 1 }}
          </div>
        </button>

        <div v-if="!charts.length" class="text-center py-16 text-sm" :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
          暂无图表
        </div>
      </div>
    </aside>

    <main class="flex-1 min-w-0 flex flex-col min-h-0">
      <div class="h-14 px-4 flex items-center justify-between gap-3 shrink-0"
        :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-white border-b border-slate-100'">
        <div class="min-w-0">
          <div class="text-sm font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-slate-800'">
            {{ activeChart?.title || data.title || '图表预览' }}
          </div>
          <div v-if="activeChart?.summary" class="text-[11px] truncate mt-0.5"
            :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
            {{ activeChart.summary }}
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="zoomOut" title="缩小">
            <i class="ri-subtract-line" />
          </button>
          <div class="px-2 text-[11px] tabular-nums select-none w-[56px] text-center"
            :class="isDark ? 'text-wt-dim' : 'text-slate-500'">
            {{ zoomPercent }}
          </div>
          <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="zoomIn" title="放大">
            <i class="ri-add-line" />
          </button>
          <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="resetZoom" title="重置">
            <i class="ri-refresh-line" />
          </button>
          <button v-if="activeSvg" class="h-8 px-3 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors"
            :class="isDark ? 'border-d4 text-wt-sub hover:bg-d4' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
            @click="downloadSvg">
            <i class="ri-download-line" />
            SVG
          </button>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden p-4">
        <div v-if="!activeChart" class="w-full h-full flex flex-col items-center justify-center"
          :class="isDark ? 'text-wt-dim' : 'text-slate-400'">
          <i class="ri-bar-chart-line text-4xl mb-2" />
          <div class="text-sm">请选择图表</div>
        </div>

        <div v-else class="w-full h-full flex flex-col gap-3 min-h-0">
          <div class="flex-1 min-h-0 rounded-xl overflow-auto relative chart-canvas"
            :class="isDark ? 'bg-d2 border border-d4' : 'bg-white border border-slate-200'">
            <div v-if="activeSvg" class="min-w-full min-h-full flex items-center justify-center p-4">
              <div class="svg-wrap" :style="{ transform: `scale(${zoom})` }" v-html="activeSvg" />
            </div>
            <div v-else class="w-full h-full flex flex-col items-center justify-center text-sm"
              :class="isDark ? 'text-red-300' : 'text-red-500'">
              <i class="ri-error-warning-line text-3xl mb-2" />
              SVG 解析失败或包含不安全内容
            </div>
          </div>

          <details v-if="activeInsights.length" open class="rounded-xl shrink-0"
            :class="isDark ? 'bg-d3 border border-d4' : 'bg-white border border-slate-200'">
            <summary class="px-4 py-3 cursor-pointer select-none text-sm font-medium flex items-center gap-2"
              :class="isDark ? 'text-wt-sub' : 'text-slate-700'">
              <i class="ri-lightbulb-line text-amber-500" />
              洞察 ({{ activeInsights.length }})
            </summary>
            <ul class="px-4 pb-3 pt-1 space-y-2 text-xs" :class="isDark ? 'text-wt-sub' : 'text-slate-600'">
              <li v-for="(item, i) in activeInsights" :key="i" class="flex gap-2">
                <span :class="isDark ? 'text-wt-dim' : 'text-slate-400'">·</span>
                <span>{{ item }}</span>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const data = computed(() => props.data?.result_json || {})
const charts = computed(() => Array.isArray(data.value.charts) ? data.value.charts : [])
const activeId = ref('')
const zoom = ref(1)

watch(
  charts,
  (list) => {
    if (!list.length) {
      activeId.value = ''
      return
    }
    const exists = list.some((chart, i) => (chart.id || String(i)) === activeId.value)
    if (!exists) activeId.value = list[0].id || '0'
    zoom.value = 1
  },
  { immediate: true },
)

const activeChart = computed(() =>
  charts.value.find((chart, i) => (chart.id || String(i)) === activeId.value) || null
)

const activeSvg = computed(() => sanitizeSvg(activeChart.value?.svg || activeChart.value?.syntax || ''))
const activeInsights = computed(() => {
  if (Array.isArray(activeChart.value?.insights)) return activeChart.value.insights.filter(Boolean)
  if (Array.isArray(data.value.insights)) return data.value.insights.filter(Boolean)
  return []
})
const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`)

function selectChart(chart, index) {
  activeId.value = chart.id || String(index)
  zoom.value = 1
}

function zoomIn() {
  zoom.value = Math.min(3, Math.round((zoom.value + 0.15) * 100) / 100)
}

function zoomOut() {
  zoom.value = Math.max(0.35, Math.round((zoom.value - 0.15) * 100) / 100)
}

function resetZoom() {
  zoom.value = 1
}

function typeLabel(type) {
  const map = {
    infographic: '信息图',
    knowledge_card: '知识卡片',
    key_number: '关键数字',
    flow: '流程图',
    timeline: '时间线',
    comparison: '对比图',
    matrix: '矩阵图',
    structure: '结构图',
    bar: '柱状图',
    stacked_bar: '堆叠柱状图',
    line: '折线图',
    area: '面积图',
    pie: '饼图',
    donut: '环形图',
    scatter: '散点图',
    bubble: '气泡图',
    radar: '雷达图',
    gauge: '仪表盘',
    funnel: '漏斗图',
    waterfall: '瀑布图',
    heatmap: '热力图',
    treemap: '树图',
    sankey: '桑基图',
    table: '表格',
    other: '图表',
  }
  return map[String(type || '').toLowerCase()] || type || '图表'
}

function iconForType(type) {
  const map = {
    infographic: 'ri-dashboard-2-line',
    knowledge_card: 'ri-sticky-note-line',
    key_number: 'ri-hashtag',
    flow: 'ri-flow-chart',
    timeline: 'ri-timeline-view',
    comparison: 'ri-scales-3-line',
    matrix: 'ri-grid-line',
    structure: 'ri-node-tree',
    bar: 'ri-bar-chart-2-line',
    stacked_bar: 'ri-bar-chart-grouped-line',
    line: 'ri-line-chart-line',
    area: 'ri-line-chart-line',
    pie: 'ri-pie-chart-2-line',
    donut: 'ri-pie-chart-2-line',
    scatter: 'ri-bubble-chart-line',
    bubble: 'ri-bubble-chart-line',
    radar: 'ri-radar-line',
    gauge: 'ri-speed-up-line',
    funnel: 'ri-filter-3-line',
    waterfall: 'ri-bar-chart-horizontal-line',
    heatmap: 'ri-grid-line',
    treemap: 'ri-layout-grid-line',
    sankey: 'ri-route-line',
    table: 'ri-table-line',
  }
  return `${map[String(type || '').toLowerCase()] || 'ri-bar-chart-box-line'} text-[15px]`
}

function sanitizeSvg(raw) {
  const input = String(raw || '').trim()
  if (!input) return ''
  const match = input.match(/<svg[\s\S]*<\/svg>/i)
  if (!match) return ''

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return ''
  const doc = new DOMParser().parseFromString(match[0], 'image/svg+xml')
  const svg = doc.querySelector('svg')
  if (!svg || doc.querySelector('parsererror')) return ''

  const allowedTags = new Set([
    'svg', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop',
    'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
    'text', 'tspan', 'title', 'desc',
  ])
  const blockedAttrs = new Set(['href', 'xlink:href', 'src', 'style'])

  for (const node of [...svg.querySelectorAll('*')]) {
    const tag = node.tagName.toLowerCase()
    if (!allowedTags.has(tag)) {
      node.remove()
      continue
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      const value = String(attr.value || '')
      if (
        name.startsWith('on') ||
        blockedAttrs.has(name) ||
        /javascript\s*:|data\s*:|url\s*\(\s*(?!#[A-Za-z0-9_-]+\s*\))/i.test(value)
      ) {
        node.removeAttribute(attr.name)
      }
    }
  }

  for (const attr of [...svg.attributes]) {
    const name = attr.name.toLowerCase()
    const value = String(attr.value || '')
    if (name.startsWith('on') || blockedAttrs.has(name) || /javascript\s*:|data\s*:|url\s*\(\s*(?!#[A-Za-z0-9_-]+\s*\))/i.test(value)) {
      svg.removeAttribute(attr.name)
    }
  }

  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!svg.getAttribute('viewBox')) {
    const width = Number.parseFloat(svg.getAttribute('width') || '1200') || 1200
    const height = Number.parseFloat(svg.getAttribute('height') || '800') || 800
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  if (!svg.getAttribute('preserveAspectRatio')) svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  return new XMLSerializer().serializeToString(svg)
}

function downloadSvg() {
  if (!activeSvg.value) return
  const blob = new Blob([activeSvg.value], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${activeChart.value?.title || 'chart'}.svg`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.tool-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-size: 14px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.tool-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #0f172a;
}
.tool-btn.dark {
  background: rgba(255, 255, 255, 0.04);
  border-color: #2e2e3a;
  color: rgba(255, 255, 255, 0.68);
}
.tool-btn.dark:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
}
.chart-canvas {
  overscroll-behavior: contain;
}
.svg-wrap {
  width: min(100%, 1100px);
  transform-origin: center center;
  transition: transform 0.16s ease;
}
:deep(svg) {
  width: 100% !important;
  height: auto !important;
  max-height: calc(88vh - 180px);
  display: block;
  shape-rendering: geometricPrecision;
  text-rendering: geometricPrecision;
}
:deep(svg text),
:deep(svg tspan) {
  user-select: none;
  -webkit-user-select: none;
}
</style>
