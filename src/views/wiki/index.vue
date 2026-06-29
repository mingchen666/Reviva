<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useElementSize, useEventListener, useLocalStorage, useWindowSize } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useWikiStore } from '@/stores/wiki'
import { useMessage } from '@/components/MsMessage/useMessage'
import MainContent from '@/components/layout/MainContent.vue'
import WikiSidebar from './sections/WikiSidebar.vue'
import WikiPageList from './sections/WikiPageList.vue'
import WikiReader from './sections/WikiReader.vue'
import WikiInspector from './sections/WikiInspector.vue'
import WikiCreateModal from './sections/WikiCreateModal.vue'
import WikiDeleteConfirmModal from './sections/WikiDeleteConfirmModal.vue'
import WikiSourceDeleteConfirmModal from './sections/WikiSourceDeleteConfirmModal.vue'
import WikiSourcePicker from './sections/WikiSourcePicker.vue'
import WikiAgentSettingsModal from './sections/WikiAgentSettingsModal.vue'

const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const wikiStore = useWikiStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)
const isReady = computed(() => settingsStore.isWorkspaceReady)
const selectedWiki = computed(() => wikiStore.currentWikiSummary)
const selectedAgent = computed(() => wikiStore.currentWiki?.agent || selectedWiki.value?.agent || null)
const { width: windowWidth } = useWindowSize()
const wikiRootRef = ref(null)
const { width: rootWidth } = useElementSize(wikiRootRef)
const layoutWidth = computed(() => rootWidth.value || windowWidth.value || 1280)
const isDesktopLayout = computed(() => layoutWidth.value > 860)

const SIDEBAR_MIN = 220
const SIDEBAR_DEFAULT = 282
const SIDEBAR_MAX = 380
const PAGE_LIST_MIN = 200
const PAGE_LIST_DEFAULT = 252
const PAGE_LIST_MAX = 420
const READER_MIN = 420
const RESIZE_GUTTERS = 12

const sidebarWidth = useLocalStorage('mindspace:wiki:sidebar-width', SIDEBAR_DEFAULT)
const pageListWidth = useLocalStorage('mindspace:wiki:page-list-width', PAGE_LIST_DEFAULT)
const activeResize = ref('')
const resizeState = {
  pointerId: null,
  target: null,
  startX: 0,
  startSidebarWidth: SIDEBAR_DEFAULT,
  startPageListWidth: PAGE_LIST_DEFAULT,
}
const sidebarMax = computed(() => Math.min(
  SIDEBAR_MAX,
  Math.max(SIDEBAR_MIN, layoutWidth.value - PAGE_LIST_MIN - READER_MIN - RESIZE_GUTTERS),
))
const pageListMax = computed(() => Math.min(
  PAGE_LIST_MAX,
  Math.max(PAGE_LIST_MIN, layoutWidth.value - Number(sidebarWidth.value || SIDEBAR_DEFAULT) - READER_MIN - RESIZE_GUTTERS),
))
const wikiShellStyle = computed(() => (
  isDesktopLayout.value
    ? { gridTemplateColumns: `${pageListWidth.value}px 6px minmax(0, 1fr)` }
    : {}
))

const showCreate = ref(false)
const showDelete = ref(false)
const showSourcePicker = ref(false)
const showSourceDelete = ref(false)
const showAgentSettings = ref(false)
const showInspectorDrawer = ref(false)
const createError = ref('')
const deleteError = ref('')
const sourceError = ref('')
const sourceDeleteError = ref('')
const sourceAdding = ref(false)
const deletingWiki = ref(false)
const deleteTarget = ref(null)
const sourceDeleteTarget = ref(null)
const deletingSourceId = ref('')
const reparseSourceId = ref('')
const ocrSourceId = ref('')
const refreshingWiki = ref(false)
let pollTimer = null
let polling = false

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min)))
}

function normalizeLayoutWidths() {
  if (!isDesktopLayout.value) return
  sidebarWidth.value = clamp(sidebarWidth.value, SIDEBAR_MIN, sidebarMax.value)
  pageListWidth.value = clamp(pageListWidth.value, PAGE_LIST_MIN, pageListMax.value)
}

