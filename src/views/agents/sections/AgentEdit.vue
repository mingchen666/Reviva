<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAgentsStore } from '@/stores/agents'
import { useSettingsStore } from '@/stores/settings'
import IconPicker from '@/components/IconPicker.vue'
import { encodeModelRef, matchesModelRef, parseModelRef } from '@/utils/modelRef'

const props = defineProps({
  editAgent: Object,
  isDark: Boolean,
})

const emit = defineEmits(['cancel', 'save'])
const store = useAgentsStore()
const ss = useSettingsStore()

const agentWlInput = ref(null)
const agentBlInput = ref(null)
const toolSearch = ref('')
const skillSearch = ref('')

function addAgentWhitelist() {
  if (!agentWlInput.value) return
  const v = agentWlInput.value.value?.trim().toLowerCase()
  if (v) {
    if (!props.editAgent.permissions.execCommandWhitelist) props.editAgent.permissions.execCommandWhitelist = []
    if (!props.editAgent.permissions.execCommandWhitelist.includes(v)) props.editAgent.permissions.execCommandWhitelist.push(v)
    agentWlInput.value.value = ''
  }
}
function addAgentBlacklist() {
  if (!agentBlInput.value) return
  const v = agentBlInput.value.value?.trim().toLowerCase()
  if (v) {
    if (!props.editAgent.permissions.execCommandBlacklist) props.editAgent.permissions.execCommandBlacklist = []
    if (!props.editAgent.permissions.execCommandBlacklist.includes(v)) props.editAgent.permissions.execCommandBlacklist.push(v)
    agentBlInput.value.value = ''
  }
}
const showModelPicker = ref(false)
const showReviewerModelPicker = ref(false)

function isSelectableProvider(p) {
  return p.enabled && settingsStore.providerConfigured(p)
}

function toModelGroups({ requireVisionFirst = false } = {}) {
  return ss.providers
    .filter(isSelectableProvider)
    .map(p => {
      let models = (p.models || []).filter(m => m.tier !== 'embedding' && m.enabled)
      if (requireVisionFirst) {
        models = [...models].sort((a, b) => (a.capabilities?.vision ? 0 : 1) - (b.capabilities?.vision ? 0 : 1))
      }
      return {
        providerId: p.id,
        group: p.name,
        models: models.map(m => ({
          value: encodeModelRef(p.id, m.id),
          providerId: p.id,
          id: m.id,
          name: m.name,
          ctx: m.ctx,
          hasVision: m.capabilities?.vision || false,
        })),
      }
    })
    .filter(g => g.models.length)
}

function findSelectedModel(ref, groups) {
  if (!ref) return null
  const parsed = parseModelRef(ref)
  for (const g of groups) {
    const m = g.models.find(m => parsed.scoped ? m.value === ref : matchesModelRef(ref, g.providerId, m.id))
    if (m) return { ...m, group: g.group }
  }
  return null
}

const modelOptions = computed(() => toModelGroups())

const selectedModelInfo = computed(() => findSelectedModel(props.editAgent.model, modelOptions.value))

const reviewerModelOptions = computed(() => toModelGroups({ requireVisionFirst: true }))

const selectedReviewerModelInfo = computed(() => findSelectedModel(props.editAgent.reviewerModel, reviewerModelOptions.value))

const hasSelectableModels = computed(() => modelOptions.value.some(g => g.models.length))
const hasSelectableReviewerModels = computed(() => reviewerModelOptions.value.some(g => g.models.length))
const unavailableModelName = computed(() =>
  props.editAgent.model && !selectedModelInfo.value ? parseModelRef(props.editAgent.model).modelId : '',
)
const unavailableReviewerModelName = computed(() =>
  props.editAgent.reviewerModel && !selectedReviewerModelInfo.value ? parseModelRef(props.editAgent.reviewerModel).modelId : '',
)

const legacyModelWarning = computed(() => {
  if (!props.editAgent.model || parseModelRef(props.editAgent.model).scoped) return ''
  return selectedModelInfo.value ? '旧配置仅保存了模型名，保存时建议重新选择一次以绑定服务商。' : ''
})

const reviewerModelWarning = computed(() => {
  if (!props.editAgent.reviewerModel || parseModelRef(props.editAgent.reviewerModel).scoped) return ''
  return selectedReviewerModelInfo.value ? '旧配置仅保存了模型名，保存时建议重新选择一次以绑定服务商。' : ''
})

// Only agents whose sub-agents require visual review (e.g. PPT generator) show
// the reviewer-model picker. Add new englishNames here when more agents need it.
const REVIEWER_REQUIRED_AGENTS = ['PptGenerator', 'ppt-generator']
const needsReviewerModel = computed(() => REVIEWER_REQUIRED_AGENTS.includes(props.editAgent.englishName))

// Click outside handler for popovers
function handleClickOutside(e) {
  if (showModelPicker.value) {
    const el = document.getElementById('model-picker-dropdown')
    if (el && !el.contains(e.target) && !e.target.closest('[data-model-trigger]')) {
      showModelPicker.value = false
    }
  }
  if (showReviewerModelPicker.value) {
    const el = document.getElementById('reviewer-model-picker-dropdown')
    if (el && !el.contains(e.target) && !e.target.closest('[data-reviewer-trigger]')) {
      showReviewerModelPicker.value = false
    }
  }
}
onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

