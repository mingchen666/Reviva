<script setup>
import { ref, computed, watch, toRaw } from 'vue';
import MsModal from '@/components/MsModal/MsModal.vue';
import {
  fetchBilibiliCookieStatus,
  storeBilibiliCookie
} from '@/apis/media';
import {webProviderVisuals,pdfEngineOptions,uploadActionOptions,largePdfOptions,fallbackOptions,mediaActionOptions,
mediaPresetOptions,mediaLanguageOptions} from './constant'

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
  initialTab: { type: String, default: 'pdf' },
  webSettings: { type: Object, default: null },
  webProviders: { type: Array, default: () => [] },
  configuredSpeechProviders: { type: Array, default: () => [] }
});

const emit = defineEmits([
  'update:show',
  'save',
  'save-web-settings',
  'open-ocr-settings',
  'open-speech-settings',
  'install-local-parser'
]);
const activeTab = ref('pdf');
const openSelectKey = ref('');
const webApiKey = ref('');
const webApiKeyAction = ref('keep');
const webDraft = ref(null);
const bilibiliCookieInput = ref('');
const bilibiliCookieVisible = ref(false);
const bilibiliCookieBusy = ref(false);
const bilibiliCookieStatus = ref(null);
const bilibiliCookieFeedback = ref('');
const bilibiliCookieFeedbackTone = ref('neutral');

function cloneWebSettings(value) {
  if (!value) return null;
  return structuredClone(toRaw(value));
}

const model = computed(() => props.settings);
const show = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value)
});

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      webDraft.value = null;
      return;
    }
    activeTab.value = ['pdf', 'web', 'media'].includes(props.initialTab) ? props.initialTab : 'pdf';
    webApiKey.value = '';
    webApiKeyAction.value = 'keep';
    webDraft.value = cloneWebSettings(props.webSettings);
    bilibiliCookieInput.value = '';
    bilibiliCookieVisible.value = false;
    bilibiliCookieStatus.value = null;
    bilibiliCookieFeedback.value = '';
    loadBilibiliCookieStatus();
  },
  { immediate: true }
);

watch(
  () => props.webSettings,
  (value) => {
    if (props.show && !webDraft.value && value) webDraft.value = cloneWebSettings(value);
  }
);

const selectedWebProviderId = computed(() => webDraft.value?.selectedProvider || '');
const selectedWebProvider = computed(
  () => props.webProviders.find((item) => item.id === selectedWebProviderId.value) || null
);
const selectedWebConfig = computed(
  () => webDraft.value?.providers?.[selectedWebProviderId.value] || null
);
const providerRasterAssets = import.meta.glob('../../../assets/icons/*.{ico,png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
});

const webTimeoutOptions = [30, 60, 90];

function webProviderVisual(id) {
  return (
    webProviderVisuals[id] || {
      icon: 'search-eye',
      desc: '网页内容解析服务',
      dark: 'bg-brand-400/12 text-brand-300',
      light: 'bg-brand-50 text-brand-600',
      badge: 'text-brand-500 bg-brand-400/10'
    }
  );
}

function webProviderRasterSrc(id) {
  const suffixes = [`/${id}.ico`, `/${id}.png`, `/${id}.webp`, `/${id}.jpg`, `/${id}.jpeg`];
  const entry = Object.entries(providerRasterAssets).find(([filePath]) =>
    suffixes.some((suffix) => filePath.toLowerCase().endsWith(suffix))
  );
  return entry?.[1] || '';
}

function selectWebProvider(id) {
  if (!webDraft.value) return;
  webDraft.value.selectedProvider = id;
  webApiKey.value = '';
  webApiKeyAction.value = 'keep';
}

function replaceWebKey() {
  webApiKeyAction.value = 'replace';
}
function clearWebKey() {
  webApiKey.value = '';
  webApiKeyAction.value = 'clear';
}
function keepWebKey() {
  webApiKey.value = '';
  webApiKeyAction.value = 'keep';
}
function selectWebTimeout(value) {
  if (webDraft.value) webDraft.value.timeoutSeconds = value;
  openSelectKey.value = '';
}

function webSettingsPatch() {
  const id = selectedWebProviderId.value;
  return {
    selectedProvider: id,
    timeoutSeconds: Number(webDraft.value?.timeoutSeconds) || 60,
    providers: id
      ? {
          [id]: {
            baseUrl: selectedWebConfig.value?.baseUrl || '',
            apiKeyAction: webApiKeyAction.value,
            apiKey: webApiKeyAction.value === 'replace' ? webApiKey.value : ''
          }
        }
      : {}
  };
}

function saveCurrent(close) {
  if (activeTab.value === 'web') emit('save-web-settings', webSettingsPatch(), close);
  else {
    if (activeTab.value === 'pdf' && model.value && props.enabledOcrProviders.length) {
      model.value.defaultOcrProvider = effectiveDraftOcrProviderId.value;
    }
    emit('save', close);
  }
}

const bilibiliCookieStatusText = computed(() => {
  const status = bilibiliCookieStatus.value;
  if (!status) return '正在读取';
  if (status.state === 'unavailable') return '状态读取失败';
  if (status.storageAvailable === false) return '安全存储不可用';
  if (!status.configured) return '未配置';
  if (status.valid) return status.userName ? `已登录 · ${status.userName}` : '已验证';
  if (status.state === 'invalid') return '已失效';
  if (status.state === 'unavailable') return '暂不可读取';
  return '待验证';
});

const bilibiliCookieReady = computed(() => bilibiliCookieStatus.value?.valid === true);

async function loadBilibiliCookieStatus() {
  try {
    const result = await fetchBilibiliCookieStatus();
    if (!result?.success || !result.status) throw new Error(result?.message || 'Cookie 状态接口未响应');
    bilibiliCookieStatus.value = result.status;
    bilibiliCookieInput.value = result.cookie || '';
  } catch (error) {
    bilibiliCookieStatus.value = {
      configured: false,
      valid: false,
      state: 'unavailable',
      storageAvailable: null,
      userName: '',
      userId: '',
      validatedAt: '',
    };
    bilibiliCookieFeedbackTone.value = 'error';
    bilibiliCookieFeedback.value = error?.message || 'Cookie 状态读取失败，请重启应用后重试';
  }
}

