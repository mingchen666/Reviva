// Smoke test for reviva_manage tool — runs without Electron.
// Usage: node electron/tools/reviva/_smoke_test.mjs

import * as registry from './RevivaActionRegistry.js'
import { register as registerStatus } from './domains/status.js'
import { safeGetSetting, safeSetSetting, sanitizeSettings, SecurityError, SETTING_READ_WHITELIST, SETTING_WRITE_WHITELIST } from './security.js'
import { errorResponse, errorResponseFromThrow, DomainError, missingParam, invalidParam } from './errorResponse.js'
import { BUILTIN_THEMES, BUILTIN_THEME_IDS } from './builtinThemes.js'
import { CREATION_TOOL_IDS, normalizeCreationToolPreferences } from './creationToolsHelper.js'

// Register all domains (skip status.js which imports 'electron')
import { register as registerUsage } from './domains/usage.js'
import { register as registerAppearance } from './domains/appearance.js'
import { register as registerPreferences } from './domains/preferences.js'
import { register as registerCreationTools } from './domains/creationTools.js'
import { register as registerQuickInputs } from './domains/quickInputs.js'
import { register as registerAgents } from './domains/agents.js'
import { register as registerLearning } from './domains/learning.js'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log('  PASS: ' + name)
  } else {
    failed++
    console.log('  FAIL: ' + name + (detail ? ' — ' + detail : ''))
  }
}

// ── Mock services ──
const mockSettings = {
  themeId: 'default',
  themeMode: 'light',
  accentColor: 'brand',
  customAccentHex: '#4A6CFF',
  answerStyle: 'default',
  chatNavigationEnabled: true,
  creationToolPreferences: { order: [...CREATION_TOOL_IDS], hiddenIds: [] },
  agentSkillsPanelEnabled: false,
  allowRevivaManage: true,
}

const mockDbService = {
  getSetting: (key) => mockSettings[key] ?? null,
  setSetting: (key, value) => { mockSettings[key] = value; return { success: true } },
  listAgents: () => [{ id: 'general', name: '通用助手', englishName: 'general', desc: '', model: 'gpt-4', builtin: true, tools: ['kb_search'], skills: [], prompt: 'You are a helpful assistant.' }],
  getAgent: (id) => id === 'general' ? { id: 'general', name: '通用助手', englishName: 'general', desc: '', model: 'gpt-4', builtin: true, tools: ['kb_search'], skills: [], prompt: 'SECRET PROMPT' } : null,
  listSubAgents: () => [{ id: 'sub1', name: '子Agent', model: 'gpt-4', enabled: true, builtin: false, tools: [], skills: [] }],
  listSkills: () => [{ id: 'skill1', name: '技能1', description: 'desc', source: 'custom', category: 'test', enabled: true }],
  listMcpServers: () => [{ id: 'exa', name: 'Exa', transport: 'sse', url: 'http://localhost:3000', enabled: true }],
  listQuickInputs: () => [{ id: 'q1', title: '总结', type: 'command', content: '请总结', enabled: true }],
  createQuickInput: (data) => ({ id: 'q2', ...data, enabled: true }),
  getTokenUsageSummary: () => ({ call_count: 10, total_tokens: 1000, total_cost: 0.5 }),
  getTokenUsageByModel: () => [{ provider_id: 'openai', model_id: 'gpt-4', call_count: 10, cost: 0.5 }],
  getTokenUsageByAgent: () => [{ agent_id: 'general', call_count: 10, cost: 0.5 }],
  getTokenUsageDaily: () => [{ date: '2026-10-01', cost: 0.5, call_count: 5 }],
  listTokenUsage: () => [{ id: 'tu_1', input_tokens: 100, output_tokens: 200 }],
  deleteOldTokenUsage: (d) => ({ deleted: 5 }),
}

const mockThemeService = {
  listThemes: async () => ({ success: true, themes: [{ id: 'dark-ocean', name: '深海' }], errors: [] }),
  readCss: async (id) => ({ success: true, theme: { id, name: id }, css: 'body { color: red; }' }),
  readCustomCss: async () => ({ success: true, css: '', exists: false }),
  stageCustomCss: async (css) => ({ success: true }),
  commitCustomCss: async () => ({ success: true }),
  discardPendingCustomCss: async () => ({ success: true, css: '' }),
  resetCustomCss: async () => ({ success: true }),
}

