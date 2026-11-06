<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import ReferenceContextList from './ReferenceContextList.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  ctxItems: { type: Array, default: () => [] },
  wikiItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:show', 'start'])

const showModal = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const requirement = ref('')
const guideType = ref('comprehensive')
const enableWebSearch = ref(false)

const typeOptions = [
  { value: 'comprehensive', label: '综合指南', icon: 'ri-book-2-line', desc: '系统学习：目标 + 概念 + 章节 + 练习 + 复习清单' },
  { value: 'exam-cram', label: '考前速成', icon: 'ri-flashlight-line', desc: '高频考点 + 必背公式 + 易错陷阱 + 少量练习' },
  { value: 'concept-dive', label: '概念解析', icon: 'ri-lightbulb-line', desc: '渐进讲解 + 类比 + 自测问题 + 知识关联' },
  { value: 'summary', label: '摘要综述', icon: 'ri-file-list-2-line', desc: '一页浓缩 + 关键要点 + 核心术语速查' },
]

const sourceItems = computed(() => [...(props.ctxItems || []), ...(props.wikiItems || [])])
const hasContext = computed(() => sourceItems.value.length > 0)
const canSubmit = computed(() => {
  return requirement.value.trim().length > 0 || hasContext.value
})
const hint = computed(() => {
  if (!requirement.value.trim() && !hasContext.value) return '请输入学习需求，或选择参考资料'
  return ''
})

watch(() => props.show, (visible) => {
  if (visible) {
    requirement.value = ''
    guideType.value = 'comprehensive'
    enableWebSearch.value = false
  }
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('start', {
    requirement: requirement.value.trim(),
    guideType: guideType.value,
    settings: { enableWebSearch: enableWebSearch.value },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="600" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-400/14">
          <i class="ri-book-open-line text-[14px] text-emerald-500" />
        </div>
        <div>
          <div class="fs-body font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">学习指南</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">基于资料生成结构化学习材料</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2.5">
          <i class="ri-shapes-line text-[12px] text-emerald-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">指南类型</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            @click="guideType = opt.value"
            class="rounded-lg p-2.5 text-left transition-all border"
            :class="guideType === opt.value
              ? (isDark ? 'border-emerald-400/40 bg-emerald-400/8' : 'border-emerald-300 bg-emerald-50')
              : (isDark ? 'border-d4 hover:border-emerald-400/20 bg-d0' : 'border-bdrF hover:border-emerald-200 bg-white')"
          >
            <div class="flex items-center gap-1.5 mb-1">
              <i :class="[opt.icon, 'text-[13px]', guideType === opt.value ? 'text-emerald-500' : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
              <span class="text-[11px] font-semibold" :class="guideType === opt.value ? 'text-emerald-500' : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ opt.label }}</span>
            </div>
            <p class="text-[9px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ opt.desc }}</p>
          </button>
        </div>
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-emerald-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">学习需求</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ requirement.length }} 字</span>
        </div>
        <textarea
          v-model="requirement"
          placeholder="例如：帮我整理这份资料的核心知识点，生成适合考前复习的学习指南"
          rows="2"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-emerald-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-emerald-400'"
        />
      </div>

      <ReferenceContextList
        :items="sourceItems"
        :is-dark="isDark"
        title="参考资料"
        empty-text="未选择资料时，将仅根据你的学习需求生成"
        accent-class="text-emerald-400"
      />

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="enableWebSearch ? (isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-white text-lt-aux')">
            <i class="ri-global-line text-[15px]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索补充</div>
            <div class="text-[9px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              按需开启，当前资料优先
            </div>
          </div>
          <button @click="enableWebSearch = !enableWebSearch"
            class="w-9 h-5 rounded-full relative transition-colors shrink-0"
            :class="enableWebSearch ? 'bg-emerald-500' : (isDark ? 'bg-d4' : 'bg-l4')">
            <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
              :style="{ transform: enableWebSearch ? 'translateX(16px)' : 'translateX(0)' }" />
          </button>
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
          :class="isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main'">
          取消
        </button>
        <button
          :disabled="!canSubmit"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'text-white bg-emerald-500 hover:bg-emerald-600 shadow-[0_4px_14px_rgba(16,185,129,0.3)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始生成
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
