// src/agents/StreamRenderer.js — Streaming rendering state machine
// Manages stream events, syncs with conversations store, provides event subscription
import { StreamEvent } from './types'

export class StreamRenderer {
  constructor(convStore) {
    this._convStore = convStore
    this._listeners = new Map() // event → callback[]
  }

  /** Subscribe to a stream event */
  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, [])
    this._listeners.get(event).push(callback)
    return () => this.off(event, callback)
  }

  /** Unsubscribe */
  off(event, callback) {
    const cbs = this._listeners.get(event)
    if (!cbs) return
    const idx = cbs.indexOf(callback)
    if (idx >= 0) cbs.splice(idx, 1)
  }

  /** Emit an event to all subscribers and update store */
  emit(event, data = {}) {
    const cbs = this._listeners.get(event) || []
    for (const cb of cbs) {
      try { cb(data) } catch (e) { console.error('[StreamRenderer] listener error:', e) }
    }
    this._syncStore(event, data)
  }

  // ── Convenience emitters ──────────────────────────────────

  emitTextDelta(text, convId = '') {
    this.emit(StreamEvent.TEXT_DELTA, { text, convId })
  }

  emitThinkingDelta(text, convId = '') {
    this.emit(StreamEvent.THINKING_DELTA, { text, convId })
  }

  emitToolStart(toolCallId, toolName, input = '', convId = '') {
    this.emit(StreamEvent.TOOL_START, { toolCallId, toolName, input, convId })
  }

  emitToolInput(toolCallId, partialInput, convId = '') {
    this.emit(StreamEvent.TOOL_INPUT, { toolCallId, partialInput, convId })
  }

  emitToolEnd(toolCallId, result, convId = '') {
    this.emit(StreamEvent.TOOL_END, { toolCallId, result, convId })
  }

  emitToolError(toolCallId, error, convId = '') {
    this.emit(StreamEvent.TOOL_ERROR, { toolCallId, error, convId })
  }

  emitSubAgentStart(runId, name, task, convId = '') {
    this.emit(StreamEvent.SUB_AGENT_START, { runId, name, task, convId })
  }

  emitSubAgentChunk(runId, name, text, convId = '') {
    this.emit(StreamEvent.SUB_AGENT_CHUNK, { runId, name, text, convId })
  }

  emitSubAgentEnd(runId, name, result, convId = '') {
    this.emit(StreamEvent.SUB_AGENT_END, { runId, name, result, convId })
  }

  emitSubAgentError(runId, name, error, convId = '') {
    this.emit(StreamEvent.SUB_AGENT_ERROR, { runId, name, error, convId })
  }

  emitTodos(todos, convId = '') {
    this.emit(StreamEvent.TODOS, { todos, convId })
  }

  emitAuthRequest(requestId, actionRequests, reviewConfigs, context = {}) {
    this.emit(StreamEvent.AUTH_REQUEST, { requestId, actionRequests, reviewConfigs, ...context })
  }

  emitDone(data = {}) {
    this.emit(StreamEvent.DONE, data)
  }

  emitError(data) {
    this.emit(StreamEvent.ERROR, data)
  }

  emitCompressing() {
    this.emit(StreamEvent.COMPRESSING, {})
  }

  emitCompressed() {
    this.emit(StreamEvent.COMPRESSED, {})
  }

  // ── Store sync ────────────────────────────────────────────

  _syncStore(event, data) {
    const store = this._convStore
    switch (event) {
      case StreamEvent.TEXT_DELTA:
        if (data.text) store.appendToStreamingMsg(data.text, data.convId)
        break
      case StreamEvent.THINKING_DELTA:
        if (data.text) store.appendToStreamingThinking(data.text, data.convId)
        break
      case StreamEvent.TOOL_START:
        store.addStreamingToolCall(data.toolCallId, data.toolName, data.input, data.convId)
        break
      case StreamEvent.TOOL_INPUT:
        store.appendStreamingToolInput(data.toolCallId, data.partialInput, data.convId)
        break
      case StreamEvent.TOOL_END:
        store.completeStreamingToolCall(data.toolCallId, data.result, data.convId)
        break
      case StreamEvent.TOOL_ERROR:
        store.errorStreamingToolCall(data.toolCallId, data.error, data.convId)
        break
      case StreamEvent.SUB_AGENT_START:
        store.addStreamingSubAgent(data.runId, data.name, data.task, data.convId)
        break
      case StreamEvent.SUB_AGENT_CHUNK:
        store.updateStreamingSubAgent(data.runId, data.text, data.name, data.convId)
        break
      case StreamEvent.SUB_AGENT_END:
        store.completeStreamingSubAgent(data.runId, data.result, data.convId)
        break
      case StreamEvent.SUB_AGENT_ERROR:
        store.errorStreamingSubAgent(data.runId, data.error, data.convId)
        break
      case StreamEvent.TODOS:
        store.updateStreamingTodos(data.todos || [], data.convId)
        break
      case StreamEvent.AUTH_REQUEST:
        store.addAuthRequest({
          requestId: data.requestId,
          convId: data.convId || '',
          msgId: data.msgId || '',
          runId: data.runId || '',
          toolName: data.actionRequests?.[0]?.name || '',
          params: data.actionRequests?.[0]?.args || {},
          riskLevel: data.reviewConfigs?.[0]?.riskLevel || 'medium',
          description: data.actionRequests?.[0]?.description || '',
          allowedDecisions: data.reviewConfigs?.[0]?.allowedDecisions || ['approve', 'reject'],
          createdAt: Date.now(),
        })
        break
    }
  }

  /** Remove all listeners */
  clear() {
    this._listeners.clear()
  }
}
