<script setup>
/**
 * NotePreview — Rendered markdown content area with dark/light themes,
 * mini header label, and polished empty state.
 */
import { computed, watch } from 'vue'
import { createMarkdownRenderer } from '@/utils/markdown'

const noteMd = createMarkdownRenderer({ breaks: true })

function getCodeLanguage(info = '') {
  return info.trim().split(/\s+/)[0] || ''
}

function escapeHtml(value = '') {
  return noteMd.utils.escapeHtml(String(value))
}

function renderHighlightedCode(content, lang, options) {
  const highlighted = options.highlight?.(content, lang, '') || ''
  return highlighted || escapeHtml(content)
}

function renderNoteCodeBlock(tokens, idx, options) {
  const token = tokens[idx]
  const lang = getCodeLanguage(token.info)
  const langClass = lang ? ` language-${lang.replace(/[^\w-]/g, '')}` : ''
  const langLabel = escapeHtml(lang || 'text')
  const codeHtml = renderHighlightedCode(token.content, lang, options)

  return [
    '<div class="note-code-block" data-note-code-block>',
    '<div class="note-code-toolbar">',
    `<span class="note-code-lang">${langLabel}</span>`,
    '<div class="note-code-actions">',
    '<button type="button" class="note-code-action" data-note-code-action="toggle" aria-expanded="true" title="折叠代码">',
    '<i class="ri-arrow-up-s-line"></i><span class="note-code-action-label" data-note-code-label>折叠</span>',
    '</button>',
    '<button type="button" class="note-code-action" data-note-code-action="copy" title="复制代码">',
    '<i class="ri-file-copy-line"></i><span class="note-code-action-label" data-note-code-label>复制</span>',
    '</button>',
    '</div>',
    '</div>',
    `<pre><code class="hljs${langClass}">${codeHtml}</code></pre>`,
    '<button type="button" class="note-code-expand" data-note-code-action="expand" title="展开代码">',
    '<i class="ri-arrow-down-s-line"></i><span>展开代码</span>',
    '</button>',
    '</div>',
  ].join('')
}

noteMd.renderer.rules.fence = renderNoteCodeBlock
noteMd.renderer.rules.code_block = renderNoteCodeBlock

let katexCssLoaded = false
function ensureKatexCss() {
  if (katexCssLoaded) return
  katexCssLoaded = true
  import('katex/dist/katex.min.css').catch((e) => console.warn('[notes] load katex css failed:', e))
}

const props = defineProps({
  content: { type: String, default: '' },
  isDark: { type: Boolean, default: true },
  showHeader: { type: Boolean, default: false },
  headerLabel: { type: String, default: '预览' },
  headerIcon: { type: String, default: 'ri-eye-line' },
  compact: { type: Boolean, default: false },
})

const html = computed(() => {
  if (!props.content) return ''
  if (/\$/.test(props.content)) ensureKatexCss()
  return noteMd.render(props.content)
})

