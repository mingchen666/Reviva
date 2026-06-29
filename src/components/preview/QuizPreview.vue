<template>
  <div class="w-full h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-slate-50'">
    <div class="shrink-0 px-6 py-3 flex items-center justify-between gap-3"
      :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-white border-b border-slate-100'">
      <div class="min-w-0">
        <div class="text-sm font-bold truncate" :class="isDark ? 'text-wt-main' : 'text-zinc-800'">
          {{ data.title || '测验' }}
        </div>
        <div class="text-[11px] mt-1 flex items-center gap-2 flex-wrap"
          :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
          <span class="font-mono">Q{{ currentIndex + 1 }} / {{ total }}</span>
          <span>已提交 {{ submittedCount }} 题</span>
          <span>正确 {{ correctCount }} 题</span>
        </div>
      </div>

      <button @click="resetAll"
        class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50"
        :class="isDark ? 'border-d4 text-wt-sub hover:bg-d4' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'"
        :disabled="!total">
        重置
      </button>
    </div>

    <div v-if="!total" class="flex-1 flex items-center justify-center">
      <div class="text-center" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
        <i class="ri-questionnaire-line text-6xl opacity-40" />
        <div class="mt-3 text-sm font-bold">暂无题目</div>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-y-auto p-6">
      <div class="max-w-4xl mx-auto space-y-4">
        <div class="h-2 rounded-full overflow-hidden"
          :class="isDark ? 'bg-d4' : 'bg-white border border-zinc-200'">
          <div class="h-full bg-emerald-500 transition-all"
            :style="{ width: `${Math.round(((currentIndex + 1) / total) * 100)}%` }" />
        </div>

        <div class="rounded-2xl p-5 shadow-sm"
          :class="isDark ? 'bg-d3 border border-d4' : 'bg-white border border-zinc-200'">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="text-xs font-mono mb-1" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
                {{ questionTypeLabel(currentQuestion?.type) }}
              </div>
              <div class="text-lg font-bold leading-relaxed" :class="isDark ? 'text-wt-main' : 'text-zinc-900'">
                {{ currentQuestion?.q }}
              </div>
            </div>

            <span class="px-2 py-1 rounded-md text-[11px] font-bold shrink-0" :class="statusBadgeClass">
              {{ statusBadgeText }}
            </span>
          </div>

          <div class="mt-5 space-y-2">
            <template v-if="currentQuestion?.type === 'single' && parsedOptions.length">
              <button v-for="opt in parsedOptions" :key="opt.letter"
                class="w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3"
                :disabled="isSubmitted"
                :class="optionClass(opt.letter)"
                @click="select(opt.letter)">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-zinc-100 text-zinc-600'">
                  {{ opt.letter }}
                </div>
                <div class="text-sm leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-zinc-800'">
                  {{ opt.text }}
                </div>
              </button>
            </template>

            <template v-else-if="currentQuestion?.type === 'bool'">
              <div class="grid grid-cols-2 gap-3">
                <button class="p-4 rounded-xl border text-sm font-bold transition-colors"
                  :disabled="isSubmitted"
                  :class="boolOptionClass('true')"
                  @click="select('true')">
                  正确（true）
                </button>
                <button class="p-4 rounded-xl border text-sm font-bold transition-colors"
                  :disabled="isSubmitted"
                  :class="boolOptionClass('false')"
                  @click="select('false')">
                  错误（false）
                </button>
              </div>
            </template>

            <div v-else class="text-sm" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
              暂不支持该题型
            </div>
          </div>

          <div v-if="tip" class="mt-4 p-3 rounded-xl text-sm"
            :class="isDark ? 'bg-amber-400/10 border border-amber-400/20 text-amber-300' : 'bg-amber-50 border border-amber-100 text-amber-700'">
            <i class="ri-information-line mr-1" />{{ tip }}
          </div>

          <div class="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2">
              <button class="px-3 py-2 rounded-xl border text-sm font-bold disabled:opacity-50 transition-colors"
                :class="isDark ? 'border-d4 bg-d2 text-wt-sub hover:bg-d4' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'"
                :disabled="currentIndex <= 0"
                @click="prev">
                <i class="ri-arrow-left-line mr-1" />上一题
              </button>
              <button class="px-3 py-2 rounded-xl border text-sm font-bold disabled:opacity-50 transition-colors"
                :class="isDark ? 'border-d4 bg-d2 text-wt-sub hover:bg-d4' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'"
                :disabled="currentIndex >= total - 1"
                @click="next">
                下一题 <i class="ri-arrow-right-line ml-1" />
              </button>
            </div>

            <div class="flex items-center gap-2">
              <button class="px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-colors"
                :class="isDark ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-zinc-900 hover:bg-black'"
                :disabled="isSubmitted || !selectedValue"
                @click="submit">
                提交答案
              </button>

              <button v-if="isSubmitted"
                class="px-3 py-2 rounded-xl border text-sm font-bold transition-colors"
                :class="isDark ? 'border-d4 bg-d2 text-wt-sub hover:bg-d4' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'"
                @click="showExplain = !showExplain">
                {{ showExplain ? '隐藏解析' : '显示解析' }}
              </button>
            </div>
          </div>

          <div v-if="isSubmitted" class="mt-6 space-y-3">
            <div class="p-4 rounded-2xl border"
              :class="isCorrect
                ? (isDark ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-green-200 bg-green-50')
                : (isDark ? 'border-red-400/25 bg-red-400/10' : 'border-rose-200 bg-rose-50')">
              <div class="text-sm font-bold"
                :class="isCorrect ? (isDark ? 'text-emerald-300' : 'text-green-700') : (isDark ? 'text-red-300' : 'text-rose-700')">
                {{ isCorrect ? '回答正确' : '回答错误' }}
              </div>
              <div class="text-sm mt-1" :class="isDark ? 'text-wt-sub' : 'text-zinc-700'">
                正确答案：
                <span class="font-mono font-bold">{{ correctAnswerText }}</span>
              </div>
            </div>

            <div v-if="showExplain && currentQuestion?.explain"
              class="p-4 rounded-2xl border"
              :class="isDark ? 'border-d4 bg-d2' : 'border-zinc-200 bg-white'">
              <div class="text-xs font-bold mb-2" :class="isDark ? 'text-wt-dim' : 'text-zinc-500'">解析</div>
              <div class="text-sm whitespace-pre-wrap leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-zinc-700'">
                {{ currentQuestion.explain }}
              </div>
            </div>
          </div>
        </div>

        <div v-if="allSubmitted" class="rounded-2xl p-5"
          :class="isDark ? 'bg-d3 border border-d4' : 'bg-white border border-zinc-200'">
          <div class="text-lg font-bold" :class="isDark ? 'text-wt-main' : 'text-zinc-900'">测验完成</div>
          <div class="mt-2 text-sm" :class="isDark ? 'text-wt-sub' : 'text-zinc-600'">
            得分：<span class="font-bold">{{ correctCount }}</span> / {{ total }}
          </div>
          <button class="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
            @click="resetAll">
            重新开始
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const data = computed(() => props.data?.result_json || {})
const questions = computed(() => Array.isArray(data.value?.questions) ? data.value.questions : [])
const total = computed(() => questions.value.length)

const currentIndex = ref(0)
const answers = ref({})
const submitted = ref({})
const correctness = ref({})
const tip = ref('')
const showExplain = ref(true)

const currentQuestion = computed(() => questions.value[currentIndex.value] || null)
const qid = computed(() => String(currentQuestion.value?.id ?? currentIndex.value))
const selectedValue = computed(() => answers.value[qid.value] || '')
const isSubmitted = computed(() => !!submitted.value[qid.value])

const correctAnswerNormalized = computed(() => {
  const q = currentQuestion.value
  if (!q) return ''
  if (q.type === 'single') return String(q.answer || '').trim().toUpperCase()
  if (q.type === 'bool') return String(q.answer).toLowerCase() === 'true' ? 'true' : 'false'
  return String(q.answer || '').trim()
})

const isCorrect = computed(() => correctness.value[qid.value] === true)
const correctAnswerText = computed(() => {
  const q = currentQuestion.value
  if (!q) return ''
  if (q.type === 'single') return correctAnswerNormalized.value
  if (q.type === 'bool') return correctAnswerNormalized.value === 'true' ? 'true（正确）' : 'false（错误）'
  return correctAnswerNormalized.value
})

const parsedOptions = computed(() => {
  const q = currentQuestion.value
  if (!q || q.type !== 'single' || !Array.isArray(q.options)) return []
  return q.options.map((raw, i) => {
    const str = String(raw || '').trim()
    const m = str.match(/^([A-Za-z])[\.\、]\s*(.*)$/)
    const letter = (m?.[1] || String.fromCharCode(65 + i)).toUpperCase()
    const text = (m?.[2] || str).trim()
    return { letter, text }
  })
})

const submittedCount = computed(() => Object.keys(submitted.value).length)
const correctCount = computed(() => Object.values(correctness.value).filter(Boolean).length)
const allSubmitted = computed(() => total.value > 0 && submittedCount.value >= total.value)

const statusBadgeText = computed(() => {
  if (!isSubmitted.value) return '未提交'
  return isCorrect.value ? '正确' : '错误'
})

const statusBadgeClass = computed(() => {
  if (!isSubmitted.value) return props.isDark ? 'bg-d4 text-wt-sub' : 'bg-zinc-100 text-zinc-600'
  return isCorrect.value
    ? (props.isDark ? 'bg-emerald-400/12 text-emerald-300' : 'bg-green-100 text-green-700')
    : (props.isDark ? 'bg-red-400/12 text-red-300' : 'bg-rose-100 text-rose-700')
})

function questionTypeLabel(type) {
  if (type === 'single') return `Q${currentIndex.value + 1} · 单选`
  if (type === 'bool') return `Q${currentIndex.value + 1} · 判断`
  return `Q${currentIndex.value + 1} · ${type || '未知'}`
}

function select(value) {
  if (isSubmitted.value) return
  tip.value = ''
  answers.value = { ...answers.value, [qid.value]: value }
}

function submit() {
  if (isSubmitted.value) return
  if (!selectedValue.value) {
    tip.value = '请选择一个答案再提交'
    return
  }
  const selected = String(selectedValue.value).trim().toUpperCase()
  const correct = currentQuestion.value?.type === 'single'
    ? selected === correctAnswerNormalized.value
    : String(selectedValue.value).toLowerCase() === correctAnswerNormalized.value
  submitted.value = { ...submitted.value, [qid.value]: true }
  correctness.value = { ...correctness.value, [qid.value]: correct }
  tip.value = ''
  showExplain.value = true
}

function prev() {
  if (currentIndex.value <= 0) return
  currentIndex.value -= 1
  tip.value = ''
}

function next() {
  if (currentIndex.value >= total.value - 1) return
  currentIndex.value += 1
  tip.value = ''
}

function resetAll() {
  currentIndex.value = 0
  answers.value = {}
  submitted.value = {}
  correctness.value = {}
  tip.value = ''
  showExplain.value = true
}

watch(
  () => [data.value.artifact_id, total.value, data.value.title],
  () => resetAll(),
  { immediate: true },
)

function optionClass(letter) {
  if (!isSubmitted.value) {
    if (selectedValue.value === letter) {
      return props.isDark ? 'border-emerald-400/60 bg-emerald-400/10' : 'border-emerald-500 bg-emerald-50'
    }
    return props.isDark ? 'border-d4 bg-d2 hover:bg-d4' : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
  }
  const correct = correctAnswerNormalized.value
  if (letter === correct) return props.isDark ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-green-300 bg-green-50'
  if (selectedValue.value === letter && selectedValue.value !== correct) return props.isDark ? 'border-red-400/50 bg-red-400/10' : 'border-rose-300 bg-rose-50'
  return props.isDark ? 'border-d4 bg-d2 opacity-80' : 'border-zinc-200 bg-zinc-50 opacity-80'
}

function boolOptionClass(v) {
  if (!isSubmitted.value) {
    if (selectedValue.value === v) return props.isDark ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-emerald-500 bg-emerald-50 text-emerald-700'
    return props.isDark ? 'border-d4 bg-d2 text-wt-sub hover:bg-d4' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
  }
  const correct = correctAnswerNormalized.value
  if (v === correct) return props.isDark ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' : 'border-green-300 bg-green-50 text-green-700'
  if (selectedValue.value === v && v !== correct) return props.isDark ? 'border-red-400/50 bg-red-400/10 text-red-300' : 'border-rose-300 bg-rose-50 text-rose-700'
  return props.isDark ? 'border-d4 bg-d2 text-wt-dim opacity-80' : 'border-zinc-200 bg-white text-zinc-500 opacity-80'
}
</script>
