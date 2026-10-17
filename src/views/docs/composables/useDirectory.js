import { ref, computed } from 'vue'

export function useDirectory({ items, isReady, settingsStore, status, media }) {
  const api = () => window.electronAPI
  const { baseProcessingStatusFor } = status
  const { loadDocumentProcessingStatuses } = media

  const currentPath = ref('')
  const loading = ref(false)
  const selectedItem = ref(null)
  const searchQuery = ref('')
  const viewMode = ref('grid')
  const activeTreePath = ref('')
  const folderTree = ref({ folders: [], files: [] })

  function getDocsBasePath() {
    return settingsStore.getDocsPath()
  }

  function getAbsolutePath(relPath) {
    const base = getDocsBasePath()
    if (!base) return ''
    return relPath ? base + '/' + relPath : base
  }

  function normalizeRelativePath(relPath) {
    return String(relPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  }

  function getItemRelativePath(item) {
    if (typeof item?.relPath === 'string') return normalizeRelativePath(item.relPath)
    const docsBase = normalizeRelativePath(getDocsBasePath())
    const itemPath = normalizeRelativePath(item?.path)
    if (!docsBase || !itemPath) return null
    if (itemPath.toLowerCase() === docsBase.toLowerCase()) return ''
    const prefix = docsBase + '/'
    if (!itemPath.toLowerCase().startsWith(prefix.toLowerCase())) return null
    return itemPath.slice(prefix.length)
  }

  async function loadDirectory(relPath) {
    if (!isReady.value || !api()?.listDir) return
    loading.value = true
    try {
      const absPath = getAbsolutePath(relPath)
      const result = await api().listDir(absPath)
      if (result.success) {
        const sorted = result.data
          .filter((f) => !f.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1
            if (!a.isDirectory && b.isDirectory) return 1
            return a.name.localeCompare(b.name)
          })
          .map(item => ({ ...item, processingStatus: baseProcessingStatusFor(item) }))
        items.value = sorted
        loadDocumentProcessingStatuses(sorted)
        sorted.forEach(async (entry, idx) => {
          if (!entry.isDirectory) return
          try {
            const sub = await api().listDir(entry.path)
            if (sub?.success) {
              const count = sub.data.filter((f) => !f.name.startsWith('.')).length
              items.value[idx] = { ...items.value[idx], childCount: count }
            }
          } catch (e) { /* ignore */ }
        })
      }
    } catch (e) {
      console.error('Failed to load directory:', e)
    }
    loading.value = false
  }

  function navigateTo(relPath) {
    currentPath.value = relPath
    selectedItem.value = null
  }

  function openItem(item) {
    if (item.isDirectory) {
      const newPath = currentPath.value ? currentPath.value + '/' + item.name : item.name
      navigateTo(newPath)
      loadDirectory(newPath)
      expandPathInTree(newPath)
    } else {
      api()?.openPath?.(item.path)
    }
  }

  async function loadFolderTree() {
    if (!isReady.value || !api()?.listDir) return
    const base = settingsStore.getDocsPath()
    if (!base) return
    try {
      const tree = await buildTree(base, '')
      folderTree.value = tree
    } catch (e) {
      console.error('Failed to load folder tree:', e)
    }
  }

  async function buildTree(absPath, relPath) {
    const result = await api().listDir(absPath)
    if (!result.success) return { folders: [], files: [] }
    const entries = result.data.filter((f) => !f.name.startsWith('.'))
    const dirs = entries.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter((f) => !f.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
    const folderNodes = []
    for (const d of dirs) {
      const childRel = relPath ? relPath + '/' + d.name : d.name
      const childAbs = absPath + '/' + d.name
      const sub = await buildTree(childAbs, childRel)
      folderNodes.push({ name: d.name, path: childRel, expanded: false, children: sub.folders, files: sub.files })
    }
    const fileItems = files.map((f) => ({ name: f.name, path: f.path, ext: f.name.split('.').pop().toLowerCase() }))
    return { folders: folderNodes, files: fileItems }
  }

  function expandPathInTree(relPath) {
    const parts = relPath.split('/')
    let nodes = folderTree.value.folders
    for (const part of parts) {
      const node = nodes?.find((n) => n.name === part)
      if (node) {
        node.expanded = true
        nodes = node.children || []
      }
    }
  }

  function selectItem(item) {
    selectedItem.value = item
  }

  const filteredItems = computed(() => {
    if (!searchQuery.value) return items.value
    const q = searchQuery.value.toLowerCase()
    return items.value.filter((f) => f.name.toLowerCase().includes(q))
  })

  const dirCount = computed(() => items.value.filter((i) => i.isDirectory).length)
  const fileCount = computed(() => items.value.filter((i) => !i.isDirectory).length)

  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean)
    const crumbs = [{ label: '全部文档', path: '' }]
    let accumulated = ''
    for (const p of parts) {
      accumulated += (accumulated ? '/' : '') + p
      crumbs.push({ label: p, path: accumulated })
    }
    return crumbs
  })

  return {
    currentPath,
    loading,
    selectedItem,
    searchQuery,
    viewMode,
    activeTreePath,
    folderTree,
    filteredItems,
    dirCount,
    fileCount,
    breadcrumbs,
    getDocsBasePath,
    getAbsolutePath,
    normalizeRelativePath,
    getItemRelativePath,
    loadDirectory,
    navigateTo,
    openItem,
    loadFolderTree,
    buildTree,
    expandPathInTree,
    selectItem,
  }
}
