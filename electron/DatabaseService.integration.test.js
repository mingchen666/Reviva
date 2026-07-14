import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from './DatabaseService.js'

test('DatabaseService facade preserves representative domain behavior', () => {
  const service = new DatabaseService()
  try {
    service.init(':memory:')
    const space = service.createSpace({ id: 'space_contract', name: 'Contract' })
    assert.equal(service.getSpace(space.id).name, 'Contract')

    const agent = service.createAgent({
      id: 'agent_contract',
      name: 'Contract Agent',
      english_name: 'contract-agent',
      tools: [],
      skills: [],
      sub_agents: [],
    })
    assert.equal(service.getAgent(agent.id).english_name, 'contract-agent')

    const skill = service.createSkill({ id: 'skill_contract', name: 'Contract Skill', enabled: true })
    assert.equal(service.listSkills().some(item => item.id === skill.id), true)

    const conversation = service.createConv({ id: 'conv_contract', title: 'Contract Conversation' })
    service.createMsg({ id: 'msg_contract_user', conversation_id: conversation.id, role: 'user', content: 'question' })
    service.createMsg({ id: 'msg_contract_assistant', conversation_id: conversation.id, role: 'assistant', content: 'answer', status: 'completed' })
    const branch = service.createConversationBranch({
      sourceConversationId: conversation.id,
      sourceMessageId: 'msg_contract_assistant',
    })
    assert.equal(branch.messageCount, 2)

    const task = service.createTask({ id: 'task_contract', name: 'Contract Task', params: { mode: 'test' } })
    assert.equal(service.getTask(task.id).params.mode, 'test')
    const artifact = service.createArtifact({ id: 'artifact_contract', title: 'Contract Artifact' })
    assert.equal(service.getArtifact(artifact.id).title, 'Contract Artifact')

    const noteFolder = service.createNoteFolder({ id: 'folder_contract', name: 'Contract Folder' })
    const note = service.createNote({ id: 'note_contract', folder_id: noteFolder.id, title: 'Contract Note' })
    assert.equal(service.getNote(note.id).title, 'Contract Note')

    service.createTrashItem({ id: 'trash_contract', original_name: 'contract.txt' })
    assert.equal(service.trashItemCount(), 1)

    service.createTokenUsage({ id: 'usage_contract', provider_id: 'test', model_id: 'test', input_tokens: 3 })
    assert.equal(service.listTokenUsage({ provider_id: 'test' }).length, 1)

    service.setSetting('contract_value', { enabled: true })
    assert.deepEqual(service.getSetting('contract_value'), { enabled: true })
  } finally {
    service.close()
  }
})

test('DatabaseContext follows workspace relocation', async () => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-db-contract-'))
  const service = new DatabaseService()
  try {
    service.init(':memory:')
    assert.equal(await service.relocateToWorkspace(workspaceRoot), true)
    service.createMemory({ id: 'memory_after_relocation', content: 'relocated' })
    assert.equal(service.listMemories().some(item => item.id === 'memory_after_relocation'), true)
    assert.equal(fs.existsSync(DatabaseService.workspaceDbPath(workspaceRoot)), true)
  } finally {
    service.close()
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('built-in Agent synchronization preserves user overrides across template updates', () => {
  const service = new DatabaseService()
  try {
    service.init(':memory:')
    service.syncBuiltinAgentTemplate({
      id: 'agent_builtin_contract',
      name: 'Built-in Contract v1',
      english_name: 'builtin-contract',
      tools: ['official_tool_v1'],
      model: 'official-model-v1',
      builtin_version: '1.0.0',
    })
    service.updateAgent('agent_builtin_contract', {
      tools: ['official_tool_v1', 'user_tool'],
      model: 'user-model',
    })

    const updated = service.syncBuiltinAgentTemplate({
      id: 'agent_builtin_contract',
      name: 'Built-in Contract v2',
      english_name: 'builtin-contract',
      tools: ['official_tool_v2'],
      model: 'official-model-v2',
      builtin_version: '2.0.0',
    })

    assert.equal(updated.name, 'Built-in Contract v2')
    assert.equal(updated.model, 'user-model')
    assert.deepEqual(updated.tools, ['official_tool_v2', 'user_tool'])
    assert.deepEqual(updated.userOverrides, {
      model: 'user-model',
      tools: { added: ['user_tool'] },
    })
  } finally {
    service.close()
  }
})
