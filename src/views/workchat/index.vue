<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useResizeObserver, useWindowSize } from '@vueuse/core'
import { useAppStore } from '@/stores/app'
import { useConversationsStore } from '@/stores/conversations'
import { useAgentsStore } from '@/stores/agents'
import { useWikiStore } from '@/stores/wiki'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { AgentRuntime } from '@/agents/AgentRuntime'
import { normalizeFilePath } from '@/utils/fileUrl'
import { readableGenerationContexts } from '@/utils/generationContext'
import { parseModelRef } from '@/utils/modelRef'
import { BASE_URL } from '@/apis/http'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import ResizeHandle from '@/components/layout/ResizeHandle.vue'
import ConversationList from './sections/sidebar/ConversationList.vue'
import DocumentSelector from './sections/sidebar/DocumentSelector.vue'
import KbSelector from './sections/sidebar/KbSelector.vue'
import ChatMessage from './sections/ChatMessage.vue'
import ChatInput from './sections/ChatInput.vue'
import RightPanel from './sections/rightpanel/RightPanel.vue'
import PanelToggle from './sections/PanelToggle.vue'
import AuthCard from './sections/AuthCard.vue'
import EmptyStateHero from './sections/EmptyStateHero.vue'
import ScrollLoader from './sections/ScrollLoader.vue'
import MindmapModal from './sections/rightpanel/modals/MindmapModal.vue'
import GraphModal from './sections/rightpanel/modals/GraphModal.vue'
import FlashcardModal from './sections/rightpanel/modals/FlashcardModal.vue'
import QuizModal from './sections/rightpanel/modals/QuizModal.vue'
import ChartModal from './sections/rightpanel/modals/ChartModal.vue'
import PodcastModal from './sections/rightpanel/modals/PodcastModal.vue'
import ResearchModal from './sections/rightpanel/modals/ResearchModal.vue'
import PptModal from './sections/rightpanel/modals/PptModal.vue'

const appStore = useAppStore()
const convStore = useConversationsStore()
const agentsStore = useAgentsStore()
const wikiStore = useWikiStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()

const agentRuntime = new AgentRuntime(convStore, agentsStore, settingsStore)

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

// Virtualized message list. Store still paginates messages; this keeps mounted DOM bounded.
const chatScrollRef = ref(null)
const virtualListRef = ref(null)
const virtualScrollTop = ref(0)
const virtualViewportHeight = ref(0)
const virtualListTop = ref(0)
const messageHeights = ref({})
const MESSAGE_GAP = 20
const VIRTUAL_OVERSCAN = 900
const EMPTY_STREAM_OBJECT = Object.freeze({})
const EMPTY_STREAM_ARRAY = Object.freeze([])
let virtualViewportFrame = 0
let messageResizeObserver = null
const observedMessageRows = new Map()

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
const showQuizModal = ref(false)
const showChartModal = ref(false)
const showPodcastModal = ref(false)

// Panels
const leftOpen = ref(true)
const leftW = ref(260)
const leftTab = ref('conv') // 'conv' | 'docs' | 'kb'
const rightOpen = ref(true)
const rightW = ref(320)
const previewFile = ref(null)

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

const globalCtxItems = ref([])
const currentCtxItems = computed(() => globalCtxItems.value)
const selectedWikiIds = ref([])
const availableWikis = computed(() => wikiStore.wikis || [])
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
function onChatScroll(e) {
  const el = e.target
  updateVirtualViewport(el)
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  userScrolledUp = !nearBottom
  showScrollBtn.value = !nearBottom && currentMessages.value.length > 0
}

function estimateMessageHeight(message) {
  const contentLength = String(message?.content || '').length
  const attachmentCount = Array.isArray(message?.meta?.attachments) ? message.meta.attachments.length : 0
  const stepCount = Array.isArray(message?.meta?.steps) ? message.meta.steps.length : 0
  const toolCount = Array.isArray(message?.meta?.toolCalls) ? message.meta.toolCalls.length : 0
  const lineEstimate = Math.ceil(contentLength / (message?.role === 'user' ? 48 : 76))
  const base = message?.role === 'user' ? 72 : 118
  const estimated = base + lineEstimate * 18 + attachmentCount * 80 + stepCount * 52 + toolCount * 42
  return Math.min(760, Math.max(64, estimated))
}

