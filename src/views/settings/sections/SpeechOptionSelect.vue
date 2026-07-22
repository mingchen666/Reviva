<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  placeholder: { type: String, default: '请选择' },
  ariaLabel: { type: String, default: '选择选项' },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'change'])
const rootRef = ref(null)
const open = ref(false)
const activeIndex = ref(-1)

const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue) || null)

function openMenu() {
  if (props.disabled) return
  open.value = true
  const selectedIndex = props.options.findIndex(option => option.value === props.modelValue && !option.disabled)
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : props.options.findIndex(option => !option.disabled)
}

function closeMenu() {
  open.value = false
  activeIndex.value = -1
}

function toggleMenu() {
  if (open.value) closeMenu()
  else openMenu()
}

function selectOption(option) {
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option)
  closeMenu()
}

function moveActive(direction) {
  if (!open.value) {
    openMenu()
    return
  }
  if (!props.options.length) return
  let nextIndex = activeIndex.value
  for (let index = 0; index < props.options.length; index += 1) {
    nextIndex = (nextIndex + direction + props.options.length) % props.options.length
    if (!props.options[nextIndex]?.disabled) {
      activeIndex.value = nextIndex
      return
    }
  }
}

function handleKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value && activeIndex.value >= 0) selectOption(props.options[activeIndex.value])
    else openMenu()
  } else if (event.key === 'Escape') {
    closeMenu()
  }
}

function handleOutsidePointer(event) {
  if (!rootRef.value?.contains(event.target)) closeMenu()
}

function handleFocusOut(event) {
  if (!rootRef.value?.contains(event.relatedTarget)) closeMenu()
}

watch(open, (value) => {
  if (typeof document === 'undefined') return
  if (value) document.addEventListener('pointerdown', handleOutsidePointer)
  else document.removeEventListener('pointerdown', handleOutsidePointer)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('pointerdown', handleOutsidePointer)
})
</script>

<template>
  <div ref="rootRef" class="speech-select" :class="[{ 'speech-select--open': open, 'speech-select--compact': compact }, isDark ? 'speech-select--dark' : 'speech-select--light']" @focusout="handleFocusOut">
    <button
      type="button"
      class="speech-select__trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="handleKeydown">
      <span class="speech-select__value">
        <strong>{{ selectedOption?.label || placeholder }}</strong>
        <small v-if="selectedOption?.description && !compact">{{ selectedOption.description }}</small>
      </span>
      <span v-if="selectedOption?.badge" class="speech-select__badge">{{ selectedOption.badge }}</span>
      <i class="ri-arrow-down-s-line speech-select__chevron" />
    </button>

    <Transition name="speech-select-menu">
      <div v-if="open" class="speech-select__menu" role="listbox" @keydown.esc.stop="closeMenu">
        <button
          v-for="(option, index) in options"
          :key="String(option.value)"
          type="button"
          class="speech-select__option"
          :class="{
            'speech-select__option--selected': option.value === modelValue,
            'speech-select__option--active': index === activeIndex,
          }"
          role="option"
          :aria-selected="option.value === modelValue"
          :disabled="option.disabled"
          @mouseenter="activeIndex = index"
          @click="selectOption(option)">
          <span class="speech-select__option-copy">
            <span>
              <strong>{{ option.label }}</strong>
              <em v-if="option.badge">{{ option.badge }}</em>
            </span>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
          <span class="speech-select__check"><i class="ri-check-line" /></span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.speech-select { position: relative; width: 100%; }
