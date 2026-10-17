import { ref } from 'vue'

const WEB_IMPORT_PAGE_SIZE = 10

export function useWebImport({ currentPath, msg }) {
  const api = () => window.electronAPI

  const webImportSettings = ref(null)
  const webImportProviders = ref([])
  const webImportJobs = ref([])
  const webImportSubmitting = ref(false)
  const remoteMediaSubmitting = ref(false)
  const remoteMediaError = ref('')
  const webImportJobsLoading = ref(false)
  const webImportJobsHasMore = ref(false)
  let webImportJobsRequestId = 0

  async function loadWebImportSettings() {
    try {
      const result = await api()?.webImport?.getSettings?.()
      if (result?.success) {
        webImportSettings.value = result.data
        webImportProviders.value = result.providers || []
      }
    } catch (e) { console.warn('[Docs] load web import settings failed:', e) }
  }

  async function saveWebImportSettings(patch, close) {
    try {
      const result = await api()?.webImport?.saveSettings?.(patch)
      if (!result?.success) throw new Error(result?.error || result?.message || '网页解析配置保存失败')
      webImportSettings.value = result.data
      webImportProviders.value = result.providers || webImportProviders.value
      close?.()
      msg.success('网页解析配置已保存')
    } catch (error) {
      msg.error(error?.message || '网页解析配置保存失败')
    }
  }

  async function loadWebImportJobs({ reset = true } = {}) {
    if (webImportJobsLoading.value && !reset) return
    const requestId = reset ? ++webImportJobsRequestId : webImportJobsRequestId
    const targetRef = currentPath.value
    webImportJobsLoading.value = true
    try {
      const offset = reset ? 0 : webImportJobs.value.length
      const result = await api()?.webImport?.listJobs?.({
        targetType: 'docs',
        targetRef,
        limit: WEB_IMPORT_PAGE_SIZE + 1,
        offset,
      })
      if (requestId !== webImportJobsRequestId || targetRef !== currentPath.value) return
      const page = result?.success ? (result.data || []) : []
      const records = page.slice(0, WEB_IMPORT_PAGE_SIZE)
      webImportJobsHasMore.value = page.length > WEB_IMPORT_PAGE_SIZE
      if (reset) {
        webImportJobs.value = records
      } else {
        const existingIds = new Set(webImportJobs.value.map(item => item.id))
        webImportJobs.value.push(...records.filter(item => !existingIds.has(item.id)))
      }
    } catch (error) {
      console.warn('[Docs] load web import jobs failed:', error)
      if (reset && requestId === webImportJobsRequestId) {
        webImportJobs.value = []
        webImportJobsHasMore.value = false
      }
    } finally {
      if (requestId === webImportJobsRequestId) webImportJobsLoading.value = false
    }
  }

  async function retryWebImportJob(id) {
    await api()?.webImport?.retryJob?.(id)
    await loadWebImportJobs({ reset: true })
  }

  async function deleteWebImportJob(id) {
    await api()?.webImport?.deleteJob?.(id)
    await loadWebImportJobs({ reset: true })
  }

  async function clearWebImportJobs() {
    await api()?.webImport?.clearFinishedJobs?.({ targetType: 'docs', targetRef: currentPath.value })
    await loadWebImportJobs({ reset: true })
  }

  function handleJobUpdated(job) {
    if (job?.target_type !== 'docs' || job.target_ref !== currentPath.value) return false
    const index = webImportJobs.value.findIndex(item => item.id === job.id)
    if (index >= 0) webImportJobs.value[index] = job
    else webImportJobs.value.unshift(job)
    return ['succeeded', 'partial'].includes(job.status)
  }

  return {
    webImportSettings,
    webImportProviders,
    webImportJobs,
    webImportSubmitting,
    remoteMediaSubmitting,
    remoteMediaError,
    webImportJobsLoading,
    webImportJobsHasMore,
    loadWebImportSettings,
    saveWebImportSettings,
    loadWebImportJobs,
    retryWebImportJob,
    deleteWebImportJob,
    clearWebImportJobs,
    handleJobUpdated,
  }
}
