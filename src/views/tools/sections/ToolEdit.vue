<script setup>
import { ref, computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'

const props = defineProps({
  editTool: Object,
  isDark: Boolean,
})

const emit = defineEmits(['cancel', 'save'])
const agentsStore = useAgentsStore()

const isBuiltinConfig = computed(() => !!props.editTool.isBuiltinConfig)
const hasProviderConfig = computed(() => {
  const cfg = props.editTool.providerConfig
  return cfg && (cfg.providerLabel || (cfg.providers && cfg.providers.length > 0))
})
const isPerProviderTool = computed(() => !!props.editTool.providerConfig?.providerLabel)

// For legacy multi-provider tools (e.g. translate)
const currentProvider = computed(() => {
  const cfg = props.editTool.providerConfig
  if (!cfg || !cfg.providers) return null
  return cfg.providers.find(p => p.key === cfg.provider) || null
})
const currentProviderNeedsKey = computed(() => {
  if (isPerProviderTool.value) return props.editTool.needsKey === true || props.editTool.needsKey === 'optional'
  return currentProvider.value?.needsKey ?? true
})
const isOptionalKey = computed(() => {
  if (isPerProviderTool.value) return props.editTool.needsKey === 'optional'
  return false
})
const currentProviderDefaultUrl = computed(() => {
  if (isPerProviderTool.value) return props.editTool.providerConfig?.defaultUrl || ''
  return currentProvider.value?.defaultUrl || ''
})

const paramLabelMap = { max_results: '最大结果数', language: '搜索语言' }
const paramPlaceholderMap = { max_results: '5', language: 'zh-CN' }
const paramHintMap = { max_results: '每次搜索返回的结果数', language: '如 zh-CN、en、ja' }

function selectProvider(p) {
  props.editTool.providerConfig.provider = p.key
  // Auto-fill baseUrl with default if empty or was auto-filled before
  if (!props.editTool.providerConfig.baseUrl || props.editTool.providerConfig.baseUrl === currentProviderDefaultUrl.value) {
    props.editTool.providerConfig.baseUrl = ''
  }
  // Clear apiKey if switching to a provider that doesn't need it
  if (!p.needsKey) props.editTool.providerConfig.apiKey = ''
}
const catOptions = computed(() => agentsStore.TOOL_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon, color: c.color })))
const iconOptions = ['ri-global-line', 'ri-search-line', 'ri-search-eye-line', 'ri-microsoft-line', 'ri-file-text-line', 'ri-database-2-line', 'ri-brain-line', 'ri-code-s-slash-line', 'ri-terminal-line', 'ri-tools-line', 'ri-cpu-line', 'ri-translate-2', 'ri-calculator-line', 'ri-link', 'ri-folder-line']
const colorOptions = ['#3B82F6', '#4ADE80', '#FACC15', '#F87171', '#6C8AFF', '#A78BFA', '#EC4899', '#8B5CF6', '#38BDF8', '#14B8A6', '#FB923C']
const methodOptions = ['GET', 'POST', 'PUT', 'DELETE']
const typeOptions = [
  { key: 'api', label: 'API 调用', desc: '通过 HTTP 请求调用外部 API', icon: 'ri-global-line' },
  { key: 'script', label: '本地脚本', desc: '即将支持，当前暂不可创建或执行', icon: 'ri-terminal-line', disabled: true },
]
const paramTypes = ['string', 'number', 'boolean', 'array', 'object']

const newParamName = ref('')
const newParamType = ref('string')
const newParamRequired = ref(false)
const newParamDesc = ref('')

function addParam() {
  if (!newParamName.value.trim()) return
  props.editTool.params.push({ name: newParamName.value.trim(), type: newParamType.value, required: newParamRequired.value, desc: newParamDesc.value.trim() })
  newParamName.value = ''
  newParamType.value = 'string'
  newParamRequired.value = false
  newParamDesc.value = ''
}

function removeParam(idx) {
  props.editTool.params.splice(idx, 1)
}

