<script setup>
import { ref, computed, defineAsyncComponent, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useRecycleBinStore } from '@/stores/recycleBin'
import { useMediaStore } from '@/stores/media'
import { useWorkchatStore } from '@/stores/workchat'
import MsModal from '@/components/MsModal/MsModal.vue'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import MsTreeItem from '@/components/MsTreeItem/MsTreeItem.vue'
import DocTreeItem from './sections/DocTreeItem.vue'
import DocGridCard from './sections/DocGridCard.vue'
import DocListRow from './sections/DocListRow.vue'
import DocsContextMenu from './sections/DocsContextMenu.vue'
import DocsRenameModal from './sections/DocsRenameModal.vue'
import DocsCreateFolderModal from './sections/DocsCreateFolderModal.vue'
import DocsDeleteConfirmModal from './sections/DocsDeleteConfirmModal.vue'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import { useMessage } from '@/components/MsMessage/useMessage'
import { fileIcon, fileIconColor } from './sections/constant'
import { useProcessingSettings } from './composables/useProcessingSettings'
import { useProcessingStatus } from './composables/useProcessingStatus'
import { useMediaProcessing } from './composables/useMediaProcessing'
import { usePdfProcessing } from './composables/usePdfProcessing'
import { useDirectory } from './composables/useDirectory'
import { useWebImport } from './composables/useWebImport'
import { useRename } from './composables/useRename'

const DocPreview = defineAsyncComponent(() => import('./sections/DocPreview.vue'))
const UploadModal = defineAsyncComponent(() => import('./sections/UploadModal.vue'))
const MoveModal = defineAsyncComponent(() => import('./sections/MoveModal.vue'))
const PdfProcessingSettingsModal = defineAsyncComponent(() => import('./sections/PdfProcessingSettingsModal.vue'))
const WebImportHistoryDrawer = defineAsyncComponent(() => import('./sections/WebImportHistoryDrawer.vue'))
const MediaDetailModal = defineAsyncComponent(() => import('@/components/media/MediaDetailModal.vue'))

const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const recycleBinStore = useRecycleBinStore()
const mediaStore = useMediaStore()
const workchatStore = useWorkchatStore()
const mbox = useMessageBox()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)
const isReady = computed(() => settingsStore.isWorkspaceReady)
const api = () => window.electronAPI

// ─── Shared state ───
const items = ref([])
const selectedFile = ref(null)
const contextMenu = ref(null)
let previewRequestId = 0

// ─── Modal state ───
const showCreateFolderModal = ref(false)
const newFolderName = ref('')
const createFolderParentPath = ref('')
const confirmDelete = ref(null)
const showUploadModal = ref(false)
const showWebImportHistory = ref(false)
const showMoveModal = ref(false)
const moveTarget = ref(null)
const showProcessingSettingsModal = ref(false)
const processingSettingsInitialTab = ref('pdf')

// ─── Composables (dependency order) ───
const procSettings = useProcessingSettings({ router, msg, mediaStore })
const pStatus = useProcessingStatus({ items, selectedFile, processingSettings: procSettings.processingSettings })
const media = useMediaProcessing({ items, selectedFile, contextMenu, processingSettings: procSettings.processingSettings, status: pStatus, mediaStore, mbox })
const pdf = usePdfProcessing({ processingSettings: procSettings.processingSettings, status: pStatus, settings: procSettings, media })
const dir = useDirectory({ items, isReady, settingsStore, status: pStatus, media })
const webImport = useWebImport({ currentPath: dir.currentPath, msg })
const rename = useRename({ selectedItem: dir.selectedItem, selectedFile, loadDirectory: () => dir.loadDirectory(dir.currentPath.value), loadFolderTree: dir.loadFolderTree })

// ─── Template bindings: writable computeds (v-model / assignment) ───
const showRenameModal = computed({ get: () => rename.showRenameModal.value, set: v => rename.showRenameModal.value = v })
const renameValue = computed({ get: () => rename.renameValue.value, set: v => rename.renameValue.value = v })
const renameError = computed({ get: () => rename.renameError.value, set: v => rename.renameError.value = v })
const showPdfUploadPrompt = computed({ get: () => pdf.showPdfUploadPrompt.value, set: v => pdf.showPdfUploadPrompt.value = v })
const pdfUploadEngine = computed({ get: () => pdf.pdfUploadEngine.value, set: v => pdf.pdfUploadEngine.value = v })
const showMediaDetailModal = computed({ get: () => media.showMediaDetailModal.value, set: v => media.showMediaDetailModal.value = v })
const searchQuery = computed({ get: () => dir.searchQuery.value, set: v => dir.searchQuery.value = v })
const viewMode = computed({ get: () => dir.viewMode.value, set: v => dir.viewMode.value = v })

