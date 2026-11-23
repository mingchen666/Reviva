const AGENT_FORBIDDEN_ACTIONS = new Set([
  'write_page',
  'review_proposal',
  'apply_proposal',
  'save_evaluation_set',
  'run_evaluation',
])

export function assertWikiToolRequestAllowed(req = {}) {
  const action = String(req.action || '').trim()
  if (req.agentWrite !== true || !AGENT_FORBIDDEN_ACTIONS.has(action)) return
  if (action === 'write_page') {
    throw new Error('Agent must use propose_update instead of write_page')
  }
  throw new Error(`Agent is not allowed to run ${action}`)
}
