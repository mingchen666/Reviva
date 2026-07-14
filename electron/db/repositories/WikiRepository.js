import { parseJSON, stringifyJSON, dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class WikiRepository extends BaseRepository {
  _parseWiki(row) {
    if (!row) return null
    return {
      ...row,
      agent_config: parseJSON(row.agent_config) || {},
    }
  }

  _parseWikiSource(row) {
    if (!row) return null
    return {
      ...row,
      meta: parseJSON(row.meta_json) || {},
    }
  }

  _parseWikiJob(row) {
    if (!row) return null
    return {
      ...row,
      meta: parseJSON(row.meta_json) || {},
    }
  }

  _parseOcrProvider(row) {
    if (!row) return null
    return {
      ...row,
      enabled: !!row.enabled,
      config: parseJSON(row.config_json) || {},
    }
  }

  _parseWikiOcrJob(row) {
    if (!row) return null
    return {
      ...row,
      metrics: parseJSON(row.metrics_json) || {},
    }
  }


  listWikis() {
    return this.db.prepare('SELECT * FROM wikis ORDER BY updated_at DESC, created_at DESC').all().map(r => this._parseWiki(r))
  }

  getWiki(id) {
    return this._parseWiki(this.db.prepare('SELECT * FROM wikis WHERE id = ?').get(id))
  }

  createWiki(data) {
    const id = data.id || 'wiki_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO wikis (id, name, slug, description, path, status, page_count, source_count, asset_count, index_status, agent_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.name || 'Untitled Wiki',
      data.slug || id,
      data.description || '',
      data.path || '',
      data.status || 'ready',
      data.page_count || 0,
      data.source_count || 0,
      data.asset_count || 0,
      data.index_status || 'empty',
      stringifyJSON(data.agent_config || data.agent || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWiki(id)
  }

  upsertWiki(data) {
    const existing = data?.id ? this.getWiki(data.id) : null
    if (existing) return this.updateWiki(data.id, data)
    return this.createWiki(data)
  }

  updateWiki(id, data) {
    const payload = { ...data }
    if (payload.agent !== undefined && payload.agent_config === undefined) {
      payload.agent_config = payload.agent
      delete payload.agent
    }
    dynamicUpdate(this.db, 'wikis', id, payload, ['agent_config'])
    return this.getWiki(id)
  }

  deleteWiki(id) {
    this.db.prepare("DELETE FROM web_import_jobs WHERE target_type = 'wiki' AND target_ref = ?").run(id)
    this.db.prepare('DELETE FROM wiki_ocr_jobs WHERE wiki_id = ?').run(id)
    this.db.prepare('DELETE FROM wiki_jobs WHERE wiki_id = ?').run(id)
    this.db.prepare('DELETE FROM wiki_sources WHERE wiki_id = ?').run(id)
    this.db.prepare('DELETE FROM wikis WHERE id = ?').run(id)
    return { success: true }
  }

  deleteWikiSource(wikiId, sourceId) {
    this.db.prepare('DELETE FROM wiki_ocr_jobs WHERE wiki_id = ? AND source_id = ?').run(wikiId, sourceId)
    this.db.prepare('DELETE FROM wiki_jobs WHERE wiki_id = ? AND source_id = ?').run(wikiId, sourceId)
    this.db.prepare('DELETE FROM wiki_sources WHERE wiki_id = ? AND id = ?').run(wikiId, sourceId)
    return { success: true }
  }

  listWikiSources(wikiId) {
    return this.db.prepare('SELECT * FROM wiki_sources WHERE wiki_id = ? ORDER BY updated_at DESC, created_at DESC').all(wikiId).map(r => this._parseWikiSource(r))
  }

  getWikiSource(id) {
    return this._parseWikiSource(this.db.prepare('SELECT * FROM wiki_sources WHERE id = ?').get(id))
  }

  upsertWikiSource(data) {
    const existing = data?.id ? this.getWikiSource(data.id) : null
    if (existing) return this.updateWikiSource(data.id, data)
    this.db.prepare(`INSERT INTO wiki_sources (id, wiki_id, type, title, original_uri, original_path, content_hash, status, size, extract_path, parser_status, parser_message, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      data.id,
      data.wiki_id,
      data.type || 'file',
      data.title || data.id,
      data.original_uri || '',
      data.original_path || '',
      data.content_hash || '',
      data.status || 'pending',
      data.size || 0,
      data.extract_path || '',
      data.parser_status || '',
      data.parser_message || '',
      stringifyJSON(data.meta || data.meta_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWikiSource(data.id)
  }

  updateWikiSource(id, data) {
    const payload = { ...data }
    if (payload.meta !== undefined && payload.meta_json === undefined) {
      payload.meta_json = payload.meta
      delete payload.meta
    }
    dynamicUpdate(this.db, 'wiki_sources', id, payload, ['meta_json'])
    return this.getWikiSource(id)
  }

  listWikiJobs(wikiId) {
    return this.db.prepare('SELECT * FROM wiki_jobs WHERE wiki_id = ? ORDER BY created_at DESC LIMIT 100').all(wikiId).map(r => this._parseWikiJob(r))
  }

  createWikiJob(data) {
    const id = data.id || 'wiki_job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO wiki_jobs (id, wiki_id, source_id, type, name, status, progress, message, meta_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.wiki_id,
      data.source_id || '',
      data.type || 'wiki',
      data.name || '',
      data.status || 'pending',
      data.progress || 0,
      data.message || '',
      stringifyJSON(data.meta || data.meta_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this._parseWikiJob(this.db.prepare('SELECT * FROM wiki_jobs WHERE id = ?').get(id))
  }

  listOcrProviders() {
    return this.db.prepare('SELECT * FROM ocr_providers ORDER BY enabled DESC, updated_at DESC, created_at DESC').all().map(r => this._parseOcrProvider(r))
  }

  getOcrProvider(id) {
    return this._parseOcrProvider(this.db.prepare('SELECT * FROM ocr_providers WHERE id = ?').get(id))
  }

  createOcrProvider(data = {}) {
    const id = data.id || 'ocr_provider_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO ocr_providers (id, name, type, mode, base_url, api_key_ref, enabled, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.name || 'OCR Provider',
      data.type || 'custom',
      data.mode || 'remote',
      data.base_url || '',
      data.api_key_ref || '',
      data.enabled === false ? 0 : 1,
      stringifyJSON(data.config || data.config_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getOcrProvider(id)
  }

  updateOcrProvider(id, data = {}) {
    const payload = { ...data }
    if (payload.config !== undefined && payload.config_json === undefined) {
      payload.config_json = payload.config
      delete payload.config
    }
    dynamicUpdate(this.db, 'ocr_providers', id, payload, ['config_json'], ['enabled'])
    return this.getOcrProvider(id)
  }

  deleteOcrProvider(id) {
    this.db.prepare('DELETE FROM ocr_providers WHERE id = ?').run(id)
    return { success: true }
  }

  listWikiOcrJobs(wikiId, sourceId = '') {
    let sql = 'SELECT * FROM wiki_ocr_jobs WHERE wiki_id = ?'
    const args = [wikiId]
    if (sourceId) {
      sql += ' AND source_id = ?'
      args.push(sourceId)
    }
    sql += ' ORDER BY updated_at DESC, created_at DESC'
    return this.db.prepare(sql).all(...args).map(r => this._parseWikiOcrJob(r))
  }

  getWikiOcrJob(id) {
    return this._parseWikiOcrJob(this.db.prepare('SELECT * FROM wiki_ocr_jobs WHERE id = ?').get(id))
  }

  createWikiOcrJob(data = {}) {
    const id = data.id || 'wiki_ocr_job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    this.db.prepare(`INSERT INTO wiki_ocr_jobs (id, wiki_id, source_id, provider_id, status, progress, pages_total, pages_done, input_path, output_manifest_path, output_extract_path, cache_path, error_message, metrics_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      data.wiki_id,
      data.source_id || '',
      data.provider_id || null,
      data.status || 'pending',
      data.progress || 0,
      data.pages_total || 0,
      data.pages_done || 0,
      data.input_path || '',
      data.output_manifest_path || '',
      data.output_extract_path || '',
      data.cache_path || '',
      data.error_message || '',
      stringifyJSON(data.metrics || data.metrics_json || {}),
      data.created_at || new Date().toISOString(),
      data.updated_at || new Date().toISOString(),
    )
    return this.getWikiOcrJob(id)
  }

  upsertWikiOcrJob(data = {}) {
    const existing = data?.id ? this.getWikiOcrJob(data.id) : null
    if (existing) return this.updateWikiOcrJob(data.id, data)
    return this.createWikiOcrJob(data)
  }

  updateWikiOcrJob(id, data = {}) {
    const payload = { ...data }
    if (payload.metrics !== undefined && payload.metrics_json === undefined) {
      payload.metrics_json = payload.metrics
      delete payload.metrics
    }
    dynamicUpdate(this.db, 'wiki_ocr_jobs', id, payload, ['metrics_json'])
    return this.getWikiOcrJob(id)
  }
}

