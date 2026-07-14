import { dynamicUpdate } from '../helpers.js'
import { BaseRepository } from './BaseRepository.js'

export class MemoryRepository extends BaseRepository {
  listMemories() {
    return this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all()
  }

  createMemory(data) {
    const id = data.id || 'mem_' + Date.now()
    this.db.prepare(`INSERT INTO memories (id, type, source, content)
      VALUES (?, ?, ?, ?)`).run(id, data.type || 'semantic', data.source || '', data.content || '')
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
  }

  updateMemory(id, data) {
    return dynamicUpdate(this.db, 'memories', id, data)
  }

  deleteMemory(id) {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return { success: true }
  }
}
