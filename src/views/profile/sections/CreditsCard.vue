<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const isDark = computed(() => appStore.isDark)

const c = computed(() => profileStore.credits)
const percent = computed(() => profileStore.monthlyUsagePercent)

const emit = defineEmits(['recharge'])
</script>

<template>
  <div class="rounded-xl p-5 relative overflow-hidden"
    :class="isDark ? 'bg-gradient-to-br from-d3 to-d3 border border-bdr' : 'bg-gradient-to-br from-l3 to-l3 border border-bdrF'">
    <!-- Decorative coin pattern -->
    <div class="absolute -right-8 -top-8 w-40 h-40 rounded-full"
      :style="{ background: isDark ? 'radial-gradient(circle, rgba(245, 158, 11, 0.12), transparent 65%)' : 'radial-gradient(circle, rgba(245, 158, 11, 0.16), transparent 65%)' }" />
    <div class="absolute -right-4 -bottom-4 w-32 h-32 rounded-full"
      :style="{ background: isDark ? 'radial-gradient(circle, rgba(108, 138, 255, 0.10), transparent 65%)' : 'radial-gradient(circle, rgba(108, 138, 255, 0.14), transparent 65%)' }" />

    <div class="relative">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
              :class="isDark ? 'bg-amber-400/15 border border-amber-400/25' : 'bg-amber-50 border border-amber-100'">
              <i class="ri-coin-line text-[14px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
            </div>
            <span class="text-[11px] font-semibold uppercase tracking-wider" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">积分余额</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-[36px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ c.balance.toLocaleString() }}
            </span>
            <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">积分</span>
          </div>
        </div>

        <button @click="emit('recharge')"
          class="h-9 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          :class="isDark ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-d0 hover:shadow-amber-400/30 hover:shadow-lg' : 'bg-gradient-to-r from-amber-400 to-amber-500 text-white hover:shadow-amber-400/40 hover:shadow-lg'">
          <i class="ri-add-circle-line text-[14px]" /> 立即充值
        </button>
      </div>

      <!-- Monthly usage progress -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] flex items-center gap-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
            <i class="ri-calendar-line text-[11px]" />本月消耗
          </span>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <span :class="percent > 80 ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-amber-400' : 'text-amber-600')">
              {{ c.monthlyConsumed.toLocaleString() }}
            </span>
            <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"> / {{ c.monthlyBudget.toLocaleString() }} ({{ percent }}%)</span>
          </span>
        </div>
        <div class="h-1.5 rounded-full overflow-hidden" :class="isDark ? 'bg-d0' : 'bg-l2'">
          <div class="h-full rounded-full transition-all"
            :style="{ width: percent + '%' }"
            :class="percent > 80 ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-amber-400 to-amber-500'" />
        </div>
      </div>
    </div>
  </div>
</template>
