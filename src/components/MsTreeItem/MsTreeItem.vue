<script setup>
/**
 * MsTreeItem — Reusable tree item row for any hierarchical list.
 * Follows Reviva "Structured Warmth" design: guide lines, active indicator,
 * dark/light themes, consistent spacing.
 *
 * Props:
 *   label      — display text
 *   icon       — Remix icon class (e.g. 'ri-folder-3-line')
 *   iconColor  — color class or style string
 *   badge      — optional count/label on the right
 *   active     — whether this item is selected
 *   level      — depth in tree (0 = root child)
 *   isDark     — dark/light theme
 *   hasArrow   — show expand/collapse arrow
 *   expanded   — arrow direction (down if expanded)
 *   isFolder   — affects guide line & indent offset
 *
 * Emits: click, arrow-click, contextmenu
 */
const props = defineProps({
  label: { type: String, default: '' },
  icon: { type: String, default: 'ri-file-line' },
  iconColor: { type: String, default: '' },
  badge: { type: [String, Number], default: '' },
  active: { type: Boolean, default: false },
  level: { type: Number, default: 0 },
  isDark: { type: Boolean, default: true },
  hasArrow: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  isFolder: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'arrow-click', 'contextmenu'])

const indentPx = computed(() => props.level * 20 + 8)

function onRowClick(e) { emit('click', e) }
function onArrowClick(e) { e.stopPropagation(); emit('arrow-click', e) }
function onContextMenu(e) { e.preventDefault(); e.stopPropagation(); emit('contextmenu', e) }

import { computed } from 'vue'
</script>

<template>
  <div
    @click="onRowClick"
    @contextmenu="onContextMenu"
    class="ms-tree-row flex items-center cursor-pointer transition-colors relative select-none"
    :class="active
      ? (isDark ? 'bg-white/6' : 'bg-l3')
      : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')"
    :style="{ paddingLeft: indentPx + 'px' }">
    <!-- Active indicator bar -->
    <div v-show="active" class="absolute left-0 top-0 bottom-0 w-[2px] rounded-r bg-brand-400" />
    <!-- Guide lines at each parent level (skip for level 1 — single-level nesting) -->
    <template v-for="i in level" :key="i">
      <div v-if="i > 1" class="absolute top-0 bottom-0 w-px opacity-30"
        :class="isDark ? 'bg-wt-aux' : 'bg-lt-aux'"
        :style="{ left: (i - 1) * 20 + 8 + 18 + 'px' }" />
    </template>
    <!-- Expand arrow -->
    <div v-if="hasArrow" class="ms-tree-arrow shrink-0 w-[18px] h-[22px] flex items-center justify-center" @click="onArrowClick">
     <i 
  :class="[
    expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line',
    'text-[16px] transition-transform',
    isDark ? 'text-wt-dim' : 'text-lt-aux'
  ]"
/>
    </div>
    <div v-else class="shrink-0 w-[18px]" />
    <!-- Icon -->
    <div class="shrink-0 w-[18px] h-[22px] flex items-center justify-center">
      <i :class="[icon, iconColor]" class="text-[16px]" />
    </div>
    <!-- Label -->
    <span class="truncate flex-1 ml-1"
      :class="[
        isFolder ? 'text-[12.5px] font-medium' : 'text-[12px]',
        active ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-sub' : 'text-lt-sub')
      ]">
      {{ label }}
    </span>
    <!-- Badge -->
    <span v-if="badge" class="shrink-0 text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ badge }}</span>
    <!-- Right slot -->
    <slot name="actions" />
  </div>
</template>

<style scoped>
.ms-tree-row { padding-top: 3px; padding-bottom: 3px; padding-right: 8px; border-radius: 6px }
.ms-tree-arrow { cursor: pointer }
.ms-tree-arrow:hover i { color: #6C8AFF !important }
</style>