function isMessageStreaming(messageId) {
  return currentStreamingState.value.active && messageId === currentStreamingState.value.msgId
}

function pendingAuthRequestsForMessage(messageId) {
  return pendingAuthRequestsByMessageId.value[messageId] || EMPTY_STREAM_ARRAY
}

const virtualRows = computed(() => {
  const rows = []
  let top = 0
  const msgs = currentMessages.value
  for (let i = 0; i < msgs.length; i++) {
    const message = msgs[i]
    const height = messageHeights.value[message.id] || estimateMessageHeight(message)
    rows.push({ index: i, message, top, height })
    top += height + (i === msgs.length - 1 ? 0 : MESSAGE_GAP)
  }
  return rows
})

const totalVirtualHeight = computed(() => {
  const rows = virtualRows.value
  if (!rows.length) return 0
  const last = rows[rows.length - 1]
  return Math.max(1, last.top + last.height)
})

const visibleVirtualMessages = computed(() => {
  const rows = virtualRows.value
  if (!rows.length) return []
  const localTop = Math.max(0, virtualScrollTop.value - virtualListTop.value)
  const start = Math.max(0, localTop - VIRTUAL_OVERSCAN)
  const end = localTop + virtualViewportHeight.value + VIRTUAL_OVERSCAN
  const visible = []
  for (const row of rows) {
    const rowEnd = row.top + row.height
    if (rowEnd < start) continue
    if (row.top > end) break
    visible.push(row)
  }
  return visible
})

function updateVirtualViewport(el = chatScrollRef.value) {
  if (!el) return
  virtualScrollTop.value = el.scrollTop
  virtualViewportHeight.value = el.clientHeight
  virtualListTop.value = virtualListRef.value?.offsetTop || 0
}

function queueVirtualViewportUpdate() {
  if (virtualViewportFrame) return
  virtualViewportFrame = requestAnimationFrame(() => {
    virtualViewportFrame = 0
    updateVirtualViewport()
  })
}

function ensureMessageResizeObserver() {
  if (messageResizeObserver) return messageResizeObserver
  messageResizeObserver = new ResizeObserver((entries) => {
    const nextHeights = { ...messageHeights.value }
    let changed = false
    for (const entry of entries) {
      const id = entry.target.dataset.messageId
      if (!id) continue
      const height = Math.ceil(entry.contentRect.height)
      if (height > 0 && Math.abs((nextHeights[id] || 0) - height) > 1) {
        nextHeights[id] = height
        changed = true
      }
    }
    if (!changed) return
    messageHeights.value = nextHeights
    queueVirtualViewportUpdate()
    if (!userScrolledUp) requestAnimationFrame(() => scrollToBottom('auto'))
  })
  return messageResizeObserver
}

function observeVirtualMessageRow(el, messageId) {
  if (!messageId) return
  const prev = observedMessageRows.get(messageId)
  if (prev === el) return
  if (prev) messageResizeObserver?.unobserve(prev)
  if (!el) {
    observedMessageRows.delete(messageId)
    return
  }
  const observer = ensureMessageResizeObserver()
  el.dataset.messageId = messageId
  observedMessageRows.set(messageId, el)
  observer.observe(el)
}

function pruneMessageHeightCache() {
  const ids = new Set(currentMessages.value.map(m => m.id))
  const nextHeights = {}
  for (const [id, height] of Object.entries(messageHeights.value)) {
    if (ids.has(id)) nextHeights[id] = height
  }
  messageHeights.value = nextHeights
}

function resetVirtualMessages() {
  observedMessageRows.clear()
  messageResizeObserver?.disconnect()
  messageResizeObserver = null
  messageHeights.value = {}
  virtualScrollTop.value = 0
  virtualViewportHeight.value = 0
  virtualListTop.value = 0
}

