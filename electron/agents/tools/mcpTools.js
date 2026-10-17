// agents/tools/mcpTools.js — extracted from langchainTools.js
// MCP resource read and prompt get tools.

import { tool } from 'langchain'
import { z } from 'zod'
import { _mcpService, _toolRunContext } from './toolContext.js'

const MCP_TOOL_OUTPUT_LIMIT = 60000

function _clipMcpText(value, limit = MCP_TOOL_OUTPUT_LIMIT) {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit)}\n\n[内容已截断：超过 ${limit} 字符]` : text
}

function _mcpServerAllowed(serverId) {
  const allowed = _toolRunContext.mcpServerIds || []
  return allowed.includes(String(serverId || ''))
}

export const mcpResourceRead = tool(
  async (input = {}) => {
    const serverId = String(input.serverId || '').trim()
    const uri = String(input.uri || '').trim()
    if (!_mcpService?.readResource) {
      return JSON.stringify({ success: false, code: 'MCP_NOT_AVAILABLE', message: 'MCP 服务不可用。' })
    }
    if (!serverId || !uri) {
      return JSON.stringify({ success: false, code: 'TOOL_INVALID_ARGUMENT', message: 'serverId 和 uri 不能为空。' })
    }
    if (!_mcpServerAllowed(serverId)) {
      return JSON.stringify({ success: false, code: 'TOOL_OPERATION_NOT_ALLOWED', message: `当前 Agent 未绑定 MCP 服务器：${serverId}` })
    }
    const result = await _mcpService.readResource(serverId, uri)
    if (!result?.success) {
      return JSON.stringify({ success: false, code: 'MCP_RESOURCE_READ_FAILED', message: result?.error || '读取 MCP resource 失败。', serverId, uri })
    }
    return JSON.stringify({
      success: true,
      operation: 'read_resource',
      serverId,
      uri,
      contents: (result.contents || []).map(c => ({
        uri: c.uri,
        mimeType: c.mimeType || '',
        text: c.text ? _clipMcpText(c.text) : '',
        blob: c.blob ? _clipMcpText(c.blob, 12000) : '',
      })),
    })
  },
  {
    name: 'mcp_resource_read',
    description: [
      '读取当前 Agent 已绑定 MCP 服务器暴露的 resource 内容。',
      '先查看 MCP 管理页或已同步缓存中的 resource uri；resourceTemplates 需要先填好参数形成具体 uri。',
      '只能读取当前 Agent 工具配置中已绑定的 mcp:{serverId} 服务器。',
    ].join('\n'),
    schema: z.object({
      serverId: z.string().describe('MCP 服务器 ID，对应 Agent 工具里的 mcp:{serverId}。'),
      uri: z.string().describe('要读取的 MCP resource URI。'),
    }),
  },
)

export const mcpPromptGet = tool(
  async (input = {}) => {
    const serverId = String(input.serverId || '').trim()
    const name = String(input.name || '').trim()
    const args = input.arguments && typeof input.arguments === 'object' && !Array.isArray(input.arguments) ? input.arguments : {}
    if (!_mcpService?.getPrompt) {
      return JSON.stringify({ success: false, code: 'MCP_NOT_AVAILABLE', message: 'MCP 服务不可用。' })
    }
    if (!serverId || !name) {
      return JSON.stringify({ success: false, code: 'TOOL_INVALID_ARGUMENT', message: 'serverId 和 name 不能为空。' })
    }
    if (!_mcpServerAllowed(serverId)) {
      return JSON.stringify({ success: false, code: 'TOOL_OPERATION_NOT_ALLOWED', message: `当前 Agent 未绑定 MCP 服务器：${serverId}` })
    }
    const result = await _mcpService.getPrompt(serverId, name, args)
    if (!result?.success) {
      return JSON.stringify({ success: false, code: 'MCP_PROMPT_GET_FAILED', message: result?.error || '获取 MCP prompt 失败。', serverId, name })
    }
    return JSON.stringify({
      success: true,
      operation: 'get_prompt',
      serverId,
      name,
      description: result.description || '',
      messages: (result.messages || []).map(m => ({
        role: m.role,
        content: m.content?.type === 'text'
          ? { ...m.content, text: _clipMcpText(m.content.text) }
          : m.content,
      })),
    })
  },
  {
    name: 'mcp_prompt_get',
    description: [
      '获取当前 Agent 已绑定 MCP 服务器提供的 prompt 模板实例。',
      '用于把 MCP prompt 转成可执行的消息内容；需要按该 prompt 的 arguments 填参数。',
      '只能访问当前 Agent 工具配置中已绑定的 mcp:{serverId} 服务器。',
    ].join('\n'),
    schema: z.object({
      serverId: z.string().describe('MCP 服务器 ID，对应 Agent 工具里的 mcp:{serverId}。'),
      name: z.string().describe('MCP prompt 名称。'),
      arguments: z.record(z.string(), z.any()).optional().describe('prompt 参数对象。'),
    }),
  },
)

// 鈹€鈹€ Skill Install 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

