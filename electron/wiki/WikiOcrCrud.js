// wiki/WikiOcrCrud.js — extracted from WikiService.js
// Simple CRUD wrappers for OCR provider and job DB operations.

export class WikiOcrCrud {
  constructor({ db }) {
    this._db = db
  }

  async listProviders() {
    try {
      return { success: true, data: this._db?.listOcrProviders?.() || [] }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

  async createProvider(data = {}) {
    try {
      if (!this._db?.createOcrProvider) throw new Error('OCR provider storage is not available')
      return { success: true, data: this._db.createOcrProvider(data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async updateProvider(providerId, data = {}) {
    try {
      if (!providerId) throw new Error('Provider id is required')
      if (!this._db?.updateOcrProvider) throw new Error('OCR provider storage is not available')
      return { success: true, data: this._db.updateOcrProvider(providerId, data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async deleteProvider(providerId) {
    try {
      if (!providerId) throw new Error('Provider id is required')
      if (!this._db?.deleteOcrProvider) throw new Error('OCR provider storage is not available')
      return this._db.deleteOcrProvider(providerId)
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async listJobs(id, sourceId = '') {
    try {
      return { success: true, data: this._db?.listWikiOcrJobs?.(id, sourceId) || [] }
    } catch (err) {
      return { success: false, error: err.message, data: [] }
    }
  }

}
