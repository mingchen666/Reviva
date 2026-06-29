<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const router = useRouter()
const isDark = computed(() => appStore.isDark)

const transactions = computed(() => profileStore.transactions.slice(0, 10))
const totalCount = computed(() => profileStore.recordsTotal || profileStore.transactions.length)

function goDetail() {
  router.push('/profile/transactions')
}

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
</script>

<template>
  <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <i class="ri-file-list-3-line text-agent-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最近积分流水</span>
        <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">显示最近 10 条 · 共 {{ totalCount }} 条</span>
      </div>
      <button @click="goDetail"
        class="text-[10px] flex items-center gap-1 transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-brand-400' : 'text-lt-aux hover:text-brand-500'">
        查看更多 <i class="ri-arrow-right-s-line text-[11px]" />
      </button>
    </div>

    <div class="space-y-0.5">
      <div v-for="t in transactions" :key="t.id"
        class="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors"
        :class="isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50'">
        <!-- Type icon -->
        <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border"
          :class="bgCls(typeMeta(t).color)">
          <i :class="[typeMeta(t).icon, 'text-[14px]', colorCls(typeMeta(t).color)]" />
        </div>

        <!-- Description -->
        <div class="flex-1 min-w-0">
          <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.desc }}</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.time }}</div>
        </div>

        <!-- Amount -->
        <div class="text-right shrink-0">
          <div class="text-[13px] font-bold font-mono"
            :class="t.amount > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-rose-400' : 'text-rose-500')">
            {{ t.amount > 0 ? '+' : '' }}{{ t.amount.toLocaleString() }}
          </div>
          <div class="text-[9.5px] font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            余 {{ t.balance.toLocaleString() }}
          </div>
        </div>
      </div>

      <div v-if="transactions.length === 0" class="py-8 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        暂无流水记录
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
</style>
