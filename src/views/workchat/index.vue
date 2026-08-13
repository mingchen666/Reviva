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
import { saveTextFile } from '@/electron'
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
import {
  buildSingleMessageMarkdown,
  deriveMessageExportTitle,
  sanitizeMessageMarkdownFileName,
} from './sections/chat/markdownExport'

const DocumentSelector = defineAsyncComponent(() => import('./sections/sidebar/DocumentSelector.vue'))
const KbSelector = defineAsyncComponent(() => import('./sections/sidebar/KbSelector.vue'))
const ConversationExportModal = defineAsyncComponent(() => import('./sections/export/ConversationExportModal.vue'))
const SaveMessageToNoteModal = defineAsyncComponent(() => import('./sections/export/SaveMessageToNoteModal.vue'))
const MindmapModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/MindmapModal.vue'))
const GraphModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/GraphModal.vue'))
const FlashcardModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/FlashcardModal.vue'))
const KnowledgeToolModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/KnowledgeToolModal.vue'))
const QuizModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/QuizModal.vue'))
const ChartModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/ChartModal.vue'))
const PodcastModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/PodcastModal.vue'))
const ResearchModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/ResearchModal.vue'))
const PptModal = defineAsyncComponent(() => import('./sections/rightpanel/modals/PptModal.vue'))
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
const msg = useMessage()

const agentRuntime = getAgentRuntime(convStore, agentsStore, settingsStore)

// Data
const allAgents = computed(() => agentsStore.agents)
const conversations = computed(() => convStore.conversations)
const groups = computed(() => convStore.groups)
const currentConvId = computed(() => convStore.currentConvId)
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
const loadingOlder = ref(false)
const showScrollBtn = ref(false)
const isConversationSwitching = ref(false)
const switchingConvId = ref(null)
const CONVERSATION_SWITCH_MIN_MS = 140
const CONVERSATION_SWITCH_MAX_MS = 900
let conversationSwitchToken = 0
let conversationSwitchStartedAt = 0
let conversationSwitchFinishTimer = null
let conversationSwitchMaxTimer = null

// Virtualized message list. Store still paginates messages; TanStack keeps mounted DOM bounded.
const chatScrollRef = ref(null)
const MESSAGE_GAP = 20
const VIRTUAL_OVERSCAN = 8
const EMPTY_STREAM_OBJECT = Object.freeze({})
const EMPTY_STREAM_ARRAY = Object.freeze([])

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
const showQaModal = ref(false)
const showGlossaryModal = ref(false)
const showCheatsheetModal = ref(false)
const showQuizModal = ref(false)
const showChartModal = ref(false)
const showPodcastModal = ref(false)
const renderedModals = reactive({
  research: false,
  ppt: false,
  mindmap: false,
  graph: false,
  flashcard: false,
  qa: false,
  glossary: false,
  cheatsheet: false,
  quiz: false,
  chart: false,
  podcast: false,
  conversationExport: false,
  saveMessageToNote: false,
})

// Panels
const leftOpen = ref(true)
const leftW = ref(260)
const leftTab = ref('conv') // 'conv' | 'docs' | 'kb'
const renderedLeftPanels = reactive({ docs: false, kb: false })

watch(leftTab, (tab) => {
  if (tab === 'docs' || tab === 'kb') renderedLeftPanels[tab] = true
}, { flush: 'sync' })
const rightOpen = ref(true)
const rightW = ref(320)
const previewFile = ref(null)
const showMediaDetail = ref(false)
const mediaDetailItem = ref(null)
const branchingMessageId = ref(null)
const branchConfirmationPending = ref(false)
const showConversationExport = ref(false)
const exportTargetConversation = ref(null)
const exportingMessageId = ref(null)
const showSaveMessageToNote = ref(false)

const lazyModalVisibility = {
  research: showResearchModal,
  ppt: showPptModal,
  mindmap: showMindmapModal,
  graph: showGraphModal,
  flashcard: showFlashcardModal,
  qa: showQaModal,
  glossary: showGlossaryModal,
  cheatsheet: showCheatsheetModal,
  quiz: showQuizModal,
  chart: showChartModal,
  podcast: showPodcastModal,
  conversationExport: showConversationExport,
  saveMessageToNote: showSaveMessageToNote,
}

