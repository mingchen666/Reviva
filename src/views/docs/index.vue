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
import { fileIcon,fileIconColor} from './sections/constant'

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

// ─── State ───
const currentPath = ref('')
const items = ref([])
const selectedItem = ref(null)
const searchQuery = ref('')
const loading = ref(false)
const viewMode = ref('grid') // 'grid' | 'list'
const activeTreePath = ref('')
const selectedFile = ref(null)
const expandedFolders = ref(new Set())

// ─── Modal State ───
const showCreateFolderModal = ref(false)
const newFolderName = ref('')
const createFolderParentPath = ref('')
const showRenameModal = ref(false)
const renameItem = ref(null)
const renameValue = ref('')
const renameError = ref('')
const confirmDelete = ref(null)
const contextMenu = ref(null)
const showUploadModal = ref(false)
const showWebImportHistory = ref(false)
const showMoveModal = ref(false)
const moveTarget = ref(null)
const showProcessingSettingsModal = ref(false)
const showMediaDetailModal = ref(false)
const mediaDetailItem = ref(null)
const processingSettingsInitialTab = ref('pdf')
const showPdfUploadPrompt = ref(false)
const pendingPdfUploads = ref([])
const pdfUploadEngine = ref('auto')

const api = () => window.electronAPI

const defaultProcessingSettings = {
  version: 1,
  pdfEngine: 'auto',
  uploadAction: 'ask',
  defaultOcrProvider: 'auto',
  missingPythonFallback: 'ocr_provider',
  largePdfMode: 'adaptive',
  allowFullDocumentOcr: true,
  allowPaddleFullDocumentForPageRanges: true,
  mediaAction: 'ask',
  mediaPreset: 'subtitle_first',
  mediaPreferredLanguage: 'auto',
  mediaProviderId: 'auto',
  mediaPreferSubtitle: true,
  mediaExtractKeyframes: false,
  mediaKeyframeLimit: 12,
}
const processingSettings = ref({ ...defaultProcessingSettings })
const ocrProviders = ref([])
const pdfEnvironment = ref(null)
const installingPdfLocalParser = ref(false)
const pdfLocalParserInstallResult = ref(null)
const manualParsingPdfPaths = ref(new Set())
const manualParsingMediaPaths = ref(new Set())
const webImportSettings = ref(null)
const webImportProviders = ref([])
const webImportJobs = ref([])
const webImportSubmitting = ref(false)
const remoteMediaSubmitting = ref(false)
const remoteMediaError = ref('')
const webImportJobsLoading = ref(false)
const webImportJobsHasMore = ref(false)
const WEB_IMPORT_PAGE_SIZE = 10
let webJobUpdatedHandler = null
let webImportJobsRequestId = 0
let previewRequestId = 0
let mediaStatusPollTimer = null

function normalizeProcessingSettings(value = {}) {
  return {
    ...defaultProcessingSettings,
    ...(value && typeof value === 'object' ? value : {}),
    allowFullDocumentOcr: value?.allowFullDocumentOcr !== false,
    allowPaddleFullDocumentForPageRanges: value?.allowPaddleFullDocumentForPageRanges !== false,
  }
}

async function loadProcessingSettings() {
  try {
    const result = await api()?.pdf?.getSettings?.()
    processingSettings.value = normalizeProcessingSettings(result?.data || {})
  } catch (e) {
    console.warn('[Docs] load PDF settings failed:', e)
  }
}

async function loadWebImportSettings() {
  try {
    const result = await api()?.webImport?.getSettings?.()
    if (result?.success) {
      webImportSettings.value = result.data
      webImportProviders.value = result.providers || []
    }
  } catch (e) { console.warn('[Docs] load web import settings failed:', e) }
}

async function saveWebImportSettings(patch, close) {
  try {
    const result = await api()?.webImport?.saveSettings?.(patch)
    if (!result?.success) throw new Error(result?.error || result?.message || '网页解析配置保存失败')
    webImportSettings.value = result.data
    webImportProviders.value = result.providers || webImportProviders.value
    close?.()
    msg.success('网页解析配置已保存')
  } catch (error) {
    msg.error(error?.message || '网页解析配置保存失败')
  }
}

function openWebImportSettings() {
  showUploadModal.value = false
  processingSettingsInitialTab.value = 'web'
  showProcessingSettingsModal.value = true
}

function openMediaProcessingSettings() {
  showUploadModal.value = false
  processingSettingsInitialTab.value = 'media'
  showProcessingSettingsModal.value = true
}

async function loadWebImportJobs({ reset = true } = {}) {
  if (webImportJobsLoading.value && !reset) return
  const requestId = reset ? ++webImportJobsRequestId : webImportJobsRequestId
  const targetRef = currentPath.value
  webImportJobsLoading.value = true
  try {
    const offset = reset ? 0 : webImportJobs.value.length
    const result = await api()?.webImport?.listJobs?.({
      targetType: 'docs',
      targetRef,
      limit: WEB_IMPORT_PAGE_SIZE + 1,
      offset,
    })
    if (requestId !== webImportJobsRequestId || targetRef !== currentPath.value) return
    const page = result?.success ? (result.data || []) : []
    const records = page.slice(0, WEB_IMPORT_PAGE_SIZE)
    webImportJobsHasMore.value = page.length > WEB_IMPORT_PAGE_SIZE
    if (reset) {
      webImportJobs.value = records
    } else {
      const existingIds = new Set(webImportJobs.value.map(item => item.id))
      webImportJobs.value.push(...records.filter(item => !existingIds.has(item.id)))
    }
  } catch (error) {
    console.warn('[Docs] load web import jobs failed:', error)
    if (reset && requestId === webImportJobsRequestId) {
      webImportJobs.value = []
      webImportJobsHasMore.value = false
    }
  } finally {
    if (requestId === webImportJobsRequestId) webImportJobsLoading.value = false
  }
}

async function retryWebImportJob(id) { await api()?.webImport?.retryJob?.(id); await loadWebImportJobs({ reset: true }) }
async function deleteWebImportJob(id) { await api()?.webImport?.deleteJob?.(id); await loadWebImportJobs({ reset: true }) }
async function clearWebImportJobs() { await api()?.webImport?.clearFinishedJobs?.({ targetType: 'docs', targetRef: currentPath.value }); await loadWebImportJobs({ reset: true }) }

function openWebImportResult(job) {
  const relPath = job?.result_paths?.[0]
  if (!relPath) return
  const fullPath = getAbsolutePath(relPath)
  handleSelectFile({ name: relPath.split('/').pop(), path: fullPath, ext: relPath.split('.').pop().toLowerCase() })
  showUploadModal.value = false
  showWebImportHistory.value = false
}

async function loadOcrProviders() {
  try {
    const result = await (api()?.wiki?.listOcrProviders?.() || api()?.listOcrProviders?.())
    ocrProviders.value = result?.success ? (result.data || []) : []
  } catch (e) {
    console.warn('[Docs] load OCR providers failed:', e)
    ocrProviders.value = []
  }
}

async function loadPdfEnvironment() {
  try {
    pdfEnvironment.value = await api()?.pdf?.checkEnvironment?.()
  } catch (e) {
    console.warn('[Docs] load PDF environment failed:', e)
    pdfEnvironment.value = { success: false, code: 'PDF_ENV_CHECK_FAILED', message: e.message }
  }
}