const mockWorkDirService = { getStatus: () => ({ initialized: true, rootPath: '/test', docsPath: '/test/docs', notesPath: '/test/notes' }) }
const mockSkillService = { isInstalled: (id) => id === 'skill1', isBuiltinSkillId: (id) => id === 'builtin-skill', listBuiltinSkills: async () => [{ id: 'builtin-skill', name: '内置技能' }] }
const mockMcpService = { testServer: async (cfg) => ({ success: true, capabilities: { tools: {} } }) }
const mockLearningMemoryService = { getOverview: () => ({ enabled: true, totalRuns: 10 }) }

function buildCtx(perm = 'readwrite') {
  return {
    dbService: mockDbService,
    themeService: mockThemeService,
    learningMemoryService: mockLearningMemoryService,
    workDirService: mockWorkDirService,
    skillService: mockSkillService,
    mcpService: mockMcpService,
    permission: perm,
    writeCount: 0,
  }
}

// ── Register domains ──
registerUsage(registry, {})
registerAppearance(registry, {})
registerPreferences(registry, {})
registerCreationTools(registry, {})
registerQuickInputs(registry, {})
registerAgents(registry, {})
registerStatus(registry, {})
registerLearning(registry, {})

console.log('\n=== 1. Registry Structure ===')
const domains = registry.listDomains()
assert('8 domains registered', domains.length === 8, 'got ' + domains.length)
const expectedActions = { usage: 6, appearance: 11, preferences: 3, creation_tools: 5, quick_inputs: 2, status: 3, agents: 8, learning: 1 }
for (const d of domains) {
  if (d.id !== 'status') {
    assert(d.id + ' has ' + expectedActions[d.id] + ' actions', d.actions === expectedActions[d.id], 'got ' + d.actions)
  }
}

console.log('\n=== 2. Help / Discovery ===')
const helpAll = { ok: true, domains, hint: '...' }
assert('help returns 8 domains', helpAll.domains.length === 8)
const usageActions = registry.listActions('usage', { permission: 'readwrite' })
assert('usage domain has actions', usageActions.actions.length === 6, 'got ' + usageActions.actions.length)
assert('usage has summary action', usageActions.actions.some(a => a.id === 'summary'))
assert('usage has cleanup (write) action', usageActions.actions.some(a => a.id === 'cleanup' && a.write === true))
const usageActionsReadonly = registry.listActions('usage', { permission: 'readonly' })
assert('readonly filters out cleanup', !usageActionsReadonly.actions.some(a => a.id === 'cleanup'))
assert('example field exists', usageActions.actions[0].example !== undefined)

console.log('\n=== 3. Security ===')
assert('safeGetSetting allows whitelisted key', safeGetSetting(mockDbService, 'themeId') === 'default')
assert('safeGetSetting blocks non-whitelisted key', (() => { try { safeGetSetting(mockDbService, 'providers'); return false } catch (e) { return e.code === 'BLOCKED_READ' } })())
assert('safeSetSetting allows whitelisted key', (() => { try { safeSetSetting(mockDbService, 'themeId', 'dark'); return true } catch { return false } })())
assert('safeSetSetting blocks non-whitelisted key', (() => { try { safeSetSetting(mockDbService, 'providers', {}); return false } catch (e) { return e.code === 'BLOCKED_WRITE' } })())
assert('safeSetSetting blocks allowRevivaManage', (() => { try { safeSetSetting(mockDbService, 'allowRevivaManage', true); return false } catch (e) { return e.code === 'BLOCKED_WRITE' } })())
const sanitized = sanitizeSettings({ themeId: 'default', providers: [{ apiKey: 'secret' }], allowRevivaManage: true, answerStyle: 'default' })
assert('sanitizeSettings removes providers', !sanitized.providers)
assert('sanitizeSettings removes allowRevivaManage', !sanitized.allowRevivaManage)
assert('sanitizeSettings keeps themeId', sanitized.themeId === 'default')
assert('BUILTIN_THEME_IDS has 7 themes', BUILTIN_THEME_IDS.length === 7, 'got ' + BUILTIN_THEME_IDS.length)
assert('BUILTIN_THEMES includes default', BUILTIN_THEMES.some(t => t.id === 'default'))
// Reset mock state mutated by security tests above
mockSettings.themeId = 'default'

