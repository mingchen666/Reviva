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
const mode = ref('local')
const granularity = ref('balanced')  // concise | balanced | detailed

const usableCtxItems = computed(() => readableGenerationContexts(props.ctxItems))
const canSubmit = computed(() => topic.value.trim().length > 0 || usableCtxItems.value.length > 0)
const hint = computed(() => {
  if (!topic.value.trim() && !usableCtxItems.value.length) return '请输入主题或勾选具体文件/知识库'
  return ''
})

watch(() => props.show, (v) => {
  if (v) {
    topic.value = ''
    mode.value = 'local'
    granularity.value = 'balanced'
  }
})

function pickMode(m) {
  mode.value = m
}

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    toolId: 'graph',
    mode: mode.value,
    topic: topic.value.trim(),
    params: { granularity: granularity.value },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="540" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-400/14">
          <i class="ri-share-circle-line text-[14px] text-amber-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">生成知识图谱</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">从资料中抽取实体与关系</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <!-- 模式 -->
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-cloud-line text-[12px] text-amber-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">生成方式</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button @click="pickMode('local')"
            class="rounded-lg p-2 text-left transition-all"
            :class="mode === 'local'
              ? (isDark ? 'bg-amber-400/10 border border-amber-400/30' : 'bg-amber-50 border border-amber-200')
              : (isDark ? 'border border-d4 hover:border-amber-400/20 bg-d0' : 'border border-bdrF hover:border-amber-200 bg-white')">
            <div class="flex items-center gap-1.5 mb-0.5">
              <i class="ri-computer-line text-[11px]"
                :class="mode === 'local' ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" />
              <span class="text-[11px] font-bold"
                :class="mode === 'local' ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">本地生成</span>
              <span class="ctx-pill text-[8px] ml-auto"
                :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">免费</span>
            </div>
            <p class="text-[9px] leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本机模型单次抽取 JSON</p>
          </button>
          <button @click="pickMode('cloud')"
            class="rounded-lg p-2 text-left transition-all"
            :class="mode === 'cloud'
              ? (isDark ? 'bg-sky-400/10 border border-sky-400/30' : 'bg-sky-50 border border-sky-200')
              : (isDark ? 'border border-d4 hover:border-sky-400/20 bg-d0' : 'border border-bdrF hover:border-sky-200 bg-white')">
            <div class="flex items-center gap-1.5 mb-0.5">
              <i class="ri-cloud-line text-[11px]"
                :class="mode === 'cloud' ? (isDark ? 'text-sky-400' : 'text-sky-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" />
              <span class="text-[11px] font-bold"
                :class="mode === 'cloud' ? (isDark ? 'text-sky-400' : 'text-sky-600') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">云端生成</span>
              <span class="ctx-pill text-[8px] ml-auto"
                :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-500 border border-amber-100'">即将开放</span>
            </div>
            <p class="text-[9px] leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">多文档融合 + 关系推理</p>
          </button>
        </div>
      </div>

      <!-- 主题 -->
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-amber-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">主题 / 抽取需求</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ topic.length }} 字</span>
        </div>
        <textarea
          v-model="topic"
          placeholder="例如：从这些论文中抽取核心概念与引用关系，或直接给出主题"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-amber-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-amber-400'"
        />
      </div>

      <ReferenceContextList :items="usableCtxItems" :is-dark="isDark" accent-class="text-amber-400" />
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
            ? 'text-white bg-amber-500 hover:bg-amber-600 shadow-[0_4px_14px_rgba(245,158,11,0.3)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始抽取
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
