import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const api = () => window.electronAPI?.wiki

export const useWikiStore = defineStore('wiki', () => {
  const wikis = ref([])
  const currentWikiId = ref('')
  const currentWiki = ref(null)
  const pages = ref([])
  const sources = ref([])
  const currentPagePath = ref('index.md')
  const currentPage = ref(null)
  const jobs = ref([])
  const ocrProviders = ref([])
  const ocrJobs = ref([])
  const loading = ref(false)
  const error = ref('')

  const currentWikiSummary = computed(() =>
    currentWikiId.value
      ? (wikis.value.find(w => w.id === currentWikiId.value) || currentWiki.value || null)
      : null
  )

  const rootPages = computed(() => pages.value.filter(p => p.type === 'root'))
  const contentPages = computed(() => pages.value.filter(p => p.type !== 'root'))

  function clearCurrentWiki() {
    currentWikiId.value = ''
    currentWiki.value = null
    pages.value = []
    sources.value = []
    currentPagePath.value = 'index.md'
    currentPage.value = null
    jobs.value = []
    ocrJobs.value = []
  }

  async function loadWikis() {
    if (!api()) return
    loading.value = true
    error.value = ''
    try {
      const result = await api().list()
      if (!result?.success) throw new Error(result?.error || 'Failed to load wikis')
      wikis.value = result.data || []
      if (currentWikiId.value && !wikis.value.some(w => w.id === currentWikiId.value)) {
        clearCurrentWiki()
      }
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function createWiki(data) {
    if (!api()) throw new Error('Wiki API is not available')
    const result = await api().create(data)
    if (!result?.success) throw new Error(result?.error || 'Failed to create wiki')
    await loadWikis()
    currentWikiId.value = result.data.id
    currentWiki.value = result.data
    return result.data
  }

  async function deleteWiki(id) {
    if (!api()) throw new Error('Wiki API is not available')
    const targetId = id || currentWikiId.value
    if (!targetId) throw new Error('No wiki selected')
    const result = await api().delete(targetId)
    if (!result?.success) throw new Error(result?.error || 'Failed to delete wiki')
    const remaining = wikis.value.filter(w => w.id !== targetId)
    wikis.value = remaining
    if (currentWikiId.value === targetId) {
      clearCurrentWiki()
    }
    await loadWikis()
    if (!currentWikiId.value && wikis.value.length) {
      await openWiki(wikis.value[0].id)
    }
    return result.data
  }

  async function openWiki(id) {
    if (!api() || !id) return
    loading.value = true
    error.value = ''
    try {
      currentWikiId.value = id
      const [wikiResult, pagesResult, sourcesResult, jobsResult, ocrJobsResult] = await Promise.all([
        api().get(id),
        api().listPages(id),
        api().listSources(id),
        api().getJobs(id),
        api().listOcrJobs?.(id),
      ])
      if (!wikiResult?.success) throw new Error(wikiResult?.error || 'Failed to open wiki')
      currentWiki.value = wikiResult.data
      pages.value = pagesResult?.success ? (pagesResult.data || []) : []
      sources.value = sourcesResult?.success ? (sourcesResult.data || []) : []
      jobs.value = jobsResult?.success ? (jobsResult.data || []) : []
      ocrJobs.value = ocrJobsResult?.success ? (ocrJobsResult.data || []) : []
      const firstPage = pages.value.find(p => p.path === currentPagePath.value) || pages.value[0]
      if (firstPage) {
        await readPage(firstPage.path)
      } else {
        currentPagePath.value = 'index.md'
        currentPage.value = null
      }
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function readPage(pagePath) {
    if (!api() || !currentWikiId.value) return
    const result = await api().readPage(currentWikiId.value, pagePath)
    if (!result?.success) throw new Error(result?.error || 'Failed to read wiki page')
    currentPagePath.value = result.data.path
    currentPage.value = result.data
    return result.data
  }

  async function addSource(data) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().addSource(currentWikiId.value, data)
    if (!result?.success) throw new Error(result?.error || 'Failed to add source')
    await openWiki(currentWikiId.value)
    await loadWikis()
    return { ...(result.data || {}), duplicate: !!result.duplicate }
  }

  async function addNoteSource(noteId) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().addNoteSource(currentWikiId.value, noteId)
    if (!result?.success) throw new Error(result?.error || 'Failed to add note source')
    await openWiki(currentWikiId.value)
    await loadWikis()
    return { ...(result.data || {}), duplicate: !!result.duplicate }
  }

  async function reparseSource(sourceId) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().reparseSource(currentWikiId.value, sourceId)
    if (!result?.success) throw new Error(result?.error || 'Failed to reparse source')
    await openWiki(currentWikiId.value)
    await loadWikis()
    return result.data
  }

  async function deleteSource(sourceId) {
    if (!api()?.deleteSource || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().deleteSource(currentWikiId.value, sourceId)
    if (!result?.success) throw new Error(result?.error || 'Failed to delete source')
    await openWiki(currentWikiId.value)
    await loadWikis()
    return result.data
  }

  async function loadOcrProviders() {
    if (!api()?.listOcrProviders) return []
    const result = await api().listOcrProviders()
    if (!result?.success) throw new Error(result?.error || 'Failed to load OCR providers')
    ocrProviders.value = result.data || []
    return ocrProviders.value
  }

  async function saveOcrProvider(data) {
    if (!api()) throw new Error('Wiki API is not available')
    const result = data?.id
      ? await api().updateOcrProvider(data.id, data)
      : await api().createOcrProvider(data)
    if (!result?.success) throw new Error(result?.error || 'Failed to save OCR provider')
    await loadOcrProviders()
    return result.data
  }

  async function deleteOcrProvider(providerId) {
    if (!api()?.deleteOcrProvider) throw new Error('Wiki API is not available')
    const result = await api().deleteOcrProvider(providerId)
    if (!result?.success) throw new Error(result?.error || 'Failed to delete OCR provider')
    await loadOcrProviders()
    return result
  }

  async function runOcr(sourceId, providerId = '') {
    if (!api()?.runOcr || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().runOcr(currentWikiId.value, sourceId, providerId)
    if (!result?.success) throw new Error(result?.error || 'OCR failed')
    await openWiki(currentWikiId.value)
    await loadWikis()
    return result.data
  }

  async function updateAgentConfig(patch) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().updateAgentConfig(currentWikiId.value, patch || {})
    if (!result?.success) throw new Error(result?.error || 'Failed to update Wiki Agent')
    currentWiki.value = result.data
    await loadWikis()
    return result.data
  }

  async function draftWithAgent(request) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const runner = api().agentRun || api().agentDraft
    const result = await runner({
      wikiId: currentWikiId.value,
      ...(request || {}),
    })
    if (!result?.success) throw new Error(result?.error || 'Wiki Agent failed')
    await refreshCurrentWiki()
    return result.data
  }

  async function wikiTool(action, payload = {}) {
    if (!api()?.wikiTool || !currentWikiId.value) throw new Error('No wiki selected')
    const result = await api().wikiTool({
      wikiId: currentWikiId.value,
      action,
      ...(payload || {}),
    })
    if (!result?.success) throw new Error(result?.error || 'Wiki tool failed')
    return result.data
  }

  async function refreshCurrentWiki() {
    if (!currentWikiId.value) return loadWikis()
    await openWiki(currentWikiId.value)
    await loadWikis()
  }

  return {
    wikis,
    currentWikiId,
    currentWiki,
    pages,
    sources,
    currentPagePath,
    currentPage,
    jobs,
    ocrProviders,
    ocrJobs,
    loading,
    error,
    currentWikiSummary,
    rootPages,
    contentPages,
    loadWikis,
    createWiki,
    deleteWiki,
    openWiki,
    readPage,
    addSource,
    addNoteSource,
    reparseSource,
    deleteSource,
    loadOcrProviders,
    saveOcrProvider,
    deleteOcrProvider,
    runOcr,
    updateAgentConfig,
    draftWithAgent,
    wikiTool,
    refreshCurrentWiki,
  }
}, {
  persist: {
    pick: ['currentWikiId', 'currentPagePath'],
  },
})
