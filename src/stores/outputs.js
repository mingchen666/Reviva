import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const outputsApi = () => window.electronAPI?.outputs
const dbApi = () => window.electronAPI?.db?.outputs

export const useOutputsStore = defineStore('outputs', () => {
  const agents = ref([])
  const dateFilesCache = ref({})
  const dbOutputs = ref([])
  const loaded = ref(false)
  const loading = ref(false)

  const totalFiles = computed(() => {
    let count = 0
    for (const agent of agents.value) {
      for (const d of agent.dates) count += d.fileCount
    }
    return count
  })

  const agentNames = computed(() => agents.value.map(a => ({ name: a.name, displayName: a.displayName })))

  async function scanAll() {
    if (!outputsApi()) return
    loading.value = true
    try {
      agents.value = await outputsApi().scanAll()
      loaded.value = true
    } catch (e) {
      console.error('Failed to scan outputs:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadDateFiles(agentDirName, date) {
    const cacheKey = `${agentDirName}:${date}`
    if (dateFilesCache.value[cacheKey]) return dateFilesCache.value[cacheKey]
    if (!outputsApi()) return []

    try {
      const files = await outputsApi().scanDateFiles(agentDirName, date)
      dateFilesCache.value[cacheKey] = files
      return files
    } catch (e) {
      console.error('Failed to scan date files:', e)
      return []
    }
  }

  async function readFileContent(virtualPath) {
    if (!outputsApi()) return null
    try {
      const result = await outputsApi().readFile(virtualPath)
      return result.success ? result.data : null
    } catch (e) {
      console.error('Failed to read output file:', e)
      return null
    }
  }

  async function refreshAll() {
    dateFilesCache.value = {}
    await scanAll()
  }

  async function refreshAgent(agentDirName) {
    delete dateFilesCache.value[Object.keys(dateFilesCache.value).find(k => k.startsWith(agentDirName + ':'))]
    await scanAll()
  }

  async function loadDbOutputs() {
    if (!dbApi()) return
    try {
      dbOutputs.value = await dbApi().list()
    } catch { /* ignore */ }
  }

  function getDbMeta(filePath) {
    if (!filePath) return null
    return dbOutputs.value.find(o => o.file_path === filePath) || null
  }

  return {
    agents, dateFilesCache, dbOutputs, loaded, loading,
    totalFiles, agentNames,
    scanAll, loadDateFiles, readFileContent, refreshAll, refreshAgent, loadDbOutputs, getDbMeta,
  }
})
