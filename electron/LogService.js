// electron/LogService.js — File-based logging service (daily log files in .reviva/logs/)
import path from 'node:path'
import fs from 'node:fs'

export class LogService {
  constructor(workDirService) {
    this._workDir = workDirService
  }

  _ensureLogDir() {
    const logDir = this._workDir.getLogsPath()
    if (!logDir) return null
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    return logDir
  }

  write(level, category, message, meta = {}) {
    const logDir = this._ensureLogDir()
    if (!logDir) return
    const date = new Date().toISOString().slice(0, 10)
    const logFile = path.join(logDir, `${date}.log`)
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    }
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
    } catch (e) {
      console.error('[LogService] write error:', e.message)
    }
  }

  info(category, message, meta) { this.write('info', category, message, meta) }
  warn(category, message, meta) { this.write('warn', category, message, meta) }
  error(category, message, meta) { this.write('error', category, message, meta) }

  readLogs(date, filters = {}) {
    const logDir = this._workDir.getLogsPath()
    if (!logDir || !fs.existsSync(logDir)) return []
    const logFile = path.join(logDir, `${date}.log`)
    if (!fs.existsSync(logFile)) return []
    try {
      const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim())
      let entries = lines.map(l => { try { return JSON.parse(l) } catch { return null } }).filter(e => e)
      if (filters.level) entries = entries.filter(e => e.level === filters.level)
      if (filters.category) entries = entries.filter(e => e.category === filters.category)
      if (filters.search) {
        const q = filters.search.toLowerCase()
        entries = entries.filter(e => e.message.toLowerCase().includes(q))
      }
      return entries
    } catch (e) {
      console.error('[LogService] read error:', e.message)
      return []
    }
  }

  listLogDates() {
    const logDir = this._workDir.getLogsPath()
    if (!logDir || !fs.existsSync(logDir)) return []
    try {
      return fs.readdirSync(logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => f.replace('.log', ''))
        .sort()
    } catch { return [] }
  }

  deleteOldLogs(beforeDate) {
    const logDir = this._workDir.getLogsPath()
    if (!logDir || !fs.existsSync(logDir)) return 0
    let count = 0
    try {
      const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'))
      for (const f of files) {
        const date = f.replace('.log', '')
        if (date < beforeDate) {
          fs.unlinkSync(path.join(logDir, f))
          count++
        }
      }
    } catch (e) {
      console.error('[LogService] cleanup error:', e.message)
    }
    return count
  }
}