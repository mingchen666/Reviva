import { parseJSON, stringifyJSON } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

function assertPlainObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value
}

export function normalizeProviderCatalog(value) {
  const parsed = typeof value === 'string' ? parseJSON(value) : value
  if (!Array.isArray(parsed)) throw new Error('配置项 providers 必须是数组')

  const providerIds = new Set()
  const providers = parsed.map((source, providerIndex) => {
    const provider = assertPlainObject(source, `配置项 providers 第 ${providerIndex + 1} 项无效`)
    const id = String(provider.id || '').trim()
    if (!id) throw new Error(`配置项 providers 第 ${providerIndex + 1} 项缺少服务商 ID`)
    if (providerIds.has(id)) throw new Error(`配置项 providers 包含重复服务商 ID：${id}`)
    providerIds.add(id)

    if (provider.models !== undefined && !Array.isArray(provider.models)) {
      throw new Error(`服务商 ${id} 的 models 必须是数组`)
    }
    const modelIds = new Set()
    const models = (provider.models || []).map((modelSource, modelIndex) => {
      const model = assertPlainObject(modelSource, `服务商 ${id} 的第 ${modelIndex + 1} 个模型无效`)
      const modelId = String(model.id || '').trim()
      if (!modelId) throw new Error(`服务商 ${id} 的模型缺少 ID`)
      if (modelIds.has(modelId)) throw new Error(`服务商 ${id} 包含重复模型 ID：${modelId}`)
      modelIds.add(modelId)
      return { ...model, id: modelId }
    })

    return { ...provider, id, models }
  })

  return providers
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function providerToRow(provider, sortOrder) {
  const config = Object.fromEntries(Object.entries(provider).filter(([key]) => key !== 'models'))
  return {
    id: provider.id,
    name: String(provider.name || ''),
    description: String(provider.desc || ''),
    region: String(provider.region || ''),
    api_format: String(provider.apiFormat || 'openai'),
    api_key: String(provider.apiKey || ''),
    api_key_id: String(provider.apiKeyId || ''),
    base_url: String(provider.baseUrl || ''),
    enabled: provider.enabled ? 1 : 0,
    builtin: provider.builtin ? 1 : 0,
    local: provider.local ? 1 : 0,
    sort_order: sortOrder,
    config_json: stringifyJSON(config),
  }
}

export function modelToRow(providerId, model, sortOrder) {
  const config = Object.fromEntries(Object.entries(model).filter(([key]) => key !== 'id'))
  return {
    provider_id: providerId,
    model_id: model.id,
    name: String(model.name || ''),
    enabled: model.enabled ? 1 : 0,
    sort_order: sortOrder,
    capabilities_json: stringifyJSON(jsonObject(model.capabilities)),
    config_json: stringifyJSON(config),
  }
}

export function providerFromRows(providerRow, modelRows) {
  const providerConfig = jsonObject(parseJSON(providerRow.config_json))
  const provider = { ...providerConfig, id: providerRow.id }
  const providerColumns = [
    ['name', 'name'], ['desc', 'description'], ['region', 'region'], ['apiFormat', 'api_format'],
    ['apiKey', 'api_key'], ['apiKeyId', 'api_key_id'], ['baseUrl', 'base_url'],
    ['enabled', 'enabled'], ['builtin', 'builtin'], ['local', 'local'],
  ]
  for (const [field, column] of providerColumns) {
    if (!Object.prototype.hasOwnProperty.call(providerConfig, field)) continue
    provider[field] = ['enabled', 'builtin', 'local'].includes(field)
      ? Boolean(providerRow[column])
      : providerRow[column]
  }
  provider.models = modelRows.map(modelRow => {
    const modelConfig = jsonObject(parseJSON(modelRow.config_json))
    const model = { ...modelConfig, id: modelRow.model_id }
    if (Object.prototype.hasOwnProperty.call(modelConfig, 'name')) model.name = modelRow.name
    if (Object.prototype.hasOwnProperty.call(modelConfig, 'enabled')) model.enabled = Boolean(modelRow.enabled)
    if (Object.prototype.hasOwnProperty.call(modelConfig, 'capabilities')) {
      model.capabilities = jsonObject(parseJSON(modelRow.capabilities_json))
    }
    return model
  })
  return provider
}

export class ModelProviderRepository extends BaseRepository {
  _tableExists(name) {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
  }

  isAvailable() {
    return this._tableExists('llm_provider_profiles') && this._tableExists('llm_model_profiles')
  }

  listProviders() {
    if (!this.isAvailable()) return []
    const providers = this.db.prepare('SELECT * FROM llm_provider_profiles ORDER BY sort_order, id').all()
    const models = this.db.prepare('SELECT * FROM llm_model_profiles WHERE provider_id = ? ORDER BY sort_order, model_id')
    return providers.map(provider => providerFromRows(provider, models.all(provider.id)))
  }

  replaceProviders(value) {
    const providers = normalizeProviderCatalog(value)
    if (!this.isAvailable()) throw new Error('LLM 服务商表尚未初始化')

    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM llm_model_profiles').run()
      this.db.prepare('DELETE FROM llm_provider_profiles').run()

      const insertProvider = this.db.prepare(`
        INSERT INTO llm_provider_profiles
          (id, name, description, region, api_format, api_key, api_key_id, base_url, enabled, builtin, local, sort_order, config_json)
        VALUES (@id, @name, @description, @region, @api_format, @api_key, @api_key_id, @base_url, @enabled, @builtin, @local, @sort_order, @config_json)
      `)
      const insertModel = this.db.prepare(`
        INSERT INTO llm_model_profiles
          (provider_id, model_id, name, enabled, sort_order, capabilities_json, config_json)
        VALUES (@provider_id, @model_id, @name, @enabled, @sort_order, @capabilities_json, @config_json)
      `)

      providers.forEach((provider, providerIndex) => {
        insertProvider.run(providerToRow(provider, providerIndex))
        provider.models.forEach((model, modelIndex) => insertModel.run(modelToRow(provider.id, model, modelIndex)))
      })

      this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('providers', JSON.stringify(providers))
    })

    replace()
    return this.listProviders()
  }

  migrateLegacyProviders(value) {
    if (!this.isAvailable()) throw new Error('LLM 服务商表尚未初始化')
    const raw = value === null || value === undefined ? null : parseJSON(value)
    if (raw === null || raw === undefined) return { migrated: false, count: 0 }
    if (this.db.prepare('SELECT COUNT(*) AS count FROM llm_provider_profiles').get().count > 0) {
      return { migrated: false, count: this.listProviders().length }
    }
    const providers = this.replaceProviders(raw)
    return { migrated: true, count: providers.length }
  }
}
