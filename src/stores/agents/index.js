import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

import {
  REMOVED_TOOL_IDS,
  TOOL_CATEGORIES,
  DOCUMENT_READ_TOOL_MIGRATION_KEY,
  BUILTIN_TOOLS,
  SUB_AGENTS,
} from './constants'

import {
  normalizeNonNegativeLimit,
  hasAnyKey,
  normalizeCustomToolRecord,
  customToolToDbPayload,
  normalizeSubAgentRecord,
} from './utils'

const dbAgents = () => window.electronAPI.db.agents
const dbSkills = () => window.electronAPI.db.skills
const dbTools = () => window.electronAPI.db.tools
const dbSubAgents = () => window.electronAPI.db.subAgents
export const useAgentsStore = defineStore('agents', () => {
  // platformSkills ref moved into store for proper lifecycle
  const platformSkills = ref([])

  const agents = ref([])
  const customSkills = ref([])
  const customTools = ref([])
  const mcpServers = ref([])
  const customSubAgents = ref([])
  const loaded = ref(false)
  const platformSkillEnabledMap = ref({})

  const builtinSkills = ref([]) // Populated from platformSkills that user enables
  const builtinTools = ref(BUILTIN_TOOLS)
  const builtinSubAgents = ref(SUB_AGENTS.map(s => normalizeSubAgentRecord({ ...s, builtin: true })))
  const subAgentList = computed(() => [...builtinSubAgents.value, ...customSubAgents.value])
  const toolEnabledMap = ref({})
  const toolProviderConfigMap = ref({})

  function _stripRemovedToolRefs(agent) {
    if (!Array.isArray(agent?.tools)) return agent
    const tools = agent.tools.filter(id => !REMOVED_TOOL_IDS.has(id))
    return tools.length === agent.tools.length ? agent : { ...agent, tools }
  }

  async function _persistRemovedToolRefs(originalAgents, cleanedAgents) {
    if (!window.electronAPI?.db?.agents) return
    const updates = []
    for (let i = 0; i < cleanedAgents.length; i++) {
      const before = originalAgents[i]?.tools || []
      const after = cleanedAgents[i]?.tools || []
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        updates.push(dbAgents().update(cleanedAgents[i].id, { tools: JSON.parse(JSON.stringify(after)) }))
      }
    }
    if (updates.length) await Promise.all(updates)
  }

  // Restore built-in tool enabled state and provider configs from persisted maps
  // Also handles migration from old 'web_search' to per-provider tools
  function _restoreBuiltinToolEnabled() {
    for (const id of REMOVED_TOOL_IDS) {
      delete toolEnabledMap.value[id]
      delete toolProviderConfigMap.value[id]
    }

    // Migration: convert old 'web_search' config to per-provider tool
    const oldEnabled = toolEnabledMap.value.web_search
    const oldConfig = toolProviderConfigMap.value.web_search
    if (oldEnabled !== undefined || oldConfig) {
      const provider = oldConfig?.provider || 'tavily'
      const newToolId = 'web_search_' + provider
      if (oldConfig) {
        toolProviderConfigMap.value[newToolId] = {
          apiKey: oldConfig.apiKey || '',
          baseUrl: oldConfig.baseUrl || '',
          userParams: oldConfig.userParams || {},
        }
        delete toolProviderConfigMap.value.web_search
      }
      if (oldEnabled !== undefined) {
        toolEnabledMap.value[newToolId] = oldEnabled
        delete toolEnabledMap.value.web_search
      }
      // Also migrate agents' tool arrays if any reference 'web_search'
      for (const agent of agents.value) {
        if (agent.tools) {
          const idx = agent.tools.indexOf('web_search')
          if (idx >= 0) {
            agent.tools.splice(idx, 1, newToolId)
            // Update DB asynchronously
            if (window.electronAPI?.db?.agents) {
              dbAgents().update(agent.id, { tools: JSON.parse(JSON.stringify(agent.tools)) })
            }
          }
        }
      }
    }

    if (toolEnabledMap.value[DOCUMENT_READ_TOOL_MIGRATION_KEY] !== true) {
      toolEnabledMap.value.document_read = true
      toolEnabledMap.value.office_read = false
      toolEnabledMap.value.pdf_read = false
      toolEnabledMap.value[DOCUMENT_READ_TOOL_MIGRATION_KEY] = true
    }

    for (const tool of builtinTools.value) {
      if (tool.alwaysEnabled) {
        tool.enabled = true
        toolEnabledMap.value[tool.id] = true
      } else if (toolEnabledMap.value[tool.id] !== undefined) {
        tool.enabled = toolEnabledMap.value[tool.id]
      }
      if (toolProviderConfigMap.value[tool.id]) {
        const saved = toolProviderConfigMap.value[tool.id]
        tool.providerConfig = {
          ...tool.providerConfig,
          apiKey: saved.apiKey || '',
          baseUrl: saved.baseUrl || '',
          userParams: saved.userParams ? { ...tool.providerConfig.userParams, ...saved.userParams } : tool.providerConfig.userParams,
        }
      }
    }
  }
  _restoreBuiltinToolEnabled()

  function _isConfigured(tool) {
    if (!tool.needsConfig) return true
    const cfg = tool.providerConfig
    if (!cfg) return false
    // New per-provider tools: check needsKey and baseUrl
    if (tool.needsKey !== undefined) {
      // needsKey true = must have apiKey; 'optional' = apiKey not required; false = no apiKey needed
      if (tool.needsKey === true && !cfg.apiKey) return false
      // Tools that need baseUrl (SearXNG) — if no baseUrl and no defaultUrl, not configured
      if (!tool.needsKey && !cfg.baseUrl && !cfg.defaultUrl) return false
      return true
    }
    // Legacy multi-provider tools (e.g. translate): keep old logic
    if (!cfg.providers) return false
    const selected = cfg.providers.find(p => p.key === cfg.provider)
    if (!selected) return false
    if (selected.needsKey && !cfg.apiKey) return false
    return true
  }

  function toggleBuiltinTool(toolId) {
    const tool = builtinTools.value.find(t => t.id === toolId)
    if (!tool) return
    if (tool.alwaysEnabled) {
      tool.enabled = true
      toolEnabledMap.value[toolId] = true
      return
    }
    // Cannot enable a tool that needs config but isn't configured
    if (!tool.enabled && tool.needsConfig && !_isConfigured(tool)) return
    tool.enabled = !tool.enabled
    toolEnabledMap.value[toolId] = tool.enabled
  }

  function updateToolProviderConfig(toolId, config) {
    const tool = builtinTools.value.find(t => t.id === toolId)
    if (!tool) return
    // For per-provider tools, merge apiKey/baseUrl/userParams only
    const { apiKey, baseUrl, userParams } = config
    tool.providerConfig = {
      ...tool.providerConfig,
      apiKey: apiKey || tool.providerConfig.apiKey || '',
      baseUrl: baseUrl || tool.providerConfig.baseUrl || '',
      userParams: userParams ? { ...tool.providerConfig.userParams, ...userParams } : tool.providerConfig.userParams,
    }
    toolProviderConfigMap.value[toolId] = { apiKey: tool.providerConfig.apiKey, baseUrl: tool.providerConfig.baseUrl, userParams: tool.providerConfig.userParams }
  }

  // Built-in skills are always enabled — they ship with the app and are auto-installed
  // to the DB at startup so the agent runtime can read prompt_content from custom_skills.
  function _restorePlatformSkillEnabled() {
    for (const skill of platformSkills.value) {
      skill.enabled = true
    }
  }

  // Load built-in skills metadata from disk via IPC (electron/builtin-assets/skills/*/config.json)
  async function _loadBuiltinSkills() {
    if (!window.electronAPI?.skill?.listBuiltin) return
    try {
      const res = await window.electronAPI.skill.listBuiltin()
      if (!res?.success) return
      platformSkills.value = (res.data || []).map(s => ({
        ...s,
        desc: s.description,
        usedBy: [],
        enabled: true,
      }))
    } catch (e) {
      console.error('Failed to load builtin skills:', e)
    }
  }

  // Ensure every built-in skill has a matching DB row (source='platform', enabled=1).
  // The DB row carries prompt_content so the agent runtime can read it without disk IO.
  // Re-runs on every startup to sync changes the user made to SKILL.md on disk.
  async function _ensureBuiltinSkillsInDb(dbSkillList) {
    if (!window.electronAPI?.db?.skills) return
    for (const skill of platformSkills.value) {
      const existing = dbSkillList.find(s => s.id === skill.id && s.source === 'platform')

      let promptContent = ''
      try {
        const fileRes = await window.electronAPI.skill.readFile(skill.id, 'SKILL.md')
        if (fileRes?.success) promptContent = fileRes.data || ''
      } catch { }

      if (!existing) {
        const createPayload = {
          id: skill.id,
          name: skill.name,
          icon: skill.icon,
          color: skill.color,
          description: skill.desc || skill.description,
          detail: '',
          prompt_template: promptContent,
          prompt_content: promptContent,
          output_types: skill.outputTypes || ['Markdown'],
          allowed_tools: skill.allowedTools || [],
          source: 'platform',
          category: skill.category || '',
          version: skill.version || '1.0',
          author: skill.author || '',
          license: skill.license || '',
          builtin: 1,
          enabled: 1,
        }
        await window.electronAPI.db.skills.create(JSON.parse(JSON.stringify(createPayload)))
      } else if (
        existing.enabled !== 1 ||
        existing.prompt_content !== promptContent ||
        existing.version !== (skill.version || '1.0') ||
        JSON.stringify(existing.output_types || existing.outputTypes || []) !== JSON.stringify(skill.outputTypes || ['Markdown']) ||
        JSON.stringify(existing.allowed_tools || existing.allowedTools || []) !== JSON.stringify(skill.allowedTools || [])
      ) {
        const updatePayload = {
          enabled: 1,
          prompt_template: promptContent,
          prompt_content: promptContent,
          name: skill.name,
          description: skill.desc || skill.description,
          icon: skill.icon,
          color: skill.color,
          category: skill.category || '',
          output_types: skill.outputTypes || ['Markdown'],
          allowed_tools: skill.allowedTools || [],
          version: skill.version || '1.0',
          author: skill.author || '',
          license: skill.license || '',
          builtin: 1,
        }
        await window.electronAPI.db.skills.update(skill.id, JSON.parse(JSON.stringify(updatePayload)))
      }
    }
  }

  // Built-in skills are always enabled — kept as a no-op for any legacy callers.
  async function togglePlatformSkill(_skillId) {
    console.warn('togglePlatformSkill is a no-op — built-in skills are always enabled')
  }

  // Combined skill list: built-in (always enabled) + custom
  const skillList = computed(() => [...platformSkills.value, ...customSkills.value])
  const allAvailableSkills = computed(() => [...platformSkills.value, ...customSkills.value])
  const skillCategories = computed(() => {
    const cats = new Set(platformSkills.value.map(s => s.category))
    customSkills.value.forEach(s => cats.add(s.category || '自定义'))
    return [...cats]
  })
  // Each enabled MCP server shows as ONE entry in the agent tool picker (server-level binding).
  // id format: `mcp:{serverId}` — at runtime AgentService expands this to all non-disabled tools of that server.
  // Per-tool exclusion is still controlled in McpManager via the server's disabled_tools list.
  const mcpTools = computed(() => {
    const out = []
    for (const s of mcpServers.value) {
      if (!s.enabled) continue
      const total = (s.tools_cache || []).length
      const disabled = (s.disabled_tools || []).length
      const active = Math.max(total - disabled, 0)
      const resources = (s.resources_cache || []).length
      const prompts = (s.prompts_cache || []).length
      const templates = (s.resource_templates_cache || []).length
      const capabilityTotal = active + resources + prompts + templates
      const desc = capabilityTotal === 0
        ? `MCP 远程服务器 · 未同步能力`
        : `MCP 远程服务器 · ${active} 工具 / ${resources} 资源 / ${prompts} 提示 / ${templates} 模板${disabled ? `（${disabled} 个工具已禁用）` : ''}`
      out.push({
        id: `mcp:${s.id}`,
        name: s.name,
        desc,
        description: desc,
        icon: 'ri-plug-line',
        color: '#10B981',
        cat: 'mcp',
        source: 'mcp',
        serverId: s.id,
        serverName: s.name,
        toolCount: active,
        resourceCount: resources,
        promptCount: prompts,
        templateCount: templates,
        builtin: false,
        enabled: true,
        permReq: '',
        archCompat: ['react', 'plan_exec', 'hybrid'],
        params: [],
        sandbox: `远程 MCP 服务器：${s.name}`,
      })
    }
    return out
  })

  async function loadMcpServers() {
    if (!window.electronAPI?.db?.mcpServers) return
    try {
      mcpServers.value = await window.electronAPI.db.mcpServers.list() || []
    } catch (e) {
      console.error('Failed to load MCP servers:', e)
    }
  }

  const toolList = computed(() => [...builtinTools.value, ...customTools.value, ...mcpTools.value])
  const enabledTools = computed(() => toolList.value.filter(t => t.enabled && !t.runtimeDisabled))
  const toolCategories = computed(() => {
    const cats = new Set(builtinTools.value.map(t => t.cat))
    customTools.value.forEach(t => cats.add(t.cat || 'custom'))
    return TOOL_CATEGORIES.filter(c => cats.has(c.key))
  })
  const customAgents = computed(() => agents.value.filter(a => !a.builtin))
  const builtinAgents = computed(() => agents.value.filter(a => a.builtin))
  const customCount = computed(() => customAgents.value.length)
  const builtinCount = computed(() => builtinAgents.value.length)
  const totalToolUses = computed(() => agents.value.reduce((n, a) => n + (a.tools?.length || 0), 0))
  const totalSkillUses = computed(() => agents.value.reduce((n, a) => n + (a.skills?.length || 0), 0))
  const totalSubUses = computed(() => agents.value.reduce((n, a) => n + ((a.subAgents || a.sub_agents || []).length), 0))

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      // Load built-in skills metadata from disk first
      await _loadBuiltinSkills()

      const [agentList, skillList, toolList, subAgentList] = await Promise.all([
        dbAgents().list(),
        dbSkills().list(),
        dbTools().list(),
        dbSubAgents().list(),
      ])
      const cleanedAgents = agentList.map(_stripRemovedToolRefs)
      agents.value = cleanedAgents
      customTools.value = toolList.map(normalizeCustomToolRecord)
      customSubAgents.value = subAgentList.map(normalizeSubAgentRecord)
      await _persistRemovedToolRefs(agentList, cleanedAgents)

      // Sync built-in skills to DB so agent runtime can read prompt_content.
      // This also picks up SKILL.md edits on disk between startups.
      await _ensureBuiltinSkillsInDb(skillList)

      // customSkills excludes source='platform' rows — those are surfaced via platformSkills
      // (single source of truth on disk). Avoids double-counting in market UI / agent picker.
      customSkills.value = skillList
        .filter(s => s.source !== 'platform')
        .map(s => ({ ...s, desc: s.desc || s.description || '' }))

      // Load MCP server configs + their cached tools (for agent tool picker)
      await loadMcpServers()

      _restorePlatformSkillEnabled()
      _restoreBuiltinToolEnabled()
      loaded.value = true
    } catch (e) {
      console.error('Failed to load agents from DB:', e)
    }
  }

  async function addAgent(agent) {
    // Validate english_name uniqueness
    if (agent.englishName && window.electronAPI?.db?.agents?.isEnglishNameUnique) {
      const isUnique = await dbAgents().isEnglishNameUnique(agent.englishName)
      if (!isUnique) throw new Error(`英文名称 "${agent.englishName}" 已被占用`)
    }
    const data = {
      name: agent.name || '未命名智能体',
      english_name: agent.englishName || '',
      description: agent.desc || '',
      icon: agent.icon || 'ri-sparkling-2-line',
      color: agent.color || '#A78BFA',
      architecture: 'react',
      builtin: false,
      permissions: agent.permissions || { fileRead: false, fileWrite: false, fileDelete: false, fileRename: false, noteRead: true, noteWrite: true, execCommand: true },
      tools: agent.tools || ['kb_search'],
      skills: agent.skills || [],
      sub_agents: agent.subAgents || [],
      prompt: agent.prompt || '',
      max_iterations: normalizeNonNegativeLimit(agent.maxIter ?? agent.maxIterations, 10),
      reflect_persist: false,
      planning_model: '',
      plan_steps: 5,
      complexity_classifier: false,
      model: agent.model || '',
      temperature: agent.temperature ?? 0.7,
      top_p: agent.topP ?? 1.0,
      max_tokens: agent.maxTokens || 4096,
      presence_penalty: agent.presencePenalty ?? 0,
      frequency_penalty: agent.frequencyPenalty ?? 0,
      thinking_mode: agent.thinkingMode || 'auto',
      thinking_intensity: agent.thinkingIntensity || 'medium',
      reviewer_model: agent.reviewerModel || '',
      use_same_model: agent.useSameModel ? 1 : 0,
      tool_call_limit: normalizeNonNegativeLimit(agent.toolCallLimit, 0),
      model_call_limit: normalizeNonNegativeLimit(agent.modelCallLimit, 0),
    }
    if (window.electronAPI?.db) {
      const result = await dbAgents().create(data)
      await loadFromDb()
      return agents.value.find(a => a.id === result.id)
    }
    const fallback = { id: Date.now(), ...data }
    agents.value.push(fallback)
    return fallback
  }

  async function updateAgent(id, data) {
    // Validate english_name uniqueness (excluding self)
    if (data.englishName && window.electronAPI?.db?.agents?.isEnglishNameUnique) {
      const isUnique = await dbAgents().isEnglishNameUnique(data.englishName, id)
      if (!isUnique) throw new Error(`英文名称 "${data.englishName}" 已被占用`)
    }
    const mapped = {
      name: data.name, english_name: data.englishName, description: data.desc, icon: data.icon, color: data.color,
      architecture: 'react', builtin: data.builtin,
      permissions: data.permissions, tools: data.tools, skills: data.skills,
      sub_agents: data.subAgents, prompt: data.prompt,
      max_iterations: normalizeNonNegativeLimit(data.maxIter ?? data.maxIterations, undefined), reflect_persist: false,
      planning_model: '', plan_steps: 5,
      complexity_classifier: false,
      model: data.model, temperature: data.temperature,
      top_p: data.topP, max_tokens: data.maxTokens,
      presence_penalty: data.presencePenalty, frequency_penalty: data.frequencyPenalty,
      thinking_mode: data.thinkingMode, thinking_intensity: data.thinkingIntensity,
      reviewer_model: data.reviewerModel, use_same_model: data.useSameModel,
      tool_call_limit: normalizeNonNegativeLimit(data.toolCallLimit, undefined), model_call_limit: normalizeNonNegativeLimit(data.modelCallLimit, undefined),
    }
    if (window.electronAPI?.db) await dbAgents().update(id, mapped)
    await loadFromDb()
  }

  async function removeAgent(id) {
    if (window.electronAPI?.db) await dbAgents().delete(id)
    agents.value = agents.value.filter(a => a.id !== id)
  }

  function duplicateAgent(agent) {
    const copy = { ...JSON.parse(JSON.stringify(agent)) }
    copy.name = `${agent.name} (副本)`
    copy.englishName = ''
    copy.builtin = false
    delete copy.id
    return addAgent(copy)
  }

  async function addSkill(skill) {
    const raw = JSON.parse(JSON.stringify(skill))
    const baseId = raw.englishName || slugify(raw.name) || 'skill-' + Date.now()
    function slugify(val) { return (val || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').trim() }
    const finalId = baseId
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(finalId)) throw new Error('Skill ID 只能使用英文小写、数字和连字符')
    if (skillList.value.some(item => item.id === finalId)) throw new Error(`Skill ID "${finalId}" 已存在`)
    const data = {
      id: finalId,
      name: raw.name || '未命名 Skill',
      icon: raw.icon || '🧠',
      color: raw.color || '#6C8AFF',
      description: raw.desc || raw.description || '',
      prompt_template: raw.promptTemplate || raw.promptContent || '',
      prompt_content: raw.promptContent || raw.promptTemplate || '',
      category: raw.category || '',
      source: 'custom',
      version: raw.version || '', author: raw.author || '', license: raw.license || '',
      allowed_tools: raw.allowedTools || [], output_types: raw.outputTypes || [],
      enabled: 1, builtin: 0,
    }
    if (window.electronAPI?.db) {
      const result = await window.electronAPI?.skill?.create?.(finalId, JSON.parse(JSON.stringify({ ...data, promptContent: data.prompt_content })))
      if (!result?.success) throw new Error(result?.error || 'Skill 创建失败')
      await loadFromDb()
      return result.data
    }
    const fallback = { id: finalId, ...data, builtin: false, usedBy: [], desc: data.description }
    customSkills.value.push(fallback)
    return fallback
  }

  async function updateSkill(id, data) {
    const existing = customSkills.value.find(skill => skill.id === id)
    if (!existing || existing.source === 'platform' || existing.builtin) throw new Error('内置 Skill 不能编辑')
    const raw = JSON.parse(JSON.stringify(data))
    const mapped = {
      name: raw.name,
      icon: raw.icon,
      color: raw.color,
      description: raw.desc || raw.description,
      prompt_template: raw.promptTemplate || raw.promptContent,
      prompt_content: raw.promptContent || raw.promptTemplate,
      category: raw.category,
      source: 'custom',
    }
    for (const k of Object.keys(mapped)) {
      if (mapped[k] === undefined) delete mapped[k]
    }
    const result = await window.electronAPI?.skill?.save?.(id, JSON.parse(JSON.stringify({ ...existing, ...mapped, promptContent: mapped.prompt_content })))
    if (!result?.success) throw new Error(result?.error || 'Skill 保存失败')
    await loadFromDb()
  }

  async function removeSkill(id, options = {}) {
    const existing = customSkills.value.find(skill => skill.id === id)
    if (!existing || existing.source === 'platform' || existing.builtin) return { success: false, code: 'BUILTIN_SKILL', error: '内置 Skill 不能删除' }
    const result = window.electronAPI?.skill?.delete
      ? await window.electronAPI.skill.delete(id, options)
      : window.electronAPI?.db ? await dbSkills().delete(id, options) : { success: true }
    if (!result?.success) return result
    await loadFromDb()
    return result
  }

  async function importSkill(sessionId, options = {}) {
    const result = await window.electronAPI?.skill?.importSource?.(sessionId, JSON.parse(JSON.stringify(options)))
    if (!result?.success) return result || { success: false, error: 'Skill 导入失败' }
    await loadFromDb()
    return result
  }

  async function addTool(tool) {
    const data = customToolToDbPayload({ ...tool, enabled: tool.enabled ?? 1 })
    if (window.electronAPI?.db) {
      const result = await dbTools().create(data)
      customTools.value.push(normalizeCustomToolRecord({ id: result.id, ...data, builtin: false, usedBy: [] }))
      return result
    }
    const fallback = normalizeCustomToolRecord({ id: 'tool_' + Date.now(), ...data, builtin: false, usedBy: [] })
    customTools.value.push(fallback)
    return fallback
  }

  async function updateTool(id, data) {
    const mapped = customToolToDbPayload(data, { partial: true })
    if (window.electronAPI?.db) await dbTools().update(id, mapped)
    const idx = customTools.value.findIndex(t => t.id === id)
    if (idx !== -1) customTools.value[idx] = normalizeCustomToolRecord({ ...customTools.value[idx], ...mapped, ...data })
  }

  async function removeTool(id) {
    if (window.electronAPI?.db) await dbTools().delete(id)
    customTools.value = customTools.value.filter(t => t.id !== id)
  }

  async function addSubAgent(sub) {
    const desc = sub.desc || sub.description || ''
    const data = {
      name: sub.name || '未命名 SubAgent',
      icon: sub.icon || 'ri-team-line',
      color: sub.color || '#6C8AFF',
      description: desc,
      prompt: sub.prompt || '',
      tools: sub.tools || [],
      skills: sub.skills || [],
      model: sub.model || '',
      temperature: sub.temperature ?? 0.7,
    }
    if (window.electronAPI?.db) {
      const result = await dbSubAgents().create(data)
      customSubAgents.value.push({ id: result.id, ...data, desc, builtin: false, enabled: true, abilities: [] })
      return result
    }
    const fallback = { id: 'sub_' + Date.now(), ...data, desc, builtin: false, enabled: true, abilities: [] }
    customSubAgents.value.push(fallback)
    return fallback
  }

  async function updateSubAgent(id, data) {
    // Normalize desc/description for DB
    const dbData = { ...data }
    if (dbData.desc && !dbData.description) dbData.description = dbData.desc
    if (window.electronAPI?.db) await dbSubAgents().update(id, dbData)
    const idx = customSubAgents.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      const desc = dbData.desc || dbData.description || ''
      customSubAgents.value[idx] = { ...customSubAgents.value[idx], ...dbData, desc }
    }
  }

  async function removeSubAgent(id) {
    if (window.electronAPI?.db) await dbSubAgents().delete(id)
    customSubAgents.value = customSubAgents.value.filter(s => s.id !== id)
  }

  // ─── Health Check ───
  const healthCheckResults = ref({})
  const healthChecking = ref(false)
  const healthCheckingIds = ref([])

  async function runHealthCheck(agentIds) {
    healthChecking.value = true
    healthCheckingIds.value = [...agentIds]
    for (const id of agentIds) {
      healthCheckResults.value[id] = { status: 'checking', results: {}, checkedAt: null }
    }
    try {
      const results = await window.electronAPI.agent.healthCheck(agentIds, {
        toolProviderConfigMap: JSON.parse(JSON.stringify(toolProviderConfigMap.value || {})),
      })
      for (const r of results) {
        healthCheckResults.value[r.agentId] = r
      }
    } catch (e) {
      console.error('Health check failed:', e)
      for (const id of agentIds) {
        if (healthCheckResults.value[id]?.status === 'checking') {
          healthCheckResults.value[id] = { status: 'not_ready', results: {}, checkedAt: Date.now(), agentId: id }
        }
      }
    }
    healthChecking.value = false
    healthCheckingIds.value = []
  }

  function clearHealthCheck(agentId) {
    if (agentId) delete healthCheckResults.value[agentId]
    else healthCheckResults.value = {}
  }

  return {
    agents, platformSkills, platformSkillEnabledMap, allAvailableSkills, skillCategories, customSkills, skillList,
    builtinTools, customTools, toolList, enabledTools, toolCategories,
    toolEnabledMap, toolProviderConfigMap,
    mcpServers, mcpTools, loadMcpServers,
    builtinSubAgents, customSubAgents, subAgentList, loaded,
    customAgents, builtinAgents, customCount, builtinCount,
    totalToolUses, totalSkillUses, totalSubUses,
    TOOL_CATEGORIES,
    healthCheckResults, healthChecking, healthCheckingIds,
    loadFromDb, addAgent, updateAgent, removeAgent, duplicateAgent,
    togglePlatformSkill, toggleBuiltinTool, _isConfigured, updateToolProviderConfig,
    addSkill, updateSkill, removeSkill, importSkill,
    addTool, updateTool, removeTool,
    addSubAgent, updateSubAgent, removeSubAgent,
    runHealthCheck, clearHealthCheck,
  }
}, {
  persist: {
    pick: ['agents', 'customSkills', 'customTools', 'customSubAgents', 'platformSkillEnabledMap', 'toolEnabledMap', 'toolProviderConfigMap'],
  },
})

