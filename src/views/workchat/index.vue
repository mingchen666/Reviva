<script setup>
import { ref, reactive, computed, defineAsyncComponent, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { storeToRefs } from 'pinia'
import { useWindowSize } from '@vueuse/core'
import { useAppStore } from '@/stores/app'
import { useConversationsStore } from '@/stores/conversations'
import { useAgentsStore } from '@/stores/agents'
import { useWikiStore } from '@/stores/wiki'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { useWorkchatStore } from '@/stores/workchat'
import { useNotesStore } from '@/stores/notes'
import { getAgentRuntime } from '@/agents/AgentRuntimeSingleton'
import { normalizeFilePath } from '@/utils/fileUrl'
import { readableGenerationContexts } from '@/utils/generationContext'
import { parseModelRef } from '@/utils/modelRef'
import { BASE_URL } from '@/apis/http'
import * as kbApi from '@/apis/kb-source'
import { saveMarkdownDocx, saveTextFile } from '@/electron'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import ResizeHandle from '@/components/layout/ResizeHandle.vue'
import ConversationList from './sections/sidebar/ConversationList.vue'
import ChatMessage from './sections/ChatMessage.vue'
import ChatInput from './sections/ChatInput.vue'
import RightPanel from './sections/rightpanel/RightPanel.vue'
import PanelToggle from './sections/PanelToggle.vue'
import AuthCard from './sections/AuthCard.vue'
import EmptyStateHero from './sections/EmptyStateHero.vue'
import ScrollLoader from './sections/ScrollLoader.vue'
import { useMessageExport } from './hooks/useMessageExport'
import { useWorkchatMedia } from './hooks/useWorkchatMedia'
import { useGenTask } from './hooks/useGenTask'
import { useChatDirectory } from './hooks/useChatDirectory'
import { useChatTabs } from './hooks/useChatTabs'
import { useChatScroll } from './hooks/useChatScroll'
import {
  buildSingleMessageMarkdown,
  deriveMessageExportTitle,
  sanitizeMessageMarkdownFileName,
} from './sections/chat/markdownExport'

const DocumentSelector = defineAsyncComponent(() => import('./sections/sidebar/DocumentSelector.vue'))
const KbSelector = defineAsyncComponent(() => import('./sections/sidebar/KbSelector.vue'))
const ChatDirectoryNav = defineAsyncComponent(() => import('./sections/ChatDirectoryNav.vue'))
const ChatMinimapNav = defineAsyncComponent(() => import('./sections/ChatMinimapNav.vue'))
const ConversationExportModal = defineAsyncComponent(() => import('./sections/export/ConversationExportModal.vue'))
const SaveMessageToNoteModal = defineAsyncComponent(() => import('./sections/export/SaveMessageToNoteModal.vue'))
const MindmapModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/MindmapModal.vue'))
const GraphModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/GraphModal.vue'))
const FlashcardModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/FlashcardModal.vue'))
const StudyCardModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/StudyCardModal.vue'))
const KnowledgeToolModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/KnowledgeToolModal.vue'))
const QuizModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/QuizModal.vue'))
const ChartModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/ChartModal.vue'))
const PodcastModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/PodcastModal.vue'))
const ResearchModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/ResearchModal.vue'))
const PptModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/PptModal.vue'))
const StudyguideModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/StudyguideModal.vue'))
const MediaDetailModal = defineAsyncComponent(() => import('@/components/media/MediaDetailModal.vue'))

const appStore = useAppStore()
const convStore = useConversationsStore()
const agentsStore = useAgentsStore()
const wikiStore = useWikiStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const workchatStore = useWorkchatStore()
const notesStore = useNotesStore()
const { ctxItems: globalCtxItems } = storeToRefs(workchatStore)
const isDark = computed(() => appStore.isDark)
const chatNavigationEnabled = computed(() => settingsStore.chatNavigationEnabled !== false)
const chatNavigationStyle = computed(() => settingsStore.chatNavigationStyle === 'minimap' ? 'minimap' : 'directory')
const msg = useMessage()

const agentRuntime = getAgentRuntime(convStore, agentsStore, settingsStore)

// Data
const allAgents = computed(() => agentsStore.agents)
const conversations = computed(() => convStore.conversations)
const groups = computed(() => convStore.groups)
const currentConvId = computed(() => convStore.currentConvId)

// Tabs & conversation switching
const {
  tabs, activeTabId, tabScroller,
  isConversationSwitching, switchingConvId,
  addTab, activateTab, closeTab,
  createChat, selectConv, deleteConv, onConvRename,
  ensureConversationTab, isTabConversationSwitching, switchToConversation,
  handleShortcutConversationActivate,
} = useChatTabs(convStore, currentConvId)
const currentMessages = computed(() => convStore.currentMessages)
const currentConv = computed(() => convStore.currentConv)
const currentStreamingState = computed(() => {
  const state = convStore.getStreamingState(currentConvId.value)
  const active = !!state.active
  return {
    active,
    msgId: active ? state.msgId : null,
    content: active ? state.content : '',
    thinking: active ? state.thinking : '',
    toolCalls: active ? state.toolCalls : {},
    subAgents: active ? state.subAgents : {},
    todos: active ? state.todos : [],
    steps: active ? state.steps : [],
    iteration: active ? state.iteration : 0,
    usage: active ? state.usage : { inputTokens: 0, outputTokens: 0 },
    startTime: active ? state.startTime : null,
  }
})
const isStreaming = computed(() => currentStreamingState.value.active)
const isCompressing = computed(() => convStore.isCompressing)

// Live elapsed timer during streaming
const liveElapsedMs = ref(0)
let _liveTimer = null
watch(isStreaming, (streaming) => {
  if (streaming) {
    const start = currentStreamingState.value.startTime || Date.now()
    liveElapsedMs.value = 0
    _liveTimer = setInterval(() => { liveElapsedMs.value = Date.now() - start }, 200)
  } else {
    if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null }
    liveElapsedMs.value = 0
  }
})
// Virtualized message list. Store still paginates messages; TanStack keeps mounted DOM bounded.
const chatScrollRef = ref(null)
const MESSAGE_GAP = 20
const VIRTUAL_OVERSCAN = 8
const EMPTY_STREAM_OBJECT = Object.freeze({})
const EMPTY_STREAM_ARRAY = Object.freeze([])
const detachedTailMessageIds = reactive({})
const detachedTailMinHeight = ref(0)

const detachableTailCandidate = computed(() => {
  const last = currentMessages.value.at(-1)
  if (!currentConvId.value || !last?.id || last.role !== 'assistant') return null
  if (last.status !== 'pending' && last.status !== 'streaming') return null
  return { convId: currentConvId.value, msgId: last.id }
})

watch(detachableTailCandidate, (candidate) => {
  const convId = currentConvId.value
  if (!convId) return
  if (candidate) detachedTailMessageIds[candidate.convId] = candidate.msgId
  else delete detachedTailMessageIds[convId]
}, { immediate: true, flush: 'sync' })

const detachedTailMessage = computed(() => {
  const last = currentMessages.value.at(-1)
  if (!last?.id || detachedTailMessageIds[currentConvId.value] !== last.id) return null
  if (last.status !== 'pending' && last.status !== 'streaming') return null
  return last
})

