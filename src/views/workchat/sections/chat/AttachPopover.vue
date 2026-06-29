<script setup>
import { ref, computed } from 'vue'
import { useSpacesStore } from '@/stores/spaces'

const props = defineProps({
  isDark: Boolean,
  ctxItems: { type: Array, default: () => [] },
})

const emit = defineEmits(['add-ctx', 'close'])
const spacesStore = useSpacesStore()
const searchQuery = ref('')
const isDragOver = ref(false)

const filteredSpaces = computed(() => {
  if (!searchQuery.value) return spacesStore.spaces
  const q = searchQuery.value.toLowerCase()
  return spacesStore.spaces.filter(s => s.name.toLowerCase().includes(q))
})

function handleDragOver(e) {
  e.preventDefault()
  isDragOver.value = true
}
function handleDragLeave() {
  isDragOver.value = false
}
function handleDrop(e) {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  for (const file of files) {
    const name = file.name
    const path = file.path // Electron provides file.path for dropped files
    if (path) {
      emit('add-ctx', { type: 'file', source: 'attachment', id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2), name, icon: 'ri-file-line', path })
    }
  }
}
</script>

<template>
  <div class="rounded-lg overflow-hidden" :class="isDark ? 'bg-d3 shadow-xl shadow-black/40' : 'bg-l2 shadow-xl'">
    <div class="p-2" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="relative">
        <i class="ri-search-line absolute left-2.5 top-[8px] text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="searchQuery" type="text" placeholder="搜索知识库或文件..."
          class="w-full h-7 rounded-lg pl-7 pr-3 text-[12px] outline-none"
          :class="isDark ? 'bg-d0 text-wt-sub placeholder-wt-dim' : 'bg-l3 text-lt-sub placeholder-lt-aux'" />
      </div>
    </div>
    <!-- Cloud KB section -->
    <div class="max-h-40 overflow-y-auto p-1.5 space-y-0.5">
      <div v-if="filteredSpaces.length" class="text-[10px] font-bold uppercase tracking-wider px-2 py-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">云端知识库</div>
      <div v-for="sp in filteredSpaces" :key="sp.id"
        @click="emit('add-ctx', { type: 'kb', id: sp.id, name: sp.name, icon: sp.icon || 'ri-database-2-line' })"
        class="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[12px] transition-colors"
        :class="ctxItems.find(c => c.id === sp.id) ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l4 text-lt-sub')">
        <i :class="sp.icon || 'ri-database-2-line'" class="text-brand-400 text-[12px]" />{{ sp.name }}
        <span class="text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ sp.docCount || 0 }} 文档</span>
        <i v-if="ctxItems.find(c => c.id === sp.id)" class="ri-check-line text-[10px] ml-auto text-brand-400" />
      </div>
    </div>
    <!-- Local files section -->
    <div class="px-3 py-2" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <div class="text-[10px] font-bold uppercase tracking-wider mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本地文件</div>
      <div class="flex gap-1.5 mb-2">
        <button @click="emit('add-ctx', { type: 'local_file' })"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 hover:bg-d4' : 'text-lt-sub bg-white hover:bg-l4'">
          <i class="ri-file-line text-[12px] text-emerald-400" /> 选择文件
        </button>
        <button @click="emit('add-ctx', { type: 'local_folder' })"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 hover:bg-d4' : 'text-lt-sub bg-white hover:bg-l4'">
          <i class="ri-folder-line text-[12px] text-amber-400" /> 选择文件夹
        </button>
      </div>
      <!-- Drag and drop zone -->
      <div @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop"
        class="h-[48px] rounded-lg flex items-center justify-center gap-2 text-[11px] transition-colors border border-dashed"
        :class="isDragOver
          ? (isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/30' : 'bg-brand-50 text-brand-500 border-brand-300')
          : (isDark ? 'bg-d0 text-wt-dim border-d4 hover:border-brand-400/20' : 'bg-white text-lt-aux border-bdrF hover:border-brand-300')">
        <i class="ri-upload-2-line text-[14px]" />
        <span>{{ isDragOver ? '释放以添加文件' : '拖放文件到此处' }}</span>
      </div>
    </div>
    <div class="px-3 py-1.5" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <button @click="emit('close')" class="text-[10px]" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">关闭</button>
    </div>
  </div>
</template>
