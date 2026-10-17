import { missingParam, invalidParam } from '../errorResponse.js'

const VALID_RANGES = ['today', 'week', 'month', 'custom']

function resolveRange(params) {
  const range = params?.range || 'month'
  if (!VALID_RANGES.includes(range)) {
    throw invalidParam('range', VALID_RANGES, `range 无效，合法值: ${VALID_RANGES.join(', ')}`)
  }
  if (range === 'custom') {
    if (!params?.startDate) throw missingParam('startDate', 'YYYY-MM-DD')
    if (!params?.endDate) throw missingParam('endDate', 'YYYY-MM-DD')
  }
  return range
}

// For custom range, return a date string that _getDateRangeFilter understands
// (it supports YYYY-MM format). For custom we pass startDate as the range.
// For custom range, pass an object {start, end} that _getDateRangeFilter supports.
 function effectiveRange(range, params) {
   if (range === 'custom') {
     return { start: params.startDate, end: params.endDate }
   }
   return range
 }

export function register(registry, _services) {
  // summary
  registry.register({
    domain: 'usage', id: 'summary', name: '用量汇总', write: false,
    params: 'range: today|week|month|custom, startDate, endDate',
    example: { range: 'month' },
    execute: async (params, ctx) => {
      const range = resolveRange(params)
      const eff = effectiveRange(range, params)
      const data = ctx.dbService.getTokenUsageSummary(eff)
      return { data, changedKeys: [] }
    },
  })

  // by_model
  registry.register({
    domain: 'usage', id: 'by_model', name: '按模型统计', write: false,
    params: 'range',
    example: { range: 'week' },
    execute: async (params, ctx) => {
      const range = resolveRange(params)
      const eff = effectiveRange(range, params)
      const data = ctx.dbService.getTokenUsageByModel(eff)
      return { data, changedKeys: [] }
    },
  })

  // by_agent
  registry.register({
    domain: 'usage', id: 'by_agent', name: '按Agent统计', write: false,
    params: 'range',
    example: { range: 'month' },
    execute: async (params, ctx) => {
      const range = resolveRange(params)
      const eff = effectiveRange(range, params)
      const data = ctx.dbService.getTokenUsageByAgent(eff)
      return { data, changedKeys: [] }
    },
  })

  // daily
  registry.register({
    domain: 'usage', id: 'daily', name: '每日趋势', write: false,
    params: 'range',
    example: { range: 'month' },
    execute: async (params, ctx) => {
      const range = resolveRange(params)
      const eff = effectiveRange(range, params)
      const data = ctx.dbService.getTokenUsageDaily(eff)
      return { data, changedKeys: [] }
    },
  })

  // list
  registry.register({
    domain: 'usage', id: 'list', name: '用量明细', write: false,
    params: 'filters: {agentId?, modelId?, startDate?, endDate?, limit?}',
    example: { filters: { limit: 10 } },
    execute: async (params, ctx) => {
      const filters = params?.filters || {}
      const data = ctx.dbService.listTokenUsage(filters)
      return { data: { records: data, count: data.length }, changedKeys: [] }
    },
  })

  // cleanup
  registry.register({
    domain: 'usage', id: 'cleanup', name: '清理旧记录', write: true,
    params: 'beforeDate: YYYY-MM-DD',
    example: { beforeDate: '2026-01-01' },
    execute: async (params, ctx) => {
      if (!params?.beforeDate) throw missingParam('beforeDate', 'YYYY-MM-DD')
      const today = new Date().toISOString().slice(0, 10)
      if (params.beforeDate >= today) {
        throw invalidParam('beforeDate', null, '日期不能晚于今天')
      }
      const data = ctx.dbService.deleteOldTokenUsage(params.beforeDate)
      return { data, changedKeys: [] }
    },
  })
}
