// electron/agents/ContextCompressor.js — Context compression using LangChain ChatModel
// DeepAgents handles auto-summarization internally, but this module
// provides manual compression for the renderer's compress-context request

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const SUMMARIZE_PROMPT = `请将以下对话历史压缩为一段简洁的摘要，保留：
1. 讨论的主要话题和结论
2. 已做出的重要决策
3. 用户的关键偏好和要求
4. 未解决或待跟进的问题

用中文输出，不超过500字。`

export class ContextCompressor {
  /**
   * Generate a conversation summary using the LLM
   * @param {object} opts - { messages, providerId, apiFormat, apiKey, baseUrl, model }
   * @returns {Promise<string>}
   */
  async generateSummary(opts) {
    const { messages, providerId, apiFormat, apiKey, baseUrl, model } = opts
    if (!messages?.length) return ''

    const formatted = this._formatMessages(messages)
    const summarizeMessages = [
      new SystemMessage('你是一个对话摘要助手。'),
      new HumanMessage(`${SUMMARIZE_PROMPT}\n\n---\n\n${formatted}`),
    ]

    // Create model instance
    let chatModel
    if ((apiFormat || '').toLowerCase() === 'anthropic' || (providerId || '').toLowerCase() === 'anthropic') {
      const anthropicBaseURL = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '') || undefined
      chatModel = new ChatAnthropic({ apiKey, model, baseURL: anthropicBaseURL, temperature: 0.3, maxTokens: 1024 })
    } else {
      chatModel = new ChatOpenAI({ apiKey, model, baseURL: baseUrl || undefined, temperature: 0.3, maxTokens: 1024 })
    }

    try {
      const result = await chatModel.invoke(summarizeMessages)
      return result.content || ''
    } catch (e) {
      console.error('[ContextCompressor] generateSummary error:', e)
      return ''
    }
  }

  _formatMessages(messages) {
    return messages
      .map(m => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role
        const content = typeof m.content === 'string' ? m.content.slice(0, 500) : ''
        return `[${role}]: ${content}`
      })
      .join('\n\n')
      .slice(0, 15000)
  }
}
