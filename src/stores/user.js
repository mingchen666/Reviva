import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/apis/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref('')
  const userInfo = ref(null)
  const isLoggedIn = computed(() => !!token.value)
  const connStatus = ref('disconnected') // connected / connecting / disconnected / error

  const username = computed(() => userInfo.value?.username || '')
  const avatar = computed(() => userInfo.value?.avatar || '')
  const email = computed(() => userInfo.value?.email || '')

  function setToken(t) {
    token.value = t
  }

  function setUserInfo(info) {
    userInfo.value = info
  }

  function setConnStatus(status) {
    connStatus.value = status
  }

  function logout() {
    // best-effort server side notify; ignore errors since server is stateless
    if (token.value) {
      authApi.logout().catch(() => {})
    }
    token.value = ''
    userInfo.value = null
    connStatus.value = 'disconnected'
  }

  // ── Real API actions ──
  async function sendCode(email, scene) {
    return await authApi.sendCode(email, scene)
  }

  function _applyTokenResponse(res) {
    token.value = res.token
    userInfo.value = res.user
    connStatus.value = 'connected'
    return res
  }

  async function loginPassword(payload) {
    const res = await authApi.loginPassword(payload)
    return _applyTokenResponse(res)
  }

  async function loginCode(payload) {
    const res = await authApi.loginCode(payload)
    return _applyTokenResponse(res)
  }

  async function register(payload) {
    const res = await authApi.register(payload)
    return _applyTokenResponse(res)
  }

  async function resetPassword(payload) {
    return await authApi.resetPassword(payload)
  }

  async function loadMe() {
    if (!token.value) return null
    try {
      const me = await authApi.me()
      userInfo.value = { ...userInfo.value, ...me }
      connStatus.value = 'connected'
      return me
    } catch (e) {
      // 401 already handled by interceptor
      return null
    }
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    connStatus,
    username,
    avatar,
    email,
    setToken,
    setUserInfo,
    setConnStatus,
    logout,
    sendCode,
    loginPassword,
    loginCode,
    register,
    resetPassword,
    loadMe,
  }
}, {
  persist: {
    pick: ['token', 'userInfo', 'connStatus'],
  },
})
