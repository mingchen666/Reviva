<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useWikiStore } from '@/stores/wiki'
import { useMessage } from '@/components/MsMessage/useMessage'
import mineruIcon from '@/assets/ocr/mineru.ico'
import paddleocrIcon from '@/assets/ocr/paddleocr.ico'

const appStore = useAppStore()
const wikiStore = useWikiStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)
const activeType = ref('mineru')
const loading = ref(false)
const saving = ref(false)
const selectorOpen = ref(false)
const error = ref('')

const PADDLE_DEFAULT_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/layout-parsing'
const PADDLE_OPTIONS = [
  {
    key: 'useDocOrientationClassify',
    label: '方向矫正',
    desc: '自动识别并矫正 0、90、180、270 度页面',
  },
  {
    key: 'useDocUnwarping',
    label: '扭曲矫正',
    desc: '处理褶皱、倾斜等图像形变',
  },
  {
    key: 'useLayoutDetection',
    label: '版面分析',
    desc: '检测文档区域并按阅读顺序整理',
  },
  {
    key: 'useChartRecognition',
    label: '图表识别',
    desc: '将图表解析为更易编辑的结构',
  },
  {
    key: 'prettifyMarkdown',
    label: 'Markdown 美化',
    desc: '输出更规整的 Markdown 文本',
  },
  {
    key: 'visualize',
    label: '返回可视化图',
    desc: '会增加响应体大小和处理耗时',
  },
]

const SERVICES = [
  {
    type: 'mineru',
    name: 'MinerU',
    headline: '文档智能解析',
    desc: '适合扫描 PDF、论文、表格和公式解析',
    icon: mineruIcon,
    accent: '#6C8AFF',
    urlPlaceholder: 'https://mineru.net',
    keyPlaceholder: '输入 MinerU API Key',
  },
  {
    type: 'paddleocr',
    name: 'PaddleOCR',
    headline: 'PaddleOCR-VL 版面解析',
    desc: '同步 /layout-parsing，适合图片型 PDF、截图和通用文字识别',
    icon: paddleocrIcon,
    accent: '#10B981',
    urlPlaceholder: PADDLE_DEFAULT_URL,
    keyPlaceholder: '输入 PaddleOCR API Token',
  },
]

const forms = reactive({
  mineru: createForm('mineru'),
  paddleocr: createForm('paddleocr'),
})

const activeService = computed(() => SERVICES.find(item => item.type === activeType.value) || SERVICES[0])
const activeForm = computed(() => forms[activeType.value])
const enabledServices = computed(() => SERVICES.filter(item => forms[item.type]?.enabled))
const enabledService = computed(() => enabledServices.value[0] || null)
const activeReady = computed(() => providerReady(activeType.value))
const showPaddleOptions = computed(() => activeType.value === 'paddleocr')
const statusText = computed(() => {
  if (enabledService.value) return `${enabledService.value.name} 生效中`
  return '远程 OCR 已停用'
})
const saveButtonText = computed(() => saving.value ? '保存中...' : '保存配置')

onMounted(loadProviders)

function defaultBaseUrl(type) {
  if (type === 'mineru') return 'https://mineru.net'
  if (type === 'paddleocr') return PADDLE_DEFAULT_URL
  return ''
}

function defaultPaddleConfig() {
  return {
    useDocOrientationClassify: false,
    useDocUnwarping: false,
    useLayoutDetection: true,
    useChartRecognition: false,
    prettifyMarkdown: true,
    visualize: false,
  }
}

function createForm(type) {
  return {
    id: '',
    enabled: false,
    base_url: defaultBaseUrl(type),
    api_key_ref: '',
    paddle: defaultPaddleConfig(),
  }
}

function resetForms() {
  Object.assign(forms.mineru, createForm('mineru'))
  Object.assign(forms.paddleocr, createForm('paddleocr'))
}

