import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseService } from '../DatabaseService.js'
import { LearningMemoryService } from './LearningMemoryService.js'
import { createLearningProfileToolset } from './learning-profile-tools.js'

function createDb() {
  const service = new DatabaseService()
  service.init(':memory:')
  return service
}

function createRunMessages(db, {
  conversationId = 'conv_profile',
  userMessageId = 'user_profile',
  assistantMessageId = 'assistant_profile',
  userText = '请记住，我正在系统学习 Vue 状态管理。',
} = {}) {
  if (!db.getConv(conversationId)) db.createConv({ id: conversationId, title: 'profile test' })
  db.createMsg({ id: userMessageId, conversationId, role: 'user', content: userText })
  db.createMsg({ id: assistantMessageId, conversationId, role: 'assistant', content: '', status: 'streaming' })
  return {
    conversationId,
    userMessageId,
    assistantMessageId,
    agentId: 'agent_root',
    agentEnglishName: 'root-agent',
  }
}

function enableProfile(db, patch = {}) {
  return db.updateLearningMemorySettings({ enabled: true, allowConversationAnalysis: true, ...patch })
}

test('learning memory schema initializes with opt-in disabled', () => {
  const db = createDb()
  try {
    const names = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'learning_%' ORDER BY name").all().map(row => row.name)
    assert.deepEqual(names, [
      'learning_capability_states',
      'learning_concept_states',
      'learning_events',
      'learning_preferences',
      'learning_settings',
      'learning_tracks',
    ])
    assert.equal(db.getLearningMemorySettings().enabled, false)
    assert.deepEqual(
      db.db.prepare('PRAGMA table_info(learning_settings)').all().map(column => column.name),
      ['id', 'enabled', 'allow_conversation_analysis', 'created_at', 'updated_at'],
    )
    assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'learning_extraction_jobs'").get().count, 0)
    assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('learning_events') WHERE name LIKE 'extractor_%'").get().count, 0)
    assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 10 AND name = 'reset_learning_memory_agent_tool_schema'").get().count, 1)
  } finally {
    db.close()
  }
})

test('learning events remain idempotent and project goals and capabilities', () => {
  const db = createDb()
  try {
    const goal = {
      traceId: 'trace_goal_1', eventType: 'goal_declared', dimension: 'goal', sourceKind: 'user_explicit',
      targetKey: 'track_vue', targetLabel: 'Vue 状态管理重构', targetMeaning: '完成项目重构', confidence: 1,
    }
    const capability = {
      traceId: 'trace_cap_1', eventType: 'problem_solving_observed', dimension: 'capability', sourceKind: 'conversation_observed',
      targetKey: 'capability_stack_trace', targetLabel: '从报错堆栈定位问题', targetMeaning: '利用错误信息缩小故障范围',
      trackId: 'track_vue', context: { task_type: 'frontend_debugging' }, evidence: { independence: 'independent', outcome: 'resolved' }, confidence: 0.8,
    }
    assert.equal(db.insertLearningEvents([goal, capability]).length, 2)
    assert.equal(db.insertLearningEvents([goal, capability]).length, 0)
    const overview = db.getLearningMemoryOverview()
    assert.equal(overview.tracks.length, 1)
    assert.equal(overview.capabilities.length, 1)
    assert.equal(overview.capabilities[0].evidenceCount, 1)
  } finally {
    db.close()
  }
})

