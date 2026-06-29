<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useTranslateStore } from '@/stores/translate'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const store = useTranslateStore()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)

// Build options with provider logo prefix in label
const modelOptionsWithLogo = computed(() => {
  return settingsStore.chatModelOptions.map(group => ({
    ...group,
    children: group.children?.map(opt => ({
      ...opt,
      label: opt.label, // keep model name as label
    }))
  }))
})
</script>

<template>
  <!-- Top bar -->
  <div class="shrink-0 px-5 py-2.5 flex items-center gap-3"
    :class="isDark ? 'bg-d1 border-b border-bdr' : 'bg-l1 border-b border-bdrL'">
    <!-- Brand identity -->
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center"
        :style="isDark ? { background: accentHex + '14' } : { background: accentHex + '12' }">
        <i class="ri-translate-ai-2 text-[16px]" :style="{ color: accentHex }" />
      </div>
      <div class="flex flex-col">
        <span class="text-[13px] font-bold leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 翻译</span>
        <span class="text-[9px] leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">智能多语言互译</span>
      </div>
    </div>
    <div class="flex-1" />
    <!-- History toggle -->
    <button @click="store.showHistoryDrawer = true"
      class="h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-all"
      :class="isDark ? 'bg-d3 text-wt-aux hover:text-wt-sub' : 'bg-l3 text-lt-aux'">
      <i class="ri-history-line text-[15px]" />
      <span class="text-[14px]">历史</span>
    </button>
    <!-- Model selector — logo inside the selector prefix -->
    <div class="flex items-center gap-1.5">
      <NSelect :value="store.selectedModelId" @update:value="v => store.selectedModelId = v"
        :options="modelOptionsWithLogo" size="small" :theme="isDark ? 'dark' : 'light'"
        placeholder="选择模型" style="min-width:180px" />
    </div>
    <!-- Settings -->
    <button @click="store.showSettingsModal = true"
      class="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
      :class="isDark ? 'bg-d3 text-wt-aux hover:text-wt-sub border border-bdr hover:border-brand-400/20' : 'bg-l3 text-lt-aux hover:text-lt-sub border border-bdrF hover:border-brand-400/30'">
      <i class="ri-settings-3-line text-[14px]" />
    </button>
  </div>
</template>