// ─── Template bindings: read-only computeds ───
const processingSettings = computed(() => procSettings.processingSettings.value)
const enabledOcrProviders = computed(() => procSettings.enabledOcrProviders.value)
const effectiveOcrProvider = computed(() => procSettings.effectiveOcrProvider.value)
const ocrProviderStatusText = computed(() => procSettings.ocrProviderStatusText.value)
const pdfEnvironment = computed(() => procSettings.pdfEnvironment.value)
const pdfEnvironmentStatusText = computed(() => procSettings.pdfEnvironmentStatusText.value)
const installingPdfLocalParser = computed(() => procSettings.installingPdfLocalParser.value)
const pdfLocalParserInstallResult = computed(() => procSettings.pdfLocalParserInstallResult.value)
const selectedMediaSpeechProvider = computed(() => procSettings.selectedMediaSpeechProvider.value)
const pendingPdfUploads = computed(() => pdf.pendingPdfUploads.value)
const uploadNeedsOcrProvider = computed(() => pdf.uploadNeedsOcrProvider.value)
const uploadBlocksWithoutOcrProvider = computed(() => pdf.uploadBlocksWithoutOcrProvider.value)
const mediaDetailItem = computed(() => media.mediaDetailItem.value)
const currentPath = computed(() => dir.currentPath.value)
const loading = computed(() => dir.loading.value)
const selectedItem = computed(() => dir.selectedItem.value)
const activeTreePath = computed(() => dir.activeTreePath.value)
const folderTree = computed(() => dir.folderTree.value)
const filteredItems = computed(() => dir.filteredItems.value)
const breadcrumbs = computed(() => dir.breadcrumbs.value)
const dirCount = computed(() => dir.dirCount.value)
const fileCount = computed(() => dir.fileCount.value)
const renameItem = computed(() => rename.renameItem.value)
const renameExtension = computed(() => rename.renameExtension.value)
const renameFeedbackText = computed(() => rename.renameFeedbackText.value)
const renameCanSubmit = computed(() => rename.renameCanSubmit.value)
const webImportSettings = computed(() => webImport.webImportSettings.value)
const webImportProviders = computed(() => webImport.webImportProviders.value)
const webImportJobs = computed(() => webImport.webImportJobs.value)
const webImportSubmitting = computed(() => webImport.webImportSubmitting.value)
const remoteMediaSubmitting = computed(() => webImport.remoteMediaSubmitting.value)
const remoteMediaError = computed(() => webImport.remoteMediaError.value)
const webImportJobsLoading = computed(() => webImport.webImportJobsLoading.value)
const webImportJobsHasMore = computed(() => webImport.webImportJobsHasMore.value)

// ─── Template bindings: functions ───
const { saveProcessingSettings, installPdfLocalParser, loadProcessingSettings, loadOcrProviders, loadPdfEnvironment } = procSettings
const { isPdfItem, isMediaItem, extOfFile, isRemoteMediaReference, pdfProcessingStatusFromResult, mediaStatusFromMetadata, baseProcessingStatusFor, currentProcessingStatusFor, applyProcessingStatus, applyMediaState, isLocalFastPdfStrategy, AUDIO_PARSE_EXTS, VIDEO_PARSE_EXTS, MEDIA_PARSE_EXTS } = pStatus
const { isPdfParsed, isPdfParsing, pdfContextMenuIcon, pdfContextMenuLabel, parsePdfFromContextMenu, runPdfPreflightForUploads, closePdfUploadPrompt, runPdfParseForUploads, handlePdfUploadProcessing } = pdf
const { isMediaParsing, mediaContextMenuIcon, mediaContextMenuLabel, parseMediaFromContextMenu, openMediaDetails, refreshMediaDetailItem, registerDocsMedia, refreshMediaStatus, loadDocumentProcessingStatuses, refreshActiveMediaStatuses, shouldStartMediaAnalysis, mediaAnalyzeOptions, handleMediaUploadProcessing } = media
const { navigateTo, loadDirectory, loadFolderTree, openItem, selectItem, expandPathInTree, getAbsolutePath, getDocsBasePath, normalizeRelativePath, getItemRelativePath } = dir
const { loadWebImportJobs, retryWebImportJob, deleteWebImportJob, clearWebImportJobs, saveWebImportSettings, loadWebImportSettings, handleJobUpdated } = webImport
const { confirmRename, splitEditableName, dirnameOfPath, joinPathName } = rename

const showDeleteModal = computed({ get: () => confirmDelete.value !== null, set: (val) => { if (!val) confirmDelete.value = null } })

function getFileIcon(ext) { return fileIcon('x.' + ext, false) }
function getFileIconColor(ext) { return fileIconColor('x.' + ext, false) }
function openOcrSettings() { showProcessingSettingsModal.value = false; pdf.showPdfUploadPrompt.value = false; procSettings.openOcrSettings() }
function openSpeechSettings() { showProcessingSettingsModal.value = false; pdf.showPdfUploadPrompt.value = false; procSettings.openSpeechSettings() }
function openWebImportSettings() { showUploadModal.value = false; processingSettingsInitialTab.value = 'web'; showProcessingSettingsModal.value = true }
function openMediaProcessingSettings() { showUploadModal.value = false; processingSettingsInitialTab.value = 'media'; showProcessingSettingsModal.value = true }
function openRenameModal(item) { rename.openRenameModal(item); contextMenu.value = null }
function uploadFiles() { showUploadModal.value = true }
function showInFolder(item) { api()?.showItemInFolder?.(item.path) }
function closeContextMenu() { contextMenu.value = null }

function openCreateFolderModal(parentPath = dir.currentPath.value) {
  createFolderParentPath.value = normalizeRelativePath(parentPath)
  newFolderName.value = ''
  showCreateFolderModal.value = true
}
function openCreateSubfolderModal(item) {
  if (!item?.isDirectory) return
  const parentPath = getItemRelativePath(item)
  if (parentPath === null) { msg.error('无法确定目标文件夹路径'); return }
  openCreateFolderModal(parentPath)
}
async function createFolder() {
  const folderName = newFolderName.value.trim()
  if (!folderName) return
  const parentPath = createFolderParentPath.value
  const relPath = parentPath ? parentPath + '/' + folderName : folderName
  const absPath = getAbsolutePath(relPath)
  try {
    const result = await api()?.mkdir?.(absPath)
    if (!result?.success) { msg.error(result?.error || '创建文件夹失败'); return }
    newFolderName.value = ''
    showCreateFolderModal.value = false
    if (parentPath === dir.currentPath.value) await dir.loadDirectory(dir.currentPath.value)
    await dir.loadFolderTree()
    dir.expandPathInTree(parentPath)
  } catch (error) { msg.error(error?.message || '创建文件夹失败') }
}
async function deleteItem(item) {
  const result = await recycleBinStore.moveToTrash(item.path, { isDirectory: item.isDirectory, name: item.name })
  if (result?.success) {
    if (dir.selectedItem.value?.name === item.name) dir.selectedItem.value = null
    dir.loadDirectory(dir.currentPath.value)
    dir.loadFolderTree()
  }
}
function previewItem(item) {
  if (item.isDirectory) { openItem(item); return }
  handleSelectFile({ name: item.name, path: item.path, ext: item.name.split('.').pop().toLowerCase() })
}