Object.entries(lazyModalVisibility).forEach(([name, visible]) => {
  watch(visible, (show) => {
    if (show) renderedModals[name] = true
  }, { flush: 'sync' })
})
const noteTargetMessage = ref(null)
const noteTargetConversation = ref(null)
const notePreviousUserMessage = ref(null)
const notePreviousUserLoading = ref(false)
const notePreviousUserError = ref('')
const savingMessageToNote = ref(false)
const saveMessageToNoteError = ref('')
let noteTargetSequence = 0

// Responsive: auto-collapse panels when window is narrow
const { width: windowW } = useWindowSize()
watch(windowW, (w) => {
  if (w < 900) { leftOpen.value = false; rightOpen.value = false }
  else if (w < 1100) { rightOpen.value = false }
})

// Tabs
const tabs = ref([])
const activeTabId = ref(null)
const tabAccessSeq = ref(0)
const tabScroller = ref(null)

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

// Smart scroll
let userScrolledUp = false
let suppressScrollEventsUntil = 0
function shouldIgnoreScrollEvent() {
  return Date.now() < suppressScrollEventsUntil
}
function markProgrammaticScroll(behavior = 'auto') {
  suppressScrollEventsUntil = Date.now() + (behavior === 'smooth' ? 700 : 160)
}
function onChatScroll(e) {
  if (shouldIgnoreScrollEvent()) return
  const el = e.target
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  userScrolledUp = !nearBottom
  showScrollBtn.value = !nearBottom && currentMessages.value.length > 0
}

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
  count: currentMessages.value.length,
  getScrollElement: () => chatScrollRef.value,
  estimateSize: index => estimateMessageHeight(currentMessages.value[index]),
  getItemKey: index => currentMessages.value[index]?.id || index,
  overscan: VIRTUAL_OVERSCAN,
  gap: MESSAGE_GAP,
  scrollPaddingEnd: 160,
  shouldAdjustScrollPositionOnItemSizeChange: item => {
    const scrollOffset = chatScrollRef.value?.scrollTop || 0
    return item.end <= scrollOffset + 1
  },
})))

const totalVirtualHeight = computed(() => rowVirtualizer.value.getTotalSize())

const visibleVirtualMessages = computed(() => rowVirtualizer.value.getVirtualItems().map(item => ({
  ...item,
  message: currentMessages.value[item.index],
})).filter(item => item.message))

function measureVirtualMessageRow(el) {
  if (el) rowVirtualizer.value.measureElement(el)
}

function findVirtualAnchor(el = chatScrollRef.value) {
  if (!el) return null
  const items = rowVirtualizer.value.getVirtualItems()
  if (!items.length) return null
  const first = items.find(item => item.start + item.size > el.scrollTop + 1) || items[0]
  const message = currentMessages.value[first.index]
  if (!message?.id) return null
  return { id: message.id, offset: el.scrollTop - first.start }
}

function restoreVirtualAnchor(anchor, el = chatScrollRef.value) {
  if (!el || !anchor?.id) return false
  const index = currentMessages.value.findIndex(message => message.id === anchor.id)
  if (index < 0) return false
  rowVirtualizer.value.scrollToIndex(index, { align: 'start', behavior: 'auto' })
  requestAnimationFrame(() => {
    const item = rowVirtualizer.value.getVirtualItems().find(row => row.index === index)
    if (item) el.scrollTop = Math.max(0, item.start + anchor.offset)
  })
  return true
}

function clearConversationSwitchTimers() {
  if (conversationSwitchFinishTimer) {
    clearTimeout(conversationSwitchFinishTimer)
    conversationSwitchFinishTimer = null
  }
  if (conversationSwitchMaxTimer) {
    clearTimeout(conversationSwitchMaxTimer)
    conversationSwitchMaxTimer = null
  }
}

function hasConversationMessagesLoaded(convId) {
  if (!convId) return true
  return Object.prototype.hasOwnProperty.call(convStore.messages || {}, convId)
}

function finishConversationSwitch(token = conversationSwitchToken) {
  if (token !== conversationSwitchToken) return
  clearConversationSwitchTimers()
  isConversationSwitching.value = false
  switchingConvId.value = null
}

