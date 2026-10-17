import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'

/**
 * Tab management, conversation switching (with min-duration spinner),
 * and typewriter title animation.
 *
 * @param {object} convStore - Pinia conversations store
 * @param {object} currentConvId - computed ref to current conversation ID
 */
export function useChatTabs(convStore, currentConvId) {
  const msg = useMessage()

  const isConversationSwitching = ref(false)
  const switchingConvId = ref(null)
  const CONVERSATION_SWITCH_MIN_MS = 140
  const CONVERSATION_SWITCH_MAX_MS = 900
  let conversationSwitchToken = 0
  let conversationSwitchStartedAt = 0
  let conversationSwitchFinishTimer = null
  let conversationSwitchMaxTimer = null

const tabs = ref([])
const activeTabId = ref(null)
const tabAccessSeq = ref(0)
const tabScroller = ref(null)

function handleShortcutConversationActivate(event) {
  const conversationId = event?.detail?.conversationId
  if (!conversationId) return
  const conversation = convStore.conversations.find(item => item.id === conversationId)
  if (conversation) addTab(conversation)
}

function ensureConversationTab(conversationId) {
  if (!conversationId || tabs.value.some(tab => tab.id === conversationId)) return
  const conversation = convStore.conversations.find(item => item.id === conversationId)
  if (!conversation) return
  evictLeastRecentlyAccessedTab()
  tabs.value.unshift({ id: conversation.id, name: conversation.title, lastAccessed: nextTabAccessAt() })
  activeTabId.value = conversation.id
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

  onMounted(() => {
    window.addEventListener('mindspace:workchat-activate-conversation', handleShortcutConversationActivate)
    ensureConversationTab(currentConvId.value)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('mindspace:workchat-activate-conversation', handleShortcutConversationActivate)
    clearConversationSwitchTimers()
  })

  return {
    tabs,
    activeTabId,
    tabScroller,
    isConversationSwitching,
    switchingConvId,
    addTab,
    activateTab,
    closeTab,
    createChat,
    selectConv,
    deleteConv,
    onConvRename,
    ensureConversationTab,
    isTabConversationSwitching,
    switchToConversation,
    handleShortcutConversationActivate,
  }
}