// ─── File preview ───
const TEXT_EXTS = new Set([
  'md','markdown','txt','log','csv','tsv','json','yaml','yml','toml','xml','ini','env',
  'js','mjs','cjs','ts','tsx','jsx','vue','py','java','c','cpp','h','hpp','cs','go','rs','rb','php','swift','kt',
  'html','htm','css','scss','sass','less','sh','bat','ps1','sql',
])
function handleSelectFile(file) {
  const requestId = ++previewRequestId
  selectedFile.value = { ...file, content: null, error: null, loading: true }
  dir.activeTreePath.value = file.path
  loadFilePreview(file, requestId)
}
function commitFilePreview(file, requestId, patch) {
  if (requestId !== previewRequestId || selectedFile.value?.path !== file.path) return false
  selectedFile.value = { ...file, ...patch }
  return true
}
async function loadFilePreview(file, requestId) {
  const ext = (file.ext || file.name.split('.').pop() || '').toLowerCase()
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
  const isAudio = AUDIO_PARSE_EXTS.has(ext)
  const isVideo = VIDEO_PARSE_EXTS.has(ext)
  if (isRemoteMediaReference(file)) {
    try {
      const result = await refreshMediaStatus({ ...file, remoteMediaReference: true })
      const current = items.value.find(item => item.path === file.path)
      commitFilePreview(file, requestId, {
        ...(current || {}),
        content: null,
        error: result?.success === false ? (result.message || '远程媒体引用读取失败') : (result?.registration?.success === false ? (result.registration.message || '远程媒体引用读取失败') : null),
        loading: false, remoteMediaReference: true,
        mediaType: current?.mediaType || result?.metadata?.media?.mediaType || 'video',
      })
    } catch (e) {
      commitFilePreview(file, requestId, { content: null, error: e.message || '远程媒体引用读取失败', loading: false, remoteMediaReference: true, mediaType: file.mediaType || 'video' })
    }
    return
  }
  if (ext === 'pdf') {
    try {
      const result = await api()?.pdf?.preflight?.(file.path, { sourceInfo: { origin: 'docs_preview' } })
      const processingStatus = pdfProcessingStatusFromResult(result)
      applyProcessingStatus(file.path, processingStatus)
      commitFilePreview(file, requestId, {
        content: null,
        error: result?.success === false ? (result.message || result.error || 'PDF 预检失败') : null,
        loading: false, ext, processingStatus, pdfStatus: result?.success ? result : null,
      })
    } catch (e) { commitFilePreview(file, requestId, { content: null, error: e.message, loading: false, ext }) }
    return
  }
  if (isImage || isAudio || isVideo) {
    const committed = commitFilePreview(file, requestId, { content: null, error: null, loading: false, mediaType: isImage ? 'image' : isAudio ? 'audio' : 'video' })
    if (committed && (isAudio || isVideo)) await refreshMediaStatus(selectedFile.value)
    return
  }
  if (!TEXT_EXTS.has(ext)) { commitFilePreview(file, requestId, { content: null, error: null, loading: false, unsupported: true }); return }
  try {
    const result = await api()?.readFile?.(file.path)
    if (result?.success) { commitFilePreview(file, requestId, { content: result.data, error: null, loading: false, ext }) }
    else { commitFilePreview(file, requestId, { content: null, error: result?.error || '读取失败', loading: false, ext }) }
  } catch (e) { commitFilePreview(file, requestId, { content: null, error: e.message, loading: false, ext }) }
}
function closePreview() { previewRequestId += 1; selectedFile.value = null; dir.activeTreePath.value = dir.currentPath.value }

// ─── Chat ───
async function chatWith(item) {
  if (!item) return
  let mediaId = item.mediaId || ''
  if (isMediaItem(item) && !mediaId) { const registration = await registerDocsMedia(item); mediaId = registration?.source?.id || '' }
  workchatStore.ctxItems = [{ type: item.isDirectory ? 'folder' : 'file', source: 'docs', id: 'docs_' + Date.now(), name: item.name, path: item.path, isDirectory: !!item.isDirectory, ...(mediaId ? { mediaId } : {}) }]
  router.push({ path: '/workchat' })
}
function chatWithFile(file) { if (!file?.path) return; router.push({ path: '/workchat' }) }

// ─── Context menu ───
function showContextMenu(e, item) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, item }
  if (isPdfItem(item)) {
    const statusPromise = api()?.pdf?.getStatus?.(item.path, { probe: false })
    if (statusPromise?.then) {
      statusPromise.then((result) => {
        const procStat = pdfProcessingStatusFromResult(result)
        applyProcessingStatus(item.path, procStat)
        if (contextMenu.value?.item?.path === item.path) { contextMenu.value = { ...contextMenu.value, item: { ...contextMenu.value.item, processingStatus: procStat } } }
      }).catch(() => {})
    }
  } else if (isMediaItem(item)) {
    refreshMediaStatus(item).then(() => {
      const refreshed = items.value.find(entry => entry.path === item.path)
      if (refreshed && contextMenu.value?.item?.path === item.path) { contextMenu.value = { ...contextMenu.value, item: refreshed } }
    }).catch(() => {})
  }
}

