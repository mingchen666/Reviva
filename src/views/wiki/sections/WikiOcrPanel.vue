<script setup>
import { computed } from 'vue'

const props = defineProps({
  providers: { type: Array, default: () => [] },
  jobs: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['configure'])

const supportedProviders = computed(() => props.providers.filter(item => ['mineru', 'paddleocr'].includes(item.type)))
const enabledCount = computed(() => supportedProviders.value.filter(item => item.enabled).length)
const totalCount = computed(() => supportedProviders.value.length)
const pendingCount = computed(() => props.jobs.filter(item => ['pending', 'running', 'failed'].includes(item.status)).length)
const hintText = computed(() => {
  if (!totalCount.value) return '扫描、图片型、混合型或本地抽取失败的 PDF 会等待配置 OCR 服务后继续处理'
  if (!enabledCount.value) return '已有 OCR 服务，但当前没有启用项'
  return '需要 OCR/版面解析的 PDF 会自动调用已启用服务'
})
</script>

<template>
  <section>
    <div class="flex items-center justify-between">
      <h2 class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">自动 OCR</h2>
      <button
        class="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
        :class="isDark ? 'text-brand-400 hover:bg-brand-400/10' : 'text-brand-500 hover:bg-brand-50'"
        @click="emit('configure')">
        <i class="ri-settings-3-line text-[12px]" />
        设置
      </button>
    </div>
    <div class="mt-2 ocr-box" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-white text-lt-aux border border-bdrF'">
      <span class="inline-flex items-center gap-1"><i class="ri-toggle-line text-[12px]" />启用 {{ enabledCount }} / {{ totalCount }}</span>
      <span class="inline-flex items-center gap-1"><i class="ri-loader-4-line text-[12px]" />任务 {{ pendingCount }}</span>
    </div>
    <p class="mt-1.5 text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ hintText }}</p>
  </section>
</template>

<style scoped>
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ocr-box {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 10px;
}
</style>
