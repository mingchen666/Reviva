// electron/AgentService.js — DeepAgents-based Agent orchestration service
// Uses the DeepAgents framework (LangChain) for agent loop, tool calling, streaming
// Integrated: subagents, interruptOn (human-in-the-loop), skills, memory

import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeepAgent, FilesystemBackend, registerHarnessProfile } from 'deepagents'
import { createVfsPathResolver } from './security/VfsPathResolver.js'

const DEEPAGENTS_EXECUTION_TOOL_NAME = 'execute'
const HIDDEN_COMMAND_COMPATIBILITY_TOOL_NAMES = ['bash', 'command', 'shell']
const DEEPAGENTS_EXECUTION_TOOL_EXCLUSION = [DEEPAGENTS_EXECUTION_TOOL_NAME, ...HIDDEN_COMMAND_COMPATIBILITY_TOOL_NAMES]

for (const provider of ['anthropic', 'openai', 'google']) {
  registerHarnessProfile(provider, { excludedTools: DEEPAGENTS_EXECUTION_TOOL_EXCLUSION })
}

/**
 * AgentScopedBackend: policy wrapper for DeepAgents filesystem tools.
 * Keeps existing memory compatibility while enforcing:
 * - bound skills are read-only;
 * - writes/deletes are limited to this agent's outputs;
 * - .reviva and foreign agent memory are denied;
 * - reads are filtered through VFS policy.
 */
class AgentScopedBackend extends FilesystemBackend {
  constructor(options, {
    workDirService,
    boundSkillIds = [],
    allowedAgentMemoryDir = '_shared',
    agentDirName = '_shared',
    wikiContext = {},
  } = {}) {
    super(options)
    this._resolver = createVfsPathResolver({ workDirService })
    this._boundSkillIds = new Set(boundSkillIds.map(id => String(id).replace(/\\/g, '/').replace(/^\/?skills\//i, '').replace(/\/+$/, '').toLowerCase()))
    this._allowedAgentMemoryDir = String(allowedAgentMemoryDir || '_shared').toLowerCase()
    this._agentDirName = String(agentDirName || allowedAgentMemoryDir || '_shared')
    this._wikiContext = wikiContext || {}
  }

  _normalizeVirtualPath(virtPath) {
    const norm = ('/' + String(virtPath || '/').replace(/\\/g, '/').replace(/^\/+/, '')).replace(/\/+/g, '/')
    const parts = []
    for (const part of norm.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') {
        throw new Error(`Access denied: parent directory segments are not allowed in path '${virtPath}'`)
      }
      parts.push(part)
    }
    return (parts.length ? `/${parts.join('/')}` : '/').toLowerCase()
  }

  _ctx(op) {
    return {
      op,
      agentDirName: this._agentDirName,
      allowedAgentMemoryDir: this._allowedAgentMemoryDir,
      boundSkillIds: [...this._boundSkillIds],
      allowedWikiIds: Array.isArray(this._wikiContext?.wikiIds) ? this._wikiContext.wikiIds.filter(Boolean) : [],
      wikiContext: this._wikiContext,
    }
  }

  _isUnboundSkillPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    const m = norm.match(/^\/skills\/([^\/]+)/)
    if (!m) return false
    return !this._boundSkillIds.has(m[1].toLowerCase())
  }

  _isForeignAgentMemoryPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    const m = norm.match(/^\/agents\/([^\/]+)\/memory(?:\/|$)/)
    if (!m) return false
    return m[1].toLowerCase() !== this._allowedAgentMemoryDir
  }

  _isAllowedMemoryPath(virtPath) {
    const norm = this._normalizeVirtualPath(virtPath)
    if (norm === '/memories' || norm === '/memories/agents.md') return true
    const m = norm.match(/^\/agents\/([^\/]+)\/memory(?:\/|$)/)
    if (!m) return false
    return m[1].toLowerCase() === this._allowedAgentMemoryDir
  }

  _deny(message) {
    return { error: message }
  }

  _assertAllowed(filePath, op) {
    const norm = this._normalizeVirtualPath(filePath)
    if (this._isForeignAgentMemoryPath(filePath)) {
      throw new Error(`Access denied: agent memory path '${filePath}' is not owned by this agent`)
    }
    if (norm === '/.reviva' || norm.startsWith('/.reviva/')) {
      throw new Error(`Access denied: system metadata path '${filePath}'`)
    }
    if (this._isUnboundSkillPath(filePath)) {
      throw new Error(`Access denied: skill path '${filePath}' is not bound to this agent`)
    }
    if (op === 'read' && this._isAllowedMemoryPath(filePath)) {
      this._resolver.resolve(filePath, this._ctx('memory_read'))
      return true
    }
    if ((op === 'write' || op === 'edit') && this._isAllowedMemoryPath(filePath)) {
      this._resolver.resolve(filePath, this._ctx(op === 'edit' ? 'memory_edit' : 'memory_write'))
      return true
    }
    if ((op === 'delete' || op === 'rename') && this._isAllowedMemoryPath(filePath)) {
      throw new Error(`Access denied: memory files cannot be deleted or renamed by file tools`)
    }
    this._resolver.resolve(filePath, this._ctx(op))
    return true
  }

  _canReadPath(filePath) {
    try {
      this._assertAllowed(filePath, 'read')
      return true
    } catch {
      return false
    }
  }

  async ls(dirPath = '/') {
    try {
      if (this._isForeignAgentMemoryPath(dirPath)) {
        return { files: [] }
      }
    } catch (err) {
      return this._deny(err.message)
    }
    const normalizedDir = dirPath.replace(/\\/g, '/').replace(/\/+$/, '/')

    if (normalizedDir === '/skills/') {
      const result = await super.ls(dirPath)
      if (result.files) {
        result.files = result.files.filter(f => {
          const dirName = f.path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || ''
          return this._boundSkillIds.has(dirName.toLowerCase())
        })
      }
      return result
    }

    const skillsMatch = normalizedDir.match(/^\/skills\/([^\/]+)\/?$/)
    if (skillsMatch && !this._boundSkillIds.has(skillsMatch[1].toLowerCase())) {
      return { files: [] }
    }

    if (normalizedDir !== '/' && !this._canReadPath(dirPath)) return { files: [] }
    const result = await super.ls(dirPath)
    if (result.files) {
      result.files = result.files.filter(f => this._canReadPath(f.path || path.posix.join(dirPath, f.name || '')))
    }
    return result
  }

  async read(filePath, offset, limit) {
    try { this._assertAllowed(filePath, 'read') } catch (err) { return this._deny(err.message) }
    return super.read(filePath, offset, limit)
  }

  async glob(pattern, searchPath) {
    try {
      if (this._isForeignAgentMemoryPath(searchPath || '/')) return { files: [] }
      if (this._isUnboundSkillPath(searchPath || '/')) return { files: [] }
    } catch {
      return { files: [] }
    }
    if (searchPath && searchPath !== '/' && !this._canReadPath(searchPath)) return { files: [] }
    const result = await super.glob(pattern, searchPath)
    if (result.files) {
      result.files = result.files.filter(f => this._canReadPath(f.path))
    }
    return result
  }

  async write(filePath, content) {
    try { this._assertAllowed(filePath, 'write') } catch (err) { return this._deny(err.message) }
    return super.write(filePath, content)
  }

  async edit(filePath, oldString, newString, replaceAll) {
    try { this._assertAllowed(filePath, 'edit') } catch (err) { return this._deny(err.message) }
    return super.edit(filePath, oldString, newString, replaceAll)
  }

  async delete(filePath) {
    try { this._assertAllowed(filePath, 'delete') } catch (err) { return this._deny(err.message) }
    return super.delete(filePath)
  }

