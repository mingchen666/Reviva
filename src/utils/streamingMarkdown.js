// src/utils/streamingMarkdown.js — Incremental streaming Markdown renderer
import md from './markdown'

const STREAM_THROTTLE_MS = 80

/**
 * Create a streaming renderer that incrementally renders Markdown
 * during streaming, then does a full render on finalize.
 */
export function createStreamingRenderer() {
  let buffer = ''
  let lastRendered = ''
  let throttleTimer = null
  let isStreaming = false

  function append(text) {
    if (!text) return
    buffer += text
    isStreaming = true

    if (!throttleTimer) {
      // Immediate first render
      lastRendered = renderPartial(buffer)
      throttleTimer = setTimeout(() => {
        throttleTimer = null
        if (isStreaming) {
          lastRendered = renderPartial(buffer)
        }
      }, STREAM_THROTTLE_MS)
    }
  }

  function finalize() {
    isStreaming = false
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
    // Full, clean render
    lastRendered = md.render(buffer)
    buffer = ''
    return lastRendered
  }

  function getCurrent() {
    return lastRendered
  }

  function reset() {
    buffer = ''
    lastRendered = ''
    isStreaming = false
    if (throttleTimer) {
      clearTimeout(throttleTimer)
      throttleTimer = null
    }
  }

  return { append, finalize, getCurrent, reset }
}

/**
 * Render partial markdown during streaming.
 * Handles unclosed code blocks and adds data-streaming attribute.
 */
function renderPartial(content) {
  // Close unclosed code blocks
  const codeBlockCount = (content.match(/```/g) || []).length
  let safeContent = content
  if (codeBlockCount % 2 !== 0) {
    safeContent += '\n```'
  }

  // Render with markdown-it
  let rendered = md.render(safeContent)

  // Add data-streaming attribute to last block for cursor positioning
  // The CSS `::after` pseudo-element on [data-streaming] shows the blinking cursor
  if (rendered) {
    // Mark the last paragraph or inline element
    rendered = rendered.replace(
      /<p([^>]*)>([^<]*?)<\/p>(?![^]*<p)/,
      '<p$1 data-streaming="true">$2</p>'
    )
  }

  return rendered
}