async function loadProviders() {
  loading.value = true
  error.value = ''
  try {
    const providers = await wikiStore.loadOcrProviders()
    resetForms()
    for (const service of SERVICES) {
      const provider = wikiStore.ocrProviders.find(item => item.type === service.type)
      if (provider) fillForm(service.type, provider)
    }
    const firstEnabled = (providers || wikiStore.ocrProviders || [])
      .find(item => isProviderEnabled(item) && SERVICES.some(service => service.type === item.type))
    normalizeEnabled(firstEnabled?.type || '')
    activeType.value = firstEnabled?.type || activeType.value || SERVICES[0].type
  } catch (err) {
    error.value = err.message || '加载 OCR 配置失败'
  } finally {
    loading.value = false
  }
}

function fillForm(type, provider) {
  const config = provider.config || {}
  Object.assign(forms[type], {
    id: provider.id || '',
    enabled: isProviderEnabled(provider),
    base_url: provider.base_url || defaultBaseUrl(type),
    api_key_ref: provider.api_key_ref || '',
  })
  if (type === 'paddleocr') {
    Object.assign(forms[type].paddle, {
      ...defaultPaddleConfig(),
      ...pickPaddleConfig(config),
    })
  }
}

function isProviderEnabled(provider) {
  if (!provider || provider.enabled === undefined) return true
  return provider.enabled === true || provider.enabled === 1 || provider.enabled === '1'
}

function normalizeEnabled(preferredType = '') {
  const targetType = preferredType || enabledServices.value[0]?.type || ''
  for (const service of SERVICES) {
    forms[service.type].enabled = !!targetType && service.type === targetType
  }
}

function toggleSelector() {
  selectorOpen.value = !selectorOpen.value
}

function chooseProvider(type) {
  if (!forms[type]) return
  activeType.value = type
  normalizeEnabled(type)
  selectorOpen.value = false
}

function disableAll() {
  normalizeEnabled('')
  selectorOpen.value = false
}

function providerReady(type) {
  const form = forms[type]
  return !!form?.base_url?.trim() && !!form?.api_key_ref?.trim()
}

function providerOptionMeta(type) {
  if (forms[type]?.enabled) return '当前使用'
  return providerReady(type) ? '已配置' : '待配置'
}

function defaultConfig(type) {
  if (type === 'mineru') {
    return {
      model_version: 'vlm',
      language: 'ch',
      is_ocr: true,
      enable_formula: true,
      enable_table: true,
      fileUrlsEndpoint: '/api/v4/file-urls/batch',
      extractResultsEndpoint: '/api/v4/extract-results/batch',
      pollIntervalMs: 5000,
      maxPolls: 120,
    }
  }
  const paddle = forms.paddleocr?.paddle || defaultPaddleConfig()
  return {
    bodyMode: 'json_base64',
    fileType: null,
    useDocOrientationClassify: !!paddle.useDocOrientationClassify,
    useDocUnwarping: !!paddle.useDocUnwarping,
    useLayoutDetection: !!paddle.useLayoutDetection,
    useChartRecognition: !!paddle.useChartRecognition,
    prettifyMarkdown: !!paddle.prettifyMarkdown,
    visualize: !!paddle.visualize,
  }
}

function pickPaddleConfig(config) {
  const defaults = defaultPaddleConfig()
  return Object.fromEntries(
    Object.keys(defaults).map(key => [key, config[key] ?? defaults[key]])
  )
}

function buildPayload(type) {
  const service = SERVICES.find(item => item.type === type)
  const form = forms[type]
  if (!service || !form) throw new Error('未知 OCR 服务商')
  if (form.enabled && !form.base_url.trim()) throw new Error(`请填写 ${service.name} 服务 URL`)
  if (form.enabled && !form.api_key_ref.trim()) throw new Error(`请填写 ${service.name} API Key`)
  return {
    id: form.id || undefined,
    name: service.name,
    type,
    mode: 'remote',
    base_url: form.base_url.trim(),
    api_key_ref: form.api_key_ref.trim(),
    enabled: !!form.enabled,
    config: defaultConfig(type),
  }
}

