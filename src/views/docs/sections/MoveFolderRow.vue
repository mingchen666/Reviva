<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  level: { type: Number, default: 0 },
  isDark: Boolean,
  selectedPath: String,
  expandedSet: Object,
  isDisabledFn: Function,
})

const emit = defineEmits(['select', 'toggle'])

const isExpanded = computed(() => props.expandedSet.has(props.node.path))
const hasChildren = computed(() => (props.node.children?.length || 0) > 0)
const disabled = computed(() => props.isDisabledFn?.(props.node.path) || false)
const selected = computed(() => props.selectedPath === props.node.path && !disabled.value)
const indent = computed(() => props.level * 16 + 12)

function onRowClick() {
  if (disabled.value) return
  emit('select', props.node.path)
}

function onArrowClick(e) {
  e.stopPropagation()
  emit('toggle', props.node)
}
</script>

<template>
  <div>
    <div @click="onRowClick"
      class="flex items-center gap-1 py-1.5 pr-3 cursor-pointer transition-colors group"
      :class="[
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        selected
          ? (isDark ? 'bg-brand-400/12' : 'bg-brand-50')
          : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')
      ]"
      :style="{ paddingLeft: indent + 'px' }">
      <!-- Arrow -->
      <div v-if="hasChildren" @click="onArrowClick"
        class="w-4 h-4 flex items-center justify-center rounded shrink-0 transition-colors"
        :class="isDark ? 'hover:bg-white/8' : 'hover:bg-l3'">
        <i :class="[isExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line', 'text-[10px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
      </div>
      <div v-else class="w-4 shrink-0" />

      <!-- Folder icon -->
      <i :class="[isExpanded ? 'ri-folder-open-fill' : 'ri-folder-3-fill', 'text-[14px] shrink-0', isDark ? 'text-amber-400' : 'text-amber-500']" />

      <!-- Name -->
      <span class="text-[12px] truncate flex-1"
        :class="[
          selected
            ? (isDark ? 'text-brand-400 font-semibold' : 'text-brand-500 font-semibold')
            : (isDark ? 'text-wt-sub' : 'text-lt-sub'),
        ]">{{ node.name }}</span>

      <!-- Marker -->
      <i v-if="selected" class="ri-check-line text-[12px] shrink-0"
        :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
      <span v-else-if="disabled" class="text-[9px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">不可用</span>
    </div>

    <!-- Recursive children -->
    <template v-if="isExpanded && hasChildren">
      <MoveFolderRow
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :level="level + 1"
        :is-dark="isDark"
        :selected-path="selectedPath"
        :expanded-set="expandedSet"
        :is-disabled-fn="isDisabledFn"
        @select="(p) => emit('select', p)"
        @toggle="(n) => emit('toggle', n)"
      />
    </template>
  </div>
</template>
