<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { NOTE_AI_COMMANDS } from '@/composables/useNoteAi'

const props = defineProps({
  show: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  busy: { type: String, default: '' }, // currently running key, if any
})
const emit = defineEmits(['action'])

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const ACTIONS = [
  { key: 'polish', ...NOTE_AI_COMMANDS.polish },
  { key: 'expand', ...NOTE_AI_COMMANDS.expand },
  { key: 'shorten', ...NOTE_AI_COMMANDS.shorten },
  { key: 'translate', ...NOTE_AI_COMMANDS.translate },
  { key: 'translate-zh', ...NOTE_AI_COMMANDS['translate-zh'] },
  { key: 'explain', ...NOTE_AI_COMMANDS.explain },
]
</script>

<template>
  <Teleport to="body">
    <div v-if="show"
      class="selection-bubble fixed z-[75] rounded-lg shadow-2xl backdrop-blur-md flex items-center gap-0.5 px-1 py-1"
      :class="isDark ? 'bg-d0/98 border border-agent-400/30' : 'bg-white/98 border border-agent-500/30'"
      :style="{ left: x + 'px', top: y + 'px' }">
      <i class="ri-magic-line text-[12px] text-agent-400 ml-1 mr-0.5" />
      <div class="w-px h-5 shrink-0" :class="isDark ? 'bg-agent-400/20' : 'bg-agent-500/20'" />
      <button v-for="a in ACTIONS" :key="a.key"
        :disabled="!!busy"
        @mousedown.prevent="emit('action', a.key)"
        class="action-btn h-7 px-2 rounded-md text-[10.5px] font-medium flex items-center gap-1 transition-colors disabled:opacity-40"
        :class="busy === a.key
          ? (isDark ? 'bg-brand-400/15 text-brand-400' : 'bg-brand-50 text-brand-500')
          : (isDark ? 'text-wt-sub hover:bg-agent-400/12 hover:text-agent-400' : 'text-lt-sub hover:bg-agent-500/8 hover:text-agent-500')">
        <i v-if="busy === a.key" class="ri-loader-4-line text-[11px] animate-spin" />
        <i v-else :class="[a.icon, 'text-[11px]']" />
        {{ a.label }}
        <span class="action-tip" :class="isDark ? 'bg-d3 text-wt-main border border-bdr' : 'bg-l3 text-lt-main border border-bdrF shadow-sm'">
          {{ a.label }}
        </span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.selection-bubble {
  transform: translate(-50%, -100%);
  margin-top: -8px;
  white-space: nowrap;
}
.action-btn { position: relative }
.action-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  white-space: nowrap;
  display: none;
}
</style>
