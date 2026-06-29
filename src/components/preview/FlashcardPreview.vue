<template>
  <div class="w-full h-full flex flex-col items-center justify-center p-4 md:p-6 font-sans"
    :class="isDark ? 'bg-d2 text-wt-main' : 'bg-slate-50 text-zinc-900'">
    <div class="flex items-center justify-between w-full max-w-3xl mb-5 px-1">
      <div class="min-w-0">
        <h2 class="text-xl md:text-2xl font-black truncate"
          :class="isDark ? 'text-wt-main' : 'text-zinc-900'">
          {{ data.title || '知识闪卡' }}
        </h2>
        <div class="mt-1 text-[11px] flex items-center gap-2 flex-wrap"
          :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
          <span class="px-2 py-0.5 rounded-full font-bold"
            :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-zinc-100 text-zinc-600'">
            {{ cardTypeLabel }}
          </span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" :class="statusPillClass">
            {{ statusText }}
          </span>
          <span v-if="data.round" class="font-mono">Round {{ data.round }}</span>
          <span v-if="typeof data.mastered_count === 'number'">mastered {{ data.mastered_count }}</span>
        </div>
      </div>

      <div class="px-4 py-1.5 rounded-full text-sm font-bold shrink-0"
        :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-white text-zinc-600 shadow-inner'">
        {{ currentIndex + 1 }}
        <span class="mx-1 opacity-40">/</span>
        {{ totalCards }}
      </div>
    </div>

    <div v-if="!totalCards" class="flex-1 w-full flex items-center justify-center">
      <div class="text-center" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
        <i class="ri-stack-line text-6xl opacity-40" />
        <div class="mt-3 text-sm font-bold">暂无闪卡</div>
      </div>
    </div>

    <div v-else
      class="relative w-full max-w-3xl flashcard-perspective cursor-pointer group"
      style="height: min(460px, 62vh);"
      @click="toggleFlip">
      <div class="w-full h-full relative transition-transform duration-700 transform-style-preserve-3d"
        :class="{ 'rotate-y-180': isFlipped }">
        <div class="absolute inset-0 w-full h-full backface-hidden rounded-3xl border shadow-[0_24px_60px_-18px_rgba(24,24,27,0.18)] transition-shadow flex flex-col p-7 md:p-9"
          :class="isDark ? 'bg-d3 border-d4' : 'bg-white border-zinc-100'">
          <div class="flex items-center justify-between">
            <div class="text-xs font-black tracking-wider uppercase"
              :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
              Question
            </div>
            <div class="text-[11px] hidden md:flex items-center gap-2"
              :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
              <span><kbd class="kbd" :class="isDark ? 'dark' : ''">Space</kbd> 翻面</span>
              <span><kbd class="kbd" :class="isDark ? 'dark' : ''">H</kbd> 提示</span>
            </div>
          </div>

          <div class="flex-1 flex items-center justify-center text-center">
            <h3 class="text-2xl md:text-4xl font-black leading-tight whitespace-pre-wrap"
              :class="isDark ? 'text-wt-main' : 'text-zinc-800'">
              {{ card.front || '（空）' }}
            </h3>
          </div>

          <div class="absolute bottom-7 left-0 right-0 px-7 md:px-12 transition-all duration-300 flex flex-col items-center"
            :class="showHint ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'">
            <div class="w-full px-5 py-3 rounded-2xl text-sm text-center shadow-sm"
              :class="isDark ? 'bg-amber-400/10 border border-amber-400/25 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-800'">
              <span class="font-black mr-2">提示</span>
              <span class="opacity-90">{{ hintText || '暂无提示' }}</span>
            </div>
          </div>
        </div>

        <div class="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-3xl border shadow-[0_24px_60px_-18px_rgba(24,24,27,0.18)] flex flex-col p-7 md:p-9 overflow-y-auto custom-scrollbar"
          :class="isDark ? 'bg-d3 border-brand-400/25' : 'bg-indigo-50 border-indigo-100'">
          <div class="flex items-center justify-between mb-4">
            <div class="text-xs font-black tracking-wider uppercase flex items-center gap-2"
              :class="isDark ? 'text-brand-300' : 'text-indigo-500'">
              <i class="ri-check-line" />
              Answer
            </div>
            <div class="text-[11px] hidden md:block" :class="isDark ? 'text-wt-dim' : 'text-zinc-500'">
              点击卡片返回
            </div>
          </div>

          <div class="pb-6 mb-6" :class="isDark ? 'border-b border-d4' : 'border-b border-indigo-200/60'">
            <div class="text-sm font-black mb-2 flex items-center gap-2"
              :class="isDark ? 'text-wt-sub' : 'text-zinc-700'">
              <span class="w-6 h-6 rounded-lg flex items-center justify-center"
                :class="isDark ? 'bg-white/6 text-brand-300' : 'bg-white/70 text-indigo-600'">
                <i class="ri-lightbulb-flash-line" />
              </span>
              答案
            </div>

            <div v-if="isCloze && card.fill_answer" class="text-sm mb-2"
              :class="isDark ? 'text-wt-sub' : 'text-zinc-600'">
              填空答案：
              <span class="font-mono font-black" :class="isDark ? 'text-wt-main' : 'text-zinc-900'">{{ card.fill_answer }}</span>
            </div>

            <div class="text-xl md:text-3xl font-black leading-relaxed whitespace-pre-wrap"
              :class="isDark ? 'text-wt-main' : 'text-zinc-900'">
              {{ card.back || '（无答案）' }}
            </div>
          </div>

          <div class="flex-1">
            <div class="text-sm font-black mb-2 flex items-center gap-2"
              :class="isDark ? 'text-wt-sub' : 'text-zinc-700'">
              <span class="w-6 h-6 rounded-lg flex items-center justify-center"
                :class="isDark ? 'bg-white/6 text-agent-400' : 'bg-white/70 text-purple-600'">
                <i class="ri-information-line" />
              </span>
              解析
            </div>
            <p class="text-sm md:text-base leading-relaxed whitespace-pre-wrap"
              :class="isDark ? 'text-wt-sub' : 'text-zinc-700'">
              {{ card.explanation || '暂无解析' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="totalCards" class="flex items-center justify-center gap-3 mt-6 w-full max-w-3xl">
      <button @click.stop="prevCard" :disabled="currentIndex === 0"
        class="px-4 py-3 rounded-2xl border transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        :class="isDark ? 'bg-d3 border-d4 text-wt-sub hover:bg-d4' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600'">
        <i class="ri-arrow-left-s-line text-lg" />
      </button>

      <button @click.stop="toggleHint"
        class="flex-1 py-3 rounded-2xl border transition-all shadow-sm font-bold flex items-center justify-center gap-2"
        :class="showHint
          ? (isDark ? 'bg-amber-400/15 text-amber-300 border-amber-400/30' : 'bg-amber-100 text-amber-800 border-amber-300')
          : (isDark ? 'bg-d3 text-wt-sub border-d4 hover:bg-d4' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-amber-50')">
        <i class="ri-lightbulb-line" />
        <span class="truncate">{{ showHint ? '隐藏提示' : '显示提示' }}</span>
      </button>

      <button @click.stop="toggleFlip"
        class="flex-1 py-3 rounded-2xl text-white font-bold transition-all shadow-md flex items-center justify-center gap-2"
        :class="isDark ? 'bg-brand-500 hover:bg-brand-600' : 'bg-zinc-900 hover:bg-black'">
        <i class="ri-refresh-line" />
        <span class="hidden sm:inline-block">{{ isFlipped ? '返回' : '翻面' }}</span>
      </button>

      <button @click.stop="nextCard" :disabled="currentIndex === totalCards - 1"
        class="px-4 py-3 rounded-2xl border transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        :class="isDark ? 'bg-d3 border-d4 text-wt-sub hover:bg-d4' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600'">
        <i class="ri-arrow-right-s-line text-lg" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const data = computed(() => props.data?.result_json || {})
const cards = computed(() => Array.isArray(data.value.cards) ? data.value.cards : [])
const totalCards = computed(() => cards.value.length)

const currentIndex = ref(0)
const isFlipped = ref(false)
const showHint = ref(false)

watch(
  () => [data.value.artifact_id, cards.value.length],
  () => {
    currentIndex.value = Number(data.value.current_index || 0) || 0
    isFlipped.value = false
    showHint.value = false
  },
  { immediate: true },
)

const card = computed(() => cards.value[currentIndex.value] || {})
const isCloze = computed(() => String(card.value.type || '').toLowerCase() === 'cloze')

const cardTypeLabel = computed(() => {
  const t = String(card.value.type || '').toLowerCase()
  if (t === 'qa') return '问答'
  if (t === 'cloze') return '填空'
  return t || '卡片'
})

const statusText = computed(() => {
  const s = String(card.value.status || 'new').toLowerCase()
  if (s === 'new') return '新卡'
  if (s === 'learning') return '学习中'
  if (s === 'mastered') return '已掌握'
  return s
})

const statusPillClass = computed(() => {
  const s = String(card.value.status || 'new').toLowerCase()
  if (props.isDark) {
    if (s === 'new') return 'bg-sky-400/12 text-sky-300 border border-sky-400/20'
    if (s === 'learning') return 'bg-amber-400/12 text-amber-300 border border-amber-400/20'
    if (s === 'mastered') return 'bg-emerald-400/12 text-emerald-300 border border-emerald-400/20'
    return 'bg-d4 text-wt-sub border border-d4'
  }
  if (s === 'new') return 'bg-blue-50 text-blue-700 border border-blue-100'
  if (s === 'learning') return 'bg-amber-50 text-amber-800 border border-amber-100'
  if (s === 'mastered') return 'bg-green-50 text-green-700 border border-green-100'
  return 'bg-zinc-100 text-zinc-700 border border-zinc-200'
})

const maskAnswer = (ans) => {
  const a = String(ans || '').trim()
  if (!a) return ''
  if (a.length === 1) return '*'
  return a[0] + '*'.repeat(a.length - 1)
}

const hintText = computed(() => {
  const c = card.value || {}
  if (String(c.type || '').toLowerCase() === 'cloze' && c.fill_answer) {
    const a = String(c.fill_answer).trim()
    return `答案长度：${a.length} 字；提示：${maskAnswer(a)}`
  }
  const source = c.explanation || c.back || ''
  return String(source).slice(0, 100) + (String(source).length > 100 ? '...' : '')
})

function resetState() {
  isFlipped.value = false
  showHint.value = false
}

function toggleFlip() {
  isFlipped.value = !isFlipped.value
  if (isFlipped.value) showHint.value = false
}

function toggleHint() {
  if (!hintText.value) return
  if (isFlipped.value) {
    isFlipped.value = false
    setTimeout(() => { showHint.value = true }, 300)
  } else {
    showHint.value = !showHint.value
  }
}

function prevCard() {
  if (currentIndex.value <= 0) return
  resetState()
  currentIndex.value -= 1
}

function nextCard() {
  if (currentIndex.value >= totalCards.value - 1) return
  resetState()
  currentIndex.value += 1
}

function isEditableTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

function handleKeydown(e) {
  if (isEditableTarget(e.target)) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevCard()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextCard()
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    toggleFlip()
  } else if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    toggleHint()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
.flashcard-perspective { perspective: 1200px; }
.transform-style-preserve-3d { transform-style: preserve-3d; }
.backface-hidden {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.rotate-y-180 { transform: rotateY(180deg); }
.kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #f4f4f5;
  color: #71717a;
}
.kbd.dark {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}
.custom-scrollbar::-webkit-scrollbar { width: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(99, 102, 241, 0.35);
  border-radius: 999px;
}
</style>
