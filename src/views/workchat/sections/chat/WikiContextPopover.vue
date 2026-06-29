<script setup>
defineProps({
  isDark: Boolean,
  availableWikis: { type: Array, default: () => [] },
  selectedWikiIds: { type: Array, default: () => [] },
})

const emit = defineEmits(['toggle-wiki', 'clear-wiki'])
</script>

<template>
  <div
    class="rounded-lg overflow-hidden border border-solid"
    :class="isDark ? 'bg-d2 border-d4' : 'bg-l2 border-bdrF'">
    <div
      class="px-2 py-2.5 flex items-center justify-between"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-book-2-line text-[13px]" :class="isDark ? 'text-indigo-300' : 'text-indigo-600'" />
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Wiki 知识库</span>
      </div>
      <button
        v-if="selectedWikiIds.length"
        @click="emit('clear-wiki')"
        class="text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-red-300/80 hover:text-red-300' : 'text-red-500/80 hover:text-red-600'">
        清空
      </button>
    </div>

    <div class="p-2 max-h-[260px] overflow-auto">
      <div
        v-if="!availableWikis.length"
        class="px-2 py-5 text-center text-[12px]"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        暂无 Wiki知识库
      </div>
      <button
        v-for="wiki in availableWikis"
        :key="wiki.id"
        @click="emit('toggle-wiki', wiki.id)"
        :title="wiki.name || wiki.id"
        class="w-full min-h-9 px-2 py-1.5 rounded-lg flex items-center gap-2 text-left transition-colors"
        :class="
          selectedWikiIds.includes(wiki.id)
            ? isDark
              ? 'bg-indigo-400/10 text-indigo-200'
              : 'bg-indigo-50 text-indigo-700'
            : isDark
              ? 'text-wt-sub hover:bg-white/5'
              : 'text-lt-sub hover:bg-l4'
        ">
        <span
          class="h-4 w-4 rounded border flex items-center justify-center shrink-0"
          :class="
            selectedWikiIds.includes(wiki.id)
              ? isDark
                ? 'bg-indigo-400 border-indigo-300 text-d0'
                : 'bg-indigo-600 border-indigo-600 text-white'
              : isDark
                ? 'border-d4 text-transparent'
                : 'border-bdrF text-transparent'
          ">
          <i class="ri-check-line text-[11px]" />
        </span>
        <span class="min-w-0 flex-1 overflow-hidden">
          <span class="block text-[12px] truncate whitespace-nowrap">{{ wiki.name || wiki.id }}</span>
          <span class="block text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ wiki.page_count || 0 }} 页 · {{ wiki.source_count || 0 }} 来源
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
