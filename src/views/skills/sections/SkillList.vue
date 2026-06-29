<script setup>
defineProps({
  skill: Object,
  selected: Boolean,
  isDark: Boolean,
})

function isEmoji(val) { return val && !val.startsWith('ri-') }
</script>

<template>
  <div
    class="item-row py-[7px] px-2.5 rounded-md cursor-pointer flex items-center gap-2.5 relative"
    :class="selected
      ? (isDark ? 'bg-brand-400/8' : 'bg-brand-50')
      : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
  >
    <span v-show="selected" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
    <div class="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
      <span v-if="isEmoji(skill.icon)" class="text-[14px]">{{ skill.icon }}</span>
      <i v-else :class="skill.icon + ' text-[14px]'" :style="'color:' + skill.color" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] font-medium truncate" :class="selected ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ skill.name }}</span>
        <span v-if="skill.source === 'platform'" class="ctx-pill text-[9px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">平台</span>
        <span v-else-if="!skill.builtin" class="ctx-pill text-[9px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">自定义</span>
      </div>
      <span class="text-[10px] truncate block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ skill.category || skill.desc || skill.description }}</span>
    </div>
  </div>
</template>