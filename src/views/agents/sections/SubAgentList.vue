<script setup>
defineProps({
  subAgent: Object,
  selected: Boolean,
  isDark: Boolean,
})
</script>

<template>
  <div
    class="item-row py-[7px] px-2.5 rounded-md cursor-pointer flex items-center gap-2.5 relative"
    :class="selected
      ? (isDark ? 'bg-amber-400/8' : 'bg-amber-50')
      : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
  >
    <span v-show="selected" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :class="isDark ? 'bg-amber-400' : 'bg-amber-500'" />
    <div class="w-[26px] h-[26px] rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0' : 'bg-l2'">
      <i :class="subAgent.icon + ' text-[14px]'" :style="'color:' + subAgent.color" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] font-medium truncate" :class="selected ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ subAgent.name }}</span>
        <span class="ctx-pill" :class="subAgent.builtin ? (isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100') : (isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100')">{{ subAgent.builtin ? '内置' : '自定义' }}</span>
      </div>
      <span class="text-[10px] truncate block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ subAgent.desc }}</span>
    </div>
  </div>
</template>