function startResize(name, event) {
  if (!isDesktopLayout.value) return
  event?.preventDefault?.()
  event?.currentTarget?.setPointerCapture?.(event.pointerId)
  activeResize.value = name
  resizeState.pointerId = event?.pointerId ?? null
  resizeState.target = event?.currentTarget || null
  resizeState.startX = event?.clientX ?? 0
  resizeState.startSidebarWidth = Number(sidebarWidth.value || SIDEBAR_DEFAULT)
  resizeState.startPageListWidth = Number(pageListWidth.value || PAGE_LIST_DEFAULT)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResizeMove(event) {
  if (!activeResize.value || !isDesktopLayout.value) return
  if (resizeState.pointerId !== null && event.pointerId !== resizeState.pointerId) return
  event.preventDefault()

  const delta = event.clientX - resizeState.startX
  if (activeResize.value === 'sidebar') {
    sidebarWidth.value = clamp(resizeState.startSidebarWidth + delta, SIDEBAR_MIN, sidebarMax.value)
    pageListWidth.value = clamp(pageListWidth.value, PAGE_LIST_MIN, pageListMax.value)
    return
  }
  if (activeResize.value === 'pages') {
    pageListWidth.value = clamp(resizeState.startPageListWidth + delta, PAGE_LIST_MIN, pageListMax.value)
  }
}

function stopResize(event) {
  if (!activeResize.value) return
  if (resizeState.pointerId !== null && event?.pointerId !== undefined && event.pointerId !== resizeState.pointerId) return
  resizeState.target?.releasePointerCapture?.(resizeState.pointerId)
  activeResize.value = ''
  resizeState.pointerId = null
  resizeState.target = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

useEventListener(window, 'pointermove', handleResizeMove)
useEventListener(window, 'pointerup', stopResize)
useEventListener(window, 'pointercancel', stopResize)

watch(layoutWidth, normalizeLayoutWidths, { immediate: true })
watch(sidebarWidth, () => {
  if (!isDesktopLayout.value) return
  pageListWidth.value = clamp(pageListWidth.value, PAGE_LIST_MIN, pageListMax.value)
})

onMounted(async () => {
  if (!isReady.value) return
  await wikiStore.loadWikis()
  await wikiStore.loadOcrProviders().catch(() => {})
  if (wikiStore.currentWikiId) await wikiStore.openWiki(wikiStore.currentWikiId)
  startWikiPoller()
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  stopResize()
})

watch(() => settingsStore.workDirRoot, async (root) => {
  if (!root) return
  await wikiStore.loadWikis()
  await wikiStore.loadOcrProviders().catch(() => {})
  if (wikiStore.currentWikiId) await wikiStore.openWiki(wikiStore.currentWikiId)
  startWikiPoller()
})

async function createWiki(data) {
  createError.value = ''
  try {
    const created = await wikiStore.createWiki(data)
    showCreate.value = false
    await wikiStore.openWiki(created.id)
    msg.success('Wiki 已创建')
  } catch (err) {
    createError.value = err.message
    msg.error(err.message || '创建 Wiki 失败')
  }
}

function openDeleteWiki(wiki) {
  if (!wiki) return
  deleteTarget.value = wiki
  deleteError.value = ''
  showDelete.value = true
}

async function confirmDeleteWiki() {
  if (!deleteTarget.value || deletingWiki.value) return
  deletingWiki.value = true
  deleteError.value = ''
  try {
    await wikiStore.deleteWiki(deleteTarget.value.id)
    showDelete.value = false
    deleteTarget.value = null
    msg.success('Wiki 已删除')
  } catch (err) {
    deleteError.value = err.message || '删除 Wiki 失败'
    msg.error(deleteError.value)
  } finally {
    deletingWiki.value = false
  }
}

function openCreateModal() {
  createError.value = ''
  showCreate.value = true
}

async function openWiki(id) {
  await wikiStore.openWiki(id)
}

async function refreshWiki() {
  if (refreshingWiki.value) return
  refreshingWiki.value = true
  try {
    await wikiStore.refreshCurrentWiki()
  } catch (err) {
    const message = err.message || '刷新 Wiki 失败'
    wikiStore.error = message
    msg.error(message)
  } finally {
    setTimeout(() => {
      refreshingWiki.value = false
    }, 180)
  }
}

async function openPage(pagePath) {
  try {
    await wikiStore.readPage(resolveWikiPagePath(pagePath))
  } catch (err) {
    wikiStore.error = err.message
  }
}

function slugText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveWikiPagePath(inputPath) {
  const raw = String(inputPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!raw) return 'index.md'
  const pages = wikiStore.pages || []
  const exact = pages.find(page => page.path === raw)
  if (exact) return exact.path
  const withMd = raw.toLowerCase().endsWith('.md') ? raw : `${raw}.md`
  const exactMd = pages.find(page => page.path === withMd || page.path.endsWith(`/${withMd}`))
  if (exactMd) return exactMd.path
  const rawSlug = slugText(raw.replace(/\.md$/i, '').split('/').pop())
  const fuzzy = pages.find(page => {
    const titleSlug = slugText(page.title || '')
    const fileSlug = slugText(String(page.path || '').replace(/\.md$/i, '').split('/').pop())
    return titleSlug === rawSlug || fileSlug === rawSlug
  })
  return fuzzy?.path || withMd
}

function openSourcePicker() {
  if (!selectedWiki.value) return
  sourceError.value = ''
  showSourcePicker.value = true
}

async function addDocSource(filePath) {
  sourceError.value = ''
  sourceAdding.value = true
  try {
    const result = await wikiStore.addSource({ filePath })
    showSourcePicker.value = false
    msg.success(result?.duplicate ? '来源已存在' : '来源已加入解析队列')
  } catch (err) {
    sourceError.value = err.message
    msg.error(err.message || '添加来源失败')
  } finally {
    sourceAdding.value = false
  }
}

async function addNoteSource(noteId) {
  sourceError.value = ''
  sourceAdding.value = true
  try {
    const result = await wikiStore.addNoteSource(noteId)
    showSourcePicker.value = false
    msg.success(result?.duplicate ? '笔记来源已存在' : '笔记来源已添加')
  } catch (err) {
    sourceError.value = err.message
    msg.error(err.message || '添加笔记来源失败')
  } finally {
    sourceAdding.value = false
  }
}

async function reparseSource(sourceId) {
  if (!sourceId || reparseSourceId.value) return
  reparseSourceId.value = sourceId
  try {
    await wikiStore.reparseSource(sourceId)
    msg.success('来源已加入重新解析队列')
  } catch (err) {
    msg.error(err.message || '重新解析失败')
  } finally {
    reparseSourceId.value = ''
  }
}

async function runOcr(sourceId) {
  if (!sourceId || ocrSourceId.value) return
  ocrSourceId.value = sourceId
  try {
    await wikiStore.runOcr(sourceId)
    msg.success('OCR 解析已加入后台队列')
  } catch (err) {
    msg.error(err.message || 'OCR 解析失败')
  } finally {
    ocrSourceId.value = ''
  }
}

function openDeleteSource(source) {
  if (!source) return
  sourceDeleteTarget.value = source
  sourceDeleteError.value = ''
  showSourceDelete.value = true
}

async function confirmDeleteSource() {
  const source = sourceDeleteTarget.value
  if (!source?.id || deletingSourceId.value) return
  deletingSourceId.value = source.id
  sourceDeleteError.value = ''
  try {
    await wikiStore.deleteSource(source.id)
    showSourceDelete.value = false
    sourceDeleteTarget.value = null
    msg.success('来源已从 Wiki 移除')
  } catch (err) {
    sourceDeleteError.value = err.message || '移除来源失败'
    msg.error(sourceDeleteError.value)
  } finally {
    deletingSourceId.value = ''
  }
}

function hasActiveOcrWork() {
  return wikiStore.ocrJobs.some(job => ['pending', 'running'].includes(job.status)) ||
    wikiStore.sources.some(source => ['ocr_queued', 'ocr_running'].includes(source.parser_status))
}

function hasActiveWikiWork() {
  return hasActiveOcrWork() ||
    wikiStore.jobs.some(job => ['pending', 'running'].includes(job.status)) ||
    wikiStore.sources.some(source => ['extracting', 'changed'].includes(source.status) || ['pending', 'running'].includes(source.parser_status)) ||
    selectedAgent.value?.status === 'running'
}

function startWikiPoller() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (!wikiStore.currentWikiId || polling || !hasActiveWikiWork()) return
    polling = true
    try {
      await wikiStore.openWiki(wikiStore.currentWikiId)
    } finally {
      polling = false
    }
  }, 4500)
}

