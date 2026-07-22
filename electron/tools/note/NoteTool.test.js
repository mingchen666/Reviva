import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { NoteFileService } from '../../NoteFileService.js'
import { createNoteTool } from './NoteTool.js'

class FakeNoteDb {
  constructor() {
    this.folders = []
    this.notes = []
    this.trash = []
    this.folderSequence = 0
    this.noteSequence = 0
  }

  listNoteFolders(parentId) {
    return parentId ? this.folders.filter(item => item.parent_id === parentId) : [...this.folders]
  }

  getNoteFolder(id) {
    return this.folders.find(item => item.id === id)
  }

  createNoteFolder(data = {}) {
    const now = new Date().toISOString()
    const folder = {
      id: data.id || `nf_${++this.folderSequence}`,
      parent_id: data.parent_id || '',
      name: data.name || 'New folder',
      created_at: now,
      updated_at: now,
    }
    this.folders.push(folder)
    return folder
  }

  updateNoteFolder(id, data = {}) {
    const folder = this.getNoteFolder(id)
    if (!folder) return null
    Object.assign(folder, data, { updated_at: new Date().toISOString() })
    return folder
  }

  deleteNoteFolder(id) {
    this.folders = this.folders.filter(item => item.id !== id)
    return { success: true }
  }

  listNotes(folderId) {
    return folderId ? this.notes.filter(item => item.folder_id === folderId) : [...this.notes]
  }

  getNote(id) {
    return this.notes.find(item => item.id === id)
  }

  createNote(data = {}) {
    const now = new Date().toISOString()
    const note = {
      id: data.id || `nt_${++this.noteSequence}`,
      folder_id: data.folder_id || '',
      title: data.title || 'New note',
      content: data.content || '',
      file_path: data.file_path || '',
      created_at: now,
      updated_at: now,
    }
    this.notes.push(note)
    return note
  }

  updateNote(id, data = {}) {
    const note = this.getNote(id)
    if (!note) return null
    Object.assign(note, data, { updated_at: new Date().toISOString() })
    return note
  }

  deleteNote(id) {
    this.notes = this.notes.filter(item => item.id !== id)
    return { success: true }
  }