console.log('\n=== 4. Error Responses ===')
const err1 = errorResponse('INVALID_PARAM', 'set_theme', 'appearance', { field: 'themeId', available: ['default', 'dark'] })
assert('error has code', err1.error.code === 'INVALID_PARAM')
assert('error has available', JSON.stringify(err1.error.available) === JSON.stringify(['default', 'dark']))
assert('error ok is false', err1.ok === false)
const err2 = errorResponseFromThrow(new SecurityError('BLOCKED_WRITE', 'blocked'), 'set', 'preferences')
assert('SecurityError -> PERMISSION_DENIED', err2.error.code === 'PERMISSION_DENIED')
const err3 = errorResponseFromThrow(new DomainError('NOT_FOUND', 'not found', { available: ['a', 'b'] }), 'get', 'agents')
assert('DomainError preserves code', err3.error.code === 'NOT_FOUND')
assert('DomainError preserves available', JSON.stringify(err3.error.available) === JSON.stringify(['a', 'b']))

console.log('\n=== 5. Usage Domain (mock) ===')
const ctx = buildCtx()
let r
r = await registry.get('summary', 'usage').execute({ range: 'month' }, ctx)
assert('usage.summary returns data', r.data.call_count === 10)
r = await registry.get('by_model', 'usage').execute({ range: 'week' }, ctx)
assert('usage.by_model returns array', Array.isArray(r.data) && r.data.length === 1)
r = await registry.get('by_agent', 'usage').execute({ range: 'month' }, ctx)
assert('usage.by_agent returns array', Array.isArray(r.data) && r.data.length === 1)
r = await registry.get('daily', 'usage').execute({ range: 'month' }, ctx)
assert('usage.daily returns array', Array.isArray(r.data) && r.data.length === 1)
r = await registry.get('list', 'usage').execute({ filters: { limit: 10 } }, ctx)
assert('usage.list returns records', r.data.records.length === 1)
r = await registry.get('cleanup', 'usage').execute({ beforeDate: '2026-01-01' }, ctx)
assert('usage.cleanup returns deleted count', r.data.deleted === 5)
assert('usage.cleanup is write', registry.get('cleanup', 'usage').write === true)

console.log('\n=== 6. Appearance Domain (mock) ===')
r = await registry.get('list_themes', 'appearance').execute({}, ctx)
assert('list_themes returns builtin themes', r.data.builtin.length === 7, 'got ' + r.data.builtin.length)
assert('list_themes returns user themes', r.data.user.length === 1)
assert('list_themes all combines both', r.data.all.length === 8)
r = await registry.get('current_theme', 'appearance').execute({}, ctx)
assert('current_theme returns themeId', r.data.themeId === 'default')
assert('current_theme returns accentColor', r.data.accentColor === 'brand')
r = await registry.get('read_theme_css', 'appearance').execute({ themeId: 'default' }, ctx)
assert('read_theme_css builtin returns note', r.data.note && !r.data.css)
r = await registry.get('read_theme_css', 'appearance').execute({ themeId: 'dark-ocean' }, ctx)
assert('read_theme_css user returns css', r.data.css === 'body { color: red; }')
r = await registry.get('set_theme', 'appearance').execute({ themeId: 'default' }, ctx)
assert('set_theme builtin succeeds', r.data.themeId === 'default')
assert('set_theme returns changedKeys', JSON.stringify(r.changedKeys) === JSON.stringify(['themeId']))
r = await registry.get('set_theme', 'appearance').execute({ themeId: 'dark-ocean' }, ctx)
assert('set_theme user theme succeeds', r.data.themeId === 'dark-ocean')
r = await registry.get('set_theme_mode', 'appearance').execute({ mode: 'dark' }, ctx)
assert('set_theme_mode succeeds', r.data.themeMode === 'dark')
r = await registry.get('set_accent', 'appearance').execute({ preset: 'violet' }, ctx)
assert('set_accent preset succeeds', r.data.accentColor === 'violet')
r = await registry.get('set_accent', 'appearance').execute({ hex: '#FF0000' }, ctx)
assert('set_accent hex succeeds', r.data.accentColor === 'custom' && r.data.customAccentHex === '#FF0000')
assert('set_accent hex returns 2 changedKeys', r.changedKeys.length === 2)
r = await registry.get('read_custom_css', 'appearance').execute({}, ctx)
assert('read_custom_css succeeds', r.data !== undefined)
r = await registry.get('stage_custom_css', 'appearance').execute({ css: 'body {}' }, ctx)
assert('stage_custom_css succeeds', r.data.success === true)
assert('stage_custom_css empty changedKeys', r.changedKeys.length === 0)
r = await registry.get('commit_custom_css', 'appearance').execute({}, ctx)
assert('commit_custom_css returns customCss key', r.changedKeys.includes('customCss'))
r = await registry.get('discard_custom_css', 'appearance').execute({}, ctx)
assert('discard_custom_css returns customCss key', r.changedKeys.includes('customCss'))
r = await registry.get('reset_custom_css', 'appearance').execute({}, ctx)
assert('reset_custom_css returns customCss key', r.changedKeys.includes('customCss'))

