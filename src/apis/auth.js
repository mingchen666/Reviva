import { http } from './http'

export const authApi = {
  sendCode(email, scene) {
    return http.post('/auth/code/send', { email, scene })
  },
  register({ email, code, password }) {
    return http.post('/auth/register', { email, code, password })
  },
  loginPassword({ email, password }) {
    return http.post('/auth/login/password', { email, password })
  },
  loginCode({ email, code }) {
    return http.post('/auth/login/code', { email, code })
  },
  resetPassword({ email, code, new_password }) {
    return http.post('/auth/password/reset', { email, code, new_password })
  },
  me() {
    return http.get('/auth/me')
  },
  logout() {
    return http.post('/auth/logout')
  },
}
