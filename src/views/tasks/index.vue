<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '@/stores/app';
import { useTasksStore } from '@/stores/tasks';
import { useMessage } from '@/components/MsMessage/useMessage';
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox';

// --- Store & Composables ---
const appStore = useAppStore();
const tasksStore = useTasksStore();
const msg = useMessage();
const mbox = useMessageBox();

// --- State ---
const isDark = computed(() => appStore.isDark);
const searchQuery = ref('');
const typeFilter = ref('all');
const statusFilter = ref('all');
const showDetail = ref(false);
const selectedTask = ref(null);
const busyTaskId = ref('');

// --- Constants & Meta ---
const statusLabels = {
  pending: '等待中', running: '进行中', completed: '已完成',
  done: '已完成', failed: '失败', cancelled: '已取消'
};
const typeLabels = {
  upload: '上传', parse: '入库', skill: 'Skill', agent: 'Agent', generation: '生成任务'
};
const typeIcons = {
  upload: 'ri-cloud-line', parse: 'ri-database-2-line', skill: 'ri-file-text-line',
  agent: 'ri-sparkling-2-line', generation: 'ri-magic-line'
};
const toolMeta = {
  mindmap: { name: '思维导图', icon: 'ri-mind-map' },
  graph: { name: '知识图谱', icon: 'ri-node-tree' },
  flashcard: { name: '闪卡', icon: 'ri-stack-line' },
  qa: { name: 'Q&A', icon: 'ri-question-answer-line' },
  glossary: { name: '术语表', icon: 'ri-book-2-line' },
  cheatsheet: { name: '速查表', icon: 'ri-file-list-3-line' },
  quiz: { name: '测验', icon: 'ri-questionnaire-line' },
  chart: { name: '图表', icon: 'ri-bar-chart-box-line' },
  podcast: { name: '播客', icon: 'ri-mic-2-line' },
  research: { name: '深度研究', icon: 'ri-search-eye-line' },
  ppt: { name: 'PPT', icon: 'ri-slideshow-line' }
};

// --- Helpers ---
onMounted(() => { if (!tasksStore.loaded) tasksStore.loadFromDb(); });

const normalizeStatus = (s) =>
  s === 'done' || s === 'completed' ? 'completed' : s || 'pending';

const taskStartedAt = (t) => t?.createdAt || t?.created_at || '';
const taskCompletedAt = (t) => t?.completedAt || t?.completed_at || '';

/**
 * ✅ 核心修复：兼容 UTC 与本地时间的统一时间戳转换
 *
 * 处理逻辑：
 * 1. 如果字符串包含 Z / +HH / -HH → 说明已有时区信息，JS 原生解析正确
 * 2. 如果字符串是纯日期时间（无时区标识）→ 视为 UTC，追加 Z 后缀
 *    避免 JS 将其误当作本地时间解析导致 ±8h 偏差
 * 3. 同时兼容空格分隔格式 "2024-01-01 10:00:00"
 */
const toTimestamp = (v) => {
  if (!v) return 0;
  let str = String(v).trim();
  if (!str) return 0;

  // 将空格替换为 T，统一为 ISO 格式
  str = str.replace(' ', 'T');

  // 旧版 SQLite 任务时间没有时区，按 UTC 解释。
  const hasTimezone = /[Zz]|[+-]\d{2}:\d{2}$/.test(str);

  // 没有时区标识 → 视为 UTC，追加 Z
  if (!hasTimezone) {
    str += 'Z';
  }

  const ts = new Date(str).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

/**
 * 内部按 UTC 时间戳计算，界面固定显示北京时间。
 */
const formatTime = (v, long = false) => {
  const t = toTimestamp(v);
  if (!t) return '--';
  return new Date(t).toLocaleString(
    'zh-CN',
    long
      ? { timeZone: 'Asia/Shanghai', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { timeZone: 'Asia/Shanghai', hourCycle: 'h23', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
  );
};

/**
 * ✅ 耗时计算：两个时间戳都经过 toTimestamp 统一处理
 * 无论原始数据是 UTC 还是本地时间，只要各自被正确解析，差值就是准确的
 */
const formatDuration = (task) => {
  const start = toTimestamp(taskStartedAt(task));
  const end = toTimestamp(taskCompletedAt(task));

  if (!start || !end) return '--';
  if (end <= start) return '--';

  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));

  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
};

const taskTypeLabel = (t) =>
  toolMeta[t?.tool_id]?.name || typeLabels[t?.type] || t?.type || '任务';
const taskIcon = (t) =>
  toolMeta[t?.tool_id]?.icon || typeIcons[t?.type] || 'ri-list-check-3';
const taskSummary = (t) =>
  [t?.mode === 'cloud' ? '云端' : t?.mode === 'local' ? '本地' : '', t?.architecture, t?.agent_id]
    .filter(Boolean).join(' · ');
const canCancel = (t) => ['pending', 'running'].includes(normalizeStatus(t?.status));
const canDelete = (t) => !canCancel(t);
const progressValue = (t) =>
  normalizeStatus(t?.status) === 'completed' ? 100 : Math.min(100, Math.max(0, Number(t?.progress) || 0));
const taskParams = (t) => {
  const p = t?.params || t?.params_json;
  if (!p) return null;
  if (typeof p === 'string') { try { return JSON.parse(p); } catch { return p; } }
  return p;
};
const formatJson = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
};
const taskSteps = (t) => (Array.isArray(t?.steps) ? t.steps : []);

