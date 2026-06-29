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
const emit = defineEmits(['update:show', 'start'])

const showModal = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

const requirement = ref('')
const mode = ref('local')
const enableWebSearch = ref(true)

const modeOptions = [
  { value: 'local', label: '本地', icon: 'ri-computer-line', description: '使用本地智能体处理选中资料', badge: '本地', accent: 'sky' },
  { value: 'cloud', label: '云端', icon: 'ri-cloud-line', description: '调用云端深度研究服务', badge: '云端', accent: 'sky' },
]

const hasContext = computed(() => props.ctxItems.length > 0)
const canSubmit = computed(() => {
  if (mode.value !== 'cloud' && !hasContext.value) return false
  return requirement.value.trim().length > 0 || hasContext.value
})
const hint = computed(() => {
  if (mode.value !== 'cloud' && !hasContext.value) return '本地模式请先选择文件、文件夹或知识库'
  if (!requirement.value.trim() && !hasContext.value) return '请输入研究需求，或选择参考资料'
  return ''
})

watch(() => props.show, (visible) => {
  if (visible) {
    requirement.value = ''
    mode.value = 'local'
    enableWebSearch.value = true
  }
})

function handleSubmit() {
  if (!canSubmit.value) return
  emit('start', {
    requirement: requirement.value.trim(),
    settings: { mode: mode.value, enableWebSearch: enableWebSearch.value },
  })
}
</script>

<template>
  <MsModal v-model:show="showModal" :width="540" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-400/14">
          <i class="ri-search-eye-line text-[14px] text-sky-500" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">深度研究</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">基于资料和检索生成研究报告与可视化报告</div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-cloud-line text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">生成方式</span>
        </div>
        <OptionSelector
          v-model="mode"
          :options="modeOptions"
          :is-dark="isDark"
          default-accent="sky"
        />
      </div>

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px] text-sky-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">研究需求</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ requirement.length }} 字</span>
        </div>
        <textarea
          v-model="requirement"
          placeholder="例如：分析这些论文的研究方法异同，并搜索最新进展"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-sky-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-sky-400'"
        />
      </div>

      <ReferenceContextList
        :items="ctxItems"
        :is-dark="isDark"
        title="参考资料"
        :empty-text="mode !== 'cloud' ? '本地模式请在左侧“文档”或“知识库”选择资料' : '未选择资料时，将仅根据你的研究需求生成'"
        accent-class="text-sky-400"
      />

      <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center"
            :class="enableWebSearch ? (isDark ? 'bg-sky-400/12 text-sky-400' : 'bg-sky-50 text-sky-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-white text-lt-aux')">
            <i class="ri-global-line text-[15px]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网搜索补充资料</div>
            <div class="text-[9px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ mode === 'cloud' ? '云端研究会按此设置搜索公开来源' : '本地内置 agent 会使用当前可用的联网工具检索公开来源' }}
            </div>
          </div>
          <button @click="enableWebSearch = !enableWebSearch"
            class="w-9 h-5 rounded-full relative transition-colors shrink-0"
            :class="enableWebSearch ? 'bg-sky-500' : (isDark ? 'bg-d4' : 'bg-l4')">
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
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          :disabled="!canSubmit"
          @click="handleSubmit"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canSubmit
            ? 'text-white bg-sky-500 hover:bg-sky-600 shadow-[0_4px_14px_rgba(14,165,233,0.3)]'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
          开始研究
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
