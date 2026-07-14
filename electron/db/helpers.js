export const DB_FILE_NAME = 'reviva.db'
export const WORKSPACE_META_DIR = '.reviva'
export const CONVERSATION_SELECT_COLUMNS = [
  'id', 'space_id', 'agent_id', 'title', 'architecture', 'model',
  'group_id', 'context_length', 'parent_conversation_id', 'branched_from_message_id',
  'created_at', 'updated_at',
].join(', ')
export const TASK_RESULT_LIST_COLUMNS = [
  'id', 'name', 'type', 'status', 'progress', 'result', 'error',
  'tool_id', 'mode', 'conversation_id', 'group_id', 'params_json',
  'artifact_id', 'cloud_task_id', 'created_at', 'updated_at', 'completed_at',
].join(', ')
export const ARTIFACT_LIST_COLUMNS = [
  'id', 'group_id', 'conversation_id', 'title', 'type', 'icon', 'color',
  'storage_type', 'file_path', 'agent_name', 'skill_name', 'created_at', 'updated_at',
].join(', ')

export const AGENT_JSON_FIELDS = ['permissions', 'tools', 'skills', 'sub_agents', 'builtin_template', 'user_overrides']
export const AGENT_BOOL_FIELDS = ['builtin', 'reflect_persist', 'complexity_classifier', 'use_same_model']
export const AGENT_NUMBER_FIELDS = new Set([
  'max_iterations', 'plan_steps', 'temperature', 'top_p', 'max_tokens',
  'presence_penalty', 'frequency_penalty', 'tool_call_limit', 'model_call_limit',
])
export const WEB_IMPORT_TARGET_TYPES = new Set(['docs', 'wiki'])
export const WEB_IMPORT_STATUSES = new Set(['pending', 'running', 'succeeded', 'partial', 'failed', 'interrupted'])
export const WEB_IMPORT_STAGES = new Set(['queued', 'fetching', 'processing', 'writing', 'completed'])
export const WEB_IMPORT_FINISHED_STATUSES = ['succeeded', 'partial', 'failed', 'interrupted']
export const BUILTIN_AGENT_ARRAY_MERGE_FIELDS = ['tools', 'skills', 'sub_agents']
export const BUILTIN_AGENT_USER_SCALAR_FIELDS = [
  'model', 'temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty',
  'thinking_mode', 'thinking_intensity', 'reviewer_model', 'use_same_model',
]
export const BUILTIN_AGENT_USER_FIELDS = [...BUILTIN_AGENT_ARRAY_MERGE_FIELDS, ...BUILTIN_AGENT_USER_SCALAR_FIELDS]
export const BUILTIN_AGENT_SYSTEM_FIELDS = [
  'name', 'english_name', 'description', 'icon', 'color', 'architecture',
  'reflect_persist', 'planning_model', 'plan_steps', 'complexity_classifier',
]
export const BUILTIN_AGENT_RUNTIME_FIELDS = [
  'permissions', 'prompt', 'max_iterations', 'tool_call_limit', 'model_call_limit',
]
export const BUILTIN_AGENT_EDITABLE_FIELDS = [...BUILTIN_AGENT_RUNTIME_FIELDS, ...BUILTIN_AGENT_USER_FIELDS]
export const BUILTIN_AGENT_TEMPLATE_FIELDS = [...BUILTIN_AGENT_SYSTEM_FIELDS, ...BUILTIN_AGENT_EDITABLE_FIELDS]

export function parseJSON(field) {
  if (field === null || field === undefined) return field
  if (typeof field !== 'string') return field
  try { return JSON.parse(field) } catch { return field }
}

export function stringifyJSON(field) {
  if (field === undefined || field === null) return '{}'
  return typeof field === 'string' ? field : JSON.stringify(field)
}

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

export function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

export function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function uniqueStringArray(values) {
  const seen = new Set()
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const item = String(value || '').trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

export function arrayDiff(values, base) {
  const baseSet = new Set(uniqueStringArray(base))
  return uniqueStringArray(values).filter(item => !baseSet.has(item))
}

export function mergeOfficialArray(official, additions) {
  return uniqueStringArray([...uniqueStringArray(official), ...uniqueStringArray(additions)])
}

export function dynamicUpdate(db, table, id, data, jsonFields = [], boolFields = []) {
  const existingCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name)
  const cleanData = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue
    if (value === undefined || value === null) continue
    if (typeof value === 'number' && Number.isNaN(value)) continue
    if (!existingCols.includes(key)) continue
    cleanData[key] = value
  }
  const sets = []
  const values = []
  for (const [key, value] of Object.entries(cleanData)) {
    let normalized = value
    if (jsonFields.includes(key)) normalized = stringifyJSON(value)
    else if (boolFields.includes(key)) normalized = value ? 1 : 0
    else if (typeof value === 'object') normalized = JSON.stringify(value)
    if (normalized === undefined || normalized === null || (typeof normalized === 'number' && Number.isNaN(normalized))) continue
    sets.push(`${key} = ?`)
    values.push(normalized)
  }
  if (sets.length === 0) return null
  if (existingCols.includes('updated_at')) sets.push("updated_at = datetime('now')")
  values.push(id)
  try {
    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
  } catch (error) {
    console.error(`[dynamicUpdate] ${table} SET ${sets.join(', ')} | vals:`, values, '| id:', id, '| error:', error.message)
    throw error
  }
}
