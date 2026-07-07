import { ToolMessage } from '@langchain/core/messages'
import { UNLIMITED_RECURSION_LIMIT } from './constants.js'
import { normalizeTodos } from '../messages/messageAdapters.js'

/**
 * Iterate DeepAgent stream using agent.stream() — reliable single-loop approach
 * Processes all events (messages, updates) in one for-await loop, no hanging projections
 * Tracks steps per iteration for chronological rendering (thinking → tool calls → text)
 */
export async function iterateDeepStream(agent, input, config, sendFn, channelPrefix, offsets = {}) {
  const stepIndexOffset = offsets.stepIndex || 0
  const iterationOffset = offsets.iteration || 0
  let fullContent = ''
  let thinkingContent = ''
  let chunkCount = 0
  let iteration = 0
  let lastNodeName = ''
  let totalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
  let latestTodos = []
  const activeSubagents = new Map()
  const activeToolCalls = new Map() // toolCallId → { name, input, result, iteration }
  const emittedToolStarts = new Set()
  const emittedToolResults = new Set()
  const toolChunkIdsByIndex = new Map()

  // ── Step tracking: group events by iteration, include content per step ──
  const steps = []
  let currentStep = { iteration: 0, thinking: '', content: '', toolCalls: [] }
  let stepInitialized = false
  let stepContentStart = 0 // Position in fullContent at start of this step

  function closeStep() {
    if (stepInitialized && (currentStep.thinking || currentStep.toolCalls.length || (fullContent.length > stepContentStart))) {
      // Extract content produced in this iteration
      currentStep.content = fullContent.slice(stepContentStart)
      // Finalize tool calls in this step: sync input/result/status from activeToolCalls
      for (const tc of currentStep.toolCalls) {
        const tracked = activeToolCalls.get(tc.id)
        if (tracked) {
          tc.input = tracked.input
          tc.result = tracked.result || ''
          tc.status = tracked.result ? 'completed' : (tracked.input ? 'running' : 'running')
        }
      }
      steps.push({ ...currentStep, toolCalls: [...currentStep.toolCalls] })
      // Send completed step to renderer for re-rendering (with offset for resumed runs)
      sendFn({ type: 'step', step: { ...currentStep, content: currentStep.content, toolCalls: [...currentStep.toolCalls] }, index: steps.length - 1 + stepIndexOffset })
    }
  }

  function startStep(iter) {
    closeStep()
    stepContentStart = fullContent.length
    currentStep = { iteration: iter, thinking: '', content: '', toolCalls: [] }
    stepInitialized = true
  }

  // Send an incremental step update during streaming (after tool results, etc.)
  function sendStepUpdate() {
    if (!stepInitialized) return
    const stepIndex = steps.length + stepIndexOffset // Current step is not yet in steps array
    sendFn({
      type: 'step',
      step: { ...currentStep, content: fullContent.slice(stepContentStart), toolCalls: [...currentStep.toolCalls] },
      index: stepIndex,
    })
  }

  function sendTodos(payload) {
    const todos = normalizeTodos(payload)
    if (!todos.length) return false
    latestTodos = todos
    sendFn({ type: 'todos', todos })
    return true
  }

  function stringifyToolArgs(args) {
    if (args == null) return ''
    if (typeof args === 'string') return args
    try { return JSON.stringify(args) } catch { return String(args) }
  }

  function trackToolCall(toolCallId, name, args = '') {
    if (!toolCallId || !name) return null
    const inputText = stringifyToolArgs(args)
    let tracked = activeToolCalls.get(toolCallId)
    if (!tracked) {
      tracked = { name, input: inputText, result: '', iteration }
      activeToolCalls.set(toolCallId, tracked)
    } else {
      tracked.name = tracked.name || name
      if (!tracked.input && inputText) tracked.input = inputText
    }

    let stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
    if (!stepTc) {
      stepTc = { id: toolCallId, name: tracked.name, status: 'running', input: tracked.input || '', result: tracked.result || '' }
      currentStep.toolCalls.push(stepTc)
    } else {
      stepTc.name = stepTc.name || tracked.name
      if (!stepTc.input && tracked.input) stepTc.input = tracked.input
    }

    if (!emittedToolStarts.has(toolCallId)) {
      emittedToolStarts.add(toolCallId)
      sendFn({ type: 'tool_start', toolId: toolCallId, toolName: tracked.name, input: tracked.input || '' })
    }
    return tracked
  }

  let recursionHit = false

  console.log('[AgentService] Starting agent.stream()...')
  const stream = await agent.stream(input, {
    configurable: config.configurable,
    signal: config.signal,
    streamMode: ['messages', 'updates', 'custom'],
    subgraphs: true,
    recursionLimit: config.recursionLimit ?? UNLIMITED_RECURSION_LIMIT,
  })

  try {
  for await (const event of stream) {
    if (config.signal?.aborted) break

    const hasNamespace = Array.isArray(event[0])
    const namespace = hasNamespace ? event[0] : []
    const mode = hasNamespace ? event[1] : event[0]
    const data = hasNamespace ? event[2] : event[1]

    const toolNamespace = Array.isArray(namespace) ? namespace.find(s => typeof s === 'string' && s.startsWith('tools:')) : ''
    const toolNamespaceId = toolNamespace ? toolNamespace.split(':')[1] : ''
    const isSubagent = !!toolNamespaceId && activeSubagents.has(toolNamespaceId)

    // Initialize step 0 on first content-bearing event
    if (!stepInitialized) startStep(0)

    if (mode === 'messages') {
      const [message] = data
      if (!message) continue

      // Subagent text
      if (isSubagent && message.text) {
        const subInfo = activeSubagents.get(toolNamespaceId)
        sendFn({ type: 'subagent_chunk', subRunId: toolNamespaceId, name: subInfo?.name || 'subagent', text: message.text })
      }

      // Coordinator text (only from the main graph's final response).
      // DeepAgents also streams built-in tool internals under tools:<id>; do not surface those as assistant text.
      if (!toolNamespace && message.text && !message.tool_call_chunks?.length) {
        chunkCount++
        fullContent += message.text
        sendFn({ type: 'content', text: message.text })
      }

      // Thinking/reasoning blocks (Anthropic extended thinking + LangChain normalized reasoning)
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if ((block.type === 'thinking' && block.thinking) || (block.type === 'reasoning' && block.reasoning)) {
            const thinkingText = block.type === 'reasoning' ? block.reasoning : block.thinking
            thinkingContent += thinkingText
            currentStep.thinking += thinkingText
            sendFn({ type: 'thinking', text: thinkingText })
          }
        }
      }
      // DeepSeek / OpenAI reasoning: reasoning_content in additional_kwargs
      const reasoningKwargs = message.additional_kwargs?.reasoning_content
      if (typeof reasoningKwargs === 'string' && reasoningKwargs.length > 0) {
        thinkingContent += reasoningKwargs
        currentStep.thinking += reasoningKwargs
        sendFn({ type: 'thinking', text: reasoningKwargs })
      }
      // Capture reasoning tokens from output_token_details
      if (message.usage_metadata?.output_token_details?.reasoning) {
        totalUsage.thinkingTokens += message.usage_metadata.output_token_details.reasoning
      }

      // Tool call chunks
      if (message.tool_call_chunks?.length) {
        for (const tc of message.tool_call_chunks) {
          const sourceKey = Array.isArray(namespace) ? namespace.join('|') : 'main'
          const chunkKey = `${sourceKey}:${tc.index ?? 0}`
          const toolCallId = tc.id || toolChunkIdsByIndex.get(chunkKey)
          if (tc.id) toolChunkIdsByIndex.set(chunkKey, tc.id)

          if (tc.name === 'task') {
            try {
              const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args || {})
              const subName = args.subagent_type || args.name || 'general-purpose'
              const taskDesc = args.description || args.task || ''
              activeSubagents.set(tc.id, { name: subName, description: taskDesc })
              sendFn({ type: 'subagent_start', subRunId: tc.id, name: subName, task: taskDesc })
            } catch { /* args may stream incrementally */ }
          } else if (tc.name) {
            // Track tool call in current step
            trackToolCall(toolCallId, tc.name)
          }
          if (toolCallId && tc.args && tc.name !== 'task') {
            // Accumulate tool input
            const tracked = activeToolCalls.get(toolCallId)
            if (tracked) tracked.input += tc.args
            if (tracked?.name === 'write_todos') sendTodos(tracked.input)
            // Also update the step's tool call item so it has input when sent via step events
            const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
            if (stepTc && tracked) stepTc.input = tracked.input
            sendFn({ type: 'tool_input', toolId: toolCallId, partialInput: tc.args })
          }
        }
      }

      // Tool messages (results)
      if (ToolMessage.isInstance(message) || message?.type === 'tool') {
        const toolCallId = message.tool_call_id || message.toolCallId || ''
        if (toolCallId && emittedToolResults.has(toolCallId)) continue
        if (toolCallId) emittedToolResults.add(toolCallId)
        const isTaskResult = activeSubagents.has(toolCallId)

        if (isTaskResult) {
          const subInfo = activeSubagents.get(toolCallId)
          const resultText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
          sendFn({ type: message.isError ? 'subagent_error' : 'subagent_end', subRunId: toolCallId, name: subInfo.name, result: resultText })
          activeSubagents.delete(toolCallId)
        } else {
          // Track tool result
          let tracked = activeToolCalls.get(toolCallId)
          if (!tracked && toolCallId) {
            tracked = trackToolCall(toolCallId, message.name || 'tool')
          }
          const resultText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
          if (tracked?.name === 'write_todos' && !sendTodos(resultText)) sendTodos(tracked.input)
          if (tracked) {
            tracked.result = resultText
            // Update the tool call in current step
            const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
            if (stepTc) { stepTc.result = resultText; stepTc.status = message.isError ? 'error' : 'completed' }
          }
          sendFn({ type: message.isError ? 'tool_error' : 'tool_end', toolId: toolCallId, result: resultText })
          // Send incremental step update so renderer sees the completed tool call
          sendStepUpdate()
        }
      }
    }

    if (mode === 'updates') {
      for (const [nodeName, nodeData] of Object.entries(data || {})) {
        sendTodos(nodeData?.todos || nodeData?.values?.todos)
        // Track iterations: each model_request = new iteration → new step
        if (!toolNamespace && (nodeName === 'model_request' || nodeName === 'agent') && nodeName !== lastNodeName) {
          if (lastNodeName === 'tools' || iteration === 0) {
            iteration++
            startStep(iteration) // Close previous step, start new one
            sendFn({ type: 'iteration', iteration: iteration + iterationOffset })
          }
          lastNodeName = nodeName
        }
        if (!toolNamespace && nodeName === 'tools') {
          lastNodeName = nodeName
        }
        // Usage metadata from model nodes
        if (nodeName === 'model_request' || nodeName === 'agent') {
          for (const msg of (nodeData?.messages || [])) {
            if (msg?.usage_metadata) {
              const meta = msg.usage_metadata
              totalUsage.inputTokens += meta.input_tokens || 0
              totalUsage.outputTokens += meta.output_tokens || 0
              totalUsage.cacheReadTokens += meta.input_token_details?.cache_read || 0
              totalUsage.cacheWriteTokens += meta.input_token_details?.cache_creation || 0
              sendFn({ type: 'usage', usage: { inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens } })
            }
            // Subagent detection from updates
            if (msg?.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                if (tc.name === 'task') {
                  try {
                    const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args || {})
                    const subName = args.subagent_type || args.name || 'general-purpose'
                    const taskDesc = args.description || args.task || ''
                    if (!activeSubagents.has(tc.id)) {
                      activeSubagents.set(tc.id, { name: subName, description: taskDesc })
                      sendFn({ type: 'subagent_start', subRunId: tc.id, name: subName, task: taskDesc })
                    }
                  } catch { /* updates normally contain complete args; ignore malformed partials */ }
                } else {
                  trackToolCall(tc.id, tc.name, tc.args)
                }
              }
            }
          }
        }
        // Tool results from tools node
        if (nodeName === 'tools') {
          for (const msg of (nodeData?.messages || [])) {
            if (msg?.type === 'tool') {
              const toolCallId = msg.tool_call_id || msg.toolCallId || ''
              if (toolCallId && emittedToolResults.has(toolCallId)) continue
              if (toolCallId) emittedToolResults.add(toolCallId)
              const isTaskResult = activeSubagents.has(toolCallId)

              if (isTaskResult) {
                const subInfo = activeSubagents.get(toolCallId)
                sendFn({ type: msg.isError ? 'subagent_error' : 'subagent_end', subRunId: toolCallId, name: subInfo.name, result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) })
                activeSubagents.delete(toolCallId)
              } else {
                let tracked = activeToolCalls.get(toolCallId)
                if (!tracked && toolCallId) {
                  tracked = trackToolCall(toolCallId, msg.name || 'tool')
                }
                const resultText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                if (tracked?.name === 'write_todos' && !sendTodos(resultText)) sendTodos(tracked.input)
                if (tracked) {
                  tracked.result = resultText
                  const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
                  if (stepTc) { stepTc.result = resultText; stepTc.status = msg.isError ? 'error' : 'completed' }
                }
                sendFn({ type: msg.isError ? 'tool_error' : 'tool_end', toolId: toolCallId, result: resultText })
                  // Send incremental step update so renderer sees the completed tool call
                  sendStepUpdate()
              }
            }
          }
        }
      }
    }

    if (mode === 'custom') {
      sendTodos(data?.todos || data?.todo_list || data)
    }
  }
  } catch (streamErr) {
    if (streamErr.name === 'GraphRecursionError' || streamErr.message?.includes('recursion') || streamErr.message?.includes('Recursion')) {
      console.warn('[AgentService] GraphRecursionError during streaming — returning partial results:', streamErr.message)
      recursionHit = true
    } else if (config.signal?.aborted) {
      console.log('[AgentService] Stream aborted')
    } else {
      throw streamErr
    }
  }

  // Close the final step
  closeStep()

  // Fallback: get usage from final state if not captured during streaming
  if (!totalUsage.inputTokens) {
    try {
      const state = await agent.getState({ configurable: config.configurable })
      for (const msg of state?.values?.messages || []) {
        if (msg?.usage_metadata) {
          const meta = msg.usage_metadata
          totalUsage.inputTokens += meta.input_tokens || 0
          totalUsage.outputTokens += meta.output_tokens || 0
          totalUsage.cacheReadTokens += meta.input_token_details?.cache_read || 0
          totalUsage.cacheWriteTokens += meta.input_token_details?.cache_creation || 0
          totalUsage.thinkingTokens += meta.output_token_details?.reasoning || 0
        }
        // Thinking content fallback: content array blocks
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'thinking' && block.thinking) {
              thinkingContent += block.thinking
            }
            if (block.type === 'reasoning' && block.reasoning) {
              thinkingContent += block.reasoning
            }
          }
        }
        // Thinking content fallback: DeepSeek reasoning_content in additional_kwargs
        if (msg?.additional_kwargs?.reasoning_content) {
          thinkingContent += msg.additional_kwargs.reasoning_content
        }
      }
    } catch (e) {
      console.warn('[AgentService] Could not get final state:', e.message)
    }
  }

  if (thinkingContent && !totalUsage.thinkingTokens) {
    totalUsage.thinkingTokens = Math.ceil(thinkingContent.length / 4)
  }

  console.log('[AgentService] Stream finished. Content:', fullContent.length, 'chars, Thinking:', thinkingContent.length, 'chars, Steps:', steps.length, ', Chunks:', chunkCount)

  return { fullContent, thinkingContent, totalUsage, steps, iteration, recursionHit, todos: latestTodos }
}

