<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTasksStore } from '@/stores/tasks'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const tasksStore = useTasksStore()
const msg = useMessage()
const mbox = useMessageBox()

const isDark = computed(() => appStore.isDark)
const searchQuery = ref('')
const typeFilter = ref('all')
const statusFilter = ref('all')
const showDetail = ref(false)
const selectedTask = ref(null)
const busyTaskId = ref('')

const statusLabels = {
  pending: '等待中',
  running: '进行中',
  completed: '已完成',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const typeLabels = {
  upload: '上传',
  parse: '入库',
  skill: 'Skill',
  agent: 'Agent',
  generation: '生成任务',
}

const typeIcons = {
  upload: 'ri-cloud-line',
  parse: 'ri-database-2-line',
  skill: 'ri-file-text-line',
  agent: 'ri-sparkling-2-line',
  generation: 'ri-magic-line',
}

const toolMeta = {
  mindmap: { name: '思维导图', icon: 'ri-mind-map', tone: 'emerald' },
  graph: { name: '知识图谱', icon: 'ri-share-circle-line', tone: 'amber' },
  flashcard: { name: '闪卡', icon: 'ri-stack-line', tone: 'pink' },
  quiz: { name: '测验', icon: 'ri-questionnaire-line', tone: 'emerald' },
  chart: { name: '图表', icon: 'ri-bar-chart-box-line', tone: 'sky' },
  podcast: { name: '播客', icon: 'ri-mic-2-line', tone: 'agent' },
  research: { name: '深度研究', icon: 'ri-search-eye-line', tone: 'sky' },
  ppt: { name: 'PPT', icon: 'ri-slideshow-line', tone: 'brand' },
}

onMounted(() => {
  if (!tasksStore.loaded) tasksStore.loadFromDb()
})

function normalizeStatus(status) {
  if (status === 'done' || status === 'completed') return 'completed'
  return status || 'pending'
}

function taskCreatedAt(task) {
  return task?.createdAt || task?.created_at || ''
}

function taskCompletedAt(task) {
  return task?.completedAt || task?.completed_at || ''
}

function toTimestamp(value) {
  if (!value) return 0
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T')
  const time = new Date(normalized).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatTime(value, long = false) {
  const time = toTimestamp(value)
  if (!time) return '--'
  return new Date(time).toLocaleString('zh-CN', long
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(task) {
  const start = toTimestamp(taskCreatedAt(task))
  const end = toTimestamp(taskCompletedAt(task)) || Date.now()
  if (!start || end < start) return '--'
  const seconds = Math.max(1, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function taskTypeLabel(task) {
  const tool = toolMeta[task?.tool_id]
  return tool?.name || typeLabels[task?.type] || task?.type || '任务'
}

function taskIcon(task) {
  return toolMeta[task?.tool_id]?.icon || typeIcons[task?.type] || 'ri-list-check-3'
}

function taskTone(task) {
  return toolMeta[task?.tool_id]?.tone || (task?.type === 'agent' ? 'agent' : task?.type === 'skill' ? 'brand' : 'emerald')
}

function toneClass(tone) {
  const map = {
    brand: isDark.value ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600',
    agent: isDark.value ? 'bg-agent-400/12 text-agent-300' : 'bg-agent-50 text-agent-600',
    emerald: isDark.value ? 'bg-emerald-400/12 text-emerald-300' : 'bg-emerald-50 text-emerald-600',
    amber: isDark.value ? 'bg-amber-400/12 text-amber-300' : 'bg-amber-50 text-amber-600',
    pink: isDark.value ? 'bg-pink-400/12 text-pink-300' : 'bg-pink-50 text-pink-600',
    sky: isDark.value ? 'bg-sky-400/12 text-sky-300' : 'bg-sky-50 text-sky-600',
  }
  return map[tone] || map.brand
}

function statusBadgeClass(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'running') return isDark.value ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'
  if (normalized === 'pending') return isDark.value ? 'bg-amber-400/12 text-amber-300' : 'bg-amber-50 text-amber-600'
  if (normalized === 'completed') return isDark.value ? 'bg-emerald-400/12 text-emerald-300' : 'bg-emerald-50 text-emerald-600'
  if (normalized === 'failed') return isDark.value ? 'bg-red-400/12 text-red-300' : 'bg-red-50 text-red-600'
  return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
}

function statusDotClass(status) {
  const normalized = normalizeStatus(status)
  if (normalized === 'running') return 'bg-brand-400'
  if (normalized === 'pending') return 'bg-amber-400'
  if (normalized === 'completed') return 'bg-emerald-400'
  if (normalized === 'failed') return 'bg-red-400'
  return 'bg-gray-400'
}

function progressValue(task) {
  const status = normalizeStatus(task?.status)
  if (status === 'completed') return 100
  const n = Number(task?.progress)
  return Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0))
}

function progressBarClass(task) {
  const status = normalizeStatus(task?.status)
  if (status === 'failed') return 'bg-red-400'
  if (status === 'cancelled') return 'bg-gray-400'
  if (status === 'completed') return 'bg-emerald-400'
  return 'bg-brand-400'
}

function taskSteps(task) {
  return Array.isArray(task?.steps) ? task.steps : []
}

function taskParams(task) {
  const params = task?.params || task?.params_json
  if (!params) return null
  if (typeof params === 'string') {
    try { return JSON.parse(params) } catch { return params }
  }
  return params
}

function formatJson(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

function taskSummary(task) {
  const parts = []
  if (task?.mode) parts.push(task.mode === 'cloud' ? '云端' : '本地')
  if (task?.architecture) parts.push(task.architecture)
  if (task?.agent_id) parts.push(task.agent_id)
  return parts.join(' · ')
}

function canCancel(task) {
  const status = normalizeStatus(task?.status)
  return status === 'pending' || status === 'running'
}

function canDelete(task) {
  return !canCancel(task)
}

const statusCounts = computed(() => {
  const counts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 }
  for (const task of tasksStore.tasks) {
    const status = normalizeStatus(task.status)
    counts[status] = (counts[status] || 0) + 1
  }
  return counts
})

const statusFilters = computed(() => [
  { value: 'all', label: '全部', count: tasksStore.tasks.length },
  { value: 'running', label: '进行中', count: statusCounts.value.running },
  { value: 'pending', label: '等待中', count: statusCounts.value.pending },
  { value: 'completed', label: '已完成', count: statusCounts.value.completed },
  { value: 'failed', label: '失败', count: statusCounts.value.failed },
  { value: 'cancelled', label: '已取消', count: statusCounts.value.cancelled },
])

const typeOptions = computed(() => {
  const known = new Set(Object.keys(typeLabels))
  const options = [{ label: '全部类型', value: 'all' }]
  for (const [value, label] of Object.entries(typeLabels)) options.push({ label, value })
  for (const task of tasksStore.tasks) {
    if (task?.type && !known.has(task.type)) {
      known.add(task.type)
      options.push({ label: task.type, value: task.type })
    }
  }
  return options
})

const statCards = computed(() => [
  { label: '全部任务', value: tasksStore.tasks.length, icon: 'ri-stack-line', tone: 'brand' },
  { label: '活动中', value: statusCounts.value.running + statusCounts.value.pending, icon: 'ri-loader-4-line', tone: 'sky' },
  { label: '已完成', value: statusCounts.value.completed, icon: 'ri-checkbox-circle-line', tone: 'emerald' },
  { label: '失败', value: statusCounts.value.failed, icon: 'ri-error-warning-line', tone: 'pink' },
])

const filteredTasks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return [...tasksStore.tasks]
    .filter(task => typeFilter.value === 'all' || task.type === typeFilter.value)
    .filter(task => statusFilter.value === 'all' || normalizeStatus(task.status) === statusFilter.value)
    .filter(task => {
      if (!query) return true
      return [
        task.name,
        taskTypeLabel(task),
        statusLabels[task.status],
        task.tool_id,
        task.mode,
        task.error,
        task.result,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
    .sort((a, b) => toTimestamp(taskCreatedAt(b)) - toTimestamp(taskCreatedAt(a)))
})

function viewDetail(task) {
  selectedTask.value = task
  showDetail.value = true
}

async function refreshTasks() {
  await tasksStore.loadFromDb()
}

async function cancelTask(task) {
  if (!canCancel(task)) return
  busyTaskId.value = task.id
  try {
    if (normalizeStatus(task.status) === 'running' && window.electronAPI?.genTasks?.cancel) {
      await window.electronAPI.genTasks.cancel(task.id)
      await tasksStore.loadFromDb()
    } else {
      await tasksStore.updateTaskStatus(task.id, 'cancelled')
    }
    msg.success('已取消任务')
  } catch (e) {
    msg.error(e?.message || '取消失败')
  } finally {
    busyTaskId.value = ''
  }
}

async function deleteTask(task) {
  if (!task?.id) return
  const confirmed = await mbox.confirm({
    title: '删除任务记录',
    subtitle: '只会移除任务中心里的记录',
    message: `确定删除「${task.name || '未命名任务'}」吗？`,
    variant: 'danger',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  busyTaskId.value = task.id
  try {
    await tasksStore.removeTask(task.id)
    if (selectedTask.value?.id === task.id) {
      showDetail.value = false
      selectedTask.value = null
    }
    msg.success('已删除记录')
  } catch (e) {
    msg.error(e?.message || '删除失败')
  } finally {
    busyTaskId.value = ''
  }
}
</script>

<template>
  <div class="h-full overflow-hidden" :class="isDark ? 'bg-d0' : 'bg-l1'">
    <div class="h-full max-w-7xl mx-auto px-6 lg:px-8 py-5 flex flex-col min-h-0">
      <div class="flex items-start justify-between gap-4 mb-4 shrink-0">
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center"
              :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'">
              <i class="ri-list-check-3 text-[18px]" />
            </div>
            <div class="min-w-0">
              <h1 class="text-[20px] font-bold leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">任务中心</h1>
              <p class="text-[12px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">查看后台任务状态、进度和执行详情</p>
            </div>
          </div>
        </div>
        <button
          class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors shrink-0"
          :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-white text-lt-sub border border-bdrF hover:bg-l3'"
          @click="refreshTasks"
        >
          <i class="ri-refresh-line text-[13px]" />
          <span>刷新</span>
        </button>
      </div>

      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4 shrink-0">
        <div v-for="card in statCards" :key="card.label"
          class="rounded-xl px-4 py-3"
          :class="isDark ? 'bg-d2 border border-d4' : 'bg-white border border-bdrF shadow-sm'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ card.label }}</div>
              <div class="text-[22px] font-bold leading-none mt-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ card.value }}</div>
            </div>
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="toneClass(card.tone)">
              <i :class="card.icon + ' text-[17px]'" />
            </div>
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0 rounded-xl overflow-hidden flex flex-col"
        :class="isDark ? 'bg-d2 border border-d4' : 'bg-white border border-bdrF shadow-sm'">
        <div class="px-4 py-3 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrF'">
          <div class="flex flex-col xl:flex-row xl:items-center gap-3">
            <div class="relative flex-1 min-w-[220px]">
              <i class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <input
                v-model="searchQuery"
                class="w-full h-8 rounded-lg pl-8 pr-3 text-[12px] outline-none transition-colors"
                :class="isDark ? 'bg-d1 text-wt-main placeholder:text-wt-dim border border-d4 focus:border-brand-400/40' : 'bg-l2 text-lt-main placeholder:text-lt-aux border border-bdrF focus:border-brand-300'"
                placeholder="搜索任务名、类型、错误信息"
              />
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <n-select
                v-model:value="typeFilter"
                :options="typeOptions"
                size="small"
                style="width: 128px"
              />
            </div>
          </div>

          <div class="mt-3 flex items-center gap-1 overflow-x-auto thin-scroll">
            <button
              v-for="item in statusFilters"
              :key="item.value"
              class="h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
              :class="statusFilter === item.value
                ? (isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600')
                : (isDark ? 'text-wt-aux hover:bg-white/5 hover:text-wt-sub' : 'text-lt-aux hover:bg-l3 hover:text-lt-sub')"
              @click="statusFilter = item.value"
            >
              <span>{{ item.label }}</span>
              <span class="text-[10px] opacity-70">{{ item.count }}</span>
            </button>
          </div>
        </div>

        <div class="hidden lg:grid grid-cols-[minmax(0,1.6fr)_112px_112px_128px_142px_92px] gap-3 px-4 py-2.5 text-[11px] font-semibold shrink-0"
          :class="isDark ? 'text-wt-aux border-b border-d4' : 'text-lt-aux border-b border-bdrF'">
          <span>任务</span>
          <span>类型</span>
          <span>状态</span>
          <span>进度</span>
          <span>创建时间</span>
          <span class="text-right">操作</span>
        </div>

        <div v-if="filteredTasks.length" class="flex-1 min-h-0 overflow-y-auto thin-scroll">
          <div
            v-for="task in filteredTasks"
            :key="task.id"
            class="grid lg:grid-cols-[minmax(0,1.6fr)_112px_112px_128px_142px_92px] gap-3 px-4 py-3 cursor-pointer transition-colors group"
            :class="isDark ? 'border-b border-d4/70 hover:bg-white/4' : 'border-b border-bdrF hover:bg-l3/70'"
            @click="viewDetail(task)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" :class="toneClass(taskTone(task))">
                <i :class="taskIcon(task) + ' text-[17px]'" />
              </div>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ task.name || '未命名任务' }}</div>
                <div class="text-[11px] mt-0.5 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ taskSummary(task) || task.id }}</div>
              </div>
            </div>

            <div class="flex lg:block items-center justify-between gap-2">
              <span class="lg:hidden text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">类型</span>
              <span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ taskTypeLabel(task) }}</span>
            </div>

            <div class="flex lg:block items-center justify-between gap-2">
              <span class="lg:hidden text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">状态</span>
              <span class="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium" :class="statusBadgeClass(task.status)">
                <span class="w-1.5 h-1.5 rounded-full" :class="statusDotClass(task.status)" />
                {{ statusLabels[task.status] || task.status || '未知' }}
              </span>
            </div>

            <div class="flex lg:block items-center justify-between gap-3">
              <span class="lg:hidden text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">进度</span>
              <div class="min-w-[112px]">
                <div class="h-1.5 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
                  <div class="h-full rounded-full transition-all duration-300" :class="progressBarClass(task)" :style="{ width: progressValue(task) + '%' }" />
                </div>
                <div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ progressValue(task) }}%</div>
              </div>
            </div>

            <div class="flex lg:block items-center justify-between gap-2">
              <span class="lg:hidden text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">创建</span>
              <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatTime(taskCreatedAt(task)) }}</div>
              <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">{{ formatDuration(task) }}</div>
            </div>

            <div class="flex items-center justify-end gap-1">
              <button
                v-if="canCancel(task)"
                class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-aux hover:text-red-300 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
                :disabled="busyTaskId === task.id"
                title="取消任务"
                @click.stop="cancelTask(task)"
              >
                <i class="ri-close-line text-[14px]" />
              </button>
              <button
                v-if="canDelete(task)"
                class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-aux hover:text-red-300 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
                :disabled="busyTaskId === task.id"
                title="删除记录"
                @click.stop="deleteTask(task)"
              >
                <i class="ri-delete-bin-line text-[13px]" />
              </button>
              <button
                class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'"
                title="查看详情"
                @click.stop="viewDetail(task)"
              >
                <i class="ri-arrow-right-s-line text-[16px]" />
              </button>
            </div>
          </div>
        </div>

        <div v-else class="flex-1 min-h-0 flex items-center justify-center px-6 py-14">
          <div class="text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center"
              :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l3 text-lt-aux'">
              <i class="ri-inbox-line text-[22px]" />
            </div>
            <div class="text-[13px] font-semibold mt-3" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">暂无匹配任务</div>
            <div class="text-[12px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">调整筛选条件或刷新后再查看</div>
          </div>
        </div>
      </div>
    </div>

    <n-drawer v-model:show="showDetail" :width="520" placement="right">
      <n-drawer-content v-if="selectedTask" :title="selectedTask.name || '任务详情'" closable>
        <div class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="toneClass(taskTone(selectedTask))">
              <i :class="taskIcon(selectedTask) + ' text-[18px]'" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium" :class="statusBadgeClass(selectedTask.status)">
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusDotClass(selectedTask.status)" />
                  {{ statusLabels[selectedTask.status] || selectedTask.status || '未知' }}
                </span>
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ taskTypeLabel(selectedTask) }}</span>
              </div>
              <div v-if="taskSummary(selectedTask)" class="text-[12px] mt-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ taskSummary(selectedTask) }}</div>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">进度</span>
              <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ progressValue(selectedTask) }}%</span>
            </div>
            <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
              <div class="h-full rounded-full transition-all duration-300" :class="progressBarClass(selectedTask)" :style="{ width: progressValue(selectedTask) + '%' }" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 text-[12px]">
            <div class="rounded-lg p-3" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <div class="text-[11px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">创建时间</div>
              <div :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatTime(taskCreatedAt(selectedTask), true) }}</div>
            </div>
            <div class="rounded-lg p-3" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <div class="text-[11px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">耗时</div>
              <div :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatDuration(selectedTask) }}</div>
            </div>
            <div v-if="taskCompletedAt(selectedTask)" class="rounded-lg p-3 col-span-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <div class="text-[11px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">结束时间</div>
              <div :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatTime(taskCompletedAt(selectedTask), true) }}</div>
            </div>
          </div>

          <div v-if="selectedTask.error" class="p-3 rounded-lg text-[12px]"
            :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
            <i class="ri-error-warning-line mr-1" /> {{ selectedTask.error }}
          </div>

          <div v-if="selectedTask.result" class="p-3 rounded-lg" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">输出结果</div>
            <div class="text-[12px] whitespace-pre-wrap leading-relaxed" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selectedTask.result }}</div>
          </div>

          <div v-if="taskParams(selectedTask)" class="p-3 rounded-lg" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">任务参数</div>
            <pre class="text-[11px] leading-relaxed whitespace-pre-wrap break-all max-h-[180px] overflow-y-auto thin-scroll" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ formatJson(taskParams(selectedTask)) }}</pre>
          </div>

          <div v-if="taskSteps(selectedTask).length">
            <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">执行日志</div>
            <div class="space-y-2">
              <div v-for="(step, idx) in taskSteps(selectedTask)" :key="step.index || step.timestamp || idx"
                class="flex items-start gap-2.5 text-[12px] p-2.5 rounded-lg"
                :class="isDark ? 'bg-d3' : 'bg-l3'">
                <span class="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold"
                  :class="isDark ? 'bg-d4 text-wt-aux' : 'bg-l4 text-lt-aux'">{{ step.index || '·' }}</span>
                <div class="min-w-0">
                  <div class="leading-relaxed" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ step.action || step.thought || '执行步骤' }}</div>
                  <div v-if="step.observation" class="mt-1 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ step.observation }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-2">
            <button
              v-if="canCancel(selectedTask)"
              class="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
              :class="isDark ? 'bg-red-400/10 text-red-300 hover:bg-red-400/16' : 'bg-red-50 text-red-600 hover:bg-red-100'"
              @click="cancelTask(selectedTask)"
            >
              <i class="ri-close-line text-[13px] mr-1" />取消任务
            </button>
            <button
              v-if="canDelete(selectedTask)"
              class="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
              :class="isDark ? 'bg-white/5 text-wt-sub hover:bg-white/8' : 'bg-l3 text-lt-sub hover:bg-l4'"
              @click="deleteTask(selectedTask)"
            >
              <i class="ri-delete-bin-line text-[13px] mr-1" />删除记录
            </button>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>
