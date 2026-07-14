<script setup>
import { computed, reactive, watch } from 'vue'
import OptionSelector from '@/components/OptionSelector.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  agent: { type: Object, default: null },
  modelOptions: { type: Array, default: () => [] },
  defaultModelLabel: { type: String, default: '全局聊天模型' },
  globalWebResearchEnabled: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

const form = reactive({
  mode: 'supervised',
  model_ref: '',
  default_write_policy: 'direct',
  instruction: '',
  auto_maintain: true,
  web_research_mode: 'inherit',
  semantic_audit_enabled: false,
  semantic_audit_trigger: 'manual',
  semantic_audit_model_ref: '',
})

const hasModels = computed(() =>
  props.modelOptions.some(group => Array.isArray(group.children) && group.children.length > 0)
)

const modeOptions = [
  { value: 'supervised', label: '启用：监督模式', icon: 'ri-shield-check-line', accent: 'emerald' },
  { value: 'disabled', label: '停用', icon: 'ri-pause-circle-line' },
]

const modelSelectOptions = computed(() => {
  const opts = [{ value: '', label: '跟随全局聊天模型', description: props.defaultModelLabel, icon: 'ri-sparkling-2-line' }]
  for (const group of props.modelOptions) {
    for (const child of group.children || []) {
      opts.push({ value: child.value, label: child.label, badge: group.label })
    }
  }
  return opts
})

const semanticAuditTriggerOptions = [
  {
    value: 'manual',
    label: '仅手动',
    accent: 'sky',
  },
  {
    value: 'after_maintenance',
    label: '维护完成后',
    accent: 'emerald',
  },
]

const webResearchOptions = [
  { value: 'inherit', label: '继承全局', accent: 'brand' },
  { value: 'enabled', label: '强制开启', accent: 'emerald' },
  { value: 'disabled', label: '强制关闭', accent: 'amber' },
]

const semanticAuditModelOptions = computed(() => {
  const options = [{
    value: '',
    label: '继承 WikiAgent 模型',
    accent: 'brand',
  }]
  for (const group of props.modelOptions) {
    for (const child of group.children || []) {
      options.push({
        value: child.value,
        label: child.label,
        badge: group.label,
        badgeClass: 'max-w-[86px] truncate',
        accent: 'brand',
      })
    }
  }
  return options
})

watch(() => props.show, (show) => {
  if (!show) return
  form.mode = props.agent?.mode || 'supervised'
  form.model_ref = props.agent?.model_ref || ''
  form.default_write_policy = props.agent?.default_write_policy || 'direct'
  form.instruction = props.agent?.instruction || ''
  form.auto_maintain = props.agent?.auto_maintain !== false
  form.web_research_mode = props.agent?.web_research?.mode || 'inherit'
  form.semantic_audit_enabled = !!props.agent?.semantic_audit?.enabled
  form.semantic_audit_trigger = props.agent?.semantic_audit?.trigger || 'manual'
  form.semantic_audit_model_ref = props.agent?.semantic_audit?.model_ref || ''
})

