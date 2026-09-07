<script setup>
import { ref, watch, computed } from 'vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import * as kbApi from '@/apis/kb-source'
import AiAdapterModal from './AiAdapterModal.vue'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  preset: { type: Object, default: null },
  editTarget: { type: Object, default: null },
})
const emit = defineEmits(['close', 'save'])
const msg = useMessage()

// 'select' = choose platform, 'config' = fill form
const step = ref('select')
const presets = ref([])
const selectedPreset = ref(null)
const selectedType = ref('')  // 'preset' | 'http'
const form = ref({ name: '' })
const userFieldValues = ref({})
const configJson = ref('')
const showAiModal = ref(false)

const isEdit = computed(() => !!props.editTarget)
const presetIcons = { notion: 'ri-book-2-line', dify: 'ri-robot-2-line', fastgpt: 'ri-flashlight-line', ima: 'ri-search-eye-line' }
const showPresetForm = computed(() => step.value === 'config' && selectedType.value === 'preset')
const showHttpForm = computed(() => step.value === 'config' && selectedType.value === 'http')

const defaultHttpConfig = {
  base_url: 'https://kb.example.com',
  auth: { type: 'api_key', header: 'X-API-Key', key: '' },
  capabilities: { interfaces: ['search'], content_types: ['text'] },
  endpoints: { search: {
    method: 'POST', path: '/api/search',
    body: { keyword: '{query}', pageSize: '{top_k}' },
    response: { items_path: 'data.list', field_mapping: { content: 'textContent' }, total_path: 'data.total' },
  } },
}

async function loadPresets() {
  try { presets.value = await kbApi.getPresets() ?? [] } catch (_) { presets.value = [] }
}

watch(() => props.show, (val) => {
  if (!val) return
  loadPresets()

  if (props.editTarget) {
    form.value = { name: props.editTarget.name }
    configJson.value = JSON.stringify(props.editTarget.config ?? {}, null, 2)
    selectedType.value = props.editTarget.type === 'preset' ? 'preset' : 'http'
    selectedPreset.value = props.editTarget.preset
      ? presets.value.find(p => p.preset === props.editTarget.preset) ?? null
      : null
    step.value = 'config'
  } else if (props.preset) {
    selectPreset(props.preset)
  } else {
    step.value = 'select'
    selectedType.value = ''
    selectedPreset.value = null
    form.value = { name: '' }
    userFieldValues.value = {}
    configJson.value = ''
  }
})

function selectPreset(preset) {
  selectedPreset.value = preset
  selectedType.value = 'preset'
  form.value = { name: preset.name }
  userFieldValues.value = {}
  for (const f of (preset.userFields ?? [])) userFieldValues.value[f.name] = ''
  step.value = 'config'
}

function selectHttp() {
  selectedPreset.value = null
  selectedType.value = 'http'
  form.value = { name: '自定义 HTTP 知识源' }
  configJson.value = JSON.stringify(defaultHttpConfig, null, 2)
  step.value = 'config'
}

function backToSelect() {
  step.value = 'select'
  selectedType.value = ''
  selectedPreset.value = null
  form.value = { name: '' }
  userFieldValues.value = {}
  configJson.value = ''
}

const modalTitle = computed(() => {
  if (isEdit.value) return '编辑知识源'
  if (step.value === 'select') return '添加知识源'
  if (selectedPreset.value) return selectedPreset.value.name
  return '自定义 HTTP'
})

