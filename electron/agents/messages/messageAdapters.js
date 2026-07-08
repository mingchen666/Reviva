import fs from 'node:fs'
import path from 'node:path'
import { ToolMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

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
export const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024

export function tryParseJSON(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

export function normalizeTodos(payload) {
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

export function _dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function _timeStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function _toWorkspaceVirtualPath(absPath, workRoot) {
  if (!workRoot) return String(absPath || '').replace(/\\/g, '/')
  const rel = path.relative(workRoot, absPath).replace(/\\/g, '/')
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? '/' + rel : String(absPath || '').replace(/\\/g, '/')
}

export function _safeAttachmentName(name, fallback = 'attachment') {
  const parsed = path.parse(String(name || fallback))
  const base = (parsed.name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || fallback
  const ext = (parsed.ext || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').slice(0, 12)
  return base + ext
}

export function _uniqueDestPath(dir, name) {
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

export function _ctxAccessPath(item, workRoot) {
  if (item?.accessPath) return item.accessPath
  if (!item?.path) return ''
  return _toWorkspaceVirtualPath(item.path, workRoot)
}

export function _decodeImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  const mime = match[1].toLowerCase()
  const ext = IMAGE_EXT_BY_MIME[mime] || '.png'
  return { mime, ext, buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64') }
}

export function _ensureImageFilename(item, ext = '.png') {
  const original = String(item?.name || '').trim()
  const generic = !original || /^image(?:\s*\(\d+\))?\.(png|jpe?g|webp|gif|bmp)$/i.test(original)
  if (!generic) return _safeAttachmentName(original)
  return _safeAttachmentName(`pasted_image_${_timeStamp()}_${Math.random().toString(36).slice(2, 6)}${ext}`)
}

export function _isImageContextItem(item) {
  if (typeof item?.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) return true
  if (!item?.path && !item?.name) return false
  if (item.type === 'image') return true
  return IMAGE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

export function _isOfficeContextItem(item) {
  if (!item?.path && !item?.name) return false
  return OFFICE_FILE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

export function _isPdfContextItem(item) {
  if (!item?.path && !item?.name) return false
  return PDF_FILE_EXTS.has(path.extname(item.name || item.path || '').toLowerCase())
}

export function _appendTextContent(content, text) {
  if (Array.isArray(content)) return [...content, { type: 'text', text }]
  return String(content || '') + '\n\n' + text
}

export function _isUserMessage(message) {
  return message instanceof HumanMessage || message?.role === 'user' || message?.role === 'human'
}

export function _messageAttachments(message) {
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

export function _attachImagesToUserMessages(messages, { modelHasVision = false } = {}) {
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

export function toLangchainMessages(messages) {
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

export function toPlainMessages(messages) {
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

export function toDirectMessages(systemPrompt, messages) {
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
      if (!part || part.type === 'thinking' || part.type === 'reasoning') return ''
      if (part?.type === 'text') return part.text || ''
      return part?.text || ''
    }).join('')
  }
  return chunk.text || ''
}

export async function streamDirectModel(model, messages, signal, onChunk) {
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

export function enrichMessagesWithCtx(messages, ctxPaths, workRoot) {
  const MAX_INLINE_SIZE = 30 * 1024
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
      if (d.isImage) return `  📷 ${d.name} — 路径: ${d.virtualPath} (图片附件；需要理解图片内容时使用 vision_analyze，不要交给 document_read)`
      if (d.isOffice) return `  📄 ${d.name} — 路径: ${d.virtualPath} (Office 文档；先用 document_read(path="${d.virtualPath}", mode="overview") 读取结构，禁止用 read_file/file_read 直接读取)`
      if (d.isPdf) return `  📄 ${d.name} — 路径: ${d.virtualPath} (PDF 文档；先用 document_read(path="${d.virtualPath}", mode="overview") 读取概览，禁止用 read_file/file_read 直接读取)`
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
