<script setup>
import md from '@/utils/markdown'
import { toFileUrl } from '@/utils/fileUrl'
import { parseMarkdownFrontMatter } from '@/utils/markdownFrontMatter'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  file: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'chat'])

const api = () => window.electronAPI

const ext = computed(() => (props.file?.ext || props.file?.name?.split('.').pop() || '').toLowerCase())
const fileUrl = computed(() => toFileUrl(props.file?.path))
const htmlView = ref('preview')
const htmlSource = computed(() => ext.value === 'html' || ext.value === 'htm' ? String(props.file?.content || '') : '')

watch(() => props.file?.path, () => { htmlView.value = 'preview' })

function externalHttpUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch { return '' }
}

const markdownDocument = computed(() => {
  if (!props.file || typeof props.file.content !== 'string' || !['md', 'markdown'].includes(ext.value)) return { attributes: {}, body: '' }
  return parseMarkdownFrontMatter(props.file.content)
})

const webSourceMeta = computed(() => {
  const attributes = markdownDocument.value.attributes || {}
  const sourceUrl = externalHttpUrl(attributes.source_url)
  const finalUrl = externalHttpUrl(attributes.final_url)
  if (!sourceUrl && !attributes.provider && !attributes.fetched_at) return null
  return {
    title: String(attributes.title || ''),
    sourceUrl,
    finalUrl: finalUrl && finalUrl !== sourceUrl ? finalUrl : '',
    provider: String(attributes.provider || ''),
    description: String(attributes.description || ''),
    fetchedAt: String(attributes.fetched_at || ''),
  }
})

const webProviderLabel = computed(() => ({
  jina: 'Jina Reader',
  firecrawl: 'Firecrawl',
  tavily: 'Tavily Extract',
})[webSourceMeta.value?.provider] || webSourceMeta.value?.provider || '网页解析')

const webFetchedAtLabel = computed(() => {
  const value = webSourceMeta.value?.fetchedAt
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
})

const renderedMarkdown = computed(() => {
  return markdownDocument.value.body ? md.render(markdownDocument.value.body) : ''
})

const fileIconAndColor = computed(() => {
  const map = {
    pdf: ['ri-file-pdf-2-fill', 'red'],
    md: ['ri-markdown-fill', 'brand'], markdown: ['ri-markdown-fill', 'brand'],
    docx: ['ri-file-word-2-fill', 'blue'], doc: ['ri-file-word-2-fill', 'blue'],
    xlsx: ['ri-file-excel-2-fill', 'emerald'], xls: ['ri-file-excel-2-fill', 'emerald'],
    pptx: ['ri-file-ppt-2-fill', 'orange'], ppt: ['ri-file-ppt-2-fill', 'orange'],
    png: ['ri-image-fill', 'purple'], jpg: ['ri-image-fill', 'purple'],
    jpeg: ['ri-image-fill', 'purple'], gif: ['ri-image-fill', 'purple'],
    json: ['ri-braces-line', 'yellow'], js: ['ri-javascript-fill', 'yellow'],
    ts: ['ri-code-s-slash-line', 'blue'], py: ['ri-code-s-slash-line', 'emerald'],
    html: ['ri-html5-fill', 'orange'], css: ['ri-css3-fill', 'blue'],
    txt: ['ri-file-text-fill', 'gray'], csv: ['ri-file-text-fill', 'emerald'],
    mp4: ['ri-movie-fill', 'violet'], mp3: ['ri-music-fill', 'pink'],
    zip: ['ri-file-zip-fill', 'gray'],
  }
  const [icon, color] = map[ext.value] || ['ri-file-3-line', 'gray']
  return {
    icon,
    color: props.isDark ? `text-${color}-400` : `text-${color}-500`,
    bg: props.isDark ? `bg-${color}-400/8` : `bg-${color}-50`,
  }
})

const typeLabel = computed(() => {
  const map = {
    pdf: 'PDF', md: 'Markdown', markdown: 'Markdown', docx: 'Word', doc: 'Word',
    txt: 'Text', xlsx: 'Excel', xls: 'Excel', pptx: 'PPT',
    png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image',
    json: 'JSON', js: 'JS', ts: 'TS', py: 'Python', html: 'HTML', css: 'CSS',
    mp4: 'Video', mp3: 'Audio', zip: 'Archive', csv: 'CSV',
  }
  return map[ext.value] || ext.value.toUpperCase()
})

