<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import { readableGenerationContexts } from '@/utils/generationContext'
import ReferenceContextList from './ReferenceContextList.vue'

const TOOL_CONFIGS = {
  qa: {
    id: 'qa', name: 'Q&A 问答卡', icon: 'ri-question-answer-line',
    desc: '把主题或资料整理成可查询、可思考的问答对',
    topicLabel: '问答主题', placeholder: '例如：操作系统进程调度 / 可留空让 AI 从资料中推断',
    count: 12, min: 6, max: 24,
    accent: 'brand',
  },
  glossary: {
    id: 'glossary', name: '术语表', icon: 'ri-book-2-line',
    desc: '从资料中提取专业术语、缩写和易混概念',
    topicLabel: '术语主题', placeholder: '例如：机器学习基础概念 / 可留空让 AI 从资料中推断',
    count: 20, min: 8, max: 40,
    accent: 'agent',
  },
  cheatsheet: {
    id: 'cheatsheet', name: '速查表', icon: 'ri-file-list-3-line',
    desc: '将公式、关键数据、步骤和易错点浓缩成一页',
    topicLabel: '速查主题', placeholder: '例如：SQL 常用查询 / 可留空让 AI 从资料中推断',
    accent: 'amber',
  },
}

const MODE_OPTIONS = [
  { value: 'faq', label: 'FAQ 速查', icon: 'ri-question-answer-line', desc: '直接回答高频问题' },
  { value: 'thinking', label: '启发思考', icon: 'ri-lightbulb-flash-line', desc: '先思考，再查看答案' },
]

