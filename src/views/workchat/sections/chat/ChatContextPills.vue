<script setup>
import { ref } from 'vue'

const props = defineProps({
  isDark: Boolean,
  ctxItems: { type: Array, default: () => [] },
})

const emit = defineEmits(['remove-ctx', 'clear-ctx'])

const showClearConfirm = ref(false)

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
</script>

<template>
  <div v-if="ctxItems.length" class="mb-1.5 flex items-center gap-1.5 flex-wrap">
    <button
      v-for="item in ctxItems"
      :key="item.id"
      @click="emit('remove-ctx', item)"
      class="ctx-pill cursor-pointer group"
      :class="contextPillClass(item)">
      <i :class="contextIcon(item)" class="text-[10px]" />
      <span class="truncate max-w-[132px]">{{ contextLabel(item) }}</span>
      <i class="ri-close-line ml-0.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>

    <button
      v-if="ctxItems.length > 0"
      @click="showClearConfirm = true"
      class="ctx-pill cursor-pointer"
      :class="
        isDark
          ? 'text-red-400 bg-red-400/8 border border-red-400/20 hover:bg-red-400/15'
          : 'text-red-500 bg-red-50 border border-red-200 hover:bg-red-100'
      ">
      <i class="ri-delete-bin-line text-[10px]" />
      清空
    </button>

    <div
      v-if="showClearConfirm"
      class="basis-full mt-1.5 rounded-xl px-2.5 py-2 flex items-center gap-2 text-[11px] shadow-sm animate-fade-in"
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
.ctx-pill {
  font-size: 11px;
  border-radius: 5px;
  padding: 2px 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
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