const virtualizedMessages = computed(() => (
  detachedTailMessage.value ? currentMessages.value.slice(0, -1) : currentMessages.value
))

watch(() => detachedTailMessage.value?.id || '', () => {
  detachedTailMinHeight.value = 0
  // Re-measure when the streamed tail returns to the virtual list. Its live
  // DOM height may be very different after thinking content collapses.
  nextTick(() => {
    rowVirtualizer.value.measure()
    if (!userScrolledUp.value) scheduleScrollToBottom()
  })
})

let detachedTailResizeObserver = null
let observedDetachedTail = null

function observeDetachedTail(el) {
  if (el === observedDetachedTail) return
  detachedTailResizeObserver?.disconnect()
  detachedTailResizeObserver = null
  observedDetachedTail = el || null
  if (!el || typeof ResizeObserver === 'undefined') return

  detachedTailResizeObserver = new ResizeObserver((entries) => {
    const height = Math.ceil(entries[0]?.contentRect?.height || 0)
    if (height > detachedTailMinHeight.value) detachedTailMinHeight.value = height
    if (!userScrolledUp.value) scheduleScrollToBottom()
  })
  detachedTailResizeObserver.observe(el)
}

const pendingAuthRequestsByMessageId = computed(() => {
  const map = {}
  for (const request of convStore.pendingAuthRequests) {
    if (request.convId && request.convId !== currentConvId.value) continue
    if (!request.msgId) continue
    if (!map[request.msgId]) map[request.msgId] = []
    map[request.msgId].push(request)
  }
  return map
})

// Creation modals
const showResearchModal = ref(false)
const showPptModal = ref(false)
const showMindmapModal = ref(false)
const showGraphModal = ref(false)
const showFlashcardModal = ref(false)
const showStudyCardModal = ref(false)
const showQaModal = ref(false)
const showGlossaryModal = ref(false)
const showCheatsheetModal = ref(false)
const showQuizModal = ref(false)
const showChartModal = ref(false)
const showPodcastModal = ref(false)
const showStudyguideModal = ref(false)
const renderedModals = reactive({
  research: false,
  ppt: false,
  mindmap: false,
  graph: false,
  flashcard: false,
  studycard: false,
  qa: false,
  glossary: false,
  cheatsheet: false,
  quiz: false,
  chart: false,
 podcast: false,
  studyguide: false,
  conversationExport: false,
  saveMessageToNote: false,
})

// Panels
const leftOpen = ref(true)
const leftW = ref(260)
const leftTab = ref('conv') // 'conv' | 'docs' | 'kb'
function tabClass(tabId) {
  const active = leftTab.value === tabId
  if (active) return isDark.value ? 'text-wt-main font-bold' : 'text-lt-main font-bold'
  return isDark.value ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'
}
const renderedLeftPanels = reactive({ docs: false, kb: false })
const activeExternalKb = ref(null) // { sourceId, kbId, sourceName, kbName, sourceType }
const activeSourceId = ref('') // backend active source ID, loaded on mount

const activeSourceInfo = ref(null) // { type, serverId, name } for the active source

const kbEnabled = ref(true) // master toggle: whether kb_search tool is available at all

async function onSelectExternalKb(item) {
  activeExternalKb.value = item
  activeSourceId.value = item.sourceId
  activeSourceInfo.value = { type: item.sourceType || 'http', serverId: '', name: item.sourceName || '' }
  try { await kbApi.setActiveSource(item.sourceId) } catch {}
}

function onClearExternalKb() {
  activeExternalKb.value = null
}

function onToggleKbEnabled(val) {
  kbEnabled.value = val
}

watch(leftTab, (tab) => {
  if (tab === 'docs' || tab === 'kb') renderedLeftPanels[tab] = true
}, { flush: 'sync' })
const rightOpen = ref(true)
const rightW = ref(320)
const previewFile = ref(null)
// Media handling
const {
  showMediaDetail,
  mediaDetailItem,
  handlePreviewFile,
  persistMessageMedia,
  resolveWorkchatMedia,
  openWorkchatMediaDetail,
  reanalyzeWorkchatMedia,
} = useWorkchatMedia(convStore, previewFile, rightOpen)
const branchingMessageId = ref(null)
const branchConfirmationPending = ref(false)
// Message export / save-to-note
const {
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
} = useMessageExport(convStore, settingsStore, notesStore)

const lazyModalVisibility = {
  research: showResearchModal,
  ppt: showPptModal,
  mindmap: showMindmapModal,
  graph: showGraphModal,
  flashcard: showFlashcardModal,
  studycard: showStudyCardModal,
  qa: showQaModal,
  glossary: showGlossaryModal,
  cheatsheet: showCheatsheetModal,
  quiz: showQuizModal,
  chart: showChartModal,
  podcast: showPodcastModal,
  studyguide: showStudyguideModal,
  conversationExport: showConversationExport,
  saveMessageToNote: showSaveMessageToNote,
}

Object.entries(lazyModalVisibility).forEach(([name, visible]) => {
  watch(visible, (show) => {
    if (show) renderedModals[name] = true
  }, { flush: 'sync' })
})
function handleShortcutPanelToggle(event) {
  const side = event?.detail?.side
  if (side === 'left') leftOpen.value = !leftOpen.value
  if (side === 'right') rightOpen.value = !rightOpen.value
}

// Responsive: auto-collapse panels when window is narrow
const { width: windowW } = useWindowSize()
watch(windowW, (w) => {
  if (w < 900) { leftOpen.value = false; rightOpen.value = false }
  else if (w < 1100) { rightOpen.value = false }
})

// Tabs
// ─── Global context state (shared across all conversations) ───
const selectedAgent = computed(() => {
  const agentId = currentConv.value?.agentId
  if (!agentId) return null
  return agentsStore.agents.find(a => a.id === agentId) || null
})
const commandInsertSeq = ref(0)
const commandInsertRequest = ref(null)

function handleSelectSkillCommand(skill) {
  if (!skill?.id) return
  commandInsertSeq.value += 1
  commandInsertRequest.value = {
    id: commandInsertSeq.value,
    type: 'skill',
    skillId: skill.id,
    text: `/${skill.id}`,
  }
}

function agentEnglishName(agent) {
  return agent?.englishName || agent?.english_name || ''
}

function findBuiltinAgentByEnglishName(englishName, fallbackIds = []) {
  return allAgents.value.find(a => a.builtin && (
    agentEnglishName(a) === englishName || fallbackIds.includes(a.id)
  ))
}

const currentCtxItems = computed(() => globalCtxItems.value)
const selectedWikiIds = ref([])
const availableWikis = computed(() => wikiStore.wikis || [])
const selectedWikiRefs = computed(() => selectedWikiIds.value.map((id) => {
  const wiki = availableWikis.value.find(item => item.id === id)
  return { id, name: wiki?.name || id, type: 'wiki', icon: 'ri-book-2-line' }
}))
const wikiContext = computed(() => ({
  enabled: selectedWikiIds.value.length > 0,
  mode: 'selected',
  wikiIds: [...selectedWikiIds.value],
}))

function toggleWikiContext(wikiId) {
  if (!wikiId) return
  selectedWikiIds.value = selectedWikiIds.value.includes(wikiId)
    ? selectedWikiIds.value.filter(id => id !== wikiId)
    : [...selectedWikiIds.value, wikiId]
}