test('repeated capability gaps and incorrect explanations never promote mastery', () => {
  const db = createDb()
  try {
    db.insertLearningEvents(Array.from({ length: 5 }, (_, index) => ({
      traceId: `trace_gap_${index}`,
      eventType: 'capability_gap_observed',
      dimension: 'capability',
      sourceKind: 'conversation_observed',
      targetKey: 'capability_transaction_gap',
      targetLabel: '识别事务边界',
      targetMeaning: '在并发写入中识别事务边界',
      evidence: { independence: 'independent', outcome: 'incorrect' },
      confidence: 0.8,
    })))
    db.insertLearningEvents(Array.from({ length: 8 }, (_, index) => ({
      traceId: `trace_wrong_explanation_${index}`,
      eventType: 'explanation_attempt',
      dimension: 'concept',
      sourceKind: 'conversation_observed',
      targetKey: 'concept_transaction_isolation',
      targetLabel: '事务隔离级别',
      targetMeaning: '不同隔离级别对并发现象的约束',
      evidence: { independence: 'independent', outcome: 'incorrect' },
      confidence: 0.7,
    })))

    const overview = db.getLearningMemoryOverview()
    assert.equal(overview.capabilities[0].status, 'observed')
    assert.equal(overview.capabilities[0].evidenceSummary.demonstrated_count, 0)
    assert.equal(overview.capabilities[0].evidenceSummary.gap_count, 5)
    assert.equal(overview.concepts[0].status, 'learning')
    assert.equal(overview.concepts[0].state.understanding, 0)
    assert.equal(overview.concepts[0].state.recall, 0)
  } finally {
    db.close()
  }
})

test('negative capability outcomes are normalized to gaps before projection', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_negative_capability', userMessageId: 'user_negative_capability', assistantMessageId: 'assistant_negative_capability',
      userText: '我尝试自己划分事务边界，但最后判断错了。',
    }), runId: 'run_negative_capability' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', eventType: 'capability_demonstrated',
      targetLabel: '划分事务边界', evidenceQuote: '我尝试自己划分事务边界，但最后判断错了',
      evidence: { correct: false, independence: 'independent' },
    }, runContext).status, 'accepted')
    service.commitAgentRunOperations(runContext.runId)
    const overview = db.getLearningMemoryOverview()
    assert.equal(overview.recentEvents[0].eventType, 'capability_gap_observed')
    assert.equal(overview.capabilities[0].evidenceSummary.demonstrated_count, 0)
    assert.equal(overview.capabilities[0].evidenceSummary.gap_count, 1)
  } finally {
    db.close()
  }
})

test('unscored assessment attempts cannot accumulate into usable concept status', () => {
  const db = createDb()
  try {
    db.insertLearningEvents(Array.from({ length: 20 }, (_, index) => ({
      traceId: `trace_unscored_assessment_${index}`,
      eventType: 'assessment_attempt',
      dimension: 'concept',
      sourceKind: 'conversation_observed',
      targetKey: 'concept_unscored_assessment',
      targetLabel: '事务隔离级别',
      evidence: { kind: 'understanding' },
      confidence: 0.7,
    })))
    const concept = db.getLearningMemoryOverview().concepts[0]
    assert.equal(concept.state.understanding, 0.35)
    assert.equal(concept.status, 'learning')
  } finally {
    db.close()
  }
})

test('profile writes are disabled by default', () => {
  const db = createDb()
  try {
    const context = { ...createRunMessages(db), runId: 'run_disabled' }
    const service = new LearningMemoryService({ dbService: db })
    const result = service.stageAgentOperation({
      operation: 'remember', dimension: 'goal', targetLabel: '学习 Vue', evidenceQuote: '正在系统学习 Vue 状态管理',
    }, context)
    assert.equal(result.status, 'disabled')
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)
  } finally {
    db.close()
  }
})