async function copyCodeText(text) {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function setCopyButtonState(button, ok) {
  const icon = button.querySelector('i')
  const label = button.querySelector('[data-note-code-label]')
  window.clearTimeout(button._noteCopyTimer)

  button.classList.toggle('is-copied', ok)
  button.classList.toggle('is-error', !ok)
  if (icon) icon.className = ok ? 'ri-check-line' : 'ri-error-warning-line'
  if (label) label.textContent = ok ? '已复制' : '失败'

  button._noteCopyTimer = window.setTimeout(() => {
    button.classList.remove('is-copied', 'is-error')
    if (icon) icon.className = 'ri-file-copy-line'
    if (label) label.textContent = '复制'
  }, 1400)
}

function setCodeBlockCollapsed(block, collapsed) {
  block.classList.toggle('is-collapsed', collapsed)
  const toggleButtons = block.querySelectorAll('[data-note-code-action="toggle"]')
  toggleButtons.forEach((button) => {
    button.setAttribute('aria-expanded', String(!collapsed))
    button.title = collapsed ? '展开代码' : '折叠代码'

    const icon = button.querySelector('i')
    const label = button.querySelector('[data-note-code-label]')
    if (icon) icon.className = collapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'
    if (label) label.textContent = collapsed ? '展开' : '折叠'
  })
}

async function handlePreviewClick(event) {
  if (!(event.target instanceof Element)) return
  const button = event.target.closest('[data-note-code-action]')
  if (!button) return

  const block = button.closest('[data-note-code-block]')
  if (!block) return

  const action = button.getAttribute('data-note-code-action')
  if (action === 'toggle') {
    setCodeBlockCollapsed(block, !block.classList.contains('is-collapsed'))
    return
  }

  if (action === 'expand') {
    setCodeBlockCollapsed(block, false)
    return
  }

  if (action === 'copy') {
    const code = block.querySelector('pre code')
    const ok = await copyCodeText(code?.textContent || '')
    setCopyButtonState(button, ok)
  }
}

watch(() => props.content, (v) => { if (v && /\$/.test(v)) ensureKatexCss() }, { immediate: true })
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden min-w-0">
    <!-- Mini header -->
    <div v-if="showHeader" class="h-9 flex items-center px-2 gap-1.5 shrink-0"
      :class="isDark ? 'bg-d4 border-b border-bdr' : 'bg-l4 border-b border-bdrF'">
      <!-- Label slot (split mode) -->
      <slot name="label" />
      <i :class="[headerIcon, 'text-[12px]', isDark ? 'text-wt-aux' : 'text-lt-aux']" />
      <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ headerLabel }}</span>
    </div>
    <!-- Content -->
    <div class="flex-1 overflow-y-auto thin-scroll">
      <div v-if="content" class="note-preview max-w-3xl mx-auto"
        :class="[isDark ? 'note-preview-dark' : 'note-preview-light', compact ? 'p-2' : 'p-3']"
        @click="handlePreviewClick">
        <div v-html="html" />
      </div>
      <div v-else class="flex flex-col items-center justify-center h-full gap-3">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center"
          :class="isDark ? 'bg-d4 border border-bdr' : 'bg-l4 border border-bdrF'">
         <i :class="[headerIcon, 'text-[20px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
        </div>
        <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">笔记内容为空</p>
        <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">切换到编辑模式开始书写</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08) }
.thin-scroll::-webkit-scrollbar { width: 5px }
.thin-scroll::-webkit-scrollbar-track { background: transparent }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25) }

