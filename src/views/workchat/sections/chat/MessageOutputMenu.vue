<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  isDark: Boolean,
  exporting: Boolean,
  branching: Boolean,
})

const emit = defineEmits(['open-change', 'branch', 'export-markdown', 'save-to-note'])

const triggerRef = ref(null)
const menuRef = ref(null)
const open = ref(false)
const position = ref({ left: 0, top: 0, arrowLeft: 0, placement: 'above' })
const itemRefs = []
const menuId = `message-output-${Math.random().toString(36).slice(2)}`
const enabledIndexes = [0, 1, 3]
const busy = computed(() => props.exporting || props.branching)

function setItemRef(el, index) {
  if (el) itemRefs[index] = el
}

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const width = menuRef.value?.offsetWidth || 184
  const height = menuRef.value?.offsetHeight || 174
  const gap = 6
  const margin = 8
  const left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin))
  const above = rect.top - height - gap
  const placedAbove = above >= margin
  const top = placedAbove
    ? above
    : Math.min(window.innerHeight - height - margin, rect.bottom + gap)
  const triggerCenter = rect.left + rect.width / 2
  const arrowLeft = Math.min(width - 14, Math.max(14, triggerCenter - left))
  position.value = {
    left,
    top: Math.max(margin, top),
    arrowLeft,
    placement: placedAbove ? 'above' : 'below',
  }
}

function focusItem(index = enabledIndexes[0]) {
  nextTick(() => itemRefs[index]?.focus())
}

function close({ restoreFocus = false } = {}) {
  if (!open.value) return
  open.value = false
  emit('open-change', false)
  if (restoreFocus) nextTick(() => triggerRef.value?.focus())
}

async function showMenu({ focusFirst = false } = {}) {
  if (busy.value || open.value) return
  window.dispatchEvent(new CustomEvent('workchat-message-output-menu-open', { detail: menuId }))
  open.value = true
  emit('open-change', true)
  await nextTick()
  updatePosition()
  if (focusFirst) focusItem()
}

function toggleMenu() {
  if (open.value) close()
  else showMenu({ focusFirst: true })
}

function choose(action) {
  close()
  if (action === 'branch') emit('branch')
  if (action === 'export-markdown') emit('export-markdown')
  if (action === 'save-to-note') emit('save-to-note')
}

function onDocumentPointerDown(event) {
  if (!open.value) return
  if (triggerRef.value?.contains(event.target) || menuRef.value?.contains(event.target)) return
  close()
}

function onOtherMenuOpen(event) {
  if (event.detail !== menuId) close()
}

function onViewportChange() {
  close()
}

function onTriggerKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    showMenu({ focusFirst: true })
  }
}

function onMenuKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close({ restoreFocus: true })
    return
  }
  if (event.key === 'Tab') {
    close()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const activeIndex = itemRefs.findIndex(item => item === document.activeElement)
  if (event.key === 'Home') return focusItem(enabledIndexes[0])
  if (event.key === 'End') return focusItem(enabledIndexes.at(-1))
  const enabledPosition = Math.max(0, enabledIndexes.indexOf(activeIndex))
  const delta = event.key === 'ArrowDown' ? 1 : -1
  const nextPosition = (enabledPosition + delta + enabledIndexes.length) % enabledIndexes.length
  focusItem(enabledIndexes[nextPosition])
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('workchat-message-output-menu-open', onOtherMenuOpen)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('workchat-message-output-menu-open', onOtherMenuOpen)
})
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    title="更多操作"
    aria-label="更多操作"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-busy="busy"
    :disabled="busy"
    class="h-7 px-1.5 rounded-md flex items-center gap-0.5 text-[12px] transition-colors disabled:cursor-wait"
    :class="busy
      ? (isDark ? 'text-brand-400' : 'text-brand-500')
      : (isDark ? 'text-white/65 hover:text-white hover:bg-white/6' : 'text-lt-aux hover:text-lt-main hover:bg-l4')"
    @click.stop="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <i :class="busy ? 'ri-loader-4-line animate-spin' : 'ri-menu-line'" class="text-[14px]" />
  </button>

  <Teleport to="body">
    <Transition name="message-output-menu">
      <div
        v-if="open"
        ref="menuRef"
        role="menu"
        aria-label="更多操作"
        class="fixed z-[90] w-[180px] rounded-xl border p-1.5 shadow-2xl outline-none ring-1"
        :class="isDark
          ? 'bg-d1 border-white/12 shadow-black/70 ring-brand-400/10'
          : 'bg-white border-bdrF shadow-black/18 ring-black/5'"
        :style="{ left: position.left + 'px', top: position.top + 'px' }"
        @pointerdown.stop
        @keydown="onMenuKeydown"
      >
        <div
          class="pointer-events-none absolute w-2.5 h-2.5 rotate-45"
          :class="[
            isDark ? 'bg-d1' : 'bg-white',
            position.placement === 'above'
              ? (isDark ? '-bottom-[5px] border-r border-b border-white/12' : '-bottom-[5px] border-r border-b border-bdrF')
              : (isDark ? '-top-[5px] border-l border-t border-white/12' : '-top-[5px] border-l border-t border-bdrF'),
          ]"
          :style="{ left: position.arrowLeft + 'px', transform: 'translateX(-50%) rotate(45deg)' }"
        />
        <button
          :ref="el => setItemRef(el, 0)"
          type="button"
          role="menuitem"
          class="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-[12px] font-medium text-left transition-colors"
          :class="isDark ? 'text-wt-sub hover:bg-white/6 hover:text-wt-main' : 'text-lt-sub hover:bg-l3 hover:text-lt-main'"
          @click="choose('branch')"
        >
          <i class="ri-git-branch-line text-[14px] text-violet-400" />
          <span>创建对话分支</span>
        </button>

        <div class="h-px my-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />

        <button
          :ref="el => setItemRef(el, 1)"
          type="button"
          role="menuitem"
          class="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-[12px] font-medium text-left transition-colors"
          :class="isDark ? 'text-wt-sub hover:bg-white/6 hover:text-wt-main' : 'text-lt-sub hover:bg-l3 hover:text-lt-main'"
          @click="choose('export-markdown')"
        >
          <i class="ri-markdown-line text-[14px] text-brand-400" />
          <span>导出 Markdown</span>
        </button>

        <button
          :ref="el => setItemRef(el, 2)"
          type="button"
          role="menuitem"
          disabled
          aria-disabled="true"
          class="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-[12px] text-left cursor-not-allowed"
          :class="isDark ? 'text-wt-dim/65' : 'text-lt-aux/70'"
        >
          <i class="ri-file-word-2-line text-[14px]" />
          <span>导出 Word</span>
          <span class="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
            :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l3 text-lt-aux'">即将支持</span>
        </button>

        <div class="h-px my-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />

        <button
          :ref="el => setItemRef(el, 3)"
          type="button"
          role="menuitem"
          class="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-[12px] font-medium text-left transition-colors"
          :class="isDark ? 'text-wt-sub hover:bg-white/6 hover:text-wt-main' : 'text-lt-sub hover:bg-l3 hover:text-lt-main'"
          @click="choose('save-to-note')"
        >
          <i class="ri-sticky-note-add-line text-[14px] text-emerald-400" />
          <span>保存到笔记</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.message-output-menu-enter-active,
.message-output-menu-leave-active { transition: opacity .14s ease, transform .14s ease; }
.message-output-menu-enter-from,
.message-output-menu-leave-to { opacity: 0; transform: translateY(4px) scale(.98); }
</style>
