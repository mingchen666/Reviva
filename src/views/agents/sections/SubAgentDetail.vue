<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'

const props = defineProps({
  subAgent: Object,
  isDark: Boolean,
})

const emit = defineEmits(['edit', 'delete'])
const agentsStore = useAgentsStore()

const isCustom = computed(() => !props.subAgent.builtin)

function normalizeSubAgentKey(value) {
  return String(value || '').trim().replace(/^sa_/i, '').toLowerCase().replace(/[\s_]+/g, '-')
}

function subAgentKeys(sa) {
  return [
    sa?.id,
    sa?.name,
    sa?.runtimeName,
    ...(Array.isArray(sa?.aliases) ? sa.aliases : []),
  ].map(normalizeSubAgentKey).filter(Boolean)
}

const usedByAgents = computed(() => {
  const keys = new Set(subAgentKeys(props.subAgent))
  return agentsStore.agents
    .filter(a => (a.subAgents || a.sub_agents || []).some(id => keys.has(normalizeSubAgentKey(id))))
    .map(a => a.name)
})

const boundTools = computed(() => {
  if (!props.subAgent.tools) return []
  return props.subAgent.tools.map(tid => {
    const builtin = agentsStore.builtinTools.find(t => t.id === tid)
    const custom = agentsStore.customTools.find(t => t.id === tid)
    return builtin || custom || { id: tid, name: tid }
  })
})

const boundSkills = computed(() => {
  if (!props.subAgent.skills) return []
  return props.subAgent.skills.map(sid => {
    const platform = agentsStore.platformSkills.find(s => s.id === sid)
    const custom = agentsStore.customSkills.find(s => s.id === sid)
    return platform || custom || { id: sid, name: sid }
  })
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2.5">
        <div class="w-[24px] h-[24px] rounded-md flex items-center justify-center" :class="isDark ? 'bg-d0' : 'bg-l2'"><i :class="subAgent.icon + ' text-[13px]'" :style="'color:' + subAgent.color" /></div>
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ subAgent.name }}</span>
        <span class="ctx-pill" :class="subAgent.builtin ? (isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100') : (isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100')">{{ subAgent.builtin ? '内置' : '自定义' }}</span>
      </div>
      <div v-if="isCustom" class="flex items-center gap-1.5">
        <button @click="emit('edit')" class="px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/6' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"><i class="ri-edit-line text-[12px]" /> 编辑</button>
        <button @click="emit('delete')" class="px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'text-red-400/70 hover:text-red-400 hover:bg-red-400/8' : 'text-red-400 hover:text-red-500 hover:bg-red-50'"><i class="ri-delete-bin-line text-[12px]" /> 删除</button>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-7 py-6 fade-up">
        <div class="flex items-start gap-4 mb-6">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[26px]" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'" :style="'color:' + subAgent.color"><i :class="subAgent.icon" /></div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ subAgent.name }}</h1>
            <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ subAgent.desc || (subAgent.description || '暂无描述') }}</p>
          </div>
        </div>

        <!-- Prompt (custom sub-agents) -->
        <div v-if="isCustom && subAgent.prompt" class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3"><i class="ri-chat-smile-2-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">系统提示词</span></div>
          <p class="text-[12px] leading-relaxed whitespace-pre-wrap" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ subAgent.prompt }}</p>
        </div>

        <!-- Built-in abilities (builtin sub-agents) -->
        <div v-if="subAgent.abilities && subAgent.abilities.length" class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3"><i class="ri-flashlight-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">关联能力</span></div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="ab in subAgent.abilities" :key="ab" class="ctx-pill" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">
              <i class="ri-flashlight-line text-[10px]" /> {{ ab }}
            </span>
          </div>
        </div>

        <!-- Bound Tools (custom sub-agents) -->
        <div v-if="isCustom && boundTools.length" class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3"><i class="ri-tools-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可用工具</span></div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="t in boundTools" :key="t.id" class="ctx-pill" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
              <i :class="(t.icon || 'ri-tools-line') + ' text-[10px]'"/> {{ t.name }}
            </span>
          </div>
        </div>

        <!-- Bound Skills (custom sub-agents) -->
        <div v-if="isCustom && boundSkills.length" class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3"><i class="ri-flashlight-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可用 Skills</span></div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="s in boundSkills" :key="s.id" class="ctx-pill" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">
              {{ s.name }}
            </span>
          </div>
        </div>

        <!-- Working method -->
        <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3"><i class="ri-flow-node text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工作方式</span></div>
          <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">SubAgent 在 Agent 配置中勾选后，由 Agent 在执行任务时按需自动委派。SubAgent 接收子任务后调用其{{ isCustom ? '绑定的工具和 Skills' : '内置能力' }}完成，并将结果返回给主 Agent。</p>
        </div>

        <!-- Used By -->
        <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2"><i class="ri-sparkling-2-line text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">被委派</span></div>
            <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ usedByAgents.length }} 个智能体</span>
          </div>
          <div v-if="usedByAgents.length === 0" class="text-[11px] py-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂未被任何智能体使用</div>
          <div class="space-y-1">
            <div v-for="name in usedByAgents" :key="name" class="flex items-center gap-2 py-1.5 px-2 rounded-md text-[11px]" :class="isDark ? 'bg-d0 text-wt-sub' : 'bg-l2 text-lt-sub'">
              <i class="ri-sparkling-2-line text-[11px] text-agent-400" /><span>{{ name }}</span>
            </div>
          </div>
        </div>

        <div class="h-6" />
      </div>
    </div>
  </div>
</template>
