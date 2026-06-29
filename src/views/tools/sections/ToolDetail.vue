<script setup>
import { computed } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps({
  tool: Object,
  isDark: Boolean,
})

const emit = defineEmits(['edit', 'config', 'delete', 'toggle'])
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()

const accentHex = computed(() => settingsStore.currentAccentHex)
const accentRgb = computed(() => settingsStore.currentAccentRgb)

const catInfo = computed(() => agentsStore.TOOL_CATEGORIES.find(c => c.key === props.tool.cat) || { key: 'custom', label: '自定义', icon: 'ri-tools-line', color: '#FACC15' })

const hasProviderConfig = computed(() => {
  const cfg = props.tool.providerConfig
  return cfg && (cfg.providerLabel || (cfg.providers && cfg.providers.length > 0))
})

const isConfigured = computed(() => agentsStore._isConfigured(props.tool))

const providerLabel = computed(() => {
  const cfg = props.tool.providerConfig
  if (!cfg) return null
  // New per-provider tools have providerLabel directly
  if (cfg.providerLabel) return { label: cfg.providerLabel, desc: cfg.providerDesc || '', needsKey: props.tool.needsKey === true ? true : (props.tool.needsKey === 'optional' ? 'optional' : false) }
  // Legacy multi-provider tools
  if (cfg.providers) {
    const selected = cfg.providers.find(p => p.key === cfg.provider)
    return selected ? { label: selected.label, desc: selected.desc, needsKey: selected.needsKey } : null
  }
  return null
})

const statusStyle = computed(() => {
  if (props.tool.runtimeDisabled) return { text: '暂未支持', style: { color: props.isDark ? '#8a8a94' : '#8b8b94', background: props.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: props.isDark ? '1px solid #353542' : '1px solid #dddcd9' } }
  if (!props.tool.enabled) return { text: '已禁用', style: { color: props.isDark ? '#8a8a94' : '#8b8b94', background: props.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: props.isDark ? '1px solid #353542' : '1px solid #dddcd9' } }
  if (props.tool.needsConfig && !isConfigured.value) return { text: '需配置', style: { color: '#fbbf24', background: props.isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.05)', border: props.isDark ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(251,191,36,0.15)' } }
  return { text: '可用', style: { color: accentHex.value, background: props.isDark ? `rgba(${accentRgb.value},0.08)` : `rgba(${accentRgb.value},0.05)`, border: props.isDark ? `1px solid rgba(${accentRgb.value},0.2)` : `1px solid rgba(${accentRgb.value},0.15)` } }
})

