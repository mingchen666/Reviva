import { kbSearch, resetTaskCounters, setCloudContext } from '../agents/langchainTools.js'

const DEFAULT_KB_SEARCH_MODES = ['vector', 'fulltext', 'graph', 'summary']

export class KnowledgeContextSearcher {
  constructor({ emitProgress }) {
    this._emitProgress = emitProgress
  }

  async search({ taskId, toolId, moduleConfig, topic, ctxItems, cloudContext, abortSignal }) {
    setCloudContext(cloudContext || {})
    resetTaskCounters()

    const selectedKbIds = cloudContext?.defaultKbIds || []
    const selectedDocIds = cloudContext?.defaultDocIds || []
    if (!cloudContext?.baseUrl || !cloudContext?.token || (!selectedKbIds.length && !selectedDocIds.length)) {
      return []
    }

    const queries = this._buildKnowledgeQueries(toolId, topic, ctxItems)
    const maxRounds = Math.min(
      queries.length,
      Math.max(1, Number(moduleConfig.retrieval_iterations || moduleConfig.max_iterations || 2)),
    )
    const blocks = []
    for (let i = 0; i < maxRounds; i++) {
      if (abortSignal?.aborted) break
      const query = queries[i]
      this._emitProgress?.(taskId, 36 + i * 4, `检索知识库 ${i + 1}/${maxRounds}...`)
      try {
        const raw = await kbSearch.invoke({
          query,
          top_k: this._topK(toolId),
          search_modes: this._searchModes(toolId),
          rerank: true,
        })
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (parsed?.status !== 'ok') continue
        const content = this._formatKnowledgeResult(parsed)
        if (content) blocks.push({ query, content })
      } catch (err) {
        console.warn('[KnowledgeContextSearcher] kb search skipped:', err?.message || err)
      }
    }
    return blocks
  }

  _buildKnowledgeQueries(toolId, topic, ctxItems) {
    const ctxNames = (ctxItems || []).map(i => i?.name || i?.path).filter(Boolean).slice(0, 5).join(' ')
    const base = (topic || ctxNames || '').trim()
    const fallbackByTool = {
      graph: '知识图谱 实体 关系 抽取',
      flashcard: '闪卡 主动回忆 核心概念 易混点',
      quiz: '测验 练习题 答案解析 考点',
      chart: '图表 可视化 信息图 数据洞察 结构关系',
      mindmap: '思维导图 核心概念 层级结构',
    }
    const fallback = fallbackByTool[toolId] || '核心概念 关键要点 总结'
    const seed = base || fallback
    const queriesByTool = {
      graph: [
        seed,
        `${seed} 主要实体 关系`,
        `${seed} 概念 事件 组织 人物 影响`,
      ],
      flashcard: [
        seed,
        `${seed} 定义 公式 概念 对比 易混点`,
        `${seed} 主动回忆 问答 关键事实`,
      ],
      quiz: [
        seed,
        `${seed} 考点 练习题 易错点`,
        `${seed} 概念理解 应用 判断 答案解析`,
      ],
      chart: [
        seed,
        `${seed} 关键数据 对比 趋势 时间线 流程`,
        `${seed} 可视化 信息图 结构 关系 洞察`,
      ],
    }
    const queries = queriesByTool[toolId] || [
      seed,
      `${seed} 核心概念 分类 层级`,
      `${seed} 关键要点 结构 总结`,
    ]
    return [...new Set(queries.map(q => q.trim()).filter(Boolean))]
  }

  _topK(toolId) {
    return 5
  }

  _searchModes(toolId) {
    return DEFAULT_KB_SEARCH_MODES
  }

  _formatKnowledgeResult(payload) {
    const result = payload?.result
    if (!result) return ''
    if (typeof result === 'string') return result.slice(0, 5000)
    const candidates = Array.isArray(result) ? result
      : Array.isArray(result.items) ? result.items
        : Array.isArray(result.results) ? result.results
          : Array.isArray(result.hits) ? result.hits
            : Array.isArray(result.chunks) ? result.chunks
              : []
    if (candidates.length) {
      return candidates.slice(0, 8).map((item, idx) => {
        const title = item.title || item.name || item.doc_title || item.document_title || item.source || `片段 ${idx + 1}`
        const text = item.content || item.text || item.snippet || item.summary || item.chunk || JSON.stringify(item)
        const score = item.score || item.similarity || item.rank_score || ''
        return `- ${title}${score ? `（score: ${score}）` : ''}: ${String(text).slice(0, 700)}`
      }).join('\n')
    }
    try {
      return JSON.stringify(result).slice(0, 5000)
    } catch (_) {
      return String(result).slice(0, 5000)
    }
  }
}
