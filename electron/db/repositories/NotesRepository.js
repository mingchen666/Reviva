import { dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class NotesRepository extends BaseRepository {
  listNoteFolders(parentId) {
    if (parentId) return this.db.prepare('SELECT * FROM note_folders WHERE parent_id = ? ORDER BY sort_order, created_at ASC').all(parentId)
    return this.db.prepare('SELECT * FROM note_folders ORDER BY sort_order, created_at ASC').all()
  }

  getNoteFolder(id) {
    return this.db.prepare('SELECT * FROM note_folders WHERE id = ?').get(id)
  }

  createNoteFolder(data) {
    const id = data.id || 'nf_' + Date.now()
    this.db.prepare(`INSERT INTO note_folders (id, parent_id, name, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.parent_id || '', data.name || '新文件夹', data.icon || 'ri-folder-2-line', data.color || '#6C8AFF', data.sort_order || 0)
    return this.getNoteFolder(id)
  }

  updateNoteFolder(id, data) {
    return dynamicUpdate(this.db, 'note_folders', id, data)
  }

  deleteNoteFolder(id) {
    this.db.prepare('DELETE FROM note_folders WHERE id = ?').run(id)
    return { success: true }
  }

  listNotes(folderId) {
    if (folderId) return this.db.prepare('SELECT * FROM notes WHERE folder_id = ? ORDER BY sort_order, created_at DESC').all(folderId)
    return this.db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all()
  }

  getNote(id) {
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
  }

  createNote(data) {
    const id = data.id || 'nt_' + Date.now()
    this.db.prepare(`INSERT INTO notes (id, folder_id, title, content, file_path, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, data.folder_id || '', data.title || '新笔记', data.content || '', data.file_path || '', data.sort_order || 0)
    return this.getNote(id)
  }

  updateNote(id, data) {
    return dynamicUpdate(this.db, 'notes', id, data)
  }

  deleteNote(id) {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    return { success: true }
  }
}
