<script setup>
import { ref, computed } from 'vue'
import { pdfEngineOptions, uploadActionOptions, largePdfOptions, fallbackOptions } from './constant'
import './settingsControls.css'

const props = defineProps({
  model: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  pdfEnvironment: { type: Object, default: null },
  pdfEnvironmentStatusText: { type: String, default: '' },
  effectiveOcrProvider: { type: Object, default: null },
  enabledOcrProviders: { type: Array, default: () => [] },
  ocrProviderStatusText: { type: String, default: '' },
  pdfLocalParserInstallResult: { type: Object, default: null },
  installingPdfLocalParser: { type: Boolean, default: false },
})

const emit = defineEmits(['install-local-parser', 'open-ocr-settings'])

const openSelectKey = ref('')
function toggleSelect(key) { openSelectKey.value = openSelectKey.value === key ? '' : key }
function selectOption(field, value) { props.model[field] = value; openSelectKey.value = '' }
function selectorButtonClasses() { return ['compact-select__button', props.isDark ? 'compact-select__button--dark' : 'compact-select__button--light'] }
function selectorMenuClasses() { return ['compact-select__menu', props.isDark ? 'compact-select__menu--dark' : 'compact-select__menu--light'] }
function selectorOptionClasses(selected) { return ['compact-select__option', props.isDark ? 'compact-select__option--dark' : 'compact-select__option--light', selected ? 'compact-select__option--selected' : ''] }
function selectedOption(options, value) { return options.find(o => o.value === value) || options[0] || {} }

const hasLocalText = computed(() => !!props.pdfEnvironment?.success)
const hasOcrProvider = computed(() => !!props.effectiveOcrProvider)
const currentPdfEngine = computed(() => props.model?.pdfEngine || 'auto')
const effectiveDraftOcrProviderId = computed(() => {
  const requested = String(props.model?.defaultOcrProvider || 'auto')
  if (requested === 'auto') return 'auto'
  return props.enabledOcrProviders.some(p => p.id === requested) ? requested : 'auto'
})
const draftOcrProvider = computed(() => {
  const selected = effectiveDraftOcrProviderId.value
  if (selected !== 'auto') return props.enabledOcrProviders.find(p => p.id === selected) || props.enabledOcrProviders[0] || null
  return props.enabledOcrProviders[0] || null
})
const selectedOcrProviderType = computed(() => String(draftOcrProvider.value?.type || '').toLowerCase())
const draftOcrProviderStatusText = computed(() => {
  if (!props.enabledOcrProviders.length) return props.ocrProviderStatusText
  const requested = String(props.model?.defaultOcrProvider || 'auto')
  const selected = effectiveDraftOcrProviderId.value
  const selectedProvider = selected === 'auto' ? null : props.enabledOcrProviders.find(p => p.id === selected)
  if (selectedProvider) return '当前使用：' + (selectedProvider.name || selectedProvider.type)
  if (requested !== 'auto' && draftOcrProvider.value) return '原选择不可用，将自动使用：' + (draftOcrProvider.value.name || draftOcrProvider.value.type)
  return draftOcrProvider.value ? '跟随当前 OCR：' + (draftOcrProvider.value.name || draftOcrProvider.value.type) : props.ocrProviderStatusText
})
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
    return { title: '建议使用自动模式', body: '先用本地快速解析读取文本层；遇到扫描页、图片页、表格或公式时，再调用 OCR 服务补齐 Markdown。', tone: 'good', icon: 'ri-sparkling-2-line' }
  }
  if (!hasLocalText.value && hasOcrProvider.value) {
    return {
      title: '建议使用文档智能解析',
      body: missingLocalParser.value ? '已检测到 Python，但缺少 PyMuPDF。可以一键自动安装，也可以直接用 MinerU 或 PaddleOCR 解析 PDF。' : '当前本地 Python 不可用，但已配置 OCR 服务商，可以直接用 MinerU 或 PaddleOCR 解析 PDF。',
      tone: 'warn', icon: 'ri-scan-2-line'
    }
  }
  if (hasLocalText.value && !hasOcrProvider.value) {
    return { title: '本地快速解析可用', body: (props.ocrProviderStatusText || 'OCR 服务商当前不可用') + '；文本型 PDF 可以正常处理，扫描件、图片页或复杂表格需要启用 OCR 服务商。', tone: 'warn', icon: 'ri-file-text-line' }
  }
  return { title: '需要可用的 OCR 服务商', body: '当前没有可用的本地文本层环境，且' + (props.ocrProviderStatusText || '没有可用 OCR 服务商') + '。普通用户建议启用 MinerU 或 PaddleOCR。', tone: 'danger', icon: 'ri-error-warning-line' }
})
const ocrProviderOptions = computed(() => [
  { value: 'auto', icon: 'ri-route-line', title: '自动选择', desc: props.enabledOcrProviders.length ? '跟随 OCR 设置中当前启用的服务商。' : '暂无可用服务商，需先到 OCR 模型配置中启用。' },
  ...props.enabledOcrProviders.map(p => ({ value: p.id, icon: String(p.type||'').toLowerCase() === 'mineru' ? 'ri-gemini-line' : 'ri-scan-2-line', title: p.name || p.type || '未命名服务商', desc: (p.type || 'OCR') + ' · 已启用' }))
])
function toneClasses(tone) {
  if (tone === 'good') return props.isDark ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'danger') return props.isDark ? 'border-red-400/20 bg-red-400/8 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
  return props.isDark ? 'border-amber-400/20 bg-amber-400/8 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'
}

