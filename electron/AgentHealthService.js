// electron/AgentHealthService.js — Agent health check service

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from './officeCliResolver.js'
import { getSystemEnv } from './systemEnv.js'

function parseJSON(field) {
  if (!field || field === 'null' || field === 'undefined') return null
  try { return JSON.parse(field) } catch { return null }
}

const MODEL_REF_SEPARATOR = '::'
function parseModelRef(ref) {
  const value = String(ref || '')
  const idx = value.indexOf(MODEL_REF_SEPARATOR)
  if (idx <= 0) return { providerId: '', modelId: value, scoped: false }
  return {
    providerId: value.slice(0, idx),
    modelId: value.slice(idx + MODEL_REF_SEPARATOR.length),
    scoped: true,
  }
}

function normalizeSubAgentKey(value) {
  return String(value || '')
    .trim()
    .replace(/^sa_/i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

function subAgentKeys(subAgent) {
  const rawKeys = [
    subAgent?.id,
    subAgent?.name,
    subAgent?.key,
    subAgent?.runtimeName,
    subAgent?.englishName,
    subAgent?.english_name,
    ...(Array.isArray(subAgent?.aliases) ? subAgent.aliases : []),
  ]
  return new Set(rawKeys.map(normalizeSubAgentKey).filter(Boolean))
}

export class AgentHealthService {
  constructor(dbService, skillService) {
    this._db = dbService
    this._skill = skillService
  }

  _getProviders() {
    try {
      const raw = this._db._db.prepare("SELECT value FROM settings WHERE key = 'providers'").get()
      return raw ? (parseJSON(raw.value) || []) : []
    } catch { return [] }
  }

  async checkAgent(agentId, options = {}) {
    const agent = this._db.getAgent(agentId)
    if (!agent) return { agentId, status: 'not_found', results: {}, checkedAt: Date.now() }

    const results = {
      model: await this._checkModel(agent),
      reviewerModel: this._checkReviewerModel(agent),
      tools: await this._checkTools(agent, options),
      skills: this._checkSkills(agent),
      subAgents: this._checkSubAgents(agent),
    }

    const status = this._computeStatus(results)
    return { agentId, agentName: agent.name, status, results, checkedAt: Date.now() }
  }

  async checkAgents(agentIds, options = {}) {
    const results = []
    for (const id of agentIds) {
      results.push(await this.checkAgent(id, options))
    }
    return results
  }

  async _checkModel(agent) {
    const modelRef = agent.model || this._getDefaultModel('agent')
    const modelId = parseModelRef(modelRef).modelId
    if (!modelId) return { passed: false, severity: 'critical', message: '未配置执行模型且无全局默认' }

    const provider = this._findProviderForModel(modelRef)
    if (!provider) return { passed: false, severity: 'critical', message: `模型 ${modelId} 无可用 Provider 或未启用` }
    if (!provider.apiKey) return { passed: false, severity: 'critical', message: `${provider.name} API Key 未设置` }

    try {
      const testResult = await this._testModelConnection(provider, modelId)
      if (!testResult.success) return { passed: false, severity: 'critical', message: `模型连接失败: ${testResult.error}` }
      return { passed: true, message: `${modelId} (${provider.name}) 可用，延迟 ${testResult.latency}ms` }
    } catch (e) {
      return { passed: true, severity: 'warning', message: `${modelId} (${provider.name}) 已配置，但连接测试失败（${e.message}）` }
    }
  }

  _checkReviewerModel(agent) {
    if (agent.useSameModel) return { passed: true, message: '审查模型与执行模型相同' }
    if (!agent.reviewerModel) return { passed: true, message: '纯代码审查模式（无视觉模型）' }

    const reviewer = parseModelRef(agent.reviewerModel)
    const provider = this._findProviderForModel(agent.reviewerModel)
    if (!provider) return { passed: false, severity: 'warning', message: `审查模型 ${reviewer.modelId} 无可用 Provider` }
    if (!provider.apiKey) return { passed: false, severity: 'warning', message: `审查模型 Provider ${provider.name} API Key 未设置` }

    const modelObj = this._findModelInProvider(provider, reviewer.modelId)
    const hasVision = modelObj?.capabilities?.vision || false
    return { passed: true, message: `${reviewer.modelId} (${provider.name}) ${hasVision ? '具备视觉能力' : '不具备视觉能力（将降级为代码审查）'}` }
  }

  async _checkTools(agent, options = {}) {
    const tools = this._getEffectiveToolIds(agent)
    if (!tools.length) return { passed: true, message: '无工具依赖' }

    const toolProviderConfigMap = this._getToolProviderConfigs(options)
    const builtinTools = this._getBuiltinTools()
    const customTools = this._getCustomTools()
    const issues = []

    if (tools.includes('office_write') && agent?.permissions?.fileWrite !== true && agent?.permissions?.fileWrite !== 1) {
      issues.push({ severity: 'warning', message: '工具 Office 创建编辑 (office_write) 需要开启“文件写入”权限' })
    }

    for (const toolId of tools) {
      const builtinTool = builtinTools.find(t => t.id === toolId)
      if (builtinTool) {
        if (builtinTool.needsConfig) {
          const config = { ...(builtinTool.providerConfig || {}), ...(toolProviderConfigMap[toolId] || {}) }
          if (!this._isBuiltinToolConfigured(builtinTool, config)) {
            issues.push({ severity: 'warning', message: `工具 ${builtinTool.name} (${toolId}) 需要配置但尚未完成` })
          }
        }

        if (builtinTool.requires?.length) {
          const missing = []
          for (const cmd of builtinTool.requires) {
            const check = await this._checkCommand(cmd, this._getCommandVersionArgs(cmd))
            if (!check.installed) missing.push(cmd)
          }
          if (missing.length) {
            issues.push({
              severity: 'warning',
              message: `工具 ${builtinTool.name} 缺少本机依赖：${missing.join(', ')}。请到“设置 > 环境管理”安装或修复。`,
            })
          }
        }
        continue
      }

      if (toolId.startsWith('mcp:')) {
        const issue = this._checkMcpTool(toolId)
        if (issue) issues.push(issue)
        continue
      }

      const customTool = customTools.find(t => t.id === toolId)
      if (!customTool) {
        issues.push({ severity: 'warning', message: `工具 ${toolId} 不存在或已被删除` })
        continue
      }
      if (customTool.enabled === false) {
        issues.push({ severity: 'warning', message: `工具 ${customTool.name || toolId} 已禁用` })
      }
      if ((customTool.type || 'api') === 'api' && !(customTool.api_url || customTool.apiUrl)) {
        issues.push({ severity: 'warning', message: `自定义 API 工具 ${customTool.name || toolId} 缺少 API URL` })
      }
      if (customTool.type === 'script') {
        issues.push({ severity: 'warning', message: `自定义脚本工具 ${customTool.name || toolId} 暂未开放运行，请改用自定义 API 工具` })
        continue
      }
    }

    if (issues.length) return { passed: false, severity: 'warning', issues, message: `${issues.length} 个工具未就绪` }
    return { passed: true, message: `${tools.length} 个工具全部就绪（含系统默认工具）` }
  }

  _checkSkills(agent) {
    const skills = agent.skills || []
    if (!skills.length) return { passed: true, message: '无技能依赖' }

    const issues = []
    for (const skillId of skills) {
      const spec = this._skill.validateSkillSpec?.(skillId)
      const installed = spec ? spec.installed : this._skill.isInstalled(skillId)
      if (!installed) {
        issues.push({ severity: 'warning', message: `技能 ${skillId} 未安装` })
        continue
      }
      if (spec && !spec.valid) {
        for (const issue of spec.issues || []) {
          issues.push({ severity: 'warning', message: `技能 ${skillId} 不符合 Agent Skills 规范：${issue}` })
        }
      }
    }

    if (issues.length) return { passed: false, severity: 'warning', issues, message: `${issues.length} 个技能问题` }
    return { passed: true, message: `${skills.length} 个技能已安装且符合 Agent Skills 规范` }
  }

  _checkSubAgents(agent) {
    const subAgents = [...new Set([
      ...(Array.isArray(agent.subAgents) ? agent.subAgents : []),
      ...(Array.isArray(agent.sub_agents) ? agent.sub_agents : []),
    ])]
    if (!subAgents.length) return { passed: true, message: '无子 Agent 依赖' }

    const allSubAgents = this._db.listSubAgents()
    const builtinSubAgents = this._getBuiltinSubAgents()
    const issues = []

    for (const saId of subAgents) {
      const target = normalizeSubAgentKey(saId)
      const exists = [...allSubAgents, ...builtinSubAgents].find(s => subAgentKeys(s).has(target))
      if (!exists) {
        issues.push({ severity: 'warning', message: `子 Agent ${saId} 不存在` })
      }
    }

    if (issues.length) return { passed: false, severity: 'warning', issues, message: `${issues.length} 个子 Agent 不存在` }
    return { passed: true, message: `${subAgents.length} 个子 Agent 就绪` }
  }

  _computeStatus(results) {
    const criticals = Object.values(results).filter(r => r.severity === 'critical' && !r.passed)
    const warnings = Object.values(results).filter(r => r.severity === 'warning' && !r.passed)
    if (criticals.length) return 'not_ready'
    if (warnings.length) return 'partial'
    return 'ready'
  }

  // ─── Helpers ───

  _findProviderForModel(modelRef) {
    const { providerId, modelId, scoped } = parseModelRef(modelRef)
    const providers = this._getProviders()
    if (!modelId) return null
    if (scoped) {
      const p = providers.find(p => p.id === providerId)
      if (!p?.enabled) return null
      return p.models?.find(m => m.id === modelId && m.enabled) ? p : null
    }
    for (const p of providers) {
      if (!p.enabled) continue
      const m = p.models?.find(m => m.id === modelId && m.enabled)
      if (m) return p
    }
    return null
  }

  _findModelInProvider(provider, modelId) {
    return provider?.models?.find(m => m.id === modelId) || null
  }

  _getDefaultModel(role) {
    try {
      const raw = this._db._db.prepare("SELECT value FROM settings WHERE key = 'defaultModels'").get()
      const defaults = raw ? parseJSON(raw.value) : {}
      return defaults?.[role] || ''
    } catch { return '' }
  }

  _getToolProviderConfigs(options = {}) {
    if (options?.toolProviderConfigMap && typeof options.toolProviderConfigMap === 'object') {
      return options.toolProviderConfigMap
    }
    try {
      const raw = this._db._db.prepare("SELECT value FROM settings WHERE key = 'toolProviderConfigMap'").get()
      return raw ? (parseJSON(raw.value) || {}) : {}
    } catch {
      return {}
    }
  }

  _getBuiltinTools() {
    return [
      { id: 'web_search_tavily', name: 'Tavily 搜索', needsConfig: true, needsKey: true, providerConfig: { defaultUrl: 'https://api.tavily.com' } },
      { id: 'web_search_searxng', name: 'SearXNG 搜索', needsConfig: true, needsKey: 'optional', providerConfig: { defaultUrl: 'https://searx.be' } },
      { id: 'web_search_bing', name: 'Bing 搜索', needsConfig: false },
      { id: 'file_read', name: '文件读取', needsConfig: false },
      { id: 'office_read', name: 'Office 读取', needsConfig: false, requires: ['officecli'] },
      { id: 'office_write', name: 'Office 创建编辑', needsConfig: false, requires: ['officecli'] },
      { id: 'pdf_read', name: 'PDF 读取', needsConfig: false, requires: ['pypdf'] },
      { id: 'ffmpeg:*', name: 'FFmpeg 工具集', needsConfig: false, requires: ['ffmpeg', 'ffprobe'] },
      { id: 'pandoc:*', name: 'Pandoc 工具集', needsConfig: false, requires: ['pandoc'] },
      { id: 'manim:*', name: 'Manim 动画工具集', needsConfig: false, requires: ['manim', 'ffmpeg'] },
      { id: 'file_write', name: '文件写入', needsConfig: false },
      { id: 'pptx_export_local', name: 'PPTX 本地导出', needsConfig: false },
      { id: 'file_list', name: '文件列表', needsConfig: false },
      { id: 'file_rename', name: '文件重命名', needsConfig: false },
      { id: 'exec_command', name: '执行命令', needsConfig: false },
      { id: 'kb_search', name: '知识库检索', needsConfig: false },
      { id: 'calculator', name: '科学计算器', needsConfig: false },
      { id: 'file_delete', name: '文件删除', needsConfig: false },
    ]
  }

  _getBuiltinSubAgents() {
    return [
      { id: 'Reader', name: 'Reader', aliases: ['reader'] },
      { id: 'Summarizer', name: 'Summarizer', aliases: ['summarizer'] },
      { id: 'Quiz', name: 'Quiz', aliases: ['quiz'] },
      { id: 'Review Planner', name: 'Review Planner', aliases: ['review_planner', 'review-planner'] },
      { id: 'researcher', name: 'Researcher', aliases: ['web-researcher', 'sa_web-researcher'] },
      { id: 'local-analyst', name: 'Local Analyst', aliases: ['local_analyst', 'sa_local-analyst'] },
      { id: 'writer', name: 'Writer', aliases: ['report-writer', 'sa_report-writer'] },
      { id: 'content-planner', name: 'Content Planner', aliases: ['sa_content-planner'] },
      { id: 'slide-builder', name: 'Slide Builder', aliases: ['sa_slide-builder'] },
      { id: 'pptx-exporter', name: 'PPTX Exporter', aliases: ['sa_pptx-exporter'] },
      { id: 'reviewer', name: 'Reviewer', aliases: ['visual-reviewer', 'sa_visual-reviewer'] },
      { id: 'flashcard-generator', name: 'Flashcard Generator', aliases: ['flashcard_generator'], tools: ['file_read', 'file_write', 'kb_search'] },
      { id: 'quiz-generator', name: 'Quiz Generator', aliases: ['quiz_generator'], tools: ['file_read', 'file_write', 'kb_search'] },
      { id: 'study-planner', name: 'Study Planner', aliases: ['study_planner'] },
    ]
  }

  async _testModelConnection(provider, modelId) {
    const apiKey = provider.apiKey
    const isAnthropic = (provider.apiFormat || '').toLowerCase() === 'anthropic' || provider.id === 'anthropic'
    const baseUrl = (provider.baseUrl || (isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '')
    let timer = null

    try {
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), 10000)
      const url = baseUrl + (isAnthropic ? '/messages' : '/chat/completions')
      const body = JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
      const headers = isAnthropic
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
        : { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' }

      const start = Date.now()
      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
      clearTimeout(timer)
      const latency = Date.now() - start
      if (response.ok) return { success: true, latency }
      const text = await response.text().catch(() => '')
      return { success: false, error: `HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}` }
    } catch (e) {
      return { success: false, error: e.name === 'AbortError' ? 'timeout' : e.message }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  _getEffectiveToolIds(agent) {
    const toolIds = Array.isArray(agent?.tools) ? [...agent.tools] : []
    const skillIds = Array.isArray(agent?.skills) ? [...agent.skills] : []
    const subAgents = [...new Set([
      ...(Array.isArray(agent?.subAgents) ? agent.subAgents : []),
      ...(Array.isArray(agent?.sub_agents) ? agent.sub_agents : []),
    ])]
    if (subAgents.length) {
      const allSubAgents = [...this._db.listSubAgents(), ...this._getBuiltinSubAgents()]
      for (const saId of subAgents) {
        const target = normalizeSubAgentKey(saId)
        const sa = allSubAgents.find(s => subAgentKeys(s).has(target))
        if (Array.isArray(sa?.tools)) toolIds.push(...sa.tools)
        if (Array.isArray(sa?.skills)) skillIds.push(...sa.skills)
      }
    }
    toolIds.push(...this._skillAllowedTools(skillIds))
    return [...new Set([...toolIds.filter(Boolean), 'office_read', 'pdf_read'])]
  }

  _normalizeSkillId(skillId) {
    return String(skillId || '')
      .replace(/\\/g, '/')
      .replace(/^\/?skills\//i, '')
      .replace(/\/+$/, '')
      .trim()
  }

  _readJsonIfExists(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  _skillAllowedTools(skillIds) {
    const ids = [...new Set((skillIds || []).map(id => this._normalizeSkillId(id)).filter(Boolean))]
    if (!ids.length) return []

    let dbSkills = []
    try {
      dbSkills = this._db?.listSkills?.() || []
    } catch {
      dbSkills = []
    }

    const allowed = []
    for (const skillId of ids) {
      const skillDir = this._skill?.getSkillDir?.(skillId)
      const config = this._readJsonIfExists(skillDir ? `${skillDir}/config.json` : '')
      const dbSkill = dbSkills.find(s => this._normalizeSkillId(s?.id) === skillId)
      for (const source of [config, dbSkill]) {
        const tools = source?.allowedTools || source?.allowed_tools
        if (Array.isArray(tools)) allowed.push(...tools.filter(Boolean))
      }
    }
    return [...new Set(allowed.map(String))]
  }

  _isBuiltinToolConfigured(tool, config) {
    if (!tool.needsConfig) return true
    if (!config) return false
    if (tool.needsKey === true && !config.apiKey) return false
    if (tool.needsKey !== true && !config.baseUrl && !config.defaultUrl) return false
    return true
  }

  _getCustomTools() {
    try {
      return this._db.listTools()
    } catch {
      return []
    }
  }

  _checkMcpTool(toolId) {
    const serverId = toolId.slice('mcp:'.length)
    const server = this._db.getMcpServer(serverId)
    if (!server) return { severity: 'warning', message: `MCP 工具服务器 ${serverId} 不存在` }
    if (!server.enabled) return { severity: 'warning', message: `MCP 工具服务器 ${server.name || serverId} 已禁用` }

    const total = Array.isArray(server.tools_cache) ? server.tools_cache.length : 0
    const resourceTotal = Array.isArray(server.resources_cache) ? server.resources_cache.length : 0
    const templateTotal = Array.isArray(server.resource_templates_cache) ? server.resource_templates_cache.length : 0
    const promptTotal = Array.isArray(server.prompts_cache) ? server.prompts_cache.length : 0
    const capabilityTotal = total + resourceTotal + templateTotal + promptTotal
    const disabled = Array.isArray(server.disabled_tools) ? server.disabled_tools.length : 0
    const active = Math.max(total - disabled, 0)
    if (capabilityTotal === 0) return { severity: 'warning', message: `MCP 服务器 ${server.name || serverId} 尚未同步能力` }
    if (active === 0 && (resourceTotal > 0 || templateTotal > 0 || promptTotal > 0)) return null
    if (active === 0) return { severity: 'warning', message: `MCP 工具服务器 ${server.name || serverId} 没有可用工具` }

    const status = String(server.last_status || '').toLowerCase()
    if (status && !['ok', 'ready', 'connected', 'success'].includes(status)) {
      return { severity: 'warning', message: `MCP 工具服务器 ${server.name || serverId} 最近状态异常：${server.last_error || server.last_status}` }
    }
    return null
  }

  _getCommandVersionArgs(cmd) {
    if (cmd === 'ffmpeg' || cmd === 'ffprobe') return ['-version']
    return ['--version']
  }

  async _checkCommand(cmd, args) {
    let attempts
    if (cmd === 'officecli') {
      attempts = getOfficeCliCommandCandidates(args)
    } else if (cmd === 'pypdf') {
      const code = 'import pypdf; print(getattr(pypdf, "__version__", "pypdf"))'
      attempts = [
        { cmd: 'python', args: ['-c', code], shell: false },
        { cmd: 'py', args: ['-3', '-c', code], shell: false },
        { cmd: 'py', args: ['-c', code], shell: false },
        { cmd: 'python3', args: ['-c', code], shell: false },
      ]
    } else if (cmd === 'manim') {
      attempts = [
        { cmd: 'python', args: ['-m', 'manim', ...args] },
        { cmd: 'py', args: ['-3', '-m', 'manim', ...args] },
        { cmd: 'py', args: ['-m', 'manim', ...args] },
        { cmd: 'python3', args: ['-m', 'manim', ...args] },
        { cmd: 'manim', args },
        { cmd: 'manimce', args },
      ]
    } else {
      attempts = [{ cmd, args }]
    }

    const baseEnv = await getSystemEnv()
    const env = cmd === 'officecli' ? getOfficeCliSpawnEnv(baseEnv) : baseEnv
    return new Promise((resolve) => {
      const run = (index) => {
        const attempt = attempts[index]
        if (!attempt) return resolve({ installed: false })
        try {
          const child = spawn(attempt.cmd, attempt.args, { env, shell: attempt.shell !== false, windowsHide: true })
          let settled = false
          let timer = null
          const finish = (result) => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            if (result.installed) resolve(result)
            else run(index + 1)
          }
          timer = setTimeout(() => {
            try { child.kill() } catch {}
            finish({ installed: false, error: 'timeout' })
          }, 5000)
          child.on('error', e => finish({ installed: false, error: e.message }))
          child.on('close', code => finish({ installed: code === 0 }))
        } catch {
          run(index + 1)
        }
      }
      run(0)
    })
  }
}