async function saveCurrent() {
  if (saving.value) return
  error.value = ''
  saving.value = true
  try {
    normalizeEnabled(enabledService.value?.type || '')
    const orderedTypes = [
      activeType.value,
      ...SERVICES.map(service => service.type).filter(type => type !== activeType.value),
    ]
    for (const type of orderedTypes) {
      const saved = await wikiStore.saveOcrProvider(buildPayload(type))
      if (saved) fillForm(type, saved)
    }
    normalizeEnabled(enabledService.value?.type || '')
    msg.success(enabledService.value ? `${enabledService.value.name} 已设为当前 OCR` : 'OCR 配置已保存')
  } catch (err) {
    error.value = err.message || '保存 OCR 配置失败'
    msg.error(error.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 lg:px-6 py-4 space-y-4">
    <div
      class="rounded-xl p-3 flex items-start gap-2.5"
      :class="isDark ? 'bg-emerald-400/6 border border-emerald-400/20' : 'bg-emerald-50/60 border border-emerald-100'">
      <i class="ri-scan-2-line text-emerald-400 text-[14px] mt-[1px] shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="text-[12px] font-semibold mb-0.5" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">
          OCR 服务商配置
        </div>
        <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          选择当前要使用的 OCR 服务商，下面会显示对应的 URL 和 Key。两个服务商只能有一个生效。
        </p>
      </div>
      <button
        class="h-8 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
        :class="isDark ? 'bg-d0 text-wt-aux hover:text-wt-sub border border-d4' : 'bg-white text-lt-aux hover:text-lt-sub border border-emerald-100'"
        :disabled="loading"
        @click="loadProviders">
        <i class="ri-refresh-line text-[12px]" />
        刷新
      </button>
    </div>

    <div
      v-if="error"
      class="rounded-lg px-3 py-2 flex items-center gap-2 text-[11px]"
      :class="isDark ? 'bg-red-400/8 text-red-300 border border-red-400/20' : 'bg-red-50 text-red-600 border border-red-100'">
      <i class="ri-error-warning-line text-[13px]" />
      <span>{{ error }}</span>
    </div>

    <section class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
      <div class="flex items-center justify-between gap-3 mb-4">
        <div class="min-w-0">
          <div class="section-title mb-1" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">当前服务商</div>
          <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ statusText }}
          </div>
        </div>
        <span
          class="status-pill shrink-0"
          :class="enabledService
            ? (isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100')
            : (isDark ? 'bg-d0 text-wt-dim border border-d4' : 'bg-l2 text-lt-aux border border-bdrF')">
          <span class="status-dot" :class="enabledService ? 'bg-emerald-400' : (isDark ? 'bg-wt-dim' : 'bg-lt-aux')" />
          {{ enabledService ? '已启用' : '未启用' }}
        </span>
      </div>

      <div class="provider-select-wrap">
        <button
          class="provider-select"
          :class="isDark ? 'is-dark' : 'is-light'"
          type="button"
          :aria-expanded="selectorOpen"
          @click="toggleSelector">
          <span class="provider-icon" :style="{ color: activeService.accent }">
            <img :src="activeService.icon" class="h-40px w-40px rounded-full" alt="">
         
          </span>
          <span class="provider-copy">
            <span class="provider-name">{{ activeService.name }}</span>
            <span class="provider-desc">{{ activeService.headline }} · {{ activeService.desc }}</span>
          </span>
          <span class="provider-ready" :class="{ 'is-ready': activeReady }">
            {{ activeReady ? '已配置' : '待配置' }}
          </span>
          <i class="ri-arrow-down-s-line selector-arrow" :class="{ 'is-open': selectorOpen }" />
        </button>

        <div
          v-if="selectorOpen"
          class="provider-menu"
          :class="isDark ? 'is-dark' : 'is-light'">
          <button
            v-for="service in SERVICES"
            :key="service.type"
            class="provider-option"
            :class="{ 'is-active': activeType === service.type }"
            type="button"
            @click="chooseProvider(service.type)">
            <span class="provider-icon small" :style="{ color: service.accent }">
              <img :src="service.icon" class="h-40px w-40px rounded-full" alt="">
            </span>
            <span class="provider-copy">
              <span class="provider-name">{{ service.name }}</span>
              <span class="provider-desc">{{ service.desc }}</span>
            </span>
            <span
              class="option-meta"
              :class="forms[service.type].enabled ? 'is-current' : ''">
              {{ providerOptionMeta(service.type) }}
            </span>
          </button>
        </div>
      </div>

      <div class="mt-4 space-y-2.5">
        <label
          class="config-row"
          :class="isDark ? 'bg-d0/70 border border-d4' : 'bg-l2/70 border border-bdrF'">
          <i class="ri-link-m text-[14px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">请求 URL</span>
          <input
            v-model="activeForm.base_url"
            class="config-input"
            :class="isDark ? 'text-wt-sub placeholder:text-wt-dim' : 'text-lt-sub placeholder:text-lt-aux'"
            :placeholder="activeService.urlPlaceholder" />
        </label>
        <div
          v-if="showPaddleOptions"
          class="endpoint-note"
          :class="isDark ? 'bg-emerald-400/6 text-wt-aux border border-emerald-400/15' : 'bg-emerald-50/60 text-lt-aux border border-emerald-100'">
          <i class="ri-route-line text-emerald-400 text-[13px] shrink-0" />
          <span>
            当前接入 PaddleOCR 同步接口，请填写文档中的完整 API_URL，通常以 /layout-parsing 结尾；异步 /jobs 接口暂未接入本地解析流程。
          </span>
        </div>

        <label
          class="config-row"
          :class="isDark ? 'bg-d0/70 border border-d4' : 'bg-l2/70 border border-bdrF'">
          <i class="ri-key-2-line text-[14px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <span class="field-label" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key</span>
          <input
            v-model="activeForm.api_key_ref"
            type="password"
            class="config-input"
            :class="isDark ? 'text-wt-sub placeholder:text-wt-dim' : 'text-lt-sub placeholder:text-lt-aux'"
            :placeholder="activeService.keyPlaceholder" />
        </label>

        <div
          v-if="showPaddleOptions"
          class="rounded-xl p-3"
          :class="isDark ? 'bg-d0/70 border border-d4' : 'bg-l2/70 border border-bdrF'">
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <div class="field-label wide" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">解析参数</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              fileType 会按 PDF / 图片自动判断
            </div>
          </div>
          <div class="paddle-options-grid">
            <label
              v-for="option in PADDLE_OPTIONS"
              :key="option.key"
              class="paddle-option"
              :class="[
                isDark ? 'hover:bg-white/3' : 'hover:bg-white/70',
                activeForm.paddle[option.key] ? 'is-on' : '',
              ]">
              <span class="option-copy">
                <span class="option-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ option.label }}</span>
                <span class="option-desc" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ option.desc }}</span>
              </span>
              <input v-model="activeForm.paddle[option.key]" class="sr-only" type="checkbox">
              <span class="option-toggle" :class="{ 'is-on': activeForm.paddle[option.key] }" />
            </label>
          </div>
        </div>
      </div>

      <div
        class="mt-3 rounded-lg px-3 py-2 flex items-start gap-2"
        :class="isDark ? 'bg-brand-400/6 border border-brand-400/15' : 'bg-brand-50/60 border border-brand-100'">
        <i class="ri-information-line text-brand-400 text-[13px] mt-[1px] shrink-0" />
        <div class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          Wiki 会在扫描 PDF、图片型 PDF 或本地抽取失败时调用当前服务商；普通文本类文档仍优先使用本地解析。
        </div>
      </div>

      <div class="mt-4 pt-3 border-t flex items-center justify-between gap-3 flex-wrap" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <button
          class="h-8 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-red-300 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
          type="button"
          @click="disableAll">
          停用远程 OCR
        </button>
        <div class="flex items-center gap-2">
          <button
            class="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            :class="isDark ? 'bg-d0 text-wt-aux hover:text-wt-sub border border-d4' : 'bg-l2 text-lt-aux hover:text-lt-sub border border-bdrF'"
            :disabled="loading || saving"
            @click="loadProviders">
            <i class="ri-refresh-line text-[12px]" />
            重新载入
          </button>
          <button
            class="h-8 px-3 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
            :disabled="saving"
            @click="saveCurrent">
            <i class="ri-save-3-line text-[12px] mr-1" />
            {{ saveButtonText }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-pill {
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
}

.provider-select-wrap {
  position: relative;
}

.provider-select,
.provider-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 10px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.provider-select {
  min-height: 70px;
  padding: 12px;
  border: 1px solid transparent;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.provider-select.is-dark {
  color: #e8e8ed;
  background: rgba(14, 14, 18, 0.62);
  border-color: #353542;
}

.provider-select.is-light {
  color: #1a1a2e;
  background: #f7f7f6;
  border-color: #e2e1de;
}

.provider-select:hover {
  border-color: rgba(108, 138, 255, 0.36);
}

.provider-select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(108, 138, 255, 0.12);
}

.provider-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.provider-icon i {
  font-size: 18px;
}

.provider-icon.small {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.provider-icon.small i {
  font-size: 15px;
}

.provider-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.provider-name {
  color: inherit;
  font-size: 13px;
  line-height: 18px;
  font-weight: 800;
}

.provider-desc {
  overflow: hidden;
  color: #8a8a9e;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-ready,
.option-meta {
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: #8a8a9e;
  background: rgba(138, 138, 158, 0.1);
  font-size: 10px;
  font-weight: 700;
}

.provider-ready.is-ready,
.option-meta.is-current {
  color: #10b981;
  background: rgba(16, 185, 129, 0.11);
}

.selector-arrow {
  color: #8a8a9e;
  font-size: 18px;
  transition: transform 0.15s ease;
}

.selector-arrow.is-open {
  transform: rotate(180deg);
}

.provider-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
}

.provider-menu.is-dark {
  background: #1c1c26;
  border-color: #353542;
}

.provider-menu.is-light {
  background: #ffffff;
  border-color: #e2e1de;
}

.provider-option {
  min-height: 58px;
  padding: 10px 12px;
  border: 0;
  background: transparent;
}

.provider-option:hover,
.provider-option.is-active {
  background: rgba(108, 138, 255, 0.08);
}

.config-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 10px;
  padding: 9px 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.config-row:focus-within {
  border-color: rgba(108, 138, 255, 0.45);
  box-shadow: 0 0 0 2px rgba(108, 138, 255, 0.08);
}

.field-label {
  width: 76px;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 650;
}

.field-label.wide {
  width: auto;
}

.config-input {
  width: 100%;
  min-width: 0;
  height: 28px;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 12px;
  line-height: 28px;
}

.endpoint-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 10.5px;
  line-height: 1.6;
}

.paddle-options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.paddle-option {
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 9px;
  padding: 8px 9px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.paddle-option.is-on {
  background: rgba(16, 185, 129, 0.08);
}

.option-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-title {
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
}

.option-desc {
  font-size: 10px;
  line-height: 14px;
}

.option-toggle {
  width: 30px;
  height: 18px;
  border-radius: 999px;
  flex: 0 0 auto;
  position: relative;
  background: rgba(138, 138, 158, 0.28);
  transition: background 0.15s ease;
}

.option-toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.15s ease;
}

.option-toggle.is-on {
  background: #10b981;
}

.option-toggle.is-on::after {
  transform: translateX(12px);
}

button {
  font-family: inherit;
}

@media (max-width: 680px) {
  .provider-select {
    align-items: flex-start;
  }

  .provider-ready {
    display: none;
  }

  .provider-desc {
    white-space: normal;
  }

  .config-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    width: auto;
  }

  .paddle-options-grid {
    grid-template-columns: 1fr;
  }
}
</style>
