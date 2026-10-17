import { ref } from 'vue'

export function useMediaProcessing({ items, selectedFile, contextMenu, processingSettings, status, mediaStore, mbox }) {
  const api = () => window.electronAPI

  const {
    AUDIO_PARSE_EXTS,
    extOfFile,
    isRemoteMediaReference,
    isMediaItem,
    isPdfItem,
    currentProcessingStatusFor,
    applyProcessingStatus,
    applyMediaState,
    mediaStatusFromMetadata,
    pdfProcessingStatusFromResult,
  } = status

  const manualParsingMediaPaths = ref(new Set())
  const showMediaDetailModal = ref(false)
  const mediaDetailItem = ref(null)

  function isMediaParsing(item) {
    return !!item?.path && (manualParsingMediaPaths.value.has(item.path) || ['queued', 'running'].includes(currentProcessingStatusFor(item)?.state))
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

  function mediaAnalyzeOptions() {
    const settings = processingSettings.value
    const providerId = String(settings.mediaProviderId || 'auto').trim() || 'auto'
    return {
      presetId: settings.mediaPreset || 'subtitle_first',
      language: settings.mediaPreferredLanguage === 'auto' ? '' : settings.mediaPreferredLanguage,
      providerId,
      modelRef: settings.mediaModelRef || '',
      preferSubtitle: settings.mediaPreferSubtitle !== false,
      extractKeyframes: settings.mediaExtractKeyframes === true,
      keyframeLimit: settings.mediaKeyframeLimit || 12,
    }
  }

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

  return {
    manualParsingMediaPaths,
    showMediaDetailModal,
    mediaDetailItem,
    isMediaParsing,
    mediaContextMenuLabel,
    mediaContextMenuIcon,
    mediaAnalyzeOptions,
    registerDocsMedia,
    refreshMediaStatus,
    openMediaDetails,
    refreshMediaDetailItem,
    loadDocumentProcessingStatuses,
    refreshActiveMediaStatuses,
    shouldStartMediaAnalysis,
    confirmMediaAnalysis,
    parseMediaFromContextMenu,
    handleMediaUploadProcessing,
  }
}
