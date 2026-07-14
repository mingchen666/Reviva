function validDate(value) {
  const date = value instanceof Date ? value : new Date(value || '')
  return Number.isNaN(date.getTime()) ? null : date
}

function yamlString(value) {
  return JSON.stringify(String(value || '').replace(/\s+/g, ' ').trim())
}

function localDateParts(dateValue) {
  const date = validDate(dateValue) || new Date()
  const pad = value => String(value).padStart(2, '0')
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

export function formatExportMessageTime(value) {
  const date = validDate(value)
  if (!date) return ''
  const parts = localDateParts(date)
  return `${parts.date} ${parts.time}`
}

export function resolveExportableContent(message) {
  const content = typeof message?.content === 'string' ? message.content.trim() : ''
  if (content) return content
  if (message?.role !== 'assistant') return ''
  return (message?.meta?.steps || [])
    .map(step => typeof step?.content === 'string' ? step.content.trim() : '')
    .filter(Boolean)
    .join('\n\n')
}

export function getMessageAttachments(message) {
  const meta = message?.meta || {}
  const source = [
    ...(Array.isArray(meta.ctx) ? meta.ctx : []),
    ...(Array.isArray(meta.attachments) ? meta.attachments : []),
  ]
  const seen = new Set()
  return source.filter((item) => {
    const dataSignature = String(item?.dataUrl || '').slice(0, 80)
    const key = item?.id || item?.path || `${item?.type || ''}:${item?.name || ''}:${item?.size || ''}:${dataSignature}`
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isMessageExportable(message, options = {}) {
  if (message?.role !== 'user' && message?.role !== 'assistant') return false
  const status = message?.status || 'completed'
  if (status === 'pending' || status === 'streaming') return false
  if (resolveExportableContent(message) || getMessageAttachments(message).length) return true
  if (options.includeThinking && getMessageThinking(message)) return true
  if (options.includeToolCalls && getMessageToolCalls(message).length) return true
  if (options.includeSubAgents && getMessageSubAgents(message).length) return true
  if (options.includeMetrics && getMessageMetrics(message).length) return true
  return false
}

export function messagePreviewText(message, options = {}) {
  const content = resolveExportableContent(message)
  if (!content) {
    if (getMessageAttachments(message).length) return '仅包含附件'
    if (options.includeThinking && getMessageThinking(message)) return '包含思考过程'
    if (options.includeToolCalls && getMessageToolCalls(message).length) return `包含 ${getMessageToolCalls(message).length} 个工具调用`
    if (options.includeSubAgents && getMessageSubAgents(message).length) return `包含 ${getMessageSubAgents(message).length} 个子智能体结果`
    if (options.includeMetrics && getMessageMetrics(message).length) return '包含 Token 与耗时统计'
    return '无可导出内容'
  }
  return content
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[^\n]*\n?/g, '').replace(/```/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function attachmentLabel(item) {
  const name = String(item?.name || item?.title || item?.path || '未命名附件').split(/[\\/]/).pop().replace(/\s+/g, ' ').trim()
  const type = String(item?.type || '').toLowerCase()
  if (type === 'cloud_doc') return `知识库文档：${name}`
  if (type === 'cloud_kb' || type === 'kb') return `知识库：${name}`
  if (type === 'image' || /^data:image\//.test(item?.dataUrl || '')) return `图片：${name}`
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : ''
  return `${ext || '文件'}：${name}`
}

export function markdownToPlainText(value) {
  const source = String(value || '').replace(/\r\n?/g, '\n')
  if (!source.trim()) return ''

  const blocks = []
  const inlineCodes = []
  let text = source
    .replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\2(?=\n|$)/g, (_, prefix, _fence, body) => {
      const token = `\u0000MSBLOCK${blocks.length}\u0000`
      blocks.push(String(body || '').trimEnd())
      return `${prefix}${token}`
    })
    .replace(/`([^`\n]+)`/g, (_, body) => {
      const token = `\u0000MSINLINE${inlineCodes.length}\u0000`
      inlineCodes.push(body)
      return token
    })
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-+*]\s+\[([ xX])\]\s+/gm, (_, checked) => `- [${checked.toLowerCase()}] `)
    .replace(/^\s*[-+*]\s+/gm, '- ')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, '')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, '')
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row) => row.split('|').map(cell => cell.trim()).join('\t'))
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')

  blocks.forEach((body, index) => {
    text = text.replace(`\u0000MSBLOCK${index}\u0000`, body)
  })
  inlineCodes.forEach((body, index) => {
    text = text.replace(`\u0000MSINLINE${index}\u0000`, body)
  })

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function markdownOutsideFencedCode(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
  const visible = []
  let fenceChar = ''
  let fenceLength = 0

  for (const line of lines) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (!fenceChar) {
      if (marker) {
        fenceChar = marker[1][0]
        fenceLength = marker[1].length
      } else {
        visible.push(line)
      }
      continue
    }

    const closing = line.match(/^\s{0,3}(`+|~+)\s*$/)
    if (closing && closing[1][0] === fenceChar && closing[1].length >= fenceLength) {
      fenceChar = ''
      fenceLength = 0
    }
  }

  return visible.join('\n')
}

function omittedImageLabel(alt = '') {
  const label = markdownToPlainText(alt).replace(/\s+/g, ' ').trim()
  return label ? `[图片 Base64 已省略：${label}]` : '[图片 Base64 已省略]'
}

export function sanitizeMessageMarkdownForExport(value) {
  return String(value || '')
    .replace(
      /!\[([^\]]*)\]\(\s*<?data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/_=-]+>?(?:\s+["'][^"']*["'])?\s*\)/gi,
      (_, alt) => omittedImageLabel(alt),
    )
    .replace(
      /<img\b[^>]*\bsrc\s*=\s*(["'])data:image\/[a-z0-9.+-]+;base64,[^"']+\1[^>]*>/gi,
      tag => omittedImageLabel(tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2] || ''),
    )
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/_=-]+/gi, '[图片 Base64 已省略]')
}

export function deriveMessageExportTitle(message, conversation) {
  const content = resolveExportableContent(message)
  const heading = markdownOutsideFencedCode(content).match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1] || ''
  const headingTitle = markdownToPlainText(heading).replace(/\s+/g, ' ').trim()
  if (headingTitle) return headingTitle.slice(0, 80)

  const conversationTitle = String(conversation?.title || '').replace(/\s+/g, ' ').trim()
  return (conversationTitle ? `${conversationTitle} · AI 回复` : 'Reviva AI 回复').slice(0, 80)
}

export function buildSingleMessageMarkdown({ message, conversation, userMessage = null, includeUserPrompt = false }) {
  const content = sanitizeMessageMarkdownForExport(resolveExportableContent(message))
  const userContent = includeUserPrompt ? sanitizeMessageMarkdownForExport(resolveExportableContent(userMessage)) : ''
  const attachments = getMessageAttachments(message)
  const lines = []

  if (userContent) {
    lines.push('## 用户提问', '', userContent, '', '## AI 回复', '')
  }
  if (content) lines.push(content)

  if (attachments.length) {
    if (lines.length && lines.at(-1) !== '') lines.push('')
    lines.push('### 附件', '')
    attachments.forEach(item => lines.push(`- ${attachmentLabel(item)}`))
  }

  const conversationTitle = String(conversation?.title || '未命名对话').replace(/\s+/g, ' ').trim() || '未命名对话'
  const messageTime = formatExportMessageTime(message?.createdAt)
  if (lines.length && lines.at(-1) !== '') lines.push('')
  lines.push('---', '', `> 来源：Reviva 对话「${conversationTitle}」${messageTime ? ` · ${messageTime}` : ''}`)

  return `${lines.join('\n').trim()}\n`
}

export function sanitizeMessageMarkdownFileName(title, dateValue = new Date()) {
  const parts = localDateParts(dateValue)
  const safeTitle = String(title || 'Reviva-AI-回复')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 90) || 'Reviva-AI-回复'
  return `${safeTitle}-${parts.date}-${parts.time.replace(':', '')}.md`
}

function agentNameForMessage(message, agents) {
  if (message?.role !== 'assistant') return ''
  const agentId = message?.meta?.agentId
  return String(agents.find(agent => agent.id === agentId)?.name || 'AI').replace(/\s+/g, ' ').trim() || 'AI'
}

export function getMessageThinking(message) {
  const direct = typeof message?.thinkingContent === 'string' ? message.thinkingContent.trim() : ''
  if (direct) return direct
  return (message?.meta?.steps || [])
    .map(step => typeof step?.thinking === 'string' ? step.thinking.trim() : '')
    .filter(Boolean)
    .join('\n\n')
}

export function getMessageToolCalls(message) {
  const meta = message?.meta || {}
  const source = [
    ...(Array.isArray(meta.toolCalls) ? meta.toolCalls : []),
    ...(Array.isArray(meta.steps) ? meta.steps.flatMap(step => Array.isArray(step?.toolCalls) ? step.toolCalls : []) : []),
  ]
  const seen = new Set()
  return source.filter((toolCall) => {
    const key = toolCall?.id || `${toolCall?.name || 'tool'}:${String(toolCall?.input || '').slice(0, 160)}:${String(toolCall?.result || '').slice(0, 160)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function hasSkillFrontmatter(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '')
  return /---\s*(?:\\n|\r?\n)?\s*name:\s*[a-z0-9_-]+/i.test(text)
}

export function getMessageSubAgents(message) {
  return (Array.isArray(message?.meta?.subAgents) ? message.meta.subAgents : []).filter((subAgent) => {
    const internalId = subAgent?.name || subAgent?.id || subAgent?.subRunId
    return !(isUuidLike(internalId) && hasSkillFrontmatter(subAgent?.result || subAgent?.task))
  })
}

export function getMessageMetrics(message) {
  const items = [
    ['输入 Token', message?.inputTokens],
    ['输出 Token', message?.outputTokens],
    ['缓存读取 Token', message?.cacheReadTokens],
    ['缓存写入 Token', message?.cacheWriteTokens],
    ['思考 Token', message?.thinkingTokens],
  ].filter(([, value]) => Number(value || 0) > 0)
  if (Number(message?.latencyMs || 0) > 0) items.push(['耗时', `${(Number(message.latencyMs) / 1000).toFixed(2)} 秒`])
  if (Number(message?.cost || 0) > 0) items.push(['费用', `$${Number(message.cost).toFixed(4)}`])
  return items
}

function detailText(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
  }
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

function fencedBlock(value, language = 'text') {
  const text = detailText(value)
  if (!text) return ''
  const maxTicks = Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length))
  const fence = '`'.repeat(Math.max(3, maxTicks + 1))
  return `${fence}${language}\n${text}\n${fence}`
}

function toolStatusLabel(status) {
  if (status === 'completed') return '已完成'
  if (status === 'error') return '失败'
  if (status === 'running') return '执行中'
  return status || ''
}

function appendOptionalMessageSections(lines, message, options) {
  if (options.includeThinking) {
    const thinking = getMessageThinking(message)
    if (thinking) lines.push('### 思考过程', '', thinking, '')
  }

  if (options.includeToolCalls) {
    const toolCalls = getMessageToolCalls(message)
    if (toolCalls.length) {
      lines.push('### 工具调用详情', '')
      toolCalls.forEach((toolCall, index) => {
        const status = toolStatusLabel(toolCall?.status)
        lines.push(`#### ${index + 1}. ${toolCall?.name || '未命名工具'}${status ? ` · ${status}` : ''}`, '')
        const input = fencedBlock(toolCall?.input, 'json')
        const result = fencedBlock(toolCall?.result, 'text')
        const error = fencedBlock(toolCall?.error, 'text')
        if (input) lines.push('**输入**', '', input, '')
        if (result) lines.push('**结果**', '', result, '')
        if (error) lines.push('**错误**', '', error, '')
      })
    }
  }

  if (options.includeSubAgents) {
    const subAgents = getMessageSubAgents(message)
    if (subAgents.length) {
      lines.push('### 子智能体结果', '')
      subAgents.forEach((subAgent, index) => {
        lines.push(`#### ${index + 1}. ${subAgent?.name || '子智能体'}${subAgent?.status ? ` · ${toolStatusLabel(subAgent.status)}` : ''}`, '')
        if (subAgent?.task) lines.push('**任务**', '', detailText(subAgent.task).trim(), '')
        if (subAgent?.result) lines.push('**结果**', '', detailText(subAgent.result).trim(), '')
        if (subAgent?.error) lines.push('**错误**', '', detailText(subAgent.error).trim(), '')
      })
    }
  }

  if (options.includeMetrics) {
    const metrics = getMessageMetrics(message)
    if (metrics.length) {
      lines.push('### Token 与耗时', '')
      metrics.forEach(([label, value]) => lines.push(`- ${label}：${value}`))
      lines.push('')
    }
  }
}

export function buildConversationMarkdown({ conversation, messages, agents = [], exportedAt = new Date(), options = {} }) {
  const selected = (messages || []).filter(message => isMessageExportable(message, options))
  const title = String(conversation?.title || 'Reviva 对话').replace(/\s+/g, ' ').trim() || 'Reviva 对话'
  const exportedDate = validDate(exportedAt) || new Date()
  const exportedParts = localDateParts(exportedDate)
  const lines = [
    '---',
    `title: ${yamlString(title)}`,
    `exported_at: ${exportedDate.toISOString()}`,
    `message_count: ${selected.length}`,
    'source: Reviva',
    '---',
    '',
    `# ${title}`,
    '',
    `> 从 Reviva 导出 · ${exportedParts.date} ${exportedParts.time}`,
  ]

  selected.forEach((message, index) => {
    const roleLabel = message.role === 'user' ? '用户' : `AI · ${agentNameForMessage(message, agents)}`
    const time = formatExportMessageTime(message.createdAt)
    const content = sanitizeMessageMarkdownForExport(resolveExportableContent(message))
    const attachments = getMessageAttachments(message)
    lines.push('', '---', '', `## ${roleLabel}${time ? ` · ${time}` : ''}`, '')
    if (content) lines.push(content, '')
    if (attachments.length) {
      lines.push('### 附件', '')
      attachments.forEach(item => lines.push(`- ${attachmentLabel(item)}`))
      lines.push('')
    }
    appendOptionalMessageSections(lines, message, options)
    if (index < selected.length - 1 && lines.at(-1) !== '') lines.push('')
  })

  return `${lines.join('\n').trim()}\n`
}

export function sanitizeMarkdownFileName(title, dateValue = new Date()) {
  const date = localDateParts(dateValue).date
  const safeTitle = String(title || 'Reviva-对话')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100) || 'Reviva-对话'
  return `${safeTitle}-${date}.md`
}
