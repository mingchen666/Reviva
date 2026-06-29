<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps({
  tool: Object,
  selected: Boolean,
  isDark: Boolean,
})

const emit = defineEmits(['toggle'])
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()

const accentHex = computed(() => settingsStore.currentAccentHex)
const accentRgb = computed(() => settingsStore.currentAccentRgb)

const catInfo = computed(() => agentsStore.TOOL_CATEGORIES.find(c => c.key === props.tool.cat) || { key: 'custom', label: '自定义', icon: 'ri-tools-line', color: '#FACC15' })
const isConfigured = computed(() => agentsStore._isConfigured(props.tool))
</script>

<template>
  <div
    class="item-row py-[7px] px-2.5 rounded-md cursor-pointer flex items-center gap-2 relative"
    :class="selected
      ? (isDark ? `bg-[rgba(${accentRgb},0.08)]` : `bg-[rgba(${accentRgb},0.05)]`)
      : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
  >
    <span v-show="selected" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :style="{ backgroundColor: accentHex }" />
    <div class="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
      <i :class="tool.icon + ' text-[14px]'" :style="'color:' + (catInfo.color || tool.color)" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] font-medium truncate"
          :style="selected ? { color: accentHex } : {}"
          :class="!selected ? (isDark ? 'text-wt-main' : 'text-lt-main') : ''">{{ tool.name }}</span>
        <span class="ctx-pill text-[9px]" :class="isDark ? (catInfo.color === '#4ADE80' ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : catInfo.color === '#38BDF8' ? 'bg-sky-400/8 text-sky-400 border border-sky-400/20' : catInfo.color === '#3B82F6' ? 'bg-blue-400/8 text-blue-400 border border-blue-400/20' : catInfo.color === '#6C8AFF' ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-amber-400/8 text-amber-400 border border-amber-400/20') : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">{{ catInfo.label }}</span>
        <span v-if="tool.runtimeDisabled" class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">暂未支持</span>
        <span v-if="tool.enabled && tool.needsConfig && !isConfigured" class="ctx-pill text-[9px]" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">需配置</span>
      </div>
      <span class="text-[10px] truncate block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ tool.desc }}</span>
    </div>
    <div class="toggle shrink-0" :class="[tool.runtimeDisabled ? (isDark ? 'off' : 'light-off') : (tool.enabled ? 'on' : (isDark ? 'off' : 'light-off')), tool.runtimeDisabled ? 'opacity-60 cursor-not-allowed' : '']" @click.stop="!tool.runtimeDisabled && emit('toggle')" />
  </div>
</template>