// --- Derived State ---
const statusCounts = computed(() => {
  const c = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  tasksStore.tasks.forEach((t) => c[normalizeStatus(t.status)]++);
  return c;
});
const statusFilters = computed(() => [
  { value: 'all', label: '全部', count: tasksStore.tasks.length },
  { value: 'running', label: '进行中', count: statusCounts.value.running },
  { value: 'pending', label: '等待中', count: statusCounts.value.pending },
  { value: 'completed', label: '已完成', count: statusCounts.value.completed },
  { value: 'failed', label: '失败', count: statusCounts.value.failed },
  { value: 'cancelled', label: '已取消', count: statusCounts.value.cancelled }
]);
const typeOptions = computed(() => {
  const opts = [{ label: '全部类型', value: 'all' }];
  Object.entries(typeLabels).forEach(([k, v]) => opts.push({ label: v, value: k }));
  return opts;
});
const statCards = computed(() => [
  { label: '总任务数', value: tasksStore.tasks.length, icon: 'ri-stack-line' },
  { label: '活动中', value: statusCounts.value.running + statusCounts.value.pending, icon: 'ri-loader-4-line' },
  { label: '已完成', value: statusCounts.value.completed, icon: 'ri-checkbox-circle-line' },
  { label: '失败', value: statusCounts.value.failed, icon: 'ri-error-warning-line' }
]);
const filteredTasks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return [...tasksStore.tasks]
    .filter((t) => typeFilter.value === 'all' || t.type === typeFilter.value)
    .filter((t) => statusFilter.value === 'all' || normalizeStatus(t.status) === statusFilter.value)
    .filter((t) => {
      if (!q) return true;
      return [t.name, taskTypeLabel(t), t.error, t.id, t.tool_id]
        .some((s) => String(s || '').toLowerCase().includes(q));
    })
    .sort((a, b) => toTimestamp(taskStartedAt(b)) - toTimestamp(taskStartedAt(a)));
});

// --- Style Helpers ---
const statusBadgeClass = (status) => {
  const n = normalizeStatus(status);
  const map = {
    running: isDark.value ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-100',
    pending: isDark.value ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-600 border-amber-100',
    completed: isDark.value ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-100',
    failed: isDark.value ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-100',
    cancelled: isDark.value ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' : 'bg-gray-50 text-gray-500 border-gray-100'
  };
  return `inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium ${map[n] || map.cancelled}`;
};
const progressBarColor = (status) => {
  const n = normalizeStatus(status);
  if (n === 'failed') return 'bg-red-400';
  if (n === 'completed') return 'bg-emerald-400';
  if (n === 'cancelled') return 'bg-gray-400';
  return 'bg-blue-400';
};

