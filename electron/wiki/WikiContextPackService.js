import path from 'node:path'

const DEFAULT_TOKEN_BUDGET = 6000
const MAX_TOKEN_BUDGET = 32000
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_NEIGHBOR_DEPTH = 2

const DEFAULT_INCLUDES = ['passages', 'pages', 'sources', 'citations', 'neighbors']

function clampInt(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.round(parsed), min), max)
}

function normalizeMode(value) {
  const mode = String(value || 'auto').toLowerCase()
  return ['fast', 'deep', 'auto'].includes(mode) ? mode : 'auto'
}

function normalizeIncludes(value) {
  const requested = Array.isArray(value) ? value.map(String) : []
  const includes = new Set(requested.length ? requested : DEFAULT_INCLUDES)
  return [...includes].filter(item => DEFAULT_INCLUDES.includes(item))
}

function hasUsefulResults(results) {
  return results.filter(result => Number(result.score || 0) > 0).length >= 2
}

function needsDeepResults(query, results) {
  return !hasUsefulResults(results) || /conflict|conflicting|矛盾|冲突/i.test(String(query || ''))
}

function citationFor(passage) {
  const citation = {
    type: 'passage',
    passage_id: passage.passage_id,
    page_path: passage.page_path,
    heading_path: passage.heading_path || [],
    start_line: passage.start_line,
    end_line: passage.end_line,
    source_id: passage.source_id || '',
    pdf_page: passage.pdf_page || null,
  }
  if (passage.source_id) {
    citation.media_id = passage.media_id || ''
    citation.media_type = passage.media_type || ''
    citation.run_id = passage.run_id || ''
    citation.time_range_ms = passage.time_range_ms || null
  }
  return citation
}

function formatPassage(passage, rank, reason = 'fast_search') {
  return {
    passage_id: passage.passage_id,
    wiki_id: passage.wiki_id,
    kind: passage.kind,
    source_id: passage.source_id || '',
    page_path: passage.page_path,
    heading_path: passage.heading_path || [],
    start_line: passage.start_line,
    end_line: passage.end_line,
    pdf_page: passage.pdf_page || null,
    media_id: passage.media_id || '',
    media_type: passage.media_type || '',
    run_id: passage.run_id || '',
    time_range_ms: passage.time_range_ms || null,
    text: passage.text,
    token_estimate: passage.token_estimate || 0,
    score: Number(passage.score || 0),
    rank,
    reason,
    citation: citationFor(passage),
  }
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isDuplicatePassage(passage, existing) {
  const text = normalizedText(passage.text)
  return existing.some(item => item.passage_id === passage.passage_id || normalizedText(item.text) === text)
}

function buildNeighborEdges(passage, allPassages, maxDepth) {
  const byPath = new Map()
  for (const item of allPassages) {
    if (!byPath.has(item.page_path)) byPath.set(item.page_path, [])
    byPath.get(item.page_path).push(item)
  }
  for (const passages of byPath.values()) {
    passages.sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line)
  }

  const links = [...String(passage.text || '').matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)]
    .map(match => match[1])
    .filter(Boolean)
  const headingKey = (passage.heading_path || []).join(' / ').toLowerCase()
  const sourceIds = passage.source_id ? [passage.source_id] : []

  const edges = []
  const samePath = byPath.get(passage.page_path) || []
  const index = samePath.findIndex(item => item.passage_id === passage.passage_id)
  for (const offset of [-1, 1]) {
    const neighbor = samePath[index + offset]
    if (neighbor) {
      edges.push({
        from_passage_id: passage.passage_id,
        to_passage_id: neighbor.passage_id,
        relation: offset < 0 ? 'same_file_previous' : 'same_file_next',
        depth: 1,
      })
    }
  }
  for (const link of links) {
    const rawPath = link.split('#')[0]
    if (!rawPath) continue
    const targetPath = path.posix.normalize(path.posix.join(
      path.posix.dirname(passage.page_path),
      rawPath,
    ))
    for (const item of (byPath.get(targetPath) || [])) {
      edges.push({
        from_passage_id: passage.passage_id,
        to_passage_id: item.passage_id,
        relation: 'markdown_link',
        depth: 1,
      })
    }
  }
  for (const sourceId of sourceIds) {
    for (const item of allPassages.filter(candidate => candidate.source_id === sourceId)) {
      if (item.page_path === passage.page_path) continue
      edges.push({
        from_passage_id: passage.passage_id,
        to_passage_id: item.passage_id,
        relation: 'source_overlap',
        depth: 1,
      })
    }
  }
  for (const item of allPassages) {
    if (item.passage_id === passage.passage_id || item.page_path === passage.page_path) continue
    const itemHeadingKey = (item.heading_path || []).join(' / ').toLowerCase()
    if (headingKey && itemHeadingKey && (headingKey.endsWith(itemHeadingKey) || itemHeadingKey.endsWith(headingKey))) {
      edges.push({
        from_passage_id: passage.passage_id,
        to_passage_id: item.passage_id,
        relation: 'heading_path',
        depth: 1,
      })
    }
  }

  return dedupeEdges(edges).slice(0, Math.max(maxDepth * 12, 12))
}

