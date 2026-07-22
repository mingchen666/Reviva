import test from 'node:test'
import assert from 'node:assert/strict'
import {
  displayTextFromDocument,
  isStructuredInputDocument,
  normalizeInputDocument,
  resolvedTextFromDocument,
} from './chatInputDocument.js'

test('input document keeps visible labels and resolves frozen content separately', () => {
  const document = [
    { type: 'text', text: '请处理 ' },
    { type: 'quick-input', id: 'q1', label: '@润色', shortcutType: 'command', contentSnapshot: '请优化表达' },
    { type: 'text', text: ' ' },
    { type: 'skill', id: 'research', label: '/research', contentSnapshot: '/research' },
  ]
  assert.equal(displayTextFromDocument(document), '请处理 @润色 /research')
  assert.equal(resolvedTextFromDocument(document), '请处理 请优化表达 /research')
  assert.equal(isStructuredInputDocument(document), true)
})

test('invalid token segments are ignored and plain fallback remains compatible', () => {
  const normalized = normalizeInputDocument([{ type: 'unknown', label: '@x' }], '普通消息')
  assert.deepEqual(normalized, [{ type: 'text', text: '普通消息' }])
  assert.equal(isStructuredInputDocument(normalized), false)
})