test('remember is staged and only committed after a successful run', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const context = { ...createRunMessages(db), runId: 'run_remember' }
    const service = new LearningMemoryService({ dbService: db })
    const staged = service.stageAgentOperation({
      operation: 'remember',
      dimension: 'goal',
      eventType: 'goal_declared',
      targetLabel: '系统学习 Vue 状态管理',
      targetMeaning: '通过真实项目掌握 Vue 状态管理',
      evidenceQuote: '我正在系统学习 Vue 状态管理',
      context: { task_type: 'project_learning' },
    }, context)
    assert.equal(staged.status, 'accepted')
    assert.equal(staged.pendingCommit, true)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)

    const committed = service.commitAgentRunOperations(context.runId)
    assert.equal(committed.status, 'committed')
    assert.equal(committed.inserted, 1)
    assert.equal(service.commitAgentRunOperations(context.runId).status, 'empty')
    const overview = db.getLearningMemoryOverview()
    assert.equal(overview.tracks.length, 1)
    assert.equal(overview.tracks[0].title, '系统学习 Vue 状态管理')
    assert.equal(overview.recentEvents[0].sourceKind, 'user_explicit')
    assert.equal(overview.recentEvents[0].evidence.quote, '我正在系统学习 Vue 状态管理')
  } finally {
    db.close()
  }
})

test('regenerating from the same user message does not duplicate profile evidence', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const firstContext = { ...createRunMessages(db, {
      conversationId: 'conv_regenerate', userMessageId: 'user_regenerate', assistantMessageId: 'assistant_regenerate_1',
      userText: '请记住，我正在系统学习并发控制。',
    }), runId: 'run_regenerate_1' }
    const service = new LearningMemoryService({ dbService: db })
    const input = {
      operation: 'remember', dimension: 'goal', targetLabel: '系统学习并发控制',
      evidenceQuote: '我正在系统学习并发控制',
    }
    assert.equal(service.stageAgentOperation(input, firstContext).status, 'accepted')
    assert.equal(service.commitAgentRunOperations(firstContext.runId).inserted, 1)

    db.createMsg({ id: 'assistant_regenerate_2', conversationId: firstContext.conversationId, role: 'assistant', content: '', status: 'streaming' })
    const secondContext = { ...firstContext, assistantMessageId: 'assistant_regenerate_2', runId: 'run_regenerate_2' }
    assert.equal(service.stageAgentOperation(input, secondContext).status, 'accepted')
    assert.equal(service.commitAgentRunOperations(secondContext.runId).inserted, 0)
    assert.equal(db.getLearningMemoryOverview().recentEvents.length, 1)
    assert.equal(db.getLearningMemoryOverview().tracks.length, 1)
  } finally {
    db.close()
  }
})

test('discarding a failed run leaves no profile data', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_discard', userMessageId: 'user_discard', assistantMessageId: 'assistant_discard',
      userText: '以后解释抽象概念时，请先给直觉例子。',
    }), runId: 'run_discard' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'remember', dimension: 'preference', targetLabel: '先给直觉例子',
      targetMeaning: '解释抽象概念时先给直觉例子', evidenceQuote: '请先给直觉例子',
    }, context).status, 'accepted')
    assert.equal(service.discardAgentRunOperations(context.runId).discarded, 1)
    assert.equal(db.getLearningMemoryOverview().preferences.length, 0)
  } finally {
    db.close()
  }
})

test('conversation observation switch blocks observe but not explicit remember', () => {
  const db = createDb()
  try {
    enableProfile(db, { allowConversationAnalysis: false })
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_observe_off', userMessageId: 'user_observe_off', assistantMessageId: 'assistant_observe_off',
      userText: '我的推理是先检查旧值；以后解释时也请先展示状态变化。',
    }), runId: 'run_observe_off' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', targetLabel: '先检查旧值', evidenceQuote: '我的推理是先检查旧值',
    }, context).reason, 'conversation_observation_disabled')
    assert.equal(service.stageAgentOperation({
      operation: 'remember', dimension: 'preference', targetLabel: '展示状态变化', evidenceQuote: '以后解释时也请先展示状态变化',
    }, context).status, 'accepted')
  } finally {
    db.close()
  }
})