async function handleSave() {
  if (!form.value.name.trim()) { msg.warning('请填写名称'); return }

  if (showPresetForm.value && selectedPreset.value) {
    for (const f of (selectedPreset.value.userFields ?? [])) {
      if (!userFieldValues.value[f.name]?.trim()) { msg.warning('请填写 ' + f.label); return }
    }
    const vals = { ...userFieldValues.value }
    for (const f of (selectedPreset.value.userFields ?? [])) {
      if (f.isAuth && !vals['USER_TOKEN']) vals['USER_TOKEN'] = vals[f.name] ?? ''
    }
    let config
    try {
      config = await kbApi.getPresetConfig(selectedPreset.value.preset, vals)
    } catch (e) {
      msg.error('配置生成失败: ' + (e?.message ?? ''))
      return
    }
    emit('save', { data: {
      name: form.value.name.trim(),
      type: 'preset',
      preset: selectedPreset.value.preset,
      config,
    }, isEdit: false })
  } else {
    let config
    try { config = JSON.parse(configJson.value) }
    catch (e) { msg.error('JSON 格式错误: ' + e.message); return }
    emit('save', { data: {
      name: form.value.name.trim(),
      type: props.editTarget?.type ?? 'http',
      preset: props.editTarget?.preset ?? '',
      config,
    }, isEdit: isEdit.value })
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[60] flex items-center justify-center" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40" />
    <div class="relative z-10 w-[560px] max-h-[85vh] rounded-xl flex flex-col overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 h-14 border-b shrink-0" :class="isDark ? 'border-bdr' : 'border-bdrF'">
        <div class="flex items-center gap-2">
          <button v-if="step === 'config' && !isEdit" class="w-6 h-6 rounded flex items-center justify-center" :class="isDark ? 'hover:bg-d4 text-wt-dim' : 'hover:bg-l4 text-lt-aux'" @click="backToSelect">
            <i class="ri-arrow-left-line text-[15px]" />
          </button>
          <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ modalTitle }}</span>
        </div>
        <button class="w-7 h-7 rounded flex items-center justify-center" :class="isDark ? 'hover:bg-d4 text-wt-dim' : 'hover:bg-l4 text-lt-aux'" @click="emit('close')">
          <i class="ri-close-line text-[16px]" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 min-h-0 overflow-y-auto p-5 thin-scroll">
        <!-- Step 1: Select platform -->
        <div v-if="step === 'select'" class="space-y-2.5">
          <div
            v-for="p in presets"
            :key="p.preset"
            class="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border-2"
            :class="isDark ? 'bg-d2 border-bdr hover:border-brand-400' : 'bg-l2 border-bdrF hover:border-brand-500'"
            @click="selectPreset(p)">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d4' : 'bg-l4'">
              <i :class="[presetIcons[p.preset] || 'ri-database-2-line', 'text-[18px]', isDark ? 'text-brand-400' : 'text-brand-500']" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ p.name }}</div>
              <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ p.base_url }}</div>
            </div>
            <i class="ri-arrow-right-s-line text-[16px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
          <div class="h-px my-1" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
          <div
            class="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all border-2"
            :class="isDark ? 'bg-d2 border-bdr hover:border-brand-400' : 'bg-l2 border-bdrF hover:border-brand-500'"
            @click="selectHttp">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d4' : 'bg-l4'">
              <i :class="['ri-global-line', 'text-[18px]', isDark ? 'text-brand-400' : 'text-brand-500']" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">自定义 HTTP</div>
              <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">手动配置请求模板和响应映射</div>
            </div>
            <i class="ri-arrow-right-s-line text-[16px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
        </div>

        <!-- Step 2: Config -->
        <div v-if="step === 'config'" class="space-y-4">
          <div>
            <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
            <input v-model="form.name" class="w-full h-9 px-3 rounded-lg text-[13px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="给知识源起个名字" />
          </div>

          <!-- Preset form fields -->
          <template v-if="showPresetForm">
            <div v-for="field in selectedPreset.userFields" :key="field.name">
              <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                {{ field.label }}
                <span v-if="field.isAuth" class="ml-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">(API 密钥)</span>
              </label>
              <input v-model="userFieldValues[field.name]" :type="field.isAuth ? 'password' : 'text'" class="w-full h-9 px-3 rounded-lg text-[13px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" :placeholder="field.isAuth ? '粘贴 API Key / Token' : '填写 ' + field.label" />
            </div>
            <div v-if="selectedPreset.base_url" class="flex items-center gap-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-link text-[12px]" />
              {{ selectedPreset.base_url }}
            </div>
          </template>

          <!-- HTTP JSON config -->
          <template v-if="showHttpForm">
            <div>
              <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">配置 (JSON)</label>
              <textarea v-model="configJson" rows="14" class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" spellcheck="false" />
              <p v-if="!isEdit" class="mt-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">使用 <code class="font-mono">{query}</code> 和 <code class="font-mono">{top_k}</code> 作为运行时占位符</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="step === 'config'" class="flex items-center justify-between px-5 h-14 border-t shrink-0" :class="isDark ? 'border-bdr' : 'border-bdrF'">
        <button
          v-if="showHttpForm"
          class="h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5"
          :class="isDark ? 'bg-agent-400/10 text-agent-400 hover:bg-agent-400/20' : 'bg-agent-500/10 text-agent-500 hover:bg-agent-500/20'"
          @click="showAiModal = true">
          <i class="ri-magic-line text-[13px]" />
          AI 辅助
        </button>
        <div v-else />
        <div class="flex gap-2">
          <button class="h-9 px-4 rounded-lg text-[13px]" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" @click="emit('close')">取消</button>
          <button class="h-9 px-4 rounded-lg text-[13px] font-medium" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" @click="handleSave">{{ isEdit ? '保存' : '添加' }}</button>
        </div>
      </div>
    </div>
  </div>
  <AiAdapterModal :show="showAiModal" :is-dark="isDark" @close="showAiModal = false" @apply="cfg => { configJson = JSON.stringify(cfg, null, 2); if (!form.name) form.name = 'AI 适配知识源' }" />
</template>