function clearWikiContext() {
  selectedWikiIds.value = []
}

const tokenStats = computed(() => {
  const msgs = currentMessages.value
  let totalInput = 0
  let totalOutput = 0
  let lastLatencyMs = 0
  let lastCost = 0
  for (const m of msgs) {
    if (m.status === 'completed' || m.status === 'streaming') {
      totalInput += m.inputTokens || 0
      totalOutput += m.outputTokens || 0
    }
    if (m.status === 'completed' && m.role === 'assistant') {
      if (m.latencyMs) lastLatencyMs = m.latencyMs
      if (m.cost) lastCost = m.cost
    }
  }
  // During streaming, add live usage from streaming state
  if (isStreaming.value) {
    totalInput += currentStreamingState.value.usage.inputTokens || 0
    totalOutput += currentStreamingState.value.usage.outputTokens || 0
    if (liveElapsedMs.value > 0) lastLatencyMs = liveElapsedMs.value
  }
  return { totalInput, totalOutput, lastLatencyMs, lastCost }
})

const contextLength = computed(() => currentConv.value?.contextLength || 30)
const currentGroupId = computed(() => currentConv.value?.group_id || 'default')
const hasOlderMessages = computed(() => currentConvId.value && !convStore.allMsgsLoaded[currentConvId.value])

// Generation tasks (mindmap/graph/flashcard/quiz/etc.)
function closeModalForTool(toolId) {
  const map = {
    mindmap: showMindmapModal,
    graph: showGraphModal,
    flashcard: showFlashcardModal,
    studycard: showStudyCardModal,
    qa: showQaModal,
    glossary: showGlossaryModal,
    cheatsheet: showCheatsheetModal,
    quiz: showQuizModal,
    chart: showChartModal,
    podcast: showPodcastModal,
    studyguide: showStudyguideModal,
    research: showResearchModal,
    ppt: showPptModal,
  }
  const ref = map[toolId]
  if (ref) ref.value = false
}

const {
  buildCloudContext,
  handleGenTaskSubmit,
  handleResearchStart,
  handleStudyguideStart,
  handlePptStart,
} = useGenTask({
  settingsStore, agentsStore, userStore, convStore,
  currentCtxItems, selectedWikiIds, selectedWikiRefs,
  currentGroupId, currentConvId,
  kbEnabled, activeSourceId, activeExternalKb, activeSourceInfo,
  closeModalForTool,
})

function estimateMessageHeight(message) {
  const contentLength = String(message?.content || '').length
  const attachmentCount = Array.isArray(message?.meta?.attachments) ? message.meta.attachments.length : 0
  const stepCount = Array.isArray(message?.meta?.steps) ? message.meta.steps.length : 0
  const toolCount = Array.isArray(message?.meta?.toolCalls) ? message.meta.toolCalls.length : 0
  const lineEstimate = Math.ceil(contentLength / (message?.role === 'user' ? 46 : 70))
  const base = message?.role === 'user' ? 78 : 126
  const estimated = base + lineEstimate * 21 + attachmentCount * 86 + stepCount * 56 + toolCount * 46
  return Math.min(760, Math.max(64, estimated))
}

function isMessageStreaming(messageId) {
  return currentStreamingState.value.active && messageId === currentStreamingState.value.msgId
}

function pendingAuthRequestsForMessage(messageId) {
  return pendingAuthRequestsByMessageId.value[messageId] || EMPTY_STREAM_ARRAY
}

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: virtualizedMessages.value.length,
  getScrollElement: () => chatScrollRef.value,
  estimateSize: index => estimateMessageHeight(virtualizedMessages.value[index]),
  getItemKey: index => virtualizedMessages.value[index]?.id || index,
  overscan: VIRTUAL_OVERSCAN,
  gap: MESSAGE_GAP,
  scrollPaddingEnd: 160,
  shouldAdjustScrollPositionOnItemSizeChange: item => {
    const scrollOffset = chatScrollRef.value?.scrollTop || 0
    return item.end <= scrollOffset + 1
  },
})))

// Scroll management
function onScrollDirectorySync() {
  directoryWindowPinned.value = false
  scheduleDirectorySync()
}
function onScrollToBottomDirectory() {
  directoryWindowPinned.value = false
  const lastRound = directoryRounds.value.at(-1)
  if (lastRound) {
    activeDirectoryMessageId.value = lastRound.userMessageId
    keepDirectoryRoundVisible(directoryRounds.value.length - 1)
  }
  scheduleDirectorySync()
}

const {
  userScrolledUp, loadingOlder, showScrollBtn,
  markProgrammaticScroll, pauseStreamingFollow,
  onChatWheel, onChatPointerDown, onChatPointerUp, onChatKeydown, onChatScroll,
  cancelScheduledScrollToBottom, cancelBottomSettle,
  scrollToBottom, scheduleScrollToBottom, resumeStreamingFollow,
  loadOlderMessages,
} = useChatScroll({
  chatScrollRef, rowVirtualizer,
  currentMessages, currentConvId, convStore,
  findVirtualAnchor, restoreVirtualAnchor,
  onScrollDirectorySync, onScrollToBottomDirectory,
})

// Chat directory navigation
function setUserScrolledUp(val) { userScrolledUp.value = val }

const {
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
} = useChatDirectory({
  currentMessages, hasOlderMessages, currentConvId,
  chatScrollRef, rowVirtualizer,
  isMessageStreaming, currentStreamingState,
  loadingOlder, loadOlderMessages,
  markProgrammaticScroll, showScrollBtn,
  setUserScrolledUp,
})

const totalVirtualHeight = computed(() => rowVirtualizer.value.getTotalSize())

const visibleVirtualMessages = computed(() => rowVirtualizer.value.getVirtualItems().map(item => ({
  ...item,
  message: virtualizedMessages.value[item.index],
})).filter(item => item.message))

function measureVirtualMessageRow(el) {
  if (el) rowVirtualizer.value.measureElement(el)
}

function findVirtualAnchor(el = chatScrollRef.value) {
  if (!el) return null
  const items = rowVirtualizer.value.getVirtualItems()
  if (!items.length) return null
  const first = items.find(item => item.start + item.size > el.scrollTop + 1) || items[0]
  const message = virtualizedMessages.value[first.index]
  if (!message?.id) return null
  return { id: message.id, offset: el.scrollTop - first.start }
}

function restoreVirtualAnchor(anchor, el = chatScrollRef.value) {
  if (!el || !anchor?.id) return false
  const index = virtualizedMessages.value.findIndex(message => message.id === anchor.id)
  if (index < 0) return false
  rowVirtualizer.value.scrollToIndex(index, { align: 'start', behavior: 'auto' })
  requestAnimationFrame(() => {
    const item = rowVirtualizer.value.getVirtualItems().find(row => row.index === index)
    if (item) el.scrollTop = Math.max(0, item.start + anchor.offset)
  })
  return true
}

let pendingMeasureFrame = 0
function measureVisibleMessagesSoon() {
  if (pendingMeasureFrame) return
  pendingMeasureFrame = requestAnimationFrame(() => {
    pendingMeasureFrame = 0
    rowVirtualizer.value.measure()
  })
}

