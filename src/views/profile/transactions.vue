<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore, CLOUD_FEATURES } from '@/stores/userProfile'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/components/MsMessage/useMessage'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const userStore = useUserStore()
const router = useRouter()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)

const typeFilter = ref('all') // all | consume | recharge | reward
const featureFilter = ref('all')
const search = ref('')
const dateRange = ref('all') // all | 7 | 30 | 90

const TYPE_TABS = [
  { key: 'all', label: '全部', icon: 'ri-stack-line' },
  { key: 'consume', label: '消耗', icon: 'ri-arrow-up-circle-line' },
  { key: 'recharge', label: '充值', icon: 'ri-arrow-down-circle-line' },
  { key: 'reward', label: '奖励', icon: 'ri-gift-line' },
]

const DATE_RANGES = [
  { key: 'all', label: '全部' },
  { key: '7', label: '近 7 天' },
  { key: '30', label: '近 30 天' },
  { key: '90', label: '近 90 天' },
]

const filtered = computed(() => {
  let list = profileStore.transactions
  if (typeFilter.value !== 'all') {
    list = list.filter(t => t.type === typeFilter.value)
  }
  if (featureFilter.value !== 'all') {
    list = list.filter(t => t.feature === featureFilter.value)
  }
  if (search.value.trim()) {
    const kw = search.value.trim().toLowerCase()
    list = list.filter(t => t.desc.toLowerCase().includes(kw))
  }
  if (dateRange.value !== 'all') {
    const days = parseInt(dateRange.value)
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    list = list.filter(t => new Date(t.time.replace(/-/g, '/')).getTime() >= cutoff)
  }
  return list
})

// Stats based on filtered list
const stats = computed(() => {
  const consumed = filtered.value.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const earned = filtered.value.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  return { consumed, earned, total: filtered.value.length }
})

function typeMeta(t) {
  if (t.type === 'recharge') return { icon: 'ri-arrow-down-circle-line', color: 'emerald', label: '充值' }
  if (t.type === 'reward') return { icon: 'ri-gift-line', color: 'agent', label: '奖励' }
  return { icon: 'ri-arrow-up-circle-line', color: 'rose', label: '消耗' }
}

function colorCls(color) {
  const map = {
    emerald: isDark.value ? 'text-emerald-400' : 'text-emerald-600',
    agent: isDark.value ? 'text-agent-400' : 'text-agent-500',
    rose: isDark.value ? 'text-rose-400' : 'text-rose-500',
  }
  return map[color] || ''
}
function bgCls(color) {
  const map = {
    emerald: isDark.value ? 'bg-emerald-400/10 border-emerald-400/20' : 'bg-emerald-50 border-emerald-100',
    agent: isDark.value ? 'bg-agent-400/10 border-agent-400/20' : 'bg-violet-50 border-violet-100',
    rose: isDark.value ? 'bg-rose-400/10 border-rose-400/20' : 'bg-rose-50 border-rose-100',
  }
  return map[color] || ''
}

function featureName(key) {
  return CLOUD_FEATURES.find(f => f.key === key)?.name || key
}

function reset() {
  typeFilter.value = 'all'
  featureFilter.value = 'all'
  search.value = ''
  dateRange.value = 'all'
}

async function refresh() {
  try {
    await profileStore.loadRecords({ page: 1, pageSize: 20 })
    msg.success('已刷新')
  } catch (e) {
    msg.error(e?.detail || '加载失败')
  }
}

async function loadMore() {
  try {
    await profileStore.loadMoreRecords()
  } catch (e) {
    msg.error(e?.detail || '加载失败')
  }
}

const hasMore = computed(() => {
  const total = profileStore.recordsTotal || 0
  const loaded = profileStore.transactions.length
  return loaded < total
})

