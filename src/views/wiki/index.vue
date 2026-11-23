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
import WikiReviewPanel from './sections/WikiReviewPanel.vue'
import WikiChecksPanel from './sections/WikiChecksPanel.vue'
import WikiCreateModal from './sections/WikiCreateModal.vue'
import WikiDeleteConfirmModal from './sections/WikiDeleteConfirmModal.vue'
import WikiSourceDeleteConfirmModal from './sections/WikiSourceDeleteConfirmModal.vue'
import WikiSourcePicker from './sections/WikiSourcePicker.vue'
import WikiAgentSettingsModal from './sections/WikiAgentSettingsModal.vue'
import PdfProcessingSettingsModal from '@/views/docs/sections/PdfProcessingSettingsModal.vue'
import MediaDetailModal from '@/components/media/MediaDetailModal.vue'

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

const sidebarWidth = useLocalStorage('reviva:wiki:sidebar-width', SIDEBAR_DEFAULT)
const pageListWidth = useLocalStorage('reviva:wiki:page-list-width', PAGE_LIST_DEFAULT)
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
const reviewInspectorTab = ref('status')
const showDocumentProcessingSettings = ref(false)
const showMediaDetail = ref(false)
const readerMode = ref('page')
const mediaDetailItem = ref(null)
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
const lintingWiki = ref(false)
const auditingWiki = ref(false)
const maintainingWiki = ref(false)
const loadingProposals = ref(false)
const reviewBusy = ref(false)
const evaluatingWiki = ref(false)
const selectedProposal = ref(null)
const reviewActionError = ref('')
let inspectorVersion = 0
let proposalSelectionRequest = 0
let pollTimer = null
let polling = false
let pollGraceTicks = 0
let webJobUpdatedHandler = null
const wikiWebSettings = ref(null)
const wikiWebProviders = ref([])
const wikiWebJobs = ref([])
const wikiWebSubmitting = ref(false)
const wikiPdfSettings = ref({ pdfEngine: 'auto', uploadAction: 'ask', defaultOcrProvider: 'auto', missingPythonFallback: 'ocr_provider', largePdfMode: 'adaptive', allowFullDocumentOcr: true, allowPaddleFullDocumentForPageRanges: true, mediaAction: 'manual' })

async function loadWikiWebSettings() {
  const result = await window.electronAPI?.webImport?.getSettings?.()
  if (result?.success) { wikiWebSettings.value = result.data; wikiWebProviders.value = result.providers || [] }
}

async function loadWikiWebJobs() {
  if (!wikiStore.currentWikiId) { wikiWebJobs.value = []; return }
  const version = inspectorVersion
  const wikiId = wikiStore.currentWikiId
  const result = await window.electronAPI?.webImport?.listJobs?.({ targetType: 'wiki', targetRef: wikiId, limit: 20 })
  if (version !== inspectorVersion || wikiId !== wikiStore.currentWikiId) return
  wikiWebJobs.value = result?.success ? (result.data || []) : []
}

function openWikiWebSettings() {
  showSourcePicker.value = false
  showDocumentProcessingSettings.value = true
}

async function saveWikiWebSettings(patch, close) {
  const result = await window.electronAPI?.webImport?.saveSettings?.(patch)
  if (result?.success) { wikiWebSettings.value = result.data; wikiWebProviders.value = result.providers || []; close?.() }
}

async function addUrlSource(url) {
  if (!wikiStore.currentWikiId || wikiWebSubmitting.value) return
  wikiWebSubmitting.value = true
  sourceError.value = ''
  try {
    const result = await window.electronAPI?.webImport?.createJob?.({ targetType: 'wiki', targetRef: wikiStore.currentWikiId, url, includeHtml: false })
    if (!result?.success) throw new Error(result?.error || '创建网页导入任务失败')
    armWikiPoller()
    await loadWikiWebJobs()
    msg.success('网页来源已加入后台队列')
  } catch (err) { sourceError.value = err.message; msg.error(err.message || '添加网页来源失败') }
  finally { wikiWebSubmitting.value = false }
}

