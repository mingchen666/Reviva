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
</script>

<template>
  <MsModal v-if="store.showSettingsModal" v-model:show="store.showSettingsModal" :width="420" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
          <i class="ri-settings-3-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">翻译设置</span>
      </div>
    </template>

    <div class="space-y-3">
      <!-- Markdown toggle -->
      <div class="flex items-center justify-between py-2.5 px-3 rounded-lg"
        :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2">
          <i class="ri-markdown-line text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-600'" />
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">渲染 Markdown</span>
        </div>
        <button @click="store.mdPreview = !store.mdPreview"
          class="relative w-[34px] h-[18px] rounded-full transition-colors shrink-0"
          :class="store.mdPreview ? 'bg-brand-400' : (isDark ? 'bg-d4' : 'bg-l4')">
          <span class="absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm"
            :class="store.mdPreview ? 'translate-x-[16px]' : ''" />
        </button>
      </div>

      <!-- Temperature -->
      <div class="py-2.5 px-3 rounded-lg"
        :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-temp-hot-line text-[12px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">温度参数</span>
          <div class="flex-1" />
          <span class="text-[13px] font-mono font-bold rounded-md px-1.5 py-0.5 min-w-[36px] text-center"
            :class="isDark ? 'text-brand-400 bg-d0' : 'text-brand-600 bg-white'">{{ store.temperature }}</span>
        </div>
        <input v-model.number="store.temperature" type="range" min="0" max="1" step="0.1"
          class="w-full accent-brand-400" />
        <div class="flex items-center justify-between mt-2">
          <span class="ctx-pill" :class="isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/15' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'" style="font-size:9px">0.1 精确</span>
          <span class="ctx-pill" :class="isDark ? 'text-amber-400 bg-amber-400/8 border border-amber-400/15' : 'text-amber-600 bg-amber-50 border border-amber-100'" style="font-size:9px">0.5 适中</span>
          <span class="ctx-pill" :class="isDark ? 'text-rose-400 bg-rose-400/8 border border-rose-400/15' : 'text-rose-600 bg-rose-50 border border-rose-100'" style="font-size:9px">1.0 创意</span>
        </div>
      </div>

      <!-- System prompt -->
      <div class="py-2.5 px-3 rounded-lg"
        :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-chat-settings-line text-[12px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">系统提示词</span>
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-white border border-bdrF'" style="font-size:9px;padding:1px 4px">{source_lang} / {target_lang}</span>
          <div class="flex-1" />
          <button @click="store.resetSystemPrompt()"
            class="h-6 px-2 rounded-md flex items-center gap-1 text-[9px] font-medium transition-all"
            :class="isDark ? 'text-wt-dim hover:text-brand-400' : 'text-lt-aux hover:text-brand-600'">
            <i class="ri-refresh-line text-[9px]" />恢复默认
          </button>
        </div>
        <textarea v-model="store.systemPrompt" :placeholder="store.defaultSystemPrompt"
          class="w-full h-[100px] rounded-lg px-3 py-2 text-[12px] outline-none transition-colors resize-none leading-relaxed"
          :class="isDark ? 'bg-d0 border border-bdr text-wt-sub placeholder-wt-dim/50 focus:border-brand-400/40' : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-brand-400'" />
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="h-8 px-5 rounded-lg text-[11px] font-semibold transition-all"
        :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
        :style="{ boxShadow: isDark ? `0 4px 14px ${accentHex}30` : `0 4px 14px ${accentHex}20` }">
        完成
      </button>
    </template>
  </MsModal>
</template>