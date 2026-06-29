<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import colorMap from './colorMap'

const props = defineProps({
  isDark: Boolean,
  artifacts: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'view-artifact',
  'delete-artifact',
  'rename-artifact',
  'rename-task',
  'delete-task-results',
  'cancel-task',
  'dismiss-task',
])

const dropdown = ref(null)

const taskTools = {
  mindmap: { name: '思维导图', icon: 'ri-mind-map', color: 'emerald' },
  graph: { name: '知识图谱', icon: 'ri-share-circle-line', color: 'amber' },
  flashcard: { name: '闪卡', icon: 'ri-stack-line', color: 'pink' },
  quiz: { name: '测验', icon: 'ri-questionnaire-line', color: 'emerald' },
  chart: { name: '图表', icon: 'ri-bar-chart-box-line', color: 'sky' },
  podcast: { name: '播客', icon: 'ri-mic-2-line', color: 'agent' },
  research: { name: '深度研究', icon: 'ri-search-eye-line', color: 'sky' },
  ppt: { name: 'PPT', icon: 'ri-slideshow-line', color: 'brand' },
}
const defaultTool = { name: '任务', icon: 'ri-magic-line', color: 'brand' }
const taskBarClass = {
  brand: 'bg-brand-400',
  agent: 'bg-agent-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  pink: 'bg-pink-400',
  sky: 'bg-sky-400',
}
const artifactTypeLabels = {
  summary: '摘要',
  mindmap: '思维导图',
  flashcard: '闪卡',
  quiz: '测验',
  chart: '图表',
  ppt: 'PPT',
  presentation: 'PPT',
  podcast: '播客',
  graph: '知识图谱',
  research: '深度研究',
  custom: '自定义',
}

const visibleTaskStatuses = new Set(['pending', 'running', 'completed', 'failed', 'cancelled'])
const visibleTasks = computed(() =>
  props.tasks.filter((t) => {
    if (!visibleTaskStatuses.has(t.status)) return false
    if (t.status !== 'completed') return true
    const ids = taskArtifactIds(t)
    return !ids.length || taskArtifacts(t).length > 0
  }),
)

function colorClasses(color, light = false) {
  const c = colorMap[color] || colorMap.brand
  return light ? `${c.lightBg} ${c.lightText}` : `${c.bg} ${c.text}`
}

function taskMeta(t) {
  return taskTools[t?.tool_id] || defaultTool
}

function taskArtifactIds(t) {
  const ids = []
  if (t?.artifact_id) ids.push(t.artifact_id)
  if (Array.isArray(t?.params?.artifactIds)) ids.push(...t.params.artifactIds)
  return [...new Set(ids.filter(Boolean))]
}

const taskArtifactIdSet = computed(() => {
  const ids = new Set()
  for (const task of visibleTasks.value) {
    taskArtifactIds(task).forEach((id) => ids.add(id))
  }
  return ids
})

function taskArtifacts(t) {
  const ids = taskArtifactIds(t)
  if (!ids.length) return []
  return props.artifacts.filter((a) => ids.includes(a.id))
}

function primaryTaskArtifact(t) {
  return taskArtifacts(t)[0] || null
}

function artifactCount(t) {
  const linked = taskArtifacts(t).length
  if (linked) return linked
  if (Array.isArray(t?.params?.artifactIds)) return t.params.artifactIds.length
  return t?.artifact_id ? 1 : 0
}

const standaloneArtifacts = computed(() => props.artifacts.filter((a) => !taskArtifactIdSet.value.has(a.id)))

