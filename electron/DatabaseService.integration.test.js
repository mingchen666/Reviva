import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from './DatabaseService.js'
import { getDatabaseDriver } from './db/DatabaseContext.js'

const LEGACY_PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    desc: '深度求索',
    region: '国内',
    iconName: 'deepseek',
    logoBg: '#4D6BFE',
    logoChar: 'D',
    builtin: true,
    local: false,
    apiFormat: 'openai',
    apiKeyOptional: false,
    enabled: true,
    configured: true,
    apiKey: 'legacy-deepseek-key',
    apiKeyId: '',
    baseUrl: 'https://api.deepseek.com/v1',
    customProviderField: { preserved: true },
    models: [
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        ctx: '1000k',
        maxOutput: '384k',
        tier: 'flagship',
        enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 1,
        costOutput: 2,
        costCacheRead: 0.02,
        costCacheWrite: 0.02,
        addedBy: 'default',
        customModelField: ['preserved'],
      },
    ],
  },
  {
    id: 'custom',
    name: 'Ollama',
    desc: '本地模型',
    region: '本地',
    iconName: 'ollama',
    logoBg: '#111827',
    logoChar: 'O',
    builtin: true,
    local: true,
    apiFormat: 'openai',
    apiKeyOptional: false,
    enabled: true,
    configured: true,
    apiKey: 'ollama',
    apiKeyId: '',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      {
        id: 'qwen2.5:7b',
        name: 'Qwen2.5 7B',
        ctx: '128k',
        maxOutput: '8k',
        tier: 'balanced',
        enabled: true,
        capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false },
        costInput: 0,
        costOutput: 0,
        costCacheRead: 0,
        costCacheWrite: 0,
        addedBy: 'user',
      },
    ],
  },
]

const LEGACY_DEFAULT_MODELS = {
  chat: 'deepseek::deepseek-v4-flash',
  agent: 'deepseek::deepseek-v4-flash',
  title: 'deepseek::deepseek-v4-flash',
}

const LEGACY_STT_SETTINGS = {
  version: 2,
  defaultProviderId: 'aliyun_bailian_asr',
  providers: {
    local_asr: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:8000/v1',
      apiKey: '',
      model: 'whisper-1',
      timestampLevel: 'segment',
    },
    aliyun_bailian_asr: {
      enabled: true,
      apiKey: 'legacy-stt-key',
      workspaceId: 'workspace-test',
      region: 'cn-beijing',
      model: 'fun-asr',
      language: 'auto',
      enableTimestamps: true,
      enableDiarization: false,
    },
  },
}

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

test('legacy LLM providers migrate without changing provider, model, key, or default model data', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-provider-migration-'))
  const dbPath = path.join(root, 'legacy.db')
  const BetterSqlite3 = getDatabaseDriver()
  const legacyDb = new BetterSqlite3(dbPath)
  legacyDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT DEFAULT \'\')')
  legacyDb.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('providers', JSON.stringify(LEGACY_PROVIDERS))
  legacyDb.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('defaultModels', JSON.stringify(LEGACY_DEFAULT_MODELS))
  legacyDb.close()

  const service = new DatabaseService()
  try {
    service.init(dbPath)
    assert.deepEqual(service.getSetting('providers'), LEGACY_PROVIDERS)
    assert.deepEqual(service.getSetting('defaultModels'), LEGACY_DEFAULT_MODELS)
    assert.deepEqual(service.getAllSettings().providers, LEGACY_PROVIDERS)

    const providerRows = service.db.prepare('SELECT id FROM llm_provider_profiles ORDER BY sort_order').all()
    const modelRows = service.db.prepare('SELECT provider_id, model_id FROM llm_model_profiles ORDER BY provider_id, sort_order').all()
    assert.deepEqual(providerRows.map(row => row.id), ['deepseek', 'custom'])
    assert.deepEqual(modelRows, [
      { provider_id: 'custom', model_id: 'qwen2.5:7b' },
      { provider_id: 'deepseek', model_id: 'deepseek-v4-flash' },
    ])
    assert.ok(service.db.prepare('SELECT 1 FROM schema_migrations WHERE version = 7').get())
    assert.deepEqual(JSON.parse(service.db.prepare("SELECT value FROM settings WHERE key = 'providers'").get().value), LEGACY_PROVIDERS)
    assert.ok(service.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tts_provider_profiles'").get())
  } finally {
    service.close()
  }

  const reopened = new DatabaseService()
  try {
    reopened.init(dbPath)
    assert.deepEqual(reopened.getSetting('providers'), LEGACY_PROVIDERS)
    assert.deepEqual(reopened.getSetting('defaultModels'), LEGACY_DEFAULT_MODELS)
  } finally {
    reopened.close()
    await fs.promises.rm(root, { recursive: true, force: true })
  }
})

