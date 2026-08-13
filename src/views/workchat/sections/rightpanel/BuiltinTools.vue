<script setup>
import { computed } from 'vue'
import { resolveCreationTools } from '@/config/creationTools'
import { useSettingsStore } from '@/stores/settings'
import colorMap from './colorMap'

defineProps({ isDark: Boolean })
const emit = defineEmits(['tool-action'])
const settingsStore = useSettingsStore()
const builtinTools = computed(() => resolveCreationTools(settingsStore.creationToolPreferences))
</script>

<template>
  <div class="shrink-0 px-2 pt-1" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
    <div class="flex items-center gap-2 mb-2.5">
      <i class="ri-wrench-line text-[14px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="text-[12.5px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">创作工具</span>
    </div>
    <div class="grid grid-cols-4 gap-1.5">
      <button
        v-for="t in builtinTools"
        :key="t.id"
        @click="emit('tool-action', t)"
        class="relative flex flex-col items-center justify-center p-1 rounded-xl transition-all group"
        :class="
          isDark
            ? 'border border-transparent hover:border-brand-400/20 hover:bg-brand-400/6'
            : 'border border-transparent hover:border-brand-200 hover:bg-brand-50/50'
        ">
        <div
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[17px] mb-1 transition-transform group-hover:scale-110"
          :class="
            isDark
              ? colorMap[t.color].bg + ' ' + colorMap[t.color].text
              : colorMap[t.color].lightBg + ' ' + colorMap[t.color].lightText
          ">
          <i :class="t.icon" />
        </div>
        <span
          class="text-[11.5px] font-medium"
          :class="isDark ? 'text-wt-aux group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'">
          {{ t.name }}
        </span>
        <!-- 内置 badge — absolute top-right -->
        <span
          class="absolute top-1 right-1 text-[10px] px-1 rounded"
          :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">
          内置
        </span>
      </button>
    </div>
  </div>
</template>