// Resize
function onLeftResize(delta) { leftW.value = Math.min(380, Math.max(200, leftW.value + delta)) }
function onRightResize(delta) { rightW.value = Math.min(500, Math.max(250, rightW.value + delta)) }

function branchErrorMessage(error) {
  const message = String(error?.message || error || '')
  if (message.includes('SOURCE_CONVERSATION_NOT_FOUND')) return '原对话已不存在，无法创建分支'
  if (message.includes('SOURCE_MESSAGE_NOT_FOUND')) return '分支起点无效，请刷新后重试'
  if (message.includes('BRANCH_REQUIRES_ASSISTANT_MESSAGE')) return '只能从 AI 消息创建分支'
  if (message.includes('BRANCH_REQUIRES_COMPLETED_MESSAGE')) return 'AI 回复完成后才能创建分支'
  return '创建分支失败，原对话未受影响'
}

async function handleCreateBranch(messageId) {
  const sourceConversationId = currentConvId.value
  if (!sourceConversationId || !messageId || branchingMessageId.value || branchConfirmationPending.value) return
  if (convStore.isConvStreaming(sourceConversationId)) {
    msg.warning('当前回复完成后才能创建对话分支')
    return
  }

  branchConfirmationPending.value = true
  let confirmed = false
  try {
    confirmed = await useMessageBox().confirm({
      title: '创建对话分支？',
      message: '将复制截至这条 AI 回复的对话内容并创建一个独立对话，原对话不会改变。',
      confirmText: '创建分支',
      cancelText: '取消',
      variant: 'info',
    })
  } finally {
    branchConfirmationPending.value = false
  }
  if (!confirmed) return
  if (convStore.isConvStreaming(sourceConversationId)) {
    msg.warning('当前回复完成后才能创建对话分支')
    return
  }

  branchingMessageId.value = messageId
  try {
    const branchConversation = await convStore.createBranch(sourceConversationId, messageId)
    addTab(branchConversation)
    msg.success('已从此消息创建对话分支')
  } catch (error) {
    console.error('[Workchat] Failed to create conversation branch:', error)
    msg.error(branchErrorMessage(error))
  } finally {
    branchingMessageId.value = null
  }
}

function onGroupRename(data) {
  if (data.id && data.name) convStore.updateGroup(data.id, { name: data.name })
}
function onGroupCreate(data) { convStore.createGroup(data) }
async function onGroupDelete(gid) {
  await convStore.deleteGroup(gid)
  msg.success('分组已删除')
}

// Agent selection
function selectAgent(agent) {
  if (currentConv.value) {
    convStore.updateConv(currentConv.value.id, { agentId: agent.id })
  } else {
    createChat().then(() => {
      if (currentConv.value) {
        convStore.updateConv(currentConv.value.id, { agentId: agent.id })
      }
    })
  }
}
function removeAgent() {
  if (currentConv.value) {
    convStore.updateConv(currentConv.value.id, { agentId: '' })
  }
}

// Context items (global — shared across all conversations)
function addCtxItem(item) {
  const items = globalCtxItems.value

  // Cloud KB / Doc toggle from KbSelector
  if (item.type === 'cloud_kb') {
    const existing = items.find(c => c.type === 'cloud_kb' && c.kbId === item.kbId)
    if (existing) {
      globalCtxItems.value = items.filter(c => !(c.type === 'cloud_kb' && c.kbId === item.kbId))
    } else {
      globalCtxItems.value = [...items, item]
    }
    return
  }
  if (item.type === 'cloud_doc') {
    const existing = items.find(c => c.type === 'cloud_doc' && c.docId === item.docId)
    if (existing) {
      globalCtxItems.value = items.filter(c => !(c.type === 'cloud_doc' && c.docId === item.docId))
    } else {
      globalCtxItems.value = [...items, item]
    }
    return
  }

  // Document selector items
  if (item.type === 'doc-toggle') {
    const existing = items.find(c => c.path === item.path)
    if (existing) {
      globalCtxItems.value = items.filter(c => c.path !== item.path)
    } else {
      const newItem = {
        type: item.isDirectory ? 'folder' : 'file',
        source: 'docs',
        id: 'doc_' + Date.now(),
        name: item.name,
        icon: item.isDirectory ? 'ri-folder-line' : 'ri-file-line',
        path: item.path,
        isDirectory: !!item.isDirectory,
      }
      globalCtxItems.value = [...items, newItem]
    }
    return
  }

  if (item.type === 'local_file') {
    if (window.electronAPI?.openFile) {
      window.electronAPI.openFile().then(paths => {
        const filePaths = Array.isArray(paths) ? paths : (paths ? [paths] : [])
        for (const filePath of filePaths) {
          const name = filePath?.split(/[\\/]/).pop()
          const newItem = { type: 'file', source: 'attachment', id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2), name, icon: 'ri-file-line', path: filePath }
          if (window.electronAPI?.stat) {
            window.electronAPI.stat(filePath).then(stat => {
              newItem.size = stat?.data?.size || stat?.size
              globalCtxItems.value = [...globalCtxItems.value, newItem]
            })
          } else {
            globalCtxItems.value = [...globalCtxItems.value, newItem]
          }
        }
      })
    }
    return
  }
  if (item.type === 'local_folder') {
    if (window.electronAPI?.openDirectory) {
      window.electronAPI.openDirectory().then(path => {
        if (!path) return
        const name = path?.split(/[\\/]/).pop()
        globalCtxItems.value = [...globalCtxItems.value, { type: 'folder', source: 'attachment', id: 'folder_' + Date.now(), name, icon: 'ri-folder-line', path }]
      })
    }
    return
  }
  if (items.find(c => c.id === item.id)) return
  globalCtxItems.value = [...items, item]
}

function removeCtxItem(item) {
  globalCtxItems.value = globalCtxItems.value.filter(c => c.id !== item.id)
}

function clearCtxItems() {
  globalCtxItems.value = []
}

function updateContextLength(val) {
  if (currentConv.value) {
    convStore.updateConv(currentConv.value.id, { contextLength: val })
  }
}

