<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { useMessage } from '@/components/MsMessage/useMessage'
import TitleBar from '@/components/layout/TitleBar.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()
const msg = useMessage()

const mode = ref('login')

onMounted(() => {
  if (route.query.tab === 'register') mode.value = 'register'
})

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const verifyCode = ref('')
const agreeTerms = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const codeSending = ref(false)
const errorMsg = ref('')
const sentCode = ref(false)
const countdown = ref(0)

const isDark = computed(() => appStore.isDark)
const passwordStrength = computed(() => {
  if (password.value.length < 4) return 'weak'
  if (password.value.length < 8) return 'medium'
  return 'strong'
})

const ERROR_MAP = {
  AUTH_CODE_INVALID: '验证码无效',
  AUTH_CODE_EXPIRED: '验证码已过期，请重新发送',
  AUTH_CODE_RATE_LIMITED: '发送过于频繁，请稍后再试',
  AUTH_CODE_DAILY_LIMIT_EXCEEDED: '今日验证码发送次数已达上限',
  EMAIL_SEND_FAILED: '邮件发送失败，请检查邮箱地址',
  'User not found': '用户不存在',
  'Email already exists': '邮箱已注册',
  'Invalid credentials': '邮箱或密码错误',
  'User is disabled': '该账号已被禁用',
}

function humanizeError(e) {
  const detail = e?.detail || e?.message || ''
  return ERROR_MAP[detail] || detail || '请求失败'
}

function startCountdown() {
  countdown.value = 60
  const t = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) clearInterval(t)
  }, 1000)
}

function sceneForMode() {
  return mode.value === 'register' ? 'register'
    : mode.value === 'forgot' ? 'reset_password'
    : 'login'
}

async function sendCode() {
  if (!email.value) {
    errorMsg.value = '请输入邮箱'
    return
  }
  if (countdown.value > 0 || codeSending.value) return
  codeSending.value = true
  errorMsg.value = ''
  try {
    await userStore.sendCode(email.value.trim(), sceneForMode())
    sentCode.value = true
    startCountdown()
    msg.success('验证码已发送，请查收邮箱')
  } catch (e) {
    errorMsg.value = humanizeError(e)
  } finally {
    codeSending.value = false
  }
}

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMsg.value = '请填写邮箱和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await userStore.loginPassword({ email: email.value.trim(), password: password.value })
    msg.success('登录成功')
    router.push('/')
  } catch (e) {
    errorMsg.value = humanizeError(e)
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  if (!agreeTerms.value) return
  if (!email.value || !verifyCode.value || !password.value) {
    errorMsg.value = '请填写完整信息'
    return
  }
  if (password.value.length < 6) {
    errorMsg.value = '密码至少 6 位'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMsg.value = '两次密码不一致'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await userStore.register({
      email: email.value.trim(),
      code: verifyCode.value.trim(),
      password: password.value,
    })
    msg.success('注册成功')
    router.push('/')
  } catch (e) {
    errorMsg.value = humanizeError(e)
  } finally {
    loading.value = false
  }
}

async function handleResetPassword() {
  if (!email.value || !verifyCode.value || !password.value) {
    errorMsg.value = '请填写完整信息'
    return
  }
  if (password.value.length < 6) {
    errorMsg.value = '密码至少 6 位'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    await userStore.resetPassword({
      email: email.value.trim(),
      code: verifyCode.value.trim(),
      new_password: password.value,
    })
    msg.success('密码已重置，请用新密码登录')
    mode.value = 'login'
    sentCode.value = false
    verifyCode.value = ''
    password.value = ''
  } catch (e) {
    errorMsg.value = humanizeError(e)
  } finally {
    loading.value = false
  }
}
const version=ref(null)
async function loadVersion() {
  if (!window.electronAPI) return
  try {
    const ver = await window.electronAPI.getVersion()
    version.value = ver || '--'
  } catch (e) {
    console.error('loadVersion error:', e)
  }
}

onMounted(loadVersion)
</script>

