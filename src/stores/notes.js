import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const dbFolders = () => window.electronAPI?.db?.noteFolders
const dbNotes = () => window.electronAPI?.db?.notes
const NOTE_AI_SETTINGS_KEY = 'reviva:note-ai-settings'

function loadPersistedAiSettings() {
  try {
    const raw = localStorage.getItem(NOTE_AI_SETTINGS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function savePersistedAiSettings(settings) {
  try {
    localStorage.setItem(NOTE_AI_SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

export const useNotesStore = defineStore('notes', () => {
  const folders = ref([])
  const notes = ref([])
  const currentFolderId = ref(null)
  const currentNoteId = ref(null)
  const expandedFolderIds = ref(new Set())
  const loaded = ref(false)

  // ─── Computed ───

  const currentFolder = computed(() =>
    folders.value.find(f => f.id === currentFolderId.value) || null
  )

  const currentNote = computed(() =>
    notes.value.find(n => n.id === currentNoteId.value) || null
  )

  const folderTree = computed(() => {
    const rootFolders = folders.value.filter(f => !f.parent_id || f.parent_id === '')
    return buildTree(rootFolders)
  })

  function buildTree(nodes) {
    return nodes.map(node => ({
      ...node,
      expanded: expandedFolderIds.value.has(node.id),
      children: buildTree(folders.value.filter(f => f.parent_id === node.id)),
    }))
  }

  const currentFolderNotes = computed(() =>
    currentFolderId.value
      ? notes.value.filter(n => n.folder_id === currentFolderId.value)
      : notes.value
  )

  const totalNotes = computed(() => notes.value.length)
  const totalFolders = computed(() => folders.value.length)

  // ─── Load ───

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      const folderList = await dbFolders().list()
      const noteList = await dbNotes().list()
      folders.value = folderList
      notes.value = noteList
      // Validate current selections
      if (currentNoteId.value && !noteList.find(n => n.id === currentNoteId.value)) currentNoteId.value = null
      if (currentFolderId.value && !folderList.find(f => f.id === currentFolderId.value)) currentFolderId.value = null
      loaded.value = true
      migrateAiSettings()
    } catch (e) {
      console.error('Failed to load notes from DB:', e)
    }
  }

  // ─── Folder CRUD ───

  async function addFolder(data) {
    const result = await dbFolders().create(JSON.parse(JSON.stringify(data)))
    if (result?.error) throw new Error(result.error)
    const created = {
      id: result.id,
      parent_id: data.parent_id || '',
      name: data.name || '新文件夹',
      icon: data.icon || 'ri-folder-line',
      color: data.color || '#6C8AFF',
      sort_order: data.sort_order || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    folders.value.push(created)
    return created
  }

  async function updateFolder(id, data) {
    const result = await dbFolders().update(id, JSON.parse(JSON.stringify(data)))
    if (result?.error) throw new Error(result.error)
    const folder = folders.value.find(f => f.id === id)
    if (folder) Object.assign(folder, data)
  }

  async function deleteFolder(id) {
    // Soft delete: route through recycleBin store so its items array updates reactively
    if (window.electronAPI?.recycleBin) {
      const { useRecycleBinStore } = await import('./recycleBin')
      await useRecycleBinStore().trashNoteFolder(id)
    } else {
      await dbFolders().delete(id)
      const folderNotes = notes.value.filter(n => n.folder_id === id)
      for (const note of folderNotes) {
        await dbNotes().delete(note.id)
      }
    }

    // Recursive local state cleanup: collect all descendant folder IDs
    const toRemoveFolderIds = new Set([id])
    let added = true
    while (added) {
      added = false
      for (const f of folders.value) {
        if (toRemoveFolderIds.has(f.parent_id) && !toRemoveFolderIds.has(f.id)) {
          toRemoveFolderIds.add(f.id)
          added = true
        }
      }
    }
    folders.value = folders.value.filter(f => !toRemoveFolderIds.has(f.id))
    notes.value = notes.value.filter(n => !toRemoveFolderIds.has(n.folder_id))
    for (const fid of toRemoveFolderIds) expandedFolderIds.value.delete(fid)
    if (currentFolderId.value && toRemoveFolderIds.has(currentFolderId.value)) currentFolderId.value = null
    if (currentNoteId.value && !notes.value.find(n => n.id === currentNoteId.value)) {
      currentNoteId.value = null
    }
  }

  function setCurrentFolder(id) {
    currentFolderId.value = id
  }

  function toggleFolderExpand(id) {
    const set = expandedFolderIds.value
    if (set.has(id)) set.delete(id)
    else set.add(id)
    // Trigger reactivity by creating new Set
    expandedFolderIds.value = new Set(set)
  }

  // ─── Note CRUD ───

  async function addNote(data) {
    const result = await dbNotes().create(JSON.parse(JSON.stringify(data)))
    if (result?.error) throw new Error(result.error)
    const created = {
      id: result.id,
      folder_id: result.folder_id ?? data.folder_id ?? currentFolderId.value ?? '',
      title: result.title || data.title || '新笔记',
      content: result.content ?? data.content ?? '',
      file_path: result.file_path || '',
      sort_order: result.sort_order ?? data.sort_order ?? 0,
      created_at: result.created_at || new Date().toISOString(),
      updated_at: result.updated_at || new Date().toISOString(),
    }
    notes.value.unshift(created)
    currentNoteId.value = created.id
    return created
  }

  async function updateNote(id, data) {
    const result = await dbNotes().update(id, JSON.parse(JSON.stringify(data)))
    if (result?.error) throw new Error(result.error)
    const note = notes.value.find(n => n.id === id)
    if (note) {
      Object.assign(note, data, result || {})
      note.updated_at = result?.updated_at || new Date().toISOString()
    }
    return result
  }

  async function deleteNote(id) {
    if (window.electronAPI?.recycleBin) {
      const { useRecycleBinStore } = await import('./recycleBin')
      await useRecycleBinStore().trashNote(id)
    } else {
      await dbNotes().delete(id)
    }
    notes.value = notes.value.filter(n => n.id !== id)
    if (currentNoteId.value === id) currentNoteId.value = null
  }

  function setCurrentNote(id) {
    currentNoteId.value = id
  }

  // ─── AI / Editor preferences ───
  const aiSettings = ref(loadPersistedAiSettings() || {
    noteProviderId: '',
    noteModelId: '',
  })

  function updateAiSettings(patch) {
    const nextSettings = { ...aiSettings.value, ...(patch || {}) }
    delete nextSettings.noteAgentId
    aiSettings.value = nextSettings
    savePersistedAiSettings(aiSettings.value)
  }

  function migrateAiSettings() {
    const s = aiSettings.value
    if (s && (s.noteAgentId !== undefined || s.completionEnabled !== undefined || s.completionProviderId !== undefined || s.completionModel !== undefined)) {
      aiSettings.value = {
        noteProviderId: s.noteProviderId || '',
        noteModelId: s.noteModelId || '',
      }
      savePersistedAiSettings(aiSettings.value)
    }
  }

  return {
    folders, notes, currentFolderId, currentNoteId, expandedFolderIds, loaded,
    currentFolder, currentNote, folderTree, currentFolderNotes,
    totalNotes, totalFolders,
    aiSettings, updateAiSettings,
    loadFromDb, addFolder, updateFolder, deleteFolder, setCurrentFolder, toggleFolderExpand,
    addNote, updateNote, deleteNote, setCurrentNote,
  }
}, {
  persist: {
    pick: ['folders', 'notes', 'currentFolderId', 'currentNoteId'],
  },
})