test('LLM provider compatibility CRUD and settings import persist through the existing settings API', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reviva-provider-crud-'))
  const dbPath = path.join(root, 'providers.db')
  const service = new DatabaseService()
  try {
    service.init(dbPath)
    service.setSetting('defaultModels', LEGACY_DEFAULT_MODELS)
    assert.deepEqual(service.setSetting('providers', JSON.stringify(LEGACY_PROVIDERS)), { success: true })
    assert.deepEqual(service.getSetting('providers'), LEGACY_PROVIDERS)

    const edited = structuredClone(LEGACY_PROVIDERS)
    edited[0].baseUrl = 'https://proxy.example.com/v1'
    edited[0].apiKey = 'updated-key'
    edited[0].models[0].enabled = false
    edited[0].models.push({
      id: 'deepseek-custom',
      name: 'DeepSeek Custom',
      enabled: true,
      capabilities: { tool_calling: true, vision: true },
      addedBy: 'user',
    })
    edited[1].models.splice(0, 1)

    service.setSetting('providers', edited)
    assert.deepEqual(service.getSetting('providers'), edited)
    assert.deepEqual(service.getSetting('defaultModels'), LEGACY_DEFAULT_MODELS)

    service.importSettings({ providers: LEGACY_PROVIDERS, importedFlag: true })
    assert.deepEqual(service.getSetting('providers'), LEGACY_PROVIDERS)
    assert.equal(service.getSetting('importedFlag'), true)
    assert.deepEqual(JSON.parse(service.db.prepare("SELECT value FROM settings WHERE key = 'providers'").get().value), LEGACY_PROVIDERS)

    const duplicateProviders = structuredClone(LEGACY_PROVIDERS)
    duplicateProviders.push(structuredClone(duplicateProviders[0]))
    assert.throws(
      () => service.importSettings({ importedFlag: false, providers: duplicateProviders }),
      /重复服务商 ID/,
    )
    assert.equal(service.getSetting('importedFlag'), true)
    assert.deepEqual(service.getSetting('providers'), LEGACY_PROVIDERS)

    const sparseLegacyProvider = [{
      id: 'anthropic',
      apiKey: 'legacy-anthropic-key',
      baseUrl: 'https://api.anthropic.com/v1',
      models: [{ id: 'claude-legacy' }],
    }]
    service.setSetting('providers', sparseLegacyProvider)
    assert.deepEqual(service.getSetting('providers'), sparseLegacyProvider)
    service.setSetting('mediaSpeechSettings', LEGACY_STT_SETTINGS)
    assert.deepEqual(service.getSetting('mediaSpeechSettings'), LEGACY_STT_SETTINGS)
  } finally {
    service.close()
  }

  const reopened = new DatabaseService()
  try {
    reopened.init(dbPath)
    assert.deepEqual(reopened.getSetting('providers'), [{
      id: 'anthropic',
      apiKey: 'legacy-anthropic-key',
      baseUrl: 'https://api.anthropic.com/v1',
      models: [{ id: 'claude-legacy' }],
    }])
    assert.deepEqual(reopened.getSetting('defaultModels'), LEGACY_DEFAULT_MODELS)
    assert.equal(reopened.getSetting('importedFlag'), true)
    assert.deepEqual(reopened.getSetting('mediaSpeechSettings'), LEGACY_STT_SETTINGS)
    assert.equal(reopened.getSetting('mediaSpeechDefaultProviderId'), 'aliyun_bailian_asr')
    assert.equal(reopened.getSetting('defaultSttModelRef'), 'aliyun_bailian_asr::fun-asr')
  } finally {
    reopened.close()
    await fs.promises.rm(root, { recursive: true, force: true })
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
