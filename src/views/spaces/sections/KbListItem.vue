<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isReadonlyKb } from './kbFormat'

const props = defineProps({
  kb: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  scope: { type: String, default: 'mine' },
  busy: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'join', 'leave', 'rename', 'edit', 'delete'])

const rootEl = ref(null)
const menuOpen = ref(false)

const readonly = computed(() => isReadonlyKb(props.kb))
const showSystemAction = computed(() => props.scope === 'system')
const showMoreAction = computed(() => !readonly.value)
const iconName = computed(() => props.kb.isSystem ? 'ri-earth-line' : (props.kb.icon || 'ri-folder-3-line'))
const iconColor = computed(() => {
  if (props.selected) return props.kb.color || '#2563EB'
  if (props.kb.isSystem) return '#059669'
  return props.isDark ? '#8f8fa3' : '#94a3b8'
})

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function selectRow() {
  closeMenu()
  emit('select', props.kb)
}

function handleOutsidePointer(event) {
  if (!rootEl.value?.contains(event.target)) closeMenu()
}

function runMenuAction(action) {
  closeMenu()
  emit(action, props.kb)
}

watch(menuOpen, (open) => {
  if (open) document.addEventListener('pointerdown', handleOutsidePointer)
  else document.removeEventListener('pointerdown', handleOutsidePointer)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
})
</script>

<template>
  <div
    ref="rootEl"
    class="group relative mx-2 rounded-md px-4 py-2.5 cursor-pointer transition-colors flex items-center gap-2.5"
    :class="
      selected
        ? isDark
          ? 'bg-d3 text-wt-main'
          : 'bg-l3 text-lt-main'
        : isDark
          ? 'text-wt-sub hover:bg-white/5 hover:text-wt-main'
          : 'text-lt-sub hover:bg-l3 hover:text-lt-main'
    "
    @click="selectRow">
    <div
      v-if="selected"
      class="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
      :class="isDark ? 'bg-brand-400' : 'bg-blue-600'" />

    <i :class="[iconName, 'text-[16px] shrink-0']" :style="{ color: iconColor }" />

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <span
          class="text-[12.5px] font-medium truncate"
          :class="isDark ? 'text-wt-main' : 'text-lt-main'"
          :title="kb.name">
          {{ kb.name }}
        </span>
        <span
          v-if="kb.isSystem"
          class="shrink-0 px-1 py-px rounded text-[9px] font-bold leading-none uppercase border"
          :class="isDark ? 'text-wt-aux bg-white/5 border-white/8' : 'text-slate-600 bg-slate-100 border-slate-200'">
          Sys
        </span>
      </div>
    </div>

    <div class="shrink-0 flex items-center gap-1.5">
      <span class="text-[11px] tabular-nums font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ kb.docCount || 0 }}
      </span>

      <div class="w-[46px] flex justify-end">
        <button
          v-if="showSystemAction"
          class="h-6 px-2 rounded-md text-[10.5px] font-medium transition-colors"
          :disabled="busy"
          :class="
            kb.isJoined
              ? isDark
                ? 'text-wt-dim hover:text-wt-sub disabled:opacity-60'
                : 'text-lt-aux hover:text-lt-sub disabled:opacity-60'
              : isDark
                ? 'text-brand-300 bg-brand-400/10 hover:bg-brand-400/16 disabled:opacity-60'
                : 'text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60'
          "
          @click.stop="kb.isJoined ? emit('leave', kb) : emit('join', kb)">
          <i v-if="busy" class="ri-loader-4-line animate-spin text-[12px]" />
          <span v-else>{{ kb.isJoined ? '移除' : '加入' }}</span>
        </button>

        <button
          v-else-if="showMoreAction"
          class="w-6 h-6 rounded-md flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
          :class="
            menuOpen
              ? isDark
                ? 'opacity-100 bg-white/10 text-wt-sub'
                : 'opacity-100 bg-slate-100 text-slate-700'
              : isDark
                ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
          "
          title="更多操作"
          type="button"
          @click.stop="toggleMenu">
          <i class="ri-more-2-fill text-[14px]" />
        </button>
      </div>
    </div>

    <div
      v-if="menuOpen"
      class="absolute right-3 top-[34px] z-20 w-[116px] rounded-lg border py-1 shadow-lg"
      :class="isDark ? 'bg-d3 border-d4 shadow-black/30' : 'bg-white border-slate-200 shadow-slate-200/80'">
      <button
        class="w-full h-8 px-3 text-left text-[12px] flex items-center gap-2 transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'"
        type="button"
        @click.stop="runMenuAction('rename')">
        <i class="ri-edit-2-line text-[13px]" />
        重命名
      </button>
      <button
        class="w-full h-8 px-3 text-left text-[12px] flex items-center gap-2 transition-colors"
        :class="isDark ? 'text-wt-sub hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'"
        type="button"
        @click.stop="runMenuAction('edit')">
        <i class="ri-settings-3-line text-[13px]" />
        编辑
      </button>
      <div class="my-1 h-px" :class="isDark ? 'bg-d4' : 'bg-slate-100'" />
      <button
        class="w-full h-8 px-3 text-left text-[12px] flex items-center gap-2 transition-colors"
        :class="isDark ? 'text-red-300 hover:bg-red-400/10' : 'text-red-600 hover:bg-red-50'"
        type="button"
        @click.stop="runMenuAction('delete')">
        <i class="ri-delete-bin-line text-[13px]" />
        删除
      </button>
    </div>
  </div>
</template>
