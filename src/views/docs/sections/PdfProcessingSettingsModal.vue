<script setup>
<<<<<<< HEAD
import { ref, computed } from 'vue'
=======
import { ref, computed, watch, toRaw } from 'vue'
>>>>>>> dev
import MsModal from '@/components/MsModal/MsModal.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  settings: { type: Object, required: true },
  enabledOcrProviders: { type: Array, default: () => [] },
  effectiveOcrProvider: { type: Object, default: null },
  ocrProviderStatusText: { type: String, default: '' },
  pdfEnvironment: { type: Object, default: null },
  pdfEnvironmentStatusText: { type: String, default: '' },
  installingPdfLocalParser: { type: Boolean, default: false },
  pdfLocalParserInstallResult: { type: Object, default: null },
<<<<<<< HEAD
})

const emit = defineEmits(['update:show', 'save', 'open-ocr-settings', 'install-local-parser'])
const activeTab = ref('pdf')
const openSelectKey = ref('')
=======
  initialTab: { type: String, default: 'pdf' },
  webSettings: { type: Object, default: null },
  webProviders: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:show', 'save', 'save-web-settings', 'open-ocr-settings', 'install-local-parser'])
const activeTab = ref('pdf')
const openSelectKey = ref('')
const webApiKey = ref('')
const webApiKeyAction = ref('keep')
const webDraft = ref(null)

function cloneWebSettings(value) {
  if (!value) return null
  return structuredClone(toRaw(value))
}
>>>>>>> dev

const model = computed(() => props.settings)
const show = computed({
  get: () => props.show,
  set: value => emit('update:show', value),
})

<<<<<<< HEAD
=======
watch(() => props.show, visible => {
  if (!visible) { webDraft.value = null; return }
  activeTab.value = ['pdf', 'web', 'media'].includes(props.initialTab) ? props.initialTab : 'pdf'
  webApiKey.value = ''
  webApiKeyAction.value = 'keep'
  webDraft.value = cloneWebSettings(props.webSettings)
})

watch(() => props.webSettings, value => {
  if (props.show && !webDraft.value && value) webDraft.value = cloneWebSettings(value)
})

const selectedWebProviderId = computed(() => webDraft.value?.selectedProvider || '')
const selectedWebProvider = computed(() => props.webProviders.find(item => item.id === selectedWebProviderId.value) || null)
const selectedWebConfig = computed(() => webDraft.value?.providers?.[selectedWebProviderId.value] || null)
const providerRasterAssets = import.meta.glob('../../../assets/icons/*.{ico,png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' })
const webProviderVisuals = {
  jina: { icon: 'jina', raster: true, desc: '轻量网页阅读器，适合文章与公开页面', dark: 'bg-cyan-400/12 text-cyan-300', light: 'bg-cyan-50 text-cyan-600', badge: 'text-cyan-500 bg-cyan-400/10' },
  firecrawl: { icon: 'firecrawl', raster: true, desc: '结构化网页抓取，支持 Markdown 与 HTML', dark: 'bg-orange-400/12 text-orange-300', light: 'bg-orange-50 text-orange-600', badge: 'text-orange-500 bg-orange-400/10' },
  tavily: { icon: 'tavily', desc: '快速正文提取，适合 Markdown 知识导入', dark: 'bg-emerald-400/12 text-emerald-300', light: 'bg-emerald-50 text-emerald-600', badge: 'text-emerald-500 bg-emerald-400/10' },
}
const webTimeoutOptions = [30, 60, 90]

function webProviderVisual(id) {
  return webProviderVisuals[id] || { icon: 'search-eye', desc: '网页内容解析服务', dark: 'bg-brand-400/12 text-brand-300', light: 'bg-brand-50 text-brand-600', badge: 'text-brand-500 bg-brand-400/10' }
}

function webProviderRasterSrc(id) {
  const suffixes = [`/${id}.ico`, `/${id}.png`, `/${id}.webp`, `/${id}.jpg`, `/${id}.jpeg`]
  const entry = Object.entries(providerRasterAssets).find(([filePath]) => suffixes.some(suffix => filePath.toLowerCase().endsWith(suffix)))
  return entry?.[1] || ''
}

function selectWebProvider(id) {
  if (!webDraft.value) return
  webDraft.value.selectedProvider = id
  webApiKey.value = ''
  webApiKeyAction.value = 'keep'
}

function replaceWebKey() { webApiKeyAction.value = 'replace' }
function clearWebKey() { webApiKey.value = ''; webApiKeyAction.value = 'clear' }
function keepWebKey() { webApiKey.value = ''; webApiKeyAction.value = 'keep' }
function selectWebTimeout(value) {
  if (webDraft.value) webDraft.value.timeoutSeconds = value
  openSelectKey.value = ''
}

function webSettingsPatch() {
  const id = selectedWebProviderId.value
  return {
    selectedProvider: id,
    timeoutSeconds: Number(webDraft.value?.timeoutSeconds) || 60,
    providers: id ? {
      [id]: {
        baseUrl: selectedWebConfig.value?.baseUrl || '',
        apiKeyAction: webApiKeyAction.value,
        apiKey: webApiKeyAction.value === 'replace' ? webApiKey.value : '',
      },
    } : {},
  }
}

