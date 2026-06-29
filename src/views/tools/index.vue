<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
import ToolList from './sections/ToolList.vue'
import ToolDetail from './sections/ToolDetail.vue'
import ToolEdit from './sections/ToolEdit.vue'
import McpManager from './sections/McpManager.vue'

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)
const accentRgb = computed(() => settingsStore.currentAccentRgb)

const activeTab = ref('tools')
const selectedTool = ref(null)
const searchQuery = ref('')
const filterCat = ref('all')
const showToolModal = ref(false)
const modalTool = ref(null)

const catFilters = computed(() => [
  { key: 'all', label: '全部', icon: 'ri-apps-line', count: agentsStore.toolList.length },
  ...agentsStore.TOOL_CATEGORIES.map(c => ({
    key: c.key,
    label: c.label,
    icon: c.icon,
    count: agentsStore.toolList.filter(t => t.cat === c.key).length,
  })),
])

const filteredTools = computed(() => {
  let list = agentsStore.toolList
  if (filterCat.value !== 'all') list = list.filter(t => t.cat === filterCat.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(t =>
      (t.name || '').toLowerCase().includes(q)
      || (t.desc || t.description || '').toLowerCase().includes(q)
      || (t.id || '').toLowerCase().includes(q),
    )
  }
  return list
})

const activeCategoryLabel = computed(() => {
  if (filterCat.value === 'all') return '全部工具'
  return agentsStore.TOOL_CATEGORIES.find(c => c.key === filterCat.value)?.label || '工具'
})

const builtinCount = computed(() => agentsStore.builtinTools.length)
const customCount = computed(() => agentsStore.customTools.length)
const enabledCount = computed(() => agentsStore.enabledTools.length)

function getCatInfo(tool) {
  return agentsStore.TOOL_CATEGORIES.find(c => c.key === tool.cat) || { key: 'custom', label: '自定义', icon: 'ri-tools-line', color: '#FACC15' }
}

function isToolConfigured(tool) {
  return agentsStore._isConfigured(tool)
}

function getStatus(tool) {
  if (!tool.enabled) return { text: '已禁用', tone: 'muted' }
  if (tool.needsConfig && !isToolConfigured(tool)) return { text: '需配置', tone: 'warning' }
  return { text: '可用', tone: 'ok' }
}

function selectTool(tool) {
  selectedTool.value = tool
}

function setFilterCat(cat) {
  filterCat.value = cat
  selectedTool.value = null
}

function toggleToolEnabled(tool) {
  if (tool.runtimeDisabled) return
  if (tool.builtin) {
    agentsStore.toggleBuiltinTool(tool.id)
  } else {
    agentsStore.updateTool(tool.id, { enabled: tool.enabled ? 0 : 1 })
  }
}

function startCreate() {
  modalTool.value = {
    name: '', desc: '', icon: 'ri-tools-line', color: '#4ADE80', cat: 'custom',
    type: 'api', apiUrl: '', method: 'POST', headers: {}, params: [],
    responseFormat: 'JSON', scriptPath: '', sandbox: '', permReq: '',
    archCompat: ['react', 'plan_exec', 'hybrid'], builtin: false, enabled: true,
    providerConfig: {},
  }
  showToolModal.value = true
}

function startEditTool() {
  const t = JSON.parse(JSON.stringify(selectedTool.value))
  modalTool.value = {
    ...t,
    desc: t.desc || t.description || '',
    cat: t.cat || t.category || 'custom',
    apiUrl: t.apiUrl || t.api_url || '',
    scriptPath: t.scriptPath || t.script_path || '',
    permReq: t.permReq || t.perm_required || '',
    archCompat: t.archCompat || t.arch_compat || [],
    responseFormat: t.responseFormat || t.response_format || 'JSON',
    providerConfig: t.providerConfig || {},
  }
  showToolModal.value = true
}

function startConfigTool() {
  const t = JSON.parse(JSON.stringify(selectedTool.value))
  modalTool.value = {
    ...t,
    providerConfig: t.providerConfig || {},
    isBuiltinConfig: true,
  }
  showToolModal.value = true
}

function cancelToolEdit() { showToolModal.value = false; modalTool.value = null }