  async rename(oldPath, newPath) {
    try {
      this._assertAllowed(oldPath, 'delete')
      this._assertAllowed(newPath, 'write')
    } catch (err) { return this._deny(err.message) }
    return super.rename(oldPath, newPath)
  }
}
import { createMiddleware, modelCallLimitMiddleware, toolCallLimitMiddleware } from 'langchain'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { MemorySaver, InMemoryStore, Command } from '@langchain/langgraph'
import { ToolMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { getLangchainTools, getUserDefinedLangchainTools, setToolProviderConfig, setWorkDirService, setDbService, setWikiService as setWikiServiceForTools, setMcpService as setMcpServiceForTools, resetTaskCounters, setExecCommandConfig, setCloudContext, setToolRunContext, hiddenCommandCompatibilityTools, invokeCommandCompatibilityTool } from './agents/langchainTools.js'
import { buildProjectSystemPrompt } from './agents/prompts/projectSystemPrompt.js'
import { TokenRecorder } from './agents/TokenRecorder.js'
import { ErrorClassifier } from './agents/ErrorClassifier.js'
import { RunStateManager } from './agents/RunStateManager.js'
import { TitleGenerator } from './agents/TitleGenerator.js'

// Cost per million tokens
const MODEL_COST = {
  'claude-opus-4':          { input: 108,  output: 540,  cacheRead: 10.8,  cacheWrite: 135 },
  'claude-4-7-opus':        { input: 108,  output: 540,  cacheRead: 10.8,  cacheWrite: 135 },
  'claude-sonnet-4':        { input: 21.6, output: 108,  cacheRead: 2.16,  cacheWrite: 27 },
  'claude-4-6-sonnet':      { input: 21.6, output: 108,  cacheRead: 2.16,  cacheWrite: 27 },
  'claude-haiku-4':         { input: 5.76, output: 28.8, cacheRead: 0.576, cacheWrite: 7.2 },
  'claude-4-5-haiku':       { input: 5.76, output: 28.8, cacheRead: 0.576, cacheWrite: 7.2 },
  'gpt-4o':                 { input: 18,   output: 72,   cacheRead: 1.8,   cacheWrite: 9 },
  'gpt-4o-mini':            { input: 1.08, output: 4.32, cacheRead: 0.108, cacheWrite: 0.54 },
  'o1':                     { input: 108,  output: 432,  cacheRead: 0,     cacheWrite: 0 },
  'o3-mini':                { input: 10.8, output: 43.2, cacheRead: 1.08,  cacheWrite: 5.4 },
  'deepseek-chat':          { input: 1,    output: 2,    cacheRead: 0.1,   cacheWrite: 0.5 },
  'deepseek-reasoner':      { input: 4,    output: 16,   cacheRead: 0.4,   cacheWrite: 2 },
  'gemini-2.0-flash':       { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
  'gemini-2.0-pro':         { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
  'qwen-max':               { input: 20,   output: 60,   cacheRead: 2,     cacheWrite: 10 },
  'qwen-plus':              { input: 4,    output: 12,   cacheRead: 0.4,   cacheWrite: 2 },
  'command-r-plus':         { input: 0,    output: 0,    cacheRead: 0,     cacheWrite: 0 },
}
const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const DEFAULT_AGENT_TOOL_IDS = ['office_read', 'pdf_read']
const CLOUD_KNOWLEDGE_TOOL_IDS = new Set(['kb_search'])
const UNLIMITED_RECURSION_LIMIT = 10000

function withDefaultAgentTools(toolIds) {
  return [...new Set([...(toolIds || []), ...DEFAULT_AGENT_TOOL_IDS])]
}

function withPermissionAgentTools(toolIds, permissions = {}) {
  const ids = [...(toolIds || [])]
  if (permissions?.execCommand) ids.push('exec_command')
  return [...new Set(ids)]
}

function hasCloudKnowledgeScope(cloudContext) {
  return !!(
    (Array.isArray(cloudContext?.defaultKbIds) && cloudContext.defaultKbIds.length) ||
    (Array.isArray(cloudContext?.defaultDocIds) && cloudContext.defaultDocIds.length)
  )
}

function withContextualAgentTools(toolIds, cloudContext) {
  const hasScope = hasCloudKnowledgeScope(cloudContext)
  const ids = withDefaultAgentTools(toolIds)
    .filter(id => hasScope || !CLOUD_KNOWLEDGE_TOOL_IDS.has(id))
  if (hasScope) ids.push('kb_search')
  return [...new Set(ids)]
}

function isWebSearchToolId(toolId) {
  const id = String(toolId || '').toLowerCase()
  if (id === 'web_search' || id.startsWith('web_search_')) return true
  if (id.startsWith('mcp:')) {
    return /(search|web|browser|crawl|scrape|exa|jina|bing|tavily|searx|firecrawl|brave|serp)/i.test(id)
  }
  return false
}

function filterWebSearchTools(toolIds, enabled = true) {
  if (enabled) return toolIds || []
  return (toolIds || []).filter(id => !isWebSearchToolId(id))
}

function normalizeNonNegativeLimit(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function recursionLimitForMaxIterations(value) {
  const maxIterations = normalizeNonNegativeLimit(value, 10)
  return maxIterations > 0 ? Math.max(maxIterations * 4, 100) : UNLIMITED_RECURSION_LIMIT
}

function calcCost(model, usage) {
  const rates = MODEL_COST[model] || DEFAULT_COST
  return (
    (usage.inputTokens * rates.input +
     usage.outputTokens * rates.output +
     usage.cacheReadTokens * rates.cacheRead +
     usage.cacheWriteTokens * rates.cacheWrite) / 1_000_000
  )
}

function tryParseJSON(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

function normalizeTodos(payload) {
  const parsed = tryParseJSON(payload) || payload
  const list = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.todos) ? parsed.todos : (Array.isArray(parsed?.todo_list) ? parsed.todo_list : []))
  return list
    .map((todo, index) => {
      const text = todo.content || todo.task || todo.text || todo.title || todo.todo || ''
      if (!text) return null
      const status = todo.status || (todo.done ? 'completed' : 'pending')
      return {
        id: todo.id || todo.key || `todo_${index}`,
        content: String(text),
        status: String(status).toLowerCase().replace('-', '_'),
      }
    })
    .filter(Boolean)
}

function _dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function _timeStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function _toWorkspaceVirtualPath(absPath, workRoot) {
  if (!workRoot) return String(absPath || '').replace(/\\/g, '/')
  const rel = path.relative(workRoot, absPath).replace(/\\/g, '/')
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? '/' + rel : String(absPath || '').replace(/\\/g, '/')
}

function _safeAttachmentName(name, fallback = 'attachment') {
  const parsed = path.parse(String(name || fallback))
  const base = (parsed.name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || fallback
  const ext = (parsed.ext || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').slice(0, 12)
  return base + ext
}

function _uniqueDestPath(dir, name) {
  const safeName = _safeAttachmentName(name || 'attachment')
  const parsed = path.parse(safeName)
  const base = parsed.name || 'attachment'
  const ext = parsed.ext || ''
  let candidate = path.join(dir, base + ext)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}_${index}${ext}`)
    index += 1
  }
  return candidate
}

function _ctxAccessPath(item, workRoot) {
  if (item?.accessPath) return item.accessPath
  if (!item?.path) return ''
  return _toWorkspaceVirtualPath(item.path, workRoot)
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const OFFICE_FILE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const PDF_FILE_EXTS = new Set(['.pdf'])
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}
const IMAGE_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
}
const MAX_VISION_IMAGES = 8
const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024

function _decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const ext = IMAGE_EXT_BY_MIME[mime] || '.png'
  return { mime, ext, buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64') }
}

function _ensureImageFilename(item, ext = '.png') {
  const original = String(item?.name || '').trim()
  const generic = !original || /^image(?:\s*\(\d+\))?\.(png|jpe?g|webp|gif|bmp)$/i.test(original)
  if (!generic) return _safeAttachmentName(original)
  return _safeAttachmentName(`pasted_image_${_timeStamp()}_${Math.random().toString(36).slice(2, 6)}${ext}`)
}

function _isImageContextItem(item) {
  if (typeof item?.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) return true
  if (!item?.path && !item?.name) return false
  if (item.type === 'image') return true
  return IMAGE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

function _isOfficeContextItem(item) {
  if (!item?.path && !item?.name) return false
  return OFFICE_FILE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

function _isPdfContextItem(item) {
  if (!item?.path && !item?.name) return false
  return PDF_FILE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

function _appendTextContent(content, text) {
  if (Array.isArray(content)) return [...content, { type: 'text', text }]
  return String(content || '') + '\n\n' + text
}

function toLangchainMessages(messages) {
  const result = []
  for (const m of messages || []) {
    if (m instanceof HumanMessage || m instanceof AIMessage || m instanceof ToolMessage || m instanceof SystemMessage) {
      result.push(m)
      continue
    }
    if (m.role === 'user' || m.role === 'human') {
      result.push(new HumanMessage({ content: m.content || '' }))
    } else if (m.role === 'assistant' || m.role === 'ai') {
      result.push(new AIMessage({
        content: m.content || '',
        tool_calls: m.tool_calls || m.toolCalls || [],
      }))
    } else if (m.role === 'tool') {
      result.push(new ToolMessage({
        content: m.content || '',
        tool_call_id: m.tool_call_id || m.toolCallId || 'tool',
        name: m.name,
      }))
    } else if (m.role === 'system') {
      result.push(new SystemMessage({ content: m.content || '' }))
    }
  }
  return result
}

function _isUserMessage(message) {
  return message instanceof HumanMessage || message?.role === 'user' || message?.role === 'human'
}

function _messageAttachments(message) {
  if (Array.isArray(message?.attachments)) return message.attachments
  if (Array.isArray(message?.ctx)) return message.ctx
  if (Array.isArray(message?.meta?.ctx)) return message.meta.ctx
  if (Array.isArray(message?.meta?.attachments)) return message.meta.attachments
  return []
}

function _readImageAsDataUrl(item) {
  let imageUrl = item.dataUrl || ''
  if (imageUrl) {
    const base64 = imageUrl.split(',')[1] || ''
    const approxBytes = Math.floor(base64.length * 0.75)
    if (approxBytes > MAX_VISION_IMAGE_BYTES) {
      throw new Error(`图片 ${item.name || '粘贴图片'} 过大，单张图片不能超过 10MB。请压缩后重试。`)
    }
    return imageUrl
  }

  const stat = fs.statSync(item.path)
  if (stat.size > MAX_VISION_IMAGE_BYTES) {
    throw new Error(`图片 ${item.name || path.basename(item.path)} 过大，单张图片不能超过 10MB。请压缩后重试。`)
  }
  const ext = path.extname(item.path).toLowerCase()
  const mediaType = item.mime || IMAGE_MIME[ext] || 'image/png'
  const data = fs.readFileSync(item.path).toString('base64')
  return `data:${mediaType};base64,${data}`
}

function _attachImagesToUserMessages(messages, { modelHasVision = false } = {}) {
  if (!modelHasVision) return messages

  const selectedByMessage = new Map()
  let selectedCount = 0
  let skipped = 0

  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!_isUserMessage(message)) continue
    const images = _messageAttachments(message).filter(item => _isImageContextItem(item) && (item.path || item.dataUrl) && !item.isDirectory)
    if (!images.length) continue
    const remaining = MAX_VISION_IMAGES - selectedCount
    if (remaining <= 0) {
      skipped += images.length
      continue
    }
    const selected = images.slice(-remaining)
    skipped += images.length - selected.length
    selectedByMessage.set(i, selected)
    selectedCount += selected.length
  }

  if (!selectedByMessage.size) return messages

  const result = [...messages]
  const orderedIndexes = [...selectedByMessage.keys()].sort((a, b) => a - b)

  for (const index of orderedIndexes) {
    const message = result[index]
    const images = selectedByMessage.get(index) || []
    const imageBlocks = []
    const notes = []

    for (const item of images) {
      const imageUrl = _readImageAsDataUrl(item)
      imageBlocks.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      })
      notes.push(`- ${item.name || (item.path ? path.basename(item.path) : '粘贴图片')} (${item.path ? (_ctxAccessPath(item, '') || item.path) : '粘贴图片'})`)
    }
    if (skipped > 0 && index === orderedIndexes[orderedIndexes.length - 1]) {
      notes.push(`- 另有 ${skipped} 张图片未发送给视觉模型，请减少图片数量后重试。`)
    }

    const isHumanMessage = message instanceof HumanMessage
    const existing = message.content
    const textBlock = {
      type: 'text',
      text: `${typeof existing === 'string' ? existing : ''}\n\n[图片附件已作为视觉输入发送]\n${notes.join('\n')}`.trim(),
    }
    const content = Array.isArray(existing)
      ? [...existing, { type: 'text', text: `[图片附件已作为视觉输入发送]\n${notes.join('\n')}` }, ...imageBlocks]
      : [textBlock, ...imageBlocks]
    result[index] = isHumanMessage
      ? new HumanMessage({ content, id: message.id, name: message.name })
      : { ...message, content }
  }

  return result
}

const FILESYSTEM_FILE_PATH_TOOL_NAMES = new Set(['read_file', 'write_file', 'edit_file'])

function createFilesystemToolArgumentAliasMiddleware() {
  return createMiddleware({
    name: 'revivaFilesystemToolArgumentAlias',
    wrapToolCall: async (request, handler) => {
      const toolName = request.tool?.name || request.toolCall?.name
      if (!FILESYSTEM_FILE_PATH_TOOL_NAMES.has(toolName)) return handler(request)

      const toolCall = request.toolCall || {}
      const args = toolCall.args
      if (!args || typeof args !== 'object' || Array.isArray(args)) return handler(request)
      if (typeof args.file_path === 'string' && args.file_path.trim()) return handler(request)
      if (typeof args.path !== 'string' || !args.path.trim()) return handler(request)

      const { path: pathArg, ...rest } = args
      return handler({
        ...request,
        toolCall: { ...toolCall, args: { ...rest, file_path: pathArg } },
      })
    },
  })
}

function createDeepAgentsBuiltinToolExclusionMiddleware() {
  const excluded = new Set(DEEPAGENTS_EXECUTION_TOOL_EXCLUSION)
  return createMiddleware({
    name: 'revivaDeepAgentsBuiltinToolExclusion',
    tools: hiddenCommandCompatibilityTools,
    wrapToolCall: async (request, handler) => {
      const toolName = request.tool?.name || request.toolCall?.name
      if (toolName !== DEEPAGENTS_EXECUTION_TOOL_NAME) return handler(request)

      const content = await invokeCommandCompatibilityTool(request.toolCall?.args || {}, DEEPAGENTS_EXECUTION_TOOL_NAME)
      return new ToolMessage({
        content,
        tool_call_id: request.toolCall?.id || '',
        name: DEEPAGENTS_EXECUTION_TOOL_NAME,
      })
    },
    wrapModelCall: async (request, handler) => {
      if (!Array.isArray(request.tools) || !request.tools.some(tool => excluded.has(tool.name))) {
        return handler(request)
      }
      return handler({
        ...request,
        tools: request.tools.filter(tool => !excluded.has(tool.name)),
      })
    },
  })
}

function buildMiddleware({ toolCallLimit = 0, modelCallLimit = 0, subagentNames = [] } = {}) {
  const middleware = [
    createFilesystemToolArgumentAliasMiddleware(),
    createDeepAgentsBuiltinToolExclusionMiddleware(),
    createTaskSubagentGuardMiddleware(subagentNames),
  ]
  if (toolCallLimit > 0) middleware.push(toolCallLimitMiddleware({ runLimit: toolCallLimit, exitBehavior: 'end' }))
  if (modelCallLimit > 0) middleware.push(modelCallLimitMiddleware({ runLimit: modelCallLimit, exitBehavior: 'end' }))
  return middleware
}

function normalizeSubagentKey(value) {
  return String(value || '')
    .trim()
    .replace(/^sa_/i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

function buildAllowedSubagentMap(subagentNames = []) {
  const allowed = new Map()
  allowed.set('general-purpose', 'general-purpose')
  for (const name of subagentNames.filter(Boolean)) {
    allowed.set(normalizeSubagentKey(name), name)
  }
  return allowed
}

function normalizeTaskArgs(args, allowedSubagents) {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      const normalized = normalizeTaskArgs(parsed, allowedSubagents)
      return normalized === parsed ? args : JSON.stringify(normalized)
    } catch {
      return args
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args
  const requested = String(args.subagent_type || '').trim()
  const canonical = allowedSubagents.get(normalizeSubagentKey(requested))
  if (canonical) return canonical === requested ? args : { ...args, subagent_type: canonical }
  return { ...args, subagent_type: 'general-purpose' }
}

function createTaskSubagentGuardMiddleware(subagentNames = []) {
  const allowedSubagents = buildAllowedSubagentMap(subagentNames)
  return createMiddleware({
    name: 'revivaTaskSubagentGuard',
    wrapToolCall: async (request, handler) => {
      const toolName = request.tool?.name || request.toolCall?.name
      if (toolName !== 'task') return handler(request)

      const toolCall = request.toolCall || {}
      const normalizedArgs = normalizeTaskArgs(toolCall.args, allowedSubagents)
      if (normalizedArgs === toolCall.args) return handler(request)

      return handler({
        ...request,
        toolCall: { ...toolCall, args: normalizedArgs },
      })
    },
  })
}

function parseToolCallArgs(input) {
  if (input === undefined || input === null) return {}
  if (typeof input === 'object') return input
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (!text) return {}
  try { return JSON.parse(text) } catch (_) { return null }
}

function isValidToolArgs(args) {
  return !!args && typeof args === 'object' && !Array.isArray(args)
}

function hasToolResult(tc) {
  return tc && Object.prototype.hasOwnProperty.call(tc, 'result') && tc.result !== undefined && tc.result !== null
}

function sanitizeReplayableToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return []
  return toolCalls
    .map(tc => {
      const id = String(tc?.id || '').trim()
      const name = String(tc?.name || '').trim()
      const args = parseToolCallArgs(tc?.input ?? tc?.args)
      if (!id || !name || !isValidToolArgs(args)) return null
      if (!hasToolResult(tc)) return null
      return { ...tc, id, name, args, result: tc.result }
    })
    .filter(Boolean)
}

/**
 * Convert Reviva message format → plain objects for DeepAgents
 * DeepAgents accepts plain { role, content } objects directly
 */
function toPlainMessages(messages) {
  const result = []
  for (const m of messages) {
    if (m.role === 'user') {
      const attachments = _messageAttachments(m)
      result.push({
        role: 'user',
        content: m.content,
        ...(attachments.length ? { attachments } : {}),
      })
    } else if (m.role === 'assistant') {
      const toolCalls = sanitizeReplayableToolCalls(m.toolCalls)
      if (toolCalls.length) {
        result.push({
          role: 'assistant',
          content: m.content || '',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'tool_call',
            name: tc.name,
            args: tc.args,
          })),
        })
        // Emit corresponding tool result messages for each tool call
        for (const tc of toolCalls) {
          const toolContent = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result || '')
          result.push({ role: 'tool', content: toolContent, tool_call_id: tc.id })
        }
      } else {
        result.push({ role: 'assistant', content: m.content || '' })
      }
    } else if (m.role === 'tool') {
      result.push({ role: 'tool', content: m.content || '', tool_call_id: m.toolCallId })
    }
  }
  return result
}

function toDirectMessages(systemPrompt, messages) {
  const result = []
  if (systemPrompt) result.push(new SystemMessage(systemPrompt))

  for (const m of messages || []) {
    if (m.role === 'user') {
      result.push(new HumanMessage({ content: m.content || '' }))
    } else if (m.role === 'assistant') {
      result.push(new AIMessage({ content: m.content || '' }))
    } else if (m.role === 'tool') {
      result.push(new ToolMessage({ content: m.content || '', tool_call_id: m.toolCallId || m.tool_call_id || 'tool' }))
    }
  }

  return result
}

function extractChunkText(chunk) {
  if (!chunk) return ''
  if (typeof chunk.content === 'string') return chunk.content
  if (Array.isArray(chunk.content)) {
    return chunk.content.map(part => {
      if (typeof part === 'string') return part
      if (part?.type === 'text') return part.text || ''
      return part?.text || ''
    }).join('')
  }
  return chunk.text || ''
}

async function streamDirectModel(model, messages, signal, onChunk) {
  let fullContent = ''
  let thinkingContent = ''
  let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }

  const stream = await model.stream(messages, { signal })
  for await (const chunk of stream) {
    if (signal?.aborted) break

    const text = extractChunkText(chunk)
    if (text) {
      fullContent += text
      onChunk?.(text)
    }

    const reasoningBlocks = Array.isArray(chunk?.content)
      ? chunk.content.filter(part => part?.type === 'reasoning' || part?.type === 'thinking')
      : []
    if (reasoningBlocks.length) {
      thinkingContent += reasoningBlocks.map(part => part.text || '').join('')
    }

    const meta = chunk?.usage_metadata
    if (meta) {
      usage = {
        inputTokens: Math.max(usage.inputTokens, meta.input_tokens || 0),
        outputTokens: Math.max(usage.outputTokens, meta.output_tokens || 0),
        cacheReadTokens: Math.max(usage.cacheReadTokens, meta.input_token_details?.cache_read || 0),
        cacheWriteTokens: Math.max(usage.cacheWriteTokens, meta.input_token_details?.cache_creation || 0),
        thinkingTokens: Math.max(usage.thinkingTokens, meta.output_token_details?.reasoning || 0),
      }
    }
  }

  return { fullContent, thinkingContent, totalUsage: usage, steps: [] }
}

/**
 * Enrich user messages with file/folder context for the model
 * - Small files (<30KB): content is inlined directly with virtual path
 * - Large files & folders: only the virtual path is referenced
 * - Virtual paths are computed from workRoot mapping (inside root → direct, outside → /context/)
 * - Uses structured tags so the model knows exactly where each file is
 */
function enrichMessagesWithCtx(messages, ctxPaths, workRoot) {
  const MAX_INLINE_SIZE = 30 * 1024
  // Normalize workRoot: forward slashes, no trailing slash
  const normalizedWorkRoot = (workRoot || '').replace(/\\/g, '/').replace(/\/+$/, '')

  function buildText(items) {
    if (!items?.length) return ''
    const enrichData = []

    for (const item of items) {
      const name = item.name || path.basename(item.path || '')
      const isDir = item.isDirectory || item.type === 'folder' || item.type === 'local_folder'
      const isImage = _isImageContextItem(item)
      const isOffice = _isOfficeContextItem(item)
      const isPdf = _isPdfContextItem(item)

      let virtualPath
      if (item.accessPath) virtualPath = item.accessPath
      else if (!item.path && item.dataUrl && isImage) virtualPath = '(粘贴图片，仅在视觉模型中作为图片输入发送)'
      else {
        const normalizedItemPath = (item.path || '').replace(/\\/g, '/')
        if (normalizedWorkRoot && normalizedItemPath.startsWith(normalizedWorkRoot + '/')) {
          virtualPath = '/' + normalizedItemPath.slice(normalizedWorkRoot.length).replace(/^\/+/, '')
        } else if (normalizedWorkRoot && normalizedItemPath === normalizedWorkRoot) {
          virtualPath = '/'
        } else {
          virtualPath = `/context/${name}`
        }
      }

      let content = null
      if (!isDir && item.path && !isImage && !isOffice && !isPdf) {
        try {
          const stat = fs.statSync(item.path)
          if (stat.size <= MAX_INLINE_SIZE) {
            content = fs.readFileSync(item.path, 'utf-8')
          }
        } catch { /* skip unreadable files */ }
      }

      enrichData.push({ name, virtualPath, isDir, isImage, isOffice, isPdf, content })
    }

    if (!enrichData.length) return ''

    const parts = []
    const attachLines = enrichData.map(d => {
      if (d.isDir) return `  📁 ${d.name} — 路径: ${d.virtualPath} (这是文件夹；只有任务需要查看目录内容时才使用 ls("${d.virtualPath}"))`
      if (d.isImage) return `  📷 ${d.name} — 路径: ${d.virtualPath} (图片附件；视觉模型可直接看图，文件路径用于引用来源)`
      if (d.isOffice) return `  📄 ${d.name} — 路径: ${d.virtualPath} (Office 文档；先用 office_read(path="${d.virtualPath}", mode="overview") 读取结构，禁止用 read_file/file_read 直接读取)`
      if (d.isPdf) return `  📄 ${d.name} — 路径: ${d.virtualPath} (PDF 文档；先用 pdf_read(path="${d.virtualPath}", mode="overview") 读取概览，禁止用 read_file/file_read 直接读取)`
      if (d.content) return `  📄 ${d.name} — 路径: ${d.virtualPath} (内容已嵌入下方; 如需重读用 read_file("${d.virtualPath}"))`
      return `  📄 ${d.name} — 路径: ${d.virtualPath} (使用 read_file("${d.virtualPath}") 读取)`
    })
    parts.push('<attachments>\n' + attachLines.join('\n') + '\n</attachments>')

    const inlineFiles = enrichData.filter(d => d.content)
    if (inlineFiles.length) {
      const inlineParts = inlineFiles.map(d => {
        const maxLen = 8000
        const trimmed = d.content.length > maxLen
          ? d.content.slice(0, maxLen) + `\n...(截断, 完整内容用 read_file("${d.virtualPath}") 读取)`
          : d.content
        return `<file name="${d.name}" path="${d.virtualPath}">\n${trimmed}\n</file>`
      })
      parts.push('<file_contents>\n' + inlineParts.join('\n') + '\n</file_contents>')
    }

    return parts.join('\n\n')
  }

  const lastUserIndex = (() => {
    for (let i = (messages || []).length - 1; i >= 0; i--) {
      if (_isUserMessage(messages[i])) return i
    }
    return -1
  })()

  return (messages || []).map((message, index) => {
    if (!_isUserMessage(message)) return message
    const perMessageCtx = _messageAttachments(message)
    const effectiveCtx = perMessageCtx.length ? perMessageCtx : (index === lastUserIndex ? (ctxPaths || []) : [])
    const text = buildText(effectiveCtx)
    if (!text) return message
    return {
      ...message,
      content: _appendTextContent(message.content, text),
    }
  })
}

/**
 * Iterate DeepAgent stream using agent.stream() — reliable single-loop approach
 * Processes all events (messages, updates) in one for-await loop, no hanging projections
 * Tracks steps per iteration for chronological rendering (thinking → tool calls → text)
 */
async function iterateDeepStream(agent, input, config, sendFn, channelPrefix, offsets = {}) {
  const stepIndexOffset = offsets.stepIndex || 0
  const iterationOffset = offsets.iteration || 0
  let fullContent = ''
  let thinkingContent = ''
  let chunkCount = 0
  let iteration = 0
  let lastNodeName = ''
  let totalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
  let latestTodos = []
  const activeSubagents = new Map()
  const activeToolCalls = new Map() // toolCallId → { name, input, result, iteration }
  const emittedToolStarts = new Set()
  const emittedToolResults = new Set()
  const toolChunkIdsByIndex = new Map()

  // ── Step tracking: group events by iteration, include content per step ──
  const steps = []
  let currentStep = { iteration: 0, thinking: '', content: '', toolCalls: [] }
  let stepInitialized = false
  let stepContentStart = 0 // Position in fullContent at start of this step

  function closeStep() {
    if (stepInitialized && (currentStep.thinking || currentStep.toolCalls.length || (fullContent.length > stepContentStart))) {
      // Extract content produced in this iteration
      currentStep.content = fullContent.slice(stepContentStart)
      // Finalize tool calls in this step: sync input/result/status from activeToolCalls
      for (const tc of currentStep.toolCalls) {
        const tracked = activeToolCalls.get(tc.id)
        if (tracked) {
          tc.input = tracked.input
          tc.result = tracked.result || ''
          tc.status = tracked.result ? 'completed' : (tracked.input ? 'running' : 'running')
        }
      }
      steps.push({ ...currentStep, toolCalls: [...currentStep.toolCalls] })
      // Send completed step to renderer for re-rendering (with offset for resumed runs)
      sendFn({ type: 'step', step: { ...currentStep, content: currentStep.content, toolCalls: [...currentStep.toolCalls] }, index: steps.length - 1 + stepIndexOffset })
    }
  }

  function startStep(iter) {
    closeStep()
    stepContentStart = fullContent.length
    currentStep = { iteration: iter, thinking: '', content: '', toolCalls: [] }
    stepInitialized = true
  }

  // Send an incremental step update during streaming (after tool results, etc.)
  function sendStepUpdate() {
    if (!stepInitialized) return
    const stepIndex = steps.length + stepIndexOffset // Current step is not yet in steps array
    sendFn({
      type: 'step',
      step: { ...currentStep, content: fullContent.slice(stepContentStart), toolCalls: [...currentStep.toolCalls] },
      index: stepIndex,
    })
  }

  function sendTodos(payload) {
    const todos = normalizeTodos(payload)
    if (!todos.length) return false
    latestTodos = todos
    sendFn({ type: 'todos', todos })
    return true
  }

  function stringifyToolArgs(args) {
    if (args == null) return ''
    if (typeof args === 'string') return args
    try { return JSON.stringify(args) } catch { return String(args) }
  }

  function trackToolCall(toolCallId, name, args = '') {
    if (!toolCallId || !name) return null
    const inputText = stringifyToolArgs(args)
    let tracked = activeToolCalls.get(toolCallId)
    if (!tracked) {
      tracked = { name, input: inputText, result: '', iteration }
      activeToolCalls.set(toolCallId, tracked)
    } else {
      tracked.name = tracked.name || name
      if (!tracked.input && inputText) tracked.input = inputText
    }

    let stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
    if (!stepTc) {
      stepTc = { id: toolCallId, name: tracked.name, status: 'running', input: tracked.input || '', result: tracked.result || '' }
      currentStep.toolCalls.push(stepTc)
    } else {
      stepTc.name = stepTc.name || tracked.name
      if (!stepTc.input && tracked.input) stepTc.input = tracked.input
    }

    if (!emittedToolStarts.has(toolCallId)) {
      emittedToolStarts.add(toolCallId)
      sendFn({ type: 'tool_start', toolId: toolCallId, toolName: tracked.name, input: tracked.input || '' })
    }
    return tracked
  }

  let recursionHit = false

  console.log('[AgentService] Starting agent.stream()...')
  const stream = await agent.stream(input, {
    configurable: config.configurable,
    signal: config.signal,
    streamMode: ['messages', 'updates', 'custom'],
    subgraphs: true,
    recursionLimit: config.recursionLimit ?? UNLIMITED_RECURSION_LIMIT,
  })

  try {
  for await (const event of stream) {
    if (config.signal?.aborted) break

    const hasNamespace = Array.isArray(event[0])
    const namespace = hasNamespace ? event[0] : []
    const mode = hasNamespace ? event[1] : event[0]
    const data = hasNamespace ? event[2] : event[1]

    const toolNamespace = Array.isArray(namespace) ? namespace.find(s => typeof s === 'string' && s.startsWith('tools:')) : ''
    const toolNamespaceId = toolNamespace ? toolNamespace.split(':')[1] : ''
    const isSubagent = !!toolNamespaceId && activeSubagents.has(toolNamespaceId)

    // Initialize step 0 on first content-bearing event
    if (!stepInitialized) startStep(0)

    if (mode === 'messages') {
      const [message] = data
      if (!message) continue

      // Subagent text
      if (isSubagent && message.text) {
        const subInfo = activeSubagents.get(toolNamespaceId)
        sendFn({ type: 'subagent_chunk', subRunId: toolNamespaceId, name: subInfo?.name || 'subagent', text: message.text })
      }

      // Coordinator text (only from the main graph's final response).
      // DeepAgents also streams built-in tool internals under tools:<id>; do not surface those as assistant text.
      if (!toolNamespace && message.text && !message.tool_call_chunks?.length) {
        chunkCount++
        fullContent += message.text
        sendFn({ type: 'content', text: message.text })
      }

      // Thinking/reasoning blocks (Anthropic extended thinking + LangChain normalized reasoning)
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if ((block.type === 'thinking' && block.thinking) || (block.type === 'reasoning' && block.reasoning)) {
            const thinkingText = block.type === 'reasoning' ? block.reasoning : block.thinking
            thinkingContent += thinkingText
            currentStep.thinking += thinkingText
            sendFn({ type: 'thinking', text: thinkingText })
          }
        }
      }
      // DeepSeek / OpenAI reasoning: reasoning_content in additional_kwargs
      const reasoningKwargs = message.additional_kwargs?.reasoning_content
      if (typeof reasoningKwargs === 'string' && reasoningKwargs.length > 0) {
        thinkingContent += reasoningKwargs
        currentStep.thinking += reasoningKwargs
        sendFn({ type: 'thinking', text: reasoningKwargs })
      }
      // Capture reasoning tokens from output_token_details
      if (message.usage_metadata?.output_token_details?.reasoning) {
        totalUsage.thinkingTokens += message.usage_metadata.output_token_details.reasoning
      }

      // Tool call chunks
      if (message.tool_call_chunks?.length) {
        for (const tc of message.tool_call_chunks) {
          const sourceKey = Array.isArray(namespace) ? namespace.join('|') : 'main'
          const chunkKey = `${sourceKey}:${tc.index ?? 0}`
          const toolCallId = tc.id || toolChunkIdsByIndex.get(chunkKey)
          if (tc.id) toolChunkIdsByIndex.set(chunkKey, tc.id)

          if (tc.name === 'task') {
            try {
              const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args || {})
              const subName = args.subagent_type || args.name || 'general-purpose'
              const taskDesc = args.description || args.task || ''
              activeSubagents.set(tc.id, { name: subName, description: taskDesc })
              sendFn({ type: 'subagent_start', subRunId: tc.id, name: subName, task: taskDesc })
            } catch { /* args may stream incrementally */ }
          } else if (tc.name) {
            // Track tool call in current step
            trackToolCall(toolCallId, tc.name)
          }
          if (toolCallId && tc.args && tc.name !== 'task') {
            // Accumulate tool input
            const tracked = activeToolCalls.get(toolCallId)
            if (tracked) tracked.input += tc.args
            if (tracked?.name === 'write_todos') sendTodos(tracked.input)
            // Also update the step's tool call item so it has input when sent via step events
            const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
            if (stepTc && tracked) stepTc.input = tracked.input
            sendFn({ type: 'tool_input', toolId: toolCallId, partialInput: tc.args })
          }
        }
      }

      // Tool messages (results)
      if (ToolMessage.isInstance(message) || message?.type === 'tool') {
        const toolCallId = message.tool_call_id || message.toolCallId || ''
        if (toolCallId && emittedToolResults.has(toolCallId)) continue
        if (toolCallId) emittedToolResults.add(toolCallId)
        const isTaskResult = activeSubagents.has(toolCallId)

        if (isTaskResult) {
          const subInfo = activeSubagents.get(toolCallId)
          const resultText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
          sendFn({ type: message.isError ? 'subagent_error' : 'subagent_end', subRunId: toolCallId, name: subInfo.name, result: resultText })
          activeSubagents.delete(toolCallId)
        } else {
          // Track tool result
          let tracked = activeToolCalls.get(toolCallId)
          if (!tracked && toolCallId) {
            tracked = trackToolCall(toolCallId, message.name || 'tool')
          }
          const resultText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
          if (tracked?.name === 'write_todos' && !sendTodos(resultText)) sendTodos(tracked.input)
          if (tracked) {
            tracked.result = resultText
            // Update the tool call in current step
            const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
            if (stepTc) { stepTc.result = resultText; stepTc.status = message.isError ? 'error' : 'completed' }
          }
          sendFn({ type: message.isError ? 'tool_error' : 'tool_end', toolId: toolCallId, result: resultText })
          // Send incremental step update so renderer sees the completed tool call
          sendStepUpdate()
        }
      }
    }

    if (mode === 'updates') {
      for (const [nodeName, nodeData] of Object.entries(data || {})) {
        sendTodos(nodeData?.todos || nodeData?.values?.todos)
        // Track iterations: each model_request = new iteration → new step
        if (!toolNamespace && (nodeName === 'model_request' || nodeName === 'agent') && nodeName !== lastNodeName) {
          if (lastNodeName === 'tools' || iteration === 0) {
            iteration++
            startStep(iteration) // Close previous step, start new one
            sendFn({ type: 'iteration', iteration: iteration + iterationOffset })
          }
          lastNodeName = nodeName
        }
        if (!toolNamespace && nodeName === 'tools') {
          lastNodeName = nodeName
        }
        // Usage metadata from model nodes
        if (nodeName === 'model_request' || nodeName === 'agent') {
          for (const msg of (nodeData?.messages || [])) {
            if (msg?.usage_metadata) {
              const meta = msg.usage_metadata
              totalUsage.inputTokens += meta.input_tokens || 0
              totalUsage.outputTokens += meta.output_tokens || 0
              totalUsage.cacheReadTokens += meta.input_token_details?.cache_read || 0
              totalUsage.cacheWriteTokens += meta.input_token_details?.cache_creation || 0
              sendFn({ type: 'usage', usage: { inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens } })
            }
            // Subagent detection from updates
            if (msg?.tool_calls?.length) {
              for (const tc of msg.tool_calls) {
                if (tc.name === 'task') {
                  try {
                    const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : (tc.args || {})
                    const subName = args.subagent_type || args.name || 'general-purpose'
                    const taskDesc = args.description || args.task || ''
                    if (!activeSubagents.has(tc.id)) {
                      activeSubagents.set(tc.id, { name: subName, description: taskDesc })
                      sendFn({ type: 'subagent_start', subRunId: tc.id, name: subName, task: taskDesc })
                    }
                  } catch { /* updates normally contain complete args; ignore malformed partials */ }
                } else {
                  trackToolCall(tc.id, tc.name, tc.args)
                }
              }
            }
          }
        }
        // Tool results from tools node
        if (nodeName === 'tools') {
          for (const msg of (nodeData?.messages || [])) {
            if (msg?.type === 'tool') {
              const toolCallId = msg.tool_call_id || msg.toolCallId || ''
              if (toolCallId && emittedToolResults.has(toolCallId)) continue
              if (toolCallId) emittedToolResults.add(toolCallId)
              const isTaskResult = activeSubagents.has(toolCallId)

              if (isTaskResult) {
                const subInfo = activeSubagents.get(toolCallId)
                sendFn({ type: msg.isError ? 'subagent_error' : 'subagent_end', subRunId: toolCallId, name: subInfo.name, result: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) })
                activeSubagents.delete(toolCallId)
              } else {
                let tracked = activeToolCalls.get(toolCallId)
                if (!tracked && toolCallId) {
                  tracked = trackToolCall(toolCallId, msg.name || 'tool')
                }
                const resultText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                if (tracked?.name === 'write_todos' && !sendTodos(resultText)) sendTodos(tracked.input)
                if (tracked) {
                  tracked.result = resultText
                  const stepTc = currentStep.toolCalls.find(t => t.id === toolCallId)
                  if (stepTc) { stepTc.result = resultText; stepTc.status = msg.isError ? 'error' : 'completed' }
                }
                sendFn({ type: msg.isError ? 'tool_error' : 'tool_end', toolId: toolCallId, result: resultText })
                  // Send incremental step update so renderer sees the completed tool call
                  sendStepUpdate()
              }
            }
          }
        }
      }
    }

    if (mode === 'custom') {
      sendTodos(data?.todos || data?.todo_list || data)
    }
  }
  } catch (streamErr) {
    if (streamErr.name === 'GraphRecursionError' || streamErr.message?.includes('recursion') || streamErr.message?.includes('Recursion')) {
      console.warn('[AgentService] GraphRecursionError during streaming — returning partial results:', streamErr.message)
      recursionHit = true
    } else if (config.signal?.aborted) {
      console.log('[AgentService] Stream aborted')
    } else {
      throw streamErr
    }
  }

  // Close the final step
  closeStep()

  // Fallback: get usage from final state if not captured during streaming
  if (!totalUsage.inputTokens) {
    try {
      const state = await agent.getState({ configurable: config.configurable })
      for (const msg of state?.values?.messages || []) {
        if (msg?.usage_metadata) {
          const meta = msg.usage_metadata
          totalUsage.inputTokens += meta.input_tokens || 0
          totalUsage.outputTokens += meta.output_tokens || 0
          totalUsage.cacheReadTokens += meta.input_token_details?.cache_read || 0
          totalUsage.cacheWriteTokens += meta.input_token_details?.cache_creation || 0
          totalUsage.thinkingTokens += meta.output_token_details?.reasoning || 0
        }
        // Thinking content fallback: content array blocks
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'thinking' && block.thinking) {
              thinkingContent += block.thinking
            }
            if (block.type === 'reasoning' && block.reasoning) {
              thinkingContent += block.reasoning
            }
          }
        }
        // Thinking content fallback: DeepSeek reasoning_content in additional_kwargs
        if (msg?.additional_kwargs?.reasoning_content) {
          thinkingContent += msg.additional_kwargs.reasoning_content
        }
      }
    } catch (e) {
      console.warn('[AgentService] Could not get final state:', e.message)
    }
  }

  if (thinkingContent && !totalUsage.thinkingTokens) {
    totalUsage.thinkingTokens = Math.ceil(thinkingContent.length / 4)
  }

  console.log('[AgentService] Stream finished. Content:', fullContent.length, 'chars, Thinking:', thinkingContent.length, 'chars, Steps:', steps.length, ', Chunks:', chunkCount)

  return { fullContent, thinkingContent, totalUsage, steps, iteration, recursionHit, todos: latestTodos }
}


export class AgentService {
  constructor(dbService, getWin, workDirService, mcpService) {
    this._db = dbService
    this._getWin = getWin
    this._workDirService = workDirService
    this._mcpService = mcpService || null
    this._tokenRecorder = new TokenRecorder(dbService)
    this._errorClassifier = new ErrorClassifier()
    this._runStateManager = new RunStateManager(dbService)
    this._titleGenerator = new TitleGenerator()
    this._checkpointer = new MemorySaver()
    this._store = new InMemoryStore()

    setToolProviderConfig({})
    setToolRunContext({})
    this._activeRuns = new Map()
    this._activeStreams = new Map()
    this._interruptedRuns = new Map() // threadId → { runId, request, agentConfig }
  }

  init() {
    // Inject WorkDirService into langchainTools for delete_file path validation
    setWorkDirService(this._workDirService)
    // Inject DatabaseService for reading security settings (allowFileDelete, deleteScope)
    setDbService(this._db)
    setMcpServiceForTools(this._mcpService)

    // Load builtin agent modules (创作中心 agents)
    this._builtinModules = this._loadBuiltinAgentModules()
    this._syncBuiltinAgentModules()
    console.log('[AgentService] Loaded builtin modules:', this._builtinModules.map(m => m.english_name))

    ipcMain.handle('agent:startRun', (_, req) => this.handleStartRun(req))
    ipcMain.handle('agent:cancelRun', (_, runId) => this.handleCancelRun(runId))
    ipcMain.handle('agent:executeTool', (_, req) => this.handleExecuteTool(req))
    ipcMain.handle('agent:runSubAgent', (_, req) => this.handleRunSubAgent(req))
    ipcMain.handle('agent:compressContext', (_, req) => this.handleCompressContext(req))
    ipcMain.handle('agent:getRunState', (_, runId) => this.handleGetRunState(runId))
    ipcMain.handle('agent:authRespond', (_, requestId, approved) => this.handleAuthRespond(requestId, approved))
    ipcMain.handle('agent:generateTitle', (_, req) => this.handleGenerateTitle(req))

    ipcMain.handle('chat:start', (_, req) => this.handleChatStart(req))
    ipcMain.handle('chat:cancel', (_, reqId) => this.handleChatCancel(reqId))
    ipcMain.handle('chat:authRespond', (_, requestId, approved) => this.handleAuthRespond(requestId, approved))
  }

  setWikiService(wikiService) {
    setWikiServiceForTools(wikiService)
  }

  // ── Model Factory ────────────────────────────────────────────

  _isAnthropicFormat(providerId, apiFormat = '') {
    return (apiFormat || '').toLowerCase() === 'anthropic' || (providerId || '').toLowerCase() === 'anthropic'
  }

  _createModel(providerId, apiKey, baseUrl, modelName, options = {}) {
    const common = { apiKey, model: modelName, maxRetries: 1 }
    if (options.temperature !== undefined) common.temperature = options.temperature
    if (options.maxTokens) common.maxTokens = options.maxTokens
    if (options.topP !== undefined) common.topP = options.topP

    if (this._isAnthropicFormat(providerId, options.apiFormat)) {
      const anthropicBaseURL = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '') || undefined
      const anthropicOpts = { ...common, timeout: 180000 }
      if (anthropicBaseURL) anthropicOpts.baseURL = anthropicBaseURL
      if (options.thinkingMode === 'enabled') {
        const budgetMap = { low: 2000, medium: 10000, high: 32000 }
        anthropicOpts.thinking = {
          type: 'enabled',
          budget_tokens: budgetMap[options.thinkingIntensity] || 10000,
        }
      }
      return new ChatAnthropic(anthropicOpts)
    }

    // OpenAI-compatible providers: use configuration.baseURL for proper client setup
    // Non-official endpoints don't support Responses API — must disable it to avoid 400 errors
    const openaiOpts = { ...common, timeout: 180000, streaming: options.streaming !== false }
    if (baseUrl) {
      openaiOpts.configuration = { baseURL: baseUrl }
      // Third-party OpenAI-compatible gateways don't implement the Responses API
      openaiOpts.useResponsesApi = false
    }
    if (options.reasoningEffort) openaiOpts.reasoningEffort = options.reasoningEffort
    return new ChatOpenAI(openaiOpts)
  }

  // ── DeepAgents Config Builders ────────────────────────────────

  /**
   * Build DeepAgents subagents array from agent config
   */
  _buildSubagentTools(toolIds, allTools, skillIds = [], cloudContext = {}, options = {}) {
    const requestedIds = this._withSkillTools(toolIds, skillIds)
    if (!requestedIds.length) return allTools

    const effectiveIds = filterWebSearchTools(
      withContextualAgentTools(requestedIds, cloudContext),
      options.webSearchEnabled !== false,
    )
    const tools = this._buildLocalRuntimeTools(effectiveIds, { includeDefaults: false })
    const mcpIds = effectiveIds.filter(id => typeof id === 'string' && id.startsWith('mcp:'))

    if (!mcpIds.length) return tools

    const wantServers = new Set()
    const wantTools = new Set()
    for (const id of mcpIds) {
      const parts = id.split(':')
      if (parts.length === 2) wantServers.add(parts[1])
      else if (parts.length >= 3) wantTools.add(`${parts[1]}:${parts.slice(2).join(':')}`)
    }

    const mcpTools = (allTools || []).filter(t =>
      t?._mcp_server_id && (
        wantServers.has(t._mcp_server_id) ||
        wantTools.has(`${t._mcp_server_id}:${t._mcp_tool_name}`)
      )
    )

    return [...tools, ...mcpTools]
  }

  _listEnabledCustomToolRows() {
    try {
      return (this._db?.listTools?.() || []).filter(t => t?.enabled !== false && t?.enabled !== 0)
    } catch {
      return []
    }
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

  _builtinSkillConfigPath(skillId) {
    const electronDir = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'skills', skillId, 'config.json') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'builtin-assets', 'skills', skillId, 'config.json') : '',
      path.join(electronDir, 'builtin-assets', 'skills', skillId, 'config.json'),
    ].filter(Boolean)
    return candidates.find(p => fs.existsSync(p)) || ''
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

    const workRoot = this._workDirService?.getRootPath?.() || ''
    const allowed = []
    for (const skillId of ids) {
      const workspaceConfig = workRoot
        ? this._readJsonIfExists(path.join(workRoot, 'skills', skillId, 'config.json'))
        : null
      const dbSkill = dbSkills.find(s => this._normalizeSkillId(s?.id) === skillId)
      const builtinConfig = this._readJsonIfExists(this._builtinSkillConfigPath(skillId))
      const sources = [workspaceConfig, dbSkill, builtinConfig]

      for (const source of sources) {
        const tools = source?.allowedTools || source?.allowed_tools
        if (Array.isArray(tools)) allowed.push(...tools.filter(Boolean))
      }
    }
    return [...new Set(allowed.map(String))]
  }

  _withSkillTools(toolIds, skillIds) {
    return [...new Set([...(toolIds || []), ...this._skillAllowedTools(skillIds)].filter(Boolean))]
  }

  _buildLocalRuntimeTools(toolIds, { includeDefaults = true } = {}) {
    const effectiveIds = includeDefaults ? withDefaultAgentTools(toolIds) : (toolIds || [])
    const builtinTools = effectiveIds.length ? getLangchainTools(effectiveIds) : []
    const userTools = getUserDefinedLangchainTools(effectiveIds, this._listEnabledCustomToolRows())
    return [...builtinTools, ...userTools]
  }

  _buildSubagents(subAgentConfigs, allTools, request) {
    if (!subAgentConfigs?.length) return undefined

    const webSearchEnabled = request?.params?.enableWebSearch !== false && request?.params?.enable_web_search !== false
    return subAgentConfigs.map(sa => {
      const saRequestedTools = this._withSkillTools(sa.tools || [], sa.skills || [])
      const saTools = saRequestedTools.length
        ? this._buildSubagentTools(sa.tools, allTools, sa.skills, request.cloudContext, { webSearchEnabled })
        : allTools // inherit parent tools if not specified

      const subConfig = {
        name: sa.name,
        description: sa.description,
        systemPrompt: sa.systemPrompt || '',
        tools: saTools,
        middleware: [createFilesystemToolArgumentAliasMiddleware(), createDeepAgentsBuiltinToolExclusionMiddleware(), ...(sa.middleware || [])],
      }

      // Determine model for this subagent
      let saModelId = sa.model

      // Visual reviewer gets reviewer model when configured
      if (sa.name === 'visual-reviewer' && request.reviewerModel) {
        saModelId = request.reviewerModel
      } else if (!saModelId) {
        // Subagents inherit the parent executor model unless explicitly configured.
        saModelId = request.model
      }

      if (saModelId) {
        subConfig.model = this._createModel(
          request.providerId,
          request.apiKey,
          request.baseUrl,
          saModelId,
          { temperature: request.temperature, maxTokens: request.maxTokens || 4096, streaming: false, apiFormat: request.apiFormat },
        )
      }

      return subConfig
    })
  }

  _getBuiltinModule(englishName) {
    return this._builtinModules?.find(m => m.english_name === englishName) || null
  }

  _findSubAgentMeta(name, subAgentRows = null) {
    const target = normalizeSubagentKey(name)
    if (!target) return null
    const rows = subAgentRows || this._db.listSubAgents?.() || []
    const reversed = [...rows].reverse()
    return reversed.find(sa => normalizeSubagentKey(sa?.id) === target) ||
      reversed.find(sa => normalizeSubagentKey(sa?.runtimeName) === target) ||
      reversed.find(sa => normalizeSubagentKey(sa?.name) === target) ||
      null
  }

  _descriptionFromPrompt(prompt, fallback) {
    const line = String(prompt || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .find(s => s && !s.startsWith('#'))
    return (line || `${fallback} 子任务`).slice(0, 160)
  }

  _buildBuiltinTaskSubAgents(moduleConfig) {
    const names = moduleConfig?.sub_agents?.length
      ? moduleConfig.sub_agents
      : Object.keys(moduleConfig?.subagent_prompts || {})
    if (!names.length) return []

    let subAgentRows = []
    try { subAgentRows = this._db.listSubAgents?.() || [] } catch (_) { subAgentRows = [] }

    return names.map(name => {
      const meta = this._findSubAgentMeta(name, subAgentRows)
      const prompt = moduleConfig.subagent_prompts?.[name] || meta?.prompt || ''
      return {
        name,
        description: meta?.description || this._descriptionFromPrompt(prompt, name),
        systemPrompt: prompt,
        tools: Array.isArray(meta?.tools) ? meta.tools : [],
        model: meta?.model || '',
      }
    })
  }

  async _loadMcpToolsForRun(toolIds = []) {
    const requested = (toolIds || []).filter(id => typeof id === 'string' && id.startsWith('mcp:'))
    if (!this._mcpService || !requested.length) return { tools: [], clients: [] }

    if (typeof this._mcpService.getLazyToolsForRun === 'function') {
      return await this._mcpService.getLazyToolsForRun(requested)
    }

    const mcpResult = await this._mcpService.getActiveTools()
    const clients = mcpResult.clients || []
    const allMcpTools = mcpResult.tools || []
    const wantServers = new Set()
    const wantTools = new Set()
    for (const id of requested) {
      const parts = id.split(':')
      if (parts.length === 2) wantServers.add(parts[1])
      else if (parts.length >= 3) wantTools.add(`${parts[1]}:${parts.slice(2).join(':')}`)
    }

    const tools = allMcpTools.filter(t =>
      wantServers.has(t._mcp_server_id) ||
      wantTools.has(`${t._mcp_server_id}:${t._mcp_tool_name}`)
    )
    return { tools, clients }
  }

  _buildBuiltinTaskUserText({ toolId, topic, params = {}, ctxItems = [] }) {
    const fileNames = (ctxItems || [])
      .map(i => i?.name || i?.path)
      .filter(Boolean)
      .join('、')
    const parts = []

    if (toolId === 'ppt') {
      const sceneLabel = { business: '商务汇报', tech: '技术分享', academic: '学术报告', creative: '创意提案', education: '教学课件', auto: '智能匹配' }
      const fmtLabel = { html: 'HTML 演示文稿', 'pptx-local': 'PPTX 本地导出', 'pptx-cloud': 'PPTX 云端高质量' }
      parts.push('[任务]\n' + (topic || `请根据以下资料生成演示文稿：${fileNames || '用户选择的资料'}`))
      parts.push(`[用户配置]\n场景: ${params.scene || 'auto'}（${sceneLabel[params.scene] || '智能匹配'}）\n输出格式: ${params.format || 'html'}（${fmtLabel[params.format] || 'HTML 演示文稿'}）\n页数: ${params.pages || 12}`)
      parts.push('[产物要求]\n按实际生成结果写入输出目录。可能只有 HTML、只有 PPTX，或同时包含 HTML/PPTX/PNG，不要假设某一种文件一定存在。')
    } else if (toolId === 'research') {
      parts.push('[研究要求]\n' + (topic || `请对以下资料进行深度研究分析：${fileNames || '用户选择的资料'}`))
      parts.push('[产物要求]\n同时生成 Markdown 研究报告和 HTML 可视化报告，分别写入深度研究输出目录。')
    } else {
      parts.push(topic || '请基于用户资料完成任务')
    }

    const webSearchEnabled = params.enableWebSearch !== false && params.enable_web_search !== false
    parts.push(webSearchEnabled
      ? '[联网搜索]\n本次已启用联网搜索。需要外部资料、最新信息或来源交叉验证时，使用当前已配置且可用的联网搜索、网页读取或公开来源检索工具；优先选择高质量、可核验来源，只有确有必要阅读全文时才读取网页原文。'
      : '[联网搜索]\n本次未启用联网搜索。禁止调用任何联网搜索、网页读取、浏览、爬取类工具；深度研究任务不要委托 web-researcher 子 agent。只使用用户选择的本地资料、知识库检索结果和模型已有常识，并在信息不足时说明限制。')
    return parts.join('\n\n')
  }

  async runBuiltinTask(request) {
    const startTime = Date.now()
    const runId = request.runId || `task_${request.taskId || crypto.randomUUID()}`
    const abortController = request.abortController || new AbortController()
    const onProgress = typeof request.onProgress === 'function' ? request.onProgress : () => {}
    let workRoot = ''
    let mcpClients = []
    let hardTimeout = null

    const agentEnglishName = request.agentEnglishName
    const moduleConfig = this._getBuiltinModule(agentEnglishName)
    if (!moduleConfig) throw new Error(`内置 agent 未就绪: ${agentEnglishName}`)

    this._activeRuns.set(runId, { abortController, request })

    try {
      onProgress(18, '准备上下文...')
      setToolProviderConfig(request.toolProviderConfigs || {})
      setToolRunContext({ agentEnglishName: agentEnglishName || '_shared', permissions: moduleConfig.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: moduleConfig.skills || [] })
      setExecCommandConfig({
        whitelist: moduleConfig.permissions?.execCommandWhitelist || null,
        blacklist: moduleConfig.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxItems || request.ctxPaths || [], workRoot)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: moduleConfig.temperature ?? 0.4,
          maxTokens: moduleConfig.max_tokens || request.maxTokens || 8192,
          topP: request.topP,
          thinkingMode: moduleConfig.thinking_mode || request.thinkingMode,
          thinkingIntensity: moduleConfig.thinking_intensity || request.thinkingIntensity,
          streaming: false,
          apiFormat: request.apiFormat,
        },
      )

      onProgress(28, '加载技能和工具...')
      const skillData = this._buildSkillsPaths(moduleConfig.skills || [])
      const memoryDirName = this._agentMemoryDirName(request.agentId || moduleConfig.id, agentEnglishName)
      let systemPrompt = moduleConfig.prompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, agentEnglishName, skillData.info, request.answerStyle, memoryDirName, request.cloudContext)

      const agentDir = path.join(workRoot, 'agents', agentEnglishName || '_shared')
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(path.join(agentDir, 'AGENT.md'), systemPrompt, 'utf-8')
      fs.writeFileSync(path.join(agentDir, 'skills.json'), JSON.stringify(moduleConfig.skills || [], null, 2), 'utf-8')

      const subAgentConfigs = this._buildBuiltinTaskSubAgents(moduleConfig)
      const allToolIds = [...new Set([
        ...(moduleConfig.tools || []),
        ...subAgentConfigs.flatMap(sa => Array.isArray(sa.tools) ? sa.tools : []),
      ].filter(Boolean))]

      const webSearchEnabled = request.params?.enableWebSearch !== false && request.params?.enable_web_search !== false
      const effectiveToolIds = filterWebSearchTools(withContextualAgentTools(withPermissionAgentTools(this._withSkillTools(allToolIds, [
        ...(moduleConfig.skills || []),
        ...subAgentConfigs.flatMap(sa => Array.isArray(sa.skills) ? sa.skills : []),
      ]), moduleConfig.permissions), request.cloudContext), webSearchEnabled)
      setToolRunContext({ agentEnglishName: agentEnglishName || '_shared', permissions: moduleConfig.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: moduleConfig.skills || [], toolIds: effectiveToolIds })
      const customTools = this._buildLocalRuntimeTools(effectiveToolIds, { includeDefaults: false })
      resetTaskCounters()

      let mcp = { tools: [], clients: [] }
      try {
        mcp = await this._loadMcpToolsForRun(effectiveToolIds)
        mcpClients = mcp.clients || []
        if (mcp.tools?.length) console.log('[AgentService] Builtin task MCP tools loaded:', mcp.tools.map(t => `${t._mcp_server_id}/${t._mcp_tool_name}`))
      } catch (err) {
        console.error('[AgentService] Builtin task MCP getActiveTools failed:', err.message)
      }

      const allCustomTools = [...customTools, ...(mcp.tools || [])]

      const subagents = this._buildSubagents(subAgentConfigs, allCustomTools, {
        ...request,
        providerId: request.providerId,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        model: request.model,
        temperature: moduleConfig.temperature ?? 0.4,
        maxTokens: moduleConfig.max_tokens || 8192,
      })

      onProgress(42, subagents?.length ? `已加载 ${subagents.length} 个子智能体` : '准备执行...')
      const interruptOn = this._buildInterruptOn(moduleConfig.permissions)
      this._injectSemanticMemories(workRoot)
      const memory = this._buildMemoryPaths({ agentId: request.agentId || moduleConfig.id, agentEnglishName })
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: moduleConfig.skills || [],
        allowedAgentMemoryDir: memoryDirName,
        agentDirName: agentEnglishName || '_shared',
        wikiContext: request.wikiContext || {},
      })

      const agent = createDeepAgent({
        model,
        tools: allCustomTools,
        systemPrompt,
        subagents,
        interruptOn,
        skills: skillData.paths,
        memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: agentEnglishName || moduleConfig.id || 'builtin-task-agent',
        middleware: buildMiddleware({
          toolCallLimit: moduleConfig.tool_call_limit || request.toolCallLimit,
          modelCallLimit: moduleConfig.model_call_limit || request.modelCallLimit,
          subagentNames: subagents?.map(s => s.name) || [],
        }),
      })

      const userText = request.userText || this._buildBuiltinTaskUserText({
        toolId: request.toolId,
        topic: request.topic,
        params: request.params,
        ctxItems: request.ctxItems || request.ctxPaths || [],
      })

      const preparedMessages = this._prepareMessageAttachments(
        [{ role: 'user', content: userText, attachments: request.ctxItems || request.ctxPaths || [] }],
        workRoot,
        preparedCtxPaths,
      )
      const plainMessages = toLangchainMessages(_attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      ))

      let streamProgress = 48
      const bump = (message, delta = 3) => {
        streamProgress = Math.min(90, streamProgress + delta)
        onProgress(streamProgress, message)
      }
      const sendFn = (chunk) => {
        if (chunk?.type === 'subagent_start') bump(`委托 ${chunk.name || '子智能体'}...`, 4)
        else if (chunk?.type === 'subagent_end') bump(`${chunk.name || '子智能体'} 已完成`, 3)
        else if (chunk?.type === 'tool_start') bump(`调用工具 ${chunk.toolName || ''}...`, 2)
        else if (chunk?.type === 'content') bump('整理最终结果...', 1)
        else if (chunk?.type === 'todos') bump('更新任务计划...', 1)
      }

      hardTimeout = setTimeout(() => abortController.abort(), moduleConfig.hard_timeout_ms || 600000)
      onProgress(50, '智能体执行中...')
      const result = await iterateDeepStream(
        agent,
        { messages: plainMessages },
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(moduleConfig.max_iterations),
        },
        sendFn,
        'task',
      )

      if (hardTimeout) clearTimeout(hardTimeout)
      hardTimeout = null
      if (abortController.signal.aborted) throw new Error('ABORTED')

      const { totalUsage } = result
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost
      this._tokenRecorder.record({
        providerId: request.providerId,
        modelId: request.model,
        usage: totalUsage,
        cost,
        latencyMs,
        agentId: agentEnglishName || moduleConfig.id || '',
        conversationId: request.conversationId || '',
        runId,
        iteration: 1,
      })

      onProgress(94, '扫描生成产物...')
      const artifacts = await this._registerArtifacts({
        conversationId: request.conversationId || '',
        groupId: request.groupId || 'default',
        agentEnglishName,
        workRoot,
        runStartTime: startTime,
      })

      return { ...result, runId, latencyMs, cost, artifacts }
    } finally {
      if (hardTimeout) clearTimeout(hardTimeout)
      this._activeRuns.delete(runId)
      this._removeInjectedMemories(workRoot)
      if (this._mcpService && mcpClients?.length) {
        await this._mcpService.closeClients(mcpClients)
      }
    }
  }

  /**
   * Build DeepAgents interruptOn config from agent permissions
   * Destructive or system-level tools require human approval.
   * File write/edit permissions mean the agent is already allowed to write inside the sandbox.
   */
  _buildInterruptOn(permissions) {
    if (!permissions) return undefined
    const interruptOn = {}

    // Keep HITL only for sensitive actions. write_file/edit_file are governed by agent permissions and workspace sandboxing.
    if (permissions.execCommand) {
      interruptOn.exec_command = { allowedDecisions: ['approve', 'reject'] }
      interruptOn.execute = { allowedDecisions: ['approve', 'reject'] }
      for (const name of HIDDEN_COMMAND_COMPATIBILITY_TOOL_NAMES) {
        interruptOn[name] = { allowedDecisions: ['approve', 'reject'] }
      }
    }
    if (permissions.fileDelete) interruptOn.delete_file = { allowedDecisions: ['approve', 'reject'] }

    return Object.keys(interruptOn).length ? interruptOn : undefined
  }

  /**
   * Build DeepAgents skills paths — global skills directory only
   * Skills are installed once at {workRoot}/skills/{skillId}/ and shared across agents
   * Isolation is achieved by only resolving skill IDs the agent is bound to
   * Returns { paths: string[], info: { id, name, desc }[] }
   */
  _buildSkillsPaths(skillIds) {
    if (!skillIds?.length) return { paths: undefined, info: [] }
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return { paths: undefined, info: [] }

    const globalSkillsDir = path.join(workRoot, 'skills')
    if (!fs.existsSync(globalSkillsDir)) {
      fs.mkdirSync(globalSkillsDir, { recursive: true })
    }

    const skillPaths = []
    const skillInfo = []
    for (const skillId of skillIds) {
      const skillDir = path.join(globalSkillsDir, skillId)
      const skillFile = path.join(skillDir, 'SKILL.md')
      if (fs.existsSync(skillFile)) {
        skillPaths.push(`/skills/${skillId}/`)
        // Read first line of SKILL.md for skill name (format: # SkillName)
        let skillName = skillId
        try {
          const firstLine = fs.readFileSync(skillFile, 'utf-8').split('\n')[0]
          const titleMatch = firstLine.match(/^#\s+(.+)/)
          if (titleMatch) skillName = titleMatch[1].trim()
        } catch { /* fallback to skillId */ }
        skillInfo.push({ id: skillId, name: skillName, desc: `路径: /skills/${skillId}/` })
        console.log('[AgentService] Skill found:', skillId, '→', skillName)
      } else {
        console.warn('[AgentService] Skill not found:', skillId)
      }
    }

    return { paths: skillPaths.length ? skillPaths : undefined, info: skillInfo }
  }

  /**
   * Build DeepAgents memory paths — per-agent isolated memory
   * Each agent gets its own memory at {workRoot}/agents/{englishName}/memory/AGENTS.md
   * Falls back to agentId/_shared when englishName is unavailable
   */
  _safeAgentDirName(value) {
    const safe = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    return safe || '_shared'
  }

  _agentMemoryDirName(agentId, agentEnglishName) {
    return this._safeAgentDirName(agentEnglishName || agentId || '_shared')
  }

  _buildMemoryPaths(agentRef = {}) {
    const workRoot = this._workDirService?.getRootPath?.() || ''
    if (!workRoot) return undefined
    const agentId = typeof agentRef === 'object' ? agentRef.agentId : ''
    const agentEnglishName = typeof agentRef === 'object' ? agentRef.agentEnglishName : agentRef

    // 1. Global shared memory — all agents can read/write
    const globalMemDir = path.join(workRoot, 'memories')
    if (!fs.existsSync(globalMemDir)) fs.mkdirSync(globalMemDir, { recursive: true })
    const globalMd = path.join(globalMemDir, 'AGENTS.md')
    if (!fs.existsSync(globalMd)) {
      fs.writeFileSync(globalMd, '# Global Memory\n\n## 全局规则\n\n## 全局偏好\n\n', 'utf-8')
    }

    // 2. Per-agent private memory — only this agent can access
    const agentDirName = this._agentMemoryDirName(agentId, agentEnglishName)
    const agentMemDir = path.join(workRoot, 'agents', agentDirName, 'memory')
    if (!fs.existsSync(agentMemDir)) fs.mkdirSync(agentMemDir, { recursive: true })
    const agentMd = path.join(agentMemDir, 'AGENTS.md')
    if (!fs.existsSync(agentMd)) {
      fs.writeFileSync(agentMd, '# Agent Context\n\n## Preferences\n\n## Facts\n\n', 'utf-8')
    }

    const paths = [
      '/memories/AGENTS.md',                        // Global shared (all agents)
      `/agents/${agentDirName}/memory/AGENTS.md`,   // Per-agent private
    ]

    return paths
  }

  // ── Memory Injection: DB semantic memories → AGENTS.md ──────────

  _injectSemanticMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return

    // Read semantic memories from DB
    const rows = this._db.listMemories?.() || []
    const semanticRows = rows.filter(r => r.type === 'semantic')
    if (!semanticRows.length) return

    let content = fs.readFileSync(globalMd, 'utf-8')

    // Remove any existing injected block
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx !== -1) {
      const endIdx = content.indexOf(endTag, startIdx)
      if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      }
    }

    // Build injection block
    const items = semanticRows.map(r => `- ${r.content}`).join('\n')
    const block = `\n\n${startTag}\n## 用户语义记忆\n\n${items}\n${endTag}\n`

    fs.writeFileSync(globalMd, content.trimEnd() + block, 'utf-8')
  }

  _removeInjectedMemories(workRoot) {
    if (!workRoot) return
    const globalMd = path.join(workRoot, 'memories', 'AGENTS.md')
    if (!fs.existsSync(globalMd)) return

    let content = fs.readFileSync(globalMd, 'utf-8')
    const startTag = '<!-- REVIVA_DB_MEMORIES -->'
    const endTag = '<!-- /REVIVA_DB_MEMORIES -->'
    const startIdx = content.indexOf(startTag)
    if (startIdx === -1) return

    const endIdx = content.indexOf(endTag, startIdx)
    if (endIdx !== -1) {
      content = content.slice(0, startIdx) + content.slice(endIdx + endTag.length)
      fs.writeFileSync(globalMd, content.trimEnd() + '\n', 'utf-8')
    }
  }

  // ── Agent Run Handler ────────────────────────────────────────

  async handleStartRun(request) {
    const startTime = Date.now()
    const runId = request.runId || crypto.randomUUID()
    const abortController = new AbortController()
    const msgId = request.msgId

    if (!msgId) {
      this._send('agent:runError', { runId, error: { message: 'Missing message ID', code: 'INVALID_REQUEST' } })
      return
    }

    this._activeRuns.set(runId, { abortController, msgId, request })

    this._runStateManager.create({
      id: runId,
      conversation_id: request.conversationId || '',
      agent_id: request.agentId || '',
      status: 'running',
      max_iterations: normalizeNonNegativeLimit(request.maxIterations, 10),
    })

    this._db.updateMsg(msgId, {
      status: 'streaming',
      model_id: request.model || '',
      provider_id: request.providerId || '',
    })

    this._send('agent:runStarted', { runId, msgId, conversationId: request.conversationId })

    let workRoot = ''
    let mcpClients = []

    try {
      // Set tool provider config (for web_search Tavily/SearXNG/Bing per-agent config)
      setToolProviderConfig(request.toolProviderConfigs || {})
      setToolRunContext({ agentEnglishName: request.agentEnglishName || '_shared', permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || [] })
      setExecCommandConfig({
        whitelist: request.permissions?.execCommandWhitelist || null,
        blacklist: request.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      // Prepare context files: workspace docs keep their absolute paths; external attachments are staged under /context/YYYY-MM-DD/.
      workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxPaths || [], workRoot)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens || 4096,
          topP: request.topP,
          thinkingMode: request.thinkingMode,
          thinkingIntensity: request.thinkingIntensity,
          streaming: false,
          apiFormat: request.apiFormat,
        },
      )
      console.log('[AgentService] Model created:', model.constructor.name,
        'provider:', request.providerId,
        'model:', request.model,
        'baseUrl:', request.baseUrl,
        'apiKey:', request.apiKey ? '(set, length:' + request.apiKey.length + ')' : '(empty)')

      // Build skills paths (global only — agents reference, not copy)
      const skillData = this._buildSkillsPaths(request.skills)
      console.log('[AgentService] Skills:', skillData.paths || 'none')

      // Renderer sends agent.prompt as systemPrompt; main process injects project rules + context paths + skills
      const memoryDirName = this._agentMemoryDirName(request.agentId, request.agentEnglishName)
      let systemPrompt = request.systemPrompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, request.agentEnglishName, skillData.info, request.answerStyle, memoryDirName, request.cloudContext)

      // Write per-agent runtime files (AGENT.md, skills.json) to agent sandbox directory
      const agentDirName = request.agentEnglishName || '_shared'
      const agentDir = path.join(workRoot, 'agents', agentDirName)
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(path.join(agentDir, 'AGENT.md'), systemPrompt, 'utf-8')
      fs.writeFileSync(path.join(agentDir, 'skills.json'), JSON.stringify(request.skills || [], null, 2), 'utf-8')
      console.log('[AgentService] Wrote agent runtime files to:', agentDir)

      const subAgentToolIds = (request.subAgents || [])
        .filter(sa => sa && typeof sa === 'object')
        .flatMap(sa => Array.isArray(sa.tools) ? sa.tools : [])
      const subAgentSkillIds = (request.subAgents || [])
        .filter(sa => sa && typeof sa === 'object')
        .flatMap(sa => Array.isArray(sa.skills) ? sa.skills : [])
      const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(this._withSkillTools([
        ...(request.toolIds || []),
        ...subAgentToolIds,
      ], [
        ...(request.skills || []),
        ...subAgentSkillIds,
      ]), request.permissions), request.cloudContext)
      setToolRunContext({ agentEnglishName: request.agentEnglishName || '_shared', permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || [], toolIds: effectiveToolIds })
      const customTools = this._buildLocalRuntimeTools(effectiveToolIds, { includeDefaults: false })
      resetTaskCounters()
      console.log('[AgentService] Tools loaded:', customTools.map(t => t.name))

      // Build MCP tools lazily from synced caches. The proxy connects only when invoked.
      // agent.toolIds entries shaped like:
      //   `mcp:{serverId}`              ← server-level binding, includes every non-disabled tool from that server
      //   `mcp:{serverId}:{toolName}`   ← legacy per-tool entries from earlier versions, still honored for back-compat
      let mcpTools = []
      try {
        const mcpResult = await this._loadMcpToolsForRun(effectiveToolIds)
        mcpClients = mcpResult.clients || []
        mcpTools = mcpResult.tools || []
        if (mcpTools.length) console.log('[AgentService] MCP tools loaded:', mcpTools.map(t => `${t._mcp_server_id}/${t._mcp_tool_name}${t._mcp_lazy ? ':lazy' : ''}`))
      } catch (err) {
        console.error('[AgentService] MCP tool preparation failed:', err.message)
      }
      const allCustomTools = [...customTools, ...mcpTools]

      // Build DeepAgents subagents config
      const subagents = this._buildSubagents(request.subAgents, allCustomTools, request)
      console.log('[AgentService] Subagents:', subagents?.map(s => s.name) || 'none')

      // Build interruptOn from permissions
      const interruptOn = this._buildInterruptOn(request.permissions)
      console.log('[AgentService] InterruptOn:', interruptOn || 'none')

      // Inject DB semantic memories into global AGENTS.md
      this._injectSemanticMemories(workRoot)

      // Build memory paths (per-agent isolated)
      const memory = this._buildMemoryPaths({ agentId: request.agentId, agentEnglishName: request.agentEnglishName })

      // Build backend: AgentScopedBackend restricts file tools by VFS policy.
      // DeepAgents expects POSIX-style rootDir (forward slashes) for virtualMode path resolution
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      const boundSkillIds = request.skills || []
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds,
        allowedAgentMemoryDir: memoryDirName,
        agentDirName: request.agentEnglishName || '_shared',
        wikiContext: request.wikiContext || {},
      })

      // Create DeepAgent — createDeepAgent is synchronous
      console.log('[AgentService] Creating DeepAgent...')
      const agent = createDeepAgent({
        model,
        tools: allCustomTools,
        systemPrompt,
        subagents,
        interruptOn,
        skills: skillData.paths,
        memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: request.agentEnglishName || request.agentId || 'reviva-agent',
        middleware: buildMiddleware({
          toolCallLimit: request.toolCallLimit,
          modelCallLimit: request.modelCallLimit,
          subagentNames: subagents?.map(s => s.name) || [],
        }),
      })
      console.log('[AgentService] DeepAgent created, starting stream...')

      const preparedMessages = this._prepareMessageAttachments(
        toPlainMessages(request.messages || []),
        workRoot,
        preparedCtxPaths,
      )
      const plainMessages = toLangchainMessages(_attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      ))

      // Hard timeout — document/research generation agents get 10min, others 5min
      const longRunningAgents = new Set(['deep-researcher', 'lab-report-assistant'])
      const timeoutMs = longRunningAgents.has(request.agentEnglishName) ? 600000 : 300000
      const hardTimeout = setTimeout(() => abortController.abort(), timeoutMs)

      const sendFn = (chunk) => this._send('agent:chunk', { runId, chunk })

      const result = await iterateDeepStream(
        agent,
        { messages: plainMessages },
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(request.maxIterations),
        },
        sendFn,
        'agent',
      )

      clearTimeout(hardTimeout)

      // Check for human-in-the-loop interrupt after streaming completes
      // streamEvents() v3 doesn't return __interrupt__ in result — check agent state
      let interruptDetected = false
      try {
        const state = await agent.getState({ configurable: { thread_id: runId } })
        if (state?.next?.length && state?.tasks?.some(t => t.interrupts?.length)) {
          const interrupts = state.tasks
            .filter(t => t.interrupts?.length)
            .flatMap(t => t.interrupts)

          console.log('[AgentService] Interrupt detected via state:', interrupts)
          const actionRequests = interrupts.map(i => i.value?.actionRequests || []).flat()
          const reviewConfigs = interrupts.map(i => i.value?.reviewConfigs || []).flat()

          if (actionRequests.length) {
            interruptDetected = true

            // Store interrupted run for resume — include initial steps data so resumed run can offset
            this._interruptedRuns.set(runId, {
              runId,
              request,
              agentConfig: { model, tools: allCustomTools, toolIds: effectiveToolIds, systemPrompt, subagents, interruptOn, skills: skillData.paths, memory, memoryDirName },
              msgId,
              initialSteps: result.steps,
              initialIteration: result.iteration,
              initialContent: result.fullContent,
              initialThinking: result.thinkingContent,
              initialUsage: result.totalUsage,
              initialTodos: result.todos || [],
              pendingActionRequests: actionRequests,
              pendingReviewConfigs: reviewConfigs,
            })

            this._send('agent:authRequest', {
              requestId: runId,
              actionRequests,
              reviewConfigs,
            })

            // Don't finalize — run is paused
            this._activeRuns.delete(runId)
            return
          }
        }
      } catch (e) {
        console.warn('[AgentService] Could not check interrupt state:', e.message)
      }

      // Legacy: also check result.__interrupt__ if available (non-streaming invoke)
      if (!interruptDetected && result.__interrupt__) {
        console.log('[AgentService] Interrupt detected in result:', result.__interrupt__)
        const interrupts = result.__interrupt__[0]?.value
        if (interrupts) {
          const actionRequests = interrupts.actionRequests || []
          const reviewConfigs = interrupts.reviewConfigs || []

          this._interruptedRuns.set(runId, {
            runId,
            request,
            agentConfig: { model, tools: allCustomTools, systemPrompt, subagents, interruptOn, skills: skillData.paths, memory, memoryDirName },
            msgId,
            initialSteps: result.steps,
            initialIteration: result.iteration,
            initialContent: result.fullContent,
            initialThinking: result.thinkingContent,
            initialUsage: result.totalUsage,
            initialTodos: result.todos || [],
            pendingActionRequests: actionRequests,
            pendingReviewConfigs: reviewConfigs,
          })

          this._send('agent:authRequest', {
            requestId: runId,
            actionRequests,
            reviewConfigs,
          })

          this._activeRuns.delete(runId)
          return
        }
      }

      const { fullContent, thinkingContent, totalUsage, steps, recursionHit, todos } = result
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost
      const latencyMs = Date.now() - startTime

      // If recursion limit was hit, treat as cancelled with partial content instead of "completed"
      const finalStatus = recursionHit ? 'cancelled' : 'completed'
      const stopReason = recursionHit ? 'recursion_limit' : 'end_turn'

      this._tokenRecorder.record({
        providerId: request.providerId,
        modelId: request.model,
        usage: totalUsage,
        cost,
        latencyMs,
        agentId: request.agentId,
        conversationId: request.conversationId,
        runId,
        iteration: 1,
      })

      // Build meta for DB persistence (steps, toolCalls) — ensures intermediate process data survives even if renderer update fails
      const stepsMeta = {}
      if (steps?.length) stepsMeta.steps = steps
      if (todos?.length) stepsMeta.todos = todos
      const toolCallsFromSteps = steps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: fullContent,
        thinking_content: thinkingContent,
        status: finalStatus,
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost: totalUsage.cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._runStateManager.update(runId, {
        status: finalStatus,
        iterations: 1,
        total_input_tokens: totalUsage.inputTokens,
        total_output_tokens: totalUsage.outputTokens,
        total_cost: totalUsage.cost,
        completed_at: new Date().toISOString(),
      })

      this._send('agent:runDone', {
        runId,
        content: fullContent,
        thinkingContent,
        usage: totalUsage,
        stopReason,
        steps,
        todos,
        latencyMs,
        cost: totalUsage.cost,
      })

      // Register artifacts for builtin 创作中心 agents
      const moduleConfig = this._builtinModules?.find(m => m.english_name === request.agentEnglishName)
      if (moduleConfig) {
        this._registerArtifacts({
          conversationId: request.conversationId,
          agentEnglishName: request.agentEnglishName,
          workRoot,
          runStartTime: startTime,
        })
      }

    } catch (err) {
      const isAborted = err.name === 'AbortError' || err.message === 'ABORTED' || abortController.signal.aborted
      console.error('[AgentService] Run error:', err.message, '| aborted:', isAborted, '| code:', err.code || 'none')

      const partialLatencyMs = Date.now() - startTime

      if (isAborted) {
        this._db.updateMsg(msgId, { status: 'cancelled' })
        this._runStateManager.update(runId, { status: 'cancelled', completed_at: new Date().toISOString() })
        this._send('agent:runCancelled', { runId, latencyMs: partialLatencyMs })
      } else {
        const classified = this._errorClassifier.classify(err)
        console.error('[AgentService] Classified error:', classified.code, classified.userMessage)
        this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
        this._runStateManager.update(runId, {
          status: 'error',
          error_code: classified.code,
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        this._send('agent:runError', { runId, error: { message: classified.userMessage, code: classified.code } })
      }

    } finally {
      this._activeRuns.delete(runId)
      this._removeInjectedMemories(workRoot)
      // Close MCP clients (HTTP/SSE connections to remote MCP servers)
      if (this._mcpService && mcpClients?.length) {
        await this._mcpService.closeClients(mcpClients)
      }
    }
  }

  handleCancelRun(runId) {
    const run = this._activeRuns.get(runId)
    if (run) run.abortController.abort()
  }

  // ── Human-in-the-Loop: Auth Resume ─────────────────────────────

  async handleAuthRespond(requestId, approved) {
    const startTime = Date.now()
    const interruptedRun = this._interruptedRuns.get(requestId)
    if (!interruptedRun) {
      console.warn('[AgentService] No interrupted run found for:', requestId)
      return { requestId, approved, error: 'No interrupted run found' }
    }

    const { runId, request, agentConfig, msgId, initialSteps, initialIteration, initialContent, initialThinking, initialUsage, initialTodos, pendingActionRequests } = interruptedRun
    this._interruptedRuns.delete(requestId)

    console.log('[AgentService] Resuming interrupted run:', runId, 'approved:', approved)

    let workRoot = ''

    try {
      // Restore tool provider config for resumed run
      setToolProviderConfig(request.toolProviderConfigs || {})
      const resumeToolIds = withPermissionAgentTools(agentConfig.toolIds || request.toolIds || [], request.permissions)
      setToolRunContext({ agentEnglishName: request.agentEnglishName || '_shared', permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || agentConfig.skills || [], toolIds: resumeToolIds })
      setExecCommandConfig({
        whitelist: request.permissions?.execCommandWhitelist || null,
        blacklist: request.permissions?.execCommandBlacklist || null,
      })
      setCloudContext(request.cloudContext || {})

      // Recreate the agent with same config (including backend)
      workRoot = this._workDirService?.getRootPath?.() || ''
      const normalizedRoot = (workRoot || '.').replace(/\\/g, '/')
      // Extract bound skill IDs from stored skill paths (e.g. '/skills/concept-explainer/' → 'concept-explainer')
      const resumeSkillIds = (agentConfig.skills || []).map(p => p.replace(/\\/g, '/').replace(/^\/skills\//, '').replace(/\/+$/, ''))
      const resumeMemoryDirName = agentConfig.memoryDirName || this._agentMemoryDirName(request.agentId, request.agentEnglishName)
      const backend = new AgentScopedBackend({ rootDir: normalizedRoot, virtualMode: true }, {
        workDirService: this._workDirService,
        boundSkillIds: resumeSkillIds,
        allowedAgentMemoryDir: resumeMemoryDirName,
        agentDirName: request.agentEnglishName || '_shared',
        wikiContext: request.wikiContext || {},
      })

      // Re-inject semantic memories for resumed run
      this._injectSemanticMemories(workRoot)

      const agent = createDeepAgent({
        model: agentConfig.model,
        tools: agentConfig.tools,
        systemPrompt: agentConfig.systemPrompt,
        subagents: agentConfig.subagents,
        interruptOn: agentConfig.interruptOn,
        skills: agentConfig.skills,
        memory: agentConfig.memory,
        backend,
        checkpointer: this._checkpointer,
        store: this._store,
        name: request.agentEnglishName || request.agentId || 'reviva-agent',
        middleware: buildMiddleware({
          toolCallLimit: request.toolCallLimit,
          modelCallLimit: request.modelCallLimit,
          subagentNames: agentConfig.subagents?.map(s => s.name) || [],
        }),
      })

      const decisionCount = Math.max(1, Array.isArray(pendingActionRequests) ? pendingActionRequests.length : 0)
      const decisions = Array.from({ length: decisionCount }, () => ({ type: approved ? 'approve' : 'reject' }))
      const abortController = new AbortController()
      this._activeRuns.set(runId, { abortController, msgId, request })

      const sendFn = (chunk) => this._send('agent:chunk', { runId, chunk })

      const result = await iterateDeepStream(
        agent,
        new Command({ resume: { decisions } }),
        {
          configurable: { thread_id: runId },
          signal: abortController.signal,
          recursionLimit: recursionLimitForMaxIterations(request.maxIterations),
        },
        sendFn,
        'agent',
        { stepIndex: (initialSteps || []).length, iteration: initialIteration || 0 },
      )

      // Check for another interrupt after resume (same logic as handleStartRun)
      // streamEvents() doesn't return __interrupt__ — check agent state
      let interruptDetected = false
      try {
        const state = await agent.getState({ configurable: { thread_id: runId } })
        if (state?.next?.length && state?.tasks?.some(t => t.interrupts?.length)) {
          const interrupts = state.tasks
            .filter(t => t.interrupts?.length)
            .flatMap(t => t.interrupts)

          console.log('[AgentService] Interrupt detected after resume via state:', interrupts)
          const actionRequests = interrupts.map(i => i.value?.actionRequests || []).flat()
          const reviewConfigs = interrupts.map(i => i.value?.reviewConfigs || []).flat()

          if (actionRequests.length) {
            interruptDetected = true

            this._interruptedRuns.set(runId, {
              runId, request, agentConfig, msgId,
              initialSteps: [...(initialSteps || []), ...result.steps],
              initialIteration: result.iteration,
              initialContent: (initialContent || '') + result.fullContent,
              initialThinking: (initialThinking || '') + result.thinkingContent,
              initialTodos: result.todos?.length ? result.todos : (initialTodos || []),
              initialUsage: {
                inputTokens: (initialUsage?.inputTokens || 0) + (result.totalUsage.inputTokens || 0),
                outputTokens: (initialUsage?.outputTokens || 0) + (result.totalUsage.outputTokens || 0),
                cacheReadTokens: (initialUsage?.cacheReadTokens || 0) + (result.totalUsage.cacheReadTokens || 0),
                cacheWriteTokens: (initialUsage?.cacheWriteTokens || 0) + (result.totalUsage.cacheWriteTokens || 0),
                thinkingTokens: (initialUsage?.thinkingTokens || 0) + (result.totalUsage.thinkingTokens || 0),
              },
              pendingActionRequests: actionRequests,
              pendingReviewConfigs: reviewConfigs,
            })

            this._send('agent:authRequest', {
              requestId: runId,
              actionRequests,
              reviewConfigs,
            })

            this._activeRuns.delete(runId)
            return { requestId, approved, resumed: true, nextInterrupt: true }
          }
        }
      } catch (e) {
        console.warn('[AgentService] Could not check interrupt state after resume:', e.message)
      }

      // Legacy: also check result.__interrupt__ if available (non-streaming invoke)
      if (!interruptDetected && result.__interrupt__) {
        const interrupts = result.__interrupt__[0]?.value
        if (interrupts) {
          this._interruptedRuns.set(runId, {
            runId, request, agentConfig, msgId,
            initialSteps: [...(initialSteps || []), ...result.steps],
            initialIteration: result.iteration,
            initialContent: (initialContent || '') + result.fullContent,
            initialThinking: (initialThinking || '') + result.thinkingContent,
            initialTodos: result.todos?.length ? result.todos : (initialTodos || []),
              initialUsage: {
                inputTokens: (initialUsage?.inputTokens || 0) + (result.totalUsage.inputTokens || 0),
                outputTokens: (initialUsage?.outputTokens || 0) + (result.totalUsage.outputTokens || 0),
                cacheReadTokens: (initialUsage?.cacheReadTokens || 0) + (result.totalUsage.cacheReadTokens || 0),
                cacheWriteTokens: (initialUsage?.cacheWriteTokens || 0) + (result.totalUsage.cacheWriteTokens || 0),
                thinkingTokens: (initialUsage?.thinkingTokens || 0) + (result.totalUsage.thinkingTokens || 0),
              },
              pendingActionRequests: interrupts.actionRequests || [],
              pendingReviewConfigs: interrupts.reviewConfigs || [],
            })
          this._send('agent:authRequest', {
            requestId: runId,
            actionRequests: interrupts.actionRequests || [],
            reviewConfigs: interrupts.reviewConfigs || [],
          })
          this._activeRuns.delete(runId)
          return { requestId, approved, resumed: true, nextInterrupt: true }
        }
      }

      // Combine initial + resumed steps and content for final result
      const allSteps = [...(initialSteps || []), ...result.steps]
      const allTodos = result.todos?.length ? result.todos : (initialTodos || [])
      const allContent = (initialContent || '') + result.fullContent
      const allThinking = (initialThinking || '') + result.thinkingContent
      const allUsage = { ...result.totalUsage }
      if (initialUsage) {
        allUsage.inputTokens += initialUsage.inputTokens || 0
        allUsage.outputTokens += initialUsage.outputTokens || 0
        allUsage.cacheReadTokens += initialUsage.cacheReadTokens || 0
        allUsage.cacheWriteTokens += initialUsage.cacheWriteTokens || 0
        allUsage.thinkingTokens += initialUsage.thinkingTokens || 0
      }
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, allUsage)
      allUsage.cost = cost

      // If recursion limit was hit during resume, treat as cancelled
      const finalStatus = result.recursionHit ? 'cancelled' : 'completed'
      const stopReason = result.recursionHit ? 'recursion_limit' : 'end_turn'

      // Build meta for DB persistence (steps, toolCalls) from allSteps
      const stepsMeta = {}
      if (allSteps?.length) stepsMeta.steps = allSteps
      if (allTodos?.length) stepsMeta.todos = allTodos
      const toolCallsFromSteps = allSteps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: allContent,
        thinking_content: allThinking,
        status: finalStatus,
        input_tokens: allUsage.inputTokens,
        output_tokens: allUsage.outputTokens,
        cache_read_tokens: allUsage.cacheReadTokens,
        cache_write_tokens: allUsage.cacheWriteTokens,
        thinking_tokens: allUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost: allUsage.cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._runStateManager.update(runId, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })

      this._send('agent:runDone', {
        runId,
        content: allContent,
        thinkingContent: allThinking,
        usage: allUsage,
        stopReason,
        steps: allSteps,
        todos: allTodos,
        latencyMs,
        cost: allUsage.cost,
      })

      return { requestId, approved, resumed: true }

    } catch (err) {
      const classified = this._errorClassifier.classify(err)
      this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
      this._send('agent:runError', { runId, error: { message: classified.userMessage, code: classified.code } })
      this._activeRuns.delete(runId)
      return { requestId, approved, resumed: true, error: classified.code }
    } finally {
      this._removeInjectedMemories(workRoot)
    }
  }

  async handleExecuteTool(request) {
    setCloudContext(request.cloudContext || {})
    const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(this._withSkillTools(request.toolIds, request.skills), request.permissions), request.cloudContext)
    setToolRunContext({ agentEnglishName: request.agentEnglishName || '_shared', permissions: request.permissions || {}, wikiContext: request.wikiContext || {}, boundSkillIds: request.skills || [], toolIds: effectiveToolIds })
    const tools = this._buildLocalRuntimeTools(effectiveToolIds)
    const tool = tools.find(t => t.name === request.toolName)
    if (!tool) return { content: `Unknown tool: ${request.toolName}`, isError: true }
    try {
      const result = await tool.invoke(request.input)
      return { content: result, isError: false }
    } catch (e) {
      return { content: `Tool error: ${e.message}`, isError: true }
    }
  }

  async handleRunSubAgent(request) {
    // Fallback for manual sub-agent execution (not via DeepAgents task delegation)
    const { providerId, apiKey, baseUrl, apiFormat, model: modelName, context, task, toolIds } = request
    try {
      setCloudContext(request.cloudContext || context?.cloudContext || {})
      const effectiveToolIds = withContextualAgentTools(withPermissionAgentTools(
        this._withSkillTools(toolIds, request.skills || context?.skills),
        request.permissions || context?.permissions,
      ),
        request.cloudContext || context?.cloudContext,
      )
      setToolRunContext({ agentEnglishName: request.agentEnglishName || context?.agentEnglishName || '_shared', permissions: request.permissions || context?.permissions || {}, wikiContext: request.wikiContext || context?.wikiContext || {}, boundSkillIds: request.skills || context?.skills || [], toolIds: effectiveToolIds })
      const subModel = this._createModel(providerId, apiKey, baseUrl, modelName, { streaming: false, apiFormat })
      const subAgent = createDeepAgent({
        model: subModel,
        systemPrompt: context.systemPrompt || '',
        tools: this._buildLocalRuntimeTools(effectiveToolIds),
        checkpointer: this._checkpointer,
        middleware: [createFilesystemToolArgumentAliasMiddleware(), createDeepAgentsBuiltinToolExclusionMiddleware()],
      })
      const result = await subAgent.invoke({
        messages: [new HumanMessage(task)],
      })
      const lastMsg = result.messages[result.messages.length - 1]
      return { summary: lastMsg?.content?.slice(0, 2000) || '子智能体执行完成', usage: {} }
    } catch (e) {
      return { summary: `子智能体执行失败: ${e.message}`, error: true }
    }
  }

  async handleCompressContext(request) {
    return { summary: request.messages?.slice(-5) || [], compressed: true }
  }

  async handleGenerateTitle(req) {
    try {
      const { userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model } = req
      const title = await this._titleGenerator.generate({ userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model })
      return { title }
    } catch (e) {
      console.error('[AgentService] generateTitle error:', e.message)
      return { title: '' }
    }
  }

  handleGetRunState(runId) {
    return this._runStateManager.get(runId)
  }

  // ── Legacy ChatService ───────────────────────────────────────

  async handleChatStart(request) {
    const startTime = Date.now()
    const requestId = request.requestId || crypto.randomUUID()
    const abortController = new AbortController()
    const msgId = request.msgId

    if (!msgId) {
      this._send('chat:error', { requestId, msgId: null, error: 'Missing message ID', code: 'INVALID_REQUEST' })
      return
    }

    this._db.updateMsg(msgId, {
      status: 'streaming',
      model_id: request.model || '',
      provider_id: request.providerId || '',
    })

    this._activeStreams.set(requestId, { abortController, msgId })
    this._send('chat:started', { requestId, msgId, conversationId: request.conversationId })

    try {
      const workRoot = this._workDirService?.getRootPath?.() || ''
      const preparedCtxPaths = this._prepareContextItems(request.ctxPaths || [], workRoot)
      const preparedMessages = this._prepareMessageAttachments(request.messages || [], workRoot, preparedCtxPaths)
      const enrichedMessages = _attachImagesToUserMessages(
        enrichMessagesWithCtx(preparedMessages, preparedCtxPaths, workRoot),
        { modelHasVision: !!request.modelHasVision },
      )
      const memoryDirName = this._agentMemoryDirName(request.agentId, request.agentEnglishName)
      let systemPrompt = request.systemPrompt || ''
      systemPrompt += '\n\n' + this._buildProjectSystemPrompt(workRoot, preparedCtxPaths, request.agentEnglishName, [], request.answerStyle, memoryDirName, request.cloudContext)

      const model = this._createModel(
        request.providerId,
        request.apiKey,
        request.baseUrl,
        request.model,
        {
          temperature: request.temperature,
          maxTokens: request.maxTokens || 4096,
          topP: request.topP,
          apiFormat: request.apiFormat,
        },
      )

      const directMessages = toDirectMessages(systemPrompt, enrichedMessages)
      const sendFn = (text) => this._send('chat:chunk', { requestId, msgId, chunk: { type: 'content', text } })

      const result = await streamDirectModel(
        model,
        directMessages,
        abortController.signal,
        sendFn,
      )

      const { fullContent, thinkingContent, totalUsage, steps, todos } = result
      const latencyMs = Date.now() - startTime
      const cost = calcCost(request.model, totalUsage)
      totalUsage.cost = cost

      const stepsMeta = {}
      if (steps?.length) stepsMeta.steps = steps
      if (todos?.length) stepsMeta.todos = todos
      const toolCallsFromSteps = steps?.flatMap(s => s.toolCalls || []) || []
      if (toolCallsFromSteps.length) stepsMeta.toolCalls = toolCallsFromSteps

      this._db.updateMsg(msgId, {
        content: fullContent,
        thinking_content: thinkingContent,
        status: 'completed',
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        latency_ms: latencyMs,
        cost,
        meta: Object.keys(stepsMeta).length ? stepsMeta : undefined,
      })

      this._db.createTokenUsage({
        provider_id: request.providerId,
        model_id: request.model,
        input_tokens: totalUsage.inputTokens,
        output_tokens: totalUsage.outputTokens,
        cache_read_tokens: totalUsage.cacheReadTokens,
        cache_write_tokens: totalUsage.cacheWriteTokens,
        thinking_tokens: totalUsage.thinkingTokens,
        cost,
        latency_ms: latencyMs,
        agent_id: request.agentId || '',
        conversation_id: request.conversationId,
      })

      this._send('chat:done', {
        requestId, msgId,
        content: fullContent,
        thinkingContent,
        usage: totalUsage,
        latencyMs, cost,
        steps,
        todos,
      })

      const chatModuleConfig = this._builtinModules?.find(m => m.english_name === request.agentEnglishName)
      if (chatModuleConfig) {
        this._registerArtifacts({
          conversationId: request.conversationId,
          agentEnglishName: request.agentEnglishName,
          workRoot,
          runStartTime: Date.now() - latencyMs,
        })
      }

    } catch (err) {
      const isAborted = err.name === 'AbortError' || err.message === 'ABORTED'
      if (isAborted) {
        this._db.updateMsg(msgId, { status: 'error', error_message: '已取消', error_code: 'ABORTED' })
        this._send('chat:cancelled', { requestId, msgId })
      } else {
        const classified = this._errorClassifier.classify(err)
        this._db.updateMsg(msgId, { status: 'error', error_message: err.message, error_code: classified.code })
        this._send('chat:error', { requestId, msgId, error: err.message, code: classified.code })
      }
    } finally {
      this._activeStreams.delete(requestId)
    }
  }

  handleChatCancel(requestId) {
    const stream = this._activeStreams.get(requestId)
    if (stream) stream.abortController.abort()
  }

  // ── Builtin Agent Modules ────────────────────────────────────

  _resolveBuiltinModulesDir() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const candidates = [
      path.join(__dirname, 'agents', 'builtin'),
      process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'electron', 'agents', 'builtin') : '',
      process.resourcesPath ? path.join(process.resourcesPath, 'agents', 'builtin') : '',
    ].filter(Boolean)

    const dir = candidates.find(p => fs.existsSync(path.join(p, 'ppt-generator', 'config.json')))
    if (dir) return dir
    console.warn('[AgentService] builtin modules dir not found, tried:', candidates)
    return candidates[0]
  }

  _loadBuiltinAgentModules() {
    const modulesDir = this._resolveBuiltinModulesDir()
    if (!fs.existsSync(modulesDir)) return []

    const modules = []
    for (const entry of fs.readdirSync(modulesDir)) {
      const configPath = path.join(modulesDir, entry, 'config.json')
      if (!fs.existsSync(configPath)) continue

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      // Load orchestrator prompt
      const promptFile = path.join(modulesDir, entry, config.prompt_file || 'orchestrator.md')
      if (fs.existsSync(promptFile)) {
        config.prompt = fs.readFileSync(promptFile, 'utf-8')
      }

      // Load sub-agent prompts
      const subagentDir = path.join(modulesDir, entry, config.subagent_dir || 'subagents')
      config.subagent_prompts = {}
      if (fs.existsSync(subagentDir)) {
        for (const saFile of fs.readdirSync(subagentDir)) {
          if (!saFile.endsWith('.md')) continue
          const saName = saFile.replace('.md', '')
          config.subagent_prompts[saName] = fs.readFileSync(path.join(subagentDir, saFile), 'utf-8')
        }
      }

      // Load artifact rules
      const rulesFile = path.join(modulesDir, entry, config.artifact_rules_file || 'artifact-rules.json')
      if (fs.existsSync(rulesFile)) {
        config.artifact_rules = JSON.parse(fs.readFileSync(rulesFile, 'utf-8'))
      }

      modules.push(config)
    }
    return modules
  }

  _builtinAgentTemplateFromConfig(config, prompt = config.prompt || '') {
    return {
      id: config.id,
      builtin_key: config.id,
      builtin_version: config.builtin_version || config.version || '1.0.0',
      name: config.name || '',
      english_name: config.english_name || '',
      description: config.description || '',
      icon: config.icon || 'ri-sparkling-2-line',
      color: config.color || '#A78BFA',
      architecture: config.architecture || 'react',
      permissions: config.permissions || {},
      tools: config.tools || [],
      skills: config.skills || [],
      sub_agents: config.sub_agents || [],
      prompt,
      max_iterations: normalizeNonNegativeLimit(config.max_iterations, 10),
      model: config.model || '',
      temperature: config.temperature ?? 0.7,
      top_p: config.top_p ?? 1.0,
      max_tokens: config.max_tokens || 4096,
      thinking_mode: config.thinking_mode || 'auto',
      thinking_intensity: config.thinking_intensity || 'medium',
      tool_call_limit: config.tool_call_limit || 0,
      model_call_limit: config.model_call_limit || 0,
      plan_steps: config.plan_steps ?? 5,
      reviewer_model: config.reviewer_model || '',
      use_same_model: config.use_same_model === undefined ? 1 : (config.use_same_model ? 1 : 0),
    }
  }

  _syncBuiltinAgentModules() {
    if (!this._db?.syncBuiltinAgentTemplate || !Array.isArray(this._builtinModules)) return
    for (const config of this._builtinModules) {
      try {
        this._db.syncBuiltinAgentTemplate(this._builtinAgentTemplateFromConfig(config))
      } catch (err) {
        console.error(`[AgentService] Failed to sync builtin module ${config.id || config.english_name}:`, err.message)
      }
    }
  }

  // Install all built-in conversational agents from electron/builtin-assets/agents/.
  // Each subfolder must contain config.json (+ optional PROMPT.md). Existing rows are
  // synced through DatabaseService so official template updates can merge with user overrides.
  async installAllBuiltinAgents(dir) {
    if (!dir || !fs.existsSync(dir)) {
      console.log('[AgentService] No builtin-assets/agents directory found, skipping')
      return
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const agentDir = path.join(dir, entry.name)
      const configPath = path.join(agentDir, 'config.json')
      const promptPath = path.join(agentDir, 'PROMPT.md')

      if (!fs.existsSync(configPath)) continue

      try {
        const config = JSON.parse(await fs.promises.readFile(configPath, 'utf-8'))
        config.id = entry.name

        let prompt = config.prompt || ''
        if (fs.existsSync(promptPath)) {
          prompt = await fs.promises.readFile(promptPath, 'utf-8')
        }

        const synced = this._db.syncBuiltinAgentTemplate(this._builtinAgentTemplateFromConfig(config, prompt))
        console.log(`[AgentService] Synced builtin agent: ${synced?.id || config.id}`)
      } catch (err) {
        console.error(`[AgentService] Failed to install ${entry.name}:`, err.message)
      }
    }
  }

  async _registerArtifacts({ conversationId, groupId, agentEnglishName, workRoot, runStartTime }) {
    const date = new Date(runStartTime).toISOString().slice(0, 10)
    const outputDir = path.join(workRoot, 'agents', agentEnglishName, 'outputs', date)

    if (!fs.existsSync(outputDir)) return []

    // Background generation tasks may not have a conversation yet.
    const conv = conversationId ? this._db.getConv(conversationId) : null
    const resolvedGroupId = groupId || conv?.group_id || 'default'

    // Find module config for artifact rules
    const moduleConfig = this._builtinModules?.find(m => m.english_name === agentEnglishName)
    const rules = moduleConfig?.artifact_rules
    const created = []

    // Scan for new files (mtime > runStartTime)
    for (const file of fs.readdirSync(outputDir)) {
      const filePath = path.join(outputDir, file)
      let stat
      try { stat = fs.statSync(filePath) } catch { continue }
      if (!stat.isFile()) continue
      if (stat.mtimeMs < runStartTime) continue

      const ext = file.split('.').pop().toLowerCase()
      const title = file.replace(/\.[^.]+$/, '')

      // Match file pattern from rules
      const pattern = rules?.file_patterns?.find(p => p.ext === ext)
      const icon = pattern?.icon || (ext === 'html' ? 'ri-bar-chart-box-line' : 'ri-file-text-line')
      const type = pattern?.type || 'research'

      const artifact = this._db.createArtifact({
        id: `art_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        group_id: resolvedGroupId,
        conversation_id: conversationId || '',
        title,
        type,
        icon,
        color: moduleConfig?.color || '#38BDF8',
        storage_type: 'file',
        file_path: filePath,
        content: null,
        agent_name: moduleConfig?.name || agentEnglishName,
        skill_name: moduleConfig?.skills?.[0] || '',
      })
      created.push(artifact)
    }

    // Notify renderer
    if (created.length) {
      this._send('agent:artifactsCreated', { groupId: resolvedGroupId, agentEnglishName, artifacts: created })
    }
    return created
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Build project-specific system prompt additions
   * Injects output rules, behavioral guidelines, and user-provided context file paths
   */
  _buildProjectSystemPrompt(workRoot, ctxPaths, agentEnglishName, skillInfo = [], answerStyle = 'default', agentMemoryDirName = null, cloudContext = {}) {
    return buildProjectSystemPrompt({
      workRoot,
      ctxPaths,
      cloudContext,
      agentEnglishName,
      skillInfo,
      answerStyle,
      agentMemoryDirName,
    })
  }


  /**
   * Prepare context paths for agent runs.
   * - Workspace selections, especially docs/ files, keep their authorized absolute path.
   * - External attachments are copied into {workRoot}/context/YYYY-MM-DD/ and referenced by virtual path.
   */
  _prepareMessageAttachments(messages, workRoot, preparedCurrentCtxPaths = []) {
    const source = messages || []
    const lastUserIndex = (() => {
      for (let i = source.length - 1; i >= 0; i--) {
        if (_isUserMessage(source[i])) return i
      }
      return -1
    })()

    return source.map((message, index) => {
      if (!_isUserMessage(message)) return message
      const rawAttachments = index === lastUserIndex && preparedCurrentCtxPaths?.length
        ? preparedCurrentCtxPaths
        : _messageAttachments(message)
      if (!rawAttachments?.length) return message
      const attachments = index === lastUserIndex && rawAttachments === preparedCurrentCtxPaths
        ? preparedCurrentCtxPaths
        : this._prepareContextItems(rawAttachments, workRoot)
      return { ...message, attachments }
    })
  }

  _prepareContextItems(ctxPaths, workRoot) {
    if (!ctxPaths?.length || !workRoot) return ctxPaths || []

    const contextDir = path.join(workRoot, 'context', _dateStamp())
    const prepared = []

    for (const item of ctxPaths) {
      if (!item?.path && item?.dataUrl && _isImageContextItem(item)) {
        try {
          const decoded = _decodeImageDataUrl(item.dataUrl)
          if (!decoded) {
            prepared.push(item)
            continue
          }
          if (decoded.buffer.length > MAX_VISION_IMAGE_BYTES) {
            const err = new Error(`图片 ${item.name || '粘贴图片'} 过大，单张图片不能超过 10MB。请压缩后重试。`)
            err.code = 'VISION_IMAGE_TOO_LARGE'
            throw err
          }
          fs.mkdirSync(contextDir, { recursive: true })
          const imageName = _ensureImageFilename(item, decoded.ext)
          const dest = _uniqueDestPath(contextDir, imageName)
          fs.writeFileSync(dest, decoded.buffer)
          prepared.push({
            ...item,
            name: path.basename(dest),
            originalName: item.name || '',
            path: dest,
            isDirectory: false,
            source: item.source || 'attachment',
            accessPath: _toWorkspaceVirtualPath(dest, workRoot),
          })
          console.log('[AgentService] Staged pasted image context item:', item.name || imageName, '→', dest)
        } catch (e) {
          if (e.code === 'VISION_IMAGE_TOO_LARGE') throw e
          console.warn('[AgentService] Could not stage pasted image context item:', item.name || '(pasted image)', e.message)
          prepared.push(item)
        }
        continue
      }

      if (!item?.path) {
        prepared.push(item)
        continue
      }

      const name = item.name || path.basename(item.path)
      const isDirectory = !!(item.isDirectory || item.type === 'folder' || item.type === 'local_folder')

      try {
        const resolved = this._workDirService.resolveAndValidate(item.path, 'any')
        prepared.push({
          ...item,
          name,
          path: resolved,
          isDirectory,
          source: item.source || 'workspace',
          accessPath: _toWorkspaceVirtualPath(resolved, workRoot),
        })
        continue
      } catch {
        // Outside the authorized workspace: stage it as a temporary context attachment.
      }

      try {
        fs.mkdirSync(contextDir, { recursive: true })
        const dest = _uniqueDestPath(contextDir, name)
        if (isDirectory) {
          fs.cpSync(item.path, dest, { recursive: true })
        } else {
          fs.copyFileSync(item.path, dest)
        }
        prepared.push({
          ...item,
          name: path.basename(dest),
          originalPath: item.path,
          path: dest,
          isDirectory,
          source: item.source || 'attachment',
          accessPath: _toWorkspaceVirtualPath(dest, workRoot),
        })
        console.log('[AgentService] Staged external context item:', name, '→', dest)
      } catch (e) {
        console.warn('[AgentService] Could not stage context item:', name, e.message)
        prepared.push(item)
      }
    }

    return prepared
  }

  _send(channel, data) {
    const win = this._getWin()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    } else {
      console.warn('[AgentService] _send: BrowserWindow not available for', channel)
    }
  }
}