test('disabling observation discards already staged observations but keeps explicit writes', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_observe_withdrawn', userMessageId: 'user_observe_withdrawn', assistantMessageId: 'assistant_observe_withdrawn',
      userText: '我的推理是先检查锁顺序；另外请记住，以后先画时序图。',
    }), runId: 'run_observe_withdrawn' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', targetLabel: '检查锁顺序',
      evidenceQuote: '我的推理是先检查锁顺序',
    }, context).status, 'accepted')
    assert.equal(service.stageAgentOperation({
      operation: 'remember', dimension: 'preference', targetLabel: '先画时序图',
      evidenceQuote: '以后先画时序图',
    }, context).status, 'accepted')

    service.updateSettings({ allowConversationAnalysis: false })
    const committed = service.commitAgentRunOperations(context.runId)
    assert.equal(committed.inserted, 1)
    const overview = db.getLearningMemoryOverview()
    assert.equal(overview.capabilities.length, 0)
    assert.equal(overview.preferences.length, 1)
  } finally {
    db.close()
  }
})

test('server rejects invented evidence and sensitive or personality labels', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_validation', userMessageId: 'user_validation', assistantMessageId: 'assistant_validation',
      userText: '我的思路是先运行测试，再缩小问题范围。',
    }), runId: 'run_validation' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', targetLabel: '测试驱动排查', evidenceQuote: '我已经独立解决了全部问题',
    }, context).reason, 'evidence_quote_not_in_recent_user_messages')
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', targetLabel: '用户逻辑能力很强', evidenceQuote: '我的思路是先运行测试',
    }, context).reason, 'sensitive_or_personality_profile')
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)
  } finally {
    db.close()
  }
})

test('observe records only conservative capability evidence', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_observe', userMessageId: 'user_observe', assistantMessageId: 'assistant_observe',
      userText: '我先运行失败测试，再根据堆栈把范围缩小到了缓存层。',
    }), runId: 'run_observe' }
    const service = new LearningMemoryService({ dbService: db })
    const staged = service.stageAgentOperation({
      operation: 'observe', dimension: 'capability', eventType: 'problem_solving_observed',
      targetLabel: '根据失败测试缩小范围', targetMeaning: '在前端调试中结合失败测试和堆栈定位模块',
      evidenceQuote: '我先运行失败测试，再根据堆栈把范围缩小到了缓存层',
      evidence: { independence: 'independent', outcome: 'resolved' }, context: { task_type: 'frontend_debugging' },
    }, context)
    assert.equal(staged.status, 'accepted')
    service.commitAgentRunOperations(context.runId)
    const capability = db.getLearningMemoryOverview().capabilities[0]
    assert.equal(capability.status, 'observed')
    assert.equal(capability.evidenceCount, 1)
    assert.ok(capability.confidence <= 0.88)
  } finally {
    db.close()
  }
})