function timestamp(row) {
  const raw = row?.updated_at || row?.created_at || row?.completed_at || ''
  const time = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const resultEntries = computed(() => {
  const taskEntries = visibleTasks.value.map((task) => ({
    id: `task:${task.id}`,
    kind: 'task',
    task,
    sortTime: timestamp(task),
  }))
  const artifactEntries = standaloneArtifacts.value.map((artifact) => ({
    id: `artifact:${artifact.id}`,
    kind: 'artifact',
    artifact,
    sortTime: timestamp(artifact),
  }))
  return [...taskEntries, ...artifactEntries].sort((a, b) => b.sortTime - a.sortTime)
})

function statusText(t) {
  if (t.status === 'running') return t.result || '处理中...'
  if (t.status === 'pending') return t.mode === 'cloud' ? '云端排队中' : '准备中'
  if (t.status === 'completed') {
    const count = artifactCount(t)
    return t.result || (count ? `已生成 ${count} 个成果` : '已完成')
  }
  if (t.status === 'failed') return t.error || '生成失败'
  if (t.status === 'cancelled') return t.error || '已取消'
  return t.status || '未知状态'
}

function statusBadgeText(t) {
  if (t.status === 'running') return '进行中'
  if (t.status === 'pending') return t.mode === 'cloud' ? '云端排队' : '准备中'
  if (t.status === 'failed') return '失败'
  if (t.status === 'cancelled') return '已取消'
  return t.status && t.status !== 'completed' ? t.status : ''
}

function statusBadgeClass(t) {
  if (t.status === 'running') return props.isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'
  if (t.status === 'pending') return props.isDark ? 'bg-sky-400/12 text-sky-300' : 'bg-sky-50 text-sky-600'
  if (t.status === 'failed') return props.isDark ? 'bg-red-400/12 text-red-300' : 'bg-red-50 text-red-600'
  if (t.status === 'cancelled') return props.isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
  return props.isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'
}

function statusClass(t) {
  if (t.status === 'completed') return props.isDark ? 'text-emerald-400' : 'text-emerald-600'
  if (t.status === 'failed') return 'text-red-400'
  if (t.status === 'cancelled') return props.isDark ? 'text-wt-dim' : 'text-lt-aux'
  return props.isDark ? 'text-wt-dim' : 'text-lt-aux'
}

function progressWidth(t) {
  const n = Number(t?.progress)
  return `${Math.min(100, Math.max(6, Number.isFinite(n) ? n : 8))}%`
}

function progressBarClass(t) {
  return taskBarClass[taskMeta(t).color] || taskBarClass.brand
}

function artifactTypeLabel(a) {
  return artifactTypeLabels[a?.type] || a?.type || '成果'
}

function displayArtifactTitle(a) {
  const raw = (a?.title || artifactTypeLabel(a) || '成果').trim()
  return raw.replace(/\.[^.]+$/, '') || artifactTypeLabel(a)
}

function artifactFormatLabel(a) {
  const fileName =
    String(a?.file_path || '')
      .split(/[\\/]/)
      .pop() || ''
  if (!fileName.includes('.')) return ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (ext === 'html' || ext === 'htm') return 'HTML'
  if (ext === 'md' || ext === 'markdown') return 'MD'
  if (ext === 'pptx' || ext === 'ppt') return ext.toUpperCase()
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return ext.toUpperCase()
  if (ext === 'txt') return 'TXT'
  if (ext === 'json') return 'JSON'
  return ''
}

function artifactMeta(a) {
  const hideType = ['mindmap', 'graph'].includes(a?.type)
  return [hideType ? '' : artifactTypeLabel(a), a?.agent_name || a?.skill_name || ''].filter(Boolean).join(' · ')
}

function openMenu(kind, item, event) {
  event.stopPropagation()
  event.preventDefault()
  closeMenu()
  const rect = event.currentTarget.getBoundingClientRect()
  dropdown.value = {
    kind,
    item,
    x: Math.max(8, rect.right - 128),
    y: rect.bottom + 4,
  }
  document.addEventListener('click', onDocumentClick)
}

function closeMenu() {
  dropdown.value = null
  document.removeEventListener('click', onDocumentClick)
}

function onDocumentClick(e) {
  const menu = document.getElementById('artifact-result-menu')
  if (menu && menu.contains(e.target)) return
  closeMenu()
}

onBeforeUnmount(closeMenu)

function viewArtifact(a, task = null) {
  closeMenu()
  emit('view-artifact', task ? { artifact: a, task } : a)
}

function viewTask(t) {
  const artifact = primaryTaskArtifact(t)
  if (artifact) viewArtifact(artifact, t)
}

function deleteArtifact(a) {
  closeMenu()
  emit('delete-artifact', a)
}

function renameArtifact(a) {
  closeMenu()
  emit('rename-artifact', a)
}

function renameTask(t) {
  closeMenu()
  emit('rename-task', t)
}

function deleteTaskResults(t) {
  closeMenu()
  if (t.status === 'failed' || t.status === 'cancelled') emit('dismiss-task', t)
  else emit('delete-task-results', t)
}

function cancelTask(t) {
  closeMenu()
  emit('cancel-task', t)
}

function handleMenuView() {
  const d = dropdown.value
  if (!d) return
  if (d.kind === 'artifact') viewArtifact(d.item)
  else viewTask(d.item)
}

function handleMenuRename() {
  const d = dropdown.value
  if (!d) return
  if (d.kind === 'artifact') renameArtifact(d.item)
  else renameTask(d.item)
}

function handleMenuDelete() {
  const d = dropdown.value
  if (!d) return
  if (d.kind === 'artifact') deleteArtifact(d.item)
  else deleteTaskResults(d.item)
}

function menuCanView() {
  const d = dropdown.value
  if (!d) return false
  return d.kind === 'artifact' || !!primaryTaskArtifact(d.item)
}

function menuCanRename() {
  const d = dropdown.value
  if (!d) return false
  return d.kind === 'artifact' || d.item?.status === 'completed'
}
</script>

<template>
  <div class="flex-1 min-h-0 flex flex-col px-3 pt-2.5" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
    <div class="flex items-center justify-between mb-2 shrink-0">
      <span class="text-[10px] font-bold uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        生成结果
      </span>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ resultEntries.length }}</span>
    </div>

    <div v-if="resultEntries.length" class="flex-1 min-h-0 overflow-y-auto thin-scroll space-y-1 pb-3">
      <div v-for="entry in resultEntries" :key="entry.id">
        <div
          v-if="entry.kind === 'task'"
          @click="viewTask(entry.task)"
          class="rounded-lg p-2 transition-colors group relative"
          :class="[
            isDark ? 'hover:bg-brand-400/8' : 'hover:bg-brand-50',
            primaryTaskArtifact(entry.task) ? 'cursor-pointer' : '',
          ]">
          <div class="flex items-start gap-2.5">
            <div
              class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              :class="colorClasses(taskMeta(entry.task).color, !isDark)">
              <i :class="taskMeta(entry.task).icon + ' text-[16px]'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <div class="text-[11px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  {{ entry.task.name }}
                </div>
                <span
                  v-if="statusBadgeText(entry.task)"
                  class="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                  :class="statusBadgeClass(entry.task)">
                  {{ statusBadgeText(entry.task) }}
                </span>
              </div>
              <div class="text-[10px] mt-0.5 truncate" :class="statusClass(entry.task)">
                {{ statusText(entry.task) }}
              </div>
            </div>

            <button
              v-if="entry.task.status === 'running' || entry.task.status === 'pending'"
              @click.stop="cancelTask(entry.task)"
              class="h-6 w-6 rounded flex items-center justify-center transition-colors shrink-0"
              :class="
                isDark
                  ? 'text-wt-aux hover:text-red-400 hover:bg-white/4'
                  : 'text-lt-aux hover:text-red-500 hover:bg-l4'
              "
              title="取消">
              <i class="ri-close-line text-[12px]" />
            </button>
            <button
              v-else
              @click.stop="openMenu('task', entry.task, $event)"
              class="h-6 w-6 rounded flex items-center justify-center transition-colors shrink-0"
              :class="
                isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
              "
              title="更多">
              <i class="ri-more-2-fill text-[12px]" />
            </button>
          </div>

          <div
            v-if="entry.task.status === 'running' || entry.task.status === 'pending'"
            class="mt-2 h-1 rounded-full overflow-hidden"
            :class="isDark ? 'bg-d4' : 'bg-l4'">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="progressBarClass(entry.task)"
              :style="{ width: progressWidth(entry.task) }" />
          </div>

          <div v-else-if="taskArtifacts(entry.task).length > 1" class="mt-2 ml-9 space-y-1">
            <button
              v-for="artifact in taskArtifacts(entry.task)"
              :key="artifact.id"
              @click.stop="viewArtifact(artifact, entry.task)"
              class="w-full rounded-md px-2 py-1.5 flex items-center gap-2 text-left transition-colors"
              :class="isDark ? 'bg-d0 hover:bg-d2' : 'bg-white hover:bg-l2'">
              <i :class="(artifact.icon || 'ri-file-line') + ' text-[13px] shrink-0'" />
              <span
                class="min-w-0 flex-1 truncate text-[10px] font-medium"
                :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ displayArtifactTitle(artifact) }}
              </span>
              <span
                v-if="artifactFormatLabel(artifact)"
                class="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold"
                :class="isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux'">
                {{ artifactFormatLabel(artifact) }}
              </span>
            </button>
          </div>
        </div>

        <div
          v-else
          @click="viewArtifact(entry.artifact)"
          class="rounded-lg p-2 cursor-pointer transition-colors group relative"
          :class="isDark ? 'hover:bg-brand-400/8' : 'hover:bg-brand-50'">
          <div class="flex items-center gap-2.5">
            <div
              class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              :class="colorClasses(entry.artifact.color, !isDark)">
              <i :class="(entry.artifact.icon || 'ri-file-line') + ' text-[16px]'" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[11px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ displayArtifactTitle(entry.artifact) }}
              </div>
              <div
                v-if="artifactMeta(entry.artifact)"
                class="text-[10px] truncate"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ artifactMeta(entry.artifact) }}
              </div>
            </div>
            <button
              @click.stop="openMenu('artifact', entry.artifact, $event)"
              class="h-6 w-6 rounded flex items-center justify-center transition-colors shrink-0"
              :class="
                isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/4' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'
              "
              title="更多">
              <i class="ri-more-2-fill text-[12px]" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 py-4 text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <i class="ri-inbox-line text-[20px] mb-1" />
      <p class="text-[11px]">生成结果会显示在这里</p>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="dropdown"
      id="artifact-result-menu"
      class="fixed z-[60] rounded-lg py-1 min-w-[128px]"
      :style="{ left: dropdown.x + 'px', top: dropdown.y + 'px' }"
      :class="isDark ? 'bg-d3 border border-d4 shadow-xl shadow-black/40' : 'bg-l2 border border-bdrF shadow-xl'">
      <button
        v-if="menuCanView()"
        @click="handleMenuView"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-eye-line text-[13px]" />
        <span>查看</span>
      </button>
      <button
        v-if="menuCanRename()"
        @click="handleMenuRename"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4'">
        <i class="ri-edit-line text-[13px]" />
        <span>重命名</span>
      </button>
      <button
        @click="handleMenuDelete"
        class="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12px] font-medium transition-colors"
        :class="isDark ? 'text-red-400 hover:bg-red-400/8' : 'text-red-500 hover:bg-red-50'">
        <i class="ri-delete-bin-line text-[13px]" />
        <span>删除</span>
      </button>
    </div>
  </Teleport>
</template>
