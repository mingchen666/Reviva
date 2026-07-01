<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  isDark: Boolean,
  agents: { type: Array, default: () => [] },
  selectedAgent: Object,
})

const emit = defineEmits(['select', 'close'])
const searchQuery = ref('')

const CREATION_CENTER_ENGLISH_NAMES = new Set([
  'quiz-generator', 'ppt-generator', 'mindmap-generator', 'graph-generator',
  'flashcard-generator', 'chart-generator', 'deep-researcher', 'lab-report-assistant',
])

const customAgents = computed(() => props.agents.filter(a => !a.builtin))
const builtinAgents = computed(() => props.agents.filter(a => a.builtin && !CREATION_CENTER_ENGLISH_NAMES.has(a.englishName || a.english_name || '')))

const filteredCustom = computed(() => {
  if (!searchQuery.value) return customAgents.value
  const q = searchQuery.value.toLowerCase()
  return customAgents.value.filter(a => a.name.toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q))
})

const filteredBuiltin = computed(() => {
  if (!searchQuery.value) return builtinAgents.value
  const q = searchQuery.value.toLowerCase()
  return builtinAgents.value.filter(a => a.name.toLowerCase().includes(q) || (a.desc || '').toLowerCase().includes(q))
})
</script>

<template>
  <div class="rounded-lg overflow-hidden"
    :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
    <!-- Header + Search -->
    <div class="px-3 pt-3 pb-2">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">选择 Agent</span>
        <button @click="emit('close')" class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i class="ri-close-line text-[12px]" />
        </button>
      </div>
      <div class="relative">
        <i class="ri-search-line absolute left-2.5 top-[9px] text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="searchQuery" type="text" placeholder="搜索 Agent..."
          class="w-full h-[30px] rounded-lg pl-7 pr-3 text-[12px] outline-none transition-colors"
          :class="isDark ? 'bg-d0 text-wt-sub placeholder-wt-dim border border-d4 focus:border-brand-400/30' : 'bg-l3 text-lt-sub placeholder-lt-aux border border-bdrF focus:border-brand-400'" />
      </div>
    </div>
    <!-- Agent List -->
    <div class="max-h-[220px] overflow-y-auto px-2 pb-2 thin-scroll">
      <!-- Custom agents -->
      <div v-if="filteredCustom.length" class="mt-1">
        <div class="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">自定义</div>
        <div v-for="a in filteredCustom" :key="a.id" @click="emit('select', a)"
          class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="selectedAgent?.id === a.id
            ? (isDark ? 'bg-agent-400/8 ring-1 ring-agent-400/20' : 'bg-agent-50 ring-1 ring-agent-100')
            : (isDark ? 'hover:bg-d3' : 'hover:bg-l4')">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'">
            <i :class="[a.icon || 'ri-sparkling-2-line', 'text-[13px]', isDark ? 'text-agent-400' : 'text-agent-500']" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ a.name }}</span>
              <span v-if="a.arch" class="text-[10px] px-1 py-0.5 rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ a.arch }}</span>
            </div>
            <p v-if="a.desc" class="text-[11px] mt-0.5 leading-snug truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.desc }}</p>
          </div>
          <i v-if="selectedAgent?.id === a.id" class="ri-check-line text-[13px] shrink-0" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
        </div>
      </div>
      <!-- Builtin agents -->
      <div v-if="filteredBuiltin.length" class="mt-1">
        <div class="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">内置</div>
        <div v-for="a in filteredBuiltin" :key="a.id" @click="emit('select', a)"
          class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="selectedAgent?.id === a.id
            ? (isDark ? 'bg-brand-400/8 ring-1 ring-brand-400/20' : 'bg-brand-50 ring-1 ring-brand-100')
            : (isDark ? 'hover:bg-d3' : 'hover:bg-l4')">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
            <i :class="[a.icon || 'ri-robot-2-line', 'text-[13px]', isDark ? 'text-brand-400' : 'text-brand-500']" />
          </div>
          <div class="flex-1 min-w-0">
            <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ a.name }}</span>
            <p v-if="a.desc" class="text-[11px] mt-0.5 leading-snug truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ a.desc }}</p>
          </div>
          <i v-if="selectedAgent?.id === a.id" class="ri-check-line text-[13px] shrink-0" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
      </div>
      <!-- Empty -->
      <div v-if="!filteredCustom.length && !filteredBuiltin.length" class="py-6 text-center">
        <i class="ri-search-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <p class="text-[12px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有找到匹配的 Agent</p>
      </div>
    </div>
  </div>
</template>
