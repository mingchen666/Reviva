<script setup>
import { computed } from 'vue'
import md from '@/utils/markdown'
import { toFileUrl } from '@/utils/fileUrl'
import { parseMarkdownFrontMatter } from '@/utils/markdownFrontMatter'

const props = defineProps({
  wiki: { type: Object, default: null },
  agent: { type: Object, default: null },
  page: { type: Object, default: null },
  error: { type: String, default: '' },
  sourceError: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['add-source', 'open-page', 'open-status', 'configure-agent'])

const pageDocument = computed(() => parseMarkdownFrontMatter(props.page?.content || ''))

const renderedContent = computed(() => {
  if (!pageDocument.value.body) return ''
  return rewriteImageSources(md.render(preprocessWikiLinks(preprocessSourceRefs(pageDocument.value.body))), props.page)
})

const pageMetadata = computed(() => {
  const attributes = pageDocument.value.attributes || {}
  if (!pageDocument.value.hasFrontMatter) return null
  return {
    id: String(attributes.id || ''),
    type: String(attributes.type || ''),
    title: String(attributes.title || ''),
    status: String(attributes.status || ''),
    sourceIds: Array.isArray(attributes.source_ids) ? attributes.source_ids.map(String) : [],
    schemaVersion: attributes.schema_version || '',
    createdAt: String(attributes.created_at || ''),
    updatedAt: String(attributes.updated_at || ''),
    verifiedAt: String(attributes.verified_at || ''),
  }
})

const pageTypeLabel = computed(() => ({
  index: '索引', overview: '概览', summary: '摘要', concept: '概念', entity: '实体', question: '问题', comparison: '对比',
})[pageMetadata.value?.type] || pageMetadata.value?.type || '知识页')

const pageStatusLabel = computed(() => ({
  active: '正常', stale: '待更新', unsupported: '不支持', review_required: '待审核',
})[pageMetadata.value?.status] || pageMetadata.value?.status || '未知')

const pageStatusClasses = computed(() => {
  const status = pageMetadata.value?.status
  if (status === 'active') return props.isDark ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600'
  if (status === 'stale' || status === 'review_required') return props.isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-600'
  return props.isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'
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
        <i class="ri-book-3-line text-[18px]" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-[14px] font-semibold truncate leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          {{ wiki?.name || 'LLM Wiki' }}
        </h1>
        <p v-if="wiki" class="text-[11.5px] truncate font-mono leading-tight mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ wiki.id }} · 更新于 {{ formatDate(wiki.updated_at) }}
        </p>
      </div>

      <div v-if="wiki" class="reader-actions flex items-center gap-1.5 shrink-0">
        <button
          class="reader-btn reader-btn--ghost h-7 px-2.5 rounded-lg text-[13px] font-medium border"
          :class="isDark ? 'bg-transparent text-wt-sub border-bdr hover:bg-d2 hover:text-wt-main hover:border-d3' : 'bg-transparent text-lt-sub border-bdrF hover:bg-l3 hover:text-lt-main'"
          title="知识库状态"
          @click="emit('open-status')">
          <i class="ri-dashboard-3-line text-[14.5px]" />
          <span class="reader-btn__label">状态</span>
        </button>
        <button
          class="reader-btn reader-btn--ghost h-7 px-2.5 rounded-lg text-[13px] font-medium border"
          :class="isDark ? 'bg-transparent text-agent-400 border-agent-400/30 hover:bg-agent-400/12 hover:border-agent-400/50' : 'bg-transparent text-agent-500 border-agent-400/25 hover:bg-agent-50 hover:border-agent-400/40'"
          title="配置 WikiAgent"
          @click="emit('configure-agent')">
          <i class="ri-robot-2-line text-[14.5px]" />
          <span class="reader-btn__label">Agent 配置</span>
        </button>
        <button
          class="reader-btn reader-btn--primary h-7 px-2.5 rounded-lg text-[13px] font-semibold border"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/35 hover:bg-brand-400/20 hover:border-brand-400/55' : 'bg-brand-50 text-brand-600 border-brand-400/30 hover:bg-brand-100 hover:border-brand-400/45'"
          title="添加来源"
          @click="emit('add-source')">
          <i class="ri-file-add-line text-[14.5px]" />
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

    <div v-if="page" class="flex-1 overflow-y-auto px-4 py-3">
      <div class="max-w-4xl mx-auto fade-up">
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="flex items-center gap-1.5 min-w-0 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-file-text-line text-[13px] shrink-0" />
            <span class="truncate font-mono">{{ page.path }}</span>
          </div>
          <span class="ctx-pill shrink-0" :class="isDark ? 'bg-d2 text-wt-dim border border-bdr' : 'bg-l2 text-lt-aux border border-bdrF'">Markdown</span>
        </div>
        <section v-if="pageMetadata" class="wiki-page-meta mb-3" :class="isDark ? 'wiki-page-meta--dark' : 'wiki-page-meta--light'">
          <div class="flex items-start gap-3">
            <div class="wiki-page-meta__icon" :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'"><i class="ri-file-info-line text-[16px]" /></div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ pageMetadata.title || page.path }}</span>
                <span class="wiki-page-meta__chip" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l3 text-lt-aux'">{{ pageTypeLabel }}</span>
                <span class="wiki-page-meta__chip" :class="pageStatusClasses">{{ pageStatusLabel }}</span>
                <span class="text-[12px] ml-auto shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">更新于 {{ formatDate(pageMetadata.updatedAt) }}</span>
              </div>
              <div class="flex items-center gap-4 flex-wrap mt-2 text-[12.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <span><i class="ri-links-line mr-1" />{{ pageMetadata.sourceIds.length }} 个来源</span>
                <span v-if="pageMetadata.verifiedAt"><i class="ri-shield-check-line mr-1" />已验证 {{ formatDate(pageMetadata.verifiedAt) }}</span>
                <span v-else><i class="ri-shield-line mr-1" />尚未验证</span>
              </div>
              <details class="wiki-page-meta__details mt-2">
                <summary :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">查看页面元数据</summary>
                <div class="wiki-page-meta__grid mt-2" :class="isDark ? 'bg-black/10' : 'bg-l3/70'">
                  <div><span>页面 ID</span><code>{{ pageMetadata.id || '-' }}</code></div>
                  <div><span>Schema</span><code>v{{ pageMetadata.schemaVersion || '-' }}</code></div>
                  <div><span>创建时间</span><code>{{ formatDate(pageMetadata.createdAt) }}</code></div>
                  <div><span>来源 ID</span><code>{{ pageMetadata.sourceIds.length ? pageMetadata.sourceIds.join(', ') : '无' }}</code></div>
                </div>
              </details>
            </div>
          </div>
        </section>
        <div
          class="markdown-content rounded-xl p-4 border overflow-x-auto"
          :class="isDark ? 'markdown-content--dark bg-d1 border-d4 text-wt-sub' : 'markdown-content--light bg-white border-bdrL text-lt-sub'"
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
.wiki-page-meta { padding: 14px; border: 1px solid transparent; border-radius: 12px; }
.wiki-page-meta--light { background: rgba(255,255,255,.82); border-color: rgba(15,23,42,.08); }
.wiki-page-meta--dark { background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.08); }
.wiki-page-meta__icon { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
.wiki-page-meta__chip { height: 22px; padding: 0 7px; border-radius: 6px; display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; }
.wiki-page-meta__details summary { width: fit-content; cursor: pointer; font-size: 12px; line-height: 20px; user-select: none; }
.wiki-page-meta__grid { padding: 10px; border-radius: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
.wiki-page-meta__grid > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.wiki-page-meta__grid span { font-size: 11px; opacity: .68; }
.wiki-page-meta__grid code { font-size: 11.5px; line-height: 18px; overflow-wrap: anywhere; }
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
