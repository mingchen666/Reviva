import { ref, nextTick, onBeforeUnmount } from 'vue'

/**
 * Scroll management: scroll tracking, auto-follow during streaming,
 * scroll-to-bottom scheduling, and older message loading.
 *
 * Virtualization (rowVirtualizer, virtualizedMessages, chatScrollRef) is
 * owned by the parent. Directory integration is via callbacks.
 *
 * @param {object} opts
 */
export function useChatScroll(opts) {
  const {
    chatScrollRef, rowVirtualizer,
    currentMessages, currentConvId, convStore,
    findVirtualAnchor, restoreVirtualAnchor,
    onScrollDirectorySync, onScrollToBottomDirectory,
  } = opts

  const loadingOlder = ref(false)
  const showScrollBtn = ref(false)

const BOTTOM_SCROLL_EPSILON = 1
const userScrolledUp = ref(false)
let userScrollSession = false
let chatPointerDown = false
let suppressScrollEventsUntil = 0

function isAtChatBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SCROLL_EPSILON
}

function shouldIgnoreScrollEvent() {
  return Date.now() < suppressScrollEventsUntil
}
function markProgrammaticScroll(behavior = 'auto') {
  suppressScrollEventsUntil = Date.now() + (behavior === 'smooth' ? 700 : 160)
}

function pauseStreamingFollow() {
  userScrolledUp.value = true
  showScrollBtn.value = currentMessages.value.length > 0
  cancelScheduledScrollToBottom()
  cancelBottomSettle()
}

function onChatWheel(e) {
  if (!e.deltaY) return
  userScrollSession = true
  if (e.deltaY < 0) pauseStreamingFollow()
}

function onChatPointerDown() {
  chatPointerDown = true
}

function onChatPointerUp() {
  chatPointerDown = false
}

function onChatKeydown(e) {
  if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) return
  userScrollSession = true
  if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') pauseStreamingFollow()
}

function onChatScroll(e) {
  const el = e.target
  if (chatPointerDown) userScrollSession = true
  if (userScrollSession) {
    const atBottom = isAtChatBottom(el)
    userScrolledUp.value = !atBottom
    showScrollBtn.value = !atBottom && currentMessages.value.length > 0
    if (userScrolledUp.value) {
      cancelScheduledScrollToBottom()
      cancelBottomSettle()
    }
    else userScrollSession = false
  }

  // Keep respecting the user's position even while a programmatic scroll is
  // settling. The suppression window only prevents directory-nav churn.
  if (shouldIgnoreScrollEvent()) return
  onScrollDirectorySync()
}

// Scroll
let pendingScrollFrame = 0
let pendingBottomSettleFrame = 0

function cancelScheduledScrollToBottom() {
  if (!pendingScrollFrame) return
  cancelAnimationFrame(pendingScrollFrame)
  pendingScrollFrame = 0
}

function cancelBottomSettle() {
  if (!pendingBottomSettleFrame) return
  cancelAnimationFrame(pendingBottomSettleFrame)
  pendingBottomSettleFrame = 0
}

function scrollElementToBottom(el, behavior = 'auto') {
  const bottom = Math.max(0, el.scrollHeight - el.clientHeight)
  if (behavior === 'smooth') el.scrollTo({ top: bottom, behavior })
  else if (bottom > el.scrollTop + BOTTOM_SCROLL_EPSILON) el.scrollTop = bottom
}

function settleAtBottom() {
  cancelBottomSettle()
  let remainingFrames = 2
  const settle = () => {
    pendingBottomSettleFrame = 0
    const el = chatScrollRef.value
    if (!el || userScrolledUp.value) return
    scrollElementToBottom(el)
    remainingFrames -= 1
    if (remainingFrames > 0) pendingBottomSettleFrame = requestAnimationFrame(settle)
  }
  pendingBottomSettleFrame = requestAnimationFrame(settle)
}

function scrollToBottom(behavior = 'auto') {
  const el = chatScrollRef.value
  if (!el || !currentMessages.value.length) return
  cancelBottomSettle()
  markProgrammaticScroll(behavior)
  userScrolledUp.value = false
  userScrollSession = false
  showScrollBtn.value = false
  // Avoid Virtualizer's scrollToIndex reconciliation loop while a streamed
  // message keeps changing height. The scroll container is the single owner.
  scrollElementToBottom(el, behavior)
  if (behavior !== 'smooth') settleAtBottom()
  onScrollToBottomDirectory()
}

function followStreamingToBottom() {
  const el = chatScrollRef.value
  if (!el || userScrolledUp.value) return

  // During streaming, move only forward to the newest rendered edge.
  scrollElementToBottom(el)
  userScrolledUp.value = false
  showScrollBtn.value = false
}

function scheduleScrollToBottom({ force = false, behavior = 'auto' } = {}) {
  if (!force && userScrolledUp.value) return
  if (pendingScrollFrame) return
  pendingScrollFrame = requestAnimationFrame(() => {
    pendingScrollFrame = 0
    // A user scroll may have happened after this frame was queued.
    if (!force && userScrolledUp.value) return
    if (force) scrollToBottom(behavior)
    else followStreamingToBottom()
  })
}

function resumeStreamingFollow() {
  userScrolledUp.value = false
  userScrollSession = false
  showScrollBtn.value = false
  scrollToBottom('smooth')
}

// Load older messages with ScrollLoader
async function loadOlderMessages() {
  if (loadingOlder.value) return
  loadingOlder.value = true
  const el = chatScrollRef.value || document.getElementById('chat-scroll')
  const anchor = findVirtualAnchor(el)
  try {
    await convStore.loadMoreMessages(currentConvId.value)
    await nextTick()
    rowVirtualizer.value.measure()
    restoreVirtualAnchor(anchor, el)
  } finally {
    loadingOlder.value = false
  }
}

  onBeforeUnmount(() => {
    cancelScheduledScrollToBottom()
    cancelBottomSettle()
  })

  return {
    userScrolledUp,
    loadingOlder,
    showScrollBtn,
    markProgrammaticScroll,
    pauseStreamingFollow,
    onChatWheel,
    onChatPointerDown,
    onChatPointerUp,
    onChatKeydown,
    onChatScroll,
    cancelScheduledScrollToBottom,
    cancelBottomSettle,
    scrollToBottom,
    scheduleScrollToBottom,
    resumeStreamingFollow,
    loadOlderMessages,
  }
}