function saveCurrent(close) {
  if (activeTab.value === 'web') emit('save-web-settings', webSettingsPatch(), close)
  else emit('save', close)
}

>>>>>>> dev
const pdfEngineOptions = [
  {
    value: 'auto',
    icon: 'ri-magic-line',
    title: '自动',
    desc: '本地能读就先读文本；遇到扫描页、图片页、表格或本地不可用时，再调用 OCR 服务。',
  },
  {
    value: 'local_fast',
    icon: 'ri-flashlight-line',
    title: '本地快速',
    desc: '适合文本型 PDF，速度快，不消耗 OCR 服务额度。',
  },
  {
    value: 'document_intelligent',
    icon: 'ri-scan-2-line',
    title: '文档智能',
    desc: '适合扫描件、复杂表格和图片页，使用 OCR 服务生成 Markdown/JSON。',
  },
]

const uploadActionOptions = [
  {
    value: 'ask',
    icon: 'ri-question-answer-line',
    title: '每次询问',
    desc: '上传 PDF 后弹窗选择本次处理方式。',
  },
  {
    value: 'preflight',
    icon: 'ri-speed-line',
    title: '仅快速预检',
    desc: '只读取页数、文本覆盖率和是否需要 OCR。',
  },
  {
    value: 'full',
    icon: 'ri-loop-right-line',
    title: '按默认策略后台处理',
    desc: '根据上面的默认策略自动预检或解析。',
  },
  {
    value: 'none',
    icon: 'ri-pause-circle-line',
    title: '不自动处理',
    desc: '只保存文件，需要时再手动解析。',
  },
]

const largePdfOptions = [
  {
    value: 'adaptive',
    icon: 'ri-route-line',
    title: '按问题选择页段',
    desc: '对话时根据用户问题读取相关页，避免大 PDF 全量消耗。',
  },
  {
    value: 'full_document',
    icon: 'ri-database-2-line',
    title: '优先使用全文缓存',
    desc: '如果已有全文解析结果，优先复用 Markdown 缓存。',
  },
]

const fallbackOptions = [
  {
    value: 'ocr_provider',
    icon: 'ri-cloud-line',
    title: '改用 OCR 服务商',
    desc: '普通用户推荐，无需折腾 Python 环境。',
  },
  {
    value: 'prompt',
    icon: 'ri-question-line',
    title: '先提示确认',
    desc: '由用户决定是否改走 OCR 服务商。',
  },
  {
    value: 'error',
    icon: 'ri-error-warning-line',
    title: '直接报错',
    desc: '适合只允许本地解析的场景。',
  },
]

const mediaActionOptions = [
  {
    value: 'manual',
    icon: 'ri-pause-circle-line',
    title: '暂不自动解析',
    desc: '上传音视频或图片后只保存文件。',
  },
  {
    value: 'ask',
    icon: 'ri-question-answer-line',
    title: '上传后询问',
    desc: '未来接入媒体解析后，上传时再确认。',
  },
]

const ocrProviderOptions = computed(() => [
  {
    value: 'auto',
    icon: 'ri-route-line',
    title: '自动选择',
    desc: props.enabledOcrProviders.length
      ? '优先使用已启用的 MinerU，其次 PaddleOCR。'
      : '暂无可用服务商，需先到 OCR 模型配置中启用。',
  },
  ...props.enabledOcrProviders.map(provider => ({
    value: provider.id,
    icon: String(provider.type || '').toLowerCase() === 'mineru' ? 'ri-gemini-line' : 'ri-scan-2-line',
    title: provider.name || provider.type || '未命名服务商',
    desc: `${provider.type || 'OCR'} · 已启用`,
  })),
])

function selectedOption(options, value) {
  return options.find(option => option.value === value) || options[0] || {}
}

function toggleSelect(key) {
  openSelectKey.value = openSelectKey.value === key ? '' : key
}

function selectOption(field, value) {
  model.value[field] = value
  openSelectKey.value = ''
}

function selectorButtonClasses() {
  return [
    'compact-select__button',
    props.isDark ? 'compact-select__button--dark' : 'compact-select__button--light',
  ]
}

function selectorMenuClasses() {
  return [
    'compact-select__menu',
    props.isDark ? 'compact-select__menu--dark' : 'compact-select__menu--light',
  ]
}

function selectorOptionClasses(selected) {
  return [
    'compact-select__option',
    props.isDark ? 'compact-select__option--dark' : 'compact-select__option--light',
    selected ? 'compact-select__option--selected' : '',
  ]
}

