import crypto from 'node:crypto'
import {
  AGENT_JSON_FIELDS,
  AGENT_BOOL_FIELDS,
  AGENT_NUMBER_FIELDS,
  BUILTIN_AGENT_ARRAY_MERGE_FIELDS,
  BUILTIN_AGENT_USER_SCALAR_FIELDS,
  BUILTIN_AGENT_TEMPLATE_FIELDS,
  parseJSON,
  stringifyJSON,
  stableStringify,
  isObject,
  uniqueStringArray,
  arrayDiff,
  dynamicUpdate,
} from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

function deriveArrayOverride(values, base) {
  const added = arrayDiff(values, base)
  const removed = arrayDiff(base, values)
  return { added, removed }
}

function normalizeArrayOverride(override, base) {
  const baseValues = uniqueStringArray(base)
  const baseSet = new Set(baseValues)
  const raw = isObject(override) ? override : {}
  const removed = uniqueStringArray(raw.removed).filter(item => baseSet.has(item))
  const removedSet = new Set(removed)
  const added = uniqueStringArray(raw.added)
    .filter(item => !baseSet.has(item) && !removedSet.has(item))
  return { added, removed }
}

function applyArrayOverride(base, override) {
  const normalized = normalizeArrayOverride(override, base)
  const removed = new Set(normalized.removed)
  return uniqueStringArray([
    ...uniqueStringArray(base).filter(item => !removed.has(item)),
    ...normalized.added,
  ])
}

function hasArrayOverride(override) {
  return (override?.added?.length || 0) > 0 || (override?.removed?.length || 0) > 0
}

export class AgentRepository extends BaseRepository {
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
    for (const field of BUILTIN_AGENT_USER_SCALAR_FIELDS) {
      const current = this._agentRowFieldValue(row, field)
      const base = this._normalizeAgentField(field, template[field])
      if (stableStringify(current) !== stableStringify(base)) overrides[field] = current
    }
    for (const field of BUILTIN_AGENT_ARRAY_MERGE_FIELDS) {
      const current = this._agentRowFieldValue(row, field)
      const base = this._normalizeAgentField(field, template[field])
      const override = deriveArrayOverride(current, base)
      if (hasArrayOverride(override)) overrides[field] = override
    }
    return overrides
  }

  _normalizeBuiltinAgentOverrides(row, storedOverrides = {}, nextTemplate = {}) {
    const overrides = {}
    const previousTemplate = parseJSON(row?.builtin_template || '{}')
    const hasPreviousTemplate = isObject(previousTemplate) && Object.keys(previousTemplate).length > 0

    for (const field of BUILTIN_AGENT_USER_SCALAR_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(storedOverrides, field)) continue
      overrides[field] = this._normalizeAgentField(field, storedOverrides[field])
    }

    for (const field of BUILTIN_AGENT_ARRAY_MERGE_FIELDS) {
      const stored = storedOverrides[field]
      const previousBase = this._normalizeAgentField(field, hasPreviousTemplate ? previousTemplate[field] : nextTemplate[field])
      const hasStoredOverride = Object.prototype.hasOwnProperty.call(storedOverrides, field)
      const legacyOverride = Array.isArray(stored)
        ? { added: arrayDiff(stored, previousBase) }
        : (isObject(stored) ? stored : null)
      const rawOverride = hasStoredOverride && legacyOverride
        ? legacyOverride
        : deriveArrayOverride(this._agentRowFieldValue(row, field), previousBase)
      const normalized = normalizeArrayOverride(rawOverride, nextTemplate[field])
      if (hasArrayOverride(normalized)) overrides[field] = normalized
    }

    return overrides
  }

  _applyBuiltinAgentTemplateOverrides(templatePayload, overrides = {}) {
    const next = { ...templatePayload }
    for (const field of BUILTIN_AGENT_USER_SCALAR_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(overrides, field)) continue
      next[field] = this._normalizeAgentField(field, overrides[field])
    }
    for (const field of BUILTIN_AGENT_ARRAY_MERGE_FIELDS) {
      const override = isObject(overrides[field]) ? overrides[field] : {}
      next[field] = applyArrayOverride(templatePayload[field], override)
    }
    return next
  }

  _applyBuiltinAgentOverrides(row, data = {}) {
    const template = parseJSON(row?.builtin_template || '{}')
    if (!isObject(template) || Object.keys(template).length === 0) return data

    const stored = parseJSON(row.user_overrides)
    const overrides = this._normalizeBuiltinAgentOverrides(row, isObject(stored) ? stored : {}, template)
    const payload = {}
    for (const field of BUILTIN_AGENT_USER_SCALAR_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue
      const incoming = this._normalizeAgentField(field, data[field])
      payload[field] = incoming
      const base = this._normalizeAgentField(field, template[field])
      if (stableStringify(incoming) === stableStringify(base)) delete overrides[field]
      else overrides[field] = incoming
    }
    for (const field of BUILTIN_AGENT_ARRAY_MERGE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue
      const incoming = this._normalizeAgentField(field, data[field])
      const base = this._normalizeAgentField(field, template[field])
      const override = deriveArrayOverride(incoming, base)
      payload[field] = incoming
      if (hasArrayOverride(override)) overrides[field] = override
      else delete overrides[field]
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
    const existing = this.db.prepare(`
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
      ? this._normalizeBuiltinAgentOverrides(existing, isObject(storedOverrides) ? storedOverrides : {}, templatePayload)
      : (this._agentLooksUserEdited(existing) ? this._deriveBuiltinAgentOverrides(existing, templatePayload) : {})
    const next = {
      ...this._applyBuiltinAgentTemplateOverrides(templatePayload, overrides),
      builtin: 1,
      builtin_key: builtinKey,
      builtin_version: builtinVersion,
      builtin_template_hash: templateHash,
      builtin_template: templatePayload,
      user_overrides: overrides,
    }
    dynamicUpdate(this.db, 'agents', existing.id, next, AGENT_JSON_FIELDS, AGENT_BOOL_FIELDS)
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
    return this.db.prepare('SELECT * FROM agents ORDER BY created_at').all().map(r => this._parseAgent(r))
  }

  getAgent(id) {
    return this._parseAgent(this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id))
  }

  createAgent(data) {
    const id = data.id || 'agent_' + Date.now()
    try {
      this.db.prepare(`INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, reflect_persist, planning_model, plan_steps, complexity_classifier, model, temperature, top_p, max_tokens, presence_penalty, frequency_penalty, thinking_mode, thinking_intensity, reviewer_model, use_same_model, tool_call_limit, model_call_limit, builtin_key, builtin_version, builtin_template_hash, builtin_template, user_overrides)
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
      if (e.message?.includes('idx_agents_english_name')) throw new Error(`英文名称 "${data.english_name}" 已被占用，请使用其他名称`)
      throw e
    }
    return { id, ...data }
  }

  updateAgent(id, data) {
    try {
      const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
      const payload = row?.builtin ? this._applyBuiltinAgentOverrides(row, data) : data
      return dynamicUpdate(this.db, 'agents', id, payload, AGENT_JSON_FIELDS, AGENT_BOOL_FIELDS)
    } catch (e) {
      if (e.message?.includes('idx_agents_english_name')) throw new Error(`英文名称 "${data.english_name}" 已被占用，请使用其他名称`)
      throw e
    }
  }

  deleteAgent(id) {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(id)
    return { success: true }
  }

  isEnglishNameUnique(englishName, excludeId = '') {
    if (!englishName) return true
    const row = this.db.prepare('SELECT id FROM agents WHERE english_name = ? AND id != ?').get(englishName, excludeId)
    return !row
  }
}
