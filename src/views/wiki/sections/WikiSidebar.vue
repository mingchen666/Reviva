<script setup>
defineProps({
  wikis: { type: Array, default: () => [] },
  currentWikiId: { type: String, default: '' },
  isReady: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['create', 'open', 'delete'])

function statusMeta(status) {
  const key = String(status || '').toLowerCase().trim()
  const map = {
    ready: ['就绪', 'bg-emerald-400'],
    active: ['就绪', 'bg-emerald-400'],
    ingested: ['就绪', 'bg-emerald-400'],
    ok: ['就绪', 'bg-emerald-400'],
    indexing: ['处理中', 'bg-amber-400'],
    processing: ['处理中', 'bg-amber-400'],
    running: ['处理中', 'bg-amber-400'],
    extracting: ['处理中', 'bg-amber-400'],
    pending: ['等待中', 'bg-amber-400'],
    queued: ['等待中', 'bg-amber-400'],
    error: ['异常', 'bg-red-400'],
    failed: ['异常', 'bg-red-400'],
    empty: ['空', 'bg-slate-400'],
    idle: ['空闲', 'bg-slate-400'],
  }
  const [label, dot] = map[key] || [status || '未知', 'bg-slate-400']
  return { label, dot }
}
</script>

<template>
  <div class="h-full flex flex-col" :class="isDark ? 'bg-d1' : 'bg-l1'">
    <div class="h-12 px-3 flex items-center justify-between border-b" :class="isDark ? 'border-d4' : 'border-bdrL'">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <i class="ri-book-3-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Wiki知识库</span>
          <span v-if="isReady && wikis.length" class="ctx-pill !text-[9.5px] !px-1.5 !py-0" :class="isDark ? 'bg-d3 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">{{ wikis.length }}</span>
        </div>
        <p class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Agent 维护的本地知识空间</p>
      </div>
      <button
        class="wbtn h-8 px-3 rounded-lg shrink-0 inline-flex items-center justify-center gap-1 text-[12px] border"
        :class="isDark ? 'bg-transparent text-wt-sub border-bdr hover:bg-brand-400/10 hover:text-brand-400 hover:border-brand-400/40' : 'bg-transparent text-lt-sub border-bdrF hover:bg-brand-50 hover:text-brand-600 hover:border-brand-400/30'"
        title="新建 Wiki知识库"
        @click="emit('create')">
        <i class="ri-add-line text-[15px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span :class="isDark ? 'text-brand-400' : 'text-brand-500'">新建</span>
      </button>
    </div>

    <div v-if="!isReady" class="flex-1 flex flex-col items-center justify-center px-5 text-center gap-2">
      <i class="ri-folder-unlock-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">请先设置工作目录</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto px-2 py-3">
      <div
        v-for="wiki in wikis"
        :key="wiki.id"
        class="wiki-row relative w-full text-left rounded-lg px-2.5 py-2.5 mb-1 transition-colors"
        :class="wiki.id === currentWikiId
          ? (isDark ? 'bg-brand-400/10' : 'bg-brand-50')
          : (isDark ? 'hover:bg-white/5' : 'hover:bg-l4')">
        <span v-show="wiki.id === currentWikiId" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
        <div class="flex items-start gap-2">
          <button class="min-w-0 flex-1 text-left flex items-start gap-2.5" @click="emit('open', wiki.id)">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-px"
              :class="wiki.id === currentWikiId
                ? (isDark ? 'bg-brand-400/15 text-brand-400' : 'bg-brand-100 text-brand-500')
                : (isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux')">
              <i class="ri-book-ai-line text-[14px]" />
            </div>
            <div class="min-w-0 flex-1">
              <span class="block text-[12.5px] font-semibold truncate"
                :class="wiki.id === currentWikiId ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-main' : 'text-lt-main')">{{ wiki.name }}</span>
              <p v-if="wiki.description" class="mt-0.5 text-[10.5px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ wiki.description }}</p>
              <div class="meta-row mt-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <span class="meta-chip">
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusMeta(wiki.status).dot" />
                  {{ statusMeta(wiki.status).label }}
                </span>
                <span class="meta-chip" title="页面"><i class="ri-file-text-line" />{{ wiki.page_count || 0 }}</span>
                <span class="meta-chip" title="来源"><i class="ri-links-line" />{{ wiki.source_count || 0 }}</span>
                <span class="meta-chip" title="图片资产"><i class="ri-image-line" />{{ wiki.asset_count || 0 }}</span>
              </div>
            </div>
          </button>
          <button
            class="delete-btn h-7 w-7 rounded-md shrink-0 flex items-center justify-center transition-colors"
            :class="isDark ? 'text-wt-dim hover:text-red-300 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-600 hover:bg-red-50'"
            title="删除 Wiki"
            @click.stop="emit('delete', wiki)">
            <i class="ri-delete-bin-6-line text-[13px]" />
          </button>
        </div>
      </div>

      <div v-if="wikis.length === 0" class="py-10 text-center">
        <i class="ri-book-open-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="mt-2 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">还没有 Wiki</p>
        <button
          class="wbtn mt-3 px-4 h-9 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 border"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 border-brand-400/35 hover:bg-brand-400/20 hover:border-brand-400/55' : 'bg-brand-50 text-brand-600 border-brand-400/30 hover:bg-brand-100 hover:border-brand-400/45'"
          @click="emit('create')">
          <i class="ri-add-line text-[14px]" />新建 Wiki
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delete-btn {
  opacity: .55;
}
.wiki-row:hover .delete-btn,
.delete-btn:focus-visible {
  opacity: 1;
}
.wbtn {
  transition: transform .16s ease, background-color .15s ease, border-color .15s ease, color .15s ease;
}
.wbtn:hover {
  transform: translateY(-1px);
}
/* Status + stats: guaranteed no CJK vertical-stacking, independent of utility generation. */
.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 10px;
  row-gap: 4px;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  white-space: nowrap;
  word-break: keep-all;
}
</style>
