<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRecycleBinStore } from '@/stores/recycleBin'
import { useSettingsStore } from '@/stores/settings'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import TrashSidebar from './TrashSidebar.vue'
import TrashContent from './TrashContent.vue'
import TrashModals from './TrashModals.vue'

const appStore = useAppStore()
const recycleBinStore = useRecycleBinStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const isReady = computed(() => settingsStore.isWorkspaceReady)

// ─── Shared State (passed to child components) ───
const groupMode = ref('date')     // 'date' | 'category'
const viewMode = ref('grid')      // 'grid' | 'list'
const searchQuery = ref('')
const selectedIds = ref([])
const confirmAction = ref(null)   // { type, target?, count? }

// ─── Category helpers ───
const categoryMeta = {
  folder:      { icon: 'ri-folder-3-line', color: '#FACC15', label: '文件夹' },
  document:    { icon: 'ri-file-text-line', color: '#6C8AFF', label: '文档' },
  image:       { icon: 'ri-image-line', color: '#EC4899', label: '图片' },
  video:       { icon: 'ri-movie-line', color: '#A78BFA', label: '视频' },
  audio:       { icon: 'ri-music-line', color: '#38BDF8', label: '音频' },
  archive:     { icon: 'ri-file-zip-line', color: '#FACC15', label: '压缩包' },
  code:        { icon: 'ri-code-line', color: '#34D399', label: '代码' },
  chat:        { icon: 'ri-message-3-line', color: '#A78BFA', label: '对话' },
  note:        { icon: 'ri-sticky-note-line', color: '#34D399', label: '笔记' },
  note_folder: { icon: 'ri-folder-3-line', color: '#34D399', label: '笔记文件夹' },
  other:       { icon: 'ri-file-line', color: '#78788a', label: '其他' },
}

function getCategoryIcon(cat) { return categoryMeta[cat]?.icon || 'ri-file-line' }
function getCategoryColor(cat) { return categoryMeta[cat]?.color || '#78788a' }
function getCategoryLabel(cat) { return categoryMeta[cat]?.label || cat }

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '--'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Format size/metric per item type. DB-typed items use semantic units (msgs / chars)
function formatItemSize(item) {
  if (!item) return '--'
  const t = item.item_type
  if (t === 'conversation') return `${item.size || 0} 条消息`
  if (t === 'note') return `${item.size || 0} 字`
  if (t === 'note_folder') return '文件夹'
  return formatSize(item.size)
}

function formatDate(isoStr) {
  if (!isoStr) return '--'
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Actions ───
async function restoreItem(trashId) {
  const result = await recycleBinStore.restoreItem(trashId)
  selectedIds.value = selectedIds.value.filter(id => id !== trashId)
  return result
}

async function restoreBatch(trashIds) {
  const result = await recycleBinStore.restoreBatch(trashIds)
  selectedIds.value = []
  return result
}

async function deletePermanently(trashId) {
  const result = await recycleBinStore.deletePermanently(trashId)
  selectedIds.value = selectedIds.value.filter(id => id !== trashId)
  return result
}

async function deleteBatchPermanently(trashIds) {
  const result = await recycleBinStore.deleteBatchPermanently(trashIds)
  selectedIds.value = []
  return result
}

async function emptyTrash() {
  const result = await recycleBinStore.emptyTrash()
  selectedIds.value = []
  return result
}

// ─── Confirm action dispatch ───
async function executeConfirmAction() {
  if (!confirmAction.value) return
  const action = confirmAction.value
  confirmAction.value = null

  if (action.type === 'restore') await restoreItem(action.target)
  else if (action.type === 'restoreBatch') await restoreBatch(action.target)
  else if (action.type === 'delete') await deletePermanently(action.target)
  else if (action.type === 'deleteBatch') await deleteBatchPermanently(action.target)
  else if (action.type === 'empty') await emptyTrash()
}

// ─── Init ───
onMounted(() => {
  if (isReady.value && !recycleBinStore.loaded) {
    recycleBinStore.loadFromDb()
  }
})

watch(() => settingsStore.workDirRoot, (newVal) => {
  if (newVal && !recycleBinStore.loaded) recycleBinStore.loadFromDb()
})
</script>

<template>
  <div class="flex h-full overflow-hidden">

    <!-- Left Panel: Sidebar navigation -->
    <LeftPanel :width="240" :resizable="false">
      <TrashSidebar
        :is-dark="isDark"
        :group-mode="groupMode"
        :search-query="searchQuery"
        :total-count="recycleBinStore.totalCount"
        :date-groups="recycleBinStore.dateGroups"
        :category-groups="recycleBinStore.categoryGroups"
        @update:groupMode="groupMode = $event"
        @update:searchQuery="searchQuery = $event"
        @empty-trash="confirmAction = { type: 'empty' }"
        :get-category-icon="getCategoryIcon"
        :get-category-color="getCategoryColor"
        :get-category-label="getCategoryLabel"
      />
    </LeftPanel>

    <!-- Main Content: Items display -->
    <MainContent padding="p-0">
      <TrashContent
        :is-dark="isDark"
        :items="recycleBinStore.items"
        :search-query="searchQuery"
        :view-mode="viewMode"
        :selected-ids="selectedIds"
        :total-count="recycleBinStore.totalCount"
        :is-ready="isReady"
        @update:viewMode="viewMode = $event"
        @update:selectedIds="selectedIds = $event"
        @restore="confirmAction = { type: 'restore', target: $event }"
        @restore-batch="confirmAction = { type: 'restoreBatch', target: $event }"
        @delete="confirmAction = { type: 'delete', target: $event }"
        @delete-batch="confirmAction = { type: 'deleteBatch', target: $event }"
        :get-category-icon="getCategoryIcon"
        :get-category-color="getCategoryColor"
        :get-category-label="getCategoryLabel"
        :format-size="formatSize"
        :format-item-size="formatItemSize"
        :format-date="formatDate"
      />
    </MainContent>

    <!-- Modals -->
    <TrashModals
      :is-dark="isDark"
      :confirm-action="confirmAction"
      @execute="executeConfirmAction"
      @cancel="confirmAction = null"
    />
  </div>
</template>