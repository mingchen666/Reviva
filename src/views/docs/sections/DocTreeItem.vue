<script setup>
import MsTreeItem from '@/components/MsTreeItem/MsTreeItem.vue'
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  activePath: { type: String, default: '' },
  level: { type: Number, default: 0 },
})

const emit = defineEmits(['select-folder', 'toggle-folder', 'select-file', 'contextmenu-folder', 'contextmenu-file'])

const isExpanded = computed(() => props.node.expanded)
const hasChildren = computed(() => (props.node.children?.length || 0) + (props.node.files?.length || 0) > 0)
const childCount = computed(() => (props.node.children?.length || 0) + (props.node.files?.length || 0))
const folderIcon = computed(() => isExpanded.value ? 'ri-folder-open-fill' : 'ri-folder-3-fill')

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const map = {
    md: 'ri-markdown-fill', markdown: 'ri-markdown-fill',
    pdf: 'ri-file-pdf-2-fill',
    doc: 'ri-file-word-2-fill', docx: 'ri-file-word-2-fill',
    xls: 'ri-file-excel-2-fill', xlsx: 'ri-file-excel-2-fill',
    ppt: 'ri-file-ppt-2-fill', pptx: 'ri-file-ppt-2-fill',
    txt: 'ri-file-text-fill',
    json: 'ri-braces-line', yaml: 'ri-code-s-slash-line', yml: 'ri-code-s-slash-line',
    js: 'ri-javascript-fill', ts: 'ri-code-s-slash-line',
    py: 'ri-code-s-slash-line', java: 'ri-code-s-slash-line',
    html: 'ri-html5-fill', css: 'ri-css3-fill',
    png: 'ri-image-fill', jpg: 'ri-image-fill', jpeg: 'ri-image-fill',
    gif: 'ri-image-fill', svg: 'ri-image-fill', webp: 'ri-image-fill',
    mp3: 'ri-music-fill', wav: 'ri-music-fill', flac: 'ri-music-fill',
    mp4: 'ri-movie-fill', avi: 'ri-movie-fill', mov: 'ri-movie-fill',
    zip: 'ri-file-zip-fill', rar: 'ri-file-zip-fill', '7z': 'ri-file-zip-fill',
    sh: 'ri-terminal-box-line', bat: 'ri-terminal-box-line',
  }
  return map[ext] || 'ri-file-3-line'
}

function fileIconColorClass(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const darkMap = {
    md: 'text-brand-400', markdown: 'text-brand-400',
    pdf: 'text-red-400',
    doc: 'text-blue-400', docx: 'text-blue-400',
    xls: 'text-emerald-400', xlsx: 'text-emerald-400',
    ppt: 'text-orange-400', pptx: 'text-orange-400',
    txt: 'text-wt-aux',
    json: 'text-yellow-400', yaml: 'text-yellow-400', yml: 'text-yellow-400',
    js: 'text-yellow-400', ts: 'text-blue-400',
    py: 'text-emerald-400', java: 'text-red-400',
    html: 'text-orange-400', css: 'text-blue-400',
    png: 'text-purple-400', jpg: 'text-purple-400', jpeg: 'text-purple-400',
    gif: 'text-purple-400', svg: 'text-yellow-400', webp: 'text-purple-400',
    mp3: 'text-pink-400', wav: 'text-pink-400',
    mp4: 'text-violet-400', avi: 'text-violet-400',
    zip: 'text-gray-400', rar: 'text-gray-400',
  }
  const lightMap = {
    md: 'text-brand-500', markdown: 'text-brand-500',
    pdf: 'text-red-500',
    doc: 'text-blue-500', docx: 'text-blue-500',
    xls: 'text-emerald-500', xlsx: 'text-emerald-500',
    ppt: 'text-orange-500', pptx: 'text-orange-500',
    txt: 'text-lt-aux',
    json: 'text-yellow-500', yaml: 'text-yellow-500', yml: 'text-yellow-500',
    js: 'text-yellow-500', ts: 'text-blue-500',
    py: 'text-emerald-500', java: 'text-red-500',
    html: 'text-orange-500', css: 'text-blue-500',
    png: 'text-purple-500', jpg: 'text-purple-500', jpeg: 'text-purple-500',
    gif: 'text-purple-500', svg: 'text-yellow-500', webp: 'text-purple-500',
    mp3: 'text-pink-500', wav: 'text-pink-500',
    mp4: 'text-violet-500', avi: 'text-violet-500',
    zip: 'text-gray-500', rar: 'text-gray-500',
  }
  const map = props.isDark ? darkMap : lightMap
  return map[ext] || (props.isDark ? 'text-wt-aux' : 'text-lt-aux')
}
</script>

<template>
  <!-- Folder row -->
  <MsTreeItem
    :label="node.name"
    :icon="folderIcon"
    :icon-color="isDark ? 'text-amber-400' : 'text-amber-500'"
    :badge="childCount > 0 ? String(childCount) : ''"
    :active="activePath === node.path"
    :level="level"
    :is-dark="isDark"
    :has-arrow="hasChildren"
    :expanded="isExpanded"
    is-folder
    @click="emit('select-folder', node)"
    @arrow-click="emit('toggle-folder', node)"
    @contextmenu="(e) => emit('contextmenu-folder', e, node)"
  />

  <!-- Expanded children -->
  <template v-if="isExpanded && hasChildren">
    <!-- Sub-folders (recursive) -->
    <DocTreeItem
      v-for="child in node.children"
      :key="child.path"
      :node="child"
      :is-dark="isDark"
      :active-path="activePath"
      :level="level + 1"
      @select-folder="(...args) => emit('select-folder', ...args)"
      @toggle-folder="(...args) => emit('toggle-folder', ...args)"
      @select-file="(...args) => emit('select-file', ...args)"
      @contextmenu-folder="(...args) => emit('contextmenu-folder', ...args)"
      @contextmenu-file="(...args) => emit('contextmenu-file', ...args)"
    />

    <!-- Files at this level -->
    <MsTreeItem
      v-for="file in node.files"
      :key="file.path"
      :label="file.name"
      :icon="fileIcon(file.name)"
      :icon-color="fileIconColorClass(file.name)"
      :active="activePath === file.path"
      :level="level + 1"
      :is-dark="isDark"
      :has-arrow="false"
      :is-folder="false"
      @click="emit('select-file', file)"
      @contextmenu="(e) => emit('contextmenu-file', e, file)"
    />
  </template>
</template>
