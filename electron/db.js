// electron/db.js — Backward-compatible re-export from DatabaseService
// This file is deprecated; new code should import DatabaseService directly.
export { DatabaseService } from './DatabaseService.js'

// Singleton instance for legacy imports
let _instance = null

export function initDatabase() {
  const { DatabaseService } = require('./DatabaseService.js')
  _instance = new DatabaseService()
  return _instance.init()
}

export function getDb() {
  return _instance?.db || null
}

export function closeDatabase() {
  if (_instance) { _instance.close(); _instance = null }
}

export function getDatabaseService() {
  return _instance
}
