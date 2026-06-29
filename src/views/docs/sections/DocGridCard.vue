<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'dblclick', 'contextmenu', 'open', 'chat', 'preview'])

const isDir = computed(() => props.item.isDirectory)
const ext = computed(() => (props.item.name || '').split('.').pop().toLowerCase())

const typeLabel = computed(() => {
  if (isDir.value) return '文件夹'
  const map = {
    pdf: 'PDF', md: 'Markdown', markdown: 'Markdown',
    docx: 'Word', doc: 'Word', txt: 'Text',
    xlsx: 'Excel', xls: 'Excel', pptx: 'PPT', ppt: 'PPT',
    png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', svg: 'SVG', webp: 'Image',
    zip: 'Archive', rar: 'Archive', '7z': 'Archive',
    mp4: 'Video', mov: 'Video', mp3: 'Audio', wav: 'Audio',
    json: 'JSON', js: 'JS', ts: 'TS', py: 'Python', java: 'Java',
    html: 'HTML', css: 'CSS', csv: 'CSV',
  }
  return map[ext.value] || ext.value.toUpperCase()
})

const fileTheme = computed(() => {
  if (isDir.value) {
    return {
      icon: 'ri-folder-3-fill',
      iconColor: props.isDark ? 'text-amber-400' : 'text-amber-500',
      stripe: props.isDark ? 'bg-amber-400/40' : 'bg-amber-400',
      tint: props.isDark ? 'bg-amber-400/4' : 'bg-amber-50/50',
      hoverBorder: props.isDark ? 'hover:border-amber-400/30' : 'hover:border-amber-300',
    }
  }
  const map = {
    pdf: ['ri-file-pdf-2-fill', 'text-red-400', 'text-red-500'],
    md: ['ri-markdown-fill', 'text-brand-400', 'text-brand-500'],
    markdown: ['ri-markdown-fill', 'text-brand-400', 'text-brand-500'],
    docx: ['ri-file-word-2-fill', 'text-blue-400', 'text-blue-500'],
    doc: ['ri-file-word-2-fill', 'text-blue-400', 'text-blue-500'],
    xlsx: ['ri-file-excel-2-fill', 'text-emerald-400', 'text-emerald-500'],
    xls: ['ri-file-excel-2-fill', 'text-emerald-400', 'text-emerald-500'],
    pptx: ['ri-file-ppt-2-fill', 'text-orange-400', 'text-orange-500'],
    ppt: ['ri-file-ppt-2-fill', 'text-orange-400', 'text-orange-500'],
    txt: ['ri-file-text-fill', 'text-wt-aux', 'text-lt-aux'],
    png: ['ri-image-fill', 'text-purple-400', 'text-purple-500'],
    jpg: ['ri-image-fill', 'text-purple-400', 'text-purple-500'],
    jpeg: ['ri-image-fill', 'text-purple-400', 'text-purple-500'],
    gif: ['ri-image-fill', 'text-purple-400', 'text-purple-500'],
    svg: ['ri-image-fill', 'text-yellow-400', 'text-yellow-500'],
    webp: ['ri-image-fill', 'text-purple-400', 'text-purple-500'],
    zip: ['ri-file-zip-fill', 'text-gray-400', 'text-gray-500'],
    rar: ['ri-file-zip-fill', 'text-gray-400', 'text-gray-500'],
    mp4: ['ri-movie-fill', 'text-violet-400', 'text-violet-500'],
    mp3: ['ri-music-fill', 'text-pink-400', 'text-pink-500'],
    json: ['ri-braces-line', 'text-yellow-400', 'text-yellow-500'],
    js: ['ri-javascript-fill', 'text-yellow-400', 'text-yellow-500'],
    ts: ['ri-code-s-slash-line', 'text-blue-400', 'text-blue-500'],
    py: ['ri-code-s-slash-line', 'text-emerald-400', 'text-emerald-500'],
    html: ['ri-html5-fill', 'text-orange-400', 'text-orange-500'],
    css: ['ri-css3-fill', 'text-blue-400', 'text-blue-500'],
  }
  const m = map[ext.value]
  if (!m) return {
    icon: 'ri-file-3-line',
    iconColor: props.isDark ? 'text-wt-aux' : 'text-lt-aux',
    stripe: props.isDark ? 'bg-wt-dim/30' : 'bg-bdrL',
    tint: '',
    hoverBorder: props.isDark ? 'hover:border-brand-400/30' : 'hover:border-brand-200',
  }
  return {
    icon: m[0],
    iconColor: props.isDark ? m[1] : m[2],
    stripe: '',
    tint: '',
    hoverBorder: props.isDark ? 'hover:border-brand-400/30' : 'hover:border-brand-200',
  }
})