// ─── Tree event handlers ───
function handleSelectFolder(node) { previewRequestId += 1; dir.activeTreePath.value = node.path; selectedFile.value = null; dir.navigateTo(node.path); dir.loadDirectory(node.path) }
function handleToggleFolder(node) { node.expanded = !node.expanded }
function handleTreeFolderContextMenu(e, node) { showContextMenu(e, { name: node.name, path: getAbsolutePath(node.path), relPath: node.path, isDirectory: true }) }
function handleTreeFileContextMenu(e, file) { showContextMenu(e, { name: file.name, path: file.path, isDirectory: false }) }

// ─── Move ───
function openMoveModal(item) {
  const docsBase = getDocsBasePath()
  let relPath = item.relPath
  if (!relPath && docsBase && item.path?.startsWith(docsBase)) { relPath = item.path.slice(docsBase.length).replace(/^[\\/]+/, '').replace(/\\/g, '/') }
  moveTarget.value = { name: item.name, path: item.path, isDirectory: !!item.isDirectory, relPath: relPath || '' }
  showMoveModal.value = true; contextMenu.value = null
}
async function handleMoveSubmit({ item, destRelPath }) {
  const srcAbs = item.path
  const destAbs = (destRelPath ? getAbsolutePath(destRelPath) : getDocsBasePath()) + '/' + item.name
  if (srcAbs === destAbs) return
  const result = await api()?.rename?.(srcAbs, destAbs)
  if (result?.success) {
    if (selectedFile.value?.path === srcAbs) { previewRequestId += 1; selectedFile.value = null }
    dir.loadDirectory(dir.currentPath.value); dir.loadFolderTree()
  } else { console.error('Move failed:', result?.error) }
}

// ─── Upload helpers ───
function safeRemoteReferenceBase(title, sourceType) {
  const fallback = sourceType === 'bilibili' ? 'B站视频' : '远程音视频'
  return String(title || fallback).replace(/\.media\.md$/i, '').replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80) || fallback
}
function safeRemoteReferenceName(title, sourceType) { return safeRemoteReferenceBase(title, sourceType) + '-' + Date.now().toString(36) + '.media.md' }
async function uniqueRemoteReferencePath(targetDir, title, sourceType, currentPath = '') {
  const base = safeRemoteReferenceBase(title, sourceType)
  for (let index = 1; index <= 999; index++) {
    const suffix = index === 1 ? '' : ' (' + index + ')'
    const candidate = joinPathName(targetDir, base + suffix + '.media.md')
    if (candidate === currentPath || !(await api()?.exists?.(candidate))) return candidate
  }
  return joinPathName(targetDir, base + '-' + Date.now().toString(36) + '.media.md')
}
function remoteReferenceContent({ mediaId, title, sourceType }) {
  const displayTitle = String(title || '远程音视频').replace(/[\r\n]+/g, ' ').trim()
  return '---\nRevivaMediaReference: 1\nmediaId: ' + mediaId + '\nsourceType: ' + sourceType + '\n---\n\n# ' + displayTitle + '\n\n这是 Reviva 的远程音视频安全引用。原始或签名 URL 不会写入本文档；请通过"解析详情"查看转录、关键帧和历史版本。\n'
}

// ─── Upload submit ───
function openWebImportResult(job) {
  const relPath = job?.result_paths?.[0]
  if (!relPath) return
  const fullPath = getAbsolutePath(relPath)
  handleSelectFile({ name: relPath.split('/').pop(), path: fullPath, ext: relPath.split('.').pop().toLowerCase() })
  showUploadModal.value = false; showWebImportHistory.value = false
}
async function handleUploadSubmit({ type, files, url, includeHtml, title, sourceType, presetId }) {
  if (type === 'url') {
    webImport.webImportSubmitting.value = true
    try { await api()?.webImport?.createJob?.({ targetType: 'docs', targetRef: dir.currentPath.value, url, includeHtml }); await webImport.loadWebImportJobs({ reset: true }) }
    finally { webImport.webImportSubmitting.value = false }
    return
  }
  if (type === 'media') {
    webImport.remoteMediaSubmitting.value = true; webImport.remoteMediaError.value = ''
    const targetDir = getAbsolutePath(dir.currentPath.value)
    let targetPath = joinPathName(targetDir, safeRemoteReferenceName(title, sourceType))
    try {
      const placeholder = await api()?.writeFile?.(targetPath, '# 正在登记远程音视频…\n')
      if (placeholder?.success === false) throw new Error(placeholder.error || '无法创建远程媒体引用文件')
      const result = await api()?.media?.register?.({ url, sourceType, title: title || '', owner: { type: 'docs_file', id: '', locator: targetPath } })
      if (!result?.success) throw new Error(result?.message || '远程音视频登记失败')
      const resolvedTitle = result.source.title || title || (sourceType === 'bilibili' ? 'B 站视频' : '远程音视频')
      const titledPath = await uniqueRemoteReferencePath(targetDir, resolvedTitle, sourceType, targetPath)
      if (titledPath !== targetPath) { const renamed = await api()?.rename?.(targetPath, titledPath); if (renamed?.success) targetPath = titledPath; else console.warn('[Docs] Failed to rename remote media reference:', renamed?.error || renamed) }
      const content = remoteReferenceContent({ mediaId: result.source.id, title: resolvedTitle, sourceType })
      const written = await api()?.writeFile?.(targetPath, content)
      if (written?.success === false) throw new Error(written.error || '远程媒体引用文件写入失败')
      if (await shouldStartMediaAnalysis(1)) {
        const analysis = await api()?.media?.analyze?.(result.source.id, { ...mediaAnalyzeOptions(), presetId: presetId || procSettings.processingSettings.value.mediaPreset || 'subtitle_first', extractKeyframes: presetId === 'keyframe_enhanced' || procSettings.processingSettings.value.mediaExtractKeyframes === true })
        if (!analysis?.success) console.warn('[Docs] Remote media analysis was not started:', analysis?.message || analysis)
      }
      await dir.loadDirectory(dir.currentPath.value); await dir.loadFolderTree(); showUploadModal.value = false
    } catch (error) { webImport.remoteMediaError.value = error?.message || '添加远程音视频失败'; try { await api()?.deleteFile?.(targetPath) } catch {} }
    finally { webImport.remoteMediaSubmitting.value = false }
    return
  }
  if (type !== 'local' || !files?.length) return
  const targetDir = getAbsolutePath(dir.currentPath.value)
  const copiedPdfPaths = []; const copiedMediaItems = []
  for (const f of files) {
    const dest = targetDir + '/' + f.name
    await api()?.copyFile?.(f.path, dest)
    const ext = (f.name || '').split('.').pop()?.toLowerCase()
    if (ext === 'pdf') copiedPdfPaths.push(dest)
    if (MEDIA_PARSE_EXTS.has(ext)) copiedMediaItems.push({ name: f.name, path: dest, ext })
  }
  dir.loadDirectory(dir.currentPath.value); dir.loadFolderTree()
  if (copiedPdfPaths.length) handlePdfUploadProcessing(copiedPdfPaths)
  if (copiedMediaItems.length) handleMediaUploadProcessing(copiedMediaItems)
}

