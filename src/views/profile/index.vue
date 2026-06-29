<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/components/MsMessage/useMessage'
import ProfileHeader from './sections/ProfileHeader.vue'
import CreditsCard from './sections/CreditsCard.vue'
import KnowledgeBaseQuota from './sections/KnowledgeBaseQuota.vue'
import CloudFeaturesGrid from './sections/CloudFeaturesGrid.vue'
import RechargePlans from './sections/RechargePlans.vue'
import TransactionList from './sections/TransactionList.vue'

const router = useRouter()
const appStore = useAppStore()
const profileStore = useUserProfileStore()
const userStore = useUserStore()
const isDark = computed(() => appStore.isDark)
const message = useMessage()

const showRechargePanel = ref(false)
const refreshing = ref(false)

function scrollToRecharge() {
  showRechargePanel.value = true
  setTimeout(() => {
    document.getElementById('recharge-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}

function handlePurchase(plan) {
  const ok = profileStore.rechargeCredits(plan.id)
  if (ok) {
    message.success(`充值成功！获得 ${(plan.credits + plan.bonus).toLocaleString()} 积分`)
  } else {
    message.error('充值失败')
  }
}

async function loadAll() {
  if (!userStore.isLoggedIn) return
  refreshing.value = true
  try {
    await Promise.all([
      profileStore.loadProfile().catch(() => {}),
      profileStore.loadBalance().catch(() => {}),
      profileStore.loadLatestRecords().catch(() => {}),
      profileStore.loadKbOverview().catch(() => {}),
    ])
  } finally {
    refreshing.value = false
  }
}

onMounted(loadAll)
watch(() => userStore.isLoggedIn, (v) => { if (v) loadAll() })
</script>

<template>
  <div class="h-full overflow-y-auto" :class="isDark ? 'bg-d0' : 'bg-l0'">

    <!-- ═══ Unauthenticated — login/register prompt ═══ -->
    <div v-if="!userStore.isLoggedIn" class="h-full flex items-center justify-center">
      <div class="text-center max-w-[320px]">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <i class="ri-user-unfollow-line text-[28px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        </div>
                <h2 class="text-[16px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">稍后再试</h2>
        <p class="text-[12px] mb-5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">目前正在内测阶段，暂不支持注册登录哦~</p>
        <!-- <h2 class="text-[16px] font-bold mb-2" :class="isDark ? 'text-wt-main' : 'text-lt-main'">请先登录</h2>
        <p class="text-[12px] mb-5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">登录后可查看个人信息、积分余额与云端配额</p> -->
        <div v-if="true" class="flex gap-3 justify-center">
          <button @click="router.push('/login')"
          
            class="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
            :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
            <i class="ri-login-box-line text-[12px] mr-1" /> 登录
          </button>
          <button @click="router.push('/login?tab=register')"
          
            class="px-5 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
            :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4 border border-bdr' : 'bg-l3 text-lt-sub hover:bg-l4 border border-bdrF'">
            <i class="ri-user-add-line text-[12px] mr-1" /> 注册
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ Authenticated — full profile ═══ -->
    <template v-else>

    <!-- Page Header -->
    <div class="sticky top-0 z-10 h-10 flex items-center justify-between px-5 backdrop-blur-md"
      :class="isDark ? 'bg-d0/80 border-b border-d4' : 'bg-l0/80 border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-user-3-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">个人中心</span>
      </div>
      <span class="text-[11px] flex items-center gap-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <button @click="loadAll" :disabled="refreshing"
          class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
          :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l4'"
          title="刷新">
          <i class="ri-refresh-line text-[12px]" :class="refreshing ? 'animate-spin' : ''" />
        </button>
        <span>账号 · 积分 · 云端配额</span>
      </span>
    </div>

    <!-- Content -->
    <div class="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <ProfileHeader />
      <CreditsCard @recharge="scrollToRecharge" />
      <KnowledgeBaseQuota />
      <CloudFeaturesGrid />
      <div id="recharge-anchor">
        <RechargePlans @purchase="handlePurchase" />
      </div>
      <TransactionList />
    </div>

    </template> <!-- v-else: authenticated -->
  </div>
</template>
