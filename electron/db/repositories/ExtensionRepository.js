import { dynamicUpdate, parseJSON, stringifyJSON } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class ExtensionRepository extends BaseRepository {
  listSkills() {
    return this.db.prepare('SELECT * FROM custom_skills ORDER BY created_at').all()
      .map(row => this._parseSkill(row))
  }

  createSkill(data) {
    const id = data.id || 'skill_' + Date.now()
    this.db.prepare(`INSERT INTO custom_skills (id, name, icon, color, description, detail, prompt_template, prompt_content, output_types, allowed_tools, source, category, version, author, license, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-flashlight-line', data.color || '#6C8AFF',
      data.description || '', data.detail || '',
      data.prompt_template || data.promptContent || '', data.prompt_content || data.promptContent || '',
      stringifyJSON(data.output_types || ['Markdown']),
      stringifyJSON(data.allowed_tools || []),
      data.source || 'custom', data.category || '',
      data.version || '1.0', data.author || '',
      data.license || '', data.builtin ? 1 : 0, data.enabled ? 1 : 0)
    return this._parseSkill(this.db.prepare('SELECT * FROM custom_skills WHERE id = ?').get(id))
  }

  updateSkill(id, data) {
    return dynamicUpdate(this.db, 'custom_skills', id, data, ['output_types', 'allowed_tools'])
  }

  deleteSkill(id) {
    this.db.prepare('DELETE FROM custom_skills WHERE id = ?').run(id)
    return { success: true }
  }

  listTools() {
    return this.db.prepare('SELECT * FROM custom_tools ORDER BY created_at').all()
      .map(row => ({ ...row, builtin: !!row.builtin, enabled: !!row.enabled, headers: parseJSON(row.headers), params: parseJSON(row.params), arch_compat: parseJSON(row.arch_compat), provider_config: parseJSON(row.provider_config) }))
  }

  createTool(data) {
    const id = data.id || 'tool_' + Date.now()
    this.db.prepare(`INSERT INTO custom_tools (id, name, icon, color, category, description, type, api_url, method, headers, params, response_format, script_path, sandbox, perm_required, arch_compat, builtin, enabled, provider_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-tools-line', data.color || '#4ADE80', data.category || 'custom', data.description || '',
      data.type || 'api', data.api_url || '', data.method || 'POST', stringifyJSON(data.headers || {}),
      stringifyJSON(data.params || []), data.response_format || 'JSON', data.script_path || '',
      data.sandbox || '', data.perm_required || '', stringifyJSON(data.arch_compat || ['react', 'plan_exec', 'hybrid']),
      0, data.enabled === false || data.enabled === 0 ? 0 : 1, stringifyJSON(data.provider_config || {}))
    return { id, ...data }
  }

  updateTool(id, data) {
    dynamicUpdate(this.db, 'custom_tools', id, data, ['headers', 'params', 'arch_compat', 'provider_config'])
    return { success: true }
  }

  deleteTool(id) {
    this.db.prepare('DELETE FROM custom_tools WHERE id = ?').run(id)
    return { success: true }
  }

  listMcpServers() {
    return this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all()
      .map(row => this._parseMcpServer(row))
  }

  getMcpServer(id) {
    return this._parseMcpServer(this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id))
  }

  createMcpServer(data) {
    const id = data.id || 'mcp_' + Date.now()
    this.db.prepare(`INSERT INTO mcp_servers (id, name, transport, url, headers, enabled, disabled_tools, last_status, last_error, last_synced_at, tools_cache, resources_cache, resource_templates_cache, prompts_cache, capabilities_cache, server_info_cache, instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.transport || 'http', data.url || '',
      stringifyJSON(data.headers || {}), data.enabled === false ? 0 : 1,
      stringifyJSON(data.disabled_tools || []),
      '', '', '',
      stringifyJSON(data.tools_cache || []),
      stringifyJSON(data.resources_cache || []),
      stringifyJSON(data.resource_templates_cache || []),
      stringifyJSON(data.prompts_cache || []),
      stringifyJSON(data.capabilities_cache || {}),
      stringifyJSON(data.server_info_cache || {}),
      data.instructions || '')
    return { id, ...data }
  }

  updateMcpServer(id, data) {
    dynamicUpdate(this.db, 'mcp_servers', id, data, ['headers', 'disabled_tools', 'tools_cache', 'resources_cache', 'resource_templates_cache', 'prompts_cache', 'capabilities_cache', 'server_info_cache'])
    return { success: true }
  }

  deleteMcpServer(id) {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
    return { success: true }
  }

  listSubAgents() {
    return this.db.prepare('SELECT * FROM custom_sub_agents ORDER BY created_at').all()
      .map(row => ({ ...row, builtin: !!row.builtin, enabled: !!row.enabled, tools: parseJSON(row.tools), skills: parseJSON(row.skills) }))
  }

  createSubAgent(data) {
    const id = data.id || 'sub_' + Date.now()
    this.db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-team-line', data.color || '#6C8AFF',
      data.description || '', data.prompt || '',
      stringifyJSON(data.tools || []), stringifyJSON(data.skills || []),
      data.model || '', data.temperature ?? 0.7, 0, 1)
    return { id, ...data }
  }

  updateSubAgent(id, data) {
    dynamicUpdate(this.db, 'custom_sub_agents', id, data, ['tools', 'skills'])
    return { success: true }
  }

  deleteSubAgent(id) {
    this.db.prepare('DELETE FROM custom_sub_agents WHERE id = ?').run(id)
    return { success: true }
  }

  _parseSkill(row) {
    if (!row) return null
    return {
      id: row.id, name: row.name, icon: row.icon, color: row.color,
      description: row.description || '', detail: row.detail || '',
      promptTemplate: row.prompt_template || row.prompt_content || '',
      promptContent: row.prompt_content || row.prompt_template || '',
      outputTypes: parseJSON(row.output_types),
      allowedTools: parseJSON(row.allowed_tools || '[]'),
      source: row.source || 'custom', category: row.category || '',
      version: row.version || '1.0', author: row.author || '',
      license: row.license || '', enabled: !!row.enabled,
      builtin: !!row.builtin,
    }
  }

  _parseMcpServer(row) {
    if (!row) return null
    return {
      ...row,
      enabled: !!row.enabled,
      headers: parseJSON(row.headers),
      disabled_tools: parseJSON(row.disabled_tools),
      tools_cache: parseJSON(row.tools_cache),
      resources_cache: parseJSON(row.resources_cache),
      resource_templates_cache: parseJSON(row.resource_templates_cache),
      prompts_cache: parseJSON(row.prompts_cache),
      capabilities_cache: parseJSON(row.capabilities_cache),
      server_info_cache: parseJSON(row.server_info_cache),
    }
  }
}
