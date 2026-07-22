// electron/agents/TitleGenerator.js — Auto-generate conversation title using LLM
// Called from AgentService via IPC so model requests stay in the main process.

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAICompletions } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAIResponsesCompat, normalizeAnthropicApiUrl } from './runtime/modelAdapters.js'

const TITLE_MAX_TOKENS = 256
const TITLE_RETRY_MAX_TOKENS = 1024

function normalizeApiFormat(providerId, apiFormat = '') {
  const value = String(apiFormat || '').trim().toLowerCase()
  if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) return 'openai_responses'
  if (value === 'anthropic') return 'anthropic'
  if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) return 'openai'
  return String(providerId || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
}

export function extractMessageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(part => {
    if (typeof part === 'string') return part
    if (!part || part.type === 'thinking' || part.type === 'reasoning') return ''
    return part.text || ''
  }).join('')
}

export function isLengthTruncated(message) {
  const reason = message?.response_metadata?.finish_reason
    || message?.response_metadata?.finishReason
    || message?.additional_kwargs?.finish_reason
  return String(reason || '').toLowerCase() === 'length'
}

export function cleanTitle(value) {
  return String(value || '').trim().replace(/["“”。！？,.!?]/g, '').slice(0, 15)
}

function createChatModel({ providerId, apiFormat, apiKey, baseUrl, model, maxTokens }) {
  const normalizedApiFormat = normalizeApiFormat(providerId, apiFormat)
  if (normalizedApiFormat === 'anthropic') {
    const anthropicApiUrl = normalizeAnthropicApiUrl(baseUrl)
    return new ChatAnthropic({ apiKey, model, anthropicApiUrl, temperature: 0.3, maxTokens })
  }

  const openaiOpts = { apiKey, model, temperature: 0.3, maxTokens }
  if (baseUrl) openaiOpts.configuration = { baseURL: baseUrl }
  const ChatModel = normalizedApiFormat === 'openai_responses' ? ChatOpenAIResponsesCompat : ChatOpenAICompletions
  return new ChatModel(openaiOpts)
}

export class TitleGenerator {
  constructor({ createModel = createChatModel } = {}) {
    this._createModel = createModel
  }

  async generate(opts) {
    const { userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model } = opts
    if (!userMessage && !assistantContent) return ''

    const prompt = `根据以下对话，生成2到15个字的中文标题（不要标点、不要引号、不要解释，只输出标题）:\n用户: ${(userMessage || '').slice(0, 200)}\n助手: ${(assistantContent || '').slice(0, 300)}`

    try {
      const invoke = async maxTokens => {
        const chatModel = this._createModel({ providerId, apiFormat, apiKey, baseUrl, model, maxTokens })
        return chatModel.invoke([new HumanMessage(prompt)])
      }

      let result = await invoke(TITLE_MAX_TOKENS)
      let title = cleanTitle(extractMessageText(result))
      if (!title && isLengthTruncated(result)) {
        console.warn(`[TitleGenerator] empty title after length limit; retrying with ${TITLE_RETRY_MAX_TOKENS} tokens`)
        result = await invoke(TITLE_RETRY_MAX_TOKENS)
        title = cleanTitle(extractMessageText(result))
      }
      if (!title) {
        const reason = result?.response_metadata?.finish_reason || result?.response_metadata?.finishReason || 'unknown'
        console.warn(`[TitleGenerator] empty title response (finishReason=${reason})`)
      }
      return title
    } catch (e) {
      console.error('[TitleGenerator] error:', e.message)
      return ''
    }
  }
}
