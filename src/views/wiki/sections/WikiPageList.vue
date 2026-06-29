<script setup>
defineProps({
  rootPages: { type: Array, default: () => [] },
  contentPages: { type: Array, default: () => [] },
  currentPagePath: { type: String, default: '' },
  hasWiki: { type: Boolean, default: false },
  refreshing: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['open-page', 'refresh'])
</script>

<template>
  <div class="h-full flex flex-col" :class="isDark ? 'bg-d1' : 'bg-l1'">
    <div class="h-12 px-3 flex items-center justify-between border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrL'">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">页面</span>
          <span v-if="hasWiki && (rootPages.length + contentPages.length)" class="ctx-pill !text-[9.5px] !px-1.5 !py-0" :class="isDark ? 'bg-d3 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">{{ rootPages.length + contentPages.length }}</span>
        </div>
        <p class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可阅读知识页</p>
      </div>
      <button
        class="h-7 w-7 rounded-md flex items-center justify-center transition-colors disabled:cursor-default disabled:opacity-70"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
        :disabled="refreshing"
        :aria-busy="refreshing"
        title="刷新"
        @click="emit('refresh')">
        <i class="ri-refresh-line text-[13px]" :class="{ 'refresh-spin': refreshing }" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-3">
      <template v-if="hasWiki">
        <div v-if="rootPages.length" class="mb-4">
          <div class="px-2 pb-1.5 flex items-center gap-1.5">
            <span class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">入口</span>
            <span class="text-[9.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ rootPages.length }}</span>
          </div>
          <button
            v-for="page in rootPages"
            :key="page.path"
            class="relative w-full h-8 px-2 rounded-md flex items-center gap-2 text-left transition-colors"
            :class="page.path === currentPagePath
              ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500')
              : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')"
            @click="emit('open-page', page.path)">
            <span v-show="page.path === currentPagePath" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            <i class="ri-markdown-line text-[13px] shrink-0" />
            <span class="text-[11.5px] truncate">{{ page.path }}</span>
          </button>
        </div>

        <div>
          <div class="px-2 pb-1.5 flex items-center gap-1.5">
            <span class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">知识页</span>
            <span v-if="contentPages.length" class="text-[9.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ contentPages.length }}</span>
          </div>
          <button
            v-for="page in contentPages"
            :key="page.path"
            class="relative w-full h-8 px-2 rounded-md flex items-center gap-2 text-left transition-colors"
            :class="page.path === currentPagePath
              ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500')
              : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')"
            @click="emit('open-page', page.path)">
            <span v-show="page.path === currentPagePath" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            <i class="ri-file-text-line text-[13px] shrink-0" />
            <span class="text-[11.5px] truncate">{{ page.path.replace(/^pages\//, '') }}</span>
          </button>
          <div v-if="contentPages.length === 0" class="mx-1 mt-1 rounded-lg px-3 py-4 text-[11px] leading-5 border border-dashed" :class="isDark ? 'border-d4 text-wt-dim' : 'border-bdrL text-lt-aux'">
            从文档或笔记导入来源后，WikiAgent 会维护 Markdown 知识页。
          </div>
        </div>
      </template>

      <div v-else class="h-full flex flex-col items-center justify-center text-center px-4 gap-2">
        <i class="ri-file-list-3-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择或创建一个 Wiki</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.refresh-spin {
  display: inline-block;
  animation: refresh-spin 0.72s linear infinite;
}
@keyframes refresh-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .refresh-spin {
    animation: none;
  }
}
</style>
