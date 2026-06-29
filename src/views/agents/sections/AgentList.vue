<script setup>
defineProps({
  agent: Object,
  selected: Boolean,
  isDark: Boolean,
})
</script>

<template>
  <div
    class="item-row group py-[7px] px-2.5 rounded-md cursor-pointer flex items-center gap-2.5 relative"
    :class="selected
      ? (isDark ? 'bg-agent-400/8' : 'bg-agent-50')
      : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
  >
    <span v-show="selected" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :class="isDark ? 'bg-agent-400' : 'bg-agent-500'" />
    <div class="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
      <i :class="agent.icon + ' text-[14px]'" :style="'color:' + agent.color" />
    </div>
    <div class="flex-1 min-w-0">
      <span class="text-[12px] font-medium truncate block" :class="selected ? (isDark ? 'text-agent-400' : 'text-agent-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ agent.name }}</span>
      <div class="flex items-center gap-1 mt-[1px]">
        <span v-if="agent.builtin" class="text-[9px] px-1 py-[1px] rounded" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">内置</span>
        <span class="text-[9px] flex items-center gap-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-tools-line text-[8px]" />{{ agent.tools.length }}</span>
        <span class="text-[9px] flex items-center gap-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-flashlight-line text-[8px]" />{{ agent.skills.length }}</span>
      </div>
    </div>
  </div>
</template>
