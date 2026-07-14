import { dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class WorkspaceRepository extends BaseRepository {
  listSpaces() {
    return this.db.prepare('SELECT * FROM spaces ORDER BY sort_order, created_at DESC').all()
      .map(row => ({ ...row, docCount: 0 }))
  }

  getSpace(id) {
    return this.db.prepare('SELECT * FROM spaces WHERE id = ?').get(id)
  }

  createSpace(data) {
    const id = data.id || 'sp_' + Date.now()
    this.db.prepare(`INSERT INTO spaces (id, name, description, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.name || '', data.description || '', data.icon || 'ri-folder-3-line', data.color || '#6C8AFF', data.sort_order || 0)
    return { id, ...data }
  }

  updateSpace(id, data) {
    return dynamicUpdate(this.db, 'spaces', id, data)
  }

  deleteSpace(id) {
    this.db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
    return { success: true }
  }

  spaceDocCount(id) {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM documents WHERE space_id = ?').get(id)
    return row.c
  }

  listDocs(spaceId) {
    return this.db.prepare('SELECT * FROM documents WHERE space_id = ? ORDER BY created_at DESC').all(spaceId)
  }

  createDoc(data) {
    const id = data.id || 'doc_' + Date.now()
    this.db.prepare(`INSERT INTO documents (id, space_id, name, type, size, status, progress, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.space_id, data.name, data.type || '', data.size || 0, data.status || 'pending', data.progress || 0, data.file_path || '')
    return { id, ...data }
  }

  updateDoc(id, data) {
    return dynamicUpdate(this.db, 'documents', id, data)
  }

  deleteDoc(id) {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
    return { success: true }
  }
}
