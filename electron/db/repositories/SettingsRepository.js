import { serializeTransferredSetting } from '../../SettingsTransferService.js'
import { parseJSON, stringifyJSON } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'
import { ModelProviderRepository } from './ModelProviderRepository.js'
import { SpeechProviderRepository } from './SpeechProviderRepository.js'

export class SettingsRepository extends BaseRepository {
  constructor(context) {
    super(context)
    this._modelProviders = new ModelProviderRepository(context)
    this._speechProviders = new SpeechProviderRepository(context)
  }

  getSetting(key) {
    if (key === 'providers' && this._modelProviders.isAvailable()) {
      return this._modelProviders.listProviders()
    }
    if (key === 'mediaSpeechSettings' && this._speechProviders.isAvailable('stt')) {
      return this._speechProviders.getSttSettings()
    }
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? parseJSON(row.value) : null
  }

  setSetting(key, value) {
    if (key === 'providers' && this._modelProviders.isAvailable()) {
      this._modelProviders.replaceProviders(value)
      return { success: true }
    }
    if (key === 'mediaSpeechSettings' && this._speechProviders.isAvailable('stt')) {
      this._speechProviders.replaceSttSettings(value)
      return { success: true }
    }
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, stringifyJSON(value))
    return { success: true }
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all()
    const result = {}
    for (const row of rows) result[row.key] = parseJSON(row.value)
    if (this._modelProviders.isAvailable()) result.providers = this._modelProviders.listProviders()
    if (this._speechProviders.isAvailable('stt')) result.mediaSpeechSettings = this._speechProviders.getSttSettings()
    return result
  }

  importSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('配置内容必须是对象')
    }
    const entries = Object.entries(settings)
    const statement = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    const apply = this.db.transaction(items => {
      for (const [key, value] of items) {
        if (key === 'providers' && this._modelProviders.isAvailable()) {
          this._modelProviders.replaceProviders(value)
        } else if (key === 'mediaSpeechSettings' && this._speechProviders.isAvailable('stt')) {
          this._speechProviders.replaceSttSettings(value)
        } else {
          statement.run(key, serializeTransferredSetting(value))
        }
      }
    })
    apply(entries)
    return { count: entries.length }
  }
}
