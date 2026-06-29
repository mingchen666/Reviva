<script setup>
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  show: { type: Boolean, default: false },
  toolId: { type: String, required: true },
  toolName: { type: String, required: true },
  toolIcon: { type: String, required: true },
  toolColor: { type: String, default: '#6C8AFF' },
  toolDesc: { type: String, default: '' },
  requiredTools: { type: Array, default: () => [] },
  recommendedTools: { type: Array, default: () => [] },
  ctxItems: { type: Array, default: () => [] },
  placeholder: { type: String, default: '描述你的需求...' },
  width: { type: Number, default: 520 },
})

const emit = defineEmits(['update:show', 'start', 'goto-settings'])

const showModal = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const requirement = ref('')
const settings = ref({})

const defaultSettings = {
  ppt: { mode: 'local', scene: 'business', format: 'html', pages: 12, stylePreset: 'auto', customPrompt: '' },
  research: { mode: 'local', depth: 'standard', language: 'auto' },
}

watch(() => props.show, (val) => {
  if (val) {
    requirement.value = ''
    settings.value = { ...(defaultSettings[props.toolId] || {}) }
  }
})

const toolNameMap = {
  web_search: '网络搜索',
  web_search_bing: 'Bing 搜索',
  file_read: '文件读取',
  file_write: '文件写入',
  kb_search: '知识库检索',
  translate: '翻译',
  exec_command: '执行命令',
}

function resolveToolStatus(id) {
  if (typeof id === 'string' && id.startsWith('mcp:')) {
    const serverId = id.slice('mcp:'.length).split(':')[0]
    const server = agentsStore.mcpServers.find(s => s.id === serverId)
    return {
      id,
      name: server?.name || `MCP: ${serverId}`,
      configured: !!server?.enabled,
    }
  }

  const tool = agentsStore.toolList.find(t => t.id === id)
  if (tool && !tool.needsConfig) {
    return { id, name: tool.name || toolNameMap[id] || id, configured: true }
  }

  const cfg = agentsStore.toolProviderConfigMap[id]
  const configured = cfg?.provider && !(cfg.provider === 'tavily' && !cfg.apiKey)
  return { id, name: tool?.name || toolNameMap[id] || id, configured }
}

const toolStatusList = computed(() => {
  return props.requiredTools.map(t => ({ ...resolveToolStatus(t), required: true }))
})

const recommendedToolStatusList = computed(() => {
  return props.recommendedTools.map(t => ({ ...resolveToolStatus(t), required: false }))
})

const visibleToolStatusList = computed(() => {
  return [...toolStatusList.value, ...recommendedToolStatusList.value]
})

const allToolsConfigured = computed(() => toolStatusList.value.every(t => t.configured))
const canStart = computed(() => {
  if (!allToolsConfigured.value || requirement.value.trim().length === 0) return false
  const needsLocalContext = ['ppt', 'research'].includes(props.toolId) && settings.value?.mode !== 'cloud'
  return !needsLocalContext || props.ctxItems.length > 0
})

function handleStart() {
  if (!canStart.value) return
  emit('start', { requirement: requirement.value.trim(), settings: { ...settings.value } })
  requirement.value = ''
  settings.value = {}
}

function handleGotoSettings() {
  emit('goto-settings')
}

function fileIcon(item) {
  if (item.isDir || item.type === 'directory') return 'ri-folder-2-line'
  const ext = (item.name || item.path || '').split('.').pop().toLowerCase()
  if (['pdf'].includes(ext)) return 'ri-file-pdf-line'
  if (['doc', 'docx'].includes(ext)) return 'ri-file-word-line'
  if (['xls', 'xlsx'].includes(ext)) return 'ri-file-excel-line'
  if (['ppt', 'pptx'].includes(ext)) return 'ri-file-ppt-line'
  if (['md', 'txt'].includes(ext)) return 'ri-file-text-line'
  if (['jpg', 'png', 'gif', 'webp'].includes(ext)) return 'ri-image-line'
  return 'ri-file-line'
}
</script>