// Send message
async function sendMessage(payload) {
  const trimmed = (typeof payload === 'string' ? payload : payload?.content || '').trim()
  if (!trimmed) return
  if (isStreaming.value) {
    msg.warning('当前对话正在生成，请等待完成或先停止任务')
    return
  }
  let convId = currentConvId.value
  if (!convId) {
    const conv = await convStore.createConv({
      title: '新对话',
      groupId: convStore.currentGroupId || 'default',
      agentId: selectedAgent.value?.id || '',
    })
    convId = conv.id
   addTab(conv)
 }
  const ctxItems = [...currentCtxItems.value]
  // Only inject KB card into the message when the user explicitly selected a
  // specific knowledge base. The tool itself stays available via cloudContext
  // (activeSourceId) regardless, so the agent can search even without a card.
  if (kbEnabled.value && activeSourceId.value) {
    if (activeSourceInfo.value?.type === 'mcp' && activeSourceInfo.value?.serverId) {
      // MCP: register the native mcp:{serverId} tool + show card
      ctxItems.push({
        type: 'mcp_source',
        serverId: activeSourceInfo.value.serverId,
        sourceName: activeSourceInfo.value.name,
        name: activeSourceInfo.value.name,
      })
    } else if (activeExternalKb.value) {
      // External HTTP: only show card when user picked a specific KB
      ctxItems.push({
        type: 'kb_source',
        sourceId: activeSourceId.value,
        sourceName: activeExternalKb.value?.sourceName || '',
        kbId: activeExternalKb.value?.kbId || '',
        kbName: activeExternalKb.value?.kbName || '',
        name: activeExternalKb.value?.kbName
          ? `${activeExternalKb.value?.sourceName || ''} / ${activeExternalKb.value?.kbName}`
          : (activeExternalKb.value?.sourceName || '知识源'),
      })
    }
  }
  clearCtxItems()
  const inputDocument = Array.isArray(payload?.inputDocument) ? payload.inputDocument : []
  const resolvedContent = String(payload?.resolvedContent || trimmed).trim()
  userScrolledUp.value = false
  showScrollBtn.value = false
  await nextTick()
  scrollToBottom('auto')
 await agentRuntime.startChat({
   convId,
   userText: trimmed,
   resolvedContent,
   inputDocument,
 agentId: selectedAgent.value?.id || '',
   ctxItems,
   wikiContext: wikiContext.value,
   cloudContext: buildCloudContext(ctxItems),
   thinkingIntensity: payload?.thinkingIntensity || 'auto',
 })
}

function cancelChat() { agentRuntime.cancel(currentConvId.value) }

// Builtin tool actions
function handleBuiltinTool(tool) {
  if (tool.id === 'research') {
    showResearchModal.value = true
  } else if (tool.id === 'ppt') {
    showPptModal.value = true
  } else if (tool.id === 'mindmap') {
    showMindmapModal.value = true
  } else if (tool.id === 'graph') {
    showGraphModal.value = true
  } else if (tool.id === 'flashcard') {
    showFlashcardModal.value = true
  } else if (tool.id === 'studycard') {
    showStudyCardModal.value = true
  } else if (tool.id === 'qa') {
    showQaModal.value = true
  } else if (tool.id === 'glossary') {
    showGlossaryModal.value = true
  } else if (tool.id === 'cheatsheet') {
    showCheatsheetModal.value = true
  } else if (tool.id === 'quiz') {
    showQuizModal.value = true
  } else if (tool.id === 'chart') {
    showChartModal.value = true
  } else if (tool.id === 'podcast') {
    showPodcastModal.value = true
  } else if (tool.id === 'studyguide') {
    showStudyguideModal.value = true
  }
}

// Compress context
async function compressContext() {
  const convId = currentConvId.value
  if (!convId || isStreaming.value) return
  msg.info('正在压缩上下文...')
  const result = await agentRuntime.compressContext(convId)
  if (!result.compressed) {
    msg.info(result.reason || '上下文未达到压缩阈值')
  } else {
    msg.success('上下文已压缩')
  }
}

// Message actions
function handleRetry(msgId) {
  if (isStreaming.value) {
    msg.warning('当前对话正在生成，请等待完成或先停止任务')
    return
  }
agentRuntime.retryMessage(currentConvId.value, msgId, undefined, settingsStore.chatThinkingIntensity || 'auto')
}

function handleCopy() {
  msg.success('已复制到剪贴板')
}

function handleCopyError() {
  msg.error('复制失败，请检查剪贴板权限')
}

async function handleDeleteMessage(msgId) {
  await convStore.deleteMessage(currentConvId.value, msgId)
}

async function handleClearMessages() {
  const convId = currentConvId.value
  if (!convId) return
  const mbox = useMessageBox()
  const confirmed = await mbox.confirm({
    title: '清空消息',
    message: '确定清空当前对话的所有消息？此操作不可撤销。',
    confirmText: '清空',
    variant: 'danger',
  })
  if (confirmed) {
    await convStore.clearMessages(convId)
    msg.success('消息已清空')
  }
}

async function handleSaveEdit({ msgId, content, inputDocument, resolvedContent }) {
  if (isStreaming.value) {
    msg.warning('当前对话正在生成，请等待完成或先停止任务')
    return
  }
  const convId = currentConvId.value
  const msgs = convStore.messages[convId] || []
  const idx = msgs.findIndex(m => m.id === msgId)
  if (idx < 0) return

  const userMsg = msgs[idx]
  if (userMsg.role !== 'user') return
  const nextMeta = { ...(userMsg.meta || {}) }
  const hasTokens = Array.isArray(inputDocument) && inputDocument.some(segment => segment?.type && segment.type !== 'text')
  if (hasTokens) {
    nextMeta.inputDocument = inputDocument
    nextMeta.resolvedContent = String(resolvedContent || content || '').trim()
  } else {
    delete nextMeta.inputDocument
    delete nextMeta.resolvedContent
  }
  await convStore.updateMessage(convId, userMsg.id, { content, meta: nextMeta })
  await agentRuntime.retryMessage(convId, userMsg.id, undefined, settingsStore.chatThinkingIntensity || 'auto')
}

// Preview file
// Auth handlers (updated for new AuthCard API with allowSession)
function handleAuthApprove(data) {
  agentRuntime.respondAuth(data.requestId, true)
}
function handleAuthDeny(data) {
  agentRuntime.respondAuth(data.requestId, false)
}

// App-level shortcuts (Ctrl+N etc.) handled by useAppShortcuts in App.vue

onMounted(() => {
  window.addEventListener('mindspace:workchat-toggle-panel', handleShortcutPanelToggle)
  agentRuntime.registerListeners()
  wikiStore.loadWikis?.().catch(() => {})
  // Load active source from backend so kb_search tool is available even before
  // the user picks a specific KB in the sidebar.
  kbApi.getActiveSourceId().then(async sid => {
    activeSourceId.value = sid || ''
    if (sid) {
      try {
        const src = await kbApi.getSource(sid)
        activeSourceInfo.value = src ? { type: src.type, serverId: src.config?.serverId || '', name: src.name } : null
      } catch { activeSourceInfo.value = null }
    } else { activeSourceInfo.value = null }
  }).catch(() => {})
  nextTick(() => {
    rowVirtualizer.value.measure()
    if (currentMessages.value.length) scrollToBottom('auto')
  })
})

watch(availableWikis, (items) => {
  const valid = new Set((items || []).map(item => item.id))
  selectedWikiIds.value = selectedWikiIds.value.filter(id => valid.has(id))
})

onBeforeUnmount(() => {
  window.removeEventListener('mindspace:workchat-toggle-panel', handleShortcutPanelToggle)
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null }
  detachedTailResizeObserver?.disconnect()
  detachedTailResizeObserver = null
  observedDetachedTail = null
})

// Smart auto-scroll during streaming
watch(() => currentStreamingState.value.content, () => {
  scheduleScrollToBottom()
})

watch(() => [
  currentMessages.value.length,
  currentStreamingState.value.active,
  currentStreamingState.value.thinking,
  currentStreamingState.value.steps.length,
  Object.keys(currentStreamingState.value.toolCalls).length,
  Object.keys(currentStreamingState.value.subAgents).length,
  currentStreamingState.value.todos.length,
], () => {
  scheduleScrollToBottom()
})

