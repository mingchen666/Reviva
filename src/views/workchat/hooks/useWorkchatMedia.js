import { ref } from 'vue'
import { normalizeFilePath } from '@/utils/fileUrl'
import { useMessage } from '@/components/MsMessage/useMessage'

/**
 * Media file handling: preview, persist, resolve, open detail, reanalyze.
 * previewFile and rightOpen are owned by the parent (panel-level state).
 */
export function useWorkchatMedia(convStore, previewFile, rightOpen) {
  const msg = useMessage()

  const showMediaDetail = ref(false)
  const mediaDetailItem = ref(null)

function handlePreviewFile(file) {
  if (!file) { previewFile.value = null; return }
  const normalizedPath = normalizeFilePath(file.path)
  const normalizedName = normalizeFilePath(file.name || normalizedPath.split(/[\\/]/).pop() || '')
  const normalizedFile = { ...file, path: normalizedPath, name: normalizedName }
  previewFile.value = normalizedFile
  if (normalizedFile.path && window.electronAPI?.readFile) {
    const ext = (normalizedFile.name || normalizedFile.path).split('.').pop().toLowerCase()
    const textExts = [
      'md', 'markdown', 'txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'vue', 'css', 'scss', 'less',
      'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'php',
      'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1',
      'yaml', 'yml', 'toml', 'xml', 'html', 'htm', 'svg', 'sql', 'graphql', 'proto',
      'ini', 'cfg', 'conf', 'env', 'gitignore', 'editorconfig', 'dockerfile',
      'log', 'csv', 'tsv', 'diff', 'patch',
    ]
    if (textExts.includes(ext) || (!ext && file.name?.startsWith('.'))) {
      window.electronAPI.readFile(normalizedFile.path).then(res => {
        if (res?.success) {
          previewFile.value = { ...previewFile.value, content: res.data }
        } else {
          previewFile.value = { ...previewFile.value, content: '', error: res?.error || '读取失败' }
        }
      }).catch(err => {
        previewFile.value = { ...previewFile.value, content: '', error: err.message }
      })
    }
  }
  if (!rightOpen.value) rightOpen.value = true
}

async function persistMessageMedia(messageId, file, patch) {
  const conversationMessages = convStore.messages[convStore.currentConvId] || []
  const matches = item => item?.id === file?.id || (!!item?.path && item.path === file?.path)
  const message = conversationMessages.find(item => item.id === messageId)
    || conversationMessages.find(item => (item.meta?.attachments || []).some(matches))
  if (!message?.meta) return
  const updateItems = items => (items || []).map(item => matches(item) ? { ...item, ...patch } : item)
  await convStore.updateMessage(convStore.currentConvId, message.id, {
    meta: {
      ...message.meta,
      ctx: updateItems(message.meta.ctx),
      attachments: updateItems(message.meta.attachments),
    },
  })
}

async function resolveWorkchatMedia(file, messageId = '') {
  if (!file) return null
  if (file.mediaId) return { success: true, source: { id: file.mediaId, mediaType: file.mediaType || '' } }
  const message = (convStore.messages[convStore.currentConvId] || []).find(item => item.id === messageId)
    || (convStore.messages[convStore.currentConvId] || []).find(item => (item.meta?.attachments || []).some(attachment => attachment?.id === file?.id || (!!attachment?.path && attachment.path === file?.path)))
  const owner = { type: 'message', id: message?.id || messageId || convStore.currentConvId || '', locator: file.id || file.path || file.name || 'attachment' }
  let result = null
  if (/\.media\.md$/i.test(String(file.name || file.path || '')) && file.path) {
    const resolved = await window.electronAPI?.media?.resolveOwner?.({ type: 'docs_file', id: '', locator: file.path })
    if (resolved?.success && resolved.found) {
      await window.electronAPI?.media?.attachOwner?.(resolved.source.id, owner)
      result = { success: true, source: resolved.source }
    }
  } else if (file.path) {
    result = await window.electronAPI?.media?.register?.({
      path: file.path,
      sourceType: file.source === 'docs' ? 'document_upload' : 'attachment',
      title: file.name || '',
      owner,
    })
  }
  if (result?.success && result.source?.id) {
    const patch = {
      mediaId: result.source.id,
      mediaType: result.source.mediaType || result.source.media_type || (/\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(file.name || file.path || '') ? 'audio' : 'video'),
    }
    Object.assign(file, patch)
    await persistMessageMedia(message?.id || messageId, file, patch)
  }
  return result
}

async function openWorkchatMediaDetail(payload) {
  const file = payload?.file || payload
  const messageId = payload?.messageId || ''
  const result = await resolveWorkchatMedia(file, messageId)
  if (!result?.success || !result.source?.id) {
    msg.error(result?.message || '媒体登记失败，暂时无法打开解析详情')
    return
  }
  mediaDetailItem.value = {
    ...file,
    mediaId: result.source.id,
    mediaType: file.mediaType || result.source.mediaType || result.source.media_type || 'video',
  }
  showMediaDetail.value = true
}

async function reanalyzeWorkchatMedia(item) {
  if (!item?.mediaId) return
  const settings = await window.electronAPI?.db?.settings?.get?.('pdfReadStrategy') || {}
  const result = await window.electronAPI?.media?.analyze?.(item.mediaId, {
    presetId: settings.mediaPreset || 'subtitle_first',
    language: settings.mediaPreferredLanguage === 'auto' ? '' : (settings.mediaPreferredLanguage || ''),
    providerId: settings.mediaProviderId || 'auto',
    modelRef: settings.mediaModelRef || '',
    preferSubtitle: settings.mediaPreferSubtitle !== false,
    extractKeyframes: settings.mediaExtractKeyframes === true,
    keyframeLimit: settings.mediaKeyframeLimit || 12,
  })
  if (!result?.success) msg.error(result?.message || '媒体解析任务创建失败')
  else msg.success('媒体解析任务已创建')
}

  return {
    showMediaDetail,
    mediaDetailItem,
    handlePreviewFile,
    persistMessageMedia,
    resolveWorkchatMedia,
    openWorkchatMediaDetail,
    reanalyzeWorkchatMedia,
  }
}
