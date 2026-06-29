<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import OptionSelector from '@/components/OptionSelector.vue'
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

const DEFAULT_PODCAST_TYPES = [
  {
    value: 'educational',
    label: '知识讲解',
    description: '适合课程、知识点、概念解释',
    icon: 'ri-book-open-line',
    badge: '讲解',
    accent: 'brand',
    activeClass: 'ring-1 ring-agent-400/20',
  },
  {
    value: 'debate',
    label: '辩论',
    description: '适合多观点交锋和利弊分析',
    icon: 'ri-discuss-line',
    badge: '交锋',
    accent: 'amber',
  },
  {
    value: 'interview',
    label: '访谈',
    description: '适合主持人与嘉宾深入对话',
    icon: 'ri-user-voice-line',
    badge: '对话',
    accent: 'sky',
  },
  {
    value: 'storytelling',
    label: '故事叙述',
    description: '适合叙事、案例和场景化讲述',
    icon: 'ri-movie-line',
    badge: '叙事',
    accent: 'emerald',
  },
  {
    value: 'news_analysis',
    label: '新闻分析',
    description: '适合事件背景和趋势解读',
    icon: 'ri-newspaper-line',
    badge: '趋势',
    accent: 'sky',
  },
]
const DEFAULT_LANG_OPTIONS = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
]
const DEFAULT_DURATION_OPTIONS = [
  { value: 'brief', label: '简短' },
  { value: 'standard', label: '标准' },
  { value: 'deep', label: '深入' },
]
const DEFAULT_SPEAKER_COUNTS = [1, 2, 3, 4, 5, 6]

const form = ref({
  topic: '',
  podcast_type: 'educational',
  num_speakers: 2,
  language: 'zh-CN',
  duration_level: 'standard',
  enable_web_search: false,
})

const podcastTypes = DEFAULT_PODCAST_TYPES
const langOptions = DEFAULT_LANG_OPTIONS
const durationOptions = DEFAULT_DURATION_OPTIONS
const speakerCounts = DEFAULT_SPEAKER_COUNTS
const fixedPoints = 50

const canSubmit = computed(() => form.value.topic.trim().length > 0)
const hint = computed(() => (!form.value.topic.trim() ? '请填写播客主题' : ''))
const costText = computed(() => `${fixedPoints} 积分`)
watch(() => props.show, (v) => {
  if (v) {
    resetForm()
  }
})

function resetForm() {
  form.value = {
    topic: '',
    podcast_type: 'educational',
    num_speakers: 2,
    language: 'zh-CN',
    duration_level: 'standard',
    enable_web_search: false,
  }
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    toolId: 'podcast',
    mode: 'cloud',
    topic: form.value.topic.trim(),
    params: {
      podcast_type: form.value.podcast_type,
      num_speakers: form.value.num_speakers,
      language: form.value.language,
      duration_level: form.value.duration_level,
      enable_web_search: form.value.enable_web_search,
      voice: {
        mode: 'auto',
        speaker_voices: {},
      },
    },
  })
}

</script>

