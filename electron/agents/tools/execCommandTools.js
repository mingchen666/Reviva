// agents/tools/execCommandTools.js — extracted from langchainTools.js
// Command execution and hidden compatibility tools.

import { tool } from 'langchain'
import { z } from 'zod'
import { SAFE_COMMAND_TOOL_DESCRIPTION, runSafeCommand, runSafeStructuredCommand, validateSafeCommand } from '../../security/SafeCommandRunner.js'
import { _vfsResolver, _vfsContext } from './vfsHelpers.js'
import { _workDirService, _dbService, _toolRunContext, _execCommandConfig } from './toolContext.js'

function _safeCommandContext() {
  return {
    dbService: _dbService,
    workDirService: _workDirService,
    execConfig: _execCommandConfig,
    vfsResolver: _vfsResolver(),
    vfsContext: _vfsContext(),
  }
}

export function _validateCommand(command) {
  return validateSafeCommand(command, _safeCommandContext())
}

function _execCommandUnavailableMessage() {
  const toolIds = new Set(_toolRunContext.toolIds || [])
  if (!toolIds.has('exec_command')) {
    return '当前 Agent 未绑定“执行命令(exec_command)”工具，不能执行 shell 命令。请先在 Agent 工具中启用“执行命令”。'
  }
  const permissions = _toolRunContext.permissions || {}
  if (Object.prototype.hasOwnProperty.call(permissions, 'execCommand') && !permissions.execCommand) {
    return '当前 Agent 未开启 execCommand 权限，不能执行 shell 命令。请先在 Agent 权限中开启“执行命令”。'
  }
  return ''
}

export async function invokeCommandCompatibilityTool(input = {}, sourceTool = 'execute') {
  const unavailable = _execCommandUnavailableMessage()
  if (unavailable) {
    return JSON.stringify({
      status: 'unavailable',
      source_tool: sourceTool,
      message: unavailable,
    })
  }

  const args = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : { command: String(input || '') }

  if (args.cmd) {
    const result = await runSafeStructuredCommand({
      cmd: args.cmd,
      args: Array.isArray(args.args) ? args.args : [],
      cwd: args.cwd,
    }, _safeCommandContext())
    return JSON.stringify({ ...result, routed_from: sourceTool })
  }

  const command = args.command || ''
  if (!command) {
    return JSON.stringify({
      status: 'error',
      source_tool: sourceTool,
      message: `${sourceTool}: missing command or cmd`,
    })
  }
  const result = await runSafeCommand(command, _safeCommandContext())
  return JSON.stringify({ ...result, routed_from: sourceTool })
}

export const execCommand = tool(
  async ({ command, cmd, args, cwd }) => {
    const unavailable = _execCommandUnavailableMessage()
    if (unavailable) {
      return JSON.stringify({ status: 'unavailable', message: unavailable })
    }
    if (cmd) {
      const result = await runSafeStructuredCommand({ cmd, args, cwd }, _safeCommandContext())
      return JSON.stringify(result)
    }
    if (!command) throw new Error('exec_command: missing command or cmd')

    const result = await runSafeCommand(command, _safeCommandContext())
    return JSON.stringify(result)
  },
  {
    name: 'exec_command',
    description: SAFE_COMMAND_TOOL_DESCRIPTION,
    schema: z.object({
      command: z.string().optional().describe('兼容旧版：要执行的单条 shell 命令字符串。推荐改用 cmd/args/cwd。'),
      cmd: z.string().optional().describe('推荐：命令名，如 pnpm、node、python、git。不包含参数。'),
      args: z.array(z.string()).optional().describe('推荐：命令参数数组。文件路径请使用 /project、/docs、/context、/agents/... 虚拟路径。'),
      cwd: z.string().optional().describe('推荐：工作目录虚拟路径，如 /project 或 /agents/{agent}/outputs/YYYY-MM-DD。默认 /。'),
    }),
  },
)

const commandCompatibilitySchema = z.object({
  command: z.string().optional().describe('兼容输入：要执行的命令字符串。'),
  cmd: z.string().optional().describe('兼容输入：命令名。'),
  args: z.array(z.string()).optional().describe('兼容输入：命令参数数组。'),
  cwd: z.string().optional().describe('兼容输入：工作目录虚拟路径。'),
  description: z.string().optional().describe('兼容部分模型传入的说明字段，会被忽略。'),
})

function createHiddenCommandCompatibilityTool(name) {
  return tool(
    async (input) => invokeCommandCompatibilityTool(input, name),
    {
      name,
      description: 'Reviva 内部兼容工具。不要主动调用；命令执行请使用 exec_command。',
      schema: commandCompatibilitySchema,
    },
  )
}

export const hiddenCommandCompatibilityTools = [
  createHiddenCommandCompatibilityTool('bash'),
  createHiddenCommandCompatibilityTool('command'),
  createHiddenCommandCompatibilityTool('shell'),
]

