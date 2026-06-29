<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import AgentList from './sections/AgentList.vue'
import SubAgentList from './sections/SubAgentList.vue'
import EmptyState from './sections/EmptyState.vue'
import AgentDetail from './sections/AgentDetail.vue'
import AgentEdit from './sections/AgentEdit.vue'
import SubAgentDetail from './sections/SubAgentDetail.vue'
import SubAgentEdit from './sections/SubAgentEdit.vue'
import HealthCheckPanel from './sections/HealthCheckPanel.vue'

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const mbox = useMessageBox()

const subNav = ref('agents')
const selectedAgent = ref(null)
const selectedSub = ref(null)
const showAgentModal = ref(false)
const modalAgent = ref(null)
const showSubModal = ref(false)
const modalSub = ref(null)
const searchQuery = ref('')
const filterCategory = ref('all')
const checkSelectedIds = ref([])
const showHealthResults = ref(false)

const sectionNavItems = [
  { key: 'agents', label: '智能体', icon: 'ri-sparkling-2-line', activeColor: 'agent' },
  { key: 'subagents', label: 'SubAgents', icon: 'ri-team-line', activeColor: 'amber' },
]

function setSection(s) {
  subNav.value = s
  selectedAgent.value = null
  selectedSub.value = null
  searchQuery.value = ''
  showHealthResults.value = false
  agentsStore.clearHealthCheck()
}

const filteredAgents = computed(() => {
  let list = agentsStore.agents
  if (filterCategory.value === 'builtin') list = list.filter((a) => a.builtin)
  else if (filterCategory.value === 'custom') list = list.filter((a) => !a.builtin)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter((a) => a.name.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q))
  }
  return list
})

const filteredSubs = computed(() => {
  if (!searchQuery.value) return agentsStore.subAgentList
  const q = searchQuery.value.toLowerCase()
  return agentsStore.subAgentList.filter((s) => s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q))
})

function selectAgent(a) {
  selectedAgent.value = a
  showHealthResults.value = false
}

function startEdit() {
  // Deep clone but strip non-serializable fields that cause IPC errors
  const clone = JSON.parse(JSON.stringify(selectedAgent.value))
  // Ensure all expected fields exist
  clone.subAgents = Array.isArray(clone.subAgents) ? clone.subAgents : []
  clone.subAgentEnabled = !!clone.subAgentEnabled || clone.subAgents.length > 0
  clone.tools = Array.isArray(clone.tools) ? clone.tools : []
  clone.skills = Array.isArray(clone.skills) ? clone.skills : []
  clone.permissions = (clone.permissions && typeof clone.permissions === 'object') ? clone.permissions : {}
  clone.showAdvanced = !!clone.showAdvanced
  clone.arch = 'react'
  clone.reflectPersist = false
  clone.planSteps = 5
  clone.complexityClassifier = false
  modalAgent.value = clone
  showAgentModal.value = true
}

function cancelEdit() {
  showAgentModal.value = false
  modalAgent.value = null
}

async function saveEdit() {
  if (!modalAgent.value) return
  const plain = JSON.parse(JSON.stringify(modalAgent.value))
  plain.arch = 'react'
  plain.reflectPersist = false
  plain.planSteps = 5
  plain.complexityClassifier = false
  const isCreate = !agentsStore.agents.find((a) => a.id === plain.id)
  try {
    if (isCreate) {
      const result = await agentsStore.addAgent(plain)
      selectedAgent.value = agentsStore.agents.find((a) => a.id === result.id)
      msg.success('智能体创建成功')
    } else {
      await agentsStore.updateAgent(plain.id, plain)
      selectedAgent.value = agentsStore.agents.find((a) => a.id === plain.id)
      msg.success('智能体更新成功')
    }
    showAgentModal.value = false
    modalAgent.value = null
  } catch (e) {
    msg.error('操作失败：' + e.message)
  }
}

