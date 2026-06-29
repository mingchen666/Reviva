<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: null },
  options: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  placeholder: { type: String, default: '请选择' },
  size: { type: String, default: 'compact' },
  defaultAccent: { type: String, default: 'brand' },
  disabled: { type: Boolean, default: false },
  triggerClass: { type: [String, Array, Object], default: '' },
  menuClass: { type: [String, Array, Object], default: '' },
  optionClass: { type: [String, Array, Object], default: '' },
  selectedOptionClass: { type: [String, Array, Object], default: '' },
  inactiveOptionClass: { type: [String, Array, Object], default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const ACCENTS = {
  brand: {
    focus: { dark: 'focus-visible:border-brand-400/45 focus-visible:ring-brand-400/15', light: 'focus-visible:border-brand-400 focus-visible:ring-brand-100' },
    selected: { dark: 'bg-brand-400/10 text-brand-400', light: 'bg-brand-50 text-brand-600' },
    icon: { dark: 'bg-brand-400/12 text-brand-400', light: 'bg-brand-100 text-brand-600' },
    badge: { dark: 'bg-brand-400/8 text-brand-400 border-brand-400/20', light: 'bg-brand-50 text-brand-600 border-brand-100' },
  },
  sky: {
    focus: { dark: 'focus-visible:border-sky-400/45 focus-visible:ring-sky-400/15', light: 'focus-visible:border-sky-400 focus-visible:ring-sky-100' },
    selected: { dark: 'bg-sky-400/10 text-sky-400', light: 'bg-sky-50 text-sky-600' },
    icon: { dark: 'bg-sky-400/12 text-sky-400', light: 'bg-sky-100 text-sky-600' },
    badge: { dark: 'bg-sky-400/8 text-sky-400 border-sky-400/20', light: 'bg-sky-50 text-sky-600 border-sky-100' },
  },
  emerald: {
    focus: { dark: 'focus-visible:border-emerald-400/45 focus-visible:ring-emerald-400/15', light: 'focus-visible:border-emerald-400 focus-visible:ring-emerald-100' },
    selected: { dark: 'bg-emerald-400/10 text-emerald-400', light: 'bg-emerald-50 text-emerald-600' },
    icon: { dark: 'bg-emerald-400/12 text-emerald-400', light: 'bg-emerald-100 text-emerald-600' },
    badge: { dark: 'bg-emerald-400/8 text-emerald-400 border-emerald-400/20', light: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  },
  amber: {
    focus: { dark: 'focus-visible:border-amber-400/45 focus-visible:ring-amber-400/15', light: 'focus-visible:border-amber-400 focus-visible:ring-amber-100' },
    selected: { dark: 'bg-amber-400/10 text-amber-400', light: 'bg-amber-50 text-amber-600' },
    icon: { dark: 'bg-amber-400/12 text-amber-400', light: 'bg-amber-100 text-amber-600' },
    badge: { dark: 'bg-amber-400/8 text-amber-400 border-amber-400/20', light: 'bg-amber-50 text-amber-600 border-amber-100' },
  },
}

const rootRef = ref(null)
const open = ref(false)
const activeIndex = ref(-1)

const enabledOptions = computed(() => props.options.filter(option => !option.disabled))
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue) || null)
const modeKey = computed(() => (props.isDark ? 'dark' : 'light'))
const triggerAccent = computed(() => accentFor(selectedOption.value))

function accentFor(option) {
  return ACCENTS[option?.accent] || ACCENTS[props.defaultAccent] || ACCENTS.brand
}

function isSelected(option) {
  return option?.value === props.modelValue
}

function openMenu() {
  if (props.disabled) return
  open.value = true
  const selectedIndex = props.options.findIndex(option => isSelected(option))
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

function moveActive(step) {
  if (!open.value) {
    openMenu()
    return
  }
  if (!enabledOptions.value.length) return
  let index = activeIndex.value
  for (let i = 0; i < props.options.length; i += 1) {
    index = (index + step + props.options.length) % props.options.length
    if (!props.options[index]?.disabled) {
      activeIndex.value = index
      return
    }
  }
}

function handleTriggerKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (open.value && props.options[activeIndex.value]) selectOption(props.options[activeIndex.value])
    else openMenu()
  } else if (event.key === 'Escape') {
    closeMenu()
  }
}

function handleDocumentPointerDown(event) {
  if (!rootRef.value?.contains(event.target)) closeMenu()
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') closeMenu()
}

