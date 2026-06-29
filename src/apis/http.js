import axios from 'axios'
import { useUserStore } from '@/stores/user'

// 开发模式用相对路径走 Vite proxy，生产模式用完整 URL
const isDev = import.meta.env.DEV
const BASE_URL = isDev ? '' : (import.meta.env.VITE_CLOUD_BASE_URL || 'http://localhost:8000')
const API_PREFIX = '/api/v1/app'

export const http = axios.create({
  baseURL: BASE_URL + API_PREFIX,
  timeout: 30000,
})

http.interceptors.request.use((config) => {
  try {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
  } catch (_) {}
  return config
})

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err?.response?.status
    const detail = err?.response?.data?.detail || err?.message || '网络错误'
    if (status === 401) {
      try {
        const userStore = useUserStore()
        userStore.logout()
        if (!location.hash.startsWith('#/login')) {
          location.hash = '#/login'
        }
      } catch (_) {}
    }
    const wrapped = new Error(detail)
    wrapped.status = status
    wrapped.detail = detail
    wrapped.raw = err
    return Promise.reject(wrapped)
  },
)

export { BASE_URL, API_PREFIX }
