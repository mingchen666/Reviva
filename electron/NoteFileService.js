// electron/NoteFileService.js — keeps note bodies as Markdown files in {workspace}/notes
import path from 'node:path'
import fs from 'node:fs'

const DEFAULT_NOTE_TITLE = '新笔记'

function toPosixPath(filePath) {
  return filePath.replace(/\\/g, '/')
}

function sanitizePathSegment(name, fallback = DEFAULT_NOTE_TITLE) {
  return String(name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80) || fallback
}

function isSamePath(a, b) {
  return path.resolve(a) === path.resolve(b)
}

async function moveFile(oldPath, newPath) {
  if (!oldPath || !fs.existsSync(oldPath)) return false
  if (isSamePath(oldPath, newPath)) return true
  await fs.promises.mkdir(path.dirname(newPath), { recursive: true })
  if (fs.existsSync(newPath)) throw new Error(`Note file already exists: ${newPath}`)
  await fs.promises.rename(oldPath, newPath)
  return true
}

export class NoteFileService {
  constructor(dbService, workDirService) {
    this._db = dbService
    this._workDir = workDirService
  }

  getRootPath() {
    return this._workDir?.getRootPath?.() || ''
  }

  getNotesPath() {
    return this._workDir?.getNotesPath?.() || (this.getRootPath() ? path.join(this.getRootPath(), 'notes') : '')
  }

  hasWorkspace() {
    return !!this.getRootPath()
  }

  async ensureNotesDir() {
    const notesPath = this.getNotesPath()
    if (!notesPath) return ''
    await fs.promises.mkdir(notesPath, { recursive: true })
    return notesPath
  }

