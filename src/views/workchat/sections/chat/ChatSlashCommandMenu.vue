<script setup>
defineProps({
  isDark: Boolean,
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['select', 'hover'])

function isRemixIcon(icon) {
  return String(icon || '').startsWith('ri-')
}
</script>

<template>
  <div
    class="rounded-lg overflow-hidden shadow-2xl"
    :class="isDark ? 'bg-d2 border border-d4 shadow-black/45' : 'bg-white border border-bdrF shadow-black/15'">
    <div
      class="h-8 px-2.5 flex items-center gap-1.5"
      :class="isDark ? 'border-b border-d4 text-wt-sub' : 'border-b border-bdrL text-lt-sub'">
      <i class="ri-command-line text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="text-[11px] font-semibold">斜杠命令</span>
    </div>

    <div class="max-h-[280px] overflow-y-auto thin-scroll p-1.5">
      <button
        v-for="(item, index) in items"
        :key="`${item.type}:${item.id}`"
        type="button"
        class="w-full min-h-[48px] rounded-lg px-2.5 py-2 flex items-center gap-2 text-left transition-colors"
        :class="
          index === activeIndex
            ? isDark
              ? 'bg-agent-400/12'
              : 'bg-agent-50'
            : isDark
              ? 'hover:bg-white/5'
              : 'hover:bg-l3'
        "
        @mouseenter="emit('hover', index)"
        @mousedown.prevent="emit('select', item)">
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[15px]"
          :class="isDark ? 'bg-agent-400/10 text-agent-400' : 'bg-agent-50 text-agent-500'">
          <span v-if="item.icon && !isRemixIcon(item.icon)" class="text-[14px]">{{ item.icon }}</span>
          <i v-else :class="item.icon || 'ri-magic-line'" :style="item.color ? { color: item.color } : {}" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="font-mono text-[11px] font-semibold truncate"
              :class="isDark ? 'text-agent-300' : 'text-agent-600'">
              {{ item.label }}
            </span>
            <span class="text-[11px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ item.name }}
            </span>
          </div>
          <p
            v-if="item.description"
            class="mt-0.5 text-[10px] leading-snug truncate"
            :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ item.description }}
          </p>
        </div>
        <span
          v-if="item.typeLabel"
          class="shrink-0 rounded px-1.5 py-0.5 text-[9px]"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">
          {{ item.typeLabel }}
        </span>
      </button>

      <div v-if="!items.length" class="px-3 py-5 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        无匹配命令
      </div>
    </div>
  </div>
</template>