<template>
  <MsModal v-model:show="showModal" :width="600" max-height="88vh" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-agent-400/14">
          <i class="ri-mic-2-line text-[14px] text-agent-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">创建播客</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">生成多人对话式音频内容（云端）</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3 flex items-center gap-2"
        :class="isDark ? 'bg-amber-400/8 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
        <i class="ri-cloud-line text-[14px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
        <div class="min-w-0">
          <div class="text-[11px] font-semibold" :class="isDark ? 'text-amber-400' : 'text-amber-700'">播客生成依赖云端语音合成服务</div>
          <div class="text-[9px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">产物包含音频、脚本和结构化数据</div>
        </div>
        <div class="flex-1" />
        <!-- 积分额度 -->
        <!-- <span class="ctx-pill text-[9px]"
          :class="isDark ? 'bg-amber-400/12 text-amber-400 border border-amber-400/30' : 'bg-amber-100 text-amber-600 border border-amber-200'">{{ costText }}</span> -->
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-agent-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">播客主题 <span class="text-red-400">*</span></span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ form.topic.length }} 字</span>
        </div>
        <textarea v-model="form.topic"
          rows="3"
          placeholder="例如：请结合选中的资料，生成一期开源 AI Agent 生态趋势播客"
          class="w-full min-h-[74px] max-h-[140px] resize-y px-3 py-2 rounded-lg text-[12px] leading-relaxed outline-none transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-agent-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-agent-400'" />
      </div>

      <ReferenceContextList
        :items="ctxItems"
        :is-dark="isDark"
        title="已选资料"
        accent-class="text-emerald-400"
        empty-text="未选择资料时，将仅根据主题生成播客"
      />

      <!-- 播客类型 -->
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-shapes-line text-[12px] text-agent-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">播客类型</span>
        </div>
        <OptionSelector
          v-model="form.podcast_type"
          :options="podcastTypes"
          :is-dark="isDark"
          default-accent="brand"
          size="comfortable"
          :trigger-class="isDark ? 'border-agent-400/18' : 'border-agent-100'"
          :menu-class="isDark ? 'shadow-agent-900/20' : 'shadow-agent-500/10'"
          option-class="min-h-[46px]"
          selected-option-class="font-semibold"
          inactive-option-class="opacity-95"
        />
      </div>

      <!-- 说话人 + 语言 + 时长 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-team-line text-[12px] text-agent-400" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">说话人数</span>
          </div>
          <select v-model.number="form.num_speakers"
            class="w-full h-8 px-2 rounded-md text-[11px] font-medium outline-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-white border border-bdrF text-lt-sub'">
            <option v-for="n in speakerCounts" :key="n" :value="n">{{ n }} 人</option>
          </select>
        </div>

        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-translate-2 text-[12px] text-agent-400" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">语言</span>
          </div>
          <select v-model="form.language"
            class="w-full h-8 px-2 rounded-md text-[11px] font-medium outline-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-white border border-bdrF text-lt-sub'">
            <option v-for="l in langOptions" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </div>

        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-timer-line text-[12px] text-agent-400" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">时长</span>
          </div>
          <select v-model="form.duration_level"
            class="w-full h-8 px-2 rounded-md text-[11px] font-medium outline-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-white border border-bdrF text-lt-sub'">
            <option v-for="d in durationOptions" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>
      </div>

      <!-- 音色 -->
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-voiceprint-line text-[12px] text-agent-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">音色模式</span>
        </div>
        <div class="h-9 px-3 rounded-lg flex items-center gap-2"
          :class="isDark ? 'bg-agent-400/10 border border-agent-400/24 text-agent-300' : 'bg-agent-50 border border-agent-100 text-agent-600'">
          <i class="ri-magic-line text-[13px]" />
          <span class="text-[11px] font-semibold">自动匹配</span>
          <span class="ctx-pill text-[8px] ml-auto"
            :class="isDark ? 'bg-agent-400/10 text-agent-300 border border-agent-400/20' : 'bg-white text-agent-600 border border-agent-100'">
            当前
          </span>
        </div>
      </div>

      <!-- 联网搜索 -->
      <div class="rounded-xl p-3 flex items-center justify-between"
        :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2">
          <i class="ri-global-line text-[12px] text-agent-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索补充资料</span>
        </div>
        <button @click="form.enable_web_search = !form.enable_web_search"
          class="relative w-9 h-5 rounded-full transition-colors"
          :class="form.enable_web_search ? 'bg-agent-500' : (isDark ? 'bg-d4' : 'bg-l4')">
          <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
            :style="{ transform: form.enable_web_search ? 'translateX(16px)' : 'translateX(0)' }" />
        </button>
      </div>
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
                   <!-- <button
          :disabled="!canSubmit"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'text-white bg-agent-500 hover:bg-agent-600 shadow-[0_4px_14px_rgba(124,58,237,0.3)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          <i class="ri-mic-2-line text-[12px]" />
          创建播客
        </button> -->
        <button
          :disabled="true"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'bg-l4 hover:bg-agent-600]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          <i class="ri-mic-2-line text-[12px]" />
          创建播客(即将支持)
        </button>
      </div>
    </template>
  </MsModal>
</template>
