<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import OptionSelector from '@/components/OptionSelector.vue'
import { HTML_STYLE_OPTIONS, PPTX_STYLE_OPTIONS } from '@/constants/pptStyleOptions'
import ReferenceContextList from './ReferenceContextList.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  ctxItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:show', 'start'])

const showModal = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const requirement = ref('')
const settings = ref(defaultSettings())

const scenes = [
  { id: 'business', title: '商务汇报', icon: 'ri-briefcase-line', desc: '投资路演、季度汇报、商业计划' },
  { id: 'tech', title: '技术分享', icon: 'ri-terminal-box-line', desc: '技术方案、架构设计、产品发布' },
  { id: 'academic', title: '学术报告', icon: 'ri-graduation-cap-line', desc: '论文答辩、研究分享、学术会议' },
  { id: 'creative', title: '创意提案', icon: 'ri-lightbulb-line', desc: '品牌方案、活动策划、设计提案' },
  { id: 'education', title: '教学课件', icon: 'ri-presentation-line', desc: '课程讲义、培训材料、知识分享' },
  { id: 'auto', title: '智能匹配', icon: 'ri-magic-line', desc: '根据内容自动选择最佳风格' },
]

const modeOptions = [
  { value: 'local', label: '本地', icon: 'ri-computer-line', description: '保留原本本地生成链路', badge: '本地', accent: 'brand' },
  { value: 'cloud', label: '云端', icon: 'ri-cloud-line', description: '调用云端 PPT 服务', badge: '云端', accent: 'brand' },
]

const hasContext = computed(() => props.ctxItems.length > 0)
const canSubmit = computed(() => {
  if (settings.value.mode !== 'cloud' && !hasContext.value) return false
  return requirement.value.trim().length > 0 || hasContext.value
})
const hint = computed(() => {
  if (settings.value.mode !== 'cloud' && !hasContext.value) return '本地模式请先选择文件、文件夹或知识库'
  if (!requirement.value.trim() && !hasContext.value) return '请输入 PPT 需求，或选择参考资料'
  return ''
})
const currentFormat = computed(() => normalizeOutputFormat(settings.value.format))
const styleOptions = computed(() => currentFormat.value === 'pptx' ? PPTX_STYLE_OPTIONS : HTML_STYLE_OPTIONS)
const selectedStyleDescription = computed(() => {
  const value = settings.value.stylePreset || 'auto'
  return styleOptions.value.find(s => s.value === value)?.description || ''
})

watch(() => props.show, (visible) => {
  if (visible) {
    requirement.value = ''
    settings.value = defaultSettings()
  }
})

function defaultSettings() {
  return {
    mode: 'local',
    scene: 'business',
    format: 'html',
    pages: 12,
    stylePreset: 'auto',
    customPrompt: '',
    enableWebSearch: false,
  }
}

function normalizeOutputFormat(format) {
  return String(format || '').includes('pptx') ? 'pptx' : 'html'
}

function formatOptions() {
  const isCloud = settings.value.mode === 'cloud'
  return [
    {
      value: 'html',
      label: 'HTML 演示文稿',
      icon: 'ri-global-line',
      description: isCloud ? '支持应用内预览，下载后本地留存' : '沿用本地 HTML 生成链路',
      badge: isCloud ? '云端可预览' : '本地',
      accent: 'emerald',
    },
    {
      value: 'pptx',
      label: 'PPTX 演示文稿',
      icon: 'ri-file-ppt-line',
      description: isCloud ? '生成后下载，用系统应用打开' : '沿用本地基础版 PPTX',
      badge: isCloud ? '云端' : '本地基础版',
      accent: 'amber',
    },
  ]
}

function setMode(mode) {
  settings.value.mode = mode === 'cloud' ? 'cloud' : 'local'
  setFormat(settings.value.format)
}

