import { parseJSON } from '../../helpers.js'
import { BaseRepository } from '../../repositories/BaseRepository.js'

export class LegacyMigrationManager extends BaseRepository {
  _ensureArtifactsTable() {
    const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'").get()
    if (!table) {
      this.db.exec(`
        CREATE TABLE artifacts (
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
        )
      `)
      console.log('[DB] Migrated: created artifacts table')
    }

    const cols = this.db.prepare('PRAGMA table_info(artifacts)').all()
    const newCols = [
      ['group_id', "TEXT NOT NULL DEFAULT 'default'"],
      ['conversation_id', "TEXT DEFAULT ''"],
      ['icon', "TEXT DEFAULT 'ri-file-line'"],
      ['color', "TEXT DEFAULT 'brand'"],
      ['storage_type', "TEXT DEFAULT 'data'"],
      ['file_path', "TEXT DEFAULT ''"],
      ['content', "TEXT DEFAULT ''"],
      ['agent_name', "TEXT DEFAULT ''"],
      ['skill_name', "TEXT DEFAULT ''"],
      ['updated_at', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of newCols) {
      if (!cols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE artifacts ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to artifacts`)
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_group ON artifacts(group_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_conv ON artifacts(conversation_id)')
  }

  _ensureTaskGenerationColumns(taskCols = null) {
    const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get()
    if (!table) return
    const cols = taskCols || this.db.prepare('PRAGMA table_info(tasks)').all()
    const newCols = [
      ['status', "TEXT DEFAULT 'pending'"],
      ['tool_id', "TEXT DEFAULT ''"],
      ['mode', "TEXT DEFAULT 'local'"],
      ['conversation_id', "TEXT DEFAULT ''"],
      ['group_id', "TEXT DEFAULT 'default'"],
      ['params_json', "TEXT DEFAULT '{}'"],
      ['artifact_id', "TEXT DEFAULT ''"],
      ['cloud_task_id', "TEXT DEFAULT ''"],
      ['updated_at', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of newCols) {
      if (!cols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to tasks`)
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_tool ON tasks(tool_id)')
  }

  _ensureCreationCenterSubAgentSeeds() {
    const seeds = [
      { id: 'sa_web-researcher', name: '网络搜索研究员', icon: 'ri-global-line', color: '#38BDF8', desc: '对给定主题进行网络搜索研究，返回带引用编号的发现', prompt: '你是一位专业的网络搜索研究员。对用户指定的主题进行深入的网络搜索研究。先宽后窄检索，优先选择权威、近期、可核验的来源。每条关键发现都给出 [1] 格式引用，并在末尾列出 Sources。始终使用中文描述发现。', tools: ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing'] },
      { id: 'sa_local-analyst', name: '本地资料分析员', icon: 'ri-folder-open-line', color: '#4ADE80', desc: '读取和分析用户提供的本地文件，提取关键信息', prompt: '你是一位专业的本地资料分析员。读取和分析用户提供的文件，提取核心论点、关键数据、重要结论和潜在问题。Office/PDF 文档必须优先使用 document_read；需要文档内图片或图文并茂回答时调用 document_read(intent="extract_images")，并用返回的 assets[].path 写 Markdown 图片或交给 vision_analyze。Python、zip 解包或底层脚本仅作为 document_read/底层读取工具不可用、能力不足或用户明确要求底层诊断时的备用方案。标注来源文件，对跨文件矛盾信息标注 [矛盾]。输出分析发现，不要撰写最终报告。', tools: ['file_read', 'document_read', 'kb_search'] },
      { id: 'sa_report-writer', name: '报告撰写员', icon: 'ri-file-edit-line', color: '#FACC15', desc: '综合所有研究发现，撰写 Markdown 研究报告和 HTML 可视化报告', prompt: '你是一位专业的研究报告撰写员。综合本地分析和网络研究发现，撰写结构清晰、引用完整的中文研究报告。需要创建文件时写入 /agents/deep-researcher/outputs/{date}/。不要编造来源。', tools: ['file_read', 'file_write'] },
      { id: 'sa_content-planner', name: '内容规划师', icon: 'ri-layout-4-line', color: '#6C8AFF', desc: '分析资料，规划 PPT 内容结构和叙事逻辑', prompt: '你是一位专业的演示文稿内容规划师。分析资料和用户需求，确定演示目标、受众、叙事模式和页面结构。输出包含标题、副标题、页面类型、要点和视觉建议的 JSON 大纲。', tools: ['file_read', 'kb_search', 'mcp:exa', 'web_search_bing'] },
      { id: 'sa_slide-builder', name: '幻灯片构建师', icon: 'ri-code-s-slash-line', color: '#4ADE80', desc: '根据大纲生成 HTML 幻灯片', prompt: '你是一位专业的 HTML 演示文稿开发师。根据内容大纲生成单文件 HTML 幻灯片，注意布局、配色、字号、动画和响应式。每页使用 <div class="slide slide-{type}" data-type="{type}"> 根容器。输出写入 /agents/ppt-generator/outputs/{date}/。', tools: ['file_write'] },
      { id: 'sa_pptx-exporter', name: 'PPTX 导出师', icon: 'ri-file-ppt-line', color: '#FACC15', desc: '将 HTML 演示文稿导出为可编辑的 PPTX 格式', prompt: '你是一位 PPTX 文件导出专家。读取 HTML 演示文稿，使用 pptx_export_local 工具导出可编辑 PPTX，并确认输出路径。PPTX 文件写入与 HTML 相同目录。', tools: ['file_read', 'pptx_export_local'] },
      { id: 'sa_visual-reviewer', name: '视觉审查员', icon: 'ri-eye-line', color: '#F87171', desc: '审查 PPT 视觉效果，检查布局、配色、可读性', prompt: '你是一位专业的演示文稿视觉审查师。检查布局、配色对比度、视觉层级、内容精炼度和风格一致性。输出 passed、score 和具体 issues，不要重写全文。', tools: ['file_read'] },
    ]

    const insert = this.db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`)
    let inserted = 0
    for (const sa of seeds) {
      const exists = this.db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
      if (exists) continue
      insert.run(sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools))
      inserted += 1
    }
    const slideSeed = seeds.find(sa => sa.id === 'sa_slide-builder')
    const slideRow = this.db.prepare('SELECT prompt, builtin FROM custom_sub_agents WHERE id = ?').get('sa_slide-builder')
    if (slideSeed && slideRow?.builtin && !String(slideRow.prompt || '').includes('data-type="{type}"')) {
      this.db.prepare('UPDATE custom_sub_agents SET prompt = ? WHERE id = ?').run(slideSeed.prompt, 'sa_slide-builder')
    }

    const pptxSeed = seeds.find(sa => sa.id === 'sa_pptx-exporter')
    const pptxRow = this.db.prepare('SELECT tools, prompt, builtin FROM custom_sub_agents WHERE id = ?').get('sa_pptx-exporter')
    if (pptxSeed && pptxRow?.builtin) {
      const tools = parseJSON(pptxRow.tools)
      if (Array.isArray(tools) && !tools.includes('pptx_export_local')) {
        this.db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(
          JSON.stringify([...new Set([...tools.filter(Boolean), 'pptx_export_local'])]),
          'sa_pptx-exporter',
        )
      }
      if (!String(pptxRow.prompt || '').includes('pptx_export_local')) {
        this.db.prepare('UPDATE custom_sub_agents SET prompt = ? WHERE id = ?').run(pptxSeed.prompt, 'sa_pptx-exporter')
      }
    }

    const contentPlannerSeed = seeds.find(sa => sa.id === 'sa_content-planner')
    const contentPlannerRow = this.db.prepare('SELECT tools, builtin FROM custom_sub_agents WHERE id = ?').get('sa_content-planner')
    if (contentPlannerSeed && contentPlannerRow?.builtin) {
      const tools = parseJSON(contentPlannerRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...contentPlannerSeed.tools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && !contentPlannerSeed.tools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this.db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(JSON.stringify(nextTools), 'sa_content-planner')
        }
      }
    }

    const webResearcherSeed = seeds.find(sa => sa.id === 'sa_web-researcher')
    const webResearcherRow = this.db.prepare('SELECT tools, builtin FROM custom_sub_agents WHERE id = ?').get('sa_web-researcher')
    if (webResearcherSeed && webResearcherRow?.builtin) {
      const tools = parseJSON(webResearcherRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...webResearcherSeed.tools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && t !== 'web_scrape' && !webResearcherSeed.tools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this.db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(JSON.stringify(nextTools), 'sa_web-researcher')
        }
      }
    }

    const localAnalystSeed = seeds.find(sa => sa.id === 'sa_local-analyst')
    const localAnalystRow = this.db.prepare('SELECT tools, prompt, builtin FROM custom_sub_agents WHERE id = ?').get('sa_local-analyst')
    if (localAnalystSeed && localAnalystRow?.builtin) {
      const tools = parseJSON(localAnalystRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...localAnalystSeed.tools,
          ...tools.filter(t => t && !['office_read', 'pdf_read'].includes(t) && !localAnalystSeed.tools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this.db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?').run(JSON.stringify(nextTools), 'sa_local-analyst')
        }
      }
      if (!String(localAnalystRow.prompt || '').includes('document_read')) {
        const nextPrompt = [
          String(localAnalystRow.prompt || localAnalystSeed.prompt || '').trim(),
          '## 文档读取',
          '- 对 Office/PDF 文档优先使用 document_read；普通文本使用 file_read。',
          '- 需要文档内图片或图文并茂回答时调用 document_read(intent="extract_images")，并用返回的 assets[].path 写 Markdown 图片或交给 vision_analyze。',
          '- Python、zip 解包或底层脚本仅作为 document_read/底层读取工具不可用、能力不足或用户明确要求底层诊断时的备用方案。',
        ].filter(Boolean).join('\n\n')
        this.db.prepare('UPDATE custom_sub_agents SET prompt = ? WHERE id = ?').run(nextPrompt, 'sa_local-analyst')
      }
    }
    if (inserted) console.log(`[DB] Migrated: ensured ${inserted} creation-center sub-agents`)
  }

  _ensureCreationCenterAgentPrompts() {
    const agentCols = this.db.prepare("PRAGMA table_info(agents)").all()
    if (agentCols.some(c => c.name === 'builtin_template')) return

    const pptPrompt = [
      '你是一位专业的演示文稿设计师，负责协调 content-planner、slide-builder、pptx-exporter、visual-reviewer 子 agent 生成演示文稿。',
      '',
      '## 输出格式规则',
      '- 从用户消息的 [用户配置] 中读取输出格式，合法值为 html / pptx-local / pptx-cloud。',
      '- 如果用户没有明确指定输出格式，默认 html。',
      '- 始终先生成 HTML 演示文稿。',
      '- 仅当输出格式明确为 pptx-local 时，才委托 pptx-exporter 导出 PPTX。',
      '- 当输出格式为 html 时，不要调用 pptx-exporter。',
      '- 当输出格式为 pptx-cloud 时，提示用户"云端高质量 PPTX 导出即将上线，当前已输出 HTML 版本"，不要调用 pptx-exporter。',
      '',
      '## 工作流程',
      '1. 委托 content-planner 根据资料、场景、页数规划内容大纲。',
      '2. 委托 slide-builder 根据大纲生成单文件 HTML 幻灯片，写入 /agents/ppt-generator/outputs/{date}/。',
      '3. 如输出格式为 pptx-local，委托 pptx-exporter 将 HTML 文件导出为同目录 PPTX。',
      '4. 委托 visual-reviewer 审查最终文件，最多 2 轮修改。',
      '',
      '严格遵循用户选择的场景、格式和页数。每页内容精炼，避免文字堆砌。数据页使用图表而非纯文字。始终使用中文。',
    ].join('\n')

    const row = this.db.prepare("SELECT prompt, tools, builtin FROM agents WHERE english_name = 'ppt-generator'").get()
    if (row?.builtin && !String(row.prompt || '').includes('输出格式规则')) {
      this.db.prepare("UPDATE agents SET prompt = ? WHERE english_name = 'ppt-generator' AND builtin = 1").run(pptPrompt)
      console.log('[DB] Migrated: updated ppt-generator output-format prompt')
    }
    if (row?.builtin) {
      const defaultTools = ['mcp:exa', 'web_search_bing', 'file_read', 'file_write', 'kb_search']
      const tools = parseJSON(row.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...defaultTools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && !defaultTools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this.db.prepare("UPDATE agents SET tools = ? WHERE english_name = 'ppt-generator' AND builtin = 1").run(JSON.stringify(nextTools))
          console.log('[DB] Migrated: updated ppt-generator search tools')
        }
      }
    }

    const researchRow = this.db.prepare("SELECT tools, builtin FROM agents WHERE english_name = 'deep-researcher'").get()
    if (researchRow?.builtin) {
      const defaultTools = ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing', 'file_read', 'file_write', 'kb_search']
      const tools = parseJSON(researchRow.tools)
      if (Array.isArray(tools)) {
        const nextTools = [
          ...defaultTools,
          ...tools.filter(t => t && t !== 'web_search_tavily' && t !== 'web_scrape' && !defaultTools.includes(t)),
        ]
        if (JSON.stringify(nextTools) !== JSON.stringify(tools)) {
          this.db.prepare("UPDATE agents SET tools = ? WHERE english_name = 'deep-researcher' AND builtin = 1").run(JSON.stringify(nextTools))
          console.log('[DB] Migrated: updated deep-researcher search tools')
        }
      }
    }
  }

  _migrateTables() {
    // Memories: migrate old type values to DeepAgents types
    // 'custom'/'preference' → 'semantic', 'system' → 'episodic'
    const oldTypes = this.db.prepare("SELECT DISTINCT type FROM memories").all()
    for (const row of oldTypes) {
      if (row.type === 'custom' || row.type === 'preference') {
        this.db.prepare('UPDATE memories SET type = \'semantic\' WHERE type = ?').run(row.type)
        console.log(`[DB] Migrated: memories type '${row.type}' → 'semantic'`)
      } else if (row.type === 'system') {
        this.db.prepare('UPDATE memories SET type = \'episodic\' WHERE type = ?').run(row.type)
        console.log(`[DB] Migrated: memories type 'system' → 'episodic'`)
      }
    }
    // Drop scope column if it exists (from earlier migration)
    const memCols = this.db.prepare("PRAGMA table_info(memories)").all()
    if (memCols.some(c => c.name === 'scope')) {
      // SQLite doesn't support DROP COLUMN before 3.35.0, recreate table
      this.db.exec(`
        CREATE TABLE memories_backup AS SELECT id, type, source, content, created_at, updated_at FROM memories;
        DROP TABLE memories;
        ALTER TABLE memories_backup RENAME TO memories;
      `)
      console.log('[DB] Migrated: removed scope column from memories')
    }

    const cols = this.db.prepare("PRAGMA table_info(token_usage)").all()
    const hasThinking = cols.some(c => c.name === 'thinking_tokens')
    if (!hasThinking) {
      this.db.exec('ALTER TABLE token_usage ADD COLUMN thinking_tokens INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added thinking_tokens column')
    }
    const convCols = this.db.prepare("PRAGMA table_info(conversations)").all()
    if (!convCols.some(c => c.name === 'group_id')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN group_id TEXT DEFAULT \'default\'')
      console.log('[DB] Migrated: added group_id column to conversations')
    }
    if (!convCols.some(c => c.name === 'context_length')) {
      this.db.exec('ALTER TABLE conversations ADD COLUMN context_length INTEGER DEFAULT 50')
      console.log('[DB] Migrated: added context_length column to conversations')
    }
    if (!convCols.some(c => c.name === 'parent_conversation_id')) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added parent_conversation_id column to conversations')
    }
    if (!convCols.some(c => c.name === 'branched_from_message_id')) {
      this.db.exec("ALTER TABLE conversations ADD COLUMN branched_from_message_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added branched_from_message_id column to conversations')
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_group ON conversations(group_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_parent ON conversations(parent_conversation_id)')
    // Messages table: add chat metadata columns
    const msgCols = this.db.prepare("PRAGMA table_info(messages)").all()
    const msgNewCols = [
      ['status', 'TEXT DEFAULT \'completed\''],
      ['model_id', 'TEXT DEFAULT \'\''],
      ['provider_id', 'TEXT DEFAULT \'\''],
      ['input_tokens', 'INTEGER DEFAULT 0'],
      ['output_tokens', 'INTEGER DEFAULT 0'],
      ['cache_read_tokens', 'INTEGER DEFAULT 0'],
      ['cache_write_tokens', 'INTEGER DEFAULT 0'],
      ['thinking_tokens', 'INTEGER DEFAULT 0'],
      ['latency_ms', 'INTEGER DEFAULT 0'],
      ['cost', 'REAL DEFAULT 0'],
      ['error_message', 'TEXT DEFAULT \'\''],
      ['error_code', 'TEXT DEFAULT \'\''],
      ['parent_msg_id', 'TEXT DEFAULT \'\''],
      ['thinking_content', 'TEXT DEFAULT \'\''],
    ]
    for (const [col, def] of msgNewCols) {
      if (!msgCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE messages ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to messages`)
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(provider_id, model_id)')

    // custom_skills table: add new skill columns
    const skillCols = this.db.prepare("PRAGMA table_info(custom_skills)").all()
    const skillNewCols = [
      ['source', "TEXT DEFAULT 'custom'"],
      ['category', "TEXT DEFAULT ''"],
      ['prompt_content', "TEXT DEFAULT ''"],
      ['allowed_tools', "TEXT DEFAULT '[]'"],
      ['version', "TEXT DEFAULT '1.0'"],
      ['author', "TEXT DEFAULT ''"],
      ['license', "TEXT DEFAULT ''"],
      ['enabled', 'INTEGER DEFAULT 1'],
    ]
    for (const [col, def] of skillNewCols) {
      if (skillCols.length > 0 && !skillCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE custom_skills ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to custom_skills`)
      }
    }
    // custom_tools table: add enabled and provider_config columns
    const toolCols = this.db.prepare("PRAGMA table_info(custom_tools)").all()
    const toolNewCols = [
      ['enabled', 'INTEGER DEFAULT 1'],
      ['provider_config', "TEXT DEFAULT '{}'"],
    ]
    for (const [col, def] of toolNewCols) {
      if (toolCols.length > 0 && !toolCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE custom_tools ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to custom_tools`)
      }
    }
    // Update existing tool category values from old system
    if (toolCols.length > 0) {
      this.db.prepare("UPDATE custom_tools SET category = 'custom' WHERE category = '外部' OR category = '云端'").run()
      this.db.prepare("UPDATE custom_tools SET category = 'filesystem' WHERE category = '本地'").run()
    }

    // mcp_servers table: add non-tool MCP capability caches
    const mcpCols = this.db.prepare("PRAGMA table_info(mcp_servers)").all()
    const mcpNewCols = [
      ['resources_cache', "TEXT DEFAULT '[]'"],
      ['resource_templates_cache', "TEXT DEFAULT '[]'"],
      ['prompts_cache', "TEXT DEFAULT '[]'"],
      ['capabilities_cache', "TEXT DEFAULT '{}'"],
      ['server_info_cache', "TEXT DEFAULT '{}'"],
      ['instructions', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of mcpNewCols) {
      if (mcpCols.length > 0 && !mcpCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE mcp_servers ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to mcp_servers`)
      }
    }

    // Messages table: add run_id and step_index columns
    const msgCols2 = this.db.prepare("PRAGMA table_info(messages)").all()
    if (!msgCols2.some(c => c.name === 'run_id')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN run_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added run_id column to messages')
    }
    if (!msgCols2.some(c => c.name === 'step_index')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN step_index INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added step_index column to messages')
    }
    if (!msgCols2.some(c => c.name === 'thinking_content')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN thinking_content TEXT DEFAULT ''")
      console.log('[DB] Migrated: added thinking_content column to messages')
    }

    // Token usage table: add run_id and iteration columns
    const tuCols = this.db.prepare("PRAGMA table_info(token_usage)").all()
    if (!tuCols.some(c => c.name === 'run_id')) {
      this.db.exec("ALTER TABLE token_usage ADD COLUMN run_id TEXT DEFAULT ''")
      console.log('[DB] Migrated: added run_id column to token_usage')
    }
    if (!tuCols.some(c => c.name === 'iteration')) {
      this.db.exec('ALTER TABLE token_usage ADD COLUMN iteration INTEGER DEFAULT 0')
      console.log('[DB] Migrated: added iteration column to token_usage')
    }

    // Agents table: add thinking_mode and thinking_intensity columns
    const agentCols = this.db.prepare("PRAGMA table_info(agents)").all()
    if (!agentCols.some(c => c.name === 'thinking_mode')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN thinking_mode TEXT DEFAULT 'auto'")
      console.log('[DB] Migrated: added thinking_mode column to agents')
    }
    if (!agentCols.some(c => c.name === 'thinking_intensity')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN thinking_intensity TEXT DEFAULT 'medium'")
      console.log('[DB] Migrated: added thinking_intensity column to agents')
    }
    if (!agentCols.some(c => c.name === 'english_name')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN english_name TEXT DEFAULT ''")
      console.log('[DB] Migrated: added english_name column to agents')
    }
    if (!agentCols.some(c => c.name === 'reviewer_model')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN reviewer_model TEXT DEFAULT ''")
      console.log('[DB] Migrated: added reviewer_model column to agents')
    }
    if (!agentCols.some(c => c.name === 'use_same_model')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN use_same_model INTEGER DEFAULT 1")
      console.log('[DB] Migrated: added use_same_model column to agents')
    }
    if (!agentCols.some(c => c.name === 'tool_call_limit')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN tool_call_limit INTEGER DEFAULT 0")
      console.log('[DB] Migrated: added tool_call_limit column to agents')
    }
    if (!agentCols.some(c => c.name === 'model_call_limit')) {
      this.db.exec("ALTER TABLE agents ADD COLUMN model_call_limit INTEGER DEFAULT 0")
      console.log('[DB] Migrated: added model_call_limit column to agents')
    }
    const builtinAgentCols = [
      ['builtin_key', "TEXT DEFAULT ''"],
      ['builtin_version', "TEXT DEFAULT ''"],
      ['builtin_template_hash', "TEXT DEFAULT ''"],
      ['builtin_template', "TEXT DEFAULT '{}'"],
      ['user_overrides', "TEXT DEFAULT '{}'"],
    ]
    for (const [col, def] of builtinAgentCols) {
      if (!agentCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE agents ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to agents`)
      }
    }
    // Unique index on english_name (excluding empty strings — multiple agents can have no english_name)
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_english_name ON agents(english_name) WHERE english_name != ''")
    console.log('[DB] Migrated: added unique index on agents.english_name')
    // Seed english_name for built-in agents that don't have one
    const builtinEnglishNameById = {
      agent_researcher: 'deep-researcher',
      agent_ppt: 'ppt-generator',
      agent_lab_report: 'lab-report-assistant',
      agent_mindmap: 'mindmap-generator',
      agent_graph: 'graph-generator',
      agent_flashcard: 'flashcard-generator',
      agent_quiz: 'quiz-generator',
      agent_chart: 'chart-generator',
    }
    const builtinEnglishNameByName = {
      '深度研究员': 'deep-researcher',
      'PPT 生成器': 'ppt-generator',
      '实验报告助手': 'lab-report-assistant',
      '思维导图生成器': 'mindmap-generator',
      '知识图谱生成器': 'graph-generator',
    }
    const builtins = this.db.prepare("SELECT id, name, english_name FROM agents WHERE builtin = 1 AND (english_name IS NULL OR english_name = '')").all()
    for (const b of builtins) {
      const en = builtinEnglishNameById[b.id] || builtinEnglishNameByName[b.name] || b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (en) {
        try {
          this.db.prepare('UPDATE agents SET english_name = ? WHERE id = ?').run(en, b.id)
          console.log('[DB] Migrated: set english_name for builtin agent', b.id, '→', en)
        } catch (e) {
          console.warn('[DB] Could not set english_name for', b.id, ':', e.message)
        }
      }
    }

    this._ensureArtifactsTable()

    // ─── Seed lab-report-assistant builtin agent ───
    const labReportExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'lab-report-assistant'").get()
    if (!labReportExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_lab_report', '实验报告助手', 'lab-report-assistant',
        '根据实验要求、模板、数据和资料生成或完善专业实验报告，支持 Word 文档输出和模板编辑',
        'ri-flask-line', '#14B8A6', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['document_read', 'office_write', 'file_read', 'file_write', 'kb_search', 'web_search_bing']),
        JSON.stringify(['lab-report-writer', 'officecli-skills']),
        JSON.stringify([]),
        '你是一位专业的实验报告写作与 Office 文档整理助手。根据用户提供的实验要求、模板、数据、图片和课程资料，生成或完善可提交的实验报告。\n\n## 工作要求\n- 默认输出 Word 文档；用户明确要求草稿时可输出 Markdown。\n- 有模板时先用 document_read 理解结构，再用 office_write 编辑副本，保留原模板样式，不覆盖源文件。\n- 无模板时生成完整结构：封面、摘要、实验目的、实验原理、仪器材料、实验步骤、数据记录与处理、结果分析、误差分析、结论、思考题、参考文献、附录。\n- 优先依据用户文件和知识库；需要补充实验原理时可使用搜索，但不要把搜索内容伪装成用户实验数据。\n- 不编造姓名学号、教师要求、仪器型号、真实数据、参考文献页码或实验照片；缺失项写“待补充”。\n- 数据表必须有列名和单位，结论必须对应数据或资料。\n- 输出写入 /agents/lab-report-assistant/outputs/{date}/，最终回复列出文件路径和仍需补充的信息。',
        10, 5, 0.25, 16384, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded lab-report-assistant builtin agent')
    }

    // ─── Seed deep-researcher builtin agent (migrate for existing DBs) ───
    const researcherExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'deep-researcher'").get()
    if (!researcherExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_researcher', '深度研究员', 'deep-researcher',
        '对文件和网上信息进行深度研究，生成 Markdown 研究报告和 HTML 可视化报告',
        'ri-search-eye-line', '#38BDF8', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing', 'file_read', 'file_write', 'kb_search']),
        JSON.stringify(['deep-research']),
        JSON.stringify(['web-researcher', 'local-analyst', 'report-writer']),
        '你是一位专业的研究分析师。深入研究用户提供的资料，结合互联网信息，生成全面、准确、有见地的研究报告。\n\n始终使用中文撰写报告。每个论断都要有来源引用，标注[本地]或[网络]。对信息进行交叉验证，标注矛盾和不确定性。',
        15, 7, 0.3, 8192, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded deep-researcher builtin agent')

      // Seed deep-researcher sub-agents
      const saSeeds = [
        { id: 'sa_web-researcher', name: '网络搜索研究员', icon: 'ri-global-line', color: '#38BDF8', desc: '对给定主题进行网络搜索研究，返回带引用编号的发现', prompt: '你是一位专业的网络搜索研究员。对用户指定的主题进行深入的网络搜索研究。\n\n## 搜索策略\n- 搜索预算：简单查询 2-3 次搜索，复杂查询最多 5 次\n- 先宽后窄：先广泛搜索，再针对性补充\n- 找到 3+ 相关来源即可停止，不追求完美\n\n## 引用格式\n- 使用 [1], [2], [3] 格式内联引用\n- 末尾列出 ### Sources，格式：[编号] 标题: URL\n\n## 返回格式\n## 关键发现\n详细描述发现...\n\n### Sources\n[1] 标题: URL\n[2] 标题: URL', tools: ['mcp:exa', 'mcp:jina-mcp-server', 'web_search_bing'] },
        { id: 'sa_local-analyst', name: '本地资料分析员', icon: 'ri-folder-open-line', color: '#4ADE80', desc: '读取和分析用户提供的本地文件，提取关键信息', prompt: '你是一位专业的本地资料分析员。读取和分析用户提供的文件，提取关键信息。\n\n## 分析要点\n- 提取：核心论点、关键数据、重要结论、潜在问题\n- 标注文件来源（哪个文件、哪一节）\n- 对 Office/PDF 文档优先使用 document_read，普通文本使用 file_read\n- 需要文档内图片或图文并茂回答时调用 document_read(intent="extract_images")，并用返回的 assets[].path 写 Markdown 图片或交给 vision_analyze\n- Python、zip 解包或底层脚本仅作为 document_read/底层读取工具不可用、能力不足或用户明确要求底层诊断时的备用方案\n- 对矛盾信息标注 [⚠️ 矛盾]\n\n## 返回格式\n## 本地资料摘要\n### 文件1: 文件名\n- 核心论点：...\n- 关键数据：...\n- 重要结论：...\n\n### 跨文件发现\n- 共同主题：...\n- 矛盾点：[⚠️ 矛盾] ...', tools: ['file_read', 'document_read', 'kb_search'] },
        { id: 'sa_report-writer', name: '报告撰写员', icon: 'ri-file-edit-line', color: '#FACC15', desc: '综合所有研究发现，撰写 Markdown 研究报告和 HTML 可视化报告', prompt: '你是一位专业的研究报告撰写员。综合所有子 agent 的研究发现，撰写完整的研究报告。\n\n## 报告要求\n\n### Markdown 报告\n- 结构：摘要 → 背景 → 分析 → 结论 → 来源\n- 统一引用编号（每个 URL 一个编号，跨所有子 agent 发现统一编排）\n- 使用中文撰写\n- 每个论断都有来源引用\n\n### HTML 可视化报告\n- 完全自包含（内联 CSS/JS，无外部依赖）\n- 响应式布局（max-width: 960px）\n- 中文排版优化\n- 左侧粘性锚点目录（IntersectionObserver）\n- 关键发现彩色卡片\n- 内联 SVG 图表\n- 来源可点击链接\n- prefers-color-scheme 暗色模式\n- 系统字体栈\n\n## 输出路径\n- Markdown: /agents/deep-researcher/outputs/{date}/research-report.md\n- HTML: /agents/deep-researcher/outputs/{date}/research-report.html', tools: ['file_write'] },
      ]
      for (const sa of saSeeds) {
        const exists = this.db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
        if (!exists) {
          this.db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`).run(
            sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools)
          )
        }
      }
      console.log('[DB] Migrated: seeded deep-researcher sub-agents')
    }

    // ─── Seed ppt-generator builtin agent ───
    const pptExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'ppt-generator'").get()
    if (!pptExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_ppt', 'PPT 生成器', 'ppt-generator',
        '根据资料和需求生成精美演示文稿，支持 HTML 和 PPTX 格式',
        'ri-slideshow-line', '#6C8AFF', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: true, webSearch: true, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['mcp:exa', 'web_search_bing', 'file_read', 'file_write', 'kb_search']),
        JSON.stringify(['ppt-creation']),
        JSON.stringify(['content-planner', 'slide-builder', 'pptx-exporter', 'visual-reviewer']),
        '你是一位专业的演示文稿设计师，负责协调 content-planner、slide-builder、pptx-exporter、visual-reviewer 子 agent 生成演示文稿。\n\n## 输出格式规则\n- 从用户消息的 [用户配置] 中读取输出格式，合法值为 html / pptx-local / pptx-cloud。\n- 如果用户没有明确指定输出格式，默认 html。\n- 始终先生成 HTML 演示文稿。\n- 仅当输出格式明确为 pptx-local 时，才委托 pptx-exporter 导出 PPTX。\n- 当输出格式为 html 时，不要调用 pptx-exporter。\n- 当输出格式为 pptx-cloud 时，提示用户"云端高质量 PPTX 导出即将上线，当前已输出 HTML 版本"，不要调用 pptx-exporter。\n\n## 工作流程\n1. 委托 content-planner 根据资料、场景、页数规划内容大纲。\n2. 委托 slide-builder 根据大纲生成单文件 HTML 幻灯片，写入 /agents/ppt-generator/outputs/{date}/。\n3. 如输出格式为 pptx-local，委托 pptx-exporter 将 HTML 文件导出为同目录 PPTX。\n4. 委托 visual-reviewer 审查最终文件，最多 2 轮修改。\n\n严格遵循用户选择的场景、格式和页数。每页内容精炼，避免文字堆砌。数据页使用图表而非纯文字。始终使用中文。',
        15, 6, 0.4, 16384, 'auto', 'medium'
      )
      console.log('[DB] Migrated: seeded ppt-generator builtin agent')

      // Seed ppt-generator sub-agents
      const pptSaSeeds = [
        { id: 'sa_content-planner', name: '内容规划师', icon: 'ri-layout-4-line', color: '#6C8AFF', desc: '分析资料，规划 PPT 内容结构和叙事逻辑', prompt: '你是一位专业的演示文稿内容规划师。分析用户资料，规划 PPT 的内容结构、页面分配和叙事逻辑。\n\n## 工作方法\n1. 读取并分析所有资料，提取核心内容\n2. 确定演示目标、受众、叙事模式\n3. 规划每页：类型 + 标题 + 要点 + 视觉建议\n4. 输出 JSON 格式大纲\n\n## 精炼原则\n- 每页只传达一个核心观点\n- 每页要点不超过5个，每个15字以内\n- 数据用图表呈现\n- 关键词加粗，次要信息弱化\n\n## 输出 JSON 格式\n```json\n{\n  "title": "演示标题",\n  "subtitle": "副标题",\n  "style": "elegant|swiss",\n  "slides": [\n    { "type": "title", "title": "...", "subtitle": "..." },\n    { "type": "content", "title": "...", "points": [{"text": "...", "emphasis": true}], "visual": "chart|icon|none" },\n    { "type": "comparison", "title": "...", "leftTitle": "...", "leftPoints": [...], "rightTitle": "...", "rightPoints": [...] },\n    { "type": "data", "title": "...", "chartType": "bar|pie|line", "dataPoints": [{"label": "...", "value": 100}], "insight": "..." },\n    { "type": "end", "title": "感谢", "message": "..." }\n  ]\n}\n```', tools: ['file_read', 'kb_search', 'mcp:exa', 'web_search_bing'] },
        { id: 'sa_slide-builder', name: '幻灯片构建师', icon: 'ri-code-s-slash-line', color: '#4ADE80', desc: '根据大纲生成 HTML 幻灯片，支持多种布局和动画', prompt: '你是一位专业的 HTML 演示文稿开发师。根据 JSON 大纲生成精美的单文件 HTML 幻灯片。\n\n## 风格规范\n### elegant（优雅）\n- 衬线标题字体 Noto Serif SC\n- 无衬线正文字体 Inter\n- 柔和渐变背景\n- 圆角 12px\n\n### swiss（瑞士国际主义）\n- 无衬线字体 Inter（统一）\n- 网格点阵背景\n- 高饱和度强调色\n- 圆角 4px\n\n## 主题配色\n根据 themeId 选择预设配色，注入 CSS 变量。\n\n## 技术要求\n- 单文件 HTML，所有 CSS/JS 内联\n- 每页必须使用 <div class="slide slide-{type}" data-type="{type}"> 根容器，{type} 为 title/content/comparison/data/quote/end\n- Google Fonts CDN 加载字体\n- 键盘左右箭头翻页\n- 底部页码指示器\n- 每页 fade-in + slide-up 入场动画\n- 响应式 1920×1080 和 1280×720\n\n## 输出\n使用 file_write 写入 /agents/ppt-generator/outputs/{date}/{title}.html', tools: ['file_write'] },
        { id: 'sa_pptx-exporter', name: 'PPTX 导出师', icon: 'ri-file-ppt-line', color: '#FACC15', desc: '将 HTML 演示文稿导出为可编辑的 PPTX 格式', prompt: '你是一位 PPTX 文件导出专家。将 HTML 演示文稿转换为可编辑的 PPTX 格式。\n\n## 工作方法\n1. 使用 file_read 读取 HTML 文件\n2. 使用 pptx_export_local 工具导出为 PPTX\n3. 确认导出结果\n\n## PPTX 导出规则\n- 标题页：居中大标题 + 副标题\n- 内容页：标题 + 要点列表，每条一个文本框\n- 对比页：左右两栏布局\n- 数据页：标题 + 图表占位\n- 引用页：居中引用文字\n- 结束页：感谢文字\n\n## 输出\nPPTX 文件写入与 HTML 相同目录：/agents/ppt-generator/outputs/{date}/{title}.pptx', tools: ['file_read', 'pptx_export_local'] },
        { id: 'sa_visual-reviewer', name: '视觉审查员', icon: 'ri-eye-line', color: '#F87171', desc: '审查 PPT 视觉效果，检查布局、配色、可读性', prompt: '你是一位专业的演示文稿视觉审查师。审查生成的 PPT/HTML 文件的视觉效果。\n\n## 审查维度\n1. 布局合理性 — 内容是否溢出，间距是否均匀\n2. 配色对比度 — 文字与背景对比度是否足够（WCAG AA: 4.5:1）\n3. 视觉层次 — 标题是否突出，要点是否有标记\n4. 内容精炼度 — 每页要点不超过5个，每个15字以内\n5. 风格一致性 — 所有页面是否遵循同一风格\n\n## 输出 JSON 格式\n```json\n{\n  "passed": true|false,\n  "score": 1-10,\n  "issues": [\n    { "page": 1, "type": "layout|color|hierarchy|content|style", "description": "问题描述", "suggestion": "改进建议" }\n  ]\n}\n```\n\n## 审查标准\n- passed: true — 无严重问题，最多2个轻微建议\n- passed: false — 至少1个需要修改的问题\n- 建议要具体可操作', tools: ['file_read'] },
      ]
      for (const sa of pptSaSeeds) {
        const exists = this.db.prepare('SELECT id FROM custom_sub_agents WHERE id = ?').get(sa.id)
        if (!exists) {
          this.db.prepare(`INSERT INTO custom_sub_agents (id, name, icon, color, description, prompt, tools, skills, model, temperature, builtin, enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '', 0.7, 1, 1)`).run(
            sa.id, sa.name, sa.icon, sa.color, sa.desc, sa.prompt, JSON.stringify(sa.tools)
          )
        }
      }
      console.log('[DB] Migrated: seeded ppt-generator sub-agents')
    }

    this._ensureCreationCenterSubAgentSeeds()
    this._ensureCreationCenterAgentPrompts()

    // recycle_bin table: add columns for DB-typed trash items (conversations, notes, note_folders)
    const trashCols = this.db.prepare("PRAGMA table_info(recycle_bin)").all()
    const trashNewCols = [
      ['item_type', "TEXT DEFAULT 'file'"],
      ['item_id', "TEXT DEFAULT ''"],
      ['payload_json', "TEXT DEFAULT ''"],
    ]
    for (const [col, def] of trashNewCols) {
      if (trashCols.length > 0 && !trashCols.some(c => c.name === col)) {
        this.db.exec(`ALTER TABLE recycle_bin ADD COLUMN ${col} ${def}`)
        console.log(`[DB] Migrated: added ${col} column to recycle_bin`)
      }
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_recycle_bin_item_type ON recycle_bin(item_type)')

    // notes table: store note bodies in workspace Markdown files, keep DB as metadata/index
    const noteCols = this.db.prepare("PRAGMA table_info(notes)").all()
    if (noteCols.length > 0 && !noteCols.some(c => c.name === 'file_path')) {
      this.db.exec("ALTER TABLE notes ADD COLUMN file_path TEXT DEFAULT ''")
      console.log('[DB] Migrated: added file_path column to notes')
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path)')

    // ─── Generation tasks: extend tasks table for async creation (mindmap/graph/podcast/...) ───
    const taskCols = this.db.prepare("PRAGMA table_info(tasks)").all()
    this._ensureTaskGenerationColumns(taskCols)

    // ─── Seed mindmap-generator builtin agent ───
    const mindmapExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'mindmap-generator'").get()
    if (!mindmapExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_mindmap', '思维导图生成器', 'mindmap-generator',
        '根据主题或资料生成结构化思维导图（JSON）',
        'ri-mind-map', '#10B981', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位思维导图专家。根据用户主题或资料生成层次清晰、逻辑严谨的思维导图。',
        1, 1, 0.4, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded mindmap-generator builtin agent')
    }

    // ─── Seed graph-generator builtin agent ───
    const graphExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'graph-generator'").get()
    if (!graphExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_graph', '知识图谱生成器', 'graph-generator',
        '根据资料抽取实体与关系，生成知识图谱（JSON）',
        'ri-node-tree', '#F59E0B', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位知识图谱抽取专家。从用户资料或主题中识别实体、关系，生成结构化知识图谱。',
        1, 1, 0.3, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded graph-generator builtin agent')
    }

    // ─── Seed flashcard-generator builtin agent ───
    const flashcardExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'flashcard-generator'").get()
    if (!flashcardExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_flashcard', '闪卡生成器', 'flashcard-generator',
        '根据主题或资料生成结构化学习闪卡（JSON）',
        'ri-stack-line', '#EC4899', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify(['flashcard-generator']),
        JSON.stringify([]),
        '你是一位学习闪卡设计专家。根据用户主题或资料生成适合主动回忆和快速复习的结构化闪卡。',
        1, 1, 0.35, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded flashcard-generator builtin agent')
    }

    // ─── Seed quiz-generator builtin agent ───
    const quizExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'quiz-generator'").get()
    if (!quizExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_quiz', '测验生成器', 'quiz-generator',
        '根据主题或资料生成结构化测验题（JSON）',
        'ri-questionnaire-line', '#22C55E', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify(['quiz-generator']),
        JSON.stringify([]),
        '你是一位学习测验出题专家。根据用户主题或资料生成可交互答题的结构化测验。',
        1, 1, 0.35, 8192, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded quiz-generator builtin agent')
    }

    // ─── Seed chart-generator builtin agent ───
    const chartExists = this.db.prepare("SELECT id FROM agents WHERE english_name = 'chart-generator'").get()
    if (!chartExists) {
      this.db.prepare(`
        INSERT INTO agents (id, name, english_name, description, icon, color, architecture, builtin, permissions, tools, skills, sub_agents, prompt, max_iterations, plan_steps, temperature, max_tokens, thinking_mode, thinking_intensity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'agent_chart', '图表生成器', 'chart-generator',
        '根据主题或资料生成 SVG 信息图和可视化图表（JSON）',
        'ri-bar-chart-box-line', '#38BDF8', 'plan_exec', 1,
        JSON.stringify({ fileRead: true, fileWrite: false, webSearch: false, fileDelete: false, fileRename: false, execCommand: false }),
        JSON.stringify(['file_read', 'kb_search']),
        JSON.stringify([]),
        JSON.stringify([]),
        '你是一位信息图和数据可视化设计专家。根据用户主题、资料或知识库检索结果，生成便于阅读和理解的 SVG 图表集。',
        1, 1, 0.35, 16384, 'off', 'medium'
      )
      console.log('[DB] Migrated: seeded chart-generator builtin agent')
    }
  }

  // ─── Schema & Seed ───

}

