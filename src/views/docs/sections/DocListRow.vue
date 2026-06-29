<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'dblclick', 'contextmenu', 'open', 'chat', 'rename', 'delete', 'preview'])

const isDir = computed(() => props.item.isDirectory)
const ext = computed(() => (props.item.name || '').split('.').pop().toLowerCase())

const typeLabel = computed(() => {
  if (isDir.value) return '文件夹'
  const map = {
    pdf: 'PDF', md: 'Markdown', markdown: 'Markdown', docx: 'Word', doc: 'Word',
    txt: 'Text', xlsx: 'Excel', xls: 'Excel', pptx: 'PPT', ppt: 'PPT',
    png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', svg: 'SVG',
    zip: 'Archive', mp4: 'Video', mp3: 'Audio', csv: 'CSV',
    json: 'JSON', js: 'JS', ts: 'TS', py: 'Python', html: 'HTML', css: 'CSS',
  }
  return map[ext.value] || ext.value.toUpperCase()
})

const theme = computed(() => {
  if (isDir.value) return {
    icon: 'ri-folder-3-fill',
    color: props.isDark ? 'text-amber-400' : 'text-amber-500',
    bg: props.isDark ? 'bg-amber-400/8' : 'bg-amber-50',
    chipBg: props.isDark ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-200',
  }
  const map = {
    pdf: ['ri-file-pdf-2-fill', 'red'],
    md: ['ri-markdown-fill', 'brand'], markdown: ['ri-markdown-fill', 'brand'],
    docx: ['ri-file-word-2-fill', 'blue'], doc: ['ri-file-word-2-fill', 'blue'],
    xlsx: ['ri-file-excel-2-fill', 'emerald'], xls: ['ri-file-excel-2-fill', 'emerald'],
    pptx: ['ri-file-ppt-2-fill', 'orange'], ppt: ['ri-file-ppt-2-fill', 'orange'],
    png: ['ri-image-fill', 'purple'], jpg: ['ri-image-fill', 'purple'],
    jpeg: ['ri-image-fill', 'purple'], gif: ['ri-image-fill', 'purple'],
    svg: ['ri-image-fill', 'yellow'], webp: ['ri-image-fill', 'purple'],
    zip: ['ri-file-zip-fill', 'gray'], rar: ['ri-file-zip-fill', 'gray'],
    mp4: ['ri-movie-fill', 'violet'], mp3: ['ri-music-fill', 'pink'],
    json: ['ri-braces-line', 'yellow'],
    js: ['ri-javascript-fill', 'yellow'], ts: ['ri-code-s-slash-line', 'blue'],
    py: ['ri-code-s-slash-line', 'emerald'], java: ['ri-code-s-slash-line', 'red'],
    html: ['ri-html5-fill', 'orange'], css: ['ri-css3-fill', 'blue'],
    txt: ['ri-file-text-fill', 'gray'], csv: ['ri-file-text-fill', 'emerald'],
  }
  const [icon, color] = map[ext.value] || ['ri-file-3-line', 'gray']
  return {
    icon,
    color: props.isDark ? `text-${color}-400` : `text-${color}-500`,
    bg: props.isDark ? `bg-${color}-400/8` : `bg-${color}-50`,
    chipBg: props.isDark ? 'text-wt-dim bg-d4 border border-bdr' : 'text-lt-aux bg-l4 border border-bdrF',
  }
})

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '--'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(isoStr) {
  if (!isoStr) return '--'
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div
    @click="emit('click', item)" @dblclick="emit('dblclick', item)" @contextmenu="emit('contextmenu', $event, item)"
    class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group relative border border-transparent"
    :class="[
      selected
        ? (isDir
            ? (isDark ? 'bg-amber-400/8 border-amber-400/30' : 'bg-amber-50 border-amber-200')
            : (isDark ? 'bg-brand-400/8 border-brand-400/30' : 'bg-brand-50 border-brand-200'))
        : (isDark ? 'hover:bg-white/4' : 'hover:bg-l3')
    ]">

    <!-- Icon: same size for folder & file, folder distinguished by amber bg -->
    <div :class="[
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
        theme.bg
      ]">
      <i :class="[theme.icon, theme.color, 'text-[17px]']" />
    </div>

    <!-- Name + meta -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] truncate"
          :class="[
            isDir ? 'font-semibold' : 'font-medium',
            isDark ? 'text-wt-main' : 'text-lt-main'
          ]">{{ item.name }}</span>
        <i v-if="isDir" class="ri-arrow-right-s-line text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"
          :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
      </div>
      <div class="flex items-center gap-2 mt-0.5">
        <span class="ctx-pill shrink-0" :class="theme.chipBg">
          <i :class="isDir ? 'ri-folder-line' : 'ri-file-line'" class="text-[10px]" />
          {{ typeLabel }}
        </span>
        <span v-if="!isDir" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatSize(item.size) }}</span>
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatDate(item.modifiedTime) }}</span>
      </div>
    </div>

    <!-- Hover actions -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      <button v-if="!isDir" @click.stop="emit('preview', item)"
        class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-brand-400/12' : 'text-lt-aux hover:text-brand-500 hover:bg-brand-50'"
        title="预览">
        <i class="ri-eye-line text-[12px]" />
      </button>
      <button @click.stop="emit('chat', item)"
        class="h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
        <i class="ri-chat-1-line text-[11px]" />对话
      </button>
      <button @click.stop="emit('rename', item)"
        class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
        title="重命名">
        <i class="ri-edit-line text-[12px]" />
      </button>
      <button @click.stop="emit('delete', item)"
        class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
        title="删除">
        <i class="ri-delete-bin-line text-[12px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill { font-size: 10.5px; border-radius: 5px; padding: 2px 6px; display: inline-flex; align-items: center; gap: 3px; transition: all .15s }
</style>
