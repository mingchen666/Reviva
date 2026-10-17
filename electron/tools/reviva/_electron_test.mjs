// Integration test that runs inside Electron's main process
 // Usage: npx electron electron/tools/reviva/_electron_test.mjs
 //        (run from mindspace-desktop directory)

 import { app } from 'electron'
 import path from 'node:path'

 app.whenReady().then(async () => {
   try {
     await runTests()
   } catch (err) {
     console.error('Fatal error:', err)
   } finally {
     app.quit()
   }
 })

 async function runTests() {
   // Dynamic imports so they load inside Electron
   const { DatabaseService } = await import('../../DatabaseService.js')
   const { dispatch } = await import('./RevivaManageTool.js')

   const workspaceRoot = 'F:/桌面文件/非常重要的重要的文件/MindSpace/this'
   const dbPath = path.join(workspaceRoot, '.reviva', 'reviva.db')

   const dbService = new DatabaseService()
   dbService.init(dbPath)
   console.log('[DB] Connected to:', dbPath)

   const opts = {
     getDbService: () => dbService,
     getThemeService: () => null,
     getLearningMemoryService: () => null,
     getWorkDirService: () => ({
       getStatus: () => ({ initialized: true, rootPath: workspaceRoot }),
     }),
     getSkillService: () => null,
     getMcpService: () => null,
     getPermissions: () => ({ revivaManage: 'readwrite' }),
     getWriteCount: () => 0,
     setWriteCount: (n) => {},
   }

   let passed = 0
   let failed = 0
   const failures = []

   function ok(name, condition, detail = '') {
     if (condition) {
       passed++
       console.log('  PASS: ' + name)
     } else {
       failed++
       failures.push(name + (detail ? ' — ' + detail : ''))
       console.log('  FAIL: ' + name + (detail ? ' — ' + detail : ''))
     }
   }

   // dispatch returns objects directly, no JSON.parse needed

   // 0. Global switch
   console.log('\n=== 0. Global Switch ===')
   const allow = dbService.getSetting('allowRevivaManage')
   ok('allowRevivaManage is true', allow === true, 'got: ' + JSON.stringify(allow))

   // 1. Help
   console.log('\n=== 1. Help / Discovery ===')
   let r = await dispatch('help', undefined, undefined, opts)
   ok('help returns 8 domains', r.domains?.length === 8, 'got ' + r.domains?.length)

   r = await dispatch('help', 'usage', undefined, opts)
   ok('help usage has actions', r.actions?.length > 0, 'got ' + r.actions?.length)

   // 2. Appearance (read-only)
   console.log('\n=== 2. Appearance ===')
   r = await dispatch('current_theme', 'appearance', {}, opts)
   ok('current_theme ok', r.ok === true, r.error?.message)
   ok('current_theme has themeId', r.data?.themeId !== undefined, 'got ' + JSON.stringify(r.data?.themeId))
   ok('current_theme has accentColor', r.data?.accentColor !== undefined)
   ok('current_theme has themeMode', r.data?.themeMode !== undefined)

   r = await dispatch('list_themes', 'appearance', {}, opts)
   ok('list_themes returns builtin', r.data?.builtin?.length === 7, 'got ' + r.data?.builtin?.length)

   // 3. Preferences
   console.log('\n=== 3. Preferences ===')
   r = await dispatch('get_all', 'preferences', {}, opts)
   ok('preferences get_all ok', r.ok === true, r.error?.message)
   ok('preferences has answerStyle', r.data?.answerStyle !== undefined)
   ok('preferences sanitizes providers', r.data?.providers === undefined)

   r = await dispatch('get', 'preferences', { key: 'answerStyle' }, opts)
   ok('preferences get ok', r.ok === true, r.error?.message)
   ok('preferences get returns value', r.data?.value !== undefined)

   // 4. Creation Tools
   console.log('\n=== 4. Creation Tools ===')
   r = await dispatch('list', 'creation_tools', {}, opts)
   ok('creation_tools list ok', r.ok === true, r.error?.message)
   ok('creation_tools has order', Array.isArray(r.data?.order) && r.data.order.length > 0)

   // 5. Quick Inputs
   console.log('\n=== 5. Quick Inputs ===')
   r = await dispatch('list', 'quick_inputs', {}, opts)
   ok('quick_inputs list ok', r.ok === true, r.error?.message)
   ok('quick_inputs returns array', Array.isArray(r.data), 'got ' + typeof r.data)

   // 6. Agents
   console.log('\n=== 6. Agents ===')
   r = await dispatch('list_agents', 'agents', {}, opts)
   ok('agents list ok', r.ok === true, r.error?.message)
   ok('agents list has agents', Array.isArray(r.data) && r.data.length > 0, 'got ' + r.data?.length)
   if (r.data?.length > 0) {
     ok('agents list strips prompt', r.data[0].prompt === undefined)
     ok('agents list has builtin', typeof r.data[0].builtin === 'boolean')

     const agentId = r.data[0].id
     r = await dispatch('get_agent', 'agents', { agentId }, opts)
     ok('agents get_agent ok', r.ok === true, r.error?.message)
     ok('agents get_agent strips prompt', r.data?.prompt === undefined)
   }

   r = await dispatch('list_sub_agents', 'agents', {}, opts)
   ok('agents list_sub_agents ok', r.ok === true, r.error?.message)

   r = await dispatch('list_skills', 'agents', {}, opts)
   ok('agents list_skills ok', r.ok === true, r.error?.message)
   ok('agents list_skills returns array', Array.isArray(r.data))

   r = await dispatch('list_mcp_servers', 'agents', {}, opts)
   ok('agents list_mcp_servers ok', r.ok === true, r.error?.message)
   ok('agents list_mcp_servers returns array', Array.isArray(r.data))

   // 7. Usage
   console.log('\n=== 7. Usage ===')
   r = await dispatch('summary', 'usage', { range: 'month' }, opts)
   ok('usage summary ok', r.ok === true, r.error?.message)
   ok('usage summary has call_count', r.data?.call_count !== undefined, 'got ' + JSON.stringify(r.data?.call_count))
   ok('usage summary has total_tokens', r.data?.total_tokens !== undefined)

   r = await dispatch('by_model', 'usage', { range: 'month' }, opts)
   ok('usage by_model ok', r.ok === true, r.error?.message)
   ok('usage by_model returns array', Array.isArray(r.data))

   r = await dispatch('by_agent', 'usage', { range: 'month' }, opts)
   ok('usage by_agent ok', r.ok === true, r.error?.message)
   ok('usage by_agent returns array', Array.isArray(r.data))

   r = await dispatch('daily', 'usage', { range: 'month' }, opts)
   ok('usage daily ok', r.ok === true, r.error?.message)
   ok('usage daily returns array', Array.isArray(r.data))

   // 8. Custom range
   console.log('\n=== 8. Custom Range ===')
   r = await dispatch('summary', 'usage', { range: 'custom', startDate: '2026-01-01', endDate: '2026-10-09' }, opts)
   ok('custom range ok', r.ok === true, r.error?.message)
   ok('custom range returns data', r.data?.call_count !== undefined)

   // 9. Status
   console.log('\n=== 9. Status ===')
   r = await dispatch('workspace_info', 'status', {}, opts)
   ok('status workspace_info ok', r.ok === true, r.error?.message)

   r = await dispatch('app_info', 'status', {}, opts)
   ok('status app_info ok', r.ok === true, r.error?.message)

   r = await dispatch('system_env', 'status', {}, opts)
   ok('status system_env ok', r.ok === true, r.error?.message)

   // 10. Error cases
   console.log('\n=== 10. Error Cases ===')
   r = await dispatch('unknown_action', 'appearance', {}, opts)
   ok('unknown action returns error', r.ok === false)

   r = await dispatch('summary', 'unknown_domain', {}, opts)
   ok('unknown domain returns error', r.ok === false)

   // 11. Permission check
   console.log('\n=== 11. Permission ===')
   const roOpts = { ...opts, getPermissions: () => ({ revivaManage: 'readonly' }) }
   r = await dispatch('set_theme', 'appearance', { themeId: 'default' }, roOpts)
   ok('readonly denied', r.ok === false && r.error?.code === 'PERMISSION_DENIED')

   // Summary
   console.log('\n' + '='.repeat(60))
   console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed')
   if (failed > 0) {
     console.log('\nFailures:')
     failures.forEach(f => console.log('  - ' + f))
   } else {
     console.log('ALL INTEGRATION TESTS PASSED')
   }

   dbService.close()
 }
