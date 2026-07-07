<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useRecycleBinStore } from '@/stores/recycleBin'
import MsModal from '@/components/MsModal/MsModal.vue'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import MsTreeItem from '@/components/MsTreeItem/MsTreeItem.vue'
import DocTreeItem from './sections/DocTreeItem.vue'
import DocGridCard from './sections/DocGridCard.vue'
import DocListRow from './sections/DocListRow.vue'
import DocPreview from './sections/DocPreview.vue'
import UploadModal from './sections/UploadModal.vue'
import MoveModal from './sections/MoveModal.vue'
import PdfProcessingSettingsModal from './sections/PdfProcessingSettingsModal.vue'

const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const recycleBinStore = useRecycleBinStore()
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
const showRenameModal = ref(false)
const renameItem = ref(null)
const renameValue = ref('')
const confirmDelete = ref(null)
const contextMenu = ref(null)
const showUploadModal = ref(false)
const showMoveModal = ref(false)
const moveTarget = ref(null)
const showProcessingSettingsModal = ref(false)
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
  mediaAction: 'manual',
}
const processingSettings = ref({ ...defaultProcessingSettings })
const ocrProviders = ref([])
const pdfEnvironment = ref(null)
const installingPdfLocalParser = ref(false)
const pdfLocalParserInstallResult = ref(null)

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

