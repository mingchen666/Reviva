<script setup>
import colorMap from './colorMap'

defineProps({ isDark: Boolean })
const emit = defineEmits(['tool-action'])

const builtinTools = [
  { id: 'quiz', name: '测验', icon: 'ri-questionnaire-line', color: 'emerald', desc: '生成练习测验' },
  { id: 'flashcard', name: '闪卡', icon: 'ri-stack-line', color: 'pink', desc: '生成学习闪卡' },
  { id: 'mindmap', name: '导图', icon: 'ri-mind-map', color: 'emerald', desc: '生成思维导图' },
  { id: 'graph', name: '图谱', icon: 'ri-share-circle-line', color: 'amber', desc: '生成知识图谱' },
  { id: 'chart', name: '图表', icon: 'ri-bar-chart-box-line', color: 'sky', desc: '生成 SVG 图表' },
  { id: 'podcast', name: '播客', icon: 'ri-mic-2-line', color: 'agent', desc: '生成播客音频' },
  { id: 'research', name: '深度研究', icon: 'ri-search-eye-line', color: 'sky', desc: '深度研究分析' },
  { id: 'ppt', name: 'PPT', icon: 'ri-slideshow-line', color: 'brand', desc: '生成演示文稿' },
]
</script>

<template>
  <div class="shrink-0 px-2 pt-2 pb-2" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
    <div class="flex items-center gap-2 mb-2.5">
      <i class="ri-wrench-line text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">创作工具</span>
    </div>
    <div class="grid grid-cols-4 gap-1">
      <button
        v-for="t in builtinTools"
        :key="t.id"
        @click="emit('tool-action', t)"
        class="relative flex flex-col items-center justify-center p-1 rounded-xl transition-all group"
        :class="
          isDark
            ? 'border border-transparent hover:border-brand-400/20 hover:bg-brand-400/6'
            : 'border border-transparent hover:border-brand-200 hover:bg-brand-50/50'
        ">
        <div
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[16px] mb-0.5 transition-transform group-hover:scale-110"
          :class="
            isDark
              ? colorMap[t.color].bg + ' ' + colorMap[t.color].text
              : colorMap[t.color].lightBg + ' ' + colorMap[t.color].lightText
          ">
          <i :class="t.icon" />
        </div>
        <span
          class="text-[10px] font-medium"
          :class="isDark ? 'text-wt-aux group-hover:text-wt-sub' : 'text-lt-aux group-hover:text-lt-sub'">
          {{ t.name }}
        </span>
        <!-- 内置 badge — absolute top-right -->
        <span
          class="absolute top-1 right-1 text-[8px] px-1 rounded"
          :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">
          内置
        </span>
      </button>
    </div>
  </div>
</template>
