import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { matchSourceExtractLocation } from '../utils/wikiSourceExtract.js'

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
  const lintReport = ref(null)
  const semanticAudit = ref(null)
  const proposals = ref([])
  const evaluationSet = ref(null)
  const evaluation = ref(null)
  const evaluationHealth = ref(null)
  const sourceExtract = shallowRef(null)
  const loading = ref(false)
  const error = ref('')
  let selectionVersion = 0
  let openRequest = 0
  let pageRequest = 0
  const scopedRequests = new Map()

  const selection = () => ({ id: currentWikiId.value, version: selectionVersion })
  const isCurrent = scope => scope.id === currentWikiId.value && scope.version === selectionVersion
  function beginScopedRequest(name) {
    const request = { ...selection(), sequence: (scopedRequests.get(name) || 0) + 1 }
    scopedRequests.set(name, request.sequence)
    return request
  }
  const isLatest = (name, request) => isCurrent(request) && scopedRequests.get(name) === request.sequence

  const currentWikiSummary = computed(() =>
    currentWikiId.value
      ? (currentWiki.value?.id === currentWikiId.value ? currentWiki.value : (wikis.value.find(w => w.id === currentWikiId.value) || null))
      : null
  )

  const rootPages = computed(() => pages.value.filter(p => p.type === 'root'))
  const contentPages = computed(() => pages.value.filter(p => p.type !== 'root'))

  function resetWikiData() {
    closeSourceExtract()
    currentWiki.value = null
    pages.value = []
    sources.value = []
    currentPagePath.value = 'index.md'
    currentPage.value = null
    jobs.value = []
    ocrJobs.value = []
    lintReport.value = null
    semanticAudit.value = null
    proposals.value = []
    evaluationSet.value = null
    evaluation.value = null
    evaluationHealth.value = null
  }

  function clearCurrentWiki() {
    selectionVersion += 1
    openRequest += 1
    pageRequest += 1
    currentWikiId.value = ''
    resetWikiData()
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
    selectionVersion += 1
    resetWikiData()
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
    if (currentWikiId.value !== id) {
      selectionVersion += 1
      pageRequest += 1
      resetWikiData()
    }
    currentWikiId.value = id
    const scope = selection()
    const request = ++openRequest
    const active = () => isCurrent(scope) && request === openRequest
    loading.value = true
    error.value = ''
    try {
      const [wikiResult, pagesResult, sourcesResult, jobsResult, ocrJobsResult, lintResult, semanticAuditResult] = await Promise.all([
        api().get(id),
        api().listPages(id),
        api().listSources(id),
        api().getJobs(id),
        api().listOcrJobs?.(id),
        api().getLintReport?.(id),
        api().getSemanticAudit?.(id),
      ])
      if (!active()) return
      if (!wikiResult?.success) throw new Error(wikiResult?.error || 'Failed to open wiki')
      currentWiki.value = wikiResult.data
      pages.value = pagesResult?.success ? (pagesResult.data || []) : []
      sources.value = sourcesResult?.success ? (sourcesResult.data || []) : []
      jobs.value = jobsResult?.success ? (jobsResult.data || []) : []
      ocrJobs.value = ocrJobsResult?.success ? (ocrJobsResult.data || []) : []
      lintReport.value = lintResult?.success ? (lintResult.data || null) : null
      semanticAudit.value = semanticAuditResult?.success ? (semanticAuditResult.data || null) : null
      void listProposals('pending_review,confirmed').catch(() => {})
      void getEvaluation().catch(() => {})
      const firstPage = pages.value.find(p => p.path === currentPagePath.value) || pages.value[0]
      if (firstPage) {
        await readPage(firstPage.path)
      } else {
        currentPagePath.value = 'index.md'
        currentPage.value = null
      }
    } catch (err) {
      if (active()) error.value = err.message
    } finally {
      if (active()) loading.value = false
    }
  }

  async function readPage(pagePath) {
    if (!api() || !currentWikiId.value) return
    const scope = selection()
    const request = ++pageRequest
    const result = await api().readPage(scope.id, pagePath)
    if (!isCurrent(scope) || request !== pageRequest) return
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
    const scope = selection()
    const result = await api().updateAgentConfig(scope.id, patch || {})
    if (!result?.success) throw new Error(result?.error || 'Failed to update Wiki Agent')
    if (isCurrent(scope)) currentWiki.value = result.data
    await loadWikis()
    return result.data
  }

  async function draftWithAgent(request) {
    if (!api() || !currentWikiId.value) throw new Error('No wiki selected')
    const wikiId = currentWikiId.value
    const runner = api().agentRun || api().agentDraft
    try {
      const result = await runner({ ...(request || {}), wikiId })
      if (!result?.success) throw new Error(result?.error || 'Wiki Agent failed')
      return result.data
    } finally {
      // Partial writes and failure diagnostics must be visible even when the run fails.
      if (currentWikiId.value === wikiId) await refreshCurrentWiki()
    }
  }

  async function wikiTool(action, payload = {}, wikiId = currentWikiId.value) {
    if (!api()?.wikiTool || !wikiId) throw new Error('No wiki selected')
    const result = await api().wikiTool({
      ...(payload || {}),
      wikiId,
      action,
    })
    if (!result?.success) throw new Error(result?.error || 'Wiki tool failed')
    return result.data
  }

  function closeSourceExtract() {
    scopedRequests.set('sourceExtract', (scopedRequests.get('sourceExtract') || 0) + 1)
    sourceExtract.value = null
  }

  async function openSourceExtract(sourceId, location = null) {
    const request = beginScopedRequest('sourceExtract')
    const source = sources.value.find(item => item.id === sourceId) || null
    sourceExtract.value = { wikiId: request.id, sourceId, source, status: 'loading', content: '', error: '', location: null, requestedLocation: location }
    try {
      if (!request.id) throw new Error('请先选择 Wiki')
      if (typeof sourceId !== 'string' || !sourceId.trim() || sourceId.length > 512 || /[\x00-\x1f\x7f]/.test(sourceId)) throw new Error('来源 ID 无效')
      const data = await wikiTool('read_source', { sourceId }, request.id)
      if (!isLatest('sourceExtract', request)) return null
      if (data?.wiki_id !== request.id || data?.source?.id !== sourceId || (data.source.wiki_id && data.source.wiki_id !== request.id)) throw new Error('来源不属于当前 Wiki')
      if (typeof data.content !== 'string') throw new Error('来源摘录返回格式无效')
      const target = matchSourceExtractLocation(location, data.source, data.content.split(/\r?\n/).length)
      sourceExtract.value = {
        wikiId: request.id, sourceId, source: data.source, content: data.content,
        status: data.content.trim() ? 'ready' : 'empty', error: '', location: target,
        requestedLocation: location,
        locationWarning: location && !target ? '引用位置与当前摘录不匹配，已打开全文。' : '',
      }
      return data
    } catch (err) {
      if (isLatest('sourceExtract', request)) sourceExtract.value = { ...sourceExtract.value, status: 'error', error: err.message || '读取来源摘录失败' }
      return null
    }
  }

  async function listProposals(status = 'pending_review') {
    const request = beginScopedRequest('proposals')
    const data = await wikiTool('list_proposals', { status }, request.id)
    if (isLatest('proposals', request)) proposals.value = (data || []).filter(item => !item.wiki_id || item.wiki_id === request.id)
    return data || []
  }

  async function getProposal(proposalId) {
    if (!proposalId) throw new Error('Proposal ID is required')
    return wikiTool('get_proposal', { proposalId })
  }

  async function reviewProposal(proposalId, status) {
    const scope = selection()
    const proposal = await wikiTool('review_proposal', {
      proposalId,
      status,
      confirmedBy: 'user',
    }, scope.id)
    if (!isCurrent(scope)) return proposal
    const index = proposals.value.findIndex(item => item.proposal_id === proposalId)
    if (index >= 0) proposals.value.splice(index, 1, proposal)
    return proposal
  }

  async function applyProposal(proposalId, expectedLifecycleVersion) {
    const scope = selection()
    const result = await wikiTool('apply_proposal', {
      proposalId,
      confirmedBy: 'user',
      expectedLifecycleVersion,
    }, scope.id)
    if (!isCurrent(scope)) return result
    const index = proposals.value.findIndex(item => item.proposal_id === proposalId)
    if (index >= 0 && result?.proposal) proposals.value.splice(index, 1, result.proposal)
    await refreshCurrentWiki()
    return result
  }

  async function getEvaluationSet() {
    const request = beginScopedRequest('evaluationSet')
    const data = await wikiTool('get_evaluation_set', {}, request.id)
    if (isLatest('evaluationSet', request)) evaluationSet.value = data
    return data
  }

  async function runEvaluation(options = {}) {
    const request = beginScopedRequest('evaluation')
    const data = await wikiTool('run_evaluation', options, request.id)
    if (isLatest('evaluation', request)) evaluation.value = data
    return data
  }

  async function getEvaluation() {
    const request = beginScopedRequest('evaluation')
    let report = null
    try {
      report = await wikiTool('get_evaluation', { health: false }, request.id)
    } catch (err) {
      if (!/Evaluation report is missing/.test(err.message || '')) throw err
    }
    if (!isLatest('evaluation', request)) return report
    evaluation.value = report
    evaluationHealth.value = null
    try {
      const health = await wikiTool('get_evaluation', { health: true }, request.id)
      if (isLatest('evaluation', request)) evaluationHealth.value = health
    } catch {
      if (isLatest('evaluation', request)) evaluationHealth.value = null
    }
    return report
  }

  async function runLint() {
    if (!api()?.runLint || !currentWikiId.value) throw new Error('No wiki selected')
    const request = beginScopedRequest('lint')
    const result = await api().runLint(request.id)
    if (!result?.success) throw new Error(result?.error || 'Wiki lint failed')
    if (isLatest('lint', request)) lintReport.value = result.data || null
    return result.data
  }

  async function runSemanticAudit() {
    if (!api()?.runSemanticAudit || !currentWikiId.value) throw new Error('No wiki selected')
    const request = beginScopedRequest('audit')
    const result = await api().runSemanticAudit(request.id)
    if (!result?.success) throw new Error(result?.error || 'Semantic audit failed')
    if (isLatest('audit', request)) semanticAudit.value = result.data || null
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
    lintReport,
    semanticAudit,
    proposals,
    evaluationSet,
    evaluation,
    evaluationHealth,
    sourceExtract,
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
    openSourceExtract,
    closeSourceExtract,
    listProposals,
    getProposal,
    reviewProposal,
    applyProposal,
    getEvaluationSet,
    runEvaluation,
    getEvaluation,
    runLint,
    runSemanticAudit,
    refreshCurrentWiki,
  }
}, {
  persist: {
    pick: ['currentWikiId', 'currentPagePath'],
  },
})
