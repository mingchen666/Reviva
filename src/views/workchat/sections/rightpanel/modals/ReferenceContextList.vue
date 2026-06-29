<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  isDark: Boolean,
  title: { type: String, default: '参考资料（可选）' },
  emptyText: { type: String, default: '未选择资料；可在左侧“文档”或“知识库”勾选要参考的资料' },
  accentClass: { type: String, default: 'text-emerald-400' },
})

const summary = computed(() => {
  const result = { kb: 0, doc: 0, local: 0 }
  for (const item of props.items || []) {
    if (item?.type === 'cloud_kb') result.kb += 1
    else if (item?.type === 'cloud_doc') result.doc += 1
    else result.local += 1
  }
  return result
})

const summaryText = computed(() => {
  const s = summary.value
  if (s.kb || s.doc) return `知识库 ${s.kb} · 文档 ${s.doc} · 本地 ${s.local}`
  return String(props.items.length)
})

function fileIcon(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase()
  const map = {
    pdf: 'ri-file-pdf-2-line',
    doc: 'ri-file-word-2-line',
    docx: 'ri-file-word-2-line',
    xls: 'ri-file-excel-2-line',
    xlsx: 'ri-file-excel-2-line',
    ppt: 'ri-file-ppt-2-line',
    pptx: 'ri-file-ppt-2-line',
    md: 'ri-markdown-line',
    markdown: 'ri-markdown-line',
    txt: 'ri-file-text-line',
    csv: 'ri-file-list-3-line',
    json: 'ri-code-box-line',
    html: 'ri-html5-line',
    htm: 'ri-html5-line',
  }
  return map[ext] || 'ri-file-line'
}

function ctxIcon(item) {
  if (item?.type === 'cloud_kb') return 'ri-book-open-line'
  if (item?.type === 'cloud_doc') return 'ri-file-list-3-line'
  if (item?.type === 'reference_name') return 'ri-bookmark-3-line'
  if (item?.isDirectory || item?.type === 'folder' || item?.type === 'local_folder') return 'ri-folder-line'
  return item?.icon || fileIcon(item?.name || item?.path)
}

function ctxPrefix(item) {
  if (item?.type === 'cloud_kb') return '已选择知识库'
  if (item?.type === 'cloud_doc') return '已选择知识库文档'
  if (item?.type === 'reference_name') return '已选择资料'
  if (item?.isDirectory || item?.type === 'folder' || item?.type === 'local_folder') return '已选择文件夹'
  return '已选择文件'
}

function isCloudContext(item) {
  return item?.type === 'cloud_kb' || item?.type === 'cloud_doc'
}
</script>

<template>
  <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
    <div class="flex items-center gap-2 mb-2">
      <i class="ri-folder-open-line text-[12px]" :class="accentClass" />
      <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ title }}</span>
      <span
        class="ctx-pill text-[9px]"
        :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-white text-lt-aux border border-bdrF'"
      >
        {{ summaryText }}
      </span>
    </div>

    <div v-if="items.length" class="max-h-[128px] overflow-y-auto thin-scroll flex flex-wrap gap-1.5">
      <span
        v-for="(item, index) in items"
        :key="item.id || item.kbId || item.docId || item.path || index"
        class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium max-w-full"
        :class="isCloudContext(item)
          ? (isDark ? 'bg-brand-400/8 border border-brand-400/18 text-brand-200' : 'bg-brand-50 border border-brand-100 text-brand-700')
          : (isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-white border border-bdrF text-lt-sub')"
      >
        <i :class="[ctxIcon(item), 'text-[10px] shrink-0', isCloudContext(item) ? (isDark ? 'text-brand-300' : 'text-brand-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
        <span class="shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ ctxPrefix(item) }}</span>
        <span class="min-w-0 truncate max-w-[180px]">{{ item.name || item.path || '未命名资料' }}</span>
      </span>
    </div>
    <div v-else class="text-[10px] py-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      {{ emptyText }}
    </div>
  </div>
</template>
