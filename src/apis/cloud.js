import { http } from './http'

// `/cloud/status` is unauthenticated; safe to call before login
export const cloudApi = {
  status() {
    return http.get('/cloud/status')
  },
}
