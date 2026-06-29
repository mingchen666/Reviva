<script setup>
import { ref, computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useAppStore } from '@/stores/app'
import HealthBadge from './HealthBadge.vue'

const props = defineProps({
  isDark: Boolean,
})

const emit = defineEmits(['close', 'runCheck'])

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const isDark = computed(() => appStore.isDark)

const selectedIds = ref([])

const agents = computed(() => agentsStore.agents)

function toggleAgent(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleAll() {
  if (selectedIds.value.length === agents.value.length) {
    selectedIds.value = []
  } else {
    selectedIds.value = agents.value.map(a => a.id)
  }
}

function getResult(id) {
  return agentsStore.healthCheckResults[id] || null
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function runCheck() {
  if (selectedIds.value.length === 0) return
  emit('runCheck', selectedIds.value)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[9998] flex items-center justify-center" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/40" />
      <div class="relative w-[480px] max-h-[520px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        :class="isDark ? 'bg-d1 border border-bdr' : 'bg-l1 border border-bdrF'">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3.5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrF'">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-emerald-400/15' : 'bg-emerald-50'">
              <i class="ri-heart-pulse-line text-[14px] text-emerald-400" />
            </div>
            <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">健康检查</span>
          </div>
          <button @click="emit('close')" class="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            :class="isDark ? 'text-wt-dim hover:bg-d4' : 'text-lt-aux hover:bg-l4'">
            <i class="ri-close-line text-[14px]" />
          </button>
        </div>

        <!-- Info -->
        <div class="px-5 py-2.5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrF'">
          <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择要检查的智能体，将测试模型连接、工具配置、技能安装和子代理状态。</p>
        </div>

        <!-- Select all -->
        <div class="flex items-center gap-2 px-5 py-2 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrF'">
          <button @click="toggleAll" class="flex items-center gap-2 text-[12px] font-medium transition-colors"
            :class="selectedIds.length === agents.length
              ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
              : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
            <i :class="selectedIds.length === agents.length ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-checkbox-blank-circle-line'" class="text-[14px]" />
            全选 ({{ selectedIds.length }}/{{ agents.length }})
          </button>
        </div>

        <!-- Agent list -->
        <div class="flex-1 overflow-y-auto thin-scroll px-3 py-2 space-y-1">
          <div v-for="agent in agents" :key="agent.id"
            @click="toggleAgent(agent.id)"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
            :class="selectedIds.includes(agent.id)
              ? (isDark ? 'bg-emerald-400/8 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100')
              : (isDark ? 'hover:bg-d3' : 'hover:bg-l3')">
            <i :class="selectedIds.includes(agent.id) ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-checkbox-blank-circle-line'"
              class="text-[14px] shrink-0" :style="selectedIds.includes(agent.id) ? '' : (isDark ? 'color: var(--wt-dim)' : 'color: var(--lt-aux)')" />
            <div class="w-6 h-6 rounded flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3' : 'bg-l3'">
              <i :class="agent.icon + ' text-[12px]'" :style="'color:' + agent.color" />
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ agent.name }}</span>
              <span v-if="agent.builtin" class="text-[9px] ml-1 px-1 py-[1px] rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">内置</span>
            </div>
            <!-- Last check status -->
            <div class="flex items-center gap-1.5 shrink-0">
              <HealthBadge v-if="getResult(agent.id)?.status && getResult(agent.id).status !== 'checking'" :status="getResult(agent.id).status" :is-dark="isDark" />
              <span v-if="getResult(agent.id)?.checkedAt" class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatTime(getResult(agent.id).checkedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-5 py-3 shrink-0" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
          <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已选 {{ selectedIds.length }} 个智能体</span>
          <div class="flex items-center gap-2">
            <button @click="emit('close')" class="h-8 px-4 rounded-lg text-[12px] font-medium transition-colors"
              :class="isDark ? 'bg-d3 text-wt-aux hover:bg-d4' : 'bg-l3 text-lt-aux hover:bg-l4'">
              取消
            </button>
            <button @click="runCheck" :disabled="selectedIds.length === 0"
              class="h-8 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all"
              :class="selectedIds.length > 0
                ? 'text-white bg-emerald-500 hover:bg-emerald-600'
                : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
              <i class="ri-heart-pulse-line text-[11px]" /> 开始检查
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>