async function saveProcessingSettings(close) {
  try {
    const next = normalizeProcessingSettings(processingSettings.value)
    const result = await api()?.pdf?.setSettings?.(next)
    if (!result?.success) throw new Error(result?.error || result?.message || '解析配置保存失败')
    if (String(result.data?.mediaProviderId || 'auto') !== String(next.mediaProviderId || 'auto')) {
      throw new Error('语音转文字服务选择未能保存，请重试。')
    }
    if (String(result.data?.defaultOcrProvider || 'auto') !== String(next.defaultOcrProvider || 'auto')) {
      throw new Error('OCR 服务商选择未能保存，请重试。')
    }
    processingSettings.value = normalizeProcessingSettings(result.data)
    close?.()
    msg.success('解析配置已保存')
  } catch (error) {
    msg.error(error?.message || '解析配置保存失败')
  }
}

async function installPdfLocalParser() {
  if (installingPdfLocalParser.value) return
  installingPdfLocalParser.value = true
  pdfLocalParserInstallResult.value = null
  try {
    const result = await api()?.pdf?.installLocalParser?.()
    pdfLocalParserInstallResult.value = result || { success: false, error: '安装接口无返回。' }
    await loadPdfEnvironment()
  } catch (e) {
    pdfLocalParserInstallResult.value = { success: false, error: e.message || '安装失败。' }
  } finally {
    installingPdfLocalParser.value = false
  }
}

function isOcrProviderEnabled(provider) {
  if (!provider || provider.enabled === undefined) return true
  return provider?.enabled === true || provider?.enabled === 1 || provider?.enabled === '1' || provider?.enabled === 'true'
}

function isSupportedPdfOcrProvider(provider) {
  return ['mineru', 'paddleocr'].includes(String(provider?.type || '').toLowerCase())
}

const enabledOcrProviders = computed(() => ocrProviders.value.filter(provider =>
  isOcrProviderEnabled(provider)
  && isSupportedPdfOcrProvider(provider)
  && String(provider.base_url || '').trim()
  && String(provider.api_key_ref || '').trim()
))

const supportedOcrProviders = computed(() => ocrProviders.value.filter(provider => isSupportedPdfOcrProvider(provider)))

const configuredOcrProviders = computed(() => supportedOcrProviders.value.filter(provider =>
  String(provider.base_url || '').trim()
  && String(provider.api_key_ref || '').trim()
))

function autoOcrProvider() {
  return enabledOcrProviders.value[0] || null
}

function selectedEnabledOcrProvider() {
  const selected = processingSettings.value.defaultOcrProvider
  if (!selected || selected === 'auto') return null
  return enabledOcrProviders.value.find(provider => provider.id === selected) || null
}

const effectiveOcrProvider = computed(() => {
  return selectedEnabledOcrProvider() || autoOcrProvider()
})

const ocrProviderStatusText = computed(() => {
  const provider = effectiveOcrProvider.value
  if (!enabledOcrProviders.value.length) {
    if (configuredOcrProviders.value.length) return '已保存 OCR 服务商，但当前未启用'
    if (supportedOcrProviders.value.length) return 'OCR 服务商配置不完整，请补全 URL 和 API Key'
    return '未配置 MinerU 或 PaddleOCR 文档智能解析服务'
  }
  const selected = processingSettings.value.defaultOcrProvider
  if (selected && selected !== 'auto' && !selectedEnabledOcrProvider()) {
    return provider ? `当前选择不可用，已自动使用：${provider.name || provider.type}` : '当前选择的服务商不可用'
  }
  return `当前使用：${provider.name || provider.type}`
})

const pdfEnvironmentStatusText = computed(() => {
  if (!pdfEnvironment.value) return '本地文本层环境未检测'
  if (pdfEnvironment.value.success) {
    const version = pdfEnvironment.value.pymupdfVersion ? `PyMuPDF ${pdfEnvironment.value.pymupdfVersion}` : (pdfEnvironment.value.parser || 'PyMuPDF')
    return `本地快速解析可用：${version} · ${pdfEnvironment.value.via || 'python'}`
  }
  if (pdfEnvironment.value.code === 'PYTHON_NOT_FOUND') return '未找到 Python，可改用 OCR 服务商解析 PDF'
  if (pdfEnvironment.value.code === 'PYMUPDF_NOT_INSTALLED' || pdfEnvironment.value.code === 'PYPDF_NOT_INSTALLED') {
    const version = pdfEnvironment.value.pythonVersion ? `Python ${pdfEnvironment.value.pythonVersion}` : 'Python'
    return `已找到 ${version}，但缺少 PyMuPDF；可自动安装或改用 OCR 服务商解析 PDF`
  }
  return pdfEnvironment.value.message || '本地快速解析不可用，可改用 OCR 服务商'
})

const uploadNeedsOcrProvider = computed(() => pdfUploadEngine.value !== 'local_fast')
const uploadBlocksWithoutOcrProvider = computed(() => pdfUploadEngine.value === 'document_intelligent' && !effectiveOcrProvider.value)

const AUDIO_PARSE_EXTS = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'])
const VIDEO_PARSE_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v'])
const MEDIA_PARSE_EXTS = new Set([...AUDIO_PARSE_EXTS, ...VIDEO_PARSE_EXTS])

function extOfFile(item = {}) {
  return String(item.ext || item.name?.split('.').pop() || '').toLowerCase()
}

function isRemoteMediaReference(item = {}) {
  return !item?.isDirectory && String(item.name || '').toLowerCase().endsWith('.media.md')
}

function splitEditableName(name = '', isDirectory = false) {
  const value = String(name || '')
  if (isDirectory) return { base: value, ext: '' }
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return { base: value, ext: '' }
  return { base: value.slice(0, dot), ext: value.slice(dot) }
}

const renameExtension = computed(() => splitEditableName(renameItem.value?.name, renameItem.value?.isDirectory).ext)

function normalizedRenameBaseName() {
  let value = String(renameValue.value || '').trim()
  const ext = renameExtension.value
  if (ext && value.toLowerCase().endsWith(ext.toLowerCase())) {
    value = value.slice(0, -ext.length).trim()
  }
  return value
}

const renameTargetName = computed(() => {
  const base = normalizedRenameBaseName()
  return renameItem.value?.isDirectory ? base : `${base}${renameExtension.value}`
})

