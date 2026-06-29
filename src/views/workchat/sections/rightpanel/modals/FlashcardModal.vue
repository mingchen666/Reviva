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
const count = ref(12)
const style = ref('mixed')

const usableCtxItems = computed(() => readableGenerationContexts(props.ctxItems))
const canSubmit = computed(() => topic.value.trim().length > 0 || usableCtxItems.value.length > 0)
const hint = computed(() => {
  if (!topic.value.trim() && !usableCtxItems.value.length) return '请输入主题或勾选具体文件/知识库'
  return ''
})

const styles = [
  { value: 'mixed', label: '混合', icon: 'ri-shuffle-line' },
  { value: 'qa', label: '问答', icon: 'ri-question-answer-line' },
  { value: 'cloze', label: '填空', icon: 'ri-input-cursor-move' },
]

watch(() => props.show, (v) => {
  if (v) {
    topic.value = ''
    count.value = 12
    style.value = 'mixed'
  }
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    toolId: 'flashcard',
    mode: 'local',
    topic: topic.value.trim(),
    params: {
      count: count.value,
      style: style.value,
    },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="540" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-400/14">
          <i class="ri-stack-line text-[14px] text-pink-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成闪卡</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">将主题或资料转换为可翻面的复习卡片</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-pink-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">闪卡主题</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ topic.length }} 字</span>
        </div>
        <textarea
          v-model="topic"
          placeholder="例如：操作系统进程调度 / 可留空让 AI 从资料中推断"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-pink-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-pink-400'"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-hashtag text-[12px] text-pink-400" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">数量</span>
            <div class="flex-1" />
            <span class="text-[13px] font-mono font-bold rounded-md px-1.5 py-0.5 min-w-[36px] text-center"
              :class="isDark ? 'text-pink-400 bg-d0' : 'text-pink-600 bg-white'">{{ count }}</span>
          </div>
          <input v-model.number="count" type="range" min="6" max="24" step="1" class="w-full accent-pink-400" />
        </div>

        <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
          <div class="flex items-center gap-2 mb-2">
            <i class="ri-layout-grid-line text-[12px] text-pink-400" />
            <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">卡片类型</span>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button v-for="item in styles" :key="item.value"
              @click="style = item.value"
              class="rounded-lg py-2 px-1 text-center transition-all flex flex-col items-center gap-0.5"
              :class="style === item.value
                ? (isDark ? 'bg-pink-400/10 border border-pink-400/30' : 'bg-pink-50 border border-pink-200')
                : (isDark ? 'border border-d4 hover:border-pink-400/20 bg-d0' : 'border border-bdrF hover:border-pink-200 bg-white')">
              <i :class="[item.icon + ' text-[13px]', style === item.value ? (isDark ? 'text-pink-400' : 'text-pink-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')]" />
              <span class="text-[10px] font-medium"
                :class="style === item.value ? (isDark ? 'text-pink-400' : 'text-pink-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <ReferenceContextList :items="usableCtxItems" :is-dark="isDark" accent-class="text-pink-400" />
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
            ? 'text-white bg-pink-500 hover:bg-pink-600 shadow-[0_4px_14px_rgba(236,72,153,0.25)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始生成
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
