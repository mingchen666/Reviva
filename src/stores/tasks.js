import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const db = () => window.electronAPI.db.tasks

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref([])
  const loaded = ref(false)

  const activeTasks = computed(() => tasks.value.filter(t => t.status === 'running'))
  const completedTasks = computed(() => tasks.value.filter(t => t.status === 'done' || t.status === 'completed'))
  const failedTasks = computed(() => tasks.value.filter(t => t.status === 'failed'))

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      tasks.value = await db().list()
      loaded.value = true
    } catch (e) {
      console.error('Failed to load tasks from DB:', e)
    }
  }

  async function addTask(task) {
    const data = {
      name: task.name || '未命名任务',
      type: task.type || 'agent',
      status: task.status || 'pending',
      architecture: task.architecture || '',
      space_id: task.spaceId || '',
      agent_id: task.agentId || '',
      skill_type: task.skillType || '',
      progress: 0,
      steps: [],
      result: '',
      error: '',
    }
    if (window.electronAPI?.db) {
      const result = await db().create(data)
      tasks.value.unshift({ id: result.id, ...data, createdAt: new Date().toISOString(), completedAt: null })
      return result
    }
    tasks.value.unshift({ id: Date.now().toString(), ...data, createdAt: new Date().toISOString(), completedAt: null })
  }

  async function updateTaskStatus(id, status, data) {
    const updateData = { status, ...data }
    if (status === 'done' || status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.completed_at = new Date().toISOString()
    }
    if (window.electronAPI?.db) await db().update(id, updateData)
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.status = status
      if (data) Object.assign(task, data)
      if (status === 'done' || status === 'completed' || status === 'failed' || status === 'cancelled') {
        task.completedAt = new Date().toISOString()
      }
    }
  }

  async function addTaskStep(id, step) {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return
    task.steps = task.steps || []
    task.steps.push({ index: task.steps.length + 1, ...step, timestamp: new Date().toISOString() })
    if (window.electronAPI?.db) await db().update(id, { steps: task.steps })
  }

  async function removeTask(id) {
    if (window.electronAPI?.db) await db().delete(id)
    tasks.value = tasks.value.filter(t => t.id !== id)
  }

  async function cancelPending() {
    const pending = tasks.value.filter(t => t.status === 'pending')
    for (const t of pending) {
      t.status = 'cancelled'
      t.completedAt = new Date().toISOString()
      if (window.electronAPI?.db) await db().update(t.id, { status: 'cancelled', completed_at: new Date().toISOString() })
    }
  }

  return {
    tasks, loaded,
    activeTasks, completedTasks, failedTasks,
    loadFromDb, addTask, updateTaskStatus, addTaskStep, removeTask, cancelPending,
  }
}, {
  persist: {
    pick: ['tasks'],
  },
})
