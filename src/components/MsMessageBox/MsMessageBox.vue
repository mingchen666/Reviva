<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  type: { type: String, default: 'confirm' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  message: { type: String, default: '' },
  variant: { type: String, default: 'info' },
  size: { type: String, default: 'small' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  closeOnOverlay: { type: Boolean, default: true },
  placeholder: { type: String, default: '' },
  value: { type: String, default: '' },
  defaultValue: { type: String, default: '' },
  validate: { type: Function, default: null },
})

const emit = defineEmits(['confirm', 'cancel'])

const visible = ref(false)
const inputValue = ref(props.defaultValue || props.value)
const inputError = ref('')
const inputRef = ref(null)
const windowWidth = ref(window.innerWidth)

const variantConfig = computed(() => {
  const map = {
    danger: {
      icon: 'ri-error-warning-fill', iconColor: 'text-red-400',
      iconBg: isDark.value ? 'bg-red-400/10' : 'bg-red-50',
      btnClass: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-400/30',
      ringClass: isDark.value ? 'focus:border-red-400/60 focus:ring-red-400/12' : 'focus:border-red-400 focus:ring-red-400/10',
    },
    warning: {
      icon: 'ri-alert-fill', iconColor: 'text-amber-400',
      iconBg: isDark.value ? 'bg-amber-400/10' : 'bg-amber-50',
      btnClass: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-400/30',
      ringClass: isDark.value ? 'focus:border-amber-400/60 focus:ring-amber-400/12' : 'focus:border-amber-400 focus:ring-amber-400/10',
    },
    info: {
      icon: 'ri-information-fill', iconColor: 'text-brand-400',
      iconBg: isDark.value ? 'bg-brand-400/10' : 'bg-brand-50',
      btnClass: 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-400/30',
      ringClass: isDark.value ? 'focus:border-brand-400/60 focus:ring-brand-400/12' : 'focus:border-brand-400 focus:ring-brand-400/10',
    },
    success: {
      icon: 'ri-checkbox-circle-fill', iconColor: 'text-emerald-400',
      iconBg: isDark.value ? 'bg-emerald-400/10' : 'bg-emerald-50',
      btnClass: 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400/30',
      ringClass: isDark.value ? 'focus:border-emerald-400/60 focus:ring-emerald-400/12' : 'focus:border-emerald-400 focus:ring-emerald-400/10',
    },
  }
  return map[props.variant] || map.info
})

const cardWidth = computed(() => {
  if (windowWidth.value < 640) return 'calc(100vw - 32px)'
  return props.size === 'medium' ? '460px' : '400px'
})

function onConfirm() {
  if (props.type === 'prompt') {
    const val = inputValue.value.trim()
    if (props.validate) {
      const result = props.validate(val)
      if (result !== true) {
        inputError.value = typeof result === 'string' ? result : '输入无效'
        return
      }
    }
    emit('confirm', val)
  } else {
    emit('confirm', true)
  }
}

function onCancel() {
  emit('cancel')
}

function onOverlayClick() {
  if (props.closeOnOverlay) onCancel()
}

function onKeydown(e) {
  if (e.key === 'Escape') onCancel()
  if (e.key === 'Enter' && props.type === 'prompt') onConfirm()
}

function onResize() { windowWidth.value = window.innerWidth }

onMounted(() => {
  visible.value = true
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
  if (props.type === 'prompt') {
    nextTick(() => {
      if (inputRef.value) inputRef.value.focus()
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ms-msgbox">
      <div
        v-if="visible"
        class="fixed inset-0 z-[80] flex items-center justify-center p-4"
        :class="isDark ? 'theme-dark' : 'theme-light'"
      >
        <div class="ms-msgbox-overlay absolute inset-0 backdrop-blur-[2px]" @click="onOverlayClick" />
        <div
          class="ms-msgbox-card relative overflow-hidden rounded-xl"
          :class="isDark
            ? 'bg-d3 border border-bdr shadow-2xl shadow-black/60'
            : 'bg-l1 border border-bdrL shadow-2xl shadow-black/15'"
          :style="{ width: cardWidth }"
        >
          <div class="px-4 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="variantConfig.iconBg">
                <i :class="[variantConfig.icon, 'text-[16px]', variantConfig.iconColor]" />
              </div>
              <div class="min-w-0 flex-1 pt-0.5">
                <p class="text-[14px] font-semibold leading-5 break-words" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ title }}</p>
                <p v-if="subtitle" class="text-[11px] mt-1 leading-4 break-words" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ subtitle }}</p>
              </div>
            </div>

            <p v-if="message" class="mt-3 text-[12px] leading-5 break-words" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ message }}</p>

            <div v-if="type === 'prompt'" class="mt-3">
              <input
                ref="inputRef"
                v-model="inputValue"
                class="w-full h-9 px-3 rounded-lg text-[12px] outline-none border transition-colors focus:ring-2"
                :class="[
                  inputError
                    ? (isDark ? 'bg-d0 border-red-400/70 text-wt-sub' : 'bg-l2 border-red-300 text-lt-sub')
                    : (isDark ? 'bg-d0 border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l2 border-bdrF text-lt-sub placeholder-lt-aux'),
                  !inputError ? variantConfig.ringClass : ''
                ]"
                :placeholder="placeholder"
                @input="inputError = ''"
              >
              <p v-if="inputError" class="text-[10px] mt-1.5 flex items-center gap-1" :class="isDark ? 'text-red-400' : 'text-red-500'">
                <i class="ri-error-warning-line text-[11px]" />{{ inputError }}
              </p>
            </div>
          </div>

          <div class="px-4 py-3 flex items-center gap-2 justify-end" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
            <button
              v-if="type !== 'alert'"
              class="h-8 min-w-[72px] px-3.5 rounded-lg text-[12px] font-medium transition-colors"
              :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0 hover:text-wt-main' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4 hover:text-lt-main'"
              @click="onCancel"
            >{{ cancelText }}</button>
            <button
              class="h-8 min-w-[72px] px-3.5 rounded-lg text-[12px] font-semibold transition-colors focus:outline-none focus:ring-2"
              :class="variantConfig.btnClass"
              @click="onConfirm"
            >{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ms-msgbox-enter-active { transition: opacity .22s ease }
.ms-msgbox-leave-active { transition: opacity .18s ease }
.ms-msgbox-enter-from,
.ms-msgbox-leave-to { opacity: 0 }

.theme-dark .ms-msgbox-overlay { background: rgba(0, 0, 0, .55) }
.theme-light .ms-msgbox-overlay { background: rgba(26, 26, 46, .18) }

.ms-msgbox-enter-active .ms-msgbox-card { transition: transform .26s cubic-bezier(.16, 1, .3, 1), opacity .22s ease }
.ms-msgbox-leave-active .ms-msgbox-card { transition: transform .18s ease-in, opacity .18s ease-in }
.ms-msgbox-enter-from .ms-msgbox-card { transform: scale(.94) translateY(6px); opacity: 0 }
.ms-msgbox-leave-to .ms-msgbox-card { transform: scale(.97); opacity: 0 }
</style>
