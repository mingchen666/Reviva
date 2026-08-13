import { FileContextReader, MAX_LOCAL_FOLLOW_UP_READS } from './FileContextReader.js'
import { GenerationWebContextSearcher, generationWebToolPolicy } from './GenerationWebContextSearcher.js'
import { KnowledgeContextSearcher } from './KnowledgeContextSearcher.js'
import { LocalWikiContextSearcher } from './LocalWikiContextSearcher.js'
import { EvidenceBudget, FOLLOW_UP_EVIDENCE_CALL_LIMIT } from './EvidenceBudget.js'

function retrievalRounds(moduleConfig, fallback = 3) {
  const configured = Number(moduleConfig?.retrieval_iterations || moduleConfig?.max_iterations || fallback)
  return Math.min(3, Math.max(1, Number.isFinite(configured) ? Math.trunc(configured) : fallback))
}

function localFollowUpRounds(moduleConfig) {
  const configured = Number(moduleConfig?.local_follow_up_rounds)
  return Math.min(
    MAX_LOCAL_FOLLOW_UP_READS,
    Math.max(0, Number.isFinite(configured) ? Math.trunc(configured) : MAX_LOCAL_FOLLOW_UP_READS),
  )
}

function hasKnowledgeScope(cloudContext = {}) {
  return !!cloudContext?.baseUrl
    && !!cloudContext?.token
    && ((cloudContext?.defaultKbIds || []).length > 0 || (cloudContext?.defaultDocIds || []).length > 0)
}

function appendEvidence(evidence, updates = {}) {
  return {
    ...evidence,
    ...Object.fromEntries(Object.entries(updates).map(([key, blocks]) => [
      key,
      [...(evidence[key] || []), ...(blocks || [])],
    ])),
  }
}

function sourceCapabilities({ moduleConfig, cloudContext, sourceScope, agentService }) {
  const wikiIds = Array.isArray(sourceScope?.wikiIds) ? sourceScope.wikiIds.filter(Boolean) : []
  const webPolicy = generationWebToolPolicy(moduleConfig)
  return {
    local: false,
    kb: hasKnowledgeScope(cloudContext),
    wiki: wikiIds.length > 0 && !!agentService?._wikiService?.wikiTool,
    web: sourceScope?.web?.enabled === true
      && moduleConfig?.permissions?.webSearch === true
      && webPolicy.canSearch,
  }
}

function availableExternalSources(capabilities) {
  const sources = []
  if (capabilities.kb) sources.push('kb')
  if (capabilities.wiki) sources.push('wiki')
  // Web is supplementary, but it is still an explicit user choice. Do not
  // silently disable it merely because local or selected knowledge sources
  // already returned content.
  if (capabilities.web) sources.push('web')
  return sources
}

export class EvidenceCollector {
  constructor({ db, workDirService, agentService, emitProgress }) {
    this._emitProgress = emitProgress
    this._agentService = agentService
    this._fileReader = new FileContextReader({
      db,
      workDirService,
      getMediaQueryService: () => agentService?.getMediaQueryService?.() || null,
    })
    this._knowledgeSearcher = new KnowledgeContextSearcher({ emitProgress })
    this._wikiSearcher = new LocalWikiContextSearcher({ agentService, emitProgress })
    this._webSearcher = new GenerationWebContextSearcher({ agentService, emitProgress })
  }

