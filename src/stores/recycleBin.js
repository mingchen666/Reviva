import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const dbTrash = () => window.electronAPI?.db?.trash
const rbApi = () => window.electronAPI?.recycleBin

export const useRecycleBinStore = defineStore('recycleBin', () => {
  const items = ref([])
  const loaded = ref(false)

  function getDateStr(isoStr) {
    if (!isoStr) return ''
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const totalCount = computed(() => items.value.length)

  const dateGroups = computed(() => {
    const now = new Date()
    const todayStr = getDateStr(now.toISOString())
    const yesterdayDate = new Date(now.getTime() - 86400000)
    const yesterdayStr = getDateStr(yesterdayDate.toISOString())
    const weekStart = new Date(now.getTime() - 7 * 86400000)
    const weekStartStr = getDateStr(weekStart.toISOString())

    const order = ['今天', '昨天', '本周', '更早']
    const map = {}

    items.value.forEach(item => {
      const dateStr = getDateStr(item.deleted_at)
      let label
      if (dateStr === todayStr) label = '今天'
      else if (dateStr === yesterdayStr) label = '昨天'
      else if (dateStr >= weekStartStr) label = '本周'
      else label = '更早'

      if (!map[label]) map[label] = { key: label, label, files: [] }
      map[label].files.push(item)
    })

    return order.filter(k => map[k]).map(k => map[k])
  })

  const categoryGroups = computed(() => {
    const cats = [
      { key: 'folder', label: '文件夹', icon: 'ri-folder-3-line', color: '#FACC15' },
      { key: 'document', label: '文档', icon: 'ri-file-text-line', color: '#6C8AFF' },
      { key: 'image', label: '图片', icon: 'ri-image-line', color: '#EC4899' },
      { key: 'video', label: '视频', icon: 'ri-movie-line', color: '#A78BFA' },
      { key: 'audio', label: '音频', icon: 'ri-music-line', color: '#38BDF8' },
      { key: 'archive', label: '压缩包', icon: 'ri-file-zip-line', color: '#FACC15' },
      { key: 'code', label: '代码', icon: 'ri-code-line', color: '#34D399' },
      { key: 'chat', label: '对话', icon: 'ri-chat-3-line', color: '#A78BFA' },
      { key: 'note', label: '笔记', icon: 'ri-sticky-note-line', color: '#34D399' },
      { key: 'artifact', label: '生成结果', icon: 'ri-magic-line', color: '#38BDF8' },
      { key: 'other', label: '其他', icon: 'ri-file-line', color: '#78788a' },
    ]
    const result = []
    for (const cat of cats) {
      const files = items.value.filter(i => i.category === cat.key)
      if (files.length > 0) result.push({ ...cat, files })
    }
    return result
  })

  async function loadFromDb() {
    if (!dbTrash()) return
    try {
      items.value = await dbTrash().list()
      loaded.value = true
    } catch (e) {
      console.error('Failed to load recycle bin:', e)
    }
  }

  async function moveToTrash(itemPath, itemMeta) {
    if (!rbApi()) return { success: false, error: 'API not available' }
    const result = await rbApi().moveToTrash(itemPath, itemMeta)
    if (result.success) {
      items.value.unshift(result.data)
    }
    return result
  }

  async function trashConversation(convId) {
    if (!rbApi()) return { success: false, error: 'API not available' }
    const result = await rbApi().trashConversation(convId)
    if (result.success && result.data) {
      items.value.unshift(result.data)
    }
    return result
  }

  async function trashNote(noteId) {
    if (!rbApi()) return { success: false, error: 'API not available' }
    const result = await rbApi().trashNote(noteId)
    if (result.success && result.data) {
      items.value.unshift(result.data)
    }
    return result
  }

  async function trashNoteFolder(folderId) {
    if (!rbApi()) return { success: false, error: 'API not available' }
    const result = await rbApi().trashNoteFolder(folderId)
    if (result.success) {
      // Multiple records produced — reload to keep state consistent
      await loadFromDb()
    }
    return result
  }

  async function trashArtifact(artifactId, options = {}) {
    if (!rbApi()) return { success: false, error: 'API not available' }
    const result = await rbApi().trashArtifact(artifactId, options)
    if (result.success && result.data) {
      items.value.unshift(result.data)
      window.dispatchEvent(new CustomEvent('reviva:artifacts-updated', { detail: { artifactId } }))
    }
    return result
  }

  // Lazy refresh affected stores after restoring DB-typed items.
  // Avoids import cycles by importing stores at call time.
  async function _refreshAffectedStores(itemTypes) {
    if (!itemTypes || itemTypes.size === 0) return
    if (itemTypes.has('conversation')) {
      const { useConversationsStore } = await import('@/stores/conversations')
      await useConversationsStore().loadFromDb()
    }
    if (itemTypes.has('note') || itemTypes.has('note_folder')) {
      const { useNotesStore } = await import('@/stores/notes')
      await useNotesStore().loadFromDb()
    }
    if (itemTypes.has('artifact')) {
      window.dispatchEvent(new CustomEvent('reviva:artifacts-updated', { detail: { source: 'recycleBin' } }))
    }
  }

  async function restoreItem(trashId) {
    if (!rbApi()) return { success: false }
    const item = items.value.find(i => i.id === trashId)
    const itemTypes = item ? new Set([item.item_type || 'file']) : new Set()
    const result = await rbApi().restore(trashId)
    if (result.success) {
      items.value = items.value.filter(i => i.id !== trashId)
      await _refreshAffectedStores(itemTypes)
    }
    return result
  }

  async function restoreBatch(trashIds) {
    if (!rbApi()) return { success: false }
    const itemTypes = new Set(
      trashIds
        .map(id => items.value.find(i => i.id === id)?.item_type || 'file')
    )
    const result = await rbApi().restoreBatch(trashIds)
    if (result.success) {
      const failedIds = (result.results || []).filter(r => !r.success).map(r => r.id)
      items.value = items.value.filter(i => !trashIds.includes(i.id) || failedIds.includes(i.id))
      await _refreshAffectedStores(itemTypes)
    }
    return result
  }

  async function deletePermanently(trashId) {
    if (!rbApi()) return { success: false }
    const result = await rbApi().deletePermanently(trashId)
    if (result.success) {
      items.value = items.value.filter(i => i.id !== trashId)
    }
    return result
  }

  async function deleteBatchPermanently(trashIds) {
    if (!rbApi()) return { success: false }
    const result = await rbApi().deleteBatchPermanently(trashIds)
    if (result.success) {
      items.value = items.value.filter(i => !trashIds.includes(i.id))
    }
    return result
  }

  async function emptyTrash() {
    if (!rbApi()) return { success: false }
    const result = await rbApi().emptyTrash()
    if (result.success) {
      items.value = []
    }
    return result
  }

  return {
    items, loaded, totalCount,
    dateGroups, categoryGroups,
    loadFromDb, moveToTrash,
    trashConversation, trashNote, trashNoteFolder, trashArtifact,
    restoreItem, restoreBatch,
    deletePermanently, deleteBatchPermanently, emptyTrash,
  }
}, {
  persist: {
    pick: ['items'],
  },
})
