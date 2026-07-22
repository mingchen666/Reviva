<script setup>
import { toFileUrl } from '@/utils/fileUrl'
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import TextPreview from './preview/TextPreview.vue'
import UnsupportedPreview from './preview/UnsupportedPreview.vue'

const HtmlPreview = defineAsyncComponent(() => import('./preview/HtmlPreview.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('./preview/MarkdownPreview.vue'))
const PdfPreview = defineAsyncComponent(() => import('./preview/PdfPreview.vue'))
const MediaPreview = defineAsyncComponent(() => import('./preview/MediaPreview.vue'))

const props = defineProps({
  file: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'chat', 'media-details'])

const api = () => window.electronAPI

const ext = computed(() => (props.file?.ext || props.file?.name?.split('.').pop() || '').toLowerCase())
const fileUrl = computed(() => toFileUrl(props.file?.path))
const htmlSource = computed(() => ext.value === 'html' || ext.value === 'htm' ? String(props.file?.content || '') : '')
const showLoading = ref(false)
const MINIMUM_LOADING_DURATION = 350
let loadingTimer = null
let minimumLoadingElapsed = false

const previewStateKey = computed(() => {
  const path = props.file?.path || 'preview'
  if (showLoading.value) return `${path}:loading`
  if (props.file?.error) return `${path}:error`
  return `${path}:content`
})

function clearLoadingTimer() {
  if (loadingTimer) clearTimeout(loadingTimer)
  loadingTimer = null
}

function startLoadingIndicator() {
  clearLoadingTimer()
  minimumLoadingElapsed = false
  showLoading.value = true
  loadingTimer = setTimeout(() => {
    loadingTimer = null
    minimumLoadingElapsed = true
    if (!props.file?.loading) showLoading.value = false
  }, MINIMUM_LOADING_DURATION)
}

watch(
  () => props.file?.path,
  startLoadingIndicator,
  { immediate: true },
)

watch(
  () => props.file?.loading,
  (loading) => {
    if (loading) {
      if (!showLoading.value) startLoadingIndicator()
      return
    }
    if (minimumLoadingElapsed) showLoading.value = false
  },
)

onBeforeUnmount(clearLoadingTimer)


const fileIconAndColor = computed(() => {
  const map = {
    // 文档
    pdf: ['ri-file-pdf-2-fill', 'red'],
    md: ['ri-markdown-fill', 'brand'], markdown: ['ri-markdown-fill', 'brand'],
    docx: ['ri-file-word-2-fill', 'blue'], doc: ['ri-file-word-2-fill', 'blue'],
    xlsx: ['ri-file-excel-2-fill', 'emerald'], xls: ['ri-file-excel-2-fill', 'emerald'],
    pptx: ['ri-file-ppt-2-fill', 'orange'], ppt: ['ri-file-ppt-2-fill', 'orange'],
    txt: ['ri-file-text-fill', 'gray'], csv: ['ri-file-text-fill', 'emerald'],
    json: ['ri-braces-line', 'yellow'],
    // 代码
    js: ['ri-javascript-fill', 'yellow'],
    ts: ['ri-code-s-slash-line', 'blue'],
    py: ['ri-code-s-slash-line', 'emerald'],
    html: ['ri-html5-fill', 'orange'], css: ['ri-css3-fill', 'blue'],
    // 图片
    png: ['ri-image-fill', 'purple'], jpg: ['ri-image-fill', 'purple'],
    jpeg: ['ri-image-fill', 'purple'], gif: ['ri-image-fill', 'purple'],
    webp: ['ri-image-fill', 'purple'], svg: ['ri-image-fill', 'purple'],
    ico: ['ri-image-fill', 'purple'], avif: ['ri-image-fill', 'purple'],
    // 🎬 视频（violet）
    mp4: ['ri-movie-fill', 'violet'],
    avi: ['ri-movie-fill', 'violet'],
    mkv: ['ri-movie-fill', 'violet'],
    mov: ['ri-movie-fill', 'violet'],
    webm: ['ri-movie-fill', 'violet'],
    flv: ['ri-movie-fill', 'violet'],
    wmv: ['ri-movie-fill', 'violet'],
    // 🎵 音频（pink）
    mp3: ['ri-music-fill', 'pink'],
    wav: ['ri-music-fill', 'pink'],
    flac: ['ri-music-fill', 'pink'],
    aac: ['ri-music-fill', 'pink'],
    ogg: ['ri-music-fill', 'pink'],
    wma: ['ri-music-fill', 'pink'],
    m4a: ['ri-music-fill', 'pink'],
    // 压缩包
    zip: ['ri-file-zip-fill', 'gray'],
    rar: ['ri-file-zip-fill', 'gray'],
    '7z': ['ri-file-zip-fill', 'gray'],
    tar: ['ri-file-zip-fill', 'gray'],
    gz: ['ri-file-zip-fill', 'gray'],
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
    pdf: 'PDF', md: 'Markdown', markdown: 'Markdown',
    docx: 'Word', doc: 'Word', txt: 'Text',
    xlsx: 'Excel', xls: 'Excel', pptx: 'PPT', ppt: 'PPT',
    csv: 'CSV', json: 'JSON',
    js: 'JS', ts: 'TS', py: 'Python', html: 'HTML', css: 'CSS',
    // 图片
    png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image',
    webp: 'Image', svg: 'SVG', ico: 'Icon', avif: 'Image',
    // 🎬 视频
    mp4: 'Video', avi: 'Video', mkv: 'Video',
    mov: 'Video', webm: 'Video', flv: 'Video', wmv: 'Video',
    // 🎵 音频
    mp3: 'Audio', wav: 'Audio', flac: 'Audio',
    aac: 'Audio', ogg: 'Audio', wma: 'Audio', m4a: 'Audio',
    // 压缩包
    zip: 'Archive', rar: 'Archive', '7z': 'Archive',
    tar: 'Archive', gz: 'Archive',
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
</script>

<template>
  <div v-if="file" class="h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <!-- Header -->
    <div class="h-12 flex items-center gap-3 px-5 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="fileIconAndColor.bg">
        <i :class="[fileIconAndColor.icon, fileIconAndColor.color]" class="text-[18px]" />
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
        <button v-if="file.mediaType === 'audio' || file.mediaType === 'video'" @click="emit('media-details', file)"
          class="h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'bg-violet-400/10 text-violet-300 hover:bg-violet-400/16' : 'bg-violet-50 text-violet-600 hover:bg-violet-100'">
          <i class="ri-file-list-3-line text-[13px]" />解析详情
        </button>
        <button @click="emit('chat', file)"
          class="h-7 px-2.5 rounded-lg text-[14px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
          <i class="ri-chat-ai-4-line text-[14px]" />对话
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="openExternally"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="用系统应用打开">
          <i class="ri-external-link-line text-[16px]" />
        </button>
        <button @click="copyPath"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="复制路径">
          <i class="ri-clipboard-line text-[16px]" />
        </button>
        <button @click="showInFolder"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="在资源管理器中显示">
          <i class="ri-folder-open-line text-[16px]" />
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="emit('close')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
          title="关闭预览">
          <i class="ri-close-line text-[20px]" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 min-h-0 overflow-hidden" :aria-busy="showLoading">
      <Transition name="preview-content" mode="out-in">
        <div :key="previewStateKey" class="h-full overflow-y-auto">
          <!-- Loading -->
          <div v-if="showLoading" class="preview-loading-shell text-center px-6" role="status" aria-live="polite">
            <div>
              <div class="preview-loading-mark mx-auto">
                <i
                  class="ri-loader-4-line preview-loading-spinner text-[44px]"
                  :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                <div
                  class="absolute -right-1 -bottom-1 w-6 h-6 rounded-lg flex items-center justify-center border"
                  :class="[
                    fileIconAndColor.bg,
                    isDark ? 'border-d4 shadow-[0_2px_8px_rgba(0,0,0,.28)]' : 'border-white shadow-sm',
                  ]">
                  <i :class="[fileIconAndColor.icon, fileIconAndColor.color]" class="text-[12px]" />
                </div>
              </div>
              <p class="text-[12px] font-medium mt-3" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                正在加载「{{ file.name }}」
              </p>
              <p class="text-[10.5px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在准备文档预览</p>
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

          <!-- PDF -->
          <PdfPreview v-else-if="file.pdfStatus" :file="file" :is-dark="isDark" />

          <!-- Media -->
          <MediaPreview v-else-if="file.mediaType || file.remoteMediaReference" :file="file" :file-url="fileUrl" :is-dark="isDark" @details="emit('media-details', $event)" />
          <!-- Markdown -->
          <MarkdownPreview v-else-if="ext === 'md' || ext === 'markdown'" :content="String(file.content || '')" :is-dark="isDark" />
          <!-- Sanitized HTML -->
          <HtmlPreview v-else-if="htmlSource" :source="htmlSource" :file-path="file.path" :is-dark="isDark" />

          <!-- Plain text / code -->
          <TextPreview v-else-if="typeof file.content === 'string'" :content="file.content" :is-dark="isDark" :icon="fileIconAndColor.icon" :icon-color="fileIconAndColor.color" :type-label="typeLabel" />

          <!-- Unsupported -->
          <UnsupportedPreview v-else-if="file.unsupported" :file="file" :is-dark="isDark" :icon="fileIconAndColor.icon" :icon-color="fileIconAndColor.color" :icon-bg="fileIconAndColor.bg" :type-label="typeLabel" @open-externally="openExternally" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
@keyframes preview-spin { to { transform: rotate(360deg) } }
.preview-loading-shell { height: 100%; min-height: 280px; display: flex; align-items: center; justify-content: center; }
.preview-loading-mark { position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
.preview-loading-spinner { display: block; line-height: 1; animation: preview-spin .72s linear infinite; will-change: transform; }
.preview-content-enter-active { transition: opacity 180ms cubic-bezier(.25, 1, .5, 1); }
.preview-content-leave-active { transition: opacity 120ms cubic-bezier(.25, 1, .5, 1); }
.preview-content-enter-from,
.preview-content-leave-to { opacity: 0; }
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.web-source-card { padding: 16px; border: 1px solid transparent; border-radius: 12px; }
.web-source-card--light { background: rgba(255,255,255,.72); border-color: rgba(15,23,42,.08); }
.web-source-card--dark { background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.08); }
.web-source-icon { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; }
.web-source-provider { display: inline-flex; align-items: center; height: 22px; padding: 0 7px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.web-source-link { width: 100%; min-width: 0; display: flex; align-items: center; gap: 6px; color: #818cf8; font-size: 12.5px; line-height: 20px; text-align: left; }
.web-source-link:hover { color: #6366f1; }
.web-source-details summary { width: fit-content; cursor: pointer; font-size: 12px; line-height: 20px; user-select: none; }

@media (prefers-reduced-motion: reduce) {
  .preview-loading-spinner { animation: none; }
  .preview-content-enter-active,
  .preview-content-leave-active { transition: none; }
}
</style>




