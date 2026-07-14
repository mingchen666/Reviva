import { BaseRepository } from './BaseRepository.js'

export class RecycleBinRepository extends BaseRepository {
  listTrash() {
    return this.db.prepare('SELECT * FROM recycle_bin ORDER BY deleted_at DESC').all()
  }

  listTrashByCategory(category) {
    return this.db.prepare('SELECT * FROM recycle_bin WHERE category = ? ORDER BY deleted_at DESC').all(category)
  }

  getTrashItem(id) {
    return this.db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id)
  }

  createTrashItem(data) {
    const id = data.id || 'trash_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    this.db.prepare(`INSERT INTO recycle_bin (id, original_path, original_name, trash_path, is_directory, size, file_type, category, item_type, item_id, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, data.original_path || '', data.original_name, data.trash_path || '',
      data.is_directory ? 1 : 0, data.size || 0, data.file_type || '', data.category || 'other',
      data.item_type || 'file', data.item_id || '', data.payload_json || '')
    return this.db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id)
  }

  deleteTrashItem(id) {
    this.db.prepare('DELETE FROM recycle_bin WHERE id = ?').run(id)
    return { success: true }
  }

  deleteTrashItems(ids) {
    const statement = this.db.prepare('DELETE FROM recycle_bin WHERE id = ?')
    this.db.transaction(() => { for (const id of ids) statement.run(id) })()
    return { success: true }
  }

  emptyTrash() {
    this.db.prepare('DELETE FROM recycle_bin').run()
    return { success: true }
  }

  trashItemCount() {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM recycle_bin').get()
    return row.c
  }
}