<template>
  <MsModal
    v-model:show="showModal"
    :width="width"
    :show-footer="true"
  >
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center" :style="{ background: toolColor + '14' }">
          <i :class="toolIcon + ' text-[14px]'" :style="{ color: toolColor }" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ toolName }} 配置</span>
      </div>
    </template>

    <div class="space-y-4">
      <!-- 需求输入 -->
      <div class="rounded-xl p-3.5" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-edit-line text-[12px]" :style="{ color: toolColor }" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">需求描述</span>
          <div class="flex-1" />
          <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ requirement.length }} 字</span>
        </div>
        <textarea
          v-model="requirement"
          :placeholder="placeholder"
          rows="3"
          class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none leading-relaxed transition-colors"
          :class="isDark
            ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim/50 focus:border-brand-400/40'
            : 'bg-white border border-bdrF text-lt-sub placeholder-lt-aux/40 focus:border-brand-400'"
        />
      </div>

      <!-- 已选文件 -->
      <div class="rounded-xl p-3.5" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-folder-open-line text-[12px] text-emerald-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">已选资料</span>
          <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-white text-lt-aux border border-bdrF'">{{ ctxItems.length }}</span>
          <template v-if="!ctxItems.length">
            <div class="flex-1" />
            <span class="text-[9px]" :class="settings.mode !== 'cloud' && ['ppt', 'research'].includes(toolId) ? 'text-amber-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
              {{ settings.mode !== 'cloud' && ['ppt', 'research'].includes(toolId) ? '本地模式需选择资料' : '可选' }}
            </span>
          </template>
        </div>
        <div v-if="ctxItems.length" class="flex flex-wrap gap-1.5">
          <span v-for="(item, i) in ctxItems" :key="i"
            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium max-w-[160px] truncate"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub' : 'bg-white border border-bdrF text-lt-sub'">
           <i :class="[fileIcon(item), 'text-[10px] shrink-0', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            {{ item.name || item.path }}
          </span>
        </div>
        <div v-else class="text-[10px] py-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ settings.mode !== 'cloud' && ['ppt', 'research'].includes(toolId) ? '本地模式请在左侧"文档"面板勾选需要处理的资料' : '未选择资料时，将仅根据你的需求和云端检索生成' }}
        </div>
      </div>

      <!-- 工具特有设置 slot -->
      <slot name="settings" :settings="settings" />

      <!-- 工具依赖状态 -->
      <div v-if="visibleToolStatusList.length" class="rounded-xl p-3.5" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
        <div class="flex items-center gap-2 mb-2">
          <i class="ri-tools-line text-[12px] text-amber-400" />
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具依赖</span>
        </div>
        <div class="space-y-1.5">
          <div v-for="t in visibleToolStatusList" :key="t.id"
            class="flex items-center gap-2 py-1 px-2 rounded-md"
            :class="isDark ? 'bg-d0' : 'bg-white'">
            <i :class="t.configured ? 'ri-checkbox-circle-fill text-emerald-400' : 'ri-close-circle-fill text-red-400'" class="text-[14px] shrink-0" />
            <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.name }}</span>
            <span v-if="!t.required" class="text-[9px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可选</span>
            <span v-if="t.configured" class="text-[9px]" :class="[t.required ? 'ml-auto' : '', isDark ? 'text-emerald-400' : 'text-emerald-600']">已配置</span>
            <template v-else>
              <span class="text-[9px] text-red-400" :class="t.required ? 'ml-auto' : ''">未配置</span>
              <button v-if="t.required" @click="handleGotoSettings"
                class="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors"
                :class="isDark ? 'text-brand-400 bg-brand-400/8 hover:bg-brand-400/15' : 'text-brand-600 bg-brand-50 hover:bg-brand-100'">
                去配置 →
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <div class="flex items-center gap-2">
        <button @click="close()"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          取消
        </button>
        <button
          :disabled="!canStart"
          @click="handleStart"
          class="h-8 px-5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all"
          :class="canStart
            ? 'text-white hover:opacity-90'
            : (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')"
          :style="canStart ? { background: toolColor, boxShadow: `0 4px 14px ${toolColor}30` } : {}">
          开始{{ toolName }}
          <i class="ri-arrow-right-line text-[12px]" />
        </button>
      </div>
    </template>
  </MsModal>
</template>
