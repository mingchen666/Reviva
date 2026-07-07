import { createMiddleware, modelCallLimitMiddleware, toolCallLimitMiddleware } from 'langchain'
import { ToolMessage } from '@langchain/core/messages'
import {
  hiddenCommandCompatibilityTools,
  invokeCommandCompatibilityTool,
} from '../langchainTools.js'
import {
  DEEPAGENTS_EXECUTION_TOOL_EXCLUSION,
  DEEPAGENTS_EXECUTION_TOOL_NAME,
} from './constants.js'

const FILESYSTEM_FILE_PATH_TOOL_NAMES = new Set(['read_file', 'write_file', 'edit_file'])

export function createFilesystemToolArgumentAliasMiddleware() {
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

export function createDeepAgentsBuiltinToolExclusionMiddleware() {
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

export function normalizeSubagentKey(value) {
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

export function buildMiddleware({ toolCallLimit = 0, modelCallLimit = 0, subagentNames = [] } = {}) {
  const middleware = [
    createFilesystemToolArgumentAliasMiddleware(),
    createDeepAgentsBuiltinToolExclusionMiddleware(),
    createTaskSubagentGuardMiddleware(subagentNames),
  ]
  if (toolCallLimit > 0) middleware.push(toolCallLimitMiddleware({ runLimit: toolCallLimit, exitBehavior: 'end' }))
  if (modelCallLimit > 0) middleware.push(modelCallLimitMiddleware({ runLimit: modelCallLimit, exitBehavior: 'end' }))
  return middleware
}