function selectToolType(option) {
  if (option?.disabled) return
  props.editTool.type = option.key
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[600px] max-h-[85vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i v-if="isBuiltinConfig" class="ri-settings-3-line text-brand-400 text-[14px]" />
            <i v-else class="ri-tools-line text-emerald-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ isBuiltinConfig ? '配置 · ' + editTool.name : (editTool.id ? '编辑 · ' + editTool.name : '新建自定义工具') }}</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"><i class="ri-close-line text-[14px]" /></button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="px-5 py-4 space-y-4">

            <!-- Builtin Config Mode: provider selection with details, auto-fill URL, user params -->
            <template v-if="isBuiltinConfig">
              <!-- Provider Selection (legacy multi-provider tools only, e.g. translate) -->
              <div v-if="editTool.providerConfig?.providers?.length > 0" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-2 mb-3"><i class="ri-server-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择服务商</span></div>
                <div class="space-y-2">
                  <button v-for="p in editTool.providerConfig.providers" :key="p.key" @click="selectProvider(p)"
                    class="w-full rounded-lg p-3 text-left transition-all flex items-center gap-3"
                    :class="editTool.providerConfig.provider === p.key ? (isDark ? 'bg-brand-400/10 border border-brand-400/30' : 'bg-brand-50 border border-brand-200') : (isDark ? 'border border-d4 hover:border-brand-400/20 bg-d0' : 'border border-bdrF hover:border-brand-200 bg-l2')">
                    <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" :class="editTool.providerConfig.provider === p.key ? (isDark ? 'border-brand-400' : 'border-brand-500') : (isDark ? 'border-wt-dim' : 'border-lt-aux')">
                      <span v-if="editTool.providerConfig.provider === p.key" class="w-1.5 h-1.5 rounded-full" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[12px] font-bold" :class="editTool.providerConfig.provider === p.key ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ p.label }}</span>
                        <span v-if="!p.needsKey" class="ctx-pill text-[8px]" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-500 border border-emerald-100'">免费</span>
                      </div>
                      <p class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ p.desc }}</p>
                      <p v-if="p.defaultUrl" class="text-[9px] font-mono mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">默认 URL: {{ p.defaultUrl }}</p>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Provider Info (per-provider tools: Tavily/SearXNG/Bing) -->
              <div v-if="isPerProviderTool" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-2 mb-3"><i class="ri-server-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">服务商</span></div>
                <div class="flex items-center gap-2">
                  <span class="ctx-pill text-[11px] font-bold" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-600 border border-brand-100'">{{ editTool.providerConfig.providerLabel }}</span>
                  <span v-if="!editTool.needsKey" class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">免费</span>
                  <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ editTool.providerConfig.providerDesc }}</span>
                </div>
              </div>

              <!-- API Key (for providers that need or optionally accept it) -->
              <div v-if="currentProviderNeedsKey" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-2 mb-3"><i class="ri-key-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key{{ isOptionalKey ? '（可选）' : '' }}</span></div>
                <input v-model="editTool.providerConfig.apiKey" type="password" :placeholder="isOptionalKey ? '部分实例需要 API Key，留空则不使用' : '输入服务商的 API Key'" class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'">
                <p class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ isOptionalKey ? '部分 SearXNG 实例需要 API Key，公共实例通常不需要' : 'API Key 安全保存在本地配置中，不会上传到云端' }}</p>
              </div>

              <!-- Base URL (auto-fill with default, allow override) — only for tools that have a URL config -->
              <div v-if="currentProviderDefaultUrl || editTool.providerConfig?.baseUrl" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-2 mb-3"><i class="ri-link text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Base URL</span></div>
                <input v-model="editTool.providerConfig.baseUrl" type="text" :placeholder="currentProviderDefaultUrl || '输入 Base URL'" class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'">
                <p class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">留空使用默认 URL {{ currentProviderDefaultUrl ? '(' + currentProviderDefaultUrl + ')' : '' }}，自建实例可填写自定义地址</p>
              </div>

              <!-- User Params (max_results, language for web_search) -->
              <div v-if="editTool.providerConfig.userParams" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-center gap-2 mb-3"><i class="ri-tune-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">常用参数</span></div>
                <div class="space-y-3">
                  <div v-for="(val, key) in editTool.providerConfig.userParams" :key="key" class="flex items-center gap-3">
                    <label class="text-[11px] font-medium shrink-0 w-[80px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ paramLabelMap[key] || key }}</label>
                    <input v-model="editTool.providerConfig.userParams[key]" type="text" :placeholder="paramPlaceholderMap[key] || ''" class="flex-1 h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
                    <span class="text-[10px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ paramHintMap[key] || '' }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Full Edit Mode (custom tools / new tool) -->
            <template v-if="!isBuiltinConfig">

            <!-- Type Selection -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-cpu-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具类型</span></div>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="t in typeOptions" :key="t.key" :disabled="t.disabled" @click="selectToolType(t)" class="rounded-lg p-3 text-left transition-all flex items-center gap-2.5" :class="t.disabled ? (isDark ? 'border border-d4 bg-d0 opacity-60 cursor-not-allowed' : 'border border-bdrF bg-l2 opacity-60 cursor-not-allowed') : (editTool.type === t.key ? (isDark ? 'bg-emerald-400/10 border border-emerald-400/30' : 'bg-emerald-50 border border-emerald-200') : (isDark ? 'border border-d4 hover:border-emerald-400/20 bg-d0' : 'border border-bdrF hover:border-emerald-200 bg-l2'))">
                  <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" :class="editTool.type === t.key ? (isDark ? 'border-emerald-400' : 'border-emerald-500') : (isDark ? 'border-wt-dim' : 'border-lt-aux')">
                    <span v-if="editTool.type === t.key" class="w-1.5 h-1.5 rounded-full" :class="isDark ? 'bg-emerald-400' : 'bg-emerald-500'" />
                  </div>
                  <i :class="t.icon + ' text-[14px] ' + (editTool.type === t.key ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux'))" />
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <div class="text-[12px] font-bold" :class="editTool.type === t.key ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ t.label }}</div>
                      <span v-if="t.disabled" class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">即将支持</span>
                    </div>
                    <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.desc }}</div>
                  </div>
                </button>
              </div>
            </div>

            <!-- Basic Info -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-profile-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础信息</span></div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称 <span class="text-red-400">*</span></label>
                  <input v-model="editTool.name" type="text" placeholder="输入工具名称" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述</label>
                  <textarea v-model="editTool.desc" rows="2" placeholder="描述工具的功能..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'"></textarea>
                </div>
                <div class="flex gap-4">
                  <div class="flex-1">
                    <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">分类</label>
                    <div class="grid grid-cols-2 gap-1.5">
                      <button v-for="c in catOptions" :key="c.key" @click="editTool.cat = c.key" class="h-8 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all"
                        :class="editTool.cat === c.key ? (isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30' : 'bg-emerald-50 text-emerald-500 border border-emerald-200') : (isDark ? 'bg-d0 text-wt-aux border border-d4 hover:border-emerald-400/20' : 'bg-l2 text-lt-aux border border-bdrF hover:border-emerald-200')">
                        <i :class="c.icon + ' text-[12px]'" :style="'color:' + c.color" /> {{ c.label }}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图标</label>
                    <div class="flex gap-1.5 flex-wrap max-w-[160px]">
                      <button v-for="ic in iconOptions" :key="ic" @click="editTool.icon = ic" class="w-8 h-8 rounded-lg flex items-center justify-center transition-all" :class="editTool.icon === ic ? (isDark ? 'bg-emerald-400/12 border border-emerald-400/30' : 'bg-emerald-50 border border-emerald-100') : (isDark ? 'border border-d4 hover:border-emerald-400/30' : 'border border-bdrF hover:border-emerald-200')">
                        <i :class="ic + ' text-[14px] ' + (editTool.icon === ic ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux'))" />
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">颜色</label>
                  <div class="flex gap-1.5 flex-wrap">
                    <button v-for="c in colorOptions" :key="c" @click="editTool.color = c" class="w-6 h-6 rounded-full transition-all" :class="editTool.color === c ? 'ring-2 ring-offset-2 scale-110' : ''" :style="'background-color:' + c + ';' + (editTool.color === c ? (isDark ? '--tw-ring-offset-color:#252530;--tw-ring-color:rgba(255,255,255,0.4)' : '--tw-ring-offset-color:#f5f4f3;--tw-ring-color:rgba(255,255,255,0.8)') : '')" />
                  </div>
                </div>
              </div>
            </div>

            <!-- API Config -->
            <div v-if="editTool.type === 'api'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-global-line text-blue-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API 配置</span></div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API URL <span class="text-red-400">*</span></label>
                  <input v-model="editTool.apiUrl" type="text" placeholder="https://api.example.com/v1/..." class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-blue-400'">
                </div>
                <div class="flex gap-3">
                  <div class="flex-1">
                    <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">请求方法</label>
                    <select v-model="editTool.method" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-blue-400'">
                      <option v-for="m in methodOptions" :key="m">{{ m }}</option>
                    </select>
                  </div>
                  <div class="flex-1">
                    <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">响应格式</label>
                    <input v-model="editTool.responseFormat" type="text" placeholder="JSON" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-blue-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-blue-400'">
                  </div>
                </div>
              </div>
            </div>

            <!-- Script Config -->
            <div v-if="editTool.type === 'script'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-terminal-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">脚本配置</span></div>
              <div class="space-y-3">
                <div class="rounded-lg px-3 py-2 text-[11px] leading-relaxed" :class="isDark ? 'bg-amber-400/8 text-amber-300 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-100'">
                  本地脚本工具暂未开放运行，已保存的脚本不会被 Agent 注册或执行。
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">脚本路径 <span class="text-red-400">*</span></label>
                  <input v-model="editTool.scriptPath" type="text" disabled placeholder="scripts/custom_tool.py" class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors cursor-not-allowed opacity-70" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux'">
                </div>
              </div>
            </div>

            <!-- Parameters -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3"><div class="flex items-center gap-2"><i class="ri-list-ordered text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">参数定义</span></div><span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ editTool.params.length }} 个参数</span></div>
              <div v-if="editTool.params.length > 0" class="space-y-1.5 mb-3">
                <div v-for="(p, idx) in editTool.params" :key="idx" class="flex items-center gap-2 py-1.5 px-2.5 rounded-lg" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                  <span class="text-[11px] font-mono font-bold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">{{ p.name }}</span>
                  <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">{{ p.type }}</span>
                  <span v-if="p.required" class="ctx-pill text-[9px]" :class="isDark ? 'bg-red-400/8 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">必填</span>
                  <span class="text-[10px] flex-1 truncate" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ p.desc }}</span>
                  <button @click="removeParam(idx)" class="text-[10px] shrink-0" :class="isDark ? 'text-wt-dim hover:text-red-400' : 'text-lt-aux hover:text-red-400'"><i class="ri-close-line" /></button>
                </div>
              </div>
              <div class="flex items-center gap-2 pt-2" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
                <input v-model="newParamName" type="text" placeholder="参数名" class="w-[100px] h-7 px-2 rounded-md text-[11px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
                <select v-model="newParamType" class="w-[70px] h-7 px-2 rounded-md text-[10px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-l2 border border-bdrF text-lt-sub'">
                  <option v-for="pt in paramTypes" :key="pt">{{ pt }}</option>
                </select>
                <div class="toggle shrink-0" :class="newParamRequired ? 'on' : (isDark ? 'off' : 'light-off')" @click="newParamRequired = !newParamRequired" />
                <input v-model="newParamDesc" type="text" placeholder="描述" class="flex-1 h-7 px-2 rounded-md text-[10px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
                <button @click="addParam" class="h-7 px-2 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/15' : 'bg-emerald-50 text-emerald-500 border border-emerald-100 hover:bg-emerald-100'"><i class="ri-add-line text-[10px]" /></button>
              </div>
            </div>

            <!-- Permissions -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-shield-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">权限与限制</span></div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">权限要求</label>
                  <input v-model="editTool.permReq" type="text" placeholder="如 webSearch, fileRead, execCommand..." class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'">
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">安全限制</label>
                  <textarea v-model="editTool.sandbox" rows="2" placeholder="描述该工具的安全限制和调用上限..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-amber-400'"></textarea>
                </div>
              </div>
            </div>

            </template> <!-- end !isBuiltinConfig -->

          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button @click="emit('save')" class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors" :class="isDark ? 'bg-emerald-400 text-d0 hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'"><i class="ri-check-line text-[12px]" /> 保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
