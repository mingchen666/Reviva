export const LEARNING_MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS learning_settings (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    allow_conversation_analysis INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO learning_settings (id) VALUES ('default');

  CREATE TABLE IF NOT EXISTS learning_events (
    trace_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    dimension TEXT NOT NULL DEFAULT 'learning',
    source_kind TEXT NOT NULL DEFAULT 'model_inferred',
    target_key TEXT DEFAULT '',
    target_label TEXT DEFAULT '',
    target_meaning TEXT DEFAULT '',
    track_id TEXT DEFAULT '',
    conversation_id TEXT DEFAULT '',
    user_message_id TEXT DEFAULT '',
    assistant_message_id TEXT DEFAULT '',
    source_agent_id TEXT DEFAULT '',
    source_agent_name TEXT DEFAULT '',
    source_skill_id TEXT DEFAULT '',
    context_json TEXT DEFAULT '{}',
    evidence_json TEXT DEFAULT '{}',
    confidence REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    occurred_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    retracted_at TEXT DEFAULT '',
    retracted_by TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_learning_events_target
    ON learning_events(dimension, target_key, status, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_events_conversation
    ON learning_events(conversation_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_learning_events_source
    ON learning_events(source_kind, occurred_at DESC);

  CREATE TABLE IF NOT EXISTS learning_tracks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    goal TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    priority INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT DEFAULT '[]',
    current_focus_json TEXT DEFAULT '[]',
    source_kind TEXT DEFAULT 'user_explicit',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    paused_at TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_learning_tracks_status
    ON learning_tracks(status, priority DESC, updated_at DESC);

  CREATE TABLE IF NOT EXISTS learning_concept_states (
    concept_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    meaning TEXT DEFAULT '',
    state_json TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'exposed',
    confidence REAL NOT NULL DEFAULT 0,
    active_misconceptions_json TEXT DEFAULT '[]',
    related_track_ids_json TEXT DEFAULT '[]',
    last_evidence_at TEXT DEFAULT '',
    evidence_count INTEGER NOT NULL DEFAULT 0,
    projection_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_learning_concepts_status
    ON learning_concept_states(status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS learning_capability_states (
    capability_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    meaning TEXT DEFAULT '',
    conditions_json TEXT DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'observed',
    evidence_summary_json TEXT DEFAULT '{}',
    confidence REAL NOT NULL DEFAULT 0,
    related_track_ids_json TEXT DEFAULT '[]',
    last_evidence_at TEXT DEFAULT '',
    evidence_count INTEGER NOT NULL DEFAULT 0,
    projection_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_learning_capabilities_status
    ON learning_capability_states(status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS learning_preferences (
    id TEXT PRIMARY KEY,
    dimension TEXT NOT NULL DEFAULT 'preference' CHECK (dimension IN ('preference', 'strategy')),
    strategy TEXT NOT NULL,
    meaning TEXT DEFAULT '',
    conditions_json TEXT DEFAULT '{}',
    source_kind TEXT NOT NULL DEFAULT 'model_inferred',
    confidence REAL NOT NULL DEFAULT 0,
    evidence_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'hypothesis',
    last_evidence_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_learning_preferences_status
    ON learning_preferences(status, updated_at DESC);

`;

export function createLearningMemoryTables(db) {
  db.exec(LEARNING_MEMORY_SCHEMA_SQL);
}