function startCreate() {
  modalAgent.value = {
    name: '',
    englishName: '',
    desc: '',
    icon: 'ri-sparkling-2-line',
    color: '#A78BFA',
    arch: 'react',
    builtin: false,
    permissions: {
      fileRead: false,
      fileWrite: false,
      fileDelete: false,
      fileRename: false,
      execCommand: false,
      execCommandWhitelist: [],
      execCommandBlacklist: [],
    },
    tools: [],
    skills: [],
    subAgents: [],
    prompt: '',
    maxIter: 10,
    reflectPersist: false,
    planningModel: '',
    planSteps: 5,
    complexityClassifier: false,
    model: '',
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
    presencePenalty: 0,
    frequencyPenalty: 0,
    thinkingMode: 'auto',
    thinkingIntensity: 'medium',
    reviewerModel: '',
    useSameModel: true,
    showAdvanced: false,
    subAgentEnabled: false,
    toolCallLimit: 0,
    modelCallLimit: 0,
  }
  showAgentModal.value = true
}

async function duplicateAgent(a) {
  const plain = JSON.parse(JSON.stringify(a))
  const result = await agentsStore.duplicateAgent(plain)
  selectedAgent.value = agentsStore.agents.find((ag) => ag.id === result.id)
  msg.success('智能体已复制')
}

