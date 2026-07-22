export const MODEL_PROVIDER_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS llm_provider_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    region TEXT DEFAULT '',
    api_format TEXT DEFAULT 'openai',
    api_key TEXT DEFAULT '',
    api_key_id TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    builtin INTEGER DEFAULT 0,
    local INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS llm_model_profiles (
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    name TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    capabilities_json TEXT DEFAULT '{}',
    config_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (provider_id, model_id),
    FOREIGN KEY (provider_id) REFERENCES llm_provider_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_llm_provider_profiles_order
    ON llm_provider_profiles(sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_llm_model_profiles_provider_order
    ON llm_model_profiles(provider_id, sort_order);
`

export function createModelProviderTables(db) {
  db.exec(MODEL_PROVIDER_SCHEMA_SQL)
}
