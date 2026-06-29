// scripts/migrate-db.js — General database migration script
// Run: node scripts/migrate-db.js [--db-path <path>]
// Uses sql.js (pure JS/WASM SQLite) — works with any Node.js version.
// Safe to re-run — existing migrations are skipped.

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ── Find DB path ──
const args = process.argv.slice(2)
let dbPath
const explicitDbPath = args.includes('--db-path')
if (explicitDbPath) {
  dbPath = args[args.indexOf('--db-path') + 1]
} else {
  const platform = os.platform()
  let baseDir
  if (platform === 'win32') {
    baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    dbPath = path.join(baseDir, 'Reviva', 'data', 'reviva.db')
  } else if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support')
    dbPath = path.join(baseDir, 'Reviva', 'data', 'reviva.db')
  } else {
    baseDir = path.join(os.homedir(), '.config')
    dbPath = path.join(baseDir, 'Reviva', 'data', 'reviva.db')
  }
}

// ── Load sql.js ──
const initSqlJs = (await import('sql.js')).default
const SQL = await initSqlJs()

function parseSettingValue(value) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

function resolveWorkspaceDbPath(userDataDbPath) {
  if (explicitDbPath || !fs.existsSync(userDataDbPath)) return userDataDbPath
  let settingsDb = null
  try {
    settingsDb = new SQL.Database(fs.readFileSync(userDataDbPath))
    const stmt = settingsDb.prepare("SELECT value FROM settings WHERE key = 'workdir_root'")
    let rootPath = ''
    if (stmt.step()) rootPath = parseSettingValue(stmt.getAsObject().value) || ''
    stmt.free()
    if (!rootPath) return userDataDbPath
    const workspaceDbPath = path.join(rootPath, '.reviva', 'reviva.db')
    return fs.existsSync(workspaceDbPath) ? workspaceDbPath : userDataDbPath
  } catch {
    return userDataDbPath
  } finally {
    if (settingsDb) settingsDb.close()
  }
}

dbPath = resolveWorkspaceDbPath(dbPath)

console.log('[migrate] Database path:', dbPath)

if (!fs.existsSync(dbPath)) {
  console.error('[migrate] Database file not found at:', dbPath)
  console.error('[migrate] Run the app first to create the database, or specify --db-path <path>')
  process.exit(1)
}

// Read the database file
const dbFileBuffer = fs.readFileSync(dbPath)
const db = new SQL.Database(dbFileBuffer)

// ── Helper functions ──
function exec(sql) {
  db.run(sql)
}

function query(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const results = []
  while (stmt.step()) results.push(stmt.getAsObject())
  stmt.free()
  return results
}

function runStatement(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  stmt.step()
  stmt.free()
}

function hasColumn(table, col) {
  if (!hasTable(table)) return true // Table doesn't exist → skip column migration
  const rows = query(`PRAGMA table_info(${table})`)
  return rows.some(r => r.name === col)
}

function hasIndex(name) {
  const rows = query("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [name])
  return rows.length > 0
}

function hasTable(name) {
  const rows = query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name])
  return rows.length > 0
}

function addColumn(table, col, def) {
  if (!hasTable(table)) return // Skip if table doesn't exist yet
  exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
}

function addIndex(name, sql) {
  // Guard: skip if target table doesn't exist (sql format: "tableName(col1, col2)")
  const tableName = sql.split('(')[0].trim()
  if (tableName && !hasTable(tableName)) return
  exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${sql}`)
}

function createTable(sql) {
  exec(sql)
}

// ── Migration definitions ──
const migrations = []

// ─── Table-creation migrations (run first to ensure tables exist before column/index migrations) ───

// 0a. recycle_bin table
migrations.push({
  name: 'recycle_bin table',
  check: () => hasTable('recycle_bin'),
  run: () => createTable(`
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
    )
  `),
})

// 0b. note_folders table
migrations.push({
  name: 'note_folders table',
  check: () => hasTable('note_folders'),
  run: () => createTable(`
    CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY,
      parent_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'ri-folder-line',
      color TEXT DEFAULT '#6C8AFF',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `),
})

// 0c. notes table
migrations.push({
  name: 'notes table',
  check: () => hasTable('notes'),
  run: () => createTable(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `),
})

