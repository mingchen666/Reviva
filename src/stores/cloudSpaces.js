import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { kbApi } from '@/apis/kb'

const STALE_MS = 5 * 60 * 1000
const FALLBACK_COLORS = ['#6C8AFF', '#A78BFA', '#4ADE80', '#FACC15', '#F87171', '#3B82F6', '#EC4899', '#8B5CF6']

const DOC_STATUS_ALIASES = {
  uploaded: 'UPLOADED',
  pending: 'PENDING',
  uploading: 'RUNNING',
  parsing: 'RUNNING',
  running: 'RUNNING',
  indexed: 'COMPLETE',
  active: 'COMPLETE',
  complete: 'COMPLETE',
  failed: 'FAILED',
  error: 'FAILED',
  cancelled: 'FAILED',
  expired: 'EXPIRED',
  deleted: 'DELETED',
}

function pickColor(id) {
  if (!id) return FALLBACK_COLORS[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}

function normalizeDocStatus(status) {
  if (!status) return 'PENDING'
  const raw = String(status).trim()
  const lower = raw.toLowerCase()
  if (DOC_STATUS_ALIASES[lower]) return DOC_STATUS_ALIASES[lower]
  return raw.toUpperCase()
}

function normalizeKb(raw = {}) {
  const ownerUserId = raw.owner_user_id || raw.ownerUserId || ''
  const isSystem = raw.is_system === true || raw.isSystem === true || ownerUserId === 'user-system' || ownerUserId === 'system'
  const isJoined = raw.is_joined === true || raw.isJoined === true
  const isReadonly = raw.is_readonly === true || raw.isReadonly === true || isSystem
  const title = raw.title || raw.name || '未命名'
  const docCount = raw.doc_count_cache
    ?? raw.doc_count
    ?? raw.document_count
    ?? raw.documents_count
    ?? raw.file_count
    ?? raw.docCount
    ?? raw.documentCount
    ?? 0

  return {
    id: raw.id,
    title,
    name: title,
    description: raw.description || '',
    icon: raw.icon || (isSystem ? 'ri-database-2-line' : 'ri-folder-3-line'),
    color: raw.color || pickColor(raw.id),
    docCount,
    usedBytes: raw.used_bytes_cache ?? raw.usedBytes ?? 0,
    status: raw.status || 'ACTIVE',
    ownerUserId,
    isSystem,
    isJoined,
    isReadonly,
    joinedAt: raw.joined_at || raw.joinedAt || null,
    createdAt: raw.created || raw.createdAt || '',
    updatedAt: raw.updated || raw.updatedAt || '',
    type: raw.type,
    config: raw.config,
    source: raw.source,
    raw,
  }
}

function normalizeDoc(raw = {}) {
  const status = normalizeDocStatus(raw.status)
  const name = raw.name || raw.filename || '未命名'
  const type = raw.type || name.split('.').pop()?.toLowerCase() || ''

  return {
    id: raw.id,
    name,
    type,
    size: raw.size || 0,
    status,
    summary: raw.summary || null,
    progress: raw.progress ?? (status === 'COMPLETE' ? 100 : status === 'RUNNING' ? 50 : 0),
    createdAt: raw.created || raw.createdAt || '',
    updatedAt: raw.updated || raw.updatedAt || '',
    raw,
  }
}

function defaultDocsEntry() {
  return {
    items: [],
    fetchedAt: 0,
    loading: false,
    error: '',
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  }
}

function normalizeDocsResponse(res, fallbackParams = {}) {
  const items = (res?.items || []).map(normalizeDoc)
  const pageSize = res?.page_size ?? fallbackParams.pageSize ?? fallbackParams.page_size ?? 50
  return {
    items,
    fetchedAt: Date.now(),
    loading: false,
    error: '',
    total: res?.total ?? items.length,
    page: res?.page ?? fallbackParams.page ?? 1,
    pageSize,
    totalPages: res?.total_pages ?? Math.max(1, Math.ceil((res?.total ?? items.length) / pageSize)),
    hasNext: res?.has_next ?? false,
    hasPrev: res?.has_prev ?? false,
  }
}

function isReadonlyKb(kb) {
  return kb?.isReadonly === true || kb?.isSystem === true
}

function readonlyError(action) {
  const error = new Error(`系统知识库不可${action}`)
  error.detail = error.message
  return error
}

export const useCloudSpacesStore = defineStore('cloudSpaces', () => {
  const kbs = ref([])
  const kbsFetchedAt = ref(0)
  const kbsLoading = ref(false)
  const kbsError = ref('')

  const systemKbs = ref([])
  const systemKbsFetchedAt = ref(0)
  const systemKbsLoading = ref(false)
  const systemKbsError = ref('')

  const docsByKb = ref({})

  let _kbsInflight = null
  let _systemKbsInflight = null
  const _docsInflight = new Map()

  const isKbsStale = computed(() => Date.now() - kbsFetchedAt.value > STALE_MS)
  const isSystemKbsStale = computed(() => Date.now() - systemKbsFetchedAt.value > STALE_MS)

  const totalDocs = computed(() => kbs.value.reduce((s, k) => s + (k.docCount || 0), 0))
  const systemTotalDocs = computed(() => systemKbs.value.reduce((s, k) => s + (k.docCount || 0), 0))

  function getKb(kbId) {
    return kbs.value.find(k => k.id === kbId) || systemKbs.value.find(k => k.id === kbId) || null
  }

  function getDocs(kbId) {
    return docsByKb.value[kbId]?.items || []
  }

  function getDocsEntry(kbId) {
    return docsByKb.value[kbId] || defaultDocsEntry()
  }

  function isDocsStale(kbId) {
    const entry = docsByKb.value[kbId]
    if (!entry) return true
    return Date.now() - (entry.fetchedAt || 0) > STALE_MS
  }

  function upsertKb(listRef, item) {
    const idx = listRef.value.findIndex(k => k.id === item.id)
    if (idx >= 0) {
      const next = [...listRef.value]
      next[idx] = { ...next[idx], ...item }
      listRef.value = next
    } else {
      listRef.value = [item, ...listRef.value]
    }
  }

  function updateDocCount(kbId, total) {
    if (typeof total !== 'number') return
    kbs.value = kbs.value.map(k => k.id === kbId ? { ...k, docCount: total } : k)
    systemKbs.value = systemKbs.value.map(k => k.id === kbId ? { ...k, docCount: total } : k)
  }

  async function _fetchKbList() {
    kbsLoading.value = true
    kbsError.value = ''
    try {
      const res = await kbApi.list()
      const items = (res?.items || []).map(normalizeKb)
      kbs.value = items
      kbsFetchedAt.value = Date.now()
      return items
    } catch (e) {
      kbsError.value = e?.detail || e?.message || '加载知识库列表失败'
      throw e
    } finally {
      kbsLoading.value = false
    }
  }

  async function _fetchSystemKbList() {
    systemKbsLoading.value = true
    systemKbsError.value = ''
    try {
      const res = await kbApi.systemList()
      const items = (res?.items || []).map(normalizeKb)
      systemKbs.value = items
      systemKbsFetchedAt.value = Date.now()
      return items
    } catch (e) {
      systemKbsError.value = e?.detail || e?.message || '加载系统知识库列表失败'
      throw e
    } finally {
      systemKbsLoading.value = false
    }
  }

  async function loadKbList({ force = false } = {}) {
    if (force) {
      if (_kbsInflight) return _kbsInflight
      _kbsInflight = _fetchKbList().finally(() => { _kbsInflight = null })
      return _kbsInflight
    }
    if (kbs.value.length > 0) {
      if (isKbsStale.value && !_kbsInflight) {
        _kbsInflight = _fetchKbList().catch(() => {}).finally(() => { _kbsInflight = null })
      }
      return kbs.value
    }
    if (_kbsInflight) return _kbsInflight
    _kbsInflight = _fetchKbList().finally(() => { _kbsInflight = null })
    return _kbsInflight
  }

  async function loadSystemKbList({ force = false } = {}) {
    if (force) {
      if (_systemKbsInflight) return _systemKbsInflight
      _systemKbsInflight = _fetchSystemKbList().finally(() => { _systemKbsInflight = null })
      return _systemKbsInflight
    }
    if (systemKbs.value.length > 0) {
      if (isSystemKbsStale.value && !_systemKbsInflight) {
        _systemKbsInflight = _fetchSystemKbList().catch(() => {}).finally(() => { _systemKbsInflight = null })
      }
      return systemKbs.value
    }
    if (_systemKbsInflight) return _systemKbsInflight
    _systemKbsInflight = _fetchSystemKbList().finally(() => { _systemKbsInflight = null })
    return _systemKbsInflight
  }

  async function refreshKbList() {
    return loadKbList({ force: true })
  }

  async function refreshSystemKbList() {
    return loadSystemKbList({ force: true })
  }

  async function _fetchDocs(kbId, params = {}) {
    const current = docsByKb.value[kbId] || defaultDocsEntry()
    const requestParams = {
      page: params.page || current.page || 1,
      pageSize: params.pageSize || params.page_size || current.pageSize || 50,
      sortBy: params.sortBy || params.sort_by || 'created',
      sortOrder: params.sortOrder || params.sort_order || 'desc',
      search: params.search || '',
    }

    docsByKb.value = {
      ...docsByKb.value,
      [kbId]: { ...current, ...requestParams, loading: true, error: '' },
    }

    try {
      const res = await kbApi.listDocs(kbId, requestParams)
      const updated = normalizeDocsResponse(res, requestParams)
      docsByKb.value = { ...docsByKb.value, [kbId]: updated }
      updateDocCount(kbId, updated.total)
      return updated.items
    } catch (e) {
      const msg = e?.detail || e?.message || '加载文档列表失败'
      docsByKb.value = {
        ...docsByKb.value,
        [kbId]: { ...(docsByKb.value[kbId] || current), loading: false, error: msg },
      }
      throw e
    }
  }

  async function loadDocs(kbId, { force = false, params } = {}) {
    if (!kbId) return []
    if (force) {
      let p = _docsInflight.get(kbId)
      if (p) return p
      p = _fetchDocs(kbId, params).finally(() => _docsInflight.delete(kbId))
      _docsInflight.set(kbId, p)
      return p
    }
    const entry = docsByKb.value[kbId]
    if (entry && entry.items?.length) {
      if (isDocsStale(kbId) && !_docsInflight.get(kbId)) {
        const p = _fetchDocs(kbId, params).catch(() => {}).finally(() => _docsInflight.delete(kbId))
        _docsInflight.set(kbId, p)
      }
      return entry.items
    }
    let p = _docsInflight.get(kbId)
    if (p) return p
    p = _fetchDocs(kbId, params).finally(() => _docsInflight.delete(kbId))
    _docsInflight.set(kbId, p)
    return p
  }

  async function refreshDocs(kbId, params) {
    return loadDocs(kbId, { force: true, params })
  }

  async function createKb(payload) {
    const created = await kbApi.create(payload)
    const item = normalizeKb(created)
    upsertKb(kbs, item)
    return item
  }

  async function updateKb(kbId, payload) {
    const updated = await kbApi.update(kbId, payload)
    const item = normalizeKb(updated)
    upsertKb(kbs, item)
    return item
  }

  async function deleteKb(kbId) {
    const kb = getKb(kbId)
    if (isReadonlyKb(kb)) throw readonlyError('删除')
    await kbApi.delete(kbId)
    kbs.value = kbs.value.filter(k => k.id !== kbId)
    const next = { ...docsByKb.value }
    delete next[kbId]
    docsByKb.value = next
  }

  async function joinSystemKb(kbId) {
    const joined = normalizeKb(await kbApi.joinSystem(kbId))
    upsertKb(systemKbs, { ...joined, isSystem: true, isJoined: true, isReadonly: true })
    upsertKb(kbs, { ...joined, isSystem: true, isJoined: true, isReadonly: true })
    await Promise.allSettled([refreshKbList(), refreshSystemKbList()])
    return getKb(kbId) || joined
  }

  async function leaveSystemKb(kbId) {
    await kbApi.leaveSystem(kbId)
    kbs.value = kbs.value.filter(k => !(k.id === kbId && k.isSystem))
    const idx = systemKbs.value.findIndex(k => k.id === kbId)
    if (idx >= 0) {
      const next = [...systemKbs.value]
      next[idx] = { ...next[idx], isJoined: false, joinedAt: null }
      systemKbs.value = next
    }
    const nextDocs = { ...docsByKb.value }
    delete nextDocs[kbId]
    docsByKb.value = nextDocs
    await Promise.allSettled([refreshKbList(), refreshSystemKbList()])
  }

  async function uploadDocs(kbId, files, params) {
    const kb = getKb(kbId)
    if (isReadonlyKb(kb)) throw readonlyError('上传文档')
    const res = await kbApi.uploadDocs(kbId, files)
    await refreshDocs(kbId, params || { page: 1, pageSize: docsByKb.value[kbId]?.pageSize || 50 })
    return res
  }

  async function deleteDoc(kbId, docId) {
    const kb = getKb(kbId)
    if (isReadonlyKb(kb)) throw readonlyError('删除文档')
    await kbApi.deleteDoc(kbId, docId)
    const entry = docsByKb.value[kbId]
    if (entry) {
      const items = entry.items.filter(d => d.id !== docId)
      const total = Math.max(0, (entry.total || entry.items.length) - 1)
      docsByKb.value = {
        ...docsByKb.value,
        [kbId]: {
          ...entry,
          items,
          total,
          totalPages: Math.max(1, Math.ceil(total / (entry.pageSize || 50))),
          hasNext: entry.page < Math.max(1, Math.ceil(total / (entry.pageSize || 50))),
          hasPrev: entry.page > 1,
        },
      }
      updateDocCount(kbId, total)
    }
  }

  function clear() {
    kbs.value = []
    kbsFetchedAt.value = 0
    kbsLoading.value = false
    kbsError.value = ''
    systemKbs.value = []
    systemKbsFetchedAt.value = 0
    systemKbsLoading.value = false
    systemKbsError.value = ''
    docsByKb.value = {}
    _docsInflight.clear()
  }

  return {
    kbs,
    kbsFetchedAt,
    kbsLoading,
    kbsError,
    systemKbs,
    systemKbsFetchedAt,
    systemKbsLoading,
    systemKbsError,
    docsByKb,
    isKbsStale,
    isSystemKbsStale,
    totalDocs,
    systemTotalDocs,
    getKb,
    getDocs,
    getDocsEntry,
    isDocsStale,
    loadKbList,
    refreshKbList,
    loadSystemKbList,
    refreshSystemKbList,
    loadDocs,
    refreshDocs,
    createKb,
    updateKb,
    deleteKb,
    joinSystemKb,
    leaveSystemKb,
    uploadDocs,
    deleteDoc,
    clear,
  }
}, {
  persist: {
    pick: ['kbs', 'kbsFetchedAt', 'systemKbs', 'systemKbsFetchedAt', 'docsByKb'],
  },
})