const hasLocalText = computed(() => !!props.pdfEnvironment?.success)
const hasOcrProvider = computed(() => !!props.effectiveOcrProvider)
const currentPdfEngine = computed(() => model.value?.pdfEngine || 'auto')
const selectedOcrProviderType = computed(() => String(props.effectiveOcrProvider?.type || '').toLowerCase())
const missingLocalParser = computed(() => ['PYMUPDF_NOT_INSTALLED', 'PYPDF_NOT_INSTALLED'].includes(props.pdfEnvironment?.code))
const canInstallLocalParser = computed(() => missingLocalParser.value)
const showOcrProviderSelect = computed(() => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast')
const showOcrSetupPrompt = computed(() => !hasOcrProvider.value && (currentPdfEngine.value !== 'local_fast' || !hasLocalText.value))
const showLargePdfMode = computed(() => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast')
const showMissingLocalFallback = computed(() => currentPdfEngine.value === 'auto' && !hasLocalText.value && hasOcrProvider.value)
const showFullDocumentOcrToggle = computed(() => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast')
const showPaddleFallbackToggle = computed(() => showFullDocumentOcrToggle.value && selectedOcrProviderType.value === 'paddleocr')
const showOcrAdvancedToggles = computed(() => showFullDocumentOcrToggle.value || showPaddleFallbackToggle.value)
const localStatusBadge = computed(() => {
  if (hasLocalText.value) return '可用'
  if (missingLocalParser.value) return '缺少 PyMuPDF'
  if (props.pdfEnvironment?.code === 'PYTHON_NOT_FOUND') return '未找到 Python'
  return '不可用'
})
const recommendation = computed(() => {
  if (hasLocalText.value && hasOcrProvider.value) {
    return {
      title: '建议使用自动模式',
      body: '先用本地快速解析读取文本层；遇到扫描页、图片页、表格或公式时，再调用 OCR 服务补齐 Markdown。',
      tone: 'good',
      icon: 'ri-sparkling-2-line',
    }
  }
  if (!hasLocalText.value && hasOcrProvider.value) {
    return {
      title: '建议使用文档智能解析',
      body: missingLocalParser.value
        ? '已检测到 Python，但缺少 PyMuPDF。可以一键自动安装，也可以直接用 MinerU 或 PaddleOCR 解析 PDF。'
        : '当前本地 Python 不可用，但已配置 OCR 服务商，可以直接用 MinerU 或 PaddleOCR 解析 PDF。',
      tone: 'warn',
      icon: 'ri-scan-2-line',
    }
  }
  if (hasLocalText.value && !hasOcrProvider.value) {
    return {
      title: '本地快速解析可用',
      body: `${props.ocrProviderStatusText || 'OCR 服务商当前不可用'}；文本型 PDF 可以正常处理，扫描件、图片页或复杂表格需要启用 OCR 服务商。`,
      tone: 'warn',
      icon: 'ri-file-text-line',
    }
  }
  return {
    title: '需要可用的 OCR 服务商',
    body: `当前没有可用的本地文本层环境，且${props.ocrProviderStatusText || '没有可用 OCR 服务商'}。普通用户建议启用 MinerU 或 PaddleOCR。`,
    tone: 'danger',
    icon: 'ri-error-warning-line',
  }
})

function toneClasses(tone) {
  if (tone === 'good') {
    return props.isDark
      ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (tone === 'danger') {
    return props.isDark
      ? 'border-red-400/20 bg-red-400/8 text-red-300'
      : 'border-red-200 bg-red-50 text-red-700'
  }
  return props.isDark
    ? 'border-amber-400/20 bg-amber-400/8 text-amber-300'
    : 'border-amber-200 bg-amber-50 text-amber-700'
}
</script>

<template>
  <MsModal v-model:show="show" :width="620" :show-footer="true">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
          <i class="ri-settings-3-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">文档解析设置</span>
      </div>
    </template>

    <div class="space-y-4">
      <div
<<<<<<< HEAD
        class="grid grid-cols-2 rounded-lg border p-0.5"
=======
        class="grid grid-cols-3 rounded-lg border p-0.5"
>>>>>>> dev
        :class="isDark ? 'border-bdr bg-d3/60' : 'border-bdrF bg-l3'">
        <button
          @click="activeTab = 'pdf'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === 'pdf'
            ? isDark ? 'bg-d0 text-brand-400 shadow-sm' : 'bg-white text-brand-500 shadow-sm'
            : isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          <i class="ri-file-pdf-2-line text-[12px]" />
          PDF 解析
        </button>
        <button
<<<<<<< HEAD
=======
          @click="activeTab = 'web'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === 'web'
            ? isDark ? 'bg-d0 text-brand-400 shadow-sm' : 'bg-white text-brand-500 shadow-sm'
            : isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          <i class="ri-global-line text-[12px]" />
          网页解析
        </button>
        <button
>>>>>>> dev
          @click="activeTab = 'media'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === 'media'
            ? isDark ? 'bg-d0 text-brand-400 shadow-sm' : 'bg-white text-brand-500 shadow-sm'
            : isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          <i class="ri-movie-2-line text-[12px]" />
          媒体解析
        </button>
      </div>

      <div v-if="activeTab === 'pdf'" class="space-y-4">
        <div
          class="rounded-lg border p-3"
          :class="toneClasses(recommendation.tone)">
          <div class="flex items-start gap-2.5">
            <i :class="[recommendation.icon, 'text-[15px] mt-0.5 shrink-0']" />
            <div class="min-w-0">
              <div class="text-[12px] font-semibold">{{ recommendation.title }}</div>
              <div class="text-[11px] leading-relaxed mt-1 opacity-90">{{ recommendation.body }}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div
            class="rounded-lg border p-3"
            :class="isDark ? 'border-bdr bg-d3' : 'border-bdrF bg-l3'">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">本地快速解析</div>
              <span
                class="text-[9.5px] px-1.5 py-0.5 rounded"
                :class="hasLocalText
                  ? isDark ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600'
                  : isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'">
                {{ localStatusBadge }}
              </span>
            </div>
            <div class="text-[10.5px] leading-relaxed mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ pdfEnvironmentStatusText }}
            </div>
            <div v-if="canInstallLocalParser" class="mt-2 flex items-center justify-between gap-2">
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">将使用阿里云 PyPI 镜像安装 PyMuPDF</span>
              <button
                type="button"
                :disabled="installingPdfLocalParser"
                class="local-install-btn"
                :class="isDark ? 'local-install-btn--dark' : 'local-install-btn--light'"
                @click="emit('install-local-parser')">
                <i :class="installingPdfLocalParser ? 'ri-loader-4-line animate-spin' : 'ri-download-cloud-2-line'" />
                {{ installingPdfLocalParser ? '安装中' : '自动安装' }}
              </button>
            </div>
            <div
              v-if="pdfLocalParserInstallResult"
              class="mt-2 text-[10px] leading-relaxed"
              :class="pdfLocalParserInstallResult.success
                ? isDark ? 'text-emerald-300' : 'text-emerald-600'
                : isDark ? 'text-red-300' : 'text-red-600'">
              {{ pdfLocalParserInstallResult.success ? '安装完成，本地快速解析已重新检测。' : (pdfLocalParserInstallResult.error || '安装失败，请检查 pip 输出。') }}
            </div>
          </div>
          <div
            class="rounded-lg border p-3"
            :class="isDark ? 'border-bdr bg-d3' : 'border-bdrF bg-l3'">
            <div class="flex items-center justify-between gap-2">
              <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">文档智能解析</div>
              <span
                class="text-[9.5px] px-1.5 py-0.5 rounded"
                :class="hasOcrProvider
                  ? isDark ? 'bg-emerald-400/10 text-emerald-300' : 'bg-emerald-50 text-emerald-600'
                  : isDark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'">
                {{ hasOcrProvider ? '可用' : '未配置' }}
              </span>
            </div>
            <div class="text-[10.5px] leading-relaxed mt-1.5" :class="hasOcrProvider ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'text-amber-500'">
              {{ ocrProviderStatusText }}
            </div>
          </div>
        </div>

        <div class="settings-selector-grid">
          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">默认处理策略</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('pdfEngine')">
              <span class="compact-select__icon"><i :class="selectedOption(pdfEngineOptions, model.pdfEngine).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(pdfEngineOptions, model.pdfEngine).title }}</span>
                <span class="compact-select__desc">{{ selectedOption(pdfEngineOptions, model.pdfEngine).desc }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'pdfEngine' }" />
            </button>
            <div v-if="openSelectKey === 'pdfEngine'" :class="selectorMenuClasses()">
              <button
                v-for="option in pdfEngineOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.pdfEngine === option.value)"
                @click="selectOption('pdfEngine', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.pdfEngine === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
          </div>

          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">上传后处理</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('uploadAction')">
              <span class="compact-select__icon"><i :class="selectedOption(uploadActionOptions, model.uploadAction).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(uploadActionOptions, model.uploadAction).title }}</span>
                <span class="compact-select__desc">{{ selectedOption(uploadActionOptions, model.uploadAction).desc }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'uploadAction' }" />
            </button>
            <div v-if="openSelectKey === 'uploadAction'" :class="selectorMenuClasses()">
              <button
                v-for="option in uploadActionOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.uploadAction === option.value)"
                @click="selectOption('uploadAction', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.uploadAction === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
          </div>

          <div v-if="showOcrProviderSelect" class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">OCR 服务商</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('defaultOcrProvider')">
              <span class="compact-select__icon"><i :class="selectedOption(ocrProviderOptions, model.defaultOcrProvider).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(ocrProviderOptions, model.defaultOcrProvider).title }}</span>
                <span class="compact-select__desc">{{ ocrProviderStatusText }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'defaultOcrProvider' }" />
            </button>
            <div v-if="openSelectKey === 'defaultOcrProvider'" :class="selectorMenuClasses()">
              <button
                v-for="option in ocrProviderOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.defaultOcrProvider === option.value)"
                @click="selectOption('defaultOcrProvider', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.defaultOcrProvider === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
            <div class="compact-select__meta">
              <span :class="effectiveOcrProvider ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'text-amber-400'">
                {{ effectiveOcrProvider ? '已启用文档智能解析' : '需要先配置可用服务商' }}
              </span>
              <button
                type="button"
                @click="emit('open-ocr-settings')"
                :class="isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-500 hover:text-brand-600'">
                去配置
              </button>
            </div>
          </div>
          <div
            v-else-if="showOcrSetupPrompt"
            class="settings-action-card compact-select--wide"
            :class="isDark ? 'settings-action-card--dark' : 'settings-action-card--light'">
            <div class="min-w-0">
              <div class="settings-action-card__title">OCR 服务商不可用</div>
              <div class="settings-action-card__desc">{{ ocrProviderStatusText || '扫描件、图片页、复杂表格和本地不可用时，需要启用 MinerU 或 PaddleOCR。' }}</div>
            </div>
            <button
              type="button"
              class="settings-action-card__button"
              :class="isDark ? 'settings-action-card__button--dark' : 'settings-action-card__button--light'"
              @click="emit('open-ocr-settings')">
              去配置
            </button>
          </div>

          <div v-if="showLargePdfMode" class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">大 PDF 对话策略</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('largePdfMode')">
              <span class="compact-select__icon"><i :class="selectedOption(largePdfOptions, model.largePdfMode).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(largePdfOptions, model.largePdfMode).title }}</span>
                <span class="compact-select__desc">{{ selectedOption(largePdfOptions, model.largePdfMode).desc }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'largePdfMode' }" />
            </button>
            <div v-if="openSelectKey === 'largePdfMode'" :class="selectorMenuClasses()">
              <button
                v-for="option in largePdfOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.largePdfMode === option.value)"
                @click="selectOption('largePdfMode', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.largePdfMode === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
          </div>

          <div v-if="showMissingLocalFallback" class="compact-select compact-select--wide">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">本地不可用时</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('missingPythonFallback')">
              <span class="compact-select__icon"><i :class="selectedOption(fallbackOptions, model.missingPythonFallback).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(fallbackOptions, model.missingPythonFallback).title }}</span>
                <span class="compact-select__desc">{{ selectedOption(fallbackOptions, model.missingPythonFallback).desc }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'missingPythonFallback' }" />
            </button>
            <div v-if="openSelectKey === 'missingPythonFallback'" :class="selectorMenuClasses()">
              <button
                v-for="option in fallbackOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.missingPythonFallback === option.value)"
                @click="selectOption('missingPythonFallback', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.missingPythonFallback === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="showOcrAdvancedToggles" class="space-y-2">
          <label v-if="showFullDocumentOcrToggle" class="flex items-start gap-2 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <input v-model="model.allowFullDocumentOcr" type="checkbox" class="mt-0.5" />
            <span>允许后台对整份 PDF 执行文档智能解析</span>
          </label>
          <label v-if="showPaddleFallbackToggle" class="flex items-start gap-2 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <input v-model="model.allowPaddleFullDocumentForPageRanges" type="checkbox" class="mt-0.5" />
            <span>PaddleOCR 收到页段任务时允许改为全文解析并复用缓存</span>
          </label>
        </div>
      </div>

<<<<<<< HEAD
=======
      <div v-else-if="activeTab === 'web'" class="space-y-4">
        <div class="rounded-xl border p-3.5" :class="isDark ? 'border-brand-400/16 bg-brand-400/6' : 'border-brand-100 bg-brand-50/70'">
          <div class="flex items-start gap-2.5">
            <i class="ri-shield-check-line text-[15px] mt-0.5 text-brand-400" />
            <div>
              <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">网页导入由第三方解析引擎处理</div>
              <div class="text-[11px] leading-relaxed mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择默认引擎后配置连接信息。请求失败时不会自动切换服务商。</div>
            </div>
          </div>
        </div>

        <div class="web-provider-select">
          <div class="text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">默认解析引擎</div>
          <button type="button" class="web-provider-trigger" :class="isDark ? 'web-provider-trigger--dark' : 'web-provider-trigger--light'" @click="toggleSelect('webProvider')">
            <template v-if="selectedWebProvider">
              <span class="web-provider-logo" :class="isDark ? webProviderVisual(selectedWebProvider.id).dark : webProviderVisual(selectedWebProvider.id).light"><img v-if="webProviderVisual(selectedWebProvider.id).raster && webProviderRasterSrc(selectedWebProvider.id)" :src="webProviderRasterSrc(selectedWebProvider.id)" :alt="selectedWebProvider.name" class="web-provider-raster" /><SvgIcon v-else :icon-class="webProviderVisual(selectedWebProvider.id).icon" :size="24" /></span>
              <span class="flex-1 min-w-0 text-left">
                <span class="flex items-center gap-2"><span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selectedWebProvider.name }}</span><span class="web-format-badge" :class="webProviderVisual(selectedWebProvider.id).badge">{{ selectedWebProvider.formats?.includes('html') ? 'MD + HTML' : 'Markdown' }}</span></span>
                <span class="block text-[10.5px] mt-0.5 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ webProviderVisual(selectedWebProvider.id).desc }}</span>
              </span>
            </template>
            <template v-else><span class="web-provider-logo" :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'"><i class="ri-global-line text-[20px]" /></span><span class="flex-1 text-left text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择网页解析引擎</span></template>
            <i class="ri-arrow-down-s-line text-[16px] transition-transform" :class="[{ 'rotate-180': openSelectKey === 'webProvider' }, isDark ? 'text-wt-dim' : 'text-lt-aux']" />
          </button>
          <div v-if="openSelectKey === 'webProvider'" class="web-provider-menu" :class="isDark ? 'web-provider-menu--dark' : 'web-provider-menu--light'">
            <button v-for="provider in webProviders" :key="provider.id" type="button" class="web-provider-option" :class="[isDark ? 'web-provider-option--dark' : 'web-provider-option--light', selectedWebProviderId === provider.id ? 'web-provider-option--selected' : '']" @click="selectWebProvider(provider.id); openSelectKey = ''">
              <span class="web-provider-logo" :class="isDark ? webProviderVisual(provider.id).dark : webProviderVisual(provider.id).light"><img v-if="webProviderVisual(provider.id).raster && webProviderRasterSrc(provider.id)" :src="webProviderRasterSrc(provider.id)" :alt="provider.name" class="web-provider-raster" /><SvgIcon v-else :icon-class="webProviderVisual(provider.id).icon" :size="24" /></span>
              <span class="flex-1 min-w-0 text-left"><span class="flex items-center gap-2"><span class="text-[12px] font-semibold">{{ provider.name }}</span><span class="web-format-badge" :class="webProviderVisual(provider.id).badge">{{ provider.formats?.includes('html') ? 'MD + HTML' : 'Markdown' }}</span></span><span class="block text-[10.5px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ webProviderVisual(provider.id).desc }}</span></span>
              <i v-if="selectedWebProviderId === provider.id" class="ri-checkbox-circle-fill text-brand-400 text-[16px]" />
            </button>
          </div>
        </div>

        <div v-if="selectedWebProvider && selectedWebConfig" class="web-settings-panel" :class="isDark ? 'web-settings-panel--dark' : 'web-settings-panel--light'">
          <div class="web-field">
            <label class="block text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Base URL</label>
            <div class="web-input-shell" :class="isDark ? 'web-input-shell--dark' : 'web-input-shell--light'"><i class="ri-links-line web-input-icon" /><input v-model="selectedWebConfig.baseUrl" /><span class="web-input-suffix">HTTP(S)</span></div>
            <div class="web-field-help" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持官方地址、代理地址或私有部署。</div>
          </div>
          <div class="web-field">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">API Key <span class="font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">（可选）</span></label>
              <span v-if="selectedWebConfig.apiKeyConfigured && webApiKeyAction === 'keep'" class="text-[9.5px] text-emerald-400">已配置 {{ selectedWebConfig.apiKeyMasked }}</span>
            </div>
            <div class="flex gap-2">
              <div class="web-input-shell flex-1" :class="isDark ? 'web-input-shell--dark' : 'web-input-shell--light'"><i class="ri-key-2-line web-input-icon" /><input v-model="webApiKey" type="password" :placeholder="selectedWebConfig.apiKeyConfigured ? '输入新 Key 以替换' : '留空则不发送 API Key'" @input="replaceWebKey" /><span class="web-input-suffix">可选</span></div>
              <button v-if="selectedWebConfig.apiKeyConfigured && webApiKeyAction !== 'clear'" type="button" class="px-3 rounded-lg text-[10.5px]" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'" @click="clearWebKey">清除</button>
              <button v-if="webApiKeyAction === 'clear'" type="button" class="px-3 rounded-lg text-[10.5px]" :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-l4 text-lt-sub'" @click="keepWebKey">撤销</button>
            </div>
            <div class="web-field-help" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">API Key 可留空；是否可直接使用由当前解析服务商的接口规则决定。</div>
          </div>
          <div class="web-field web-timeout-select">
            <label class="block text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">请求超时</label>
            <button type="button" class="web-timeout-trigger" :class="isDark ? 'web-timeout-trigger--dark' : 'web-timeout-trigger--light'" @click="toggleSelect('webTimeout')">
              <i class="ri-timer-line text-brand-400 text-[14px]" />
              <span class="flex-1 text-left text-[11.5px]">{{ webDraft.timeoutSeconds || 60 }} 秒</span>
              <i class="ri-arrow-down-s-line text-[14px] transition-transform" :class="[{ 'rotate-180': openSelectKey === 'webTimeout' }, isDark ? 'text-wt-dim' : 'text-lt-aux']" />
            </button>
            <div v-if="openSelectKey === 'webTimeout'" class="web-timeout-menu" :class="isDark ? 'web-timeout-menu--dark' : 'web-timeout-menu--light'">
              <button v-for="seconds in webTimeoutOptions" :key="seconds" type="button" class="web-timeout-option" :class="[isDark ? 'web-timeout-option--dark' : 'web-timeout-option--light', webDraft.timeoutSeconds === seconds ? 'web-timeout-option--selected' : '']" @click="selectWebTimeout(seconds)">
                <span>{{ seconds }} 秒</span><i v-if="webDraft.timeoutSeconds === seconds" class="ri-check-line text-brand-400" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="py-8 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请选择一个网页解析引擎。</div>
      </div>

>>>>>>> dev
      <div v-else class="space-y-4">
        <div
          class="rounded-lg border p-3"
          :class="isDark ? 'border-bdr bg-d3' : 'border-bdrF bg-l3'">
          <div class="flex items-start gap-2.5">
            <i class="ri-time-line text-[15px] mt-0.5 shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <div class="min-w-0">
              <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">即将支持</div>
              <div class="text-[11px] leading-relaxed mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                媒体解析会覆盖图片理解、音频转写、视频抽帧与时间轴摘要。当前这里只保存默认偏好，不会启动媒体解析任务。
              </div>
            </div>
          </div>
        </div>
        <div class="settings-selector-grid">
          <div class="compact-select compact-select--wide">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">上传后处理</div>
            <button type="button" :class="selectorButtonClasses()" @click="toggleSelect('mediaAction')">
              <span class="compact-select__icon"><i :class="selectedOption(mediaActionOptions, model.mediaAction).icon" /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{ selectedOption(mediaActionOptions, model.mediaAction).title }}</span>
                <span class="compact-select__desc">{{ selectedOption(mediaActionOptions, model.mediaAction).desc }}</span>
              </span>
              <i class="ri-arrow-down-s-line compact-select__arrow" :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaAction' }" />
            </button>
            <div v-if="openSelectKey === 'mediaAction'" :class="selectorMenuClasses()">
              <button
                v-for="option in mediaActionOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaAction === option.value)"
                @click="selectOption('mediaAction', option.value)">
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i v-if="model.mediaAction === option.value" class="ri-check-line compact-select__check" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <template #footer="{ close }">
      <button
        @click="close()"
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
        取消
      </button>
      <button
<<<<<<< HEAD
        @click="emit('save', close)"
=======
        @click="saveCurrent(close)"
>>>>>>> dev
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
        保存设置
      </button>
    </template>
  </MsModal>
</template>

<style scoped>
.settings-selector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
  align-items: start;
}

