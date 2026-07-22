export const SPEECH_PROVIDER_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS stt_provider_profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    adapter_id TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    model_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tts_provider_profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    adapter_id TEXT DEFAULT '',
    base_url TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    model_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_stt_provider_profiles_order
    ON stt_provider_profiles(sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_tts_provider_profiles_order
    ON tts_provider_profiles(sort_order, id);
`

export function createSpeechProviderTables(db) {
  db.exec(SPEECH_PROVIDER_SCHEMA_SQL)
}
