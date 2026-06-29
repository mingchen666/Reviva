<template>
  <div class="w-full h-full flex flex-col min-h-0">
    <!-- Toolbar -->
    <div class="shrink-0 h-11 px-3 flex items-center justify-end gap-2 backdrop-blur-sm"
      :class="isDark ? 'bg-d3/95 border-b border-d4' : 'bg-white/95 border-b border-zinc-200/60 shadow-sm'">
      <div class="flex items-center gap-2 shrink-0">
        <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="zoomOut" title="缩小" :disabled="!graphInstance">
          <i class="ri-zoom-out-line"></i>
        </button>
        <div class="px-2 py-1 rounded-lg text-[11px] font-bold w-[52px] text-center"
          :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-zinc-100 text-zinc-700'">
          {{ zoomLevel }}%
        </div>
        <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="zoomIn" title="放大" :disabled="!graphInstance">
          <i class="ri-zoom-in-line"></i>
        </button>
        <button class="tool-btn" :class="isDark ? 'dark' : ''" @click="resetView" title="重置视图" :disabled="!graphInstance">
          <i class="ri-restart-line"></i>
        </button>

        <select
          v-model="layoutType"
          @change="applyLayout"
          class="layout-select"
          :class="isDark ? 'dark' : ''"
          :disabled="!graphInstance"
          title="切换布局"
        >
          <option v-for="opt in layoutOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <button
          class="h-8 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 shadow-sm"
          :class="isDark ? 'bg-amber-500 text-white hover:bg-amber-600 hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600'"
          @click="exportImage"
          :disabled="!graphInstance"
        >
          <i class="ri-download-line text-[13px]" /> 导出 PNG
        </button>
      </div>
    </div>

    <!-- Body - 图谱容器 -->
    <div class="flex-1 min-h-0 relative overflow-hidden" :class="isDark ? 'bg-d2' : 'bg-gradient-to-br from-slate-50 via-indigo-50/20 to-purple-50/10'">
      <div ref="graphContainerRef" class="w-full h-full min-h-[360px]"></div>

      <!-- Loading 状态 -->
      <div v-show="internalLoading" class="absolute inset-0 flex items-center justify-center z-20 backdrop-blur-sm"
        :class="isDark ? 'bg-d2/90' : 'bg-white/90'">
        <div class="text-center" :class="isDark ? 'text-wt-aux' : 'text-zinc-600'">
          <i class="ri-loader-4-line animate-spin text-4xl"></i>
          <div class="mt-3 text-sm font-bold">加载知识图谱中...</div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!graphRaw && !internalLoading" class="absolute inset-0 flex items-center justify-center z-20"
        :class="isDark ? 'bg-d2 text-wt-dim' : 'bg-white text-zinc-400'">
        <div class="text-center">
          <i class="ri-file-chart-line text-6xl opacity-30"></i>
          <div class="mt-3 text-sm font-bold">暂无图谱数据</div>
        </div>
      </div>

      <!-- 操作提示 - 左上角 -->
      <div
        v-if="graphRaw && !internalLoading"
        class="absolute top-4 left-4 px-3 py-2 rounded-xl text-[11px] font-bold shadow-lg pointer-events-none backdrop-blur-md z-10"
        :class="isDark ? 'bg-amber-500/90 text-white border border-amber-400/30' : 'bg-amber-500/95 text-white border border-amber-400/20'"
      >
        <i class="ri-information-line mr-1" />
        拖拽节点移动 · 滚轮缩放 · 点击查看详情
      </div>

      <!-- 悬浮信息面板 - 右侧悬浮 -->
      <Transition name="slide-panel">
        <div
          v-if="selected"
          class="absolute top-4 right-4 bottom-4 w-80 z-30"
        >
          <GraphInfoPanel
            :selected="selected"
            :is-dark="isDark"
            @close="closePanel"
          />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { Graph } from '@antv/g6'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import GraphInfoPanel from './GraphInfoPanel.vue'

const props = defineProps({
  data: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})
const data = computed(() => props.data?.result_json || {})
const title = computed(() => data.value?.title || 'Knowledge Graph')
const graphRaw = computed(() => data.value?.graph || null)

const graphContainerRef = ref(null)
const graphInstance = shallowRef(null)

const internalLoading = ref(false)
const zoomLevel = ref(100)
const selected = ref(null)

const layoutType = ref('force')
const layoutOptions = [
  { value: 'force', label: '力导向' },
  { value: 'radial', label: '辐射' },
  { value: 'dagre', label: '层次' },
  { value: 'concentric', label: '同心圆' },
  { value: 'grid', label: '网格' },
  { value: 'circular', label: '环形' },
  { value: 'fruchterman', label: '聚类' }
]

const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
let initToken = 0

