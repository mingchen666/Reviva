<script setup>
defineProps({
  item: Object,
  isDark: Boolean,
  depth: Number,
  expanded: Boolean,
  selectedPath: String,
})

const emit = defineEmits(['toggle-dir', 'select-file'])
</script>

<template>
  <!-- Folder row: icon + name -->
  <div v-if="item.isDirectory">
    <button @click="emit('toggle-dir', item.path)"
      class="w-full flex items-center gap-1 py-[6px] text-[12px] text-left transition-colors rounded-md"
      :style="{ paddingLeft: (depth * 10 + 6) + 'px' }"
      :class="isDark ? 'text-wt-sub hover:bg-white/4 hover:text-wt-main' : 'text-lt-sub hover:bg-l4 hover:text-lt-main'">
      <i :class="[expanded ? 'ri-folder-open-line' : 'ri-folder-line', 'text-[13px]', isDark ? 'text-brand-400/60' : 'text-brand-500/60']" />
      <span class="truncate">{{ item.name }}</span>
    </button>
    <!-- Children -->
    <div v-if="expanded && item.children">
      <TreeItem v-for="child in item.children" :key="child.path"
        :item="child" :is-dark="isDark" :depth="depth + 1"
        :expanded="expanded"
        :selected-path="selectedPath"
        @toggle-dir="(p) => emit('toggle-dir', p)"
        @select-file="(p, v) => emit('select-file', p, v)" />
    </div>
  </div>

  <!-- Previewable file row: just name, no icon -->
  <button v-else-if="item.previewable"
    @click="emit('select-file', item.path, true)"
    class="w-full flex items-center py-[5px] text-[12px] text-left transition-colors rounded-md"
    :style="{ paddingLeft: (depth * 10 + 22) + 'px' }"
    :class="selectedPath === item.path
      ? (isDark ? 'bg-brand-400/8 text-brand-400 font-medium' : 'bg-brand-50 text-brand-500 font-medium')
      : (isDark ? 'text-wt-dim hover:bg-white/4 hover:text-wt-sub' : 'text-lt-aux hover:bg-l4 hover:text-lt-sub')">
    <span class="truncate">{{ item.name }}</span>
  </button>

  <!-- Non-previewable file row: dimmed -->
  <div v-else
    class="w-full flex items-center py-[5px] text-[12px] text-left"
    :style="{ paddingLeft: (depth * 10 + 22) + 'px' }"
    :class="isDark ? 'text-wt-dim opacity-40' : 'text-lt-aux opacity-40'">
    <span class="truncate">{{ item.name }}</span>
    <i class="ri-lock-line text-[9px] ml-1 shrink-0 opacity-60" />
  </div>
</template>