function finishConversationSwitchAfterMinimum(token = conversationSwitchToken) {
  if (token !== conversationSwitchToken) return
  const elapsed = Date.now() - conversationSwitchStartedAt
  const wait = Math.max(0, CONVERSATION_SWITCH_MIN_MS - elapsed)
  if (conversationSwitchFinishTimer) clearTimeout(conversationSwitchFinishTimer)
  conversationSwitchFinishTimer = setTimeout(() => finishConversationSwitch(token), wait)
}

function startConversationSwitch(convId) {
  if (!convId || currentConvId.value === convId) return
  clearConversationSwitchTimers()
  conversationSwitchToken += 1
  const token = conversationSwitchToken
  conversationSwitchStartedAt = Date.now()
  switchingConvId.value = convId
  isConversationSwitching.value = true
  conversationSwitchMaxTimer = setTimeout(() => finishConversationSwitch(token), CONVERSATION_SWITCH_MAX_MS)
}

function switchToConversation(convId) {
  startConversationSwitch(convId)
  convStore.setCurrentConv(convId)
}

function isTabConversationSwitching(tabId) {
  return isConversationSwitching.value && switchingConvId.value === tabId
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

function nextTabAccessAt() {
  tabAccessSeq.value += 1
  return Date.now() * 1000 + tabAccessSeq.value
}

function mostRecentlyAccessedTab() {
  return [...tabs.value].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null
}

function evictLeastRecentlyAccessedTab() {
  if (tabs.value.length < 5) return
  let evictIndex = 0
  let oldest = tabs.value[0]?.lastAccessed || 0
  tabs.value.forEach((tab, index) => {
    const accessAt = tab.lastAccessed || 0
    if (accessAt < oldest) {
      oldest = accessAt
      evictIndex = index
    }
  })
  tabs.value.splice(evictIndex, 1)
}

function scrollTabIntoView(tabId) {
  nextTick(() => {
    const scroller = tabScroller.value
    if (!scroller) return
    const tabEl = Array.from(scroller.querySelectorAll('[data-tab-id]'))
      .find(el => el.dataset.tabId === tabId)
    tabEl?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  })
}

// Tabs — max 5. Display order is stable; LRU is tracked separately.
function addTab(conv) {
  const existing = tabs.value.find(t => t.id === conv.id)
  if (existing) {
    existing.name = conv.title
    existing.lastAccessed = nextTabAccessAt()
    activeTabId.value = conv.id
    switchToConversation(conv.id)
    scrollTabIntoView(conv.id)
    return
  }
  evictLeastRecentlyAccessedTab()
  tabs.value.unshift({ id: conv.id, name: conv.title, lastAccessed: nextTabAccessAt() })
  activeTabId.value = conv.id
  switchToConversation(conv.id)
  scrollTabIntoView(conv.id)
}
function activateTab(tabId) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab) tab.lastAccessed = nextTabAccessAt()
  activeTabId.value = tabId
  switchToConversation(tabId)
  scrollTabIntoView(tabId)
}
function closeTab(tabId) {
  tabs.value = tabs.value.filter(t => t.id !== tabId)
  if (activeTabId.value === tabId) {
    if (tabs.value.length) {
      const nextTab = mostRecentlyAccessedTab()
      activeTabId.value = nextTab.id
      switchToConversation(nextTab.id)
      scrollTabIntoView(nextTab.id)
    } else {
      activeTabId.value = null
    }
  }
}

// Create conversation
async function createChat(groupId) {
  const conv = await convStore.createConv({
    title: '新对话',
    groupId: groupId || convStore.currentGroupId || 'default',
  })
  addTab(conv)
}

function selectConv(c) { addTab(c) }

async function deleteConv(convId) {
  await convStore.deleteConv(convId)
  tabs.value = tabs.value.filter(t => t.id !== convId)
  if (activeTabId.value === convId && tabs.value.length) {
    const nextTab = mostRecentlyAccessedTab()
    activeTabId.value = nextTab.id
    switchToConversation(nextTab.id)
    scrollTabIntoView(nextTab.id)
  } else if (activeTabId.value === convId) {
    activeTabId.value = null
  }
  msg.success('对话已删除')
}

