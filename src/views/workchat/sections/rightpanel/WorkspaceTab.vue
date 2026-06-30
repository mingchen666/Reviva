<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
import { useRecycleBinStore } from '@/stores/recycleBin'
import BuiltinTools from './BuiltinTools.vue'
import AgentSkills from './AgentSkills.vue'
import ArtifactList from './ArtifactList.vue'

const props = defineProps({
  isDark: Boolean,
  selectedAgent: Object,
  groupId: { type: String, default: 'default' },
})

const emit = defineEmits(['view-artifact', 'delete-artifact', 'tool-action', 'select-skill'])

const artifacts = ref([])
const tasks = ref([])
const TASK_TOOLS = ['mindmap', 'graph', 'flashcard', 'quiz', 'chart', 'podcast', 'research', 'ppt']
const msg = useMessage()
const mbox = useMessageBox()
const recycleBin = useRecycleBinStore()

async function loadArtifacts() {
  if (!window.electronAPI?.db?.artifacts?.listByGroup) return
  try {
    artifacts.value = await window.electronAPI.db.artifacts.listByGroup(props.groupId)
  } catch (e) {
    console.error('[WorkspaceTab] loadArtifacts error:', e)
  }
}

async function loadTasks() {
  if (!window.electronAPI?.db?.tasks?.listByGroup) return
  try {
    tasks.value = await window.electronAPI.db.tasks.listByGroup(props.groupId, TASK_TOOLS)
  } catch (e) {
    console.error('[WorkspaceTab] loadTasks error:', e)
  }
}

function refreshResults() {
  loadArtifacts()
  loadTasks()
}

function taskArtifactIds(t) {
  const ids = []
  if (t?.artifact_id) ids.push(t.artifact_id)
  if (Array.isArray(t?.params?.artifactIds)) ids.push(...t.params.artifactIds)
  return [...new Set(ids.filter(Boolean))]
}

function taskArtifacts(t) {
  const ids = taskArtifactIds(t)
  return artifacts.value.filter((a) => ids.includes(a.id))
}

function clonePlain(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback))
  } catch {
    return fallback
  }
}

function taskSnapshot(t) {
  return clonePlain(t, {})
}

function onTaskProgress(d) {
  const idx = tasks.value.findIndex((t) => t.id === d.taskId)
  if (idx >= 0) {
    tasks.value[idx] = { ...tasks.value[idx], progress: d.progress, result: d.message, status: 'running' }
  } else {
    loadTasks()
  }
}

function onTaskCompleted(d) {
  refreshResults()
  window.dispatchEvent(new CustomEvent('reviva:artifacts-created', { detail: d || {} }))
}

function onTaskFailed(d) {
  const idx = tasks.value.findIndex((t) => t.id === d.taskId)
  if (idx >= 0) {
    tasks.value[idx] = { ...tasks.value[idx], status: 'failed', error: d.error, progress: 0 }
  } else {
    loadTasks()
  }
}

function onLegacyWindowEvent(e) {
  if (!e?.detail?.groupId || e.detail.groupId === props.groupId) {
    loadArtifacts()
  } else {
    loadArtifacts() // still reload — group filter is on read side
  }
}

onMounted(() => {
  refreshResults()
  window.electronAPI?.genTasks?.onProgress?.(onTaskProgress)
  window.electronAPI?.genTasks?.onCompleted?.(onTaskCompleted)
  window.electronAPI?.genTasks?.onFailed?.(onTaskFailed)
  window.addEventListener('reviva:gen-task-created', refreshResults)
  window.addEventListener('reviva:artifacts-created', onLegacyWindowEvent)
  window.addEventListener('reviva:artifacts-updated', refreshResults)
})

watch(() => props.groupId, refreshResults)

onBeforeUnmount(() => {
  window.electronAPI?.genTasks?.removeListeners?.()
  window.removeEventListener('reviva:gen-task-created', refreshResults)
  window.removeEventListener('reviva:artifacts-created', onLegacyWindowEvent)
  window.removeEventListener('reviva:artifacts-updated', refreshResults)
})

