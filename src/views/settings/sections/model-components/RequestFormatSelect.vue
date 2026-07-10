<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'openai' },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const menuOpen = ref(false)
const menuRef = ref(null)

const options = [
  {
    value: 'openai',
    label: 'Chat Completions',
    endpoint: '/chat/completions',
    help: '默认格式，兼容大多数 OpenAI-compatible 服务。',
  },
  {
    value: 'openai_responses',
    label: 'Responses API',
    endpoint: '/responses',
    help: '适合官方 OpenAI 或明确支持 Responses API 的网关。',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Messages',
    endpoint: '/messages',
    help: '适合 Claude 官方 API 或 Anthropic-compatible 网关。',
  },
]

const selectedOption = computed(() => options.find(item => item.value === props.modelValue) || options[0])
const warningText = computed(() => {
  if (props.modelValue === 'openai_responses') return '谨慎修改：只有 OpenAI 官方或明确支持 /responses 的网关可用；普通兼容服务通常会连接失败。'
  if (props.modelValue === 'anthropic') return '谨慎修改：只有 Claude 官方或 Anthropic Messages 兼容服务可用；OpenAI 兼容接口请保持默认 Chat 格式。'
  return '建议保持默认。只有当服务商文档要求其他格式时，再切换这里的请求格式。'
})

function closeOnOutsideClick(event) {
  if (!menuOpen.value) return
  if (menuRef.value?.contains(event.target)) return
  menuOpen.value = false
  document.removeEventListener('pointerdown', closeOnOutsideClick)
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) document.addEventListener('pointerdown', closeOnOutsideClick)
  else document.removeEventListener('pointerdown', closeOnOutsideClick)
}

function selectOption(value) {
  emit('update:modelValue', value)
  menuOpen.value = false
  document.removeEventListener('pointerdown', closeOnOutsideClick)
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsideClick)
})
</script>

<template>
  <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
    <div class="flex items-center justify-between gap-2 mb-2">
      <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">请求格式</label>
      <span class="ctx-pill font-mono text-[11px]" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
        {{ selectedOption.endpoint }}
      </span>
    </div>

    <div ref="menuRef" class="relative">
      <button
        type="button"
        class="w-full min-h-[48px] rounded-lg border px-3 py-2 text-left transition-colors flex items-center gap-3"
        :class="isDark
          ? 'bg-d0 border-bdr text-wt-sub hover:bg-d3 hover:border-brand-400/25'
          : 'bg-l1 border-bdrF text-lt-sub hover:bg-l3 hover:border-brand-200'"
        @click="toggleMenu"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[12px] font-semibold truncate">{{ selectedOption.label }}</span>
            <span class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] leading-none"
              :class="isDark ? 'bg-d2 text-brand-300 border border-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100'">
              {{ selectedOption.endpoint }}
            </span>
          </div>
          <div class="mt-1 text-[10.5px] leading-snug truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ selectedOption.help }}
          </div>
        </div>
        <i class="ri-arrow-down-s-line text-[16px] shrink-0 transition-transform"
          :class="[menuOpen ? 'rotate-180' : '', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
      </button>

      <Transition name="fade">
        <div v-if="menuOpen"
          class="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-lg border p-1.5 shadow-xl"
          :class="isDark ? 'bg-d1 border-bdr shadow-black/30' : 'bg-white border-bdrF shadow-black/10'">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="w-full rounded-md px-2.5 py-2 text-left transition-colors"
            :class="modelValue === option.value
              ? (isDark ? 'bg-brand-400/10 text-wt-main' : 'bg-brand-50 text-lt-main')
              : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3')"
            @click="selectOption(option.value)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-[12px] font-semibold truncate">{{ option.label }}</div>
                <div class="mt-1 text-[10.5px] leading-snug" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  {{ option.help }}
                </div>
              </div>
              <span class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] leading-none"
                :class="modelValue === option.value
                  ? (isDark ? 'bg-brand-400/12 text-brand-300 border border-brand-400/20' : 'bg-white text-brand-600 border border-brand-100')
                  : (isDark ? 'bg-d2 text-wt-dim border border-bdr' : 'bg-l2 text-lt-aux border border-bdrF')">
                {{ option.endpoint }}
              </span>
            </div>
          </button>
        </div>
      </Transition>
    </div>

    <div class="mt-2 rounded-lg px-2.5 py-2 grid grid-cols-[16px_1fr] gap-2"
      :class="isDark ? 'bg-amber-400/6 border border-amber-400/15' : 'bg-amber-50 border border-amber-100'">
      <span class="w-4 h-[18px] flex items-center justify-center">
        <i class="ri-alert-line text-[13px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
      </span>
      <span class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-amber-300/90' : 'text-amber-700'">
        {{ warningText }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
