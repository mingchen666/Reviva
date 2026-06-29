<script setup>
defineProps({
  file: Object,
  selected: Boolean,
  isDark: Boolean,
  extInfo: Object,
  timeStr: String,
  agentLabel: { type: String, default: '' },
})

const emit = defineEmits(['select'])
</script>

<template>
  <div
    class="list-item rounded-lg px-2.5 py-2 mb-0.5 cursor-pointer"
    :class="selected
      ? (isDark ? 'bg-brand-400/8 border border-brand-400/20' : 'bg-brand-50 border border-brand-100')
      : (isDark ? 'border border-transparent hover:bg-white/3' : 'border border-transparent hover:bg-l4')"
    @click="emit('select')">
    <div class="flex items-center gap-2.5">
      <i :class="`${extInfo.icon} text-[14px] shrink-0`" :style="`color:${extInfo.color}`" />
      <div class="flex-1 min-w-0">
        <div
          class="text-[12px] font-medium truncate"
          :class="selected ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')"
        >{{ file.name }}</div>
        <div class="flex items-center gap-1.5 text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <span>{{ extInfo.label }}</span>
          <span>&middot;</span>
          <span>{{ timeStr }}</span>
          <template v-if="agentLabel">
            <span>&middot;</span>
            <span class="flex items-center gap-0.5"><i class="ri-sparkling-line text-[9px] text-agent-400" />{{ agentLabel }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-item { transition: all .15s ease }
</style>
