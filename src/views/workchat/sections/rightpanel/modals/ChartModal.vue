<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import { readableGenerationContexts } from '@/utils/generationContext'
import ReferenceContextList from './ReferenceContextList.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  ctxItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:show', 'submit'])

const showModal = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const topic = ref('')
const count = ref(3)
const focus = ref('auto')
const style = ref('auto')

const usableCtxItems = computed(() => readableGenerationContexts(props.ctxItems))
const canSubmit = computed(() => topic.value.trim().length > 0 || usableCtxItems.value.length > 0)
const hint = computed(() => {
  if (!topic.value.trim() && !usableCtxItems.value.length) return '请输入主题或勾选具体文件/知识库'
  return ''
})

const focusOptions = [
  { value: 'auto', label: '智能匹配', icon: 'ri-magic-line', desc: '按资料自动选择' },
  { value: 'infographic', label: '信息图', icon: 'ri-dashboard-2-line', desc: '模块面板与具象隐喻', types: ['infographic', 'key_number'] },
  { value: 'knowledge_card', label: '知识卡片', icon: 'ri-sticky-note-line', desc: '术语、要点、学习笔记' },
  { value: 'bar', label: '柱状图', icon: 'ri-bar-chart-2-line', desc: '分类对比、排名、构成', types: ['bar', 'stacked_bar'] },
  { value: 'line', label: '折线图', icon: 'ri-line-chart-line', desc: '趋势、阶段变化', types: ['line', 'area'] },
  { value: 'pie', label: '饼/环图', icon: 'ri-pie-chart-2-line', desc: '占比与构成', types: ['pie', 'donut'] },
  { value: 'gauge', label: '仪表盘', icon: 'ri-speed-up-line', desc: '进度、风险、成熟度' },
  { value: 'funnel', label: '漏斗图', icon: 'ri-filter-3-line', desc: '筛选、转化、流失' },
  { value: 'scatter', label: '散点图', icon: 'ri-bubble-chart-line', desc: '关系、分布、聚类', types: ['scatter', 'bubble'] },
  { value: 'radar', label: '雷达图', icon: 'ri-radar-line', desc: '能力模型、维度画像' },
  { value: 'heatmap', label: '热力图', icon: 'ri-grid-line', desc: '强弱、密度、分布' },
  { value: 'flow', label: '流程图', icon: 'ri-flow-chart', desc: '步骤、路径、决策' },
  { value: 'comparison', label: '对比图', icon: 'ri-scales-3-line', desc: '方案差异与优劣' },
  { value: 'timeline', label: '时间线', icon: 'ri-timeline-view', desc: '阶段、演进、里程碑' },
  { value: 'structure', label: '结构图', icon: 'ri-node-tree', desc: '模块、层级、关系' },
  { value: 'matrix', label: '矩阵图', icon: 'ri-grid-line', desc: '象限、优先级、评估' },
]

const styleOptions = [
  { value: 'auto', label: '默认', icon: 'ri-magic-line', desc: '优先扁平信息图' },
  { value: 'flat_vector', label: '扁平描边', icon: 'ri-pencil-ruler-2-line', desc: '纯色、黑描边、模块面板' },
  { value: 'clean', label: '商务简洁', icon: 'ri-layout-3-line', desc: '白底、清晰、适合报告' },
  { value: 'infographic', label: '信息图', icon: 'ri-dashboard-2-line', desc: '图标、数字、知识卡片' },
  { value: 'dashboard', label: '数据看板', icon: 'ri-bar-chart-grouped-line', desc: '指标卡、趋势和对比' },
  { value: 'academic', label: '学术', icon: 'ri-graduation-cap-line', desc: '克制、严谨、引用感' },
  { value: 'blueprint', label: '蓝图科技', icon: 'ri-compasses-2-line', desc: '线框、网格、技术说明' },
  { value: 'warm', label: '柔和暖色', icon: 'ri-sun-line', desc: '低饱和、亲和、阅读友好' },
  { value: 'dark', label: '深色演示', icon: 'ri-moon-line', desc: '深底、高对比、适合投屏' },
]

const selectedFocus = computed(() => focusOptions.find(item => item.value === focus.value) || focusOptions[0])

function setCount(next) {
  const n = Number(next)
  count.value = Math.min(6, Math.max(1, Number.isFinite(n) ? n : 3))
}

function adjustCount(delta) {
  setCount(count.value + delta)
}

