<script setup>
import { useAgentsStore } from '@/stores/agents'

defineProps({
  subNav: String,
  isDark: Boolean,
})

const emit = defineEmits(['create'])

const store = useAgentsStore()

const sectionMeta = {
  agents: { name: '智能体', icon: 'ri-sparkling-2-line', color: '#A78BFA' },
  subagents: { name: 'SubAgents', icon: 'ri-team-line', color: '#FACC15' },
}

</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i :class="[sectionMeta[subNav].icon + ' text-[14px]', isDark ? 'text-wt-aux' : 'text-lt-aux']" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ sectionMeta[subNav].name + ' · 总览' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="subNav === 'agents'" class="ctx-pill cursor-pointer" :class="isDark ? 'text-agent-400 bg-agent-400/8 border border-agent-400/20 hover:bg-agent-400/15' : 'text-agent-500 bg-agent-50 border border-agent-100 hover:bg-agent-100'" @click="emit('create')">
          <i class="ri-add-line text-[10px]" /> 新建智能体
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-8 py-10 fade-up">

        <!-- Hero -->
        <div class="flex items-start gap-4 mb-8">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
               :class="isDark ? 'bg-gradient-to-br from-agent-400/20 to-brand-400/10 border border-agent-400/20' : 'bg-gradient-to-br from-agent-50 to-brand-50 border border-agent-100'">
            <i :class="sectionMeta[subNav].icon + ' text-[26px]'" :style="'color:' + sectionMeta[subNav].color" />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ subNav === 'agents' ? '智能体' : 'SubAgents 子代理' }}
            </h1>
            <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              {{ subNav === 'agents'
                ? '创建并配置自定义智能体，组合 Skills、工具与子代理，构建个性化学习工作流。'
                : '内置子代理，由 Agent 在执行任务时自动委派。每个 SubAgent 有专精的能力，承担特定子任务。' }}
            </p>
          </div>
        </div>

        <!-- Stats tiles -->
        <div class="grid grid-cols-2 gap-3 mb-8">
          <div class="stat-tile rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-1.5 mb-1.5"><i class="ri-sparkling-2-line text-agent-400 text-[12px]" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">智能体</span></div>
            <div class="text-[22px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ store.agents.length }}</div>
            <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ store.customCount }} 自定义 · {{ store.builtinCount }} 内置</div>
          </div>
          <div class="stat-tile rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-1.5 mb-1.5"><i class="ri-team-line text-amber-400 text-[12px]" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">SubAgents</span></div>
            <div class="text-[22px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ store.subAgentList.length }}</div>
            <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">被委派 {{ store.totalSubUses }} 次</div>
          </div>
        </div>

        <!-- Recently used (Agents) -->
        <div v-if="subNav === 'agents'" class="mb-6">
          <div class="section-title mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">最近使用 / 推荐</div>
          <div class="space-y-1.5">
            <div v-for="agent in store.agents.slice(0, 3)" :key="agent.id"
                 class="rounded-xl p-3 cursor-pointer transition-colors flex items-center gap-3"
                 :class="isDark ? 'bg-d3 border border-bdr hover:border-agent-400/30' : 'bg-l3 border border-bdrF hover:border-agent-200'">
              <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <i :class="agent.icon + ' text-[16px]'" :style="'color:' + agent.color" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-[2px]">
                  <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ agent.name }}</span>
                  <span v-if="agent.builtin" class="ctx-pill" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">内置</span>
                </div>
                <p class="text-[11px] truncate" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ agent.desc }}</p>
              </div>
              <div class="flex items-center gap-2.5 text-[10px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <span class="flex items-center gap-1"><i class="ri-tools-line text-[10px]" />{{ agent.tools?.length ||0 }}</span>
                <span class="flex items-center gap-1"><i class="ri-flashlight-line text-[10px]" />{{ agent.skills?.length ||0}}</span>
                <span class="flex items-center gap-1"><i class="ri-team-line text-[10px]" />{{ agent.subAgents?.length ||0}}</span>
              </div>
              <i class="ri-arrow-right-s-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </div>
          </div>
        </div>

        <!-- Quick start (Agents) -->
        <div v-if="subNav === 'agents'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-lightbulb-line text-amber-400 text-[14px]" />
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">如何创建一个 Agent</span>
          </div>
          <div class="grid grid-cols-3 gap-3 mt-3">
            <div class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              <span class="text-[10px] font-bold px-1.5 py-[1px] rounded mr-1" :class="isDark ? 'bg-agent-400/15 text-agent-400' : 'bg-agent-100 text-agent-500'">1</span>
              填写名称、图标、描述与系统提示词
            </div>
            <div class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              <span class="text-[10px] font-bold px-1.5 py-[1px] rounded mr-1" :class="isDark ? 'bg-agent-400/15 text-agent-400' : 'bg-agent-100 text-agent-500'">2</span>
              选择大模型与所需权限
            </div>
            <div class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              <span class="text-[10px] font-bold px-1.5 py-[1px] rounded mr-1" :class="isDark ? 'bg-agent-400/15 text-agent-400' : 'bg-agent-100 text-agent-500'">3</span>
              勾选要使用的工具、Skills 与 SubAgents
            </div>
          </div>
        </div>

        <!-- SubAgents quick info -->
        <div v-if="subNav === 'subagents'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="section-title mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">使用方式</div>
          <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            SubAgents 在 Agent 配置中勾选后，由 Agent 在执行任务时自动委派对应子代理来完成专精任务。每个 SubAgent 都有内置的能力组合（如 Reader 调用知识库检索 + 文件读取）。
          </p>
        </div>

        <!-- Bottom hint -->
        <div class="mt-6 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-arrow-left-line text-[12px] mr-1" />从左侧选择{{ sectionMeta[subNav].name }}查看详情
        </div>
      </div>
    </div>
  </div>
</template>
