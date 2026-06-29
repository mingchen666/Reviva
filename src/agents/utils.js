// src/agents/utils.js — Shared utility functions for the Agent system
// DeepAgents handles: error classification, retry/backoff in main process
// Renderer only needs: ID generation, token estimation, proxy stripping, error rendering

/**
 * Generate a unique ID
 */
export function genId(prefix = '') {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`
}

/**
 * Estimate token count for a string
 * Rough heuristic: Chinese ~2 chars/token, English ~4 chars/token
 * Mixed content uses ~3.5 chars/token as average
 */
export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

/**
 * Estimate token count for a context object (systemPrompt + messages)
 */
export function estimateContextTokens(context) {
  const parts = []
  if (context.systemPrompt) parts.push(context.systemPrompt)
  if (context.messages?.length) {
    for (const m of context.messages) {
      parts.push(m.content || '')
      if (m.toolCalls) parts.push(JSON.stringify(m.toolCalls))
    }
  }
  return estimateTokens(parts.join(''))
}

/**
 * Strip reactive proxy from Vue objects before IPC
 */
export function toPlain(obj) {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Create a renderable error object for UI components
 */
export function toRenderableError(code, message, errorInfo) {
  const info = errorInfo[code] || {
    title: '未知错误',
    icon: 'ri-error-warning-line',
    suggestion: '请稍后重试',
    color: 'error',
  }
  return {
    title: info.title,
    detail: message,
    icon: info.icon,
    suggestion: info.suggestion,
    color: info.color,
    code,
  }
}