const renameValidationMessage = computed(() => {
  if (!renameItem.value) return ''
  const base = normalizedRenameBaseName()
  if (!base) return '名称不能为空'
  if (/[\\/:*?"<>|]/.test(base)) return '名称不能包含 \\ / : * ? " < > |'
  if (!renameItem.value.isDirectory && !renameExtension.value && base.lastIndexOf('.') > 0) return '不能新增文件扩展名'
  if (renameTargetName.value === renameItem.value.name) return '名称未变化'
  return ''
})

const renameCanSubmit = computed(() => !!renameItem.value && !renameValidationMessage.value)

const renameFeedbackText = computed(() => {
  if (renameError.value) return renameError.value
  if (!String(renameValue.value || '').trim()) return renameValidationMessage.value
  if (renameValidationMessage.value === '名称未变化') return ''
  return renameValidationMessage.value
})

function dirnameOfPath(filePath = '') {
  const value = String(filePath || '')
  const slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  return slash >= 0 ? value.slice(0, slash) : ''
}

function joinPathName(dir = '', name = '') {
  const base = String(dir || '').replace(/[\\/]+$/, '')
  const sep = base.includes('\\') ? '\\' : '/'
  return `${base}${sep}${name}`
}

function pdfProcessingStatusFromResult(result) {
  if (!result) return { kind: 'pdf', state: 'unknown', tone: 'pending', label: '未检测', detail: '尚未读取 PDF 缓存状态' }
  if (!result.success) {
    if (result.code === 'PDF_TEXT_DEPENDENCY_MISSING' || result.code === 'PYMUPDF_NOT_INSTALLED') {
      return { kind: 'pdf', state: 'local_missing', tone: 'warning', label: '缺少本地库', detail: result.message || '缺少 PyMuPDF' }
    }
    return { kind: 'pdf', state: 'error', tone: 'error', label: '状态异常', detail: result.message || result.error || 'PDF 状态读取失败' }
  }
  if (result.ocrManifestCount > 0 || result.processingStatus === 'ocr_ready' || (result.mode === 'ocr' && result.ocrProfileKey)) {
    return { kind: 'pdf', state: 'ocr_ready', tone: 'ready', label: '智能解析完成', detail: `已生成 ${result.ocrManifestCount || 1} 份 OCR/版面缓存` }
  }
  const mode = result.pdfTextMode || ''
  if (mode === 'text') return { kind: 'pdf', state: 'text_ready', tone: 'ready', label: '文本可读', detail: `${result.pageCount || 0} 页，文本层可用` }
  if (mode === 'text_with_partial_gaps') return { kind: 'pdf', state: 'partial', tone: 'warning', label: '部分需 OCR', detail: '已有文本层缓存，部分页面建议 OCR 补齐' }
  if (mode === 'mixed_needs_ocr') return { kind: 'pdf', state: 'mixed', tone: 'warning', label: '混合型 PDF', detail: '部分页面缺少可提取文本' }
  if (mode === 'scanned_or_image') return { kind: 'pdf', state: 'needs_ocr', tone: 'warning', label: '需要 OCR', detail: '扫描件或图片型 PDF' }
  return { kind: 'pdf', state: 'pending', tone: 'pending', label: '未解析', detail: '尚未生成 PDF 解析缓存' }
}

function mediaProcessingStatusFor(item) {
  const ext = extOfFile(item)
  if (!MEDIA_PARSE_EXTS.has(ext) && !isRemoteMediaReference(item)) return null
  const kind = item.mediaType || (AUDIO_PARSE_EXTS.has(ext) ? 'audio' : 'video')
  return { kind, state: 'pending', tone: 'pending', label: '未解析', detail: isRemoteMediaReference(item) ? '正在读取远程媒体引用' : '可右键开始字幕优先解析' }
}

function baseProcessingStatusFor(item) {
  if (item?.isDirectory) return null
  const ext = extOfFile(item)
  if (ext === 'pdf') return { kind: 'pdf', state: 'pending', tone: 'pending', label: '未解析', detail: '尚未生成 PDF 解析缓存' }
  return mediaProcessingStatusFor(item)
}

function isPdfItem(item) {
  return !item?.isDirectory && extOfFile(item) === 'pdf'
}

function isMediaItem(item) {
  return !item?.isDirectory && (MEDIA_PARSE_EXTS.has(extOfFile(item)) || isRemoteMediaReference(item))
}

function currentProcessingStatusFor(item) {
  if (!item) return null
  const current = items.value.find(entry => entry.path === item.path)
  if (current?.processingStatus) return current.processingStatus
  if (selectedFile.value?.path === item.path && selectedFile.value.processingStatus) return selectedFile.value.processingStatus
  return item.processingStatus || baseProcessingStatusFor(item)
}

function isPdfParsing(item) {
  return !!item?.path && manualParsingPdfPaths.value.has(item.path)
}

function isMediaParsing(item) {
  return !!item?.path && (manualParsingMediaPaths.value.has(item.path) || ['queued', 'running'].includes(currentProcessingStatusFor(item)?.state))
}

function isLocalFastPdfStrategy() {
  return (processingSettings.value.pdfEngine || 'auto') === 'local_fast'
}

function isPdfParsed(item) {
  const status = currentProcessingStatusFor(item)
  return status?.state === 'ocr_ready'
    || (status?.state === 'text_ready' && isLocalFastPdfStrategy())
}

function pdfContextMenuLabel(item) {
  if (isPdfParsing(item)) return '解析中'
  const status = currentProcessingStatusFor(item)
  if (status?.state === 'ocr_ready') return '已智能解析'
  if (status?.state === 'text_ready') {
    return isLocalFastPdfStrategy() ? '本地已解析' : '本地已解析，继续智能解析'
  }
  if (['partial', 'mixed', 'needs_ocr'].includes(status?.state)) return '执行智能解析'
  return isLocalFastPdfStrategy() ? '本地解析 PDF' : '解析 PDF'
}

function pdfContextMenuIcon(item) {
  if (isPdfParsing(item)) return 'ri-loader-4-line animate-spin'
  if (isPdfParsed(item)) return 'ri-check-line'
  return 'ri-scan-2-line'
}

function mediaContextMenuLabel(item) {
  if (isMediaParsing(item)) return '解析中'
  const state = currentProcessingStatusFor(item)?.state
  if (state === 'ready') return '重新解析音视频'
  if (state === 'partial') return '重新解析音视频'
  return '解析音视频'
}

function mediaContextMenuIcon(item) {
  if (isMediaParsing(item)) return 'ri-loader-4-line animate-spin'
  if (currentProcessingStatusFor(item)?.state === 'ready') return 'ri-check-line'
  return 'ri-closed-captioning-line'
}

function applyProcessingStatus(filePath, status) {
  const idx = items.value.findIndex(item => item.path === filePath)
  if (idx >= 0) items.value[idx] = { ...items.value[idx], processingStatus: status }
  if (selectedFile.value?.path === filePath) selectedFile.value = { ...selectedFile.value, processingStatus: status }
}

function applyMediaState(filePath, patch = {}) {
  const idx = items.value.findIndex(item => item.path === filePath)
  if (idx >= 0) items.value[idx] = { ...items.value[idx], ...patch }
  if (selectedFile.value?.path === filePath) selectedFile.value = { ...selectedFile.value, ...patch }
}

function mediaStatusFromMetadata(result, item = {}) {
  const kind = result?.media?.mediaType || item.mediaType || (AUDIO_PARSE_EXTS.has(extOfFile(item)) ? 'audio' : 'video')
  if (!result?.success) return { kind, state: 'error', tone: 'error', label: '状态异常', detail: result?.message || '媒体状态读取失败' }
  const active = result.activeRun
  if (active?.status === 'queued') return { kind, state: 'queued', tone: 'pending', label: '排队中', detail: active.message || '等待媒体解析任务执行' }
  if (active?.status === 'running') return { kind, state: 'running', tone: 'running', label: `解析中 ${active.progress || 0}%`, detail: active.message || active.stage || '正在处理媒体' }
  if (!result.run && result.latestRun?.status === 'failed') return { kind, state: 'error', tone: 'error', label: '解析失败', detail: result.latestRun.errorMessage || '媒体解析失败，可右键重试' }
  if (!result.run && result.latestRun?.status === 'cancelled') return { kind, state: 'pending', tone: 'pending', label: '已取消', detail: '媒体解析已取消，可右键重新解析' }
  if (!result.run) return { kind, state: 'pending', tone: 'pending', label: '未解析', detail: '已登记媒体，可右键开始解析' }
  if (result.media?.contentAvailability === 'transcript_ready') {
    const hasTimeline = result.artifacts?.some(item => item.type === 'segments' && (item.status === 'ready' || item.status === 'partial'))
    return { kind, state: 'ready', tone: 'ready', label: '转录可读', detail: `${hasTimeline ? '已生成时间轴文字稿' : '已生成纯文字稿（服务商未返回时间戳）'}${result.media.durationMs ? ` · ${Math.round(result.media.durationMs / 1000)} 秒` : ''}` }
  }
  if (result.media?.contentAvailability === 'visual_only') return { kind, state: 'partial', tone: 'warning', label: '画面可读', detail: result.availableModes?.includes('frames') ? '已生成视频关键帧，暂无可用转录' : '视频没有可用音轨，已保留媒体信息' }
  return { kind, state: 'partial', tone: 'warning', label: '部分可用', detail: result.run?.warnings?.[0] || '已读取媒体信息，暂无可用字幕或转录' }
}

function mediaAnalyzeOptions() {
  const settings = processingSettings.value
  const providerId = String(settings.mediaProviderId || 'auto').trim() || 'auto'
  return {
    presetId: settings.mediaPreset || 'subtitle_first',
    language: settings.mediaPreferredLanguage === 'auto' ? '' : settings.mediaPreferredLanguage,
    providerId,
    preferSubtitle: settings.mediaPreferSubtitle !== false,
    extractKeyframes: settings.mediaExtractKeyframes === true,
    keyframeLimit: settings.mediaKeyframeLimit || 12,
  }
}

const selectedMediaSpeechProvider = computed(() => {
  const requestedId = String(processingSettings.value.mediaProviderId || 'auto').trim() || 'auto'
  if (requestedId !== 'auto') {
    return mediaStore.configuredSpeechProviders.find(provider => provider.id === requestedId) || {
      id: requestedId,
      name: '所选语音服务',
      model: '',
      modelName: '',
      unavailable: true,
      active: false,
    }
  }
  return mediaStore.defaultSpeechProvider
})

async function registerDocsMedia(item) {
  if (!isMediaItem(item) || !api()?.media?.register) return null
  if (item.mediaId) return { success: true, source: { id: item.mediaId } }
  if (isRemoteMediaReference(item)) {
    const resolved = await api()?.media?.resolveOwner?.({ type: 'docs_file', id: '', locator: item.path })
    if (resolved?.success && resolved.found && resolved.source?.id) {
      applyMediaState(item.path, {
        mediaId: resolved.source.id,
        mediaType: resolved.source.mediaType || item.mediaType || 'video',
        remoteMediaReference: true,
      })
      return { success: true, source: resolved.source, link: resolved.link }
    }
    return { success: false, message: '远程媒体引用已失效或尚未登记。' }
  }
  const result = await api().media.register({
    path: item.path,
    sourceType: 'document_upload',
    title: item.name,
    owner: { type: 'docs_file', id: '', locator: item.path },
  })
  if (result?.success) applyMediaState(item.path, { mediaId: result.source.id })
  return result
}

async function refreshMediaStatus(item) {
  const registration = item.mediaId ? { success: true, source: { id: item.mediaId } } : await registerDocsMedia(item)
  if (!registration?.success) {
    applyProcessingStatus(item.path, mediaStatusFromMetadata(registration, item))
    return registration
  }
  const metadata = await api()?.media?.query?.({ mediaId: registration.source.id, mode: 'metadata' })
  applyMediaState(item.path, {
    mediaId: registration.source.id,
    mediaType: metadata?.media?.mediaType || item.mediaType,
    mediaRunId: metadata?.activeRun?.id || metadata?.run?.id || '',
    processingStatus: mediaStatusFromMetadata(metadata, item),
  })
  return { registration, metadata }
}

async function openMediaDetails(item) {
  if (!isMediaItem(item)) return
  contextMenu.value = null
  const result = await refreshMediaStatus(item)
  const current = items.value.find(entry => entry.path === item.path)
  const mediaId = current?.mediaId || selectedFile.value?.mediaId || result?.registration?.source?.id || item.mediaId || ''
  mediaDetailItem.value = {
    ...item,
    ...(current || {}),
    mediaId,
    mediaType: current?.mediaType || result?.metadata?.media?.mediaType || item.mediaType || (AUDIO_PARSE_EXTS.has(extOfFile(item)) ? 'audio' : 'video'),
    remoteMediaReference: isRemoteMediaReference(item),
  }
  showMediaDetailModal.value = true
}

async function refreshMediaDetailItem(item) {
  if (item?.path) await refreshMediaStatus(item)
}

async function loadDocumentProcessingStatuses(entries = items.value) {
  const pdfEntries = entries.filter(item => !item.isDirectory && extOfFile(item) === 'pdf')
  const mediaEntries = entries.filter(isMediaItem)
  await Promise.allSettled([
    ...pdfEntries.map(async (entry) => {
      const result = await api()?.pdf?.getStatus?.(entry.path, { probe: false })
      applyProcessingStatus(entry.path, pdfProcessingStatusFromResult(result))
    }),
    ...mediaEntries.map(refreshMediaStatus),
  ])
}

async function refreshActiveMediaStatuses() {
  const active = items.value.filter(item => isMediaItem(item) && item.mediaId && ['queued', 'running'].includes(item.processingStatus?.state))
  if (!active.length) return
  await Promise.allSettled(active.map(refreshMediaStatus))
}

function openOcrSettings() {
  showProcessingSettingsModal.value = false
  showPdfUploadPrompt.value = false
  router.push('/settings/ocr')
}

function openSpeechSettings() {
  showProcessingSettingsModal.value = false
  showPdfUploadPrompt.value = false
  router.push('/settings/speech-models')
}

// ─── Folder Tree ───
const folderTree = ref({ folders: [], files: [] })

async function loadFolderTree() {
  if (!isReady.value || !api()?.listDir) return
  const base = settingsStore.getDocsPath()
  if (!base) return
  try {
    const tree = await buildTree(base, '')
    folderTree.value = tree
  } catch (e) {
    console.error('Failed to load folder tree:', e)
  }
}

async function buildTree(absPath, relPath) {
  const result = await api().listDir(absPath)
  if (!result.success) return { folders: [], files: [] }
  const entries = result.data.filter((f) => !f.name.startsWith('.'))
  const dirs = entries.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries.filter((f) => !f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
  const folderNodes = []
  for (const d of dirs) {
    const childRel = relPath ? relPath + '/' + d.name : d.name
    const childAbs = absPath + '/' + d.name
    const sub = await buildTree(childAbs, childRel)
    folderNodes.push({ name: d.name, path: childRel, expanded: false, children: sub.folders, files: sub.files })
  }
  const fileItems = files.map((f) => ({ name: f.name, path: f.path, ext: f.name.split('.').pop().toLowerCase() }))
  return { folders: folderNodes, files: fileItems }
}



// Card accent helpers removed — DocGridCard/DocListRow now own their own theming.

// ─── Directory Operations ───
function getDocsBasePath() {
  return settingsStore.getDocsPath()
}

function getAbsolutePath(relPath) {
  const base = getDocsBasePath()
  if (!base) return ''
  return relPath ? base + '/' + relPath : base
}

async function loadDirectory(relPath) {
  if (!isReady.value || !api()?.listDir) return
  loading.value = true
  try {
    const absPath = getAbsolutePath(relPath)
    const result = await api().listDir(absPath)
    if (result.success) {
      const sorted = result.data
        .filter((f) => !f.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        .map(item => ({ ...item, processingStatus: baseProcessingStatusFor(item) }))
      items.value = sorted
      loadDocumentProcessingStatuses(sorted)
      // Fetch child count for each subdirectory (shallow)
      sorted.forEach(async (entry, idx) => {
        if (!entry.isDirectory) return
        try {
          const sub = await api().listDir(entry.path)
          if (sub?.success) {
            const count = sub.data.filter((f) => !f.name.startsWith('.')).length
            items.value[idx] = { ...items.value[idx], childCount: count }
          }
        } catch (e) {
          /* ignore */
        }
      })
    }
  } catch (e) {
    console.error('Failed to load directory:', e)
  }
  loading.value = false
}

function navigateTo(relPath) {
  currentPath.value = relPath
  selectedItem.value = null
}

function openItem(item) {
  if (item.isDirectory) {
    const newPath = currentPath.value ? currentPath.value + '/' + item.name : item.name
    navigateTo(newPath)
    loadDirectory(newPath)
    expandPathInTree(newPath)
  } else {
    api()?.openPath?.(item.path)
  }
}

function expandPathInTree(relPath) {
  const parts = relPath.split('/')
  let nodes = folderTree.value.folders
  for (const part of parts) {
    const node = nodes?.find((n) => n.name === part)
    if (node) {
      node.expanded = true
      nodes = node.children || []
    }
  }
}

// ─── Tree event handlers ───
function handleSelectFolder(node) {
  previewRequestId += 1
  activeTreePath.value = node.path
  selectedFile.value = null
  navigateTo(node.path)
  loadDirectory(node.path)
}

function handleToggleFolder(node) {
  node.expanded = !node.expanded
}

async function handleSelectFile(file) {
  const requestId = ++previewRequestId
  selectedFile.value = { ...file, content: null, error: null, loading: true }
  activeTreePath.value = file.path
  await loadFilePreview(file, requestId)
}

function commitFilePreview(file, requestId, patch) {
  if (requestId !== previewRequestId || selectedFile.value?.path !== file.path) return false
  selectedFile.value = { ...file, ...patch }
  return true
}

const TEXT_EXTS = new Set([
  'md',
  'markdown',
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'ini',
  'env',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'vue',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'swift',
  'kt',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'sh',
  'bat',
  'ps1',
  'sql',
])

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
        error: result?.success === false
          ? (result.message || '远程媒体引用读取失败')
          : (result?.registration?.success === false ? (result.registration.message || '远程媒体引用读取失败') : null),
        loading: false,
        remoteMediaReference: true,
        mediaType: current?.mediaType || result?.metadata?.media?.mediaType || 'video',
      })
    } catch (e) {
      commitFilePreview(file, requestId, {
        content: null,
        error: e.message || '远程媒体引用读取失败',
        loading: false,
        remoteMediaReference: true,
        mediaType: file.mediaType || 'video',
      })
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
        loading: false,
        ext,
        processingStatus,
        pdfStatus: result?.success ? result : null,
      })
    } catch (e) {
      commitFilePreview(file, requestId, { content: null, error: e.message, loading: false, ext })
    }
    return
  }
  if (isImage || isAudio || isVideo) {
    const committed = commitFilePreview(file, requestId, {
      content: null,
      error: null,
      loading: false,
      mediaType: isImage ? 'image' : isAudio ? 'audio' : 'video',
    })
    if (committed && (isAudio || isVideo)) await refreshMediaStatus(selectedFile.value)
    return
  }
  if (!TEXT_EXTS.has(ext)) {
    commitFilePreview(file, requestId, { content: null, error: null, loading: false, unsupported: true })
    return
  }
  try {
    const result = await api()?.readFile?.(file.path)
    if (result?.success) {
      commitFilePreview(file, requestId, { content: result.data, error: null, loading: false, ext })
    } else {
      commitFilePreview(file, requestId, { content: null, error: result?.error || '读取失败', loading: false, ext })
    }
  } catch (e) {
    commitFilePreview(file, requestId, { content: null, error: e.message, loading: false, ext })
  }
}

