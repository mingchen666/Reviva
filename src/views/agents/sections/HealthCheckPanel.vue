<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import HealthBadge from './HealthBadge.vue'

const props = defineProps({
  agentIds: { type: Array, required: true },
  isDark: Boolean,
})

const agentsStore = useAgentsStore()

function getAgent(id) {
  return agentsStore.agents.find(a => a.id === id)
}

function getResult(id) {
  return agentsStore.healthCheckResults[id] || null
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const lastCheckedAt = computed(() => {
  let latest = 0
  for (const id of props.agentIds) {
    const ts = getResult(id)?.checkedAt || 0
    if (ts > latest) latest = ts
  }
  return latest ? formatTime(latest) : ''
})
</script>

<template>
  <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <i class="ri-heart-pulse-line text-emerald-400 text-[14px]" />
        <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">健康检查结果</span>
        <span v-if="agentsStore.healthChecking" class="text-[10px] text-brand-400 animate-pulse">检查中...</span>
        <span v-if="lastCheckedAt && !agentsStore.healthChecking" class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">上次检查: {{ lastCheckedAt }}</span>
      </div>
    </div>
    <div class="space-y-2">
      <div v-for="id in agentIds" :key="id" class="flex flex-col gap-1 py-2 px-2.5 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 rounded flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <i :class="(getAgent(id)?.icon || 'ri-sparkling-2-line') + ' text-[11px]'" :style="'color:' + (getAgent(id)?.color || '#A78BFA')" />
          </div>
          <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ getAgent(id)?.name || id }}</span>
          <div class="flex-1" />
          <HealthBadge :status="getResult(id)?.status || ''" :is-dark="isDark" size="md" />
        </div>
        <!-- Per-agent check time -->
        <div v-if="getResult(id)?.checkedAt && !agentsStore.healthChecking" class="ml-7 text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          检查时间: {{ formatTime(getResult(id).checkedAt) }}
        </div>
        <!-- Check details -->
        <div v-if="getResult(id)?.results" class="ml-7 space-y-0.5">
          <template v-for="(val, key) in getResult(id).results" :key="key">
            <div v-if="val" class="flex items-center gap-1.5 text-[10px]">
              <i :class="val.passed ? 'ri-check-circle-fill text-emerald-400' : (val.severity === 'critical' ? 'ri-close-circle-fill text-red-400' : 'ri-alert-line text-amber-400')" class="text-[10px] shrink-0" />
              <span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ val.message }}</span>
            </div>
            <template v-if="val?.issues?.length">
              <div v-for="issue in val.issues" :key="issue.message" class="flex items-center gap-1.5 text-[10px] ml-4">
                <i :class="issue.severity === 'critical' ? 'ri-close-circle-fill text-red-400' : 'ri-alert-line text-amber-400'" class="text-[9px] shrink-0" />
                <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ issue.message }}</span>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
