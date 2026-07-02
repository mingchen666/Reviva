<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  isDark: Boolean,
  ctxItems: { type: Array, default: () => [] },
})

const emit = defineEmits(['remove-ctx', 'clear-ctx'])

const showClearConfirm = ref(false)
const showAllItems = ref(false)
const listRef = ref(null)
const isListOverflowing = ref(false)
let resizeObserver = null
const COLLAPSED_ITEM_COUNT = 4

const hasOverflowSummary = computed(() => props.ctxItems.length > COLLAPSED_ITEM_COUNT)
const visibleCtxItems = computed(() => (
  hasOverflowSummary.value && !showAllItems.value
    ? props.ctxItems.slice(0, COLLAPSED_ITEM_COUNT)
    : props.ctxItems
))
const hiddenCount = computed(() => Math.max(0, props.ctxItems.length - visibleCtxItems.value.length))

function contextPillClass(item) {
  if (item.type === 'kb' || item.type === 'cloud_kb' || item.type === 'cloud_doc') {
    return props.isDark
      ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20'
      : 'bg-brand-50 text-brand-500 border border-brand-100'
  }
  if (item.type === 'image') {
    return props.isDark
      ? 'bg-pink-400/10 text-pink-400 border border-pink-400/20'
      : 'bg-pink-50 text-pink-500 border border-pink-100'
  }
  if (item.type === 'folder' || item.type === 'local_folder') {
    return props.isDark
      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
      : 'bg-amber-50 text-amber-600 border border-amber-200'
  }
  return props.isDark
    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
}

function contextIcon(item) {
  if (item.type === 'cloud_kb') return item.icon || 'ri-database-2-line'
  if (item.type === 'cloud_doc') return 'ri-file-list-3-line'
  return item.icon || 'ri-file-line'
}

function contextLabel(item) {
  if (item.type === 'cloud_kb') return `知识库 · ${item.name || '未命名'}`
  if (item.type === 'cloud_doc') return `知识库文档 · ${item.name || '未命名'}`
  return item.name || '未命名'
}

function confirmClear() {
  emit('clear-ctx')
  showClearConfirm.value = false
}

function measureListOverflow() {
  const el = listRef.value
  isListOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1
}

function observeList() {
  resizeObserver?.disconnect()
  if (typeof ResizeObserver === 'undefined' || !listRef.value) return
  resizeObserver = new ResizeObserver(measureListOverflow)
  resizeObserver.observe(listRef.value)
}

onMounted(() => {
  nextTick(() => {
    observeList()
    measureListOverflow()
  })
})

