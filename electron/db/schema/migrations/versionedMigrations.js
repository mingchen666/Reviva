import { parseJSON } from '../../helpers.js'
import { BaseRepository } from '../../repositories/BaseRepository.js'

export class VersionedMigrationManager extends BaseRepository {
  _ensureSchemaMigrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `)
  }

  _getVersionedMigrations() {
    return [
      {
        version: 1,
        name: 'replace_web_scrape_with_jina_mcp',
        up: db => {
          const replaceToolRefs = (value) => {
            const tools = parseJSON(value)
            if (!Array.isArray(tools)) return value
            let changed = false
            const next = []
            for (const toolId of tools) {
              if (toolId === 'web_scrape') {
                changed = true
                if (!next.includes('mcp:jina-mcp-server')) next.push('mcp:jina-mcp-server')
                continue
              }
              if (toolId && !next.includes(toolId)) next.push(toolId)
            }
            return changed ? JSON.stringify(next) : value
          }

          for (const table of ['agents', 'custom_sub_agents']) {
            const rows = db.prepare(`SELECT id, tools FROM ${table}`).all()
            const update = db.prepare(`UPDATE ${table} SET tools = ? WHERE id = ?`)
            for (const row of rows) {
              const nextTools = replaceToolRefs(row.tools)
              if (nextTools !== row.tools) update.run(nextTools, row.id)
            }
          }

          const settings = db.prepare("SELECT key, value FROM settings WHERE key IN ('toolEnabledMap', 'toolProviderConfigMap')").all()
          const updateSetting = db.prepare('UPDATE settings SET value = ? WHERE key = ?')
          for (const row of settings) {
            const parsed = parseJSON(row.value)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
            if (!Object.prototype.hasOwnProperty.call(parsed, 'web_scrape')) continue
            delete parsed.web_scrape
            updateSetting.run(JSON.stringify(parsed), row.key)
          }
        },
      },
      {
        version: 2,
        name: 'document_read_default_route',
        up: db => {
          const normalizeTools = (value, { preserveBottomTools = false } = {}) => {
            const tools = parseJSON(value)
            if (!Array.isArray(tools)) return value
            let changed = false
            const next = []
            const push = (toolId) => {
              if (toolId && !next.includes(toolId)) next.push(toolId)
            }
            for (const toolId of tools) {
              if (toolId === 'office_read' || toolId === 'pdf_read') {
                if (!preserveBottomTools) {
                  changed = true
                  push('document_read')
                  continue
                }
              }
              push(toolId)
            }
            return changed ? JSON.stringify(next) : value
          }

          const agentRows = db.prepare('SELECT id, tools FROM agents WHERE builtin = 1').all()
          const updateAgent = db.prepare('UPDATE agents SET tools = ? WHERE id = ?')
          for (const row of agentRows) {
            const nextTools = normalizeTools(row.tools, { preserveBottomTools: false })
            if (nextTools !== row.tools) updateAgent.run(nextTools, row.id)
          }

          const subAgentRows = db.prepare('SELECT id, tools FROM custom_sub_agents WHERE builtin = 1').all()
          const updateSubAgent = db.prepare('UPDATE custom_sub_agents SET tools = ? WHERE id = ?')
          for (const row of subAgentRows) {
            const nextTools = normalizeTools(row.tools, { preserveBottomTools: false })
            if (nextTools !== row.tools) updateSubAgent.run(nextTools, row.id)
          }

          const toolRow = db.prepare("SELECT value FROM settings WHERE key = 'toolEnabledMap'").get()
          const toolEnabledMap = parseJSON(toolRow?.value)
          if (toolEnabledMap && typeof toolEnabledMap === 'object' && !Array.isArray(toolEnabledMap)) {
            let changed = false
            if (toolEnabledMap.document_read !== true) {
              toolEnabledMap.document_read = true
              changed = true
            }
            for (const id of ['office_read', 'pdf_read']) {
              if (toolEnabledMap[id] === true) {
                toolEnabledMap[id] = false
                changed = true
              }
            }
            if (toolEnabledMap.__document_read_default_route_migrated !== true) {
              toolEnabledMap.__document_read_default_route_migrated = true
              changed = true
            }
            if (changed) {
              db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(toolEnabledMap), 'toolEnabledMap')
            }
          }
        },
      },
      {
        version: 3,
        name: 'create_web_import_jobs',
        up: db => {
          db.exec(`
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
            CREATE INDEX IF NOT EXISTS idx_web_import_jobs_target
              ON web_import_jobs(target_type, target_ref, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_web_import_jobs_status
              ON web_import_jobs(status, updated_at);
          `)
        },
      },
    ]
  }

  _runVersionedMigrations() {
    this._ensureSchemaMigrationsTable()

    const migrations = [...this._getVersionedMigrations()].sort((a, b) => a.version - b.version)
    if (migrations.length === 0) return

    const appliedRows = this.db.prepare('SELECT version FROM schema_migrations').all()
    const appliedVersions = new Set(appliedRows.map(row => row.version))
    const insertApplied = this.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')

    for (const migration of migrations) {
      if (!Number.isInteger(migration.version) || migration.version < 1) {
        throw new Error(`[DB] Invalid migration version: ${migration.version}`)
      }
      if (!migration.name || typeof migration.up !== 'function') {
        throw new Error(`[DB] Invalid migration definition for version ${migration.version}`)
      }
      if (appliedVersions.has(migration.version)) continue

      const runMigration = this.db.transaction(() => {
        migration.up(this.db)
        insertApplied.run(migration.version, migration.name)
      })

      runMigration()
      appliedVersions.add(migration.version)
      console.log(`[DB] Migration ${migration.version} applied: ${migration.name}`)
    }
  }

}