function setFormat(format) {
  settings.value.format = normalizeOutputFormat(format)
  const options = styleOptions.value
  if (!options.some(s => s.value === settings.value.stylePreset)) {
    settings.value.stylePreset = 'auto'
  }
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('start', {
    requirement: requirement.value.trim(),
    settings: { ...settings.value },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="560" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-400/14">
          <i class="ri-slideshow-line text-[14px] text-brand-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成 PPT</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">根据资料和需求生成演示文稿</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-brand-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">PPT 需求</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ requirement.length }} 字</span>
        </div>
        <textarea
          v-model="requirement"
          placeholder="例如：为这份商业计划书制作一份投资人演示"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-brand-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-brand-400'"
        />
      </div>

      <ReferenceContextList
        :items="ctxItems"
        :is-dark="isDark"
        title="参考资料"
        :empty-text="settings.mode !== 'cloud' ? '本地模式请在左侧“文档”或“知识库”选择资料' : '未选择资料时，将仅根据你的 PPT 需求生成'"
        accent-class="text-brand-400"
      />

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="settings.enableWebSearch ? (isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-white text-lt-aux')">
            <i class="ri-global-line text-[15px]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索补充资料</div>
            <div class="text-[9px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ settings.mode === 'cloud' ? '云端 PPT 会按此设置检索公开信息' : '本地内容规划可使用当前可用的联网工具补充背景资料' }}
            </div>
          </div>
          <button @click="settings.enableWebSearch = !settings.enableWebSearch"
            class="w-9 h-5 rounded-full relative transition-colors shrink-0"
            :class="settings.enableWebSearch ? 'bg-brand-500' : (isDark ? 'bg-d4' : 'bg-l4')">
            <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
              :style="{ transform: settings.enableWebSearch ? 'translateX(16px)' : 'translateX(0)' }" />
          </button>
        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-cloud-line text-[12px] text-brand-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">生成方式</span>
        </div>
        <OptionSelector
          :model-value="settings.mode"
          :options="modeOptions"
          :is-dark="isDark"
          default-accent="brand"
          @update:model-value="setMode"
        />
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-stack-line text-[12px] text-brand-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">演示场景</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="scene in scenes" :key="scene.id" @click="settings.scene = scene.id"
            class="rounded-lg p-2 text-left transition-all"
            :class="settings.scene === scene.id
              ? (isDark ? 'bg-brand-400/10 border border-brand-400/30' : 'bg-brand-50 border border-brand-200')
              : (isDark ? 'border border-d4 hover:border-brand-400/20 bg-d0' : 'border border-bdrF hover:border-brand-200 bg-white')">
            <div class="flex items-center gap-1.5 mb-0.5">
              <i :class="[scene.icon + ' text-[11px]', settings.scene === scene.id ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
              <span class="text-[11px] font-bold" :class="settings.scene === scene.id ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ scene.title }}</span>
            </div>
            <p class="text-[9px] leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ scene.desc }}</p>
          </button>
        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-file-copy-line text-[12px] text-emerald-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">输出格式</span>
        </div>
        <OptionSelector
          :model-value="currentFormat"
          :options="formatOptions()"
          :is-dark="isDark"
          size="comfortable"
          @update:model-value="setFormat"
        />
      </div>

      <div v-if="settings.mode === 'cloud'" class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-palette-line text-[12px] text-purple-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">视觉风格</span>
          <span class="ctx-pill text-[8px] ml-auto" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-white text-lt-aux border border-bdrF'">
            {{ currentFormat.toUpperCase() }}
          </span>
        </div>
        <select
          v-model="settings.stylePreset"
          class="w-full h-9 px-2.5 rounded-lg text-[12px] outline-none transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40'
            : 'bg-white border border-bdrF text-lt-sub focus:border-brand-400'"
        >
          <option v-for="style in styleOptions" :key="style.value" :value="style.value">
            {{ style.label }} · {{ style.category }}
          </option>
        </select>
        <p v-if="selectedStyleDescription" class="mt-1.5 text-[9px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ selectedStyleDescription }}
        </p>
        <textarea
          v-model="settings.customPrompt"
          rows="2"
          placeholder="补充视觉偏好，例如：更克制、数据感更强、适合管理层阅读"
          class="mt-2 w-full px-3 py-2 rounded-lg text-[11px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-brand-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-brand-400'"
        />
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-hashtag text-[12px] text-brand-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">页数</span>
          <div class="flex-1" />
          <span class="text-[13px] font-mono font-bold rounded-md px-1.5 py-0.5 min-w-[36px] text-center"
            :class="isDark ? 'text-brand-400 bg-d0' : 'text-brand-600 bg-white'">{{ settings.pages || 12 }}</span>
        </div>
        <input v-model.number="settings.pages" type="range" min="5" max="30" step="1" class="w-full accent-brand-400" />
        <div class="flex items-center justify-between mt-1.5">
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-white border border-bdrF'" style="font-size:9px">5 简短</span>
          <span class="ctx-pill" :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/15' : 'text-brand-600 bg-brand-50 border border-brand-100'" style="font-size:9px">12 标准</span>
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-white border border-bdrF'" style="font-size:9px">30 详细</span>
        </div>
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
        <button
          :disabled="!canSubmit"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'text-white bg-brand-500 hover:bg-brand-600 shadow-[0_4px_14px_rgba(108,138,255,0.3)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始生成
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