async function saveAgentConfig(config) {
  try {
    await wikiStore.updateAgentConfig(config)
    showAgentSettings.value = false
    msg.success('WikiAgent 配置已保存')
  } catch (err) {
    msg.error(err.message || '保存 WikiAgent 配置失败')
  }
}

function openOcrSettings() {
  router.push('/settings/ocr')
}
</script>

<template>
  <div ref="wikiRootRef" class="flex h-full overflow-hidden">
    <aside
      class="wiki-sidebar-shell shrink-0 flex flex-col overflow-hidden"
      :class="isDark ? 'bg-d1 border-d4' : 'bg-l1 border-bdrL'"
      :style="{ width: isDesktopLayout ? `${sidebarWidth}px` : '282px' }">
      <WikiSidebar
        :wikis="wikiStore.wikis"
        :current-wiki-id="wikiStore.currentWikiId"
        :is-ready="isReady"
        :is-dark="isDark"
        @create="openCreateModal"
        @open="openWiki"
        @delete="openDeleteWiki"
      />
    </aside>

    <div
      v-if="isDesktopLayout"
      class="wiki-resize-handle"
      :class="[isDark ? 'bg-d0' : 'bg-l0', activeResize === 'sidebar' ? 'is-active' : '']"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整 Wiki 列宽"
      @pointerdown="startResize('sidebar', $event)">
      <span />
    </div>

    <MainContent padding="p-0">
      <div class="wiki-shell h-full overflow-hidden" :class="isDark ? 'bg-d0' : 'bg-l0'" :style="wikiShellStyle">
        <div class="wiki-pages border-r" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <WikiPageList
            :root-pages="wikiStore.rootPages"
            :content-pages="wikiStore.contentPages"
            :current-page-path="wikiStore.currentPagePath"
            :has-wiki="!!selectedWiki"
            :refreshing="refreshingWiki"
            :is-dark="isDark"
            @open-page="openPage"
            @refresh="refreshWiki"
          />
        </div>

        <div
          v-if="isDesktopLayout"
          class="wiki-resize-handle wiki-resize-handle--inner"
          :class="[isDark ? 'bg-d0' : 'bg-l0', activeResize === 'pages' ? 'is-active' : '']"
          role="separator"
          aria-orientation="vertical"
          title="拖拽调整页面列表宽度"
          @pointerdown="startResize('pages', $event)">
          <span />
        </div>

        <div class="wiki-reader min-w-0">
          <WikiReader
            :wiki="selectedWiki"
            :agent="selectedAgent"
            :page="wikiStore.currentPage"
            :error="wikiStore.error"
            :source-error="sourceError"
            :is-dark="isDark"
            @add-source="openSourcePicker"
            @open-page="openPage"
            @open-status="showInspectorDrawer = true"
            @configure-agent="showAgentSettings = true"
          />
        </div>

        <Transition name="drawer-fade">
          <div v-if="showInspectorDrawer" class="drawer-layer">
            <div class="drawer-backdrop" @click="showInspectorDrawer = false" />
            <div class="wiki-inspector drawer-panel border-l" :class="isDark ? 'border-d4 shadow-[0_20px_60px_rgba(0,0,0,0.36)]' : 'border-bdrL shadow-[0_20px_60px_rgba(15,23,42,0.16)]'">
              <button
                class="drawer-close h-8 w-8 rounded-md"
                :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l4'"
                title="关闭"
                @click="showInspectorDrawer = false">
                <i class="ri-close-line text-[16px]" />
              </button>
              <WikiInspector
                :wiki="selectedWiki"
                :agent="selectedAgent"
                :sources="wikiStore.sources"
                :jobs="wikiStore.jobs"
                :ocr-providers="wikiStore.ocrProviders"
                :ocr-jobs="wikiStore.ocrJobs"
                :reparse-source-id="reparseSourceId"
                :ocr-source-id="ocrSourceId"
                :delete-source-id="deletingSourceId"
                :is-dark="isDark"
                @configure-ocr="openOcrSettings"
                @reparse-source="reparseSource"
                @run-ocr="runOcr"
                @delete-source="openDeleteSource"
              />
            </div>
          </div>
        </Transition>
      </div>
    </MainContent>

    <WikiCreateModal
      :show="showCreate"
      :is-dark="isDark"
      :external-error="createError"
      @close="showCreate = false"
      @create="createWiki"
    />

    <WikiDeleteConfirmModal
      :show="showDelete"
      :wiki="deleteTarget"
      :is-dark="isDark"
      :busy="deletingWiki"
      :external-error="deleteError"
      @close="showDelete = false"
      @confirm="confirmDeleteWiki"
    />

    <WikiSourceDeleteConfirmModal
      :show="showSourceDelete"
      :source="sourceDeleteTarget"
      :is-dark="isDark"
      :busy="!!deletingSourceId"
      :external-error="sourceDeleteError"
      @close="showSourceDelete = false"
      @confirm="confirmDeleteSource"
    />

    <WikiSourcePicker
      :show="showSourcePicker"
      :is-dark="isDark"
      :busy="sourceAdding"
      :external-error="sourceError"
      @close="showSourcePicker = false"
      @add-doc="addDocSource"
      @add-note="addNoteSource"
    />

    <WikiAgentSettingsModal
      :show="showAgentSettings"
      :agent="selectedAgent"
      :model-options="settingsStore.chatModelOptions"
      :default-model-label="settingsStore.getModelName(settingsStore.defaultModels.chat)"
      :is-dark="isDark"
      @close="showAgentSettings = false"
      @save="saveAgentConfig"
    />

  </div>