const agentIconOptions = [
  'ri-sparkling-2-line',
  'ri-robot-line',
  'ri-user-line',
  'ri-team-line',
  'ri-brain-line',
  'ri-magic-line',
  'ri-lightbulb-line',
  'ri-eye-line',
  'ri-search-eye-line',
  'ri-cpu-line',
  'ri-code-s-slash-line',
  'ri-terminal-box-line',
  'ri-file-text-line',
  'ri-file-edit-line',
  'ri-folder-open-line',
  'ri-book-open-line',
  'ri-graduation-cap-line',
  'ri-school-line',
  'ri-quill-pen-line',
  'ri-question-answer-line',
  'ri-chat-smile-2-line',
  'ri-discuss-line',
  'ri-send-plane-line',
  'ri-mic-line',
  'ri-tools-line',
  'ri-hammer-line',
  'ri-palette-line',
  'ri-database-2-line',
  'ri-calendar-check-line',
  'ri-timer-line',
  'ri-bar-chart-grouped-line',
  'ri-pie-chart-2-line',
  'ri-line-chart-line',
  'ri-node-tree-line',
  'ri-flow-chart',
  'ri-mind-map',
  'ri-shield-check-line',
  'ri-lock-line',
  'ri-fire-line',
  'ri-leaf-line',
  'ri-sun-line',
  'ri-moon-line',
  'ri-cloud-line',
]

const colorOptions = ['#6C8AFF', '#A78BFA', '#4ADE80', '#FACC15', '#F87171', '#3B82F6', '#EC4899', '#8B5CF6', '#38BDF8', '#F472B6', '#FB923C', '#14B8A6']
const thinkingModeOptions = [
  { key: 'auto', label: '自动' },
  { key: 'enabled', label: '启用' },
  { key: 'disabled', label: '禁用' },
]
const thinkingIntensityOptions = [
  { key: 'low', label: '轻量', icon: 'ri-flashlight-line', desc: '快速推理，适合简单任务' },
  { key: 'medium', label: '标准', icon: 'ri-brain-line', desc: '平衡速度与深度' },
  { key: 'high', label: '深度', icon: 'ri-mind-map', desc: '深入推理，适合复杂任务' },
]
const permList = [
  { key: 'fileRead', label: '文件读取', icon: 'ri-eye-line', desc: '读取授权目录内的文件内容' },
  { key: 'fileWrite', label: '文件写入', icon: 'ri-edit-line', desc: '在授权目录内创建或修改文件' },
  { key: 'fileDelete', label: '文件删除', icon: 'ri-delete-bin-line', desc: '删除授权目录内 outputs/ 下的文件' },
  { key: 'fileRename', label: '文件重命名', icon: 'ri-price-tag-3-line', desc: '在授权目录内重命名文件' },
  { key: 'execCommand', label: '执行命令', icon: 'ri-terminal-box-line', desc: '在沙盒环境中执行 shell 命令' },
]

