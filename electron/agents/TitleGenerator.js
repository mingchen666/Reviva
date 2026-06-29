// electron/agents/TitleGenerator.js — Auto-generate conversation title using LLM
// NOTE: Title generation is now done directly via fetch in AgentRuntime._autoGenerateTitle (renderer side).
// This file is kept for potential future use from main process.

import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'

export class TitleGenerator {
  async generate(opts) {
    const { userMessage, assistantContent, providerId, apiFormat, apiKey, baseUrl, model } = opts
    if (!userMessage && !assistantContent) return ''

    const prompt = `根据以下对话，生成2到15个字的中文标题（不要标点、不要引号、不要解释，只输出标题）:\n用户: ${(userMessage || '').slice(0, 200)}\n助手: ${(assistantContent || '').slice(0, 300)}`

    let chatModel
    if ((apiFormat || '').toLowerCase() === 'anthropic' || (providerId || '').toLowerCase() === 'anthropic') {
      const anthropicBaseURL = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '') || undefined
      chatModel = new ChatAnthropic({ apiKey, model, baseURL: anthropicBaseURL, temperature: 0.3, maxTokens: 50 })
    } else {
      chatModel = new ChatOpenAI({ apiKey, model, baseURL: baseUrl || undefined, temperature: 0.3, maxTokens: 50 })
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
