<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTranslateStore } from '@/stores/translate'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const store = useTranslateStore()
const isDark = computed(() => appStore.isDark)

const showClearConfirm = ref(false)

function langLabel(code) {
  return store.languages.find(l => l.code === code)?.label || code
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return `${Math.floor(diff / 86400000)}天前`
}

function truncate(text, len = 50) {
  if (!text) return ''
  return text.length > len ? text.slice(0, len) + '...' : text
}

function requestDelete(id) {
  store.pendingDeleteId = id
  showClearConfirm.value = false
}

function confirmDelete() {
  if (store.pendingDeleteId) {
    store.deleteHistoryItem(store.pendingDeleteId)
    store.pendingDeleteId = null
  }
}

function requestClearAll() {
  store.pendingDeleteId = null
  showClearConfirm.value = true
}

function confirmClearAll() {
  store.clearHistory()
  showClearConfirm.value = false
  store.showHistoryDrawer = false
}
</script>

<template>
  <!-- Drawer overlay -->
  <Transition name="drawer">
    <div v-if="store.showHistoryDrawer" class="fixed inset-0 z-50 flex justify-end">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="store.showHistoryDrawer = false" />
      <!-- Drawer panel -->
      <div class="relative w-[320px] h-full flex flex-col"
        :class="isDark ? 'bg-d1' : 'bg-l1'">
        <!-- Header -->
        <div class="px-4 py-3 flex items-center gap-0 shrink-0"
          :class="isDark ? 'border-b border-bdr' : 'border-b border-bdrL'">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center"
           >
            <i class="ri-history-line text-[13px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <span class="text-[12px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">翻译历史</span>
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d3 border border-bdr' : 'text-lt-aux bg-l3 border border-bdrF'" style="font-size:9px;padding:1px 6px">
            {{ store.history.length }}
          </span>
          <div class="flex-1" />
          <button v-if="store.history.length > 0" @click="requestClearAll()"
            class="h-6 px-2 text-red rounded-md flex items-center gap-1 text-[14px] transition-all"
            :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/6' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
            <i class="ri-delete-bin-line text-[14px]" />清空
          </button>
          <button @click="store.showHistoryDrawer = false"
            class="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            :class="isDark ? 'text-wt-aux hover:text-wt-main bg-d3 hover:bg-d4' : 'text-lt-aux hover:text-lt-main bg-l3 hover:bg-l4'">
            <i class="ri-close-line text-[14px]" />
          </button>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          <button v-for="item in store.history" :key="item.id"
            @click="store.loadFromHistory(item); store.showHistoryDrawer = false"
            class="w-full rounded-xl px-3.5 py-2.5 text-left transition-all relative group"
            :class="isDark ? 'hover:bg-white/4 bg-d2 border border-transparent hover:border-bdr' : 'hover:bg-l3 bg-white border border-bdrF hover:border-brand-200'">
            <!-- Delete button -->
            <button @click.stop="requestDelete(item.id)"
              class="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
              <i class="ri-close-line text-[10px]" />
            </button>
            <div class="flex items-center gap-1.5 mb-1.5">
              <span class="ctx-pill" :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/15' : 'text-brand-600 bg-brand-50 border border-brand-100'" style="font-size:9px;padding:1px 6px">
                {{ langLabel(item.sourceLang) }} → {{ langLabel(item.targetLang) }}
              </span>
              <span class="text-[9px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ timeAgo(item.timestamp) }}</span>
            </div>
            <div class="text-[11px] truncate pr-6 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ truncate(item.sourceText) }}</div>
            <div class="text-[11px] truncate mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ truncate(item.translatedText) }}</div>
          </button>
          <!-- Empty state -->
          <div v-if="store.history.length === 0" class="flex flex-col items-center py-16 gap-3">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <i class="ri-history-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </div>
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无翻译历史</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Delete single item confirm -->
  <MsModal v-if="store.pendingDeleteId" v-model:show="pendingDeleteId" :width="340" :show-footer="true" @close="store.pendingDeleteId = null">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
          <i class="ri-delete-bin-line text-red-400 text-[14px]" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">删除记录</span>
      </div>
    </template>
    <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">确定删除这条翻译记录吗？此操作不可撤销。</p>
    <template #footer="{ close }">
      <button @click="store.pendingDeleteId = null; close()" class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub bg-d3' : 'text-lt-aux hover:text-lt-sub bg-l3'">取消</button>
      <button @click="confirmDelete(); close()" class="h-8 px-4 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">确认删除</button>
    </template>
  </MsModal>

  <!-- Clear all confirm -->
  <MsModal v-if="showClearConfirm" v-model:show="showClearConfirm" :width="340" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
          <i class="ri-delete-bin-line text-red-400 text-[14px]" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">清空历史</span>
      </div>
    </template>
    <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">确定清空所有 <span class="font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ store.history.length }}</span> 条翻译记录吗？此操作不可撤销。</p>
    <template #footer="{ close }">
      <button @click="showClearConfirm = false; close()" class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub bg-d3' : 'text-lt-aux hover:text-lt-sub bg-l3'">取消</button>
      <button @click="confirmClearAll(); close()" class="h-8 px-4 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">确认清空</button>
    </template>
  </MsModal>
</template>

<style scoped>
.drawer-enter-active { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) }
.drawer-leave-active { transition: all 0.15s ease-in }
.drawer-enter-from, .drawer-leave-to { opacity: 0 }
.drawer-enter-from > div:last-child, .drawer-leave-to > div:last-child { transform: translateX(100%) }
</style>
