<script setup>
import md from '@/utils/markdown'
import { toFileUrl } from '@/utils/fileUrl'
import { computed } from 'vue'

const props = defineProps({
  file: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'chat'])

const api = () => window.electronAPI

const ext = computed(() => (props.file?.ext || props.file?.name?.split('.').pop() || '').toLowerCase())
const fileUrl = computed(() => toFileUrl(props.file?.path))

const renderedMarkdown = computed(() => {
  if (!props.file || typeof props.file.content !== 'string') return ''
  if (['md', 'markdown'].includes(ext.value)) return md.render(props.file.content)
  return ''
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
          class="h-7 px-2.5 rounded-lg text-[10.5px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
          <i class="ri-chat-1-line text-[11px]" />对话
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="openExternally"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="用系统应用打开">
          <i class="ri-external-link-line text-[12px]" />
        </button>
        <button @click="copyPath"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="复制路径">
          <i class="ri-clipboard-line text-[12px]" />
        </button>
        <button @click="showInFolder"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="在资源管理器中显示">
          <i class="ri-folder-open-line text-[12px]" />
        </button>
        <div class="w-px h-4 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="emit('close')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
          title="关闭预览">
          <i class="ri-close-line text-[13px]" />
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
      <div v-else-if="renderedMarkdown" class="p-6">
        <div class="max-w-4xl mx-auto rounded-xl p-6 chat-markdown" :class="[isDark ? 'bg-d3 chat-markdown--dark' : 'bg-l3']"
          v-html="renderedMarkdown" />
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
@use '@/styles/chat-markdown.scss';
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
.pulse { animation: pulse 1.5s ease-in-out infinite }
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
</style>
