import { http } from './http'

export const kbApi = {
  overview() {
    return http.get('/kb/overview')
  },
  create(payload) {
    return http.post('/kb/create', payload)
  },
  list() {
    return http.get('/kb/list')
  },
  systemList() {
    return http.get('/kb/system/list')
  },
  joinSystem(kbId) {
    return http.post(`/kb/system/${kbId}/join`)
  },
  leaveSystem(kbId) {
    return http.delete(`/kb/system/${kbId}/join`)
  },
  detail(kbId) {
    return http.get(`/kb/${kbId}`)
  },
  update(kbId, payload) {
    return http.put(`/kb/${kbId}`, payload)
  },
  delete(kbId) {
    return http.delete(`/kb/${kbId}`)
  },

  // documents
  listDocs(kbId, params = {}) {
    const q = {
      page: params.page || 1,
      page_size: params.page_size || params.pageSize || 50,
      sort_by: params.sort_by || params.sortBy || 'created',
      sort_order: params.sort_order || params.sortOrder || 'desc',
    }
    if (params.search) q.search = params.search
    return http.get(`/kb/${kbId}/documents`, { params: q })
  },
  uploadDocs(kbId, files) {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return http.post(`/kb/${kbId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getDoc(kbId, docId) {
    return http.get(`/kb/${kbId}/documents/${docId}`)
  },
  deleteDoc(kbId, docId) {
    return http.delete(`/kb/${kbId}/documents/${docId}`)
  },
}
