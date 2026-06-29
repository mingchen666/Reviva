// electron/agents/TokenRecorder.js — Record token usage to database

export class TokenRecorder {
  constructor(dbService) {
    this._db = dbService
  }

  /**
   * Record token usage from one model call
   * @param {object} data
   * @param {string} data.providerId
   * @param {string} data.modelId
   * @param {object} data.usage - { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
   * @param {string} data.agentId
   * @param {string} data.conversationId
   * @param {string} data.runId
   * @param {number} data.iteration
   * @param {number} data.cost
   * @param {number} data.latencyMs
   */
  record(data) {
    try {
      this._db.createTokenUsage({
        provider_id: data.providerId,
        model_id: data.modelId,
        input_tokens: data.usage?.inputTokens || 0,
        output_tokens: data.usage?.outputTokens || 0,
        cache_read_tokens: data.usage?.cacheReadTokens || 0,
        cache_write_tokens: data.usage?.cacheWriteTokens || 0,
        thinking_tokens: data.usage?.thinkingTokens || 0,
        cost: data.cost || 0,
        latency_ms: data.latencyMs || 0,
        agent_id: data.agentId || '',
        conversation_id: data.conversationId || '',
        // Extended fields (added via migration)
        run_id: data.runId || '',
        iteration: data.iteration || 0,
      })
    } catch (e) {
      console.error('[TokenRecorder] record error:', e)
    }
  }
}