function closePreview() {
  previewRequestId += 1
  selectedFile.value = null
  activeTreePath.value = currentPath.value
}

function getFileIcon(ext) {
  return fileIcon('x.' + ext, false)
}

function getFileIconColor(ext) {
  return fileIconColor('x.' + ext, false)
}

// ─── Jump to conversation ───
async function chatWith(item) {
  if (!item) return
  let mediaId = item.mediaId || ''
  if (isMediaItem(item) && !mediaId) {
    const registration = await registerDocsMedia(item)
    mediaId = registration?.source?.id || ''
  }
  workchatStore.ctxItems = [{
    type: item.isDirectory ? 'folder' : 'file',
    source: 'docs',
    id: `docs_${Date.now()}`,
    name: item.name,
    path: item.path,
    isDirectory: !!item.isDirectory,
    ...(mediaId ? { mediaId } : {}),
  }]
  router.push({ path: '/workchat' })
}

// ─── Count helpers ───
const dirCount = computed(() => items.value.filter((i) => i.isDirectory).length)
const fileCount = computed(() => items.value.filter((i) => !i.isDirectory).length)

// ─── Breadcrumb ───
const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const crumbs = [{ label: '全部文档', path: '' }]
  let accumulated = ''
  for (const p of parts) {
    accumulated += (accumulated ? '/' : '') + p
    crumbs.push({ label: p, path: accumulated })
  }
  return crumbs
})

