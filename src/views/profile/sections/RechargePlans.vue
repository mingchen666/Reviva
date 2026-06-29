<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const isDark = computed(() => appStore.isDark)

const plans = computed(() => profileStore.getRechargePlans())

// Use starter as baseline unit price for "save X%" calculations
const baselineUnit = computed(() => {
  const starter = plans.value.find(p => p.id === 'starter')
  if (!starter) return null
  return starter.price / starter.credits
})

function totalCredits(plan) { return plan.credits + plan.bonus }
function unitPrice(plan) { return (plan.price / totalCredits(plan)) }
function savePercent(plan) {
  if (!baselineUnit.value) return 0
  const pct = (1 - unitPrice(plan) / baselineUnit.value) * 100
  return pct > 0 ? Math.round(pct) : 0
}

const emit = defineEmits(['purchase'])
</script>

<template>
  <div class="rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <!-- Header -->
    <div class="flex items-end justify-between mb-1">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <i class="ri-shopping-bag-3-line text-amber-400 text-[14px]" />
          <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">充值积分</span>
        </div>
        <h3 class="text-[15px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">选择最适合你的套餐</h3>
      </div>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <i class="ri-shield-check-line text-[10px] mr-0.5" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
        积分永久有效 · 安全支付
      </span>
    </div>
    <p class="text-[11.5px] mb-5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
      积分用于解锁全部云端能力（PPT / 播客 / 知识图谱 / 视频解读等），充值越多单价越低
    </p>

    <!-- Plan cards -->
    <div class="grid grid-cols-4 gap-3">
      <div v-for="plan in plans" :key="plan.id"
        class="plan-card relative rounded-xl p-4 transition-all cursor-pointer overflow-hidden"
        :class="plan.popular
          ? (isDark ? 'bg-gradient-to-b from-amber-400/12 via-amber-400/5 to-transparent border-2 border-amber-400/45 shadow-lg shadow-amber-400/10' : 'bg-gradient-to-b from-amber-50 via-amber-50/30 to-transparent border-2 border-amber-300 shadow-lg shadow-amber-200/40')
          : (isDark ? 'bg-d0/70 border border-d4 hover:border-bdr hover:bg-d0' : 'bg-l2/70 border border-bdrF hover:border-bdrL hover:bg-l2')"
        @click="emit('purchase', plan)">

        <!-- Popular ribbon -->
        <div v-if="plan.popular" class="absolute -right-9 top-3 rotate-45 w-32 text-center py-[2px] text-[9px] font-bold text-white shadow"
          :style="{ background: 'linear-gradient(90deg, #F59E0B, #FBBF24)' }">
          最受欢迎
        </div>

        <!-- Save badge -->
        <span v-if="!plan.popular && savePercent(plan) > 0"
          class="absolute right-3 top-3 px-1.5 py-[1px] rounded text-[9px] font-bold"
          :class="isDark ? 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/25' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
          省 {{ savePercent(plan) }}%
        </span>

        <!-- Tagline -->
        <div class="text-[10px] font-medium mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ plan.tagline }}</div>

        <!-- Name -->
        <div class="text-[15px] font-bold mb-3" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ plan.name }}</div>

        <!-- Price -->
        <div class="flex items-baseline gap-1 mb-1">
          <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">¥</span>
          <span class="text-[28px] font-bold leading-none"
            :class="plan.popular ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-wt-main' : 'text-lt-main')">
            {{ plan.price }}
          </span>
        </div>

        <!-- Credits -->
        <div class="flex items-center gap-1.5 mb-1">
          <i class="ri-coin-line text-[12px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ plan.credits.toLocaleString() }}</span>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">积分</span>
        </div>
        <div v-if="plan.bonus" class="text-[10px] font-medium mb-3" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">
          <i class="ri-gift-line text-[10px]" /> 赠送 {{ plan.bonus.toLocaleString() }} 积分
        </div>
        <div v-else class="text-[10px] mb-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">&nbsp;</div>

        <!-- Unit price hint -->
        <div class="text-[9.5px] mb-3 pb-3 border-b" :class="isDark ? 'text-wt-dim border-d4' : 'text-lt-aux border-bdrF'">
          约 ¥{{ unitPrice(plan).toFixed(4) }} / 积分
        </div>

        <!-- Features list -->
        <ul class="space-y-1.5 mb-4">
          <li v-for="(feat, i) in plan.features" :key="i"
            class="flex items-start gap-1.5 text-[10.5px] leading-snug"
            :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
            <i class="ri-check-line text-[11px] mt-[2px] shrink-0"
              :class="isDark ? 'text-emerald-400' : 'text-emerald-600'" />
            <span>{{ feat }}</span>
          </li>
        </ul>

        <!-- CTA -->
        <button class="w-full h-8 rounded-md text-[11px] font-semibold transition-all"
          :class="plan.popular
            ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-white hover:shadow-md hover:shadow-amber-400/30'
            : (isDark ? 'bg-d4 text-wt-sub hover:bg-bdr hover:text-wt-main' : 'bg-l4 text-lt-sub hover:bg-bdrF hover:text-lt-main')"
          @click.stop="emit('purchase', plan)">
          {{ plan.popular ? '立即购买' : '选择此套餐' }}
        </button>
      </div>
    </div>

    <!-- Bottom hint -->
    <div class="mt-4 flex items-center justify-center gap-4 flex-wrap text-[10px]"
      :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <span class="flex items-center gap-1"><i class="ri-wechat-pay-fill text-[12px] text-emerald-500" /> 微信支付</span>
      <span class="flex items-center gap-1"><i class="ri-alipay-fill text-[12px] text-blue-500" /> 支付宝</span>
      <span class="flex items-center gap-1"><i class="ri-apple-fill text-[12px]" /> Apple Pay</span>
      <span class="opacity-50">·</span>
      <span>企业批量采购请<a class="underline cursor-pointer" :class="isDark ? 'text-brand-400' : 'text-brand-500'">联系商务</a></span>
    </div>
  </div>
</template>

<style scoped>
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.plan-card:hover { transform: translateY(-3px); }
</style>