watch(
  () => [props.ctxItems.length, showAllItems.value],
  () => nextTick(() => {
    if (props.ctxItems.length <= COLLAPSED_ITEM_COUNT) showAllItems.value = false
    observeList()
    measureListOverflow()
  })
)

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div v-if="ctxItems.length" class="context-pills-wrap mb-1.5">
    <div
      ref="listRef"
      class="context-pills-list flex flex-wrap gap-1.5 min-w-0 overflow-y-auto"
      :class="{ 'is-overflowing': isListOverflowing, 'is-expanded': showAllItems }">
      <button
        v-for="item in visibleCtxItems"
        :key="item.id"
        @click="emit('remove-ctx', item)"
        class="ctx-pill cursor-pointer group"
        :title="contextLabel(item)"
        :class="contextPillClass(item)">
        <i :class="contextIcon(item)" class="text-[10px] shrink-0" />
        <span class="ctx-pill-label truncate">{{ contextLabel(item) }}</span>
        <i class="ri-close-line ml-0.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
      <button
        v-if="hiddenCount > 0"
        @click="showAllItems = true"
        class="ctx-pill ctx-more-pill cursor-pointer"
        title="展开全部上下文"
        :class="isDark ? 'bg-white/6 text-wt-sub border border-white/10 hover:bg-white/10' : 'bg-l3 text-lt-sub border border-bdrL hover:bg-l4'">
        <i class="ri-more-line text-[10px] shrink-0" />
        <span>还有 {{ hiddenCount }} 个</span>
      </button>
      <button
        v-if="showAllItems && hasOverflowSummary"
        @click="showAllItems = false"
        class="ctx-pill ctx-collapse-pill cursor-pointer"
        title="收起上下文列表"
        :class="isDark ? 'bg-white/6 text-wt-dim border border-white/10 hover:text-wt-sub hover:bg-white/10' : 'bg-l3 text-lt-aux border border-bdrL hover:text-lt-sub hover:bg-l4'">
        <i class="ri-arrow-up-s-line text-[11px] shrink-0" />
        <span>收起</span>
      </button>
      <button
        v-if="ctxItems.length > 0"
        @click="showClearConfirm = true"
        class="ctx-pill ctx-clear-pill cursor-pointer"
        title="清空所有上下文"
        :class="
          isDark
            ? 'text-red-400 bg-red-400/8 border border-red-400/20 hover:bg-red-400/15'
            : 'text-red-500 bg-red-50 border border-red-200 hover:bg-red-100'
        ">
        <i class="ri-delete-bin-line text-[10px] shrink-0" />
        <span class="ctx-clear-label">清空</span>
      </button>
    </div>

    <div
      v-if="showClearConfirm"
      class="mt-1.5 rounded-xl px-2.5 py-2 flex items-center gap-2 text-[11px] shadow-sm animate-fade-in"
      :class="isDark ? 'bg-red-500/10 border border-red-400/25 text-red-100 shadow-black/20' : 'bg-red-50 border border-red-200 text-red-700 shadow-red-100/80'">
      <span
        class="h-6 w-6 rounded-lg flex items-center justify-center shrink-0"
        :class="isDark ? 'bg-red-400/15 text-red-200' : 'bg-red-100 text-red-600'">
        <i class="ri-alert-line text-[12px]" />
      </span>
      <span class="min-w-0 flex-1" :class="isDark ? 'text-red-100/90' : 'text-red-700'">清空所有已选上下文？</span>
      <button
        @click="confirmClear"
        class="h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors bg-red-500 text-white hover:bg-red-600 active:bg-red-700">
        清空
      </button>
      <button
        @click="showClearConfirm = false"
        class="h-7 px-3 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:text-wt-main bg-white/6 hover:bg-white/10' : 'text-lt-sub hover:text-lt-main bg-white hover:bg-red-100/70 border border-red-200/70'">
        取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.context-pills-wrap {
  container-type: inline-size;
}

.context-pills-list {
  max-height: 50px;
  padding-right: 4px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.22) transparent;
}

.context-pills-list:not(.is-expanded):not(.is-overflowing) {
  overflow-y: hidden;
}

.context-pills-list:hover {
  scrollbar-color: rgba(108, 138, 255, 0.36) transparent;
}

.context-pills-list::-webkit-scrollbar {
  width: 5px;
}

.context-pills-list::-webkit-scrollbar-track {
  background: transparent;
  margin-block: 3px;
}

.context-pills-list::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.18);
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: content-box;
}

.context-pills-list:hover::-webkit-scrollbar-thumb {
  background: rgba(108, 138, 255, 0.34);
  background-clip: content-box;
}

.ctx-pill {
  font-size: 11px;
  border-radius: 5px;
  padding: 2px 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  max-width: 180px;
  transition: all 0.15s;
}

.ctx-pill-label {
  max-width: 132px;
  min-width: 0;
}

.ctx-clear-pill {
  max-width: none;
}

.ctx-more-pill,
.ctx-collapse-pill {
  max-width: none;
}

.context-pills-list.is-overflowing .ctx-clear-pill {
  position: sticky;
  right: 4px;
  bottom: 0;
  z-index: 1;
}

@container (max-width: 520px) {
  .ctx-pill {
    max-width: 132px;
    padding-left: 6px;
    padding-right: 6px;
  }

  .ctx-pill-label {
    max-width: 88px;
  }

  .ctx-clear-label {
    display: none;
  }

  .ctx-clear-pill {
    width: 24px;
    padding-left: 0;
    padding-right: 0;
    justify-content: center;
  }
}

@container (max-width: 360px) {
  .ctx-pill {
    max-width: 104px;
  }

  .ctx-pill-label {
    max-width: 62px;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.15s ease-out;
}
</style>
