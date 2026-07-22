import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const QUICK_INPUT_TYPES = Object.freeze({
  command: { label: '快捷指令', icon: 'ri-flashlight-line', color: 'brand' },
  context: { label: '背景信息', icon: 'ri-attachment-2', color: 'emerald' },
  format: { label: '输出格式', icon: 'ri-layout-3-line', color: 'amber' },
})

function api() {
  return window.electronAPI?.db?.quickInputs
}

export const useQuickInputsStore = defineStore('quickInputs', () => {
  const items = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  const enabledItems = computed(() => items.value.filter(item => item.enabled))

  async function load() {
    const db = api()
    if (!db) {
      items.value = []
      loaded.value = true
      return []
    }
    loading.value = true
    error.value = ''
    try {
      const result = await db.list()
      items.value = Array.isArray(result) ? result : []
      loaded.value = true
      return items.value
    } catch (err) {
      error.value = err?.message || '快捷输入加载失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    if (loaded.value) return items.value
    return load()
  }

  async function create(data) {
    const result = await api()?.create(data)
    await load()
    return result
  }

  async function update(id, data) {
    const result = await api()?.update(id, data)
    await load()
    return result
  }

  async function remove(id) {
    const result = await api()?.delete(id)
    await load()
    return result
  }

  async function reorder(ids) {
    const result = await api()?.reorder(ids)
    items.value = Array.isArray(result) ? result : items.value
    return items.value
  }

  function reset() {
    items.value = []
    loaded.value = false
    error.value = ''
  }

  return {
    items,
    enabledItems,
    loading,
    loaded,
    error,
    load,
    ensureLoaded,
    create,
    update,
    remove,
    reorder,
    reset,
  }
})
