<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import { parseModelRef } from '@/utils/modelRef'
import HealthBadge from './HealthBadge.vue'

const props = defineProps({
  agent: Object,
  isDark: Boolean,
})

const emit = defineEmits(['edit', 'duplicate', 'delete', 'invoke', 'healthCheck', 'create'])
const store = useAgentsStore()
const settingsStore = useSettingsStore()

const healthResult = computed(() => store.healthCheckResults[props.agent.id] || null)
const subAgentIds = computed(() => props.agent?.subAgents || props.agent?.sub_agents || [])
const selectedSubAgents = computed(() => subAgentIds.value.map(findSubAgent).filter(Boolean))

function modelLabel(modelRef, fallback = '默认') {
  if (!modelRef) return fallback
  const parsed = parseModelRef(modelRef)
  for (const p of settingsStore.providers) {
    if (parsed.scoped && p.id !== parsed.providerId) continue
    const model = p.models?.find(m => m.id === parsed.modelId)
    if (model) return `${p.name} / ${model.name || model.id}`
  }
  return parsed.modelId || modelRef
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function normalizeSubAgentKey(value) {
  return String(value || '').trim().replace(/^sa_/i, '').toLowerCase().replace(/[\s_]+/g, '-')
}

function subAgentMatches(sa, id) {
  const keys = [
    sa?.id,
    sa?.name,
    sa?.runtimeName,
    ...(Array.isArray(sa?.aliases) ? sa.aliases : []),
  ].map(normalizeSubAgentKey).filter(Boolean)
  return keys.includes(normalizeSubAgentKey(id))
}

function findSubAgent(id) {
  const target = normalizeSubAgentKey(id)
  const exactList = [...store.subAgentList].reverse()
  return exactList.find(sa => normalizeSubAgentKey(sa.id) === target) ||
    exactList.find(sa => normalizeSubAgentKey(sa.runtimeName) === target) ||
    store.subAgentList.find(sa => subAgentMatches(sa, id)) ||
    null
}

const permMeta = {
  fileRead: { label: '文件读取', icon: 'ri-eye-line' },
  fileWrite: { label: '文件写入', icon: 'ri-edit-line' },
  fileDelete: { label: '文件删除', icon: 'ri-delete-bin-line' },
  fileRename: { label: '重命名', icon: 'ri-price-tag-3-line' },
  execCommand: { label: '执行命令', icon: 'ri-terminal-box-line' },
}

const visiblePermissions = computed(() => Object.entries(props.agent?.permissions || {})
  .filter(([key]) => permMeta[key])
  .map(([key, value]) => ({ key, value, meta: permMeta[key] })))
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-[24px] h-[24px] rounded-md flex items-center justify-center" :class="isDark ? 'bg-d0' : 'bg-l2'"><i :class="agent.icon + ' text-[13px]'" :style="'color:' + agent.color" /></div>
        <span class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ agent.name }}</span>
        <span v-if="agent.builtin" class="ctx-pill shrink-0" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">内置</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button class="ctx-pill cursor-pointer" :class="isDark ? 'text-agent-400 bg-agent-400/8 border border-agent-400/20 hover:bg-agent-400/15' : 'text-agent-500 bg-agent-50 border border-agent-100 hover:bg-agent-100'" @click="emit('create')"><i class="ri-add-line text-[10px]" /> 新建</button>
        <button class="ctx-pill cursor-pointer" :class="isDark ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub' : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'" @click="emit('invoke')"><i class="ri-chat-smile-2-line text-[10px]" /> 在学习台调用</button>
        <button class="ctx-pill cursor-pointer" :class="isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20 hover:bg-emerald-400/15' : 'text-emerald-600 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100'" @click="emit('healthCheck')"><i class="ri-heart-pulse-line text-[10px]" /> 检查状态</button>
        <HealthBadge v-if="healthResult?.status && healthResult.status !== 'checking'" :status="healthResult.status" :is-dark="isDark" size="sm" />
        <span v-if="healthResult?.checkedAt" class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatTime(healthResult.checkedAt) }}</span>
        <button class="ctx-pill cursor-pointer" :class="isDark ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub' : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'" @click="emit('duplicate')"><i class="ri-file-copy-line text-[10px]" /> 复制</button>
        <button class="ctx-pill cursor-pointer" :class="isDark ? 'text-agent-400 bg-agent-400/8 border border-agent-400/20 hover:bg-agent-400/15' : 'text-agent-500 bg-agent-50 border border-agent-100 hover:bg-agent-100'" @click="emit('edit')"><i class="ri-edit-line text-[10px]" /> 编辑</button>
        <button v-if="!agent.builtin" class="ctx-pill cursor-pointer" :class="isDark ? 'text-red-400/80 bg-d3 border border-bdr hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/8' : 'text-red-500 bg-l3 border border-bdrF hover:border-red-200 hover:bg-red-50'" @click="emit('delete')"><i class="ri-delete-bin-line text-[10px]" /> 删除</button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-7 py-6 fade-up">

        <!-- Hero -->
        <div class="flex items-start gap-4 mb-6">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[26px]"
               :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
               :style="'color:' + agent.color">
            <i :class="agent.icon" />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ agent.name }}</h1>
            <div class="flex items-center gap-2 mb-1">
              <p class="text-[11px] font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">/agents/{{ agent.englishName || '_shared' }}/</p>
            </div>
            <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ agent.desc }}</p>
          </div>
        </div>

        <!-- Two-column layout -->
        <div class="grid grid-cols-3 gap-5">

          <!-- Left column -->
          <div class="col-span-2 space-y-5">

            <!-- System Prompt -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-double-quotes-l text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">系统提示词</span></div>
              <div class="rounded-lg p-3 text-[12px] leading-relaxed whitespace-pre-line max-h-[280px] overflow-y-auto thin-scroll" :class="isDark ? 'bg-d0 text-wt-sub border border-d4' : 'bg-l2 text-lt-sub border border-bdrF'">{{ agent.prompt }}</div>
            </div>

            <!-- Runtime limits -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-timer-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">运行限制</span></div>
              <div class="flex items-center gap-2 text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <i class="ri-repeat-line text-[11px]" /><span>最大迭代次数 <span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.maxIter > 0 ? agent.maxIter + ' 步' : '不限制' }}</span></span>
              </div>
              <div v-if="agent.toolCallLimit > 0 || agent.modelCallLimit > 0" class="mt-2 pt-2 space-y-1.5 text-[11px]" :class="isDark ? 'border-t border-d4 text-wt-aux' : 'border-t border-bdrF text-lt-aux'">
                <div v-if="agent.toolCallLimit > 0" class="flex items-center gap-2"><i class="ri-tools-line text-[11px]" /><span>工具调用上限：<span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.toolCallLimit }}</span> 次/轮</span></div>
                <div v-if="agent.modelCallLimit > 0" class="flex items-center gap-2"><i class="ri-robot-2-line text-[11px]" /><span>模型调用上限：<span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.modelCallLimit }}</span> 次/轮</span></div>
              </div>
              <!-- Model info -->
              <div v-if="agent.model || agent.reviewerModel" class="mt-2 pt-2 space-y-1.5 text-[11px]" :class="isDark ? 'border-t border-d4 text-wt-aux' : 'border-t border-bdrF text-lt-aux'">
                <div class="flex items-center gap-2"><i class="ri-robot-2-line text-[11px]" /><span>执行模型：<span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ modelLabel(agent.model, '全局默认') }}</span></span></div>
                <div class="flex items-center gap-2"><i class="ri-eye-line text-[11px]" /><span>审查模型：<span class="font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.useSameModel ? '同执行模型' : modelLabel(agent.reviewerModel, '纯代码审查') }}</span></span></div>
              </div>
            </div>

            <!-- Tools -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-tools-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具</span></div>
                <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ agent.tools.length }} 项启用</span>
              </div>
              <div v-if="agent.tools.length === 0" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未启用任何工具</div>
              <div class="space-y-1">
                <template v-for="tid in agent.tools" :key="tid">
                  <div v-for="t in store.toolList" :key="t.id">
                    <div v-if="t.id === tid" class="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
                      <i :class="t.icon + ' text-[14px]'" :style="'color:' + t.color" />
                      <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.name }}</span>
                      <span class="text-[10px] font-mono ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.id }}</span>
                      <span class="ctx-pill" :class="t.cat === '外部' ? (isDark ? 'bg-blue-400/10 text-blue-400 border border-blue-400/20' : 'bg-blue-50 text-blue-600 border border-blue-100') : t.cat === '本地' ? (isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100') : (isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100')">{{ t.cat }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Skills + SubAgents -->
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2"><i class="ri-flashlight-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Skills</span></div>
                  <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ agent.skills.length }} 项</span>
                </div>
                <div v-if="agent.skills.length === 0" class="text-[11px] py-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未启用</div>
                <div class="flex flex-wrap gap-1.5">
                  <template v-for="sid in agent.skills" :key="sid">
                    <span v-for="s in store.skillList" :key="s.id">
                      <span v-if="s.id === sid" class="ctx-pill" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">
                        <i :class="s.icon + ' text-[10px]'" /> {{ s.name }}
                      </span>
                    </span>
                  </template>
                </div>
              </div>
              <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2"><i class="ri-team-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">SubAgents</span></div>
                  <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ subAgentIds.length }} 项</span>
                </div>
                <div v-if="subAgentIds.length === 0" class="text-[11px] py-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未委派</div>
                <div class="flex flex-wrap gap-1.5">
                  <template v-for="sa in selectedSubAgents" :key="sa.id">
                    <span class="ctx-pill" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">
                      <i :class="sa.icon + ' text-[10px]'" /> {{ sa.name }}
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div class="space-y-5">
            <!-- Permissions -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-shield-check-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">权限配置</span></div>
              <div class="space-y-1.5">
                <div v-for="p in visiblePermissions" :key="p.key" class="flex items-center gap-2 py-[5px]">
                  <i :class="p.meta.icon + ' text-[12px] ' + (p.value ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux'))" />
                  <span class="text-[11px] flex-1" :class="p.value ? (isDark ? 'text-wt-sub' : 'text-lt-sub') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ p.meta.label }}</span>
                  <span class="text-[10px] font-medium" :class="p.value ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ p.value ? '已开启' : '关闭' }}</span>
                </div>
              </div>
            </div>

            <!-- Meta -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-information-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基本信息</span></div>
              <div class="space-y-1.5 text-[11px]">
                <div class="flex justify-between"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">类型</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.builtin ? '内置 Agent' : '自定义 Agent' }}</span></div>
                <div class="flex justify-between"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">ID</span><span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">#{{ agent.id }}</span></div>
                <div class="flex justify-between"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">工具数</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.tools.length }}</span></div>
                <div class="flex justify-between"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Skills 数</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.skills.length }}</span></div>
                <div class="flex justify-between"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">SubAgents</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ subAgentIds.length }}</span></div>
              </div>
            </div>

            <!-- Quick action -->
            <button class="w-full h-9 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    :class="isDark ? 'bg-wt-main text-d0 hover:bg-wt-sub' : 'bg-lt-main text-l0 hover:bg-lt-sub'"
                    @click="emit('invoke')">
              <i class="ri-send-plane-line text-[12px]" /> 在学习台中调用
            </button>
          </div>
        </div>
        <div class="h-6" />
      </div>
    </div>
  </div>
</template>
