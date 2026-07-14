import { serializeTransferredSetting } from '../../SettingsTransferService.js'
import { parseJSON, stringifyJSON } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class SettingsRepository extends BaseRepository {
  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? parseJSON(row.value) : null
  }

  setSetting(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stringifyJSON(value))
    return { success: true }
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all()
    const result = {}
    for (const row of rows) result[row.key] = parseJSON(row.value)
    return result
  }

  importSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('配置内容必须是对象')
    }
    const entries = Object.entries(settings)
    const statement = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    const apply = this.db.transaction(items => {
      for (const [key, value] of items) statement.run(key, serializeTransferredSetting(value))
    })
    apply(entries)
    return { count: entries.length }
  }
}
