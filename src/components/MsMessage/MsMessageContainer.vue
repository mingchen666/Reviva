<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMessage } from './useMessage'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const { messages, remove, pauseTimer, resumeTimer } = useMessage()

const windowWidth = ref(window.innerWidth)

function onResize() { windowWidth.value = window.innerWidth }

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

const accentClasses = {
  emerald: {
    bar: 'bg-emerald-400',
    bg: (dark) => dark ? 'bg-emerald-400/5' : 'bg-emerald-50/75',
    iconBg: (dark) => dark ? 'bg-emerald-400/12' : 'bg-emerald-50',
    border: (dark) => dark ? 'border-emerald-400/18' : 'border-emerald-100',
  },
  red: {
    bar: 'bg-red-400',
    bg: (dark) => dark ? 'bg-red-400/5' : 'bg-red-50/75',
    iconBg: (dark) => dark ? 'bg-red-400/12' : 'bg-red-50',
    border: (dark) => dark ? 'border-red-400/18' : 'border-red-100',
  },
  amber: {
    bar: 'bg-amber-400',
    bg: (dark) => dark ? 'bg-amber-400/10' : 'bg-amber-50/80',
    iconBg: (dark) => dark ? 'bg-amber-400/12' : 'bg-amber-50',
    border: (dark) => dark ? 'border-amber-400/18' : 'border-amber-100',
  },
  brand: {
    bar: 'bg-brand-400',
    bg: (dark) => dark ? 'bg-brand-400/5' : 'bg-brand-50/75',
    iconBg: (dark) => dark ? 'bg-brand-400/12' : 'bg-brand-50',
    border: (dark) => dark ? 'border-brand-400/18' : 'border-brand-100',
  },
}

function accentStyle(msg) {
  return accentClasses[msg.accent] || accentClasses.brand
}

function cardClasses(msg) {
  const compact = !msg.title
  return [
    compact ? 'min-h-[38px] py-1.5' : 'py-2.5',
    isDark.value
      ? ['bg-d3/96 border shadow-lg shadow-black/35', accentStyle(msg).border(true)]
      : ['bg-white/96 border shadow-lg shadow-black/8', accentStyle(msg).border(false)],
  ]
}

function iconShellClasses(msg) {
  return [
    msg.title ? 'w-7 h-7 rounded-lg self-start mt-[1px]' : 'w-6 h-6 rounded-md self-center',
    accentStyle(msg).iconBg(isDark.value),
  ]
}

const placementGroups = computed(() => {
  const centerMessages = messages.filter(msg => msg.placement !== 'top-right')
  const rightMessages = messages.filter(msg => msg.placement === 'top-right')
  return [
    {
      key: 'top-center',
      messages: centerMessages,
      transition: 'ms-msg-center',
      containerClass: 'fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2.5 items-center pointer-events-none',
      listClass: 'flex flex-col gap-2.5 items-center w-full',
      style: { width: windowWidth.value < 640 ? 'calc(100vw - 32px)' : 'min(420px, calc(100vw - 32px))' },
    },
    {
      key: 'top-right',
      messages: rightMessages,
      transition: 'ms-msg-right',
      containerClass: 'fixed top-4 right-4 z-[70] flex flex-col gap-2.5 items-end pointer-events-none',
      listClass: 'flex flex-col gap-2.5 items-end w-full',
      style: { width: windowWidth.value < 640 ? 'calc(100vw - 32px)' : '380px' },
    },
  ].filter(group => group.messages.length)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-for="group in placementGroups"
      :key="group.key"
      :class="[group.containerClass, isDark ? 'theme-dark' : 'theme-light']"
      :style="group.style">
      <TransitionGroup :name="group.transition" tag="div" :class="group.listClass">
        <div
          v-for="msg in group.messages"
          :key="msg.id"
          class="ms-msg-card pointer-events-auto w-full rounded-lg pr-2.5 pl-0 flex items-center gap-2.5 relative overflow-hidden backdrop-blur-md"
          :class="cardClasses(msg)"
          @mouseenter="pauseTimer(msg.id)"
          @mouseleave="resumeTimer(msg.id)"
        >
          <!-- Status background + accent -->
          <div class="absolute inset-0 pointer-events-none" :class="accentStyle(msg).bg(isDark)" />
          <div class="absolute left-0 top-0 bottom-0 w-[3px]" :class="accentStyle(msg).bar" />

          <!-- Icon -->
          <div class="relative ml-3 shrink-0 flex items-center justify-center"
            :class="iconShellClasses(msg)">
            <i :class="[msg.icon, msg.iconColor, msg.title ? 'text-[15px]' : 'text-[14px]']" />
          </div>

          <!-- Content -->
          <div class="relative flex-1 min-w-0">
            <div v-if="msg.title" class="text-[12px] font-semibold mb-0.5 leading-tight"
              :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ msg.title }}</div>
            <div class="text-[11.5px] break-words"
              :class="[msg.title ? 'leading-relaxed' : 'leading-tight', isDark ? (msg.title ? 'text-wt-sub' : 'text-wt-main') : (msg.title ? 'text-lt-sub' : 'text-lt-main')]">{{ msg.content }}</div>
          </div>

          <!-- Close -->
          <button v-if="msg.closable"
            class="relative shrink-0 rounded-md flex items-center justify-center transition-colors"
            :class="[
              isDark ? 'text-wt-dim hover:bg-white/6 hover:text-wt-main' : 'text-lt-aux hover:bg-l3 hover:text-lt-main',
              msg.title ? 'w-6 h-6 self-start mt-[1px]' : 'w-5 h-5 self-center'
            ]"
            @click="remove(msg.id)"
            aria-label="关闭">
            <i class="ri-close-line" :class="msg.title ? 'text-[13px]' : 'text-[12px]'" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.ms-msg-center-enter-active,
.ms-msg-right-enter-active { transition: all .32s cubic-bezier(.16, 1, .3, 1) }
.ms-msg-center-leave-active,
.ms-msg-right-leave-active { transition: all .24s ease-in; position: absolute }
.ms-msg-center-leave-active { left: 0; right: 0 }
.ms-msg-right-leave-active { right: 0 }
.ms-msg-center-move,
.ms-msg-right-move { transition: transform .3s ease }
.ms-msg-center-enter-from { opacity: 0; transform: translateY(-12px) scale(.98) }
.ms-msg-center-leave-to { opacity: 0; transform: translateY(-10px) scale(.98) }
.ms-msg-right-enter-from { opacity: 0; transform: translateX(40px) scale(.95) }
.ms-msg-right-leave-to { opacity: 0; transform: translateX(40px) scale(.96) }
</style>
