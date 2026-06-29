<template>
  <div class="w-full h-full flex flex-col min-h-0">
    <!-- Toolbar -->
    <div class="shrink-0 h-11 px-3 flex items-center justify-end gap-2"
      :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-white border-b border-bdrL'">
      <div class="flex items-center gap-2 shrink-0">
        <button class="tool-btn" @click="zoomOut" title="缩小" :disabled="!mindMapInstance" :class="isDark ? 'dark' : ''">
          <i class="ri-zoom-out-line"></i>
        </button>
        <div class="px-2 py-1 rounded-md text-[11px] font-bold w-[52px] text-center"
          :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-l3 text-lt-sub'">
          {{ zoomLevel }}%
        </div>
        <button class="tool-btn" @click="zoomIn" title="放大" :disabled="!mindMapInstance" :class="isDark ? 'dark' : ''">
          <i class="ri-zoom-in-line"></i>
        </button>
        <button class="tool-btn" @click="resetView" title="重置" :disabled="!mindMapInstance" :class="isDark ? 'dark' : ''">
          <i class="ri-restart-line"></i>
        </button>
        <button class="tool-btn" @click="fitView" title="适应" :disabled="!mindMapInstance" :class="isDark ? 'dark' : ''">
          <i class="ri-fullscreen-line"></i>
        </button>
        <button
          class="h-8 px-3 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :class="isDark ? 'bg-brand-400 text-white hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
          @click="exportImage"
          :disabled="!mindMapInstance"
        >
          <i class="ri-download-line text-[12px]" /> 导出 PNG
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 min-h-0 relative" :class="isDark ? 'bg-d2' : 'bg-white'">
      <div ref="mindmapWrapperRef" class="w-full h-full min-h-[360px] mindmap-wrapper"></div>

      <div v-show="internalLoading" class="absolute inset-0 flex items-center justify-center z-10"
        :class="isDark ? 'bg-d2/90' : 'bg-white/90'">
        <div class="text-center" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <i class="ri-loader-4-line animate-spin text-3xl"></i>
          <div class="mt-2 text-sm font-bold">加载思维导图中...</div>
        </div>
      </div>

      <div v-if="!mindmapRoot && !internalLoading" class="absolute inset-0 flex items-center justify-center z-10"
        :class="isDark ? 'bg-d2 text-wt-dim' : 'bg-white text-lt-aux'">
        <div class="text-center">
          <i class="ri-file-chart-line text-6xl opacity-30"></i>
          <div class="mt-3 text-sm font-bold">暂无思维导图数据</div>
        </div>
      </div>

      <div
        v-if="mindmapRoot && !internalLoading"
        class="absolute top-3 left-3 px-3 py-1.5 rounded-md text-[10px] shadow pointer-events-none"
        :class="isDark ? 'bg-emerald-400/90 text-white' : 'bg-emerald-500/90 text-white'"
      >
        拖拽画布移动，滚轮缩放
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  data: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})

const data = computed(() => props.data?.result_json || {})
const title = computed(() => data.value?.title || data.value?.mindmap?.label || 'Mindmap')
const mindmapRoot = computed(() => data.value?.mindmap || null)

const mindmapWrapperRef = ref(null)
const mindMapInstance = ref(null)
const zoomLevel = ref(100)
const internalLoading = ref(false)

let MindMapCtor = null
const themesRegistered = { light: false, dark: false }
let initToken = 0

const raf = () => new Promise((r) => requestAnimationFrame(() => r()))

const loadMindMap = async () => {
  if (MindMapCtor) return MindMapCtor
  const mod = await import('simple-mind-map')
  MindMapCtor = mod.default
  return MindMapCtor
}

const registerThemes = (MindMap) => {
  if (!themesRegistered.light) {
    themesRegistered.light = true
    MindMap.defineTheme('msPreviewLight', {
      backgroundColor: '#ffffff',
      paddingX: 26,
      paddingY: 14,
      lineWidth: 3,
      lineColor: '#10B981',
      lineStyle: 'curve',
      rootLineKeepSameInCurve: true,
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(16, 185, 129, 0.08) 1px, transparent 0)`,
      backgroundSize: '20px 20px',
      root: { shape: 'rectangle', fillColor: '#10B981', color: '#ffffff', fontSize: 26, fontWeight: 'bold', borderRadius: 12, padding: '16px 26px', lineHeight: 1.6, textAlign: 'center', textVerticalAlign: 'middle' },
      second: { shape: 'rectangle', marginX: 130, marginY: 50, fillColor: '#ECFDF5', color: '#065F46', fontSize: 20, fontWeight: '600', borderColor: '#34D399', borderWidth: 2, borderRadius: 10, padding: '12px 20px', lineHeight: 1.6, textAlign: 'center', textVerticalAlign: 'middle' },
      node: { shape: 'rectangle', marginX: 72, marginY: 30, fillColor: '#ffffff', color: '#065F46', fontSize: 16, fontWeight: '500', borderColor: '#A7F3D0', borderWidth: 1.5, borderRadius: 8, padding: '8px 16px', lineHeight: 1.6, textAlign: 'left', textVerticalAlign: 'middle' },
    })
  }
  if (!themesRegistered.dark) {
    themesRegistered.dark = true
    MindMap.defineTheme('msPreviewDark', {
      backgroundColor: '#161620',
      paddingX: 26,
      paddingY: 14,
      lineWidth: 3,
      lineColor: '#34D399',
      lineStyle: 'curve',
      rootLineKeepSameInCurve: true,
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(52, 211, 153, 0.12) 1px, transparent 0)`,
      backgroundSize: '20px 20px',
      root: { shape: 'rectangle', fillColor: '#10B981', color: '#ffffff', fontSize: 26, fontWeight: 'bold', borderRadius: 12, padding: '16px 26px', lineHeight: 1.6, textAlign: 'center', textVerticalAlign: 'middle' },
      second: { shape: 'rectangle', marginX: 130, marginY: 50, fillColor: '#1F2933', color: '#A7F3D0', fontSize: 20, fontWeight: '600', borderColor: '#34D399', borderWidth: 2, borderRadius: 10, padding: '12px 20px', lineHeight: 1.6, textAlign: 'center', textVerticalAlign: 'middle' },
      node: { shape: 'rectangle', marginX: 72, marginY: 30, fillColor: '#1A1F2C', color: '#D1FAE5', fontSize: 16, fontWeight: '500', borderColor: '#065F46', borderWidth: 1.5, borderRadius: 8, padding: '8px 16px', lineHeight: 1.6, textAlign: 'left', textVerticalAlign: 'middle' },
    })
  }
}