const usedByAgents = computed(() => agentsStore.agents.filter(a => a.tools?.includes(props.tool.id)))
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2.5">
        <div class="w-[24px] h-[24px] rounded-md flex items-center justify-center" :class="isDark ? 'bg-d0' : 'bg-l2'"><i :class="tool.icon + ' text-[13px]'" :style="'color:' + (catInfo.color || tool.color)" /></div>
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ tool.name }}</span>
        <span class="ctx-pill font-mono" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">{{ tool.id }}</span>
        <span class="ctx-pill" :style="statusStyle.style">{{ statusStyle.text }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <div v-if="tool.runtimeDisabled" class="toggle opacity-60 cursor-not-allowed" :class="isDark ? 'off' : 'light-off'" title="暂未支持" />
        <div v-else-if="tool.needsConfig && !isConfigured && !tool.enabled" class="toggle" :class="isDark ? 'off' : 'light-off'" @click="emit('config')" title="请先配置服务商后再启用" />
        <div v-else class="toggle" :class="tool.enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="emit('toggle')" />
        <button v-if="tool.builtin && hasProviderConfig" @click="emit('config')" class="ctx-pill cursor-pointer" :style="{ color: accentHex, background: isDark ? `rgba(${accentRgb},0.08)` : `rgba(${accentRgb},0.05)`, borderColor: isDark ? `rgba(${accentRgb},0.2)` : `rgba(${accentRgb},0.15)` }"><i class="ri-settings-3-line text-[10px]" /> 配置</button>
        <button v-if="!tool.builtin" @click="emit('edit')" class="ctx-pill cursor-pointer" :style="{ color: accentHex, background: isDark ? `rgba(${accentRgb},0.08)` : `rgba(${accentRgb},0.05)`, borderColor: isDark ? `rgba(${accentRgb},0.2)` : `rgba(${accentRgb},0.15)` }"><i class="ri-edit-line text-[10px]" /> 编辑</button>
        <button v-if="!tool.builtin" @click="emit('delete')" class="ctx-pill cursor-pointer" :class="isDark ? 'text-red-400 bg-red-400/8 border border-red-400/20' : 'text-red-500 bg-red-50 border border-red-100'"><i class="ri-delete-bin-line text-[10px]" /> 删除</button>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-6xl mx-auto px-7 py-6 fade-up">
        <div class="flex items-start gap-4 mb-6">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[26px]" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'" :style="'color:' + (catInfo.color || tool.color)"><i :class="tool.icon" /></div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ tool.name }}</h1>
            <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ tool.desc }}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-5">
          <div class="col-span-2 space-y-5">

            <!-- Provider Config -->
            <div v-if="hasProviderConfig" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-settings-3-line text-[14px]" :style="{ color: accentHex }" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">服务商配置</span></div>
              <div class="space-y-2.5">
                <div class="flex items-center gap-3">
                  <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">服务商</span>
                  <span class="ctx-pill font-medium" :style="isConfigured ? { color: accentHex, background: isDark ? `rgba(${accentRgb},0.08)` : `rgba(${accentRgb},0.05)`, border: isDark ? `1px solid rgba(${accentRgb},0.2)` : `1px solid rgba(${accentRgb},0.15)` } : { color: '#fbbf24', background: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.05)', border: isDark ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(251,191,36,0.15)' }">{{ providerLabel?.label || '未选择' }}</span>
                  <span v-if="providerLabel?.needsKey === false" class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">免费</span>
                  <span v-if="providerLabel?.needsKey === 'optional'" class="ctx-pill text-[9px]" :class="isDark ? 'bg-blue-400/8 text-blue-400 border border-blue-400/20' : 'bg-blue-50 text-blue-600 border border-blue-100'">可选Key</span>
                  <span v-if="providerLabel" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ providerLabel.desc }}</span>
                </div>
                <div v-if="tool.providerConfig.providers && tool.providerConfig.providers.length > 0" class="flex items-center gap-2">
                  <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">可选服务商</span>
                  <span v-for="p in tool.providerConfig.providers" :key="p.key" class="ctx-pill text-[9px]"
                    :style="p.key === tool.providerConfig.provider ? { color: accentHex, background: isDark ? `rgba(${accentRgb},0.08)` : `rgba(${accentRgb},0.05)`, border: isDark ? `1px solid rgba(${accentRgb},0.2)` : `1px solid rgba(${accentRgb},0.15)` } : {}"
                    :class="p.key !== tool.providerConfig.provider ? (isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF') : ''">{{ p.label }}<span v-if="!p.needsKey" class="text-[8px] ml-0.5" :style="{ color: accentHex }">免费</span></span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">API Key</span>
                  <span class="text-[11px] font-mono" :style="{ color: tool.providerConfig.apiKey ? accentHex : (providerLabel?.needsKey === true ? '#fbbf24' : (isDark ? '#6a6a7a' : '#8b8b94')) }">{{ providerLabel?.needsKey === true ? (tool.providerConfig.apiKey ? '已配置' : '未配置（需设置）') : (providerLabel?.needsKey === 'optional' ? (tool.providerConfig.apiKey ? '已配置' : '未配置（可选）') : '无需 Key') }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Base URL</span>
                  <span class="text-[11px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.providerConfig.baseUrl || tool.providerConfig.defaultUrl || providerLabel?.defaultUrl || '默认' }}</span>
                </div>
                <div v-if="tool.providerConfig.userParams && Object.keys(tool.providerConfig.userParams).length > 0" class="flex items-center gap-3">
                  <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">默认参数</span>
                  <span v-for="(val, key) in tool.providerConfig.userParams" :key="key" class="ctx-pill text-[9px] font-mono" :class="isDark ? 'bg-d4 text-wt-sub border border-bdr' : 'bg-l4 text-lt-sub border border-bdrF'">{{ key }}={{ val }}</span>
                </div>
                <div v-if="!isConfigured" class="rounded-lg p-2.5 text-[11px] flex items-center gap-2" style="color:#fbbf24" :style="{ background: isDark ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.05)', border: isDark ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(251,191,36,0.15)' }">
                  <i class="ri-information-line text-[12px]" />
                  <span>{{ providerLabel?.needsKey === true ? '请先配置 API Key 后再启用此工具' : '请先配置 Base URL 后再启用此工具' }}</span>
                </div>
              </div>
            </div>

            <!-- API/Script info (custom tools) -->
            <div v-if="!tool.builtin && tool.type === 'api'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-global-line text-[14px]" :style="{ color: accentHex }" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API 配置</span></div>
              <div class="space-y-1.5 text-[11px]">
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">URL</span><span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.apiUrl || tool.api_url }}</span></div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">方法</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.method }}</span></div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">响应格式</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.responseFormat || tool.response_format || 'JSON' }}</span></div>
              </div>
            </div>
            <div v-if="!tool.builtin && tool.type === 'script'" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-terminal-line text-[14px]" :style="{ color: accentHex }" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">脚本配置</span></div>
              <div class="space-y-2 text-[11px]">
                <div class="rounded-lg p-2.5 flex items-center gap-2" :class="isDark ? 'bg-amber-400/8 text-amber-300 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-100'">
                  <i class="ri-information-line text-[12px]" />
                  <span>本地脚本工具暂未开放运行，当前不会被 Agent 注册或执行。</span>
                </div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">脚本路径</span><span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.scriptPath || tool.script_path }}</span></div>
              </div>
            </div>

            <!-- Parameters -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-list-ordered text-[14px]" :style="{ color: accentHex }" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">参数定义</span></div>
                <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ tool.params.length }} 个参数</span>
              </div>
              <div v-if="tool.params.length > 0" class="space-y-1.5">
                <div v-for="param in tool.params" :key="param.name" class="rounded-lg p-2.5" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-[12px] font-mono font-bold" :style="{ color: accentHex }">{{ param.name }}</span>
                    <span class="ctx-pill" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">{{ param.type }}</span>
                    <span v-if="param.required" class="ctx-pill" :class="isDark ? 'bg-red-400/10 text-red-400 border border-red-400/20' : 'bg-red-50 text-red-500 border border-red-100'">必填</span>
                    <span v-else class="ctx-pill" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">可选</span>
                  </div>
                  <p class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ param.desc }}</p>
                </div>
              </div>
              <div v-else class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无参数定义</div>
            </div>

            <!-- Sandbox -->
            <div v-if="tool.sandbox" class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-shield-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">安全限制</span></div>
              <div class="rounded-lg p-3 text-[12px] leading-relaxed" :class="isDark ? 'bg-d0 text-wt-sub border border-d4' : 'bg-l2 text-lt-sub border border-bdrF'">{{ tool.sandbox }}</div>
            </div>
          </div>
          <div class="space-y-5">
            <!-- Basic Info -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-information-line text-[14px]" :style="{ color: accentHex }" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基本信息</span></div>
              <div class="space-y-1.5 text-[11px]">
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">分类</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ catInfo.label }}</span></div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">权限要求</span><span class="font-mono" :style="{ color: (tool.permReq || tool.perm_required) ? accentHex : (isDark ? '#6a6a7a' : '#8b8b94') }">{{ tool.permReq || tool.perm_required || '无' }}</span></div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">兼容架构</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ (tool.archCompat || tool.arch_compat || []).join(' / ') }}</span></div>
                <div v-if="!tool.builtin" class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">类型</span><span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.type === 'api' ? 'API 调用' : '本地脚本' }}</span></div>
                <div class="flex justify-between gap-2"><span :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">状态</span><span :style="{ color: statusStyle.style.color }">{{ statusStyle.text }}</span></div>
              </div>
            </div>

            <!-- Used by Agents -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-sparkling-2-line text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">被使用</span></div>
                <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ usedByAgents.length }} 个智能体</span>
              </div>
              <div v-if="usedByAgents.length > 0" class="space-y-1">
                <div v-for="agent in usedByAgents" :key="agent.id" class="flex items-center gap-2 py-1.5 px-2 rounded-md text-[11px]" :class="isDark ? 'bg-d0 text-wt-sub' : 'bg-l2 text-lt-sub'">
                  <i :class="agent.icon + ' text-[11px]'" :style="'color:' + agent.color" /><span>{{ agent.name }}</span>
                </div>
              </div>
              <div v-else class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂未被任何 Agent 使用</div>
            </div>
          </div>
        </div>
        <div class="h-6" />
      </div>
    </div>
  </div>
</template>