// --- Actions ---
const viewDetail = (task) => { selectedTask.value = task; showDetail.value = true; };
const refreshTasks = async () => {
  busyTaskId.value = '__refresh__';
  try { await tasksStore.loadFromDb(); } finally { busyTaskId.value = ''; }
};
const cancelTask = async (task) => {
  if (!canCancel(task)) return;
  busyTaskId.value = task.id;
  try {
    if (normalizeStatus(task.status) === 'running' && window.electronAPI?.genTasks?.cancel) {
      await window.electronAPI.genTasks.cancel(task.id);
      await tasksStore.loadFromDb();
    } else {
      await tasksStore.updateTaskStatus(task.id, 'cancelled');
    }
    msg.success('已取消任务');
  } catch (e) { msg.error(e?.message || '取消失败'); } finally { busyTaskId.value = ''; }
};
const deleteTask = async (task) => {
  if (!task?.id) return;
  const confirmed = await mbox.confirm({
    title: '删除任务记录', subtitle: '只会移除任务中心里的记录',
    message: `确定删除「${task.name || '未命名任务'}」吗？`,
    variant: 'danger', confirmText: '删除', cancelText: '取消'
  });
  if (!confirmed) return;
  busyTaskId.value = task.id;
  try {
    await tasksStore.removeTask(task.id);
    if (selectedTask.value?.id === task.id) { showDetail.value = false; selectedTask.value = null; }
    msg.success('已删除记录');
  } catch (e) { msg.error(e?.message || '删除失败'); } finally { busyTaskId.value = ''; }
};
</script>