async function deleteAgent(a) {
  if (a.builtin) return
  const confirmed = await mbox.confirm({
    title: '确认删除',
    subtitle: '此操作不可撤销',
    message: '删除「' + a.name + '」？其所有配置将永久移除。',
    variant: 'danger',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  await agentsStore.removeAgent(a.id)
  if (selectedAgent.value?.id === a.id) {
    selectedAgent.value = null
    showHealthResults.value = false
  }
  if (modalAgent.value?.id === a.id) {
    showAgentModal.value = false
    modalAgent.value = null
  }
  agentsStore.clearHealthCheck(a.id)
  msg.success('智能体已删除')
}

function navActiveClass(key) {
  const c = sectionNavItems.find((s) => s.key === key)?.activeColor
  if (c === 'agent') return isDark.value ? 'bg-agent-400/10 text-agent-400' : 'bg-agent-50 text-agent-500'
  if (c === 'amber') return isDark.value ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'
  return ''
}

function navBadgeActiveClass(key) {
  const c = sectionNavItems.find((s) => s.key === key)?.activeColor
  if (c === 'agent') return isDark.value ? 'bg-agent-400/15' : 'bg-agent-100/70'
  if (c === 'amber') return isDark.value ? 'bg-amber-400/15' : 'bg-amber-100/70'
  return ''
}

function navItemCount(key) {
  if (key === 'agents') return agentsStore.agents.length
  if (key === 'subagents') return agentsStore.subAgentList.length
  return 0
}

function startHealthCheckForAgent(agent) {
  checkSelectedIds.value = [agent.id]
  showHealthResults.value = true
  agentsStore.runHealthCheck([agent.id])
}

function runBatchHealthCheck() {
  if (checkSelectedIds.value.length === 0) return
  showHealthResults.value = true
  agentsStore.runHealthCheck(checkSelectedIds.value)
}

function startCreateSub() {
  modalSub.value = {
    id: '',
    name: '',
    desc: '',
    icon: 'ri-team-line',
    color: '#6C8AFF',
    prompt: '',
    tools: [],
    skills: [],
  }
  showSubModal.value = true
}

function startEditSub(sub) {
  modalSub.value = JSON.parse(JSON.stringify(sub))
  showSubModal.value = true
}

function cancelSubEdit() {
  showSubModal.value = false
  modalSub.value = null
}

async function saveSubEdit() {
  if (!modalSub.value) return
  const plain = JSON.parse(JSON.stringify(modalSub.value))
  const isCreate = !plain.id || !agentsStore.customSubAgents.find((s) => s.id === plain.id)
  try {
    if (isCreate) {
      const result = await agentsStore.addSubAgent(plain)
      selectedSub.value = agentsStore.subAgentList.find((s) => s.id === result.id)
      msg.success('SubAgent 创建成功')
    } else {
      await agentsStore.updateSubAgent(plain.id, plain)
      selectedSub.value = agentsStore.subAgentList.find((s) => s.id === plain.id)
      msg.success('SubAgent 更新成功')
    }
    showSubModal.value = false
    modalSub.value = null
  } catch (e) {
    msg.error('操作失败：' + e.message)
  }
}

async function deleteSub(sub) {
  if (sub.builtin) return
  const confirmed = await mbox.confirm({
    title: '确认删除',
    subtitle: '此操作不可撤销',
    message: '删除「' + sub.name + '」？其所有配置将永久移除。',
    variant: 'danger',
    confirmText: '确认删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  await agentsStore.removeSubAgent(sub.id)
  if (selectedSub.value?.id === sub.id) selectedSub.value = null
  msg.success('SubAgent 已删除')
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <LeftPanel :width="260" :resizable="false">
      <!-- Module Header -->
      <div class="h-10 flex items-center px-4 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">智能体管理</span>
      </div>

      <!-- Vertical Section Navigation -->
      <div class="px-2 py-2 space-y-0.5" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <button
          v-for="item in sectionNavItems"
          :key="item.key"
          @click="setSection(item.key)"
          class="section-nav-item w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md"
          :class="
            subNav === item.key
              ? navActiveClass(item.key)
              : isDark
                ? 'text-wt-sub hover:bg-white/4'
                : 'text-lt-sub hover:bg-l4'
          ">
          <i :class="[item.icon, 'text-[14px]']" />
          <span class="text-[12px] font-medium flex-1 text-left">{{ item.label }}</span>
          <span
            class="text-[10px] font-semibold px-1.5 py-[1px] rounded"
            :class="
              subNav === item.key ? navBadgeActiveClass(item.key) : isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'
            ">
            {{ navItemCount(item.key) }}
          </span>
        </button>
      </div>

      <!-- Search -->
      <div class="px-3 py-2">
        <div class="relative">
          <i
            class="ri-search-line absolute left-2.5 top-[8px] text-[12px]"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索..."
            class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
            :class="
              isDark
                ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40'
                : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'
            " />
        </div>
      </div>

      <!-- Filter Chips (Agents only) -->
      <div v-if="subNav === 'agents'" class="px-3 pb-2 flex gap-1">
        <button
          v-for="f in [
            { key: 'all', label: '全部' },
            { key: 'custom', label: '自定义' },
            { key: 'builtin', label: '内置' },
          ]"
          :key="f.key"
          @click="filterCategory = f.key"
          class="ctx-pill cursor-pointer"
          :class="
            filterCategory === f.key
              ? isDark
                ? 'text-wt-main bg-white/6'
                : 'text-lt-main bg-l3'
              : isDark
                ? 'text-wt-aux hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          ">
          {{ f.label }}
        </button>
      </div>

      <!-- Section List Title -->
      <div class="px-4 pt-2 pb-1.5">
        <span class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{
            subNav === 'agents'
              ? (filterCategory === 'custom' ? '自定义' : filterCategory === 'builtin' ? '内置' : '全部') +
                ' (' +
                filteredAgents.length +
                ')'
              : 'SubAgents (' + filteredSubs.length + ')'
          }}
        </span>
      </div>

      <!-- Agents Item List -->
      <div v-if="subNav === 'agents'" class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <div v-for="agent in filteredAgents" :key="agent.id" @click="selectAgent(agent)">
          <AgentList
            :agent="agent"
            :selected="selectedAgent?.id === agent.id"
            :is-dark="isDark" />
        </div>
        <div v-if="filteredAgents.length === 0" class="text-center py-6">
          <i class="ri-search-line text-[20px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有匹配的智能体</p>
        </div>
      </div>

      <!-- SubAgents Item List -->
      <div v-if="subNav === 'subagents'" class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <div
          v-for="sa in filteredSubs"
          :key="sa.id"
          @click="
            selectedSub = sa;
            showHealthResults = false
          ">
          <SubAgentList :sub-agent="sa" :selected="selectedSub?.id === sa.id" :is-dark="isDark" />
        </div>
      </div>

      <!-- Footer: Create button (Agents only) -->
      <div
        v-if="subNav === 'agents'"
        class="px-3 py-2.5"
        :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
        <button
          @click="startCreate()"
          class="w-full h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          :class="
            isDark
              ? 'bg-agent-400/10 text-agent-400 hover:bg-agent-400/18 border border-agent-400/20'
              : 'bg-agent-50 text-agent-500 hover:bg-agent-100 border border-agent-100'
          ">
          <i class="ri-add-line text-[12px]" />
          新建智能体
        </button>
      </div>
      <!-- Footer: Create SubAgent -->
      <div v-else class="px-3 py-2.5" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
        <button
          @click="startCreateSub()"
          class="w-full h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          :class="
            isDark
              ? 'bg-amber-400/10 text-amber-400 hover:bg-amber-400/18 border border-amber-400/20'
              : 'bg-amber-50 text-amber-500 hover:bg-amber-100 border border-amber-100'
          ">
          <i class="ri-add-line text-[12px]" />
          新建 SubAgent
        </button>
      </div>
    </LeftPanel>

    <!-- Main Content -->
    <MainContent padding="p-0">
      <!-- Health Check Panel (right side) -->
      <div v-if="showHealthResults && subNav === 'agents' && selectedAgent" class="p-4 max-w-5xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <i class="ri-heart-pulse-line text-emerald-400 text-[16px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">健康检查</span>
            <span v-if="agentsStore.healthChecking" class="text-[10px] text-brand-400 animate-pulse">检查中...</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="runBatchHealthCheck"
              :disabled="agentsStore.healthChecking"
              class="h-7 px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
              :class="
                !agentsStore.healthChecking
                  ? 'text-white bg-emerald-500 hover:bg-emerald-600'
                  : isDark
                    ? 'bg-d4 text-wt-dim cursor-not-allowed'
                    : 'bg-l4 text-lt-aux cursor-not-allowed'
              ">
              <i
                :class="agentsStore.healthChecking ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'"
                class="text-[10px]" />
              重新检查
            </button>
            <button
              @click="showHealthResults = false"
              class="h-7 px-3 rounded-lg text-[11px] font-medium transition-colors"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub bg-d3' : 'text-lt-aux hover:text-lt-sub bg-l3'">
              关闭
            </button>
          </div>
        </div>
        <HealthCheckPanel :agent-ids="checkSelectedIds" :is-dark="isDark" />
      </div>

      <!-- Empty State -->
      <EmptyState
        v-if="(subNav === 'agents' && !selectedAgent) || (subNav === 'subagents' && !selectedSub)"
        :sub-nav="subNav"
        :is-dark="isDark"
        @create="startCreate()" />

      <!-- Agent Detail -->
      <AgentDetail
        v-if="subNav === 'agents' && selectedAgent && !showHealthResults"
        :agent="selectedAgent"
        :is-dark="isDark"
        @edit="startEdit"
        @duplicate="duplicateAgent(selectedAgent)"
        @delete="deleteAgent(selectedAgent)"
        @invoke="$router.push('/workchat')"
        @health-check="startHealthCheckForAgent(selectedAgent)"
        @create="startCreate()" />

      <!-- SubAgent Detail -->
      <SubAgentDetail
        v-if="subNav === 'subagents' && selectedSub"
        :sub-agent="selectedSub"
        :is-dark="isDark"
        @edit="startEditSub(selectedSub)"
        @delete="deleteSub(selectedSub)" />
    </MainContent>

    <!-- Agent Edit Modal -->
    <AgentEdit
      v-if="showAgentModal && modalAgent"
      :edit-agent="modalAgent"
      :is-dark="isDark"
      @cancel="cancelEdit"
      @save="saveEdit" />

    <!-- SubAgent Edit Modal -->
    <SubAgentEdit
      v-if="showSubModal && modalSub"
      :edit-sub="modalSub"
      :is-dark="isDark"
      @cancel="cancelSubEdit"
      @save="saveSubEdit" />
  </div>
</template>