useResizeObserver(chatScrollRef, queueVirtualViewportUpdate)

// Resize
function onLeftResize(delta) { leftW.value = Math.min(380, Math.max(180, leftW.value + delta)) }
function onRightResize(delta) { rightW.value = Math.min(500, Math.max(240, rightW.value + delta)) }

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
    convStore.setCurrentConv(conv.id)
    scrollTabIntoView(conv.id)
    return
  }
  evictLeastRecentlyAccessedTab()
  tabs.value.unshift({ id: conv.id, name: conv.title, lastAccessed: nextTabAccessAt() })
  activeTabId.value = conv.id
  convStore.setCurrentConv(conv.id)
  scrollTabIntoView(conv.id)
}
function activateTab(tabId) {
  const tab = tabs.value.find(t => t.id === tabId)
  if (tab) tab.lastAccessed = nextTabAccessAt()
  activeTabId.value = tabId
  convStore.setCurrentConv(tabId)
  scrollTabIntoView(tabId)
}
function closeTab(tabId) {
  tabs.value = tabs.value.filter(t => t.id !== tabId)
  if (activeTabId.value === tabId) {
    if (tabs.value.length) {
      const nextTab = mostRecentlyAccessedTab()
      activeTabId.value = nextTab.id
      convStore.setCurrentConv(nextTab.id)
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
    convStore.setCurrentConv(nextTab.id)
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
async function sendMessage(text) {
  const trimmed = (text || '').trim()
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
  const ctxItems = currentCtxItems.value
  userScrolledUp = false
  showScrollBtn.value = false
  await nextTick()
  scrollToBottom()
  await agentRuntime.startChat({
    convId,
    userText: trimmed,
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
      ? { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id }
      : null
  }

  for (const provider of settingsStore.providers) {
    if (!provider.enabled || !providerConfigured(provider)) continue
    const model = provider.models?.find(m => m.id === parsed.modelId && modelUsable(m))
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id }
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
    if (model) return { providerId: provider.id, apiFormat: providerApiFormat(provider), apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: model.id }
  }
  return null
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
  if (['mindmap', 'graph', 'flashcard', 'quiz', 'chart'].includes(toolId) && !String(payload.topic || '').trim() && !readableGenerationContexts(ctxSnapshot).length) {
    msg.warning('请填写主题，或选择具体文件/知识库')
    return
  }

  const req = {
    toolId,
    mode,
    topic: payload.topic || '',
    params: payload.params || {},
    groupId: currentGroupId.value,
    conversationId: currentConvId.value || '',
    ctxItems: ctxSnapshot,
    toolProviderConfigs: cloneToolProviderConfigs(),
    cloudContext: buildCloudContext(ctxSnapshot),
    ...(providerInfo || {}),
  }

  const res = await window.electronAPI.genTasks.create(req)
  if (!res?.success) {
    msg.error(res?.error || '任务创建失败')
    return
  }

  // Notify right-panel to refresh task list
  window.dispatchEvent(new CustomEvent('reviva:gen-task-created', { detail: res.task }))
  msg.success(`已开始生成${{ mindmap: '思维导图', graph: '知识图谱', flashcard: '闪卡', quiz: '测验', chart: '图表', podcast: '播客', research: '深度研究', ppt: 'PPT' }[toolId] || ''}`)
}

async function handleResearchStart({ requirement, settings }) {
  const ctxItems = currentCtxItems.value
  const fileNames = ctxItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  if (mode === 'local' && !ctxItems.length) {
    msg.warning('请先选择要研究的文件、文件夹或知识库')
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
  const fileNames = ctxItems.map(i => i.name || i.path).join('、')
  const mode = settings?.mode === 'cloud' ? 'cloud' : 'local'
  const outputFormat = normalizePptOutputFormat(settings?.format)
  if (mode === 'local' && !ctxItems.length) {
    msg.warning('请先选择要处理的文件、文件夹或知识库')
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

async function handleSaveEdit({ msgId, content }) {
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
  await convStore.updateMessage(convId, userMsg.id, { content })
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

// Scroll
function scrollToBottom(behavior = 'smooth') {
  const el = chatScrollRef.value || document.getElementById('chat-scroll')
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior })
    updateVirtualViewport(el)
    userScrolledUp = false
    showScrollBtn.value = false
  }
}

function scheduleScrollToBottom({ force = false, behavior = 'smooth' } = {}) {
  if (!force && userScrolledUp) return
  requestAnimationFrame(() => scrollToBottom(behavior))
}

// Load older messages with ScrollLoader
async function loadOlderMessages() {
  loadingOlder.value = true
  const el = chatScrollRef.value || document.getElementById('chat-scroll')
  const prevScrollHeight = el?.scrollHeight || 0
  await convStore.loadMoreMessages(currentConvId.value)
  await nextTick()
  pruneMessageHeightCache()
  updateVirtualViewport(el)
  if (el) {
    el.scrollTop = el.scrollHeight - prevScrollHeight + el.scrollTop
    updateVirtualViewport(el)
  }
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
    updateVirtualViewport()
    if (currentMessages.value.length) scrollToBottom('auto')
  })
})

watch(availableWikis, (items) => {
  const valid = new Set((items || []).map(item => item.id))
  selectedWikiIds.value = selectedWikiIds.value.filter(id => valid.has(id))
})

onBeforeUnmount(() => {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null }
  if (virtualViewportFrame) cancelAnimationFrame(virtualViewportFrame)
  messageResizeObserver?.disconnect()
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
  nextTick(queueVirtualViewportUpdate)
  scheduleScrollToBottom()
})