async function cancelTask(t) {
  if (!window.electronAPI?.genTasks?.cancel) return
  await window.electronAPI.genTasks.cancel(t.id)
  loadTasks()
}

async function dismissTask(t) {
  if (!window.electronAPI?.db?.tasks?.delete) return
  const confirmed = await mbox.confirm({
    title: '删除任务记录',
    subtitle: '只会移除这条生成记录',
    message: `确定删除「${t.name || '生成任务'}」吗？`,
    variant: 'danger',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!confirmed) return
  await window.electronAPI.db.tasks.delete(t.id)
  loadTasks()
}

async function renameArtifact(a) {
  if (!a?.id || !window.electronAPI?.db?.artifacts?.update) return
  const title = await mbox.prompt({
    title: '重命名成果',
    message: '输入新的成果名称',
    value: a.title || '',
    placeholder: '成果名称',
    confirmText: '确认',
    cancelText: '取消',
  })
  const nextTitle = title?.trim()
  if (!nextTitle || nextTitle === a.title) return
  await window.electronAPI.db.artifacts.update(a.id, { title: nextTitle })
  await loadArtifacts()
  window.dispatchEvent(new CustomEvent('reviva:artifacts-updated', { detail: { artifactId: a.id } }))
  msg.success('已重命名')
}

async function renameTask(t) {
  if (!t?.id || !window.electronAPI?.db?.tasks?.update) return
  const name = await mbox.prompt({
    title: '重命名成果',
    message: '输入新的成果名称',
    value: t.name || '',
    placeholder: '成果名称',
    confirmText: '确认',
    cancelText: '取消',
  })
  const nextName = name?.trim()
  if (!nextName || nextName === t.name) return
  await window.electronAPI.db.tasks.update(t.id, { name: nextName })
  const linked = taskArtifacts(t)
  if (linked.length === 1 && window.electronAPI?.db?.artifacts?.update) {
    await window.electronAPI.db.artifacts.update(linked[0].id, { title: nextName })
  }
  refreshResults()
  msg.success('已重命名')
}

async function deleteTaskResults(t) {
  const linked = taskArtifacts(t)
  if (!linked.length) {
    await dismissTask(t)
    return
  }
  const confirmed = await mbox.confirm({
    title: '删除生成结果',
    subtitle: '将移入回收站，可稍后还原',
    message: `确定删除「${t.name || '生成结果'}」及其 ${linked.length} 个产物吗？`,
    variant: 'danger',
    confirmText: '移入回收站',
    cancelText: '取消',
  })
  if (!confirmed) return
  const results = []
  for (const artifact of linked) {
    results.push(await recycleBin.trashArtifact(artifact.id, { title: t.name, task: taskSnapshot(t) }))
  }
  const failed = results.filter((r) => !r.success)
  if (failed.length) {
    refreshResults()
    msg.error(failed[0].error || '删除失败')
    return
  }
  if (window.electronAPI?.db?.tasks?.delete) {
    await window.electronAPI.db.tasks.delete(t.id)
  }
  refreshResults()
  msg.success('已移入回收站')
}
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden min-h-0">
    <div class="flex-1 flex flex-col overflow-hidden min-h-0">
      <BuiltinTools :is-dark="isDark" @tool-action="(t) => emit('tool-action', t)" />
      <AgentSkills
        :is-dark="isDark"
        :selected-agent="selectedAgent"
        @select-skill="(skill) => emit('select-skill', skill)" />
      <ArtifactList
        :is-dark="isDark"
        :artifacts="artifacts"
        :tasks="tasks"
        @view-artifact="(a) => emit('view-artifact', a)"
        @delete-artifact="(a) => emit('delete-artifact', a)"
        @rename-artifact="renameArtifact"
        @rename-task="renameTask"
        @delete-task-results="deleteTaskResults"
        @cancel-task="cancelTask"
        @dismiss-task="dismissTask" />
    </div>
  </div>
</template>
