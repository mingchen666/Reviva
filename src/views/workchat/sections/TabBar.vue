<script setup>
import { computed } from 'vue'

const props = defineProps({
  tabs: Array,
  activeTabId: String,
  isDark: Boolean,
})

const emit = defineEmits(['activate', 'close', 'create', 'toggle-left', 'toggle-right', 'left-open', 'right-open'])

function activateTab(tabId) { emit('activate', tabId) }
function closeTab(tabId) { emit('close', tabId) }
</script>

<template>
  <div class="h-9 flex items-end px-2 gap-0.5 shrink-0"
    :class="isDark ? 'bg-d0' : 'bg-l0'"
    :style="{ borderBottom: `1px solid ${isDark ? '#2e2e3a' : '#dddcd9'}` }">
    <div v-for="tab in tabs" :key="tab.id"
      @click="activateTab(tab.id)"
      class="tab-item h-[32px] px-3 flex items-center gap-1.5 text-[12px] min-w-[120px] max-w-[180px] relative cursor-pointer rounded-t-lg transition-all"
      :class="activeTabId === tab.id
        ? (isDark ? 'bg-d2 text-wt-main' : 'bg-l2 text-lt-main')
        : (isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4')">
      <i class="ri-chat-3-line text-brand-400 text-[12px]" />
      <span class="truncate">{{ tab.name }}</span>
      <button @click.stop="closeTab(tab.id)"
        class="tab-close ml-auto"
        :class="isDark ? 'hover:text-red-400' : 'hover:text-red-500'">
        <i class="ri-close-line text-[10px]" />
      </button>
      <div v-if="activeTabId === tab.id" class="absolute top-0 left-0 w-full h-[2px] rounded-t-md bg-brand-400" />
    </div>
    <button @click="emit('create')" class="h-[32px] w-7 flex items-center justify-center rounded-t-lg transition-colors"
      :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
      <i class="ri-add-line text-[12px]" />
    </button>
    <div class="ml-auto flex items-center gap-1 self-center h-full pb-1.5">
      <button v-if="!leftOpen" @click="emit('toggle-left')"
        class="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
        <i class="ri-side-bar-line text-[14px]" />
      </button>
      <button @click="emit('toggle-right')"
        class="h-7 w-7 rounded-md flex items-center justify-center transition-colors"
        :class="rightOpen
          ? (isDark ? 'text-brand-400 bg-brand-400/8' : 'text-brand-500 bg-brand-50')
          : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-layout-column-line text-[14px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-item .tab-close { opacity: 0; transition: opacity .12s }
.tab-item:hover .tab-close { opacity: 1 }
</style>