// 1. conv_groups table
migrations.push({
  name: 'conv_groups table',
  check: () => hasTable('conv_groups'),
  run: () => exec(`CREATE TABLE IF NOT EXISTS conv_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`),
})

// 1b. default conversation group
migrations.push({
  name: 'default conv group',
  check: () => {
    const rows = query('SELECT COUNT(*) as c FROM conv_groups WHERE id = ?', ['default'])
    return rows[0]?.c > 0
  },
  run: () => runStatement('INSERT INTO conv_groups (id, name, sort_order) VALUES (?, ?, ?)', ['default', '默认分组', 0]),
})

// 2. conversations.group_id
migrations.push({
  name: 'conversations.group_id',
  check: () => hasColumn('conversations', 'group_id'),
  run: () => addColumn('conversations', 'group_id', "TEXT DEFAULT 'default'"),
})

// 3. conversations.context_length
migrations.push({
  name: 'conversations.context_length',
  check: () => hasColumn('conversations', 'context_length'),
  run: () => addColumn('conversations', 'context_length', 'INTEGER DEFAULT 50'),
})

// 4. idx_conversations_group
migrations.push({
  name: 'idx_conversations_group',
  check: () => hasIndex('idx_conversations_group'),
  run: () => addIndex('idx_conversations_group', 'conversations(group_id)'),
})

// 5. token_usage.thinking_tokens
migrations.push({
  name: 'token_usage.thinking_tokens',
  check: () => hasColumn('token_usage', 'thinking_tokens'),
  run: () => addColumn('token_usage', 'thinking_tokens', 'INTEGER DEFAULT 0'),
})

// 6-17. Messages table: chat metadata columns
const msgColumns = [
  ['status',            "TEXT DEFAULT 'completed'"],
  ['model_id',          "TEXT DEFAULT ''"],
  ['provider_id',       "TEXT DEFAULT ''"],
  ['input_tokens',      'INTEGER DEFAULT 0'],
  ['output_tokens',     'INTEGER DEFAULT 0'],
  ['cache_read_tokens', 'INTEGER DEFAULT 0'],
  ['cache_write_tokens','INTEGER DEFAULT 0'],
  ['thinking_tokens',   'INTEGER DEFAULT 0'],
  ['latency_ms',        'INTEGER DEFAULT 0'],
  ['cost',              'REAL DEFAULT 0'],
  ['error_message',     "TEXT DEFAULT ''"],
  ['parent_msg_id',     "TEXT DEFAULT ''"],
]

for (const [col, def] of msgColumns) {
  migrations.push({
    name: `messages.${col}`,
    check: () => hasColumn('messages', col),
    run: () => addColumn('messages', col, def),
  })
}

// 18. idx_messages_status
migrations.push({
  name: 'idx_messages_status',
  check: () => hasIndex('idx_messages_status'),
  run: () => addIndex('idx_messages_status', 'messages(status)'),
})

// 19. idx_messages_model
migrations.push({
  name: 'idx_messages_model',
  check: () => hasIndex('idx_messages_model'),
  run: () => addIndex('idx_messages_model', 'messages(provider_id, model_id)'),
})

// ── Add future migrations below ──
// 20-27. custom_skills table: new skill columns
const skillColumns = [
  ['source',           "TEXT DEFAULT 'custom'"],
  ['category',         "TEXT DEFAULT ''"],
  ['prompt_content',   "TEXT DEFAULT ''"],
  ['allowed_tools',    "TEXT DEFAULT '[]'"],
  ['version',          "TEXT DEFAULT '1.0'"],
  ['author',           "TEXT DEFAULT ''"],
  ['license',          "TEXT DEFAULT ''"],
  ['enabled',          'INTEGER DEFAULT 1'],
]

for (const [col, def] of skillColumns) {
  migrations.push({
    name: `custom_skills.${col}`,
    check: () => hasColumn('custom_skills', col),
    run: () => addColumn('custom_skills', col, def),
  })
}