async function saveBilibiliCookie() {
  const cookie = bilibiliCookieInput.value.trim();
  if (!cookie || bilibiliCookieBusy.value) return;
  bilibiliCookieBusy.value = true;
  bilibiliCookieFeedback.value = '';
  try {
    const result = await storeBilibiliCookie(cookie);
    if (!result?.success) throw new Error(result?.message || 'B 站 Cookie 验证失败');
    bilibiliCookieStatus.value = result.status;
    bilibiliCookieInput.value = cookie;
    bilibiliCookieFeedbackTone.value = 'success';
    bilibiliCookieFeedback.value = 'Cookie 已验证并加密保存';
  } catch (error) {
    bilibiliCookieFeedbackTone.value = 'error';
    bilibiliCookieFeedback.value = error?.message || 'B 站 Cookie 验证失败';
  } finally {
    bilibiliCookieBusy.value = false;
  }
}

const speechProviderIcons = Object.freeze({
  local_asr: 'local-asr',
  openai_whisper_compatible: 'openai',
  aliyun_bailian_asr: 'bailian'
});

const speechProviderOptions = computed(() => [
  {
    value: 'auto',
    icon: 'ri-route-line',
    title: '自动选择',
    desc: props.configuredSpeechProviders.length
      ? '优先使用已配置的默认语音转文字服务。'
      : '尚未配置语音转文字服务；无字幕媒体会保持部分可用。'
  },
  ...props.configuredSpeechProviders.map((provider) => ({
    value: provider.id,
    svgIcon: speechProviderIcons[provider.id] || '',
    icon: provider.icon || 'ri-mic-ai-line',
    title: provider.name,
    desc: `${provider.model || '已配置'}${provider.active ? ' · 当前默认' : ''}`
  }))
]);

const speechProviderReady = computed(() => props.configuredSpeechProviders.length > 0);
const selectedMediaProvider = computed(() =>
  selectedOption(speechProviderOptions.value, model.value?.mediaProviderId || 'auto')
);

const ocrProviderOptions = computed(() => [
  {
    value: 'auto',
    icon: 'ri-route-line',
    title: '自动选择',
    desc: props.enabledOcrProviders.length
      ? '跟随 OCR 设置中当前启用的服务商。'
      : '暂无可用服务商，需先到 OCR 模型配置中启用。'
  },
  ...props.enabledOcrProviders.map((provider) => ({
    value: provider.id,
    icon:
      String(provider.type || '').toLowerCase() === 'mineru' ? 'ri-gemini-line' : 'ri-scan-2-line',
    title: provider.name || provider.type || '未命名服务商',
    desc: `${provider.type || 'OCR'} · 已启用`
  }))
]);

function selectedOption(options, value) {
  return options.find((option) => option.value === value) || options[0] || {};
}

const effectiveDraftOcrProviderId = computed(() => {
  const requested = String(model.value?.defaultOcrProvider || 'auto');
  if (requested === 'auto') return 'auto';
  return props.enabledOcrProviders.some((provider) => provider.id === requested)
    ? requested
    : 'auto';
});

function toggleSelect(key) {
  openSelectKey.value = openSelectKey.value === key ? '' : key;
}

function selectOption(field, value) {
  model.value[field] = value;
  if (field === 'mediaPreset' && value === 'keyframe_enhanced')
    model.value.mediaExtractKeyframes = true;
  if (field === 'mediaPreset' && value === 'local_private') {
    const localProvider = props.configuredSpeechProviders.find(
      (provider) => provider.id === 'local_asr'
    );
    model.value.mediaProviderId = localProvider ? 'local_asr' : 'auto';
  }
  openSelectKey.value = '';
}

function selectorButtonClasses() {
  return [
    'compact-select__button',
    props.isDark ? 'compact-select__button--dark' : 'compact-select__button--light'
  ];
}

function selectorMenuClasses() {
  return [
    'compact-select__menu',
    props.isDark ? 'compact-select__menu--dark' : 'compact-select__menu--light'
  ];
}

function selectorOptionClasses(selected) {
  return [
    'compact-select__option',
    props.isDark ? 'compact-select__option--dark' : 'compact-select__option--light',
    selected ? 'compact-select__option--selected' : ''
  ];
}