  resolveNotePath(filePath) {
    if (!this.hasWorkspace() || !filePath) return ''
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.getRootPath(), filePath)
    return this._workDir.resolveAndValidate(absolutePath, 'notes')
  }

  relativeToWorkspace(absolutePath) {
    return toPosixPath(path.relative(this.getRootPath(), absolutePath))
  }

  getFolderChain(folderId) {
    const chain = []
    const visited = new Set()
    let currentId = folderId || ''

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const folder = this._db.getNoteFolder(currentId)
      if (!folder) break
      chain.unshift(folder)
      currentId = folder.parent_id || ''
    }

    return chain
  }

  getFolderRelativeDir(folderId) {
    const segments = this.getFolderChain(folderId).map(folder => sanitizePathSegment(folder.name, '未命名文件夹'))
    return toPosixPath(path.join('notes', ...segments))
  }

  listSiblingNotes(folderId, excludeId = '') {
    return this._db.listNotes(folderId || '').filter(note => note.id !== excludeId)
  }

  collectPhysicalNames(relativeDir, currentPath = '') {
    const absoluteDir = this.resolveNotePath(relativeDir)
    const currentAbsolutePath = currentPath ? this.resolveNotePath(currentPath) : ''
    const names = new Set()
    if (!absoluteDir || !fs.existsSync(absoluteDir)) return names

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue
      const absolutePath = path.join(absoluteDir, entry.name)
      if (currentAbsolutePath && isSamePath(absolutePath, currentAbsolutePath)) continue
      names.add(path.basename(entry.name, '.md').toLowerCase())
    }
    return names
  }

  collectUsedNamesForNote(note) {
    const relativeDir = this.getFolderRelativeDir(note.folder_id || '')
    const usedNames = this.collectPhysicalNames(relativeDir, note.file_path || '')

    for (const sibling of this.listSiblingNotes(note.folder_id || '', note.id)) {
      const siblingPath = sibling.file_path || ''
      const siblingDir = siblingPath ? toPosixPath(path.dirname(siblingPath)) : relativeDir
      if (siblingDir !== relativeDir) continue

      const siblingBase = siblingPath
        ? path.basename(siblingPath, path.extname(siblingPath))
        : sanitizePathSegment(sibling.title, DEFAULT_NOTE_TITLE)
      usedNames.add(siblingBase.toLowerCase())
    }

    return { relativeDir, usedNames }
  }

  buildUniqueTitle(note) {
    const baseName = sanitizePathSegment(note.title, DEFAULT_NOTE_TITLE)
    const { usedNames } = this.collectUsedNamesForNote(note)

    let fileName = baseName
    let index = 2

    while (usedNames.has(fileName.toLowerCase())) {
      fileName = `${baseName} (${index})`
      index += 1
    }

    return fileName
  }

  buildRelativePath(note, options = {}) {
    const { preserveExisting = false } = options
    if (preserveExisting && note.file_path) return note.file_path

    const { relativeDir } = this.collectUsedNamesForNote(note)
    const fileName = sanitizePathSegment(note.title, DEFAULT_NOTE_TITLE)
    return toPosixPath(path.join(relativeDir, `${fileName}.md`))
  }

  async createNoteFolder(data = {}) {
    if (this.hasWorkspace()) {
      await this.ensureNotesDir()
      const parentDir = this.getFolderRelativeDir(data.parent_id || '')
      const folderName = sanitizePathSegment(data.name, '未命名文件夹')
      const targetDir = this.resolveNotePath(toPosixPath(path.join(parentDir, folderName)))
      if (targetDir && fs.existsSync(targetDir)) throw new Error(`Note folder already exists: ${targetDir}`)
    }

    const folder = this._db.createNoteFolder(data)
    if (this.hasWorkspace()) {
      await fs.promises.mkdir(this.resolveNotePath(this.getFolderRelativeDir(folder.id)), { recursive: true })
    }
    return folder
  }

  async updateNoteFolder(id, data = {}) {
    const previousDir = this.hasWorkspace() ? this.getFolderRelativeDir(id) : ''
    const folder = this._db.updateNoteFolder(id, data)

    if (this.hasWorkspace() && data.name !== undefined) {
      const nextDir = this.getFolderRelativeDir(id)
      const previousAbsoluteDir = this.resolveNotePath(previousDir)
      const nextAbsoluteDir = this.resolveNotePath(nextDir)

      if (previousAbsoluteDir && nextAbsoluteDir && fs.existsSync(previousAbsoluteDir) && !isSamePath(previousAbsoluteDir, nextAbsoluteDir)) {
        if (fs.existsSync(nextAbsoluteDir)) throw new Error(`Note folder already exists: ${nextAbsoluteDir}`)
        await fs.promises.mkdir(path.dirname(nextAbsoluteDir), { recursive: true })
        await fs.promises.rename(previousAbsoluteDir, nextAbsoluteDir)
        await this.rewriteDescendantNotePaths(previousDir, nextDir)
      } else if (nextAbsoluteDir) {
        await fs.promises.mkdir(nextAbsoluteDir, { recursive: true })
      }
    }

    return folder
  }

  async deleteNoteFolder(id) {
    const relativeDir = this.hasWorkspace() ? this.getFolderRelativeDir(id) : ''
    const result = this._db.deleteNoteFolder(id)
    if (relativeDir) {
      const absoluteDir = this.resolveNotePath(relativeDir)
      if (absoluteDir && fs.existsSync(absoluteDir)) await fs.promises.rm(absoluteDir, { recursive: true, force: true })
    }
    return result
  }

  collectDescendantFolderIds(folderId) {
    const ids = new Set([folderId])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of this._db.listNoteFolders()) {
        if (ids.has(folder.parent_id) && !ids.has(folder.id)) {
          ids.add(folder.id)
          changed = true
        }
      }
    }
    return ids
  }

  async rewriteDescendantNotePaths(previousDir, nextDir) {
    const previousPrefix = `${toPosixPath(previousDir).replace(/\/$/, '')}/`
    const nextPrefix = `${toPosixPath(nextDir).replace(/\/$/, '')}/`

    for (const note of this._db.listNotes()) {
      const filePath = toPosixPath(note.file_path || '')
      if (filePath.startsWith(previousPrefix)) {
        this._db.updateNote(note.id, { file_path: nextPrefix + filePath.slice(previousPrefix.length) })
      }
    }
  }

  async readFileContent(filePath) {
    const absolutePath = this.resolveNotePath(filePath)
    if (!absolutePath || !fs.existsSync(absolutePath)) return ''
    return fs.promises.readFile(absolutePath, 'utf-8')
  }

  async writeFileContent(filePath, content) {
    const absolutePath = this.resolveNotePath(filePath)
    if (!absolutePath) return ''
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.promises.writeFile(absolutePath, content || '', 'utf-8')
    return absolutePath
  }

  async ensureNoteFile(note) {
    if (!note || !this.hasWorkspace()) return note
    await this.ensureNotesDir()

    let nextNote = { ...note }
    let filePath = nextNote.file_path || ''
    if (!filePath) {
      const title = this.buildUniqueTitle(nextNote)
      nextNote = { ...nextNote, title }
      filePath = this.buildRelativePath(nextNote)
      await this.writeFileContent(filePath, nextNote.content || '')
      nextNote = this._db.updateNote(nextNote.id, { title, file_path: filePath, content: '' }) || { ...nextNote, file_path: filePath, content: '' }
    }

    const absolutePath = this.resolveNotePath(filePath)
    if (!fs.existsSync(absolutePath)) {
      await this.writeFileContent(filePath, nextNote.content || '')
    }

    return {
      ...nextNote,
      file_path: filePath,
      content: await this.readFileContent(filePath),
    }
  }

  async listNotes(folderId) {
    const notes = this._db.listNotes(folderId)
    const result = []
    for (const note of notes) {
      result.push(await this.ensureNoteFile(note))
    }
    return result
  }

  async getNote(id) {
    return this.ensureNoteFile(this._db.getNote(id))
  }

  async createNote(data = {}) {
    if (!this.hasWorkspace()) return this._db.createNote(data)

    await this.ensureNotesDir()
    const id = data.id || 'nt_' + Date.now()
    const title = data.title || DEFAULT_NOTE_TITLE
    const draft = { ...data, id, title, folder_id: data.folder_id || '' }
    const finalTitle = this.buildUniqueTitle(draft)
    const filePath = data.file_path || this.buildRelativePath({ ...draft, title: finalTitle })
    await this.writeFileContent(filePath, data.content || '')

    const created = this._db.createNote({
      ...data,
      id,
      title: finalTitle,
      file_path: filePath,
      content: '',
    })
    return this.ensureNoteFile(created)
  }

  async updateNote(id, data = {}) {
    const existing = this._db.getNote(id)
    if (!existing) return null
    if (!this.hasWorkspace()) return this._db.updateNote(id, data)

    const note = await this.ensureNoteFile(existing)
    const nextNote = { ...note, ...data, id }
    let filePath = note.file_path
    const shouldMoveFile = Object.prototype.hasOwnProperty.call(data, 'title') || Object.prototype.hasOwnProperty.call(data, 'folder_id')
    let finalTitle = nextNote.title || DEFAULT_NOTE_TITLE

    if (shouldMoveFile) {
      finalTitle = this.buildUniqueTitle(nextNote)
      const nextPath = this.buildRelativePath({ ...nextNote, title: finalTitle })
      if (nextPath !== filePath) {
        await moveFile(this.resolveNotePath(filePath), this.resolveNotePath(nextPath))
        filePath = nextPath
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'content')) {
      await this.writeFileContent(filePath, data.content || '')
    }

    const dbData = { ...data, file_path: filePath }
    if (shouldMoveFile) dbData.title = finalTitle
    if (Object.prototype.hasOwnProperty.call(dbData, 'content')) dbData.content = ''
    const updated = this._db.updateNote(id, dbData) || this._db.getNote(id)
    return this.ensureNoteFile(updated)
  }

  async deleteNote(id, { deleteFile = true } = {}) {
    const note = this._db.getNote(id)
    if (deleteFile && note?.file_path && this.hasWorkspace()) {
      const absolutePath = this.resolveNotePath(note.file_path)
      if (absolutePath && fs.existsSync(absolutePath)) await fs.promises.rm(absolutePath, { force: true })
    }
    return this._db.deleteNote(id)
  }

  async trashNote(id) {
    const note = await this.getNote(id)
    if (!note) return { success: false, error: 'Note not found' }

    let originalPath = ''
    let trashPath = ''
    let size = (note.content || '').length

    if (this.hasWorkspace() && note.file_path) {
      originalPath = this.resolveNotePath(note.file_path)
      if (originalPath && fs.existsSync(originalPath)) {
        const trashDir = path.join(this.getRootPath(), '.reviva', 'trash')
        await fs.promises.mkdir(trashDir, { recursive: true })
        trashPath = path.join(trashDir, `${Date.now()}_${path.basename(originalPath)}`)
        const stat = await fs.promises.stat(originalPath).catch(() => null)
        size = stat?.size || size
        await fs.promises.rename(originalPath, trashPath)
      }
    }

    const record = this._db.createTrashItem({
      original_path: originalPath,
      original_name: note.title || DEFAULT_NOTE_TITLE,
      trash_path: trashPath,
      is_directory: 0,
      size,
      file_type: 'md',
      category: 'note',
      item_type: 'note',
      item_id: note.id,
      payload_json: JSON.stringify({ note }),
    })

    this._db.deleteNote(id)
    return { success: true, data: record }
  }

  async restoreNote(record) {
    const payload = record.payload_json ? JSON.parse(record.payload_json) : {}
    const note = payload.note
    if (!note) throw new Error('Note payload missing')

    if (note.folder_id && !this._db.getNoteFolder(note.folder_id)) note.folder_id = ''
    if (this._db.getNote(note.id)) note.id = 'nt_' + Date.now()

    if (this.hasWorkspace()) {
      await this.ensureNotesDir()
      note.title = this.buildUniqueTitle(note)
      const filePath = this.buildRelativePath(note)
      const absolutePath = this.resolveNotePath(filePath)

      if (record.trash_path && fs.existsSync(record.trash_path)) {
        await moveFile(record.trash_path, absolutePath)
      } else {
        await this.writeFileContent(filePath, note.content || '')
      }

      note.file_path = this.relativeToWorkspace(absolutePath)
      note.content = ''
    }

    this._db.createNote(note)
    return { restoredId: note.id }
  }
}
