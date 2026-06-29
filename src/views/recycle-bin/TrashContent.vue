<script setup>
import { computed } from 'vue'

const props = defineProps({
  isDark: Boolean,
  items: Array,
  searchQuery: String,
  viewMode: String,
  selectedIds: Array,
  totalCount: Number,
  isReady: Boolean,
  getCategoryIcon: Function,
  getCategoryColor: Function,
  getCategoryLabel: Function,
  formatSize: Function,
  formatItemSize: Function,
  formatDate: Function,
})

const emit = defineEmits([
  'update:viewMode', 'update:selectedIds',
  'restore', 'restoreBatch', 'delete', 'deleteBatch',
])

const filteredItems = computed(() => {
  if (!props.searchQuery) return props.items
  const q = props.searchQuery.toLowerCase()
  return props.items.filter(f => f.original_name.toLowerCase().includes(q))
})

const isAllSelected = computed(() => {
  return filteredItems.value.length > 0 && filteredItems.value.every(i => props.selectedIds.includes(i.id))
})

function toggleSelectAll() {
  if (isAllSelected.value) {
    emit('update:selectedIds', [])
  } else {
    emit('update:selectedIds', filteredItems.value.map(i => i.id))
  }
}

function toggleSelect(id) {
  const current = [...props.selectedIds]
  const idx = current.indexOf(id)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(id)
  emit('update:selectedIds', current)
}

function getOriginalPathShort(item) {
  if (!item.original_path) return ''
  // Show just the relative part after docs/ or outputs/
  const parts = item.original_path.replace(/\\/g, '/').split('/')
  // Find docs or outputs in path and take from there
  const docsIdx = parts.indexOf('docs')
  const outputsIdx = parts.indexOf('outputs')
  const startIdx = docsIdx >= 0 ? docsIdx : outputsIdx >= 0 ? outputsIdx : parts.length - 3
  if (startIdx >= 0) {
    return parts.slice(startIdx).join('/')
  }
  return parts.slice(-3).join('/')
}
</script>