const permToolMap = { file_read: 'fileRead', file_write: 'fileWrite', office_write: 'fileWrite', pptx_export_local: 'fileWrite', file_rename: 'fileRename', file_list: 'fileRead', file_delete: 'fileDelete', exec_command: 'execCommand', 'ffmpeg:*': 'fileRead', 'pandoc:*': 'fileRead', 'manim:*': 'fileRead' }
const isBuiltinAgent = computed(() => props.editAgent?.builtin === true || props.editAgent?.builtin === 1)
const selectedToolCount = computed(() => store.toolList.filter(t => hasTool(t.id) && !t.runtimeDisabled).length)
const filteredTools = computed(() => {
  const q = toolSearch.value.trim().toLowerCase()
  if (!q) return store.toolList
  return store.toolList.filter(t => [
    t.name,
    t.id,
    t.desc,
    t.description,
    t.cat,
    t.source,
    t.serverName,
  ].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
})
const filteredSkills = computed(() => {
  const q = skillSearch.value.trim().toLowerCase()
  if (!q) return store.skillList
  return store.skillList.filter(s => [
    s.name,
    s.id,
    s.desc,
    s.description,
  ].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
})
function toolCatLabel(cat) {
  return store.TOOL_CATEGORIES.find(c => c.key === cat)?.label || cat
}

function toggleTool(id) {
  const tool = store.toolList.find(t => t.id === id)
  if (tool?.alwaysEnabled || tool?.runtimeDisabled) return
  const i = props.editAgent.tools.indexOf(id)
  if (i >= 0) props.editAgent.tools.splice(i, 1)
  else {
    props.editAgent.tools.push(id)
    const permKey = permToolMap[id] || tool?.permReq || tool?.perm_required
    if (permKey && Object.prototype.hasOwnProperty.call(props.editAgent.permissions, permKey)) {
      props.editAgent.permissions[permKey] = true
    }
  }
}
function setPermissionTool(permKey, toolId, enabled) {
  if (!Array.isArray(props.editAgent.tools)) props.editAgent.tools = []
  const idx = props.editAgent.tools.indexOf(toolId)
  if (enabled && idx < 0) props.editAgent.tools.push(toolId)
  if (!enabled && idx >= 0) props.editAgent.tools.splice(idx, 1)
}
function togglePerm(k) {
  props.editAgent.permissions[k] = !props.editAgent.permissions[k]
  if (k === 'execCommand') setPermissionTool(k, 'exec_command', props.editAgent.permissions[k])
}
function toggleSkill(id) {
  const i = props.editAgent.skills.indexOf(id)
  if (i >= 0) props.editAgent.skills.splice(i, 1)
  else props.editAgent.skills.push(id)
}
function normalizeSubAgentKey(value) {
  return String(value || '').trim().replace(/^sa_/i, '').toLowerCase().replace(/[\s_]+/g, '-')
}
function subAgentKeys(sa) {
  const raw = typeof sa === 'string'
    ? [sa]
    : [sa?.id, sa?.name, sa?.runtimeName, ...(Array.isArray(sa?.aliases) ? sa.aliases : [])]
  return raw.map(normalizeSubAgentKey).filter(Boolean)
}
function selectedSubAgentIndex(sa) {
  const keys = new Set(subAgentKeys(sa))
  return props.editAgent.subAgents.findIndex(id => {
    const target = normalizeSubAgentKey(id)
    const exact = [...store.subAgentList].reverse().find(item =>
      normalizeSubAgentKey(item.id) === target || normalizeSubAgentKey(item.runtimeName) === target
    )
    if (exact && exact.id !== sa?.id) return false
    return keys.has(target)
  })
}
function subAgentBindingId(sa) {
  if (typeof sa === 'string') return sa
  if (String(sa?.id || '').startsWith('sa_') && sa?.aliases?.length) return sa.aliases[0]
  return sa?.id || sa?.runtimeName || sa?.name || ''
}
function toggleSubAgent(sa) {
  const i = selectedSubAgentIndex(sa)
  if (i >= 0) props.editAgent.subAgents.splice(i, 1)
  else props.editAgent.subAgents.push(subAgentBindingId(sa))
}
function hasTool(t) {
  const tool = store.toolList.find(item => item.id === t)
  return !!tool?.alwaysEnabled || props.editAgent.tools.includes(t)
}
function hasSkill(s) { return props.editAgent.skills.includes(s) }
function hasSubAgent(s) { return selectedSubAgentIndex(s) >= 0 }

const englishNameError = ref('')
let nameCheckTimer = null

function sanitizeEnglishName() {
  if (isBuiltinAgent.value) return
  // Only allow lowercase letters, digits, hyphens, underscores
  let val = (props.editAgent.englishName || '').replace(/[^a-z0-9_-]/g, '').toLowerCase()
  // Block reserved names
  if (val === '_shared') val = ''
  props.editAgent.englishName = val
  // Debounced uniqueness check
  clearTimeout(nameCheckTimer)
  if (!val) { englishNameError.value = ''; return }
  nameCheckTimer = setTimeout(async () => {
    try {
      const excludeId = props.editAgent.id || ''
      const isUnique = await window.electronAPI.db.agents.isEnglishNameUnique(val, excludeId)
      englishNameError.value = isUnique ? '' : `"${val}" 已被其他智能体使用`
    } catch { englishNameError.value = '' }
  }, 400)
}

function toggleSubAgentEnabled() {
  props.editAgent.subAgentEnabled = !props.editAgent.subAgentEnabled
  if (!props.editAgent.subAgentEnabled) props.editAgent.subAgents = []
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="emit('cancel')" />

      <!-- Modal Card -->
      <div class="relative rounded-2xl overflow-hidden w-full max-w-[720px] max-h-[85vh] flex flex-col"
        :class="isDark ? 'bg-d3 border border-bdr shadow-xl shadow-black/50' : 'bg-l2 border border-bdrL shadow-xl'">

        <!-- Header -->
        <div class="px-5 py-3 flex justify-between items-center shrink-0"
          :class="isDark ? 'border-b border-d4 bg-d4/30' : 'border-b border-bdrL bg-l4/30'">
          <div class="flex items-center gap-2">
            <i class="ri-sparkling-2-line text-agent-400 text-[14px]" />
            <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ editAgent.name ? '编辑 · ' + editAgent.name : '新建智能体' }}</span>
          </div>
          <button @click="emit('cancel')" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
            <i class="ri-close-line text-[14px]" />
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="flex-1 overflow-y-auto">
          <div class="px-5 py-4 space-y-4">

            <!-- Basic Info -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between gap-3 mb-4">
                <div class="flex items-center gap-2"><i class="ri-profile-line text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础信息</span></div>
                <span v-if="isBuiltinAgent" class="ctx-pill text-[9px]" :class="isDark ? 'bg-blue-400/10 text-blue-400 border border-blue-400/20' : 'bg-blue-50 text-blue-600 border border-blue-100'"><i class="ri-lock-line text-[8px]" /> 系统内置</span>
              </div>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称 <span class="text-red-400">*</span></label>
                  <input v-model="editAgent.name" type="text" placeholder="输入智能体名称" :readonly="isBuiltinAgent" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="[isBuiltinAgent ? 'cursor-not-allowed opacity-75' : '', isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400']">
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">英文名称 <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" class="font-normal">(用于隔离目录，全局唯一)</span></label>
                  <input v-model="editAgent.englishName" type="text" placeholder="如: study-assistant" :readonly="isBuiltinAgent" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors" :class="[englishNameError ? 'border-red-400/60' : '', isBuiltinAgent ? 'cursor-not-allowed opacity-75' : '', isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400']" @input="sanitizeEnglishName">
                  <div v-if="englishNameError" class="text-[10px] mt-1 text-red-400">{{ englishNameError }}</div>
                </div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">描述</label>
                  <textarea v-model="editAgent.desc" rows="2" placeholder="简单描述智能体功能..." :readonly="isBuiltinAgent" class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none transition-colors" :class="[isBuiltinAgent ? 'cursor-not-allowed opacity-75' : '', isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400']"></textarea>
                </div>
                <div class="flex gap-6">
                  <div class="w-[330px]">
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图标</label>
                    <div
                      v-if="isBuiltinAgent"
                      class="h-9 px-3 rounded-lg flex items-center gap-2 cursor-not-allowed opacity-75"
                      :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                      <i :class="editAgent.icon + ' text-[15px]'" :style="'color:' + editAgent.color" />
                      <span class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ editAgent.icon }}</span>
                    </div>
                    <IconPicker
                      v-else
                      v-model="editAgent.icon"
                      :is-dark="isDark"
                      :icons="agentIconOptions" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">颜色</label>
                    <div class="flex items-center gap-1.5">
                      <button v-for="c in colorOptions" :key="c" @click="!isBuiltinAgent && (editAgent.color = c)" :disabled="isBuiltinAgent" class="w-6 h-6 rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-70" :class="editAgent.color === c ? 'ring-2 ring-offset-2 scale-110' : ''" :style="'background-color:' + c + ';' + (editAgent.color === c ? (isDark ? '--tw-ring-offset-color:#252530;--tw-ring-color:rgba(255,255,255,0.4)' : '--tw-ring-offset-color:#f5f4f3;--tw-ring-color:rgba(255,255,255,0.8)') : '')" />
                      <label class="relative" :class="isBuiltinAgent ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'">
                        <input type="color" v-model="editAgent.color" :disabled="isBuiltinAgent" class="absolute inset-0 opacity-0 w-6 h-6" :class="isBuiltinAgent ? 'cursor-not-allowed' : 'cursor-pointer'" />
                        <div class="w-6 h-6 rounded-full border-2 transition-colors flex items-center justify-center" :class="isDark ? 'border-d4' : 'border-bdrF'" :style="colorOptions.includes(editAgent.color) ? '' : 'background-color:' + editAgent.color">
                          <i v-if="!colorOptions.includes(editAgent.color)" class="ri-palette-line text-[10px] text-white/70" />
                          <i v-else class="ri-palette-line text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- System Prompt -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-4"><i class="ri-double-quotes-l text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">系统提示词</span></div>
              <textarea v-model="editAgent.prompt" rows="4" placeholder="定义智能体的行为逻辑、人设和工作流程..." class="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-y transition-colors leading-relaxed font-mono" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-agent-400'"></textarea>
            </div>

            <!-- Runtime limits -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-timer-line text-agent-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">运行限制</span></div>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <i class="ri-repeat-line text-[11px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
                  <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大迭代次数</label>
                </div>
                <input v-model.number="editAgent.maxIter" type="number" min="0" max="200" class="w-16 h-7 px-2 rounded-md text-[12px] text-center outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-agent-400'">
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">0 = 不限制</span>
              </div>
              <div class="mt-2.5 pt-2.5 space-y-2" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <i class="ri-tools-line text-[11px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
                    <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具调用上限</label>
                  </div>
                  <input v-model.number="editAgent.toolCallLimit" type="number" min="0" max="200" class="w-16 h-7 px-2 rounded-md text-[12px] text-center outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-agent-400'">
                  <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">0 = 不限制</span>
                </div>
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <i class="ri-robot-2-line text-[11px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                    <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型调用上限</label>
                  </div>
                  <input v-model.number="editAgent.modelCallLimit" type="number" min="0" max="200" class="w-16 h-7 px-2 rounded-md text-[12px] text-center outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-agent-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-agent-400'">
                  <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">0 = 不限制</span>
                </div>
              </div>
            </div>

            <!-- Model Config -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2"><i class="ri-robot-2-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型配置</span></div>
                <button @click="editAgent.showAdvanced = !editAgent.showAdvanced" class="text-[10px] font-medium flex items-center gap-1 transition-colors" :class="isDark ? 'text-wt-aux hover:text-brand-400' : 'text-lt-aux hover:text-brand-500'">
                  <i :class="editAgent.showAdvanced ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" class="text-[12px]" />
                  {{ editAgent.showAdvanced ? '收起高级参数' : '展开高级参数' }}
                </button>
              </div>
              <!-- Model select -->
              <div class="mb-3 relative">
                <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">LLM 模型 <span class="text-[9px] font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">留空则使用全局默认</span></label>
                <button @click="showModelPicker = !showModelPicker" data-model-trigger class="w-full h-9 px-3 rounded-lg flex items-center gap-2 text-[12px] transition-colors cursor-pointer"
                  :class="[isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-400', showModelPicker ? (isDark ? 'border-brand-400/40' : 'border-brand-400') : '']">
                  <i v-if="!editAgent.model" class="ri-robot-2-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <template v-if="selectedModelInfo">
                    <span class="font-medium">{{ selectedModelInfo.group }}</span>
                    <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">·</span>
                    <span>{{ selectedModelInfo.name }}</span>
                    <span class="ctx-pill shrink-0 text-[9px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/15' : 'bg-brand-50 text-brand-500 border border-brand-100'">{{ selectedModelInfo.ctx }}k</span>
                  </template>
                  <template v-else-if="unavailableModelName">
                    <span class="font-medium">{{ unavailableModelName }}</span>
                    <span class="ctx-pill shrink-0 text-[9px]" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/15' : 'bg-amber-50 text-amber-600 border border-amber-100'">不可用</span>
                  </template>
                  <template v-if="!editAgent.model">
                    <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">全局默认模型</span>
                  </template>
                  <i class="ri-arrow-down-s-line text-[12px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </button>
                <!-- Model picker dropdown -->
                <div v-if="showModelPicker" id="model-picker-dropdown" class="absolute left-0 right-0 top-[76px] rounded-xl overflow-hidden z-20 shadow-lg"
                  :class="isDark ? 'bg-d3 shadow-black/40' : 'bg-l2 shadow-xl'">
                  <button @click="editAgent.model = ''; showModelPicker = false"
                    class="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
                    :class="!editAgent.model ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4')">
                    <i class="ri-robot-2-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <span>全局默认模型</span>
                    <i v-if="!editAgent.model" class="ri-check-line text-[12px] ml-auto text-brand-400" />
                  </button>
                  <div v-if="!hasSelectableModels" class="px-3 py-3 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">
                    无可用模型。请先在设置中启用并配置服务商，同时确保模型已启用。
                  </div>
                  <template v-for="g in modelOptions" :key="g.group">
                    <div class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">{{ g.group }}</div>
                    <button v-for="m in g.models" :key="m.value" @click="editAgent.model = m.value; showModelPicker = false"
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
                      :class="selectedModelInfo?.value === m.value ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')">
                      <span class="font-medium">{{ m.name }}</span>
                      <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ m.ctx }}k</span>
                      <i v-if="selectedModelInfo?.value === m.value" class="ri-check-line text-[12px] ml-auto text-brand-400" />
                    </button>
                  </template>
                </div>
                <div v-if="legacyModelWarning" class="mt-1 text-[10px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'">{{ legacyModelWarning }}</div>
              </div>
              <!-- Use same model toggle (visual-review agents only) -->
              <div v-if="needsReviewerModel" class="mb-3 flex items-center justify-between py-1.5">
                <div class="flex items-center gap-1.5">
                  <i class="ri-merge-cells-horizontal text-[12px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" />
                  <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">审查模型与执行模型相同</label>
                </div>
                <div class="toggle shrink-0" :class="editAgent.useSameModel ? 'on' : (isDark ? 'off' : 'light-off')" @click="editAgent.useSameModel = !editAgent.useSameModel" />
              </div>
              <!-- Reviewer model select -->
              <div v-if="needsReviewerModel && !editAgent.useSameModel" class="mb-3 relative">
                <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">审查模型（视觉） <span class="text-[9px] font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">建议选择带视觉能力的模型</span></label>
                <button @click="showReviewerModelPicker = !showReviewerModelPicker" data-reviewer-trigger class="w-full h-9 px-3 rounded-lg flex items-center gap-2 text-[12px] transition-colors cursor-pointer"
                  :class="[isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-brand-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-brand-400', showReviewerModelPicker ? (isDark ? 'border-brand-400/40' : 'border-brand-400') : '']">
                  <i v-if="!editAgent.reviewerModel" class="ri-eye-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <template v-if="selectedReviewerModelInfo">
                    <span class="font-medium">{{ selectedReviewerModelInfo.group }}</span>
                    <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">·</span>
                    <span>{{ selectedReviewerModelInfo.name }}</span>
                    <i class="ri-eye-line text-[10px] text-sky-400" />
                  </template>
                  <template v-else-if="unavailableReviewerModelName">
                    <span class="font-medium">{{ unavailableReviewerModelName }}</span>
                    <span class="ctx-pill shrink-0 text-[9px]" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/15' : 'bg-amber-50 text-amber-600 border border-amber-100'">不可用</span>
                  </template>
                  <template v-if="!editAgent.reviewerModel">
                    <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">纯代码审查（无视觉模型）</span>
                  </template>
                  <i class="ri-arrow-down-s-line text-[12px] ml-auto" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </button>
                <!-- Reviewer model picker dropdown -->
                <div v-if="showReviewerModelPicker" id="reviewer-model-picker-dropdown" class="absolute left-0 right-0 top-[76px] rounded-xl overflow-hidden z-20 shadow-lg"
                  :class="isDark ? 'bg-d3 shadow-black/40' : 'bg-l2 shadow-xl'">
                  <button @click="editAgent.reviewerModel = ''; showReviewerModelPicker = false"
                    class="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
                    :class="!editAgent.reviewerModel ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4')">
                    <i class="ri-code-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <span>纯代码审查</span>
                    <i v-if="!editAgent.reviewerModel" class="ri-check-line text-[12px] ml-auto text-brand-400" />
                  </button>
                  <div v-if="!hasSelectableReviewerModels" class="px-3 py-3 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">
                    无可用审查模型。请先在设置中启用并配置服务商。
                  </div>
                  <template v-for="g in reviewerModelOptions" :key="g.group">
                    <div class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5" :class="isDark ? 'text-wt-dim border-t border-d4' : 'text-lt-aux border-t border-bdrF'">{{ g.group }}</div>
                    <button v-for="m in g.models" :key="m.value" @click="editAgent.reviewerModel = m.value; showReviewerModelPicker = false"
                      class="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
                      :class="selectedReviewerModelInfo?.value === m.value ? (isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')">
                      <span class="font-medium">{{ m.name }}</span>
                      <i v-if="m.hasVision" class="ri-eye-line text-[10px] text-sky-400" />
                      <span class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ m.ctx }}k</span>
                      <i v-if="selectedReviewerModelInfo?.value === m.value" class="ri-check-line text-[12px] ml-auto text-brand-400" />
                    </button>
                  </template>
                </div>
                <div v-if="reviewerModelWarning" class="mt-1 text-[10px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'">{{ reviewerModelWarning }}</div>
              </div>
              <!-- Reviewer model info -->
              <div v-if="needsReviewerModel && !editAgent.useSameModel && !editAgent.reviewerModel" class="rounded-md px-3 py-1.5 mb-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <div class="flex items-start gap-1.5">
                  <i class="ri-information-line text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未配置审查模型时，视觉审查子 Agent 将降级为纯代码审查模式（基于 HTML/CSS 代码分析布局和配色）。</p>
                </div>
              </div>
              <!-- Temperature -->
              <div class="mb-3">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">温度 (Temperature)</label>
                  <span class="text-[11px] font-mono" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ editAgent.temperature }}</span>
                </div>
                <input v-model.number="editAgent.temperature" type="range" min="0" max="2" step="0.1" class="w-full h-1.5 rounded-full appearance-none cursor-pointer" :class="isDark ? 'bg-d4 accent-brand-400' : 'bg-l4 accent-brand-500'">
                <div class="flex justify-between mt-0.5">
                  <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">精确</span>
                  <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">创意</span>
                </div>
              </div>
              <!-- Thinking Mode -->
              <div class="mb-3 pt-3" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-1.5">
                    <i class="ri-brain-line text-[12px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
                    <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">思考模式</label>
                  </div>
                  <div class="flex items-center gap-1">
                    <button v-for="opt in thinkingModeOptions" :key="opt.key" @click="editAgent.thinkingMode = opt.key"
                      class="h-6 px-2 rounded-md text-[10px] font-medium transition-all"
                      :class="editAgent.thinkingMode === opt.key
                        ? (isDark ? 'bg-brand-400/12 text-brand-400 border border-brand-400/30' : 'bg-brand-50 text-brand-500 border border-brand-200')
                        : (isDark ? 'text-wt-dim hover:text-wt-sub border border-d4' : 'text-lt-aux hover:text-lt-sub border border-bdrF')">
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <div v-if="editAgent.thinkingMode !== 'disabled'" class="space-y-2">
                  <div class="flex items-center justify-between mb-1.5">
                    <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">思考强度</label>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button v-for="opt in thinkingIntensityOptions" :key="opt.key" @click="editAgent.thinkingIntensity = opt.key"
                      class="flex-1 rounded-lg p-2 text-left transition-all"
                      :class="editAgent.thinkingIntensity === opt.key
                        ? (isDark ? 'bg-brand-400/10 border border-brand-400/30' : 'bg-brand-50 border border-brand-200')
                        : (isDark ? 'border border-d4 hover:border-brand-400/20 bg-d0' : 'border border-bdrF hover:border-brand-200 bg-l2')">
                      <div class="flex items-center gap-1.5">
                        <i
                          :class="[
                            opt.icon,
                            'text-[12px]',
                            editAgent.thinkingIntensity === opt.key
                              ? (isDark ? 'text-brand-400' : 'text-brand-500')
                              : (isDark ? 'text-wt-dim' : 'text-lt-aux')
                          ]"
                        /><span class="text-[11px] font-medium"
                          :class="editAgent.thinkingIntensity === opt.key ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-sub' : 'text-lt-sub')">{{ opt.label }}</span>
                      </div>
                      <span class="text-[9px] mt-0.5 block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ opt.desc }}</span>
                    </button>
                  </div>
                </div>
                <div v-if="editAgent.thinkingMode === 'disabled'" class="rounded-md px-3 py-1.5" :class="isDark ? 'bg-d0' : 'bg-l2'">
                  <div class="flex items-start gap-1.5">
                    <i class="ri-information-line text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已禁用思考。模型将直接输出结果，不展示推理过程。</p>
                  </div>
                </div>
              </div>
              <!-- Advanced params -->
              <div v-show="editAgent.showAdvanced" class="space-y-3 pt-3" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrF'">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Top P</label>
                      <span class="text-[11px] font-mono" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ editAgent.topP }}</span>
                    </div>
                    <input v-model.number="editAgent.topP" type="range" min="0" max="1" step="0.05" class="w-full h-1.5 rounded-full appearance-none cursor-pointer" :class="isDark ? 'bg-d4 accent-brand-400' : 'bg-l4 accent-brand-500'">
                  </div>
                  <div>
                    <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大输出 Tokens</label>
                    <input v-model.number="editAgent.maxTokens" type="number" min="256" max="128000" step="256" class="w-full h-8 px-2.5 rounded-lg text-[12px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-400'">
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">存在惩罚</label>
                      <span class="text-[11px] font-mono" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ editAgent.presencePenalty }}</span>
                    </div>
                    <input v-model.number="editAgent.presencePenalty" type="range" min="-2" max="2" step="0.1" class="w-full h-1.5 rounded-full appearance-none cursor-pointer" :class="isDark ? 'bg-d4 accent-brand-400' : 'bg-l4 accent-brand-500'">
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">频率惩罚</label>
                      <span class="text-[11px] font-mono" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ editAgent.frequencyPenalty }}</span>
                    </div>
                    <input v-model.number="editAgent.frequencyPenalty" type="range" min="-2" max="2" step="0.1" class="w-full h-1.5 rounded-full appearance-none cursor-pointer" :class="isDark ? 'bg-d4 accent-brand-400' : 'bg-l4 accent-brand-500'">
                  </div>
                </div>
                <div class="rounded-md px-3 py-2" :class="isDark ? 'bg-d0' : 'bg-l2'">
                  <div class="flex items-start gap-2">
                    <i class="ri-information-line text-[12px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                    <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><b>温度</b>越低输出越确定，越高越多样。<b>Top P</b> 控制候选词范围。<b>存在惩罚</b>鼓励引入新话题，<b>频率惩罚</b>降低重复用词。</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Permissions -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center gap-2 mb-3"><i class="ri-shield-check-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">权限与能力</span></div>
              <div class="rounded-md px-3 py-2 mb-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <div class="flex items-center gap-2">
                  <i class="ri-information-line text-[12px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">启用对应工具时将自动开启所需权限</p>
                </div>
              </div>
              <div class="space-y-1">
                <div v-for="p in permList" :key="p.key" class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg" :class="editAgent.permissions[p.key] ? (isDark ? 'bg-emerald-400/4' : 'bg-emerald-50/40') : (isDark ? 'hover:bg-white/2' : 'hover:bg-l4/50')">
                  <i :class="p.icon + ' text-[13px] ' + (editAgent.permissions[p.key] ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux'))" />
                  <div class="flex-1 min-w-0">
                    <span class="text-[11px] font-medium block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ p.label }}</span>
                    <span class="text-[10px] block" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ p.desc }}</span>
                  </div>
                  <div class="toggle shrink-0" :class="editAgent.permissions[p.key] ? 'on' : (isDark ? 'off' : 'light-off')" @click="togglePerm(p.key)" />
                </div>
              </div>
              <!-- Per-agent command whitelist/blacklist additions -->
              <div v-if="editAgent.permissions.execCommand" class="mt-3 space-y-2">
                <div class="rounded-lg p-3" :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <i class="ri-check-double-line text-[11px] text-emerald-400" />
                    <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">命令白名单追加</span>
                    <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">与全局设置合并；留空仅使用全局设置</span>
                  </div>
                  <div class="flex flex-wrap gap-1 mb-1.5">
                    <span v-for="(cmd, idx) in (editAgent.permissions.execCommandWhitelist || [])" :key="idx"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer"
                      :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:text-red-400' : 'bg-emerald-50 text-emerald-600 hover:text-red-500'"
                      @click="editAgent.permissions.execCommandWhitelist.splice(idx, 1)">
                      {{ cmd }} <i class="ri-close-line text-[8px]" />
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <input :ref="el => { if(el) agentWlInput = el }" type="text" placeholder="命令名或前缀"
                      class="flex-1 h-6 px-1.5 rounded text-[10px] outline-none"
                      :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder:text-lt-aux'"
                      @keydown.enter="addAgentWhitelist">
                    <button @click="addAgentWhitelist" class="h-6 px-2 rounded text-[9px]"
                      :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'">
                      <i class="ri-add-line text-[10px]" />
                    </button>
                  </div>
                </div>
                <div class="rounded-lg p-3" :class="isDark ? 'bg-d0/60 border border-d4' : 'bg-l2/60 border border-bdrF'">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <i class="ri-forbid-line text-[11px] text-red-400" />
                    <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">命令黑名单追加</span>
                    <span class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">与全局设置合并；留空仅使用全局设置</span>
                  </div>
                  <div class="flex flex-wrap gap-1 mb-1.5">
                    <span v-for="(cmd, idx) in (editAgent.permissions.execCommandBlacklist || [])" :key="idx"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer"
                      :class="isDark ? 'bg-red-400/10 text-red-400 hover:text-wt-aux' : 'bg-red-50 text-red-500 hover:text-lt-aux'"
                      @click="editAgent.permissions.execCommandBlacklist.splice(idx, 1)">
                      {{ cmd }} <i class="ri-close-line text-[8px]" />
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <input :ref="el => { if(el) agentBlInput = el }" type="text" placeholder="命令前缀"
                      class="flex-1 h-6 px-1.5 rounded text-[10px] outline-none"
                      :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder:text-wt-dim' : 'bg-l2 border border-bdrF text-lt-sub placeholder:text-lt-aux'"
                      @keydown.enter="addAgentBlacklist">
                    <button @click="addAgentBlacklist" class="h-6 px-2 rounded text-[9px]"
                      :class="isDark ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20' : 'bg-red-50 text-red-500 hover:bg-red-100'">
                      <i class="ri-add-line text-[10px]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tools -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-tools-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">工具</span></div>
                <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已选 {{ selectedToolCount }} / {{ store.toolList.length }}</span>
              </div>
              <div class="relative mb-2">
                <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <input v-model="toolSearch" type="text" placeholder="搜索工具名称、说明、分类或 MCP 服务器" class="w-full h-8 pl-8 pr-7 rounded-lg text-[11px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/35' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-300'">
                <button v-if="toolSearch" @click="toolSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                  <i class="ri-close-circle-line text-[12px]" />
                </button>
              </div>
              <div class="space-y-1 max-h-[180px] overflow-y-auto">
                <div v-if="!filteredTools.length" class="text-[11px] py-3 text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有匹配的工具</div>
                <div v-for="t in filteredTools" :key="t.id" class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors" :class="[t.alwaysEnabled || t.runtimeDisabled ? 'cursor-default' : 'cursor-pointer', t.runtimeDisabled ? 'opacity-60' : '', hasTool(t.id) && !t.runtimeDisabled ? (isDark ? 'bg-emerald-400/6' : 'bg-emerald-50/50') : (isDark ? 'hover:bg-white/3' : 'hover:bg-l4')]" @click="toggleTool(t.id)">
                  <input type="checkbox" class="agent-pick-checkbox" :class="isDark ? 'checkbox' : 'light-checkbox'" :checked="hasTool(t.id) && !t.runtimeDisabled" :disabled="t.alwaysEnabled || t.runtimeDisabled" @click.stop="toggleTool(t.id)">
                  <i :class="t.icon + ' text-[13px] ' + (hasTool(t.id) ? 'opacity-100' : 'opacity-50')" :style="'color:' + t.color" />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-[11px] font-medium" :class="hasTool(t.id) ? (isDark ? 'text-wt-sub' : 'text-lt-sub') : (isDark ? 'text-wt-aux' : 'text-lt-aux')">{{ t.name }}</span>
                      <span v-if="t.alwaysEnabled" class="ctx-pill text-[9px]" :class="isDark ? 'bg-blue-400/10 text-blue-400 border border-blue-400/20' : 'bg-blue-50 text-blue-600 border border-blue-100'"><i class="ri-shield-check-line text-[8px]" /> 系统默认</span>
                      <span v-if="t.source === 'mcp'" class="ctx-pill text-[9px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'" :title="`MCP 远程服务器 · 启用后包含未禁用工具，并允许 Agent 读取该服务器资源/提示`"><i class="ri-plug-line text-[8px]" /> MCP · {{ t.toolCount }} 工具 · {{ t.resourceCount || 0 }} 资源 · {{ t.promptCount || 0 }} 提示</span>
                      <span v-else-if="t.type === 'router'" class="ctx-pill text-[9px]" :class="isDark ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' : 'bg-cyan-50 text-cyan-600 border border-cyan-100'"><i class="ri-route-line text-[8px]" /> 路由工具</span>
                      <span v-else-if="!t.builtin" class="ctx-pill text-[9px]" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">自定义</span>
                      <span v-if="t.runtimeDisabled" class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">暂未支持</span>
                      <span v-if="hasTool(t.id) && !t.runtimeDisabled && t.permReq && !editAgent.permissions[t.permReq]" class="text-[9px] font-medium px-1.5 py-[1px] rounded" :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">需开启权限</span>
                      <span v-if="hasTool(t.id) && !t.runtimeDisabled && t.permReq && editAgent.permissions[t.permReq]" class="text-[9px] font-medium px-1.5 py-[1px] rounded" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'"><i class="ri-link text-[8px]" /> 已联动</span>
                    </div>
                    <div v-if="t.desc" class="text-[10px] leading-snug line-clamp-2 mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" :title="t.desc">{{ t.desc }}</div>
                  </div>
                  <span class="ctx-pill shrink-0 text-[9px]" :class="t.cat === 'media' ? (isDark ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20' : 'bg-cyan-50 text-cyan-600 border border-cyan-100') : t.cat === 'document' ? (isDark ? 'bg-violet-400/10 text-violet-400 border border-violet-400/20' : 'bg-violet-50 text-violet-600 border border-violet-100') : t.cat === 'mcp' ? (isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100') : (isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100')">{{ toolCatLabel(t.cat) }}</span>
                </div>
              </div>
            </div>

            <!-- Skills -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-flashlight-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Skills</span></div>
                <span class="text-[10px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已选 {{ editAgent.skills.length }} / {{ store.skillList.length }}</span>
              </div>
              <div class="relative mb-2">
                <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <input v-model="skillSearch" type="text" placeholder="搜索 Skill 名称、说明或 ID" class="w-full h-8 pl-8 pr-7 rounded-lg text-[11px] outline-none transition-colors" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/35' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-300'">
                <button v-if="skillSearch" @click="skillSearch = ''" class="absolute right-2 top-1/2 -translate-y-1/2" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
                  <i class="ri-close-circle-line text-[12px]" />
                </button>
              </div>
              <div class="space-y-1 max-h-[180px] overflow-y-auto">
                <div v-if="!filteredSkills.length" class="text-[11px] py-3 text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有匹配的 Skill</div>
                <div v-for="s in filteredSkills" :key="s.id" class="flex items-start gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors" :class="hasSkill(s.id) ? (isDark ? 'bg-brand-400/6' : 'bg-brand-50/50') : (isDark ? 'hover:bg-white/3' : 'hover:bg-l4')" @click="toggleSkill(s.id)">
                  <input type="checkbox" class="agent-pick-checkbox mt-0.5" :class="isDark ? 'checkbox' : 'light-checkbox'" :checked="hasSkill(s.id)" @click.stop="toggleSkill(s.id)">
                  <i :class="s.icon + ' text-[13px] mt-0.5 ' + (hasSkill(s.id) ? 'opacity-100' : 'opacity-50')" :style="'color:' + s.color" />
                  <div class="flex-1 min-w-0">
                    <div class="text-[11px] font-medium" :class="hasSkill(s.id) ? (isDark ? 'text-wt-sub' : 'text-lt-sub') : (isDark ? 'text-wt-aux' : 'text-lt-aux')">{{ s.name }}</div>
                    <div v-if="s.desc" class="text-[10px] leading-snug line-clamp-2 mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" :title="s.desc">{{ s.desc }}</div>
                  </div>
                  <span v-if="!s.builtin" class="ctx-pill shrink-0 text-[9px] mt-0.5" :class="isDark ? 'bg-brand-400/8 text-brand-400 border border-brand-400/20' : 'bg-brand-50 text-brand-500 border border-brand-100'">自定义</span>
                </div>
              </div>
            </div>

            <!-- SubAgents -->
            <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><i class="ri-team-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">SubAgents</span></div>
                <div class="toggle shrink-0" :class="editAgent.subAgentEnabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleSubAgentEnabled" />
              </div>
              <div class="rounded-md px-3 py-2 mb-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <div class="flex items-center gap-2">
                  <i class="ri-information-line text-[12px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">子智能体可以独立执行子任务，上下文与主智能体隔离，完成后将结果回传</p>
                </div>
              </div>
              <div v-if="editAgent.subAgentEnabled" class="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                <div v-for="sa in store.subAgentList" :key="sa.id" class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors" :class="hasSubAgent(sa) ? (isDark ? 'bg-amber-400/6' : 'bg-amber-50/50') : (isDark ? 'hover:bg-white/3' : 'hover:bg-l4')" @click="toggleSubAgent(sa)">
                  <input type="checkbox" class="agent-pick-checkbox" :class="isDark ? 'checkbox' : 'light-checkbox'" :checked="hasSubAgent(sa)" @click.stop="toggleSubAgent(sa)">
                  <i :class="sa.icon + ' text-[13px] shrink-0 ' + (hasSubAgent(sa) ? 'opacity-100' : 'opacity-50')" :style="'color:' + sa.color" />
                  <div class="flex-1 min-w-0">
                    <span class="text-[11px] font-medium block truncate" :class="hasSubAgent(sa) ? (isDark ? 'text-wt-sub' : 'text-lt-sub') : (isDark ? 'text-wt-aux' : 'text-lt-aux')">{{ sa.name }}</span>
                    <span class="text-[10px] leading-snug line-clamp-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" :title="sa.desc">{{ sa.desc }}</span>
                  </div>
                  <span v-if="hasSubAgent(sa)" class="ctx-pill shrink-0 text-[9px] max-w-[160px] truncate" :title="sa.abilities.join(', ')" :class="isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-100'">{{ sa.abilities.join(', ') }}</span>
                </div>
              </div>
              <div v-if="!editAgent.subAgentEnabled" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未启用子智能体委派</div>
            </div>

          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 flex justify-end gap-2 shrink-0"
          :class="isDark ? 'border-t border-d4 bg-d4/30' : 'border-t border-bdrL bg-l4/30'">
          <button @click="emit('cancel')" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors" :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
          <button @click="emit('save')" class="px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors" :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-agent-500 text-white hover:bg-agent-600'"><i class="ri-check-line text-[12px]" /> 保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.agent-pick-checkbox {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  display: grid;
  place-content: center;
  width: 14px;
  height: 14px;
  min-width: 14px;
  margin-top: 0;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background-color 140ms cubic-bezier(0.25, 1, 0.5, 1),
    border-color 140ms cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 140ms cubic-bezier(0.25, 1, 0.5, 1);
}

.agent-pick-checkbox.checkbox {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
}

.agent-pick-checkbox.light-checkbox {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.agent-pick-checkbox::after {
  content: "";
  box-sizing: border-box;
  width: 4px;
  height: 7px;
  border: solid currentColor;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) scale(0);
  transform-origin: 50% 50%;
  transition: transform 120ms cubic-bezier(0.25, 1, 0.5, 1);
}

.agent-pick-checkbox:checked {
  border-color: #34d399;
  background: #34d399;
  color: #062c24;
}

.agent-pick-checkbox:checked::after {
  transform: rotate(45deg) scale(1);
}

.agent-pick-checkbox:disabled {
  cursor: not-allowed;
}

.agent-pick-checkbox:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.22);
}
</style>
