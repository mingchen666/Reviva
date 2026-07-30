import { parseJSON, stringifyJSON } from '../db/helpers.js'
import { BaseRepository } from '../db/repositories/BaseRepository.js'

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0))

function asObject(value, fallback = {}) {
  const parsed = parseJSON(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback
}

function asArray(value) {
  const parsed = parseJSON(value)
  return Array.isArray(parsed) ? parsed : []
}

function unique(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))]
}

export function classifyCapabilityEvidence(event = {}) {
  const evidence = event.evidence || {}
  const outcome = String(evidence.outcome || '').trim().toLowerCase()
  if (evidence.correct === false || ['incorrect', 'failed', 'unresolved'].includes(outcome)) return 'negative'
  if (evidence.correct === true || ['correct', 'resolved', 'successful'].includes(outcome)) return 'positive'
  return 'neutral'
}

function normalizeSettings(row = {}) {
  return {
    enabled: Boolean(row.enabled),
    allowConversationAnalysis: row.allow_conversation_analysis !== 0,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function normalizeEvent(row) {
  if (!row) return null
  return {
    traceId: row.trace_id,
    eventType: row.event_type,
    dimension: row.dimension,
    sourceKind: row.source_kind,
    targetKey: row.target_key || '',
    targetLabel: row.target_label || '',
    targetMeaning: row.target_meaning || '',
    trackId: row.track_id || '',
    conversationId: row.conversation_id || '',
    userMessageId: row.user_message_id || '',
    assistantMessageId: row.assistant_message_id || '',
    sourceAgentId: row.source_agent_id || '',
    sourceAgentName: row.source_agent_name || '',
    sourceSkillId: row.source_skill_id || '',
    context: asObject(row.context_json),
    evidence: asObject(row.evidence_json),
    confidence: clamp(row.confidence),
    status: row.status || 'active',
    occurredAt: row.occurred_at || '',
    createdAt: row.created_at || '',
    retractedAt: row.retracted_at || '',
    retractedBy: row.retracted_by || '',
  }
}

export class LearningMemoryRepository extends BaseRepository {
  getSettings() {
    const row = this.db.prepare("SELECT * FROM learning_settings WHERE id = 'default'").get()
    return normalizeSettings(row)
  }

  updateSettings(patch = {}) {
    const mapping = {
      enabled: ['enabled', value => value ? 1 : 0],
      allowConversationAnalysis: ['allow_conversation_analysis', value => value ? 1 : 0],
    }
    const sets = []
    const values = []
    for (const [key, value] of Object.entries(patch)) {
      const entry = mapping[key]
      if (!entry) continue
      sets.push(`${entry[0]} = ?`)
      values.push(entry[1](value))
    }
    if (!sets.length) return this.getSettings()
    sets.push("updated_at = datetime('now')")
    this.db.prepare(`UPDATE learning_settings SET ${sets.join(', ')} WHERE id = 'default'`).run(...values)
    return this.getSettings()
  }

  insertEvents(events = []) {
    const transaction = this.db.transaction(items => {
      const inserted = []
      for (const event of items) {
        if (!this._insertEvent(event)) continue
        inserted.push(event)
      }
      return inserted
    })
    return transaction(events)
  }

  _insertEvent(event) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO learning_events
        (trace_id, event_type, dimension, source_kind, target_key, target_label,
         target_meaning, track_id, conversation_id, user_message_id, assistant_message_id,
         source_agent_id, source_agent_name, source_skill_id, context_json, evidence_json,
         confidence, status, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      event.traceId,
      event.eventType,
      event.dimension || 'learning',
      event.sourceKind || 'model_inferred',
      event.targetKey || '',
      event.targetLabel || '',
      event.targetMeaning || '',
      event.trackId || '',
      event.conversationId || '',
      event.userMessageId || '',
      event.assistantMessageId || '',
      event.sourceAgentId || '',
      event.sourceAgentName || '',
      event.sourceSkillId || '',
      stringifyJSON(event.context || {}),
      stringifyJSON(event.evidence || {}),
      clamp(event.confidence),
      event.occurredAt || new Date().toISOString(),
    )
    if (!result.changes) return false
    this._projectEvent(event)
    return true
  }

  _projectEvent(event) {
    if (event.eventType === 'goal_declared' || event.dimension === 'goal') {
      this._projectTrack(event)
      return
    }
    if (event.eventType === 'preference_declared' || event.dimension === 'preference' || event.dimension === 'strategy') {
      this._projectPreference(event)
      return
    }
    if (event.dimension === 'capability' || event.eventType.includes('capability') || event.eventType === 'problem_solving_observed') {
      this._projectCapability(event)
      return
    }
    if (event.dimension === 'concept' || event.eventType.includes('concept') || event.eventType.includes('misconception') || event.eventType.includes('assessment') || event.eventType.includes('explanation')) {
      this._projectConcept(event)
    }
  }

  _projectTrack(event) {
    const id = event.trackId || event.targetKey
    if (!id) return
    const title = event.targetLabel || event.targetMeaning || id
    const goal = event.targetMeaning || event.evidence?.goal || title
    const explicit = event.sourceKind === 'user_explicit'
    this.db.prepare(`
      INSERT INTO learning_tracks (id, title, goal, source_kind, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        goal = CASE WHEN excluded.goal <> '' THEN excluded.goal ELSE learning_tracks.goal END,
        source_kind = CASE WHEN excluded.source_kind = 'user_explicit' THEN excluded.source_kind ELSE learning_tracks.source_kind END,
        status = CASE WHEN excluded.status = 'active' THEN 'active' ELSE learning_tracks.status END,
        updated_at = datetime('now')
    `).run(id, title, goal, event.sourceKind || 'model_inferred', explicit ? 'active' : 'hypothesis')
  }

  _projectPreference(event) {
    const id = event.targetKey
    if (!id) return
    const explicit = event.sourceKind === 'user_explicit'
    this.db.prepare(`
      INSERT INTO learning_preferences
        (id, dimension, strategy, meaning, conditions_json, source_kind, confidence, evidence_count, status, last_evidence_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        dimension = excluded.dimension,
        strategy = excluded.strategy,
        meaning = excluded.meaning,
        conditions_json = excluded.conditions_json,
        source_kind = CASE WHEN excluded.source_kind = 'user_explicit' THEN excluded.source_kind ELSE learning_preferences.source_kind END,
        confidence = MAX(learning_preferences.confidence, excluded.confidence),
        evidence_count = learning_preferences.evidence_count + 1,
        status = CASE WHEN excluded.source_kind = 'user_explicit' THEN 'active' ELSE learning_preferences.status END,
        last_evidence_at = excluded.last_evidence_at,
        updated_at = datetime('now')
    `).run(
      id,
      event.dimension === 'strategy' ? 'strategy' : 'preference',
      event.targetLabel || id,
      event.targetMeaning || '',
      stringifyJSON(event.context?.conditions || event.context || {}),
      event.sourceKind || 'model_inferred',
      clamp(event.confidence),
      explicit ? 'active' : 'hypothesis',
      event.occurredAt || new Date().toISOString(),
    )
  }

  _projectCapability(event) {
    const id = event.targetKey
    if (!id) return
    const row = this.db.prepare('SELECT * FROM learning_capability_states WHERE capability_id = ?').get(id)
    const hypothesis = event.sourceKind === 'model_inferred'
    if (hypothesis && row && row.status !== 'hypothesis') return
    const baseRow = !hypothesis && row?.status === 'hypothesis' ? null : row
    const summary = asObject(baseRow?.evidence_summary_json, {
      independent_count: 0,
      assisted_count: 0,
      successful_transfer_count: 0,
      demonstrated_count: 0,
      gap_count: 0,
      neutral_count: 0,
    })
    if (!hypothesis) {
      const outcome = classifyCapabilityEvidence(event)
      if (outcome === 'negative') {
        summary.gap_count = (summary.gap_count || 0) + 1
      } else if (outcome === 'positive') {
        summary.demonstrated_count = (summary.demonstrated_count || 0) + 1
        const independence = String(event.evidence?.independence || '')
        if (independence === 'independent') summary.independent_count = (summary.independent_count || 0) + 1
        else summary.assisted_count = (summary.assisted_count || 0) + 1
        if (event.evidence?.transfer === true || event.evidence?.transfer_result === 'correct') {
          summary.successful_transfer_count = (summary.successful_transfer_count || 0) + 1
        }
      } else {
        summary.neutral_count = (summary.neutral_count || 0) + 1
      }
    }
    const count = (Number(baseRow?.evidence_count) || 0) + 1
    const demonstratedCount = Number(summary.demonstrated_count) || 0
    const gapCount = Number(summary.gap_count) || 0
    const status = hypothesis
      ? 'hypothesis'
      : summary.independent_count >= 3 && demonstratedCount >= 4 && gapCount <= Math.floor(demonstratedCount / 3)
        ? 'reliable'
        : demonstratedCount >= 2 && demonstratedCount > gapCount ? 'developing' : 'observed'
    const trackIds = unique([...asArray(baseRow?.related_track_ids_json), event.trackId])
    this.db.prepare(`
      INSERT INTO learning_capability_states
        (capability_id, label, meaning, conditions_json, status, evidence_summary_json,
         confidence, related_track_ids_json, last_evidence_at, evidence_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(capability_id) DO UPDATE SET
        label = excluded.label,
        meaning = excluded.meaning,
        conditions_json = excluded.conditions_json,
        status = excluded.status,
        evidence_summary_json = excluded.evidence_summary_json,
        confidence = excluded.confidence,
        related_track_ids_json = excluded.related_track_ids_json,
        last_evidence_at = excluded.last_evidence_at,
        evidence_count = excluded.evidence_count,
        updated_at = datetime('now')
    `).run(
      id,
      event.targetLabel || id,
      event.targetMeaning || '',
      stringifyJSON(event.context || {}),
      status,
      stringifyJSON(summary),
      clamp(Math.max(Number(baseRow?.confidence) || 0, event.confidence || 0)),
      stringifyJSON(trackIds),
      event.occurredAt || new Date().toISOString(),
      count,
    )
  }

  _projectConcept(event) {
    const id = event.targetKey
    if (!id) return
    const row = this.db.prepare('SELECT * FROM learning_concept_states WHERE concept_id = ?').get(id)
    const hypothesis = event.sourceKind === 'model_inferred'
    if (hypothesis && row && row.status !== 'hypothesis') return
    const baseRow = !hypothesis && row?.status === 'hypothesis' ? null : row
    const state = asObject(baseRow?.state_json, { exposure: 0, recall: 0, understanding: 0, transfer: 0 })
    const evidence = event.evidence || {}
    const correct = evidence.outcome === 'correct' || evidence.correct === true
    const incorrect = evidence.outcome === 'incorrect' || evidence.correct === false
    if (!hypothesis) {
      if (event.eventType === 'concept_exposed') state.exposure = 1
      if (event.eventType === 'explanation_attempt') {
        state.exposure = 1
        if (correct) {
          state.understanding = clamp(state.understanding + 0.25)
          state.recall = clamp(state.recall + (evidence.independence === 'independent' ? 0.15 : 0.05))
        } else if (incorrect) {
          state.understanding = clamp(state.understanding - 0.05)
          state.recall = clamp(state.recall - 0.05)
        } else {
          state.understanding = Math.min(0.35, clamp(state.understanding + 0.04))
        }
      }
      if (event.eventType === 'assessment_attempt' || event.eventType === 'quiz_attempt') {
        const kind = ['recall', 'understanding', 'transfer'].includes(evidence.kind) ? evidence.kind : 'recall'
        state.exposure = 1
        state[kind] = correct
          ? clamp(state[kind] + 0.25)
          : incorrect ? clamp(state[kind] - 0.08) : Math.min(0.35, clamp(state[kind] + 0.04))
      }
    }
    const misconceptions = asArray(baseRow?.active_misconceptions_json)
    if (!hypothesis && event.eventType === 'misconception_observed') {
      misconceptions.push(event.targetMeaning || evidence.misconception || event.targetLabel)
    }
    const count = (Number(baseRow?.evidence_count) || 0) + 1
    const status = hypothesis
      ? 'hypothesis'
      : count >= 4 && state.recall >= 0.65 && state.understanding >= 0.65 && state.transfer >= 0.45
        ? 'stable'
        : count >= 2 && state.understanding >= 0.45 ? 'usable'
          : state.exposure ? 'learning' : 'exposed'
    const trackIds = unique([...asArray(baseRow?.related_track_ids_json), event.trackId])
    this.db.prepare(`
      INSERT INTO learning_concept_states
        (concept_id, label, meaning, state_json, status, confidence,
         active_misconceptions_json, related_track_ids_json, last_evidence_at, evidence_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(concept_id) DO UPDATE SET
        label = excluded.label,
        meaning = excluded.meaning,
        state_json = excluded.state_json,
        status = excluded.status,
        confidence = excluded.confidence,
        active_misconceptions_json = excluded.active_misconceptions_json,
        related_track_ids_json = excluded.related_track_ids_json,
        last_evidence_at = excluded.last_evidence_at,
        evidence_count = excluded.evidence_count,
        updated_at = datetime('now')
    `).run(
      id,
      event.targetLabel || id,
      event.targetMeaning || '',
      stringifyJSON(state),
      status,
      clamp(Math.max(Number(baseRow?.confidence) || 0, event.confidence || 0)),
      stringifyJSON(unique(misconceptions)),
      stringifyJSON(trackIds),
      event.occurredAt || new Date().toISOString(),
      count,
    )
  }

  getOverview({ recentLimit = 30 } = {}) {
    const limit = Math.max(1, Math.min(100, Number(recentLimit) || 30))
    return {
      settings: this.getSettings(),
      tracks: this.db.prepare("SELECT * FROM learning_tracks WHERE status <> 'deleted' ORDER BY priority DESC, updated_at DESC").all().map(row => ({
        id: row.id, title: row.title, goal: row.goal || '', status: row.status,
        priority: Number(row.priority) || 0, tags: asArray(row.tags_json), currentFocus: asArray(row.current_focus_json),
        sourceKind: row.source_kind || '', createdAt: row.created_at || '', updatedAt: row.updated_at || '',
      })),
      concepts: this.db.prepare('SELECT * FROM learning_concept_states ORDER BY updated_at DESC').all().map(row => ({
        conceptId: row.concept_id, label: row.label, meaning: row.meaning || '', state: asObject(row.state_json),
        status: row.status, confidence: clamp(row.confidence), activeMisconceptions: asArray(row.active_misconceptions_json),
        relatedTrackIds: asArray(row.related_track_ids_json), lastEvidenceAt: row.last_evidence_at || '', evidenceCount: Number(row.evidence_count) || 0,
      })),
      capabilities: this.db.prepare('SELECT * FROM learning_capability_states ORDER BY updated_at DESC').all().map(row => ({
        capabilityId: row.capability_id, label: row.label, meaning: row.meaning || '', conditions: asObject(row.conditions_json),
        status: row.status, evidenceSummary: asObject(row.evidence_summary_json), confidence: clamp(row.confidence),
        relatedTrackIds: asArray(row.related_track_ids_json), lastEvidenceAt: row.last_evidence_at || '', evidenceCount: Number(row.evidence_count) || 0,
      })),
      preferences: this.db.prepare("SELECT * FROM learning_preferences WHERE status <> 'rejected' ORDER BY status = 'active' DESC, updated_at DESC").all().map(row => ({
        id: row.id, dimension: row.dimension || 'preference', strategy: row.strategy, meaning: row.meaning || '', conditions: asObject(row.conditions_json), sourceKind: row.source_kind,
        confidence: clamp(row.confidence), evidenceCount: Number(row.evidence_count) || 0, status: row.status,
        lastEvidenceAt: row.last_evidence_at || '', createdAt: row.created_at || '', updatedAt: row.updated_at || '',
      })),
      recentEvents: this.db.prepare('SELECT * FROM learning_events ORDER BY occurred_at DESC, created_at DESC LIMIT ?').all(limit).map(normalizeEvent),
    }
  }

  getSnapshotData() {
    return {
      tracks: this.db.prepare("SELECT * FROM learning_tracks WHERE status = 'active' ORDER BY priority DESC, updated_at DESC LIMIT 5").all(),
      concepts: this.db.prepare('SELECT * FROM learning_concept_states ORDER BY updated_at DESC LIMIT 20').all(),
      capabilities: this.db.prepare('SELECT * FROM learning_capability_states ORDER BY updated_at DESC LIMIT 20').all(),
      preferences: this.db.prepare("SELECT * FROM learning_preferences WHERE status IN ('active', 'hypothesis') ORDER BY status = 'active' DESC, updated_at DESC LIMIT 20").all(),
    }
  }

  findProfileTargets({ targetKey = '', dimension = '', match = '', limit = 10 } = {}) {
    const items = []
    for (const row of this.db.prepare("SELECT * FROM learning_tracks WHERE status <> 'deleted'").all()) {
      items.push({
        targetKey: row.id,
        dimension: 'goal',
        label: row.title,
        meaning: row.goal || '',
        status: row.status,
        updatedAt: row.updated_at || '',
      })
    }
    for (const row of this.db.prepare('SELECT * FROM learning_concept_states').all()) {
      items.push({
        targetKey: row.concept_id,
        dimension: 'concept',
        label: row.label,
        meaning: row.meaning || '',
        status: row.status,
        updatedAt: row.updated_at || '',
      })
    }
    for (const row of this.db.prepare('SELECT * FROM learning_capability_states').all()) {
      items.push({
        targetKey: row.capability_id,
        dimension: 'capability',
        label: row.label,
        meaning: row.meaning || '',
        status: row.status,
        updatedAt: row.updated_at || '',
      })
    }
    for (const row of this.db.prepare("SELECT * FROM learning_preferences WHERE status <> 'rejected'").all()) {
      items.push({
        targetKey: row.id,
        dimension: row.dimension || 'preference',
        label: row.strategy,
        meaning: row.meaning || '',
        status: row.status,
        updatedAt: row.updated_at || '',
      })
    }

    const key = String(targetKey || '').trim()
    const query = String(match || '').trim().toLocaleLowerCase()
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10))
    return items
      .filter(item => !dimension || item.dimension === dimension)
      .filter(item => !key || item.targetKey === key)
      .map(item => {
        const label = String(item.label || '').toLocaleLowerCase()
        const meaning = String(item.meaning || '').toLocaleLowerCase()
        const score = !query
          ? 0
          : label === query ? 100
            : item.targetKey.toLocaleLowerCase() === query ? 95
              : label.startsWith(query) ? 80
                : label.includes(query) ? 60
                  : meaning.includes(query) ? 40 : -1
        return { ...item, score }
      })
      .filter(item => !query || item.score >= 0)
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, safeLimit)
      .map(({ score, ...item }) => item)
  }

  applyAgentOperations(operations = []) {
    const transaction = this.db.transaction(items => {
      const result = { applied: 0, inserted: [], retracted: 0 }
      const activeTargets = this.db.prepare(`
        SELECT DISTINCT dimension, target_key FROM learning_events
        WHERE target_key = ? AND status = 'active'
      `)
      const retractTarget = this.db.prepare(`
        UPDATE learning_events
        SET status = 'retracted', retracted_at = datetime('now'), retracted_by = ?
        WHERE target_key = ? AND status = 'active'
      `)
      const traceExists = this.db.prepare('SELECT 1 FROM learning_events WHERE trace_id = ?')

      for (const operation of items) {
        if (operation.kind === 'insert') {
          if (!operation.event || !this._insertEvent(operation.event)) continue
          result.inserted.push(operation.event)
          result.applied += 1
          continue
        }

        if (!['replace_target', 'retract_target'].includes(operation.kind) || !operation.targetKey) continue
        if (operation.kind === 'replace_target' && operation.event?.traceId && traceExists.get(operation.event.traceId)) continue

        const targets = activeTargets.all(operation.targetKey)
        const changed = retractTarget.run(operation.retractedBy || 'agent', operation.targetKey).changes
        if (!changed) continue
        result.retracted += changed
        for (const target of targets) this._rebuildProjection(target.dimension, target.target_key)

        if (operation.kind === 'replace_target' && operation.event && this._insertEvent(operation.event)) {
          result.inserted.push(operation.event)
        }
        result.applied += 1
      }
      return result
    })
    return transaction(operations)
  }

  findTrackByTitle(title) {
    const value = String(title || '').trim()
    if (!value) return null
    return this.db.prepare(`
      SELECT * FROM learning_tracks
      WHERE title = ? COLLATE NOCASE AND status IN ('active', 'paused', 'hypothesis')
      ORDER BY status = 'active' DESC, updated_at DESC
      LIMIT 1
    `).get(value) || null
  }

  retractEvent(traceId, retractedBy = 'user') {
    const row = this.db.prepare('SELECT * FROM learning_events WHERE trace_id = ?').get(traceId)
    if (!row) return null
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE learning_events
        SET status = 'retracted', retracted_at = datetime('now'), retracted_by = ?
        WHERE trace_id = ?
      `).run(retractedBy, traceId)
      this._rebuildProjection(row.dimension, row.target_key)
    })
    transaction()
    return normalizeEvent(this.db.prepare('SELECT * FROM learning_events WHERE trace_id = ?').get(traceId))
  }

  _rebuildProjection(dimension, targetKey) {
    if (!targetKey) return
    if (dimension === 'goal') this.db.prepare('DELETE FROM learning_tracks WHERE id = ?').run(targetKey)
    else if (dimension === 'preference' || dimension === 'strategy') this.db.prepare('DELETE FROM learning_preferences WHERE id = ?').run(targetKey)
    else if (dimension === 'capability') this.db.prepare('DELETE FROM learning_capability_states WHERE capability_id = ?').run(targetKey)
    else this.db.prepare('DELETE FROM learning_concept_states WHERE concept_id = ?').run(targetKey)
    const rows = this.db.prepare(`
      SELECT * FROM learning_events
      WHERE target_key = ? AND status = 'active'
      ORDER BY occurred_at, created_at
    `).all(targetKey)
    for (const row of rows) this._projectEvent(normalizeEvent(row))
  }

  deleteByConversation(conversationId) {
    const transaction = this.db.transaction(() => {
      const targets = this.db.prepare(`
        SELECT DISTINCT dimension, target_key FROM learning_events
        WHERE conversation_id = ? AND target_key <> ''
      `).all(conversationId)
      this.db.prepare('DELETE FROM learning_events WHERE conversation_id = ?').run(conversationId)
      for (const target of targets) this._rebuildProjection(target.dimension, target.target_key)
    })
    transaction()
    return { success: true }
  }

  deleteByMessage(messageId) {
    const value = String(messageId || '').trim()
    if (!value) return { success: true }
    const transaction = this.db.transaction(() => {
      const eventRows = this.db.prepare(`
        SELECT trace_id, dimension, target_key FROM learning_events
        WHERE user_message_id = ? OR assistant_message_id = ?
      `).all(value, value)
      const deleteEvent = this.db.prepare('DELETE FROM learning_events WHERE trace_id = ?')
      for (const event of eventRows) deleteEvent.run(event.trace_id)

      const targets = new Map()
      for (const event of eventRows) {
        if (event.target_key) targets.set(`${event.dimension}\u0000${event.target_key}`, event)
      }
      for (const target of targets.values()) this._rebuildProjection(target.dimension, target.target_key)
    })
    transaction()
    return { success: true }
  }

  clearAll() {
    const clear = this.db.transaction(() => {
      for (const table of [
        'learning_preferences',
        'learning_capability_states',
        'learning_concept_states',
        'learning_tracks',
        'learning_events',
      ]) this.db.prepare(`DELETE FROM ${table}`).run()
    })
    clear()
    return { success: true }
  }
}