async function retryWikiWebJob(id) { await window.electronAPI?.webImport?.retryJob?.(id); await loadWikiWebJobs() }
async function deleteWikiWebJob(id) { await window.electronAPI?.webImport?.deleteJob?.(id); await loadWikiWebJobs() }
async function clearWikiWebJobs() { await window.electronAPI?.webImport?.clearFinishedJobs?.({ targetType: 'wiki', targetRef: wikiStore.currentWikiId }); await loadWikiWebJobs() }
function openWikiWebSource() {
  showSourcePicker.value = false
  reviewInspectorTab.value = 'status'
  showInspectorDrawer.value = true
}

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
  await loadWikiWebSettings()
  await loadWikiWebJobs()
  webJobUpdatedHandler = window.electronAPI?.webImport?.onJobUpdated?.((job) => {
    if (job?.target_type !== 'wiki' || job.target_ref !== wikiStore.currentWikiId) return
    const index = wikiWebJobs.value.findIndex(item => item.id === job.id)
    if (index >= 0) wikiWebJobs.value[index] = job
    else wikiWebJobs.value.unshift(job)
    if (['succeeded', 'partial'].includes(job.status)) {
      armWikiPoller()
      void wikiStore.refreshCurrentWiki()
    }
  })
})

onBeforeUnmount(() => {
  wikiStore.closeSourceExtract()
  if (pollTimer) clearInterval(pollTimer)
  stopResize()
  window.electronAPI?.webImport?.removeJobUpdatedListener?.(webJobUpdatedHandler)
})

watch(() => settingsStore.workDirRoot, async (root) => {
  if (!root) return
  await wikiStore.loadWikis()
  await wikiStore.loadOcrProviders().catch(() => {})
  if (wikiStore.currentWikiId) await wikiStore.openWiki(wikiStore.currentWikiId)
  startWikiPoller()
})

watch(() => wikiStore.currentWikiId, () => {
  readerMode.value = 'page'
  inspectorVersion += 1
  proposalSelectionRequest += 1
  selectedProposal.value = null
  reviewActionError.value = ''
  loadingProposals.value = false
  reviewBusy.value = false
  maintainingWiki.value = false
  lintingWiki.value = false
  auditingWiki.value = false
  evaluatingWiki.value = false
  wikiWebJobs.value = []
  if (showSourcePicker.value) loadWikiWebJobs()
}, { flush: 'sync' })

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
  if (/^(?:\/?sources[\\/])/.test(String(pagePath || ''))) return
  readerMode.value = 'page'
  try {
    await wikiStore.readPage(resolveWikiPagePath(pagePath))
  } catch (err) {
    wikiStore.error = err.message
  }
}

async function openSourceExtract(target) {
  const { sourceId, location } = typeof target === 'string' ? { sourceId: target } : target || {}
  if (!wikiStore.currentWikiId) return
  showInspectorDrawer.value = false
  readerMode.value = 'source'
  await wikiStore.openSourceExtract(sourceId, location)
}

function changeReaderMode(mode) {
  readerMode.value = mode === 'source' ? 'source' : 'page'
}

