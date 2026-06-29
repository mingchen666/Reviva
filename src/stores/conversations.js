import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const dbConvs = () => window.electronAPI.db.convs
const dbConvGroups = () => window.electronAPI.db.convGroups
const dbMsgs = () => window.electronAPI.db.msgs

export const useConversationsStore = defineStore('conversations', () => {
  const conversations = ref([])
  const groups = ref([{ id: 'default', name: '默认分组', sortOrder: 0, createdAt: '' }])
  const currentConvId = ref(null)
  const currentGroupId = ref('default')
  const messages = ref({}) // { convId: [msg, ...] }
  const loaded = ref(false)

  // ─── Streaming state ───
  const streamingRuns = ref({}) // { convId: { runId, msgId, content, thinking, toolCalls, subAgents, todos, steps, iteration, usage, startTime } }
  const isStreaming = computed(() => Object.keys(streamingRuns.value).length > 0)
  const streamingConvId = computed(() => getStreamingState(currentConvId.value).convId)
  const streamingMsgId = computed(() => getStreamingState(currentConvId.value).msgId)
  const streamingContent = computed(() => getStreamingState(currentConvId.value).content)
  const streamingThinking = computed(() => getStreamingState(currentConvId.value).thinking)
  const streamingToolCalls = computed(() => getStreamingState(currentConvId.value).toolCalls)
  const streamingIteration = computed(() => getStreamingState(currentConvId.value).iteration)
  const streamingUsage = computed(() => getStreamingState(currentConvId.value).usage)
  const streamingStartTime = computed(() => getStreamingState(currentConvId.value).startTime)

  // ─── Agent run state ───
  const agentSteps = ref({}) // { convId: [step, ...] }
  const runState = ref('idle') // idle | running | completed | error | cancelled | compressing
  const isCompressing = ref(false)

  // ─── Title animation state ───
  const titleAnimation = ref(null) // { convId, newTitle } — signal for typewriter animation
  const titleTypewriterMap = ref({}) // { convId: displayedPartialTitle } — ongoing typewriter display

  // ─── Auth state ───
  const pendingAuthRequests = ref([]) // [{ requestId, convId, toolName, ... }]

  // ─── SubAgent streaming state ───
  const streamingSubAgents = computed(() => getStreamingState(currentConvId.value).subAgents)
  const streamingTodos = computed(() => getStreamingState(currentConvId.value).todos)

  // ─── Step streaming state (chronological rendering) ───
  const streamingSteps = computed(() => getStreamingState(currentConvId.value).steps)

  // ─── Pagination state ───
  const MSG_PAGE_SIZE = 30
  const msgsTotalCount = ref({}) // { convId: number }
  const allMsgsLoaded = ref({})  // { convId: boolean }

  const currentConv = computed(() =>
    conversations.value.find(c => c.id === currentConvId.value) || null
  )

  const currentMessages = computed(() =>
    messages.value[currentConvId.value] || []
  )

  // Get display title for a conversation (typewriter partial if animating, else actual title)
  function getDisplayTitle(convId) {
    return titleTypewriterMap.value[convId] || conversations.value.find(c => c.id === convId)?.title || ''
  }

  const conversationsByGroup = computed(() => {
    const map = {}
    for (const g of groups.value) {
      map[g.id] = conversations.value.filter(c => c.groupId === g.id)
    }
    const ungrouped = conversations.value.filter(c => !c.groupId)
    if (!map['default']) map['default'] = []
    map['default'] = [...(map['default'] || []), ...ungrouped]
    return map
  })

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      conversations.value = await dbConvs().list()
      groups.value = await dbConvGroups().list()
      if (!groups.value.find(g => g.id === 'default')) {
        groups.value.unshift({ id: 'default', name: '默认分组', sortOrder: 0, createdAt: '' })
      }
      loaded.value = true
    } catch (e) {
      console.error('Failed to load conversations from DB:', e)
    }
  }

  async function loadMessages(convId) {
    if (!window.electronAPI?.db) return
    try {
      // Paginated: load only the latest page
      const total = await dbMsgs().count(convId)
      msgsTotalCount.value[convId] = total
      const offset = Math.max(0, total - MSG_PAGE_SIZE)
      const msgs = await dbMsgs().listPaginated(convId, MSG_PAGE_SIZE, offset)
      messages.value[convId] = msgs
      allMsgsLoaded.value[convId] = msgs.length >= total
    } catch (e) {
      console.error('Failed to load messages:', e)
    }
  }

  async function loadMoreMessages(convId) {
    if (!window.electronAPI?.db || allMsgsLoaded.value[convId]) return
    try {
      const current = messages.value[convId] || []
      const loaded = current.length
      const total = msgsTotalCount.value[convId] || await dbMsgs().count(convId)
      msgsTotalCount.value[convId] = total
      const newOffset = Math.max(0, total - loaded - MSG_PAGE_SIZE)
      const limit = Math.min(MSG_PAGE_SIZE, total - loaded)
      if (limit <= 0) { allMsgsLoaded.value[convId] = true; return }
      const olderMsgs = await dbMsgs().listPaginated(convId, limit, newOffset)
      messages.value[convId] = [...olderMsgs, ...current]
      allMsgsLoaded.value[convId] = messages.value[convId].length >= total
    } catch (e) {
      console.error('Failed to load more messages:', e)
    }
  }

  async function createConv(data) {
    const convData = {
      title: data.title || '新对话',
      space_id: data.spaceId || data.space_id || '',
      agent_id: data.agentId || data.agent_id || '',
      architecture: data.architecture || '',
      model: data.model || '',
      group_id: data.groupId || data.group_id || 'default',
      context_length: data.contextLength || data.context_length || 0,
    }
    if (window.electronAPI?.db) {
      const result = await dbConvs().create(convData)
      await loadFromDb()
      messages.value[result.id] = []
      msgsTotalCount.value[result.id] = 0
      allMsgsLoaded.value[result.id] = true
      currentConvId.value = result.id
      return result
    }
    const fallback = {
      id: 'conv_' + Date.now(), ...convData,
      groupId: convData.group_id, contextLength: convData.context_length,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    conversations.value.unshift(fallback)
    messages.value[fallback.id] = []
    msgsTotalCount.value[fallback.id] = 0
    allMsgsLoaded.value[fallback.id] = true
    currentConvId.value = fallback.id
    return fallback
  }

  async function updateConv(id, data) {
    const mapped = {}
    if (data.title !== undefined) mapped.title = data.title
    if (data.spaceId !== undefined) mapped.space_id = data.spaceId
    if (data.agentId !== undefined) mapped.agent_id = data.agentId
    if (data.architecture !== undefined) mapped.architecture = data.architecture
    if (data.model !== undefined) mapped.model = data.model
    if (data.groupId !== undefined) mapped.group_id = data.groupId
    if (data.contextLength !== undefined) mapped.context_length = data.contextLength
    for (const [k, v] of Object.entries(data)) {
      if (!mapped[k] && k.includes('_')) mapped[k] = v
    }
    if (window.electronAPI?.db) {
      await dbConvs().update(id, mapped)
      await loadFromDb()
    }
    const conv = conversations.value.find(c => c.id === id)
    if (conv) Object.assign(conv, data)
  }

  async function deleteConv(id) {
    // Soft delete: route through recycleBin store so its items array updates reactively
    if (window.electronAPI?.recycleBin) {
      const { useRecycleBinStore } = await import('./recycleBin')
      await useRecycleBinStore().trashConversation(id)
    } else if (window.electronAPI?.db) {
      await dbConvs().delete(id)
    }
    conversations.value = conversations.value.filter(c => c.id !== id)
    delete messages.value[id]
    delete msgsTotalCount.value[id]
    delete allMsgsLoaded.value[id]
    if (currentConvId.value === id) {
      currentConvId.value = conversations.value[0]?.id || null
    }
  }

  async function addMessage(convId, data) {
    const msgData = {
      conversation_id: convId,
      role: data.role || 'user',
      content: data.content || '',
      meta: data.meta || {},
      status: data.status || 'completed',
      model_id: data.model_id || data.modelId || '',
      provider_id: data.provider_id || data.providerId || '',
    }
    if (window.electronAPI?.db) {
      const result = await dbMsgs().create(msgData)
      if (!messages.value[convId]) messages.value[convId] = []
      messages.value[convId].push(result)
      msgsTotalCount.value[convId] = (msgsTotalCount.value[convId] || 0) + 1
      return result
    }
    const msg = {
      id: 'msg_' + Date.now(),
      conversationId: convId,
      role: msgData.role,
      content: msgData.content,
      meta: msgData.meta,
      status: msgData.status,
      modelId: msgData.model_id,
      providerId: msgData.provider_id,
      createdAt: new Date().toISOString(),
    }
    if (!messages.value[convId]) messages.value[convId] = []
    messages.value[convId].push(msg)
    return msg
  }

  async function updateMessage(convId, msgId, patch = {}) {
    const msgs = messages.value[convId] || []
    const msg = msgs.find(m => m.id === msgId)
    if (!msg) return null

    const dbData = {}
    if (patch.content !== undefined) dbData.content = patch.content
    if (patch.meta !== undefined) dbData.meta = patch.meta
    if (patch.status !== undefined) dbData.status = patch.status
    if (patch.errorMessage !== undefined) dbData.error_message = patch.errorMessage
    if (patch.errorCode !== undefined) dbData.error_code = patch.errorCode

    if (window.electronAPI?.db && Object.keys(dbData).length) {
      await dbMsgs().update(msgId, dbData)
    }

    Object.assign(msg, patch)
    return msg
  }

  function setCurrentConv(id) {
    currentConvId.value = id
    if (id && !messages.value[id]) {
      loadMessages(id)
    }
  }

  async function createGroup(data) {
    if (window.electronAPI?.db) {
      await dbConvGroups().create({ name: data.name || '新分组', sort_order: data.sortOrder || 0 })
      await loadFromDb()
      return groups.value[groups.value.length - 1]
    }
    const fallback = { id: 'grp_' + Date.now(), name: data.name || '新分组', sortOrder: 0, createdAt: '' }
    groups.value.push(fallback)
    return fallback
  }

  async function updateGroup(id, data) {
    const mapped = {}
    if (data.name !== undefined) mapped.name = data.name
    if (data.sortOrder !== undefined) mapped.sort_order = data.sortOrder
    if (window.electronAPI?.db) {
      await dbConvGroups().update(id, mapped)
      await loadFromDb()
    }
    const group = groups.value.find(g => g.id === id)
    if (group) Object.assign(group, data)
  }

  async function deleteGroup(id) {
    if (id === 'default') return
    if (window.electronAPI?.db) {
      await dbConvGroups().delete(id)
      await loadFromDb()
    }
    groups.value = groups.value.filter(g => g.id !== id)
    conversations.value.forEach(c => {
      if (c.groupId === id) c.groupId = 'default'
    })
  }

  // ─── Streaming methods ───
  const emptyStreamingState = Object.freeze({
    convId: null,
    runId: null,
    msgId: null,
    content: '',
    thinking: '',
    toolCalls: {},
    subAgents: {},
    todos: [],
    steps: [],
    iteration: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    startTime: null,
    active: false,
  })

  const streamingBuffers = new Map()
  const flushTimers = new Map()

  function getStreamingState(convId) {
    if (!convId) return emptyStreamingState
    return streamingRuns.value[convId] || emptyStreamingState
  }

  function isConvStreaming(convId) {
    return !!(convId && streamingRuns.value[convId])
  }

  function getStreamingStateByRunId(runId) {
    if (!runId) return emptyStreamingState
    return Object.values(streamingRuns.value).find(run => run.runId === runId) || emptyStreamingState
  }

  function findStreamingConvIdByRunId(runId) {
    if (!runId) return null
    return Object.keys(streamingRuns.value).find(convId => streamingRuns.value[convId]?.runId === runId) || null
  }

  function _ensureStreamingRun(convId, msgId = '', runId = '') {
    if (!convId) return null
    if (!streamingRuns.value[convId]) {
      streamingRuns.value[convId] = {
        convId,
        runId: runId || null,
        msgId: msgId || null,
        content: '',
        thinking: '',
        toolCalls: {},
        subAgents: {},
        todos: [],
        steps: [],
        iteration: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
        startTime: Date.now(),
        active: true,
      }
    }
    return streamingRuns.value[convId]
  }

  function _patchStreamingRun(convId, patch = {}) {
    if (!convId || !streamingRuns.value[convId]) return null
    streamingRuns.value[convId] = { ...streamingRuns.value[convId], ...patch }
    return streamingRuns.value[convId]
  }

  function startStreaming(convId, placeholder, runId = '') {
    streamingRuns.value[convId] = {
      convId,
      runId: runId || null,
      msgId: placeholder.id,
      content: '',
      thinking: '',
      toolCalls: {},
      subAgents: {},
      todos: [],
      steps: [],
      iteration: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      startTime: Date.now(),
      active: true,
    }
    streamingBuffers.set(convId, '')
    const timer = flushTimers.get(convId)
    if (timer) clearTimeout(timer)
    flushTimers.delete(convId)
  }

  function setStreamingMsgId(convId, msgId) {
    _patchStreamingRun(convId, { msgId })
  }

  // Streaming content buffer — batch updates to reduce Vue reactivity overhead
  function flushStreamingBuffer(convId) {
    const buffer = streamingBuffers.get(convId) || ''
    if (buffer) {
      const run = getStreamingState(convId)
      const content = (run.content || '') + buffer
      streamingBuffers.set(convId, '')
      _patchStreamingRun(convId, { content })
      const msgs = messages.value[convId]
      if (msgs) {
        const msg = msgs.find(m => m.id === run.msgId)
        if (msg) {
          msg.content = content
          msg.status = 'streaming'
        }
      }
    }
    flushTimers.delete(convId)
  }

  function appendToStreamingMsg(text, convId = currentConvId.value) {
    if (!convId || !streamingRuns.value[convId]) return
    streamingBuffers.set(convId, (streamingBuffers.get(convId) || '') + text)
    if (!flushTimers.get(convId)) {
      flushTimers.set(convId, setTimeout(() => flushStreamingBuffer(convId), 80))
    }
  }

  function appendToStreamingThinking(text, convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active) return
    const thinking = (run.thinking || '') + text
    _patchStreamingRun(convId, { thinking })
    const msgs = messages.value[convId]
    if (msgs) {
      const msg = msgs.find(m => m.id === run.msgId)
      if (msg) msg.thinkingContent = thinking
    }
  }

  function updateStreamingUsage(usage, convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active) return
    if (usage) {
      _patchStreamingRun(convId, {
        usage: {
          inputTokens: usage.inputTokens || run.usage.inputTokens,
          outputTokens: usage.outputTokens || run.usage.outputTokens,
        },
      })
    }
  }

  // ─── Tool call methods ───
  function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
  }

  function isMeaningfulToolName(name) {
    const value = String(name || '').trim()
    return !!value && value !== 'tool' && !isUuidLike(value)
  }

  function pickToolName(currentName, nextName) {
    if (isMeaningfulToolName(currentName)) return currentName
    if (isMeaningfulToolName(nextName)) return nextName
    return currentName || nextName || ''
  }

  function normalizeToolText(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try { return JSON.stringify(value) } catch { return String(value) }
  }

  function extractSkillFrontmatterName(value) {
    const text = normalizeToolText(value)
    if (!text.includes('name:')) return ''
    const normalized = text.replace(/\\n/g, '\n').replace(/\r/g, '\n')
    const multiline = normalized.match(/(?:^|\n)---\s*\n\s*name:\s*([^\n]+)/i)
    if (multiline?.[1]) return multiline[1].trim().replace(/^["']|["']$/g, '')
    const compact = normalized.match(/---\s*name:\s*([^,\n]+?)(?:\s+description:|\s+instructions:|\s+[a-z_-]+:|$)/i)
    return compact?.[1]?.trim().replace(/^["']|["']$/g, '') || ''
  }

  function resolveToolStatus(current, live) {
    if (current?.status === 'error' || live?.status === 'error') return 'error'
    if (current?.status === 'completed' || live?.status === 'completed' || current?.result || live?.result) return 'completed'
    return live?.status || current?.status || 'running'
  }

  function mergeToolCall(current, live) {
    if (!live) {
      if (current?.result && current.status === 'running') return { ...current, status: 'completed' }
      return current
    }
    return {
      ...current,
      ...live,
      name: pickToolName(current?.name, live?.name),
      status: resolveToolStatus(current, live),
      input: live.input || current?.input || '',
      result: live.result || current?.result || '',
    }
  }

  function addStreamingToolCall(toolId, toolName, input = '', convId = currentConvId.value) {
    if (!toolId) return
    const run = getStreamingState(convId)
    if (!run.active) return
    const toolCalls = { ...run.toolCalls }
    const existing = toolCalls[toolId]
    const inputText = normalizeToolText(input)
    if (existing) {
      const terminal = existing.status === 'completed' || existing.status === 'error'
      toolCalls[toolId] = {
        ...existing,
        name: pickToolName(existing.name, toolName),
        status: terminal ? existing.status : 'running',
        input: existing.input || inputText,
      }
      _patchStreamingRun(convId, { toolCalls })
      return
    }
    toolCalls[toolId] = { id: toolId, name: toolName || '', status: 'running', input: inputText, result: '' }
    _patchStreamingRun(convId, { toolCalls })
  }

  function appendStreamingToolInput(toolId, partialInput, convId = currentConvId.value) {
    if (!toolId) return
    const run = getStreamingState(convId)
    if (!run.active) return
    if (!run.toolCalls[toolId]) addStreamingToolCall(toolId, '', '', convId)
    const latest = getStreamingState(convId)
    const toolCalls = { ...latest.toolCalls }
    const inputText = normalizeToolText(partialInput)
    toolCalls[toolId] = { ...toolCalls[toolId], input: (toolCalls[toolId]?.input || '') + inputText }
    const skillName = extractSkillFrontmatterName(toolCalls[toolId].input)
    if (skillName && !isMeaningfulToolName(toolCalls[toolId].name)) {
      toolCalls[toolId].name = `skill:${skillName}`
    }
    _patchStreamingRun(convId, { toolCalls })
  }

  function completeStreamingToolCall(toolId, result, convId = currentConvId.value) {
    if (!toolId) return
    const run = getStreamingState(convId)
    if (!run.active) return
    if (!run.toolCalls[toolId]) addStreamingToolCall(toolId, '', '', convId)
    const latest = getStreamingState(convId)
    const toolCalls = { ...latest.toolCalls }
    toolCalls[toolId] = {
      ...toolCalls[toolId],
      status: 'completed',
      result: normalizeToolText(result),
    }
    const skillName = extractSkillFrontmatterName(toolCalls[toolId].result || toolCalls[toolId].input)
    if (skillName && !isMeaningfulToolName(toolCalls[toolId].name)) {
      toolCalls[toolId].name = `skill:${skillName}`
    }
    _patchStreamingRun(convId, { toolCalls })
  }

  function errorStreamingToolCall(toolId, error = '', convId = currentConvId.value) {
    if (!toolId) return
    const run = getStreamingState(convId)
    if (!run.active) return
    if (!run.toolCalls[toolId]) addStreamingToolCall(toolId, '', '', convId)
    const latest = getStreamingState(convId)
    const toolCalls = { ...latest.toolCalls }
    toolCalls[toolId] = {
      ...toolCalls[toolId],
      status: 'error',
      result: normalizeToolText(error) || toolCalls[toolId]?.result || '',
    }
    _patchStreamingRun(convId, { toolCalls })
  }

  // ─── SubAgent streaming methods ───
  function addStreamingSubAgent(subRunId, name, task, convId = currentConvId.value) {
    if (!subRunId || (!name && !task)) return
    const run = getStreamingState(convId)
    if (!run.active) return
    _patchStreamingRun(convId, {
      subAgents: {
        ...run.subAgents,
        [subRunId]: { id: subRunId, subRunId, name, status: 'running', task, result: '' },
      },
    })
  }

  function updateStreamingSubAgent(subRunId, text, name = '', convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active) return
    const subAgents = { ...run.subAgents }
    let target = subAgents[subRunId]
    if (!target) {
      const running = Object.values(subAgents).filter(sa => sa.status === 'running' && !isUuidLike(sa.name))
      if (running.length === 1) {
        target = running[0]
      } else {
        return
      }
    }
    const textValue = normalizeToolText(text)
    if (extractSkillFrontmatterName(textValue)) return
    subAgents[target.subRunId || subRunId] = { ...target, result: (target.result || '') + textValue }
    _patchStreamingRun(convId, { subAgents })
  }

  function completeStreamingSubAgent(subRunId, result, convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active || !run.subAgents[subRunId]) return
    _patchStreamingRun(convId, {
      subAgents: {
        ...run.subAgents,
        [subRunId]: { ...run.subAgents[subRunId], status: 'completed', result: result || run.subAgents[subRunId].result },
      },
    })
  }

  function errorStreamingSubAgent(subRunId, error, convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active || !run.subAgents[subRunId]) return
    _patchStreamingRun(convId, {
      subAgents: {
        ...run.subAgents,
        [subRunId]: { ...run.subAgents[subRunId], status: 'error', error: error || '' },
      },
    })
  }

  function updateStreamingTodos(todos, convId = currentConvId.value) {
    if (!getStreamingState(convId).active) return
    _patchStreamingRun(convId, { todos: Array.isArray(todos) ? todos : [] })
  }

  // ─── Step streaming methods ───
  function addStreamingStep(step, index, convId = currentConvId.value) {
    const run = getStreamingState(convId)
    if (!run.active) return
    const steps = [...run.steps]
    if (index < steps.length) {
      // Use splice to trigger Vue reactivity on array element replacement
      steps.splice(index, 1, step)
    } else {
      steps.push(step)
    }
    _patchStreamingRun(convId, { steps })
  }

  // ─── Agent run state methods ───

  function setRunState(state) {
    runState.value = state
  }

  function setStreamingIteration(iteration, convId = currentConvId.value) {
    if (!getStreamingState(convId).active) return
    _patchStreamingRun(convId, { iteration })
  }

  function setIsCompressing(val) {
    isCompressing.value = val
  }

  function addAgentStep(convId, step) {
    if (!agentSteps.value[convId]) agentSteps.value[convId] = []
    agentSteps.value[convId].push(step)
  }

  function clearAgentSteps(convId) {
    agentSteps.value[convId] = []
  }

  // ─── Auth methods ───
  function addAuthRequest(request) {
    // Prevent duplicate auth requests with the same requestId
    if (!pendingAuthRequests.value.some(r => r.requestId === request.requestId)) {
      pendingAuthRequests.value.push(request)
    }
  }

  function removeAuthRequest(requestId) {
    pendingAuthRequests.value = pendingAuthRequests.value.filter(r => r.requestId !== requestId)
  }

  function getPendingAuthRequestsForMessage(convId, msgId) {
    return pendingAuthRequests.value.filter(r =>
      (!convId || !r.convId || r.convId === convId) &&
      (!msgId || !r.msgId || r.msgId === msgId)
    )
  }

  function finalizeStreamingMsg(data) {
    const convId = data.convId || findStreamingConvIdByRunId(data.runId) || currentConvId.value
    const run = getStreamingState(convId)
    const active = run.active
    if (active) flushStreamingBuffer(convId)
    const finalRun = active ? getStreamingState(convId) : run
    const msgs = messages.value[convId]
    const finalContent = active ? finalRun.content : ''
    const finalThinking = active ? finalRun.thinking : ''
    let msg = null
    if (msgs) {
      msg = msgs.find(m => m.id === data.msgId)
      if (msg) {
        // data.content (from IPC) is authoritative; streamingContent is fallback
        const resolvedContent = data.content || finalContent || msg.content || ''
        // Set content for completed and cancelled messages
        if (data.status === 'completed' || data.status === 'cancelled') {
          msg.content = resolvedContent
        }
        msg.status = data.status
        msg.errorMessage = data.status === 'error' ? (data.errorMessage || '') : ''
        msg.errorCode = data.status === 'error' ? (data.errorCode || '') : ''
        if (data.usage) {
          msg.inputTokens = data.usage.inputTokens || 0
          msg.outputTokens = data.usage.outputTokens || 0
          msg.cacheReadTokens = data.usage.cacheReadTokens || 0
          msg.cacheWriteTokens = data.usage.cacheWriteTokens || 0
          msg.thinkingTokens = data.usage.thinkingTokens || 0
        }
        msg.latencyMs = data.latencyMs || 0
        msg.cost = data.cost || 0
        if (data.thinkingContent) msg.thinkingContent = data.thinkingContent
        else if (finalThinking) msg.thinkingContent = finalThinking
        // Persist tool calls from streaming into message meta
        const toolCallsArr = active ? Object.values(finalRun.toolCalls) : []
        if (toolCallsArr.length) {
          if (!msg.meta) msg.meta = {}
          msg.meta.toolCalls = toolCallsArr
        }
        // Persist subAgents from streaming into message meta
        const subAgentsArr = active ? Object.values(finalRun.subAgents) : []
        if (subAgentsArr.length) {
          if (!msg.meta) msg.meta = {}
          msg.meta.subAgents = subAgentsArr
        }
        const todosArr = active && finalRun.todos.length ? finalRun.todos : (data.todos || [])
        if (todosArr.length) {
          if (!msg.meta) msg.meta = {}
          msg.meta.todos = todosArr
        }
        // Persist steps into message meta — primary source for chronological rendering
        // Prefer streamingSteps (has ALL steps including from interrupt+resume runs) over data.steps (may only have resumed portion)
        // Merge streamingToolCalls into steps for accurate final status (e.g., write_file after auth approval)
        const liveSteps = active ? finalRun.steps : []
        const stepsSource = liveSteps.length >= (data.steps?.length || 0) ? liveSteps : (data.steps || liveSteps)
        if (stepsSource?.length) {
          // Merge streamingToolCalls status into step tool calls for final storage
          const liveCalls = active ? finalRun.toolCalls : {}
          const mergedSteps = stepsSource.map(step => {
            if (!step.toolCalls?.length) return step
            const mergedCalls = step.toolCalls.map(tc => {
              const live = liveCalls[tc.id]
              return mergeToolCall(tc, live)
            })
            return { ...step, toolCalls: mergedCalls }
          })
          if (!msg.meta) msg.meta = {}
          msg.meta.steps = mergedSteps
        }
        // Persist agent steps into message meta
        const steps = agentSteps.value[convId]
        if (steps?.length) {
          if (!msg.meta) msg.meta = {}
          msg.meta.agentSteps = steps
        }
        // ── Extract kbSources / webSources from tool call results ──
        const allToolCalls = toolCallsArr.length ? toolCallsArr
          : (stepsSource?.length ? stepsSource.flatMap(s => s.toolCalls || []) : [])
        const kbSources = []
        const seenKbSourceKeys = new Set()
        let kbRefIdx = 1
        for (const tc of allToolCalls) {
          if (!tc.result) continue
          let parsed = null
          try { parsed = JSON.parse(tc.result) } catch (_) { continue }
          // kb_search tool
          if (tc.name === 'kb_search' && parsed.status === 'ok' && parsed.result) {
            const hits = parsed.result.items || parsed.result.hits || parsed.result.chunks || parsed.result.results || []
            const scopeName = parsed.scope?.kb_name || parsed.scope?.name || ''
            for (const hit of hits) {
              if (!hit) continue
              const docName = hit.document_name || hit.doc_name || hit.source || hit.title || hit.metadata?.document_name || scopeName
              const snippet = hit.content || hit.text || hit.snippet || hit.chunk || ''
              const documentId = hit.metadata?.document_id || ''
              const dedupeKey = [
                documentId,
                docName,
                String(snippet).replace(/\s+/g, ' ').trim().slice(0, 240),
              ].join('|').toLowerCase()
              if (seenKbSourceKeys.has(dedupeKey)) continue
              seenKbSourceKeys.add(dedupeKey)
              kbSources.push({
                refId: kbRefIdx++,
                docName,
                score: hit.score ?? hit.relevance_score ?? 0,
                snippet,
                recallType: hit.recall_type || '',
                documentId,
              })
            }
          }
          }
        if (kbSources.length) {
          if (!msg.meta) msg.meta = {}
          msg.meta.kbSources = kbSources
        }
      }
    }
    if (active) {
      const timer = flushTimers.get(convId)
      if (timer) clearTimeout(timer)
      flushTimers.delete(convId)
      streamingBuffers.delete(convId)
      const nextRuns = { ...streamingRuns.value }
      delete nextRuns[convId]
      streamingRuns.value = nextRuns
    }
    runState.value = 'idle'
    // Update message in DB
    if (data.msgId && window.electronAPI?.db) {
      const dbData = { status: data.status }
      const persistedContent = data.content || finalContent || msg?.content || ''
      if (data.status === 'completed' || data.status === 'cancelled') dbData.content = persistedContent
      if (data.status === 'error') {
        // Persist partial content even on error
        if (persistedContent) dbData.content = persistedContent
        if (data.errorMessage) dbData.error_message = data.errorMessage
        if (data.errorCode) dbData.error_code = data.errorCode
      }
      if (data.usage) {
        dbData.input_tokens = data.usage.inputTokens || 0
        dbData.output_tokens = data.usage.outputTokens || 0
        dbData.cache_read_tokens = data.usage.cacheReadTokens || 0
        dbData.cache_write_tokens = data.usage.cacheWriteTokens || 0
        dbData.thinking_tokens = data.usage.thinkingTokens || 0
      }
      if (data.latencyMs) dbData.latency_ms = data.latencyMs
      if (data.cost) dbData.cost = data.cost
      if (data.thinkingContent || finalThinking) dbData.thinking_content = data.thinkingContent || finalThinking
      // Persist intermediate process steps to DB via meta field
      // This ensures tool calls, subagents, auth decisions, and iteration steps survive page reloads
      // Must deep-clone to strip Vue reactive proxies before IPC serialization
      if (msg?.meta && Object.keys(msg.meta).length) {
        try {
          dbData.meta = JSON.parse(JSON.stringify(msg.meta))
        } catch (e) {
          console.error('[ConversationsStore] Failed to serialize meta:', e)
        }
      }
      dbMsgs().update(data.msgId, dbData).catch((e) => { console.error('[ConversationsStore] DB update failed:', e) })
    }
  }

  async function deleteMessage(convId, msgId) {
    if (window.electronAPI?.db) {
      await dbMsgs().delete(msgId)
    }
    const msgs = messages.value[convId]
    if (msgs) {
      messages.value[convId] = msgs.filter(m => m.id !== msgId)
      msgsTotalCount.value[convId] = Math.max(0, (msgsTotalCount.value[convId] || 0) - 1)
    }
  }

  async function clearMessages(convId) {
    if (!convId) return
    const msgs = messages.value[convId] || []
    if (window.electronAPI?.db) {
      for (const m of msgs) {
        await dbMsgs().delete(m.id)
      }
    }
    messages.value[convId] = []
    msgsTotalCount.value[convId] = 0
    allMsgsLoaded.value[convId] = true
  }

  return {
    conversations, groups, currentConvId, currentGroupId, messages, loaded,
    currentConv, currentMessages, conversationsByGroup,
    streamingRuns, streamingConvId, streamingMsgId, streamingContent, streamingThinking, isStreaming, streamingToolCalls,
    streamingIteration, streamingUsage, streamingStartTime, agentSteps, runState, isCompressing,
    msgsTotalCount, allMsgsLoaded,
    pendingAuthRequests,
    streamingSubAgents, streamingTodos,
    streamingSteps,
    loadFromDb, loadMessages, loadMoreMessages, createConv, updateConv, deleteConv,
    addMessage, updateMessage, setCurrentConv,
    createGroup, updateGroup, deleteGroup,
    getStreamingState, getStreamingStateByRunId, isConvStreaming,
    startStreaming, setStreamingMsgId, appendToStreamingMsg, appendToStreamingThinking, updateStreamingUsage,
    addStreamingToolCall, appendStreamingToolInput, completeStreamingToolCall, errorStreamingToolCall,
    addStreamingSubAgent, updateStreamingSubAgent, completeStreamingSubAgent, errorStreamingSubAgent, updateStreamingTodos,
    addStreamingStep,
    setRunState, setStreamingIteration, setIsCompressing, addAgentStep, clearAgentSteps,
    addAuthRequest, removeAuthRequest, getPendingAuthRequestsForMessage,
    titleAnimation, titleTypewriterMap, getDisplayTitle,
    finalizeStreamingMsg, deleteMessage, clearMessages,
  }
}, {
  persist: {
    pick: ['currentConvId', 'currentGroupId'],
  },
})