<template>
  <div class="h-full w-full flex flex-col" :class="isDark ? 'bg-d0 text-wt-main' : 'bg-white text-lt-main'">
    <TitleBar />

    <!-- Main -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left: Brand Panel -->
      <div class="flex w-[46%] relative overflow-hidden" :class="isDark ? 'bg-d1' : 'left-panel-bg'">
        <!-- Decorative floating shapes -->
        <div class="absolute inset-0">
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div class="spin-slow" style="width:300px;height:300px">
              <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-brand-400/30" />
              <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-agent-400/30" />
              <div class="absolute top-1/2 left-0 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-output-400/30" />
            </div>
          </div>
          <div class="absolute top-[12%] left-[18%] w-20 h-20 rounded-2xl float-1 backdrop-blur-sm" :class="isDark ? 'bg-brand-400/10 border border-brand-400/20' : 'bg-brand-400/10 border border-brand-200/30'" />
          <div class="absolute top-[25%] right-[15%] w-14 h-14 rounded-full float-2 backdrop-blur-sm" :class="isDark ? 'bg-agent-400/10 border border-agent-400/20' : 'bg-agent-400/10 border border-agent-200/30'" />
          <div class="absolute bottom-[20%] left-[22%] w-16 h-16 rounded-xl float-2 backdrop-blur-sm" :class="isDark ? 'bg-output-400/10 border border-output-400/20' : 'bg-output-400/10 border border-emerald-200/30'" />
          <div class="absolute bottom-[30%] right-[20%] w-10 h-10 rounded-lg float-1 backdrop-blur-sm" :class="isDark ? 'bg-amber-400/10 border border-amber-400/20' : 'bg-amber-400/10 border border-amber-200/30'" />
          <div class="absolute top-[55%] left-[8%] w-8 h-8 rounded-full float-1" :class="isDark ? 'bg-rose-400/8' : 'bg-rose-400/8'" />
          <div class="absolute top-[40%] right-[8%] w-6 h-6 rounded-md float-2" :class="isDark ? 'bg-sky-400/8' : 'bg-sky-400/8'" />
          <!-- Gradient blobs -->
          <div class="absolute top-[15%] left-[30%] w-48 h-48 rounded-full bg-brand-300/15 blur-[60px]" />
          <div class="absolute bottom-[20%] right-[25%] w-40 h-40 rounded-full bg-agent-300/15 blur-[50px]" />
          <div class="absolute top-[60%] left-[50%] w-32 h-32 rounded-full bg-output-300/10 blur-[40px]" />
        </div>

        <div class="relative z-10 flex flex-col items-center justify-center w-full px-16">
          <!-- Logo -->
          <div class="float-1 mb-10">
            <div class="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-400 via-brand-500 to-agent-400 gradient-flow mx-auto flex items-center justify-center shadow-xl shadow-brand-400/25">
              <i class="ri-brain-line text-[40px] text-white" />
            </div>
          </div>

          <h1 class="text-[32px] font-extrabold mb-3 tracking-tight" :class="isDark ? 'text-wt-main' : 'text-gray-800'">Reviva</h1>
          <p class="text-[15px] leading-relaxed mb-8 text-center" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">
            连接本地资料、云端知识库<br>与 Agent 工作流的桌面学习工作台
          </p>

          <!-- Feature list -->
          <div class="grid grid-cols-1 gap-2.5 w-full max-w-[260px]">
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" :class="isDark ? 'bg-d3/60 backdrop-blur-sm border border-d4' : 'bg-white/60 backdrop-blur-sm border border-white/80'">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'"><i class="ri-file-upload-line text-[16px] text-brand-500" /></div>
              <div><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-gray-700'">本地导入</div><div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-400'">PDF / DOCX / Markdown</div></div>
            </div>
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" :class="isDark ? 'bg-d3/60 backdrop-blur-sm border border-d4' : 'bg-white/60 backdrop-blur-sm border border-white/80'">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-agent-400/8' : 'bg-agent-50'"><i class="ri-sparkling-2-line text-[16px] text-agent-500" /></div>
              <div><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-gray-700'">智能体</div><div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-400'">自定义 Agent 工作流</div></div>
            </div>
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" :class="isDark ? 'bg-d3/60 backdrop-blur-sm border border-d4' : 'bg-white/60 backdrop-blur-sm border border-white/80'">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-output-400/8' : 'bg-output-50'"><i class="ri-presentation-line text-[16px] text-output-500" /></div>
              <div><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-gray-700'">学习台</div><div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-400'">对话问答 · 闪卡 · 测验</div></div>
            </div>
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-sm" :class="isDark ? 'bg-d3/60 backdrop-blur-sm border border-d4' : 'bg-white/60 backdrop-blur-sm border border-white/80'">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'"><i class="ri-mind-map text-[16px] text-amber-500" /></div>
              <div><div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-gray-700'">思维导图</div><div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-400'">知识可视化 · 速记版</div></div>
            </div>
          </div>

          <div class="absolute bottom-6 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'">v{{version}} · Build 20240508</div>
        </div>
      </div>

      <!-- Right: Auth Form -->
      <div class="flex-1 flex items-center justify-center relative" :class="isDark ? 'bg-d0' : 'bg-white'">
        <!-- Subtle dot pattern -->
        <div class="absolute inset-0 opacity-[0.03]" style="background-image:radial-gradient(circle at 1px 1px,#000 1px,transparent 0);background-size:24px 24px" />

        <div class="relative z-10 w-full max-w-[380px] px-8 fade-slide-up" :key="mode">
          <!-- Logo always visible on left panel, no separate mobile logo needed -->

          <!-- LOGIN -->
          <template v-if="mode === 'login'">
            <h2 class="text-[24px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-gray-800'">欢迎回来</h2>
            <p class="text-[13px] mb-7" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">登录你的 Reviva 账号继续使用</p>

            <div v-if="errorMsg" class="rounded-xl px-3.5 py-2.5 mb-4 flex items-center gap-2 bg-red-50 border border-red-100 text-red-500">
              <i class="ri-error-warning-line text-[14px]" />
              <span class="text-[12px]">{{ errorMsg }}</span>
            </div>

            <div class="mb-4">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">邮箱</label>
              <div class="input-wrap">
                <i class="ri-at-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="email" type="email" placeholder="name@example.com" class="w-full text-[13px] rounded-xl pl-10 pr-3 py-3 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" @keyup.enter="handleLogin" />
              </div>
            </div>

            <div class="mb-4">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">密码</label>
              <div class="input-wrap relative">
                <i class="ri-lock-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="输入密码" class="w-full text-[13px] rounded-xl pl-10 pr-11 py-3 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" @keyup.enter="handleLogin" />
                <button class="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-gray-300 hover:text-gray-500'" @click="showPassword = !showPassword">
                  <i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[15px]" />
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between mb-6">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" class="w-4 h-4 rounded cursor-pointer" style="accent-color: #4A6CFF">
                <span class="text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">记住登录</span>
              </label>
              <button class="text-[12px] font-medium text-brand-500 hover:text-brand-600 transition-colors" @click="mode = 'forgot'; errorMsg = ''">忘记密码？</button>
            </div>

            <button class="btn-main w-full py-3 rounded-xl text-[14px] font-semibold text-white shadow-lg shadow-brand-400/25" :class="loading ? 'opacity-70 cursor-wait' : ''" @click="handleLogin">
              <span v-if="!loading">登录</span>
              <span v-else class="flex items-center justify-center gap-2"><i class="ri-loader-4-line animate-spin text-[14px]" /> 登录中...</span>
            </button>

            <p class="text-center text-[12px] mt-6" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">
              还没有账号？<button class="font-semibold text-brand-500 hover:text-brand-600 transition-colors" @click="mode = 'register'; errorMsg = ''">立即注册</button>
            </p>
          </template>

          <!-- REGISTER -->
          <template v-if="mode === 'register'">
            <h2 class="text-[24px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-gray-800'">创建账号</h2>
            <p class="text-[13px] mb-6" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">注册 Reviva，开启高效学习</p>

            <div v-if="errorMsg" class="rounded-xl px-3.5 py-2.5 mb-4 flex items-center gap-2 bg-red-50 border border-red-100 text-red-500">
              <i class="ri-error-warning-line text-[14px]" />
              <span class="text-[12px]">{{ errorMsg }}</span>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">邮箱</label>
              <div class="input-wrap">
                <i class="ri-at-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="email" type="email" placeholder="name@example.com" class="w-full text-[13px] rounded-xl pl-10 pr-3 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
              </div>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">验证码</label>
              <div class="flex gap-2">
                <div class="input-wrap flex-1">
                  <i class="ri-shield-check-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                  <input v-model="verifyCode" type="text" placeholder="输入验证码" maxlength="6" class="w-full text-[13px] rounded-xl pl-10 pr-3 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
                </div>
                <button
                  class="shrink-0 px-4 rounded-xl text-[12px] font-semibold transition-all"
                  :class="countdown > 0
                    ? (isDark ? 'bg-d3 text-wt-dim border border-bdr cursor-wait' : 'bg-gray-100 text-gray-300 border border-gray-200 cursor-wait')
                    : (isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-200 hover:bg-brand-100')"
                  @click="sendCode"
                >{{ countdown > 0 ? countdown + 's' : '发送验证码' }}</button>
              </div>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">密码</label>
              <div class="input-wrap relative">
                <i class="ri-lock-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="设置密码（至少8位）" class="w-full text-[13px] rounded-xl pl-10 pr-11 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
                <button class="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-gray-300 hover:text-gray-500'" @click="showPassword = !showPassword">
                  <i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[15px]" />
                </button>
              </div>
              <div v-if="password.length > 0" class="flex items-center gap-2 mt-2">
                <div class="flex gap-1 flex-1">
                  <div class="h-1 flex-1 rounded-full transition-all duration-300" :class="passwordStrength === 'weak' ? 'bg-red-400' : passwordStrength === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'" />
                  <div class="h-1 flex-1 rounded-full transition-all duration-300" :class="passwordStrength === 'weak' ? (isDark ? 'bg-d4' : 'bg-gray-100') : passwordStrength === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'" />
                  <div class="h-1 flex-1 rounded-full transition-all duration-300" :class="passwordStrength === 'strong' ? 'bg-emerald-400' : (isDark ? 'bg-d4' : 'bg-gray-100')" />
                </div>
                <span class="text-[10px] font-semibold" :class="passwordStrength === 'weak' ? 'text-red-400' : passwordStrength === 'medium' ? 'text-amber-500' : 'text-emerald-500'">
                  {{ passwordStrength === 'weak' ? '弱' : passwordStrength === 'medium' ? '中' : '强' }}
                </span>
              </div>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">确认密码</label>
              <div class="input-wrap relative">
                <i class="ri-lock-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" placeholder="再次输入密码" class="w-full text-[13px] rounded-xl pl-10 pr-11 py-2.5 border transition-colors" :class="[
                  isDark ? 'bg-d3 text-wt-main placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 placeholder:text-gray-300 focus:border-brand-400',
                  confirmPassword.length > 0 && confirmPassword !== password ? (isDark ? 'border-red-400/50' : 'border-red-300') : (isDark ? 'border-bdr' : 'border-gray-200')
                ]" />
                <button class="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-gray-300 hover:text-gray-500'" @click="showConfirmPassword = !showConfirmPassword">
                  <i :class="showConfirmPassword ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[15px]" />
                </button>
              </div>
              <p v-if="confirmPassword.length > 0 && confirmPassword !== password" class="text-[10px] mt-1.5 text-red-400 flex items-center gap-1">
                <i class="ri-error-warning-line text-[10px]" /> 两次密码不一致
              </p>
            </div>

            <label class="flex items-start gap-2.5 mb-5 cursor-pointer">
              <input v-model="agreeTerms" type="checkbox" class="w-4 h-4 rounded mt-0.5 cursor-pointer" style="accent-color: #4A6CFF">
              <span class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">
                我已阅读并同意 <a href="#" class="font-medium text-brand-500 hover:text-brand-600">服务条款</a> 和 <a href="#" class="font-medium text-brand-500 hover:text-brand-600">隐私政策</a>
              </span>
            </label>

            <button class="btn-main w-full py-3 rounded-xl text-[14px] font-semibold text-white shadow-lg shadow-brand-400/25" :class="(!agreeTerms || loading) ? 'opacity-40 cursor-not-allowed' : ''" :disabled="!agreeTerms" @click="handleRegister">
              <span v-if="!loading">注册</span>
              <span v-else class="flex items-center justify-center gap-2"><i class="ri-loader-4-line animate-spin text-[14px]" /> 注册中...</span>
            </button>

            <p class="text-center text-[12px] mt-5" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">
              已有账号？<button class="font-semibold text-brand-500 hover:text-brand-600 transition-colors" @click="mode = 'login'; errorMsg = ''">返回登录</button>
            </p>
          </template>

          <!-- FORGOT PASSWORD -->
          <template v-if="mode === 'forgot'">
            <button class="flex items-center gap-1 text-[12px] mb-6 transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-gray-400 hover:text-gray-600'" @click="mode = 'login'; errorMsg = ''; sentCode = false; verifyCode = ''; password = ''">
              <i class="ri-arrow-left-line text-[14px]" /> 返回登录
            </button>

            <h2 class="text-[24px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-gray-800'">重置密码</h2>
            <p class="text-[13px] mb-7" :class="isDark ? 'text-wt-aux' : 'text-gray-400'">输入注册邮箱，发送验证码后设置新密码</p>

            <div v-if="errorMsg" class="rounded-xl px-3.5 py-2.5 mb-4 flex items-center gap-2 bg-red-50 border border-red-100 text-red-500">
              <i class="ri-error-warning-line text-[14px]" />
              <span class="text-[12px]">{{ errorMsg }}</span>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">注册邮箱</label>
              <div class="input-wrap">
                <i class="ri-at-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="email" type="email" placeholder="name@example.com" class="w-full text-[13px] rounded-xl pl-10 pr-3 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
              </div>
            </div>

            <div class="mb-3.5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">验证码</label>
              <div class="flex gap-2">
                <div class="input-wrap flex-1">
                  <i class="ri-shield-check-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                  <input v-model="verifyCode" type="text" placeholder="输入验证码" maxlength="6" class="w-full text-[13px] rounded-xl pl-10 pr-3 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
                </div>
                <button
                  class="shrink-0 px-4 rounded-xl text-[12px] font-semibold transition-all"
                  :class="(countdown > 0 || codeSending)
                    ? (isDark ? 'bg-d3 text-wt-dim border border-bdr cursor-wait' : 'bg-gray-100 text-gray-300 border border-gray-200 cursor-wait')
                    : (isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-200 hover:bg-brand-100')"
                  @click="sendCode"
                >{{ codeSending ? '发送中...' : countdown > 0 ? countdown + 's' : '发送验证码' }}</button>
              </div>
            </div>

            <div class="mb-5">
              <label class="text-[11px] font-semibold mb-1.5 block tracking-wide" :class="isDark ? 'text-wt-aux' : 'text-gray-500'">新密码</label>
              <div class="input-wrap relative">
                <i class="ri-lock-line absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'" />
                <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="设置新密码（至少6位）" class="w-full text-[13px] rounded-xl pl-10 pr-11 py-2.5 border transition-colors" :class="isDark ? 'bg-d3 text-wt-main border-bdr placeholder:text-wt-dim focus:border-brand-400' : 'bg-gray-50/80 text-gray-800 border-gray-200 placeholder:text-gray-300 focus:border-brand-400'" />
                <button class="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-gray-300 hover:text-gray-500'" @click="showPassword = !showPassword">
                  <i :class="showPassword ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[15px]" />
                </button>
              </div>
            </div>

            <button class="btn-main w-full py-3 rounded-xl text-[14px] font-semibold text-white shadow-lg shadow-brand-400/25" :class="loading ? 'opacity-70 cursor-wait' : ''" @click="handleResetPassword">
              <span v-if="!loading">重置密码</span>
              <span v-else class="flex items-center justify-center gap-2"><i class="ri-loader-4-line animate-spin text-[14px]" /> 提交中...</span>
            </button>
          </template>
        </div>

        <!-- Bottom links -->
        <div class="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-gray-300'">
          <a href="#" class="hover:text-brand-400 transition-colors">帮助中心</a>
          <span>·</span>
          <a href="#" class="hover:text-brand-400 transition-colors">服务条款</a>
          <span>·</span>
          <a href="#" class="hover:text-brand-400 transition-colors">隐私政策</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.left-panel-bg { background: linear-gradient(160deg, #eef2ff 0%, #f0e7ff 30%, #ede9fe 50%, #e0f2fe 80%, #ecfdf5 100%) }
.input-wrap { position: relative }
.input-wrap input { transition: border-color .2s, box-shadow .2s }
.input-wrap input:focus { outline: none; border-color: #6C8AFF; box-shadow: 0 0 0 3px rgba(106,138,255,.1) }
.btn-main { transition: all .2s ease; background: linear-gradient(135deg,#4A6CFF 0%,#6C8AFF 50%,#8B5CF6 100%); background-size: 200% 200% }
.btn-main:hover { background-position: 100% 0; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(74,108,255,.35) }
.btn-main:active { transform: translateY(0) }
@keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes float2 { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-6px) rotate(3deg) } }
.float-1 { animation: float 5s ease-in-out infinite }
.float-2 { animation: float2 6s ease-in-out 1s infinite }
@keyframes gradientFlow { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
.gradient-flow { background-size: 200% 200%; animation: gradientFlow 6s ease infinite }
@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
.fade-slide-up { animation: fadeSlideUp .35s ease-out }
@keyframes spinSlow { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
.spin-slow { animation: spinSlow 40s linear infinite }
</style>