function transformMindmap(node) {
  const convert = (n) => ({
    data: { text: n.label || n.text || '未命名节点' },
    children: Array.isArray(n.children) ? n.children.map(convert) : []
  })
  return convert(node)
}

const destroyMindMap = () => {
  if (mindMapInstance.value) {
    try { mindMapInstance.value.destroy() } catch (_) {}
    mindMapInstance.value = null
  }
}

const updateZoomLevel = () => {
  const inst = mindMapInstance.value
  if (!inst?.view) return
  try {
    const scale = inst.view.getScale ? inst.view.getScale() : inst.view.scale
    if (typeof scale === 'number') zoomLevel.value = Math.round(scale * 100)
  } catch (_) {}
}

const initMindMap = async () => {
  const token = ++initToken
  const el = mindmapWrapperRef.value
  if (!el) return

  if (!mindmapRoot.value) {
    destroyMindMap()
    el.innerHTML = ''
    return
  }

  internalLoading.value = true
  try {
    await nextTick()
    await raf()
    if (token !== initToken) return

    const MindMap = await loadMindMap()
    if (token !== initToken) return

    registerThemes(MindMap)

    destroyMindMap()
    el.innerHTML = ''

    mindMapInstance.value = new MindMap({
      el,
      data: transformMindmap(mindmapRoot.value),
      fit: true,
      drag: true,
      zoom: true,
      mousewheel: true,
      zoomFactor: 0.15,
      theme: props.isDark ? 'msPreviewDark' : 'msPreviewLight',
      locale: 'zh',
      readonly: true,
      enableToolbar: false,
      enableContextMenu: false,
      enableMiniMap: false,
      enableSearch: false,
      enableNodeDrag: false,
      layout: 'logicalStructure',
      initRootNodePosition: ['center', 'center'],
      customInnerElsAppendTo: document.body
    })

    setTimeout(() => {
      try { mindMapInstance.value?.view?.fit?.() } catch (_) {}
      updateZoomLevel()
    }, 60)
  } finally {
    if (token === initToken) internalLoading.value = false
  }
}

const zoomIn = () => {
  const inst = mindMapInstance.value
  if (!inst?.view) return
  try {
    inst.view.zoomIn ? inst.view.zoomIn() : inst.view.enlarge?.()
    updateZoomLevel()
  } catch (_) {}
}

const zoomOut = () => {
  const inst = mindMapInstance.value
  if (!inst?.view) return
  try {
    inst.view.zoomOut ? inst.view.zoomOut() : inst.view.narrow?.()
    updateZoomLevel()
  } catch (_) {}
}

const resetView = () => {
  if (!mindmapRoot.value) return
  const inst = mindMapInstance.value
  if (!inst) return
  try {
    inst.setData(transformMindmap(mindmapRoot.value))
    zoomLevel.value = 100
    setTimeout(() => fitView(), 50)
  } catch (_) {}
}

const fitView = () => {
  const inst = mindMapInstance.value
  if (!inst) return
  try {
    inst.resize?.()
    inst.view?.fit?.()
    updateZoomLevel()
  } catch (_) {}
}

const exportImage = () => {
  const inst = mindMapInstance.value
  if (!inst) return
  try {
    inst.export('png', false, title.value || 'mindmap')
  } catch (e) {
    console.error('mindmap export failed:', e)
  }
}

const handleResize = () => {
  try { mindMapInstance.value?.resize?.() } catch (_) {}
}

watch(() => mindmapRoot.value, () => initMindMap(), { immediate: true, flush: 'post' })
watch(() => props.isDark, () => initMindMap())

onMounted(() => {
  window.addEventListener('resize', handleResize)
  initMindMap()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  destroyMindMap()
})
</script>

<style lang="scss" scoped>
.tool-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #ffffff;
  color: #71717a;
  transition: all 0.18s ease;
  font-size: 14px;
}
.tool-btn:hover:not(:disabled) {
  background: #f4f4f5;
  color: #10B981;
  border-color: #A7F3D0;
}
.tool-btn.dark {
  background: #1F2030;
  border-color: #2E2E3A;
  color: #B7B7C2;
}
.tool-btn.dark:hover:not(:disabled) {
  background: #2A2B3A;
  color: #34D399;
  border-color: rgba(52, 211, 153, 0.35);
}
.tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mindmap-wrapper {
  :deep(.smm-node-operate-btn),
  :deep(.smm-node-btn),
  :deep(.smm-edit-node),
  :deep(.smm-node-menu),
  :deep(.smm-toolbar),
  :deep(.smm-contextmenu) {
    display: none !important;
  }
  :deep(.smm-node) {
    cursor: default !important;
  }
}
</style>
