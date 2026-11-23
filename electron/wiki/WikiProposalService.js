import crypto from 'node:crypto'
import { pageContentHash, normalizeWikiPageContent } from './WikiMarkdownMetadata.js'
import { resolveWritablePagePath } from './WikiContentNormalizer.js'
import { isFallbackSummary } from './WikiMaintenance.js'
import { nowIso, readJson, writeJson } from './wikiUtils.js'
import { normalizeWikiMarkdownLinks } from '../../src/utils/wikiLinks.js'

const QUEUE_VERSION = 1
const RISK_LEVELS = new Set(['low', 'medium', 'high'])
const OPEN_STATUSES = new Set(['pending_review'])
const APPLYABLE_STATUSES = new Set(['pending_review', 'confirmed'])

function proposalId(pagePath, newContent, createdAt) {
  const hash = crypto.createHash('sha256')
    .update([pagePath, newContent, createdAt].join('\n'))
    .digest('hex')
    .slice(0, 20)
  return `proposal_${hash}`
}

function stringArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => String(item || '').trim()).filter(Boolean))]
}

export function lineDiff(oldContent = '', newContent = '') {
  const oldLines = String(oldContent || '').split(/\r?\n/)
  const newLines = String(newContent || '').split(/\r?\n/)
  const output = []
  let index = 0
  while (index < Math.max(oldLines.length, newLines.length)) {
    if (oldLines[index] !== newLines[index]) {
      let oldEnd = index
      let newEnd = index
      while (oldEnd < oldLines.length || newEnd < newLines.length) {
        if (oldEnd < oldLines.length && newEnd < newLines.length && oldLines[oldEnd] === newLines[newEnd]) break
        oldEnd += 1
        newEnd += 1
      }
      while (oldEnd < oldLines.length && oldEnd - index >= newEnd - index && oldLines[oldEnd] !== newLines[newEnd]) oldEnd += 1
      while (newEnd < newLines.length && newEnd - index >= oldEnd - index && newLines[newEnd] !== oldLines[oldEnd]) newEnd += 1
      for (let line = index; line < Math.min(oldEnd, oldLines.length); line += 1) output.push(`- ${oldLines[line]}`)
      for (let line = index; line < Math.min(newEnd, newLines.length); line += 1) output.push(`+ ${newLines[line]}`)
      index = Math.max(oldEnd, newEnd)
      continue
    }
    output.push(`  ${oldLines[index]}`)
    index += 1
  }
  return output.join('\n')
}

function assessRisk({ oldContent = '', newContent = '', sourceIds = [], passageIds = [], pagePath = '' }) {
  const oldBody = String(oldContent || '').trim()
  const newBody = String(newContent || '').trim()
  const isNavigationPage = oldBody && /^(index|overview)\.md$/i.test(String(pagePath || ''))
  if (isNavigationPage) return newBody.length >= oldBody.length / 2 ? 'low' : 'high'
  if (!oldBody || (pagePath.startsWith('pages/summaries/') && isFallbackSummary(oldContent))) {
    return sourceIds.length && passageIds.length ? 'medium' : 'high'
  }
  if (oldBody.length > 2 * newBody.length + 200) return 'high'
  if (!sourceIds.length || !passageIds.length) return 'high'
  return 'medium'
}

export class WikiProposalService {
  constructor({ wikiDir, writePage, readPage, listSources, passageService, refreshEvidence }) {
    this._wikiDir = wikiDir
    this._queuePath = `${wikiDir}/.cache/reviews/proposals-v1.json`
    this._writePage = writePage
    this._readPage = readPage
    this._listSources = listSources
    this._passageService = passageService
    this._refreshEvidence = refreshEvidence
    this._queueChain = Promise.resolve()
    this._applyChain = Promise.resolve()
    this._submissionChain = Promise.resolve()
  }

  async _mutateQueue(operation) {
    const run = this._queueChain.catch(() => {}).then(operation)
    this._queueChain = run.catch(() => {})
    return run
  }

  async _loadQueue() {
    const queue = await readJson(this._queuePath, { version: QUEUE_VERSION, proposals: [] })
    if (queue.version !== QUEUE_VERSION || !Array.isArray(queue.proposals)) {
      return { version: QUEUE_VERSION, proposals: [] }
    }
    return queue
  }

  async _saveQueue(queue) {
    await writeJson(this._queuePath, {
      version: QUEUE_VERSION,
      proposals: queue.proposals || [],
      updated_at: nowIso(),
    })
  }