// ─── Lifecycle ───
let webJobUpdatedHandler = null
let mediaStatusPollTimer = null
onMounted(() => {
  loadProcessingSettings()
  mediaStore.loadSpeechSettings()
  webJobUpdatedHandler = api()?.webImport?.onJobUpdated?.((job) => {
    const shouldRefresh = handleJobUpdated(job)
    if (shouldRefresh) { dir.loadDirectory(dir.currentPath.value); dir.loadFolderTree() }
  })
  if (isReady.value) { dir.loadDirectory(''); dir.loadFolderTree() }
  mediaStatusPollTimer = setInterval(refreshActiveMediaStatuses, 2500)
})
onBeforeUnmount(() => {
  previewRequestId += 1
  api()?.webImport?.removeJobUpdatedListener?.(webJobUpdatedHandler)
  if (mediaStatusPollTimer) clearInterval(mediaStatusPollTimer)
  mediaStatusPollTimer = null
})
watch(() => settingsStore.workDirRoot, (newVal) => {
  if (newVal) { dir.currentPath.value = ''; dir.loadDirectory(''); dir.loadFolderTree() }
  else { items.value = []; dir.folderTree.value = { folders: [], files: [] } }
})
watch(showProcessingSettingsModal, (visible) => {
  if (visible) { loadProcessingSettings(); loadOcrProviders(); loadPdfEnvironment(); webImport.loadWebImportSettings(); mediaStore.loadSpeechSettings({ force: true }) }
})
watch(showUploadModal, visible => {
  if (visible) { webImport.remoteMediaError.value = ''; webImport.loadWebImportSettings(); webImport.loadWebImportJobs({ reset: true }); mediaStore.loadSpeechSettings({ force: true }) }
})
watch(showWebImportHistory, visible => { if (visible) webImport.loadWebImportJobs({ reset: true }) })
watch(() => dir.currentPath.value, () => { if (showUploadModal.value || showWebImportHistory.value) webImport.loadWebImportJobs({ reset: true }) })
watch(() => pdf.showPdfUploadPrompt.value, (visible) => { if (visible) { loadProcessingSettings(); loadOcrProviders(); loadPdfEnvironment() } })
</script>

