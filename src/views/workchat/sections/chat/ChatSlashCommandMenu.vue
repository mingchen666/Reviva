<script setup>
defineProps({
  isDark: Boolean,
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  title: { type: String, default: '斜杠命令' },
  menuIcon: { type: String, default: 'ri-command-line' },
  emptyText: { type: String, default: '无匹配命令' },
  maxHeight: { type: Number, default: 280 },
})

const emit = defineEmits(['select', 'hover'])

function isRemixIcon(icon) {
  return String(icon || '').startsWith('ri-')
}
</script>

<template>
  <div
    class="rounded-lg overflow-hidden shadow-2xl"
    :class="isDark
      ? 'theme-dark bg-d2 border border-d4 shadow-black/45'
      : 'theme-light bg-white border border-bdrF shadow-black/15'">
    <div
      class="h-8 px-2.5 flex items-center gap-1.5"
      :class="isDark ? 'border-b border-d4 text-wt-main' : 'border-b border-bdrL text-lt-sub'">
      <i :class="[menuIcon, 'text-[12px]', isDark ? 'text-agent-400' : 'text-agent-500']" />
      <span class="text-[11px] font-semibold">{{ title }}</span>
    </div>

    <div class="overflow-y-auto thin-scroll p-1.5" :style="{ maxHeight: `${maxHeight}px` }">
      <button
        v-for="(item, index) in items"
        :key="`${item.type}:${item.id}`"
        type="button"
        class="w-full min-h-[48px] rounded-lg px-2.5 py-2 flex items-center gap-2 text-left transition-colors"
        :class="
          index === activeIndex
            ? (isDark ? 'bg-agent-400/12' : 'bg-agent-50')
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
              class="font-mono text-[11px] truncate"
              :class="isDark ? 'text-agent-300 font-bold' : 'text-agent-600 font-bold'">
              {{ item.label }}
            </span>
            <span class="text-[11px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ item.name }}
            </span>
          </div>
          <p
            v-if="item.description"
            class="mt-0.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-snug"
            :class="isDark ? 'text-wt-sub' : 'text-lt-aux'">
            {{ item.description }}
          </p>
        </div>
        <span
          v-if="item.typeLabel"
          class="shrink-0 rounded px-1.5 py-0.5 text-[9px]"
          :class="isDark ? 'bg-d0 text-wt-sub' : 'bg-l3 text-lt-aux'">
          {{ item.typeLabel }}
        </span>
      </button>

      <div v-if="!items.length" class="px-3 py-5 text-center text-[11px]" :class="isDark ? 'text-wt-sub' : 'text-lt-aux'">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>