// ─── Actions ───
function normalizeRelativePath(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function getItemRelativePath(item) {
  if (typeof item?.relPath === 'string') return normalizeRelativePath(item.relPath)

  const docsBase = normalizeRelativePath(getDocsBasePath())
  const itemPath = normalizeRelativePath(item?.path)
  if (!docsBase || !itemPath) return null
  if (itemPath.toLowerCase() === docsBase.toLowerCase()) return ''

  const prefix = docsBase + '/'
  if (!itemPath.toLowerCase().startsWith(prefix.toLowerCase())) return null
  return itemPath.slice(prefix.length)
}

function openCreateFolderModal(parentPath = currentPath.value) {
  createFolderParentPath.value = normalizeRelativePath(parentPath)
  newFolderName.value = ''
  showCreateFolderModal.value = true
}

function openCreateSubfolderModal(item) {
  if (!item?.isDirectory) return
  const parentPath = getItemRelativePath(item)
  if (parentPath === null) {
    msg.error('无法确定目标文件夹路径')
    return
  }
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
    if (!result?.success) {
      msg.error(result?.error || '创建文件夹失败')
      return
    }

    newFolderName.value = ''
    showCreateFolderModal.value = false
    if (parentPath === currentPath.value) await loadDirectory(currentPath.value)
    await loadFolderTree()
    expandPathInTree(parentPath)
  } catch (error) {
    msg.error(error?.message || '创建文件夹失败')
  }
}

