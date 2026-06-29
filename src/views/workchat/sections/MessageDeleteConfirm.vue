<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  isDark: Boolean,
  durationMs: { type: Number, default: 5000 },
})

const emit = defineEmits(['confirm', 'cancel'])

const remainingMs = ref(props.durationMs)
let dismissTimer = null
let countdownTimer = null

const remainingSeconds = computed(() => Math.max(0, Math.ceil(remainingMs.value / 1000)))
const progressPct = computed(() => {
  const total = Math.max(1, props.durationMs)
  return Math.max(0, Math.min(100, (remainingMs.value / total) * 100))
})

function clearTimers() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

onMounted(() => {
  const deadline = Date.now() + props.durationMs
  countdownTimer = setInterval(() => {
    remainingMs.value = Math.max(0, deadline - Date.now())
  }, 100)
  dismissTimer = setTimeout(() => {
    clearTimers()
    emit('cancel')
  }, props.durationMs)
})

onBeforeUnmount(clearTimers)

function cancel() {
  clearTimers()
  emit('cancel')
}

function confirm() {
  clearTimers()
  emit('confirm')
}
</script>

<template>
  <Transition name="confirm-slide" appear>
    <div
      class="relative overflow-hidden flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg"
      :class="isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-200'"
      role="alertdialog"
      aria-live="polite"
    >
      <div
        class="absolute left-0 bottom-0 h-[2px] transition-[width] duration-100 ease-linear"
        :class="isDark ? 'bg-red-400/70' : 'bg-red-400'"
        :style="{ width: progressPct + '%' }"
      />
      <div class="flex items-center gap-1.5 min-w-0 shrink-0">
        <i class="ri-alert-line text-[13px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
        <span class="text-[12px] font-medium" :class="isDark ? 'text-red-400' : 'text-red-600'">确认删除？</span>
      </div>
      <span class="text-[10px] tabular-nums shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ remainingSeconds }}s 后自动取消
      </span>
      <div class="ml-auto flex items-center gap-1.5 shrink-0">
        <button
          @click="confirm"
          class="h-6 px-3 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'bg-red-400/15 text-red-400 hover:bg-red-400/25' : 'bg-red-100 text-red-500 hover:bg-red-200'"
        >
          <i class="ri-check-line text-[10px]" /> 删除
        </button>
        <button
          @click="cancel"
          class="h-6 px-3 rounded-md text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
        >
          取消
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-slide-enter-active { transition: all .2s ease-out; }
.confirm-slide-leave-active { transition: all .15s ease-in; }
.confirm-slide-enter-from { opacity: 0; transform: translateY(-4px); }
.confirm-slide-leave-to { opacity: 0; transform: translateY(4px); }
</style>
