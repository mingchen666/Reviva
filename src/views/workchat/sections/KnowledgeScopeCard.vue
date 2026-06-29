<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: Object,
  isDark: Boolean,
})

const isDocument = computed(() => props.item?.type === 'cloud_doc')

const title = computed(() => {
  if (props.item?.name) return props.item.name
  return isDocument.value ? '未命名知识库文档' : '未命名知识库'
})

const typeLabel = computed(() => (isDocument.value ? '知识库文档' : '知识库'))

const icon = computed(() => (isDocument.value ? 'ri-file-text-line' : 'ri-book-open-line'))
</script>

<template>
  <div
    class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] leading-none transition-colors"
    :class="isDark ? 'bg-d4/55 border-d4 text-wt-sub' : 'bg-white border-bdrF text-lt-sub'"
  >
    <div
      class="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
      :class="isDark ? 'bg-brand-400/10 text-brand-300' : 'bg-brand-50 text-brand-500'"
    >
      <i :class="icon" class="text-[12px]" />
    </div>
    <span class="shrink-0 font-medium" :class="isDark ? 'text-brand-200' : 'text-brand-600'">{{ typeLabel }}</span>
    <span class="h-3 w-px shrink-0" :class="isDark ? 'bg-white/10' : 'bg-black/10'" />
    <span class="truncate min-w-0 max-w-[220px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ title }}</span>
  </div>
</template>
