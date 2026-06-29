<script setup>
import md from '@/utils/markdown'
import { normalizeFilePath, toFileUrl } from '@/utils/fileUrl'
import { computed } from 'vue'

const props = defineProps({ previewFile: Object, isDark: Boolean })

const emit = defineEmits(['preview-file', 'close'])

const normalizedPath = computed(() => normalizeFilePath(props.previewFile?.path))
const fileName = computed(() => {
  const rawName = props.previewFile?.name || normalizedPath.value.split(/[\\/]/).pop() || ''
  return normalizeFilePath(rawName)
})
const ext = computed(() => (fileName.value || normalizedPath.value).split('.').pop().toLowerCase())
const fileUrl = computed(() => toFileUrl(normalizedPath.value))

const renderedContent = computed(() => {
  const raw = props.previewFile?.content
  if (typeof raw !== 'string' || !raw) return ''
  if (['md', 'markdown'].includes(ext.value)) return md.render(raw)
  return ''
})

const isImage = computed(() => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext.value))
const isAudio = computed(() => ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext.value))
const isVideo = computed(() => ['mp4', 'webm', 'avi', 'mov', 'mkv'].includes(ext.value))
const isHtml = computed(() => ['html', 'htm'].includes(ext.value))
const hasContent = computed(() => typeof props.previewFile?.content === 'string')
const hasError = computed(() => !!props.previewFile?.error)
const isLoading = computed(() => normalizedPath.value && !hasContent.value && !hasError.value && !isImage.value && !isAudio.value && !isVideo.value)
const isText = computed(() => hasContent.value && !isImage.value && !isAudio.value && !isVideo.value && !isHtml.value)
const hasFile = computed(() => !!normalizedPath.value)

function openExternally() {
  if (normalizedPath.value && window.electronAPI?.openPath) window.electronAPI.openPath(normalizedPath.value)
}

function showInFolder() {
  if (normalizedPath.value && window.electronAPI?.showItemInFolder) window.electronAPI.showItemInFolder(normalizedPath.value)
}

function copyPath() {
  if (normalizedPath.value) {
    navigator.clipboard.writeText(normalizedPath.value)
  }
}

function closePreview() {
  emit('close')
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header bar -->
    <div v-if="hasFile" class="flex items-center gap-1 px-3 py-1.5 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <i class="ri-file-3-line text-[12px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span class="text-[11px] truncate min-w-0" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fileName }}</span>
      <div class="ml-auto flex items-center gap-0.5 shrink-0">
        <button @click="openExternally" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="用系统应用打开">
          <i class="ri-external-link-line text-[11px]" />
        </button>
        <button @click="copyPath" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="复制路径">
          <i class="ri-clipboard-line text-[11px]" />
        </button>
        <button @click="showInFolder" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="在文件夹中显示">
          <i class="ri-folder-open-line text-[11px]" />
        </button>
        <div class="w-px h-3 mx-0.5" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        <button @click="closePreview" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'" title="关闭预览">
          <i class="ri-close-line text-[11px]" />
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto thin-scroll">

      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center py-16">
        <div class="text-center">
          <i class="ri-loader-4-line text-[20px] animate-spin" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <p class="text-[11px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</p>
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="hasError" class="p-4">
        <div class="rounded-lg p-5 text-center" :class="isDark ? 'bg-red-500/8 border border-red-500/20' : 'bg-red-50 border border-red-200'">
          <i class="ri-error-warning-line text-[24px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
          <p class="text-[12px] font-medium mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">文件读取失败</p>
          <p class="text-[11px] mt-1 break-all" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ previewFile.error }}</p>
          <button @click="openExternally" class="mt-3 h-7 px-3 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
            <i class="ri-external-link-line text-[11px] mr-1" />用系统应用打开
          </button>
        </div>
      </div>

      <!-- Image -->
      <div v-else-if="hasFile && isImage" class="flex items-center justify-center p-4">
        <img :src="fileUrl" class="max-w-full max-h-[500px] rounded-lg" />
      </div>

      <!-- Audio -->
      <div v-else-if="hasFile && isAudio" class="flex flex-col items-center gap-3 py-6 px-4">
        <i class="ri-music-line text-[28px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <audio controls :src="fileUrl" class="w-full" />
      </div>

      <!-- Video -->
      <div v-else-if="hasFile && isVideo" class="p-4">
        <video controls :src="fileUrl" class="w-full rounded-lg" style="max-height:400px" />
      </div>

      <!-- Markdown rendered -->
      <div v-else-if="renderedContent" class="p-4">
        <div class="md-content rounded-lg p-4 text-[13px] leading-relaxed"
          :class="isDark ? 'bg-d3' : 'bg-l3'" v-html="renderedContent" />
      </div>

      <!-- HTML preview -->
      <div v-else-if="hasFile && isHtml && hasContent" class="p-4">
        <div class="rounded-lg overflow-hidden border" :class="isDark ? 'bg-white border-d4' : 'bg-white border-bdrL'">
          <iframe :srcdoc="previewFile.content" sandbox="allow-scripts allow-same-origin"
            class="w-full border-0" style="min-height:300px;max-height:600px" @load="e => e.target.style.height = e.target.contentDocument?.body?.scrollHeight + 20 + 'px'" />
        </div>
      </div>

      <!-- Plain text / code -->
      <div v-else-if="isText" class="p-4">
        <div class="rounded-lg p-4" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <pre class="text-[12px] font-mono whitespace-pre-wrap break-all leading-relaxed"
            :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ previewFile.content }}</pre>
        </div>
      </div>

      <!-- Unsupported file type (no content, non-media, non-html) -->
      <div v-else-if="hasFile && !hasContent && !isImage && !isAudio && !isVideo && !isHtml"
        class="flex items-center justify-center py-16">
        <div class="text-center">
          <i class="ri-file-unknow-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">此文件类型暂不支持预览</p>
          <button @click="openExternally" class="mt-3 h-7 px-3 rounded-lg text-[11px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
            <i class="ri-external-link-line text-[11px] mr-1" />用系统应用打开
          </button>
        </div>
      </div>

      <!-- Empty state (no file selected) -->
      <div v-else class="flex items-center justify-center py-16">
        <div class="text-center">
          <i class="ri-eye-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">点击对话中的文件路径预览</p>
          <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim/60' : 'text-lt-aux/60'">支持文本 / 代码 / Markdown / 图片 / 音频 / 视频 / HTML</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-content h1, .md-content h2, .md-content h3, .md-content h4 { font-weight: 700; margin: 0.6em 0 0.3em; }
.md-content h1 { font-size: 1.2em; }
.md-content h2 { font-size: 1.1em; }
.md-content p { margin: 0.4em 0; }
.md-content ul, .md-content ol { padding-left: 1.5em; margin: 0.4em 0; }
.md-content code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.88em; padding: 2px 5px; border-radius: 4px; }
.md-content pre { border-radius: 8px; padding: 12px 16px; margin: 0.6em 0; overflow-x: auto; }
.md-content a { color: #6C8AFF; cursor: pointer; }
</style>