const hasLocalText = computed(() => !!props.pdfEnvironment?.success);
const hasOcrProvider = computed(() => !!props.effectiveOcrProvider);
const currentPdfEngine = computed(() => model.value?.pdfEngine || 'auto');
const draftOcrProvider = computed(() => {
  const selected = effectiveDraftOcrProviderId.value;
  if (selected !== 'auto') {
    return props.enabledOcrProviders.find((provider) => provider.id === selected)
      || props.enabledOcrProviders[0]
      || null;
  }
  return props.enabledOcrProviders[0] || null;
});
const selectedOcrProviderType = computed(() =>
  String(draftOcrProvider.value?.type || '').toLowerCase()
);
const draftOcrProviderStatusText = computed(() => {
  if (!props.enabledOcrProviders.length) return props.ocrProviderStatusText;
  const requested = String(model.value?.defaultOcrProvider || 'auto');
  const selected = effectiveDraftOcrProviderId.value;
  const selectedProvider = selected === 'auto'
    ? null
    : props.enabledOcrProviders.find((provider) => provider.id === selected);
  if (selectedProvider) return `当前使用：${selectedProvider.name || selectedProvider.type}`;
  if (requested !== 'auto' && draftOcrProvider.value) {
    return `原选择不可用，将自动使用：${draftOcrProvider.value.name || draftOcrProvider.value.type}`;
  }
  return draftOcrProvider.value
    ? `跟随当前 OCR：${draftOcrProvider.value.name || draftOcrProvider.value.type}`
    : props.ocrProviderStatusText;
});
const missingLocalParser = computed(() =>
  ['PYMUPDF_NOT_INSTALLED', 'PYPDF_NOT_INSTALLED'].includes(props.pdfEnvironment?.code)
);
const canInstallLocalParser = computed(() => missingLocalParser.value);
const showOcrProviderSelect = computed(
  () => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast'
);
const showOcrSetupPrompt = computed(
  () => !hasOcrProvider.value && (currentPdfEngine.value !== 'local_fast' || !hasLocalText.value)
);
const showLargePdfMode = computed(
  () => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast'
);
const showMissingLocalFallback = computed(
  () => currentPdfEngine.value === 'auto' && !hasLocalText.value && hasOcrProvider.value
);
const showFullDocumentOcrToggle = computed(
  () => hasOcrProvider.value && currentPdfEngine.value !== 'local_fast'
);
const showPaddleFallbackToggle = computed(
  () => showFullDocumentOcrToggle.value && selectedOcrProviderType.value === 'paddleocr'
);
const showOcrAdvancedToggles = computed(
  () => showFullDocumentOcrToggle.value || showPaddleFallbackToggle.value
);
const localStatusBadge = computed(() => {
  if (hasLocalText.value) return '可用';
  if (missingLocalParser.value) return '缺少 PyMuPDF';
  if (props.pdfEnvironment?.code === 'PYTHON_NOT_FOUND') return '未找到 Python';
  return '不可用';
});
const recommendation = computed(() => {
  if (hasLocalText.value && hasOcrProvider.value) {
    return {
      title: '建议使用自动模式',
      body: '先用本地快速解析读取文本层；遇到扫描页、图片页、表格或公式时，再调用 OCR 服务补齐 Markdown。',
      tone: 'good',
      icon: 'ri-sparkling-2-line'
    };
  }
  if (!hasLocalText.value && hasOcrProvider.value) {
    return {
      title: '建议使用文档智能解析',
      body: missingLocalParser.value
        ? '已检测到 Python，但缺少 PyMuPDF。可以一键自动安装，也可以直接用 MinerU 或 PaddleOCR 解析 PDF。'
        : '当前本地 Python 不可用，但已配置 OCR 服务商，可以直接用 MinerU 或 PaddleOCR 解析 PDF。',
      tone: 'warn',
      icon: 'ri-scan-2-line'
    };
  }
  if (hasLocalText.value && !hasOcrProvider.value) {
    return {
      title: '本地快速解析可用',
      body: `${props.ocrProviderStatusText || 'OCR 服务商当前不可用'}；文本型 PDF 可以正常处理，扫描件、图片页或复杂表格需要启用 OCR 服务商。`,
      tone: 'warn',
      icon: 'ri-file-text-line'
    };
  }
  return {
    title: '需要可用的 OCR 服务商',
    body: `当前没有可用的本地文本层环境，且${props.ocrProviderStatusText || '没有可用 OCR 服务商'}。普通用户建议启用 MinerU 或 PaddleOCR。`,
    tone: 'danger',
    icon: 'ri-error-warning-line'
  };
});