function onConvRename(data) {
  convStore.updateConv(data.id, { title: data.title })
  const tab = tabs.value.find(t => t.id === data.id)
  if (tab) tab.name = data.title
  msg.success('对话已重命名')
}

function openConversationExport(conversationId) {
  const conversation = conversations.value.find(item => item.id === conversationId)
  if (!conversation) {
    msg.error('对话不存在，无法导出')
    return
  }
  exportTargetConversation.value = conversation
  showConversationExport.value = true
}

function conversationForMessage(message) {
  const conversationId = message?.conversationId || currentConvId.value
  if (conversationId) return conversations.value.find(item => item.id === conversationId) || null
  return currentConv.value
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
  clearCtxItems()
  const inputDocument = Array.isArray(payload?.inputDocument) ? payload.inputDocument : []
  const resolvedContent = String(payload?.resolvedContent || trimmed).trim()
  userScrolledUp = false
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
  }
}

function providerInfoFromModelRef(modelRef) {
  const parsed = parseModelRef(modelRef)
  if (!parsed.modelId) return null

  const modelUsable = m => m?.enabled && m?.tier !== 'embedding'
  if (parsed.scoped) {
    const provider = settingsStore.providers.find(p => p.id === parsed.providerId && p.enabled && providerConfigured(p))
    const model = provider?.models?.find(m => m.id === parsed.modelId && modelUsable(m))
    return provider && model
      ? { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
      : null
  }

  for (const provider of settingsStore.providers) {
    if (!provider.enabled || !providerConfigured(provider)) continue
    const model = provider.models?.find(m => m.id === parsed.modelId && modelUsable(m))
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
  }
  return null
}

function resolveGenerationProviderInfo() {
  const refs = [
    settingsStore.defaultModels?.agent,
    settingsStore.defaultModels?.chat,
    settingsStore.defaultModels?.skill,
  ].filter(Boolean)

  for (const ref of refs) {
    const info = providerInfoFromModelRef(ref)
    if (info) return info
  }

  for (const provider of settingsStore.providers) {
    if (!provider.enabled || !providerConfigured(provider)) continue
    const model = provider.models?.find(m => m.enabled && m.tier !== 'embedding')
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id, modelCtx: model.ctx || model.context_window || model.contextWindow || '', modelHasVision: !!model.capabilities?.vision }
  }
  return null
}

function resolveVisionProviderInfo() {
  const info = providerInfoFromModelRef(settingsStore.defaultModels?.vision)
  return info?.modelHasVision ? info : null
}

function providerConfigured(provider) {
  return settingsStore.providerConfigured
    ? settingsStore.providerConfigured(provider)
    : !!(provider?.baseUrl && provider.apiKey)
}

function providerApiFormat(provider) {
  return provider?.apiFormat || (provider?.id === 'anthropic' ? 'anthropic' : 'openai')
}

function cloneToolProviderConfigs() {
  try {
    return JSON.parse(JSON.stringify(agentsStore.toolProviderConfigMap || {}))
  } catch (_) {
    return {}
  }
}

function normalizeGenerationWebSearch(params = {}) {
  const raw = params?.webSearch
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { enabled: raw.enabled === true, provider: raw.provider || 'auto' }
  }
  return {
    enabled: params?.enableWebSearch === true || params?.enable_web_search === true,
    provider: 'auto',
  }
}

function resolveCloudBaseUrl() {
  const envBase = import.meta.env.VITE_CLOUD_BASE_URL
  if (envBase) return envBase
  if (import.meta.env.DEV) return 'http://localhost:8000'
  if (BASE_URL) return BASE_URL
  if (typeof window !== 'undefined' && /^https?:/i.test(window.location.origin)) return window.location.origin
  return ''
}

function normalizePptOutputFormat(format) {
  return String(format || '').includes('pptx') ? 'pptx' : 'html'
}

function buildCloudContext(ctxItems) {
  const defaultKbIds = new Set()
  const defaultDocIds = new Set()
  for (const item of ctxItems || []) {
    if (item?.type === 'cloud_kb' && item.kbId) {
      defaultKbIds.add(item.kbId)
    } else if (item?.type === 'cloud_doc') {
      if (item.kbId) defaultKbIds.add(item.kbId)
      if (item.docId) defaultDocIds.add(item.docId)
    }
  }
  return {
    baseUrl: resolveCloudBaseUrl(),
    token: userStore.token || '',
    defaultKbIds: [...defaultKbIds],
    defaultDocIds: [...defaultDocIds],
  }
}

