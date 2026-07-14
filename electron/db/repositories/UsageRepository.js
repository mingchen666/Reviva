import { dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class UsageRepository extends BaseRepository {
  createTokenUsage(data) {
    const id = data.id || 'tu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO token_usage (id, provider_id, model_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, latency_ms, agent_id, conversation_id, run_id, iteration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.provider_id || '', data.model_id || '',
      data.input_tokens || 0, data.output_tokens || 0,
      data.cache_read_tokens || 0, data.cache_write_tokens || 0,
      data.thinking_tokens || 0,
      data.cost || 0, data.latency_ms || 0,
      data.agent_id || '', data.conversation_id || '',
      data.run_id || '', data.iteration || 0)
    return this.db.prepare('SELECT * FROM token_usage WHERE id = ?').get(id)
  }

  listTokenUsage(filters = {}) {
    let sql = 'SELECT * FROM token_usage'
    const conditions = []
    const params = []
    if (filters.provider_id) { conditions.push('provider_id = ?'); params.push(filters.provider_id) }
    if (filters.model_id) { conditions.push('model_id = ?'); params.push(filters.model_id) }
    if (filters.agent_id) { conditions.push('agent_id = ?'); params.push(filters.agent_id) }
    if (filters.conversation_id) { conditions.push('conversation_id = ?'); params.push(filters.conversation_id) }
    if (filters.startDate) { conditions.push('created_at >= ?'); params.push(filters.startDate) }
    if (filters.endDate) { conditions.push('created_at <= ?'); params.push(filters.endDate) }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY created_at DESC'
    if (filters.limit) sql += ` LIMIT ${filters.limit}`
    return this.db.prepare(sql).all(...params)
  }

  getTokenUsageSummary(range = 'month') {
    const dateRange = this._getDateRangeFilter(range)
    const where = dateRange.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dateRange.end ? [dateRange.start, dateRange.end] : [dateRange.start]
    return this.db.prepare(`SELECT
      COUNT(*) as call_count,
      COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) as total_tokens,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
      COALESCE(SUM(thinking_tokens), 0) as thinking_tokens,
      COALESCE(SUM(cost), 0) as total_cost,
      COALESCE(AVG(latency_ms), 0) as avg_latency
      FROM token_usage WHERE ${where}`).get(...params)
  }

  getTokenUsageByModel(range = 'month') {
    const dateRange = this._getDateRangeFilter(range)
    const where = dateRange.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dateRange.end ? [dateRange.start, dateRange.end] : [dateRange.start]
    return this.db.prepare(`SELECT COALESCE(provider_id, '') as provider_id, COALESCE(model_id, '') as model_id,
      COUNT(*) as call_count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(thinking_tokens) as thinking_tokens,
      SUM(cost) as cost
      FROM token_usage WHERE ${where}
      GROUP BY COALESCE(provider_id, ''), COALESCE(model_id, '') ORDER BY cost DESC`).all(...params)
  }

  getTokenUsageByAgent(range = 'month') {
    const dateRange = this._getDateRangeFilter(range)
    const where = dateRange.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dateRange.end ? [dateRange.start, dateRange.end] : [dateRange.start]
    return this.db.prepare(`SELECT agent_id,
      COUNT(*) as call_count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(thinking_tokens) as thinking_tokens,
      SUM(cost) as cost
      FROM (
        SELECT
          CASE
            WHEN LOWER(COALESCE(agent_id, '')) LIKE 'wiki-agent:%' THEN 'wikiagent'
            WHEN LOWER(COALESCE(agent_id, '')) IN ('wikiagent', 'wiki_agent', 'wiki-agent') THEN 'wikiagent'
            ELSE COALESCE(agent_id, '')
          END as agent_id,
          input_tokens,
          output_tokens,
          cache_read_tokens,
          cache_write_tokens,
          thinking_tokens,
          cost
        FROM token_usage WHERE ${where}
      )
      GROUP BY agent_id ORDER by call_count DESC`).all(...params)
  }

  getTokenUsageDaily(range = 'month') {
    const dateRange = this._getDateRangeFilter(range)
    const where = dateRange.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dateRange.end ? [dateRange.start, dateRange.end] : [dateRange.start]
    return this.db.prepare(`SELECT DATE(created_at) as date,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(thinking_tokens) as thinking_tokens,
      SUM(cost) as cost,
      COUNT(*) as call_count
      FROM token_usage WHERE ${where}
      GROUP BY DATE(created_at) ORDER BY date ASC`).all(...params)
  }

  deleteOldTokenUsage(beforeDate) {
    const result = this.db.prepare('DELETE FROM token_usage WHERE created_at < ?').run(beforeDate)
    return { deleted: result.changes }
  }

  createAgentRun(data) {
    const id = data.id || 'run_' + Date.now()
    this.db.prepare(`INSERT INTO agent_runs (id, conversation_id, agent_id, parent_run_id, status, iterations, max_iterations, total_input_tokens, total_output_tokens, total_cost, steps, error_code, error_message, compressed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.conversation_id || '', data.agent_id || '', data.parent_run_id || '',
      data.status || 'running', data.iterations || 0, data.max_iterations ?? 10,
      data.total_input_tokens || 0, data.total_output_tokens || 0, data.total_cost || 0,
      data.steps || '[]', data.error_code || '', data.error_message || '', data.compressed || 0)
    return this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id)
  }

  getAgentRun(id) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id)
  }

  updateAgentRun(id, data) {
    return dynamicUpdate(this.db, 'agent_runs', id, data, ['steps'])
  }

  listAgentRunsByConversation(conversationId) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE conversation_id = ? ORDER BY created_at DESC').all(conversationId)
  }

  listAgentRunsByAgent(agentId) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
  }

  deleteAgentRun(id) {
    this.db.prepare('DELETE FROM agent_runs WHERE id = ?').run(id)
    return { success: true }
  }

  _getDateRangeFilter(range) {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
      const nextDay = new Date(new Date(range + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
      return { start: range, end: nextDay }
    }
    if (/^\d{4}-\d{2}$/.test(range)) {
      const [year, month] = range.split('-')
      const nextMonth = month === '12' ? `${+year + 1}-01` : `${year}-${String(+month + 1).padStart(2, '0')}`
      return { start: range + '-01', end: nextMonth + '-01' }
    }
    switch (range) {
      case 'today': return { start: today }
      case 'yesterday': {
        const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
        return { start: yesterday, end: today }
      }
      case 'week': return { start: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) }
      case 'month': return { start: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) }
      case 'year': return { start: new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10) }
      default: return { start: '2000-01-01' }
    }
  }
}