function dedupeEdges(edges) {
  const seen = new Set()
  const output = []
  for (const edge of edges) {
    const key = `${edge.from_passage_id}:${edge.to_passage_id}:${edge.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(edge)
  }
  return output
}

function collectPassages(passageIds, passagesById, maxDepth = 1) {
  const edges = []
  const selectedIds = new Set(passageIds)
  const neighborIds = new Set()
  for (const passageId of passageIds) {
    const passage = passagesById.get(passageId)
    if (!passage) continue
    for (const edge of buildNeighborEdges(passage, [...passagesById.values()], maxDepth)) {
      if (!selectedIds.has(edge.to_passage_id)) {
        const neighbor = passagesById.get(edge.to_passage_id)
        if (!neighbor) continue
        neighborIds.add(edge.to_passage_id)
        edges.push({ ...edge, included: true })
        continue
      }
      edges.push(edge)
    }
  }
  return {
    neighbors: [...neighborIds].map(id => passagesById.get(id)).filter(Boolean),
    edges: dedupeEdges(edges).map(edge => ({ ...edge, included: selectedIds.has(edge.to_passage_id) || edge.included === true })),
  }
}

function mergeResults(fastResults, deepResults, passagesById, limit) {
  const merged = []
  const deepIds = new Set(deepResults.map(item => item.passage_id))
  for (const result of fastResults) {
    if (deepIds.has(result.passage_id)) continue
    const passage = passagesById.get(result.passage_id)
    if (passage) merged.push({ ...passage, score: result.score, reason: 'fast_search' })
  }
  for (const result of deepResults) {
    const passage = passagesById.get(result.passage_id)
    if (passage) merged.push({ ...passage, score: result.score || 0, reason: 'deep_search' })
  }
  return merged
    .filter(passage => !isDuplicatePassage(passage, merged.filter(item => item !== passage)))
    .sort((a, b) => b.score - a.score || String(a.page_path).localeCompare(String(b.page_path)))
    .slice(0, limit)
}

function buildPageMetadata(pagePaths, pages) {
  const byPath = new Map((pages || []).map(page => [page.path, page]))
  return [...new Set(pagePaths)].map(pagePath => ({
    path: pagePath,
    title: byPath.get(pagePath)?.title || pagePath.replace(/\.md$/i, ''),
    page_type: byPath.get(pagePath)?.page_type || '',
    status: byPath.get(pagePath)?.status || '',
    source_ids: byPath.get(pagePath)?.source_ids || [],
  }))
}

function buildSourceMetadata(sourceIds, sources) {
  const byId = new Map((sources || []).map(source => [source.id, source]))
  return [...new Set(sourceIds)].map(sourceId => {
    const source = byId.get(sourceId) || {}
    return {
      id: sourceId,
      title: source.title || sourceId,
      type: source.type || '',
      parser_status: source.parser_status || '',
      extract_path: source.extract_path || '',
    }
  })
}

export class WikiContextPackService {
  constructor({ passageService, wikiService, deepSearch = null }) {
    this._passageService = passageService
    this._wikiService = wikiService
    this._deepSearch = deepSearch
  }

  async build({ wikiId, query, mode = 'auto', tokenBudget = 6000, limit = 10, scope = 'all', include } = {}) {
    const normalizedMode = normalizeMode(mode)
    const args = {
      tokenBudget: clampInt(tokenBudget, DEFAULT_TOKEN_BUDGET, 1, MAX_TOKEN_BUDGET),
      limit: clampInt(limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
      include: normalizeIncludes(include),
    }
    const sourcesResult = await this._wikiService.listSources(wikiId)
    const sources = sourcesResult.data || []
    const files = await this._wikiService._searchService(wikiId)._documentFiles(sources)
    const allPassages = await this._passageService.build(wikiId, files)
    const passagesById = new Map(allPassages.map(passage => [passage.passage_id, passage]))

    const fastResults = await this._passageService.search({
      query,
      scope,
      limit: Math.max(args.limit * 2, 20),
      passages: allPassages,
    })
    let results = fastResults
    let searchMode = 'fast'
    let deepMeta = null
    let deepWarning = ''

    const shouldUpgrade = normalizedMode === 'deep' || (
      normalizedMode === 'auto' && needsDeepResults(query, fastResults)
    )
    if (shouldUpgrade && this._deepSearch) {
      try {
        const deep = await this._deepSearch({
          wikiId,
          query,
          scope,
          limit: args.limit,
        })
        deepMeta = deep?.meta || null
        results = mergeResults(fastResults, deep?.results || [], passagesById, args.limit)
        searchMode = String(deep?.mode || 'deep')
      } catch (error) {
        deepWarning = error.message
        results = fastResults
        searchMode = 'fast_fallback'
      }
    } else if (shouldUpgrade) {
      searchMode = 'fast_fallback'
      deepWarning = 'deep_search_unavailable'
    }

    const resultPassages = results
      .map(result => {
        const passage = passagesById.get(result.passage_id) || result
        return {
          passage,
          score: Number(result.score || 0),
          reason: result.reason || (searchMode === 'deep' ? 'deep_search' : 'fast_search'),
        }
      })
      .filter(item => item.passage)
    const passages = []
    let tokenEstimate = 0
    let removedLowScore = false
    for (const item of resultPassages) {
      if (isDuplicatePassage(item.passage, passages.map(existing => existing))) continue
      const passageTokens = Number(item.passage.token_estimate || 0)
      if (tokenEstimate + passageTokens > args.tokenBudget) {
        removedLowScore = true
        continue
      }
      passages.push(formatPassage({ ...item.passage, score: item.score }, passages.length + 1, item.reason))
      tokenEstimate += passageTokens
    }

    const includePassages = args.include.includes('passages')
    const includeCitations = args.include.includes('citations')
    const includeNeighbors = args.include.includes('neighbors')
    const neighborDepth = normalizedMode === 'deep' || searchMode === 'deep' ? MAX_NEIGHBOR_DEPTH : 1
    const neighborSelection = includeNeighbors
      ? collectPassages(passages.map(passage => passage.passage_id), passagesById, neighborDepth)
      : { neighbors: [], edges: [] }
    if (includeNeighbors && includePassages) {
      for (const neighbor of neighborSelection.neighbors) {
        if (isDuplicatePassage(neighbor, passages)) continue
        const neighborTokens = Number(neighbor.token_estimate || 0)
        if (tokenEstimate + neighborTokens > args.tokenBudget) {
          removedLowScore = true
          continue
        }
        passages.push(formatPassage({ ...neighbor, score: 0 }, passages.length + 1, 'neighbor'))
        tokenEstimate += neighborTokens
      }
    }

    const citations = includeCitations ? passages.map(passage => passage.citation) : []
    const pagePaths = (includePassages ? passages : []).map(passage => passage.page_path)
    const sourceIds = (includePassages ? passages : []).map(passage => passage.source_id).filter(Boolean)
    const pagesResult = await this._wikiService.listPages(wikiId)
    const pack = {
      mode: searchMode,
      query: String(query || ''),
      passages: includePassages ? passages : [],
      pages: args.include.includes('pages') ? buildPageMetadata(pagePaths, pagesResult.data || []) : [],
      sources: args.include.includes('sources') ? buildSourceMetadata(sourceIds, sources) : [],
      citations: includeCitations ? citations : [],
      neighbors: includeNeighbors
        ? {
            depth: neighborDepth,
            passages: includePassages
              ? passages
                  .filter(passage => neighborSelection.neighbors.some(item => item.passage_id === passage.passage_id))
                  .map(passage => passage.passage_id)
              : [],
            edges: neighborSelection.edges,
          }
        : null,
      usage: {
        token_estimate: tokenEstimate,
        token_budget: args.tokenBudget,
        model_calls: Number(deepMeta?.model_calls || 0),
        passage_count: includePassages ? passages.length : 0,
        low_score_removed: removedLowScore,
      },
    }
    if (deepMeta?.token_usage) pack.usage.token_usage = deepMeta.token_usage
    if (deepWarning) pack.warning = deepWarning
    return pack
  }
}