defineExpose({ effectiveDraftOcrProviderId })
</script>

<template>
      <div class="space-y-4">
        <div class="rounded-lg border p-3" :class="toneClasses(recommendation.tone)">
          <div class="flex items-start gap-2.5">
            <i :class="[recommendation.icon, 'text-[15px] mt-0.5 shrink-0']" />
            <div class="min-w-0">
              <div class="text-[12px] font-semibold">{{ recommendation.title }}</div>
              <div class="text-[11px] leading-relaxed mt-1 opacity-90">
                {{ recommendation.body }}
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div
            class="rounded-lg border p-3"
            :class="isDark ? 'border-bdr bg-d3' : 'border-bdrF bg-l3'"
          >
            <div class="flex items-center justify-between gap-2">
              <div
                class="text-[11px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >
                本地快速解析
              </div>
              <span
                class="text-[9.5px] px-1.5 py-0.5 rounded"
                :class="
                  hasLocalText
                    ? isDark
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-emerald-50 text-emerald-600'
                    : isDark
                      ? 'bg-amber-400/10 text-amber-300'
                      : 'bg-amber-50 text-amber-700'
                "
              >
                {{ localStatusBadge }}
              </span>
            </div>
            <div
              class="text-[10.5px] leading-relaxed mt-1.5"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
            >
              {{ pdfEnvironmentStatusText }}
            </div>
            <div v-if="canInstallLocalParser" class="mt-2 flex items-center justify-between gap-2">
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                >将使用阿里云 PyPI 镜像安装 PyMuPDF</span
              >
              <button
                type="button"
                :disabled="installingPdfLocalParser"
                class="local-install-btn"
                :class="isDark ? 'local-install-btn--dark' : 'local-install-btn--light'"
                @click="emit('install-local-parser')"
              >
                <i
                  :class="
                    installingPdfLocalParser
                      ? 'ri-loader-4-line animate-spin'
                      : 'ri-download-cloud-2-line'
                  "
                />
                {{ installingPdfLocalParser ? '安装中' : '自动安装' }}
              </button>
            </div>
            <div
              v-if="pdfLocalParserInstallResult"
              class="mt-2 text-[10px] leading-relaxed"
              :class="
                pdfLocalParserInstallResult.success
                  ? isDark
                    ? 'text-emerald-300'
                    : 'text-emerald-600'
                  : isDark
                    ? 'text-red-300'
                    : 'text-red-600'
              "
            >
              {{
                pdfLocalParserInstallResult.success
                  ? '安装完成，本地快速解析已重新检测。'
                  : pdfLocalParserInstallResult.error || '安装失败，请检查 pip 输出。'
              }}
            </div>
          </div>
          <div
            class="rounded-lg border p-3"
            :class="isDark ? 'border-bdr bg-d3' : 'border-bdrF bg-l3'"
          >
            <div class="flex items-center justify-between gap-2">
              <div
                class="text-[11px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >
                文档智能解析
              </div>
              <span
                class="text-[9.5px] px-1.5 py-0.5 rounded"
                :class="
                  hasOcrProvider
                    ? isDark
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-emerald-50 text-emerald-600'
                    : isDark
                      ? 'bg-amber-400/10 text-amber-300'
                      : 'bg-amber-50 text-amber-700'
                "
              >
                {{ hasOcrProvider ? '可用' : '未配置' }}
              </span>
            </div>
            <div
              class="text-[10.5px] leading-relaxed mt-1.5"
              :class="hasOcrProvider ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'text-amber-500'"
            >
              {{ ocrProviderStatusText }}
            </div>
          </div>
        </div>

        <div class="settings-selector-grid">
          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              默认处理策略
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('pdfEngine')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(pdfEngineOptions, model.pdfEngine).icon"
              /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{
                  selectedOption(pdfEngineOptions, model.pdfEngine).title
                }}</span>
                <span class="compact-select__desc">{{
                  selectedOption(pdfEngineOptions, model.pdfEngine).desc
                }}</span>
              </span>
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'pdfEngine' }"
              />
            </button>
            <div v-if="openSelectKey === 'pdfEngine'" :class="selectorMenuClasses()">
              <button
                v-for="option in pdfEngineOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.pdfEngine === option.value)"
                @click="selectOption('pdfEngine', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i
                  v-if="model.pdfEngine === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              上传后处理
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('uploadAction')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(uploadActionOptions, model.uploadAction).icon"
              /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{
                  selectedOption(uploadActionOptions, model.uploadAction).title
                }}</span>
                <span class="compact-select__desc">{{
                  selectedOption(uploadActionOptions, model.uploadAction).desc
                }}</span>
              </span>
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'uploadAction' }"
              />
            </button>
            <div v-if="openSelectKey === 'uploadAction'" :class="selectorMenuClasses()">
              <button
                v-for="option in uploadActionOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.uploadAction === option.value)"
                @click="selectOption('uploadAction', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i
                  v-if="model.uploadAction === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div v-if="showOcrProviderSelect" class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              OCR 服务商
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('defaultOcrProvider')"
            >
              <span class="compact-select__icon"
                 ><i :class="selectedOption(ocrProviderOptions, effectiveDraftOcrProviderId).icon"
              /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{
                  selectedOption(ocrProviderOptions, effectiveDraftOcrProviderId).title
                }}</span>
                <span class="compact-select__desc">{{ draftOcrProviderStatusText }}</span>
              </span>
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'defaultOcrProvider' }"
              />
            </button>
            <div v-if="openSelectKey === 'defaultOcrProvider'" :class="selectorMenuClasses()">
              <button
                v-for="option in ocrProviderOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(effectiveDraftOcrProviderId === option.value)"
                @click="selectOption('defaultOcrProvider', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i
                  v-if="effectiveDraftOcrProviderId === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
            <div class="compact-select__meta">
              <span
                :class="
                  effectiveOcrProvider ? (isDark ? 'text-wt-dim' : 'text-lt-aux') : 'text-amber-400'
                "
              >
                {{ effectiveOcrProvider ? '已启用文档智能解析' : '需要先配置可用服务商' }}
              </span>
              <button
                type="button"
                @click="emit('open-ocr-settings')"
                :class="
                  isDark
                    ? 'text-brand-400 hover:text-brand-300'
                    : 'text-brand-500 hover:text-brand-600'
                "
              >
                去配置
              </button>
            </div>
          </div>
          <div
            v-else-if="showOcrSetupPrompt"
            class="settings-action-card compact-select--wide"
            :class="isDark ? 'settings-action-card--dark' : 'settings-action-card--light'"
          >
            <div class="min-w-0">
              <div class="settings-action-card__title">OCR 服务商不可用</div>
              <div class="settings-action-card__desc">
                {{
                  ocrProviderStatusText ||
                  '扫描件、图片页、复杂表格和本地不可用时，需要启用 MinerU 或 PaddleOCR。'
                }}
              </div>
            </div>
            <button
              type="button"
              class="settings-action-card__button"
              :class="
                isDark
                  ? 'settings-action-card__button--dark'
                  : 'settings-action-card__button--light'
              "
              @click="emit('open-ocr-settings')"
            >
              去配置
            </button>
          </div>

          <div v-if="showLargePdfMode" class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              大 PDF 对话策略
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('largePdfMode')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(largePdfOptions, model.largePdfMode).icon"
              /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{
                  selectedOption(largePdfOptions, model.largePdfMode).title
                }}</span>
                <span class="compact-select__desc">{{
                  selectedOption(largePdfOptions, model.largePdfMode).desc
                }}</span>
              </span>
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'largePdfMode' }"
              />
            </button>
            <div v-if="openSelectKey === 'largePdfMode'" :class="selectorMenuClasses()">
              <button
                v-for="option in largePdfOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.largePdfMode === option.value)"
                @click="selectOption('largePdfMode', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i
                  v-if="model.largePdfMode === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div v-if="showMissingLocalFallback" class="compact-select compact-select--wide">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              本地不可用时
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('missingPythonFallback')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(fallbackOptions, model.missingPythonFallback).icon"
              /></span>
              <span class="compact-select__content">
                <span class="compact-select__title">{{
                  selectedOption(fallbackOptions, model.missingPythonFallback).title
                }}</span>
                <span class="compact-select__desc">{{
                  selectedOption(fallbackOptions, model.missingPythonFallback).desc
                }}</span>
              </span>
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{
                  'compact-select__arrow--open': openSelectKey === 'missingPythonFallback'
                }"
              />
            </button>
            <div v-if="openSelectKey === 'missingPythonFallback'" :class="selectorMenuClasses()">
              <button
                v-for="option in fallbackOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.missingPythonFallback === option.value)"
                @click="selectOption('missingPythonFallback', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span>
                <span class="compact-select__content">
                  <span class="compact-select__title">{{ option.title }}</span>
                  <span class="compact-select__desc">{{ option.desc }}</span>
                </span>
                <i
                  v-if="model.missingPythonFallback === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>
        </div>

        <div v-if="showOcrAdvancedToggles" class="space-y-2">
          <label
            v-if="showFullDocumentOcrToggle"
            class="flex items-start gap-2 text-[12px]"
            :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
          >
            <input v-model="model.allowFullDocumentOcr" type="checkbox" class="mt-0.5" />
            <span>允许后台对整份 PDF 执行文档智能解析</span>
          </label>
          <label
            v-if="showPaddleFallbackToggle"
            class="flex items-start gap-2 text-[12px]"
            :class="isDark ? 'text-wt-sub' : 'text-lt-sub'"
          >
            <input
              v-model="model.allowPaddleFullDocumentForPageRanges"
              type="checkbox"
              class="mt-0.5"
            />
            <span>PaddleOCR 收到页段任务时允许改为全文解析并复用缓存</span>
          </label>
        </div>
      </div>
</template>