async function loadOcrProviders() {
  try {
    const result = await api()?.listOcrProviders?.()
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
  const next = normalizeProcessingSettings(processingSettings.value)
  const result = await api()?.pdf?.setSettings?.(next)
  if (result?.success) {
    processingSettings.value = normalizeProcessingSettings(result.data)
    close?.()
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

const enabledOcrProviders = computed(() => ocrProviders.value.filter(provider =>
  provider?.enabled
  && ['mineru', 'paddleocr'].includes(String(provider.type || '').toLowerCase())
  && provider.base_url
  && provider.api_key_ref
))

const effectiveOcrProvider = computed(() => {
  const selected = processingSettings.value.defaultOcrProvider
  if (selected && selected !== 'auto') {
    return enabledOcrProviders.value.find(provider => provider.id === selected) || null
  }
  return enabledOcrProviders.value.find(provider => String(provider.type || '').toLowerCase() === 'mineru')
    || enabledOcrProviders.value.find(provider => String(provider.type || '').toLowerCase() === 'paddleocr')
    || null
})

const ocrProviderStatusText = computed(() => {
  const provider = effectiveOcrProvider.value
  if (!enabledOcrProviders.value.length) return '未配置可用的文档智能解析服务'
  if (!provider) return '当前选择的服务商不可用'
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

const MEDIA_PARSE_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'ogg', 'flac', 'aac'])

function extOfFile(item = {}) {
  return String(item.ext || item.name?.split('.').pop() || '').toLowerCase()
}

function pdfProcessingStatusFromResult(result) {
  if (!result) return { kind: 'pdf', state: 'unknown', tone: 'pending', label: '未检测', detail: '尚未读取 PDF 缓存状态' }
  if (!result.success) {
    if (result.code === 'PDF_TEXT_DEPENDENCY_MISSING' || result.code === 'PYMUPDF_NOT_INSTALLED') {
      return { kind: 'pdf', state: 'local_missing', tone: 'warning', label: '缺少本地库', detail: result.message || '缺少 PyMuPDF' }
    }
    return { kind: 'pdf', state: 'error', tone: 'error', label: '状态异常', detail: result.message || result.error || 'PDF 状态读取失败' }
  }
  if (result.ocrManifestCount > 0 || result.processingStatus === 'ocr_ready') {
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
  if (!MEDIA_PARSE_EXTS.has(ext)) return null
  return { kind: ext.startsWith('mp') || ['wav', 'ogg', 'flac', 'aac'].includes(ext) ? 'media' : 'video', state: 'future', tone: 'future', label: '解析待支持', detail: '媒体解析策略已预留，后续支持音视频转写、抽帧和摘要' }
}

function baseProcessingStatusFor(item) {
  if (item?.isDirectory) return null
  const ext = extOfFile(item)
  if (ext === 'pdf') return { kind: 'pdf', state: 'pending', tone: 'pending', label: '未解析', detail: '尚未生成 PDF 解析缓存' }
  return mediaProcessingStatusFor(item)
}

function applyProcessingStatus(filePath, status) {
  const idx = items.value.findIndex(item => item.path === filePath)
  if (idx >= 0) items.value[idx] = { ...items.value[idx], processingStatus: status }
  if (selectedFile.value?.path === filePath) selectedFile.value = { ...selectedFile.value, processingStatus: status }
}

async function loadDocumentProcessingStatuses(entries = items.value) {
  const pdfEntries = entries.filter(item => !item.isDirectory && extOfFile(item) === 'pdf')
  await Promise.allSettled(pdfEntries.map(async (entry) => {
    const result = await api()?.pdf?.getStatus?.(entry.path, { probe: false })
    applyProcessingStatus(entry.path, pdfProcessingStatusFromResult(result))
  }))
}

function openOcrSettings() {
  showProcessingSettingsModal.value = false
  showPdfUploadPrompt.value = false
  router.push('/settings/ocr')
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

// ─── File type helpers ───
function fileIcon(name, isDir) {
  if (isDir) return 'ri-folder-3-line'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'ri-file-pdf-2-line',
    md: 'ri-markdown-line',
    markdown: 'ri-markdown-line',
    docx: 'ri-file-word-2-line',
    doc: 'ri-file-word-2-line',
    txt: 'ri-file-text-line',
    xlsx: 'ri-file-excel-2-line',
    xls: 'ri-file-excel-2-line',
    pptx: 'ri-file-ppt-2-line',
    ppt: 'ri-file-ppt-2-line',
    png: 'ri-image-line',
    jpg: 'ri-image-line',
    jpeg: 'ri-image-line',
    gif: 'ri-image-line',
    svg: 'ri-image-line',
    webp: 'ri-image-line',
    zip: 'ri-file-zip-line',
    rar: 'ri-file-zip-line',
    '7z': 'ri-file-zip-line',
    mp4: 'ri-movie-line',
    mp3: 'ri-music-line',
    wav: 'ri-music-line',
    csv: 'ri-file-text-line',
    json: 'ri-code-line',
    js: 'ri-code-line',
    py: 'ri-code-line',
    java: 'ri-code-line',
    cpp: 'ri-code-line',
  }
  return map[ext] || 'ri-file-line'
}

function fileIconColor(name, isDir) {
  if (isDir) return isDark.value ? 'text-amber-400' : 'text-amber-500'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'text-red-400',
    md: 'text-emerald-400',
    docx: 'text-blue-400',
    xlsx: 'text-emerald-400',
    pptx: 'text-orange-400',
    png: 'text-pink-400',
    jpg: 'text-pink-400',
    zip: 'text-yellow-400',
    mp4: 'text-purple-400',
  }
  return map[ext] || (isDark.value ? 'text-wt-aux' : 'text-lt-aux')
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
  activeTreePath.value = node.path
  selectedFile.value = null
  navigateTo(node.path)
  loadDirectory(node.path)
}

function handleToggleFolder(node) {
  node.expanded = !node.expanded
}

async function handleSelectFile(file) {
  selectedFile.value = { ...file, content: null, error: null, loading: true }
  activeTreePath.value = file.path
  await loadFilePreview(file)
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

async function loadFilePreview(file) {
  const ext = (file.ext || file.name.split('.').pop() || '').toLowerCase()
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
  const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)
  const isVideo = ['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext)
  if (ext === 'pdf') {
    try {
      const result = await api()?.pdf?.preflight?.(file.path, { sourceInfo: { origin: 'docs_preview' } })
      const processingStatus = pdfProcessingStatusFromResult(result)
      applyProcessingStatus(file.path, processingStatus)
      selectedFile.value = {
        ...file,
        content: null,
        error: result?.success === false ? (result.message || result.error || 'PDF 预检失败') : null,
        loading: false,
        ext,
        processingStatus,
        pdfStatus: result?.success ? result : null,
      }
    } catch (e) {
      selectedFile.value = { ...file, content: null, error: e.message, loading: false, ext }
    }
    return
  }
  if (isImage || isAudio || isVideo) {
    selectedFile.value = {
      ...file,
      content: null,
      error: null,
      loading: false,
      mediaType: isImage ? 'image' : isAudio ? 'audio' : 'video',
    }
    return
  }
  if (!TEXT_EXTS.has(ext)) {
    selectedFile.value = { ...file, content: null, error: null, loading: false, unsupported: true }
    return
  }
  try {
    const result = await api()?.readFile?.(file.path)
    if (result?.success) {
      selectedFile.value = { ...file, content: result.data, error: null, loading: false, ext }
    } else {
      selectedFile.value = { ...file, content: null, error: result?.error || '读取失败', loading: false }
    }
  } catch (e) {
    selectedFile.value = { ...file, content: null, error: e.message, loading: false }
  }
}

function closePreview() {
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
function chatWith(item) {
  const fullPath = currentPath.value ? currentPath.value + '/' + item.name : item.name
  router.push({ path: '/workchat' })
  // router.push({ path: '/workspace', query: { doc: fullPath, type: item.isDirectory ? 'folder' : 'file' } })
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
async function createFolder() {
  if (!newFolderName.value.trim()) return
  const relPath = currentPath.value ? currentPath.value + '/' + newFolderName.value : newFolderName.value
  const absPath = getAbsolutePath(relPath)
  const result = await api()?.mkdir?.(absPath)
  if (result?.success) {
    newFolderName.value = ''
    showCreateFolderModal.value = false
    loadDirectory(currentPath.value)
    loadFolderTree()
  }
}

async function uploadFiles() {
  showUploadModal.value = true
}

function openRenameModal(item) {
  renameItem.value = item
  renameValue.value = item.name
  showRenameModal.value = true
  contextMenu.value = null
}

async function confirmRename() {
  if (!renameItem.value || !renameValue.value.trim()) return
  const dir = getAbsolutePath(currentPath.value)
  const oldPath = dir + '/' + renameItem.value.name
  const newPath = dir + '/' + renameValue.value
  const result = await api()?.rename?.(oldPath, newPath)
  if (result?.success) {
    renameItem.value = null
    renameValue.value = ''
    showRenameModal.value = false
    loadDirectory(currentPath.value)
    loadFolderTree()
  }
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
async function handleUploadSubmit({ type, files }) {
  if (type !== 'local' || !files?.length) return
  const targetDir = getAbsolutePath(currentPath.value)
  const copiedPdfPaths = []
  for (const f of files) {
    const dest = targetDir + '/' + f.name
    await api()?.copyFile?.(f.path, dest)
    if ((f.name || '').split('.').pop()?.toLowerCase() === 'pdf') copiedPdfPaths.push(dest)
  }
  loadDirectory(currentPath.value)
  loadFolderTree()
  if (copiedPdfPaths.length) {
    handlePdfUploadProcessing(copiedPdfPaths)
  }
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

function runPdfParseForUploads(paths = pendingPdfUploads.value, engine = pdfUploadEngine.value) {
  const selectedEngine = engine || 'auto'
  Promise.allSettled(paths.map(async (filePath) => {
    if (selectedEngine === 'document_intelligent') {
      return api()?.pdf?.startOcr?.(filePath, {
        provider: processingSettings.value.defaultOcrProvider || 'auto',
        confirmFull: true,
        fullDocument: true,
        sourceInfo: { origin: 'docs_upload_full_parse' },
      })
    }
    const preflight = await api()?.pdf?.preflight?.(filePath, {
      sourceInfo: { origin: 'docs_upload' },
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
        provider: processingSettings.value.defaultOcrProvider || 'auto',
        pages: preflight.ocrCandidatePages,
        confirmFull: true,
        fullDocument: false,
        sourceInfo: { origin: 'docs_upload_auto_candidate_pages' },
      })
    }
    return api()?.pdf?.startOcr?.(filePath, {
      provider: processingSettings.value.defaultOcrProvider || 'auto',
      confirmFull: true,
      fullDocument: preflight?.success === false,
      sourceInfo: { origin: 'docs_upload_full_parse' },
    })
  })).then((results) => {
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
    if (selectedFile.value?.path === srcAbs) selectedFile.value = null
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
  loadOcrProviders()
  loadPdfEnvironment()
  if (isReady.value) {
    loadDirectory('')
    loadFolderTree()
  }
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
    loadOcrProviders()
    loadPdfEnvironment()
  }
})

watch(showPdfUploadPrompt, (visible) => {
  if (visible) loadOcrProviders()
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
          <i class="ri-folder-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="text-[12.5px] font-semibold tracking-wide" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            我的文档
          </span>
        </div>
        <div class="flex items-center gap-0.5">
          <button
            @click="showCreateFolderModal = true"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="新建文件夹">
            <i class="ri-folder-add-line text-[13px]" />
          </button>
          <button
            @click="showUploadModal = true"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="上传文件">
            <i class="ri-upload-2-line text-[13px]" />
          </button>
          <button
            @click="showProcessingSettingsModal = true"
            class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
            :class="
              isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
            "
            title="解析设置">
            <i class="ri-settings-3-line text-[13px]" />
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
            <i class="ri-refresh-line text-[12px]" />
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
            class="w-full h-7 rounded-md py-0 pl-7 pr-2 text-[11.5px] outline-none transition-colors"
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
          <i class="ri-home-4-line text-[12px]" />
          <span class="text-[11.5px] font-medium flex-1">全部文档</span>
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
          <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无文件</p>
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
          <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请先在设置中选择工作目录</p>
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
          @chat="chatWithFile" />

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
                    class="ri-arrow-right-s-line text-[12px]"
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
                  <i class="ri-grid-line text-[13px]" />
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
                  <i class="ri-list-unordered text-[13px]" />
                </button>
              </div>
              <button
                @click="showCreateFolderModal = true"
                class="ctx-pill cursor-pointer"
                :class="
                  isDark
                    ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15'
                    : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'
                ">
                <i class="ri-folder-add-line text-[10px]" />
                新建文件夹
              </button>
              <button
                @click="showProcessingSettingsModal = true"
                class="ctx-pill cursor-pointer"
                :class="
                  isDark
                    ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                    : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                ">
                <i class="ri-settings-3-line text-[10px]" />
                解析设置
              </button>
              <button
                @click="uploadFiles"
                class="ctx-pill cursor-pointer"
                :class="
                  isDark
                    ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                    : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                ">
                <i class="ri-upload-2-line text-[10px]" />
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
              <p v-if="!searchQuery" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
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

    <!-- ═══ Context Menu ═══ -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed inset-0 z-[60]"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu">
        <div
          class="fixed rounded-xl shadow-xl py-1.5 min-w-[180px] border"
          :class="isDark ? 'bg-d2 border-bdr shadow-black/40' : 'bg-white border-bdrF shadow-xl'"
          :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
          <!-- Open -->
          <button
            @click="
              openItem(contextMenu.item);
              closeContextMenu()
            "
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
            <i class="ri-external-link-line text-[13px]" />
            <span>{{ contextMenu.item.isDirectory ? '打开文件夹' : '打开文件' }}</span>
          </button>
          <!-- Preview (file only) -->
          <button
            v-if="!contextMenu.item.isDirectory"
            @click="
              previewItem(contextMenu.item);
              closeContextMenu()
            "
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
            <i class="ri-eye-line text-[13px]" />
            <span>预览</span>
          </button>
          <!-- Chat -->
          <button
            @click="
              chatWith(contextMenu.item);
              closeContextMenu()
            "
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-brand-400 hover:bg-brand-400/8' : 'text-brand-500 hover:bg-brand-50'">
            <i class="ri-message-3-line text-[13px]" />
            <span>开始对话</span>
          </button>
          <div class="my-1 border-t" :class="isDark ? 'border-bdr' : 'border-bdrF'" />
          <!-- Move -->
          <button
            @click="openMoveModal(contextMenu.item)"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
            <i class="ri-folder-transfer-line text-[13px]" />
            <span>移动到...</span>
          </button>
          <!-- Rename -->
          <button
            @click="openRenameModal(contextMenu.item)"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
            <i class="ri-edit-line text-[13px]" />
            <span>重命名</span>
          </button>
          <!-- Show in folder (file only) -->
          <button
            v-if="!contextMenu.item.isDirectory"
            @click="
              showInFolder(contextMenu.item);
              closeContextMenu()
            "
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
            <i class="ri-folder-open-line text-[13px]" />
            <span>在资源管理器中显示</span>
          </button>
          <div class="my-1 border-t" :class="isDark ? 'border-bdr' : 'border-bdrF'" />
          <!-- Delete -->
          <button
            @click="
              confirmDelete = contextMenu.item;
              closeContextMenu()
            "
            class="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors"
            :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'">
            <i class="ri-delete-bin-line text-[13px]" />
            <span>删除</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ═══ Create Folder Modal ═══ -->
    <MsModal v-if="showCreateFolderModal" v-model:show="showCreateFolderModal" :width="380" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <i class="ri-folder-add-line text-[16px] text-amber-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">新建文件夹</span>
        </div>
      </template>

      <div class="space-y-3">
        <div
          v-if="currentPath"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px]"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">
          <i class="ri-folder-line text-[12px]" />
          <span>当前位置：{{ currentPath }}</span>
        </div>
        <div>
          <label
            class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            文件夹名称
          </label>
          <input
            v-model="newFolderName"
            type="text"
            placeholder="输入文件夹名称"
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
            :class="
              isDark
                ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40'
                : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'
            "
            @keyup.enter="createFolder" />
        </div>
      </div>

      <template #footer="{ close }">
        <button
          @click="close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          @click="
            createFolder();
            close()
          "
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          确认创建
        </button>
      </template>
    </MsModal>

    <!-- ═══ Rename Modal ═══ -->
    <MsModal v-if="showRenameModal" v-model:show="showRenameModal" :width="380" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-edit-line text-[16px] text-brand-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">重命名</span>
        </div>
      </template>

      <div class="space-y-3">
        <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l3'">
          <i
            :class="[
              fileIcon(renameItem?.name, renameItem?.isDirectory),
              fileIconColor(renameItem?.name, renameItem?.isDirectory),
            ]"
            class="text-[14px]" />
          <span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ renameItem?.name }}</span>
        </div>
        <div>
          <label
            class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            新名称
          </label>
          <input
            v-model="renameValue"
            type="text"
            placeholder="输入新名称"
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
            :class="
              isDark
                ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40'
                : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'
            "
            @keyup.enter="confirmRename" />
        </div>
      </div>

      <template #footer="{ close }">
        <button
          @click="close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          @click="
            confirmRename();
            close()
          "
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          确认重命名
        </button>
      </template>
    </MsModal>

    <!-- ═══ Delete Confirmation Modal ═══ -->
    <MsModal v-if="confirmDelete !== null" v-model:show="showDeleteModal" :width="360" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
            <i class="ri-delete-bin-line text-[16px] text-red-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">确认删除</span>
        </div>
      </template>

      <div>
        <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          确定要删除「{{ confirmDelete?.name }}」{{
            confirmDelete?.isDirectory ? '及其所有内容' : ''
          }}吗？文件将移入回收站，可随时恢复。
        </p>
      </div>

      <template #footer="{ close }">
        <button
          @click="close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          @click="
            deleteItem(confirmDelete);
            close()
          "
          class="px-4 py-2 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600">
          移入回收站
        </button>
      </template>
    </MsModal>

    <PdfProcessingSettingsModal
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
      @save="saveProcessingSettings"
      @install-local-parser="installPdfLocalParser"
      @open-ocr-settings="openOcrSettings" />

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
      v-model:show="showUploadModal"
      :is-dark="isDark"
      :current-path="currentPath"
      @submit="handleUploadSubmit" />

    <!-- ═══ Move Modal ═══ -->
    <MoveModal
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
  font-size: 11px;
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
</style>