watch(open, (value) => {
  if (typeof document === 'undefined') return
  if (value) {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeydown)
  } else {
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

function triggerClasses() {
  return [
    'w-full rounded-lg border border-solid text-left outline-none transition-all focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
    'flex items-center gap-2.5',
    props.size === 'comfortable' ? 'min-h-[52px] px-3 py-2.5' : 'min-h-[36px] px-3 py-2',
    props.isDark ? 'bg-d0 border-d4 text-wt-sub hover:border-d3' : 'bg-white border-bdrF text-lt-sub hover:border-lt-aux/30',
    triggerAccent.value.focus[modeKey.value],
    open.value ? (props.isDark ? 'border-d3 shadow-lg shadow-black/10' : 'border-lt-aux/30 shadow-lg shadow-black/5') : '',
    props.triggerClass,
  ]
}

function optionClasses(option, index) {
  const selected = isSelected(option)
  const active = index === activeIndex.value
  const accent = accentFor(option)
  return [
    'w-full rounded-md px-2.5 items-center justify-center py-2 text-left transition-colors outline-none',
    'flex items-start gap-2.5 disabled:cursor-not-allowed disabled:opacity-50',
    selected
      ? accent.selected[modeKey.value]
      : active
        ? (props.isDark ? 'bg-d2 text-wt-sub' : 'bg-l2 text-lt-sub')
        : (props.isDark ? 'text-wt-sub hover:bg-d2' : 'text-lt-sub hover:bg-l2'),
    props.optionClass,
    selected ? props.selectedOptionClass : props.inactiveOptionClass,
    option?.class,
    selected ? option?.activeClass : option?.inactiveClass,
  ]
}

function iconClasses(option) {
  const accent = accentFor(option)
  if (isSelected(option)) return [accent.icon[modeKey.value], option?.iconShellClass]
  return [
    props.isDark ? 'bg-d2 text-wt-dim' : 'bg-l2 text-lt-aux',
    option?.iconShellClass,
  ]
}

function badgeClasses(option) {
  const accent = accentFor(option)
  if (isSelected(option)) return [accent.badge[modeKey.value], option?.badgeClass]
  return [
    props.isDark ? 'bg-d2 text-wt-dim border-bdr' : 'bg-l2 text-lt-aux border-bdrF',
    option?.badgeClass,
  ]
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      role="combobox"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :disabled="disabled"
      :class="triggerClasses()"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <span
        v-if="selectedOption?.icon"
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
        :class="iconClasses(selectedOption)"
      >
        <i :class="[selectedOption.icon, 'text-[16px]', selectedOption.iconClass]" />
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex min-w-0 items-center gap-1.5">
          <span class="truncate text-[13px] font-semibold">
            {{ selectedOption?.label || placeholder }}
          </span>
          <span
            v-if="selectedOption?.badge"
            class="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"
            :class="badgeClasses(selectedOption)"
          >
            {{ selectedOption.badge }}
          </span>
        </span>
        <span
          v-if="selectedOption?.description"
          class="option-selector__description mt-0.5 block text-[9px] leading-tight"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
        >
          {{ selectedOption.description }}
        </span>
      </span>

      <i
        class="ri-arrow-down-s-line shrink-0 text-[18px] transition-transform"
        :class="[open ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']"
      />
    </button>

    <Transition name="option-selector-menu">
      <div
        v-if="open"
        role="listbox"
        class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg border p-1.5 shadow-xl"
        :class="[
          isDark ? 'bg-d1 border-d4 shadow-black/25' : 'bg-white border-bdrF shadow-black/10',
          menuClass,
        ]"
      >
        <button
          v-for="(option, index) in options"
          :key="String(option.value)"
          type="button"
          role="option"
          :aria-selected="isSelected(option)"
          :disabled="option.disabled"
          :class="optionClasses(option, index)"
          :style="[option.style, isSelected(option) ? option.selectedStyle : option.inactiveStyle]"
          @click="selectOption(option)"
          @mouseenter="activeIndex = index"
        >
          <span
            v-if="option.icon"
            class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
            :class="iconClasses(option)"
          >
            <i :class="[option.icon, 'text-[13px]', option.iconClass]" />
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="truncate text-[13px] font-semibold">{{ option.label }}</span>
              <span
                v-if="option.badge"
                class="shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"
                :class="badgeClasses(option)"
              >
                {{ option.badge }}
              </span>
            </span>
            <span
              v-if="option.description"
              class="option-selector__description mt-0.5 block text-[9px] leading-tight"
              :class="isSelected(option) ? '' : (isDark ? 'text-wt-dim' : 'text-lt-aux')"
            >
              {{ option.description }}
            </span>
          </span>

          <i
            v-if="isSelected(option)"
            class="ri-check-line mt-1 shrink-0 text-[12px]"
          />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.option-selector__description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.option-selector-menu-enter-active,
.option-selector-menu-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.option-selector-menu-enter-from,
.option-selector-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
