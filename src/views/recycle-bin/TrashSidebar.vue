<script setup>
import { computed } from 'vue'

const props = defineProps({
  isDark: Boolean,
  groupMode: String,
  searchQuery: String,
  totalCount: Number,
  dateGroups: Array,
  categoryGroups: Array,
  getCategoryIcon: Function,
  getCategoryColor: Function,
  getCategoryLabel: Function,
})

const emit = defineEmits([
  'update:groupMode', 'update:searchQuery', 'emptyTrash',
])

const filteredDateGroups = computed(() => {
  if (!props.searchQuery) return props.dateGroups
  const q = props.searchQuery.toLowerCase()
  return props.dateGroups.map(g => ({
    ...g,
    files: g.files.filter(f => f.original_name.toLowerCase().includes(q)),
  })).filter(g => g.files.length > 0)
})

const filteredCategoryGroups = computed(() => {
  if (!props.searchQuery) return props.categoryGroups
  const q = props.searchQuery.toLowerCase()
  return props.categoryGroups.map(g => ({
    ...g,
    files: g.files.filter(f => f.original_name.toLowerCase().includes(q)),
  })).filter(g => g.files.length > 0)
})
</script>

<template>
  <!-- Panel Header -->
  <div class="h-10 flex items-center justify-between px-4 shrink-0"
    :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
    <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">回收站</span>
    <button v-if="totalCount > 0" @click="emit('emptyTrash')"
      class="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-red-400 hover:bg-red-400/10' : 'text-red-500 hover:bg-red-50'"
      title="清空回收站">
      <i class="ri-delete-bin-line text-[14px]" />
    </button>
  </div>

  <!-- Search -->
  <div class="px-3 py-2 shrink-0">
    <div class="relative">
      <i class="ri-search-line absolute left-2.5 top-[8px] text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <input :value="searchQuery" @input="emit('update:searchQuery', $event.target.value)" type="text" placeholder="搜索..."
        class="w-full h-8 rounded-md py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
        :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
    </div>
  </div>

  <!-- Group mode tabs -->
  <div class="px-3 pb-2 shrink-0">
    <div class="flex items-center rounded-lg border overflow-hidden"
      :class="isDark ? 'border-bdr' : 'border-bdrF'">
      <button @click="emit('update:groupMode', 'date')"
        class="flex-1 h-7 flex items-center justify-center gap-1 text-[11px] font-medium transition-colors"
        :class="groupMode === 'date'
          ? (isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-calendar-line text-[12px]" />按日期
      </button>
      <button @click="emit('update:groupMode', 'category')"
        class="flex-1 h-7 flex items-center justify-center gap-1 text-[11px] font-medium transition-colors"
        :class="groupMode === 'category'
          ? (isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-folder-line text-[12px]" />按分类
      </button>
    </div>
  </div>

  <!-- Navigation list -->
  <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">

    <!-- Date mode -->
    <template v-if="groupMode === 'date'">
      <template v-for="group in filteredDateGroups" :key="group.key">
        <div class="text-[9px] font-bold uppercase tracking-[0.1em] px-3 pt-2.5 pb-1"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ group.label }} · {{ group.files.length }}
        </div>
        <button v-for="item in group.files" :key="item.id"
          class="w-full flex items-center gap-2 px-2.5 py-[6px] rounded-md transition-colors"
          :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
          <i :class="getCategoryIcon(item.category)" class="text-[12px] shrink-0"
            :style="`color: ${getCategoryColor(item.category)}`" />
          <span class="text-[11px] truncate">{{ item.original_name }}</span>
        </button>
      </template>

      <div v-if="filteredDateGroups.length === 0" class="flex flex-col items-center justify-center py-8 gap-2">
        <i class="ri-delete-bin-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">回收站为空</span>
      </div>
    </template>

    <!-- Category mode -->
    <template v-if="groupMode === 'category'">
      <template v-for="group in filteredCategoryGroups" :key="group.key">
        <button class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md transition-colors"
          :class="isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4'">
          <div class="w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i :class="getCategoryIcon(group.key) + ' text-[13px]'" :style="`color: ${getCategoryColor(group.key)}`" />
          </div>
          <span class="text-[12px] font-medium">{{ getCategoryLabel(group.key) }}</span>
          <span class="ml-auto text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ group.files.length }}</span>
        </button>
      </template>

      <div v-if="filteredCategoryGroups.length === 0" class="flex flex-col items-center justify-center py-8 gap-2">
        <i class="ri-delete-bin-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">回收站为空</span>
      </div>
    </template>
  </div>
</template>