async function openCheckedPage(pagePath) {
  const version = inspectorVersion
  if (!wikiStore.pages.some(page => page.path === pagePath)) {
    msg.error('该页面已不在当前 Wiki 中，请刷新后重新检查')
    return
  }
  try {
    const page = await wikiStore.readPage(pagePath)
    if (version === inspectorVersion && page) {
      readerMode.value = 'page'
      showInspectorDrawer.value = false
    }
  } catch (err) {
    if (version === inspectorVersion) msg.error(err.message || '打开问题页面失败')
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
  loadWikiWebSettings()
  loadWikiWebJobs()
}

async function addDocSource(filePath) {
  sourceError.value = ''
  sourceAdding.value = true
  try {
    const result = await wikiStore.addSource({ filePath })
    armWikiPoller()
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
    armWikiPoller()
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
    armWikiPoller()
    msg.success('来源已加入重新解析队列')
  } catch (err) {
    msg.error(err.message || '重新解析失败')
  } finally {
    reparseSourceId.value = ''
  }
}

function openWikiMedia(source) {
  const media = source?.meta?.media || {}
  if (!media.media_id) {
    msg.error('该 Wiki 来源缺少 mediaId')
    return
  }
  mediaDetailItem.value = {
    mediaId: media.media_id,
    mediaType: media.media_type || 'video',
    name: source.title || '媒体转录',
    path: source.original_path || '',
    remoteMediaReference: true,
    wikiSourceId: source.id,
  }
  showMediaDetail.value = true
}

async function reanalyzeWikiMedia(item) {
  if (!item?.mediaId) return
  const result = await window.electronAPI?.media?.analyze?.(item.mediaId, {
    presetId: 'subtitle_first',
    providerId: 'auto',
    preferSubtitle: true,
  })
  if (!result?.success) {
    msg.error(result?.message || '媒体重新解析任务创建失败')
    return
  }
  msg.success('媒体已加入重新解析队列；完成后请刷新 Wiki 来源')
}

async function runOcr(sourceId) {
  if (!sourceId || ocrSourceId.value) return
  ocrSourceId.value = sourceId
  try {
    await wikiStore.runOcr(sourceId)
    armWikiPoller()
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

function armWikiPoller(ticks = 3) {
  pollGraceTicks = Math.max(pollGraceTicks, Math.max(Number(ticks) || 0, 0))
}

function startWikiPoller() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (!wikiStore.currentWikiId || polling || (!hasActiveWikiWork() && pollGraceTicks <= 0)) return
    polling = true
    try {
      await wikiStore.openWiki(wikiStore.currentWikiId)
      if (hasActiveWikiWork()) pollGraceTicks = Math.max(pollGraceTicks, 2)
      else if (pollGraceTicks > 0) pollGraceTicks -= 1
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

async function runWikiLint() {
  if (lintingWiki.value) return
  const version = inspectorVersion
  lintingWiki.value = true
  try {
    const report = await wikiStore.runLint()
    if (version !== inspectorVersion) return
    const errors = report?.summary?.error || 0
    const warnings = report?.summary?.warning || 0
    msg.success(errors || warnings ? `检查完成：${errors} 个错误，${warnings} 个警告` : 'Wiki 结构检查通过')
  } catch (err) {
    if (version !== inspectorVersion) return
    msg.error(err.message || 'Wiki 结构检查失败')
  } finally {
    if (version === inspectorVersion) lintingWiki.value = false
  }
}

async function runSemanticAudit() {
  if (auditingWiki.value) return
  const version = inspectorVersion
  auditingWiki.value = true
  try {
    await wikiStore.runSemanticAudit()
    if (version !== inspectorVersion) return
    msg.success('AI 语义巡检报告已生成')
  } catch (err) {
    if (version !== inspectorVersion) return
    msg.error(err.message || 'AI 语义巡检失败')
  } finally {
    if (version === inspectorVersion) auditingWiki.value = false
  }
}

async function runWikiMaintenance() {
  if (maintainingWiki.value || selectedAgent.value?.status === 'running') return
  const version = inspectorVersion
  maintainingWiki.value = true
  try {
    const result = await wikiStore.draftWithAgent({})
    if (version !== inspectorVersion) return
    msg.success(`WikiAgent 维护完成，生成或更新 ${result?.maintenance?.generated_page_count || 0} 个知识页`)
  } catch (err) {
    if (version !== inspectorVersion) return
    msg.error(err.message || 'WikiAgent 维护失败')
  } finally {
    if (version === inspectorVersion) maintainingWiki.value = false
  }
}

async function loadReviewQueue() {
  if (!wikiStore.currentWikiId || loadingProposals.value) return
  const version = inspectorVersion
  loadingProposals.value = true
  reviewActionError.value = ''
  try {
    await wikiStore.listProposals('pending_review,confirmed')
    if (version !== inspectorVersion) return
    if (selectedProposal.value && !wikiStore.proposals.some(item => item.proposal_id === selectedProposal.value.proposal_id)) {
      selectedProposal.value = null
    }
  } catch (err) {
    if (version !== inspectorVersion) return
    reviewActionError.value = err.message || '加载 Proposal Review Queue 失败'
    msg.error(err.message || '加载 Proposal Review Queue 失败')
  } finally {
    if (version === inspectorVersion) loadingProposals.value = false
  }
}

function openReviewQueue() {
  if (!selectedWiki.value) return
  showInspectorDrawer.value = true
  reviewInspectorTab.value = 'review'
  void loadReviewQueue()
}

function openWikiStatus() {
  reviewInspectorTab.value = 'status'
  showInspectorDrawer.value = true
}

async function selectProposal(proposal) {
  if (!proposal?.proposal_id) return
  const version = inspectorVersion
  const request = ++proposalSelectionRequest
  reviewActionError.value = ''
  try {
    const detail = await wikiStore.getProposal(proposal.proposal_id)
    if (version !== inspectorVersion || request !== proposalSelectionRequest) return
    selectedProposal.value = detail
  } catch (err) {
    if (version !== inspectorVersion || request !== proposalSelectionRequest) return
    reviewActionError.value = err.message || '读取提案详情失败'
    msg.error(err.message || '读取提案详情失败')
  }
}

async function reviewProposalAction(proposal, status) {
  if (!proposal?.proposal_id || reviewBusy.value) return
  if (proposal.wiki_id && proposal.wiki_id !== wikiStore.currentWikiId) return
  const version = inspectorVersion
  reviewBusy.value = true
  reviewActionError.value = ''
  try {
    const reviewed = await wikiStore.reviewProposal(proposal.proposal_id, status)
    if (version !== inspectorVersion) return
    selectedProposal.value = reviewed
    if (status === 'rejected') {
      selectedProposal.value = null
      await loadReviewQueue()
    }
    if (version !== inspectorVersion) return
    msg.success(status === 'confirmed' ? '提案已确认，可由用户应用' : '提案已拒绝')
  } catch (err) {
    if (version !== inspectorVersion) return
    reviewActionError.value = err.message || '更新提案状态失败'
    msg.error(err.message || '更新提案状态失败')
  } finally {
    if (version === inspectorVersion) reviewBusy.value = false
  }
}

async function applyProposalAction(proposal) {
  if (!proposal?.proposal_id || reviewBusy.value) return
  if (proposal.wiki_id && proposal.wiki_id !== wikiStore.currentWikiId) return
  const version = inspectorVersion
  reviewBusy.value = true
  reviewActionError.value = ''
  try {
    await wikiStore.applyProposal(proposal.proposal_id)
    if (version !== inspectorVersion) return
    selectedProposal.value = null
    await loadReviewQueue()
    if (version !== inspectorVersion) return
    msg.success('提案已应用')
  } catch (err) {
    if (version !== inspectorVersion) return
    reviewActionError.value = err.message || '应用提案失败'
    msg.error(err.message || '应用提案失败')
  } finally {
    if (version === inspectorVersion) reviewBusy.value = false
  }
}

async function runWikiEvaluation() {
  if (evaluatingWiki.value) return
  const version = inspectorVersion
  evaluatingWiki.value = true
  try {
    await wikiStore.runEvaluation({ reason: 'manual' })
    if (version !== inspectorVersion) return
    await wikiStore.getEvaluation()
    if (version !== inspectorVersion) return
    msg.success('Wiki 检索评估已完成')
  } catch (err) {
    if (version !== inspectorVersion) return
    msg.error(err.message || 'Wiki 检索评估失败')
  } finally {
    if (version === inspectorVersion) evaluatingWiki.value = false
  }
}

function changeInspectorTab(tab) {
  reviewInspectorTab.value = tab
  if (tab === 'review') void loadReviewQueue()
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
            :key="wikiStore.currentWikiId"
            :wiki="selectedWiki"
            :agent="selectedAgent"
            :page="wikiStore.currentPage"
            :sources="wikiStore.sources"
            :source-extract="wikiStore.sourceExtract"
            :reader-mode="readerMode"
            :error="wikiStore.error"
            :source-error="sourceError"
            :is-dark="isDark"
            @add-source="openSourcePicker"
            @open-page="openPage"
            @open-source-extract="openSourceExtract"
            @change-mode="changeReaderMode"
            @open-status="openWikiStatus"
            @open-review-queue="openReviewQueue"
            @configure-agent="showAgentSettings = true"
          />
        </div>

        <Transition name="drawer-fade">
          <div v-if="showInspectorDrawer" class="drawer-layer">
            <div class="drawer-backdrop" @click="showInspectorDrawer = false" />
            <div class="wiki-inspector drawer-panel border-l" :class="isDark ? 'border-d4 shadow-[0_20px_60px_rgba(0,0,0,0.36)]' : 'border-bdrL shadow-[0_20px_60px_rgba(15,23,42,0.16)]'">
              <WikiInspector
                :key="wikiStore.currentWikiId"
                :wiki="selectedWiki"
                :agent="selectedAgent"
                :sources="wikiStore.sources"
                :jobs="wikiStore.jobs"
                :ocr-providers="wikiStore.ocrProviders"
                :ocr-jobs="wikiStore.ocrJobs"
                :maintaining="maintainingWiki"
                :reparse-source-id="reparseSourceId"
                :ocr-source-id="ocrSourceId"
                :delete-source-id="deletingSourceId"
                :is-dark="isDark"
                :initial-tab="reviewInspectorTab"
                :review-count="wikiStore.proposals.length"
                @configure-ocr="openOcrSettings"
                @reparse-source="reparseSource"
                @run-ocr="runOcr"
                @delete-source="openDeleteSource"
                @open-media="openWikiMedia"
                @view-source-extract="openSourceExtract"
                @run-maintenance="runWikiMaintenance"
                @close="showInspectorDrawer = false"
                @tab-change="changeInspectorTab"
              >
                <template #review>
                  <WikiReviewPanel
                    :proposals="wikiStore.proposals"
                    :selected-proposal="selectedProposal"
                    :loading="loadingProposals"
                    :review-busy="reviewBusy"
                    :action-error="reviewActionError"
                    :is-dark="isDark"
                    @refresh="loadReviewQueue"
                    @select="selectProposal"
                    @reject="proposal => reviewProposalAction(proposal, 'rejected')"
                    @confirm="proposal => reviewProposalAction(proposal, 'confirmed')"
                    @apply="applyProposalAction"
                  />
                </template>
                <template #checks>
                  <WikiChecksPanel
                    :lint-report="wikiStore.lintReport"
                    :pages="wikiStore.pages"
                    :semantic-audit="wikiStore.semanticAudit"
                    :semantic-audit-enabled="!!selectedAgent?.semantic_audit?.enabled"
                    :evaluation="wikiStore.evaluation"
                    :health="wikiStore.evaluationHealth"
                    :linting="lintingWiki"
                    :auditing="auditingWiki"
                    :evaluating="evaluatingWiki"
                    :is-dark="isDark"
                    @run-lint="runWikiLint"
                    @run-semantic-audit="runSemanticAudit"
                    @run-evaluation="runWikiEvaluation"
                    @open-page="openCheckedPage"
                  />
                </template>
              </WikiInspector>
            </div>
          </div>
        </Transition>
      </div>
    </MainContent>

    <MediaDetailModal
      v-if="showMediaDetail"
      v-model:show="showMediaDetail"
      :is-dark="isDark"
      :item="mediaDetailItem"
      @reanalyze="reanalyzeWikiMedia" />

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
      :web-settings="wikiWebSettings"
      :web-providers="wikiWebProviders"
      :web-jobs="wikiWebJobs"
      :web-submitting="wikiWebSubmitting"
      @close="showSourcePicker = false"
      @add-doc="addDocSource"
      @add-note="addNoteSource"
      @add-url="addUrlSource"
      @open-web-settings="openWikiWebSettings"
      @retry-web-job="retryWikiWebJob"
      @delete-web-job="deleteWikiWebJob"
      @clear-web-jobs="clearWikiWebJobs"
      @open-web-source="openWikiWebSource"
    />

    <PdfProcessingSettingsModal
      v-model:show="showDocumentProcessingSettings"
      :is-dark="isDark"
      :settings="wikiPdfSettings"
      initial-tab="web"
      :web-settings="wikiWebSettings"
      :web-providers="wikiWebProviders"
      @save="close => close?.()"
      @save-web-settings="saveWikiWebSettings" />

    <WikiAgentSettingsModal
      :show="showAgentSettings"
      :agent="selectedAgent"
      :model-options="settingsStore.chatModelOptions"
      :default-model-label="settingsStore.getModelName(settingsStore.defaultModels.chat)"
      :global-web-research-enabled="!!settingsStore.wikiWebResearchSettings?.enabled"
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
  width: min(420px, 100%);
  height: 100%;
  pointer-events: auto;
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
  .drawer-fade-enter-active, .drawer-fade-leave-active,
  .drawer-fade-enter-active .drawer-panel, .drawer-fade-leave-active .drawer-panel,
  .wiki-resize-handle span {
    transition: none;
  }
}
</style>
