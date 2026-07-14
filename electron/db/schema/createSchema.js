import { BaseRepository } from '../repositories/BaseRepository.js'

export class SchemaManager extends BaseRepository {
  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
        icon TEXT DEFAULT 'ri-folder-3-line', color TEXT DEFAULT '#6C8AFF', sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, space_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT DEFAULT '',
        size INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, file_path TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, space_id TEXT DEFAULT '', agent_id TEXT DEFAULT '',
        title TEXT DEFAULT '新对话', architecture TEXT DEFAULT '', model TEXT DEFAULT '',
        group_id TEXT DEFAULT 'default', context_length INTEGER DEFAULT 50,
        parent_conversation_id TEXT DEFAULT '', branched_from_message_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT DEFAULT '', meta TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT DEFAULT '', description TEXT DEFAULT '',
        icon TEXT DEFAULT 'ri-sparkling-2-line', color TEXT DEFAULT '#A78BFA', architecture TEXT DEFAULT 'react',
        builtin INTEGER DEFAULT 0, permissions TEXT DEFAULT '{}', tools TEXT DEFAULT '[]',
        skills TEXT DEFAULT '[]', sub_agents TEXT DEFAULT '[]', prompt TEXT DEFAULT '',
        max_iterations INTEGER DEFAULT 10, reflect_persist INTEGER DEFAULT 0,
        planning_model TEXT DEFAULT '', plan_steps INTEGER DEFAULT 5, complexity_classifier INTEGER DEFAULT 0,
        model TEXT DEFAULT '', temperature REAL DEFAULT 0.7, top_p REAL DEFAULT 1.0,
        max_tokens INTEGER DEFAULT 4096, presence_penalty REAL DEFAULT 0, frequency_penalty REAL DEFAULT 0,
        thinking_mode TEXT DEFAULT 'auto', thinking_intensity TEXT DEFAULT 'medium',
        builtin_key TEXT DEFAULT '', builtin_version TEXT DEFAULT '', builtin_template_hash TEXT DEFAULT '',
        builtin_template TEXT DEFAULT '{}', user_overrides TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_skills (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-flashlight-line',
        color TEXT DEFAULT '#6C8AFF', description TEXT DEFAULT '', detail TEXT DEFAULT '',
        prompt_template TEXT DEFAULT '', output_types TEXT DEFAULT '["Markdown"]', builtin INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_tools (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-tools-line',
        color TEXT DEFAULT '#4ADE80', category TEXT DEFAULT 'custom', description TEXT DEFAULT '',
        type TEXT DEFAULT 'api', api_url TEXT DEFAULT '', method TEXT DEFAULT 'POST',
        headers TEXT DEFAULT '{}', params TEXT DEFAULT '[]', response_format TEXT DEFAULT 'JSON',
        script_path TEXT DEFAULT '', sandbox TEXT DEFAULT '', perm_required TEXT DEFAULT '',
        arch_compat TEXT DEFAULT '["react","plan_exec","hybrid"]', builtin INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1, provider_config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS custom_sub_agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT 'ri-team-line',
        color TEXT DEFAULT '#6C8AFF', description TEXT DEFAULT '', prompt TEXT DEFAULT '',
        tools TEXT DEFAULT '[]', skills TEXT DEFAULT '[]', model TEXT DEFAULT '',
        temperature REAL DEFAULT 0.7, builtin INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'agent', status TEXT DEFAULT 'pending',
        architecture TEXT DEFAULT '', space_id TEXT DEFAULT '', agent_id TEXT DEFAULT '',
        skill_type TEXT DEFAULT '', progress INTEGER DEFAULT 0, steps TEXT DEFAULT '[]',
        result TEXT DEFAULT '', error TEXT DEFAULT '',
        tool_id TEXT DEFAULT '', mode TEXT DEFAULT 'local',
        conversation_id TEXT DEFAULT '', group_id TEXT DEFAULT 'default',
        params_json TEXT DEFAULT '{}', artifact_id TEXT DEFAULT '',
        cloud_task_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS wikis (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        path TEXT DEFAULT '',
        status TEXT DEFAULT 'ready',
        page_count INTEGER DEFAULT 0,
        source_count INTEGER DEFAULT 0,
        asset_count INTEGER DEFAULT 0,
        index_status TEXT DEFAULT 'empty',
        agent_config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wiki_sources (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        type TEXT DEFAULT 'file',
        title TEXT DEFAULT '',
        original_uri TEXT DEFAULT '',
        original_path TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        size INTEGER DEFAULT 0,
        extract_path TEXT DEFAULT '',
        parser_status TEXT DEFAULT '',
        parser_message TEXT DEFAULT '',
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS wiki_jobs (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        source_id TEXT DEFAULT '',
        type TEXT DEFAULT 'wiki',
        name TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        message TEXT DEFAULT '',
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS ocr_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'custom',
        mode TEXT DEFAULT 'remote',
        base_url TEXT DEFAULT '',
        api_key_ref TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS wiki_ocr_jobs (
        id TEXT PRIMARY KEY,
        wiki_id TEXT NOT NULL,
        source_id TEXT DEFAULT '',
        provider_id TEXT DEFAULT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        pages_total INTEGER DEFAULT 0,
        pages_done INTEGER DEFAULT 0,
        input_path TEXT DEFAULT '',
        output_manifest_path TEXT DEFAULT '',
        output_extract_path TEXT DEFAULT '',
        cache_path TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        metrics_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wiki_id) REFERENCES wikis(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES ocr_providers(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS pdf_documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT DEFAULT '',
        file_name TEXT DEFAULT '',
        real_path_hash TEXT DEFAULT '',
        file_size INTEGER DEFAULT 0,
        mtime_ms INTEGER DEFAULT 0,
        content_hash TEXT DEFAULT '',
        page_count INTEGER DEFAULT 0,
        pdf_text_mode TEXT DEFAULT '',
        cache_path TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        owners_json TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        last_accessed_at TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS pdf_source_links (
        id TEXT PRIMARY KEY,
        pdf_id TEXT NOT NULL,
        owner_type TEXT DEFAULT 'workspace_file',
        owner_id TEXT DEFAULT '',
        owner_locator TEXT COLLATE NOCASE NOT NULL,
        state TEXT DEFAULT 'active',
        trash_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pdf_id) REFERENCES pdf_documents(id) ON DELETE CASCADE,
        UNIQUE (owner_type, owner_id, owner_locator, trash_id)
      );
      CREATE TABLE IF NOT EXISTS pdf_parse_runs (
        id TEXT PRIMARY KEY,
        pdf_id TEXT NOT NULL,
        mode TEXT DEFAULT '',
        provider_id TEXT DEFAULT '',
        provider_type TEXT DEFAULT '',
        ocr_profile_key TEXT DEFAULT '',
        page_ranges_json TEXT DEFAULT '[]',
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        output_path TEXT DEFAULT '',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        metrics_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pdf_id) REFERENCES pdf_documents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS web_import_jobs (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_ref TEXT NOT NULL,
        requested_url TEXT NOT NULL,
        final_url TEXT DEFAULT '',
        provider TEXT NOT NULL,
        formats_json TEXT DEFAULT '["markdown"]',
        status TEXT DEFAULT 'pending',
        stage TEXT DEFAULT 'queued',
        progress INTEGER DEFAULT 0,
        title TEXT DEFAULT '',
        result_paths_json TEXT DEFAULT '[]',
        source_id TEXT DEFAULT '',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        usage_json TEXT DEFAULT '{}',
        retry_of TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT DEFAULT '',
        completed_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_wikis_status ON wikis(status);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_wiki ON wiki_sources(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_status ON wiki_sources(status);
      CREATE INDEX IF NOT EXISTS idx_wiki_sources_hash ON wiki_sources(content_hash);
      CREATE INDEX IF NOT EXISTS idx_wiki_jobs_wiki ON wiki_jobs(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_jobs_status ON wiki_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_ocr_providers_type ON ocr_providers(type);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_wiki ON wiki_ocr_jobs(wiki_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_source ON wiki_ocr_jobs(source_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_ocr_jobs_status ON wiki_ocr_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_pdf_documents_status ON pdf_documents(status);
      CREATE INDEX IF NOT EXISTS idx_pdf_documents_path_hash ON pdf_documents(real_path_hash);
      CREATE INDEX IF NOT EXISTS idx_pdf_source_links_pdf ON pdf_source_links(pdf_id, state);
      CREATE INDEX IF NOT EXISTS idx_pdf_source_links_owner ON pdf_source_links(owner_type, owner_id, owner_locator);
      CREATE INDEX IF NOT EXISTS idx_pdf_source_links_trash ON pdf_source_links(trash_id);
      CREATE INDEX IF NOT EXISTS idx_pdf_parse_runs_pdf ON pdf_parse_runs(pdf_id);
      CREATE INDEX IF NOT EXISTS idx_pdf_parse_runs_status ON pdf_parse_runs(status);
      CREATE INDEX IF NOT EXISTS idx_web_import_jobs_target ON web_import_jobs(target_type, target_ref, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_web_import_jobs_status ON web_import_jobs(status, updated_at);
      CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'summary',
        category TEXT DEFAULT 'desk', agent_name TEXT DEFAULT '', skill_name TEXT DEFAULT '',
        format TEXT DEFAULT 'Markdown', file_path TEXT DEFAULT '', file_size TEXT DEFAULT '',
        content TEXT DEFAULT '', space_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT DEFAULT 'http',
        url TEXT NOT NULL,
        headers TEXT DEFAULT '{}',
        enabled INTEGER DEFAULT 1,
        disabled_tools TEXT DEFAULT '[]',
        last_status TEXT DEFAULT '',
        last_error TEXT DEFAULT '',
        last_synced_at TEXT DEFAULT '',
        tools_cache TEXT DEFAULT '[]',
        resources_cache TEXT DEFAULT '[]',
        resource_templates_cache TEXT DEFAULT '[]',
        prompts_cache TEXT DEFAULT '[]',
        capabilities_cache TEXT DEFAULT '{}',
        server_info_cache TEXT DEFAULT '{}',
        instructions TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, type TEXT DEFAULT 'semantic', source TEXT DEFAULT '',
        content TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space_id);
      CREATE TABLE IF NOT EXISTS conv_groups (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_space ON conversations(space_id);
      CREATE INDEX IF NOT EXISTS idx_outputs_category ON outputs(category);
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'default',
        conversation_id TEXT DEFAULT '',
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT DEFAULT 'ri-file-line',
        color TEXT DEFAULT 'brand',
        storage_type TEXT NOT NULL,
        file_path TEXT DEFAULT '',
        content TEXT DEFAULT '',
        agent_name TEXT DEFAULT '',
        skill_name TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (group_id) REFERENCES conv_groups(id)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_group ON artifacts(group_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id);
      CREATE TABLE IF NOT EXISTS recycle_bin (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        original_name TEXT NOT NULL,
        trash_path TEXT NOT NULL,
        is_directory INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        file_type TEXT DEFAULT '',
        category TEXT DEFAULT 'other',
        item_type TEXT DEFAULT 'file',
        item_id TEXT DEFAULT '',
        payload_json TEXT DEFAULT '',
        deleted_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_at ON recycle_bin(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_recycle_bin_category ON recycle_bin(category);
      CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_write_tokens INTEGER DEFAULT 0,
        thinking_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        agent_id TEXT DEFAULT '',
        conversation_id TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(provider_id, model_id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at);
      CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        parent_run_id TEXT DEFAULT '',
        status TEXT DEFAULT 'running',
        iterations INTEGER DEFAULT 0,
        max_iterations INTEGER DEFAULT 10,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        steps TEXT DEFAULT '[]',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        compressed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_conv ON agent_runs(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);

      CREATE TABLE IF NOT EXISTS note_folders (
        id TEXT PRIMARY KEY,
        parent_id TEXT DEFAULT '',
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'ri-folder-line',
        color TEXT DEFAULT '#6C8AFF',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_note_folders_parent ON note_folders(parent_id);

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        file_path TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
    `)
  }

}

