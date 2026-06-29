<script setup>
defineProps({
  status: { type: String, default: '' },
  isDark: Boolean,
  size: { type: String, default: 'sm' },
})
</script>

<template>
  <span v-if="status === 'ready'" class="px-1.5 py-[2px] rounded shrink-0"
    :class="[isDark ? 'bg-emerald-400/8 text-emerald-400' : 'bg-emerald-50 text-emerald-600', size === 'sm' ? 'text-[9px]' : 'text-[10px]']">
    <i class="ri-check-line" :class="size === 'sm' ? 'text-[8px]' : 'text-[9px]'" /> 就绪
  </span>
  <span v-if="status === 'partial'" class="px-1.5 py-[2px] rounded shrink-0"
    :class="[isDark ? 'bg-amber-400/8 text-amber-400' : 'bg-amber-50 text-amber-600', size === 'sm' ? 'text-[9px]' : 'text-[10px]']">
    <i class="ri-alert-line" :class="size === 'sm' ? 'text-[8px]' : 'text-[9px]'" /> 部分就绪
  </span>
  <span v-if="status === 'not_ready'" class="px-1.5 py-[2px] rounded shrink-0"
    :class="[isDark ? 'bg-red-400/8 text-red-400' : 'bg-red-50 text-red-600', size === 'sm' ? 'text-[9px]' : 'text-[10px]']">
    <i class="ri-close-line" :class="size === 'sm' ? 'text-[8px]' : 'text-[9px]'" /> 未就绪
  </span>
  <span v-if="status === 'checking'" class="px-1.5 py-[2px] rounded shrink-0"
    :class="[isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500', size === 'sm' ? 'text-[9px]' : 'text-[10px]']">
    <i class="ri-loader-4-line animate-spin" :class="size === 'sm' ? 'text-[8px]' : 'text-[9px]'" /> 检查中
  </span>
</template>