function formatSize(bytes) {
  if (!bytes || bytes === 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <!-- ═══ FOLDER CARD ═══ -->
  <div v-if="isDir"
    @click="emit('click', item)" @dblclick="emit('dblclick', item)" @contextmenu="emit('contextmenu', $event, item)"
    class="doc-card folder-card rounded-xl cursor-pointer overflow-hidden flex flex-col h-[180px] transition-all duration-200 relative group border"
    :class="[
      isDark ? 'bg-d3 border-bdr' : 'bg-l3 border-bdrF',
      fileTheme.hoverBorder,
      selected ? (isDark ? 'ring-1 ring-amber-400/40' : 'ring-1 ring-amber-300') : '',
    ]">
    <!-- Subtle folder gradient overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-60"
      :class="isDark ? 'bg-gradient-to-br from-amber-400/4 to-transparent' : 'bg-gradient-to-br from-amber-50/80 to-transparent'" />

    <!-- Card body -->
    <div class="relative flex-1 flex flex-col items-center justify-center px-3 pt-4 pb-2">
      <!-- Folder badge top-right -->
      <span class="absolute top-2 right-2 ctx-pill !text-[9px] !py-0.5 !px-1.5"
        :class="isDark ? 'text-amber-400 bg-amber-400/12 border border-amber-400/20' : 'text-amber-600 bg-amber-100/80 border border-amber-200'">
        <i class="ri-folder-line text-[9px]" />文件夹
      </span>
      <!-- Icon -->
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-transform group-hover:scale-105"
        :class="isDark ? 'bg-amber-400/12' : 'bg-amber-100/80'">
        <i :class="[fileTheme.icon, fileTheme.iconColor]" class="text-[28px]" />
      </div>
      <!-- Name -->
      <span class="text-[12px] font-semibold text-center truncate w-full px-1"
        :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.name }}</span>
      <!-- Meta: child count -->
      <span class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ (item.childCount != null) ? `${item.childCount} 项` : '文件夹' }}
      </span>
    </div>

    <!-- Footer actions -->
    <div class="relative shrink-0 flex items-center gap-1 px-3 pb-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button @click.stop="emit('open', item)"
        class="flex-1 h-6 rounded-md text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
        :class="isDark ? 'bg-amber-400/12 text-amber-400 hover:bg-amber-400/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'">
        <i class="ri-folder-open-line text-[10px]" />进入
      </button>
      <button @click.stop="emit('chat', item)"
        class="h-6 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'bg-d0 text-wt-aux hover:text-wt-sub' : 'bg-white text-lt-aux hover:text-lt-sub'">
        <i class="ri-chat-1-line text-[10px]" />
      </button>
    </div>
  </div>

  <!-- ═══ FILE CARD ═══ -->
  <div v-else
    @click="emit('click', item)" @dblclick="emit('dblclick', item)" @contextmenu="emit('contextmenu', $event, item)"
    class="doc-card file-card rounded-xl cursor-pointer overflow-hidden flex flex-col h-[180px] transition-all duration-200 relative group border"
    :class="[
      isDark ? 'bg-d3 border-bdr' : 'bg-l3 border-bdrF',
      fileTheme.hoverBorder,
      selected ? (isDark ? 'ring-1 ring-brand-400/40' : 'ring-1 ring-brand-200') : '',
    ]">
    <!-- Card body -->
    <div class="flex-1 flex flex-col items-center justify-center px-3 pt-4 pb-2">
      <!-- Type label badge top-right -->
      <span class="absolute top-2 right-2 ctx-pill !text-[9px] !py-0.5 !px-1.5"
        :class="isDark ? 'text-wt-dim bg-d0/80 border border-bdr' : 'text-lt-aux bg-white/80 border border-bdrF'">
        {{ typeLabel }}
      </span>
      <!-- Icon -->
      <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-2 transition-transform group-hover:scale-105"
        :class="isDark ? 'bg-d0' : 'bg-l1'">
        <i :class="[fileTheme.icon, fileTheme.iconColor]" class="text-[28px]" />
      </div>
      <!-- Name -->
      <span class="text-[12px] font-medium text-center truncate w-full px-1"
        :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.name }}</span>
      <!-- Meta -->
      <span class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ formatSize(item.size) || '--' }}
      </span>
    </div>

    <!-- Card footer: actions -->
    <div class="shrink-0 flex items-center gap-1 px-3 pb-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button @click.stop="emit('preview', item)"
        class="flex-1 h-6 rounded-md text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
        :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
        <i class="ri-eye-line text-[10px]" />预览
      </button>
      <button @click.stop="emit('chat', item)"
        class="h-6 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'bg-d0 text-wt-aux hover:text-wt-sub' : 'bg-white text-lt-aux hover:text-lt-sub'">
        <i class="ri-chat-1-line text-[10px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.doc-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.06) }
.folder-card:hover { transform: translateY(-1px) }
</style>
