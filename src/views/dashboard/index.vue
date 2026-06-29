<script setup>
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useSpacesStore } from '@/stores/spaces'
import { useTasksStore } from '@/stores/tasks'
import { useOutputsStore } from '@/stores/outputs'
import { useSettingsStore } from '@/stores/settings'
import { useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import ImportModal from '@/components/ImportModal.vue'

const appStore = useAppStore()
const userStore = useUserStore()
const spacesStore = useSpacesStore()
const tasksStore = useTasksStore()
const outputsStore = useOutputsStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const isDark = computed(() => appStore.isDark)

const showImportModal = ref(false)
const importMode = ref('files') // 'files' or 'folder'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

const greeting = computed(getGreeting)
const connStatus = computed(() => userStore.connStatus)
const isConnected = computed(() => connStatus.value === 'connected')

const stats = computed(() => ({
  spaces: spacesStore.spaces.length,
  docs: spacesStore.totalDocs,
  tasks: tasksStore.tasks.length,
  outputs: outputsStore.outputs?.length || 0,
}))

const runningTasks = computed(() => tasksStore.activeTasks.length)

const recentTasks = computed(() =>
  tasksStore.tasks.slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    status: t.status,
    time: formatTime(t.createdAt),
    agent: t.agentId || (t.type === 'skill' ? 'Skill' : t.type === 'upload' ? '上传' : '—'),
  })),
)

const recentOutputs = computed(() =>
  outputsStore.outputs?.slice(0, 5).map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    typeLabel: typeLabel(o.type),
    format: o.format,
    time: formatTime(o.createdAt),
    cat: o.category,
  })),
)

const recentSpaces = computed(() => spacesStore.spaces.slice(0, 3))

const betaHighlights = [
  { icon: 'ri-flask-line', label: '内测预览', desc: '功能仍在快速迭代' },
  { icon: 'ri-shield-check-line', label: '本地优先', desc: '资料与配置以本机为主' },
  { icon: 'ri-message-3-line', label: '欢迎反馈', desc: '问题和建议会优先处理' },
]

function typeIcon(type) {
  const map = {
    agent: 'ri-sparkling-2-line',
    skill: 'ri-file-list-3-line',
    upload: 'ri-upload-cloud-2-line',
    summary: 'ri-file-text-line',
    outline: 'ri-list-check-3',
    flashcards: 'ri-flashlight-line',
    quiz: 'ri-question-line',
    mindmap: 'ri-mind-map',
    cram_sheet: 'ri-file-paper-2-line',
  }
  return map[type] || 'ri-file-3-line'
}

function typeColor(type) {
  const map = {
    agent: '#A78BFA',
    skill: '#6C8AFF',
    upload: '#4ADE80',
    summary: '#6C8AFF',
    outline: '#4ADE80',
    flashcards: '#FACC15',
    quizzes: '#F87171',
    mindmap: '#0EA5E9',
    cram_sheet: '#FB923C',
  }
  return map[type] || '#78788a'
}

function typeLabel(type) {
  const map = {
    summary: '摘要',
    outline: '大纲',
    flashcards: '闪卡',
    quizzes: '测验题',
    mindmap: '思维导图',
    cram_sheet: '速记表',
  }
  return map[type] || type
}

function statusColor(s) {
  return (s === 'running'||s === 'processing') ? '#6C8AFF' : (s === 'done'||s === 'completed' )? '#34D399' : '#F87171'
}
function statusBg(s) {
  return (s === 'running'||s === 'processing') ? 'rgba(106,138,255,.06)' : (s === 'done'||s === 'completed' ) ? 'rgba(52,211,153,.06)' : 'rgba(248,113,113,.06)'
}
function statusBorder(s) {
  return (s === 'running'||s === 'processing') ? 'rgba(106,138,255,.2)' : (s === 'done'||s === 'completed' )? 'rgba(52,211,153,.2)' : 'rgba(248,113,113,.2)'
}
function statusLabel(s) {
  const map = { running: '进行中',processing: '进行中', done: '已完成',completed: '已完成', failed: '失败', pending: '等待中', cancelled: '已取消' }
  return map[s] || s
}

function formatTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

function spaceIconColor(index) {
  const colors = ['#6C8AFF', '#34D399', '#F87171', '#FACC15', '#A78BFA', '#0EA5E9']
  return colors[index % colors.length]
}