function save() {
  emit('save', {
    mode: form.mode,
    model_ref: form.model_ref,
    default_write_policy: 'direct',
    instruction: form.instruction.trim(),
    auto_maintain: form.auto_maintain,
    web_research: { mode: form.web_research_mode },
    semantic_audit: {
      enabled: form.semantic_audit_enabled,
      trigger: form.semantic_audit_trigger,
      auto_fix: false,
      model_ref: form.semantic_audit_model_ref,
    },
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[72] flex items-center justify-center bg-black/35" @click.self="emit('close')">
      <div class="agent-settings-modal w-[560px] rounded-2xl border shadow-2xl overflow-hidden" :class="isDark ? 'bg-d2 border-bdr text-wt-main' : 'bg-white border-bdrF text-lt-main'">
        <div class="h-16 px-5 py-3 flex items-center justify-between border-b" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-agent-400/12 text-agent-400' : 'bg-agent-50 text-agent-500'">
              <i class="ri-robot-2-line text-[17px]" />
            </div>
            <div class="min-w-0">
              <h2 class="text-[14px] font-semibold">配置 WikiAgent</h2>
              <p class="mt-0.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">维护当前 Wiki 的内置 Agent，写入会自动生成历史快照</p>
            </div>
          </div>
          <button class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0" :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l4'" @click="emit('close')">
            <i class="ri-close-line text-[16px]" />
          </button>
        </div>

        <div class="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)] thin-scroll">
          <div class="grid grid-cols-2 gap-3 items-start">
            <label class="block">
              <span class="block text-[11px] mb-1.5 font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">状态</span>
              <OptionSelector v-model="form.mode" :options="modeOptions" :is-dark="isDark" default-accent="emerald" />
            </label>

            <label class="block">
              <span class="block text-[11px] mb-1.5 font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">写入策略</span>
              <div class="min-h-[42px] px-3 rounded-lg border flex items-center justify-between text-[12px]" :class="isDark ? 'bg-d0 border-d4 text-wt-sub' : 'bg-white border-bdrF text-lt-sub'">
                <span>维护正式页</span>
                <i class="ri-lock-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              </div>
            </label>
          </div>

          <label class="block">
            <span class="block text-[11px] mb-1.5 font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">模型</span>
            <OptionSelector
              v-model="form.model_ref"
              :options="modelSelectOptions"
              :is-dark="isDark"
              placeholder="选择模型"
              menu-class="max-h-[240px] overflow-y-auto" />
            <p v-if="!hasModels" class="mt-1.5 text-[11px] flex items-center gap-1 text-amber-500"><i class="ri-error-warning-line text-[12px]" />当前没有启用的聊天模型，请先到设置里配置模型。</p>
          </label>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl p-3 border" :class="isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF'">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">来源变化后自动维护</div>
                  <div class="mt-1 text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">关闭后仍会解析来源和执行本地结构检查。</div>
                </div>
                <div class="toggle shrink-0 cursor-pointer" :class="form.auto_maintain ? 'on' : (isDark ? 'off' : 'light-off')" @click="form.auto_maintain = !form.auto_maintain" />
              </div>
            </div>
            <div class="rounded-xl p-3 border" :class="isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF'">
              <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">确定性结构检查</div>
              <div class="mt-1 flex items-center gap-1 text-[10px] text-emerald-500"><i class="ri-checkbox-circle-line" />始终开启 · 不使用模型</div>
            </div>
          </div>

          <div class="rounded-xl p-3 border space-y-2.5" :class="isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF'">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网求证</div>
                <div class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">全局当前{{ globalWebResearchEnabled ? '已开启' : '已关闭' }}，当前 Wiki 可覆盖全局默认。</div>
              </div>
              <div class="w-[148px] shrink-0">
                <OptionSelector
                  v-model="form.web_research_mode"
                  :options="webResearchOptions"
                  :is-dark="isDark"
                  default-accent="brand"
                  trigger-class="!min-h-[34px] !px-2.5 !py-1.5"
                  menu-class="!rounded-lg"
                  option-class="!py-2" />
              </div>
            </div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">自动顺序：Exa → Bing → SearXNG → Tavily；网页登记为来源后才能进入正式引用。</div>
          </div>

          <div
            class="rounded-xl p-3 border space-y-3 transition-colors"
            :class="form.semantic_audit_enabled
              ? (isDark ? 'bg-brand-400/5 border-brand-400/25' : 'bg-brand-50/55 border-brand-400/20')
              : (isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF')">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">AI 语义巡检</div>
                <div class="mt-0.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可选模型检查矛盾、陈旧结论和重复页面，默认只报告；会产生模型调用与相应成本。</div>
              </div>
              <div class="toggle shrink-0 cursor-pointer" :class="form.semantic_audit_enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="form.semantic_audit_enabled = !form.semantic_audit_enabled" />
            </div>
            <div v-if="form.semantic_audit_enabled" class="semantic-audit-fields grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="block min-w-0">
                <span class="mb-1.5 block text-[10.5px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">触发方式</span>
                <OptionSelector
                  v-model="form.semantic_audit_trigger"
                  :options="semanticAuditTriggerOptions"
                  :is-dark="isDark"
                  default-accent="sky"
                  trigger-class="!min-h-[36px] !py-1.5"
                  menu-class="max-h-[160px] overflow-y-auto thin-scroll"
                  option-class="!py-2" />
              </label>
              <label class="block min-w-0">
                <span class="mb-1.5 block text-[10.5px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">巡检模型</span>
                <OptionSelector
                  v-model="form.semantic_audit_model_ref"
                  :options="semanticAuditModelOptions"
                  :is-dark="isDark"
                  default-accent="brand"
                  placeholder="选择巡检模型"
                  trigger-class="!min-h-[36px] !py-1.5"
                  menu-class="max-h-[200px] overflow-y-auto thin-scroll"
                  option-class="!py-2" />
              </label>
            </div>
          </div>

          <label class="block">
            <span class="block text-[11px] mb-1.5 font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">默认任务指令</span>
            <textarea
              v-model="form.instruction"
              class="w-full h-24 px-3 py-2 rounded-lg text-[12px] leading-5 outline-none border resize-none transition-colors"
              :class="isDark ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/50' : 'bg-l2 border-bdrL text-lt-main placeholder-lt-aux focus:border-brand-400'"
              placeholder="留空则默认检查当前 Wiki，根据已解析来源维护正式 Markdown 页面，建议默认留空。" />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl p-3 border" :class="isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF'">
              <div class="flex items-center gap-1.5 mb-1.5">
                <i class="ri-eye-line text-[13px] text-emerald-400" />
                <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可读取</span>
              </div>
              <p class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前 Wiki 页面、来源注册表、解析产物。</p>
            </div>
            <div class="rounded-xl p-3 border" :class="isDark ? 'bg-d0 border-bdr' : 'bg-l1 border-bdrF'">
              <div class="flex items-center gap-1.5 mb-1.5">
                <i class="ri-quill-pen-line text-[13px] text-brand-400" />
                <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">可写入</span>
              </div>
              <p class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">通过 wiki_tool 写 pages、index.md、overview.md；自动记录 history 与 log.md。</p>
            </div>
          </div>
        </div>

        <div class="px-5 py-3 flex items-center justify-end gap-2 border-t" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <button class="px-3 h-8 rounded-lg text-[12px] transition-colors" :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'" @click="emit('close')">取消</button>
          <button
            class="wbtn px-4 h-8 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1 border"
            :class="isDark ? 'bg-brand-400/10 text-brand-400 border-brand-400/30 hover:bg-brand-400/18 hover:border-brand-400/55' : 'bg-brand-50 text-brand-600 border-brand-400/25 hover:bg-brand-100 hover:border-brand-400/45'"
            @click="save">
            <i class="ri-check-line text-[14px]" />保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.agent-settings-modal {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
}
.wbtn {
  transition: transform .16s ease, background-color .15s ease, border-color .15s ease, color .15s ease;
}
.wbtn:hover {
  transform: translateY(-1px);
}
@media (max-width: 560px) {
  .agent-settings-modal {
    width: calc(100vw - 20px);
  }
}
</style>