function saveToolEdit() {
  if (!modalTool.value) return
  if (modalTool.value.isBuiltinConfig) {
    agentsStore.updateToolProviderConfig(modalTool.value.id, modalTool.value.providerConfig)
  } else if (modalTool.value.id) {
    agentsStore.updateTool(modalTool.value.id, modalTool.value)
    selectedTool.value = agentsStore.toolList.find(t => t.id === modalTool.value.id)
  } else {
    agentsStore.addTool(modalTool.value)
  }
  showToolModal.value = false
  modalTool.value = null
}

function deleteTool() {
  if (!selectedTool.value || selectedTool.value.builtin) return
  agentsStore.removeTool(selectedTool.value.id)
  selectedTool.value = null
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="h-9 flex items-center px-4 shrink-0 gap-4" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <button @click="activeTab = 'tools'" class="text-[14px] font-semibold transition-colors flex items-center gap-1.5"
        :class="activeTab === 'tools' ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-tools-line text-[14px]" /> 工具
      </button>
      <button @click="activeTab = 'mcp'" class="text-[14px] font-semibold transition-colors flex items-center gap-1.5"
        :class="activeTab === 'mcp' ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
        <svg-icon icon-class="mcp" size="14"/> MCP 服务器
      </button>
    </div>

    <McpManager v-if="activeTab === 'mcp'" />

    <div v-else class="flex flex-1 overflow-hidden">
      <LeftPanel :width="272" :resizable="false">
        <div class="h-10 flex items-center px-4 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">工具</span>
          <span class="ml-auto text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ enabledCount }}/{{ agentsStore.toolList.length }} 已启用</span>
        </div>

        <div class="px-3 py-2">
          <div class="relative">
            <i class="ri-search-line absolute left-2.5 top-[8px] text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <input v-model="searchQuery" type="text" placeholder="搜索工具..." class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-emerald-400'" />
          </div>
        </div>

        <div class="px-3 pb-2 flex gap-1 overflow-x-auto">
          <button v-for="f in catFilters" :key="f.key" @click="setFilterCat(f.key)" class="ctx-pill cursor-pointer whitespace-nowrap"
            :class="filterCat === f.key ? (isDark ? 'text-wt-main bg-white/6' : 'text-lt-main bg-l3') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
            {{ f.label }}
          </button>
        </div>

        <div class="px-4 pt-2 pb-1.5">
          <span class="section-title" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">工具列表 ({{ filteredTools.length }})</span>
        </div>

        <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          <div v-for="tool in filteredTools" :key="tool.id" @click="selectTool(tool)">
            <ToolList :tool="tool" :selected="selectedTool?.id === tool.id" :is-dark="isDark" @toggle="toggleToolEnabled(tool)" />
          </div>
        </div>

        <div class="px-3 py-2.5" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button @click="startCreate()" class="w-full h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            :style="{ color: accentHex, background: isDark ? `rgba(${accentRgb},0.1)` : `rgba(${accentRgb},0.05)`, border: isDark ? `1px solid rgba(${accentRgb},0.2)` : `1px solid rgba(${accentRgb},0.15)` }">
            <i class="ri-add-line text-[12px]" /> 新建自定义工具
          </button>
        </div>
      </LeftPanel>

      <MainContent padding="p-0">
        <ToolDetail
          v-if="selectedTool"
          :tool="selectedTool"
          :is-dark="isDark"
          @edit="startEditTool"
          @config="startConfigTool"
          @delete="deleteTool"
          @toggle="toggleToolEnabled(selectedTool)"
        />

        <div v-else class="flex-1 flex flex-col overflow-hidden">
          <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
            <div class="flex items-center gap-2">
              <i class="ri-apps-2-line text-[14px]" :style="{ color: accentHex }" />
              <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ activeCategoryLabel }}</span>
              <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF'">{{ filteredTools.length }} 个工具</span>
            </div>
            <div class="flex items-center gap-2 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <span>{{ builtinCount }} 内置</span>
              <span>·</span>
              <span>{{ customCount }} 自定义</span>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div class="px-6 py-5 fade-up">
              <div class="rounded-xl p-4 mb-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h1 class="text-[18px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">全部工具工作区</h1>
                    <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                      在这里浏览当前筛选下的所有工具。点击卡片查看参数、安全限制、服务商配置和被哪些 Agent 使用。
                    </p>
                  </div>
                  <button @click="startCreate()" class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 shrink-0"
                    :style="{ color: accentHex, background: isDark ? `rgba(${accentRgb},0.1)` : `rgba(${accentRgb},0.05)`, border: isDark ? `1px solid rgba(${accentRgb},0.2)` : `1px solid rgba(${accentRgb},0.15)` }">
                    <i class="ri-add-line text-[12px]" /> 新建工具
                  </button>
                </div>
              </div>

              <div v-if="filteredTools.length" class="tool-overview-grid">
                <article
                  v-for="tool in filteredTools"
                  :key="tool.id"
                  class="tool-overview-card rounded-xl p-4 cursor-pointer transition-all"
                  :class="isDark ? 'bg-d3 border border-bdr hover:bg-white/[0.035] hover:border-white/12' : 'bg-l3 border border-bdrF hover:bg-white hover:border-bdrL'"
                  @click="selectTool(tool)"
                >
                  <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                        <i :class="tool.icon + ' text-[19px]'" :style="'color:' + (getCatInfo(tool).color || tool.color)" />
                      </div>
                      <div class="min-w-0">
                        <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ tool.name }}</div>
                        <div class="text-[10px] font-mono truncate mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ tool.id }}</div>
                      </div>
                    </div>
                    <div class="toggle shrink-0" :class="[tool.runtimeDisabled ? (isDark ? 'off' : 'light-off') : (tool.enabled ? 'on' : (isDark ? 'off' : 'light-off')), tool.runtimeDisabled ? 'opacity-60 cursor-not-allowed' : '']" @click.stop="toggleToolEnabled(tool)" />
                  </div>

                  <p class="text-[11px] leading-relaxed line-clamp-2 min-h-[34px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" :title="tool.desc || tool.description">{{ tool.desc || tool.description }}</p>

                  <div class="mt-3 flex items-center gap-1.5 flex-wrap">
                    <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-sub border border-bdr' : 'bg-l4 text-lt-sub border border-bdrF'">
                      <i :class="getCatInfo(tool).icon + ' text-[9px]'" :style="'color:' + getCatInfo(tool).color" /> {{ getCatInfo(tool).label }}
                    </span>
                    <span v-if="tool.builtin" class="ctx-pill text-[9px]" :class="isDark ? 'bg-blue-400/8 text-blue-400 border border-blue-400/20' : 'bg-blue-50 text-blue-600 border border-blue-100'">内置</span>
                    <span v-else class="ctx-pill text-[9px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">自定义</span>
                    <span v-if="tool.type === 'router'" class="ctx-pill text-[9px]" :class="isDark ? 'bg-cyan-400/8 text-cyan-400 border border-cyan-400/20' : 'bg-cyan-50 text-cyan-600 border border-cyan-100'">路由</span>
                    <span
                      class="ctx-pill text-[9px] ml-auto"
                      :class="getStatus(tool).tone === 'ok'
                        ? (isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100')
                        : getStatus(tool).tone === 'warning'
                          ? (isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100')
                          : (isDark ? 'bg-d4 text-wt-dim border border-bdr' : 'bg-l4 text-lt-aux border border-bdrF')"
                    >{{ getStatus(tool).text }}</span>
                  </div>
                </article>
              </div>

              <div v-else class="min-h-[320px] flex flex-col items-center justify-center text-center rounded-xl"
                :class="isDark ? 'bg-d3 border border-bdr text-wt-dim' : 'bg-l3 border border-bdrF text-lt-aux'">
                <i class="ri-search-line text-[22px] mb-2" />
                <div class="text-[13px] font-semibold mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">没有匹配的工具</div>
                <div class="text-[11px]">换一个关键词或分类再试</div>
              </div>
            </div>
          </div>
        </div>
      </MainContent>
    </div>

    <ToolEdit v-if="showToolModal && modalTool" :edit-tool="modalTool" :is-dark="isDark" @cancel="cancelToolEdit" @save="saveToolEdit" />
  </div>
</template>

<style scoped>
.tool-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
  gap: 12px;
}

.tool-overview-card {
  min-height: 152px;
}
</style>