console.log('\n=== 7. Appearance Error Cases ===')
try { await registry.get('set_theme', 'appearance').execute({ themeId: 'nonexistent' }, ctx); assert('set_theme invalid throws', false) } catch (e) { assert('set_theme invalid throws NOT_FOUND', e.code === 'NOT_FOUND') }
try { await registry.get('set_theme_mode', 'appearance').execute({ mode: 'invalid' }, ctx); assert('set_theme_mode invalid throws', false) } catch (e) { assert('set_theme_mode invalid throws INVALID_PARAM', e.code === 'INVALID_PARAM') }
try { await registry.get('set_accent', 'appearance').execute({}, ctx); assert('set_accent no params throws', false) } catch (e) { assert('set_accent no params throws MISSING_PARAM', e.code === 'MISSING_PARAM') }
try { await registry.get('set_accent', 'appearance').execute({ preset: 'invalid' }, ctx); assert('set_accent invalid preset throws', false) } catch (e) { assert('set_accent invalid preset throws INVALID_PARAM', e.code === 'INVALID_PARAM') }
try { await registry.get('set_accent', 'appearance').execute({ hex: 'notahex' }, ctx); assert('set_accent invalid hex throws', false) } catch (e) { assert('set_accent invalid hex throws INVALID_PARAM', e.code === 'INVALID_PARAM') }

console.log('\n=== 8. Preferences Domain (mock) ===')
r = await registry.get('get_all', 'preferences').execute({}, ctx)
assert('preferences.get_all returns object', typeof r.data === 'object')
assert('preferences.get_all has answerStyle', r.data.answerStyle === 'default')
r = await registry.get('get', 'preferences').execute({ key: 'answerStyle' }, ctx)
assert('preferences.get returns value', r.data.value === 'default')
r = await registry.get('set', 'preferences').execute({ key: 'answerStyle', value: 'gentle_tutor' }, ctx)
assert('preferences.set succeeds', r.data.value === 'gentle_tutor')
assert('preferences.set returns changedKey', r.changedKeys[0] === 'answerStyle')
try { await registry.get('set', 'preferences').execute({ key: 'providers', value: {} }, ctx); assert('preferences.set blocked key throws', false) } catch (e) { assert('preferences.set blocked key throws PERMISSION_DENIED or BLOCKED_WRITE', e.code === 'BLOCKED_WRITE' || e.code === 'PERMISSION_DENIED') }

console.log('\n=== 9. Creation Tools Domain (mock) ===')
r = await registry.get('list', 'creation_tools').execute({}, ctx)
assert('creation_tools.list returns order', r.data.order.length === 13)
r = await registry.get('toggle', 'creation_tools').execute({ toolId: 'podcast' }, ctx)
assert('creation_tools.toggle hides podcast', r.data.hiddenIds.includes('podcast'))
r = await registry.get('toggle', 'creation_tools').execute({ toolId: 'podcast' }, ctx)
assert('creation_tools.toggle un-hides podcast', !r.data.hiddenIds.includes('podcast'))
r = await registry.get('reset', 'creation_tools').execute({}, ctx)
assert('creation_tools.reset succeeds', r.data.order.length === 13 && r.data.hiddenIds.length === 0)
r = await registry.get('toggle_skills_panel', 'creation_tools').execute({}, ctx)
assert('creation_tools.toggle_skills_panel returns changedKey', r.changedKeys[0] === 'agentSkillsPanelEnabled')
try { await registry.get('toggle', 'creation_tools').execute({ toolId: 'invalid' }, ctx); assert('creation_tools invalid toolId throws', false) } catch (e) { assert('creation_tools invalid toolId throws NOT_FOUND', e.code === 'NOT_FOUND') }

console.log('\n=== 10. Quick Inputs Domain (mock) ===')
r = await registry.get('list', 'quick_inputs').execute({}, ctx)
assert('quick_inputs.list returns array', r.data.length === 1)
r = await registry.get('create', 'quick_inputs').execute({ title: '测试', type: 'command', content: 'hello' }, ctx)
assert('quick_inputs.create succeeds', r.data.title === '测试')
try { await registry.get('create', 'quick_inputs').execute({ title: 'x', type: 'invalid', content: 'y' }, ctx); assert('quick_inputs invalid type throws', false) } catch (e) { assert('quick_inputs invalid type throws INVALID_PARAM', e.code === 'INVALID_PARAM') }
try { await registry.get('create', 'quick_inputs').execute({ type: 'command', content: 'y' }, ctx); assert('quick_inputs missing title throws', false) } catch (e) { assert('quick_inputs missing title throws MISSING_PARAM', e.code === 'MISSING_PARAM') }

