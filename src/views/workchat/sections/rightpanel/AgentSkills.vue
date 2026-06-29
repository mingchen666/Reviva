<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAgentsStore } from '@/stores/agents'

const props = defineProps({ isDark: Boolean, selectedAgent: Object })
const emit = defineEmits(['select-skill'])

const agentsStore = useAgentsStore()
const MAX_GRID_ITEMS = 8

const agentSkills = computed(() => {
  if (!props.selectedAgent?.skills?.length) return []
  return props.selectedAgent.skills
    .map(sid => agentsStore.allAvailableSkills.find(s => s.id === sid))
    .filter(Boolean)
})

const hasOverflow = computed(() => agentSkills.value.length > MAX_GRID_ITEMS)
const visibleSkills = computed(() => {
  if (!hasOverflow.value) return agentSkills.value
  return agentSkills.value.slice(0, MAX_GRID_ITEMS - 1)
})
const hiddenSkillCount = computed(() => Math.max(0, agentSkills.value.length - visibleSkills.value.length))
const moreOpen = ref(false)

watch(() => props.selectedAgent?.id, () => {
  moreOpen.value = false
})

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function closeMore() {
  moreOpen.value = false
}

function handleSkillClick(skill) {
  emit('select-skill', skill)
  moreOpen.value = false
}

function skillDescription(skill) {
  return skill?.desc || skill?.description || skill?.category || '暂无描述'
}

function isRemixIcon(icon) {
  return String(icon || '').startsWith('ri-')
}

function onDocumentClick(event) {
  if (!moreOpen.value) return
  const root = document.getElementById('agent-skills-panel')
  if (root?.contains(event.target)) return
  moreOpen.value = false
}

document.addEventListener('click', onDocumentClick, true)
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true))
</script>

<template>
  <div id="agent-skills-panel" class="relative shrink-0 px-2 pt-2 pb-2" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
    <div class="flex items-center gap-2 mb-2.5">
      <i class="ri-sparkling-2-line text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Agent 技能</span>
      <span v-if="selectedAgent" class="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[80px]"
        :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">{{ selectedAgent.name }}</span>
      <span v-if="agentSkills.length" class="ml-auto text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ agentSkills.length }} 个
      </span>
    </div>

    <div v-if="agentSkills.length" class="grid grid-cols-4 gap-2">
      <button v-for="s in visibleSkills" :key="s.id"
        @click="handleSkillClick(s)"
        :title="`${s.name}${skillDescription(s) ? '：' + skillDescription(s) : ''}`"
        class="flex flex-col items-center justify-center p-1.5 rounded-xl transition-all group"
        :class="isDark ? 'border border-transparent hover:border-agent-400/20 hover:bg-agent-400/6' : 'border border-transparent hover:border-agent-200 hover:bg-agent-50/50'">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-[16px] mb-0.5 transition-transform group-hover:scale-110"
          :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
          <span v-if="s.icon && !isRemixIcon(s.icon)" class="text-[15px]">{{ s.icon }}</span>
          <i v-else :class="s.icon || 'ri-magic-line'" :style="s.color ? { color: s.color } : {}" />
        </div>
        <span class="text-[10px] font-medium truncate max-w-[56px]" :class="isDark ? 'text-wt-aux group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'">{{ s.name }}</span>
      </button>

      <button v-if="hasOverflow"
        @click="toggleMore"
        class="flex flex-col items-center justify-center p-1.5 rounded-xl transition-all group"
        :class="moreOpen
          ? (isDark ? 'border border-agent-400/30 bg-agent-400/10' : 'border border-agent-200 bg-agent-50')
          : (isDark ? 'border border-transparent hover:border-agent-400/20 hover:bg-agent-400/6' : 'border border-transparent hover:border-agent-200 hover:bg-agent-50/50')">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-[16px] mb-0.5 transition-transform group-hover:scale-110"
          :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
          <i class="ri-more-line" />
        </div>
        <span class="text-[10px] font-medium truncate max-w-[56px]" :class="isDark ? 'text-wt-aux group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'">
          更多 {{ hiddenSkillCount }}
        </span>
      </button>
    </div>

    <div v-else class="py-3 text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      <i class="ri-sparkling-2-line text-[16px] mb-1" />
      <p class="text-[11px]">{{ selectedAgent ? '该 Agent 未绑定 Skills' : '选择 Agent 后查看其 Skills' }}</p>
    </div>

    <div v-if="moreOpen"
      class="absolute left-2 right-2 top-[calc(100%-6px)] z-30 rounded-xl p-2 shadow-xl"
      :class="isDark ? 'bg-d2 border border-d4 shadow-black/40' : 'bg-white border border-bdrF shadow-black/12'">
      <div class="flex items-center justify-between px-1 pb-2">
        <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">全部 Skills</span>
        <button @click="closeMore"
          class="h-5 w-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i class="ri-close-line text-[12px]" />
        </button>
      </div>
      <div class="max-h-[260px] overflow-y-auto thin-scroll space-y-1">
        <button v-for="s in agentSkills" :key="s.id"
          @click="handleSkillClick(s)"
          class="w-full rounded-lg px-2 py-2 flex items-start gap-2 text-left transition-colors"
          :class="isDark ? 'hover:bg-agent-400/8' : 'hover:bg-agent-50'">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            :class="isDark ? 'bg-agent-400/8 text-agent-400' : 'bg-agent-50 text-agent-500'">
            <span v-if="s.icon && !isRemixIcon(s.icon)" class="text-[15px]">{{ s.icon }}</span>
            <i v-else :class="s.icon || 'ri-magic-line'" :style="s.color ? { color: s.color } : {}" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-[11px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ s.name }}</span>
              <span v-if="s.category" class="ctx-pill text-[8px] shrink-0"
                :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
                {{ s.category }}
              </span>
            </div>
            <p class="skill-desc mt-0.5 text-[10px] leading-snug" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ skillDescription(s) }}
            </p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-desc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
