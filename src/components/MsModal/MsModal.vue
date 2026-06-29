<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  width: { type: Number, default: 560 },
  closable: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  maxHeight: { type: String, default: '85vh' },
})

const emit = defineEmits(['update:show', 'close', 'afterEnter', 'afterLeave'])

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const windowWidth = ref(window.innerWidth)

function close() {
  visible.value = false
  emit('close')
}

function onOverlayClick() {
  if (props.closeOnOverlay) close()
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.show && props.closable) close()
}

function onResize() {
  windowWidth.value = window.innerWidth
}

watch(() => props.show, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeydown)
  } else {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown)
  }
})

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
})

const responsiveWidth = computed(() => {
  return windowWidth.value < 640 ? 'calc(100vw - 32px)' : props.width + 'px'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ms-modal" @after-enter="emit('afterEnter')" @after-leave="emit('afterLeave')">
      <div
        v-if="show"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
        :class="isDark ? 'theme-dark' : 'theme-light'"
      >
        <div class="ms-modal-overlay absolute inset-0 bg-black/55 backdrop-blur-[3px]" @click="onOverlayClick" />
        <div
          class="ms-modal-card relative rounded-xl overflow-hidden w-full flex flex-col"
          :class="isDark
            ? 'bg-d3 border border-bdr shadow-2xl shadow-black/60'
            : 'bg-l1 border border-bdrL shadow-2xl shadow-black/15'"
          :style="{ maxWidth: responsiveWidth, maxHeight: maxHeight }"
        >
          <!-- Header -->
          <div class="shrink-0 flex items-center justify-between gap-3 px-5 h-12"
            :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <div class="flex-1 min-w-0">
              <slot name="header" :close="close" />
            </div>
            <button v-if="closable"
              class="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              :class="isDark ? 'text-wt-dim hover:bg-white/6 hover:text-wt-main' : 'text-lt-aux hover:bg-l3 hover:text-lt-main'"
              @click="close"
              aria-label="关闭">
              <i class="ri-close-line text-[16px]" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4 ms-modal-body">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="showFooter"
            class="shrink-0 px-5 py-3 flex justify-end items-center gap-2"
            :class="isDark ? 'border-t border-d4 bg-d4/20' : 'border-t border-bdrL bg-l3/40'">
            <slot name="footer" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ms-modal-enter-active,
.ms-modal-leave-active { transition: opacity .22s ease }
.ms-modal-enter-from,
.ms-modal-leave-to { opacity: 0 }

.ms-modal-enter-active .ms-modal-card { transition: transform .26s cubic-bezier(.16, 1, .3, 1), opacity .22s ease }
.ms-modal-leave-active .ms-modal-card { transition: transform .18s ease-in, opacity .18s ease-in }
.ms-modal-enter-from .ms-modal-card { transform: scale(.96) translateY(8px); opacity: 0 }
.ms-modal-leave-to .ms-modal-card { transform: scale(.97) translateY(4px); opacity: 0 }

.ms-modal-enter-active .ms-modal-overlay { transition: opacity .22s ease }
.ms-modal-leave-active .ms-modal-overlay { transition: opacity .18s ease }
.ms-modal-enter-from .ms-modal-overlay,
.ms-modal-leave-to .ms-modal-overlay { opacity: 0 }

/* Subtle scrollbar for body */
.ms-modal-body::-webkit-scrollbar { width: 6px }
.ms-modal-body::-webkit-scrollbar-thumb { background: rgba(127, 127, 127, .2); border-radius: 3px }
.ms-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(127, 127, 127, .4) }
</style>
