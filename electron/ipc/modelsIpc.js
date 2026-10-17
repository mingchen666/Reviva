export function registerModelsIpc(ipcMain) {

  const MODEL_INFO = {
    'claude-opus-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 540, costCacheRead: 10.8, costCacheWrite: 135 },
    'claude-4-7-opus': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 540, costCacheRead: 10.8, costCacheWrite: 135 },
    'claude-sonnet-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 21.6, costOutput: 108, costCacheRead: 2.16, costCacheWrite: 27 },
    'claude-4-6-sonnet': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 21.6, costOutput: 108, costCacheRead: 2.16, costCacheWrite: 27 },
    'claude-haiku-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 5.76, costOutput: 28.8, costCacheRead: 0.576, costCacheWrite: 7.2 },
    'claude-4-5-haiku': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 5.76, costOutput: 28.8, costCacheRead: 0.576, costCacheWrite: 7.2 },
    'gpt-4o': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 18, costOutput: 72, costCacheRead: 1.8, costCacheWrite: 9 },
    'gpt-4o-mini': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 1.08, costOutput: 4.32, costCacheRead: 0.108, costCacheWrite: 0.54 },
    'o1': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 432, costCacheRead: 0, costCacheWrite: 0 },
    'o3-mini': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '100k', costInput: 10.8, costOutput: 43.2, costCacheRead: 1.08, costCacheWrite: 5.4 },
    'text-embedding-3-large': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '8k', costInput: 0.94, costOutput: 0.94, costCacheRead: 0, costCacheWrite: 0 },
    'text-embedding-3-small': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '8k', costInput: 0.14, costOutput: 0.14, costCacheRead: 0, costCacheWrite: 0 },
    'deepseek-chat': { capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 1, costOutput: 2, costCacheRead: 0.1, costCacheWrite: 0.5 },
    'deepseek-reasoner': { capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 4, costOutput: 16, costCacheRead: 0.4, costCacheWrite: 2 },
    'gemini-2.0-flash': { capabilities: { tool_calling: true, vision: true, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
    'gemini-2.0-pro': { capabilities: { tool_calling: true, vision: true, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
    'qwen-max': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 20, costOutput: 60, costCacheRead: 2, costCacheWrite: 10 },
    'qwen-plus': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 4, costOutput: 12, costCacheRead: 0.4, costCacheWrite: 2 },
    'text-embedding-v3': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '?', costInput: 0.7, costOutput: 0.7, costCacheRead: 0, costCacheWrite: 0 },
    'command-r-plus': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: true }, maxOutput: '4k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
    'rerank-v3': { capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: true }, maxOutput: '?', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
  }

  const DEFAULT_MODEL_INFO = { capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: false }, maxOutput: '?', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 }

  function normalizeApiFormat(providerId, apiFormat = '') {
    const value = String(apiFormat || '').trim().toLowerCase()
    if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) return 'openai_responses'
    if (value === 'anthropic') return 'anthropic'
    if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) return 'openai'
    return String(providerId || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
  }

  function isAnthropicFormat(providerId, apiFormat) {
    return normalizeApiFormat(providerId, apiFormat) === 'anthropic'
  }

  function readOpenAITranslationText(data) {
    return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || ''
  }

  function readOpenAIResponsesText(data) {
    if (typeof data?.output_text === 'string') return data.output_text
    if (!Array.isArray(data?.output)) return ''
    return data.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'output_text' || part?.type === 'text') return part.text || ''
        return part?.text || ''
      })
      .join('')
  }

  function readAnthropicTranslationText(data) {
    const content = data?.content
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text') return part.text || ''
        return part?.text || ''
      })
      .join('')
  }

  function stringifyTranslationContent(content) {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return ''
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' || part?.type === 'output_text') return part.text || ''
        return part?.text || ''
      })
      .join('')
  }

  function readOpenAITranslationDelta(data) {
    if (!Array.isArray(data?.choices)) return ''
    return data.choices
      .map((choice) => stringifyTranslationContent(choice?.delta?.content) || choice?.text || '')
      .join('')
  }

  function readOpenAIResponsesTranslationDelta(eventName, data) {
    if (typeof data?.delta === 'string' && (eventName === 'response.output_text.delta' || data?.type === 'response.output_text.delta')) {
      return data.delta
    }
    if (typeof data?.delta?.text === 'string') return data.delta.text
    return readOpenAITranslationDelta(data)
  }

  function readAnthropicTranslationDelta(data) {
    if (typeof data?.delta?.text === 'string') return data.delta.text
    if (typeof data?.completion === 'string') return data.completion
    return ''
  }

  function parseSSEFrame(frame) {
    let eventName = 'message'
    const dataLines = []
    for (const line of String(frame || '').split('\n')) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || eventName
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (dataLines.length === 0) return null
    return { eventName, dataText: dataLines.join('\n') }
  }

  function readTranslationStreamDelta(normalizedFormat, eventName, data) {
    if (normalizedFormat === 'anthropic') return readAnthropicTranslationDelta(data)
    if (normalizedFormat === 'openai_responses') return readOpenAIResponsesTranslationDelta(eventName, data)
    return readOpenAITranslationDelta(data)
  }

  function readTranslationCompletedText(normalizedFormat, data) {
    if (normalizedFormat === 'anthropic') return readAnthropicTranslationText(data?.message || data)
    if (normalizedFormat === 'openai_responses') return readOpenAIResponsesText(data?.response || data)
    return readOpenAITranslationText(data)
  }

  async function readTranslationSSE(response, normalizedFormat, sender, requestId) {
    const reader = response.body?.getReader?.()
    if (!reader) return ''

    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    let completedText = ''

    const processFrame = (frame) => {
      const parsedFrame = parseSSEFrame(frame)
      if (!parsedFrame) return
      const { eventName, dataText } = parsedFrame
      if (!dataText || dataText === '[DONE]') return

      let data
      try {
        data = JSON.parse(dataText)
      } catch (_) {
        return
      }

      const delta = readTranslationStreamDelta(normalizedFormat, eventName, data)
      if (delta) {
        fullText += delta
        if (requestId) sender?.send('translate:chunk', { requestId, text: delta })
      }

      if (
        eventName === 'response.completed' ||
        data?.type === 'response.completed' ||
        eventName === 'message_stop' ||
        data?.type === 'message_stop'
      ) {
        const finalText = readTranslationCompletedText(normalizedFormat, data)
        if (finalText) completedText = finalText
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        processFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }

      if (done) break
    }

    if (buffer.trim()) processFrame(buffer)
    return completedText || fullText
  }

  ipcMain.handle('models:fetchList', async (event, providerId, apiKey, baseUrl, apiFormat = '') => {
    if (!apiKey) return { success: false, error: '缺少 API Key' }
    if (!baseUrl) return { success: false, error: '缺少 Base URL' }
    try {
      const base = baseUrl.replace(/\/$/, '')
      let url = base + '/models'
      const headers = { 'Content-Type': 'application/json' }
      if (isAnthropicFormat(providerId, apiFormat)) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
      const response = await fetch(url, { headers })
      if (!response.ok) {
        const text = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` }
      }
      const data = await response.json()
      const models = (data.data || data.models || data).map(m => {
        const id = m.id || m.name || m
        const info = MODEL_INFO[id] || DEFAULT_MODEL_INFO
        return { id, name: m.id || m.name || m, capabilities: info.capabilities, maxOutput: info.maxOutput, costInput: info.costInput, costOutput: info.costOutput, costCacheRead: info.costCacheRead, costCacheWrite: info.costCacheWrite }
      })
      return { success: true, models }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('translate:run', async (event, req = {}) => {
    const {
      requestId = '',
      providerId = '',
      apiFormat = '',
      apiKey = '',
      baseUrl = '',
      modelId = '',
      temperature = 0.1,
      system = '',
      userMessage = '',
    } = req || {}

    if (!baseUrl) return { success: false, error: '缺少 Base URL' }
    if (!modelId) return { success: false, error: '缺少模型 ID' }
    if (!apiKey) return { success: false, error: '缺少 API Key' }
    if (!userMessage) return { success: false, error: '缺少待翻译内容' }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    try {
      const base = String(baseUrl).replace(/\/$/, '')
      const temp = Number.isFinite(Number(temperature)) ? Math.min(1, Math.max(0, Number(temperature))) : 0.1
      const normalizedFormat = normalizeApiFormat(providerId, apiFormat)
      const headers = { 'Content-Type': 'application/json' }
      let url
      let body

      if (normalizedFormat === 'anthropic') {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        url = base + '/messages'
        body = JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          temperature: temp,
          system,
          stream: true,
          messages: [{ role: 'user', content: userMessage }],
        })
      } else if (normalizedFormat === 'openai_responses') {
        headers['Authorization'] = `Bearer ${apiKey}`
        url = base + '/responses'
        body = JSON.stringify({
          model: modelId,
          input: userMessage,
          ...(system ? { instructions: system } : {}),
          max_output_tokens: 4096,
          temperature: temp,
          stream: true,
        })
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
        url = base + '/chat/completions'
        body = JSON.stringify({
          model: modelId,
          max_tokens: 4096,
          temperature: temp,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMessage },
          ],
          stream: true,
        })
      }

      const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
      if (!response.ok) {
        const text = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 500)}` }
      }

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream')) {
        const text = await readTranslationSSE(response, normalizedFormat, event?.sender, requestId)
        return { success: true, text }
      }

      const data = await response.json()
      const text = normalizedFormat === 'anthropic'
        ? readAnthropicTranslationText(data)
        : normalizedFormat === 'openai_responses'
          ? readOpenAIResponsesText(data)
          : readOpenAITranslationText(data)
      return { success: true, text }
    } catch (err) {
      const message = err?.name === 'AbortError' ? '请求超时，请检查网络或模型服务' : err.message
      return { success: false, error: message }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('models:testConnection', async (_, providerId, apiKey, baseUrl, modelId, apiFormat = '') => {
    if (!modelId) return { success: false, error: '缺少模型 ID' }
    if (!baseUrl) return { success: false, error: '缺少 Base URL' }
    if (!apiKey) return { success: false, error: '缺少 API Key' }
    const startTime = Date.now()
    try {
      const base = baseUrl.replace(/\/$/, '')
      const normalizedFormat = normalizeApiFormat(providerId, apiFormat)
      const headers = { 'Content-Type': 'application/json' }
      let body, url

      if (normalizedFormat === 'anthropic') {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        url = base + '/messages'
        body = JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
      } else if (normalizedFormat === 'openai_responses') {
        headers['Authorization'] = `Bearer ${apiKey}`
        url = base + '/responses'
        body = JSON.stringify({ model: modelId, max_output_tokens: 5, input: 'hi' })
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
        url = base + '/chat/completions'
        body = JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
      }

      const response = await fetch(url, { method: 'POST', headers, body })
      const latencyMs = Date.now() - startTime
      if (!response.ok) {
        const text = await response.text()
        return { success: false, latencyMs, error: `HTTP ${response.status}: ${text.slice(0, 200)}` }
      }
      return { success: true, latencyMs }
    } catch (err) {
      const latencyMs = Date.now() - startTime
      return { success: false, latencyMs, error: err.message }
    }
  })
}
