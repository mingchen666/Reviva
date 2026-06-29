// electron/DatabaseService.js — Database service class wrapping better-sqlite3
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let BetterSqlite3
try {
  BetterSqlite3 = require('better-sqlite3')
} catch (e) {
  console.error('Failed to load better-sqlite3:', e.message)
  BetterSqlite3 = null
}

const DB_FILE_NAME = 'reviva.db'
const WORKSPACE_META_DIR = '.reviva'

function parseJSON(field) {
  if (field === null || field === undefined) return field
  if (typeof field !== 'string') return field
  try { return JSON.parse(field) } catch { return field }
}

function stringifyJSON(field) {
  if (field === undefined || field === null) return '{}'
  return typeof field === 'string' ? field : JSON.stringify(field)
}

const AGENT_JSON_FIELDS = ['permissions', 'tools', 'skills', 'sub_agents', 'builtin_template', 'user_overrides']
const AGENT_BOOL_FIELDS = ['builtin', 'reflect_persist', 'complexity_classifier', 'use_same_model']
const AGENT_NUMBER_FIELDS = new Set([
  'max_iterations', 'plan_steps', 'temperature', 'top_p', 'max_tokens',
  'presence_penalty', 'frequency_penalty', 'tool_call_limit', 'model_call_limit',
])
const BUILTIN_AGENT_EDITABLE_FIELDS = [
  'permissions', 'tools', 'skills', 'sub_agents', 'prompt',
  'max_iterations',
  'model', 'temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty',
  'thinking_mode', 'thinking_intensity', 'reviewer_model', 'use_same_model',
  'tool_call_limit', 'model_call_limit',
]
const BUILTIN_AGENT_SYSTEM_FIELDS = [
  'name', 'english_name', 'description', 'icon', 'color', 'architecture',
  'reflect_persist', 'planning_model', 'plan_steps', 'complexity_classifier',
]
const BUILTIN_AGENT_TEMPLATE_FIELDS = [...BUILTIN_AGENT_SYSTEM_FIELDS, ...BUILTIN_AGENT_EDITABLE_FIELDS]

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key])
      return acc
    }, {})
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function dynamicUpdate(db, table, id, data, jsonFields = [], boolFields = []) {
  // Get actual column names from the table to filter out invalid keys
  const existingCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  // Deep clean: strip undefined/null/NaN values and only keep existing columns
  const cleanData = {}
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id') continue
    if (v === undefined || v === null) continue
    if (typeof v === 'number' && Number.isNaN(v)) continue
    if (!existingCols.includes(k)) continue
    cleanData[k] = v
  }
  const sets = []
  const vals = []
  for (const [k, v] of Object.entries(cleanData)) {
    let val = v
    if (jsonFields.includes(k)) val = stringifyJSON(v)
    else if (boolFields.includes(k)) val = v ? 1 : 0
    else if (typeof v === 'object') val = JSON.stringify(v) // Object → stringify as defense
    // Final safety check: val must be a valid SQLite binding type
    if (val === undefined || val === null || (typeof val === 'number' && Number.isNaN(val))) continue
    sets.push(`${k} = ?`)
    vals.push(val)
  }
  if (sets.length === 0) return null
  // Add updated_at if the column exists
  if (existingCols.includes('updated_at')) {
    sets.push("updated_at = datetime('now')")
  }
  vals.push(id)
  try {
    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
  } catch (e) {
    console.error(`[dynamicUpdate] ${table} SET ${sets.join(', ')} | vals:`, vals, '| id:', id, '| error:', e.message)
    throw e
  }
}

export class DatabaseService {
  static workspaceDbPath(rootPath) {
    return path.join(path.resolve(rootPath), WORKSPACE_META_DIR, DB_FILE_NAME)
  }

  constructor() {
    this._db = null
    this._dbPath = null
  }

  init(dbPath) {
    if (!BetterSqlite3) {
      console.warn('Database module not available')
      return null
    }
    if (!dbPath) {
      dbPath = ':memory:'
    } else {
      const dbDir = path.dirname(dbPath)
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    }
    this._dbPath = dbPath
    this._db = new BetterSqlite3(dbPath)
    this._db.pragma('journal_mode = WAL')
    this._db.pragma('foreign_keys = ON')
    this._createTables()
    this._migrateTables()
    this._runVersionedMigrations()
    this._seedBuiltinData()
    return this._db
  }

  close() {
    if (this._db) { this._db.close(); this._db = null }
  }

  async relocateToWorkspace(rootPath) {
    if (!rootPath || !BetterSqlite3 || !this._db) return false
    const dbDir = path.join(rootPath, WORKSPACE_META_DIR)
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
    const newDbPath = DatabaseService.workspaceDbPath(rootPath)

    // If already at this path, skip
    if (path.resolve(this._dbPath) === path.resolve(newDbPath)) return true

    try {
      const workspaceDbExists = fs.existsSync(newDbPath)
      this._db.close()
      const newDb = new BetterSqlite3(newDbPath)
      newDb.pragma('journal_mode = WAL')
      newDb.pragma('foreign_keys = ON')
      this._db = newDb
      this._dbPath = newDbPath
      this._createTables()
      this._migrateTables()
      this._runVersionedMigrations()
      this._seedBuiltinData()
      this.setSetting('workdir_root', path.resolve(rootPath))
      console.log(workspaceDbExists ? '[DB] Switched to workspace database:' : '[DB] Created workspace database:', newDbPath)
      return true
    } catch (err) {
      console.error('[DB] Relocation error:', err)
      return false
    }
  }

  get db() { return this._db }

  // ─── Spaces ───

  listSpaces() {
    return this._db.prepare('SELECT * FROM spaces ORDER BY sort_order, created_at DESC').all()
      .map(r => ({ ...r, docCount: 0 }))
  }

  getSpace(id) {
    return this._db.prepare('SELECT * FROM spaces WHERE id = ?').get(id)
  }

