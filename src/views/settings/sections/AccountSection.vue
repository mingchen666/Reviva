<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { cloudApi } from '@/apis/cloud'

const appStore = useAppStore()
const userStore = useUserStore()
const isDark = computed(() => appStore.isDark)

const connStatus = computed(() => userStore.connStatus)
const cloudMessage = ref('')

const connLabel = computed(() => {
  if (connStatus.value === 'connected') return '已连接'
  if (connStatus.value === 'degraded') return '部分降级'
  if (connStatus.value === 'offline') return '服务不可用'
  if (connStatus.value === 'error') return '连接异常'
  if (connStatus.value === 'connecting') return '连接中...'
  return '未连接'
})

const isHealthy = computed(() => connStatus.value === 'connected')

async function checkConnection() {
  userStore.setConnStatus('connecting')
  cloudMessage.value = ''
  try {
    const res = await cloudApi.status()
    const s = res?.status || 'offline'
    // map server status → store conn status
    if (s === 'normal') userStore.setConnStatus('connected')
    else userStore.setConnStatus(s) // 'degraded' | 'offline'
    cloudMessage.value = res?.message || ''
  } catch (e) {
    userStore.setConnStatus('error')
    cloudMessage.value = e?.message || '网络请求失败'
  }
}

onMounted(checkConnection)
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <!-- User Profile Card -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-3 flex-wrap">
        <!-- Avatar -->
        <div
          class="w-14 h-14 rounded-full bg-gradient-to-br from-brand-400 to-agent-500 flex items-center justify-center text-[22px] font-bold text-white shrink-0">
          M
        </div>
        <!-- Info -->
        <div class="flex-1 min-w-[180px]">
          <div class="flex items-center gap-2 mb-0.5">
            <h2 class="text-[16px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">明心</h2>
            <span
              class="ctx-pill"
              :class="
                isDark
                  ? 'bg-agent-400/10 text-agent-400 border border-agent-400/20'
                  : 'bg-agent-50 text-agent-500 border border-agent-100'
              ">
              Pro
            </span>
          </div>
          <p class="text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">mingxin@reviva.app</p>
          <p class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            UID · 285094 · 注册于 2024-03-15
          </p>
        </div>
        <!-- Account Center Button -->
        <button
          class="ctx-pill cursor-pointer"
          :class="
            isDark
              ? 'text-wt-aux bg-d0 border border-bdr hover:text-wt-sub'
              : 'text-lt-aux bg-l2 border border-bdrF hover:text-lt-sub'
          ">
          <i class="ri-user-settings-line text-[10px]" />
          账号中心
        </button>
      </div>
      <!-- Stats Row -->
      <div class="grid grid-cols-3 gap-3 mt-5 pt-5" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
        <div>
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">知识库配额</div>
          <div class="flex items-baseline gap-1">
            <span class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">5</span>
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">/ 20 个</span>
          </div>
        </div>
        <div>
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">文档容量</div>
          <div class="flex items-baseline gap-1">
            <span class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">340</span>
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">MB / 10 GB</span>
          </div>
        </div>
        <div>
          <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本月 Token</div>
          <div class="flex items-baseline gap-1">
            <span class="text-[18px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">1.28M</span>
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">/ 5M</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Cloud Connection Card -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-4">
        <i class="ri-cloud-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">云端连接</span>
      </div>
      <div class="space-y-1">
        <!-- Cloud Knowledge Base -->
        <div
          class="flex items-center gap-3 py-2.5 px-2 rounded-lg"
          :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i class="ri-database-2-line text-[13px] text-brand-400" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">云端知识库服务</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ cloudMessage || '用于解析、向量化与检索' }}
            </div>
          </div>
          <span
            class="ctx-pill"
            :class="
              isHealthy
                ? isDark
                  ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : connStatus === 'degraded'
                  ? isDark
                    ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20'
                    : 'bg-amber-50 text-amber-500 border border-amber-100'
                  : isDark
                    ? 'bg-red-400/8 text-red-400 border border-red-400/20'
                    : 'bg-red-50 text-red-500 border border-red-100'
            ">
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="isHealthy ? 'bg-emerald-400' : connStatus === 'degraded' ? 'bg-amber-400' : 'bg-red-400'" />
            <span>{{ connLabel }}</span>
          </span>
          <button
            class="ctx-pill cursor-pointer"
            :class="
              isDark
                ? 'text-wt-aux bg-d0 border border-bdr hover:text-wt-sub'
                : 'text-lt-aux bg-l2 border border-bdrF hover:text-lt-sub'
            "
            @click="checkConnection">
            <i class="ri-refresh-line text-[10px]" />
            检查
          </button>
        </div>
        <!-- Web Search Agent -->
        <div
          class="flex items-center gap-3 py-2.5 px-2 rounded-lg"
          :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <i class="ri-global-line text-[13px] text-blue-400" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索代理</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">为 Agent 提供网络搜索能力</div>
          </div>
          <span
            class="ctx-pill"
            :class="
              isDark
                ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            ">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            可用
          </span>
        </div>
      </div>
    </div>

    <!-- Account Actions Card -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center gap-2 mb-3">
        <i class="ri-lock-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">账号操作</span>
      </div>
      <div class="space-y-1">
        <button
          class="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors"
          :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'">
          <i class="ri-key-2-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <span class="text-[12px] flex-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">修改密码</span>
          <i class="ri-arrow-right-s-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button
          class="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors"
          :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l4'">
          <i class="ri-shield-keyhole-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <span class="text-[12px] flex-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">隐私与数据</span>
          <i class="ri-arrow-right-s-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        </button>
        <button
          class="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg text-left transition-colors"
          :class="isDark ? 'text-red-400 hover:bg-red-400/6' : 'text-red-500 hover:bg-red-50'"
          @click="userStore.logout()">
          <i class="ri-logout-box-r-line text-[14px]" />
          <span class="text-[12px] flex-1 font-medium">退出登录</span>
          <i class="ri-arrow-right-s-line text-[12px] opacity-60" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctx-pill {
  font-size: 11px;
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}
.section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
