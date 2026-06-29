<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const isMac = window.electronAPI?.platform === 'darwin'
const isMaximized = ref(false)

onMounted(async () => {
  if (isMac || !window.electronAPI?.window) return
  try {
    isMaximized.value = await window.electronAPI.window.isMaximized()
  } catch {
    /* ignore */
  }
  window.electronAPI.window.onMaximizedChanged((v) => {
    isMaximized.value = v
  })
})

onBeforeUnmount(() => {
  window.electronAPI?.window?.removeMaximizedListeners?.()
})

function minimize() {
  window.electronAPI?.window?.minimize()
}
function toggleMax() {
  window.electronAPI?.window?.maximize()
}
function close() {
  window.electronAPI?.window?.close()
}
</script>

<template>
  <div
    v-if="!isMac"
    class="h-8 flex items-center shrink-0 drag-region select-none"
    :class="isDark ? 'bg-d0 border-b border-bdr' : 'bg-l0 border-b border-bdrL'">
    <!-- Brand -->
    <div class="flex items-center gap-2 p-2">
      <img class="h-10 w-10" :src="isDark ? './logo-dark.png' : './logo-light.png'" alt="Reviva" />
      <span class="text-[14px] font-semibold tracking-wide" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
        Reviva
      </span>
    </div>

    <!-- Draggable spacer -->
    <div class="flex-1 h-full" />

    <!-- Window controls -->
    <div class="flex items-center h-full no-drag">
      <button
        class="title-btn"
        :class="isDark ? 'text-wt-sub hover:bg-white/8' : 'text-lt-sub hover:bg-l3'"
        @click="minimize"
        aria-label="最小化">
        <i class="ri-subtract-line text-[14px]" />
      </button>
      <button
        class="title-btn"
        :class="isDark ? 'text-wt-sub hover:bg-white/8' : 'text-lt-sub hover:bg-l3'"
        @click="toggleMax"
        :aria-label="isMaximized ? '还原' : '最大化'">
        <i :class="isMaximized ? 'ri-file-copy-line' : 'ri-checkbox-blank-line'" class="text-[12px]" />
      </button>
      <button
        class="title-btn close-btn"
        :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
        @click="close"
        aria-label="关闭">
        <i class="ri-close-line text-[14px]" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-btn {
  width: 46px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s,
    color 0.12s;
}
.close-btn:hover {
  background: #e81123;
  color: #fff;
}
</style>