test('query, correction and retraction use stable targets and rebuild projections', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const service = new LearningMemoryService({ dbService: db })
    const first = { ...createRunMessages(db, {
      conversationId: 'conv_lifecycle', userMessageId: 'user_goal_1', assistantMessageId: 'assistant_goal_1',
      userText: '请记住，我的目标是两个月内学完 Vue。',
    }), runId: 'run_goal_1' }
    service.stageAgentOperation({
      operation: 'remember', dimension: 'goal', targetLabel: '学习 Vue', targetMeaning: '两个月内学完 Vue', evidenceQuote: '我的目标是两个月内学完 Vue',
    }, first)
    service.commitAgentRunOperations(first.runId)

    const query = service.queryAgentProfile({ operation: 'query', dimension: 'goal', match: '学习 Vue' })
    assert.equal(query.status, 'accepted')
    assert.equal(query.items.length, 1)
    const targetKey = query.items[0].targetKey

    const correction = { ...createRunMessages(db, {
      conversationId: 'conv_lifecycle', userMessageId: 'user_goal_2', assistantMessageId: 'assistant_goal_2',
      userText: '纠正一下，不是两个月，我准备三个月内完成 Vue 学习。',
    }), runId: 'run_goal_2' }
    assert.equal(service.stageAgentOperation({
      operation: 'correct', targetKey, dimension: 'goal', targetLabel: '学习 Vue', targetMeaning: '三个月内完成 Vue 学习',
      evidenceQuote: '我准备三个月内完成 Vue 学习',
    }, correction).status, 'accepted')
    service.commitAgentRunOperations(correction.runId)
    let overview = db.getLearningMemoryOverview()
    assert.equal(overview.tracks.length, 1)
    assert.equal(overview.tracks[0].goal, '三个月内完成 Vue 学习')
    assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM learning_events WHERE status = 'retracted'").get().count, 1)

    const retraction = { ...createRunMessages(db, {
      conversationId: 'conv_lifecycle', userMessageId: 'user_goal_3', assistantMessageId: 'assistant_goal_3',
      userText: '这个学习目标取消了，请撤销它。',
    }), runId: 'run_goal_3' }
    assert.equal(service.stageAgentOperation({
      operation: 'retract', targetKey, evidenceQuote: '这个学习目标取消了',
    }, retraction).status, 'accepted')
    service.commitAgentRunOperations(retraction.runId)
    overview = db.getLearningMemoryOverview()
    assert.equal(overview.tracks.length, 0)
    assert.equal(service.queryAgentProfile({ operation: 'query', targetKey }).status, 'not_found')
  } finally {
    db.close()
  }
})

test('ambiguous target matches are returned instead of guessed', () => {
  const db = createDb()
  try {
    enableProfile(db)
    db.insertLearningEvents([
      { traceId: 'trace_entropy_1', eventType: 'concept_exposed', dimension: 'concept', sourceKind: 'conversation_observed', targetKey: 'concept_entropy_info', targetLabel: '熵', targetMeaning: '信息论中的不确定性', confidence: 0.7 },
      { traceId: 'trace_entropy_2', eventType: 'concept_exposed', dimension: 'concept', sourceKind: 'conversation_observed', targetKey: 'concept_entropy_thermo', targetLabel: '熵', targetMeaning: '热力学状态量', confidence: 0.7 },
    ])
    const context = { ...createRunMessages(db, {
      conversationId: 'conv_ambiguous', userMessageId: 'user_ambiguous', assistantMessageId: 'assistant_ambiguous',
      userText: '请撤销关于熵的记录。',
    }), runId: 'run_ambiguous' }
    const service = new LearningMemoryService({ dbService: db })
    const result = service.stageAgentOperation({ operation: 'retract', dimension: 'concept', match: '熵', evidenceQuote: '请撤销关于熵的记录' }, context)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.candidates.length, 2)
  } finally {
    db.close()
  }
})

test('new evidence with an ambiguous exact label is rejected instead of merged arbitrarily', () => {
  const db = createDb()
  try {
    enableProfile(db)
    db.insertLearningEvents([
      { traceId: 'trace_scope_js', eventType: 'concept_exposed', dimension: 'concept', sourceKind: 'conversation_observed', targetKey: 'concept_scope_js', targetLabel: '作用域', targetMeaning: 'JavaScript 词法作用域', confidence: 0.7 },
      { traceId: 'trace_scope_css', eventType: 'concept_exposed', dimension: 'concept', sourceKind: 'conversation_observed', targetKey: 'concept_scope_css', targetLabel: '作用域', targetMeaning: 'CSS 样式作用范围', confidence: 0.7 },
    ])
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_scope_ambiguous', userMessageId: 'user_scope_ambiguous', assistantMessageId: 'assistant_scope_ambiguous',
      userText: '我刚才重新解释了作用域。',
    }), runId: 'run_scope_ambiguous' }
    const service = new LearningMemoryService({ dbService: db })
    const result = service.stageAgentOperation({
      operation: 'observe', dimension: 'concept', eventType: 'explanation_attempt',
      targetLabel: '作用域', evidenceQuote: '我刚才重新解释了作用域',
    }, runContext)
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.reason, 'ambiguous_target_label')
    assert.equal(result.candidates.length, 2)
  } finally {
    db.close()
  }
})