onMounted(() => {
  if (!userStore.isLoggedIn) return
  if (profileStore.transactions.length === 0) {
    profileStore.loadRecords({ page: 1, pageSize: 20 }).catch(() => {})
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto" :class="isDark ? 'bg-d0' : 'bg-l0'">

    <!-- ═══ Unauthenticated — login prompt ═══ -->
    <div v-if="!userStore.isLoggedIn" class="h-full flex items-center justify-center">
      <div class="text-center max-w-[320px]">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <i class="ri-user-unfollow-line text-[28px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        </div>
        <h2 class="text-[16px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">请先登录</h2>
        <p class="text-[12px] mb-5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">登录后可查看积分流水明细</p>
        <button @click="router.push('/login')"
          class="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          <i class="ri-login-box-line text-[12px] mr-1" /> 登录
        </button>
      </div>
    </div>

    <!-- ═══ Authenticated — full content ═══ -->
    <template v-else>

    <!-- Header -->
    <div class="sticky top-0 z-10 h-10 flex items-center justify-between px-5 backdrop-blur-md"
      :class="isDark ? 'bg-d0/80 border-b border-d4' : 'bg-l0/80 border-b border-bdrL'">
      <div class="flex items-center gap-2 min-w-0">
        <button @click="router.push('/profile')"
          class="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:bg-white/4 hover:text-wt-sub' : 'text-lt-aux hover:bg-l4 hover:text-lt-sub'">
          <i class="ri-arrow-left-line text-[14px]" />
        </button>
        <i class="ri-file-list-3-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">积分流水明细</span>
      </div>
      <span class="text-[11px] flex items-center gap-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <button @click="refresh" :disabled="profileStore.recordsLoading"
          class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
          :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l4'"
          title="刷新">
          <i class="ri-refresh-line text-[12px]" :class="profileStore.recordsLoading ? 'animate-spin' : ''" />
        </button>
        <span>共 {{ profileStore.recordsTotal || profileStore.transactions.length }} 条记录</span>
      </span>
    </div>

    <div class="max-w-5xl mx-auto px-6 py-6 space-y-4">
      <!-- Stats row -->
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="text-[10.5px] mb-1 flex items-center gap-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <i class="ri-arrow-up-circle-line text-rose-400 text-[11px]" /> 当前筛选 · 消耗
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-[22px] font-bold" :class="isDark ? 'text-rose-400' : 'text-rose-500'">{{ stats.consumed.toLocaleString() }}</span>
            <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">积分</span>
          </div>
        </div>
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="text-[10.5px] mb-1 flex items-center gap-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <i class="ri-arrow-down-circle-line text-emerald-400 text-[11px]" /> 当前筛选 · 收入
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-[22px] font-bold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">{{ stats.earned.toLocaleString() }}</span>
            <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">积分</span>
          </div>
        </div>
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="text-[10.5px] mb-1 flex items-center gap-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <i class="ri-stack-line text-brand-400 text-[11px]" /> 当前筛选 · 笔数
          </div>
          <div class="flex items-baseline gap-1">
            <span class="text-[22px] font-bold" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ stats.total }}</span>
            <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">条</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="rounded-xl p-4 space-y-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <!-- Type tabs -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <button v-for="tab in TYPE_TABS" :key="tab.key"
            @click="typeFilter = tab.key"
            class="h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"
            :class="typeFilter === tab.key
              ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/25' : 'bg-brand-50 text-brand-500 border border-brand-100')
              : (isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub')">
            <i :class="`${tab.icon} text-[11px]`" /> {{ tab.label }}
          </button>
          <div class="w-px h-5 mx-1" :class="isDark ? 'bg-d4' : 'bg-bdrF'" />
          <button v-for="r in DATE_RANGES" :key="r.key"
            @click="dateRange = r.key"
            class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors"
            :class="dateRange === r.key
              ? (isDark ? 'bg-agent-400/15 text-agent-400 border border-agent-400/25' : 'bg-violet-50 text-agent-500 border border-violet-100')
              : (isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub')">
            {{ r.label }}
          </button>
        </div>

        <!-- Search + feature filter -->
        <div class="flex items-center gap-2">
          <div class="flex-1 relative">
            <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <input v-model="search" type="text" placeholder="搜索流水描述..."
              class="w-full h-8 pl-8 pr-3 rounded-md text-[11px] outline-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder:text-lt-aux'">
          </div>
          <select v-model="featureFilter"
            class="h-8 px-2 rounded-md text-[11px] outline-none cursor-pointer"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'">
            <option value="all">全部功能</option>
            <option v-for="f in CLOUD_FEATURES" :key="f.key" :value="f.key">{{ f.name }}</option>
          </select>
          <button @click="reset"
            class="h-8 px-2.5 rounded-md text-[10.5px] font-medium transition-colors"
            :class="isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub'">
            <i class="ri-refresh-line text-[11px]" /> 重置
          </button>
        </div>
      </div>

      <!-- List -->
      <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div v-if="filtered.length === 0" class="py-16 text-center text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-inbox-line text-[28px] block mb-2 opacity-50" />
          没有符合条件的记录
        </div>
        <div v-else>
          <div class="divide-y" :class="isDark ? 'divide-d4' : 'divide-bdrF'">
          <div v-for="t in filtered" :key="t.id"
            class="flex items-center gap-3 py-3 px-4 transition-colors"
            :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
            <div class="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border" :class="bgCls(typeMeta(t).color)">
              <i :class="[typeMeta(t).icon, 'text-[15px]', colorCls(typeMeta(t).color)]" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-[12.5px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.desc }}</span>
                <span v-if="t.feature" class="ctx-pill"
                  :class="isDark ? 'bg-d0 text-wt-aux border border-bdr' : 'bg-l2 text-lt-aux border border-bdrF'">
                  {{ featureName(t.feature) }}
                </span>
              </div>
              <div class="text-[10.5px] flex items-center gap-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                <i class="ri-time-line text-[11px]" /> {{ t.time }}
                <span class="opacity-50">·</span>
                <span>#{{ t.id }}</span>
              </div>
            </div>

            <div class="text-right shrink-0">
              <div class="text-[15px] font-bold font-mono"
                :class="t.amount > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-rose-400' : 'text-rose-500')">
                {{ t.amount > 0 ? '+' : '' }}{{ t.amount.toLocaleString() }}
              </div>
              <div class="text-[10px] font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                余 {{ t.balance.toLocaleString() }}
              </div>
            </div>
          </div>
          </div>
          <div v-if="hasMore" class="py-3 text-center">
            <button @click="loadMore" :disabled="profileStore.recordsLoading"
              class="px-4 py-1.5 rounded-md text-[11px] font-medium transition-colors"
              :class="isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub'">
              <i v-if="profileStore.recordsLoading" class="ri-loader-4-line animate-spin text-[11px] mr-1" />
              加载更多
            </button>
          </div>
        </div>
      </div>
    </div>

    </template> <!-- v-else: authenticated -->
  </div>
</template>

<style scoped>
.ctx-pill {
  display: inline-flex; align-items: center;
  padding: 1px 5px; border-radius: 3px; font-size: 9.5px;
  font-weight: 600; line-height: 1.4;
}
</style>
