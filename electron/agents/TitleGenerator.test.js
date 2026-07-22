import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTitle, extractMessageText, isLengthTruncated, TitleGenerator } from './TitleGenerator.js'

test('extractMessageText ignores reasoning blocks and joins visible text', () => {
  assert.equal(extractMessageText({
    content: [
      { type: 'reasoning', text: 'internal' },
      { type: 'text', text: '标题' },
      '生成',
    ],
  }), '标题生成')
})

test('isLengthTruncated recognizes length-limited model responses', () => {
  assert.equal(isLengthTruncated({ response_metadata: { finish_reason: 'length' } }), true)
  assert.equal(isLengthTruncated({ response_metadata: { finish_reason: 'stop' } }), false)
  assert.equal(isLengthTruncated({ additional_kwargs: { finish_reason: 'length' } }), true)
})

test('cleanTitle removes punctuation and enforces the title limit', () => {
  assert.equal(cleanTitle('“这是一个标题。”'), '这是一个标题')
  assert.equal(cleanTitle('一二三四五六七八九十一二三四五六七'), '一二三四五六七八九十一二三四五')
})

test('TitleGenerator uses the normal token budget for a visible title', async () => {
  const budgets = []
  const generator = new TitleGenerator({
    createModel: ({ maxTokens }) => ({
      invoke: async () => {
        budgets.push(maxTokens)
        return { content: '正常标题', response_metadata: { finish_reason: 'stop' } }
      },
    }),
  })

  assert.equal(await generator.generate({ userMessage: '问题', assistantContent: '回答' }), '正常标题')
  assert.deepEqual(budgets, [256])
})

test('TitleGenerator retries a length-truncated empty response with a larger budget', async () => {
  const budgets = []
  const responses = [
    { content: '', response_metadata: { finish_reason: 'length' }, additional_kwargs: { reasoning_content: '推理内容' } },
    { content: '重试标题', response_metadata: { finish_reason: 'stop' } },
  ]
  const generator = new TitleGenerator({
    createModel: ({ maxTokens }) => ({
      invoke: async () => {
        budgets.push(maxTokens)
        return responses.shift()
      },
    }),
  })

  assert.equal(await generator.generate({ userMessage: '问题', assistantContent: '回答' }), '重试标题')
  assert.deepEqual(budgets, [256, 1024])
})

test('TitleGenerator leaves a non-truncated empty response for a later conversation retry', async () => {
  const budgets = []
  const generator = new TitleGenerator({
    createModel: ({ maxTokens }) => ({
      invoke: async () => {
        budgets.push(maxTokens)
        return { content: '', response_metadata: { finish_reason: 'stop' } }
      },
    }),
  })

  assert.equal(await generator.generate({ userMessage: '问题', assistantContent: '回答' }), '')
  assert.deepEqual(budgets, [256])
})
