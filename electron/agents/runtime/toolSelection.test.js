import assert from 'node:assert/strict'
import test from 'node:test'

import { withContextualAgentTools, withDefaultAgentTools, withPermissionAgentTools } from './toolSelection.js'

test('system tools are injected without explicit agent bindings', () => {
  const tools = withDefaultAgentTools([])

  assert.ok(tools.includes('document_read'))
  assert.ok(tools.includes('media_read'))
  assert.ok(!tools.includes('vision_analyze'))
})

test('vision tool is injected only when a vision model is available', () => {
  assert.ok(withContextualAgentTools([], {}, { visionAvailable: true }).includes('vision_analyze'))
  assert.ok(!withContextualAgentTools(['vision_analyze'], {}, { visionAvailable: false }).includes('vision_analyze'))
})

test('note permissions automatically bind note_tool', () => {
  assert.ok(withPermissionAgentTools([], { noteRead: true }).includes('note_tool'))
  assert.ok(withPermissionAgentTools([], { noteWrite: true }).includes('note_tool'))
  assert.ok(!withPermissionAgentTools([], {}).includes('note_tool'))
})
