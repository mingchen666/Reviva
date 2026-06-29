<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useUserProfileStore, CLOUD_FEATURES } from '@/stores/userProfile'

const appStore = useAppStore()
const profileStore = useUserProfileStore()
const isDark = computed(() => appStore.isDark)

const usage = computed(() => profileStore.featureUsage)

const COLOR_MAP = {
  amber: { text: 'text-amber-400', textL: 'text-amber-600', bg: 'bg-amber-400/12', bgL: 'bg-amber-50', border: 'border-amber-400/25', borderL: 'border-amber-100' },
  rose: { text: 'text-rose-400', textL: 'text-rose-500', bg: 'bg-rose-400/12', bgL: 'bg-rose-50', border: 'border-rose-400/25', borderL: 'border-rose-100' },
  emerald: { text: 'text-emerald-400', textL: 'text-emerald-600', bg: 'bg-emerald-400/12', bgL: 'bg-emerald-50', border: 'border-emerald-400/25', borderL: 'border-emerald-100' },
  agent: { text: 'text-agent-400', textL: 'text-agent-500', bg: 'bg-agent-400/12', bgL: 'bg-violet-50', border: 'border-agent-400/25', borderL: 'border-violet-100' },
  blue: { text: 'text-blue-400', textL: 'text-blue-500', bg: 'bg-blue-400/12', bgL: 'bg-blue-50', border: 'border-blue-400/25', borderL: 'border-blue-100' },
  brand: { text: 'text-brand-400', textL: 'text-brand-500', bg: 'bg-brand-400/12', bgL: 'bg-brand-50', border: 'border-brand-400/25', borderL: 'border-brand-100' },
}

function colorCls(color, key) {
  const c = COLOR_MAP[color] || COLOR_MAP.brand
  if (key === 'text') return isDark.value ? c.text : c.textL
  if (key === 'bg') return isDark.value ? c.bg : c.bgL
  if (key === 'border') return isDark.value ? c.border : c.borderL
  return ''
}

const features = CLOUD_FEATURES
</script>

<template>
  <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <i class="ri-cloud-line text-brand-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">云端增强能力</span>
        <span class="ctx-pill" :class="isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">
          推荐
        </span>
      </div>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">按次计费 · 用多少扣多少</span>
    </div>

    <!-- Recommendation banner -->
    <div class="rounded-lg p-3 mb-4 flex items-start gap-2.5"
      :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50/60 border border-brand-100'">
      <i class="ri-sparkling-2-line text-[14px] mt-[1px] shrink-0" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
      <div class="flex-1 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
        云端能力由 <span class="font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Reviva 服务器集群</span>提供，相比本地推理：
        <span :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">效果更优</span> ·
        <span :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">速度更快</span> ·
        <span :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">不占本地资源</span>。
        推荐用于 PPT / 播客 / 视频等重计算任务，仅在调用时扣减积分，<span class="font-semibold">没有月度上限</span>。
      </div>
    </div>

    <!-- Feature grid -->
    <div class="grid grid-cols-2 gap-2.5">
      <div v-for="item in features" :key="item.key"
        class="feature-card rounded-lg p-3 transition-all cursor-pointer group relative overflow-hidden"
        :class="isDark ? 'bg-d0/60 border border-d4 hover:border-bdr hover:bg-d0' : 'bg-l2/60 border border-bdrF hover:border-bdrL hover:bg-l2'">

        <div class="flex items-center gap-2.5">
          <!-- Icon -->
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105"
            :class="[colorCls(item.color, 'bg'), colorCls(item.color, 'border')]">
            <i :class="[item.icon, 'text-[16px]', colorCls(item.color, 'text')]" />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1.5 mb-0.5">
              <span class="text-[12.5px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.name }}</span>
              <div class="flex items-baseline gap-0.5 shrink-0">
                <i class="ri-coin-line text-[10px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
                <span class="text-[13px] font-bold font-mono" :class="isDark ? 'text-amber-400' : 'text-amber-600'">{{ item.cost }}</span>
                <span class="text-[9.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">/{{ item.unit }}</span>
              </div>
            </div>
            <p class="text-[10.5px] leading-snug line-clamp-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</p>
            <div v-if="usage[item.key]?.used" class="mt-1.5 text-[9.5px] flex items-center gap-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-history-line text-[10px]" />
              本月已用 <span class="font-semibold" :class="colorCls(item.color, 'text')">{{ usage[item.key].used }}</span> {{ item.unit }}
            </div>
          </div>
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
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.feature-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
</style>