watch(currentConvId, (newId, oldId) => {
  resetVirtualMessages()
  userScrolledUp = false
  nextTick(() => {
    updateVirtualViewport()
    scrollToBottom('auto')
  })
})

watch(() => currentMessages.value.map(m => m.id).join('|'), () => {
  pruneMessageHeightCache()
  nextTick(queueVirtualViewportUpdate)
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
              class="flex-1 h-[34px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors"
              :class="leftTab === 'conv'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <span class="flex items-center gap-1.5">
                <i class="ri-message-ai-3-line text-[12px]" />对话
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'conv' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'docs'"
              class="flex-1 h-[34px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors"
              :class="leftTab === 'docs'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <span class="flex items-center gap-1.5">
                <i class="ri-folder-2-line text-[12px]" />文档
              </span>
              <div class="h-[2px] w-[70%] rounded-full transition-all" :class="leftTab === 'docs' ? 'bg-brand-400' : 'bg-transparent'" />
            </button>
            <button @click="leftTab = 'kb'"
              class="flex-1 h-[34px] flex flex-col items-center justify-center gap-0.5 text-[12px] font-medium transition-colors"
              :class="leftTab === 'kb'
                ? (isDark ? 'text-wt-main' : 'text-lt-main')
                : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <span class="flex items-center gap-1.5">
                <i class="ri-database-2-line text-[12px]" />知识库
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
          @rename="onConvRename" @delete="deleteConv"
          @group-create="onGroupCreate" @group-rename="onGroupRename" @group-delete="onGroupDelete"
          @add-conv-to-group="createChat" />
        <DocumentSelector v-if="leftTab === 'docs'"
          :is-dark="isDark" :selected-docs="currentCtxItems"
          @toggle-doc="item => addCtxItem({ ...item, type: 'doc-toggle' })"
          @toggle-folder="item => addCtxItem({ ...item, type: 'doc-toggle' })" />
        <KbSelector v-if="leftTab === 'kb'"
          :is-dark="isDark"
          :selected-items="currentCtxItems.filter(i => i.type === 'cloud_kb' || i.type === 'cloud_doc')"
          @toggle-kb="addCtxItem"
          @toggle-doc="addCtxItem" />
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
                  class="tab-item h-[32px] w-[148px] sm:w-[164px] px-3 flex items-center gap-1.5 text-[12px] shrink-0 relative cursor-pointer rounded-t-lg transition-colors"
                  :class="activeTabId === tab.id
                    ? (isDark ? 'bg-d2 text-wt-main' : 'bg-l2 text-lt-main')
                    : (isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4')">
                  <i class="ri-message-ai-3-line text-[12px] shrink-0"
                    :class="activeTabId === tab.id ? 'text-brand-400' : (isDark ? 'text-wt-aux' : 'text-lt-aux')" />
                  <span class="truncate min-w-0">{{ convStore.titleTypewriterMap[tab.id] || tab.name }}</span>
                  <button @click.stop="closeTab(tab.id)"
                    class="tab-close ml-auto h-5 w-5 rounded flex items-center justify-center shrink-0"
                    :class="isDark ? 'hover:text-red-400' : 'hover:text-red-500'">
                    <i class="ri-close-line text-[14px]" />
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

          <div id="chat-scroll" ref="chatScrollRef" class="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 thin-scroll"
            @scroll="onChatScroll">
            <!-- Scroll loader for older messages -->
            <ScrollLoader v-if="currentConvId"
              :has-more="hasOlderMessages"
              :loading="loadingOlder"
              :is-dark="isDark"
              @load-more="loadOlderMessages" />
            <div v-if="currentMessages.length"
              ref="virtualListRef"
              class="relative w-full"
              :style="{ height: totalVirtualHeight + 'px' }">
              <div v-for="item in visibleVirtualMessages"
                :key="item.message.id"
                :ref="el => observeVirtualMessageRow(el, item.message.id)"
                class="absolute left-0 right-0 will-change-transform"
                :style="{ transform: `translateY(${item.top}px)` }">
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
                  @preview-file="handlePreviewFile"
                  @retry="handleRetry(item.message.id)"
                  @copy="handleCopy"
                  @delete="handleDeleteMessage(item.message.id)"
                  @save-edit="handleSaveEdit"
                  @compress-context="compressContext"
                  @auth-approve="handleAuthApprove"
                  @auth-deny="handleAuthDeny" />
              </div>
            </div>
            <!-- Empty states -->
            <EmptyStateHero v-if="!currentMessages.length"
              :has-conversation="currentConvId"
              :is-dark="isDark"
              :agents="allAgents"
              @create-conv="createChat"
              @select-agent="selectAgent" />
          </div>

          <!-- Scroll to bottom button -->
          <button v-if="showScrollBtn" @click="userScrolledUp = false; showScrollBtn = false; scrollToBottom()"
            class="absolute bottom-[180px] left-1/2 -translate-x-1/2 h-8 px-3 rounded-full flex items-center gap-1.5 text-[12px] font-medium z-10 transition-all duration-200 shadow-lg"
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
            @tool-action="handleBuiltinTool"
            @select-skill="handleSelectSkillCommand" />
        </template>
      </div>
    </main>

    <!-- ═══ Creation Config Modals ═══ -->
    <ResearchModal
      v-model:show="showResearchModal"
      :ctx-items="currentCtxItems"
      @start="handleResearchStart"
    />

    <PptModal
      v-model:show="showPptModal"
      :ctx-items="currentCtxItems"
      @start="handlePptStart"
    />

    <!-- Mindmap / Graph / Podcast (async generation tasks) -->
    <MindmapModal
      v-model:show="showMindmapModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <GraphModal
      v-model:show="showGraphModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <FlashcardModal
      v-model:show="showFlashcardModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <QuizModal
      v-model:show="showQuizModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <ChartModal
      v-model:show="showChartModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
    <PodcastModal
      v-model:show="showPodcastModal"
      :ctx-items="currentCtxItems"
      @submit="handleGenTaskSubmit"
    />
  </div>
</template>

<style scoped>
.tab-item .tab-close { opacity: 0; transition: opacity .12s }
.tab-item:hover .tab-close { opacity: 1 }
</style>
