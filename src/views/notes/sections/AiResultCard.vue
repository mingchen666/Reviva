<script setup>
import { computed, ref } from 'vue'
import md from '@/utils/markdown'

let katexCssLoaded = false
function ensureKatexCss() {
  if (katexCssLoaded) return
  katexCssLoaded = true
  import('katex/dist/katex.min.css').catch(() => {})
}

const props = defineProps({
  isDark: { type: Boolean, default: false },
  actionKey: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  actionIcon: { type: String, default: 'ri-magic-line' },
  actionColor: { type: String, default: 'agent' },
  resultText: { type: String, default: '' },
  isStreaming: { type: Boolean, default: false },
  isError: { type: Boolean, default: false },
  errorMsg: { type: String, default: '' },
  floatingStyle: { type: Object, default: () => ({}) },
  useFixed: { type: Boolean, default: false },
})

const emit = defineEmits(['apply', 'copy', 'dismiss', 'cancel'])

const copied = ref(false)

const html = computed(() => {
  if (!props.resultText) return ''
  if (/\$/.test(props.resultText)) ensureKatexCss()
  const rendered = md.render(props.resultText)
  return rendered?.trim() || ''
})

const showPlainText = computed(() => props.resultText && !html.value)

const COLOR_TEXT = {
  brand: { dark: 'text-brand-400', light: 'text-brand-500' },
  agent: { dark: 'text-agent-400', light: 'text-agent-500' },
  emerald: { dark: 'text-emerald-400', light: 'text-emerald-600' },
  amber: { dark: 'text-amber-400', light: 'text-amber-600' },
  blue: { dark: 'text-blue-400', light: 'text-blue-500' },
  rose: { dark: 'text-rose-400', light: 'text-rose-500' },
}
function colorCls(c) { return props.isDark ? COLOR_TEXT[c]?.dark : COLOR_TEXT[c]?.light }

function doCopy() {
  navigator.clipboard.writeText(props.resultText)
    .then(() => { copied.value = true; setTimeout(() => { copied.value = false }, 1500) })
    .catch(() => emit('copy'))
}
</script>

<template>
  <div
    class="ai-result-card z-[120] overflow-hidden shadow-xl flex flex-col pointer-events-auto"
    :class="[
      useFixed ? 'fixed rounded-xl' : 'absolute left-1 right-1 top-full rounded-b-xl',
      isDark ? 'bg-d0 border border-agent-400/15 shadow-black/50' : 'bg-white border border-violet-200/80 shadow-black/10',
    ]"
    :style="floatingStyle">
    <div class="flex items-center gap-2 px-3 py-2"
      :class="isDark ? 'bg-agent-400/6' : 'bg-violet-50'">
      <i :class="[actionIcon, 'text-[14px]', colorCls(actionColor)]" />
      <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI {{ actionLabel }}</span>
      <span v-if="isStreaming" class="inline-flex items-center gap-1 text-[11px] px-1.5 py-[2px] rounded-md"
        :class="isDark ? 'bg-agent-400/10 text-agent-400' : 'bg-agent-50 text-agent-500'">
        <i class="ri-loader-4-line animate-spin text-[11px]" />生成中
      </span>
      <span v-else-if="isError" class="text-[11px] px-1.5 py-[2px] rounded-md bg-red-400/10 text-red-400">失败</span>
      <span v-else-if="resultText" class="text-[11px] px-1.5 py-[2px] rounded-md"
        :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">完成</span>
      <div class="flex-1" />
      <button v-if="isStreaming" @click="emit('cancel')"
        class="h-7 px-2.5 rounded-md text-[12px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/6' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
        <i class="ri-stop-circle-line text-[13px]" />停止
      </button>
      <button v-else @click="emit('dismiss')"
        class="h-7 px-2.5 rounded-md text-[12px] font-medium flex items-center gap-1 transition-colors"
        :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/6' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
        <i class="ri-close-line text-[13px]" />关闭
      </button>
    </div>

    <div class="ai-result-scroll overflow-y-auto thin-scroll px-3 py-3 flex-1 min-h-0"
      :class="isDark ? 'ai-result-scroll--dark' : 'ai-result-scroll--light'">
      <div v-if="isStreaming && !resultText" class="flex items-center gap-2 py-4">
        <span class="loading-dot" />
        <span class="loading-dot" />
        <span class="loading-dot" />
        <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在生成...</span>
      </div>
      <div v-else-if="isError" class="py-3">
        <p class="text-[13px] leading-relaxed text-red-400">{{ errorMsg || 'AI 请求失败' }}</p>
      </div>
      <div v-else-if="resultText" class="markdown-content markdown-content--compact px-2" :class="isDark ? 'markdown-content--dark' : 'markdown-content--light'">
        <div v-if="html" v-html="html" />
        <pre v-else-if="showPlainText" class="ai-result-plain">{{ resultText }}</pre>
      </div>
    </div>

    <div v-if="!isStreaming && resultText" class="flex items-center gap-2 px-3 py-1.5"
      :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
      <button @click="doCopy"
        class="h-7 px-3 rounded-md text-[12px] font-medium flex items-center gap-1 transition-colors"
        :class="copied
          ? (isDark ? 'text-emerald-400 bg-emerald-400/10' : 'text-emerald-600 bg-emerald-50')
          : (isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/6' : 'text-lt-aux hover:text-lt-sub hover:bg-l4')">
        <i :class="copied ? 'ri-check-line' : 'ri-file-copy-line'" class="text-[13px]" />
        {{ copied ? '已复制' : '复制' }}
      </button>
      <button @click="emit('apply')"
        class="h-7 px-3 rounded-md text-[12px] font-semibold flex items-center gap-1 transition-colors"
        :class="isDark ? 'text-white bg-brand-400 hover:bg-brand-500' : 'text-white bg-brand-500 hover:bg-brand-600'">
        <i class="ri-check-line text-[13px]" />应用
      </button>
    </div>
  </div>
</template>

<style scoped>
.loading-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: #A78BFA; animation: dot-pulse 1.4s ease-in-out infinite;
}
.loading-dot:nth-child(2) { animation-delay: 0.2s }
.loading-dot:nth-child(3) { animation-delay: 0.4s }
@keyframes dot-pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }

.thin-scroll {
  scrollbar-width: thin;
}
.ai-result-scroll--dark {
  scrollbar-color: rgba(255,255,255,0.18) transparent;
}
.ai-result-scroll--light {
  scrollbar-color: rgba(108,138,255,0.24) transparent;
}
.thin-scroll::-webkit-scrollbar {
  width: 8px;
}
.thin-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.thin-scroll::-webkit-scrollbar-thumb {
  min-height: 36px;
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
}
.ai-result-scroll--dark::-webkit-scrollbar-thumb {
  background-color: rgba(255,255,255,0.16);
}
.ai-result-scroll--dark:hover::-webkit-scrollbar-thumb {
  background-color: rgba(255,255,255,0.26);
}
.ai-result-scroll--light::-webkit-scrollbar-thumb {
  background-color: rgba(108,138,255,0.22);
}
.ai-result-scroll--light:hover::-webkit-scrollbar-thumb {
  background-color: rgba(108,138,255,0.34);
}

.ai-result-card :deep(.markdown-content) { font-size: 13px; line-height: 1.7 }
.ai-result-card :deep(.markdown-content p),
.ai-result-card :deep(.markdown-content li) { line-height: 1.7 }
.ai-result-plain { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.7 }
</style>