  async list({ status = '' } = {}) {
    const queue = await this._loadQueue()
    const normalized = String(status || '').trim()
    const statuses = normalized.split(',').map(item => item.trim()).filter(Boolean)
    return (queue.proposals || []).filter(proposal => !statuses.length || statuses.includes(proposal.status))
  }

  async get(proposalId) {
    const id = String(proposalId || '').trim()
    const queue = await this._loadQueue()
    return queue.proposals.find(item => item.proposal_id === id) || null
  }

  async _validateEvidence(wikiId, sourceIds, passageIds) {
    await this._refreshEvidence?.()
    if (!this._listSources) throw new Error('Proposal source validation is unavailable')
    const sources = (await this._listSources()).data || []
    const validSourceIds = new Set(sources.map(source => String(source.id || '')).filter(Boolean))
    const invalidSources = sourceIds.filter(sourceId => !validSourceIds.has(sourceId))
    if (invalidSources.length) throw new Error(`Proposal references unknown source ids: ${invalidSources.join(', ')}`)

    if (!this._passageService) throw new Error('Proposal passage validation is unavailable')
    const invalidPassages = []
    for (const passageId of passageIds) {
      const passage = await this._passageService.readPassage(passageId)
      if (!passage || passage.wiki_id !== wikiId || (passage.source_id && (!validSourceIds.has(passage.source_id) || !sourceIds.includes(passage.source_id)))) {
        invalidPassages.push(passageId)
      }
    }
    if (invalidPassages.length) throw new Error(`Proposal references unknown passage ids: ${invalidPassages.join(', ')}`)
  }

  async create({
    wikiId,
    title,
    pagePath,
    content,
    reason = '',
    sourceIds = [],
    passageIds = [],
    risk = '',
    runId = '',
  } = {}) {
    const resolvedTitle = String(title || '').trim()
    const normalizedPath = pagePath ? resolveWritablePagePath(pagePath, resolvedTitle) : ''
    let newContent = String(content || '')
    if (!wikiId) throw new Error('wikiId is required')
    if (!resolvedTitle) throw new Error('Proposal title is required')
    if (!normalizedPath) throw new Error('Proposal page path is required')
    if (!newContent.trim()) throw new Error('Proposal content is required')
    if (!String(reason || '').trim()) throw new Error('Proposal reason is required')
    if (risk && !RISK_LEVELS.has(String(risk).toLowerCase())) {
      throw new Error('Proposal risk must be low, medium, or high')
    }

    const normalizedSourceIds = stringArray(sourceIds)
    const normalizedPassageIds = stringArray(passageIds)
    await this._validateEvidence(String(wikiId), normalizedSourceIds, normalizedPassageIds)
    newContent = normalizeWikiMarkdownLinks(newContent, normalizedPath)

    if (!this._readPage) throw new Error('Proposal page reading is unavailable')
    const readResult = await this._readPage(normalizedPath)
    const oldContent = readResult.success ? String(readResult.data?.content || '') : ''
    if (normalizedPath.startsWith('pages/summaries/') && isFallbackSummary(oldContent) && !isFallbackSummary(newContent)
      && normalizedSourceIds.length && normalizedPassageIds.length) {
      // A real summary must not inherit the placeholder's fallback/review flags.
      newContent = normalizeWikiPageContent({ relPath: normalizedPath, title: resolvedTitle, content: newContent, sourceIds: normalizedSourceIds, status: 'active' }).content
    }
    const assessed = assessRisk({ oldContent, newContent, sourceIds: normalizedSourceIds, passageIds: normalizedPassageIds, pagePath: normalizedPath })
    const levels = ['low', 'medium', 'high']
    const createdAt = nowIso()
    const proposal = {
      proposal_id: proposalId(normalizedPath, newContent, createdAt),
      wiki_id: wikiId,
      title: resolvedTitle,
      page_path: normalizedPath,
      old_content: oldContent,
      new_content: newContent,
      diff: lineDiff(oldContent, newContent),
      reason: String(reason || '').trim(),
      source_ids: normalizedSourceIds,
      passage_ids: normalizedPassageIds,
      risk: levels[Math.max(levels.indexOf(assessed), levels.indexOf(String(risk || '').toLowerCase()))],
      run_id: String(runId || ''),
      status: 'pending_review',
      created_at: createdAt,
      updated_at: createdAt,
      applied_at: '',
      rejected_at: '',
    }

    await this._mutateQueue(async () => {
      const queue = await this._loadQueue()
      queue.proposals.unshift(proposal)
      await this._saveQueue(queue)
    })
    return proposal
  }

