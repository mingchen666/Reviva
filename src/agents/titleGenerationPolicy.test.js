import test from 'node:test'
import assert from 'node:assert/strict'
import { isSuccessfulTitleCompletion, selectTitleSourceMessages } from './titleGenerationPolicy.js'

test('isSuccessfulTitleCompletion accepts only completed non-empty replies', () => {
  assert.equal(isSuccessfulTitleCompletion('completed', '回答'), true)
  assert.equal(isSuccessfulTitleCompletion('completed', '  '), false)
  assert.equal(isSuccessfulTitleCompletion('cancelled', '部分回答'), false)
  assert.equal(isSuccessfulTitleCompletion('error', '部分回答'), false)
})

test('selectTitleSourceMessages uses the first user and first successful assistant reply', () => {
  const messages = [
    { id: 'u1', role: 'user', content: '第一个问题', status: 'completed' },
    { id: 'a1', role: 'assistant', content: '中断回答', status: 'cancelled' },
    { id: 'u2', role: 'user', content: '第二个问题', status: 'completed' },
    { id: 'a2', role: 'assistant', content: '第一个成功回答', status: 'completed' },
    { id: 'a3', role: 'assistant', content: '后续回答', status: 'completed' },
  ]

  assert.deepEqual(selectTitleSourceMessages(messages), {
    userMessage: messages[0],
    assistantMessage: messages[3],
  })
})

test('selectTitleSourceMessages rejects empty, pending, cancelled, and failed replies', () => {
  const messages = [
    { role: 'user', content: '问题', status: 'completed' },
    { role: 'assistant', content: '', status: 'completed' },
    { role: 'assistant', content: '等待中', status: 'pending' },
    { role: 'assistant', content: '已取消', status: 'cancelled' },
    { role: 'assistant', content: '失败内容', status: 'error' },
  ]

  assert.equal(selectTitleSourceMessages(messages), null)
})