// Handle modal submit for background generation tasks
async function handleGenTaskSubmit(payload) {
  const { toolId, mode } = payload || {}
  // Close the corresponding modal
  if (toolId === 'mindmap') showMindmapModal.value = false
  else if (toolId === 'graph') showGraphModal.value = false
  else if (toolId === 'flashcard') showFlashcardModal.value = false
  else if (toolId === 'qa') showQaModal.value = false
  else if (toolId === 'glossary') showGlossaryModal.value = false
  else if (toolId === 'cheatsheet') showCheatsheetModal.value = false
  else if (toolId === 'quiz') showQuizModal.value = false
  else if (toolId === 'chart') showChartModal.value = false
  else if (toolId === 'podcast') showPodcastModal.value = false
  else if (toolId === 'research') showResearchModal.value = false
  else if (toolId === 'ppt') showPptModal.value = false

  if (!window.electronAPI?.genTasks?.create) {
    msg.error('生成服务未就绪')
    return
  }

  if (mode === 'cloud' && !userStore.token) {
    msg.error('请先登录云端账号')
    return
  }

  const providerInfo = resolveGenerationProviderInfo()

  if (mode === 'local' && !providerInfo) {
    msg.error('请先在设置中配置可用的默认模型 Provider')
    return
  }

  const ctxSnapshot = JSON.parse(JSON.stringify(currentCtxItems.value || []))
  const needsTopicOrSource = ['mindmap', 'graph', 'flashcard', 'quiz', 'chart', 'qa', 'glossary', 'cheatsheet'].includes(toolId)
  if (needsTopicOrSource && !String(payload.topic || '').trim() && !readableGenerationContexts(ctxSnapshot).length && !selectedWikiRefs.value.length) {
    msg.warning('请填写主题，或选择具体文件、知识库或 Wiki')
    return
  }

  const webSearch = normalizeGenerationWebSearch(payload.params || {})

  const req = {
    toolId,
    mode,
    topic: payload.topic || '',
    params: payload.params || {},
    groupId: currentGroupId.value,
    conversationId: currentConvId.value || '',
    ctxItems: ctxSnapshot,
    wikiContext: { enabled: selectedWikiRefs.value.length > 0, mode: 'selected', wikiIds: [...selectedWikiIds.value] },
    sourceScope: {
      wikiIds: [...selectedWikiIds.value],
      wikiRefs: JSON.parse(JSON.stringify(selectedWikiRefs.value)),
      web: webSearch,
    },
    toolProviderConfigs: cloneToolProviderConfigs(),
    cloudContext: buildCloudContext(ctxSnapshot),
    visionModel: resolveVisionProviderInfo(),
    ...(providerInfo || {}),
  }

  const res = await window.electronAPI.genTasks.create(req)
  if (!res?.success) {
    msg.error(res?.error || '任务创建失败')
    return
  }

  // Notify right-panel to refresh task list
  window.dispatchEvent(new CustomEvent('reviva:gen-task-created', { detail: res.task }))
  msg.success(`已开始生成${{ mindmap: '思维导图', graph: '知识图谱', flashcard: '闪卡', quiz: '测验', chart: '图表', qa: 'Q&A 问答卡', glossary: '术语表', cheatsheet: '速查表', podcast: '播客', research: '深度研究', ppt: 'PPT' }[toolId] || ''}`)
}

async function handleResearchStart({ requirement, settings }) {
  const ctxItems = currentCtxItems.value
  const sourceItems = [...ctxItems, ...selectedWikiRefs.value]
  const fileNames = sourceItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  if (mode === 'local' && !sourceItems.length) {
    msg.warning('请先选择要研究的文件、文件夹、知识库或 Wiki')
    return
  }
  await handleGenTaskSubmit({
    toolId: 'research',
    mode,
    topic: requirement || `请对以下资料进行深度研究分析：${fileNames}`,
    params: mode === 'cloud'
      ? {
          outputFormats: ['markdown', 'html'],
          detailLevel: 'standard',
          language: 'zh-CN',
          enable_web_search: settings?.enableWebSearch !== false,
        }
      : {
          outputFormats: ['md', 'html'],
          enable_web_search: settings?.enableWebSearch !== false,
        },
  })
}

