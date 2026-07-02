<script setup>
import { computed, ref, watch } from 'vue'
import { normalizeFilePath } from '@/utils/fileUrl'
import { buildHtmlPreviewContent } from './htmlPreview'

const props = defineProps({
  modelValue: Boolean,
  content: { type: String, default: '' },
  filePath: { type: String, default: '' },
  title: { type: String, default: '' },
  isDark: Boolean,
})

const emit = defineEmits(['update:modelValue', 'open-file', 'show-in-folder'])

const frameLoading = ref(false)

const normalizedPath = computed(() => normalizeFilePath(props.filePath || ''))
const fileName = computed(() => {
  const rawName = props.title || normalizedPath.value.split(/[\\/]/).pop() || 'HTML 预览'
  return normalizeFilePath(rawName)
})
const htmlPreviewContent = computed(() => buildHtmlPreviewContent(props.content, normalizedPath.value))
const htmlLoadingText = computed(() => (
  frameLoading.value ? '正在渲染 HTML 预览...' : '正在准备 HTML 预览...'
))

watch(
  () => props.modelValue,
  (visible) => {
    frameLoading.value = !!(visible && htmlPreviewContent.value)
  }
)

watch(htmlPreviewContent, (content) => {
  if (props.modelValue) frameLoading.value = !!content
})

function close() {
  frameLoading.value = false
  emit('update:modelValue', false)
}

function handleFrameLoad() {
  frameLoading.value = false
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="close">
    <div class="absolute inset-0" :class="isDark ? 'bg-black/50' : 'bg-black/30'" @click="close" />

    <div class="relative rounded-xl overflow-hidden shadow-2xl flex flex-col w-[92vw] h-[88vh] max-w-[1280px]"
      :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-3 px-4 py-3 shrink-0"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-sky-400/10 text-sky-400' : 'bg-sky-50 text-sky-500'">
          <i class="ri-html5-line text-[18px]" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ fileName }}</div>
          <div class="text-[10px] truncate mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ normalizedPath }}</div>
        </div>
        <button @click="emit('open-file')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="用系统应用打开">
          <i class="ri-external-link-line text-[14px]" />
        </button>
        <button @click="emit('show-in-folder')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="在文件夹中显示">
          <i class="ri-folder-open-line text-[14px]" />
        </button>
        <button @click="close"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
          title="关闭预览">
          <i class="ri-close-line text-[16px]" />
        </button>
      </div>

      <div class="relative flex-1 min-h-0 bg-white">
        <iframe v-if="htmlPreviewContent"
          :key="normalizedPath"
          :srcdoc="htmlPreviewContent"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          class="absolute inset-0 h-full w-full border-0 bg-white"
          @load="handleFrameLoad" />
        <div v-if="!htmlPreviewContent || frameLoading"
          class="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-[1px]">
          <div class="text-center text-slate-500">
            <i class="ri-loader-4-line text-[22px] animate-spin" />
            <p class="text-[12px] mt-2">{{ htmlLoadingText }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