async function uploadFiles() {
  showUploadModal.value = true
}

function openRenameModal(item) {
  renameItem.value = item
  renameValue.value = splitEditableName(item.name, item.isDirectory).base
  renameError.value = ''
  showRenameModal.value = true
  contextMenu.value = null
}

async function confirmRename() {
  renameError.value = ''
  if (!renameItem.value) return false
  if (!renameCanSubmit.value) {
    renameError.value = renameValidationMessage.value
    return false
  }
  const oldPath = renameItem.value.path
  if (!oldPath) {
    renameError.value = '缺少原文件路径'
    return false
  }
  const newName = renameTargetName.value
  const dir = dirnameOfPath(oldPath)
  const newPath = joinPathName(dir, newName)
  const result = await api()?.rename?.(oldPath, newPath)
  if (result?.success) {
    if (selectedItem.value?.path === oldPath) {
      selectedItem.value = { ...selectedItem.value, path: newPath, name: newName }
    }
    if (selectedFile.value?.path === oldPath) {
      selectedFile.value = { ...selectedFile.value, path: newPath, name: newName }
    }
    renameItem.value = null
    renameValue.value = ''
    renameError.value = ''
    showRenameModal.value = false
    loadDirectory(currentPath.value)
    loadFolderTree()
    return true
  }
  renameError.value = result?.error || '重命名失败'
  return false
}

async function deleteItem(item) {
  const result = await recycleBinStore.moveToTrash(item.path, {
    isDirectory: item.isDirectory,
    name: item.name,
  })
  if (result?.success) {
    if (selectedItem.value?.name === item.name) selectedItem.value = null
    loadDirectory(currentPath.value)
    loadFolderTree()
  }
}

function showInFolder(item) {
  api()?.showItemInFolder?.(item.path)
}

function selectItem(item) {
  selectedItem.value = item
}

function showContextMenu(e, item) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, item }
  if (isPdfItem(item)) {
    const statusPromise = api()?.pdf?.getStatus?.(item.path, { probe: false })
    if (statusPromise?.then) {
      statusPromise.then((result) => {
        const status = pdfProcessingStatusFromResult(result)
        applyProcessingStatus(item.path, status)
        if (contextMenu.value?.item?.path === item.path) {
          contextMenu.value = {
            ...contextMenu.value,
            item: { ...contextMenu.value.item, processingStatus: status },
          }
        }
      }).catch(() => {})
    }
  } else if (isMediaItem(item)) {
    refreshMediaStatus(item).then(() => {
      const refreshed = items.value.find(entry => entry.path === item.path)
      if (refreshed && contextMenu.value?.item?.path === item.path) {
        contextMenu.value = { ...contextMenu.value, item: refreshed }
      }
    }).catch(() => {})
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

const showDeleteModal = computed({
  get: () => confirmDelete.value !== null,
  set: (val) => {
    if (!val) confirmDelete.value = null
  },
})

// ─── Filter ───
const filteredItems = computed(() => {
  if (!searchQuery.value) return items.value
  const q = searchQuery.value.toLowerCase()
  return items.value.filter((f) => f.name.toLowerCase().includes(q))
})

// ─── File preview chat handler ───
function chatWithFile(file) {
  if (!file?.path) return
  // router.push({ path: '/workspace', query: { doc: file.path, type: 'file' } })
   router.push({ path: '/workchat' })
}

function previewItem(item) {
  if (item.isDirectory) {
    openItem(item)
    return
  }
  handleSelectFile({
    name: item.name,
    path: item.path,
    ext: item.name.split('.').pop().toLowerCase(),
  })
}

// ─── Upload submit ───
function safeRemoteReferenceBase(title, sourceType) {
  const fallback = sourceType === 'bilibili' ? 'B站视频' : '远程音视频'
  return String(title || fallback).replace(/\.media\.md$/i, '').replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80) || fallback
}

function safeRemoteReferenceName(title, sourceType) {
  return `${safeRemoteReferenceBase(title, sourceType)}-${Date.now().toString(36)}.media.md`
}

async function uniqueRemoteReferencePath(targetDir, title, sourceType, currentPath = '') {
  const base = safeRemoteReferenceBase(title, sourceType)
  for (let index = 1; index <= 999; index++) {
    const suffix = index === 1 ? '' : ` (${index})`
    const candidate = joinPathName(targetDir, `${base}${suffix}.media.md`)
    if (candidate === currentPath || !(await api()?.exists?.(candidate))) return candidate
  }
  return joinPathName(targetDir, `${base}-${Date.now().toString(36)}.media.md`)
}

function remoteReferenceContent({ mediaId, title, sourceType }) {
  const displayTitle = String(title || '远程音视频').replace(/[\r\n]+/g, ' ').trim()
  return `---\nmindspaceMediaReference: 1\nmediaId: ${mediaId}\nsourceType: ${sourceType}\n---\n\n# ${displayTitle}\n\n这是 MindSpace 的远程音视频安全引用。原始或签名 URL 不会写入本文档；请通过“解析详情”查看转录、关键帧和历史版本。\n`
}

async function confirmMediaAnalysis(count = 1) {
  const amount = Math.max(1, Number(count) || 1)
  return mbox.confirm({
    title: amount > 1 ? `开始解析 ${amount} 个媒体文件？` : '开始解析这个媒体文件？',
    subtitle: '将按照当前媒体解析方案创建任务',
    message: '解析可能调用语音模型、下载远程媒体或提取视频关键帧，并可能产生服务费用。',
    variant: 'warning',
    confirmText: '开始解析',
    cancelText: '稍后手动解析',
  })
}

async function shouldStartMediaAnalysis(count = 1) {
  const action = processingSettings.value.mediaAction || 'ask'
  if (action === 'low_cost_auto') return true
  if (action === 'manual') return false
  return confirmMediaAnalysis(count)
}