const pdfStatusLabel = computed(() => {
  const mode = props.file?.pdfStatus?.pdfTextMode || ''
  const map = {
    text: '可读取',
    text_with_partial_gaps: '部分页面需要 OCR',
    mixed_needs_ocr: '混合型，需要 OCR 补齐',
    scanned_or_image: '扫描件，需要 OCR',
  }
  return map[mode] || '已预检'
})

const pdfRecommendationText = computed(() => {
  const rec = props.file?.pdfStatus?.recommendation
  if (!rec) return ''
  return rec.reason || rec.action || ''
})

function openExternally() {
  if (props.file?.path) api()?.openPath?.(props.file.path)
}
function copyPath() {
  if (props.file?.path) navigator.clipboard.writeText(props.file.path)
}
function showInFolder() {
  if (props.file?.path) api()?.showItemInFolder?.(props.file.path)
}
function openWebSource(url) {
  const safeUrl = externalHttpUrl(url)
  if (safeUrl) api()?.openExternal?.(safeUrl)
}
</script>

<template>
  <div v-if="file" class="h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <!-- Header -->
    <div class="h-12 flex items-center gap-3 px-5 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="fileIconAndColor.bg">
        <i :class="[fileIconAndColor.icon, fileIconAndColor.color]" class="text-[16px]" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <div class="text-[12.5px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</div>
          <span class="ctx-pill !text-[9.5px] shrink-0"
            :class="isDark ? 'text-wt-dim bg-d4 border border-bdr' : 'text-lt-aux bg-l4 border border-bdrF'">
            {{ typeLabel }}
          </span>
        </div>
        <div class="text-[10px] truncate font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ file.path }}</div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button @click="emit('chat', file)"
          class="h-7 px-2.5 rounded-lg text-[14px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
          <i class="ri-chat-1-line text-[14px]" />对话
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="openExternally"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="用系统应用打开">
          <i class="ri-external-link-line text-[14px]" />
        </button>
        <button @click="copyPath"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="复制路径">
          <i class="ri-clipboard-line text-[14px]" />
        </button>
        <button @click="showInFolder"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="在资源管理器中显示">
          <i class="ri-folder-open-line text-[14px]" />
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="emit('close')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
          title="关闭预览">
          <i class="ri-close-line text-[16px]" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto">

      <!-- Loading -->
      <div v-if="file.loading" class="flex items-center justify-center py-16">
        <div class="text-center">
          <i class="ri-loader-4-line text-[24px] pulse" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <p class="text-[11px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</p>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="file.error" class="p-6">
        <div class="rounded-xl p-6 text-center max-w-md mx-auto"
          :class="isDark ? 'bg-red-400/6 border border-red-400/20' : 'bg-red-50 border border-red-200'">
          <i class="ri-error-warning-line text-[28px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
          <p class="text-[13px] font-medium mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">文件读取失败</p>
          <p class="text-[11px] mt-1 break-all" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ file.error }}</p>
          <button @click="openExternally"
            class="mt-4 h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
            <i class="ri-external-link-line text-[11px] mr-1" />用系统应用打开
          </button>
        </div>
      </div>

      <!-- Image -->
      <div v-else-if="file.pdfStatus" class="p-6">
        <div class="max-w-3xl mx-auto rounded-xl border p-5"
          :class="isDark ? 'bg-d3 border-bdr' : 'bg-l3 border-bdrF'">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ pdfStatusLabel }}</div>
              <div class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ file.pdfStatus.pageCount || 0 }} 页 · 文本覆盖率 {{ Math.round((file.pdfStatus.textCoverageRatio || 0) * 100) }}%
              </div>
            </div>
            <span class="ctx-pill shrink-0" :class="isDark ? 'bg-red-400/8 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">
              PDF
            </span>
          </div>
<<<<<<< HEAD
<<<<<<< HEAD
          <div v-if="pdfRecommendationText" class="mt-4 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
=======
          <div v-if="pdfRecommendationText" class="mt-4 text-[14px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
>>>>>>> dev
=======
          <div v-if="pdfRecommendationText" class="mt-4 text-[14px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
