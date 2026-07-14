import crypto from 'node:crypto'
import {
  CONVERSATION_SELECT_COLUMNS,
  dynamicUpdate,
  parseJSON,
  stringifyJSON,
} from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class ConversationRepository extends BaseRepository {
  listConvs(spaceId, groupId) {
    if (groupId) {
      if (spaceId) return this.db.prepare(`SELECT ${CONVERSATION_SELECT_COLUMNS} FROM conversations WHERE space_id = ? AND group_id = ? ORDER BY updated_at DESC`).all(spaceId, groupId).map(row => this._parseConv(row))
      return this.db.prepare(`SELECT ${CONVERSATION_SELECT_COLUMNS} FROM conversations WHERE group_id = ? ORDER BY updated_at DESC`).all(groupId).map(row => this._parseConv(row))
    }
    if (spaceId) return this.db.prepare(`SELECT ${CONVERSATION_SELECT_COLUMNS} FROM conversations WHERE space_id = ? ORDER BY updated_at DESC`).all(spaceId).map(row => this._parseConv(row))
    return this.db.prepare(`SELECT ${CONVERSATION_SELECT_COLUMNS} FROM conversations ORDER BY updated_at DESC`).all().map(row => this._parseConv(row))
  }

  getConv(id) {
    return this._parseConv(this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id))
  }

  createConv(data) {
    const id = data.id || 'conv_' + Date.now()
    const spaceId = data.space_id ?? data.spaceId ?? ''
    const agentId = data.agent_id ?? data.agentId ?? ''
    const title = data.title ?? '新对话'
    const architecture = data.architecture ?? ''
    const model = data.model ?? ''
    const groupId = data.group_id ?? data.groupId ?? 'default'
    const contextLength = data.context_length ?? data.contextLength ?? 50
    const parentConversationId = data.parent_conversation_id ?? data.parentConversationId ?? ''
    const branchedFromMessageId = data.branched_from_message_id ?? data.branchedFromMessageId ?? ''
    this.db.prepare(`INSERT INTO conversations (
      id, space_id, agent_id, title, architecture, model, group_id, context_length,
      parent_conversation_id, branched_from_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, spaceId, agentId, title, architecture, model, groupId, contextLength,
      parentConversationId, branchedFromMessageId,
    )
    return this.getConv(id)
  }

  updateConv(id, data) {
    dynamicUpdate(this.db, 'conversations', id, data)
    return this.getConv(id)
  }

  deleteConv(id) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    return { success: true }
  }

  createConversationBranch({ sourceConversationId, sourceMessageId } = {}) {
    const sourceConvId = String(sourceConversationId || '').trim()
    const sourceMsgId = String(sourceMessageId || '').trim()
    if (!sourceConvId || !sourceMsgId) throw new Error('INVALID_BRANCH_SOURCE')

    const createBranch = this.db.transaction(() => {
      const sourceConv = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(sourceConvId)
      if (!sourceConv) throw new Error('SOURCE_CONVERSATION_NOT_FOUND')

      const sourceMessages = this.db.prepare(
        'SELECT rowid AS _rowid, * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
      ).all(sourceConvId)
      const targetIndex = sourceMessages.findIndex(message => message.id === sourceMsgId)
      if (targetIndex < 0) throw new Error('SOURCE_MESSAGE_NOT_FOUND')

      const targetMessage = sourceMessages[targetIndex]
      if (targetMessage.role !== 'assistant') throw new Error('BRANCH_REQUIRES_ASSISTANT_MESSAGE')
      if ((targetMessage.status || 'completed') !== 'completed') throw new Error('BRANCH_REQUIRES_COMPLETED_MESSAGE')

      const messagesToCopy = sourceMessages.slice(0, targetIndex + 1)
      const newConversationId = `conv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
      const sourceTitle = String(sourceConv.title || '新对话').trim() || '新对话'
      const branchTitleBase = `${sourceTitle} · 分支`
      let branchTitle = branchTitleBase
      let branchNumber = 2
      const titleExists = this.db.prepare('SELECT 1 FROM conversations WHERE title = ? LIMIT 1')
      while (titleExists.get(branchTitle)) {
        branchTitle = `${branchTitleBase} ${branchNumber}`
        branchNumber += 1
      }

      this.db.prepare(`INSERT INTO conversations (
        id, space_id, agent_id, title, architecture, model, group_id, context_length,
        parent_conversation_id, branched_from_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        newConversationId,
        sourceConv.space_id || '',
        sourceConv.agent_id || '',
        branchTitle,
        sourceConv.architecture || '',
        sourceConv.model || '',
        sourceConv.group_id || 'default',
        sourceConv.context_length ?? 50,
        sourceConvId,
        sourceMsgId,
      )

      const messageColumns = this.db.prepare('PRAGMA table_info(messages)').all().map(column => column.name)
      const insertMessage = this.db.prepare(
        `INSERT INTO messages (${messageColumns.join(', ')}) VALUES (${messageColumns.map(() => '?').join(', ')})`,
      )
      const idMap = new Map(messagesToCopy.map((message, index) => [
        message.id,
        `msg_${Date.now()}_${index}_${crypto.randomUUID().slice(0, 8)}`,
      ]))

      for (const sourceMessage of messagesToCopy) {
        const values = messageColumns.map((column) => {
          if (column === 'id') return idMap.get(sourceMessage.id)
          if (column === 'conversation_id') return newConversationId
          if (column === 'parent_msg_id') return idMap.get(sourceMessage.parent_msg_id) || ''
          if (column === 'run_id') return ''
          return sourceMessage[column]
        })
        insertMessage.run(...values)
      }

      return { conversationId: newConversationId, messageCount: messagesToCopy.length }
    })

    const result = createBranch()
    return {
      conversation: this.getConv(result.conversationId),
      messageCount: result.messageCount,
    }
  }

  listConvGroups() {
    return this.db.prepare('SELECT * FROM conv_groups ORDER BY sort_order, created_at ASC').all().map(row => this._parseConvGroup(row))
  }

  createConvGroup(data) {
    const id = data.id || 'grp_' + Date.now()
    this.db.prepare(`INSERT INTO conv_groups (id, name, sort_order)
      VALUES (?, ?, ?)`).run(id, data.name || '新分组', data.sort_order || 0)
    return this._parseConvGroup(this.db.prepare('SELECT * FROM conv_groups WHERE id = ?').get(id))
  }

  updateConvGroup(id, data) {
    dynamicUpdate(this.db, 'conv_groups', id, data)
    return this._parseConvGroup(this.db.prepare('SELECT * FROM conv_groups WHERE id = ?').get(id))
  }

  deleteConvGroup(id) {
    if (id === 'default') return { success: false, error: 'Cannot delete default group' }
    this.db.prepare('UPDATE conversations SET group_id = \'default\' WHERE group_id = ?').run(id)
    this.db.prepare('DELETE FROM conv_groups WHERE id = ?').run(id)
    return { success: true }
  }

  listMsgs(conversationId) {
    return this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC').all(conversationId).map(row => this._parseMsg(row))
  }

  getMsg(id) {
    return this._parseMsg(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id))
  }

  getPreviousUserMsg(conversationId, assistantMessageId) {
    const target = this.db.prepare(`
      SELECT rowid, * FROM messages
      WHERE id = ? AND conversation_id = ?
    `).get(assistantMessageId, conversationId)
    if (!target) throw new Error('SOURCE_MESSAGE_NOT_FOUND')
    if (target.role !== 'assistant') throw new Error('SOURCE_MESSAGE_NOT_ASSISTANT')

    const previous = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
        AND role = 'user'
        AND (
          COALESCE(created_at, '') < COALESCE(?, '')
          OR (COALESCE(created_at, '') = COALESCE(?, '') AND rowid < ?)
        )
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(conversationId, target.created_at, target.created_at, target.rowid)
    return this._parseMsg(previous)
  }

  listMsgsPaginated(conversationId, limit = 30, offset = 0) {
    return this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC LIMIT ? OFFSET ?').all(conversationId, limit, offset).map(row => this._parseMsg(row))
  }

  countMsgs(conversationId) {
    return this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId).count
  }

  createMsg(data) {
    const id = data.id || 'msg_' + Date.now()
    const conversationId = data.conversation_id ?? data.conversationId ?? ''
    const role = data.role ?? 'user'
    const content = data.content ?? ''
    const meta = stringifyJSON(data.meta ?? {})
    const status = data.status ?? 'completed'
    const modelId = data.model_id ?? data.modelId ?? ''
    const providerId = data.provider_id ?? data.providerId ?? ''
    this.db.prepare(`INSERT INTO messages (id, conversation_id, role, content, meta, status, model_id, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, conversationId, role, content, meta, status, modelId, providerId)
    const supplementalData = {
      input_tokens: data.input_tokens ?? data.inputTokens,
      output_tokens: data.output_tokens ?? data.outputTokens,
      cache_read_tokens: data.cache_read_tokens ?? data.cacheReadTokens,
      cache_write_tokens: data.cache_write_tokens ?? data.cacheWriteTokens,
      thinking_tokens: data.thinking_tokens ?? data.thinkingTokens,
      latency_ms: data.latency_ms ?? data.latencyMs,
      cost: data.cost,
      error_message: data.error_message ?? data.errorMessage,
      error_code: data.error_code ?? data.errorCode,
      parent_msg_id: data.parent_msg_id ?? data.parentMsgId,
      thinking_content: data.thinking_content ?? data.thinkingContent,
      run_id: data.run_id ?? data.runId,
      step_index: data.step_index ?? data.stepIndex,
      created_at: data.created_at ?? data.createdAt,
    }
    if (Object.values(supplementalData).some(value => value !== undefined && value !== null)) {
      dynamicUpdate(this.db, 'messages', id, supplementalData)
    }
    return this._parseMsg(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id))
  }

  deleteMsg(id) {
    this.db.prepare('DELETE FROM messages WHERE id = ?').run(id)
    return { success: true }
  }

  updateMsg(id, data) {
    return dynamicUpdate(this.db, 'messages', id, data, ['meta'], [])
  }

  _parseConv(row) {
    if (!row) return null
    return {
      id: row.id, spaceId: row.space_id, agentId: row.agent_id,
      title: row.title, architecture: row.architecture, model: row.model,
      groupId: row.group_id || 'default', contextLength: row.context_length ?? 50,
      parentConversationId: row.parent_conversation_id || '',
      branchedFromMessageId: row.branched_from_message_id || '',
      createdAt: row.created_at, updatedAt: row.updated_at,
    }
  }

  _parseMsg(row) {
    if (!row) return null
    return {
      id: row.id, conversationId: row.conversation_id,
      role: row.role, content: row.content,
      meta: parseJSON(row.meta), createdAt: row.created_at,
      status: row.status || 'completed',
      modelId: row.model_id || '', providerId: row.provider_id || '',
      inputTokens: row.input_tokens || 0, outputTokens: row.output_tokens || 0,
      cacheReadTokens: row.cache_read_tokens || 0, cacheWriteTokens: row.cache_write_tokens || 0,
      thinkingTokens: row.thinking_tokens || 0,
      thinkingContent: row.thinking_content || '',
      latencyMs: row.latency_ms || 0, cost: row.cost || 0,
      errorMessage: row.error_message || '', errorCode: row.error_code || '', parentMsgId: row.parent_msg_id || '',
      runId: row.run_id || '', stepIndex: row.step_index || 0,
    }
  }

  _parseConvGroup(row) {
    if (!row) return null
    return {
      id: row.id, name: row.name, sortOrder: row.sort_order,
      createdAt: row.created_at,
    }
  }
}
