import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const db = () => window.electronAPI.db.spaces

export const useSpacesStore = defineStore('spaces', () => {
  const spaces = ref([])
  const currentSpaceId = ref(null)
  const loaded = ref(false)

  const currentSpace = computed(() =>
    spaces.value.find(s => s.id === currentSpaceId.value) || null
  )

  const totalDocs = computed(() =>
    spaces.value.reduce((sum, s) => sum + (s.docCount || 0), 0)
  )

  async function loadFromDb() {
    if (!window.electronAPI?.db) return
    try {
      const list = await db().list()
      // Attach doc counts and docs array for each space
      for (const sp of list) {
        sp.docCount = await window.electronAPI.db.spaces.docCount(sp.id)
        sp.docs = await window.electronAPI.db.docs.list(sp.id)
      }
      spaces.value = list
      loaded.value = true
    } catch (e) {
      console.error('Failed to load spaces from DB:', e)
    }
  }

  async function addSpace(space) {
    const data = {
      name: space.name || '',
      description: space.description || '',
      icon: space.icon || 'ri-folder-3-line',
      color: space.color || '#6C8AFF',
      ...space,
    }
    if (window.electronAPI?.db) {
      const result = await db().create(data)
      const id = result.id
      const created = { id, name: data.name, description: data.description, icon: data.icon, color: data.color, docCount: 0, docs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      spaces.value.push(created)
      return created
    }
    const fallback = { id: Date.now().toString(), ...data, docCount: 0, docs: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    spaces.value.push(fallback)
    return fallback
  }

  async function removeSpace(id) {
    if (window.electronAPI?.db) await db().delete(id)
    spaces.value = spaces.value.filter(s => s.id !== id)
    if (currentSpaceId.value === id) currentSpaceId.value = null
  }

  function setCurrentSpace(id) {
    currentSpaceId.value = id
  }

  async function addDocToSpace(spaceId, doc) {
    const data = { space_id: spaceId, name: doc.name, type: doc.type, size: doc.size || 0, status: 'pending', progress: 0, file_path: doc.file_path || '', ...doc }
    if (window.electronAPI?.db) {
      const result = await window.electronAPI.db.docs.create(data)
      const created = { id: result.id, name: data.name, type: data.type, size: data.size, status: data.status, progress: 0, createdAt: new Date().toISOString() }
      const space = spaces.value.find(s => s.id === spaceId)
      if (space) {
        space.docs.push(created)
        space.docCount = space.docs.length
        space.updatedAt = new Date().toISOString()
      }
      return created
    }
    const space = spaces.value.find(s => s.id === spaceId)
    if (space) {
      space.docs.push({ id: Date.now().toString(), ...data, progress: 0, createdAt: new Date().toISOString() })
      space.docCount = space.docs.length
      space.updatedAt = new Date().toISOString()
    }
  }

  async function updateDocStatus(spaceId, docId, status, progress) {
    if (window.electronAPI?.db) {
      const updateData = { status }
      if (progress !== undefined) updateData.progress = progress
      await window.electronAPI.db.docs.update(docId, updateData)
    }
    const space = spaces.value.find(s => s.id === spaceId)
    if (space) {
      const doc = space.docs.find(d => d.id === docId)
      if (doc) {
        doc.status = status
        if (progress !== undefined) doc.progress = progress
      }
    }
  }

  async function removeDoc(spaceId, docId) {
    if (window.electronAPI?.db) await window.electronAPI.db.docs.delete(docId)
    const space = spaces.value.find(s => s.id === spaceId)
    if (space) {
      space.docs = space.docs.filter(d => d.id !== docId)
      space.docCount = space.docs.length
      space.updatedAt = new Date().toISOString()
    }
  }

  return {
    spaces, currentSpaceId, currentSpace, totalDocs, loaded,
    loadFromDb, addSpace, removeSpace, setCurrentSpace,
    addDocToSpace, updateDocStatus, removeDoc,
  }
}, {
  persist: {
    pick: ['spaces', 'currentSpaceId'],
  },
})
