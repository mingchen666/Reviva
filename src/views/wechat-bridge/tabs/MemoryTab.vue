<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)
const convStorage = computed(() => botStore.config.conversationStorage)
const win = computed(() => botStore.config.historyWindow)
function toggleStorage() { botStore.setConfig({ conversationStorage: !botStore.config.conversationStorage }); msg.success(botStore.config.conversationStorage ? '已开启对话存储' : '已关闭对话存储') }
function setWin(v) { botStore.setConfig({ historyWindow: Number(v) }) }
</script>
<template>
  <div class="max-w-5xl mx-auto px-5 space-y-4">
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3"><i class="ri-database-2-line text-[15px] text-blue-400" /><span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">对话存储</span></div>
      <div class="flex items-center gap-2.5 rounded-lg px-3 py-3" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l3 border border-bdrF'">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-blue-400/15 text-blue-400' : 'bg-blue-50 text-blue-500'"><i class="ri-save-3-line text-[18px]" /></div>
        <div class="flex-1"><div class="text-[12.5px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">存储对话记录</div><div class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">开启后 Bot 对话保存到「Bot 对话」分组</div></div>
        <div class="toggle" :class="convStorage ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleStorage" />
      </div>
      <div class="mt-4 pt-4 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><i class="ri-stack-line text-[14px] text-blue-400" /><span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">上下文窗口</span></div><span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">{{ win }} 轮</span></div>
        <input type="range" min="4" max="50" :value="win" @input="setWin($event.target.value)" class="slider w-full" />
        <div class="text-[11.5px] mt-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">每轮 = 1 条提问 + 1 条回复。系统会自动压缩超出部分。切换 Agent 时上下文共享。</div>
      </div>
    </div>
  </div>
</template>