.speech-select__trigger { width: 100%; height: var(--speech-control-height, 38px); min-height: var(--speech-control-height, 38px); padding: 3px 10px 3px 12px; border: 1px solid rgba(128,140,160,.2); border-radius: 8px; display: flex; align-items: center; gap: 8px; text-align: left; color: inherit; transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease; }
.speech-select--compact .speech-select__trigger { padding-top: 3px; padding-bottom: 3px; }
.speech-select--dark .speech-select__trigger { background: rgba(255,255,255,.035); }
.speech-select--light .speech-select__trigger { background: rgba(18,28,45,.025); }
.speech-select__trigger:hover { border-color: rgba(var(--brand-rgb),.42); }
.speech-select__trigger:focus-visible, .speech-select--open .speech-select__trigger { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.11); outline: none; }
.speech-select__trigger:disabled { cursor: not-allowed; opacity: .48; }
.speech-select__value { min-width: 0; flex: 1; }
.speech-select__value strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--speech-control-font-size, .8125rem); font-weight: 650; }
.speech-select__value small { display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9.4px; line-height: 1.35; opacity: .58; }
.speech-select__badge { flex: none; padding: 2px 6px; border: 1px solid rgba(var(--brand-rgb),.2); border-radius: 999px; color: var(--brand); background: rgba(var(--brand-rgb),.08); font-size: 8.5px; font-weight: 700; }
.speech-select__chevron { flex: none; font-size: 17px; opacity: .56; transition: transform 160ms ease, color 160ms ease; }
.speech-select--open .speech-select__chevron { transform: rotate(180deg); color: var(--brand); opacity: 1; }
.speech-select__menu { position: absolute; z-index: 80; top: calc(100% + 6px); left: 0; right: 0; max-height: min(320px, 45vh); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(var(--brand-rgb),.46) rgba(128,140,160,.1); padding: 5px; border: 1px solid rgba(128,140,160,.2); border-radius: 9px; box-shadow: 0 16px 38px rgba(0,0,0,.16); }
.speech-select__menu::-webkit-scrollbar { width: 7px; }
.speech-select__menu::-webkit-scrollbar-track { margin: 5px 0; border-radius: 999px; background: rgba(128,140,160,.08); }
.speech-select__menu::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(var(--brand-rgb),.48); background-clip: padding-box; }
.speech-select__menu::-webkit-scrollbar-thumb:hover { background: var(--brand); background-clip: padding-box; }
.speech-select--dark .speech-select__menu, .speech-select--light .speech-select__menu { background: var(--bg-l2); border-color: var(--border-card); }
.speech-select__option { width: 100%; min-height: 52px; padding: 8px 9px; border-radius: 8px; display: flex; align-items: center; gap: 9px; text-align: left; color: inherit; transition: background-color 140ms ease, color 140ms ease; }
.speech-select__option--active:not(.speech-select__option--selected) { background: rgba(128,140,160,.09); }
.speech-select__option--selected { color: var(--brand); background: rgba(var(--brand-rgb),.1); }
.speech-select__option:disabled { cursor: not-allowed; opacity: .42; }
.speech-select__option-copy { min-width: 0; flex: 1; }
.speech-select__option-copy > span { display: flex; align-items: center; gap: 6px; }
.speech-select__option-copy strong { font-size: .75rem; font-weight: 680; }
.speech-select__option-copy em { padding: 1px 5px; border-radius: 999px; color: var(--brand); background: rgba(var(--brand-rgb),.1); font-size: 8px; font-style: normal; font-weight: 700; }
.speech-select__option-copy small { display: block; margin-top: 3px; font-size: 9.3px; line-height: 1.45; opacity: .62; }
.speech-select__check { width: 20px; height: 20px; flex: none; border: 1px solid rgba(128,140,160,.2); border-radius: 50%; display: grid; place-items: center; color: transparent; font-size: 11px; }
.speech-select__option--selected .speech-select__check { color: #fff; border-color: var(--brand); background: var(--brand); }
.speech-select-menu-enter-active, .speech-select-menu-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.speech-select-menu-enter-from, .speech-select-menu-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) { .speech-select__trigger, .speech-select__chevron, .speech-select__option, .speech-select-menu-enter-active, .speech-select-menu-leave-active { transition: none; } }
@media (max-width: 680px) { .speech-select__menu { max-height: min(280px, 42vh); } }
</style>
