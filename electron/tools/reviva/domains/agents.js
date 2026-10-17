import { missingParam } from '../errorResponse.js'

export function register(registry, _services) {
  // list_agents
  registry.register({
    domain: 'agents', id: 'list_agents', name: 'Agent列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.dbService.listAgents()
      // Sanitize: remove prompt to keep response small and avoid leaking system prompt
      const sanitized = data.map(a => ({
        id: a.id, name: a.name, englishName: a.englishName,
        desc: a.desc, model: a.model, builtin: a.builtin,
        tools: a.tools, skills: a.skills,
      }))
      return { data: sanitized, changedKeys: [] }
    },
  })

  // get_agent
  registry.register({
    domain: 'agents', id: 'get_agent', name: 'Agent详情', write: false,
    params: 'agentId',
    example: { agentId: 'general' },
    execute: async (params, ctx) => {
      if (!params?.agentId) throw missingParam('agentId', 'agent id')
      const agent = ctx.dbService.getAgent(params.agentId)
      if (!agent) return { data: null, changedKeys: [] }
      // Remove sensitive fields
      const { prompt, ...safe } = agent
      return { data: safe, changedKeys: [] }
    },
  })

  // list_sub_agents
  registry.register({
    domain: 'agents', id: 'list_sub_agents', name: '子Agent列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.dbService.listSubAgents()
      const sanitized = (data || []).map(a => ({
        id: a.id, name: a.name,
        model: a.model, enabled: a.enabled, builtin: a.builtin,
        tools: a.tools, skills: a.skills,
      }))
      return { data: sanitized, changedKeys: [] }
    },
  })

  // list_skills
  registry.register({
    domain: 'agents', id: 'list_skills', name: '技能列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.dbService.listSkills()
      const sanitized = (data || []).map(s => ({
        id: s.id, name: s.name, description: s.description,
        source: s.source, category: s.category, enabled: s.enabled,
      }))
      return { data: sanitized, changedKeys: [] }
    },
  })

  // list_builtin_skills
  registry.register({
    domain: 'agents', id: 'list_builtin_skills', name: '内置技能列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      if (!ctx.skillService?.listBuiltinSkills) {
        return { data: { error: 'SkillService 未初始化' }, changedKeys: [] }
      }
      const data = await ctx.skillService.listBuiltinSkills()
      return { data, changedKeys: [] }
    },
  })

  // skill_installed
  registry.register({
    domain: 'agents', id: 'skill_installed', name: '检查技能安装', write: false,
    params: 'skillId',
    example: { skillId: 'k12-math-learning' },
    execute: async (params, ctx) => {
      if (!params?.skillId) throw missingParam('skillId', 'skill id')
      const installed = ctx.skillService?.isInstalled?.(params.skillId) || false
      const builtin = ctx.skillService?.isBuiltinSkillId?.(params.skillId) || false
      return { data: { skillId: params.skillId, installed, builtin }, changedKeys: [] }
    },
  })

  // list_mcp_servers
  registry.register({
    domain: 'agents', id: 'list_mcp_servers', name: 'MCP服务列表', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.dbService.listMcpServers()
      const sanitized = (data || []).map(s => ({
        id: s.id, name: s.name, transport: s.transport,
        url: s.url, enabled: s.enabled,
      }))
      return { data: sanitized, changedKeys: [] }
    },
  })

  // mcp_test
  registry.register({
    domain: 'agents', id: 'mcp_test', name: '测试MCP连接', write: false,
    params: 'serverId 或 config: {id, name, transport, url, headers}',
    example: { serverId: 'exa' },
    execute: async (params, ctx) => {
      if (!ctx.mcpService?.testServer) {
        return { data: { error: 'McpService 未初始化' }, changedKeys: [] }
      }
      if (params?.serverId) {
        // Look up server config from DB
        const servers = ctx.dbService.listMcpServers()
        const server = servers.find(s => s.id === params.serverId)
        if (!server) {
          return { data: { error: `MCP server '${params.serverId}' not found` }, changedKeys: [] }
        }
        const data = await ctx.mcpService.testServer(server)
        return { data, changedKeys: [] }
      }
      if (params?.config) {
        const data = await ctx.mcpService.testServer(params.config)
        return { data, changedKeys: [] }
      }
      throw missingParam('serverId 或 config')
    },
  })
}
