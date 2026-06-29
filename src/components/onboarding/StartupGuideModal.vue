<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useAgentsStore } from '@/stores/agents'
import { parseModelRef } from '@/utils/modelRef'

const props = defineProps({
  show: { type: Boolean, default: false },
})

const emit = defineEmits(['update:show'])

const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const agentsStore = useAgentsStore()

const showModal = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value),
})

const isDark = computed(() => appStore.isDark)

function close() {
  showModal.value = false
}

function go(path) {
  close()
  router.push(path)
}

function providerReady(provider) {
  if (!provider?.enabled) return false
  if (!settingsStore.providerConfigured(provider)) return false
  return (provider.models || []).some((model) => model.enabled && model.tier !== 'embedding')
}

function findModel(ref) {
  const parsed = parseModelRef(ref)
  if (!parsed.modelId) return null

  if (parsed.scoped) {
    const provider = settingsStore.providers.find((item) => item.id === parsed.providerId)
    const model = provider?.models?.find((item) => item.id === parsed.modelId)
    return provider && model ? { provider, model } : null
  }

  for (const provider of settingsStore.providers) {
    const model = provider.models?.find((item) => item.id === parsed.modelId)
    if (model) return { provider, model }
  }
  return null
}

const defaultModelKeys = [
  { key: 'chat', label: '对话' },
  { key: 'title', label: '标题' },
  { key: 'translation', label: '翻译' },
]

const readyProviders = computed(() => settingsStore.providers.filter(providerReady))
const officialProviderReady = computed(() => readyProviders.value.some((provider) => provider.official))
const modelServiceReady = computed(() => readyProviders.value.length > 0)
const defaultModelsReady = computed(() =>
  defaultModelKeys.every(({ key }) => {
    const match = findModel(settingsStore.defaultModels[key])
    return !!match && providerReady(match.provider) && match.model.enabled && match.model.tier !== 'embedding'
  }),
)

const modelServiceText = computed(() => {
  if (!modelServiceReady.value) return '可填写自己的 API Key，或使用官方云端模型按积分付费'
  if (officialProviderReady.value && readyProviders.value.length === 1) return '官方云端模型服务已可用'
  const names = readyProviders.value.slice(0, 2).map((provider) => provider.name).join('、')
  const more = readyProviders.value.length > 2 ? ` 等 ${readyProviders.value.length} 个服务商` : ''
  return `已配置 ${names}${more}`
})

const defaultModelText = computed(() => {
  if (!defaultModelsReady.value) return '建议为对话、标题生成、翻译分别确认默认模型'
  return defaultModelKeys
    .map(({ key, label }) => `${label}: ${settingsStore.getModelName(settingsStore.defaultModels[key])}`)
    .join(' · ')
})

const agentText = computed(() => {
  const builtin = agentsStore.builtinCount || 0
  const custom = agentsStore.customCount || 0
  if (builtin || custom) return `${builtin} 个内置 Agent · ${custom} 个自定义 Agent`
  return '内置 Agent 可直接使用，也可以创建自己的 Agent'
})

const requiredProgress = computed(() => {
  const checks = [settingsStore.isWorkspaceReady, modelServiceReady.value, defaultModelsReady.value]
  return checks.filter(Boolean).length
})

const steps = computed(() => [
  {
    key: 'workspace',
    index: 1,
    title: '设置授权根目录',
    label: '必须',
    icon: 'ri-folder-shield-line',
    color: 'emerald',
    ready: settingsStore.isWorkspaceReady,
    status: settingsStore.isWorkspaceReady ? '已设置' : '未设置',
    desc: settingsStore.isWorkspaceReady
      ? settingsStore.workDirRoot
      : '用于保存文档、笔记、Agent 产出与技能配置，也是 Agent 文件读写的安全边界',
    action: '设置目录',
    path: '/settings/directory',
  },
  {
    key: 'models',
    index: 2,
    title: '配置模型服务',
    label: '推荐',
    icon: 'ri-ai-generate-3d-line',
    color: 'brand',
    ready: modelServiceReady.value,
    status: modelServiceReady.value ? '已可用' : '待配置',
    desc: modelServiceText.value,
    action: '配置模型',
    path: '/settings/models',
  },
  {
    key: 'defaults',
    index: 3,
    title: '确认默认模型',
    label: '推荐',
    icon: 'ri-cpu-line',
    color: 'sky',
    ready: defaultModelsReady.value,
    status: defaultModelsReady.value ? '已确认' : '建议检查',
    desc: defaultModelText.value,
    action: '默认模型',
    path: '/settings/default-models',
  },
  {
    key: 'agents',
    index: 4,
    title: '使用和编辑 Agent',
    label: '可选',
    icon: 'ri-sparkling-2-line',
    color: 'violet',
    ready: true,
    status: '可开始',
    desc: agentText.value,
    action: '查看 Agent',
    path: '/agents',
    secondaryAction: '创建 Agent',
    secondaryPath: '/agents/create',
  },
])