async function handlePptStart({ requirement, settings }) {
  const ctxItems = currentCtxItems.value
  const sourceItems = [...ctxItems, ...selectedWikiRefs.value]
  const fileNames = sourceItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  const outputFormat = normalizePptOutputFormat(settings?.format)
  if (mode === 'local' && !sourceItems.length) {
    msg.warning('请先选择要处理的文件、文件夹、知识库或 Wiki')
    return
  }
  await handleGenTaskSubmit({
    toolId: 'ppt',
    mode,
    topic: requirement || `请根据以下资料生成演示文稿：${fileNames}`,
    params: mode === 'cloud'
      ? {
          scene: settings?.scene || 'auto',
          outputFormat,
          pages: settings?.pages || 12,
          stylePreset: settings?.stylePreset || 'auto',
          customPrompt: settings?.customPrompt || '',
          enable_web_search: !!settings?.enableWebSearch,
        }
      : {
          scene: settings?.scene || 'auto',
          format: outputFormat === 'pptx' ? 'pptx-local' : 'html',
          pages: settings?.pages || 12,
          enable_web_search: !!settings?.enableWebSearch,
        },
  })
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
  agentRuntime.retryMessage(currentConvId.value, msgId)
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
  await agentRuntime.retryMessage(convId, userMsg.id)
}

// Preview file
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
  const conversationMessages = convStore.messages[currentConvId.value] || []
  const matches = item => item?.id === file?.id || (!!item?.path && item.path === file?.path)
  const message = conversationMessages.find(item => item.id === messageId)
    || conversationMessages.find(item => (item.meta?.attachments || []).some(matches))
  if (!message?.meta) return
  const updateItems = items => (items || []).map(item => matches(item) ? { ...item, ...patch } : item)
  await convStore.updateMessage(currentConvId.value, message.id, {
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
  const message = (convStore.messages[currentConvId.value] || []).find(item => item.id === messageId)
    || (convStore.messages[currentConvId.value] || []).find(item => (item.meta?.attachments || []).some(attachment => attachment?.id === file?.id || (!!attachment?.path && attachment.path === file?.path)))
  const owner = { type: 'message', id: message?.id || messageId || currentConvId.value || '', locator: file.id || file.path || file.name || 'attachment' }
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
    preferSubtitle: settings.mediaPreferSubtitle !== false,
    extractKeyframes: settings.mediaExtractKeyframes === true,
    keyframeLimit: settings.mediaKeyframeLimit || 12,
  })
  if (!result?.success) msg.error(result?.message || '媒体解析任务创建失败')
  else msg.success('媒体解析任务已创建')
}

// Scroll
let pendingScrollFrame = 0
function scrollToBottom(behavior = 'auto') {
  if (!chatScrollRef.value || !currentMessages.value.length) return
  markProgrammaticScroll(behavior)
  rowVirtualizer.value.scrollToIndex(currentMessages.value.length - 1, { align: 'end', behavior })
  userScrolledUp = false
  showScrollBtn.value = false
}

function scheduleScrollToBottom({ force = false, behavior = 'auto' } = {}) {
  if (!force && userScrolledUp) return
  if (pendingScrollFrame) return
  pendingScrollFrame = requestAnimationFrame(() => {
    pendingScrollFrame = 0
    scrollToBottom(behavior)
  })
}

// Load older messages with ScrollLoader
async function loadOlderMessages() {
  loadingOlder.value = true
  const el = chatScrollRef.value || document.getElementById('chat-scroll')
  const anchor = findVirtualAnchor(el)
  await convStore.loadMoreMessages(currentConvId.value)
  await nextTick()
  rowVirtualizer.value.measure()
  restoreVirtualAnchor(anchor, el)
  loadingOlder.value = false
}

// Auth handlers (updated for new AuthCard API with allowSession)
function handleAuthApprove(data) {
  agentRuntime.respondAuth(data.requestId, true)
}
function handleAuthDeny(data) {
  agentRuntime.respondAuth(data.requestId, false)
}

