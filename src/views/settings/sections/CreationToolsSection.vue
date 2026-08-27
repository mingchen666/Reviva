<script setup>
import { computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { CREATION_TOOLS, getCreationTool, normalizeCreationToolPreferences } from '@/config/creationTools'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const isDark = computed(() => appStore.isDark)
const dragId = ref('')
const toolsExpanded = ref(true)
const saving = ref(false)
const saveError = ref('')

const preferences = computed(() => normalizeCreationToolPreferences(settingsStore.creationToolPreferences))
const orderedTools = computed(() => preferences.value.order.map(getCreationTool).filter(Boolean))
const hiddenIds = computed(() => new Set(preferences.value.hiddenIds))
const visibleCount = computed(() => orderedTools.value.filter(tool => !hiddenIds.value.has(tool.id)).length)
const agentSkillsEnabled = computed(() => settingsStore.agentSkillsPanelEnabled === true)

async function persist(next) {
  saving.value = true
  saveError.value = ''
  try {
    const result = await settingsStore.savePreference('creationToolPreferences', next)
    if (result?.success === false) throw new Error(result.error || '保存失败')
  } catch (error) {
    saveError.value = error?.message || '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function toggleTool(toolId) {
  const nextHidden = new Set(hiddenIds.value)
  if (nextHidden.has(toolId)) nextHidden.delete(toolId)
  else nextHidden.add(toolId)
  persist({ order: preferences.value.order, hiddenIds: [...nextHidden] })
}

async function toggleAgentSkills() {
  saving.value = true
  saveError.value = ''
  try {
    const result = await settingsStore.savePreference('agentSkillsPanelEnabled', !agentSkillsEnabled.value)
    if (result?.success === false) throw new Error(result.error || '保存失败')
  } catch (error) {
    saveError.value = error?.message || '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

function onDragStart(toolId) {
  dragId.value = toolId
}

function onDrop(targetId) {
  const movingId = dragId.value
  dragId.value = ''
  if (!movingId || movingId === targetId) return
  const nextOrder = [...preferences.value.order]
  const from = nextOrder.indexOf(movingId)
  const to = nextOrder.indexOf(targetId)
  if (from < 0 || to < 0) return
  nextOrder.splice(from, 1)
  nextOrder.splice(to, 0, movingId)
  persist({ order: nextOrder, hiddenIds: preferences.value.hiddenIds })
}

function resetDefaults() {
  persist(normalizeCreationToolPreferences())
}

function toggleToolsExpanded() {
  toolsExpanded.value = !toolsExpanded.value
}

function colorClass(tool) {
  const map = {
    brand: isDark.value ? 'bg-brand-400/10 text-brand-300' : 'bg-brand-50 text-brand-600',
    agent: isDark.value ? 'bg-agent-400/10 text-agent-300' : 'bg-agent-50 text-agent-600',
    emerald: isDark.value ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600',
    amber: isDark.value ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700',
    pink: isDark.value ? 'bg-pink-400/10 text-pink-300' : 'bg-pink-50 text-pink-600',
    sky: isDark.value ? 'bg-sky-400/10 text-sky-300' : 'bg-sky-50 text-sky-600',
  }
  return map[tool.color] || map.brand
}
</script>

<template>
  <div class="max-w-[880px] mx-auto px-6 py-6">
    <div class="mb-5">
      <h2 class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">创作工具</h2>
      <p class="mt-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">管理工作台右侧“创作工具”与“Agent 技能”面板的显示。此处不会影响 Agent 的工具权限。</p>
    </div>

    <!-- 第 1 组：创作工具（显示/隐藏 + 排序，可折叠） -->
    <div class="flex items-center gap-1.5 mb-2">
      <button @click="toggleToolsExpanded" :aria-expanded="toolsExpanded" class="flex items-center gap-1.5 rounded-md -ml-1 px-1 py-0.5 transition-colors" :class="isDark ? 'hover:bg-white/5' : 'hover:bg-l4'" :title="toolsExpanded ? '折叠工具列表' : '展开工具列表'">
        <i class="ri-layout-grid-line text-[13px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">创作工具</span>
        <span v-if="!toolsExpanded" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已显示 {{ visibleCount }} / {{ CREATION_TOOLS.length }}</span>
      </button>
      <button @click="resetDefaults" :disabled="saving" class="ml-auto h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50 shrink-0" :class="isDark ? 'border-d4 text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'border-bdrF text-lt-aux hover:text-lt-sub hover:bg-l4'">
        <i class="ri-refresh-line" /> 恢复默认
      </button>
      <button @click="toggleToolsExpanded" :aria-expanded="toolsExpanded" class="w-6 h-6 rounded-md flex items-center justify-center transition-colors shrink-0" :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" :title="toolsExpanded ? '折叠工具列表' : '展开工具列表'">
        <i class="ri-arrow-down-s-line text-[16px] transition-transform duration-200" :class="toolsExpanded ? '' : '-rotate-90'" />
      </button>
    </div>

    <div class="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      :class="toolsExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
      <div class="overflow-hidden">
        <div class="rounded-xl p-3 mb-3 flex items-center gap-3" :class="isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF'">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/10 text-brand-300' : 'bg-brand-50 text-brand-600'"><i class="ri-layout-grid-line text-[16px]" /></div>
          <div class="min-w-0 flex-1">
            <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">已显示 {{ visibleCount }} / {{ CREATION_TOOLS.length }} 个工具</div>
            <div class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">拖动左侧手柄调整顺序，开关可立即隐藏或显示工具。</div>
          </div>
          <i v-if="saving" class="ri-loader-4-line animate-spin text-[15px]" :class="isDark ? 'text-brand-300' : 'text-brand-500'" />
        </div>

        <div class="space-y-2">
          <article v-for="tool in orderedTools" :key="tool.id" draggable="true" @dragstart="onDragStart(tool.id)" @dragend="dragId = ''" @dragover.prevent @drop="onDrop(tool.id)"
            class="group rounded-xl px-3 py-2.5 flex items-center gap-3 border transition-all"
            :class="[
              dragId === tool.id ? 'opacity-50 scale-[0.99]' : '',
              hiddenIds.has(tool.id)
                ? (isDark ? 'bg-d2/50 border-d4 opacity-65' : 'bg-l2/60 border-bdrF opacity-70')
                : (isDark ? 'bg-d2 border-d4 hover:border-brand-400/25' : 'bg-white border-bdrF hover:border-brand-200 shadow-sm')
            ]">
            <button class="w-6 h-7 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing" :class="isDark ? 'text-wt-dim hover:text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'" title="拖动排序">
              <i class="ri-draggable text-[15px]" />
            </button>
            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="colorClass(tool)"><i :class="tool.icon + ' text-[16px]'" /></div>
            <div class="min-w-0 flex-1">
              <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ tool.name }}</div>
              <div class="mt-0.5 text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ tool.desc }}</div>
            </div>
            <span v-if="hiddenIds.has(tool.id)" class="text-[10px] px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">已隐藏</span>
            <button @click="toggleTool(tool.id)" class="w-8 h-[18px] rounded-full p-[2px] transition-colors shrink-0" :class="hiddenIds.has(tool.id) ? (isDark ? 'bg-d4' : 'bg-l4') : 'bg-brand-500'" :title="hiddenIds.has(tool.id) ? '显示工具' : '隐藏工具'">
              <span class="block w-3.5 h-3.5 rounded-full bg-white transition-transform" :style="{ transform: hiddenIds.has(tool.id) ? 'translateX(0)' : 'translateX(14px)' }" />
            </button>
          </article>
        </div>
      </div>
    </div>

    <!-- 第 2 组：Agent 技能面板开关（与创作工具相互独立） -->
    <div class="flex items-center gap-1.5 mt-6 mb-2">
      <i class="ri-flashlight-line text-[13px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
      <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Agent 技能</span>
    </div>
    <article class="rounded-xl px-3 py-2.5 flex items-center gap-3 border transition-all"
      :class="agentSkillsEnabled
        ? (isDark ? 'bg-d2 border-d4 hover:border-brand-400/25' : 'bg-white border-bdrF hover:border-brand-200 shadow-sm')
        : (isDark ? 'bg-d2/50 border-d4 opacity-65' : 'bg-l2/60 border-bdrF opacity-70')">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-agent-400/10 text-agent-300' : 'bg-agent-50 text-agent-500'"><i class="ri-flashlight-line text-[16px]" /></div>
      <div class="min-w-0 flex-1">
        <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Agent 技能面板</div>
        <div class="mt-0.5 text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">在工作台右侧显示所选 Agent 的技能列表</div>
      </div>
      <span v-if="!agentSkillsEnabled" class="text-[10px] px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">已隐藏</span>
      <button @click="toggleAgentSkills" :disabled="saving" class="w-8 h-[18px] rounded-full p-[2px] transition-colors shrink-0 disabled:opacity-50" :class="agentSkillsEnabled ? 'bg-brand-500' : (isDark ? 'bg-d4' : 'bg-l4')" :title="agentSkillsEnabled ? '隐藏面板' : '显示面板'">
        <span class="block w-3.5 h-3.5 rounded-full bg-white transition-transform" :style="{ transform: agentSkillsEnabled ? 'translateX(14px)' : 'translateX(0)' }" />
      </button>
    </article>

    <p v-if="saveError" class="mt-3 text-[11px] text-red-400"><i class="ri-error-warning-line" /> {{ saveError }}</p>
  </div>
</template>