function iconClass(step) {
  const colorMap = {
    emerald: isDark.value ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    brand: isDark.value ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-600',
    sky: isDark.value ? 'bg-sky-400/12 text-sky-400' : 'bg-sky-50 text-sky-600',
    violet: isDark.value ? 'bg-violet-400/12 text-violet-400' : 'bg-violet-50 text-violet-600',
  }
  return colorMap[step.color] || colorMap.brand
}

function cardClass(step) {
  if (step.ready) {
    return isDark.value ? 'bg-d0 border-d4' : 'bg-l2 border-bdrL'
  }
  if (step.key === 'workspace') {
    return isDark.value ? 'bg-emerald-400/6 border-emerald-400/25' : 'bg-emerald-50 border-emerald-100'
  }
  return isDark.value ? 'bg-d0 border-d4' : 'bg-l2 border-bdrL'
}

function statusClass(step) {
  if (step.ready) {
    return isDark.value
      ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
      : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
  }
  if (step.key === 'workspace') {
    return isDark.value
      ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
      : 'bg-amber-50 text-amber-600 border border-amber-100'
  }
  return isDark.value ? 'bg-d3 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'
}
</script>

<template>
  <MsModal
    v-model:show="showModal"
    :width="660"
    max-height="88vh"
    :show-footer="true"
    :close-on-overlay="false"
    :closable="false">
    <template #header>
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
          <i class="ri-compass-3-line text-[19px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            欢迎使用 Reviva
          </div>
          <div class="text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            按这个顺序完成基础配置，后续对话、资料和 Agent 才能稳定工作
          </div>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <div
        class="rounded-xl px-4 py-3 flex items-center gap-3"
        :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrL'">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-d3' : 'bg-l3'">
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            {{ requiredProgress }}/3
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">基础准备</span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">根目录必须设置，其余可稍后完善</span>
          </div>
          <div class="h-1.5 rounded-full mt-2 overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
            <div
              class="h-full rounded-full bg-brand-400 transition-all duration-300"
              :style="{ width: `${(requiredProgress / 3) * 100}%` }" />
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="step in steps"
          :key="step.key"
          class="rounded-xl border p-3 min-w-0"
          :class="cardClass(step)">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="iconClass(step)">
              <i :class="[step.icon, 'text-[16px]']" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                  {{ step.index }}. {{ step.title }}
                </span>
                <span
                  class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full"
                  :class="step.key === 'workspace' && !step.ready ? (isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-600') : (isDark ? 'bg-d3 text-wt-dim' : 'bg-l3 text-lt-aux')">
                  {{ step.label }}
                </span>
              </div>
              <div class="mt-1.5">
                <span class="ctx-pill text-[9px]" :class="statusClass(step)">
                  <i :class="[step.ready ? 'ri-check-line' : 'ri-time-line', 'text-[8px]']" />
                  {{ step.status }}
                </span>
              </div>
              <p class="mt-2 text-[10.5px] leading-relaxed line-clamp-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                {{ step.desc }}
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button
                  class="h-7 px-3 rounded-lg text-[10.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                  :class="isDark ? 'bg-brand-400/12 text-brand-300 hover:bg-brand-400/18' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'"
                  @click="go(step.path)">
                  <i class="ri-arrow-right-line text-[11px]" />
                  {{ step.action }}
                </button>
                <button
                  v-if="step.secondaryAction"
                  class="h-7 px-3 rounded-lg text-[10.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                  :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'"
                  @click="go(step.secondaryPath)">
                  <i class="ri-add-line text-[11px]" />
                  {{ step.secondaryAction }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
        :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrL text-lt-aux'">
        <i class="ri-lightbulb-line text-amber-400 text-[14px] mt-[1px] shrink-0" />
        <div class="text-[10.5px] leading-relaxed">
          内置 Agent 配好模型后即可使用；需要更贴合自己流程时，可以在 Agent 页面编辑工具权限、提示词、模型和执行限制。
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
        @click="close">
        稍后再说
      </button>
      <button
        class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
        :class="isDark ? 'bg-emerald-400 text-d0 hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'"
        @click="go('/settings/directory')">
        <i class="ri-folder-settings-line text-[11px]" />
        先设置根目录
      </button>
    </template>
  </MsModal>
</template>