  async collect({
    task,
    toolId,
    moduleConfig,
    topic,
    params = {},
    ctxItems,
    cloudContext,
    sourceScope,
    toolProviderConfigs = {},
    abortController,
    includeExternalSources = false,
  }) {
    const abortSignal = abortController?.signal
    const configuredRounds = retrievalRounds(moduleConfig)
    const budget = new EvidenceBudget({
      limit: moduleConfig?.follow_up_evidence_call_limit || FOLLOW_UP_EVIDENCE_CALL_LIMIT,
    })
    const capabilities = sourceCapabilities({ moduleConfig, cloudContext, sourceScope, agentService: this._agentService })

    if (!includeExternalSources) {
      capabilities.kb = false
      capabilities.wiki = false
      capabilities.web = false
    }

    this._emitProgress?.(task.id, 20, '读取参考资料...')
    const fileRead = await this._fileReader.read(ctxItems, { topic })
    const fileBlocks = Array.isArray(fileRead) ? fileRead : (fileRead?.blocks || [])
    const mediaWarnings = Array.isArray(fileRead?.warnings) ? fileRead.warnings : []
    const localSources = Array.isArray(fileRead?.localSources) ? fileRead.localSources : []
    capabilities.local = localSources.some(source => !source.exhausted && source.next)

    if (mediaWarnings.length) {
      const names = mediaWarnings.slice(0, 2).map(item => item.name).filter(Boolean).join('、')
      const suffix = mediaWarnings.length > 2 ? ` 等 ${mediaWarnings.length} 个媒体` : ''
      this._emitProgress?.(task.id, 24, `${names || '选中的媒体'}${suffix}暂不可读，已跳过。`)
    }

    let evidence = {
      fileBlocks,
      kbBlocks: [],
      wikiBlocks: [],
      webBlocks: [],
      mediaWarnings,
      localSources: this._fileReader.catalog(localSources),
    }

    // A fair local pass is always attempted before external retrieval. Keep a
    // small reserve for selected KB/Wiki/Web so a large document set cannot
    // silently starve explicitly selected remote sources.
    const externalSources = includeExternalSources
      ? availableExternalSources(capabilities)
      : []
    const reserve = Math.min(budget.remaining, externalSources.length * configuredRounds)
    let localCalls = 0
    let localRoundsCompleted = 0
    for (let round = 0; round < localFollowUpRounds(moduleConfig) && !abortSignal?.aborted; round += 1) {
      let progressed = false
      for (const source of localSources) {
        if (abortSignal?.aborted || source.exhausted || !source.next) continue
        if (budget.remaining <= reserve) break
        if (!budget.take(1, { action: 'local_follow_up', sourceId: source.sourceId, phase: 'local' })) break
        localCalls += 1
        const result = await this._fileReader.readFollowUp(source, { abortSignal })
        if (result.success && result.block) {
          evidence = appendEvidence(evidence, { fileBlocks: [result.block] })
          progressed = true
          budget.record({ action: 'local_follow_up', sourceId: source.sourceId, range: result.range || null, outcome: 'completed' })
        } else {
          budget.record({ action: 'local_follow_up', sourceId: source.sourceId, outcome: 'skipped', warning: result.warning || result.reason || '' })
        }
      }
      evidence.localSources = this._fileReader.catalog(localSources)
      capabilities.local = localSources.some(source => !source.exhausted && source.next)
      localRoundsCompleted = round + 1
      if (!progressed) break
    }

    if (includeExternalSources) {
      this._emitProgress?.(task.id, 40, '检索已选知识来源...')
      const rounds = retrievalRounds(moduleConfig)
      const queryOffset = 0
      const runExternal = async (kind, searcher, progressStart, extra = {}) => {
        if (!capabilities[kind] || abortSignal?.aborted || budget.remaining <= 0) return
        const requested = Math.min(rounds, budget.remaining)
        if (!budget.take(requested, { action: `initial_${kind}`, phase: kind })) return
        let blocks = []
        try {
          blocks = await searcher.search({
            taskId: task.id,
            toolId,
            moduleConfig,
            topic,
            ctxItems,
            cloudContext,
            sourceScope,
            abortSignal,
            queryOffset,
            maxRounds: requested,
            toolProviderConfigs,
            progressStart,
            ...extra,
          })
        } catch (error) {
          budget.record({ action: `initial_${kind}`, phase: kind, outcome: 'failed', warning: error?.message || String(error) })
          return
        }
        evidence = appendEvidence(evidence, { [`${kind}Blocks`]: blocks })
        budget.record({ action: `initial_${kind}`, phase: kind, count: requested, outcome: 'completed' })
      }

      // Knowledge base and Wiki are selected sources, so they are always
      // queried when configured. Web is also queried when the user explicitly
      // enabled it; its lower priority is represented in the final context
      // pack, rather than by silently omitting it here.
      await runExternal('kb', this._knowledgeSearcher, 42)
      await runExternal('wiki', this._wikiSearcher, 54)
      await runExternal('web', this._webSearcher, 66)
    }

    // Spend any remaining calls on later local continuations, still in fair
    // round-robin order. This is deterministic and never asks another model
    // to choose a source.
    for (let round = localRoundsCompleted; round < localFollowUpRounds(moduleConfig) && !abortSignal?.aborted; round += 1) {
      let progressed = false
      for (const source of localSources) {
        if (abortSignal?.aborted || source.exhausted || !source.next || budget.remaining <= 0) continue
        if (!budget.take(1, { action: 'local_follow_up', sourceId: source.sourceId, phase: 'local_late' })) continue
        localCalls += 1
        const result = await this._fileReader.readFollowUp(source, { abortSignal })
        if (result.success && result.block) {
          evidence = appendEvidence(evidence, { fileBlocks: [result.block] })
          progressed = true
          budget.record({ action: 'local_follow_up', sourceId: source.sourceId, range: result.range || null, outcome: 'completed' })
        } else {
          budget.record({ action: 'local_follow_up', sourceId: source.sourceId, outcome: 'skipped', warning: result.warning || result.reason || '' })
        }
      }
      evidence.localSources = this._fileReader.catalog(localSources)
      capabilities.local = localSources.some(source => !source.exhausted && source.next)
      if (!progressed) break
    }

    evidence.localSources = this._fileReader.catalog(localSources)
    evidence.evidenceAudit = {
      ...budget.audit(),
      localCalls,
      retrievalRounds: configuredRounds,
      retrievalStrategy: 'deterministic',
      capabilities,
    }
    return evidence
  }
}