async function handleUploadSubmit({ type, files, url, includeHtml, title, sourceType, presetId }) {
  if (type === 'url') {
    webImportSubmitting.value = true
    try {
      await api()?.webImport?.createJob?.({ targetType: 'docs', targetRef: currentPath.value, url, includeHtml })
      await loadWebImportJobs({ reset: true })
    } finally { webImportSubmitting.value = false }
    return
  }
  if (type === 'media') {
    remoteMediaSubmitting.value = true
    remoteMediaError.value = ''
    const targetDir = getAbsolutePath(currentPath.value)
    let targetPath = joinPathName(targetDir, safeRemoteReferenceName(title, sourceType))
    try {
      const placeholder = await api()?.writeFile?.(targetPath, '# 正在登记远程音视频…\n')
      if (placeholder?.success === false) throw new Error(placeholder.error || '无法创建远程媒体引用文件')
      const result = await api()?.media?.register?.({
        url,
        sourceType,
        title: title || '',
        owner: { type: 'docs_file', id: '', locator: targetPath },
      })
      if (!result?.success) throw new Error(result?.message || '远程音视频登记失败')
      const resolvedTitle = result.source.title || title || (sourceType === 'bilibili' ? 'B 站视频' : '远程音视频')
      const titledPath = await uniqueRemoteReferencePath(targetDir, resolvedTitle, sourceType, targetPath)
      if (titledPath !== targetPath) {
        const renamed = await api()?.rename?.(targetPath, titledPath)
        if (renamed?.success) targetPath = titledPath
        else console.warn('[Docs] Failed to rename remote media reference:', renamed?.error || renamed)
      }
      const content = remoteReferenceContent({
        mediaId: result.source.id,
        title: resolvedTitle,
        sourceType,
      })
      const written = await api()?.writeFile?.(targetPath, content)
      if (written?.success === false) throw new Error(written.error || '远程媒体引用文件写入失败')
      if (await shouldStartMediaAnalysis(1)) {
        const analysis = await api()?.media?.analyze?.(result.source.id, {
          ...mediaAnalyzeOptions(),
          presetId: presetId || processingSettings.value.mediaPreset || 'subtitle_first',
          extractKeyframes: presetId === 'keyframe_enhanced' || processingSettings.value.mediaExtractKeyframes === true,
        })
        if (!analysis?.success) console.warn('[Docs] Remote media analysis was not started:', analysis?.message || analysis)
      }
      await loadDirectory(currentPath.value)
      await loadFolderTree()
      showUploadModal.value = false
    } catch (error) {
      remoteMediaError.value = error?.message || '添加远程音视频失败'
      try { await api()?.deleteFile?.(targetPath) } catch {}
    } finally {
      remoteMediaSubmitting.value = false
    }
    return
  }
  if (type !== 'local' || !files?.length) return
  const targetDir = getAbsolutePath(currentPath.value)
  const copiedPdfPaths = []
  const copiedMediaItems = []
  for (const f of files) {
    const dest = targetDir + '/' + f.name
    await api()?.copyFile?.(f.path, dest)
    const ext = (f.name || '').split('.').pop()?.toLowerCase()
    if (ext === 'pdf') copiedPdfPaths.push(dest)
    if (MEDIA_PARSE_EXTS.has(ext)) copiedMediaItems.push({ name: f.name, path: dest, ext })
  }
  loadDirectory(currentPath.value)
  loadFolderTree()
  if (copiedPdfPaths.length) {
    handlePdfUploadProcessing(copiedPdfPaths)
  }
  if (copiedMediaItems.length) handleMediaUploadProcessing(copiedMediaItems)
}

async function handleMediaUploadProcessing(mediaItems) {
  const registrations = await Promise.allSettled(mediaItems.map(async (item) => {
    const registration = await registerDocsMedia(item)
    return registration
  }))
  const registered = registrations
    .filter(item => item.status === 'fulfilled' && item.value?.success && item.value?.source?.id)
    .map(item => item.value)
  if (registered.length && await shouldStartMediaAnalysis(registered.length)) {
    await Promise.allSettled(registered.map(registration => api()?.media?.analyze?.(registration.source.id, mediaAnalyzeOptions())))
  }
  await loadDocumentProcessingStatuses(items.value)
}

function handlePdfUploadProcessing(paths) {
  const action = processingSettings.value.uploadAction || 'ask'
  if (action === 'preflight') {
    runPdfPreflightForUploads(paths)
    return
  }
  if (action === 'full') {
    runPdfParseForUploads(paths, processingSettings.value.pdfEngine)
    return
  }
  if (action === 'none') return
  pendingPdfUploads.value = paths
  pdfUploadEngine.value = processingSettings.value.pdfEngine || 'auto'
  showPdfUploadPrompt.value = true
}

function runPdfPreflightForUploads(paths = pendingPdfUploads.value) {
  Promise.allSettled(paths.map(filePath => api()?.pdf?.preflight?.(filePath, {
    sourceInfo: { origin: 'docs_upload' },
  }))).then((results) => {
    results.forEach((item, index) => {
      if (item.status === 'fulfilled') applyProcessingStatus(paths[index], pdfProcessingStatusFromResult(item.value))
    })
    const failed = results.filter(item => item.status === 'rejected' || item.value?.success === false)
    if (failed.length) console.warn('[Docs] PDF preflight failed:', failed)
  })
}

function isLocalParserMissingResult(result) {
  return result?.code === 'PDF_TEXT_DEPENDENCY_MISSING'
    || result?.code === 'PYMUPDF_NOT_INSTALLED'
    || result?.code === 'PYPDF_NOT_INSTALLED'
    || String(result?.message || result?.error || '').includes('PyMuPDF')
}

function pdfOcrProviderForRun() {
  const selected = processingSettings.value.defaultOcrProvider
  if (selected && selected !== 'auto' && selectedEnabledOcrProvider()) return selected
  return 'auto'
}

async function parsePdfByStrategy(filePath, engine = processingSettings.value.pdfEngine, origin = 'docs_manual_parse') {
  const selectedEngine = engine || 'auto'
  const provider = pdfOcrProviderForRun()
  if (selectedEngine === 'document_intelligent') {
    return api()?.pdf?.startOcr?.(filePath, {
      provider,
      confirmFull: true,
      fullDocument: true,
      sourceInfo: { origin },
    })
  }
  const preflight = await api()?.pdf?.preflight?.(filePath, {
    sourceInfo: { origin },
  })
  if (selectedEngine === 'local_fast') return preflight
  if (preflight?.success && preflight.pdfTextMode === 'text') return preflight
  if (!preflight?.success && isLocalParserMissingResult(preflight)) {
    if (processingSettings.value.missingPythonFallback !== 'ocr_provider') return preflight
    if (!effectiveOcrProvider.value) return preflight
  }
  if (!effectiveOcrProvider.value) return preflight
  if (preflight?.success && Array.isArray(preflight.ocrCandidatePages) && preflight.ocrCandidatePages.length) {
    return api()?.pdf?.startOcr?.(filePath, {
      provider,
      pages: preflight.ocrCandidatePages,
      confirmFull: true,
      fullDocument: false,
      sourceInfo: { origin },
    })
  }
  return api()?.pdf?.startOcr?.(filePath, {
    provider,
    confirmFull: true,
    fullDocument: preflight?.success === false,
    sourceInfo: { origin },
  })
}