  createSpace(data) {
    const id = data.id || 'sp_' + Date.now()
    this._db.prepare(`INSERT INTO spaces (id, name, description, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.name || '', data.description || '', data.icon || 'ri-folder-3-line', data.color || '#6C8AFF', data.sort_order || 0)
    return { id, ...data }
  }

  updateSpace(id, data) {
    return dynamicUpdate(this._db, 'spaces', id, data)
  }

  deleteSpace(id) {
    this._db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
    return { success: true }
  }

  spaceDocCount(id) {
    const row = this._db.prepare('SELECT COUNT(*) as c FROM documents WHERE space_id = ?').get(id)
    return row.c
  }

  // ─── Documents ───

  listDocs(spaceId) {
    return this._db.prepare('SELECT * FROM documents WHERE space_id = ? ORDER BY created_at DESC').all(spaceId)
  }

  createDoc(data) {
    const id = data.id || 'doc_' + Date.now()
    this._db.prepare(`INSERT INTO documents (id, space_id, name, type, size, status, progress, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.space_id, data.name, data.type || '', data.size || 0, data.status || 'pending', data.progress || 0, data.file_path || '')
    return { id, ...data }
  }

  updateDoc(id, data) {
    return dynamicUpdate(this._db, 'documents', id, data)
  }

  deleteDoc(id) {
    this._db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Conversations ───

  _parseConv(r) {
    if (!r) return null
    return {
      id: r.id, spaceId: r.space_id, agentId: r.agent_id,
      title: r.title, architecture: r.architecture, model: r.model,
      groupId: r.group_id || 'default', contextLength: r.context_length || 50,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }
  }

  _parseMsg(r) {
    if (!r) return null
    return {
      id: r.id, conversationId: r.conversation_id,
      role: r.role, content: r.content,
      meta: parseJSON(r.meta), createdAt: r.created_at,
      status: r.status || 'completed',
      modelId: r.model_id || '', providerId: r.provider_id || '',
      inputTokens: r.input_tokens || 0, outputTokens: r.output_tokens || 0,
      cacheReadTokens: r.cache_read_tokens || 0, cacheWriteTokens: r.cache_write_tokens || 0,
      thinkingTokens: r.thinking_tokens || 0,
      thinkingContent: r.thinking_content || '',
      latencyMs: r.latency_ms || 0, cost: r.cost || 0,
      errorMessage: r.error_message || '', errorCode: r.error_code || '', parentMsgId: r.parent_msg_id || '',
    }
  }

  _parseConvGroup(r) {
    if (!r) return null
    return {
      id: r.id, name: r.name, sortOrder: r.sort_order,
      createdAt: r.created_at,
    }
  }

  listConvs(spaceId, groupId) {
    if (groupId) {
      if (spaceId) return this._db.prepare('SELECT * FROM conversations WHERE space_id = ? AND group_id = ? ORDER BY updated_at DESC').all(spaceId, groupId).map(r => this._parseConv(r))
      return this._db.prepare('SELECT * FROM conversations WHERE group_id = ? ORDER BY updated_at DESC').all(groupId).map(r => this._parseConv(r))
    }
    if (spaceId) return this._db.prepare('SELECT * FROM conversations WHERE space_id = ? ORDER BY updated_at DESC').all(spaceId).map(r => this._parseConv(r))
    return this._db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all().map(r => this._parseConv(r))
  }

  getConv(id) {
    return this._parseConv(this._db.prepare('SELECT * FROM conversations WHERE id = ?').get(id))
  }

  createConv(data) {
    const id = data.id || 'conv_' + Date.now()
    const spaceId = data.space_id ?? ''
    const agentId = data.agent_id ?? ''
    const title = data.title ?? '新对话'
    const architecture = data.architecture ?? ''
    const model = data.model ?? ''
    const groupId = data.group_id ?? 'default'
    const contextLength = data.context_length ?? 50
    this._db.prepare(`INSERT INTO conversations (id, space_id, agent_id, title, architecture, model, group_id, context_length)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, spaceId, agentId, title, architecture, model, groupId, contextLength)
    return this.getConv(id)
  }

  updateConv(id, data) {
    dynamicUpdate(this._db, 'conversations', id, data)
    return this.getConv(id)
  }

  deleteConv(id) {
    this._db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Conversation Groups ───

  listConvGroups() {
    return this._db.prepare('SELECT * FROM conv_groups ORDER BY sort_order, created_at ASC').all().map(r => this._parseConvGroup(r))
  }

  createConvGroup(data) {
    const id = data.id || 'grp_' + Date.now()
    this._db.prepare(`INSERT INTO conv_groups (id, name, sort_order)
      VALUES (?, ?, ?)`).run(id, data.name || '新分组', data.sort_order || 0)
    return this._parseConvGroup(this._db.prepare('SELECT * FROM conv_groups WHERE id = ?').get(id))
  }

  updateConvGroup(id, data) {
    dynamicUpdate(this._db, 'conv_groups', id, data)
    return this._parseConvGroup(this._db.prepare('SELECT * FROM conv_groups WHERE id = ?').get(id))
  }

  deleteConvGroup(id) {
    if (id === 'default') return { success: false, error: 'Cannot delete default group' }
    this._db.prepare('UPDATE conversations SET group_id = \'default\' WHERE group_id = ?').run(id)
    this._db.prepare('DELETE FROM conv_groups WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Messages ───

  listMsgs(convId) {
    return this._db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(convId).map(r => this._parseMsg(r))
  }

  listMsgsPaginated(convId, limit = 30, offset = 0) {
    return this._db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?').all(convId, limit, offset).map(r => this._parseMsg(r))
  }

  countMsgs(convId) {
    return this._db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(convId).count
  }

  createMsg(data) {
    const id = data.id || 'msg_' + Date.now()
    const convId = data.conversation_id ?? ''
    const role = data.role ?? 'user'
    const content = data.content ?? ''
    const meta = stringifyJSON(data.meta ?? {})
    const status = data.status ?? 'completed'
    const modelId = data.model_id ?? ''
    const providerId = data.provider_id ?? ''
    this._db.prepare(`INSERT INTO messages (id, conversation_id, role, content, meta, status, model_id, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, convId, role, content, meta, status, modelId, providerId)
    return this._parseMsg(this._db.prepare('SELECT * FROM messages WHERE id = ?').get(id))
  }

  deleteMsg(id) {
    this._db.prepare('DELETE FROM messages WHERE id = ?').run(id)
    return { success: true }
  }

  updateMsg(id, data) {
    return dynamicUpdate(this._db, 'messages', id, data, ['meta'], [])
  }

  // ─── Agents ───

  _normalizeAgentField(field, value) {
    if (AGENT_JSON_FIELDS.includes(field)) {
      const parsed = parseJSON(value)
      if (field === 'permissions' || field === 'builtin_template' || field === 'user_overrides') return isObject(parsed) ? parsed : {}
      if (field === 'tools' || field === 'skills' || field === 'sub_agents') return Array.isArray(parsed) ? parsed : []
      return parsed
    }
    if (AGENT_BOOL_FIELDS.includes(field)) return value ? 1 : 0
    if (AGENT_NUMBER_FIELDS.has(field)) {
      if (value === undefined || value === null || value === '') return 0
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    }
    return value ?? ''
  }

  _normalizeBuiltinAgentTemplate(data = {}) {
    const id = String(data.id || data.builtin_key || data.english_name || '').trim()
    const template = {
      id,
      name: data.name || '',
      english_name: data.english_name || data.englishName || '',
      description: data.description || data.desc || '',
      icon: data.icon || 'ri-sparkling-2-line',
      color: data.color || '#A78BFA',
      architecture: data.architecture || data.arch || 'react',
      permissions: data.permissions || {},
      tools: data.tools || [],
      skills: data.skills || [],
      sub_agents: data.sub_agents || data.subAgents || [],
      prompt: data.prompt || '',
      max_iterations: data.max_iterations ?? data.maxIter ?? 10,
      reflect_persist: data.reflect_persist ? 1 : 0,
      planning_model: data.planning_model || '',
      plan_steps: data.plan_steps ?? 5,
      complexity_classifier: data.complexity_classifier ? 1 : 0,
      model: data.model || '',
      temperature: data.temperature ?? 0.7,
      top_p: data.top_p ?? 1.0,
      max_tokens: data.max_tokens || 4096,
      presence_penalty: data.presence_penalty ?? 0,
      frequency_penalty: data.frequency_penalty ?? 0,
      thinking_mode: data.thinking_mode || 'auto',
      thinking_intensity: data.thinking_intensity || 'medium',
      reviewer_model: data.reviewer_model || '',
      use_same_model: data.use_same_model === undefined ? 1 : (data.use_same_model ? 1 : 0),
      tool_call_limit: data.tool_call_limit || 0,
      model_call_limit: data.model_call_limit || 0,
    }
    for (const field of BUILTIN_AGENT_TEMPLATE_FIELDS) {
      template[field] = this._normalizeAgentField(field, template[field])
    }
    return template
  }

  _builtinAgentTemplatePayload(template) {
    return BUILTIN_AGENT_TEMPLATE_FIELDS.reduce((acc, field) => {
      acc[field] = this._normalizeAgentField(field, template[field])
      return acc
    }, {})
  }

  _agentRowFieldValue(row, field) {
    return this._normalizeAgentField(field, row?.[field])
  }

  _hasBuiltinTemplate(row) {
    const template = parseJSON(row?.builtin_template || '{}')
    return isObject(template) && Object.keys(template).length > 0
  }

  _agentLooksUserEdited(row) {
    const createdAt = String(row?.created_at || '')
    const updatedAt = String(row?.updated_at || '')
    return !!(createdAt && updatedAt && createdAt !== updatedAt)
  }

  _deriveBuiltinAgentOverrides(row, template) {
    const overrides = {}
    for (const field of BUILTIN_AGENT_EDITABLE_FIELDS) {
      const current = this._agentRowFieldValue(row, field)
      const base = this._normalizeAgentField(field, template[field])
      if (stableStringify(current) !== stableStringify(base)) {
        overrides[field] = current
      }
    }
    return overrides
  }

  _applyBuiltinAgentOverrides(row, data = {}) {
    const template = parseJSON(row?.builtin_template || '{}')
    if (!isObject(template) || Object.keys(template).length === 0) return data

    const overrides = isObject(parseJSON(row.user_overrides)) ? parseJSON(row.user_overrides) : {}
    const payload = {}
    for (const field of BUILTIN_AGENT_EDITABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue
      const incoming = this._normalizeAgentField(field, data[field])
      payload[field] = incoming
      const base = this._normalizeAgentField(field, template[field])
      if (stableStringify(incoming) === stableStringify(base)) delete overrides[field]
      else overrides[field] = incoming
    }
    return { ...payload, user_overrides: overrides }
  }

  syncBuiltinAgentTemplate(data = {}) {
    const template = this._normalizeBuiltinAgentTemplate(data)
    if (!template.id) throw new Error('Built-in agent template requires id')

    const builtinKey = String(data.builtin_key || data.id || template.id)
    const builtinVersion = String(data.builtin_version || data.version || '1.0.0')
    const templatePayload = this._builtinAgentTemplatePayload(template)
    const templateHash = crypto.createHash('sha256').update(stableStringify(templatePayload)).digest('hex')

    const existing = this._db.prepare(`
      SELECT * FROM agents
      WHERE id = ?
        OR (builtin = 1 AND builtin_key = ?)
        OR (builtin = 1 AND english_name != '' AND english_name = ?)
      ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).get(template.id, builtinKey, template.english_name, template.id)

    if (!existing) {
      this.createAgent({
        id: template.id,
        ...template,
        builtin: 1,
        builtin_key: builtinKey,
        builtin_version: builtinVersion,
        builtin_template_hash: templateHash,
        builtin_template: templatePayload,
        user_overrides: {},
      })
      return this.getAgent(template.id)
    }

    const storedOverrides = parseJSON(existing.user_overrides || '{}')
    const overrides = this._hasBuiltinTemplate(existing)
      ? (isObject(storedOverrides) ? storedOverrides : {})
      : (this._agentLooksUserEdited(existing) ? this._deriveBuiltinAgentOverrides(existing, template) : {})

    const next = {
      ...templatePayload,
      ...overrides,
      builtin: 1,
      builtin_key: builtinKey,
      builtin_version: builtinVersion,
      builtin_template_hash: templateHash,
      builtin_template: templatePayload,
      user_overrides: overrides,
    }
    dynamicUpdate(this._db, 'agents', existing.id, next, AGENT_JSON_FIELDS, AGENT_BOOL_FIELDS)
    return this.getAgent(existing.id)
  }

  _parseAgent(r) {
    if (!r) return null
    return {
      id: r.id, name: r.name, englishName: r.english_name || '', english_name: r.english_name || '',
      desc: r.description, icon: r.icon, color: r.color,
      arch: r.architecture, builtin: !!r.builtin,
      permissions: parseJSON(r.permissions),
      tools: parseJSON(r.tools),
      skills: parseJSON(r.skills),
      subAgents: parseJSON(r.sub_agents),
      prompt: r.prompt,
      maxIter: r.max_iterations,
      reflectPersist: !!r.reflect_persist,
      planningModel: r.planning_model,
      planSteps: r.plan_steps,
      complexityClassifier: !!r.complexity_classifier,
      model: r.model,
      temperature: r.temperature,
      topP: r.top_p,
      maxTokens: r.max_tokens,
      presencePenalty: r.presence_penalty,
      frequencyPenalty: r.frequency_penalty,
      thinkingMode: r.thinking_mode || 'auto',
      thinkingIntensity: r.thinking_intensity || 'medium',
      reviewerModel: r.reviewer_model || '',
      useSameModel: !!r.use_same_model,
      toolCallLimit: r.tool_call_limit || 0,
      modelCallLimit: r.model_call_limit || 0,
      builtinKey: r.builtin_key || '',
      builtinVersion: r.builtin_version || '',
      builtinTemplateHash: r.builtin_template_hash || '',
      userOverrides: parseJSON(r.user_overrides || '{}'),
    }
  }

  listAgents() {
    return this._db.prepare('SELECT * FROM agents ORDER BY created_at').all().map(r => this._parseAgent(r))
  }

  getAgent(id) {
    return this._parseAgent(this._db.prepare('SELECT * FROM agents WHERE id = ?').get(id))
  }

  createAgent(data) {
    const id = data.id || 'agent_' + Date.now()
    try {
    this._db.prepare(`INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, reflect_persist, planning_model, plan_steps, complexity_classifier, model, temperature, top_p, max_tokens, presence_penalty, frequency_penalty, thinking_mode, thinking_intensity, reviewer_model, use_same_model, tool_call_limit, model_call_limit, builtin_key, builtin_version, builtin_template_hash, builtin_template, user_overrides)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.english_name || '', data.description || '', data.icon || 'ri-sparkling-2-line', data.color || '#A78BFA',
      data.architecture || 'react', data.builtin ? 1 : 0,
      stringifyJSON(data.permissions || {}), stringifyJSON(data.tools || []), stringifyJSON(data.skills || []), stringifyJSON(data.sub_agents || []),
      data.prompt || '', data.max_iterations ?? 10, data.reflect_persist ? 1 : 0,
      data.planning_model || '', data.plan_steps || 5, data.complexity_classifier ? 1 : 0,
      data.model || '', data.temperature ?? 0.7, data.top_p ?? 1.0,
      data.max_tokens || 4096, data.presence_penalty ?? 0, data.frequency_penalty ?? 0,
      data.thinking_mode || 'auto', data.thinking_intensity || 'medium',
      data.reviewer_model || '', data.use_same_model ? 1 : 0,
      data.tool_call_limit || 0, data.model_call_limit || 0,
      data.builtin_key || '', data.builtin_version || '', data.builtin_template_hash || '',
      stringifyJSON(data.builtin_template || {}), stringifyJSON(data.user_overrides || {}))
    } catch (e) {
      if (e.message?.includes('idx_agents_english_name')) {
        throw new Error(`英文名称 "${data.english_name}" 已被占用，请使用其他名称`)
      }
      throw e
    }
    return { id, ...data }
  }

  updateAgent(id, data) {
    try {
    const row = this._db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
    const payload = row?.builtin ? this._applyBuiltinAgentOverrides(row, data) : data
    return dynamicUpdate(this._db, 'agents', id, payload, AGENT_JSON_FIELDS, AGENT_BOOL_FIELDS)
    } catch (e) {
      if (e.message?.includes('idx_agents_english_name')) {
        throw new Error(`英文名称 "${data.english_name}" 已被占用，请使用其他名称`)
      }
      throw e
    }
  }

  deleteAgent(id) {
    this._db.prepare('DELETE FROM agents WHERE id = ?').run(id)
    return { success: true }
  }

  isEnglishNameUnique(englishName, excludeId = '') {
    if (!englishName) return true
    const row = this._db.prepare('SELECT id FROM agents WHERE english_name = ? AND id != ?').get(englishName, excludeId)
    return !row
  }

  // ─── Custom Skills ───

  listSkills() {
    return this._db.prepare('SELECT * FROM custom_skills ORDER BY created_at').all()
      .map(r => this._parseSkill(r))
  }

  _parseSkill(r) {
    if (!r) return null
    return {
      id: r.id, name: r.name, icon: r.icon, color: r.color,
      description: r.description || '', detail: r.detail || '',
      promptTemplate: r.prompt_template || r.prompt_content || '',
      promptContent: r.prompt_content || r.prompt_template || '',
      outputTypes: parseJSON(r.output_types),
      allowedTools: parseJSON(r.allowed_tools || '[]'),
      source: r.source || 'custom', category: r.category || '',
      version: r.version || '1.0', author: r.author || '',
      license: r.license || '', enabled: !!r.enabled,
      builtin: !!r.builtin,
    }
  }

  createSkill(data) {
    const id = data.id || 'skill_' + Date.now()
    this._db.prepare(`INSERT INTO custom_skills (id, name, icon, color, description, detail, prompt_template, prompt_content, output_types, allowed_tools, source, category, version, author, license, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-flashlight-line', data.color || '#6C8AFF',
      data.description || '', data.detail || '',
      data.prompt_template || data.promptContent || '', data.prompt_content || data.promptContent || '',
      stringifyJSON(data.output_types || ['Markdown']),
      stringifyJSON(data.allowed_tools || []),
      data.source || 'custom', data.category || '',
      data.version || '1.0', data.author || '',
      data.license || '', data.builtin ? 1 : 0, data.enabled ? 1 : 0)
    return this._parseSkill(this._db.prepare('SELECT * FROM custom_skills WHERE id = ?').get(id))
  }

  updateSkill(id, data) {
    return dynamicUpdate(this._db, 'custom_skills', id, data, ['output_types', 'allowed_tools'])
  }

  deleteSkill(id) {
    this._db.prepare('DELETE FROM custom_skills WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Custom Tools ───

  listTools() {
    return this._db.prepare('SELECT * FROM custom_tools ORDER BY created_at').all()
      .map(r => ({ ...r, builtin: !!r.builtin, enabled: !!r.enabled, headers: parseJSON(r.headers), params: parseJSON(r.params), arch_compat: parseJSON(r.arch_compat), provider_config: parseJSON(r.provider_config) }))
  }

  createTool(data) {
    const id = data.id || 'tool_' + Date.now()
    this._db.prepare(`INSERT INTO custom_tools (id, name, icon, color, category, description, type, api_url, method, headers, params, response_format, script_path, sandbox, perm_required, arch_compat, builtin, enabled, provider_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-tools-line', data.color || '#4ADE80', data.category || 'custom', data.description || '',
      data.type || 'api', data.api_url || '', data.method || 'POST', stringifyJSON(data.headers || {}),
      stringifyJSON(data.params || []), data.response_format || 'JSON', data.script_path || '',
      data.sandbox || '', data.perm_required || '', stringifyJSON(data.arch_compat || ['react', 'plan_exec', 'hybrid']),
      0, data.enabled === false || data.enabled === 0 ? 0 : 1, stringifyJSON(data.provider_config || {}))
    return { id, ...data }
  }

  updateTool(id, data) {
    dynamicUpdate(this._db, 'custom_tools', id, data, ['headers', 'params', 'arch_compat', 'provider_config'])
    return { success: true }
  }

  deleteTool(id) {
    this._db.prepare('DELETE FROM custom_tools WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── MCP Servers ───

  listMcpServers() {
    return this._db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all()
      .map(r => ({
        ...r,
        enabled: !!r.enabled,
        headers: parseJSON(r.headers),
        disabled_tools: parseJSON(r.disabled_tools),
        tools_cache: parseJSON(r.tools_cache),
        resources_cache: parseJSON(r.resources_cache),
        resource_templates_cache: parseJSON(r.resource_templates_cache),
        prompts_cache: parseJSON(r.prompts_cache),
        capabilities_cache: parseJSON(r.capabilities_cache),
        server_info_cache: parseJSON(r.server_info_cache),
      }))
  }

  getMcpServer(id) {
    const r = this._db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id)
    if (!r) return null
    return {
      ...r,
      enabled: !!r.enabled,
      headers: parseJSON(r.headers),
      disabled_tools: parseJSON(r.disabled_tools),
      tools_cache: parseJSON(r.tools_cache),
      resources_cache: parseJSON(r.resources_cache),
      resource_templates_cache: parseJSON(r.resource_templates_cache),
      prompts_cache: parseJSON(r.prompts_cache),
      capabilities_cache: parseJSON(r.capabilities_cache),
      server_info_cache: parseJSON(r.server_info_cache),
    }
  }

  createMcpServer(data) {
    const id = data.id || 'mcp_' + Date.now()
    this._db.prepare(`INSERT INTO mcp_servers (id, name, transport, url, headers, enabled, disabled_tools, last_status, last_error, last_synced_at, tools_cache, resources_cache, resource_templates_cache, prompts_cache, capabilities_cache, server_info_cache, instructions)
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
    dynamicUpdate(this._db, 'mcp_servers', id, data, ['headers', 'disabled_tools', 'tools_cache', 'resources_cache', 'resource_templates_cache', 'prompts_cache', 'capabilities_cache', 'server_info_cache'])
    return { success: true }
  }

  deleteMcpServer(id) {
    this._db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Custom Sub Agents ───

  listSubAgents() {
    return this._db.prepare('SELECT * FROM custom_sub_agents ORDER BY created_at').all()
      .map(r => ({ ...r, builtin: !!r.builtin, enabled: !!r.enabled, tools: parseJSON(r.tools), skills: parseJSON(r.skills) }))
  }

  createSubAgent(data) {
    const id = data.id || 'sub_' + Date.now()
    this._db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.icon || 'ri-team-line', data.color || '#6C8AFF',
      data.description || '', data.prompt || '',
      stringifyJSON(data.tools || []), stringifyJSON(data.skills || []),
      data.model || '', data.temperature ?? 0.7, 0, 1)
    return { id, ...data }
  }

  updateSubAgent(id, data) {
    dynamicUpdate(this._db, 'custom_sub_agents', id, data, ['tools', 'skills'])
    return { success: true }
  }

  deleteSubAgent(id) {
    this._db.prepare('DELETE FROM custom_sub_agents WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Tasks ───

  listTasks() {
    return this._db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
      .map(r => ({ ...r, steps: parseJSON(r.steps), params: parseJSON(r.params_json) }))
  }

  listTasksByGroup(groupId, toolIds) {
    let sql = 'SELECT * FROM tasks WHERE group_id = ?'
    const args = [groupId]
    if (Array.isArray(toolIds) && toolIds.length) {
      sql += ` AND tool_id IN (${toolIds.map(() => '?').join(',')})`
      args.push(...toolIds)
    }
    sql += ' ORDER BY created_at DESC'
    return this._db.prepare(sql).all(...args)
      .map(r => ({ ...r, steps: parseJSON(r.steps), params: parseJSON(r.params_json) }))
  }

  getTask(id) {
    const row = this._db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) return null
    return { ...row, steps: parseJSON(row.steps), params: parseJSON(row.params_json) }
  }

  createTask(data) {
    const id = data.id || 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO tasks (id, name, type, status, architecture, space_id, agent_id, skill_type, progress, steps, result, error, tool_id, mode, conversation_id, group_id, params_json, artifact_id, cloud_task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.type || 'agent', data.status || 'pending', data.architecture || '',
      data.space_id || '', data.agent_id || '', data.skill_type || '', data.progress || 0,
      stringifyJSON(data.steps || []), data.result || '', data.error || '',
      data.tool_id || '', data.mode || 'local',
      data.conversation_id || '', data.group_id || 'default',
      stringifyJSON(data.params || data.params_json || {}),
      data.artifact_id || '', data.cloud_task_id || '')
    return this.getTask(id)
  }

  updateTask(id, data) {
    const payload = { ...data, updated_at: new Date().toISOString() }
    if (data.params !== undefined && data.params_json === undefined) {
      payload.params_json = data.params
      delete payload.params
    }
    dynamicUpdate(this._db, 'tasks', id, payload, ['steps', 'params_json'])
    return { success: true }
  }

  deleteTask(id) {
    this._db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── LLM Wiki ───

  _parseWiki(row) {
    if (!row) return null
    return {
      ...row,
      agent_config: parseJSON(row.agent_config) || {},
    }
  }

  _parseWikiSource(row) {
    if (!row) return null
    return {
      ...row,
      meta: parseJSON(row.meta_json) || {},
    }
  }

  _parseWikiJob(row) {
    if (!row) return null
    return {
      ...row,
      meta: parseJSON(row.meta_json) || {},
    }
  }

  _parseOcrProvider(row) {
    if (!row) return null
    return {
      ...row,
      enabled: !!row.enabled,
      config: parseJSON(row.config_json) || {},
    }
  }

  _parseWikiOcrJob(row) {
    if (!row) return null
    return {
      ...row,
      metrics: parseJSON(row.metrics_json) || {},
    }
  }

  listWikis() {
    return this._db.prepare('SELECT * FROM wikis ORDER BY updated_at DESC, created_at DESC').all().map(r => this._parseWiki(r))
  }

  getWiki(id) {
    return this._parseWiki(this._db.prepare('SELECT * FROM wikis WHERE id = ?').get(id))
  }

  createWiki(data) {
    const id = data.id || 'wiki_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO wikis (id, name, slug, description, path, status, page_count, source_count, asset_count, index_status, agent_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.name || 'Untitled Wiki',
      data.slug || id,
      data.description || '',
      data.path || '',
      data.status || 'ready',
      data.page_count || 0,
      data.source_count || 0,
      data.asset_count || 0,
      data.index_status || 'empty',
      stringifyJSON(data.agent_config || data.agent || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWiki(id)
  }

  upsertWiki(data) {
    const existing = data?.id ? this.getWiki(data.id) : null
    if (existing) return this.updateWiki(data.id, data)
    return this.createWiki(data)
  }

  updateWiki(id, data) {
    const payload = { ...data }
    if (payload.agent !== undefined && payload.agent_config === undefined) {
      payload.agent_config = payload.agent
      delete payload.agent
    }
    dynamicUpdate(this._db, 'wikis', id, payload, ['agent_config'])
    return this.getWiki(id)
  }

  deleteWiki(id) {
    this._db.prepare('DELETE FROM wiki_ocr_jobs WHERE wiki_id = ?').run(id)
    this._db.prepare('DELETE FROM wiki_jobs WHERE wiki_id = ?').run(id)
    this._db.prepare('DELETE FROM wiki_sources WHERE wiki_id = ?').run(id)
    this._db.prepare('DELETE FROM wikis WHERE id = ?').run(id)
    return { success: true }
  }

  deleteWikiSource(wikiId, sourceId) {
    this._db.prepare('DELETE FROM wiki_ocr_jobs WHERE wiki_id = ? AND source_id = ?').run(wikiId, sourceId)
    this._db.prepare('DELETE FROM wiki_jobs WHERE wiki_id = ? AND source_id = ?').run(wikiId, sourceId)
    this._db.prepare('DELETE FROM wiki_sources WHERE wiki_id = ? AND id = ?').run(wikiId, sourceId)
    return { success: true }
  }

  listWikiSources(wikiId) {
    return this._db.prepare('SELECT * FROM wiki_sources WHERE wiki_id = ? ORDER BY updated_at DESC, created_at DESC').all(wikiId).map(r => this._parseWikiSource(r))
  }

  getWikiSource(id) {
    return this._parseWikiSource(this._db.prepare('SELECT * FROM wiki_sources WHERE id = ?').get(id))
  }

  upsertWikiSource(data) {
    const existing = data?.id ? this.getWikiSource(data.id) : null
    if (existing) return this.updateWikiSource(data.id, data)
    this._db.prepare(`INSERT INTO wiki_sources (id, wiki_id, type, title, original_uri, original_path, content_hash, status, size, extract_path, parser_status, parser_message, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      data.id,
      data.wiki_id,
      data.type || 'file',
      data.title || data.id,
      data.original_uri || '',
      data.original_path || '',
      data.content_hash || '',
      data.status || 'pending',
      data.size || 0,
      data.extract_path || '',
      data.parser_status || '',
      data.parser_message || '',
      stringifyJSON(data.meta || data.meta_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWikiSource(data.id)
  }

  updateWikiSource(id, data) {
    const payload = { ...data }
    if (payload.meta !== undefined && payload.meta_json === undefined) {
      payload.meta_json = payload.meta
      delete payload.meta
    }
    dynamicUpdate(this._db, 'wiki_sources', id, payload, ['meta_json'])
    return this.getWikiSource(id)
  }

  listWikiJobs(wikiId) {
    return this._db.prepare('SELECT * FROM wiki_jobs WHERE wiki_id = ? ORDER BY created_at DESC LIMIT 100').all(wikiId).map(r => this._parseWikiJob(r))
  }

  createWikiJob(data) {
    const id = data.id || 'wiki_job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO wiki_jobs (id, wiki_id, source_id, type, name, status, progress, message, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.wiki_id,
      data.source_id || '',
      data.type || 'wiki',
      data.name || '',
      data.status || 'pending',
      data.progress || 0,
      data.message || '',
      stringifyJSON(data.meta || data.meta_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this._parseWikiJob(this._db.prepare('SELECT * FROM wiki_jobs WHERE id = ?').get(id))
  }

  listOcrProviders() {
    return this._db.prepare('SELECT * FROM ocr_providers ORDER BY enabled DESC, updated_at DESC, created_at DESC').all().map(r => this._parseOcrProvider(r))
  }

  getOcrProvider(id) {
    return this._parseOcrProvider(this._db.prepare('SELECT * FROM ocr_providers WHERE id = ?').get(id))
  }

  createOcrProvider(data = {}) {
    const id = data.id || 'ocr_provider_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO ocr_providers (id, name, type, mode, base_url, api_key_ref, enabled, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.name || 'OCR Provider',
      data.type || 'custom',
      data.mode || 'remote',
      data.base_url || '',
      data.api_key_ref || '',
      data.enabled === false ? 0 : 1,
      stringifyJSON(data.config || data.config_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getOcrProvider(id)
  }

  updateOcrProvider(id, data = {}) {
    const payload = { ...data }
    if (payload.config !== undefined && payload.config_json === undefined) {
      payload.config_json = payload.config
      delete payload.config
    }
    dynamicUpdate(this._db, 'ocr_providers', id, payload, ['config_json'], ['enabled'])
    return this.getOcrProvider(id)
  }

  deleteOcrProvider(id) {
    this._db.prepare('DELETE FROM ocr_providers WHERE id = ?').run(id)
    return { success: true }
  }

  listWikiOcrJobs(wikiId, sourceId = '') {
    let sql = 'SELECT * FROM wiki_ocr_jobs WHERE wiki_id = ?'
    const args = [wikiId]
    if (sourceId) {
      sql += ' AND source_id = ?'
      args.push(sourceId)
    }
    sql += ' ORDER BY updated_at DESC, created_at DESC'
    return this._db.prepare(sql).all(...args).map(r => this._parseWikiOcrJob(r))
  }

  getWikiOcrJob(id) {
    return this._parseWikiOcrJob(this._db.prepare('SELECT * FROM wiki_ocr_jobs WHERE id = ?').get(id))
  }

  createWikiOcrJob(data = {}) {
    const id = data.id || 'wiki_ocr_job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO wiki_ocr_jobs (id, wiki_id, source_id, provider_id, status, progress, pages_total, pages_done, input_path, output_manifest_path, output_extract_path, cache_path, error_message, metrics_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.wiki_id,
      data.source_id || '',
      data.provider_id || null,
      data.status || 'pending',
      data.progress || 0,
      data.pages_total || 0,
      data.pages_done || 0,
      data.input_path || '',
      data.output_manifest_path || '',
      data.output_extract_path || '',
      data.cache_path || '',
      data.error_message || '',
      stringifyJSON(data.metrics || data.metrics_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWikiOcrJob(id)
  }

  upsertWikiOcrJob(data = {}) {
    const existing = data?.id ? this.getWikiOcrJob(data.id) : null
    if (existing) return this.updateWikiOcrJob(data.id, data)
    return this.createWikiOcrJob(data)
  }

  updateWikiOcrJob(id, data = {}) {
    const payload = { ...data }
    if (payload.metrics !== undefined && payload.metrics_json === undefined) {
      payload.metrics_json = payload.metrics
      delete payload.metrics
    }
    dynamicUpdate(this._db, 'wiki_ocr_jobs', id, payload, ['metrics_json'])
    return this.getWikiOcrJob(id)
  }

  // ─── Outputs ───

  listOutputs() {
    return this._db.prepare('SELECT * FROM outputs ORDER BY created_at DESC').all()
  }

  createOutput(data) {
    const id = data.id || 'out_' + Date.now()
    this._db.prepare(`INSERT INTO outputs (id, name, type, category, agent_name, skill_name, format, file_path, file_size, content, space_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.name || '', data.type || 'summary', data.category || 'desk',
      data.agent_name || '', data.skill_name || '', data.format || 'Markdown',
      data.file_path || '', data.file_size || '', data.content || '', data.space_id || '')
    return { id, ...data }
  }

  deleteOutput(id) {
    this._db.prepare('DELETE FROM outputs WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Artifacts ───

  listArtifactsByGroup(groupId) {
    return this._db.prepare('SELECT * FROM artifacts WHERE group_id = ? ORDER BY created_at DESC').all(groupId)
  }

  getArtifact(id) {
    return this._db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
  }

  createArtifact(data) {
    const id = data.id || 'art_' + Date.now()
    this._db.prepare(`INSERT INTO artifacts (id, group_id, conversation_id, title, type, icon, color, storage_type, file_path, content, agent_name, skill_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.group_id || 'default', data.conversation_id || '',
      data.title || '', data.type || 'summary', data.icon || 'ri-file-line',
      data.color || 'brand', data.storage_type || 'data',
      data.file_path || '', data.content || '',
      data.agent_name || '', data.skill_name || '')
    return this._db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id)
  }

  deleteArtifact(id) {
    this._db.prepare('DELETE FROM artifacts WHERE id = ?').run(id)
    return { success: true }
  }

  updateArtifact(id, data) {
    return dynamicUpdate(this._db, 'artifacts', id, data)
  }

  // ─── Settings ───

  getSetting(key) {
    const row = this._db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? parseJSON(row.value) : null
  }

  setSetting(key, value) {
    this._db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stringifyJSON(value))
    return { success: true }
  }

  getAllSettings() {
    const rows = this._db.prepare('SELECT key, value FROM settings').all()
    const obj = {}
    for (const r of rows) obj[r.key] = parseJSON(r.value)
    return obj
  }

  // ─── Memories ───

  listMemories() {
    return this._db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all()
  }

  createMemory(data) {
    const id = data.id || 'mem_' + Date.now()
    this._db.prepare(`INSERT INTO memories (id, type, source, content)
      VALUES (?, ?, ?, ?)`).run(id, data.type || 'semantic', data.source || '', data.content || '')
    return this._db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  }

  updateMemory(id, data) {
    return dynamicUpdate(this._db, 'memories', id, data)
  }

  deleteMemory(id) {
    this._db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Recycle Bin ───

  listTrash() {
    return this._db.prepare('SELECT * FROM recycle_bin ORDER BY deleted_at DESC').all()
  }

  listTrashByCategory(category) {
    return this._db.prepare('SELECT * FROM recycle_bin WHERE category = ? ORDER BY deleted_at DESC').all(category)
  }

  getTrashItem(id) {
    return this._db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id)
  }

  createTrashItem(data) {
    const id = data.id || 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    this._db.prepare(`INSERT INTO recycle_bin (id, original_path, original_name, trash_path, is_directory, size, file_type, category, item_type, item_id, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.original_path || '', data.original_name, data.trash_path || '',
      data.is_directory ? 1 : 0, data.size || 0, data.file_type || '', data.category || 'other',
      data.item_type || 'file', data.item_id || '', data.payload_json || '')
    return this._db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id)
  }

  deleteTrashItem(id) {
    this._db.prepare('DELETE FROM recycle_bin WHERE id = ?').run(id)
    return { success: true }
  }

  deleteTrashItems(ids) {
    const stmt = this._db.prepare('DELETE FROM recycle_bin WHERE id = ?')
    this._db.transaction(() => { for (const id of ids) stmt.run(id) })()
    return { success: true }
  }

  emptyTrash() {
    this._db.prepare('DELETE FROM recycle_bin').run()
    return { success: true }
  }

  trashItemCount() {
    const row = this._db.prepare('SELECT COUNT(*) as c FROM recycle_bin').get()
    return row.c
  }

  // ─── Token Usage ───

  createTokenUsage(data) {
    const id = data.id || 'tu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this._db.prepare(`INSERT INTO token_usage (id, provider_id, model_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, latency_ms, agent_id, conversation_id, run_id, iteration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.provider_id || '', data.model_id || '',
      data.input_tokens || 0, data.output_tokens || 0,
      data.cache_read_tokens || 0, data.cache_write_tokens || 0,
      data.thinking_tokens || 0,
      data.cost || 0, data.latency_ms || 0,
      data.agent_id || '', data.conversation_id || '',
      data.run_id || '', data.iteration || 0)
    return this._db.prepare('SELECT * FROM token_usage WHERE id = ?').get(id)
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
    return this._db.prepare(sql).all(...params)
  }

  getTokenUsageSummary(range = 'month') {
    const dr = this._getDateRangeFilter(range)
    const where = dr.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dr.end ? [dr.start, dr.end] : [dr.start]
    const row = this._db.prepare(`SELECT
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
    return row
  }

  getTokenUsageByModel(range = 'month') {
    const dr = this._getDateRangeFilter(range)
    const where = dr.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dr.end ? [dr.start, dr.end] : [dr.start]
    return this._db.prepare(`SELECT COALESCE(provider_id, '') as provider_id, COALESCE(model_id, '') as model_id,
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
    const dr = this._getDateRangeFilter(range)
    const where = dr.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dr.end ? [dr.start, dr.end] : [dr.start]
    return this._db.prepare(`SELECT agent_id,
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
    const dr = this._getDateRangeFilter(range)
    const where = dr.end ? 'created_at >= ? AND created_at < ?' : 'created_at >= ?'
    const params = dr.end ? [dr.start, dr.end] : [dr.start]
    return this._db.prepare(`SELECT DATE(created_at) as date,
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
    const result = this._db.prepare('DELETE FROM token_usage WHERE created_at < ?').run(beforeDate)
    return { deleted: result.changes }
  }

  // ─── Agent Runs ───

  createAgentRun(data) {
    const id = data.id || 'run_' + Date.now()
    this._db.prepare(`INSERT INTO agent_runs (id, conversation_id, agent_id, parent_run_id, status, iterations, max_iterations, total_input_tokens, total_output_tokens, total_cost, steps, error_code, error_message, compressed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.conversation_id || '', data.agent_id || '', data.parent_run_id || '',
      data.status || 'running', data.iterations || 0, data.max_iterations ?? 10,
      data.total_input_tokens || 0, data.total_output_tokens || 0, data.total_cost || 0,
      data.steps || '[]', data.error_code || '', data.error_message || '', data.compressed || 0)
    return this._db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id)
  }

  getAgentRun(id) {
    return this._db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id)
  }

  updateAgentRun(id, data) {
    return dynamicUpdate(this._db, 'agent_runs', id, data, ['steps'])
  }

  listAgentRunsByConversation(convId) {
    return this._db.prepare('SELECT * FROM agent_runs WHERE conversation_id = ? ORDER BY created_at DESC').all(convId)
  }

  listAgentRunsByAgent(agentId) {
    return this._db.prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
  }

  deleteAgentRun(id) {
    this._db.prepare('DELETE FROM agent_runs WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Note Folders ───

  listNoteFolders(parentId) {
    if (parentId) return this._db.prepare('SELECT * FROM note_folders WHERE parent_id = ? ORDER BY sort_order, created_at ASC').all(parentId)
    return this._db.prepare('SELECT * FROM note_folders ORDER BY sort_order, created_at ASC').all()
  }

  getNoteFolder(id) {
    return this._db.prepare('SELECT * FROM note_folders WHERE id = ?').get(id)
  }

  createNoteFolder(data) {
    const id = data.id || 'nf_' + Date.now()
    this._db.prepare(`INSERT INTO note_folders (id, parent_id, name, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.parent_id || '', data.name || '新文件夹', data.icon || 'ri-folder-2-line', data.color || '#6C8AFF', data.sort_order || 0)
    return this.getNoteFolder(id)
  }

  updateNoteFolder(id, data) {
    return dynamicUpdate(this._db, 'note_folders', id, data)
  }

  deleteNoteFolder(id) {
    this._db.prepare('DELETE FROM note_folders WHERE id = ?').run(id)
    return { success: true }
  }

  // ─── Notes ───

  listNotes(folderId) {
    if (folderId) return this._db.prepare('SELECT * FROM notes WHERE folder_id = ? ORDER BY sort_order, created_at DESC').all(folderId)
    return this._db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
  }

  getNote(id) {
    return this._db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  }

  createNote(data) {
    const id = data.id || 'nt_' + Date.now()
    this._db.prepare(`INSERT INTO notes (id, folder_id, title, content, file_path, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.folder_id || '', data.title || '新笔记', data.content || '', data.file_path || '', data.sort_order || 0)
    return this.getNote(id)
  }

  updateNote(id, data) {
    return dynamicUpdate(this._db, 'notes', id, data)
  }

  deleteNote(id) {
    this._db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    return { success: true }
  }

  _getDateRangeFilter(range) {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    // Exact date YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
      const nextDay = new Date(new Date(range + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10)
      return { start: range, end: nextDay }
    }
    // Month YYYY-MM
    if (/^\d{4}-\d{2}$/.test(range)) {
      const [y, m] = range.split('-')
      const nextMonth = m === '12' ? `${+y + 1}-01` : `${y}-${String(+m + 1).padStart(2, '0')}`
      return { start: range + '-01', end: nextMonth + '-01' }
    }
    switch (range) {
      case 'today': return { start: todayStr }
      case 'yesterday': {
        const yd = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
        return { start: yd, end: todayStr }
      }
      case 'week': return { start: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) }
      case 'month': return { start: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) }
      case 'year': return { start: new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10) }
      default: return { start: '2000-01-01' }
    }
  }

  _ensureSchemaMigrationsTable() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `)
  }

  _getVersionedMigrations() {
    return [
      {
        version: 1,
        name: 'replace_web_scrape_with_jina_mcp',
        up: db => {
          const replaceToolRefs = (value) => {
            const tools = parseJSON(value)
            if (!Array.isArray(tools)) return value
            let changed = false
            const next = []
            for (const toolId of tools) {
              if (toolId === 'web_scrape') {
                changed = true
                if (!next.includes('mcp:jina-mcp-server')) next.push('mcp:jina-mcp-server')
                continue
              }
              if (toolId && !next.includes(toolId)) next.push(toolId)
            }
            return changed ? JSON.stringify(next) : value
          }

          for (const table of ['agents', 'custom_sub_agents']) {
            const rows = db.prepare(`SELECT id, tools FROM ${table}`).all()
            const update = db.prepare(`UPDATE ${table} SET tools = ? WHERE id = ?`)
            for (const row of rows) {
              const nextTools = replaceToolRefs(row.tools)
              if (nextTools !== row.tools) update.run(nextTools, row.id)
            }
          }

          const settings = db.prepare("SELECT key, value FROM settings WHERE key IN ('toolEnabledMap', 'toolProviderConfigMap')").all()
          const updateSetting = db.prepare('UPDATE settings SET value = ? WHERE key = ?')
          for (const row of settings) {
            const parsed = parseJSON(row.value)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
            if (!Object.prototype.hasOwnProperty.call(parsed, 'web_scrape')) continue
            delete parsed.web_scrape
            updateSetting.run(JSON.stringify(parsed), row.key)
          }
        },
      },
    ]
  }

  _ensureArtifactsTable() {
    const table = this._db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'").get()
    if (!table) {
      this._db.exec(`
        CREATE TABLE artifacts (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL DEFAULT 'default',
          conversation_id TEXT DEFAULT '',
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          icon TEXT DEFAULT 'ri-file-line',
          color TEXT DEFAULT 'brand',
          storage_type TEXT NOT NULL,
          file_path TEXT DEFAULT '',
          content TEXT DEFAULT '',
          agent_name TEXT DEFAULT '',
          skill_name TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (group_id) REFERENCES conv_groups(id)
        )
      `)
      console.log('[DB] Migrated: created artifacts table')
    }

    const cols = this._db.prepare('PRAGMA table_info(artifacts)').all()
    const newCols = [
      ['group_id', "TEXT NOT NULL DEFAULT 'default'"],
      ['conversation_id', "TEXT DEFAULT ''"],
      ['icon', "TEXT DEFAULT 'ri-file-line'"],
      ['color', "TEXT DEFAULT 'brand'"],
      ['storage_type', "TEXT DEFAULT 'data'"],
      ['file_path', "TEXT DEFAULT ''"],
      ['content', "TEXT DEFAULT ''"],
      ['agent_name', "TEXT DEFAULT ''"],
      ['skill_name', "TEXT DEFAULT ''"],
      ['updated_at', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of newCols) {
      if (!cols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE artifacts ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to artifacts`)
      }
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_group ON artifacts(group_id)')
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id)')
  }

  _ensureTaskGenerationColumns(taskCols = null) {
    const table = this._db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get()
    if (!table) return
    const cols = taskCols || this._db.prepare('PRAGMA table_info(tasks)').all()
    const newCols = [
      ['status', "TEXT DEFAULT 'pending'"],
      ['tool_id', "TEXT DEFAULT ''"],
      ['mode', "TEXT DEFAULT 'local'"],
      ['conversation_id', "TEXT DEFAULT ''"],
      ['group_id', "TEXT DEFAULT 'default'"],
      ['params_json', "TEXT DEFAULT '{}'"],
      ['artifact_id', "TEXT DEFAULT ''"],
      ['cloud_task_id', "TEXT DEFAULT ''"],
      ['updated_at', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of newCols) {
      if (!cols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to tasks`)
      }
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id)')
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_tool ON tasks(tool_id)')
  }

  _ensureCreationCenterSubAgentSeeds() {
    const seeds = [
      { id: 'sa_web-researcher', name: '网络搜索研究员', icon: 'ri-global-line', color: '#38BDF8', desc: '对给定主题进行网络搜索研究，返回带引用编号的发现', prompt: '你是一位专业的网络搜索研究员。对用户指定的主题进行深入的网络搜索研究。先宽后窄检索，优先选择权威、近期、可核验的来源。每条关键发现都给出 [1] 格式引用，并在末尾列出 Sources。始终使用中文描述发现。', tools: ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing'] },
      { id: 'sa_local-analyst', name: '本地资料分析员', icon: 'ri-folder-open-line', color: '#4ADE80', desc: '读取和分析用户提供的本地文件，提取关键信息', prompt: '你是一位专业的本地资料分析员。读取和分析用户提供的文件，提取核心论点、关键数据、重要结论和潜在问题。标注来源文件，对跨文件矛盾信息标注 [矛盾]。输出分析发现，不要撰写最终报告。', tools: ['file_read', 'kb_search'] },
      { id: 'sa_report-writer', name: '报告撰写员', icon: 'ri-file-edit-line', color: '#FACC15', desc: '综合所有研究发现，撰写 Markdown 研究报告和 HTML 可视化报告', prompt: '你是一位专业的研究报告撰写员。综合本地分析和网络研究发现，撰写结构清晰、引用完整的中文研究报告。需要创建文件时写入 /agents/deep-researcher/outputs/{date}/。不要编造来源。', tools: ['file_read', 'file_write'] },
      { id: 'sa_content-planner', name: '内容规划师', icon: 'ri-layout-4-line', color: '#6C8AFF', desc: '分析资料，规划 PPT 内容结构和叙事逻辑', prompt: '你是一位专业的演示文稿内容规划师。分析资料和用户需求，确定演示目标、受众、叙事模式和页面结构。输出包含标题、副标题、页面类型、要点和视觉建议的 JSON 大纲。', tools: ['file_read', 'kb_search', 'mcp:exa', 'web_search_bing'] },
      { id: 'sa_slide-builder', name: '幻灯片构建师', icon: 'ri-code-s-slash-line', color: '#4ADE80', desc: '根据大纲生成 HTML 幻灯片', prompt: '你是一位专业的 HTML 演示文稿开发师。根据内容大纲生成单文件 HTML 幻灯片，注意布局、配色、字号、动画和响应式。每页使用 <div class="slide slide-{type}" data-type="{type}"> 根容器。输出写入 /agents/ppt-generator/outputs/{date}/。', tools: ['file_write'] },
      { id: 'sa_pptx-exporter', name: 'PPTX 导出师', icon: 'ri-file-ppt-line', color: '#FACC15', desc: '将 HTML 演示文稿导出为可编辑的 PPTX 格式', prompt: '你是一位 PPTX 文件导出专家。读取 HTML 演示文稿，使用 pptx_export_local 工具导出可编辑 PPTX，并确认输出路径。PPTX 文件写入与 HTML 相同目录。', tools: ['file_read', 'pptx_export_local'] },
      { id: 'sa_visual-reviewer', name: '视觉审查员', icon: 'ri-eye-line', color: '#F87171', desc: '审查 PPT 视觉效果，检查布局、配色、可读性', prompt: '你是一位专业的演示文稿视觉审查师。检查布局、配色对比度、视觉层级、内容精炼度和风格一致性。输出 passed、score 和具体 issues，不要重写全文。', tools: ['file_read'] },
    ]

    const insert = this._db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`)
    let inserted = 0
    for (const sa of seeds) {
      const exists = this._db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
      if (exists) continue
      insert.run(sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools))
      inserted += 1
    }
    const slideSeed = seeds.find(sa => sa.id === 'sa_slide-builder')
    const slideRow = this._db.prepare('SELECT prompt, builtin FROM custom_sub_agents WHERE id = ?').get('sa_slide-builder')
    if (slideSeed && slideRow?.builtin && !String(slideRow.prompt || '').includes('data-type="{type}"')) {
      this._db.prepare('UPDATE custom_sub_agents SET prompt = ? WHERE id = ?').run(slideSeed.prompt, 'sa_slide-builder')
    }

    const pptxSeed = seeds.find(sa => sa.id === 'sa_pptx-exporter')
    const pptxRow = this._db.prepare('SELECT tools, prompt, builtin FROM custom_sub_agents WHERE id = ?').get('sa_pptx-exporter')
    if (pptxSeed && pptxRow?.builtin) {
      const tools = parseJSON(pptxRow.tools)
      if (Array.isArray(tools) && !tools.includes('pptx_export_local')) {
        this._db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(
          JSON.stringify([...new Set([...tools.filter(Boolean), 'pptx_export_local'])]),
          'sa_pptx-exporter',
        )
      }
      if (!String(pptxRow.prompt || '').includes('pptx_export_local')) {
        this._db.prepare('UPDATE custom_sub_agents SET prompt = ? WHERE id = ?').run(pptxSeed.prompt, 'sa_pptx-exporter')
      }
    }

    const contentPlannerSeed = seeds.find(sa => sa.id === 'sa_content-planner')
    const contentPlannerRow = this._db.prepare('SELECT tools, builtin FROM custom_sub_agents WHERE id = ?').get('sa_content-planner')
    if (contentPlannerSeed && contentPlannerRow?.builtin) {
      const tools = parseJSON(contentPlannerRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...contentPlannerSeed.tools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && !contentPlannerSeed.tools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this._db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(JSON.stringify(nextTools), 'sa_content-planner')
        }
      }
    }

    const webResearcherSeed = seeds.find(sa => sa.id === 'sa_web-researcher')
    const webResearcherRow = this._db.prepare('SELECT tools, builtin FROM custom_sub_agents WHERE id = ?').get('sa_web-researcher')
    if (webResearcherSeed && webResearcherRow?.builtin) {
      const tools = parseJSON(webResearcherRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...webResearcherSeed.tools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && t !== 'web_scrape' && !webResearcherSeed.tools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this._db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(JSON.stringify(nextTools), 'sa_web-researcher')
        }
      }
    }
    if (inserted) console.log(`[DB] Migrated: ensured ${inserted} creation-center sub-agents`)
  }

  _ensureCreationCenterAgentPrompts() {
    const agentCols = this._db.prepare("PRAGMA table_info(agents)").all()
    if (agentCols.some(c => c.name === 'builtin_template')) return

    const pptPrompt = [
      '你是一位专业的演示文稿设计师，负责协调 content-planner、slide-builder、pptx-exporter、visual-reviewer 子 agent 生成演示文稿。',
      '',
      '## 输出格式规则',
      '- 从用户消息的 [用户配置] 中读取输出格式，合法值为 html / pptx-local / pptx-cloud。',
      '- 如果用户没有明确指定输出格式，默认 html。',
      '- 始终先生成 HTML 演示文稿。',
      '- 仅当输出格式明确为 pptx-local 时，才委托 pptx-exporter 导出 PPTX。',
      '- 当输出格式为 html 时，不要调用 pptx-exporter。',
      '- 当输出格式为 pptx-cloud 时，提示用户"云端高质量 PPTX 导出即将上线，当前已输出 HTML 版本"，不要调用 pptx-exporter。',
      '',
      '## 工作流程',
      '1. 委托 content-planner 根据资料、场景、页数规划内容大纲。',
      '2. 委托 slide-builder 根据大纲生成单文件 HTML 幻灯片，写入 /agents/ppt-generator/outputs/{date}/。',
      '3. 如输出格式为 pptx-local，委托 pptx-exporter 将 HTML 文件导出为同目录 PPTX。',
      '4. 委托 visual-reviewer 审查最终文件，最多 2 轮修改。',
      '',
      '严格遵循用户选择的场景、格式和页数。每页内容精炼，避免文字堆砌。数据页使用图表而非纯文字。始终使用中文。',
    ].join('\n')

    const row = this._db.prepare("SELECT prompt, tools, builtin FROM agents WHERE english_name = 'ppt-generator'").get()
    if (row?.builtin && !String(row.prompt || '').includes('输出格式规则')) {
      this._db.prepare("UPDATE agents SET prompt = ? WHERE english_name = 'ppt-generator' AND builtin = 1").run(pptPrompt)
      console.log('[DB] Migrated: updated ppt-generator output-format prompt')
    }
    if (row?.builtin) {
      const defaultTools = ['mcp:exa', 'web_search_bing', 'file_read', 'file_write', 'kb_search']
      const tools = parseJSON(row.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...defaultTools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && !defaultTools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this._db.prepare("UPDATE agents SET tools = ? WHERE english_name = 'ppt-generator' AND builtin = 1").run(JSON.stringify(nextTools))
          console.log('[DB] Migrated: updated ppt-generator search tools')
        }
      }
    }

    const researchRow = this._db.prepare("SELECT tools, builtin FROM agents WHERE english_name = 'deep-researcher'").get()
    if (researchRow?.builtin) {
      const defaultTools = ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing', 'file_read', 'file_write', 'kb_search']
      const tools = parseJSON(researchRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...defaultTools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && t !== 'web_scrape' && !defaultTools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this._db.prepare("UPDATE agents SET tools = ? WHERE english_name = 'deep-researcher' AND builtin = 1").run(JSON.stringify(nextTools))
          console.log('[DB] Migrated: updated deep-researcher search tools')
        }
      }
    }
  }

  _runVersionedMigrations() {
    this._ensureSchemaMigrationsTable()

    const migrations = [...this._getVersionedMigrations()].sort((a, b) => a.version - b.version)
    if (migrations.length === 0) return

    const appliedRows = this._db.prepare('SELECT version FROM schema_migrations').all()
    const appliedVersions = new Set(appliedRows.map(row => row.version))
    const insertApplied = this._db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')

    for (const migration of migrations) {
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new Error(`[DB] Invalid migration version: ${migration.version}`)
      }
      if (!migration.name || typeof migration.up !== 'function') {
        throw new Error(`[DB] Invalid migration definition for version ${migration.version}`)
      }
      if (appliedVersions.has(migration.version)) continue

      const runMigration = this._db.transaction(() => {
        migration.up(this._db)
        insertApplied.run(migration.version, migration.name)
      })

      runMigration()
      appliedVersions.add(migration.version)
      console.log(`[DB] Migration ${migration.version} applied: ${migration.name}`)
    }
  }

  _migrateTables() {
    // Memories: migrate old type values to DeepAgents types
    // 'custom'/'preference' → 'semantic', 'system' → 'episodic'
    const oldTypes = this._db.prepare("SELECT DISTINCT type FROM memories").all()
    for (const row of oldTypes) {
      if (row.type === 'custom' || row.type === 'preference') {
        this._db.prepare('UPDATE memories SET type = \'semantic\' WHERE type = ?').run(row.type)
        console.log(`[DB] Migrated: memories type '${row.type}' → 'semantic'`)
      } else if (row.type === 'system') {
        this._db.prepare('UPDATE memories SET type = \'episodic\' WHERE type = ?').run(row.type)
        console.log(`[DB] Migrated: memories type 'system' → 'episodic'`)
      }
    }
    // Drop scope column if it exists (from earlier migration)
    const memCols = this._db.prepare("PRAGMA table_info(memories)").all()
    if (memCols.some(c => c.name === 'scope')) {
      // SQLite doesn't support DROP COLUMN before 3.35.0, recreate table
      this._db.exec(`
        CREATE TABLE memories_backup AS SELECT id, type, source, content, created_at, updated_at FROM memories;
        DROP TABLE memories;
        ALTER TABLE memories_backup RENAME TO memories;
      `)
      console.log('[DB] Migrated: removed scope column from memories')
    }

    const cols = this._db.prepare("PRAGMA table_info(token_usage)").all()
    const hasThinking = cols.some(c => c.name === 'thinking_tokens')
    if (!hasThinking) {
      this._db.exec('ALTER TABLE token_usage ADD COLUMN thinking_tokens INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added thinking_tokens column')
    }
    const convCols = this._db.prepare("PRAGMA table_info(conversations)").all()
    if (!convCols.some(c => c.name === 'group_id')) {
      this._db.exec('ALTER TABLE conversations ADD COLUMN group_id TEXT DEFAULT \'default\'')
      console.log('[DB] Migrated: added group_id column to conversations')
    }
    if (!convCols.some(c => c.name === 'context_length')) {
      this._db.exec('ALTER TABLE conversations ADD COLUMN context_length INTEGER DEFAULT 50')
      console.log('[DB] Migrated: added context_length column to conversations')
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_group ON conversations(group_id)')
    // Messages table: add chat metadata columns
    const msgCols = this._db.prepare("PRAGMA table_info(messages)").all()
    const msgNewCols = [
      ['status', 'TEXT DEFAULT \'completed\''],
      ['model_id', 'TEXT DEFAULT \'\''],
      ['provider_id', 'TEXT DEFAULT \'\''],
      ['input_tokens', 'INTEGER DEFAULT 0'],
      ['output_tokens', 'INTEGER DEFAULT 0'],
      ['cache_read_tokens', 'INTEGER DEFAULT 0'],
      ['cache_write_tokens', 'INTEGER DEFAULT 0'],
      ['thinking_tokens', 'INTEGER DEFAULT 0'],
      ['latency_ms', 'INTEGER DEFAULT 0'],
      ['cost', 'REAL DEFAULT 0'],
      ['error_message', 'TEXT DEFAULT \'\''],
      ['error_code', 'TEXT DEFAULT \'\''],
      ['parent_msg_id', 'TEXT DEFAULT \'\''],
      ['thinking_content', 'TEXT DEFAULT \'\''],
    ]
    for (const [col, def] of msgNewCols) {
      if (!msgCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE messages ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to messages`)
      }
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)')
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(provider_id, model_id)')

    // custom_skills table: add new skill columns
    const skillCols = this._db.prepare("PRAGMA table_info(custom_skills)").all()
    const skillNewCols = [
      ['source', "TEXT DEFAULT 'custom'"],
      ['category', "TEXT DEFAULT ''"],
      ['prompt_content', "TEXT DEFAULT ''"],
      ['allowed_tools', "TEXT DEFAULT '[]'"],
      ['version', "TEXT DEFAULT '1.0'"],
      ['author', "TEXT DEFAULT ''"],
      ['license', "TEXT DEFAULT ''"],
      ['enabled', 'INTEGER DEFAULT 1'],
    ]
    for (const [col, def] of skillNewCols) {
      if (skillCols.length > 0 && !skillCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE custom_skills ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to custom_skills`)
      }
    }
    // custom_tools table: add enabled and provider_config columns
    const toolCols = this._db.prepare("PRAGMA table_info(custom_tools)").all()
    const toolNewCols = [
      ['enabled', 'INTEGER DEFAULT 1'],
      ['provider_config', "TEXT DEFAULT '{}'"],
    ]
    for (const [col, def] of toolNewCols) {
      if (toolCols.length > 0 && !toolCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE custom_tools ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to custom_tools`)
      }
    }
    // Update existing tool category values from old system
    if (toolCols.length > 0) {
      this._db.prepare("UPDATE custom_tools SET category = 'custom' WHERE category = '外部' OR category = '云端'").run()
      this._db.prepare("UPDATE custom_tools SET category = 'filesystem' WHERE category = '本地'").run()
    }

    // mcp_servers table: add non-tool MCP capability caches
    const mcpCols = this._db.prepare("PRAGMA table_info(mcp_servers)").all()
    const mcpNewCols = [
      ['resources_cache', "TEXT DEFAULT '[]'"],
      ['resource_templates_cache', "TEXT DEFAULT '[]'"],
      ['prompts_cache', "TEXT DEFAULT '[]'"],
      ['capabilities_cache', "TEXT DEFAULT '{}'"],
      ['server_info_cache', "TEXT DEFAULT '{}'"],
      ['instructions', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of mcpNewCols) {
      if (mcpCols.length > 0 && !mcpCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE mcp_servers ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to mcp_servers`)
      }
    }

    // Messages table: add run_id and step_index columns
    const msgCols2 = this._db.prepare("PRAGMA table_info(messages)").all()
    if (!msgCols2.some(c => c.name === 'run_id')) {
      this._db.exec("ALTER TABLE messages ADD COLUMN run_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added run_id column to messages')
    }
    if (!msgCols2.some(c => c.name === 'step_index')) {
      this._db.exec('ALTER TABLE messages ADD COLUMN step_index INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added step_index column to messages')
    }
    if (!msgCols2.some(c => c.name === 'thinking_content')) {
      this._db.exec("ALTER TABLE messages ADD COLUMN thinking_content TEXT DEFAULT ''")
      console.log('[DB] Migrated: added thinking_content column to messages')
    }

    // Token usage table: add run_id and iteration columns
    const tuCols = this._db.prepare("PRAGMA table_info(token_usage)").all()
    if (!tuCols.some(c => c.name === 'run_id')) {
      this._db.exec("ALTER TABLE token_usage ADD COLUMN run_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added run_id column to token_usage')
    }
    if (!tuCols.some(c => c.name === 'iteration')) {
      this._db.exec('ALTER TABLE token_usage ADD COLUMN iteration INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added iteration column to token_usage')
    }

    // Agents table: add thinking_mode and thinking_intensity columns
    const agentCols = this._db.prepare("PRAGMA table_info(agents)").all()
    if (!agentCols.some(c => c.name === 'thinking_mode')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN thinking_mode TEXT DEFAULT 'auto'")
      console.log('[DB] Migrated: added thinking_mode column to agents')
    }
    if (!agentCols.some(c => c.name === 'thinking_intensity')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN thinking_intensity TEXT DEFAULT 'medium'")
      console.log('[DB] Migrated: added thinking_intensity column to agents')
    }
    if (!agentCols.some(c => c.name === 'english_name')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN english_name TEXT DEFAULT ''")
      console.log('[DB] Migrated: added english_name column to agents')
    }
    if (!agentCols.some(c => c.name === 'reviewer_model')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN reviewer_model TEXT DEFAULT ''")
      console.log('[DB] Migrated: added reviewer_model column to agents')
    }
    if (!agentCols.some(c => c.name === 'use_same_model')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN use_same_model INTEGER DEFAULT 1")
      console.log('[DB] Migrated: added use_same_model column to agents')
    }
    if (!agentCols.some(c => c.name === 'tool_call_limit')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN tool_call_limit INTEGER DEFAULT 0")
      console.log('[DB] Migrated: added tool_call_limit column to agents')
    }
    if (!agentCols.some(c => c.name === 'model_call_limit')) {
      this._db.exec("ALTER TABLE agents ADD COLUMN model_call_limit INTEGER DEFAULT 0")
      console.log('[DB] Migrated: added model_call_limit column to agents')
    }
    const builtinAgentCols = [
      ['builtin_key', "TEXT DEFAULT ''"],
      ['builtin_version', "TEXT DEFAULT ''"],
      ['builtin_template_hash', "TEXT DEFAULT ''"],
      ['builtin_template', "TEXT DEFAULT '{}'"],
      ['user_overrides', "TEXT DEFAULT '{}'"],
    ]
    for (const [col, def] of builtinAgentCols) {
      if (!agentCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE agents ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to agents`)
      }
    }
    // Unique index on english_name (excluding empty strings — multiple agents can have no english_name)
    this._db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_english_name ON agents(english_name) WHERE english_name != ''")
    console.log('[DB] Migrated: added unique index on agents.english_name')
    // Seed english_name for built-in agents that don't have one
    const builtinEnglishNameById = {
      agent_researcher: 'deep-researcher',
      agent_ppt: 'ppt-generator',
      agent_lab_report: 'lab-report-assistant',
      agent_mindmap: 'mindmap-generator',
      agent_graph: 'graph-generator',
      agent_flashcard: 'flashcard-generator',
      agent_quiz: 'quiz-generator',
      agent_chart: 'chart-generator',
    }
    const builtinEnglishNameByName = {
      '深度研究员': 'deep-researcher',
      'PPT 生成器': 'ppt-generator',
      '实验报告助手': 'lab-report-assistant',
      '思维导图生成器': 'mindmap-generator',
      '知识图谱生成器': 'graph-generator',
    }
    const builtins = this._db.prepare("SELECT id, name, english_name FROM agents WHERE builtin = 1 AND (english_name IS NULL OR english_name = '')").all()
    for (const b of builtins) {
      const en = builtinEnglishNameById[b.id] || builtinEnglishNameByName[b.name] || b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (en) {
        try {
          this._db.prepare('UPDATE agents SET english_name = ? WHERE id = ?').run(en, b.id)
          console.log('[DB] Migrated: set english_name for builtin agent', b.id, '→', en)
        } catch (e) {
          console.warn('[DB] Could not set english_name for', b.id, ':', e.message)
        }
      }
    }

    this._ensureArtifactsTable()

    // ─── Seed lab-report-assistant builtin agent ───
    const labReportExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'lab-report-assistant'").get()
    if (!labReportExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_lab_report', '实验报告助手', 'lab-report-assistant',
        '根据实验要求、模板、数据和资料生成或完善专业实验报告，支持 Word 文档输出和模板编辑',
        'ri-flask-line', '#14B8A6', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['office_read', 'office_write', 'file_read', 'file_write', 'kb_search', 'web_search_bing']),
        JSON.stringify(['lab-report-writer', 'officecli-skills']),
        JSON.stringify([]),
        '你是一位专业的实验报告写作与 Office 文档整理助手。根据用户提供的实验要求、模板、数据、图片和课程资料，生成或完善可提交的实验报告。\n\n## 工作要求\n- 默认输出 Word 文档；用户明确要求草稿时可输出 Markdown。\n- 有模板时先用 office_read 理解结构，再用 office_write 编辑副本，保留原模板样式，不覆盖源文件。\n- 无模板时生成完整结构：封面、摘要、实验目的、实验原理、仪器材料、实验步骤、数据记录与处理、结果分析、误差分析、结论、思考题、参考文献、附录。\n- 优先依据用户文件和知识库；需要补充实验原理时可使用搜索，但不要把搜索内容伪装成用户实验数据。\n- 不编造姓名学号、教师要求、仪器型号、真实数据、参考文献页码或实验照片；缺失项写“待补充”。\n- 数据表必须有列名和单位，结论必须对应数据或资料。\n- 输出写入 /agents/lab-report-assistant/outputs/{date}/，最终回复列出文件路径和仍需补充的信息。',
        10, 5, 0.25, 16384, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded lab-report-assistant builtin agent')
    }

    // ─── Seed deep-researcher builtin agent (migrate for existing DBs) ───
    const researcherExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'deep-researcher'").get()
    if (!researcherExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_researcher', '深度研究员', 'deep-researcher',
        '对文件和网上信息进行深度研究，生成 Markdown 研究报告和 HTML 可视化报告',
        'ri-search-eye-line', '#38BDF8', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing', 'file_read', 'file_write', 'kb_search']),
        JSON.stringify(['deep-research']),
        JSON.stringify(['web-researcher', 'local-analyst', 'report-writer']),
        '你是一位专业的研究分析师。深入研究用户提供的资料，结合互联网信息，生成全面、准确、有见地的研究报告。\n\n始终使用中文撰写报告。每个论断都要有来源引用，标注[本地]或[网络]。对信息进行交叉验证，标注矛盾和不确定性。',
        15, 7, 0.3, 8192, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded deep-researcher builtin agent')

      // Seed deep-researcher sub-agents
      const saSeeds = [
        { id: 'sa_web-researcher', name: '网络搜索研究员', icon: 'ri-global-line', color: '#38BDF8', desc: '对给定主题进行网络搜索研究，返回带引用编号的发现', prompt: '你是一位专业的网络搜索研究员。对用户指定的主题进行深入的网络搜索研究。\n\n## 搜索策略\n- 搜索预算：简单查询 2-3 次搜索，复杂查询最多 5 次\n- 先宽后窄：先广泛搜索，再针对性补充\n- 找到 3+ 相关来源即可停止，不追求完美\n\n## 引用格式\n- 使用 [1], [2], [3] 格式内联引用\n- 末尾列出 ### Sources，格式：[编号] 标题: URL\n\n## 返回格式\n## 关键发现\n详细描述发现...\n\n### Sources\n[1] 标题: URL\n[2] 标题: URL', tools: ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing'] },
        { id: 'sa_local-analyst', name: '本地资料分析员', icon: 'ri-folder-open-line', color: '#4ADE80', desc: '读取和分析用户提供的本地文件，提取关键信息', prompt: '你是一位专业的本地资料分析员。读取和分析用户提供的文件，提取关键信息。\n\n## 分析要点\n- 提取：核心论点、关键数据、重要结论、潜在问题\n- 标注文件来源（哪个文件、哪一节）\n- 对矛盾信息标注 [⚠️ 矛盾]\n\n## 返回格式\n## 本地资料摘要\n### 文件1: 文件名\n- 核心论点：...\n- 关键数据：...\n- 重要结论：...\n\n### 跨文件发现\n- 共同主题：...\n- 矛盾点：[⚠️ 矛盾] ...', tools: ['file_read', 'kb_search'] },
        { id: 'sa_report-writer', name: '报告撰写员', icon: 'ri-file-edit-line', color: '#FACC15', desc: '综合所有研究发现，撰写 Markdown 研究报告和 HTML 可视化报告', prompt: '你是一位专业的研究报告撰写员。综合所有子 agent 的研究发现，撰写完整的研究报告。\n\n## 报告要求\n\n### Markdown 报告\n- 结构：摘要 → 背景 → 分析 → 结论 → 来源\n- 统一引用编号（每个 URL 一个编号，跨所有子 agent 发现统一编排）\n- 使用中文撰写\n- 每个论断都有来源引用\n\n### HTML 可视化报告\n- 完全自包含（内联 CSS/JS，无外部依赖）\n- 响应式布局（max-width: 960px）\n- 中文排版优化\n- 左侧粘性锚点目录（IntersectionObserver）\n- 关键发现彩色卡片\n- 内联 SVG 图表\n- 来源可点击链接\n- prefers-color-scheme 暗色模式\n- 系统字体栈\n\n## 输出路径\n- Markdown: /agents/deep-researcher/outputs/{date}/research-report.md\n- HTML: /agents/deep-researcher/outputs/{date}/research-report.html', tools: ['file_write'] },
      ]
      for (const sa of saSeeds) {
        const exists = this._db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
        if (!exists) {
          this._db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`).run(
            sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools)
          )
        }
      }
      console.log('[DB] Migrated: seeded deep-researcher sub-agents')
    }

    // ─── Seed ppt-generator builtin agent ───
    const pptExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'ppt-generator'").get()
    if (!pptExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_ppt', 'PPT 生成器', 'ppt-generator',
        '根据资料和需求生成精美演示文稿，支持 HTML 和 PPTX 格式',
        'ri-slideshow-line', '#6C8AFF', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['mcp:exa', 'web_search_bing', 'file_read', 'file_write', 'kb_search']),
        JSON.stringify(['ppt-creation']),
        JSON.stringify(['content-planner', 'slide-builder', 'pptx-exporter', 'visual-reviewer']),
        '你是一位专业的演示文稿设计师，负责协调 content-planner、slide-builder、pptx-exporter、visual-reviewer 子 agent 生成演示文稿。\n\n## 输出格式规则\n- 从用户消息的 [用户配置] 中读取输出格式，合法值为 html / pptx-local / pptx-cloud。\n- 如果用户没有明确指定输出格式，默认 html。\n- 始终先生成 HTML 演示文稿。\n- 仅当输出格式明确为 pptx-local 时，才委托 pptx-exporter 导出 PPTX。\n- 当输出格式为 html 时，不要调用 pptx-exporter。\n- 当输出格式为 pptx-cloud 时，提示用户"云端高质量 PPTX 导出即将上线，当前已输出 HTML 版本"，不要调用 pptx-exporter。\n\n## 工作流程\n1. 委托 content-planner 根据资料、场景、页数规划内容大纲。\n2. 委托 slide-builder 根据大纲生成单文件 HTML 幻灯片，写入 /agents/ppt-generator/outputs/{date}/。\n3. 如输出格式为 pptx-local，委托 pptx-exporter 将 HTML 文件导出为同目录 PPTX。\n4. 委托 visual-reviewer 审查最终文件，最多 2 轮修改。\n\n严格遵循用户选择的场景、格式和页数。每页内容精炼，避免文字堆砌。数据页使用图表而非纯文字。始终使用中文。',
        15, 6, 0.4, 16384, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded ppt-generator builtin agent')

      // Seed ppt-generator sub-agents
      const pptSaSeeds = [
        { id: 'sa_content-planner', name: '内容规划师', icon: 'ri-layout-4-line', color: '#6C8AFF', desc: '分析资料，规划 PPT 内容结构和叙事逻辑', prompt: '你是一位专业的演示文稿内容规划师。分析用户资料，规划 PPT 的内容结构、页面分配和叙事逻辑。\n\n## 工作方法\n1. 读取并分析所有资料，提取核心内容\n2. 确定演示目标、受众、叙事模式\n3. 规划每页：类型 + 标题 + 要点 + 视觉建议\n4. 输出 JSON 格式大纲\n\n## 精炼原则\n- 每页只传达一个核心观点\n- 每页要点不超过5个，每个15字以内\n- 数据用图表呈现\n- 关键词加粗，次要信息弱化\n\n## 输出 JSON 格式\n```json\n{\n  "title": "演示标题",\n  "subtitle": "副标题",\n  "style": "elegant|swiss",\n  "slides": [\n    { "type": "title", "title": "...", "subtitle": "..." },\n    { "type": "content", "title": "...", "points": [{"text": "...", "emphasis": true}], "visual": "chart|icon|none" },\n    { "type": "comparison", "title": "...", "leftTitle": "...", "leftPoints": [...], "rightTitle": "...", "rightPoints": [...] },\n    { "type": "data", "title": "...", "chartType": "bar|pie|line", "dataPoints": [{"label": "...", "value": 100}], "insight": "..." },\n    { "type": "end", "title": "感谢", "message": "..." }\n  ]\n}\n```', tools: ['file_read', 'kb_search', 'mcp:exa', 'web_search_bing'] },
        { id: 'sa_slide-builder', name: '幻灯片构建师', icon: 'ri-code-s-slash-line', color: '#4ADE80', desc: '根据大纲生成 HTML 幻灯片，支持多种布局和动画', prompt: '你是一位专业的 HTML 演示文稿开发师。根据 JSON 大纲生成精美的单文件 HTML 幻灯片。\n\n## 风格规范\n### elegant（优雅）\n- 衬线标题字体 Noto Serif SC\n- 无衬线正文字体 Inter\n- 柔和渐变背景\n- 圆角 12px\n\n### swiss（瑞士国际主义）\n- 无衬线字体 Inter（统一）\n- 网格点阵背景\n- 高饱和度强调色\n- 圆角 4px\n\n## 主题配色\n根据 themeId 选择预设配色，注入 CSS 变量。\n\n## 技术要求\n- 单文件 HTML，所有 CSS/JS 内联\n- 每页必须使用 <div class="slide slide-{type}" data-type="{type}"> 根容器，{type} 为 title/content/comparison/data/quote/end\n- Google Fonts CDN 加载字体\n- 键盘左右箭头翻页\n- 底部页码指示器\n- 每页 fade-in + slide-up 入场动画\n- 响应式 1920×1080 和 1280×720\n\n## 输出\n使用 file_write 写入 /agents/ppt-generator/outputs/{date}/{title}.html', tools: ['file_write'] },
        { id: 'sa_pptx-exporter', name: 'PPTX 导出师', icon: 'ri-file-ppt-line', color: '#FACC15', desc: '将 HTML 演示文稿导出为可编辑的 PPTX 格式', prompt: '你是一位 PPTX 文件导出专家。将 HTML 演示文稿转换为可编辑的 PPTX 格式。\n\n## 工作方法\n1. 使用 file_read 读取 HTML 文件\n2. 使用 pptx_export_local 工具导出为 PPTX\n3. 确认导出结果\n\n## PPTX 导出规则\n- 标题页：居中大标题 + 副标题\n- 内容页：标题 + 要点列表，每条一个文本框\n- 对比页：左右两栏布局\n- 数据页：标题 + 图表占位\n- 引用页：居中引用文字\n- 结束页：感谢文字\n\n## 输出\nPPTX 文件写入与 HTML 相同目录：/agents/ppt-generator/outputs/{date}/{title}.pptx', tools: ['file_read', 'pptx_export_local'] },
        { id: 'sa_visual-reviewer', name: '视觉审查员', icon: 'ri-eye-line', color: '#F87171', desc: '审查 PPT 视觉效果，检查布局、配色、可读性', prompt: '你是一位专业的演示文稿视觉审查师。审查生成的 PPT/HTML 文件的视觉效果。\n\n## 审查维度\n1. 布局合理性 — 内容是否溢出，间距是否均匀\n2. 配色对比度 — 文字与背景对比度是否足够（WCAG AA: 4.5:1）\n3. 视觉层次 — 标题是否突出，要点是否有标记\n4. 内容精炼度 — 每页要点不超过5个，每个15字以内\n5. 风格一致性 — 所有页面是否遵循同一风格\n\n## 输出 JSON 格式\n```json\n{\n  "passed": true|false,\n  "score": 1-10,\n  "issues": [\n    { "page": 1, "type": "layout|color|hierarchy|content|style", "description": "问题描述", "suggestion": "改进建议" }\n  ]\n}\n```\n\n## 审查标准\n- passed: true — 无严重问题，最多2个轻微建议\n- passed: false — 至少1个需要修改的问题\n- 建议要具体可操作', tools: ['file_read'] },
      ]
      for (const sa of pptSaSeeds) {
        const exists = this._db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
        if (!exists) {
          this._db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`).run(
            sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools)
          )
        }
      }
      console.log('[DB] Migrated: seeded ppt-generator sub-agents')
    }

    this._ensureCreationCenterSubAgentSeeds()
    this._ensureCreationCenterAgentPrompts()

    // recycle_bin table: add columns for DB-typed trash items (conversations, notes, note_folders)
    const trashCols = this._db.prepare("PRAGMA table_info(recycle_bin)").all()
    const trashNewCols = [
      ['item_type', "TEXT DEFAULT 'file'"],
      ['item_id', "TEXT DEFAULT ''"],
      ['payload_json', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of trashNewCols) {
      if (trashCols.length > 0 && !trashCols.some(c => c.name === col)) {
        this._db.exec(`ALTER TABLE recycle_bin ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to recycle_bin`)
      }
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_recycle_bin_item_type ON recycle_bin(item_type)')

    // notes table: store note bodies in workspace Markdown files, keep DB as metadata/index
    const noteCols = this._db.prepare("PRAGMA table_info(notes)").all()
    if (noteCols.length > 0 && !noteCols.some(c => c.name === 'file_path')) {
      this._db.exec("ALTER TABLE notes ADD COLUMN file_path TEXT DEFAULT ''")
      console.log('[DB] Migrated: added file_path column to notes')
    }
    this._db.exec('CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path)')

    // ─── Generation tasks: extend tasks table for async creation (mindmap/graph/podcast/...) ───
    const taskCols = this._db.prepare("PRAGMA table_info(tasks)").all()
    this._ensureTaskGenerationColumns(taskCols)

    // ─── Seed mindmap-generator builtin agent ───
    const mindmapExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'mindmap-generator'").get()
    if (!mindmapExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_mindmap', '思维导图生成器', 'mindmap-generator',
        '根据主题或资料生成结构化思维导图（JSON）',
        'ri-mind-map', '#10B981', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位思维导图专家。根据用户主题或资料生成层次清晰、逻辑严谨的思维导图。',
        1, 1, 0.4, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded mindmap-generator builtin agent')
    }

    // ─── Seed graph-generator builtin agent ───
    const graphExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'graph-generator'").get()
    if (!graphExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_graph', '知识图谱生成器', 'graph-generator',
        '根据资料抽取实体与关系，生成知识图谱（JSON）',
        'ri-share-circle-line', '#F59E0B', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位知识图谱抽取专家。从用户资料或主题中识别实体、关系，生成结构化知识图谱。',
        1, 1, 0.3, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded graph-generator builtin agent')
    }

    // ─── Seed flashcard-generator builtin agent ───
    const flashcardExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'flashcard-generator'").get()
    if (!flashcardExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_flashcard', '闪卡生成器', 'flashcard-generator',
        '根据主题或资料生成结构化学习闪卡（JSON）',
        'ri-stack-line', '#EC4899', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify(['flashcard-generator']),
        JSON.stringify([]),
        '你是一位学习闪卡设计专家。根据用户主题或资料生成适合主动回忆和快速复习的结构化闪卡。',
        1, 1, 0.35, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded flashcard-generator builtin agent')
    }

    // ─── Seed quiz-generator builtin agent ───
    const quizExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'quiz-generator'").get()
    if (!quizExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_quiz', '测验生成器', 'quiz-generator',
        '根据主题或资料生成结构化测验题（JSON）',
        'ri-questionnaire-line', '#22C55E', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify(['quiz-generator']),
        JSON.stringify([]),
        '你是一位学习测验出题专家。根据用户主题或资料生成可交互答题的结构化测验。',
        1, 1, 0.35, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded quiz-generator builtin agent')
    }

    // ─── Seed chart-generator builtin agent ───
    const chartExists = this._db.prepare("SELECT id FROM agents WHERE english_name = 'chart-generator'").get()
    if (!chartExists) {
      this._db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_chart', '图表生成器', 'chart-generator',
        '根据主题或资料生成 SVG 信息图和可视化图表（JSON）',
        'ri-bar-chart-box-line', '#38BDF8', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位信息图和数据可视化设计专家。根据用户主题、资料或知识库检索结果，生成便于阅读和理解的 SVG 图表集。',
        1, 1, 0.35, 16384, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded chart-generator builtin agent')
    }
  }

  // ─── Schema & Seed ───

  _createTables() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
        icon TEXT DEFAULT 'ri-folder-3-line', color TEXT DEFAULT '#6C8AFF', sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT DEFAULT '',
        size INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, file_path TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, space_id TEXT DEFAULT '', agent_id TEXT DEFAULT '',
        title TEXT DEFAULT '新对话', architecture TEXT DEFAULT '', model TEXT DEFAULT '',
        group_id TEXT DEFAULT 'default', context_length INTEGER DEFAULT 50,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT DEFAULT '', meta TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT DEFAULT '', description TEXT DEFAULT '',
        icon TEXT DEFAULT 'ri-sparkling-2-line', color TEXT DEFAULT '#A78BFA', architecture TEXT DEFAULT 'react',
        builtin INTEGER DEFAULT 0, permissions TEXT DEFAULT '{}', tools TEXT DEFAULT '[]',
        skills TEXT DEFAULT '[]', sub_agents TEXT DEFAULT '[]', prompt TEXT DEFAULT '',
        max_iterations INTEGER DEFAULT 10, reflect_persist INTEGER DEFAULT 0,
        planning_model TEXT DEFAULT '', plan_steps INTEGER DEFAULT 5, complexity_classifier INTEGER DEFAULT 0,
        model TEXT DEFAULT '', temperature REAL DEFAULT 0.7, top_p REAL DEFAULT 1.0,
        max_tokens INTEGER DEFAULT 4096, presence_penalty REAL DEFAULT 0, frequency_penalty REAL DEFAULT 0,
        thinking_mode TEXT DEFAULT 'auto', thinking_intensity TEXT DEFAULT 'medium',
        builtin_key TEXT DEFAULT '', builtin_version TEXT DEFAULT '', builtin_template_hash TEXT DEFAULT '',
        builtin_template TEXT DEFAULT '{}', user_overrides TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_skills (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-flashlight-line',
        color TEXT DEFAULT '#6C8AFF', description TEXT DEFAULT '', detail TEXT DEFAULT '',
        prompt_template TEXT DEFAULT '', output_types TEXT DEFAULT '["Markdown"]', builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_tools (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-tools-line',
        color TEXT DEFAULT '#4ADE80', category TEXT DEFAULT 'custom', description TEXT DEFAULT '',
        type TEXT DEFAULT 'api', api_url TEXT DEFAULT '', method TEXT DEFAULT 'POST',
        headers TEXT DEFAULT '{}', params TEXT DEFAULT '[]', response_format TEXT DEFAULT 'JSON',
        script_path TEXT DEFAULT '', sandbox TEXT DEFAULT '', perm_required TEXT DEFAULT '',
        arch_compat TEXT DEFAULT '["react","plan_exec","hybrid"]', builtin INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1, provider_config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_sub_agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-team-line',
        color TEXT DEFAULT '#6C8AFF', description TEXT DEFAULT '', prompt TEXT DEFAULT '',
        tools TEXT DEFAULT '[]', skills TEXT DEFAULT '[]', model TEXT DEFAULT '',
        temperature REAL DEFAULT 0.7, builtin INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'agent', status TEXT DEFAULT 'pending',
        architecture TEXT DEFAULT '', space_id TEXT DEFAULT '', agent_id TEXT DEFAULT '',
        skill_type TEXT DEFAULT '', progress INTEGER DEFAULT 0, steps TEXT DEFAULT '[]',
        result TEXT DEFAULT '', error TEXT DEFAULT '',
        tool_id TEXT DEFAULT '', mode TEXT DEFAULT 'local',
        conversation_id TEXT DEFAULT '', group_id TEXT DEFAULT 'default',
        params_json TEXT DEFAULT '{}', artifact_id TEXT DEFAULT '',
        cloud_task_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS wikis (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        path TEXT DEFAULT '',
        status TEXT DEFAULT 'ready',
        page_count INTEGER DEFAULT 0,
        source_count INTEGER DEFAULT 0,
        asset_count INTEGER DEFAULT 0,
        index_status TEXT DEFAULT 'empty',
        agent_config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wiki_sources (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        type TEXT DEFAULT 'file',
        title TEXT DEFAULT '',
        original_uri TEXT DEFAULT '',
        original_path TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        size INTEGER DEFAULT 0,
        extract_path TEXT DEFAULT '',
        parser_status TEXT DEFAULT '',
        parser_message TEXT DEFAULT '',
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS wiki_jobs (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        source_id TEXT DEFAULT '',
        type TEXT DEFAULT 'wiki',
        name TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        message TEXT DEFAULT '',
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS ocr_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'custom',
        mode TEXT DEFAULT 'remote',
        base_url TEXT DEFAULT '',
        api_key_ref TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wiki_ocr_jobs (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        source_id TEXT DEFAULT '',
        provider_id TEXT DEFAULT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        pages_total INTEGER DEFAULT 0,
        pages_done INTEGER DEFAULT 0,
        input_path TEXT DEFAULT '',
        output_manifest_path TEXT DEFAULT '',
        output_extract_path TEXT DEFAULT '',
        cache_path TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        metrics_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES ocr_providers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wikis_status ON wikis(status);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_wiki ON wiki_sources(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_status ON wiki_sources(status);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_hash ON wiki_sources(content_hash);
      CREATE INDEX IF NOT EXISTS idx_wiki_jobs_wiki ON wiki_jobs(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_jobs_status ON wiki_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_ocr_providers_type ON ocr_providers(type);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_wiki ON wiki_ocr_jobs(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_source ON wiki_ocr_jobs(source_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_status ON wiki_ocr_jobs(status);
      CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'summary',
        category TEXT DEFAULT 'desk', agent_name TEXT DEFAULT '', skill_name TEXT DEFAULT '',
        format TEXT DEFAULT 'Markdown', file_path TEXT DEFAULT '', file_size TEXT DEFAULT '',
        content TEXT DEFAULT '', space_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT DEFAULT 'http',
        url TEXT NOT NULL,
        headers TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        disabled_tools TEXT DEFAULT '[]',
        last_status TEXT DEFAULT '',
        last_error TEXT DEFAULT '',
        last_synced_at TEXT DEFAULT '',
        tools_cache TEXT DEFAULT '[]',
        resources_cache TEXT DEFAULT '[]',
        resource_templates_cache TEXT DEFAULT '[]',
        prompts_cache TEXT DEFAULT '[]',
        capabilities_cache TEXT DEFAULT '{}',
        server_info_cache TEXT DEFAULT '{}',
        instructions TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, type TEXT DEFAULT 'semantic', source TEXT DEFAULT '',
        content TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space_id);
      CREATE TABLE IF NOT EXISTS conv_groups (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_space ON conversations(space_id);
      CREATE INDEX IF NOT EXISTS idx_outputs_category ON outputs(category);
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'default',
        conversation_id TEXT DEFAULT '',
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT DEFAULT 'ri-file-line',
        color TEXT DEFAULT 'brand',
        storage_type TEXT NOT NULL,
        file_path TEXT DEFAULT '',
        content TEXT DEFAULT '',
        agent_name TEXT DEFAULT '',
        skill_name TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (group_id) REFERENCES conv_groups(id)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_group ON artifacts(group_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);
      CREATE TABLE IF NOT EXISTS recycle_bin (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        trash_path TEXT NOT NULL,
        is_directory INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        file_type TEXT DEFAULT '',
        category TEXT DEFAULT 'other',
        item_type TEXT DEFAULT 'file',
        item_id TEXT DEFAULT '',
        payload_json TEXT DEFAULT '',
        deleted_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_at ON recycle_bin(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_category ON recycle_bin(category);
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        thinking_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        agent_id TEXT DEFAULT '',
        conversation_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(provider_id, model_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        parent_run_id TEXT DEFAULT '',
        status TEXT DEFAULT 'running',
        iterations INTEGER DEFAULT 0,
        max_iterations INTEGER DEFAULT 10,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        steps TEXT DEFAULT '[]',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        compressed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_conv ON agent_runs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

      CREATE TABLE IF NOT EXISTS note_folders (
        id TEXT PRIMARY KEY,
        parent_id TEXT DEFAULT '',
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'ri-folder-line',
        color TEXT DEFAULT '#6C8AFF',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_note_folders_parent ON note_folders(parent_id);

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        file_path TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
    `)
  }

  _seedBuiltinData() {
    // Seed default conversation group
    const grpCount = this._db.prepare('SELECT COUNT(*) as c FROM conv_groups WHERE id = \'default\'').get()
    if (grpCount.c === 0) {
      this._db.prepare('INSERT INTO conv_groups (id, name, sort_order) VALUES (?, ?, ?)').run('default', '默认分组', 0)
    }

    const count = this._db.prepare('SELECT COUNT(*) as c FROM agents WHERE builtin = 1').get()
    if (count.c > 0) return

    const insert = this._db.prepare(`
      INSERT INTO agents (id, name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, planning_model, plan_steps, temperature)
      VALUES (@id, @name, @description, @icon, @color, @architecture, @builtin, @permissions, @tools, @skills, @sub_agents, @prompt, @max_iterations, @planning_model, @plan_steps, @temperature)
    `)

    const agents = [
      { id: 'agent_1', name: '错题分析助手', description: '基于错题集进行错误原因分析，提供针对性改进建议', icon: 'ri-search-eye-line', color: '#A78BFA', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":false,"fileRename":false,"webSearch":true,"kbSearch":true}',
        tools: '["web_search_tavily","file_read","kb_search"]', skills: '["quizzes","summary"]', sub_agents: '["Reader"]',
        prompt: '你是一个专业的错题分析助手。当用户提供错题时，你需要：\n1. 识别错误类型（概念性/计算性/审题性）\n2. 分析错误根因\n3. 提供同类题目的解题思路\n4. 推荐复习方向',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.7 },
      { id: 'agent_2', name: '复习规划师', description: '制定个性化复习计划，跟踪复习进度并动态调整', icon: 'ri-calendar-check-line', color: '#4ADE80', architecture: 'plan_exec', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","kb_search"]', skills: '["outline","cram_sheet","summary"]', sub_agents: '["Reader","Summarizer","Review Planner"]',
        prompt: '你是一个复习规划专家。根据用户的学习资料和考试时间，制定详细的复习计划。',
        max_iterations: 5, planning_model: 'claude-4-7-opus', plan_steps: 5, temperature: 0.5 },
      { id: 'agent_3', name: '概念解释器', description: '用苏格拉底式追问帮助用户深入理解概念', icon: 'ri-chat-smile-2-line', color: '#6C8AFF', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":false,"fileWrite":false,"fileRename":false,"webSearch":true,"kbSearch":true}',
        tools: '["web_search_tavily","kb_search"]', skills: '["summary","mindmap"]', sub_agents: '[]',
        prompt: '你是一个苏格拉底式教学助手。通过连续追问引导用户自己思考和理解。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.8 },
      { id: 'agent_4', name: '摘要助手', description: '快速生成文档摘要，支持多种格式输出', icon: 'ri-file-text-line', color: '#6C8AFF', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":false,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","kb_search"]', skills: '["summary"]', sub_agents: '["Reader","Summarizer"]',
        prompt: '你是一个文档摘要专家。阅读文档后，生成结构清晰的摘要。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.3 },
      { id: 'agent_5', name: '测验生成器', description: '基于学习资料自动生成测验题与答案', icon: 'ri-question-line', color: '#FACC15', architecture: 'react', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":false,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","kb_search"]', skills: '["quizzes","flashcards"]', sub_agents: '["Quiz","Reader"]',
        prompt: '你是一个测验出题专家。根据学习资料生成不同难度和类型的测验题目。',
        max_iterations: 10, planning_model: '', plan_steps: 5, temperature: 0.7 },
      { id: 'agent_6', name: '知识整理师', description: '对空间资料进行结构化知识编译与整理', icon: 'ri-node-tree', color: '#F87171', architecture: 'plan_exec', builtin: 1,
        permissions: '{"fileRead":true,"fileWrite":true,"fileRename":true,"webSearch":false,"kbSearch":true}',
        tools: '["file_read","file_write","file_rename","file_list","kb_search"]', skills: '["outline","mindmap","summary"]', sub_agents: '["Reader","Summarizer"]',
        prompt: '你是一个知识整理专家。结合知识库检索和本地资料读取，对空间资料进行结构化整理。',
        max_iterations: 5, planning_model: '', plan_steps: 5, temperature: 0.4 },
    ]

    this._db.transaction(() => { for (const a of agents) insert.run(a) })()
  }
}