>>>>>>> dev
            {{ pdfRecommendationText }}
          </div>
          <div class="mt-4 grid grid-cols-3 gap-2">
            <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d4/50' : 'bg-l4/60'">
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">候选 OCR 页</div>
              <div class="text-[13px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.pdfStatus.ocrCandidateCount || 0 }}</div>
            </div>
            <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d4/50' : 'bg-l4/60'">
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已扫描页</div>
              <div class="text-[13px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.pdfStatus.scannedPages || 0 }}</div>
            </div>
            <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d4/50' : 'bg-l4/60'">
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">缓存</div>
              <div class="text-[13px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.pdfStatus.cacheHit ? '命中' : '已更新' }}</div>
            </div>
          </div>
          <div v-if="file.pdfStatus.content" class="mt-5">
            <div class="text-[11px] mb-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文本预览</div>
            <pre class="text-[12px] leading-relaxed whitespace-pre-wrap max-h-[360px] overflow-auto rounded-lg p-3"
              :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-l4 text-lt-sub'">{{ file.pdfStatus.content }}</pre>
          </div>
        </div>
      </div>

      <!-- Image -->
      <div v-else-if="file.mediaType === 'image'" class="flex items-center justify-center p-6">
        <img :src="fileUrl" class="max-w-full rounded-xl shadow-lg" style="max-height:70vh" />
      </div>

      <!-- Audio -->
      <div v-else-if="file.mediaType === 'audio'" class="flex flex-col items-center gap-4 py-10 px-6">
        <div class="w-20 h-20 rounded-2xl flex items-center justify-center"
          :class="isDark ? 'bg-pink-400/8' : 'bg-pink-50'">
          <i class="ri-music-fill text-[36px]" :class="isDark ? 'text-pink-400' : 'text-pink-500'" />
        </div>
        <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</p>
        <audio controls :src="fileUrl" class="w-full max-w-md" />
      </div>

      <!-- Video -->
      <div v-else-if="file.mediaType === 'video'" class="p-6 flex justify-center">
        <video controls :src="fileUrl" class="w-full max-w-3xl rounded-xl shadow-lg" style="max-height:70vh" />
      </div>

      <!-- Markdown -->
<<<<<<< HEAD
<<<<<<< HEAD
      <div v-else-if="renderedMarkdown" class="p-6">
        <div class="max-w-4xl mx-auto rounded-xl p-6 markdown-content" :class="[isDark ? 'markdown-content--dark bg-d3' : 'markdown-content--light bg-l3']"
          v-html="renderedMarkdown" />