<<<<<<< HEAD
=======
.web-provider-select { position: relative; }
.web-provider-trigger { width: 100%; min-height: 48px; padding: 9px 11px; border: 1px solid transparent; border-radius: 11px; display: flex; align-items: center; gap: 10px; transition: all 160ms ease; }
.web-provider-trigger--light { background: #fff; border-color: rgba(15,23,42,.1); box-shadow: 0 2px 10px rgba(15,23,42,.04); }
.web-provider-trigger--light:hover { border-color: rgba(99,102,241,.3); box-shadow: 0 0 0 3px rgba(99,102,241,.07); }
.web-provider-trigger--dark { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.09); }
.web-provider-trigger--dark:hover { border-color: rgba(129,140,248,.34); background: rgba(255,255,255,.055); box-shadow: 0 0 0 3px rgba(129,140,248,.07); }
.web-provider-logo { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; }
.web-provider-raster { width: 25px; height: 25px; display: block; object-fit: contain; }
.web-format-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; font-size: 8.5px; font-weight: 700; letter-spacing: .02em; }
.web-provider-menu { position: absolute; z-index: 45; left: 0; right: 0; top: calc(100% + 7px); padding: 6px; border-radius: 12px; border: 1px solid transparent; box-shadow: 0 20px 48px rgba(15,23,42,.18); }
.web-provider-menu--light { background: #fff; border-color: rgba(15,23,42,.1); }
.web-provider-menu--dark { background: #202026; border-color: rgba(255,255,255,.1); }
.web-provider-option { width: 100%; min-height: 62px; padding: 8px; border-radius: 9px; display: flex; align-items: center; gap: 10px; transition: background-color 150ms ease; }
.web-provider-option + .web-provider-option { margin-top: 3px; }
.web-provider-option--light:hover, .web-provider-option--light.web-provider-option--selected { background: rgba(238,242,255,.9); }
.web-provider-option--dark:hover, .web-provider-option--dark.web-provider-option--selected { background: rgba(129,140,248,.1); }
.web-settings-panel { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 12px; padding: 13px; border: 1px solid transparent; border-radius: 12px; }
.web-settings-panel--light { background: rgba(248,250,252,.8); border-color: rgba(15,23,42,.07); }
.web-settings-panel--dark { background: rgba(255,255,255,.025); border-color: rgba(255,255,255,.07); }
.web-field:nth-child(2), .web-test-card { grid-column: 1 / -1; }
.web-input-shell { min-height: 38px; display: flex; align-items: center; border: 1px solid transparent; border-radius: 9px; transition: all 160ms ease; overflow: hidden; }
.web-input-shell--light { background: #fff; border-color: rgba(15,23,42,.1); }
.web-input-shell--dark { background: rgba(0,0,0,.14); border-color: rgba(255,255,255,.09); }
.web-input-shell:focus-within { border-color: rgba(99,102,241,.48); box-shadow: 0 0 0 3px rgba(99,102,241,.09); }
.web-input-shell input, .web-input-shell select { min-width: 0; flex: 1; height: 36px; padding: 0 5px; background: transparent; border: 0; outline: 0; color: inherit; font-size: 11.5px; appearance: none; }
.web-input-icon { width: 34px; text-align: center; color: #818cf8; font-size: 14px; }
.web-input-suffix { flex: 0 0 auto; padding: 0 10px 0 5px; font-size: 8.5px; font-weight: 650; opacity: .55; }
.web-field-help { margin-top: 5px; font-size: 9.5px; line-height: 1.4; }
.web-timeout-select { position: relative; }
.web-timeout-trigger { width: 100%; min-height: 38px; padding: 0 10px; border: 1px solid transparent; border-radius: 9px; display: flex; align-items: center; gap: 9px; transition: all 160ms ease; }
.web-timeout-trigger--light { background: #fff; border-color: rgba(15,23,42,.1); color: #334155; }
.web-timeout-trigger--dark { background: rgba(0,0,0,.14); border-color: rgba(255,255,255,.09); color: rgba(255,255,255,.82); }
.web-timeout-trigger:hover, .web-timeout-trigger:focus-visible { border-color: rgba(99,102,241,.42); box-shadow: 0 0 0 3px rgba(99,102,241,.08); outline: none; }
.web-timeout-menu { position: absolute; z-index: 48; top: calc(100% + 6px); left: 0; right: 0; padding: 5px; border: 1px solid transparent; border-radius: 10px; box-shadow: 0 14px 34px rgba(15,23,42,.16); }
.web-timeout-menu--light { background: #fff; border-color: rgba(15,23,42,.1); }
.web-timeout-menu--dark { background: #202026; border-color: rgba(255,255,255,.1); }
.web-timeout-option { width: 100%; min-height: 34px; padding: 0 9px; border-radius: 7px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; transition: background-color 150ms ease; }
.web-timeout-option--light { color: #475569; }
.web-timeout-option--dark { color: rgba(255,255,255,.72); }
.web-timeout-option--light:hover, .web-timeout-option--light.web-timeout-option--selected { background: rgba(238,242,255,.95); color: #4338ca; }
.web-timeout-option--dark:hover, .web-timeout-option--dark.web-timeout-option--selected { background: rgba(129,140,248,.12); color: #a5b4fc; }

>>>>>>> dev
.compact-select {
  position: relative;
  min-width: 0;
}

.compact-select--wide {
  grid-column: 1 / -1;
}

.compact-select__label {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
}

.compact-select__button,
.compact-select__option {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.compact-select__button {
  min-height: 53px;
  padding: 7px 9px;
}

.compact-select__button--light {
  background: rgba(248, 250, 252, 0.95);
  border-color: rgba(15, 23, 42, 0.08);
  color: #334155;
}

.compact-select__button--dark {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
}

.compact-select__button--light:hover,
.compact-select__button--light:focus-visible {
  border-color: rgba(99, 102, 241, 0.24);
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}

.compact-select__button--dark:hover,
.compact-select__button--dark:focus-visible {
  border-color: rgba(129, 140, 248, 0.32);
  background: rgba(255, 255, 255, 0.055);
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.08);
}

.compact-select__menu {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  max-height: 244px;
  overflow: auto;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
}

.compact-select__menu--light {
  background: #ffffff;
  border-color: rgba(15, 23, 42, 0.1);
}

.compact-select__menu--dark {
  background: #1f1f24;
  border-color: rgba(255, 255, 255, 0.1);
}

.compact-select__option {
  min-height: 56px;
  padding: 7px;
}

.compact-select__option + .compact-select__option {
  margin-top: 3px;
}

.compact-select__option--light {
  color: #334155;
}

.compact-select__option--dark {
  color: rgba(255, 255, 255, 0.74);
}

.compact-select__option--light:hover,
.compact-select__option--selected.compact-select__option--light {
  background: rgba(238, 242, 255, 0.9);
}

.compact-select__option--dark:hover,
.compact-select__option--selected.compact-select__option--dark {
  background: rgba(129, 140, 248, 0.12);
}

.compact-select__icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  font-size: 13px;
}

.compact-select__content {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 3px;
}

.compact-select__title {
  display: block;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-select__desc {
  display: -webkit-box;
  font-size: 10.5px;
  line-height: 1.35;
  opacity: 0.72;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.compact-select__button .compact-select__desc {
  -webkit-line-clamp: 1;
}

.compact-select__arrow {
  flex: 0 0 auto;
  font-size: 16px;
  opacity: 0.58;
  transition: transform 160ms ease;
}

.compact-select__arrow--open {
  transform: rotate(180deg);
}

.compact-select__check {
  flex: 0 0 auto;
  color: #6366f1;
  font-size: 15px;
}

.compact-select__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.3;
}

.compact-select__meta button {
  flex: 0 0 auto;
}

.settings-action-card {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 11px;
}

.settings-action-card--light {
  background: rgba(255, 251, 235, 0.7);
  border-color: rgba(245, 158, 11, 0.24);
  color: #92400e;
}

.settings-action-card--dark {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.settings-action-card__title {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
}

.settings-action-card__desc {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.35;
  opacity: 0.82;
}

.settings-action-card__button {
  display: inline-flex;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 7px;
  padding: 0 9px;
  font-size: 11px;
  font-weight: 650;
  transition: background-color 160ms ease;
}

.settings-action-card__button--light {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.settings-action-card__button--light:hover {
  background: rgba(99, 102, 241, 0.16);
}

.settings-action-card__button--dark {
  background: rgba(129, 140, 248, 0.14);
  color: #a5b4fc;
}

.settings-action-card__button--dark:hover {
  background: rgba(129, 140, 248, 0.2);
}

.local-install-btn {
  display: inline-flex;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
  padding: 0 8px;
  font-size: 10.5px;
  font-weight: 600;
  transition: background-color 160ms ease, opacity 160ms ease;
}

.local-install-btn:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.local-install-btn--light {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}

.local-install-btn--light:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.16);
}

.local-install-btn--dark {
  background: rgba(129, 140, 248, 0.14);
  color: #a5b4fc;
}

.local-install-btn--dark:hover:not(:disabled) {
  background: rgba(129, 140, 248, 0.2);
}

@media (max-width: 720px) {
  .settings-selector-grid {
    grid-template-columns: 1fr;
  }

  .compact-select--wide {
    grid-column: auto;
  }
}
</style>
