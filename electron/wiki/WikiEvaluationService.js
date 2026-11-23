import crypto from 'node:crypto'
import { nowIso, readJson, writeJson } from './wikiUtils.js'

const SET_VERSION = 1
const REPORT_VERSION = 1

function stringArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))]
}

function normalizeCase(testCase, index) {
  const caseId = String(testCase.case_id || testCase.caseId || `case_${index + 1}`).trim()
  const query = String(testCase.query || '').trim()
  const expectedPassageIds = stringArray(testCase.expected_passage_ids ?? testCase.expectedPassageIds)
  const expectedSourceIds = stringArray(testCase.expected_source_ids ?? testCase.expectedSourceIds)
  if (!caseId) throw new Error(`Evaluation case ${index + 1} is missing case_id`)
  if (!query) throw new Error(`Evaluation case ${caseId} is missing query`)
  if (!expectedPassageIds.length && !expectedSourceIds.length) {
    throw new Error(`Evaluation case ${caseId} must expect at least one passage or source`)
  }
  return {
    case_id: caseId,
    query,
    expected_passage_ids: expectedPassageIds,
    expected_source_ids: expectedSourceIds,
    tags: stringArray(testCase.tags),
  }
}

export class WikiEvaluationService {
  constructor({ wikiDir, searchPassages, verifyCitation, listSources }) {
    this._wikiDir = wikiDir
    this._setPath = `${wikiDir}/.cache/evaluation/evaluation-set.json`
    this._reportPath = `${wikiDir}/.cache/evaluation/latest.json`
    this._searchPassages = searchPassages
    this._verifyCitation = verifyCitation
    this._listSources = listSources
    this._writeChain = Promise.resolve()
  }

  async _mutate(operation) {
    const run = this._writeChain.catch(() => {}).then(operation)
    this._writeChain = run.catch(() => {})
    return run
  }

  async loadSet() {
    const data = await readJson(this._setPath, { version: SET_VERSION, cases: [] })
    if (data.version !== SET_VERSION || !Array.isArray(data.cases)) return { version: SET_VERSION, cases: [] }
    return data
  }

  async saveSet(cases = [], options = {}) {
    const normalized = (Array.isArray(cases) ? cases : []).map(normalizeCase)
    const ids = new Set()
    for (const testCase of normalized) {
      if (ids.has(testCase.case_id)) throw new Error(`Duplicate evaluation case id: ${testCase.case_id}`)
      ids.add(testCase.case_id)
    }
    const data = {
      version: SET_VERSION,
      cases: normalized,
      updated_at: nowIso(),
    }
    await this._mutate(() => writeJson(this._setPath, data))
    if (options.reload) return this.loadSet()
    return data
  }

  async latest() {
    const report = await readJson(this._reportPath, null)
    return report?.version === REPORT_VERSION ? report : null
  }

  async run({ limit = 10, reason = 'manual', citations = [] } = {}) {
    if (!this._searchPassages) throw new Error('Evaluation search is unavailable')
    if (!this._verifyCitation) throw new Error('Evaluation citation verification is unavailable')
    const startedAt = Date.now()
    const set = await this.loadSet()
    const results = []
    let reciprocalRankSum = 0
    let recallAt5Hits = 0
    let recallAt10Hits = 0

    for (const testCase of set.cases) {
      const search = await this._searchPassages({
        query: testCase.query,
        limit: Math.max(Number(limit || 10), 1),
      })
      const rankedPassageIds = search.map(item => item.passage_id)
      const rankedSourceIds = new Set(search.map(item => item.source_id).filter(Boolean))
      const expectedPassages = testCase.expected_passage_ids.length
      const expectedSources = testCase.expected_source_ids.length
      let hitCount = 0
      let firstRank = 0
      let recallAt5 = 0
      let recallAt10 = 0

      for (const passageId of testCase.expected_passage_ids) {
        const rank = rankedPassageIds.indexOf(passageId) + 1
        if (rank > 0) {
          hitCount += 1
          firstRank = firstRank || rank
          recallAt5 = 1
          recallAt10 = 1
        }
      }
      for (const sourceId of testCase.expected_source_ids) {
        const rank = search.findIndex(item => item.source_id === sourceId) + 1
        if (rank > 0) {
          hitCount += 1
          firstRank = firstRank || rank
          recallAt5 = 1
          recallAt10 = 1
        }
      }

      const hit = firstRank > 0
      recallAt5Hits += recallAt5
      recallAt10Hits += recallAt10
      if (hit) reciprocalRankSum += 1 / firstRank
      results.push({
        case_id: testCase.case_id,
        query: testCase.query,
        hit,
        first_rank: firstRank,
        recall_at_5: recallAt5,
        recall_at_10: recallAt10,
        hit_count: hitCount,
        expected_passage_ids: testCase.expected_passage_ids,
        expected_source_ids: testCase.expected_source_ids,
        result_passage_ids: rankedPassageIds,
        result_source_ids: [...rankedSourceIds],
      })
    }

    const citationResults = []
    for (const citation of citations || []) {
      const status = await this._verifyCitation(citation)
      citationResults.push({
        citation,
        status: status.status,
        valid: status.valid === true,
        reason: status.reason || '',
      })
    }
    const validCitationCount = citationResults.filter(item => item.valid).length
    const caseCount = set.cases.length
    const report = {
      version: REPORT_VERSION,
      reason,
      status: caseCount ? 'completed' : 'empty',
      case_count: caseCount,
      metrics: {
        recall_at_5: caseCount ? recallAt5Hits / caseCount : 0,
        recall_at_10: caseCount ? recallAt10Hits / caseCount : 0,
        mrr: caseCount ? reciprocalRankSum / caseCount : 0,
        citation_validity: citationResults.length ? validCitationCount / citationResults.length : 1,
      },
      citation_results: citationResults,
      results,
      set_updated_at: set.updated_at || '',
      duration_ms: Date.now() - startedAt,
      created_at: nowIso(),
      model_calls: 0,
      search_backend: 'bm25',
    }
    await this._mutate(() => writeJson(this._reportPath, report))
    return report
  }

  async health({ lintReport = null, proposalStats = null } = {}) {
    const report = await this.latest()
    if (!report) throw new Error('Evaluation report is missing')
    const search = (
      report.metrics.recall_at_5
      + report.metrics.recall_at_10
      + report.metrics.mrr
    ) / 3
    const lintErrorCount = lintReport?.summary?.error || 0
    const citation = report.metrics.citation_validity
    return {
      version: 1,
      evaluation_created_at: report.created_at,
      scores: {
        search,
        citation,
        coverage: report.status === 'completed' ? 1 : 0,
        lint: Math.max(1 - lintErrorCount / Math.max(report.case_count, 1), 0),
        proposal_review: proposalStats?.pending_review ?? 0,
      },
      metrics: report.metrics,
      status: report.status,
      citations: report.citation_results.length,
    }
  }
}
