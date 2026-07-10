import { ChatOpenAIResponses } from '@langchain/openai'

export function normalizeAnthropicApiUrl(baseUrl = '') {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) return undefined
  return clean.replace(/\/v1$/i, '')
}

function normalizeOutputTextPart(part) {
  if (!part || typeof part !== 'object') return part
  if (part.type !== 'output_text') return part
  return {
    ...part,
    text: typeof part.text === 'string' ? part.text : '',
    annotations: Array.isArray(part.annotations) ? part.annotations : [],
  }
}

function normalizeOutputItem(item) {
  if (!item || typeof item !== 'object') return item
  if (item.type !== 'message') return item
  return {
    ...item,
    content: Array.isArray(item.content)
      ? item.content.map(normalizeOutputTextPart)
      : [],
  }
}

function outputFromChatCompletionPayload(data) {
  const message = data?.choices?.[0]?.message
  if (!message || typeof message !== 'object') return null

  const output = []
  const content = typeof message.content === 'string' ? message.content : ''
  if (content) {
    output.push({
      type: 'message',
      id: data.id ? `msg_${data.id}` : undefined,
      role: 'assistant',
      content: [{ type: 'output_text', text: content, annotations: [] }],
    })
  }

  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (!call?.id || !call?.function?.name) continue
      output.push({
        type: 'function_call',
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments || '{}',
      })
    }
  }

  return output.length ? output : null
}

function normalizeResponsesPayload(data) {
  if (!data || typeof data !== 'object') return data

  let output = Array.isArray(data.output) ? data.output : null
  if (!output) {
    const chatOutput = outputFromChatCompletionPayload(data)
    if (chatOutput) output = chatOutput
  }
  if (!output && typeof data.output_text === 'string') {
    output = [{
      type: 'message',
      id: data.id ? `msg_${data.id}` : undefined,
      role: 'assistant',
      content: [{ type: 'output_text', text: data.output_text, annotations: [] }],
    }]
  }
  if (!output) {
    throw new Error('OpenAI Responses API returned a non-standard payload without output. Please choose OpenAI Chat format, or use a provider endpoint that fully supports /responses.')
  }

  return {
    ...data,
    output: output.map(normalizeOutputItem),
  }
}

async function* normalizeResponsesStream(stream) {
  for await (const event of stream) {
    if (event?.type === 'response.completed' && event?.response && typeof event.response === 'object') {
      yield { ...event, response: normalizeResponsesPayload(event.response) }
    } else {
      yield event
    }
  }
}

export class ChatOpenAIResponsesCompat extends ChatOpenAIResponses {
  async completionWithRetry(request, requestOptions) {
    const result = await super.completionWithRetry(request, requestOptions)
    if (request?.stream) return normalizeResponsesStream(result)
    return normalizeResponsesPayload(result)
  }
}