function openSpace(space) {
  router.push(`/spaces/${space.id}`)
}

const quickActions = [
  {
    icon: 'ri-upload-cloud-2-line',
    label: '导入资料',
    sub: '上传文件验证流程',
    accent: 'brand',
    handler: () => {
      importMode.value = 'files'
      showImportModal.value = true
    },
  },
  {
    icon: 'ri-folder-open-line',
    label: '创建知识库',
    sub: '整理上传资料知识库',
    accent: 'agent',
    handler: () => {
      router.push('/spaces')
    },
  },
  {
    icon: 'ri-ai-generate-3d-line',
    label: '配置模型',
    sub: '填写服务商和默认模型',
    accent: 'output',
    handler: () => {
      router.push('/settings/models')
    },
  },
  {
    icon: 'ri-sparkling-2-line',
    label: '配置 Agent',
    sub: '检查工具、权限和模型',
    accent: 'amber',
    handler: () => {
      router.push('/agents')
    },
  },
]
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-6xl mx-auto px-6 lg:px-8 py-5">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                {{ greeting }}，欢迎体验 Reviva 内测版
              </h1>
              <span
                class="ctx-pill uppercase"
                :class="
                  isDark
                    ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                    : 'bg-amber-50 text-amber-700 border border-amber-100'
                ">
                Beta Preview
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <!-- Connection status pill -->
              <span
                class="ctx-pill"
                :class="
                  isConnected
                    ? isDark
                      ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20'
                      : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    : isDark
                      ? 'bg-red-400/8 text-red-400 border border-red-400/20'
                      : 'bg-red-50 text-red-500 border border-red-100'
                ">
                <span class="w-1.5 h-1.5 rounded-full" :class="isConnected ? 'bg-emerald-400' : 'bg-red-400'" />
                <span>{{ isConnected ? '云端连接正常' : '云端连接待检查' }}</span>
              </span>
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ stats.spaces }} 个知识库 · {{ stats.docs }} 篇文档 · 内测数据以本机为准
              </span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="ctx-pill cursor-pointer"
            :class="
              isDark
                ? 'text-wt-aux bg-d3 border border-bdr hover:text-wt-sub'
                : 'text-lt-aux bg-l2 border border-bdrF hover:text-lt-sub'
            "
            @click="router.push('/settings/about')">
            <i class="ri-message-3-line text-[10px]" />
            内测说明
          </button>
        </div>
      </div>

      <!-- Beta notice -->
      <div
        class="rounded-xl p-4 mb-5 flex items-center gap-4"
        :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50 border border-brand-100'">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            当前处于小范围内测阶段
          </div>
          <div class="text-[11px] leading-relaxed mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
            建议先用少量资料验证“导入、对话、生成、导出”的完整流程。模型、Agent
            和工具配置还会继续调整，遇到异常请保留任务记录便于排查。
          </div>
        </div>
        <div class="hidden lg:grid grid-cols-3 gap-2.5 shrink-0">
          <div
            v-for="item in betaHighlights"
            :key="item.label"
            class="w-[132px] rounded-lg px-3 py-2"
            :class="isDark ? 'bg-d3/70 border border-bdr' : 'bg-white/70 border border-brand-100/80'">
            <div
              class="flex items-center gap-1.5 text-[11px] font-semibold"
              :class="isDark ? 'text-wt-sub' : 'text-lt-main'">
              <i :class="item.icon" class="text-[12px] text-brand-400" />
              <span>{{ item.label }}</span>
            </div>
            <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div>
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-3 mb-5">
        <div
          v-for="(card, i) in [
            { key: 'spaces', icon: 'ri-folder-3-line', iconBg: 'brand', label: '知识库', sub: '内测资料知识库' },
            { key: 'docs', icon: 'ri-file-text-line', iconBg: 'agent', label: '文档', sub: '可被 Agent 引用' },
            { key: 'tasks', icon: 'ri-list-check-3', iconBg: 'amber', label: '任务', sub: `${runningTasks} 个进行中` },
            { key: 'outputs', icon: 'ri-file-chart-line', iconBg: 'output', label: '生成结果', sub: '本地输出记录' },
          ]"
          :key="card.key"
          class="stat-card rounded-xl p-4"
          :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
          <div class="flex items-center justify-between mb-2">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center"
              :class="{
                [isDark ? 'bg-brand-400/8' : 'bg-brand-50']: card.iconBg === 'brand',
                [isDark ? 'bg-agent-400/8' : 'bg-agent-50']: card.iconBg === 'agent',
                [isDark ? 'bg-amber-400/8' : 'bg-amber-50']: card.iconBg === 'amber',
                [isDark ? 'bg-output-400/8' : 'bg-output-50']: card.iconBg === 'output',
              }">
              <i
                :class="card.icon"
                class="text-[18px]"
                :style="{
                  color:
                    card.iconBg === 'brand'
                      ? '#6C8AFF'
                      : card.iconBg === 'agent'
                        ? '#A78BFA'
                        : card.iconBg === 'amber'
                          ? '#FACC15'
                          : '#34D399',
                }" />
            </div>
            <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ card.label }}
            </span>
          </div>
          <div class="text-[26px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            {{ stats[card.key] }}
          </div>
          <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ card.sub }}</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div
        class="rounded-xl p-4 mb-5"
        :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center gap-2 mb-3">
          <i class="ri-flashlight-line text-[14px] text-amber-400" />
          <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">内测快捷入口</span>
        </div>
        <div class="grid grid-cols-4 gap-2.5">
          <button
            v-for="action in quickActions"
            :key="action.label"
            class="quick-btn flex items-center gap-2.5 px-3.5 py-3 rounded-xl cursor-pointer"
            :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'"
            @click="action.handler">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              :class="{
                [isDark ? 'bg-brand-400/8' : 'bg-brand-50']: action.accent === 'brand',
                [isDark ? 'bg-output-400/8' : 'bg-output-50']: action.accent === 'output',
                [isDark ? 'bg-agent-400/8' : 'bg-agent-50']: action.accent === 'agent',
                [isDark ? 'bg-amber-400/8' : 'bg-amber-50']: action.accent === 'amber',
              }">
              <i
                :class="action.icon"
                class="text-[16px]"
                :style="{
                  color:
                    action.accent === 'brand'
                      ? '#6C8AFF'
                      : action.accent === 'output'
                        ? '#34D399'
                        : action.accent === 'agent'
                          ? '#A78BFA'
                          : '#FACC15',
                }" />
            </div>
            <div class="text-left">
              <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                {{ action.label }}
              </div>
              <div class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ action.sub }}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Two Column: Recent Tasks + Recent Outputs -->
      <div class="grid grid-cols-2 gap-4">
        <!-- Recent Tasks -->
        <div
          class="rounded-xl overflow-hidden"
          :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
          <div class="flex items-center justify-between px-4 py-3" :class="isDark ? 'bg-d3/50' : 'bg-l3'">
            <div class="flex items-center gap-2">
              <i class="ri-list-check-3 text-[14px] text-amber-400" />
              <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">最近运行</span>
            </div>
            <button
              class="text-[10px] font-medium"
              :class="isDark ? 'text-brand-400 hover:text-brand-200' : 'text-brand-600 hover:text-brand-500'"
              @click="router.push('/tasks')">
              查看任务
            </button>
          </div>
          <div :class="isDark ? 'divide-d4' : 'divide-bdrF'" class="divide-y">
            <template v-if="recentTasks.length">
              <div
                v-for="t in recentTasks"
                :key="t.id"
                class="task-row flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l3/50'">
                <div
                  class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  :class="isDark ? 'bg-d0' : 'bg-l3'">
                  <i :class="typeIcon(t.type)" class="text-[13px]" :style="{ color: typeColor(t.type) }" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                    {{ t.name }}
                  </div>
                  <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.agent }}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="ctx-pill"
                    :style="{
                      color: statusColor(t.status),
                      background: statusBg(t.status),
                      border: '1px solid ' + statusBorder(t.status),
                    }">
                    <span class="w-1 h-1 rounded-full" :style="{ background: statusColor(t.status) }" />
                    <span class="text-[10px]">{{ statusLabel(t.status) }}</span>
                  </span>
                  <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.time }}</span>
                </div>
              </div>
            </template>
            <div v-else class="px-4 py-8 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              还没有运行记录。导入资料或启动 Agent 后，这里会显示内测任务状态。
            </div>
          </div>
        </div>

        <!-- Recent Outputs -->
        <div
          class="rounded-xl overflow-hidden"
          :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
          <div class="flex items-center justify-between px-4 py-3" :class="isDark ? 'bg-d3/50' : 'bg-l3'">
            <div class="flex items-center gap-2">
              <i class="ri-file-chart-line text-[14px] text-output-400" />
              <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">最近生成</span>
            </div>
            <button
              class="text-[10px] font-medium"
              :class="isDark ? 'text-brand-400 hover:text-brand-200' : 'text-brand-600 hover:text-brand-500'"
              @click="router.push('/outputs')">
              查看输出
            </button>
          </div>
          <div :class="isDark ? 'divide-d4' : 'divide-bdrF'" class="divide-y">
            <template v-if="recentOutputs?.length">
              <div
                v-for="o in recentOutputs"
                :key="o.id"
                class="output-row flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l3/50'">
                <div
                  class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  :class="isDark ? 'bg-d0' : 'bg-l3'">
                  <i :class="typeIcon(o.type)" class="text-[13px]" :style="{ color: typeColor(o.type) }" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                    {{ o.name }}
                  </div>
                  <div class="flex items-center gap-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    <span>{{ o.typeLabel }}</span>
                    <span>·</span>
                    <span>{{ o.format }}</span>
                    <span>·</span>
                    <span>{{ o.cat === 'agent' ? 'Agent' : '学习台' }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    class="ctx-pill cursor-pointer"
                    :class="
                      isDark
                        ? 'text-wt-aux bg-d0 border border-bdr hover:text-wt-sub'
                        : 'text-lt-aux bg-l3 border border-bdrF hover:text-lt-sub'
                    ">
                    <i class="ri-file-3-line text-[9px]" />
                  </button>
                  <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ o.time }}</span>
                </div>
              </div>
            </template>
            <div v-else class="px-4 py-8 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              还没有生成结果。完成摘要、闪卡、导图等任务后会出现在这里。
            </div>
          </div>
        </div>
      </div>

      <!-- Active Spaces -->
      <div
      v-if="false"
        class="mt-5 rounded-xl p-4"
        :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF shadow-sm'">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <i class="ri-folder-3-line text-[14px] text-brand-400" />
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">内测知识库</span>
          </div>
          <button
            class="text-[10px] font-medium"
            :class="isDark ? 'text-brand-400 hover:text-brand-200' : 'text-brand-600 hover:text-brand-500'"
            @click="router.push('/spaces')">
            管理资料
          </button>
        </div>
        <div class="grid grid-cols-3 gap-2.5">
          <template v-if="recentSpaces.length">
            <div
              v-for="(space, idx) in recentSpaces"
              :key="space.id"
              class="rounded-xl p-3.5 cursor-pointer transition-all"
              :class="
                isDark
                  ? 'bg-d3 border border-bdr hover:border-brand-400/30 hover:bg-d3/80'
                  : 'bg-l3 border border-bdrF hover:border-brand-200 hover:bg-white'
              "
              @click="openSpace(space)">
              <div class="flex items-center gap-2.5 mb-2">
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center"
                  :style="{ background: spaceIconColor(idx) + '14' }">
                  <i
                    :class="space.icon || 'ri-folder-3-line'"
                    class="text-[16px]"
                    :style="{ color: spaceIconColor(idx) }" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                    {{ space.name }}
                  </div>
                  <div class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    {{ space.docCount }} 篇文档 · {{ formatTime(space.updatedAt) }}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <span
                  class="ctx-pill"
                  :class="isDark ? 'bg-brand-400/6 border border-brand-400/10' : 'bg-brand-50 border border-brand-100'"
                  :style="{ color: spaceIconColor(idx) }">
                  <i class="ri-chat-smile-2-line text-[9px]" />
                  学习台
                </span>
                <span
                  class="ctx-pill"
                  :class="isDark ? 'text-wt-aux bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
                  <i class="ri-sparkling-2-line text-[9px]" />
                  Agent
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="col-span-3 py-8 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              还没有知识库。内测阶段建议先导入少量资料验证完整流程。
            </div>
          </template>
        </div>
      </div>

      <!-- Import Modal -->
      <ImportModal v-model:show="showImportModal" />
    </div>
  </div>
</template>
