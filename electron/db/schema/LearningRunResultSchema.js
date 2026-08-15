export function createLearningRunResultTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_run_results (
      run_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      assistant_message_id TEXT DEFAULT '',
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      markdown TEXT DEFAULT '',
      citations_json TEXT DEFAULT '[]',
      source_refs_json TEXT DEFAULT '[]',
      citation_map_json TEXT DEFAULT '{}',
      source_style TEXT DEFAULT 'footnotes',
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_learning_run_results_conversation
      ON learning_run_results(conversation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_learning_run_results_status
      ON learning_run_results(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_learning_run_results_updated
      ON learning_run_results(updated_at DESC);
  `)
}
