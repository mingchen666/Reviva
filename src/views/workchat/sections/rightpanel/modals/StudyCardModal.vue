<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MsModal from '@/components/MsModal/MsModal.vue'
import { readableGenerationContexts } from '@/utils/generationContext'
import GenerationSourceOptions from './GenerationSourceOptions.vue'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  ctxItems: { type: Array, default: () => [] },
  wikiItems: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:show', 'submit'])

const showModal = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const topic = ref('')
const webEnabled = ref(false)

const usableCtxItems = computed(() => readableGenerationContexts(props.ctxItems))
const hasWikiSource = computed(() => (props.wikiItems || []).some(item => item?.id || item?.wikiId))
const canSubmit = computed(() => topic.value.trim().length > 0 || usableCtxItems.value.length > 0 || hasWikiSource.value)
const hint = computed(() => {
  if (!canSubmit.value) return '请输入主题，或勾选具体文件、知识库或 Wiki'
  return ''
})

watch(() => props.show, (v) => {
  if (v) {
    topic.value = ''
    webEnabled.value = false
  }
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    toolId: 'studycard',
    mode: 'local',
    topic: topic.value.trim(),
    params: {
      webSearch: { enabled: webEnabled.value, provider: 'auto' },
    },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="540" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-400/14">
          <i class="ri-coupon-line text-[14px] text-amber-500" />
        </div>
        <div>
          <div class="fs-body font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成知识卡片</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">围绕考点生成四种交互卡片：概念、易错、简答、记忆</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-amber-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">卡片主题</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ topic.length }} 字</span>
        </div>
        <textarea
          v-model="topic"
          placeholder="例如：操作系统死锁 / 可留空让 AI 从资料中推断"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim/50 focus:border-amber-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder:text-lt-aux/40 focus:border-amber-400'"
        />
      </div>

      <div class="rounded-xl p-3 flex items-center gap-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-white/5' : 'bg-amber-50'">
          <i class="ri-stack-line text-[14px] text-amber-500" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">四种卡片类型</div>
          <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            概念卡 · 易错卡 · 简答题卡 · 记忆卡
          </div>
        </div>
      </div>

      <GenerationSourceOptions
        :items="usableCtxItems"
        :wiki-items="wikiItems"
        :is-dark="isDark"
        accent-class="text-amber-400"
        active-class="bg-amber-500"
        v-model:web-enabled="webEnabled"
      />
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
            ? 'text-white bg-amber-500 hover:bg-amber-600 shadow-[0_4px_14px_rgba(245,158,11,0.25)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始生成
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
