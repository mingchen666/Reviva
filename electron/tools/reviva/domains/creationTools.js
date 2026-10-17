import { safeGetSetting, safeSetSetting } from '../security.js'
import { CREATION_TOOL_IDS, normalizeCreationToolPreferences } from '../creationToolsHelper.js'
import { missingParam, invalidParam, notFound } from '../errorResponse.js'

export function register(registry, _services) {
  // list
  registry.register({
    domain: 'creation_tools', id: 'list', name: '创作工具列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const raw = safeGetSetting(ctx.dbService, 'creationToolPreferences')
      const data = normalizeCreationToolPreferences(raw)
      return { data: { ...data, allTools: CREATION_TOOL_IDS }, changedKeys: [] }
    },
  })

  // toggle
  registry.register({
    domain: 'creation_tools', id: 'toggle', name: '显隐创作工具', write: true,
    params: 'toolId',
    example: { toolId: 'podcast' },
    execute: async (params, ctx) => {
      if (!params?.toolId) throw missingParam('toolId', CREATION_TOOL_IDS)
      if (!CREATION_TOOL_IDS.includes(params.toolId)) {
        throw notFound('toolId', CREATION_TOOL_IDS, `工具 '${params.toolId}' 不存在`)
      }
      const raw = safeGetSetting(ctx.dbService, 'creationToolPreferences')
      const prefs = normalizeCreationToolPreferences(raw)
      const hidden = new Set(prefs.hiddenIds)
      if (hidden.has(params.toolId)) {
        hidden.delete(params.toolId)
      } else {
        hidden.add(params.toolId)
      }
      const updated = { order: prefs.order, hiddenIds: [...hidden] }
      safeSetSetting(ctx.dbService, 'creationToolPreferences', updated)
      return { data: updated, changedKeys: ['creationToolPreferences'] }
    },
  })

  // reorder
  registry.register({
    domain: 'creation_tools', id: 'reorder', name: '重排创作工具', write: true,
    params: 'order: [toolId] (must contain all 13 IDs)',
    example: { order: ['ppt', 'mindmap', 'flashcard', 'quiz', 'qa', 'glossary', 'cheatsheet', 'graph', 'chart', 'podcast', 'research', 'studyguide', 'studycard'] },
    execute: async (params, ctx) => {
      if (!Array.isArray(params?.order)) throw invalidParam('order', null, 'order 必须是数组')
      // Check all 13 IDs are present
      const provided = new Set(params.order.map(String))
      const missing = CREATION_TOOL_IDS.filter(id => !provided.has(id))
      const extra = [...provided].filter(id => !CREATION_TOOL_IDS.includes(id))
      if (missing.length || extra.length) {
        throw invalidParam('order', CREATION_TOOL_IDS, `必须包含全部 ${CREATION_TOOL_IDS.length} 个工具 ID`)
      }
      const raw = safeGetSetting(ctx.dbService, 'creationToolPreferences')
      const prefs = normalizeCreationToolPreferences(raw)
      const updated = normalizeCreationToolPreferences({ order: params.order, hiddenIds: prefs.hiddenIds })
      safeSetSetting(ctx.dbService, 'creationToolPreferences', updated)
      return { data: updated, changedKeys: ['creationToolPreferences'] }
    },
  })

  // reset
  registry.register({
    domain: 'creation_tools', id: 'reset', name: '重置创作工具', write: true,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const updated = normalizeCreationToolPreferences({})
      safeSetSetting(ctx.dbService, 'creationToolPreferences', updated)
      return { data: updated, changedKeys: ['creationToolPreferences'] }
    },
  })

  // toggle_skills_panel
  registry.register({
    domain: 'creation_tools', id: 'toggle_skills_panel', name: '切换技能面板', write: true,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const current = safeGetSetting(ctx.dbService, 'agentSkillsPanelEnabled') === true
      const updated = !current
      safeSetSetting(ctx.dbService, 'agentSkillsPanelEnabled', updated)
      return { data: { agentSkillsPanelEnabled: updated }, changedKeys: ['agentSkillsPanelEnabled'] }
    },
  })
}
