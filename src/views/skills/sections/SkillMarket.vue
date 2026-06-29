<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'

const agentsStore = useAgentsStore()

defineProps({ isDark: Boolean })

const platformSkills = computed(() => agentsStore.platformSkills)
const categories = computed(() => {
  const cats = new Set(platformSkills.value.map(s => s.category).filter(Boolean))
  return [...cats]
})

const activeCat = defineModel('activeCat', { default: '全部' })

const filtered = computed(() => {
  if (activeCat.value === '全部') return platformSkills.value
  return platformSkills.value.filter(s => s.category === activeCat.value)
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="h-10 flex items-center px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-shield-star-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">内置 Skills</span>
        <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">· 跟随应用，默认启用</span>
      </div>
    </div>

    <!-- Category tabs -->
    <div v-if="categories.length" class="px-5 py-2 flex gap-1.5 overflow-x-auto shrink-0">
      <button @click="activeCat = '全部'" class="ctx-pill cursor-pointer transition-colors"
        :class="activeCat === '全部' ? (isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20' : 'text-brand-500 bg-brand-50 border border-brand-200') : (isDark ? 'text-wt-aux bg-d0 border border-bdr hover:border-brand-400/20' : 'text-lt-aux bg-l2 border border-bdrF hover:border-brand-200')">
        全部
      </button>
      <button v-for="cat in categories" :key="cat" @click="activeCat = cat" class="ctx-pill cursor-pointer transition-colors"
        :class="activeCat === cat ? (isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20' : 'text-brand-500 bg-brand-50 border border-brand-200') : (isDark ? 'text-wt-aux bg-d0 border border-bdr hover:border-brand-400/20' : 'text-lt-aux bg-l2 border border-bdrF hover:border-brand-200')">
        {{ cat }}
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="!platformSkills.length" class="flex-1 flex items-center justify-center px-8">
      <div class="text-center max-w-md">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <i class="ri-inbox-line text-[26px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        </div>
        <p class="text-[13px] mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">尚未安装内置 Skills</p>
        <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">把 skill 文件夹放入 <code class="px-1 rounded" :class="isDark ? 'bg-d3 text-brand-400' : 'bg-l3 text-brand-500'">electron/builtin-assets/skills/</code> 后重启应用即可。</p>
      </div>
    </div>

    <!-- Grid -->
    <div v-else class="flex-1 overflow-y-auto px-5 py-3">
      <div class="grid grid-cols-2 gap-3 max-w-5xl mx-auto">
        <div v-for="skill in filtered" :key="skill.id"
          class="rounded-xl p-4 transition-all cursor-default group"
          :class="isDark ? 'bg-d3 border border-bdr hover:border-brand-400/30' : 'bg-l3 border border-bdrF hover:border-brand-200'">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
              <span v-if="skill.icon && !skill.icon.startsWith('ri-')" class="text-[18px]">{{ skill.icon }}</span>
              <i v-else :class="skill.icon + ' text-[18px]'" :style="'color:' + skill.color" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ skill.name }}</span>
                <span v-if="skill.category" class="ctx-pill text-[9px]" :class="isDark ? 'bg-agent-400/8 text-agent-400 border border-agent-400/20' : 'bg-agent-50 text-agent-500 border border-agent-100'">{{ skill.category }}</span>
              </div>
              <p class="text-[11px] leading-relaxed mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ skill.desc }}</p>
              <div v-if="skill.allowedTools?.length" class="flex items-center gap-2">
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">工具: {{ skill.allowedTools.join(', ') }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end mt-3 gap-2">
            <span class="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg"
              :class="isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'">
              <i class="ri-shield-check-line text-[11px]" /> 内置 · 默认启用
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