const FOCUS_OPTIONS = [
  { value: 'balanced', label: '均衡', icon: 'ri-layout-grid-line' },
  { value: 'formulas', label: '公式数据', icon: 'ri-function-line' },
  { value: 'workflow', label: '步骤规则', icon: 'ri-route-line' },
  { value: 'pitfalls', label: '易错点', icon: 'ri-error-warning-line' },
]

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const props = defineProps({
  show: { type: Boolean, default: false },
  toolId: { type: String, required: true },
  ctxItems: { type: Array, default: () => [] },
  wikiItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:show', 'submit'])

const showModal = computed({
  get: () => props.show,
  set: value => emit('update:show', value),
})
const config = computed(() => TOOL_CONFIGS[props.toolId] || TOOL_CONFIGS.qa)
const topic = ref('')
const count = ref(12)
const qaMode = ref('faq')
const focus = ref('balanced')
const webEnabled = ref(false)

const usableCtxItems = computed(() => readableGenerationContexts(props.ctxItems))
const usableWikiItems = computed(() => (props.wikiItems || [])
  .filter(item => item?.id || item?.wikiId)
  .map(item => ({
    id: item.id || item.wikiId,
    name: item.name || item.id || item.wikiId,
    type: 'wiki',
    icon: 'ri-book-2-line',
  })))
const sourceItems = computed(() => [...usableCtxItems.value, ...usableWikiItems.value])
const canSubmit = computed(() => topic.value.trim().length > 0 || sourceItems.value.length > 0)
const hint = computed(() => canSubmit.value ? '' : '请输入主题，或选择具体文件、知识库或 Wiki')

const theme = computed(() => ({
  brand: {
    icon: isDark.value ? 'bg-brand-400/14 text-brand-400' : 'bg-brand-50 text-brand-500',
    text: isDark.value ? 'text-brand-400' : 'text-brand-500',
    active: isDark.value ? 'bg-brand-400/10 border-brand-400/30 text-brand-300' : 'bg-brand-50 border-brand-200 text-brand-600',
    button: 'bg-brand-500 hover:bg-brand-600 shadow-[0_4px_14px_rgba(74,108,255,0.25)]',
    focus: isDark.value ? 'focus:border-brand-400/40' : 'focus:border-brand-400',
    range: 'accent-brand-500',
  },
  agent: {
    icon: isDark.value ? 'bg-agent-400/14 text-agent-400' : 'bg-agent-50 text-agent-500',
    text: isDark.value ? 'text-agent-400' : 'text-agent-500',
    active: isDark.value ? 'bg-agent-400/10 border-agent-400/30 text-agent-300' : 'bg-agent-50 border-agent-200 text-agent-600',
    button: 'bg-agent-500 hover:bg-agent-600 shadow-[0_4px_14px_rgba(139,92,246,0.25)]',
    focus: isDark.value ? 'focus:border-agent-400/40' : 'focus:border-agent-400',
    range: 'accent-agent-500',
  },
  amber: {
    icon: isDark.value ? 'bg-amber-400/14 text-amber-400' : 'bg-amber-50 text-amber-600',
    text: isDark.value ? 'text-amber-400' : 'text-amber-600',
    active: isDark.value ? 'bg-amber-400/10 border-amber-400/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700',
    button: 'bg-amber-500 hover:bg-amber-600 shadow-[0_4px_14px_rgba(245,158,11,0.25)]',
    focus: isDark.value ? 'focus:border-amber-400/40' : 'focus:border-amber-400',
    range: 'accent-amber-500',
  },
}[config.value.accent]))

function resetForm() {
  topic.value = ''
  count.value = config.value.count || 12
  qaMode.value = 'faq'
  focus.value = 'balanced'
  webEnabled.value = false
}

watch(() => props.show, show => {
  if (show) resetForm()
})

watch(() => props.toolId, () => {
  if (props.show) resetForm()
})

function handleSubmit() {
  if (!canSubmit.value) return
  const params = {
    webSearch: { enabled: webEnabled.value, provider: 'auto' },
  }
  if (config.value.id === 'qa') {
    params.count = count.value
    params.mode = qaMode.value
  } else if (config.value.id === 'glossary') {
    params.count = count.value
  } else {
    params.focus = focus.value
  }
  emit('submit', {
    toolId: config.value.id,
    mode: 'local',
    topic: topic.value.trim(),
    params,
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="560" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="theme.icon">
          <i :class="config.icon + ' text-[14px]'" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成{{ config.name }}</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ config.desc }}</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px]" :class="theme.text" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ config.topicLabel }}</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ topic.length }} 字</span>
        </div>
        <textarea v-model="topic" :placeholder="config.placeholder" rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? ['bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50', theme.focus]
            : ['bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40', theme.focus]" />
      </div>

      <div v-if="config.id === 'qa'" class="grid grid-cols-2 gap-3">
        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-hashtag text-[12px]" :class="theme.text" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">问答数量</span>
            <div class="flex-1" />
            <span class="text-[13px] font-mono font-bold rounded-md px-1.5 py-0.5 min-w-[36px] text-center" :class="isDark ? 'text-brand-300 bg-d0' : 'text-brand-600 bg-white'">{{ count }}</span>
          </div>
          <input v-model.number="count" type="range" :min="config.min" :max="config.max" step="1" class="w-full" :class="theme.range" />
        </div>
        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-compass-3-line text-[12px]" :class="theme.text" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">问答模式</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button v-for="option in MODE_OPTIONS" :key="option.value" @click="qaMode = option.value"
              class="rounded-lg py-2 px-1 text-center transition-all flex flex-col items-center gap-0.5 border"
              :class="qaMode === option.value ? theme.active : (isDark ? 'border-d4 hover:border-brand-400/20 bg-d0' : 'border-bdrF hover:border-brand-200 bg-white')">
              <i :class="[option.icon + ' text-[13px]', qaMode === option.value ? theme.text : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
              <span class="text-[10px] font-medium" :class="qaMode === option.value ? theme.text : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ option.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="config.id === 'glossary'" class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-hashtag text-[12px]" :class="theme.text" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">术语数量</span>
          <div class="flex-1" />
          <span class="text-[13px] font-mono font-bold rounded-md px-1.5 py-0.5 min-w-[36px] text-center" :class="isDark ? 'text-agent-300 bg-d0' : 'text-agent-600 bg-white'">{{ count }}</span>
        </div>
        <input v-model.number="count" type="range" :min="config.min" :max="config.max" step="1" class="w-full" :class="theme.range" />
      </div>

      <div v-else class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-focus-3-line text-[12px]" :class="theme.text" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">内容侧重点</span>
        </div>
        <div class="grid grid-cols-4 gap-1.5">
          <button v-for="option in FOCUS_OPTIONS" :key="option.value" @click="focus = option.value"
            class="rounded-lg py-2 px-1 text-center transition-all flex flex-col items-center gap-0.5 border"
            :class="focus === option.value ? theme.active : (isDark ? 'border-d4 hover:border-amber-400/20 bg-d0' : 'border-bdrF hover:border-amber-200 bg-white')">
            <i :class="[option.icon + ' text-[13px]', focus === option.value ? theme.text : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
            <span class="text-[10px] font-medium" :class="focus === option.value ? theme.text : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-start gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="webEnabled ? theme.icon : (isDark ? 'bg-d0 text-wt-dim' : 'bg-white text-lt-aux')">
            <i class="ri-global-line text-[14px]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网补充</div>
                <div class="mt-0.5 text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">按需开启；当前资料优先，开启后调用 Agent 已绑定的联网搜索工具补充。</div>
              </div>
              <button @click="webEnabled = !webEnabled" class="w-8 h-[18px] rounded-full p-[2px] transition-colors shrink-0" :class="webEnabled ? (config.accent === 'amber' ? 'bg-amber-500' : config.accent === 'agent' ? 'bg-agent-500' : 'bg-brand-500') : (isDark ? 'bg-d4' : 'bg-l4')">
                <span class="block w-3.5 h-3.5 rounded-full bg-white transition-transform" :style="{ transform: webEnabled ? 'translateX(14px)' : 'translateX(0)' }" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ReferenceContextList :items="sourceItems" :is-dark="isDark" title="参考资料（可选）"
        empty-text="未选择资料；也可以只填写主题生成" :accent-class="theme.text" />
    </div>

    <template #footer="{ close }">
      <div class="flex items-center gap-2">
        <span v-if="hint" class="text-[10px] mr-auto" :class="isDark ? 'text-amber-400' : 'text-amber-500'">
          <i class="ri-information-line" /> {{ hint }}
        </span>
        <button @click="close()" class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button :disabled="!canSubmit" @click="handleSubmit" class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all text-white"
          :class="canSubmit ? theme.button : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed shadow-none' : 'bg-l4 text-lt-aux cursor-not-allowed shadow-none')">
          开始生成 <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
