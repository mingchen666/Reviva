<script setup>
import { ref, watch, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import * as kbApi from '@/apis/kb-source'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
})
const emit = defineEmits(['close', 'apply'])
const settingsStore = useSettingsStore()
const msg = useMessage()

const requestExample = ref('')
const responseExample = ref('')
const baseUrl = ref('')
const analyzing = ref(false)
const result = ref(null)

// Get user's configured model providers for the selector
const providers = computed(() => {
  const list = (settingsStore.providers || []).filter(p => p.apiKey && p.enabled !== false)
  return list
})
const selectedProviderId = ref('')
const selectedModel = ref('')

watch(() => props.show, (val) => {
  if (val) {
    requestExample.value = ''
    responseExample.value = ''
    baseUrl.value = ''
    result.value = null
    // Auto-select first configured provider
    if (providers.value.length && !selectedProviderId.value) {
      selectedProviderId.value = providers.value[0].id
      const models = providers.value[0].models || []
      if (models.length) selectedModel.value = models[0].id || models[0]
    }
  }
})

const currentProvider = computed(() => providers.value.find(p => p.id === selectedProviderId.value))
const currentModels = computed(() => currentProvider.value?.models || [])

async function analyze() {
  if (!requestExample.value.trim() && !responseExample.value.trim()) {
    msg.warning('请粘贴请求或响应示例')
    return
  }
  if (!currentProvider.value) {
    msg.warning('请先在设置中配置模型服务商')
    return
  }
  analyzing.value = true
  result.value = null
  try {
    const res = await kbApi.analyzeRequestResponse({
      requestExample: requestExample.value,
      responseExample: responseExample.value,
      baseUrl: baseUrl.value,
      providerId: currentProvider.value.id,
      apiKey: currentProvider.value.apiKey,
      modelBaseUrl: currentProvider.value.baseUrl,
      model: selectedModel.value,
    })
    if (res.success && res.config) {
      result.value = res.config
      msg.success('分析成功，请检查配置')
    } else {
      msg.error(res.error || '分析失败')
    }
  } catch (e) {
    msg.error(e?.message || '分析失败')
  } finally {
    analyzing.value = false
  }
}

function applyConfig() {
  if (!result.value) return
  emit('apply', result.value)
  emit('close')
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[60] flex items-center justify-center" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40" />
    <div class="relative z-10 w-[640px] max-h-[85vh] rounded-xl flex flex-col overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 h-14 border-b shrink-0" :class="isDark ? 'border-bdr' : 'border-bdrF'">
        <div class="flex items-center gap-2">
          <i class="ri-magic-line text-[16px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
          <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">AI 辅助适配</span>
        </div>
        <button class="w-7 h-7 rounded flex items-center justify-center" :class="isDark ? 'hover:bg-d4 text-wt-dim' : 'hover:bg-l4 text-lt-aux'" @click="emit('close')">
          <i class="ri-close-line text-[16px]" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 thin-scroll">
        <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          粘贴知识库 API 的请求和响应示例，AI 会自动分析并生成适配配置。
        </p>

        <!-- Model selector -->
        <div class="flex items-center gap-2">
          <select
            v-model="selectedProviderId"
            class="h-8 px-2 rounded-lg text-[12px] outline-none"
            :class="isDark ? 'bg-d2 border border-bdr text-wt-main' : 'bg-l2 border border-bdrF text-lt-main'">
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select
            v-if="currentModels.length"
            v-model="selectedModel"
            class="h-8 px-2 rounded-lg text-[12px] outline-none flex-1"
            :class="isDark ? 'bg-d2 border border-bdr text-wt-main' : 'bg-l2 border border-bdrF text-lt-main'">
            <option v-for="m in currentModels" :key="m.id || m" :value="m.id || m">{{ m.name || m.id || m }}</option>
          </select>
        </div>

        <!-- Base URL -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Base URL（可选）</label>
          <input
            v-model="baseUrl"
            class="w-full h-9 px-3 rounded-lg text-[13px] outline-none transition-colors font-mono"
            :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'"
            placeholder="https://api.example.com" />
        </div>

        <!-- Request example -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">请求示例</label>
          <textarea
            v-model="requestExample"
            rows="6"
            class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll"
            :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'"
            spellcheck="false"
            placeholder="粘贴 curl 命令或 HTTP 请求示例..." />
        </div>

        <!-- Response example -->
        <div>
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">响应示例</label>
          <textarea
            v-model="responseExample"
            rows="8"
            class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll"
            :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'"
            spellcheck="false"
            placeholder="粘贴 API 返回的 JSON 示例..." />
        </div>

        <!-- Result -->
        <div v-if="result">
          <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">AI 生成的配置</label>
          <textarea
            :value="JSON.stringify(result, null, 2)"
            rows="10"
            readonly
            class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none resize-none thin-scroll"
            :class="isDark ? 'bg-d1 border border-bdr text-wt-sub' : 'bg-l1 border border-bdrF text-lt-sub'"
            spellcheck="false" />
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-5 h-14 border-t items-center shrink-0" :class="isDark ? 'border-bdr' : 'border-bdrF'">
        <button class="h-9 px-4 rounded-lg text-[13px]" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" @click="emit('close')">取消</button>
        <button
          v-if="!result"
          class="h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5"
          :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-agent-500 text-white hover:bg-agent-600'"
          :disabled="analyzing"
          @click="analyze">
          <i :class="analyzing ? 'ri-loader-4-line animate-spin' : 'ri-magic-line'" class="text-[14px]" />
          {{ analyzing ? '分析中...' : 'AI 分析' }}
        </button>
        <button
          v-else
          class="h-9 px-4 rounded-lg text-[13px] font-medium"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
          @click="applyConfig">
          应用配置
        </button>
      </div>
    </div>
  </div>
</template>