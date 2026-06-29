import { http } from './http'

export const ordersApi = {
  createRecharge(payload) {
    return http.post('/orders/recharge', payload)
  },
  listRecharge({ page = 1, pageSize = 20 } = {}) {
    return http.get('/orders/recharge', { params: { page, page_size: pageSize } })
  },
  getRecharge(orderId) {
    return http.get(`/orders/recharge/${orderId}`)
  },
}