.note-preview-dark {
  color: #e8e8ed;
  --note-code-bg: #101218;
  --note-code-border: rgba(148, 163, 184, .16);
  --note-code-text: #d9e2f2;
  --note-code-inline-bg: rgba(108, 138, 255, .1);
  --note-code-inline-text: #e8e8ed;
  --note-code-scroll: rgba(148, 163, 184, .28);
  --note-code-scroll-hover: rgba(148, 163, 184, .46);
  --note-code-toolbar-bg: rgba(255, 255, 255, .025);
  --note-code-action-text: rgba(217, 226, 242, .76);
  --note-code-action-hover: rgba(255, 255, 255, .07);
  --note-code-fade: linear-gradient(to bottom, rgba(16, 18, 24, 0), #101218 82%);
  --note-code-expand-bg: rgba(255, 255, 255, .08);
  --note-code-expand-border: rgba(148, 163, 184, .24);
  --note-code-expand-shadow: rgba(0, 0, 0, .24);
  --note-code-success: #4ade80;
  --note-code-error: #fb7185;
  --note-code-comment: #6f7787;
  --note-code-keyword: #9fb4ff;
  --note-code-string: #8fd7a5;
  --note-code-number: #f0c674;
  --note-code-title: #87d8ff;
  --note-code-attr: #f6a6c9;
}
.note-preview-light {
  color: #1a1a2e;
  --note-code-bg: #f7f8fb;
  --note-code-border: rgba(148, 163, 184, .38);
  --note-code-text: #253044;
  --note-code-inline-bg: rgba(74, 108, 255, .08);
  --note-code-inline-text: #1f2a44;
  --note-code-scroll: rgba(100, 116, 139, .24);
  --note-code-scroll-hover: rgba(100, 116, 139, .42);
  --note-code-toolbar-bg: rgba(255, 255, 255, .62);
  --note-code-action-text: rgba(37, 48, 68, .7);
  --note-code-action-hover: rgba(37, 48, 68, .07);
  --note-code-fade: linear-gradient(to bottom, rgba(247, 248, 251, 0), #f7f8fb 82%);
  --note-code-expand-bg: rgba(255, 255, 255, .86);
  --note-code-expand-border: rgba(148, 163, 184, .36);
  --note-code-expand-shadow: rgba(15, 23, 42, .1);
  --note-code-success: #16803f;
  --note-code-error: #c2414b;
  --note-code-comment: #7a8496;
  --note-code-keyword: #395bd8;
  --note-code-string: #0d8065;
  --note-code-number: #986a08;
  --note-code-title: #086da8;
  --note-code-attr: #b13f77;
}
.note-preview h1 { font-size: 24px; font-weight: 700; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #353542 }
.note-preview-light h1 { border-bottom-color: #dddcd9 }
.note-preview h2 { font-size: 20px; font-weight: 600; margin: 16px 0 10px }
.note-preview h3 { font-size: 16px; font-weight: 600; margin: 14px 0 8px }
.note-preview h4 { font-size: 14px; font-weight: 600; margin: 12px 0 6px }
.note-preview h5 { font-size: 13px; font-weight: 600; margin: 10px 0 6px }
.note-preview h6 { font-size: 12px; font-weight: 600; margin: 10px 0 4px; opacity: .7 }
.note-preview p { margin: 8px 0; line-height: 1.7 }
.note-preview ul, .note-preview ol { margin: 8px 0; padding-left: 24px }
.note-preview li { margin: 4px 0; line-height: 1.6 }
.note-preview blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid #6C8AFF; opacity: .85; border-radius: 0 4px 4px 0 }
.note-preview-light blockquote { border-left-color: #4A6CFF; background: rgba(74,108,255,0.04) }
.note-preview-dark blockquote { background: rgba(108,138,255,0.06) }
.note-preview code { font-family: 'Menlo','Consolas','Monaco',monospace; font-size: 13px; padding: 2px 6px; border-radius: 4px }
.note-preview-dark code { background: rgba(108,138,255,0.08); color: #e8e8ed }
.note-preview-light code { background: rgba(74,108,255,0.06); color: #1a1a2e }
.note-preview pre { margin: 12px 0; padding: 16px; border-radius: 8px; overflow-x: auto }
.note-preview-dark pre { background: #0e0e12 }
.note-preview-light pre { background: #f8f7f6 }
.note-preview pre code { padding: 0; background: transparent; font-size: 13px; line-height: 1.6 }
.note-preview a { color: #6C8AFF; text-decoration: underline; text-underline-offset: 2px }
.note-preview-light a { color: #4A6CFF }
.note-preview hr { margin: 16px 0; border: none; border-top: 1px solid #353542 }
.note-preview-light hr { border-top-color: #dddcd9 }
.note-preview img { max-width: 100%; border-radius: 8px; margin: 12px 0 }
.note-preview table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px }
.note-preview th, .note-preview td { padding: 8px 12px; text-align: left; border: 1px solid #353542 }
.note-preview-light th, .note-preview-light td { border-color: #dddcd9 }
.note-preview-dark th { background: #1a1a22; font-weight: 600 }
.note-preview-light th { background: #f0efee; font-weight: 600 }
.note-preview input[type="checkbox"] { margin-right: 6px; accent-color: #6C8AFF }
.note-preview-light input[type="checkbox"] { accent-color: #4A6CFF }

/* KaTeX math styling */
.note-preview :deep(.math-block) { margin: 14px 0; padding: 12px; border-radius: 6px; overflow-x: auto; }
.note-preview-dark :deep(.math-block) { background: rgba(108,138,255,0.06) }
.note-preview-light :deep(.math-block) { background: rgba(74,108,255,0.04) }
.note-preview :deep(.katex) { font-size: 1.05em }
.note-preview :deep(.math-err) { color: #ef4444; background: rgba(239,68,68,0.08); padding: 2px 6px; border-radius: 4px }

.note-preview {
  width: 100%;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.note-preview :deep(*) {
  max-width: 100%;
}

.note-preview :deep(h1) { font-size: 26px; font-weight: 750; line-height: 1.25; margin: 22px 0 12px; padding-bottom: 9px; border-bottom: 1px solid #353542 }
.note-preview-light :deep(h1) { border-bottom-color: #dddcd9 }
.note-preview :deep(h2) { font-size: 21px; font-weight: 700; line-height: 1.35; margin: 18px 0 10px }
.note-preview :deep(h3) { font-size: 17px; font-weight: 650; line-height: 1.45; margin: 16px 0 8px }
.note-preview :deep(h4) { font-size: 15px; font-weight: 650; margin: 14px 0 6px }
.note-preview :deep(h5) { font-size: 13px; font-weight: 650; margin: 12px 0 6px }
.note-preview :deep(h6) { font-size: 12px; font-weight: 650; margin: 10px 0 4px; opacity: .72 }
.note-preview :deep(p) { margin: 8px 0; line-height: 1.75; overflow-wrap: anywhere }
.note-preview :deep(ul), .note-preview :deep(ol) { margin: 8px 0; padding-left: 24px }
.note-preview :deep(li) { margin: 4px 0; line-height: 1.65; overflow-wrap: anywhere }
.note-preview :deep(blockquote) { margin: 12px 0; padding: 10px 16px; border-left: 3px solid #6C8AFF; opacity: .9; border-radius: 0 6px 6px 0 }
.note-preview-light :deep(blockquote) { border-left-color: #4A6CFF; background: rgba(74,108,255,0.04) }
.note-preview-dark :deep(blockquote) { background: rgba(108,138,255,0.06) }
.note-preview :deep(:not(pre) > code) {
  font-family: 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: .9em;
  padding: 2px 6px;
  border: 1px solid var(--note-code-border);
  border-radius: 5px;
  background: var(--note-code-inline-bg);
  color: var(--note-code-inline-text);
  overflow-wrap: anywhere;
}
.note-preview :deep(pre) {
  position: relative;
  margin: 14px 0;
  padding: 15px 16px;
  border: 1px solid var(--note-code-border);
  border-radius: 10px;
  background: var(--note-code-bg);
  color: var(--note-code-text);
  overflow-x: auto;
  max-width: 100%;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035);
  scrollbar-width: thin;
  scrollbar-color: var(--note-code-scroll) transparent;
}
.note-preview :deep(pre::-webkit-scrollbar) { height: 8px }
.note-preview :deep(pre::-webkit-scrollbar-track) { background: transparent }
.note-preview :deep(pre::-webkit-scrollbar-thumb) {
  background: var(--note-code-scroll);
  border: 2px solid var(--note-code-bg);
  border-radius: 999px;
}
.note-preview :deep(pre:hover::-webkit-scrollbar-thumb) { background: var(--note-code-scroll-hover) }
.note-preview :deep(pre code) {
  display: block;
  min-width: max-content;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  tab-size: 2;
  font-variant-ligatures: none;
}
.note-preview :deep(.note-code-block) {
  position: relative;
  margin: 14px 0;
  border: 1px solid var(--note-code-border);
  border-radius: 10px;
  background: var(--note-code-bg);
  color: var(--note-code-text);
  overflow: hidden;
  max-width: 100%;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035);
}
.note-preview :deep(.note-code-toolbar) {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 6px 5px 12px;
  border-bottom: 1px solid var(--note-code-border);
  background: var(--note-code-toolbar-bg);
}
.note-preview :deep(.note-code-lang) {
  min-width: 0;
  max-width: 46%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--note-code-action-text);
  font-family: 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0;
}
.note-preview :deep(.note-code-actions) {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.note-preview :deep(.note-code-action) {
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--note-code-action-text);
  font-size: 12px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease, border-color .16s ease;
}
.note-preview :deep(.note-code-action:hover) {
  background: var(--note-code-action-hover);
  color: var(--note-code-text);
  border-color: var(--note-code-border);
}
.note-preview :deep(.note-code-action:focus-visible) {
  outline: 2px solid rgba(108, 138, 255, .45);
  outline-offset: 1px;
}
.note-preview :deep(.note-code-action i) {
  font-size: 14px;
  line-height: 1;
}
.note-preview :deep(.note-code-action.is-copied) { color: var(--note-code-success) }
.note-preview :deep(.note-code-action.is-error) { color: var(--note-code-error) }
.note-preview :deep(.note-code-block pre) {
  margin: 0;
  padding: 14px 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.note-preview :deep(.note-code-block.is-collapsed pre) {
  max-height: 168px;
  overflow: hidden;
}
.note-preview :deep(.note-code-block.is-collapsed::after) {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 46px;
  background: var(--note-code-fade);
  pointer-events: none;
  z-index: 1;
}
.note-preview :deep(.note-code-expand) {
  position: absolute;
  left: 50%;
  bottom: 13px;
  z-index: 2;
  height: 28px;
  display: none;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid var(--note-code-expand-border);
  border-radius: 999px;
  background: var(--note-code-expand-bg);
  color: var(--note-code-action-text);
  box-shadow: 0 8px 20px var(--note-code-expand-shadow);
  backdrop-filter: blur(10px);
  font-size: 12px;
  line-height: 1;
  font-family: inherit;
  cursor: pointer;
  transform: translateX(-50%);
  transition: background-color .16s ease, color .16s ease, border-color .16s ease, transform .16s ease;
}
.note-preview :deep(.note-code-expand:hover) {
  color: var(--note-code-text);
  border-color: var(--note-code-border);
  transform: translateX(-50%) translateY(-1px);
}
.note-preview :deep(.note-code-expand:focus-visible) {
  outline: 2px solid rgba(108, 138, 255, .45);
  outline-offset: 2px;
}
.note-preview :deep(.note-code-expand i) {
  font-size: 14px;
  line-height: 1;
}
.note-preview :deep(.note-code-block.is-collapsed .note-code-expand) {
  display: inline-flex;
}
.note-preview :deep(.hljs-comment),
.note-preview :deep(.hljs-quote) { color: var(--note-code-comment); font-style: italic }
.note-preview :deep(.hljs-keyword),
.note-preview :deep(.hljs-selector-tag),
.note-preview :deep(.hljs-subst) { color: var(--note-code-keyword) }
.note-preview :deep(.hljs-string),
.note-preview :deep(.hljs-regexp),
.note-preview :deep(.hljs-symbol),
.note-preview :deep(.hljs-template-variable) { color: var(--note-code-string) }
.note-preview :deep(.hljs-number),
.note-preview :deep(.hljs-literal),
.note-preview :deep(.hljs-variable) { color: var(--note-code-number) }
.note-preview :deep(.hljs-title),
.note-preview :deep(.hljs-section),
.note-preview :deep(.hljs-function .hljs-title) { color: var(--note-code-title) }
.note-preview :deep(.hljs-attr),
.note-preview :deep(.hljs-attribute),
.note-preview :deep(.hljs-name),
.note-preview :deep(.hljs-built_in) { color: var(--note-code-attr) }
.note-preview :deep(a) { color: #6C8AFF; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere }
.note-preview-light :deep(a) { color: #4A6CFF }
.note-preview :deep(hr) { margin: 16px 0; border: none; border-top: 1px solid #353542 }
.note-preview-light :deep(hr) { border-top-color: #dddcd9 }
.note-preview :deep(img) { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0 }
.note-preview :deep(table) { display: block; width: max-content; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 12px 0; font-size: 13px }
.note-preview :deep(th), .note-preview :deep(td) { padding: 8px 12px; text-align: left; border: 1px solid #353542; vertical-align: top }
.note-preview-light :deep(th), .note-preview-light :deep(td) { border-color: #dddcd9 }
.note-preview-dark :deep(th) { background: #1a1a22; font-weight: 650 }
.note-preview-light :deep(th) { background: #f0efee; font-weight: 650 }
.note-preview :deep(input[type="checkbox"]) { margin-right: 6px; vertical-align: -1px; accent-color: #6C8AFF }
.note-preview-light :deep(input[type="checkbox"]) { accent-color: #4A6CFF }

@media (max-width: 540px) {
  .note-preview :deep(.note-code-toolbar) { padding: 5px 6px 5px 10px }
  .note-preview :deep(.note-code-action) {
    width: 28px;
    padding: 0;
  }
  .note-preview :deep(.note-code-action-label) { display: none }
}
</style>
