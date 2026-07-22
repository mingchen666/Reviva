import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const runtimeDir = path.dirname(fileURLToPath(import.meta.url))
const builtinDir = path.resolve(runtimeDir, '..', 'builtin')
const expectedAgents = [
  'chart-generator',
  'deep-researcher',
  'flashcard-generator',
  'graph-generator',
  'lab-report-assistant',
  'mindmap-generator',
  'ppt-generator',
  'quiz-generator',
]
const contentTools = ['document_read', 'media_read', 'vision_analyze']

test('all creation agents declare the shared content tools', () => {
  for (const agentName of expectedAgents) {
    const configPath = path.join(builtinDir, agentName, 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

    for (const toolId of contentTools) {
      assert.ok(config.tools.includes(toolId), `${agentName} must declare ${toolId}`)
    }
  }
})

test('deep researcher local analyst declares the shared content tools', () => {
  const configPath = path.join(builtinDir, 'deep-researcher', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const tools = config.subagent_tools?.['local-analyst'] || []

  for (const toolId of contentTools) {
    assert.ok(tools.includes(toolId), `deep-researcher local-analyst must declare ${toolId}`)
  }
})
