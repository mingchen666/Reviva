import { parseFrontmatter } from './WikiMarkdownMetadata.js'

export const KNOWLEDGE_TYPES = ['concept', 'entity', 'question', 'comparison']

export function isFallbackSummary(content = '') {
  const { attributes, body } = parseFrontmatter(content)
  return attributes.fallback === true || attributes.status === 'fallback'
    || body.includes('This source summary was created automatically because WikiAgent did not write a dedicated summary page.')
}

export function buildMaintenanceReport({ sources = [], pages = [], proposals = [], plan = null, toolCalls = [], error = '' } = {}) {
  const ready = sources.filter(source => source.status === 'ingested' && source.parser_status === 'complete')
  const knowledge = pages.filter(page => page.path.startsWith('pages/'))
  const usable = knowledge.filter(page => !isFallbackSummary(page.content)
    && !['review_required', 'unsupported', 'stale', 'fallback'].includes(parseFrontmatter(page.content).attributes.status))
  const idsFor = page => {
    const attrs = parseFrontmatter(page.content).attributes
    return [...(Array.isArray(attrs.source_ids) ? attrs.source_ids : []), attrs.source_id].filter(Boolean)
  }
  const reasons = error ? [error] : []
  const missing = []
  if (!ready.length) reasons.push('没有已完成解析的来源')
  for (const source of ready) {
    const represented = usable.filter(page => idsFor(page).includes(source.id))
    if (!represented.some(page => page.path.startsWith('pages/summaries/'))) {
      reasons.push(`来源「${source.title || source.id}」缺少正式 summary（占位摘要不计入）`)
    }
    const substantial = Number(source.meta?.parse_stats?.chars || source.extract_chars || 0) >= 1200
    if (substantial && represented.filter(page => page.path.startsWith('pages/concepts/')).length < 2) {
      reasons.push(`来源「${source.title || source.id}」需要至少两个有证据支持的概念页`)
    }
    if (substantial && !represented.some(page => /^pages\/(entities|questions|comparisons)\//.test(page.path))) {
      reasons.push(`来源「${source.title || source.id}」尚缺实体、问题或对比页`)
    }
  }
  for (const item of plan?.pages || []) {
    const found = item.pagePath.startsWith('pages/')
      ? usable.find(page => page.path === item.pagePath)
      : pages.find(page => page.path === item.pagePath)
    if (!found) missing.push(item.pagePath)
  }
  if (missing.length) reasons.push(`计划中的页面尚未完成：${missing.join('、')}`)
  const applied = proposals.filter(proposal => proposal.status === 'applied')
  // Both navigation pages must be reviewed in this run, even when already present.
  const navigationUpdated = ['index.md', 'overview.md'].every(pagePath => applied.some(proposal => proposal.page_path === pagePath))
  if (ready.length && !navigationUpdated) reasons.push('本次维护尚未通过提案更新 index.md 和 overview.md')
  const failed = proposals.filter(proposal => proposal.auto_apply_failed && proposal.status !== 'applied')
  for (const proposal of failed) reasons.push(`${proposal.page_path} 自动应用失败：${proposal.auto_apply_failed}`)
  const pending = proposals.filter(proposal => ['pending_review', 'confirmed'].includes(proposal.status))
  if (pending.length) reasons.push(`${pending.length} 个提案尚待审核或应用，请查看审核 Tab`)
  const generatedPaths = [...new Set(applied.map(proposal => proposal.page_path).filter(pagePath => pagePath.startsWith('pages/')))]
  return {
    complete: reasons.length === 0,
    source_count: ready.length,
    proposal_count: proposals.length,
    applied_count: applied.length,
    high_risk_count: proposals.filter(proposal => proposal.risk === 'high').length,
    auto_apply_failed_count: failed.length,
    fallback_summary_count: knowledge.filter(page => page.path.startsWith('pages/summaries/') && isFallbackSummary(page.content)).length,
    generated_page_count: generatedPaths.length,
    generated_page_paths: generatedPaths,
    navigation_updated: navigationUpdated,
    missing_page_paths: missing,
    failure_reasons: [...new Set(reasons)],
    tool_call_count: toolCalls.length,
    tool_error_count: toolCalls.filter(call => call.success === false).length,
    tool_errors: toolCalls.filter(call => call.success === false).map(call => ({ action: call.action, error: call.error })),
    plan,
  }
}

export async function invokeMaintenanceWithRepair({ agent, instruction, inspect, recursionLimit = 160 }) {
  let result = await agent.invoke({ messages: [{ role: 'user', content: instruction }] }, { recursionLimit })
  const report = await inspect()
  // Do not try to bypass human review or retry network failures automatically.
  if (!report.complete && report.source_count && !report.auto_apply_failed_count
    && !report.high_risk_count && report.proposal_count === report.applied_count) {
    result = await agent.invoke({ messages: [
      ...(result.messages || []),
      { role: 'user', content: `Maintenance acceptance failed. Complete the missing work through propose_update, using real read_passage evidence. Do not repeat already applied page proposals except navigation updates needed for new pages. Issues:\n${report.failure_reasons.join('\n')}\nIf evidence cannot support a page, explain the limitation; never invent facts or citations.` },
    ] }, { recursionLimit })
  }
  return result
}
