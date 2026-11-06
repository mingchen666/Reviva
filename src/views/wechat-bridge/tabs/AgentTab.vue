<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)
const agents = computed(() => botStore.agents)
const open = ref(false)
const searchQuery = ref('')
const currentAgent = computed(() => agents.value.find(a => a.id === botStore.config.defaultAgentId) || null)
const filteredAgents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return agents.value
  return agents.value.filter(a => {
    const name = (a.name || '').toLowerCase()
    const desc = (a.description || '').toLowerCase()
    const model = (a.model || '').toLowerCase()
    return name.includes(q) || desc.includes(q) || model.includes(q)
  })
})
function pick(id) { botStore.setConfig({ defaultAgentId: id }); open.value = false; msg.success('默认 Agent 已更新') }
function toggle() { open.value = !open.value; if (open.value) searchQuery.value = '' }
function close() { open.value = false }
function pickTimeout(e) {
  const v = Math.max(1, Math.min(30, Number(e.target.value) || 5))
  botStore.setConfig({ agentTimeout: v })
  e.target.value = v
  msg.success('回复超时已更新为 ' + v + ' 分钟')
}
</script>
<template>
  <div class="max-w-5xl mx-auto px-5 space-y-4">
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-robot-2-line text-[15px] text-brand-400" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">默认 Agent</span>
      </div>
      <p class="text-[11.5px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">微信消息将转发给此 Agent 处理。切换 Agent 时上下文共享，不丢失对话历史。</p>
      <div class="relative">
        <button type="button" class="w-full flex items-center gap-2.5 h-10 px-3 rounded-lg" :class="isDark ? 'bg-d3 border border-d4' : 'bg-l3 border border-bdrF'" @click="toggle">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d2 text-brand-400' : 'bg-l4 text-brand-500'"><i :class="(currentAgent && currentAgent.icon) || 'ri-sparkling-2-line'" class="text-[14px]" /></div>
          <div class="flex-1 min-w-0 text-left">
            <div v-if="currentAgent" class="text-[12.5px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ currentAgent.name }}</div>
            <div v-else class="text-[12.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择 Agent</div>
          </div>
          <i class="ri-arrow-down-s-line text-[16px] transition-transform" :class="[open ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
        </button>
        <div v-if="open" class="fixed inset-0 z-40" @click="close" />
        <div v-if="open" class="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg max-h-[340px] overflow-y-auto" :class="isDark ? 'bg-d2 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
          <div class="sticky top-0 z-10 p-2 border-b" :class="isDark ? 'border-d4 bg-d2' : 'border-bdrF bg-l2'">
            <div class="relative">
              <i class="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-[13.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <input v-model="searchQuery" type="text" placeholder="搜索 Agent 名称 / 描述 / 模型" class="w-full h-8 pl-7 pr-3 rounded-md text-[12.5px] outline-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-main' : 'bg-l3 border border-bdrF text-lt-main'" @click.stop />
            </div>
          </div>
          <button v-if="!filteredAgents.length" type="button" class="w-full text-center py-6 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" @click="close">{{ agents.length ? '无匹配 Agent' : '暂无可用 Agent' }}</button>
          <button v-for="a in filteredAgents" :key="a.id" type="button" class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left" :class="botStore.config.defaultAgentId === a.id ? (isDark ? 'bg-brand-400/10' : 'bg-brand-50') : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')" @click="pick(a.id)">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3 text-brand-400' : 'bg-l4 text-brand-500'"><i :class="a.icon || 'ri-sparkling-2-line'" class="text-[14px]" /></div>
            <div class="flex-1 min-w-0">
              <div class="text-[12.5px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ a.name }}</div>
              <div v-if="a.description || a.model" class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.description || a.model }}</div>
            </div>
            <i v-if="botStore.config.defaultAgentId === a.id" class="ri-check-line text-[16px] text-brand-400 shrink-0" />
          </button>
        </div>
      </div>
      <div class="mt-4 pt-4 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-timer-line text-[14px] text-brand-400" />
          <span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">回复超时</span>
        </div>
        <p class="text-[11.5px] mb-2.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Agent 单次处理超过此时间将提示超时并中止，避免长时间无响应。多轮任务建议 5 分钟以上。</p>
        <div class="flex items-center gap-3">
        <input type="number" min="1" max="30" :value="botStore.config.agentTimeout || 5" @change="pickTimeout($event)" class="w-20 h-8 px-2 rounded-md text-[14px] text-center outline-none" :class="isDark ? 'bg-d3 text-wt-main border border-bdr' : 'bg-l3 text-lt-main border border-bdrF'" />
        <span class="text-[12.5px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">分钟（1-30）</span>
      </div>
    </div>
      <div class="mt-3 pt-3 border-t text-[11.5px] leading-relaxed" :class="[isDark ? 'border-d4 text-wt-aux' : 'border-bdrF text-lt-aux']">也可在微信中发 <code class="px-1 py-0.5 rounded text-[11px] font-mono" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">/agent</code> 列出或切换；发 <code class="px-1 py-0.5 rounded text-[11px] font-mono" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">/status</code> 查看当前状态。</div>
    </div>
  </div>
</template>
