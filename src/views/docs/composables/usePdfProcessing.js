import { ref, computed } from 'vue'

export function usePdfProcessing({ processingSettings, status, settings, media }) {
  const api = () => window.electronAPI

  const {
    isPdfItem,
    currentProcessingStatusFor,
    isLocalFastPdfStrategy,
    applyProcessingStatus,
    pdfProcessingStatusFromResult,
  } = status

  const { effectiveOcrProvider, selectedEnabledOcrProvider } = settings
  const { loadDocumentProcessingStatuses } = media

  const manualParsingPdfPaths = ref(new Set())
  const pendingPdfUploads = ref([])
  const showPdfUploadPrompt = ref(false)
  const pdfUploadEngine = ref('auto')

  function isPdfParsing(item) {
    return !!item?.path && manualParsingPdfPaths.value.has(item.path)
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
      loadDocumentProcessingStatuses()
    }
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

  function runPdfParseForUploads(paths = pendingPdfUploads.value, engine = pdfUploadEngine.value) {
    const selectedEngine = engine || 'auto'
    Promise.allSettled(paths.map(filePath => parsePdfByStrategy(filePath, selectedEngine, 'docs_upload_full_parse'))).then((results) => {
      loadDocumentProcessingStatuses()
      const failed = results.filter(item => item.status === 'rejected' || item.value?.success === false)
      if (failed.length) console.warn('[Docs] PDF full parse failed:', failed)
    })
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

  function closePdfUploadPrompt() {
    pendingPdfUploads.value = []
    showPdfUploadPrompt.value = false
  }

  const uploadNeedsOcrProvider = computed(() => pdfUploadEngine.value !== 'local_fast')
  const uploadBlocksWithoutOcrProvider = computed(() => pdfUploadEngine.value === 'document_intelligent' && !effectiveOcrProvider.value)

  return {
    manualParsingPdfPaths,
    pendingPdfUploads,
    showPdfUploadPrompt,
    pdfUploadEngine,
    uploadNeedsOcrProvider,
    uploadBlocksWithoutOcrProvider,
    isPdfParsing,
    isPdfParsed,
    pdfContextMenuLabel,
    pdfContextMenuIcon,
    isLocalParserMissingResult,
    pdfOcrProviderForRun,
    parsePdfByStrategy,
    parsePdfFromContextMenu,
    runPdfPreflightForUploads,
    runPdfParseForUploads,
    handlePdfUploadProcessing,
    closePdfUploadPrompt,
  }
}