test('strategy projection preserves explicit dimension and meaning', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_strategy', userMessageId: 'user_strategy', assistantMessageId: 'assistant_strategy',
      userText: '先让我预测再解释，这种学习方式对我很有效。',
    }), runId: 'run_strategy' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'observe', dimension: 'strategy', eventType: 'strategy_feedback',
      targetLabel: '先预测再解释', targetMeaning: '学习抽象概念时先让用户预测，再根据结果解释',
      evidenceQuote: '这种学习方式对我很有效',
    }, runContext).status, 'accepted')
    service.commitAgentRunOperations(runContext.runId)
    const preference = db.getLearningMemoryOverview().preferences[0]
    assert.equal(preference.dimension, 'strategy')
    assert.equal(preference.meaning, '学习抽象概念时先让用户预测，再根据结果解释')
    assert.equal(service.queryAgentProfile({ dimension: 'strategy', match: '先预测再解释' }).items[0].dimension, 'strategy')
  } finally {
    db.close()
  }
})

test('staged writes are discarded when their source message disappears before commit', () => {
  const db = createDb()
  try {
    enableProfile(db)
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_stale', userMessageId: 'user_stale', assistantMessageId: 'assistant_stale',
      userText: '请记住，我正在学习数据库事务。',
    }), runId: 'run_stale' }
    const service = new LearningMemoryService({ dbService: db })
    assert.equal(service.stageAgentOperation({
      operation: 'remember', dimension: 'goal', targetLabel: '学习数据库事务', evidenceQuote: '我正在学习数据库事务',
    }, runContext).status, 'accepted')
    db.deleteMsg(runContext.userMessageId)
    const result = service.commitAgentRunOperations(runContext.runId)
    assert.equal(result.status, 'discarded')
    assert.equal(result.reason, 'source_context_missing')
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)
  } finally {
    db.close()
  }
})

test('learning profile tools are split, run-scoped and do not write directly', async () => {
  const db = createDb()
  try {
    enableProfile(db)
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_tool', userMessageId: 'user_tool', assistantMessageId: 'assistant_tool',
      userText: '请记住，以后讲公式时先说明直觉。',
    }), runId: 'run_tool' }
    const service = new LearningMemoryService({ dbService: db })
    const tools = createLearningProfileToolset({ service, runContext })
    assert.equal(tools.length, 2)
    assert.deepEqual(tools.map(tool => tool.name), ['update_learning_profile', 'query_learning_profile'])
    const raw = await tools[0].invoke({
      operation: 'remember', dimension: 'preference', targetLabel: '公式前先讲直觉',
      targetMeaning: '讲解公式时先说明直觉含义', evidenceQuote: '以后讲公式时先说明直觉',
    })
    assert.equal(JSON.parse(raw).status, 'accepted')
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)
    service.commitAgentRunOperations(runContext.runId)
    const preference = db.getLearningMemoryOverview().preferences[0]
    assert.equal(preference.dimension, 'preference')
    assert.equal(preference.meaning, '讲解公式时先说明直觉含义')
    const queryRaw = await tools[1].invoke({ dimension: 'preference', match: '公式前先讲直觉' })
    assert.equal(JSON.parse(queryRaw).items.length, 1)
  } finally {
    db.close()
  }
})