=======
=======
>>>>>>> dev
      <div v-else-if="renderedMarkdown || webSourceMeta" class="p-6">
        <div class="max-w-4xl mx-auto">
          <section v-if="webSourceMeta" class="web-source-card mb-4" :class="isDark ? 'web-source-card--dark' : 'web-source-card--light'">
            <div class="flex items-start gap-3">
              <div class="web-source-icon" :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'">
                <i class="ri-global-line text-[16px]" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ webSourceMeta.title || '网页来源' }}</span>
                  <span class="web-source-provider" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ webProviderLabel }}</span>
                  <span v-if="webFetchedAtLabel" class="text-[12px] ml-auto shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ webFetchedAtLabel }}</span>
                </div>
                <button v-if="webSourceMeta.sourceUrl" type="button" class="web-source-link mt-2" :title="webSourceMeta.sourceUrl" @click="openWebSource(webSourceMeta.sourceUrl)">
                  <i class="ri-link text-[13px] shrink-0" /><span class="truncate">{{ webSourceMeta.sourceUrl }}</span><i class="ri-external-link-line text-[12px] shrink-0" />
                </button>
                <p v-if="webSourceMeta.description" class="text-[13px] leading-5 mt-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ webSourceMeta.description }}</p>
                <details v-if="webSourceMeta.finalUrl" class="web-source-details mt-2">
                  <summary :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">查看最终跳转地址</summary>
                  <button type="button" class="web-source-link mt-1.5" :title="webSourceMeta.finalUrl" @click="openWebSource(webSourceMeta.finalUrl)">
                    <i class="ri-route-line text-[13px] shrink-0" /><span class="truncate">{{ webSourceMeta.finalUrl }}</span><i class="ri-external-link-line text-[12px] shrink-0" />
                  </button>
                </details>
              </div>
            </div>
          </section>
          <div v-if="renderedMarkdown" class="rounded-xl p-6 markdown-content" :class="[isDark ? 'markdown-content--dark bg-d3' : 'markdown-content--light bg-l3']"
            v-html="renderedMarkdown" />
        </div>
      </div>

      <!-- Sanitized HTML -->
      <div v-else-if="htmlSource" class="h-full min-h-0 flex flex-col p-4 gap-3">
        <div class="flex items-center justify-between gap-3 shrink-0">
          <div class="inline-flex rounded-lg p-0.5" :class="isDark ? 'bg-d4' : 'bg-l4'">
            <button class="h-7 px-3 rounded-md text-[11px]" :class="htmlView === 'preview' ? (isDark ? 'bg-d2 text-wt-main' : 'bg-white text-lt-main shadow-sm') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" @click="htmlView = 'preview'">页面预览</button>
            <button class="h-7 px-3 rounded-md text-[11px]" :class="htmlView === 'source' ? (isDark ? 'bg-d2 text-wt-main' : 'bg-white text-lt-main shadow-sm') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" @click="htmlView = 'source'">查看源码</button>
          </div>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">安全沙箱 · 禁止脚本、表单与弹窗</span>
        </div>
        <iframe
          v-if="htmlView === 'preview'"
          :srcdoc="htmlSource"
          sandbox=""
          referrerpolicy="no-referrer"
          class="w-full flex-1 min-h-[420px] rounded-xl border bg-white"
          :class="isDark ? 'border-d4' : 'border-bdrL'" />
        <pre v-else class="flex-1 min-h-[420px] overflow-auto rounded-xl border p-4 text-[12px] font-mono whitespace-pre-wrap break-all" :class="isDark ? 'border-d4 bg-d3 text-wt-sub' : 'border-bdrL bg-l3 text-lt-sub'">{{ htmlSource }}</pre>
<<<<<<< HEAD
>>>>>>> dev
=======
>>>>>>> dev
      </div>

      <!-- Plain text / code -->
      <div v-else-if="typeof file.content === 'string'" class="p-6">
        <div class="max-w-4xl mx-auto rounded-xl overflow-hidden border"
          :class="isDark ? 'bg-d3 border-bdr' : 'bg-l3 border-bdrF'">
          <div class="px-4 py-2 flex items-center gap-2 border-b"
            :class="isDark ? 'border-bdr bg-d4/30' : 'border-bdrF bg-l4/30'">
            <i :class="[fileIconAndColor.icon, fileIconAndColor.color]" class="text-[13px]" />
            <span class="text-[10px] font-mono uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ typeLabel }}</span>
          </div>
          <pre class="p-4 text-[12px] font-mono whitespace-pre-wrap break-all leading-relaxed overflow-x-auto"
            :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ file.content }}</pre>
        </div>
      </div>

      <!-- Unsupported -->
      <div v-else-if="file.unsupported" class="flex flex-col items-center justify-center py-16 gap-3">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center" :class="fileIconAndColor.bg">
          <i :class="[fileIconAndColor.icon, fileIconAndColor.color]" class="text-[32px]" />
        </div>
        <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">此文件类型暂不支持预览</p>
        <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ typeLabel }} 文件 · {{ file.name }}</p>
        <button @click="openExternally"
          class="mt-2 h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
          <i class="ri-external-link-line text-[11px] mr-1" />用系统应用打开
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
.pulse { animation: pulse 1.5s ease-in-out infinite }
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.web-source-card { padding: 16px; border: 1px solid transparent; border-radius: 12px; }
.web-source-card--light { background: rgba(255,255,255,.72); border-color: rgba(15,23,42,.08); }
.web-source-card--dark { background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.08); }
.web-source-icon { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
.web-source-provider { display: inline-flex; align-items: center; height: 22px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.web-source-link { width: 100%; min-width: 0; display: flex; align-items: center; gap: 6px; color: #818cf8; font-size: 12.5px; line-height: 20px; text-align: left; }
.web-source-link:hover { color: #6366f1; }
.web-source-details summary { width: fit-content; cursor: pointer; font-size: 12px; line-height: 20px; user-select: none; }
</style>
