import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { tokenizeWikiText } from './WikiSearchService.js'

function clampInt(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.round(parsed), min), max)
}

function passageKey(passage) {
  return passage.passage_id || `${passage.page_path}:${passage.start_line}:${passage.end_line}`
}

function extractExpansionTerms(query, passages, limit) {
  const queryTokens = new Set(tokenizeWikiText(query))
  const scores = new Map()
  for (const passage of passages) {
    for (const token of tokenizeWikiText(passage.text || '')) {
      if (queryTokens.has(token) || token.length < 2) continue
      scores.set(token, (scores.get(token) || 0) + 1)
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token)
}

async function judgeEvidence({ model, query, passages }) {
  const content = passages.map(passage => ({
    id: passage.passage_id,
    page_path: passage.page_path,
    heading_path: passage.heading_path,
    start_line: passage.start_line,
    end_line: passage.end_line,
    text: passage.text,
  }))
  const response = await model.invoke([
    new SystemMessage('You judge evidence relevance. Return strict JSON only: {"results":[{"id":"passage_id","score":0.0,"reason":"short"}]}. Scores are 0-1 and do not answer the query.'),
    new HumanMessage(JSON.stringify({ query, passages: content })),
  ])
  const text = typeof response?.content === 'string' ? response.content : String(response?.content || '')
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || '{}'
  const parsed = JSON.parse(jsonText)
  const byId = new Map(passages.map(passage => [passage.passage_id, passage]))
  return (Array.isArray(parsed.results) ? parsed.results : [])
    .map(result => ({ passage: byId.get(String(result.id)), score: Number(result.score) || 0, reason: String(result.reason || '') }))
    .filter(item => item.passage)
}

export class WikiDeepSearchService {
  constructor({ passageService, wikiService, createModel }) {
    this._passageService = passageService
    this._wikiService = wikiService
    this._createModel = createModel
  }

  async search({ wikiId, query, scope = 'all', limit = 10, candidates = 30, expansionTerms = 12, rounds = 1, maxModelCalls = 3, signal } = {}) {
    const sources = (await this._wikiService.listSources(wikiId)).data || []
    const files = await this._wikiService._searchService(wikiId)._documentFiles(sources)
    const allPassages = await this._passageService.build(wikiId, files)
    const args = {
      limit: clampInt(limit, 10, 1, 50),
      candidates: clampInt(candidates, 30, 10, 100),
      expansionTerms: clampInt(expansionTerms, 12, 0, 30),
      rounds: clampInt(rounds, 1, 0, 5),
      maxModelCalls: clampInt(maxModelCalls, 3, 1, 10),
    }
    const meta = {
      mode: 'fast_fallback',
      rounds: 0,
      model_calls: 0,
      candidates: args.candidates,
      expansion_terms: [],
      stopped_reason: '',
      token_usage: { input_tokens: 0, output_tokens: 0 },
    }
    let initial = await this._passageService.search({ query, scope, limit: args.candidates, passages: allPassages })
    let model = null
    let judged = initial.map(item => ({ passage: allPassages.find(p => p.passage_id === item.passage_id), score: item.score, reason: 'BM25 fallback', expansion_terms: [] }))
    if (!this._createModel) {
      meta.stopped_reason = 'model_unavailable'
      return { mode: 'fast', results: initial.slice(0, args.limit), meta }
    }
    if (signal?.aborted) {
      meta.stopped_reason = 'cancelled'
      return { mode: 'fast', results: initial.slice(0, args.limit), meta }
    }
    try {
      model = this._createModel()
      judged = await judgeEvidence({ model, query, passages: judged.map(item => item.passage) })
      meta.model_calls += 1
      meta.mode = 'deep'
    } catch (error) {
      meta.stopped_reason = `model_failed:${error.message}`
      return { mode: 'fast_fallback', results: initial.slice(0, args.limit), meta, warning: error.message }
    }

    for (let round = 0; round < args.rounds && meta.model_calls < args.maxModelCalls; round += 1) {
      meta.rounds += 1
      const seed = judged.slice(0, Math.min(5, judged.length)).map(item => item.passage)
      const terms = extractExpansionTerms(query, seed, args.expansionTerms)
      if (!terms.length) {
        meta.stopped_reason = 'no_expansion_terms'
        break
      }
      const visited = new Set(judged.map(item => passageKey(item.passage)))
      const expandedQuery = [...new Set([...String(query || '').split(/\s+/), ...terms])].join(' ')
      const expanded = (await this._passageService.search({ query: expandedQuery, scope, limit: args.candidates, passages: allPassages }))
        .filter(item => !visited.has(item.passage_id))
        .map(item => ({ passage: allPassages.find(p => p.passage_id === item.passage_id), score: item.score }))
      if (!expanded.length) {
        meta.stopped_reason = 'no_new_candidates'
        break
      }
      try {
        const more = await judgeEvidence({ model, query, passages: expanded.map(item => item.passage) })
        meta.model_calls += 1
        judged = [...judged, ...more]
        meta.expansion_terms = terms
      } catch (error) {
        meta.stopped_reason = `model_failed:${error.message}`
        break
      }
    }
    if (!meta.stopped_reason) meta.stopped_reason = 'completed'
    const results = judged
      .sort((a, b) => b.score - a.score || String(a.passage.page_path).localeCompare(String(b.passage.page_path)))
      .slice(0, args.limit)
      .map(item => ({
        ...item.passage,
        evidence_reason: item.reason,
        expansion_terms: item.expansion_terms || [],
        citation: {
          type: 'passage',
          passage_id: item.passage.passage_id,
          page_path: item.passage.page_path,
          start_line: item.passage.start_line,
          end_line: item.passage.end_line,
          source_id: item.passage.source_id,
        },
      }))
    return { mode: 'deep', results, meta }
  }
}