async function parsePdfFromContextMenu(item) {
  if (!isPdfItem(item) || isPdfParsed(item) || isPdfParsing(item)) return
  const filePath = item.path
  const status = currentProcessingStatusFor(item)
  const engine = ['text_ready', 'partial', 'mixed', 'needs_ocr'].includes(status?.state)
    ? 'document_intelligent'
    : processingSettings.value.pdfEngine
  manualParsingPdfPaths.value = new Set([...manualParsingPdfPaths.value, filePath])
  applyProcessingStatus(filePath, {
    kind: 'pdf',
    state: 'parsing',
    tone: 'pending',
    label: '解析中',
    detail: '正在按默认策略处理 PDF',
  })
  try {
    const result = await parsePdfByStrategy(filePath, engine, 'docs_context_menu_parse')
    applyProcessingStatus(filePath, pdfProcessingStatusFromResult(result))
    if (result?.success === false) console.warn('[Docs] PDF manual parse failed:', result)
  } catch (e) {
    applyProcessingStatus(filePath, {
      kind: 'pdf',
      state: 'error',
      tone: 'error',
      label: '解析失败',
      detail: e.message || 'PDF 解析失败',
    })
  } finally {
    const next = new Set(manualParsingPdfPaths.value)
    next.delete(filePath)
    manualParsingPdfPaths.value = next
    loadDocumentProcessingStatuses(items.value)
  }
}

async function parseMediaFromContextMenu(item) {
  if (!isMediaItem(item) || isMediaParsing(item)) return
  const filePath = item.path
  manualParsingMediaPaths.value = new Set([...manualParsingMediaPaths.value, filePath])
  applyProcessingStatus(filePath, {
    kind: AUDIO_PARSE_EXTS.has(extOfFile(item)) ? 'audio' : 'video',
    state: 'queued',
    tone: 'pending',
    label: '排队中',
    detail: '正在创建媒体解析任务',
  })
  try {
    const registration = await registerDocsMedia(item)
    if (!registration?.success) throw new Error(registration?.message || '媒体登记失败')
    const result = await api()?.media?.analyze?.(registration.source.id, mediaAnalyzeOptions())
    if (!result?.success) throw new Error(result?.message || '媒体解析任务创建失败')
    applyMediaState(filePath, {
      mediaId: registration.source.id,
      mediaRunId: result.run?.id || '',
      processingStatus: {
        kind: AUDIO_PARSE_EXTS.has(extOfFile(item)) ? 'audio' : 'video',
        state: result.run?.status || 'queued',
        tone: result.run?.status === 'running' ? 'running' : 'pending',
        label: result.run?.status === 'running' ? `解析中 ${result.run?.progress || 0}%` : '排队中',
        detail: result.run?.message || '等待后台解析',
      },
    })
  } catch (error) {
    applyProcessingStatus(filePath, {
      kind: AUDIO_PARSE_EXTS.has(extOfFile(item)) ? 'audio' : 'video',
      state: 'error',
      tone: 'error',
      label: '解析失败',
      detail: error.message || '媒体解析失败',
    })
  } finally {
    const next = new Set(manualParsingMediaPaths.value)
    next.delete(filePath)
    manualParsingMediaPaths.value = next
  }
}

function runPdfParseForUploads(paths = pendingPdfUploads.value, engine = pdfUploadEngine.value) {
  const selectedEngine = engine || 'auto'
  Promise.allSettled(paths.map(filePath => parsePdfByStrategy(filePath, selectedEngine, 'docs_upload_full_parse'))).then((results) => {
    loadDocumentProcessingStatuses(items.value)
    const failed = results.filter(item => item.status === 'rejected' || item.value?.success === false)
    if (failed.length) console.warn('[Docs] PDF full parse failed:', failed)
  })
}

function closePdfUploadPrompt() {
  pendingPdfUploads.value = []
  showPdfUploadPrompt.value = false
}

// ─── Move handling ───
function openMoveModal(item) {
  // item.path is absolute; convert to relPath when item.relPath is missing
  const docsBase = getDocsBasePath()
  let relPath = item.relPath
  if (!relPath && docsBase && item.path?.startsWith(docsBase)) {
    relPath = item.path
      .slice(docsBase.length)
      .replace(/^[\\/]+/, '')
      .replace(/\\/g, '/')
  }
  moveTarget.value = {
    name: item.name,
    path: item.path,
    isDirectory: !!item.isDirectory,
    relPath: relPath || '',
  }
  showMoveModal.value = true
  contextMenu.value = null
}

async function handleMoveSubmit({ item, destRelPath }) {
  const srcAbs = item.path
  const destAbs = (destRelPath ? getAbsolutePath(destRelPath) : getDocsBasePath()) + '/' + item.name
  if (srcAbs === destAbs) return
  const result = await api()?.rename?.(srcAbs, destAbs)
  if (result?.success) {
    if (selectedFile.value?.path === srcAbs) {
      previewRequestId += 1
      selectedFile.value = null
    }
    loadDirectory(currentPath.value)
    loadFolderTree()
  } else {
    console.error('Move failed:', result?.error)
  }
}

// ─── Tree contextmenu handlers ───
function handleTreeFolderContextMenu(e, node) {
  const absPath = getAbsolutePath(node.path)
  const fakeItem = {
    name: node.name,
    path: absPath,
    relPath: node.path,
    isDirectory: true,
  }
  showContextMenu(e, fakeItem)
}

function handleTreeFileContextMenu(e, file) {
  const fakeItem = {
    name: file.name,
    path: file.path,
    isDirectory: false,
  }
  showContextMenu(e, fakeItem)
}

// ─── Init ───
onMounted(() => {
  loadProcessingSettings()
  mediaStore.loadSpeechSettings()
  webJobUpdatedHandler = api()?.webImport?.onJobUpdated?.((job) => {
    if (job?.target_type !== 'docs' || job.target_ref !== currentPath.value) return
    const index = webImportJobs.value.findIndex(item => item.id === job.id)
    if (index >= 0) webImportJobs.value[index] = job
    else webImportJobs.value.unshift(job)
    if (['succeeded', 'partial'].includes(job.status)) { loadDirectory(currentPath.value); loadFolderTree() }
  })
  if (isReady.value) {
    loadDirectory('')
    loadFolderTree()
  }
  mediaStatusPollTimer = setInterval(refreshActiveMediaStatuses, 2500)
})

onBeforeUnmount(() => {
  previewRequestId += 1
  api()?.webImport?.removeJobUpdatedListener?.(webJobUpdatedHandler)
  if (mediaStatusPollTimer) clearInterval(mediaStatusPollTimer)
  mediaStatusPollTimer = null
})

watch(
  () => settingsStore.workDirRoot,
  (newVal) => {
    if (newVal) {
      currentPath.value = ''
      loadDirectory('')
      loadFolderTree()
    } else {
      items.value = []
      folderTree.value = { folders: [], files: [] }
    }
  },
)

watch(showProcessingSettingsModal, (visible) => {
  if (visible) {
    loadProcessingSettings()
    loadOcrProviders()
    loadPdfEnvironment()
    loadWebImportSettings()
    mediaStore.loadSpeechSettings({ force: true })
  }
})

watch(showUploadModal, visible => {
  if (visible) {
    remoteMediaError.value = ''
    loadWebImportSettings()
    loadWebImportJobs({ reset: true })
    mediaStore.loadSpeechSettings({ force: true })
  }
})

watch(showWebImportHistory, visible => {
  if (visible) loadWebImportJobs({ reset: true })
})

watch(currentPath, () => {
  if (showUploadModal.value || showWebImportHistory.value) loadWebImportJobs({ reset: true })
})

watch(showPdfUploadPrompt, (visible) => {
  if (visible) {
    loadProcessingSettings()
    loadOcrProviders()
    loadPdfEnvironment()
  }
})
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