</template>

<style scoped>
.wiki-sidebar-shell {
  min-width: 220px;
  max-width: 380px;
  border-right-width: 1px;
}
.wiki-shell {
  display: grid;
  position: relative;
  grid-template-columns: 252px 6px minmax(0, 1fr);
}
.wiki-pages,
.wiki-reader {
  min-height: 0;
  overflow: hidden;
}
.wiki-resize-handle {
  position: relative;
  width: 6px;
  min-width: 6px;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  touch-action: none;
  z-index: 12;
}
.wiki-resize-handle--inner {
  z-index: 6;
}
.wiki-resize-handle span {
  position: absolute;
  inset: 0 1px;
  border-radius: 999px;
  background: transparent;
  transition: background-color 0.16s ease, transform 0.16s ease;
}
.wiki-resize-handle:hover span,
.wiki-resize-handle.is-active span {
  background: rgba(74, 108, 255, 0.32);
  transform: scaleX(1.12);
}
.drawer-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}
.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 20, 0.30);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  pointer-events: auto;
}
.drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: min(360px, 92vw);
  height: 100%;
  pointer-events: auto;
}
.drawer-close {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.16s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
.drawer-fade-enter-active .drawer-panel,
.drawer-fade-leave-active .drawer-panel {
  transition: transform 0.18s ease;
}
.drawer-fade-enter-from .drawer-panel,
.drawer-fade-leave-to .drawer-panel {
  transform: translateX(18px);
}
@media (max-width: 1180px) {
  .wiki-shell {
    grid-template-columns: 220px 6px minmax(0, 1fr);
  }
}
@media (max-width: 860px) {
  .wiki-shell {
    grid-template-columns: minmax(0, 1fr);
  }
  .wiki-pages {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wiki-resize-handle span {
    transition: none;
  }
}
</style>
