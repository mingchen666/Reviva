<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps({
  isDark: Boolean,
  selectedDocs: Array,
})

const emit = defineEmits(['toggle-doc', 'toggle-folder'])

const settingsStore = useSettingsStore()
const fileTree = ref([])
const expandedFolders = ref({})
const loading = ref(false)

const docsPath = computed(() => settingsStore.getDocsPath())
const isReady = computed(() => settingsStore.isWorkspaceReady)

async function loadFileTree() {
  loading.value = true
  try {
    const base = docsPath.value
    if (!base || !isReady.value) {
      fileTree.value = []
      loading.value = false
      return
    }
    const result = await window.electronAPI.listDir(base)
    if (result?.success && result?.data) {
      fileTree.value = result.data
        .filter(entry => !entry.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        .map(entry => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
        }))
    }
  } catch { /* ignore */ }
  loading.value = false
}

async function expandFolder(folderPath) {
  if (expandedFolders.value[folderPath]) {
    expandedFolders.value[folderPath] = false
    return
  }
  expandedFolders.value[folderPath] = true
  try {
    const result = await window.electronAPI.listDir(folderPath)
    if (result?.success && result?.data) {
      childrenMap.value[folderPath] = result.data
        .filter(entry => !entry.name.startsWith('.'))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        .map(entry => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
        }))
    }
  } catch { /* ignore */ }
}

const childrenMap = ref({})
const flatTree = computed(() => {
  const items = []
  function walk(entries, depth) {
    for (const entry of entries) {
      items.push({ ...entry, depth })
      if (entry.isDirectory && expandedFolders.value[entry.path] && childrenMap.value[entry.path]) {
        walk(childrenMap.value[entry.path], depth + 1)
      }
    }
  }
  walk(fileTree.value, 0)
  return items
})

const isSelected = (path) => props.selectedDocs?.some(d => d.path === path)

function handleToggle(item) {
  if (item.isDirectory) emit('toggle-folder', item)
  else emit('toggle-doc', item)
}

function fileIcon(name, isDir, isExpanded) {
  if (isDir) return isExpanded ? 'ri-folder-open-line' : 'ri-folder-3-line'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'ri-file-pdf-2-line', md: 'ri-markdown-line', markdown: 'ri-markdown-line',
    docx: 'ri-file-word-2-line', txt: 'ri-file-text-line',
    xlsx: 'ri-file-excel-2-line', pptx: 'ri-file-ppt-2-line',
    png: 'ri-image-line', jpg: 'ri-image-line', jpeg: 'ri-image-line',
    csv: 'ri-file-text-line', json: 'ri-code-line',
  }
  return map[ext] || 'ri-file-line'
}

function fileIconColor(name, isDir) {
  if (isDir) return props.isDark ? 'text-amber-400' : 'text-amber-500'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: 'text-red-400', md: 'text-emerald-400', docx: 'text-blue-400',
    xlsx: 'text-emerald-400', pptx: 'text-orange-400', png: 'text-pink-400',
  }
  return map[ext] || (props.isDark ? 'text-wt-aux' : 'text-lt-aux')
}

onMounted(loadFileTree)
watch(() => settingsStore.workDirRoot, (newVal) => {
  if (newVal) loadFileTree()
  else fileTree.value = []
})
</script>

<template>
  <div class="flex-1 overflow-y-auto custom-scrollbar">
    <!-- Empty state -->
    <div v-if="!loading && !isReady" class="px-6 py-12 text-center flex flex-col items-center">
      <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
           :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
        <i class="ri-folder-warning-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      </div>
      <p class="text-[13px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">未设置工作目录</p>
      <p class="text-[11px] mb-4" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请先在设置中配置以继续</p>
      <router-link to="/settings"
        class="ctx-pill cursor-pointer"
        :class="isDark ? 'text-brand-400 bg-brand-400/10 hover:bg-brand-400/20' : 'text-brand-600 bg-brand-50 hover:bg-brand-100'">
        <i class="ri-settings-3-line text-[12px]" />前往设置
      </router-link>
    </div>

    <!-- Empty docs folder -->
    <div v-else-if="!loading && isReady && fileTree.length === 0" class="px-6 py-12 text-center flex flex-col items-center">
      <div class="w-12 h-12 rounded-full flex items-center justify-center mb-3"
           :class="isDark ? 'bg-wt-dim/10' : 'bg-lt-aux/10'">
        <i class="ri-folder-open-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      </div>
      <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">目录为空</p>
      <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前 docs 文件夹中没有可用文件</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="px-4 py-12 text-center flex flex-col items-center">
      <i class="ri-loader-4-line text-[24px] mb-2" :class="isDark ? 'text-brand-400' : 'text-brand-500'" style="animation: spin 1s linear infinite" />
      <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在加载文件...</p>
    </div>

    <!-- File tree content -->
    <template v-else-if="isReady && fileTree.length > 0">
      <!-- Hint -->
      <div class="px-4 py-2 sticky top-0 z-10 backdrop-blur-sm" :class="isDark ? 'bg-wt-bg/80 border-b border-d4' : 'bg-lt-bg/80 border-b border-bdrL'">
        <div class="flex items-center gap-1.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-checkbox-circle-line text-[12px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span>点击文件或文件夹将其加入对话上下文</span>
        </div>
      </div>

      <!-- Tree items -->
      <div class="py-1">
        <div v-for="item in flatTree" :key="item.path"
          @click.stop="handleToggle(item)"
          class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-150 group relative"
          :class="isSelected(item.path)
            ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-600')
            : (isDark ? 'hover:bg-wt-dim/5 text-wt-sub' : 'hover:bg-lt-aux/10 text-lt-sub')"
          :style="{ paddingLeft: (12 + item.depth * 16) + 'px' }">

          <!-- Selection Indicator Line -->
          <div v-if="isSelected(item.path)" class="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
               :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />

          <!-- Folder toggle arrow -->
          <button v-if="item.isDirectory" @click.stop="expandFolder(item.path)"
            class="h-4 w-4 rounded flex items-center justify-center shrink-0 transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
            <i class="ri-arrow-right-s-line text-[14px] transition-transform duration-200 ease-out"
               :style="{ transform: expandedFolders[item.path] ? 'rotate(90deg)' : 'rotate(0deg)' }" />
          </button>
          <span v-else class="w-4 shrink-0" />

          <!-- Checkbox -->
          <div class="h-[14px] w-[14px] rounded-[3px] flex items-center justify-center shrink-0 transition-all duration-200 border"
            :class="isSelected(item.path)
              ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
              : (isDark ? 'border-wt-dim/50 group-hover:border-brand-400/60' : 'border-lt-aux/50 group-hover:border-brand-500/60')">
            <i v-if="isSelected(item.path)" class="ri-check-line text-[10px] text-white" />
          </div>

          <!-- Icon -->
          <i :class="[fileIcon(item.name, item.isDirectory, expandedFolders[item.path]), fileIconColor(item.name, item.isDirectory)]"
            class="text-[15px] shrink-0 transition-transform duration-200"
            :style="{ opacity: isSelected(item.path) ? 1 : 0.75 }" />

          <!-- Name -->
          <span class="text-[12.5px] truncate flex-1 min-w-0 font-medium leading-tight"
            :class="isSelected(item.path) ? '' : (isDark ? 'group-hover:text-wt-main' : 'group-hover:text-lt-main')">
            {{ item.name }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

.ctx-pill {
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>