const getLayoutConfig = (type) => {
  const map = {
    force: { type: 'force', charge: 20, preventOverlap: true },
    radial: { type: 'radial', preventOverlap: true },
    dagre: { type: 'dagre', rankdir: 'LR', nodesep: 80, ranksep: 100, controlPoints: true },
    concentric: { type: 'concentric', preventOverlap: true, sortBy: 'degree', minNodeSpacing: 60 },
    grid: { type: 'grid', preventOverlap: true, nodeSize: 40 },
    circular: { type: 'circular', radius: 240, preventOverlap: true, nodeSize: 40, ordering: 'degree' },
    fruchterman: { type: 'fruchterman', preventOverlap: true, gravity: 10, speed: 5, maxIteration: 500, workerEnabled: true }
  }
  return map[type] || map.force
}

const formatChartData = (raw) => {
  if (!raw) return { nodes: [], edges: [] }
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((n) => {
        const color = n?.data?.attributes?.color || n?.data?.color || '#4ECDC4'
        return {
          id: n.id,
          data: {
            name: n?.data?.name || n?.label || n?.name || n.id,
            description: n?.data?.description || n?.description || '',
            entityType: n?.data?.entityType || n?.entityType || 'concept',
            attributes: n?.data?.attributes || {},
            color
          },
          style: { fill: color, stroke: color, labelFill: '#ffffff' }
        }
      })
    : []

  const edges = Array.isArray(raw.edges)
    ? raw.edges.map((e, idx) => {
        const edgeColor = e?.data?.attributes?.color || e?.data?.color || (props.isDark ? '#7DD3FC' : '#69c0ff')
        return {
          id: e.id || `edge-${idx}`,
          source: e.source,
          target: e.target,
          data: {
            name: e?.data?.name || e?.label || '',
            description: e?.data?.description || e?.description || '',
            attributes: e?.data?.attributes || {},
            color: edgeColor
          },
          style: { stroke: edgeColor, labelFill: edgeColor }
        }
      })
    : []

  return { nodes, edges }
}

const destroyGraph = () => {
  if (graphInstance.value) {
    try { graphInstance.value.destroy() } catch (_) {}
    graphInstance.value = null
  }
}

const updateZoomLevel = () => {
  const g = graphInstance.value
  if (!g) return
  try { zoomLevel.value = Math.round(g.getZoom() * 100) } catch (_) {}
}

const initGraph = async () => {
  const token = ++initToken
  const el = graphContainerRef.value
  if (!el) return

  if (!graphRaw.value) {
    selected.value = null
    destroyGraph()
    el.innerHTML = ''
    return
  }

  internalLoading.value = true
  try {
    await nextTick()
    await raf()
    if (token !== initToken) return

    el.style.width = '100%'
    el.style.height = '100%'

    selected.value = null
    destroyGraph()
    el.innerHTML = ''

    const chartData = formatChartData(graphRaw.value)
    const labelBg = props.isDark ? '#1A1A24' : '#fff'
    const labelStroke = props.isDark ? '#3a3a48' : '#cbd5e1'

    graphInstance.value = new Graph({
      container: el,
      data: chartData,
      padding: 20,

      node: {
        style: {
          size: (d) => {
            try {
              const degree = graphInstance.value ? graphInstance.value.getRelatedEdgesData(d.id).length : 0
              return Math.min(120, 60 + degree * 10)
            } catch (_) { return 60 }
          },
          labelText: (d) => d.data?.name || d.label || d.id || '未知节点',
          labelFill: (d) => d.style?.labelFill || '#ffffff',
          labelFontSize: (d) => {
            const size = graphInstance.value?.getNodeData(d.id)?.style?.size || 60
            return Math.max(12, Math.min(16, size / 5))
          },
          labelPlacement: 'center',
          labelWordWrap: true,
          labelMaxWidth: (d) => {
            const size = graphInstance.value?.getNodeData(d.id)?.style?.size || 60
            return size * 0.95
          },
          labelMaxLines: 4,
          ports: []
        },
        palette: { type: 'group', field: 'data.entityType' }
      },

      edge: {
        style: {
          label: true,
          labelAutoRotate: true,
          labelText: (edge) => edge.data?.name || edge.label || '',
          endArrow: true,
          labelWordWrap: true,
          labelPlacement: 'center',
          labelMaxWidth: '95%',
          labelMaxLines: 3,
          labelBackground: true,
          labelBackgroundPadding: [2, 2, 2, 2],
          labelBackgroundFill: labelBg,
          labelFill: (edge) => edge.style?.labelFill || edge.data?.color || (props.isDark ? '#A1A1AA' : '#64748b'),
          labelBackgroundStroke: labelStroke,
          labelBackgroundStrokeWidth: 1,
          labelBackgroundOpacity: 0.75
        }
      },

      layout: getLayoutConfig(layoutType.value),

      behaviors: [
        'zoom-canvas',
        { type: 'drag-element', key: 'drag-element' },
        { type: 'drag-canvas', key: 'drag-canvas' },
        {
          type: 'click-select',
          key: 'click-select',
          multiple: false,
          onClick: (event) => {
            const { targetType, target } = event || {}
            const g = graphInstance.value
            if (!g) return

            if (targetType === 'node') {
              const node = g.getNodeData(target.id) || target
              const attrs = node?.data?.attributes || {}
              selected.value = {
                type: 'node',
                id: node.id,
                name: node?.data?.name || node?.label || node.id,
                description: node?.data?.description || '',
                entityType: node?.data?.entityType || '',
                tags: attrs.tags || [],
                field: attrs.field || ''
              }
            } else if (targetType === 'edge') {
              const edge = g.getEdgeData(target.id) || target
              const sourceId = edge?.source?.id || edge?.source
              const targetId = edge?.target?.id || edge?.target
              const sourceName = g.getNodeData(sourceId)?.data?.name || sourceId
              const targetName = g.getNodeData(targetId)?.data?.name || targetId
              selected.value = {
                type: 'edge',
                id: edge.id,
                name: edge?.data?.name || edge?.label || edge.id,
                description: edge?.data?.description || '',
                source: sourceId, target: targetId, sourceName, targetName
              }
            } else if (targetType === 'canvas') {
              selected.value = null
            }
          }
        }
      ],

      plugins: [
        {
          type: 'tooltip',
          trigger: 'mouseenter',
          offset: 10,
          formatter: (model) => {
            if (model.dataType === 'node') {
              const name = model.data?.name || model.label || model.id
              const desc = model.data?.description || ''
              return `<div style="padding:8px;max-width:300px;"><div><strong style="font-size:13px;">${escapeHtml(name)}</strong></div>${desc ? `<div style="margin-top:4px;font-size:12px;line-height:1.4;">${escapeHtml(desc).slice(0,200)}${desc.length>200?'...':''}</div>` : ''}</div>`
            }
            if (model.dataType === 'edge') {
              const rel = model.data?.name || ''
              return `<div style="padding:6px;"><div><strong>${escapeHtml(model.source?.data?.name || model.source?.id)} → ${escapeHtml(model.target?.data?.name || model.target?.id)}</strong></div>${rel ? `<div style="margin-top:2px;">${escapeHtml(rel)}</div>` : ''}</div>`
            }
            return ''
          }
        }
      ],

      transforms: ['process-parallel-edges']
    })

    graphInstance.value.render()
    graphInstance.value.fitView()
    updateZoomLevel()

    graphInstance.value.on('viewportchange', (evt) => {
      if (evt?.action === 'zoom') updateZoomLevel()
    })
  } finally {
    if (token === initToken) internalLoading.value = false
  }
}