<template>
  <!-- No workspace state -->
  <div v-if="!isReady" class="flex flex-col items-center justify-center h-full gap-4">
    <div class="w-16 h-16 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
      <i class="ri-folder-unlock-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
    </div>
    <div class="text-center">
      <p class="text-[14px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">未设置工作目录</p>
      <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请先在设置中选择工作目录</p>
    </div>
    <router-link to="/settings"
      class="ctx-pill cursor-pointer"
      :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15' : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'">
      <i class="ri-settings-3-line text-[10px]" />前往设置
    </router-link>
  </div>

  <!-- Main content -->
  <div v-else class="h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">

    <!-- Header toolbar -->
    <div class="h-10 flex items-center justify-between px-5 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-1.5 min-w-0">
        <i class="ri-delete-bin-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">回收站</span>
        <span class="ctx-pill shrink-0"
          :class="isDark ? 'text-wt-dim bg-d3 border border-bdr' : 'text-lt-aux bg-l3 border border-bdrF'">
          {{ totalCount }} 个项目
        </span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Layout toggle -->
        <div class="flex items-center rounded-lg border overflow-hidden"
          :class="isDark ? 'border-bdr' : 'border-bdrF'">
          <button @click="emit('update:viewMode', 'grid')"
            class="h-7 w-7 flex items-center justify-center transition-colors"
            :class="viewMode === 'grid'
              ? (isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500')
              : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
            <i class="ri-grid-line text-[13px]" />
          </button>
          <button @click="emit('update:viewMode', 'list')"
            class="h-7 w-7 flex items-center justify-center transition-colors"
            :class="viewMode === 'list'
              ? (isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500')
              : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
            <i class="ri-list-unordered text-[13px]" />
          </button>
        </div>

        <!-- Batch actions (visible when items selected) -->
        <template v-if="selectedIds.length > 0">
          <button @click="emit('restoreBatch', selectedIds)"
            class="ctx-pill cursor-pointer"
            :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20 hover:bg-brand-400/15' : 'text-brand-500 bg-brand-50 border border-brand-100 hover:bg-brand-100'">
            <i class="ri-arrow-go-back-line text-[10px]" />恢复选中 {{ selectedIds.length }}
          </button>
          <button @click="emit('deleteBatch', selectedIds)"
            class="ctx-pill cursor-pointer"
            :class="isDark ? 'text-red-400 bg-red-400/8 border border-red-400/20 hover:bg-red-400/15' : 'text-red-500 bg-red-50 border border-red-100 hover:bg-red-100'">
            <i class="ri-delete-bin-line text-[10px]" />永久删除 {{ selectedIds.length }}
          </button>
        </template>

        <!-- Select all -->
        <button v-if="filteredItems.length > 0" @click="toggleSelectAll"
          class="h-7 px-2 rounded-lg text-[11px] flex items-center gap-1 transition-colors shrink-0"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i :class="isAllSelected ? 'ri-checkbox-line' : 'ri-checkbox-blank-line'" class="text-[13px]" />
          {{ isAllSelected ? '取消全选' : '全选' }}
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-y-auto p-4">

      <!-- Empty state -->
      <div v-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-16 gap-3">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <i class="ri-delete-bin-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </div>
        <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          {{ totalCount === 0 ? '回收站为空' : '没有匹配的项目' }}
        </p>
        <p v-if="totalCount === 0" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">删除的文件会暂存此处</p>
      </div>

      <!-- ═══ GRID Layout ═══ -->
      <div v-if="viewMode === 'grid' && filteredItems.length > 0"
        class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">

        <div v-for="item in filteredItems" :key="item.id"
          class="doc-card rounded-xl cursor-pointer overflow-hidden flex flex-col h-[160px] transition-all duration-200 relative group"
          :class="[isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF',
            selectedIds.includes(item.id) ? (isDark ? 'ring-1 ring-brand-400/30' : 'ring-1 ring-brand-200') : '']"
          @click="toggleSelect(item.id)">

          <!-- Checkbox overlay -->
          <div class="absolute top-2 left-2 z-10">
            <div class="w-5 h-5 rounded-md border flex items-center justify-center transition-colors"
              :class="selectedIds.includes(item.id)
                ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
                : (isDark ? 'border-d4 bg-d0/50 opacity-0 group-hover:opacity-100' : 'border-bdrF bg-l3/80 opacity-0 group-hover:opacity-100')">
              <i v-if="selectedIds.includes(item.id)" class="ri-check-line text-[12px] text-white" />
            </div>
          </div>

          <!-- Accent top stripe -->
          <div class="h-[3px] w-full shrink-0"
            :style="`background-color: ${getCategoryColor(item.category)}15`" />

          <!-- Card body -->
          <div class="flex-1 flex flex-col items-center justify-center px-3 pt-4 pb-2">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center mb-2"
              :class="isDark ? 'bg-d0' : 'bg-l2'">
              <i :class="item.item_type === 'note_folder' ? 'ri-folder-3-line' : getCategoryIcon(item.category)" class="text-[20px]"
                :style="`color: ${getCategoryColor(item.category)}`" />
            </div>
            <span class="text-[12px] font-medium text-center truncate w-full" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.original_name }}</span>
            <span class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ getCategoryLabel(item.category) }}</span>
          </div>

          <!-- Card footer: quick actions -->
          <div class="shrink-0 flex items-center justify-center gap-1 px-2 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click.stop="emit('restore', item.id)"
              class="h-6 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
              :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
              <i class="ri-arrow-go-back-line text-[10px]" />恢复
            </button>
            <button @click.stop="emit('delete', item.id)"
              class="h-6 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
              :class="isDark ? 'bg-red-400/8 text-red-400 hover:bg-red-400/15' : 'bg-red-50 text-red-500 hover:bg-red-100'">
              <i class="ri-delete-bin-line text-[10px]" />删除
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ LIST Layout ═══ -->
      <div v-if="viewMode === 'list' && filteredItems.length > 0" class="space-y-1">

        <div v-for="item in filteredItems" :key="item.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group"
          :class="selectedIds.includes(item.id)
            ? (isDark ? 'bg-brand-400/8' : 'bg-brand-50')
            : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
          @click="toggleSelect(item.id)">

          <!-- Checkbox -->
          <div class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors"
            :class="selectedIds.includes(item.id)
              ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
              : (isDark ? 'border-d4' : 'border-bdrF')">
            <i v-if="selectedIds.includes(item.id)" class="ri-check-line text-[12px] text-white" />
          </div>

          <!-- Icon -->
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i :class="item.item_type === 'note_folder' ? 'ri-folder-3-line' : getCategoryIcon(item.category)" class="text-[16px]"
              :style="`color: ${getCategoryColor(item.category)}`" />
          </div>

          <!-- Name + meta -->
          <div class="flex-1 min-w-0">
            <span class="text-[13px] font-medium truncate block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.original_name }}</span>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="ctx-pill shrink-0"
                :class="isDark ? 'text-wt-dim bg-d4 border border-bdr' : 'text-lt-aux bg-l4 border border-bdrF'">
                {{ getCategoryLabel(item.category) }}
              </span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatItemSize ? formatItemSize(item) : formatSize(item.size) }}</span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatDate(item.deleted_at) }}</span>
            </div>
          </div>

          <!-- Original path hint -->
          <span class="text-[10px] truncate max-w-[120px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ getOriginalPathShort(item) }}</span>

          <!-- Hover actions -->
          <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button @click.stop="emit('restore', item.id)"
              class="h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-colors"
              :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
              <i class="ri-arrow-go-back-line text-[11px]" />恢复
            </button>
            <button @click.stop="emit('delete', item.id)"
              class="h-7 px-2.5 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-colors"
              :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
              <i class="ri-delete-bin-line text-[11px]" />永久删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.doc-card:hover { transform: translateY(-2px) }
</style>