<template>
  <div class="h-full flex flex-col min-h-0 transition-colors duration-200"
    :class="isDark ? 'bg-[#0f1117] text-gray-200' : 'bg-gray-50 text-gray-900'">
    <div class="flex-1 min-h-0 max-w-[1600px] mx-auto w-full px-6 py-5 flex flex-col gap-4 overflow-hidden">

      <!-- 头部 -->
      <div class="shrink-0 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold tracking-tight">任务中心</h1>
            <p class="text-xs mt-0.5 opacity-50">查看后台任务状态、进度和执行详情</p>
          </div>
          <button class="h-8 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
            :class="isDark ? 'bg-white/5 hover:bg-white/10 border border-white/5' : 'bg-white hover:bg-gray-100 border border-gray-200 shadow-sm'"
            @click="refreshTasks">
            <i class="ri-refresh-line text-base" :class="{ 'animate-spin': busyTaskId === '__refresh__' }" />
            <span>刷新</span>
          </button>
        </div>

        <!-- 统计卡片：强制单行 -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-[800px]">
          <div v-for="card in statCards" :key="card.label"
            class="rounded-lg px-4 py-3 flex items-center justify-between gap-3"
            :class="isDark ? 'bg-[#1a1d26] border border-white/5' : 'bg-white border border-gray-200 shadow-sm'">
            <div class="min-w-0">
              <div class="text-xs opacity-50 truncate">{{ card.label }}</div>
              <div class="text-2xl font-bold mt-1 tabular-nums tracking-tight">{{ card.value }}</div>
            </div>
            <i :class="[card.icon, 'text-xl opacity-30 shrink-0']" />
          </div>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 min-h-0 rounded-lg overflow-hidden flex flex-col"
        :class="isDark ? 'bg-[#1a1d26] border border-white/5' : 'bg-white border border-gray-200 shadow-sm'">

        <!-- 筛选栏 -->
        <div class="p-3 flex flex-wrap items-center gap-2 shrink-0 border-b"
          :class="isDark ? 'border-white/5' : 'border-gray-100'">
          <div class="relative flex-1 min-w-[200px] max-w-xs">
            <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 text-sm" />
            <input v-model="searchQuery" placeholder="搜索任务名称、ID..."
              class="w-full h-8 pl-8 pr-3 rounded-md text-sm outline-none transition-colors"
              :class="isDark
                ? 'bg-black/20 border border-white/5 focus:border-blue-500/40 placeholder:text-gray-600'
                : 'bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 placeholder:text-gray-400'" />
          </div>
          <n-select v-model:value="typeFilter" :options="typeOptions" size="small" class="w-28 shrink-0" />
          <div class="h-4 w-px opacity-10 shrink-0 hidden sm:block" :class="isDark ? 'bg-white' : 'bg-black'" />
          <div class="flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
            <button v-for="f in statusFilters" :key="f.value"
              class="h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
              :class="statusFilter === f.value
                ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                : (isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')"
              @click="statusFilter = f.value">
              {{ f.label }}
              <span class="ml-1 text-[10px] opacity-60 tabular-nums">{{ f.count }}</span>
            </button>
          </div>
        </div>

        <!-- 表格 -->
        <div class="flex-1 min-h-0 overflow-auto">
          <table class="w-full text-sm border-collapse">
            <thead class="sticky top-0 z-10 text-xs uppercase tracking-wider font-semibold"
              :class="isDark ? 'bg-[#1a1d26] text-gray-500 border-b border-white/5' : 'bg-gray-50/95 backdrop-blur text-gray-500 border-b border-gray-100'">
              <tr>
                <th class="text-left py-2.5 px-4 w-[35%] min-w-[200px]">任务名称</th>
                <th class="text-left py-2.5 px-4 w-[100px]">类型</th>
                <th class="text-left py-2.5 px-4 w-[110px]">状态</th>
                <th class="text-left py-2.5 px-4 w-[150px]">进度</th>
                <th class="text-left py-2.5 px-4 w-[160px]">开始时间</th>
                <th class="text-right py-2.5 px-4 w-[80px]">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y" :class="isDark ? 'divide-white/5' : 'divide-gray-100'">
              <tr v-if="!filteredTasks.length">
                <td colspan="6" class="py-20 text-center">
                  <div class="flex flex-col items-center gap-2 opacity-40">
                    <i class="ri-inbox-line text-3xl" />
                    <span class="text-sm">暂无匹配任务</span>
                  </div>
                </td>
              </tr>
              <tr v-for="task in filteredTasks" :key="task.id"
                class="cursor-pointer transition-colors group"
                :class="[isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-gray-50/80', busyTaskId === task.id ? 'opacity-40 pointer-events-none' : '']"
                @click="viewDetail(task)">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <i :class="[taskIcon(task), 'text-base opacity-50 shrink-0']" />
                    <div class="min-w-0">
                      <div class="font-medium truncate leading-snug">{{ task.name || '未命名任务' }}</div>
                      <div class="text-xs opacity-40 truncate mt-0.5 font-mono">{{ taskSummary(task) || task.id.slice(0, 12) }}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4 text-xs opacity-60">{{ taskTypeLabel(task) }}</td>
                <td class="py-3 px-4">
                  <span :class="statusBadgeClass(task.status)">
                    <span class="w-1.5 h-1.5 rounded-full bg-current shrink-0"
                      :class="{ 'animate-pulse': normalizeStatus(task.status) === 'running' }" />
                    {{ statusLabels[task.status] || task.status || '未知' }}
                  </span>
                </td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <div class="flex-1 h-1.5 rounded-full overflow-hidden" :class="isDark ? 'bg-white/10' : 'bg-gray-200'">
                      <div class="h-full rounded-full transition-all duration-300 ease-out"
                        :class="progressBarColor(task.status)"
                        :style="{ width: progressValue(task) + '%' }" />
                    </div>
                    <span class="text-xs tabular-nums opacity-50 w-8 text-right shrink-0">{{ progressValue(task) }}%</span>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <div class="text-xs tabular-nums opacity-60 leading-relaxed">
                    <div>{{ formatTime(taskStartedAt(task)) }}</div>
                    <div class="opacity-70 text-[11px]">耗时 {{ formatDuration(task) }}</div>
                  </div>
                </td>
                <td class="py-3 px-4">
                  <div class="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button v-if="canCancel(task)"
                      class="w-7 h-7 rounded flex items-center justify-center transition-colors"
                      :class="isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'"
                      title="取消任务" @click.stop="cancelTask(task)">
                      <i class="ri-close-line text-base" />
                    </button>
                    <button v-if="canDelete(task)"
                      class="w-7 h-7 rounded flex items-center justify-center transition-colors"
                      :class="isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'"
                      title="删除记录" @click.stop="deleteTask(task)">
                      <i class="ri-delete-bin-line text-sm" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <n-drawer v-model:show="showDetail" :width="520" placement="right">
      <n-drawer-content v-if="selectedTask" :title="selectedTask.name || '任务详情'" closable>
        <div class="space-y-5 pb-8">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              :class="isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'">
              <i :class="[taskIcon(selectedTask), 'text-xl']" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span :class="statusBadgeClass(selectedTask.status)">
                  <span class="w-1.5 h-1.5 rounded-full bg-current"
                    :class="{ 'animate-pulse': normalizeStatus(selectedTask.status) === 'running' }" />
                  {{ statusLabels[selectedTask.status] || selectedTask.status || '未知' }}
                </span>
                <span class="text-xs opacity-50">{{ taskTypeLabel(selectedTask) }}</span>
              </div>
              <div v-if="taskSummary(selectedTask)" class="text-xs opacity-50 font-mono truncate">
                {{ taskSummary(selectedTask) }}
              </div>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-semibold opacity-50">进度</span>
              <span class="text-xs tabular-nums opacity-50">{{ progressValue(selectedTask) }}%</span>
            </div>
            <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-white/10' : 'bg-gray-200'">
              <div class="h-full rounded-full transition-all duration-500"
                :class="progressBarColor(selectedTask.status)"
                :style="{ width: progressValue(selectedTask) + '%' }" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg p-3 space-y-1" :class="isDark ? 'bg-white/[0.03]' : 'bg-gray-50'">
              <div class="text-[10px] uppercase tracking-wider opacity-40">开始时间（北京时间）</div>
              <div class="text-sm tabular-nums">{{ formatTime(taskStartedAt(selectedTask), true) }}</div>
            </div>
            <div class="rounded-lg p-3 space-y-1" :class="isDark ? 'bg-white/[0.03]' : 'bg-gray-50'">
              <div class="text-[10px] uppercase tracking-wider opacity-40">耗时</div>
              <div class="text-sm tabular-nums">{{ formatDuration(selectedTask) }}</div>
            </div>
            <div v-if="taskCompletedAt(selectedTask)" class="rounded-lg p-3 space-y-1 col-span-2"
              :class="isDark ? 'bg-white/[0.03]' : 'bg-gray-50'">
              <div class="text-[10px] uppercase tracking-wider opacity-40">结束时间（北京时间）</div>
              <div class="text-sm tabular-nums">{{ formatTime(taskCompletedAt(selectedTask), true) }}</div>
            </div>
          </div>

          <div v-if="selectedTask.error" class="p-3 rounded-lg text-sm leading-relaxed border-l-2"
            :class="isDark ? 'bg-red-500/10 border-red-500 text-red-300' : 'bg-red-50 border-red-400 text-red-700'">
            <i class="ri-error-warning-line mr-1.5 align-middle" />{{ selectedTask.error }}
          </div>

          <div v-if="selectedTask.result" class="space-y-1.5">
            <div class="text-xs font-semibold opacity-50">输出结果</div>
            <div class="p-3 rounded-lg text-sm whitespace-pre-wrap leading-relaxed break-all"
              :class="isDark ? 'bg-white/[0.03]' : 'bg-gray-50'">{{ selectedTask.result }}</div>
          </div>

          <div v-if="taskParams(selectedTask)" class="space-y-1.5">
            <div class="text-xs font-semibold opacity-50">任务参数</div>
            <pre class="p-3 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[180px] overflow-y-auto thin-scroll"
              :class="isDark ? 'bg-black/30 text-gray-400' : 'bg-gray-50 text-gray-600'">{{ formatJson(taskParams(selectedTask)) }}</pre>
          </div>

          <div v-if="taskSteps(selectedTask).length" class="space-y-1.5">
            <div class="text-xs font-semibold opacity-50">执行日志</div>
            <div class="space-y-1.5">
              <div v-for="(step, idx) in taskSteps(selectedTask)" :key="step.index || step.timestamp || idx"
                class="flex items-start gap-2.5 text-xs p-2.5 rounded-lg"
                :class="isDark ? 'bg-white/[0.03]' : 'bg-gray-50'">
                <span class="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold opacity-40"
                  :class="isDark ? 'bg-white/10' : 'bg-gray-200'">{{ step.index || idx + 1 }}</span>
                <div class="min-w-0">
                  <div class="leading-relaxed opacity-80">{{ step.action || step.thought || '执行步骤' }}</div>
                  <div v-if="step.observation" class="mt-1 leading-relaxed opacity-50">{{ step.observation }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="pt-3 flex gap-2">
            <button v-if="canCancel(selectedTask)" class="h-9 px-4 rounded-lg text-sm font-medium transition-colors"
              :class="isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'"
              @click="cancelTask(selectedTask)">
              <i class="ri-close-line mr-1" />取消任务
            </button>
            <button v-if="canDelete(selectedTask)" class="h-9 px-4 rounded-lg text-sm font-medium transition-colors"
              :class="isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
              @click="deleteTask(selectedTask)">
              <i class="ri-delete-bin-line mr-1" />删除记录
            </button>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar { display: none; }
.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
</style>