<template>
  <div class="flex h-full overflow-hidden" @click="closeContextMenu">
    <!-- ═══ Left Panel — Folder Tree ═══ -->
    <LeftPanel :width="240" :resizable="false">
      <!-- Panel Header -->
      <div
        class="h-10 flex items-center justify-between px-3 shrink-0"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <div class="flex items-center gap-1.5">
          <i class="ri-folder-line text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="text-[15px] font-semibold tracking-wide" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            我的文档
          </span>
        </div>
        <div class="flex items-center gap-0.5">
          <button
            @click="openCreateFolderModal()"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="新建文件夹">
            <i class="ri-folder-add-line text-[14px]" />
          </button>
          <button
            @click="showUploadModal = true"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="上传文件">
            <i class="ri-upload-2-line text-[14px]" />
          </button>
          <button
            @click="showProcessingSettingsModal = true"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="解析设置">
            <i class="ri-settings-3-line text-[14px]" />
          </button>
          <button
            @click="
              loadDirectory(currentPath);loadFolderTree()
            "
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-dim hover:text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="刷新">
            <i class="ri-refresh-line text-[14px]" />
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="px-2.5 py-2 shrink-0">
        <div class="relative">
          <i
            class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件..."
            class="w-full h-7 rounded-md py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
            :class="
              isDark
                ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40'
                : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'
            " />
        </div>
      </div>

      <!-- "Home" pseudo-row: back to root -->
      <div class="px-2 shrink-0">
        <div
          @click="
            selectedFile = null;
            activeTreePath = '';
            navigateTo('');
            loadDirectory('')
          "
          class="h-7 flex items-center gap-1.5 px-2 rounded-md cursor-pointer transition-colors group"
          :class="[
            !selectedFile && currentPath === ''
              ? isDark
                ? 'bg-brand-400/10 text-brand-400'
                : 'bg-brand-50 text-brand-500'
              : isDark
                ? 'text-wt-sub hover:bg-white/5'
                : 'text-lt-sub hover:bg-l4',
          ]">
          <i class="ri-home-4-line text-[14px]" />
          <span class="text-[13px] font-medium flex-1">全部文档</span>
          <span class="text-[9.5px] opacity-60">{{ folderTree.folders.length + folderTree.files.length }}</span>
        </div>
      </div>

      <div class="mx-3 my-1.5 h-px shrink-0" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />

      <!-- Tree Navigation -->
      <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <!-- Empty state -->
        <div
          v-if="folderTree.folders.length === 0 && folderTree.files.length === 0"
          class="flex flex-col items-center gap-1.5 py-8 px-3 text-center">
          <i class="ri-folders-line text-[22px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无文件</p>
        </div>

        <!-- Folder tree nodes (recursive, level 0 = tightly indented) -->
        <DocTreeItem
          v-for="node in folderTree.folders"
          :key="node.path"
          :node="node"
          :is-dark="isDark"
          :active-path="activeTreePath"
          :level="0"
          @select-folder="handleSelectFolder"
          @toggle-folder="handleToggleFolder"
          @select-file="handleSelectFile"
          @contextmenu-folder="handleTreeFolderContextMenu"
          @contextmenu-file="handleTreeFileContextMenu" />

        <!-- Root-level files -->
        <MsTreeItem
          v-for="file in folderTree.files"
          :key="file.path"
          :label="file.name"
          :icon="getFileIcon(file.ext)"
          :icon-color="getFileIconColor(file.ext)"
          :active="selectedFile?.path === file.path"
          :level="0"
          :is-dark="isDark"
          :has-arrow="false"
          :is-folder="false"
          @click="handleSelectFile(file)"
          @contextmenu="(e) => handleTreeFileContextMenu(e, file)" />
      </div>
    </LeftPanel>

    <!-- ═══ Main Content ═══ -->
    <MainContent padding="p-0">
      <!-- No workspace state -->
      <div v-if="!isReady" class="flex flex-col items-center justify-center h-full gap-4">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <i class="ri-folder-unlock-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </div>
        <div class="text-center">
          <p class="text-[14px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">未设置工作目录</p>
          <p class="text-[12px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请先在设置中选择工作目录</p>
        </div>
        <router-link
          to="/settings"
          class="ctx-pill cursor-pointer"
          :class="
            isDark
              ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15'
              : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'
          ">
          <i class="ri-settings-3-line text-[10px]" />
          前往设置
        </router-link>
      </div>

      <!-- Main file browser -->
      <div v-else class="h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
        <!-- ═══ FILE PREVIEW MODE ═══ -->
        <DocPreview
          v-if="selectedFile"
          :file="selectedFile"
          :is-dark="isDark"
          @close="closePreview"
          @chat="chatWithFile"
          @media-details="openMediaDetails" />

        <!-- ═══ DIRECTORY BROWSE MODE ═══ -->
        <template v-else>
          <!-- Header: breadcrumb + toolbar -->
          <div
            class="h-10 flex items-center justify-between px-5 shrink-0"
            :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="flex items-center gap-1 text-[12px] overflow-hidden">
                <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
                  <i
                    v-if="idx > 0"
                    class="ri-arrow-right-s-line text-[16px]"
                    :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <button
                    @click="
                      navigateTo(crumb.path);
                      loadDirectory(crumb.path)
                    "
                    class="px-1 py-0.5 rounded transition-colors truncate max-w-[120px]"
                    :class="
                      idx === breadcrumbs.length - 1
                        ? isDark
                          ? 'text-wt-main font-medium'
                          : 'text-lt-main font-medium'
                        : isDark
                          ? 'text-wt-sub hover:text-wt-main'
                          : 'text-lt-sub hover:text-lt-main'
                    ">
                    {{ crumb.label }}
                  </button>
                </template>
              </div>
              <span
                class="ctx-pill shrink-0"
                :class="isDark ? 'text-wt-dim bg-d3 border border-bdr' : 'text-lt-aux bg-l3 border border-bdrF'">
                {{ dirCount }} 文件夹 · {{ fileCount }} 文件
              </span>
            </div>

            <!-- Toolbar -->
            <div class="flex items-center gap-1.5 shrink-0">
              <!-- Layout toggle -->
              <div
                class="flex items-center rounded-lg border overflow-hidden"
                :class="isDark ? 'border-bdr' : 'border-bdrF'">
                <button
                  @click="viewMode = 'grid'"
                  class="h-7 w-7 flex items-center justify-center transition-colors"
                  :class="
                    viewMode === 'grid'
                      ? isDark
                        ? 'bg-brand-400/12 text-brand-400'
                        : 'bg-brand-50 text-brand-500'
                      : isDark
                        ? 'text-wt-dim hover:text-wt-aux'
                        : 'text-lt-aux hover:text-lt-sub'
                  ">
                  <i class="ri-grid-line text-[16px]" />
                </button>
                <button
                  @click="viewMode = 'list'"
                  class="h-7 w-7 flex items-center justify-center transition-colors"
                  :class="
                    viewMode === 'list'
                      ? isDark
                        ? 'bg-brand-400/12 text-brand-400'
                        : 'bg-brand-50 text-brand-500'
                      : isDark
                        ? 'text-wt-dim hover:text-wt-aux'
                        : 'text-lt-aux hover:text-lt-sub'
                  ">
                  <i class="ri-list-unordered text-[16px]" />
                </button>
              </div>
              <button
                @click="openCreateFolderModal()"
                class="ctx-pill doc-toolbar-action cursor-pointer"
                :class="
                  isDark
                    ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15'
                    : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'
                ">
                <i class="ri-folder-add-line text-[14px]" />
                新建文件夹
              </button>
              <button
                @click="showProcessingSettingsModal = true"
                class="ctx-pill doc-toolbar-action cursor-pointer"
                :class="
                  isDark
                    ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                    : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                ">
                <i class="ri-settings-3-line text-[14px]" />
                解析设置
              </button>
              <button
                @click="showWebImportHistory = true"
                class="ctx-pill doc-toolbar-action cursor-pointer relative"
                :class="
                  isDark
                    ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                    : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                ">
                <i class="ri-history-line text-[14px]" />
                导入记录
                <span v-if="webImportJobs.some(job => ['pending','running'].includes(job.status))" class="w-1.5 h-1.5 rounded-full bg-brand-400" />
              </button>
              <button
                @click="uploadFiles"
                class="ctx-pill doc-toolbar-action cursor-pointer"
                :class="
                  isDark
                    ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                    : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                ">
                <i class="ri-upload-2-line text-[14px]" />
                上传
              </button>
            </div>
          </div>

          <!-- Content area -->
          <div class="flex-1 overflow-y-auto p-4">
            <!-- Empty state -->
            <div
              v-if="filteredItems.length === 0 && !loading"
              class="flex flex-col items-center justify-center py-16 gap-3">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
                <i class="ri-folder-open-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              </div>
              <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ searchQuery ? '没有匹配的文件' : '此文件夹为空' }}
              </p>
              <p v-if="!searchQuery" class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                上传文件或创建文件夹开始使用
              </p>
            </div>

            <!-- Loading state -->
            <div v-if="loading" class="flex items-center justify-center py-16">
              <i class="ri-loader-4-line text-[24px] pulse" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </div>

            <!-- ═══ GRID Layout ═══ -->
            <div
              v-if="viewMode === 'grid' && !loading"
              class="grid gap-3"
              style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">
              <DocGridCard
                v-for="item in filteredItems"
                :key="item.name"
                :item="item"
                :is-dark="isDark"
                :selected="selectedItem?.name === item.name"
                @click="selectItem"
                @dblclick="openItem"
                @contextmenu="(e, it) => showContextMenu(e, it)"
                @open="openItem"
                @chat="chatWith"
                @preview="previewItem" />
            </div>

            <!-- ═══ LIST Layout ═══ -->
            <div v-if="viewMode === 'list' && !loading" class="space-y-1">
              <DocListRow
                v-for="item in filteredItems"
                :key="item.name"
                :item="item"
                :is-dark="isDark"
                :selected="selectedItem?.name === item.name"
                @click="selectItem"
                @dblclick="openItem"
                @contextmenu="(e, it) => showContextMenu(e, it)"
                @chat="chatWith"
                @rename="openRenameModal"
                @delete="(it) => (confirmDelete = it)"
                @preview="previewItem" />
            </div>
          </div>
        </template>
      </div>
    </MainContent>

    <DocsContextMenu
      :menu="contextMenu"
      :is-dark="isDark"
      :is-pdf-parsed="isPdfParsed"
      :is-pdf-parsing="isPdfParsing"
      :pdf-icon="pdfContextMenuIcon"
      :pdf-label="pdfContextMenuLabel"
      :is-pdf-item="isPdfItem"
      :is-media-item="isMediaItem"
      :is-media-parsing="isMediaParsing"
      :media-icon="mediaContextMenuIcon"
      :media-label="mediaContextMenuLabel"
      @close="closeContextMenu"
      @open="openItem"
      @preview="previewItem"
      @parse-pdf="parsePdfFromContextMenu"
      @parse-media="parseMediaFromContextMenu"
      @media-details="openMediaDetails"
      @chat="chatWith"
      @create-subfolder="openCreateSubfolderModal"
      @move="openMoveModal"
      @rename="openRenameModal"
      @show-in-folder="showInFolder"
      @delete="(item) => (confirmDelete = item)" />

    <DocsCreateFolderModal
      v-model:show="showCreateFolderModal"
      v-model:name="newFolderName"
      :is-dark="isDark"
      :current-path="createFolderParentPath"
      @submit="createFolder" />

    <DocsRenameModal
      v-model:show="showRenameModal"
      :is-dark="isDark"
      :item="renameItem"
      v-model:value="renameValue"
      :extension="renameExtension"
      :error="renameError"
      :feedback="renameFeedbackText"
      :can-submit="renameCanSubmit"
      :file-icon="fileIcon"
      :file-icon-color="fileIconColor"
      @clear-error="renameError = ''"
      @submit="confirmRename" />

    <DocsDeleteConfirmModal
      v-model:show="showDeleteModal"
      :is-dark="isDark"
      :item="confirmDelete"
      @confirm="deleteItem" />

    <PdfProcessingSettingsModal
      v-if="showProcessingSettingsModal"
      v-model:show="showProcessingSettingsModal"
      :is-dark="isDark"
      :settings="processingSettings"
      :enabled-ocr-providers="enabledOcrProviders"
      :effective-ocr-provider="effectiveOcrProvider"
      :ocr-provider-status-text="ocrProviderStatusText"
      :pdf-environment="pdfEnvironment"
      :pdf-environment-status-text="pdfEnvironmentStatusText"
      :installing-pdf-local-parser="installingPdfLocalParser"
      :pdf-local-parser-install-result="pdfLocalParserInstallResult"
      :initial-tab="processingSettingsInitialTab"
      :web-settings="webImportSettings"
      :web-providers="webImportProviders"
      :configured-speech-providers="mediaStore.configuredSpeechProviders"
      :configured-models="mediaStore.configuredModels"
      @save="saveProcessingSettings"
      @save-web-settings="saveWebImportSettings"
      @install-local-parser="installPdfLocalParser"
      @open-ocr-settings="openOcrSettings"
      @open-speech-settings="openSpeechSettings" />

    <!-- ═══ PDF Upload Processing Prompt ═══ -->
    <MsModal v-model:show="showPdfUploadPrompt" :width="420" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
            <i class="ri-file-pdf-2-line text-[16px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">处理 PDF</span>
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          已上传 {{ pendingPdfUploads.length }} 个 PDF。可以按默认策略处理，也可以只为本次上传临时选择解析路线。
        </p>
        <div
          class="rounded-lg border px-3 py-2 text-[10.5px] leading-relaxed"
          :class="pdfEnvironment?.success
            ? isDark ? 'border-bdr bg-d3 text-wt-dim' : 'border-bdrF bg-l3 text-lt-aux'
            : isDark ? 'border-amber-400/20 bg-amber-400/8 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'">
          {{ pdfEnvironmentStatusText }}
        </div>
        <div>
          <div class="text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">本次解析路线</div>
          <select
            v-model="pdfUploadEngine"
            class="w-full h-9 rounded-lg px-3 text-[12px] outline-none border"
            :class="isDark ? 'bg-d3 border-bdr text-wt-sub' : 'bg-l3 border-bdrF text-lt-sub'">
            <option value="auto">自动：本地快速 + 必要时文档智能解析</option>
            <option value="local_fast">本地快速解析：读取 PDF 文本层</option>
            <option value="document_intelligent">文档智能解析：生成 Markdown/JSON</option>
          </select>
          <div
            v-if="uploadNeedsOcrProvider"
            class="mt-1.5 flex items-center justify-between gap-2 text-[10.5px]">
            <span :class="effectiveOcrProvider ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'text-amber-400'">
              {{ ocrProviderStatusText }}
            </span>
            <button
              v-if="!effectiveOcrProvider"
              @click="openOcrSettings"
              class="shrink-0"
              :class="isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-500 hover:text-brand-600'">
              去配置
            </button>
          </div>
        </div>
        <button
          @click="showProcessingSettingsModal = true"
          class="ctx-pill cursor-pointer"
          :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20' : 'text-brand-500 bg-brand-50 border border-brand-100'">
          <i class="ri-settings-3-line text-[10px]" />
          先配置解析策略
        </button>
      </div>

      <template #footer="{ close }">
        <button
          @click="closePdfUploadPrompt(); close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          稍后
        </button>
        <button
          @click="runPdfPreflightForUploads(); closePdfUploadPrompt(); close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-d4 text-wt-sub hover:bg-white/10' : 'bg-l4 text-lt-sub hover:bg-l3'">
          快速预检
        </button>
        <button
          @click="runPdfParseForUploads(); closePdfUploadPrompt(); close()"
          :disabled="uploadBlocksWithoutOcrProvider"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="uploadBlocksWithoutOcrProvider
            ? isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed'
            : isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          开始解析
        </button>
      </template>
    </MsModal>

    <!-- ═══ Upload Modal ═══ -->
    <UploadModal
      v-if="showUploadModal"
      v-model:show="showUploadModal"
      :is-dark="isDark"
      :current-path="currentPath"
      :web-settings="webImportSettings"
      :web-providers="webImportProviders"
      :web-jobs="webImportJobs"
      :web-submitting="webImportSubmitting"
      :media-submitting="remoteMediaSubmitting"
      :media-error="remoteMediaError"
      :speech-provider="selectedMediaSpeechProvider"
      @open-web-settings="openWebImportSettings"
      @open-media-settings="openMediaProcessingSettings"
      @retry-web-job="retryWebImportJob"
      @delete-web-job="deleteWebImportJob"
      @clear-web-jobs="clearWebImportJobs"
      @open-web-result="openWebImportResult"
      @submit="handleUploadSubmit" />

    <MediaDetailModal
      v-if="showMediaDetailModal"
      v-model:show="showMediaDetailModal"
      :is-dark="isDark"
      :item="mediaDetailItem"
      @reanalyze="parseMediaFromContextMenu"
      @updated="refreshMediaDetailItem" />

    <WebImportHistoryDrawer
      v-if="showWebImportHistory"
      v-model:show="showWebImportHistory"
      :is-dark="isDark"
      :jobs="webImportJobs"
      :loading="webImportJobsLoading"
      :has-more="webImportJobsHasMore"
      :current-path="currentPath"
      @retry="retryWebImportJob"
      @delete="deleteWebImportJob"
      @clear="clearWebImportJobs"
      @load-more="loadWebImportJobs({ reset: false })"
      @open="openWebImportResult" />

    <!-- ═══ Move Modal ═══ -->
    <MoveModal
      v-if="showMoveModal"
      v-model:show="showMoveModal"
      :is-dark="isDark"
      :item="moveTarget"
      :folder-tree="folderTree.folders"
      :current-path="currentPath"
      @submit="handleMoveSubmit" />
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
.ctx-pill {
  font-size: 14px;
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.doc-toolbar-action {
  height: 30px;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1;
}
.doc-toolbar-action > i {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 14px;
}
</style>


