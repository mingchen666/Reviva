<script setup>
import { nextTick, onMounted, ref } from 'vue'
import {
  canCreateAttachmentFromFile,
  collectFilesFromDataTransfer,
  createAttachmentContextItems,
} from './attachmentContext'

defineProps({
  isDark: Boolean,
  ctxItems: { type: Array, default: () => [] },
})

const emit = defineEmits(['add-ctx', 'close'])

const popoverRef = ref(null)
const isDragOver = ref(false)

onMounted(() => {
  nextTick(() => popoverRef.value?.focus())
})

async function addFiles(files) {
  const candidates = (files || []).filter(canCreateAttachmentFromFile)
  if (!candidates.length) return

  const items = await createAttachmentContextItems(candidates)
  for (const item of items) emit('add-ctx', item)
}

function handleDragOver(e) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

async function handleDrop(e) {
  e.preventDefault()
  isDragOver.value = false
  await addFiles(collectFilesFromDataTransfer(e.dataTransfer))
}

async function handlePaste(e) {
  const files = collectFilesFromDataTransfer(e.clipboardData)
  if (!files.length || !files.some(canCreateAttachmentFromFile)) return

  e.preventDefault()
  await addFiles(files)
}
</script>

<template>
  <div
    ref="popoverRef"
    tabindex="0"
    class="rounded-lg overflow-hidden outline-none"
    :class="isDark ? 'bg-d3 shadow-xl shadow-black/40' : 'bg-l2 shadow-xl'"
    @paste="handlePaste">
    <div class="px-3 py-2.5" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <div
          class="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600'">
          <i class="ri-attachment-2 text-[14px]" />
        </div>
        <div class="min-w-0">
          <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">本地附件</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文件、文件夹、图片</div>
        </div>
      </div>
    </div>

    <div class="p-3">
      <div class="grid grid-cols-2 gap-2 mb-3">
        <button
          @click="emit('add-ctx', { type: 'local_file' })"
          class="h-10 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 hover:bg-d4' : 'text-lt-sub bg-white hover:bg-l4'">
          <i class="ri-file-line text-[13px] text-emerald-400" />
          <span>选择文件</span>
        </button>
        <button
          @click="emit('add-ctx', { type: 'local_folder' })"
          class="h-10 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 hover:bg-d4' : 'text-lt-sub bg-white hover:bg-l4'">
          <i class="ri-folder-line text-[13px] text-amber-400" />
          <span>选择文件夹</span>
        </button>
      </div>

      <div
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        class="h-[74px] rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] transition-colors border border-dashed"
        :class="isDragOver
          ? (isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/30' : 'bg-brand-50 text-brand-500 border-brand-300')
          : (isDark ? 'bg-d0 text-wt-dim border-d4 hover:border-brand-400/20' : 'bg-white text-lt-aux border-bdrF hover:border-brand-300')">
        <i :class="isDragOver ? 'ri-upload-cloud-2-line' : 'ri-clipboard-line'" class="text-[17px]" />
        <span>{{ isDragOver ? '释放以添加文件' : '拖放或粘贴文件' }}</span>
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">图片会作为附件加入</span>
      </div>

    </div>

    <div class="px-3 py-1.5 flex items-center justify-between" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">仅添加本地上下文</span>
      <button @click="emit('close')" class="text-[10px]" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">关闭</button>
    </div>
  </div>
</template>
