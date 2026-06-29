// electron/agents/RunStateManager.js — Agent run state persistence

export class RunStateManager {
  constructor(dbService) {
    this._db = dbService
  }

  /**
   * Create a new run record
   */
  create(data) {
    try {
      this._db.createAgentRun(data)
    } catch (e) {
      console.error('[RunStateManager] create error:', e)
    }
  }

  /**
   * Update run state
   */
  update(runId, data) {
    try {
      this._db.updateAgentRun(runId, data)
    } catch (e) {
      console.error('[RunStateManager] update error:', e)
    }
  }

  /**
   * Get run state
   */
  get(runId) {
    try {
      return this._db.getAgentRun(runId)
    } catch (e) {
      console.error('[RunStateManager] get error:', e)
      return null
    }
  }

  /**
   * List runs for a conversation
   */
  listByConversation(convId) {
    try {
      return this._db.listAgentRunsByConversation(convId)
    } catch (e) {
      console.error('[RunStateManager] listByConversation error:', e)
      return []
    }
  }

  /**
   * Add a step to a run
   */
  addStep(runId, step) {
    try {
      const run = this.get(runId)
      if (!run) return
      const steps = typeof run.steps === 'string' ? JSON.parse(run.steps) : (run.steps || [])
      steps.push({ ...step, timestamp: Date.now() })
      this.update(runId, { steps: JSON.stringify(steps), iterations: steps.length })
    } catch (e) {
      console.error('[RunStateManager] addStep error:', e)
    }
  }
}
