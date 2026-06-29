import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import katex from 'katex'

// ─── KaTeX inline ($...$) and block ($$...$$) plugin ───
// Lightweight inline implementation — avoids extra dependency.
function katexPlugin(md) {
  // Inline: $...$
  md.inline.ruler.after('escape', 'math_inline', function math_inline(state, silent) {
    const start = state.pos
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
    // Skip $$ (block handled separately)
    if (state.src.charCodeAt(start + 1) === 0x24) return false
    // No content
    let pos = start + 1
    let found = -1
    while (pos < state.posMax) {
      if (state.src.charCodeAt(pos) === 0x5c /* \ */) { pos += 2; continue }
      if (state.src.charCodeAt(pos) === 0x24) { found = pos; break }
      pos++
    }
    if (found < 0 || found === start + 1) return false
    const content = state.src.slice(start + 1, found)
    // Reject if contains newline (treat as plain text)
    if (/\n/.test(content)) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = content
      token.markup = '$'
    }
    state.pos = found + 1
    return true
  })

  // Block: $$...$$
  md.block.ruler.after('blockquote', 'math_block', function math_block(state, startLine, endLine, silent) {
    const startPos = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    if (startPos + 2 > max) return false
    if (state.src.slice(startPos, startPos + 2) !== '$$') return false
    let line = startLine
    let content = ''
    // Single-line $$...$$
    const firstLine = state.src.slice(startPos + 2, max)
    if (firstLine.trim().endsWith('$$')) {
      content = firstLine.trim().slice(0, -2).trim()
      line = startLine + 1
    } else {
      content = firstLine + '\n'
      line = startLine + 1
      while (line < endLine) {
        const ls = state.bMarks[line] + state.tShift[line]
        const le = state.eMarks[line]
        const segment = state.src.slice(ls, le)
        if (segment.trim() === '$$') { line++; break }
        content += segment + '\n'
        line++
      }
    }
    if (silent) return true
    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = content.trim()
    token.markup = '$$'
    token.map = [startLine, line]
    state.line = line
    return true
  })

  md.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: false })
    } catch (e) {
      return `<code class="math-err" title="${e.message}">${tokens[idx].content}</code>`
    }
  }
  md.renderer.rules.math_block = (tokens, idx) => {
    try {
      return `<div class="math-block">${katex.renderToString(tokens[idx].content, { throwOnError: false, displayMode: true })}</div>`
    } catch (e) {
      return `<pre class="math-err" title="${e.message}">${tokens[idx].content}</pre>`
    }
  }
}

function taskListPlugin(md) {
  md.core.ruler.after('inline', 'task_list', (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue
      if (tokens[i - 1]?.type !== 'paragraph_open') continue
      if (tokens[i - 2]?.type !== 'list_item_open') continue

      const match = tokens[i].content.match(/^\[([ xX])\]\s+/)
      if (!match) continue

      const checked = match[1].toLowerCase() === 'x'
      tokens[i].content = tokens[i].content.slice(match[0].length)
      if (!tokens[i].children) continue
      if (tokens[i].children[0]?.type === 'text') {
        tokens[i].children[0].content = tokens[i].children[0].content.replace(/^\[([ xX])\]\s+/, '')
      }

      const checkbox = new state.Token('html_inline', '', 0)
      checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}> `
      tokens[i].children.unshift(checkbox)
    }
  })
}

// ─── YAML frontmatter parser ───
// Extracts --- delimited frontmatter from markdown, returns { meta, body }.
export function parseFrontmatter(src) {
  const trimmed = src.replace(/^﻿/, '')
  if (!trimmed.startsWith('---')) return { meta: null, body: src }
  const end = trimmed.indexOf('---', 3)
  if (end < 0) return { meta: null, body: src }
  const raw = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 3).replace(/^\n+/, '')
  const meta = {}
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (key) meta[key] = val
  }
  return { meta, body }
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value } catch {}
    }
    try { return hljs.highlightAuto(str).value } catch {}
    return ''
  },
})

md.use(katexPlugin)
md.use(taskListPlugin)

export default md