test('profile writes can use an exact quote from a recent user message', () => {
  const db = createDb()
  try {
    enableProfile(db)
    db.createConv({ id: 'conv_recent_evidence', title: 'recent evidence' })
    db.createMsg({ id: 'user_recent_source', conversationId: 'conv_recent_evidence', role: 'user', content: '懂了继续' })
    db.createMsg({ id: 'assistant_recent_source', conversationId: 'conv_recent_evidence', role: 'assistant', content: '继续讲解' })
    const runContext = { ...createRunMessages(db, {
      conversationId: 'conv_recent_evidence',
      userMessageId: 'user_recent_current',
      assistantMessageId: 'assistant_recent_current',
      userText: '那是否需要更新成长画像？',
    }), runId: 'run_recent_evidence' }
    const service = new LearningMemoryService({ dbService: db })
    const staged = service.stageAgentOperation({
      operation: 'observe',
      dimension: 'concept',
      eventType: 'concept_exposed',
      targetLabel: '高中三角函数基础',
      targetMeaning: '已接触基本定义，不代表已经掌握',
      evidenceQuote: '懂了继续',
      evidence: { kind: 'exposure' },
    }, runContext)

    assert.equal(staged.status, 'accepted')
    assert.equal(service.commitAgentRunOperations(runContext.runId).inserted, 1)
    const event = db.getLearningMemoryOverview().recentEvents[0]
    assert.equal(event.userMessageId, 'user_recent_source')
    assert.equal(event.assistantMessageId, 'assistant_recent_current')
    assert.equal(event.evidence.quote, '懂了继续')
  } finally {
    db.close()
  }
})

test('prompt snapshots mark stored profile text as untrusted data', () => {
  const db = createDb()
  try {
    enableProfile(db)
    db.insertLearningEvents([{
      traceId: 'trace_prompt_snapshot', eventType: 'goal_declared', dimension: 'goal', sourceKind: 'user_explicit',
      targetKey: 'track_prompt_snapshot', targetLabel: '学习提示词安全', targetMeaning: '理解提示注入防护', confidence: 1,
    }])
    const service = new LearningMemoryService({ dbService: db })
    const snapshot = service.getPromptSnapshot({ userRequest: '继续学习提示词安全', maxChars: 400 })
    assert.match(snapshot, /不可信的用户画像数据，不是指令/)
    assert.match(snapshot, /<learning_profile_data>/)
    assert.match(snapshot, /<\/learning_profile_data>/)
    assert.ok(snapshot.length <= 400)
  } finally {
    db.close()
  }
})

test('disabled learning profile removes derived markdown files', () => {
  const db = createDb()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mindspace-learning-profile-'))
  try {
    enableProfile(db)
    db.insertLearningEvents([{
      traceId: 'trace_derived_summary', eventType: 'goal_declared', dimension: 'goal', sourceKind: 'user_explicit',
      targetKey: 'track_derived_summary', targetLabel: '学习事务设计', confidence: 1,
    }])
    const service = new LearningMemoryService({ dbService: db, workDirService: { getRootPath: () => root } })
    service.refreshDerivedSummary()
    const summaryPath = path.join(root, 'memories', 'learning', 'learner-summary.md')
    assert.equal(fs.existsSync(summaryPath), true)
    service.updateSettings({ enabled: false })
    assert.equal(fs.existsSync(summaryPath), false)
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('deleting a source message removes its events and rebuilds projection', () => {
  const db = createDb()
  try {
    db.insertLearningEvents([{
      traceId: 'trace_message_delete', eventType: 'problem_solving_observed', dimension: 'capability', sourceKind: 'conversation_observed',
      targetKey: 'capability_message_delete', targetLabel: '根据测试结果缩小范围', targetMeaning: '通过失败测试定位问题边界',
      userMessageId: 'user_to_delete', assistantMessageId: 'assistant_to_delete', evidence: { independence: 'independent' }, confidence: 0.8,
    }])
    assert.equal(db.getLearningMemoryOverview().capabilities.length, 1)
    db.deleteLearningByMessage('user_to_delete')
    assert.equal(db.getLearningMemoryOverview().capabilities.length, 0)
    assert.equal(db.db.prepare('SELECT COUNT(*) AS count FROM learning_events').get().count, 0)
  } finally {
    db.close()
  }
})
