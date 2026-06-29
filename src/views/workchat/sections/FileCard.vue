<script setup>
import { computed } from 'vue'

const props = defineProps({
  file: Object,
  isDark: Boolean,
})

const emit = defineEmits(['preview'])

const ext = computed(() => (props.file.name || '').split('.').pop().toLowerCase())

function openExternally() {
  if (props.file.path && window.electronAPI?.openPath) {
    window.electronAPI.openPath(props.file.path)
  }
}

function showInFolder() {
  if (props.file.path && window.electronAPI?.showItemInFolder) {
    window.electronAPI.showItemInFolder(props.file.path)
  }
}

function copyPath() {
  if (props.file.path) {
    navigator.clipboard.writeText(props.file.path)
  }
}

const fileCategory = computed(() => {
  const e = ext.value
  if (['pdf'].includes(e)) return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image'
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(e)) return 'audio'
  if (['mp4', 'webm', 'avi', 'mov'].includes(e)) return 'video'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'css', 'html', 'vue', 'jsx', 'tsx'].includes(e)) return 'code'
  if (['md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv'].includes(e)) return 'text'
  return 'other'
})

const fileIcon = computed(() => ({
  pdf: 'ri-file-pdf-2-line',
  image: 'ri-image-line',
  audio: 'ri-music-line',
  video: 'ri-video-line',
  code: 'ri-code-s-slash-line',
  text: 'ri-file-text-line',
  other: 'ri-file-line',
}[fileCategory.value]))

const iconColor = computed(() => ({
  pdf: isD => isD ? 'text-red-400' : 'text-red-500',
  image: isD => isD ? 'text-emerald-400' : 'text-emerald-500',
  audio: isD => isD ? 'text-sky-400' : 'text-sky-500',
  video: isD => isD ? 'text-violet-400' : 'text-violet-500',
  code: isD => isD ? 'text-brand-400' : 'text-brand-500',
  text: isD => isD ? 'text-amber-400' : 'text-amber-500',
  other: isD => isD ? 'text-wt-dim' : 'text-lt-aux',
}[fileCategory.value](props.isDark)))

const iconBg = computed(() => ({
  pdf: isD => isD ? 'bg-red-400/10' : 'bg-red-50',
  image: isD => isD ? 'bg-emerald-400/10' : 'bg-emerald-50',
  audio: isD => isD ? 'bg-sky-400/10' : 'bg-sky-50',
  video: isD => isD ? 'bg-violet-400/10' : 'bg-violet-50',
  code: isD => isD ? 'bg-brand-400/10' : 'bg-brand-50',
  text: isD => isD ? 'bg-amber-400/10' : 'bg-amber-50',
  other: isD => isD ? 'bg-d4' : 'bg-l4',
}[fileCategory.value](props.isDark)))

const stripeColor = computed(() => ({
  pdf: isD => isD ? 'bg-red-400' : 'bg-red-500',
  image: isD => isD ? 'bg-emerald-400' : 'bg-emerald-500',
  audio: isD => isD ? 'bg-sky-400' : 'bg-sky-500',
  video: isD => isD ? 'bg-violet-400' : 'bg-violet-500',
  code: isD => isD ? 'bg-brand-400' : 'bg-brand-500',
  text: isD => isD ? 'bg-amber-400' : 'bg-amber-500',
  other: isD => isD ? 'bg-wt-dim' : 'bg-lt-aux',
}[fileCategory.value](props.isDark)))

const typeLabel = computed(() => ({
  pdf: 'PDF', image: '图片', audio: '音频', video: '视频',
  code: '代码', text: '文档', other: '文件',
}[fileCategory.value]))

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="group relative flex items-stretch gap-2 p-3 rounded-xl cursor-pointer transition-colors"
    :class="isDark ? 'bg-d0 border border-d4 hover:border-brand-400/30' : 'bg-l2 border border-bdrF hover:border-brand-400'"
    @click="emit('preview')">
    <!-- Color stripe -->
    <div class="w-[3px] rounded-full shrink-0" :class="stripeColor" />
    <!-- Icon -->
    <div class="w-[32px] h-[32px] rounded-lg flex items-center justify-center shrink-0 self-center"
      :class="iconBg">
      <i :class="[fileIcon, 'text-[16px]', iconColor]" />
    </div>
    <!-- Info -->
    <div class="flex-1 min-w-0 self-center">
      <div class="text-[13px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</div>
      <div class="flex items-center gap-2 mt-0.5">
        <span class="text-[10px] px-1 py-0.5 rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ typeLabel }}</span>
        <span v-if="file.size" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatSize(file.size) }}</span>
      </div>
    </div>
    <!-- Hover actions -->
    <div class="self-center opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
      <button @click.stop="openExternally" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="打开">
        <i class="ri-external-link-line text-[12px]" />
      </button>
      <button @click.stop="copyPath" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="复制路径">
        <i class="ri-clipboard-line text-[12px]" />
      </button>
      <button @click.stop="showInFolder" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="在文件夹中显示">
        <i class="ri-folder-open-line text-[12px]" />
      </button>
    </div>
  </div>
</template>