const zoomIn = () => { const g = graphInstance.value; if (!g) return; g.zoomBy(1.2, { duration: 200 }); updateZoomLevel() }
const zoomOut = () => { const g = graphInstance.value; if (!g) return; g.zoomBy(0.8, { duration: 200 }); updateZoomLevel() }
const resetView = () => { const g = graphInstance.value; if (!g) return; selected.value = null; g.fitView(); zoomLevel.value = 100 }
const applyLayout = () => {
  const g = graphInstance.value; if (!g) return
  g.setLayout(getLayoutConfig(layoutType.value)); g.layout()
  g.once?.('afterlayout', () => g.fitView())
}
const exportImage = () => {
  const g = graphInstance.value; if (!g) return
  g.toDataURL('image/png', { backgroundColor: props.isDark ? '#161620' : '#ffffff', padding: 20 })
    .then((dataURL) => {
      const a = document.createElement('a')
      a.download = sanitizeFileName(`graph-${title.value}-${Date.now()}.png`)
      a.href = dataURL
      a.click()
    })
    .catch((err) => console.error('exportImage error:', err))
}

const closePanel = () => {
  selected.value = null
}

const handleResize = async () => {
  await nextTick()
  try { graphInstance.value?.resize() } catch (_) {}
}

watch(() => graphRaw.value, () => initGraph(), { immediate: true, flush: 'post' })
watch(() => props.isDark, () => initGraph())

onMounted(() => {
  window.addEventListener('resize', handleResize)
  initGraph()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  destroyGraph()
})

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
function sanitizeFileName(name = 'file') {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
}
</script>

<style lang="scss" scoped>
.tool-btn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px; border: 1px solid #e4e4e7; background: #ffffff; color: #71717a;
  transition: all 0.18s ease; font-size: 14px;
}
.tool-btn:hover:not(:disabled) {
  background: #f4f4f5; color: #F59E0B; border-color: #FCD34D;
  transform: scale(1.05);
}
.tool-btn.dark { background: #1F2030; border-color: #2E2E3A; color: #B7B7C2; }
.tool-btn.dark:hover:not(:disabled) {
  background: #2A2B3A; color: #FCD34D; border-color: rgba(252, 211, 77, 0.35);
  transform: scale(1.05);
}
.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.layout-select {
  height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid #e4e4e7;
  background: #ffffff; font-size: 11px; font-weight: 700; color: #71717a;
  outline: none; cursor: pointer; transition: all 0.18s ease;
}
.layout-select:hover:not(:disabled) { background: #f4f4f5; border-color: #d4d4d8; }
.layout-select.dark { background: #1F2030; border-color: #2E2E3A; color: #B7B7C2; }
.layout-select.dark:hover:not(:disabled) { background: #2A2B3A; border-color: #3a3a48; }

.slide-panel-enter-active, .slide-panel-leave-active { 
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel-enter-from, .slide-panel-leave-to { 
  transform: translateX(20px);
  opacity: 0;
}
</style>