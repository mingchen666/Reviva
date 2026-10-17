const AUDIO_PARSE_EXTS = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'])
const VIDEO_PARSE_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v'])
const MEDIA_PARSE_EXTS = new Set([...AUDIO_PARSE_EXTS, ...VIDEO_PARSE_EXTS])

export function useProcessingStatus({ items, selectedFile, processingSettings }) {
  function extOfFile(item = {}) {
    return String(item.ext || item.name?.split('.').pop() || '').toLowerCase()
  }

  function isRemoteMediaReference(item = {}) {
    return !item?.isDirectory && String(item.name || '').toLowerCase().endsWith('.media.md')
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
      const hasTimeline = result.artifacts?.some(a => a.type === 'segments' && (a.status === 'ready' || a.status === 'partial'))
      return { kind, state: 'ready', tone: 'ready', label: '转录可读', detail: `${hasTimeline ? '已生成时间轴文字稿' : '已生成纯文字稿（服务商未返回时间戳）'}${result.media.durationMs ? ` · ${Math.round(result.media.durationMs / 1000)} 秒` : ''}` }
    }
    if (result.media?.contentAvailability === 'visual_only') return { kind, state: 'partial', tone: 'warning', label: '画面可读', detail: result.availableModes?.includes('frames') ? '已生成视频关键帧，暂无可用转录' : '视频没有可用音轨，已保留媒体信息' }
    return { kind, state: 'partial', tone: 'warning', label: '部分可用', detail: result.run?.warnings?.[0] || '已读取媒体信息，暂无可用字幕或转录' }
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

  function isLocalFastPdfStrategy() {
    return (processingSettings.value.pdfEngine || 'auto') === 'local_fast'
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

  return {
    AUDIO_PARSE_EXTS,
    VIDEO_PARSE_EXTS,
    MEDIA_PARSE_EXTS,
    extOfFile,
    isRemoteMediaReference,
    pdfProcessingStatusFromResult,
    mediaStatusFromMetadata,
    mediaProcessingStatusFor,
    baseProcessingStatusFor,
    isPdfItem,
    isMediaItem,
    currentProcessingStatusFor,
    isLocalFastPdfStrategy,
    applyProcessingStatus,
    applyMediaState,
  }
}
