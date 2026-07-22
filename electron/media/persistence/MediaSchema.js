export const MEDIA_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS media_sources (
    id TEXT PRIMARY KEY,
    media_type TEXT DEFAULT '',
    title TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    content_hash TEXT DEFAULT '',
    duration_ms INTEGER DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    current_run_id TEXT DEFAULT '',
    content_availability TEXT DEFAULT 'none',
    artifact_retention_policy TEXT DEFAULT 'referenced',
    pinned INTEGER DEFAULT 0,
    last_accessed_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS media_source_locations (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    location_type TEXT NOT NULL,
    locator TEXT NOT NULL,
    locator_ref TEXT DEFAULT '',
    normalized_locator TEXT DEFAULT '',
    platform TEXT DEFAULT '',
    platform_source_id TEXT DEFAULT '',
    cache_policy TEXT DEFAULT 'none',
    availability TEXT DEFAULT 'available',
    file_size INTEGER DEFAULT 0,
    mtime_ms REAL DEFAULT 0,
    file_identity_hash TEXT DEFAULT '',
    content_hash TEXT DEFAULT '',
    expires_at TEXT DEFAULT '',
    auth_ref TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media_sources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media_source_links (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    owner_type TEXT NOT NULL,
    owner_id TEXT DEFAULT '',
    owner_locator TEXT NOT NULL,
    state TEXT DEFAULT 'active',
    trash_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media_sources(id) ON DELETE CASCADE,
    UNIQUE (owner_type, owner_id, owner_locator, trash_id)
  );

  CREATE TABLE IF NOT EXISTS media_analysis_runs (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    source_location_id TEXT DEFAULT NULL,
    preset_id TEXT DEFAULT '',
    pipeline_version INTEGER DEFAULT 1,
    model_catalog_version INTEGER DEFAULT 1,
    config_json TEXT DEFAULT '{}',
    config_hash TEXT DEFAULT '',
    required_artifacts_json TEXT DEFAULT '[]',
    optional_artifacts_json TEXT DEFAULT '[]',
    stt_provider_id TEXT DEFAULT '',
    stt_model_id TEXT DEFAULT '',
    provider_job_id TEXT DEFAULT '',
    provider_job_status TEXT DEFAULT '',
    provider_job_meta_json TEXT DEFAULT '{}',
    provider_cancel_status TEXT DEFAULT '',
    result_download_status TEXT DEFAULT '',
    next_poll_at TEXT DEFAULT '',
    retry_count INTEGER DEFAULT 0,
    last_retry_at TEXT DEFAULT '',
    last_error_code TEXT DEFAULT '',
    retry_of_run_id TEXT DEFAULT '',
    status TEXT DEFAULT 'queued',
    stage TEXT DEFAULT '',
    progress INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    error_code TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    cancel_requested INTEGER DEFAULT 0,
    abandoned_at TEXT DEFAULT '',
    warnings_json TEXT DEFAULT '[]',
    input_duration_ms INTEGER DEFAULT 0,
    processed_duration_ms INTEGER DEFAULT 0,
    input_bytes INTEGER DEFAULT 0,
    output_bytes INTEGER DEFAULT 0,
    elapsed_ms INTEGER DEFAULT 0,
    provider_usage_json TEXT DEFAULT '{}',
    estimated_cost REAL DEFAULT NULL,
    heartbeat_at TEXT DEFAULT '',
    started_at TEXT DEFAULT '',
    finished_at TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media_sources(id) ON DELETE CASCADE,
    FOREIGN KEY (source_location_id) REFERENCES media_source_locations(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS media_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    variant TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    relative_path TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    size_bytes INTEGER DEFAULT 0,
    content_hash TEXT DEFAULT '',
    provider_id TEXT DEFAULT '',
    provider_model TEXT DEFAULT '',
    provider_meta_json TEXT DEFAULT '{}',
    schema_version INTEGER DEFAULT 1,
    depends_on TEXT DEFAULT '[]',
    error_code TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES media_analysis_runs(id) ON DELETE CASCADE,
    UNIQUE (run_id, type, variant)
  );

  CREATE TABLE IF NOT EXISTS media_segments (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    chapter_id TEXT DEFAULT '',
    start_ms INTEGER DEFAULT 0,
    end_ms INTEGER DEFAULT 0,
    text TEXT DEFAULT '',
    language TEXT DEFAULT '',
    speaker TEXT DEFAULT NULL,
    confidence REAL DEFAULT NULL,
    FOREIGN KEY (run_id) REFERENCES media_analysis_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media_chapters (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    start_ms INTEGER DEFAULT 0,
    end_ms INTEGER DEFAULT 0,
    title TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    keywords_json TEXT DEFAULT '[]',
    source_type TEXT DEFAULT '',
    FOREIGN KEY (run_id) REFERENCES media_analysis_runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media_frames (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    timestamp_ms INTEGER DEFAULT 0,
    image_path TEXT DEFAULT '',
    thumbnail_path TEXT DEFAULT '',
    linked_segment_ids TEXT DEFAULT '[]',
    FOREIGN KEY (run_id) REFERENCES media_analysis_runs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_media_locations_media
    ON media_source_locations(media_id, availability);
  CREATE INDEX IF NOT EXISTS idx_media_locations_locator
    ON media_source_locations(location_type, normalized_locator);
  CREATE INDEX IF NOT EXISTS idx_media_source_links_media
    ON media_source_links(media_id, state);
  CREATE INDEX IF NOT EXISTS idx_media_source_links_owner
    ON media_source_links(owner_type, owner_id, owner_locator, state);
  CREATE INDEX IF NOT EXISTS idx_media_runs_media_status
    ON media_analysis_runs(media_id, status, updated_at);
  CREATE INDEX IF NOT EXISTS idx_media_runs_waiting
    ON media_analysis_runs(stage, next_poll_at, status);
  CREATE INDEX IF NOT EXISTS idx_media_artifacts_run_type
    ON media_artifacts(run_id, type, status);
  CREATE INDEX IF NOT EXISTS idx_media_segments_timeline
    ON media_segments(run_id, start_ms);
  CREATE INDEX IF NOT EXISTS idx_media_chapters_timeline
    ON media_chapters(run_id, start_ms);
  CREATE INDEX IF NOT EXISTS idx_media_frames_timeline
    ON media_frames(run_id, timestamp_ms);
`

export function createMediaTables(db) {
  db.exec(MEDIA_SCHEMA_SQL)
}

