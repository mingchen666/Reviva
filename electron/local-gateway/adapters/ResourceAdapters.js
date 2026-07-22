function safeAgent(agent) {
  if (!agent) return null
  const { id, name, englishName, desc, icon, color, arch, builtin, builtinKey, builtinVersion } = agent
  return { id, name, englishName, description: desc || '', icon, color, architecture: arch, builtin, builtinKey, builtinVersion }
}

function safeNote(note) {
  if (!note) return null
  const { filePath, file_path, ...rest } = note
  return { ...rest, content: note.content || '' }
}

export class AgentAdapter {
  constructor(db) { this.db = db }
  list() { return (this.db?.listAgents?.() || []).map(safeAgent) }
  get(id) { return safeAgent(this.db?.getAgent?.(id)) }
}

export class NoteAdapter {
  constructor(db) { this.db = db }
  list(folderId) { return (this.db?.listNotes?.(folderId) || []).map(safeNote) }
  get(id) { return safeNote(this.db?.getNote?.(id)) }
}

export class TaskAdapter {
  constructor(db) { this.db = db }
  _safe(task) {
    if (!task) return null
    const fields = ['id', 'name', 'type', 'status', 'architecture', 'space_id', 'agent_id', 'skill_type', 'progress', 'steps', 'result', 'error', 'tool_id', 'mode', 'conversation_id', 'group_id', 'params', 'artifact_id', 'created_at', 'updated_at']
    return Object.fromEntries(fields.filter(key => task[key] !== undefined).map(key => [key, task[key]]))
  }
  list() { return (this.db?.listTasks?.() || []).map(task => this._safe(task)) }
  get(id) { return this._safe(this.db?.getTask?.(id)) }
}

export class ConversationAdapter {
  constructor(db) { this.db = db }
  list(spaceId, groupId) { return this.db?.listConvs?.(spaceId, groupId) || [] }
  get(id) { return this.db?.getConv?.(id) || null }
  messages(id) { return this.db?.listMsgs?.(id) || [] }
}

export class DocumentAdapter {
  constructor(db) { this.db = db }
  _safe(doc) {
    if (!doc) return null
    const { file_path: filePath, ...rest } = doc
    return { ...rest, hasFile: !!filePath }
  }
  list(spaceId) { return (this.db?.listDocs?.(spaceId) || []).map(doc => this._safe(doc)) }
  get(id) {
    const doc = (this.db?.listDocs?.() || []).find(item => item.id === id)
    return this._safe(doc)
  }
  read(id) {
    const doc = (this.db?.listDocs?.() || []).find(item => item.id === id)
    if (!doc) return null
    const filePath = String(doc.file_path || '')
    if (!filePath || !fs.existsSync(filePath)) return { ...this._safe(doc), content: '' }
    const stat = fs.statSync(filePath)
    if (stat.size > 10 * 1024 * 1024) throw new Error('DOCUMENT_TOO_LARGE')
    return { ...this._safe(doc), content: fs.readFileSync(filePath, 'utf8') }
  }
}

export class ExecutionAdapter {
  constructor(db) { this.db = db }
  get(id) {
    const run = this.db?.getAgentRun?.(id)
    if (!run) return null
    const { error_message: errorMessage, error_code: errorCode, ...rest } = run
    return { ...rest, errorMessage: errorMessage || '', errorCode: errorCode || '' }
  }
  list({ agentId = '', conversationId = '' } = {}) {
    if (agentId) return this.db?.listAgentRunsByAgent?.(agentId) || []
    if (conversationId) return this.db?.listAgentRunsByConversation?.(conversationId) || []
    return []
  }
}

export class OutputAdapter {
  constructor(db) { this.db = db }
  _safe(item) {
    if (!item) return null
    const { file_path: filePath, ...rest } = item
    return { ...rest, hasFile: !!filePath }
  }
  list() { return (this.db?.listOutputs?.() || []).map(item => this._safe(item)) }
  get(id) { return this._safe((this.db?.listOutputs?.() || []).find(item => item.id === id)) }
  listArtifacts(groupId) { return (this.db?.listArtifactsByGroup?.(groupId) || []).map(item => this._safe(item)) }
  getArtifact(id) { return this._safe(this.db?.getArtifact?.(id)) }
}
import fs from 'node:fs'
