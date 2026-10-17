import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

/**
 * Chat directory navigation: rounds computation, text formatting,
 * windowing, selection, and scroll-sync for the directory/minimap nav.
 *
 * @param {object} opts
 */
export function useChatDirectory(opts) {
  const {
    currentMessages, hasOlderMessages, currentConvId,
    chatScrollRef, rowVirtualizer,
    isMessageStreaming, currentStreamingState,
    loadingOlder, loadOlderMessages,
    markProgrammaticScroll, showScrollBtn,
    setUserScrolledUp,
  } = opts

  const DIRECTORY_WINDOW_SIZE = 10
  const DIRECTORY_SUMMARY_LENGTH = 46
  const DIRECTORY_QUESTION_LENGTH = 44
  const DIRECTORY_SOURCE_LENGTH = 2400
  const directoryWindowStart = ref(0)
  const activeDirectoryMessageId = ref('')
  const directoryLoadingOlder = ref(false)
  const directoryWindowPinned = ref(false)

function compactDirectoryText(value, maxLength) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…` : text
}

function directoryTextValue(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      return typeof part.text === 'string' ? part.text
        : (typeof part.content === 'string' ? part.content : '')
    }).filter(Boolean).join(' ')
  }
  if (!value || typeof value !== 'object') return ''
  return typeof value.text === 'string' ? value.text
    : (typeof value.content === 'string' ? value.content : '')
}

function sanitizeDirectoryText(value) {
  const source = directoryTextValue(value).slice(0, DIRECTORY_SOURCE_LENGTH)
  if (!source) return ''
  return source
    // Summaries must never carry image payloads or file/image URLs into the
    // navigation calculation. They are labels only, not a rendering path.
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/_=-]*/gi, '图片')
    .replace(/<img\b[^>]*>/gi, '图片')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt || '图片')
    .replace(/(?:https?|file):\/\/[^\s)\]]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s)\]]*)?/gi, '图片')
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function directoryMessageText(message) {
  try {
    const direct = sanitizeDirectoryText(message?.content)
    if (direct) return direct
    const steps = Array.isArray(message?.meta?.steps) ? message.meta.steps : []
    return sanitizeDirectoryText(steps.map(step => directoryTextValue(step?.content)).filter(Boolean).join(' '))
  } catch (_) {
    // A malformed legacy/multimodal message must not take down the directory.
    return ''
  }
}

function isDirectoryUserMessage(message) {
  const role = typeof message?.role === 'string' ? message.role.toLowerCase() : ''
  return role === 'user' || role === 'human'
}

function isDirectoryAssistantMessage(message) {
  const role = typeof message?.role === 'string' ? message.role.toLowerCase() : ''
  return role === 'assistant' || role === 'ai'
}

function directorySummaryForMessage(message) {
  try {
    if (!message) return { text: '', state: 'empty' }
    if (isMessageStreaming(message.id)) {
      const live = compactDirectoryText(sanitizeDirectoryText(currentStreamingState.value.content), DIRECTORY_SUMMARY_LENGTH)
      return { text: live || '正在生成回复…', state: 'streaming' }
    }
    // A failed/cancelled assistant placeholder is still a valid turn. Keep the
    // directory anchored to the user prompt and its AI preview blank, while
    // retaining the status so the minimap can explain the empty preview.
    if (message.status === 'error' || message.status === 'cancelled') return { text: '', state: message.status }
    const preview = compactDirectoryText(directoryMessageText(message), DIRECTORY_SUMMARY_LENGTH)
    return { text: preview || '', state: preview ? 'completed' : 'empty' }
  } catch (_) {
    return { text: '', state: 'empty' }
  }
}

const directoryRounds = computed(() => {
  const rounds = []
  const messages = currentMessages.value
  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index]
    if (!isDirectoryUserMessage(userMessage)) continue
    let assistantMessage = null
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
      const candidate = messages[cursor]
      if (isDirectoryUserMessage(candidate)) break
      if (isDirectoryAssistantMessage(candidate)) {
        assistantMessage = candidate
        break
      }
    }
    let questionFull = '未命名提问'
    let summary = { text: '', state: 'empty' }
    try {
      questionFull = directoryMessageText(userMessage) || questionFull
      summary = directorySummaryForMessage(assistantMessage)
    } catch (_) {
      // Keep a usable directory entry even if one historical message is odd.
    }
    rounds.push({
      userMessageId: userMessage.id,
      userMessageIndex: index,
      question: compactDirectoryText(questionFull, DIRECTORY_QUESTION_LENGTH),
      questionFull,
      summary: summary.text,
      summaryFull: summary.text,
      summaryState: summary.state,
    })
  }
  return rounds
})

// A directory is useful from the very first question. With only one or two
// rounds it stays as a lightweight floating entry; the persistent sidebar is
// reserved for longer conversations so the reading width is not needlessly
// reduced.
const directoryQuestionCount = computed(() => currentMessages.value.reduce(
  (count, message) => count + (isDirectoryUserMessage(message) ? 1 : 0),
  0,
))
const directoryHasRounds = computed(() => directoryQuestionCount.value > 0)
const directoryWindowEnd = computed(() => Math.min(directoryWindowStart.value + DIRECTORY_WINDOW_SIZE, directoryRounds.value.length))
const visibleDirectoryRounds = computed(() => {
  const rounds = directoryRounds.value
  if (!rounds.length) return []
  const maxStart = Math.max(0, rounds.length - DIRECTORY_WINDOW_SIZE)
  const start = Math.min(maxStart, Math.max(0, directoryWindowStart.value))
  return rounds
    .slice(start, Math.min(start + DIRECTORY_WINDOW_SIZE, rounds.length))
    .map((round, index) => ({ ...round, directoryIndex: start + index }))
})
const directoryCanShowOlder = computed(() => directoryWindowStart.value > 0 || hasOlderMessages.value)
const directoryCanShowNewer = computed(() => directoryWindowEnd.value < directoryRounds.value.length)
const directoryOlderLabel = computed(() => directoryWindowStart.value > 0 ? '显示更早的问答' : '加载更早的对话')

function directoryRoundForMessageIndex(messageIndex) {
  for (let index = directoryRounds.value.length - 1; index >= 0; index -= 1) {
    const round = directoryRounds.value[index]
    if (round.userMessageIndex <= messageIndex) return { round, index }
  }
  return null
}

function keepDirectoryRoundVisible(roundIndex) {
  const total = directoryRounds.value.length
  if (!total) {
    directoryWindowStart.value = 0
    return
  }
  const maxStart = Math.max(0, total - DIRECTORY_WINDOW_SIZE)
  const normalizedIndex = Math.max(0, Math.min(roundIndex, total - 1))
  if (normalizedIndex < directoryWindowStart.value || normalizedIndex >= directoryWindowEnd.value) {
    directoryWindowStart.value = Math.min(maxStart, Math.max(0, normalizedIndex - Math.floor(DIRECTORY_WINDOW_SIZE / 2)))
  }
}

function syncActiveDirectoryRound() {
  const el = chatScrollRef.value
  if (!el || !directoryRounds.value.length) return
  const virtualItems = rowVirtualizer.value.getVirtualItems()
  const first = virtualItems.find(item => item.start + item.size > el.scrollTop + 1) || virtualItems[0]
  if (!first) return
  const match = directoryRoundForMessageIndex(first.index)
  if (!match) return
  activeDirectoryMessageId.value = match.round.userMessageId
  keepDirectoryRoundVisible(match.index)
}

function resetDirectoryWindow({ preferLatest = true } = {}) {
  const total = directoryRounds.value.length
  directoryWindowStart.value = preferLatest ? Math.max(0, total - DIRECTORY_WINDOW_SIZE) : 0
  const last = directoryRounds.value.at(-1)
  activeDirectoryMessageId.value = last?.userMessageId || ''
  directoryWindowPinned.value = false
}

function selectDirectoryRound(round) {
  if (!round || !chatScrollRef.value) return
  const currentIndex = currentMessages.value.findIndex(message => message.id === round.userMessageId)
  if (currentIndex < 0) return
  markProgrammaticScroll('smooth')
  directoryWindowPinned.value = true
  activeDirectoryMessageId.value = round.userMessageId
  const roundIndex = directoryRounds.value.findIndex(item => item.userMessageId === round.userMessageId)
  if (roundIndex >= 0) keepDirectoryRoundVisible(roundIndex)
  rowVirtualizer.value.scrollToIndex(currentIndex, { align: 'start', behavior: 'smooth' })
  setUserScrolledUp(true)
  showScrollBtn.value = true
}

async function showOlderDirectoryRounds() {
  if (directoryLoadingOlder.value || loadingOlder.value) return
  if (directoryWindowStart.value > 0) {
    directoryWindowPinned.value = true
    directoryWindowStart.value = Math.max(0, directoryWindowStart.value - DIRECTORY_WINDOW_SIZE)
    return
  }
  if (!hasOlderMessages.value || !currentConvId.value) return
  directoryWindowPinned.value = true
  directoryLoadingOlder.value = true
  const roundCountBeforeLoad = directoryRounds.value.length
  try {
    await loadOlderMessages()
    await nextTick()
    const addedRounds = Math.max(0, directoryRounds.value.length - roundCountBeforeLoad)
    // The store prepends older messages. Show the newly fetched page closest to
    // the previously visible history, then let the user continue paging upward.
    directoryWindowStart.value = Math.max(0, addedRounds - DIRECTORY_WINDOW_SIZE)
  } finally {
    directoryLoadingOlder.value = false
  }
}

function showNewerDirectoryRounds() {
  directoryWindowPinned.value = true
  directoryWindowStart.value = Math.min(
    Math.max(0, directoryRounds.value.length - DIRECTORY_WINDOW_SIZE),
    directoryWindowStart.value + DIRECTORY_WINDOW_SIZE,
  )
}

let pendingDirectorySyncFrame = 0
function scheduleDirectorySync({ force = false } = {}) {
  if (directoryWindowPinned.value && !force) return
  if (pendingDirectorySyncFrame) return
  pendingDirectorySyncFrame = requestAnimationFrame(() => {
    pendingDirectorySyncFrame = 0
    syncActiveDirectoryRound()
  })
}

  onBeforeUnmount(() => {
    if (pendingDirectorySyncFrame) cancelAnimationFrame(pendingDirectorySyncFrame)
  })

  return {
    DIRECTORY_WINDOW_SIZE,
    directoryWindowStart,
    activeDirectoryMessageId,
    directoryLoadingOlder,
    directoryWindowPinned,
    directoryRounds,
    directoryQuestionCount,
    directoryHasRounds,
    directoryWindowEnd,
    visibleDirectoryRounds,
    directoryCanShowOlder,
    directoryCanShowNewer,
    directoryOlderLabel,
    scheduleDirectorySync,
    syncActiveDirectoryRound,
    resetDirectoryWindow,
    selectDirectoryRound,
    showOlderDirectoryRounds,
    showNewerDirectoryRounds,
    keepDirectoryRoundVisible,
  }
}