watch(currentConvId, () => {
  ensureConversationTab(currentConvId.value)
  userScrolledUp.value = false
  showScrollBtn.value = false
  directoryWindowStart.value = 0
  activeDirectoryMessageId.value = ''
  directoryWindowPinned.value = false
  nextTick(() => {
    rowVirtualizer.value.measure()
    scrollToBottom('auto')
  })
})

watch(() => currentMessages.value.map(m => m.id).join('|'), () => {
  nextTick(measureVisibleMessagesSoon)
  nextTick(() => {
    directoryWindowStart.value = Math.min(
      Math.max(0, directoryRounds.value.length - DIRECTORY_WINDOW_SIZE),
      Math.max(0, directoryWindowStart.value),
    )
    const hasActiveRound = directoryRounds.value.some(round => round.userMessageId === activeDirectoryMessageId.value)
    if (!hasActiveRound) resetDirectoryWindow()
    else if (!directoryWindowPinned.value) {
      const activeIndex = directoryRounds.value.findIndex(round => round.userMessageId === activeDirectoryMessageId.value)
      keepDirectoryRoundVisible(activeIndex)
      scheduleDirectorySync()
    }
  })
})

</script>

<template>
  <div class="flex flex-1 overflow-hidden h-full" :class="isDark ? 'border-d4' : 'border-bdrL'" style="border-top:1px solid">

    <!-- ═══ Left Panel ═══ -->
    <template v-if="leftOpen">
      <div class="flex flex-col shrink-0 overflow-hidden"
        :class="isDark ? 'bg-d1' : 'bg-l1'"
        :style="{ width: leftW + 'px', borderRight: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }">

        <!-- Tab header — three tabs with active brand underline -->
        <div class="shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <!-- Tabs row -->
          <div class="flex">
            <button @click="leftTab = 'conv'"
              class="flex-1 h-[36px] flex flex-col items-center justify-center gap-0.5 text-[14px] font-medium transition-colors"
              :class="tabClass('conv')">
              <span class="flex items-center gap-1.5">
                <i class="ri-message-ai-3-line text-[14px]" />对话
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'conv' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'docs'"
              class="flex-1 h-[36px] flex flex-col items-center justify-center gap-0.5 text-[14px] font-medium transition-colors"
              :class="tabClass('docs')">
              <span class="flex items-center gap-1.5">
                <i class="ri-folder-2-line text-[14px]" />文档
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'docs' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'kb'"
              class="flex-1 h-[36px] flex flex-col items-center justify-center gap-0.5 text-[14px] font-medium transition-colors"
              :class="tabClass('kb')">
              <span class="flex items-center gap-1.5">
                <i class="ri-database-2-line text-[14px]" />知识库
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'kb' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
          </div>
        </div>

        <!-- Tab content -->
        <ConversationList v-if="leftTab === 'conv'"
          :conversations="conversations" :groups="groups"
          :current-conv-id="currentConvId" :is-dark="isDark"
          @select="selectConv" @create="createChat"
          @rename="onConvRename" @export="openConversationExport" @delete="deleteConv"
          @group-create="onGroupCreate" @group-rename="onGroupRename" @group-delete="onGroupDelete"
          @add-conv-to-group="createChat" />
        <Suspense v-if="renderedLeftPanels.docs">
          <DocumentSelector v-show="leftTab === 'docs'"
            :is-dark="isDark" :selected-docs="currentCtxItems"
            @toggle-doc="item => addCtxItem({ ...item, type: 'doc-toggle' })"
            @toggle-folder="item => addCtxItem({ ...item, type: 'doc-toggle' })" />
          <template #fallback>
            <div v-show="leftTab === 'docs'" class="flex-1 flex items-center justify-center gap-2 text-[12px]"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-loader-4-line animate-spin text-[14px] text-brand-400" />
              <span>正在加载文档...</span>
            </div>
          </template>
        </Suspense>
        <Suspense v-if="renderedLeftPanels.kb">
        <KbSelector v-show="leftTab === 'kb'"
          :is-dark="isDark"
          :selected-items="currentCtxItems.filter(i => i.type === 'cloud_kb' || i.type === 'cloud_doc')"
           :active-external-kb="activeExternalKb"
           :kb-enabled="kbEnabled"
           @toggle-kb="addCtxItem"
           @toggle-doc="addCtxItem"
           @select-external-kb="onSelectExternalKb"
           @clear-external-kb="onClearExternalKb"
           @toggle-kb-enabled="onToggleKbEnabled" />
          <template #fallback>
            <div v-show="leftTab === 'kb'" class="flex-1 flex items-center justify-center gap-2 text-[12px]"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-loader-4-line animate-spin text-[14px] text-brand-400" />
              <span>正在加载知识库...</span>
            </div>
          </template>
        </Suspense>
      </div>
      <ResizeHandle side="left" @resize="onLeftResize" />
    </template>

    <!-- ═══ Main Workspace ═══ -->
    <main class="flex-1 flex min-w-0 overflow-hidden" :class="isDark ? 'bg-d2' : 'bg-l2'">
      <div class="flex-1 flex overflow-hidden relative">
        <!-- Chat Area -->
        <div class="flex-1 flex flex-col min-w-0 relative">
          <!-- Tab Bar -->
          <div class="h-9 flex items-end shrink-0 overflow-hidden"
            :class="isDark ? 'bg-d0' : 'bg-l0'"
            :style="{ borderBottom: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }">
            <div ref="tabScroller" class="flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden thin-scroll">
              <div class="min-w-full w-max h-full flex items-end gap-0.5 px-0">
                <div v-for="tab in tabs" :key="tab.id"
                  :data-tab-id="tab.id"
                  @click="activateTab(tab.id)"
                  class="tab-item h-[34px] w-[152px] sm:w-[172px] px-3 flex items-center gap-1.5 text-[13px] shrink-0 relative cursor-pointer rounded-t-lg transition-colors"
                  :class="activeTabId === tab.id
                    ? (isDark ? 'bg-d2 text-wt-main' : 'bg-l2 text-lt-main')
                    : (isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4')">
                  <span v-if="isTabConversationSwitching(tab.id)"
                    class="tab-switch-spinner shrink-0"
                    :class="isDark ? 'border-white/20 border-t-brand-400' : 'border-black/10 border-t-brand-500'" />
                  <i v-else class="ri-message-ai-3-line text-[13px] shrink-0"
                    :class="activeTabId === tab.id ? 'text-brand-400' : (isDark ? 'text-wt-aux' : 'text-lt-aux')" />
                  <span class="truncate min-w-0 transition-opacity duration-150"
                    :class="isTabConversationSwitching(tab.id) ? 'opacity-70' : 'opacity-100'">
                    {{ convStore.titleTypewriterMap[tab.id] || tab.name }}
                  </span>
                  <button @click.stop="closeTab(tab.id)"
                    class="tab-close ml-auto h-5 w-5 rounded flex items-center justify-center shrink-0"
                    :class="isDark ? 'hover:text-red-400' : 'hover:text-red-500'">
                    <i class="ri-close-line text-[16px]" />
                  </button>
                  <div v-if="activeTabId === tab.id" class="absolute bottom-0 left-1 right-1 h-[2px] rounded-t-md bg-brand-400" />
                </div>
              </div>
            </div>
          </div>

          <!-- Panel toggles (vertically centered on chat area edges) -->
          <PanelToggle side="left" :is-open="leftOpen" :is-dark="isDark"
            @toggle="leftOpen = !leftOpen" />
          <PanelToggle side="right" :is-open="rightOpen" :is-dark="isDark"
            @toggle="rightOpen = !rightOpen" />

          <div class="chat-workspace relative flex-1 min-h-0">
            <div id="chat-scroll" ref="chatScrollRef" class="h-full overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 thin-scroll"
              @scroll="onChatScroll" @wheel.passive="onChatWheel"
              @pointerdown="onChatPointerDown" @pointerup="onChatPointerUp" @pointercancel="onChatPointerUp"
              @keydown.capture="onChatKeydown">
              <!-- Scroll loader for older messages -->
              <ScrollLoader v-if="currentConvId"
                :has-more="hasOlderMessages"
                :loading="loadingOlder"
                :is-dark="isDark"
                @load-more="loadOlderMessages" />
              <div v-if="virtualizedMessages.length"
                class="relative w-full"
                :style="{ height: totalVirtualHeight + 'px' }">
                <div v-for="item in visibleVirtualMessages"
                  :key="item.key"
                  :data-index="item.index"
                  :ref="measureVirtualMessageRow"
                  class="absolute left-0 right-0 will-change-transform"
                  :style="{ transform: `translateY(${item.start}px)` }">
                  <ChatMessage
                    :msg="item.message" :is-dark="isDark"
                    :chat-busy="isStreaming"
                    :is-streaming="isMessageStreaming(item.message.id)"
                    :streaming-content="isMessageStreaming(item.message.id) ? currentStreamingState.content : ''"
                    :streaming-thinking="isMessageStreaming(item.message.id) ? currentStreamingState.thinking : ''"
                    :streaming-tool-calls="isMessageStreaming(item.message.id) ? currentStreamingState.toolCalls : EMPTY_STREAM_OBJECT"
                    :streaming-sub-agents="isMessageStreaming(item.message.id) ? currentStreamingState.subAgents : EMPTY_STREAM_OBJECT"
                    :streaming-todos="isMessageStreaming(item.message.id) ? currentStreamingState.todos : EMPTY_STREAM_ARRAY"
                    :streaming-steps="isMessageStreaming(item.message.id) ? currentStreamingState.steps : EMPTY_STREAM_ARRAY"
                    :streaming-iteration="isMessageStreaming(item.message.id) ? currentStreamingState.iteration : 0"
                    :pending-auth-requests="pendingAuthRequestsForMessage(item.message.id)"
                    :branching="branchingMessageId === item.message.id"
                    :exporting="exportingMessageId === item.message.id"
                    @preview-file="handlePreviewFile"
                    @media-detail="openWorkchatMediaDetail"
                    @retry="handleRetry(item.message.id)"
                    @branch="handleCreateBranch(item.message.id)"
                    @export-markdown="handleExportMessageMarkdown(item.message)"
                    @export-word="handleExportMessageWord(item.message)"
                    @save-to-note="openSaveMessageToNote(item.message)"
                    @copy="handleCopy"
                    @copy-error="handleCopyError"
                    @delete="handleDeleteMessage(item.message.id)"
                    @save-edit="handleSaveEdit"
                    @compress-context="compressContext"
                    @auth-approve="handleAuthApprove"
                    @auth-deny="handleAuthDeny" />
                </div>
              </div>
              <div v-if="detachedTailMessage"
                :key="detachedTailMessage.id"
                :ref="observeDetachedTail"
                class="relative w-full"
                :class="virtualizedMessages.length ? 'mt-5' : ''"
                :style="{ minHeight: detachedTailMinHeight ? detachedTailMinHeight + 'px' : undefined }">
                <ChatMessage
                  :msg="detachedTailMessage" :is-dark="isDark"
                  :chat-busy="isStreaming"
                  :is-streaming="isMessageStreaming(detachedTailMessage.id)"
                  :streaming-content="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.content : ''"
                  :streaming-thinking="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.thinking : ''"
                  :streaming-tool-calls="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.toolCalls : EMPTY_STREAM_OBJECT"
                  :streaming-sub-agents="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.subAgents : EMPTY_STREAM_OBJECT"
                  :streaming-todos="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.todos : EMPTY_STREAM_ARRAY"
                  :streaming-steps="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.steps : EMPTY_STREAM_ARRAY"
                  :streaming-iteration="isMessageStreaming(detachedTailMessage.id) ? currentStreamingState.iteration : 0"
                  :pending-auth-requests="pendingAuthRequestsForMessage(detachedTailMessage.id)"
                  :branching="branchingMessageId === detachedTailMessage.id"
                  :exporting="exportingMessageId === detachedTailMessage.id"
                  @preview-file="handlePreviewFile"
                  @media-detail="openWorkchatMediaDetail"
                  @retry="handleRetry(detachedTailMessage.id)"
                  @branch="handleCreateBranch(detachedTailMessage.id)"
                  @export-markdown="handleExportMessageMarkdown(detachedTailMessage)"
                  @export-word="handleExportMessageWord(detachedTailMessage)"
                  @save-to-note="openSaveMessageToNote(detachedTailMessage)"
                  @copy="handleCopy"
                  @copy-error="handleCopyError"
                  @delete="handleDeleteMessage(detachedTailMessage.id)"
                  @save-edit="handleSaveEdit"
                  @compress-context="compressContext"
                  @auth-approve="handleAuthApprove"
                  @auth-deny="handleAuthDeny" />
              </div>
              <!-- Empty states -->
              <EmptyStateHero v-if="!currentMessages.length"
                :has-conversation="!!currentConvId"
                :is-dark="isDark"
                :agents="allAgents"
                @create-conv="createChat"
                @select-agent="selectAgent" />
            </div>

            <ChatDirectoryNav
              v-if="chatNavigationEnabled && directoryHasRounds && chatNavigationStyle === 'directory'"
              :items="visibleDirectoryRounds"
              :total-rounds="directoryRounds.length"
              :active-id="activeDirectoryMessageId"
              :is-dark="isDark"
              :has-rounds="directoryHasRounds"
              :can-show-older="directoryCanShowOlder"
              :can-show-newer="directoryCanShowNewer"
              :older-loading="directoryLoadingOlder"
              :older-label="directoryOlderLabel"
              @select="selectDirectoryRound"
              @show-older="showOlderDirectoryRounds"
              @show-newer="showNewerDirectoryRounds" />

            <ChatMinimapNav
              v-else-if="chatNavigationEnabled && directoryHasRounds"
              :items="visibleDirectoryRounds"
              :total-rounds="directoryRounds.length"
              :active-id="activeDirectoryMessageId"
              :is-dark="isDark"
              :has-rounds="directoryHasRounds"
              :can-show-older="directoryCanShowOlder"
              :can-show-newer="directoryCanShowNewer"
              :older-loading="directoryLoadingOlder"
              :older-label="directoryOlderLabel"
              @select="selectDirectoryRound"
              @show-older="showOlderDirectoryRounds"
              @show-newer="showNewerDirectoryRounds" />

            <Transition name="conversation-switch">
              <div v-if="isConversationSwitching"
                class="conversation-switch-overlay absolute inset-0 z-20 pointer-events-none flex items-center justify-center"
                :class="isDark ? 'bg-d2/90' : 'bg-l2/90'"
                role="status"
                aria-live="polite">
                <div class="conversation-switch-indicator flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium shadow-sm"
                  :class="isDark
                    ? 'bg-d1/85 border-white/10 text-wt-sub'
                    : 'bg-l1/90 border-black/10 text-lt-sub'">
                  <span class="conversation-switch-spinner"
                    :class="isDark ? 'border-white/20 border-t-brand-400' : 'border-black/10 border-t-brand-500'" />
                  <span>对话加载中...</span>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Scroll to bottom button -->
          <button v-if="showScrollBtn" @click="resumeStreamingFollow"
            class="absolute bottom-[180px] left-1/2 -translate-x-1/2 h-8 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium z-10 transition-all duration-200 shadow-lg"
            :class="isDark
              ? 'bg-d2 border border-d4 text-wt-sub hover:bg-d3 hover:text-wt-main'
              : 'bg-l2 border border-bdrF text-lt-sub hover:bg-l3 hover:text-lt-main'">
            <i class="ri-arrow-down-line text-[14px]" />
            <span>回到底部</span>
          </button>

          <!-- Input area -->
          <ChatInput
            :is-dark="isDark" :is-streaming="isStreaming" :is-compressing="isCompressing"
            :selected-agent="selectedAgent" :ctx-items="currentCtxItems"
            :context-length="contextLength" :all-agents="allAgents"
            :available-wikis="availableWikis"
            :selected-wiki-ids="selectedWikiIds"
            :has-messages="!!currentMessages.length"
            :command-insert-request="commandInsertRequest"
            :total-input-tokens="tokenStats.totalInput"
            :total-output-tokens="tokenStats.totalOutput"
            :last-latency-ms="tokenStats.lastLatencyMs"
            :last-cost="tokenStats.lastCost"
            @send="sendMessage"
            @cancel="cancelChat"
            @select-agent="selectAgent"
            @remove-agent="removeAgent"
            @add-ctx="addCtxItem"
            @remove-ctx="removeCtxItem"
            @toggle-wiki="toggleWikiContext"
            @clear-wiki="clearWikiContext"
            @update-context-length="updateContextLength"
            @compress-context="compressContext"
            @clear-ctx="clearCtxItems"
            @clear-messages="handleClearMessages" />
        </div>

        <!-- ═══ Right Panel ═══ -->
        <template v-if="rightOpen">
          <ResizeHandle side="right" @resize="onRightResize" />
          <RightPanel :preview-file="previewFile" :is-dark="isDark" :width="rightW"
            :selected-agent="selectedAgent" :all-agents="allAgents" :ctx-items="currentCtxItems"
            :group-id="currentGroupId"
            @close="rightOpen = false" @preview-file="handlePreviewFile"
            @open-media="openWorkchatMediaDetail"
            @tool-action="handleBuiltinTool"
            @select-skill="handleSelectSkillCommand" />
        </template>
      </div>
    </main>

    <!-- ═══ Creation Config Modals ═══ -->
    <ResearchModal
      v-if="renderedModals.research"
      v-model:show="showResearchModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @start="handleResearchStart"
    />

    <PptModal
      v-if="renderedModals.ppt"
      v-model:show="showPptModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @start="handlePptStart"
    />

    <!-- Mindmap / Graph / Podcast (async generation tasks) -->
    <MindmapModal
      v-if="renderedModals.mindmap"
      v-model:show="showMindmapModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <GraphModal
      v-if="renderedModals.graph"
      v-model:show="showGraphModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <FlashcardModal
      v-if="renderedModals.flashcard"
      v-model:show="showFlashcardModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <StudyCardModal
      v-if="renderedModals.studycard"
      v-model:show="showStudyCardModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <KnowledgeToolModal
      v-if="renderedModals.qa"
      v-model:show="showQaModal"
      tool-id="qa"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <KnowledgeToolModal
      v-if="renderedModals.glossary"
      v-model:show="showGlossaryModal"
      tool-id="glossary"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <KnowledgeToolModal
      v-if="renderedModals.cheatsheet"
      v-model:show="showCheatsheetModal"
      tool-id="cheatsheet"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <QuizModal
      v-if="renderedModals.quiz"
      v-model:show="showQuizModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <ChartModal
      v-if="renderedModals.chart"
      v-model:show="showChartModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @submit="handleGenTaskSubmit"
    />
    <PodcastModal
      v-if="renderedModals.podcast"
      v-model:show="showPodcastModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <StudyguideModal
      v-if="renderedModals.studyguide"
      v-model:show="showStudyguideModal"
      :ctx-items="currentCtxItems"
      :wiki-items="selectedWikiRefs"
      @start="handleStudyguideStart"
    />
    <ConversationExportModal
      v-if="renderedModals.conversationExport"
      v-model:show="showConversationExport"
      :conversation="exportTargetConversation"
      :agents="allAgents"
      :is-dark="isDark" />
    <SaveMessageToNoteModal
      v-if="renderedModals.saveMessageToNote"
      v-model:show="showSaveMessageToNote"
      :message="noteTargetMessage"
      :conversation="noteTargetConversation"
      :folders="notesStore.folders"
      :previous-user-message="notePreviousUserMessage"
      :previous-user-loading="notePreviousUserLoading"
      :previous-user-error="notePreviousUserError"
      :saving="savingMessageToNote"
      :save-error="saveMessageToNoteError"
      :is-dark="isDark"
      @clear-error="saveMessageToNoteError = ''"
      @save="handleSaveMessageToNote" />
    <MediaDetailModal
      v-if="showMediaDetail"
      v-model:show="showMediaDetail"
      :is-dark="isDark"
      :item="mediaDetailItem"
      @reanalyze="reanalyzeWorkchatMedia" />
  </div>
</template>

<style scoped>
.chat-workspace {
  container-type: inline-size;
  container-name: chat-area;
}

.tab-item .tab-close { opacity: 0; transition: opacity .12s }
.tab-item:hover .tab-close { opacity: 1 }

.tab-switch-spinner {
  width: 13px;
  height: 13px;
  border-width: 2px;
  border-style: solid;
  border-radius: 9999px;
  animation: conversation-switch-spin 760ms linear infinite;
}

.conversation-switch-enter-active,
.conversation-switch-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.25, 1, 0.5, 1),
    transform 180ms cubic-bezier(0.25, 1, 0.5, 1);
}

.conversation-switch-enter-from,
.conversation-switch-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.conversation-switch-overlay {
  backdrop-filter: blur(8px);
}

.conversation-switch-indicator {
  animation: conversation-switch-rise 220ms cubic-bezier(0.25, 1, 0.5, 1);
}

.conversation-switch-spinner {
  width: 14px;
  height: 14px;
  border-width: 2px;
  border-style: solid;
  border-radius: 9999px;
  animation: conversation-switch-spin 760ms linear infinite;
}

@keyframes conversation-switch-spin {
  to { transform: rotate(360deg); }
}

@keyframes conversation-switch-rise {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-switch-enter-active,
  .conversation-switch-leave-active {
    transition-duration: 1ms;
  }

  .conversation-switch-indicator,
  .conversation-switch-spinner,
  .tab-switch-spinner {
    animation: none;
  }
}
</style>