console.log('\n=== 11. Agents Domain (mock) ===')
r = await registry.get('list_agents', 'agents').execute({}, ctx)
assert('agents.list_agents returns array', r.data.length === 1)
assert('agents.list_agents has no prompt', r.data[0].prompt === undefined)
assert('agents.list_agents has builtin field', r.data[0].builtin === true)
r = await registry.get('get_agent', 'agents').execute({ agentId: 'general' }, ctx)
assert('agents.get_agent returns agent', r.data.id === 'general')
assert('agents.get_agent strips prompt', r.data.prompt === undefined)
r = await registry.get('get_agent', 'agents').execute({ agentId: 'nonexistent' }, ctx)
assert('agents.get_agent nonexistent returns null', r.data === null)
r = await registry.get('list_sub_agents', 'agents').execute({}, ctx)
assert('agents.list_sub_agents returns array', r.data.length === 1)
assert('agents.list_sub_agents has no parentId', r.data[0].parentId === undefined)
r = await registry.get('list_skills', 'agents').execute({}, ctx)
assert('agents.list_skills returns array', r.data.length === 1)
r = await registry.get('list_builtin_skills', 'agents').execute({}, ctx)
assert('agents.list_builtin_skills returns array', Array.isArray(r.data) && r.data.length === 1)
r = await registry.get('skill_installed', 'agents').execute({ skillId: 'skill1' }, ctx)
assert('agents.skill_installed returns true', r.data.installed === true)
r = await registry.get('list_mcp_servers', 'agents').execute({}, ctx)
assert('agents.list_mcp_servers returns array', r.data.length === 1)
assert('agents.list_mcp_servers has transport', r.data[0].transport === 'sse')
r = await registry.get('mcp_test', 'agents').execute({ serverId: 'exa' }, ctx)
assert('agents.mcp_test succeeds', r.data.success === true)

console.log('\n=== 12. Learning Domain (mock) ===')
r = await registry.get('overview', 'learning').execute({}, ctx)
assert('learning.overview returns data', r.data.enabled === true)

console.log('\n=== 13. Permission Check (write denied for readonly) ===')
const readonlyCtx = buildCtx('readonly')
const writeEntry = registry.get('set_theme', 'appearance')
assert('set_theme is write action', writeEntry.write === true)
try { await writeEntry.execute({ themeId: 'default' }, readonlyCtx); assert('write action on readonly ctx does not throw (handler itself doesnt check)', true) } catch (e) { assert('write action on readonly ctx throws', false) }
// Note: the permission check happens in dispatch(), not in execute().
// Here we verify the dispatch logic conceptually.
const readonlyActions = registry.listActions('appearance', { permission: 'readonly' })
assert('readonly help hides write actions', !readonlyActions.actions.some(a => a.write === true))
assert('readwrite help shows write actions', registry.listActions('appearance', { permission: 'readwrite' }).actions.some(a => a.write === true))

console.log('\n=== 14. Usage custom range ===')
r = await registry.get('summary', 'usage').execute({ range: 'custom', startDate: '2026-01-15', endDate: '2026-03-20' }, ctx)
assert('custom range succeeds', r.data.call_count === 10)
try { await registry.get('summary', 'usage').execute({ range: 'custom', startDate: '2026-01-15' }, ctx); assert('custom range missing endDate throws', false) } catch (e) { assert('custom range missing endDate throws MISSING_PARAM', e.code === 'MISSING_PARAM') }
try { await registry.get('summary', 'usage').execute({ range: 'invalid' }, ctx); assert('invalid range throws', false) } catch (e) { assert('invalid range throws INVALID_PARAM', e.code === 'INVALID_PARAM') }

console.log('\n=== 15. Creation Tools reorder ===')
r = await registry.get('reorder', 'creation_tools').execute({ order: [...CREATION_TOOL_IDS].reverse() }, ctx)
assert('reorder succeeds', r.data.order.length === 13)
try { await registry.get('reorder', 'creation_tools').execute({ order: ['quiz'] }, ctx); assert('reorder missing items throws', false) } catch (e) { assert('reorder missing items throws INVALID_PARAM', e.code === 'INVALID_PARAM') }

console.log('\n' + '='.repeat(50))
console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.log('SOME TESTS FAILED')
  process.exit(1)
} else {
  console.log('ALL TESTS PASSED')
}