  async updateStatus(proposalId, status, options = {}) {
    if (!['confirmed', 'rejected', 'pending_review'].includes(status)) {
      throw new Error('Proposal status must be confirmed, rejected, or pending_review')
    }
    return this._mutateQueue(async () => {
      const queue = await this._loadQueue()
      const proposal = queue.proposals.find(item => item.proposal_id === String(proposalId || '').trim())
      if (!proposal) throw new Error('Proposal not found')
      if (!OPEN_STATUSES.has(proposal.status)) throw new Error(`Proposal is already ${proposal.status}`)
      if (status === 'confirmed') {
        if (proposal.risk === 'high' && options.confirmedBy !== 'user') {
          throw new Error('High-risk proposal requires explicit user confirmation')
        }
        proposal.status = 'confirmed'
      } else if (status === 'rejected') {
        proposal.status = 'rejected'
        proposal.rejected_at = nowIso()
      }
      proposal.updated_at = nowIso()
      await this._saveQueue(queue)
      return proposal
    })
  }

  async apply(proposalId, options = {}) {
    const run = this._applyChain.catch(() => {}).then(() => this._apply(proposalId, options))
    this._applyChain = run.catch(() => {})
    return run
  }

  async createAndMaybeApply(data, { autoApply = false, writeOptions = {} } = {}) {
    // Models may submit several tool calls together. Keep evidence refresh,
    // baseline capture and application ordered within this Wiki.
    const run = this._submissionChain.catch(() => {}).then(() => this._createAndMaybeApply(data, { autoApply, writeOptions }))
    this._submissionChain = run.catch(() => {})
    return run
  }

  async _createAndMaybeApply(data, { autoApply, writeOptions }) {
    const proposal = await this.create(data)
    if (!autoApply || proposal.risk === 'high') return { success: true, data: proposal }
    try {
      const applied = await this.apply(proposal.proposal_id, { wikiId: data.wikiId, confirmedBy: 'user', writeOptions })
      if (!applied.success) throw new Error(applied.error || 'Auto apply failed')
      return { success: true, data: applied.data.proposal, auto_applied: true }
    } catch (err) {
      const saved = await this._mutateQueue(async () => {
        const queue = await this._loadQueue()
        const item = queue.proposals.find(item => item.proposal_id === proposal.proposal_id)
        item.auto_apply_failed = err.message || 'Auto apply failed'
        item.updated_at = nowIso()
        await this._saveQueue(queue)
        return item
      })
      return { success: true, data: saved, auto_apply_failed: saved.auto_apply_failed }
    }
  }

  async _apply(proposalId, options = {}) {
    let appliedProposal = null
    const wikiId = String(options.wikiId || '')
    const proposal = await this.get(proposalId)
    if (!proposal) throw new Error('Proposal not found')
    if (wikiId && proposal.wiki_id !== wikiId) throw new Error('Proposal not found')
    if (!APPLYABLE_STATUSES.has(proposal.status)) throw new Error(`Proposal is ${proposal.status}`)
    if (options.confirmedBy !== 'user') {
      throw new Error('Proposal requires explicit user confirmation before write_page')
    }
    if (proposal.risk === 'high' && options.confirmedBy !== 'user') {
      throw new Error('High-risk proposal requires explicit user confirmation')
    }
    if (!this._readPage) throw new Error('Proposal page reading is unavailable')
    await this._validateEvidence(proposal.wiki_id, proposal.source_ids, proposal.passage_ids)
    const current = await this._readPage(proposal.page_path)
    const currentContent = current.success ? String(current.data?.content || '') : ''
    if (pageContentHash(currentContent) !== pageContentHash(proposal.old_content)) {
      throw new Error('Proposal baseline changed; create a new proposal from the current page')
    }

    const writeResult = await this._writePage({
      pagePath: proposal.page_path,
      title: proposal.title,
      content: proposal.new_content,
      reason: `proposal:${proposal.proposal_id}:${proposal.reason}`,
      sourceIds: proposal.source_ids,
      agentWrite: false,
      ...options.writeOptions,
    })
    if (!writeResult.success) return writeResult

    await this._mutateQueue(async () => {
      const queue = await this._loadQueue()
      const saved = queue.proposals.find(item => item.proposal_id === proposal.proposal_id)
      if (!saved) throw new Error('Proposal disappeared while applying')
      saved.status = 'applied'
      saved.applied_at = nowIso()
      saved.updated_at = saved.applied_at
      delete saved.auto_apply_failed
      appliedProposal = saved
      await this._saveQueue(queue)
    })
    return { success: true, data: { proposal: appliedProposal, page: writeResult.data } }
  }
}