  createTrashItem(data = {}) {
    const record = { id: `trash_${this.trash.length + 1}`, ...data }
    this.trash.push(record)
    return record
  }
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mindspace-note-tool-'))
  const notesRoot = path.join(root, 'notes')
  const workDir = {
    getRootPath: () => root,
    getNotesPath: () => notesRoot,
    resolveAndValidate(input, scope) {
      assert.equal(scope, 'notes')
      const resolved = path.resolve(input)
      const rel = path.relative(notesRoot, resolved)
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path is outside notes')
      return resolved
    },
  }
  const db = new FakeNoteDb()
  const service = new NoteFileService(db, workDir)
  return {
    root,
    db,
    service,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

async function invoke(noteTool, input) {
  return JSON.parse(await noteTool.invoke(input))
}

test('NoteFileService resolves and creates nested folder paths', async () => {
  const fixture = createFixture()
  try {
    const folder = await fixture.service.resolveFolderPath('Projects/Product A/Meetings', { createMissing: true })
    assert.equal(folder.path, 'Projects/Product A/Meetings')
    assert.equal(folder.chain.length, 3)
    assert.equal(fixture.db.folders.length, 3)
    assert.equal(fs.existsSync(path.join(fixture.root, 'notes', 'Projects', 'Product A', 'Meetings')), true)

    const same = await fixture.service.resolveFolderPath('projects/product a/meetings')
    assert.equal(same.id, folder.id)

    await assert.rejects(
      fixture.service.resolveFolderPath('Projects/Missing', { createMissing: false }),
      error => error.code === 'FOLDER_NOT_FOUND' && error.details.missingSegment === 'Missing',
    )
  } finally {
    fixture.cleanup()
  }
})

test('note_tool creates, lists, moves, reads, and trashes notes in nested folders', async () => {
  const fixture = createFixture()
  try {
    const context = { permissions: { noteRead: true, noteWrite: true } }
    const noteTool = createNoteTool({ getNoteService: () => fixture.service, getRunContext: () => context })

    const created = await invoke(noteTool, {
      action: 'create',
      title: 'Weekly sync',
      content: '# Week 1',
      folder_path: 'Projects/Product A/Meetings',
    })
    assert.equal(created.success, true)
    assert.equal(created.note.folder_path, 'Projects/Product A/Meetings')
    assert.equal(fs.existsSync(path.join(fixture.root, created.note.file_path)), true)

    const rootList = await invoke(noteTool, { action: 'list' })
    assert.deepEqual(rootList.folders.map(item => item.name), ['Projects'])
    assert.equal(rootList.notes.length, 0)

    const moved = await invoke(noteTool, {
      action: 'update',
      note_id: created.note.id,
      content: '# Week 2',
      folder_path: 'Archive/2026',
    })
    assert.equal(moved.success, true)
    assert.equal(moved.note.folder_path, 'Archive/2026')
    assert.equal(moved.note.content, '# Week 2')
    assert.equal(fs.existsSync(path.join(fixture.root, moved.note.file_path)), true)
    assert.equal(fs.existsSync(path.join(fixture.root, created.note.file_path)), false)

    const read = await invoke(noteTool, { action: 'get', note_id: created.note.id })
    assert.equal(read.note.content, '# Week 2')

    const sameTitleElsewhere = await invoke(noteTool, {
      action: 'create',
      title: 'Weekly sync',
      folder_path: 'Projects/Product B/Meetings',
    })
    assert.equal(sameTitleElsewhere.success, true)
    assert.equal(sameTitleElsewhere.note.title, 'Weekly sync')

    const deleted = await invoke(noteTool, { action: 'delete', note_id: created.note.id })
    assert.equal(deleted.success, true)
    assert.equal(deleted.trashed, true)
    assert.equal(fixture.db.getNote(created.note.id), undefined)
    assert.equal(fixture.db.trash.length, 1)
  } finally {
    fixture.cleanup()
  }
})

test('note_tool enforces read and write permissions', async () => {
  const fixture = createFixture()
  try {
    const context = { permissions: { noteRead: true, noteWrite: false } }
    const noteTool = createNoteTool({ getNoteService: () => fixture.service, getRunContext: () => context })
    const listed = await invoke(noteTool, { action: 'list' })
    assert.equal(listed.success, true)

    const denied = await invoke(noteTool, { action: 'create', title: 'Denied' })
    assert.equal(denied.success, false)
    assert.equal(denied.code, 'NOTE_PERMISSION_DENIED')
    assert.equal(fixture.db.notes.length, 0)
  } finally {
    fixture.cleanup()
  }
})

test('note_tool rejects missing folders, duplicate folders, and conflicting targets', async () => {
  const fixture = createFixture()
  try {
    const context = { permissions: { noteRead: true, noteWrite: true } }
    const noteTool = createNoteTool({ getNoteService: () => fixture.service, getRunContext: () => context })

    const missing = await invoke(noteTool, {
      action: 'create',
      title: 'Strict note',
      folder_path: 'Missing/Folder',
      create_folders: false,
    })
    assert.equal(missing.success, false)
    assert.equal(missing.code, 'FOLDER_NOT_FOUND')
    assert.equal(fixture.db.notes.length, 0)

    const folder = await invoke(noteTool, { action: 'create_folder', folder_path: 'Projects/Product A' })
    assert.equal(folder.success, true)
    const childFolder = await invoke(noteTool, {
      action: 'create_folder',
      parent_folder_id: folder.folder.id,
      name: 'Meetings',
    })
    assert.equal(childFolder.success, true)
    assert.equal(childFolder.folder.path, 'Projects/Product A/Meetings')
    const duplicate = await invoke(noteTool, { action: 'create_folder', folder_path: 'Projects/Product A' })
    assert.equal(duplicate.success, false)
    assert.equal(duplicate.code, 'DUPLICATE_FOLDER')

    const conflict = await invoke(noteTool, {
      action: 'list',
      folder_id: '',
      folder_path: 'Projects',
    })
    assert.equal(conflict.success, false)
    assert.equal(conflict.code, 'FOLDER_TARGET_CONFLICT')

    const mixedCreateFolder = await invoke(noteTool, {
      action: 'create_folder',
      folder_path: 'A/B',
      parent_folder_id: '',
      name: 'B',
    })
    assert.equal(mixedCreateFolder.success, false)
    assert.equal(mixedCreateFolder.code, 'INVALID_ARGUMENT')

    const invalidPath = await invoke(noteTool, { action: 'create', title: 'Invalid', folder_path: 'Bad:Name' })
    assert.equal(invalidPath.success, false)
    assert.equal(invalidPath.code, 'INVALID_FOLDER_PATH')
  } finally {
    fixture.cleanup()
  }
})