function toneClasses(tone) {
  if (tone === 'good') {
    return props.isDark
      ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (tone === 'danger') {
    return props.isDark
      ? 'border-red-400/20 bg-red-400/8 text-red-300'
      : 'border-red-200 bg-red-50 text-red-700';
  }
  return props.isDark
    ? 'border-amber-400/20 bg-amber-400/8 text-amber-300'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}
</script>

<template>
  <MsModal
    v-model:show="show"
    :width="720"
    height="min(820px, 85vh)"
    max-height="85vh"
    :show-footer="true"
  >
    <template #header>
      <div class="flex items-center gap-2.5">
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'"
        >
          <i
            class="ri-settings-3-line text-[16px]"
            :class="isDark ? 'text-brand-400' : 'text-brand-500'"
          />
        </div>
        <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'"
          >文档解析设置</span
        >
      </div>
    </template>

    <div class="space-y-4">
      <div
        class="grid grid-cols-3 rounded-lg border p-0.5"
        :class="isDark ? 'border-bdr bg-d3/60' : 'border-bdrF bg-l3'"
      >
        <button
          @click="activeTab = 'pdf'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'pdf'
              ? isDark
                ? 'bg-d0 text-brand-400 shadow-sm'
                : 'bg-white text-brand-500 shadow-sm'
              : isDark
                ? 'text-wt-dim hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          "
        >
          <i class="ri-file-pdf-2-line text-[12px]" />
          PDF 解析
        </button>
        <button
          @click="activeTab = 'web'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'web'
              ? isDark
                ? 'bg-d0 text-brand-400 shadow-sm'
                : 'bg-white text-brand-500 shadow-sm'
              : isDark
                ? 'text-wt-dim hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          "
        >
          <i class="ri-global-line text-[12px]" />
          网页解析
        </button>
        <button
          @click="activeTab = 'media'"
          class="h-8 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="
            activeTab === 'media'
              ? isDark
                ? 'bg-d0 text-brand-400 shadow-sm'
                : 'bg-white text-brand-500 shadow-sm'
              : isDark
                ? 'text-wt-dim hover:text-wt-sub'
                : 'text-lt-aux hover:text-lt-sub'
          "
        >
          <i class="ri-movie-2-ai-line text-[12px]" />
          媒体解析
        </button>
      </div>

      <div v-if="activeTab === 'pdf'" class="space-y-4">
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

      <div v-else-if="activeTab === 'web'" class="space-y-4">
        <div
          class="rounded-xl border p-3.5"
          :class="isDark ? 'border-brand-400/16 bg-brand-400/6' : 'border-brand-100 bg-brand-50/70'"
        >
          <div class="flex items-start gap-2.5">
            <i class="ri-shield-check-line text-[15px] mt-0.5 text-brand-400" />
            <div>
              <div
                class="text-[12px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >
                网页导入由第三方解析引擎处理
              </div>
              <div
                class="text-[11px] leading-relaxed mt-1"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
              >
                选择默认引擎后配置连接信息。请求失败时不会自动切换服务商。
              </div>
            </div>
          </div>
        </div>

        <div class="web-provider-select">
          <div
            class="text-[11px] font-semibold mb-1.5"
            :class="isDark ? 'text-wt-main' : 'text-lt-main'"
          >
            默认解析引擎
          </div>
          <button
            type="button"
            class="web-provider-trigger"
            :class="isDark ? 'web-provider-trigger--dark' : 'web-provider-trigger--light'"
            @click="toggleSelect('webProvider')"
          >
            <template v-if="selectedWebProvider">
              <span
                class="web-provider-logo"
                :class="
                  isDark
                    ? webProviderVisual(selectedWebProvider.id).dark
                    : webProviderVisual(selectedWebProvider.id).light
                "
                ><img
                  v-if="
                    webProviderVisual(selectedWebProvider.id).raster &&
                    webProviderRasterSrc(selectedWebProvider.id)
                  "
                  :src="webProviderRasterSrc(selectedWebProvider.id)"
                  :alt="selectedWebProvider.name"
                  class="web-provider-raster" /><SvgIcon
                  v-else
                  :icon-class="webProviderVisual(selectedWebProvider.id).icon"
                  :size="24"
              /></span>
              <span class="flex-1 min-w-0 text-left">
                <span class="flex items-center gap-2"
                  ><span
                    class="text-[12px] font-semibold"
                    :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                    >{{ selectedWebProvider.name }}</span
                  ><span
                    class="web-format-badge"
                    :class="webProviderVisual(selectedWebProvider.id).badge"
                    >{{
                      selectedWebProvider.formats?.includes('html') ? 'MD + HTML' : 'Markdown'
                    }}</span
                  ></span
                >
                <span
                  class="block text-[10.5px] mt-0.5 truncate"
                  :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                  >{{ webProviderVisual(selectedWebProvider.id).desc }}</span
                >
              </span>
            </template>
            <template v-else
              ><span
                class="web-provider-logo"
                :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'"
                ><i class="ri-global-line text-[20px]" /></span
              ><span
                class="flex-1 text-left text-[12px]"
                :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                >选择网页解析引擎</span
              ></template
            >
            <i
              class="ri-arrow-down-s-line text-[16px] transition-transform"
              :class="[
                { 'rotate-180': openSelectKey === 'webProvider' },
                isDark ? 'text-wt-dim' : 'text-lt-aux'
              ]"
            />
          </button>
          <div
            v-if="openSelectKey === 'webProvider'"
            class="web-provider-menu"
            :class="isDark ? 'web-provider-menu--dark' : 'web-provider-menu--light'"
          >
            <button
              v-for="provider in webProviders"
              :key="provider.id"
              type="button"
              class="web-provider-option"
              :class="[
                isDark ? 'web-provider-option--dark' : 'web-provider-option--light',
                selectedWebProviderId === provider.id ? 'web-provider-option--selected' : ''
              ]"
              @click="
                selectWebProvider(provider.id);
                openSelectKey = '';
              "
            >
              <span
                class="web-provider-logo"
                :class="
                  isDark
                    ? webProviderVisual(provider.id).dark
                    : webProviderVisual(provider.id).light
                "
                ><img
                  v-if="webProviderVisual(provider.id).raster && webProviderRasterSrc(provider.id)"
                  :src="webProviderRasterSrc(provider.id)"
                  :alt="provider.name"
                  class="web-provider-raster" /><SvgIcon
                  v-else
                  :icon-class="webProviderVisual(provider.id).icon"
                  :size="24"
              /></span>
              <span class="flex-1 min-w-0 text-left"
                ><span class="flex items-center gap-2"
                  ><span class="text-[12px] font-semibold">{{ provider.name }}</span
                  ><span class="web-format-badge" :class="webProviderVisual(provider.id).badge">{{
                    provider.formats?.includes('html') ? 'MD + HTML' : 'Markdown'
                  }}</span></span
                ><span
                  class="block text-[10.5px] mt-0.5"
                  :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                  >{{ webProviderVisual(provider.id).desc }}</span
                ></span
              >
              <i
                v-if="selectedWebProviderId === provider.id"
                class="ri-checkbox-circle-fill text-brand-400 text-[16px]"
              />
            </button>
          </div>
        </div>

        <div
          v-if="selectedWebProvider && selectedWebConfig"
          class="web-settings-panel"
          :class="isDark ? 'web-settings-panel--dark' : 'web-settings-panel--light'"
        >
          <div class="web-field">
            <label
              class="block text-[11px] font-semibold mb-1.5"
              :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >Base URL</label
            >
            <div
              class="web-input-shell"
              :class="isDark ? 'web-input-shell--dark' : 'web-input-shell--light'"
            >
              <i class="ri-links-line web-input-icon" /><input
                v-model="selectedWebConfig.baseUrl"
              /><span class="web-input-suffix">HTTP(S)</span>
            </div>
            <div class="web-field-help" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              支持官方地址、代理地址或私有部署。
            </div>
          </div>
          <div class="web-field">
            <div class="flex items-center justify-between mb-1.5">
              <label
                class="text-[11px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
                >API Key
                <span class="font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                  >（可选）</span
                ></label
              >
              <span
                v-if="selectedWebConfig.apiKeyConfigured && webApiKeyAction === 'keep'"
                class="text-[9.5px] text-emerald-400"
                >已配置 {{ selectedWebConfig.apiKeyMasked }}</span
              >
            </div>
            <div class="flex gap-2">
              <div
                class="web-input-shell flex-1"
                :class="isDark ? 'web-input-shell--dark' : 'web-input-shell--light'"
              >
                <i class="ri-key-2-line web-input-icon" /><input
                  v-model="webApiKey"
                  type="password"
                  :placeholder="
                    selectedWebConfig.apiKeyConfigured
                      ? '输入新 Key 以替换'
                      : '留空则不发送 API Key'
                  "
                  @input="replaceWebKey"
                /><span class="web-input-suffix">可选</span>
              </div>
              <button
                v-if="selectedWebConfig.apiKeyConfigured && webApiKeyAction !== 'clear'"
                type="button"
                class="px-3 rounded-lg text-[10.5px]"
                :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'"
                @click="clearWebKey"
              >
                清除
              </button>
              <button
                v-if="webApiKeyAction === 'clear'"
                type="button"
                class="px-3 rounded-lg text-[10.5px]"
                :class="isDark ? 'bg-d4 text-wt-sub' : 'bg-l4 text-lt-sub'"
                @click="keepWebKey"
              >
                撤销
              </button>
            </div>
            <div class="web-field-help" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              API Key 可留空；是否可直接使用由当前解析服务商的接口规则决定。
            </div>
          </div>
          <div class="web-field web-timeout-select">
            <label
              class="block text-[11px] font-semibold mb-1.5"
              :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >请求超时</label
            >
            <button
              type="button"
              class="web-timeout-trigger"
              :class="isDark ? 'web-timeout-trigger--dark' : 'web-timeout-trigger--light'"
              @click="toggleSelect('webTimeout')"
            >
              <i class="ri-timer-line text-brand-400 text-[14px]" />
              <span class="flex-1 text-left text-[11.5px]"
                >{{ webDraft.timeoutSeconds || 60 }} 秒</span
              >
              <i
                class="ri-arrow-down-s-line text-[14px] transition-transform"
                :class="[
                  { 'rotate-180': openSelectKey === 'webTimeout' },
                  isDark ? 'text-wt-dim' : 'text-lt-aux'
                ]"
              />
            </button>
            <div
              v-if="openSelectKey === 'webTimeout'"
              class="web-timeout-menu"
              :class="isDark ? 'web-timeout-menu--dark' : 'web-timeout-menu--light'"
            >
              <button
                v-for="seconds in webTimeoutOptions"
                :key="seconds"
                type="button"
                class="web-timeout-option"
                :class="[
                  isDark ? 'web-timeout-option--dark' : 'web-timeout-option--light',
                  webDraft.timeoutSeconds === seconds ? 'web-timeout-option--selected' : ''
                ]"
                @click="selectWebTimeout(seconds)"
              >
                <span>{{ seconds }} 秒</span
                ><i
                  v-if="webDraft.timeoutSeconds === seconds"
                  class="ri-check-line text-brand-400"
                />
              </button>
            </div>
          </div>
        </div>
        <div
          v-else
          class="py-8 text-center text-[11px]"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
        >
          请选择一个网页解析引擎。
        </div>
      </div>

      <div v-else class="space-y-4 media-settings-tab">
        <div
          class="media-overview"
          :class="isDark ? 'media-overview--dark' : 'media-overview--light'"
        >
          <div class="media-overview__icon"><i class="ri-movie-2-line" /></div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <div
                class="text-[12px] font-semibold"
                :class="isDark ? 'text-wt-main' : 'text-lt-main'"
              >
                音视频解析偏好
              </div>
              <span class="media-ready-pill">本地字幕闭环可用</span>
            </div>
            <div
              class="text-[10.5px] leading-relaxed mt-1"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
            >
              自动读取媒体信息并优先使用已有字幕；无字幕媒体会按下方配置调用语音转文字。付费云端转录、远程下载和关键帧任务仍遵循确认策略。
            </div>
          </div>
        </div>

        <div class="settings-selector-grid">
          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              上传后解析
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('mediaAction')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(mediaActionOptions, model.mediaAction).icon"
              /></span>
              <span class="compact-select__content"
                ><span class="compact-select__title">{{
                  selectedOption(mediaActionOptions, model.mediaAction).title
                }}</span
                ><span class="compact-select__desc">{{
                  selectedOption(mediaActionOptions, model.mediaAction).desc
                }}</span></span
              >
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaAction' }"
              />
            </button>
            <div v-if="openSelectKey === 'mediaAction'" :class="selectorMenuClasses()">
              <button
                v-for="option in mediaActionOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaAction === option.value)"
                @click="selectOption('mediaAction', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span
                ><span class="compact-select__content"
                  ><span class="compact-select__title">{{ option.title }}</span
                  ><span class="compact-select__desc">{{ option.desc }}</span></span
                ><i
                  v-if="model.mediaAction === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              默认解析场景
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('mediaPreset')"
            >
              <span class="compact-select__icon"
                ><i :class="selectedOption(mediaPresetOptions, model.mediaPreset).icon"
              /></span>
              <span class="compact-select__content"
                ><span class="compact-select__title">{{
                  selectedOption(mediaPresetOptions, model.mediaPreset).title
                }}</span
                ><span class="compact-select__desc">{{
                  selectedOption(mediaPresetOptions, model.mediaPreset).desc
                }}</span></span
              >
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaPreset' }"
              />
            </button>
            <div v-if="openSelectKey === 'mediaPreset'" :class="selectorMenuClasses()">
              <button
                v-for="option in mediaPresetOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaPreset === option.value)"
                @click="selectOption('mediaPreset', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span
                ><span class="compact-select__content"
                  ><span class="compact-select__title">{{ option.title }}</span
                  ><span class="compact-select__desc">{{ option.desc }}</span></span
                ><i
                  v-if="model.mediaPreset === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              字幕与转录语言
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('mediaLanguage')"
            >
              <span class="compact-select__icon"
                ><i
                  :class="selectedOption(mediaLanguageOptions, model.mediaPreferredLanguage).icon"
              /></span>
              <span class="compact-select__content"
                ><span class="compact-select__title">{{
                  selectedOption(mediaLanguageOptions, model.mediaPreferredLanguage).title
                }}</span
                ><span class="compact-select__desc">{{
                  selectedOption(mediaLanguageOptions, model.mediaPreferredLanguage).desc
                }}</span></span
              >
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaLanguage' }"
              />
            </button>
            <div v-if="openSelectKey === 'mediaLanguage'" :class="selectorMenuClasses()">
              <button
                v-for="option in mediaLanguageOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaPreferredLanguage === option.value)"
                @click="selectOption('mediaPreferredLanguage', option.value)"
              >
                <span class="compact-select__icon"><i :class="option.icon" /></span
                ><span class="compact-select__content"
                  ><span class="compact-select__title">{{ option.title }}</span
                  ><span class="compact-select__desc">{{ option.desc }}</span></span
                ><i
                  v-if="model.mediaPreferredLanguage === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>

          <div class="compact-select">
            <div class="compact-select__label" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              语音转文字服务
            </div>
            <button
              type="button"
              :class="selectorButtonClasses()"
              @click="toggleSelect('mediaProvider')"
            >
              <span class="compact-select__icon compact-select__provider-icon">
                <SvgIcon
                  v-if="selectedMediaProvider.svgIcon"
                  :icon-class="selectedMediaProvider.svgIcon"
                  :size="17"
                  :color="isDark ? '#f5f5f5' : '#1f2937'"
                />
                <i v-else :class="selectedMediaProvider.icon" />
              </span>
              <span class="compact-select__content"
                ><span class="compact-select__title">{{ selectedMediaProvider.title }}</span
                ><span class="compact-select__desc">{{ selectedMediaProvider.desc }}</span></span
              >
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaProvider' }"
              />
            </button>
            <div v-if="openSelectKey === 'mediaProvider'" :class="selectorMenuClasses()">
              <button
                v-for="option in speechProviderOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaProviderId === option.value)"
                @click="selectOption('mediaProviderId', option.value)"
              >
                <span class="compact-select__icon compact-select__provider-icon">
                  <SvgIcon
                    v-if="option.svgIcon"
                    :icon-class="option.svgIcon"
                    :size="17"
                    :color="isDark ? '#f5f5f5' : '#1f2937'"
                  />
                  <i v-else :class="option.icon" />
                </span>
                <span class="compact-select__content"
                  ><span class="compact-select__title">{{ option.title }}</span
                  ><span class="compact-select__desc">{{ option.desc }}</span></span
                ><i
                  v-if="model.mediaProviderId === option.value"
                  class="ri-check-line compact-select__check"
                />
              </button>
            </div>
          </div>
        </div>

        <div
          class="media-provider-status"
          :class="isDark ? 'media-provider-status--dark' : 'media-provider-status--light'"
        >
          <span class="media-provider-status__dot" :class="speechProviderReady ? 'is-ready' : ''" />
          <div class="min-w-0 flex-1">
            <strong :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{
              speechProviderReady
                ? `当前解析使用：${selectedMediaProvider?.title || '自动选择'}`
                : '尚未配置语音转文字服务'
            }}</strong>
            <small :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{
              speechProviderReady
                ? `${selectedMediaProvider?.desc || '无字幕媒体将按所选服务继续转录。'}${model.mediaProviderId === 'auto' ? ' 仅自动模式会使用默认服务商。' : ' 显式选择不会被默认服务商覆盖。'}`
                : '已有字幕媒体仍可正常解析；无字幕媒体会保持部分可用。'
            }}</small>
          </div>
          <button type="button" @click="emit('open-speech-settings')">
            <i class="ri-settings-4-line" />配置语音模型
          </button>
        </div>

        <div class="media-option-list">
          <label
            class="media-option-row"
            :class="isDark ? 'media-option-row--dark' : 'media-option-row--light'"
          >
            <span class="media-option-row__icon"><i class="ri-closed-captioning-line" /></span>
            <span class="media-option-row__copy"
              ><strong :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">始终优先使用已有字幕</strong
              ><small :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                >sidecar 字幕优先级最高，其次平台人工字幕、内嵌字幕和自动字幕。</small
              ></span
            >
            <button
              type="button"
              class="media-switch"
              :class="{ 'media-switch--on': model.mediaPreferSubtitle !== false }"
              @click.prevent="model.mediaPreferSubtitle = model.mediaPreferSubtitle === false"
            >
              <span />
            </button>
          </label>
          <label
            class="media-option-row"
            :class="isDark ? 'media-option-row--dark' : 'media-option-row--light'"
          >
            <span class="media-option-row__icon"><i class="ri-gallery-view-2" /></span>
            <span class="media-option-row__copy"
              ><strong :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">视频关键帧</strong
              ><small :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"
                >限量抽帧并关联附近字幕；不会自动执行 OCR 或视觉摘要。</small
              ></span
            >
            <div class="media-keyframe-control">
              <input
                v-model.number="model.mediaKeyframeLimit"
                type="number"
                min="4"
                max="60"
                :disabled="!model.mediaExtractKeyframes"
              />
              <span>帧</span>
              <button
                type="button"
                class="media-switch"
                :class="{ 'media-switch--on': model.mediaExtractKeyframes }"
                @click.prevent="model.mediaExtractKeyframes = !model.mediaExtractKeyframes"
              >
                <span />
              </button>
            </div>
          </label>
        </div>

        <section
          class="bilibili-cookie"
          :class="isDark ? 'bilibili-cookie--dark' : 'bilibili-cookie--light'"
        >
          <div class="bilibili-cookie__header">
            <span class="bilibili-cookie__icon"><i class="ri-bilibili-line" /></span>
            <div class="min-w-0 flex-1">
              <div class="bilibili-cookie__title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                B 站用户Cookie
              </div>
              <div class="bilibili-cookie__desc" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                可选。有效 Cookie 会用于获取账号有权限的高清字幕、音轨和视频关键帧；未配置、失效或请求失败时自动使用匿名解析，不会中断任务。
              </div>
            </div>
            <span
              class="bilibili-cookie__status"
              :class="bilibiliCookieReady ? 'is-valid' : bilibiliCookieStatus?.configured ? 'is-warning' : ''"
            >
              <i :class="bilibiliCookieReady ? 'ri-shield-check-line' : 'ri-shield-line'" />
              {{ bilibiliCookieStatusText }}
            </span>
          </div>

          <div class="bilibili-cookie__input-row">
            <div class="bilibili-cookie__input-wrap">
              <input
                v-model="bilibiliCookieInput"
                :type="bilibiliCookieVisible ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                :disabled="bilibiliCookieBusy"
                :placeholder="bilibiliCookieStatus?.configured ? '输入新 Cookie 以替换当前配置' : '粘贴完整 Cookie（需包含 SESSDATA）'"
                @keydown.enter.prevent="saveBilibiliCookie"
              />
              <button
                type="button"
                :title="bilibiliCookieVisible ? '隐藏 Cookie' : '显示 Cookie'"
                :aria-label="bilibiliCookieVisible ? '隐藏 Cookie' : '显示 Cookie'"
                @click="bilibiliCookieVisible = !bilibiliCookieVisible"
              >
                <i :class="bilibiliCookieVisible ? 'ri-eye-off-line' : 'ri-eye-line'" />
              </button>
            </div>
            <button
              type="button"
              class="bilibili-cookie__primary"
              :disabled="bilibiliCookieBusy || !bilibiliCookieInput.trim()"
              @click="saveBilibiliCookie"
            >
              <i :class="bilibiliCookieBusy ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'" />
              保存并验证
            </button>
          </div>
          <div
            class="bilibili-cookie__disclaimer"
            :class="isDark ? 'bilibili-cookie__disclaimer--dark' : 'bilibili-cookie__disclaimer--light'"
          >
            <i class="ri-information-line text-[20px]" />
            <span>
              <strong>使用须知：</strong>Cookie高频请求可能触发风控导致账号受限。
              本工具仅供个人学习与技术研究。
              使用者应自行遵守平台协议及版权法规，Reviva 不对账号异常、数据损失及侵权责任承担任何责任。
            </span>
          </div>

          <div
            v-if="bilibiliCookieFeedback"
            class="bilibili-cookie__feedback"
            :class="`is-${bilibiliCookieFeedbackTone}`"
          >
            {{ bilibiliCookieFeedback }}
          </div>
        </section>
      </div>
    </div>

    <template #footer="{ close }">
      <button
        @click="close()"
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'"
      >
        取消
      </button>
      <button
        @click="saveCurrent(close)"
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="
          isDark
            ? 'bg-brand-400 text-d0 hover:bg-brand-500'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        "
      >
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

