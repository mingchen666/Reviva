<script setup>
const props = defineProps({
  isDark: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
})

const emit = defineEmits(['insert', 'undo', 'redo'])

const groups = [
  [
    { type: 'h1', icon: 'ri-h-1', tip: '标题' },
    { type: 'h2', icon: 'ri-h-2', tip: '副标题' },
    { type: 'h3', icon: 'ri-h-3', tip: '三级标题' },
    { type: 'h4', icon: 'ri-h-4', tip: '四级标题' },
    { type: 'h5', icon: 'ri-h-5', tip: '五级标题' },
    { type: 'h6', icon: 'ri-h-6', tip: '六级标题' },
  ],
  [
    { type: 'bold', icon: 'ri-bold', tip: '粗体' },
    { type: 'italic', icon: 'ri-italic', tip: '斜体' },
    { type: 'strike', icon: 'ri-strikethrough', tip: '删除线' },
  ],
  [
    { type: 'list', icon: 'ri-list-unordered', tip: '无序列表' },
    { type: 'ordered-list', icon: 'ri-list-ordered', tip: '有序列表' },
    { type: 'task-list', icon: 'ri-list-check-3', tip: '任务列表' },
    { type: 'quote', icon: 'ri-double-quotes-l', tip: '引用' },
  ],
  [
    { type: 'code', icon: 'ri-code-line', tip: '行内代码' },
    { type: 'codeblock', icon: 'ri-code-s-slash-line', tip: '代码块' },
    { type: 'link', icon: 'ri-link', tip: '链接' },
    { type: 'image', icon: 'ri-image-line', tip: '图片' },
    { type: 'table', icon: 'ri-table-2', tip: '表格' },
    { type: 'hr', icon: 'ri-subtract-line', tip: '分割线' },
    { type: 'formula', icon: 'ri-function-line', tip: '公式 $$' },
  ],
]
</script>

<template>
  <div class="h-9 toolbar-strip flex items-center shrink-0 gap-0.5 px-2"
    :class="[isDark ? 'bg-d4 border-b border-bdr' : 'bg-l4 border-b border-bdrF']">
    <!-- Label slot (split mode) -->
    <slot name="label" />

    <!-- Undo / Redo group -->
    <div class="flex items-center">
      <button @click="emit('undo')" :disabled="!canUndo" title="撤销"
        class="tb-btn group"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/8 disabled:text-wt-dim disabled:hover:bg-transparent' : 'text-lt-aux hover:text-lt-sub hover:bg-black/6 disabled:text-lt-aux/40 disabled:hover:bg-transparent'">
        <i class="ri-arrow-go-back-line text-[12px]" />
        <span class="tb-tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">撤销 ⌃Z</span>
      </button>
      <button @click="emit('redo')" :disabled="!canRedo" title="重做"
        class="tb-btn group"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/8 disabled:text-wt-dim disabled:hover:bg-transparent' : 'text-lt-aux hover:text-lt-sub hover:bg-black/6 disabled:text-lt-aux/40 disabled:hover:bg-transparent'">
        <i class="ri-arrow-go-forward-line text-[12px]" />
        <span class="tb-tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">重做 ⌃⇧Z</span>
      </button>
    </div>
    <div class="tb-sep" :class="isDark ? 'bg-wt-dim' : 'bg-lt-aux'" />

    <!-- Markdown groups -->
    <div class="flex items-center">
      <template v-for="(group, gi) in groups" :key="gi">
        <button v-for="item in group" :key="item.type" @click="emit('insert', item.type)" :title="item.tip" class="tb-btn group"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/8' : 'text-lt-aux hover:text-lt-sub hover:bg-black/6'">
          <i :class="[item.icon, 'text-[12px]']" />
          <span class="tb-tip" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main shadow-sm'">{{ item.tip }}</span>
        </button>
        <div v-if="gi < groups.length - 1" class="tb-sep" :class="isDark ? 'bg-wt-dim' : 'bg-lt-aux'" />
      </template>
    </div>

    <div class="flex-1 min-w-2" />
  </div>
</template>

<style scoped>
.toolbar-strip {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.toolbar-strip::-webkit-scrollbar { display: none }
.tb-btn {
  width: 28px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.tb-btn:disabled { cursor: not-allowed }
.tb-sep {
  width: 1px;
  height: 14px;
  margin: 0 4px;
  opacity: 0.25;
}
.tb-tip {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  white-space: nowrap;
  z-index: 50;
}
.tb-btn:hover .tb-tip { opacity: 1 }
</style>