// 28-30. recycle_bin table: support DB-typed items (conversations, notes, note_folders)
const trashColumns = [
  ['item_type',    "TEXT DEFAULT 'file'"],
  ['item_id',      "TEXT DEFAULT ''"],
  ['payload_json', "TEXT DEFAULT ''"],
]

for (const [col, def] of trashColumns) {
  migrations.push({
    name: `recycle_bin.${col}`,
    check: () => hasColumn('recycle_bin', col),
    run: () => addColumn('recycle_bin', col, def),
  })
}

// 31. idx_recycle_bin_item_type
migrations.push({
  name: 'idx_recycle_bin_item_type',
  check: () => hasIndex('idx_recycle_bin_item_type'),
  run: () => addIndex('idx_recycle_bin_item_type', 'recycle_bin(item_type)'),
})

// 32. idx_recycle_bin_deleted_at
migrations.push({
  name: 'idx_recycle_bin_deleted_at',
  check: () => hasIndex('idx_recycle_bin_deleted_at'),
  run: () => addIndex('idx_recycle_bin_deleted_at', 'recycle_bin(deleted_at)'),
})

// 33. idx_recycle_bin_category
migrations.push({
  name: 'idx_recycle_bin_category',
  check: () => hasIndex('idx_recycle_bin_category'),
  run: () => addIndex('idx_recycle_bin_category', 'recycle_bin(category)'),
})

// 34. idx_note_folders_parent
migrations.push({
  name: 'idx_note_folders_parent',
  check: () => hasIndex('idx_note_folders_parent'),
  run: () => addIndex('idx_note_folders_parent', 'note_folders(parent_id)'),
})

// 35. idx_notes_folder
migrations.push({
  name: 'idx_notes_folder',
  check: () => hasIndex('idx_notes_folder'),
  run: () => addIndex('idx_notes_folder', 'notes(folder_id)'),
})

// 36-43. tasks table: async generation/task grouping columns
const taskColumns = [
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

for (const [col, def] of taskColumns) {
  migrations.push({
    name: `tasks.${col}`,
    check: () => hasColumn('tasks', col),
    run: () => addColumn('tasks', col, def),
  })
}

migrations.push({
  name: 'idx_tasks_status',
  check: () => hasIndex('idx_tasks_status'),
  run: () => addIndex('idx_tasks_status', 'tasks(status)'),
})

migrations.push({
  name: 'idx_tasks_group',
  check: () => hasIndex('idx_tasks_group'),
  run: () => addIndex('idx_tasks_group', 'tasks(group_id)'),
})

migrations.push({
  name: 'idx_tasks_tool',
  check: () => hasIndex('idx_tasks_tool'),
  run: () => addIndex('idx_tasks_tool', 'tasks(tool_id)'),
})

// artifacts table
migrations.push({
  name: 'artifacts table',
  check: () => hasTable('artifacts'),
  run: () => createTable(`
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
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `),
})

const artifactColumns = [
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

for (const [col, def] of artifactColumns) {
  migrations.push({
    name: `artifacts.${col}`,
    check: () => hasColumn('artifacts', col),
    run: () => addColumn('artifacts', col, def),
  })
}

migrations.push({
  name: 'idx_artifacts_group',
  check: () => hasIndex('idx_artifacts_group'),
  run: () => addIndex('idx_artifacts_group', 'artifacts(group_id)'),
})

migrations.push({
  name: 'idx_artifacts_conv',
  check: () => hasIndex('idx_artifacts_conv'),
  run: () => addIndex('idx_artifacts_conv', 'artifacts(conversation_id)'),
})

// ── Run migrations ──
console.log('[migrate] Connected. Running migrations...\n')
let applied = 0
let skipped = 0

for (const m of migrations) {
  if (m.check()) {
    console.log(`  ○ ${m.name} — already applied`)
    skipped++
  } else {
    m.run()
    console.log(`  ✓ ${m.name} — applied`)
    applied++
  }
}

// ── Save changes back to file ──
const data = db.export()
const buffer = Buffer.from(data)
fs.writeFileSync(dbPath, buffer)

db.close()
console.log(`\n[migrate] Done. ${applied} applied, ${skipped} skipped.`)
