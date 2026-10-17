import { ref, computed } from 'vue'

const defaultProcessingSettings = {
  version: 1,
  pdfEngine: 'auto',
  uploadAction: 'ask',
  defaultOcrProvider: 'auto',
  missingPythonFallback: 'ocr_provider',
  largePdfMode: 'adaptive',
  allowFullDocumentOcr: true,
  allowPaddleFullDocumentForPageRanges: true,
  mediaAction: 'ask',
  mediaPreset: 'subtitle_first',
  mediaPreferredLanguage: 'auto',
  mediaProviderId: 'auto',
  mediaModelRef: '',
  mediaPreferSubtitle: true,
  mediaExtractKeyframes: false,
  mediaKeyframeLimit: 12,
}

export function useProcessingSettings({ router, msg, mediaStore }) {
  const api = () => window.electronAPI

  const processingSettings = ref({ ...defaultProcessingSettings })
  const ocrProviders = ref([])
  const pdfEnvironment = ref(null)
  const installingPdfLocalParser = ref(false)
  const pdfLocalParserInstallResult = ref(null)

  function normalizeProcessingSettings(value = {}) {
    return {
      ...defaultProcessingSettings,
      ...(value && typeof value === 'object' ? value : {}),
      allowFullDocumentOcr: value?.allowFullDocumentOcr !== false,
      allowPaddleFullDocumentForPageRanges: value?.allowPaddleFullDocumentForPageRanges !== false,
    }
  }

  async function loadProcessingSettings() {
    try {
      const result = await api()?.pdf?.getSettings?.()
      processingSettings.value = normalizeProcessingSettings(result?.data || {})
    } catch (e) {
      console.warn('[Docs] load PDF settings failed:', e)
    }
  }

  async function loadOcrProviders() {
    try {
      const result = await (api()?.wiki?.listOcrProviders?.() || api()?.listOcrProviders?.())
      ocrProviders.value = result?.success ? (result.data || []) : []
    } catch (e) {
      console.warn('[Docs] load OCR providers failed:', e)
      ocrProviders.value = []
    }
  }

  async function loadPdfEnvironment() {
    try {
      pdfEnvironment.value = await api()?.pdf?.checkEnvironment?.()
    } catch (e) {
      console.warn('[Docs] load PDF environment failed:', e)
      pdfEnvironment.value = { success: false, code: 'PDF_ENV_CHECK_FAILED', message: e.message }
    }
  }

  async function saveProcessingSettings(close) {
    try {
      const next = normalizeProcessingSettings(processingSettings.value)
      const result = await api()?.pdf?.setSettings?.(next)
      if (!result?.success) throw new Error(result?.error || result?.message || '解析配置保存失败')
      if (String(result.data?.mediaProviderId || 'auto') !== String(next.mediaProviderId || 'auto')) {
        throw new Error('语音转文字服务选择未能保存，请重试。')
      }
      if (String(result.data?.defaultOcrProvider || 'auto') !== String(next.defaultOcrProvider || 'auto')) {
        throw new Error('OCR 服务商选择未能保存，请重试。')
      }
      processingSettings.value = normalizeProcessingSettings(result.data)
      close?.()
      msg.success('解析配置已保存')
    } catch (error) {
      msg.error(error?.message || '解析配置保存失败')
    }
  }

  async function installPdfLocalParser() {
    if (installingPdfLocalParser.value) return
    installingPdfLocalParser.value = true
    pdfLocalParserInstallResult.value = null
    try {
      const result = await api()?.pdf?.installLocalParser?.()
      pdfLocalParserInstallResult.value = result || { success: false, error: '安装接口无返回。' }
      await loadPdfEnvironment()
    } catch (e) {
      pdfLocalParserInstallResult.value = { success: false, error: e.message || '安装失败。' }
    } finally {
      installingPdfLocalParser.value = false
    }
  }

  function isOcrProviderEnabled(provider) {
    if (!provider || provider.enabled === undefined) return true
    return provider?.enabled === true || provider?.enabled === 1 || provider?.enabled === '1' || provider?.enabled === 'true'
  }

  function isSupportedPdfOcrProvider(provider) {
    return ['mineru', 'paddleocr'].includes(String(provider?.type || '').toLowerCase())
  }

  function isConfiguredPdfOcrProvider(provider) {
    const type = String(provider?.type || '').toLowerCase()
    return !!String(provider?.base_url || '').trim()
      && (type === 'paddleocr' || !!String(provider?.api_key_ref || '').trim())
  }

  const enabledOcrProviders = computed(() => ocrProviders.value.filter(provider =>
    isOcrProviderEnabled(provider)
    && isSupportedPdfOcrProvider(provider)
    && isConfiguredPdfOcrProvider(provider)
  ))

  const supportedOcrProviders = computed(() => ocrProviders.value.filter(provider => isSupportedPdfOcrProvider(provider)))

  const configuredOcrProviders = computed(() => supportedOcrProviders.value.filter(provider =>
    isConfiguredPdfOcrProvider(provider)
  ))

  function autoOcrProvider() {
    return enabledOcrProviders.value[0] || null
  }

  function selectedEnabledOcrProvider() {
    const selected = processingSettings.value.defaultOcrProvider
    if (!selected || selected === 'auto') return null
    return enabledOcrProviders.value.find(provider => provider.id === selected) || null
  }

  const effectiveOcrProvider = computed(() => {
    return selectedEnabledOcrProvider() || autoOcrProvider()
  })

  const ocrProviderStatusText = computed(() => {
    const provider = effectiveOcrProvider.value
    if (!enabledOcrProviders.value.length) {
      if (configuredOcrProviders.value.length) return '已保存 OCR 服务商，但当前未启用'
      if (supportedOcrProviders.value.length) return 'OCR 服务商配置不完整，请补全 URL 和 API Key'
      return '未配置 MinerU 或 PaddleOCR 文档智能解析服务'
    }
    const selected = processingSettings.value.defaultOcrProvider
    if (selected && selected !== 'auto' && !selectedEnabledOcrProvider()) {
      return provider ? `当前选择不可用，已自动使用：${provider.name || provider.type}` : '当前选择的服务商不可用'
    }
    return `当前使用：${provider.name || provider.type}`
  })

  const pdfEnvironmentStatusText = computed(() => {
    if (!pdfEnvironment.value) return '本地文本层环境未检测'
    if (pdfEnvironment.value.success) {
      const version = pdfEnvironment.value.pymupdfVersion ? `PyMuPDF ${pdfEnvironment.value.pymupdfVersion}` : (pdfEnvironment.value.parser || 'PyMuPDF')
      return `本地快速解析可用：${version} · ${pdfEnvironment.value.via || 'python'}`
    }
    if (pdfEnvironment.value.code === 'PYTHON_NOT_FOUND') return '未找到 Python，可改用 OCR 服务商解析 PDF'
    if (pdfEnvironment.value.code === 'PYMUPDF_NOT_INSTALLED' || pdfEnvironment.value.code === 'PYPDF_NOT_INSTALLED') {
      const version = pdfEnvironment.value.pythonVersion ? `Python ${pdfEnvironment.value.pythonVersion}` : 'Python'
      return `已找到 ${version}，但缺少 PyMuPDF；可自动安装或改用 OCR 服务商解析 PDF`
    }
    return pdfEnvironment.value.message || '本地快速解析不可用，可改用 OCR 服务商'
  })

  const selectedMediaSpeechProvider = computed(() => {
    const requestedId = String(processingSettings.value.mediaProviderId || 'auto').trim() || 'auto'
    if (requestedId !== 'auto') {
      return mediaStore.configuredSpeechProviders.find(provider => provider.id === requestedId) || {
        id: requestedId,
        name: '所选语音服务',
        model: '',
        modelName: '',
        unavailable: true,
        active: false,
      }
    }
    return mediaStore.defaultSpeechProvider
  })

  function openOcrSettings() {
    router.push('/settings/ocr')
  }

  function openSpeechSettings() {
    router.push('/settings/speech-models')
  }

  return {
    defaultProcessingSettings,
    processingSettings,
    ocrProviders,
    pdfEnvironment,
    installingPdfLocalParser,
    pdfLocalParserInstallResult,
    enabledOcrProviders,
    supportedOcrProviders,
    configuredOcrProviders,
    effectiveOcrProvider,
    ocrProviderStatusText,
    pdfEnvironmentStatusText,
    selectedMediaSpeechProvider,
    normalizeProcessingSettings,
    loadProcessingSettings,
    loadOcrProviders,
    loadPdfEnvironment,
    saveProcessingSettings,
    installPdfLocalParser,
    openOcrSettings,
    openSpeechSettings,
  }
}
