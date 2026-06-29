<script setup>
import md from '@/utils/markdown'
import { toFileUrl } from '@/utils/fileUrl'
import { computed } from 'vue'

const props = defineProps({
  previewFile: Object,
  isDark: Boolean,
  width: Number,
})

const emit = defineEmits(['close', 'resize'])

const fileUrl = computed(() => toFileUrl(props.previewFile?.path))

function openExternally() {
  if (props.previewFile?.path && window.electronAPI?.openPath) {
    window.electronAPI.openPath(props.previewFile.path)
  }
}

function showInFolder() {
  if (props.previewFile?.path && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(props.previewFile.path)
  }
}

function copyPath() {
  if (props.previewFile?.path) {
    navigator.clipboard.writeText(props.previewFile.path)
  }
}

const renderedContent = computed(() => {
  if (!props.previewFile?.content) return ''
  const ext = (props.previewFile.name || '').split('.').pop().toLowerCase()
  if (['md', 'markdown', 'txt'].includes(ext)) return md.render(props.previewFile.content)
  return ''
})

const isImage = computed(() => {
  const ext = (props.previewFile?.name || '').split('.').pop().toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
})

const isAudio = computed(() => {
  const ext = (props.previewFile?.name || '').split('.').pop().toLowerCase()
  return ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)
})

const isVideo = computed(() => {
  const ext = (props.previewFile?.name || '').split('.').pop().toLowerCase()
  return ['mp4', 'webm', 'avi', 'mov'].includes(ext)
})
</script>

<template>
  <div class="flex flex-col shrink-0"
    :class="isDark ? 'bg-d1' : 'bg-l1'"
    :style="{ width: width + 'px', borderLeft: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }">
    <!-- Header -->
    <div class="h-9 flex items-center justify-between px-3 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-eye-line text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">预览</span>
        <span v-if="previewFile" class="text-[11px] truncate max-w-[140px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ previewFile.name }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button v-if="previewFile?.path" @click="openExternally"
          class="h-6 w-6 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="打开">
          <i class="ri-external-link-line text-[12px]" />
        </button>
        <button v-if="previewFile?.path" @click="copyPath"
          class="h-6 w-6 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="复制路径">
          <i class="ri-clipboard-line text-[12px]" />
        </button>
        <button v-if="previewFile?.path" @click="showInFolder"
          class="h-6 w-6 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="在文件夹中显示">
          <i class="ri-folder-open-line text-[12px]" />
        </button>
        <button @click="emit('close')"
          class="h-6 w-6 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i class="ri-close-line text-[12px]" />
        </button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="previewFile" class="flex-1 overflow-y-auto p-4">
      <!-- Image -->
      <div v-if="isImage" class="flex items-center justify-center">
        <img :src="fileUrl" class="max-w-full max-h-[500px] rounded-lg" />
      </div>
      <!-- Audio -->
      <div v-if="isAudio" class="flex flex-col items-center gap-3 py-4">
        <i class="ri-music-line text-[24px] text-brand-400" />
        <audio controls :src="fileUrl" class="w-full" />
      </div>
      <!-- Video -->
      <div v-if="isVideo">
        <video controls :src="fileUrl" class="w-full rounded-lg" style="max-height:400px" />
      </div>
      <!-- Markdown/Text -->
      <div v-if="renderedContent" class="md-content rounded-lg p-4 text-[13px] leading-relaxed"
        :class="isDark ? 'bg-d3' : 'bg-l3'" v-html="renderedContent" />
      <!-- Code fallback -->
      <div v-if="!isImage && !isAudio && !isVideo && !renderedContent && previewFile.content"
        class="rounded-lg p-4" :class="isDark ? 'bg-d3' : 'bg-l3'">
        <pre class="text-[12px] font-mono whitespace-pre-wrap" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ previewFile.content }}</pre>
      </div>
      <!-- No content -->
      <div v-if="!previewFile.content && !isImage && !isAudio && !isVideo"
        class="flex items-center justify-center py-8"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <div class="text-center">
          <i class="ri-file-line text-[28px] mb-2" />
          <p class="text-[12px]">文件预览不可用</p>
          <p class="text-[11px]">仅支持文本、Markdown、图片、音视频文件</p>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!previewFile" class="flex-1 flex items-center justify-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <div class="text-center"><i class="ri-file-line text-[28px] mb-2" /><p class="text-[12px]">点击对话中的文件卡片预览</p></div>
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