import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let BetterSqlite3 = null

try {
  BetterSqlite3 = require('better-sqlite3')
} catch (error) {
  console.error('Failed to load better-sqlite3:', error.message)
}

export function getDatabaseDriver() {
  return BetterSqlite3
}

export class DatabaseContext {
  constructor() {
    this._db = null
    this._dbPath = null
  }

  get db() {
    return this._db
  }

  set db(value) {
    this._db = value
  }

  get dbPath() {
    return this._dbPath
  }

  set dbPath(value) {
    this._dbPath = value
  }

  close() {
    if (this._db) this._db.close()
    this._db = null
  }
}
