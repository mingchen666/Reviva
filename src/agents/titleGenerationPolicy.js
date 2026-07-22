export function isSuccessfulTitleCompletion(status, content) {
  return status === 'completed' && Boolean(String(content || '').trim())
}

export function selectTitleSourceMessages(messages = []) {
  const userMessage = messages.find(message =>
    message?.role === 'user' && String(message.content || '').trim(),
  )
  const assistantMessage = messages.find(message =>
    message?.role === 'assistant'
    && (message.status === 'completed' || !message.status)
    && String(message.content || '').trim(),
  )
  return userMessage && assistantMessage ? { userMessage, assistantMessage } : null
}
