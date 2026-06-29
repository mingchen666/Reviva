<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore } from '@/stores/userProfile'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const isDark = computed(() => appStore.isDark)

const quota = computed(() => profileStore.kbQuota)

const COLOR_MAP = {
  brand: { text: 'text-brand-400', textL: 'text-brand-500', bg: 'bg-brand-400/10', bgL: 'bg-brand-50', bar: 'from-brand-400 to-brand-500' },
  emerald: { text: 'text-emerald-400', textL: 'text-emerald-600', bg: 'bg-emerald-400/10', bgL: 'bg-emerald-50', bar: 'from-emerald-400 to-emerald-500' },
  agent: { text: 'text-agent-400', textL: 'text-agent-500', bg: 'bg-agent-400/10', bgL: 'bg-violet-50', bar: 'from-agent-400 to-agent-500' },
  rose: { text: 'text-rose-400', textL: 'text-rose-500', bg: 'bg-rose-400/10', bgL: 'bg-rose-50', bar: 'from-rose-400 to-rose-500' },
  amber: { text: 'text-amber-400', textL: 'text-amber-600', bg: 'bg-amber-400/10', bgL: 'bg-amber-50', bar: 'from-amber-400 to-amber-500' },
  blue: { text: 'text-blue-400', textL: 'text-blue-500', bg: 'bg-blue-400/10', bgL: 'bg-blue-50', bar: 'from-blue-400 to-blue-500' },
}

function colorCls(color, key) {
  const c = COLOR_MAP[color] || COLOR_MAP.brand
  if (key === 'text') return isDark.value ? c.text : c.textL
  if (key === 'bg') return isDark.value ? c.bg : c.bgL
  if (key === 'bar') return c.bar
  return ''
}

function percent(item) {
  return Math.min(100, Math.round(item.used / item.limit * 100))
}

function fmt(n) {
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

const items = computed(() => Object.values(quota.value))
</script>

<template>
  <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <i class="ri-database-2-line text-emerald-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">知识库与云端配额</span>
      </div>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">免费基础额度 · 充值积分可扩容</span>
    </div>

    <div class="grid grid-cols-3 gap-3">
      <div v-for="item in items" :key="item.label"
        class="rounded-lg p-3"
        :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" :class="colorCls(item.color, 'bg')">
            <i :class="[item.icon, 'text-[13px]', colorCls(item.color, 'text')]" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.label }}</span>
        </div>

        <div class="flex items-baseline gap-1 mb-2">
          <span class="text-[18px] font-bold leading-none" :class="colorCls(item.color, 'text')">{{ fmt(item.used) }}</span>
          <span class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">/ {{ fmt(item.limit) }} {{ item.unit }}</span>
        </div>

        <div class="h-1 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
          <div class="h-full rounded-full bg-gradient-to-r transition-all"
            :class="colorCls(item.color, 'bar')"
            :style="{ width: percent(item) + '%' }" />
        </div>
        <div class="text-[9.5px] mt-1 text-right" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ percent(item) }}%
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.ctx-pill {
  display: inline-flex; align-items: center;
  padding: 1px 5px; border-radius: 3px; font-size: 9px;
  font-weight: 700; line-height: 1.4;
}
</style>
