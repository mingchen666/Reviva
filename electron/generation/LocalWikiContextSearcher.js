function sourceSeed(sourceScope = {}) {
  const names = (Array.isArray(sourceScope?.wikiRefs) ? sourceScope.wikiRefs : [])
    .map(item => String(item?.name || item?.id || '').trim())
    .filter(Boolean)
  return [...new Set(names)].slice(0, 3).join(' ')
}

function buildQueries(toolId, topic, sourceScope) {
  const seed = String(topic || '').trim() || sourceSeed(sourceScope) || '核心概念 重点 内容概览'
  const suffixes = {
    qa: ['常见问题 定义 原因 步骤 易错点', '核心概念 为什么 如何'],
    glossary: ['专业术语 缩写 定义 别名 易混概念', '关键词 概念解释'],
    cheatsheet: ['公式 关键数据 步骤 易错点 速查', '重点 规则 边界条件'],
  }
  return [...new Set([seed, ...(suffixes[toolId] || []).map(suffix => `${seed} ${suffix}`)])]
}

function retrievalRounds(moduleConfig, maxRounds = 3) {
  const configured = Number(moduleConfig?.retrieval_iterations)
  const requested = Number.isFinite(configured) ? Math.trunc(configured) : 2
  return Math.min(maxRounds, Math.max(2, requested))
}

function normalizeRequestedQueries(value) {
  const seen = new Set()
  return (Array.isArray(value) ? value : [])
    .map(query => String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180))
    .filter(query => {
      if (!query || seen.has(query)) return false
      seen.add(query)
      return true
    })
    .slice(0, 2)
}

export class LocalWikiContextSearcher {
  constructor({ agentService, emitProgress }) {
    this._agentService = agentService
    this._emitProgress = emitProgress
  }

  async search({ taskId, toolId, moduleConfig, topic, sourceScope, abortSignal, queries: requestedQueries, queryOffset = 0, maxRounds: requestedRounds, progressStart = 41 }) {
    const wikiIds = Array.isArray(sourceScope?.wikiIds) ? sourceScope.wikiIds.filter(Boolean) : []
    const wikiService = this._agentService?._wikiService
    if (!wikiIds.length || !wikiService?.wikiTool) return []

    const plannedQueries = normalizeRequestedQueries(requestedQueries)
    const allQueries = plannedQueries.length ? plannedQueries : buildQueries(toolId, topic, sourceScope)
    const availableRounds = Math.min(allQueries.length, retrievalRounds(moduleConfig))
    const offset = Math.min(availableRounds, Math.max(0, Math.trunc(Number(queryOffset) || 0)))
    const rounds = Number.isFinite(Number(requestedRounds))
      ? Math.max(1, Math.trunc(Number(requestedRounds)))
      : availableRounds - offset
    const queries = allQueries.slice(offset, Math.min(availableRounds, offset + rounds))
    const blocks = []

    for (const [index, query] of queries.entries()) {
      if (abortSignal?.aborted) break
      const roundIndex = offset + index
      this._emitProgress?.(taskId, progressStart + index * 4, `检索本地 Wiki ${roundIndex + 1}/${availableRounds}...`)
      try {
        const result = await wikiService.wikiTool({
          action: 'query_wikis',
          query,
          wikiIds,
          allowedWikiIds: wikiIds,
          wikiContext: { enabled: true, mode: 'selected', wikiIds },
          enforceWikiSelection: true,
          limit: 6,
          maxChars: 7000,
        })
        const content = String(result?.data?.context || '').trim()
        if (result?.success && content) blocks.push({ query, content: content.slice(0, 7000) })
      } catch (error) {
        console.warn('[LocalWikiContextSearcher] wiki search skipped:', error?.message || error)
      }
    }
    return blocks
  }
}