.web-provider-select {
  position: relative;
}
.web-provider-trigger {
  width: 100%;
  min-height: 48px;
  padding: 9px 11px;
  border: 1px solid transparent;
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 160ms ease;
}
.web-provider-trigger--light {
  background: #fff;
  border-color: rgba(15, 23, 42, 0.1);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}
.web-provider-trigger--light:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.07);
}
.web-provider-trigger--dark {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.09);
}
.web-provider-trigger--dark:hover {
  border-color: rgba(129, 140, 248, 0.34);
  background: rgba(255, 255, 255, 0.055);
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.07);
}
.web-provider-logo {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.web-provider-raster {
  width: 25px;
  height: 25px;
  display: block;
  object-fit: contain;
}
.web-format-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.web-provider-menu {
  position: absolute;
  z-index: 45;
  left: 0;
  right: 0;
  top: calc(100% + 7px);
  padding: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18);
}
.web-provider-menu--light {
  background: #fff;
  border-color: rgba(15, 23, 42, 0.1);
}
.web-provider-menu--dark {
  background: #202026;
  border-color: rgba(255, 255, 255, 0.1);
}
.web-provider-option {
  width: 100%;
  min-height: 62px;
  padding: 8px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: background-color 150ms ease;
}
.web-provider-option + .web-provider-option {
  margin-top: 3px;
}
.web-provider-option--light:hover,
.web-provider-option--light.web-provider-option--selected {
  background: rgba(238, 242, 255, 0.9);
}
.web-provider-option--dark:hover,
.web-provider-option--dark.web-provider-option--selected {
  background: rgba(129, 140, 248, 0.1);
}
.web-settings-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 12px;
  padding: 13px;
  border: 1px solid transparent;
  border-radius: 12px;
}
.web-settings-panel--light {
  background: rgba(248, 250, 252, 0.8);
  border-color: rgba(15, 23, 42, 0.07);
}
.web-settings-panel--dark {
  background: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.07);
}
.web-field:nth-child(2),
.web-test-card {
  grid-column: 1 / -1;
}
.web-input-shell {
  min-height: 38px;
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  transition: all 160ms ease;
  overflow: hidden;
}
.web-input-shell--light {
  background: #fff;
  border-color: rgba(15, 23, 42, 0.1);
}
.web-input-shell--dark {
  background: rgba(0, 0, 0, 0.14);
  border-color: rgba(255, 255, 255, 0.09);
}
.web-input-shell:focus-within {
  border-color: rgba(99, 102, 241, 0.48);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.09);
}
.web-input-shell input,
.web-input-shell select {
  min-width: 0;
  flex: 1;
  height: 36px;
  padding: 0 5px;
  background: transparent;
  border: 0;
  outline: 0;
  color: inherit;
  font-size: 11.5px;
  appearance: none;
}
.web-input-icon {
  width: 34px;
  text-align: center;
  color: #818cf8;
  font-size: 14px;
}
.web-input-suffix {
  flex: 0 0 auto;
  padding: 0 10px 0 5px;
  font-size: 8.5px;
  font-weight: 650;
  opacity: 0.55;
}
.web-field-help {
  margin-top: 5px;
  font-size: 9.5px;
  line-height: 1.4;
}
.web-timeout-select {
  position: relative;
}
.web-timeout-trigger {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  transition: all 160ms ease;
}
.web-timeout-trigger--light {
  background: #fff;
  border-color: rgba(15, 23, 42, 0.1);
  color: #334155;
}
.web-timeout-trigger--dark {
  background: rgba(0, 0, 0, 0.14);
  border-color: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.82);
}
.web-timeout-trigger:hover,
.web-timeout-trigger:focus-visible {
  border-color: rgba(99, 102, 241, 0.42);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
  outline: none;
}
.web-timeout-menu {
  position: absolute;
  z-index: 48;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  padding: 5px;
  border: 1px solid transparent;
  border-radius: 10px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
}
.web-timeout-menu--light {
  background: #fff;
  border-color: rgba(15, 23, 42, 0.1);
}
.web-timeout-menu--dark {
  background: #202026;
  border-color: rgba(255, 255, 255, 0.1);
}
.web-timeout-option {
  width: 100%;
  min-height: 34px;
  padding: 0 9px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  transition: background-color 150ms ease;
}
.web-timeout-option--light {
  color: #475569;
}
.web-timeout-option--dark {
  color: rgba(255, 255, 255, 0.72);
}
.web-timeout-option--light:hover,
.web-timeout-option--light.web-timeout-option--selected {
  background: rgba(238, 242, 255, 0.95);
  color: #4338ca;
}
.web-timeout-option--dark:hover,
.web-timeout-option--dark.web-timeout-option--selected {
  background: rgba(129, 140, 248, 0.12);
  color: #a5b4fc;
}

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
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
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

