<script setup>
import { computed } from 'vue'
import md from '@/utils/markdown'
import { toFileUrl } from '@/utils/fileUrl'

const props = defineProps({
  wiki: { type: Object, default: null },
  agent: { type: Object, default: null },
  page: { type: Object, default: null },
  error: { type: String, default: '' },
  sourceError: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['add-source', 'open-page', 'open-status', 'configure-agent'])

const renderedContent = computed(() => {
  if (!props.page?.content) return ''
  return rewriteImageSources(md.render(preprocessWikiLinks(preprocessSourceRefs(props.page.content))), props.page)
})

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizePosixPath(value) {
  const stack = []
  for (const part of String(value || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function isExternalSrc(value) {
  return /^(https?:|data:|blob:|reviva-file:|file:|mailto:|#)/i.test(String(value || ''))
}

function resolveWikiImageSrc(rawSrc, page) {
  const src = decodeHtmlAttr(rawSrc).trim()
  if (!src || isExternalSrc(src) || !page?.root_path) return rawSrc

  const match = src.match(/^([^?#]*)([?#].*)?$/)
  const pathPart = match?.[1] || src
  const suffix = match?.[2] || ''
  if (/^[a-zA-Z]:[\\/]/.test(pathPart) || /^\\\\/.test(pathPart)) {
    return toFileUrl(pathPart) + suffix
  }

  const cleanPath = pathPart.replace(/^<|>$/g, '').replace(/^\/+/, '')
  const pagePath = String(page.path || 'index.md').replace(/\\/g, '/')
  const pageDir = pagePath.includes('/') ? pagePath.slice(0, pagePath.lastIndexOf('/')) : ''
  const workspaceRoot = String(page.workspace_root || '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (pathPart.startsWith('/') && workspaceRoot && /^(docs|context|notes)\//i.test(cleanPath)) {
    return toFileUrl(`${workspaceRoot}/${normalizePosixPath(cleanPath)}`) + suffix
  }
  const relPath = pathPart.startsWith('/')
    ? normalizePosixPath(cleanPath)
    : normalizePosixPath(`${pageDir}/${cleanPath}`)
  if (!relPath) return rawSrc

  const root = String(page.root_path || '').replace(/\\/g, '/').replace(/\/+$/, '')
  return toFileUrl(`${root}/${relPath}`) + suffix
}

function rewriteImageSources(html, page) {
  return String(html || '').replace(/<img\b([^>]*?)\bsrc="([^"]*)"([^>]*)>/gi, (match, before, rawSrc, after) => {
    const nextSrc = resolveWikiImageSrc(rawSrc, page)
    return `<img${before}src="${escapeHtmlAttr(nextSrc)}"${after}>`
  })
}

function preprocessWikiLinks(markdown) {
  return String(markdown || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, label) => {
    const cleanTarget = String(target || '').trim()
    const cleanLabel = String(label || cleanTarget).trim()
    if (!cleanTarget) return match
    return `[${cleanLabel}](wiki:${encodeURIComponent(cleanTarget)})`
  })
}

function preprocessSourceRefs(markdown) {
  return String(markdown || '').replace(/\[src:\s*([^\]]+)\]/gi, (match, sourceId) => {
    const clean = String(sourceId || '').trim()
    return clean ? `（来源：\`${clean}\`）` : match
  })
}

function resolveRelativeMarkdownPath(href) {
  const clean = decodeHtmlAttr(href).split('#')[0].split('?')[0]
  if (!clean || !/\.md$/i.test(clean)) return ''
  if (clean.startsWith('/')) return normalizePosixPath(clean.replace(/^\/+/, ''))
  const pagePath = String(props.page?.path || 'index.md').replace(/\\/g, '/')
  const pageDir = pagePath.includes('/') ? pagePath.slice(0, pagePath.lastIndexOf('/')) : ''
  return normalizePosixPath(`${pageDir}/${clean}`)
}

function handleMarkdownClick(event) {
  const target = event.target?.closest?.('a')
  if (!target) return
  const href = target.getAttribute('href') || ''
  if (href.startsWith('wiki:')) {
    event.preventDefault()
    emit('open-page', decodeURIComponent(href.slice(5)))
    return
  }
  const relPath = resolveRelativeMarkdownPath(href)
  if (relPath) {
    event.preventDefault()
    emit('open-page', relPath)
  }
}
</script>

<template>
  <div class="wiki-reader-root h-full flex flex-col min-w-0" :class="isDark ? 'bg-d0' : 'bg-l0'">
    <div class="h-12 px-5 flex items-center gap-3 border-b shrink-0" :class="isDark ? 'border-d4 bg-d1' : 'border-bdrL bg-l1'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">
        <i class="ri-book-3-line text-[16px]" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-[13px] font-semibold truncate leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          {{ wiki?.name || 'LLM Wiki' }}
        </h1>
        <p v-if="wiki" class="text-[10px] truncate font-mono leading-tight mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ wiki.id }} · 更新于 {{ formatDate(wiki.updated_at) }}
        </p>
      </div>

      <div v-if="wiki" class="reader-actions flex items-center gap-1.5 shrink-0">
        <button
          class="reader-btn reader-btn--ghost h-7 px-2.5 rounded-lg text-[11.5px] font-medium border"
          :class="isDark ? 'bg-transparent text-wt-sub border-bdr hover:bg-d2 hover:text-wt-main hover:border-d3' : 'bg-transparent text-lt-sub border-bdrF hover:bg-l3 hover:text-lt-main'"
          title="知识库状态"
          @click="emit('open-status')">
          <i class="ri-dashboard-3-line text-[14px]" />
          <span class="reader-btn__label">状态</span>
        </button>
        <button
          class="reader-btn reader-btn--ghost h-7 px-2.5 rounded-lg text-[11.5px] font-medium border"
          :class="isDark ? 'bg-transparent text-agent-400 border-agent-400/30 hover:bg-agent-400/12 hover:border-agent-400/50' : 'bg-transparent text-agent-500 border-agent-400/25 hover:bg-agent-50 hover:border-agent-400/40'"
          title="配置 WikiAgent"
          @click="emit('configure-agent')">
          <i class="ri-robot-2-line text-[14px]" />
          <span class="reader-btn__label">Agent 配置</span>
        </button>
        <button
          class="reader-btn reader-btn--primary h-7 px-2.5 rounded-lg text-[11.5px] font-semibold border"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/35 hover:bg-brand-400/20 hover:border-brand-400/55' : 'bg-brand-50 text-brand-600 border-brand-400/30 hover:bg-brand-100 hover:border-brand-400/45'"
          title="添加来源"
          @click="emit('add-source')">
          <i class="ri-file-add-line text-[14px]" />
          <span class="reader-btn__label">添加来源</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="mx-5 mt-4 px-3 py-2 rounded-lg text-[12px]" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
      {{ error }}
    </div>
    <div v-if="sourceError" class="mx-5 mt-4 px-3 py-2 rounded-lg text-[12px]" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
      {{ sourceError }}
    </div>

    <div v-if="page" class="flex-1 overflow-y-auto px-7 py-6">
      <div class="max-w-4xl mx-auto fade-up">
        <div class="mb-5 flex items-center justify-between gap-3">
          <div class="flex items-center gap-1.5 min-w-0 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-file-text-line text-[12px] shrink-0" />
            <span class="truncate font-mono">{{ page.path }}</span>
          </div>
          <span class="ctx-pill shrink-0" :class="isDark ? 'bg-d2 text-wt-dim border border-bdr' : 'bg-l2 text-lt-aux border border-bdrF'">Markdown</span>
        </div>
        <div
          class="wiki-markdown rounded-xl p-6 border overflow-x-auto"
          :class="isDark ? 'is-dark bg-d1 border-d4 text-wt-sub' : 'is-light bg-white border-bdrL text-lt-sub'"
          @click="handleMarkdownClick"
          v-html="renderedContent" />
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <div class="max-w-2xl mx-auto px-8 py-12 fade-up">
        <div class="flex items-start gap-4 mb-7">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
               :class="isDark ? 'bg-gradient-to-br from-brand-400/20 to-agent-400/10 border border-brand-400/20' : 'bg-gradient-to-br from-brand-50 to-agent-50 border border-brand-100'">
            <i class="ri-book-open-line text-[26px] text-brand-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[19px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ wiki ? wiki.name : '准备建立本地 Wiki' }}
            </h1>
            <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              从文档列表或笔记列表选择来源，Wiki 会记录引用，并让 WikiAgent 维护可阅读的 Markdown 知识页。
            </p>
          </div>
        </div>

        <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="section-title mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">工作机制</div>
          <div class="space-y-2.5">
            <div class="flex items-center gap-2.5 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <i class="ri-file-add-line text-brand-400 text-[14px] shrink-0" />
              <span>添加文档或笔记作为来源，系统自动解析、必要时 OCR</span>
            </div>
            <div class="flex items-center gap-2.5 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <i class="ri-robot-2-line text-agent-400 text-[14px] shrink-0" />
              <span>WikiAgent 依据已解析来源维护正式 Markdown 知识页</span>
            </div>
            <div class="flex items-center gap-2.5 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <i class="ri-links-line text-emerald-400 text-[14px] shrink-0" />
              <span>页面之间用 [[Wiki 链接]] 互联，点击即可跳转</span>
            </div>
          </div>
        </div>

        <button
          v-if="wiki"
          class="wbtn h-9 px-4 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 border"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/35 hover:bg-brand-400/20 hover:border-brand-400/55' : 'bg-brand-50 text-brand-600 border-brand-400/30 hover:bg-brand-100 hover:border-brand-400/45'"
          @click="emit('add-source')">
          <i class="ri-file-add-line text-[14px]" />
          添加来源
        </button>
        <p v-else class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-arrow-left-line text-[12px] mr-1" />先在左侧选择或创建一个 Wiki
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wiki-markdown {
  --wiki-md-fg: #2a2a3a;
  --wiki-md-muted: #656579;
  --wiki-md-faint: #85859a;
  --wiki-md-border: rgba(15, 23, 42, .14);
  --wiki-md-soft: rgba(15, 23, 42, .035);
  --wiki-md-code-bg: rgba(74, 108, 255, .08);
  --wiki-md-code-fg: #3154e8;
  --wiki-md-quote-bg: rgba(74, 108, 255, .055);
  --wiki-md-table-head: rgba(15, 23, 42, .045);
  color: var(--wiki-md-fg);
  font-size: 13px;
  line-height: 1.75;
  word-break: break-word;
}
.wiki-markdown :deep(> :first-child) {
  margin-top: 0;
}
.wiki-markdown.is-dark {
  --wiki-md-fg: rgba(248, 250, 252, .92);
  --wiki-md-muted: rgba(226, 232, 240, .72);
  --wiki-md-faint: rgba(203, 213, 225, .58);
  --wiki-md-border: rgba(148, 163, 184, .22);
  --wiki-md-soft: rgba(255, 255, 255, .055);
  --wiki-md-code-bg: rgba(108, 138, 255, .14);
  --wiki-md-code-fg: #aabaff;
  --wiki-md-quote-bg: rgba(108, 138, 255, .09);
  --wiki-md-table-head: rgba(255, 255, 255, .07);
}
.wiki-markdown :deep(*) {
  color: inherit;
}
.wiki-markdown :deep(h1),
.wiki-markdown :deep(h2),
.wiki-markdown :deep(h3) {
  margin: 1.1em 0 .55em;
  font-weight: 650;
  line-height: 1.25;
  color: var(--wiki-md-fg);
}
.wiki-markdown :deep(h1) { font-size: 1.35rem; }
.wiki-markdown :deep(h2) { font-size: 1.1rem; }
.wiki-markdown :deep(h3) { font-size: .98rem; }
.wiki-markdown :deep(h4),
.wiki-markdown :deep(h5),
.wiki-markdown :deep(h6) {
  color: var(--wiki-md-fg);
  font-weight: 650;
}
.wiki-markdown :deep(p),
.wiki-markdown :deep(ul),
.wiki-markdown :deep(ol),
.wiki-markdown :deep(blockquote),
.wiki-markdown :deep(table),
.wiki-markdown :deep(pre) {
  margin: .75em 0;
}
.wiki-markdown :deep(ul),
.wiki-markdown :deep(ol) {
  padding-left: 1.4em;
}
.wiki-markdown :deep(li::marker) {
  color: var(--wiki-md-faint);
}
.wiki-markdown :deep(a) {
  color: #4a6cff;
  text-decoration: none;
}
.wiki-markdown.is-dark :deep(a) {
  color: #9db0ff;
}
.wiki-markdown :deep(a:hover) {
  text-decoration: underline;
}
.wiki-markdown :deep(strong) {
  color: var(--wiki-md-fg);
  font-weight: 700;
}
.wiki-markdown :deep(em) {
  color: var(--wiki-md-muted);
}
.wiki-markdown :deep(blockquote) {
  color: var(--wiki-md-muted);
  background: var(--wiki-md-quote-bg);
  border-left: 3px solid #6c8aff;
  border-radius: 0 8px 8px 0;
  padding: .6em .85em;
}
.wiki-markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: .8em 0;
}
.wiki-markdown :deep(pre) {
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  color: var(--wiki-md-fg);
  background: var(--wiki-md-soft);
  border: 1px solid var(--wiki-md-border);
}
.wiki-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: .92em;
}
.wiki-markdown :deep(:not(pre) > code) {
  color: var(--wiki-md-code-fg);
  background: var(--wiki-md-code-bg);
  border: 1px solid var(--wiki-md-border);
  border-radius: 5px;
  padding: .1em .38em;
}
.wiki-markdown :deep(pre code) {
  color: inherit;
  background: transparent;
  border: 0;
  padding: 0;
}
.wiki-markdown :deep(.math-block) {
  margin: .9em 0;
  padding: .35em .1em;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.wiki-markdown :deep(.math-block .katex-display) {
  margin: 0;
}
.wiki-markdown :deep(.katex-display) {
  margin: .9em 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.wiki-markdown :deep(.katex) {
  font-size: 1.04em;
}
.wiki-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  color: var(--wiki-md-fg);
}
.wiki-markdown :deep(th),
.wiki-markdown :deep(td) {
  border: 1px solid var(--wiki-md-border);
  padding: 6px 8px;
}
.wiki-markdown :deep(th) {
  color: var(--wiki-md-fg);
  background: var(--wiki-md-table-head);
  font-weight: 650;
}
.wiki-markdown :deep(td) {
  color: var(--wiki-md-muted);
}
.wiki-reader-root {
  container-type: inline-size;
}
.reader-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  transition: transform .16s ease, background-color .15s ease, border-color .15s ease, color .15s ease, box-shadow .16s ease;
}
.reader-btn:hover {
  transform: translateY(-1px);
}
.reader-btn--ghost:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.10);
}
.reader-btn--primary:hover {
  box-shadow: 0 3px 12px rgba(74, 108, 255, 0.18);
}
.wbtn {
  transition: transform .16s ease, background-color .15s ease, border-color .15s ease, color .15s ease;
}
.wbtn:hover {
  transform: translateY(-1px);
}
/* Collapse labels based on the reader column's own width, not the viewport. */
@container (max-width: 600px) {
  .reader-btn--ghost {
    width: 28px;
    padding-left: 0;
    padding-right: 0;
    justify-content: center;
  }
  .reader-btn--ghost .reader-btn__label {
    display: none;
  }
}
@container (max-width: 440px) {
  .reader-btn {
    width: 28px;
    padding-left: 0;
    padding-right: 0;
    justify-content: center;
  }
  .reader-btn__label {
    display: none;
  }
}
</style>
