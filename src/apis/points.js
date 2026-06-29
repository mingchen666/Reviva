import { http } from './http'

export const pointsApi = {
  balance() {
    return http.get('/points/balance')
  },
  latest() {
    return http.get('/points/records/latest')
  },
  records({ page = 1, pageSize = 20 } = {}) {
    return http.get('/points/records', { params: { page, page_size: pageSize } })
  },
  redeem(code) {
    return http.post('/points/redeem', { code })
  },
}
