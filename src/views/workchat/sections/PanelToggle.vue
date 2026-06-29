<script setup>
const props = defineProps({
  side: { type: String, default: 'left' },
  isOpen: Boolean,
  isDark: Boolean,
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <button @click="emit('toggle')"
    class="absolute top-1/2 -translate-y-1/2 z-10 w-5 h-10 flex items-center justify-center transition-all shadow-sm backdrop-blur-sm"
    :class="[
      side === 'left' ? 'left-0 rounded-r-lg rounded-l-none' : 'right-0 rounded-l-lg rounded-r-none',
      isOpen
        ? (isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-200')
        : (isDark ? 'bg-d3/80 text-wt-aux border border-d4 hover:text-brand-400 hover:bg-brand-400/8' : 'bg-l3/80 text-lt-aux border border-bdrF hover:text-brand-500 hover:bg-brand-50')
    ]">
    <i v-if="side === 'left'" class="ri-side-bar-line text-[16px]" />
    <i v-else class="ri-layout-right-line text-[16px]" />
  </button>
</template>