.compact-select__provider-icon {
  background: rgba(var(--brand-rgb), 0.08);
  overflow: hidden;
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
  transition:
    background-color 160ms ease,
    opacity 160ms ease;
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

.media-overview {
  min-height: 68px;
  padding: 12px;
  border: 1px solid;
  border-radius: 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.media-overview--light {
  background: rgba(99, 102, 241, 0.045);
  border-color: rgba(99, 102, 241, 0.14);
}
.media-overview--dark {
  background: rgba(129, 140, 248, 0.06);
  border-color: rgba(129, 140, 248, 0.18);
}
.media-overview__icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex: none;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  font-size: 16px;
}
.media-ready-pill {
  height: 19px;
  padding: 0 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
  font-size: 9px;
  font-weight: 650;
}
.media-provider-status {
  min-height: 58px;
  padding: 10px 11px;
  border: 1px solid;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.media-provider-status--light {
  background: rgba(255, 255, 255, 0.78);
  border-color: rgba(18, 28, 45, 0.09);
}
.media-provider-status--dark {
  background: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.08);
}
.media-provider-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(128, 140, 160, 0.42);
  flex: none;
}
.media-provider-status__dot.is-ready {
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
}
.media-provider-status strong,
.media-provider-status small {
  display: block;
}
.media-provider-status strong {
  font-size: 10.8px;
  font-weight: 650;
}
.media-provider-status small {
  margin-top: 3px;
  font-size: 9.8px;
}
.media-provider-status > button {
  height: 29px;
  padding: 0 9px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  font-size: 10px;
  font-weight: 650;
  flex: none;
}
.media-option-list {
  display: grid;
  gap: 8px;
}
.media-option-row {
  min-height: 58px;
  padding: 9px 11px;
  border: 1px solid;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 9px;
}
.media-option-row--light {
  background: rgba(18, 28, 45, 0.018);
  border-color: rgba(18, 28, 45, 0.08);
}
.media-option-row--dark {
  background: rgba(255, 255, 255, 0.018);
  border-color: rgba(255, 255, 255, 0.07);
}
.media-option-row__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.09);
  flex: none;
}
.media-option-row__copy {
  min-width: 0;
  flex: 1;
}
.media-option-row__copy strong,
.media-option-row__copy small {
  display: block;
}
.media-option-row__copy strong {
  font-size: 10.8px;
  font-weight: 650;
}
.media-option-row__copy small {
  margin-top: 3px;
  font-size: 9.7px;
  line-height: 1.4;
}
.media-switch {
  width: 36px;
  height: 21px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(128, 140, 160, 0.28);
  transition: 150ms ease;
  flex: none;
}
.media-switch span {
  display: block;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: 150ms ease;
}
.media-switch--on {
  background: #10b981;
}
.media-switch--on span {
  transform: translateX(15px);
}
.media-keyframe-control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}
.media-keyframe-control input {
  width: 48px;
  height: 29px;
  padding: 0 6px;
  border: 1px solid rgba(128, 140, 160, 0.18);
  border-radius: 7px;
  background: rgba(128, 140, 160, 0.06);
  color: inherit;
  font-size: 10px;
  text-align: center;
  outline: none;
}
.media-keyframe-control input:disabled {
  opacity: 0.42;
}
.media-keyframe-control > span {
  font-size: 9.5px;
  opacity: 0.55;
}
.bilibili-cookie {
  padding: 11px;
  border: 1px solid;
  border-radius: 10px;
}
.bilibili-cookie--light {
  background: rgba(18, 28, 45, 0.018);
  border-color: rgba(18, 28, 45, 0.08);
}
.bilibili-cookie--dark {
  background: rgba(255, 255, 255, 0.018);
  border-color: rgba(255, 255, 255, 0.07);
}
.bilibili-cookie__header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.bilibili-cookie__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #ec4899;
  background: rgba(236, 72, 153, 0.1);
  font-size: 16px;
  flex: none;
}
.bilibili-cookie__title {
  font-size: 10.8px;
  font-weight: 650;
}
.bilibili-cookie__desc {
  margin-top: 3px;
  max-width: 620px;
  font-size: 9.7px;
  line-height: 1.5;
}
.bilibili-cookie__status {
  min-height: 24px;
  max-width: 180px;
  padding: 0 7px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
  background: rgba(100, 116, 139, 0.1);
  font-size: 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: none;
}
.bilibili-cookie__status.is-valid {
  color: #059669;
  background: rgba(16, 185, 129, 0.1);
}
.bilibili-cookie__status.is-warning {
  color: #d97706;
  background: rgba(245, 158, 11, 0.1);
}
.bilibili-cookie__input-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
}
.bilibili-cookie__input-wrap {
  height: 34px;
  border: 1px solid rgba(128, 140, 160, 0.18);
  border-radius: 8px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: rgba(128, 140, 160, 0.055);
}
.bilibili-cookie__input-wrap:focus-within {
  border-color: rgba(99, 102, 241, 0.48);
}
.bilibili-cookie__input-wrap input {
  min-width: 0;
  height: 100%;
  padding: 0 9px;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 10px;
  flex: 1;
}
.bilibili-cookie__input-wrap input:disabled {
  opacity: 0.5;
}
.bilibili-cookie__input-wrap > button {
  width: 34px;
  height: 32px;
  display: grid;
  place-items: center;
  opacity: 0.62;
  flex: none;
}
.bilibili-cookie__input-wrap > button:hover {
  opacity: 1;
  background: rgba(128, 140, 160, 0.1);
}
.bilibili-cookie__primary {
  min-width: 98px;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #fff;
  background: #6366f1;
  font-size: 9.8px;
  font-weight: 650;
}
.bilibili-cookie__primary:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.bilibili-cookie__feedback {
  margin-top: 7px;
  font-size: 9.5px;
}
.bilibili-cookie__feedback.is-success {
  color: #059669;
}
.bilibili-cookie__feedback.is-error {
  color: #ef4444;
}
.bilibili-cookie__feedback.is-neutral {
  color: #64748b;
}

.bilibili-cookie__disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.bilibili-cookie__disclaimer i {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 14px;
}

/* 亮色主题：浅橙/浅黄底，传递“注意”但不“危险” */
.bilibili-cookie__disclaimer--light {
  background-color: rgba(255, 170, 0, 0.08);
  color: #8a6d3b;
}

/* 暗色主题：低饱和度暖色底 */
.bilibili-cookie__disclaimer--dark {
  background-color: rgba(255, 170, 0, 0.06);
  color: #c9a96e;
}
@media (max-width: 720px) {
  .settings-selector-grid {
    grid-template-columns: 1fr;
  }

  .compact-select--wide {
    grid-column: auto;
  }

  .media-provider-status {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .media-provider-status > button {
    margin-left: 17px;
  }
  .media-option-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .media-option-row__copy {
    min-width: calc(100% - 44px);
  }
  .media-keyframe-control {
    margin-left: 39px;
  }
  .bilibili-cookie__header {
    flex-wrap: wrap;
  }
  .bilibili-cookie__status {
    margin-left: 39px;
    max-width: calc(100% - 39px);
  }
  .bilibili-cookie__input-row {
    grid-template-columns: 1fr;
  }
  .bilibili-cookie__primary {
    width: 100%;
  }
}
</style>