// App-level shortcuts (Ctrl+N etc.) handled by useAppShortcuts in App.vue

onMounted(() => {
  agentRuntime.registerListeners()
  wikiStore.loadWikis?.().catch(() => {})
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
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null }
  clearConversationSwitchTimers()
})

// Smart auto-scroll during streaming
watch(() => currentStreamingState.value.content, () => {
  scheduleScrollToBottom()
})

watch(() => [
  currentMessages.value.length,
  currentStreamingState.value.thinking,
  currentStreamingState.value.steps.length,
  Object.keys(currentStreamingState.value.toolCalls).length,
  Object.keys(currentStreamingState.value.subAgents).length,
  currentStreamingState.value.todos.length,
], () => {
  nextTick(measureVisibleMessagesSoon)
  scheduleScrollToBottom()
})

watch(currentConvId, () => {
  userScrolledUp = false
  showScrollBtn.value = false
  nextTick(() => {
    rowVirtualizer.value.measure()
    scrollToBottom('auto')
  })
})

watch(() => [
  currentConvId.value,
  hasConversationMessagesLoaded(currentConvId.value),
], () => {
  if (!isConversationSwitching.value) return
  if (switchingConvId.value && currentConvId.value !== switchingConvId.value) return
  if (hasConversationMessagesLoaded(currentConvId.value)) {
    nextTick(() => finishConversationSwitchAfterMinimum())
  }
}, { flush: 'post' })

watch(() => currentMessages.value.map(m => m.id).join('|'), () => {
  nextTick(measureVisibleMessagesSoon)
})

// Typewriter title animation — triggered by titleAnimation signal from AgentRuntime
const typewriterTitles = ref({}) // { convId: displayedTitle } for tab bar

watch(() => convStore.titleAnimation, (anim, old) => {
  if (!anim || anim === old) return
  const { convId, newTitle } = anim
  const tab = tabs.value.find(t => t.id === convId)
  animateTitle(convId, newTitle, tab)
  convStore.titleAnimation = null
}, { flush: 'sync' })

function animateTitle(convId, targetTitle, tab) {
  convStore.titleTypewriterMap[convId] = ''
  let idx = 0
  const interval = setInterval(() => {
    idx++
    const partial = targetTitle.slice(0, idx)
    convStore.titleTypewriterMap[convId] = partial
    if (tab) tab.name = partial
    if (idx >= targetTitle.length) {
      clearInterval(interval)
      if (tab) tab.name = targetTitle
      delete convStore.titleTypewriterMap[convId]
    }
  }, 60)
}
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
              :class="leftTab === 'conv'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <span class="flex items-center gap-1.5">
                <i class="ri-message-ai-3-line text-[14px]" />对话
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'conv' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'docs'"
              class="flex-1 h-[36px] flex flex-col items-center justify-center gap-0.5 text-[14px] font-medium transition-colors"
              :class="leftTab === 'docs'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <span class="flex items-center gap-1.5">
                <i class="ri-folder-2-line text-[14px]" />文档
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'docs' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'kb'"
              class="flex-1 h-[36px] flex flex-col items-center justify-center gap-0.5 text-[14px] font-medium transition-colors"
              :class="leftTab === 'kb'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
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
            @toggle-kb="addCtxItem"
            @toggle-doc="addCtxItem" />
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

          <div class="relative flex-1 min-h-0">
            <div id="chat-scroll" ref="chatScrollRef" class="h-full overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 thin-scroll"
              @scroll="onChatScroll">
              <!-- Scroll loader for older messages -->
              <ScrollLoader v-if="currentConvId"
                :has-more="hasOlderMessages"
                :loading="loadingOlder"
                :is-dark="isDark"
                @load-more="loadOlderMessages" />
              <div v-if="currentMessages.length"
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
              <!-- Empty states -->
              <EmptyStateHero v-if="!currentMessages.length"
                :has-conversation="!!currentConvId"
                :is-dark="isDark"
                :agents="allAgents"
                @create-conv="createChat"
                @select-agent="selectAgent" />
            </div>

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
          <button v-if="showScrollBtn" @click="userScrolledUp = false; showScrollBtn = false; scrollToBottom('smooth')"
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
