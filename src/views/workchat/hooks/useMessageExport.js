import { ref, watch } from 'vue'
import { saveTextFile, saveMarkdownDocx } from '@/electron'
import { useMessage } from '@/components/MsMessage/useMessage'
import {
  buildSingleMessageMarkdown,
  deriveMessageExportTitle,
  sanitizeMessageMarkdownFileName,
} from '../sections/chat/markdownExport'

/**
 * Manages message export (Markdown / Word) and save-to-note workflows.
 * Owns all related modal state so the parent only needs to wire template bindings.
 */
export function useMessageExport(convStore, settingsStore, notesStore) {
  const msg = useMessage()

  const exportingMessageId = ref(null)
const showConversationExport = ref(false)
const exportTargetConversation = ref(null)
const showSaveMessageToNote = ref(false)
const noteTargetMessage = ref(null)
const noteTargetConversation = ref(null)
const notePreviousUserMessage = ref(null)
const notePreviousUserLoading = ref(false)
const notePreviousUserError = ref('')
const savingMessageToNote = ref(false)
const saveMessageToNoteError = ref('')
let noteTargetSequence = 0

function openConversationExport(conversationId) {
  const conversation = convStore.conversations.find(item => item.id === conversationId)
  if (!conversation) {
    msg.error('对话不存在，无法导出')
    return
  }
  exportTargetConversation.value = conversation
  showConversationExport.value = true
}

function conversationForMessage(message) {
  const conversationId = message?.conversationId || convStore.currentConvId
  if (conversationId) return convStore.conversations.find(item => item.id === conversationId) || null
  return convStore.currentConv
}


async function handleExportMessageMarkdown(message) {
  if (!message?.id || exportingMessageId.value) return
  if (message.role !== 'assistant' || message.status !== 'completed') {
    msg.warning('只能导出已完成的 AI 消息')
    return
  }
  const conversation = conversationForMessage(message)
  if (!conversation) {
    msg.error('对话不存在，无法导出')
    return
  }

  exportingMessageId.value = message.id
  try {
    const exportedAt = new Date()
    const title = deriveMessageExportTitle(message, conversation)
    const markdown = buildSingleMessageMarkdown({ message, conversation })
    const result = await saveTextFile({
      title: '导出 Markdown',
      defaultPath: sanitizeMessageMarkdownFileName(title, exportedAt),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultExtension: 'md',
      encoding: 'utf-8',
    }, markdown)
    if (result?.canceled) return
    if (!result?.success) throw new Error(result?.error || 'EXPORT_WRITE_FAILED')
    msg.success('Markdown 已导出')
  } catch (error) {
    console.error('[Workchat] Failed to export AI message:', error)
    msg.error('Markdown 导出失败，请检查保存位置后重试')
  } finally {
    exportingMessageId.value = null
  }
}

async function handleExportMessageWord(message) {
  if (!message?.id || exportingMessageId.value) return
  if (message.role !== 'assistant' || message.status !== 'completed') {
    msg.warning('只能导出已完成的 AI 消息')
    return
  }
  const conversation = conversationForMessage(message)
  if (!conversation) {
    msg.error('对话不存在，无法导出')
    return
  }

  exportingMessageId.value = message.id
  try {
    const exportedAt = new Date()
    const title = deriveMessageExportTitle(message, conversation)
    const markdown = buildSingleMessageMarkdown({ message, conversation })
    const result = await saveMarkdownDocx({
      title: '导出 Word',
      defaultPath: sanitizeMessageMarkdownFileName(title, exportedAt).replace(/\.md$/i, '.docx'),
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      defaultExtension: 'docx',
    }, markdown)
    if (result?.canceled) return
    if (!result?.success) throw new Error(result?.error || 'EXPORT_DOCX_FAILED')
    msg.success('Word 已导出')
  } catch (error) {
    console.error('[Workchat] Failed to export AI message to Word:', error)
    msg.error('Word 导出失败，请检查保存位置后重试')
  } finally {
    exportingMessageId.value = null
  }
}

async function openSaveMessageToNote(message) {
  if (!message?.id || savingMessageToNote.value) return
  if (!settingsStore.isWorkspaceReady) {
    msg.warning('请先在设置中配置授权根目录')
    return
  }
  if (message.role !== 'assistant' || message.status !== 'completed') {
    msg.warning('只能保存已完成的 AI 消息')
    return
  }
  const conversation = conversationForMessage(message)
  if (!conversation) {
    msg.error('对话不存在，无法保存到笔记')
    return
  }

  const sequence = ++noteTargetSequence
  noteTargetMessage.value = message
  noteTargetConversation.value = conversation
  notePreviousUserMessage.value = null
  notePreviousUserError.value = ''
  saveMessageToNoteError.value = ''
  notePreviousUserLoading.value = true
  showSaveMessageToNote.value = true

  try {
    const api = window.electronAPI?.db?.msgs?.getPreviousUser
    if (!api) throw new Error('PREVIOUS_USER_API_UNAVAILABLE')
    const previous = await api(conversation.id, message.id)
    if (sequence !== noteTargetSequence || !showSaveMessageToNote.value) return
    notePreviousUserMessage.value = previous || null
  } catch (error) {
    if (sequence !== noteTargetSequence || !showSaveMessageToNote.value) return
    const detail = String(error?.message || error || '')
    if (detail.includes('SOURCE_MESSAGE_NOT_FOUND')) {
      showSaveMessageToNote.value = false
      msg.error('目标消息已不存在，无法保存到笔记')
      return
    }
    console.error('[Workchat] Failed to find previous user message:', error)
    notePreviousUserError.value = '读取对应用户提问失败'
  } finally {
    if (sequence === noteTargetSequence) notePreviousUserLoading.value = false
  }
}

async function handleSaveMessageToNote({ title, folderId, includeUserPrompt }) {
  if (savingMessageToNote.value || !noteTargetMessage.value || !noteTargetConversation.value) return
  if (!settingsStore.isWorkspaceReady) {
    saveMessageToNoteError.value = '请先在设置中配置授权根目录'
    return
  }
  if (folderId && !notesStore.folders.some(folder => folder.id === folderId)) {
    saveMessageToNoteError.value = '所选目录已不存在，请重新选择'
    return
  }

  savingMessageToNote.value = true
  saveMessageToNoteError.value = ''
  try {
    const getMessage = window.electronAPI?.db?.msgs?.get
    if (!getMessage) throw new Error('MESSAGE_GET_API_UNAVAILABLE')
    const currentMessage = await getMessage(noteTargetMessage.value.id)
    if (
      !currentMessage ||
      currentMessage.conversationId !== noteTargetConversation.value.id ||
      currentMessage.role !== 'assistant' ||
      currentMessage.status !== 'completed'
    ) {
      showSaveMessageToNote.value = false
      msg.error('目标消息已不存在，无法保存到笔记')
      return
    }
    let currentUserMessage = null
    if (includeUserPrompt) {
      const getPreviousUser = window.electronAPI?.db?.msgs?.getPreviousUser
      if (!getPreviousUser) throw new Error('PREVIOUS_USER_API_UNAVAILABLE')
      currentUserMessage = await getPreviousUser(noteTargetConversation.value.id, currentMessage.id)
      if (!currentUserMessage) throw new Error('PREVIOUS_USER_MESSAGE_NOT_FOUND')
    }
    const content = buildSingleMessageMarkdown({
      message: currentMessage,
      conversation: noteTargetConversation.value,
      userMessage: currentUserMessage,
      includeUserPrompt: !!includeUserPrompt,
    })
    const created = await notesStore.addNote({
      folder_id: folderId || '',
      title: title.trim(),
      content,
    })
    showSaveMessageToNote.value = false
    msg.success(`已保存到笔记：${created?.title || title.trim()}`)
  } catch (error) {
    console.error('[Workchat] Failed to save AI message to note:', error)
    const detail = String(error?.message || error || '')
    saveMessageToNoteError.value = detail.includes('PREVIOUS_USER_MESSAGE_NOT_FOUND')
      ? '对应用户提问已不存在，请取消勾选后重试'
      : '保存到笔记失败，请检查目录后重试'
  } finally {
    savingMessageToNote.value = false
  }
}

watch(showSaveMessageToNote, (show) => {
  if (show) return
  noteTargetSequence += 1
  noteTargetMessage.value = null
  noteTargetConversation.value = null
  notePreviousUserMessage.value = null
  notePreviousUserLoading.value = false
  notePreviousUserError.value = ''
  saveMessageToNoteError.value = ''
})


  return {
    exportingMessageId,
    showConversationExport,
    exportTargetConversation,
    showSaveMessageToNote,
    noteTargetMessage,
    noteTargetConversation,
    notePreviousUserMessage,
    notePreviousUserLoading,
    notePreviousUserError,
    savingMessageToNote,
    saveMessageToNoteError,
    openConversationExport,
    conversationForMessage,
    handleExportMessageMarkdown,
    handleExportMessageWord,
    openSaveMessageToNote,
    handleSaveMessageToNote,
  }
}
