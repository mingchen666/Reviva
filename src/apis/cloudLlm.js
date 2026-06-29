import axios from 'axios'
import { useUserStore } from '@/stores/user'
import { BASE_URL } from './http'

const cloudLlmHttp = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
})

cloudLlmHttp.interceptors.request.use((config) => {
  try {
    const userStore = useUserStore()
    if (userStore.token) config.headers.Authorization = `Bearer ${userStore.token}`
  } catch (_) {}
  return config
})

cloudLlmHttp.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err?.response?.status
    const detail = err?.response?.data?.detail || err?.message || '网络错误'
    if (status === 401) {
      try {
        const userStore = useUserStore()
        userStore.logout()
        if (!location.hash.startsWith('#/login')) location.hash = '#/login'
      } catch (_) {}
    }
    const wrapped = new Error(detail)
    wrapped.status = status
    wrapped.detail = detail
    wrapped.raw = err
    return Promise.reject(wrapped)
  },
)

export const cloudLlmApi = {
  models() {
    return cloudLlmHttp.get('/v1/models')
  },

  apiKeys() {
    return cloudLlmHttp.get('/api/v1/apikeys')
  },

  createApiKey(description) {
    return cloudLlmHttp.post('/api/v1/apikeys', { description })
  },

  updateApiKey(id, description) {
    return cloudLlmHttp.put(`/api/v1/apikeys/${id}`, { description })
  },

  deleteApiKey(id) {
    return cloudLlmHttp.delete(`/api/v1/apikeys/${id}`)
  },

  usageRecords(params = {}) {
    return cloudLlmHttp.get('/api/v1/cloud-llm/usage-records', { params })
  },
}