watch(() => props.show, (v) => {
  if (v) {
    topic.value = ''
    count.value = 3
    focus.value = 'auto'
    style.value = 'auto'
  }
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    toolId: 'chart',
    mode: 'local',
    topic: topic.value.trim(),
    params: {
      count: count.value,
      chartTypes: focus.value === 'auto' ? ['auto'] : (selectedFocus.value?.types || [focus.value]),
      style: style.value,
      styleLabel: styleOptions.find(item => item.value === style.value)?.label || '',
      focusLabel: selectedFocus.value?.label || '',
    },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="560" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-400/14">
          <i class="ri-bar-chart-box-line text-[14px] text-sky-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成图表</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">生成 SVG 信息图、知识卡片和常见数据图表</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图表主题</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ topic.length }} 字</span>
        </div>
        <textarea
          v-model="topic"
          placeholder="例如：把这份市场分析做成 3 张信息图 / 可留空让 AI 从资料中推断"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-sky-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-sky-400'"
        />
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-hashtag text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图表数量</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">单次 1-6 个</span>
        </div>
        <div class="flex items-center gap-2">
          <div  class="h-10 rounded-xl flex items-center shrink-0 overflow-hidden"
            :class="isDark ? 'bg-d0 border border-d4' : 'bg-white border border-bdrF'">
            <button @click="adjustCount(-1)"
              class="h-10 w-10 flex items-center justify-center transition-colors disabled:opacity-40"
              :disabled="count <= 1"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i class="ri-subtract-line text-[13px]" />
            </button>
            <div class="w-12 text-center text-[16px] font-mono font-bold tabular-nums"
              :class="isDark ? 'text-sky-400' : 'text-sky-600'">{{ count }}</div>
            <button @click="adjustCount(1)"
              class="h-10 w-10 flex items-center justify-center transition-colors disabled:opacity-40"
              :disabled="count >= 6"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
              <i class="ri-add-line text-[13px]" />
            </button>
          </div>

        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-palette-line text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">视觉风格</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="item in styleOptions" :key="item.value"
            @click="style = item.value"
            class="rounded-lg p-2 text-left transition-all flex items-start gap-2 min-h-[54px]"
            :class="style === item.value
              ? (isDark ? 'bg-sky-400/10 border border-sky-400/30' : 'bg-sky-50 border border-sky-200')
              : (isDark ? 'bg-d0 border border-d4 hover:border-sky-400/20' : 'bg-white border border-bdrF hover:border-sky-200')">
            <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              :class="style === item.value
                ? (isDark ? 'bg-sky-400/14 text-sky-400' : 'bg-white text-sky-600')
                : (isDark ? 'bg-d2 text-wt-dim' : 'bg-l3 text-lt-aux')">
              <i :class="item.icon + ' text-[13px]'" />
            </div>
            <div class="min-w-0">
              <div class="text-[11px] font-bold truncate"
                :class="style === item.value ? (isDark ? 'text-sky-400' : 'text-sky-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">
                {{ item.label }}
              </div>
              <div class="text-[9px] leading-snug max-h-[26px] overflow-hidden mt-0.5"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ item.desc }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-shapes-line text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图表倾向</span>
          <div class="flex-1" />
          <span class="text-[9px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ selectedFocus.desc }}</span>
        </div>
        <div class="rounded-xl p-1.5" :class="isDark ? 'bg-d0 border border-d4' : 'bg-white border border-bdrF'">
          <div class="grid grid-cols-4 gap-1">
            <button v-for="item in focusOptions" :key="item.value"
              @click="focus = item.value"
              class="h-8 rounded-lg px-2 text-[10px] font-semibold transition-all flex items-center justify-center gap-1 min-w-0"
              :title="item.desc"
              :class="focus === item.value
                ? (isDark ? 'bg-sky-400 text-d0 shadow-sm' : 'bg-sky-500 text-white shadow-sm')
                : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')">
              <i :class="item.icon + ' text-[12px] shrink-0'" />
              <span class="truncate">{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <ReferenceContextList :items="usableCtxItems" :is-dark="isDark" accent-class="text-sky-400" />
    </div>

    <template #footer="{ close }">
      <div class="flex items-center gap-2">
        <span v-if="hint" class="text-[10px] mr-auto" :class="isDark ? 'text-amber-400' : 'text-amber-500'">
          <i class="ri-information-line" /> {{ hint }}
        </span>
        <button @click="close()"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          :disabled="!canSubmit"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'text-white bg-sky-500 hover:bg-sky-600 shadow-[0_4px_14px_rgba(56,189,248,0.25)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始生成
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
