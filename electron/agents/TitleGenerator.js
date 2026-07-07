// electron/agents/TitleGenerator.js — Auto-generate conversation title using LLM
// NOTE: Title generation is now done directly via fetch in AgentRuntime._autoGenerateTitle (renderer side).
// This file is kept for potential future use from main process.

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAICompletions, ChatOpenAIResponses } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'

function normalizeApiFormat(providerId, apiFormat = '') {
  const value = String(apiFormat || '').trim().toLowerCase()
  if (['openai_responses', 'openai-responses', 'openai_response', 'openai-response', 'responses', 'response'].includes(value)) return 'openai_responses'
  if (value === 'anthropic') return 'anthropic'
  if (['openai', 'openai_chat', 'openai-chat', 'chat', 'chat_completions', 'chat-completions'].includes(value)) return 'openai'
  return String(providerId || '').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai'
}

export class TitleGenerator {
  async generate(opts) {
    const { userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model } = opts
    if (!userMessage && !assistantContent) return ''

    const prompt = `根据以下对话，生成2到15个字的中文标题（不要标点、不要引号、不要解释，只输出标题）:\n用户: ${(userMessage || '').slice(0, 200)}\n助手: ${(assistantContent || '').slice(0, 300)}`

    let chatModel
    const normalizedApiFormat = normalizeApiFormat(providerId, apiFormat)
    if (normalizedApiFormat === 'anthropic') {
      const anthropicBaseURL = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '') || undefined
      chatModel = new ChatAnthropic({ apiKey, model, baseURL: anthropicBaseURL, temperature: 0.3, maxTokens: 50 })
    } else {
      const openaiOpts = { apiKey, model, temperature: 0.3, maxTokens: 50 }
      if (baseUrl) openaiOpts.configuration = { baseURL: baseUrl }
      const ChatModel = normalizedApiFormat === 'openai_responses' ? ChatOpenAIResponses : ChatOpenAICompletions
      chatModel = new ChatModel(openaiOpts)
    }

    try {
      const result = await chatModel.invoke([new HumanMessage(prompt)])
      return (result.content || '').trim().replace(/["""。！？,.!?]/g, '').slice(0, 15) || ''
    } catch (e) {
      console.error('[TitleGenerator] error:', e.message)
      return ''
    }
  }
}
