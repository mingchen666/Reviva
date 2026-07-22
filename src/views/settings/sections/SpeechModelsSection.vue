<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  ALIYUN_ASR_MODELS,
  createDefaultSpeechSettings,
  normalizeSpeechSettings,
  SPEECH_PROVIDER_DEFINITIONS,
  speechProviderReady,
  useMediaStore,
} from '@/stores/media'
import { useMessage } from '@/components/MsMessage/useMessage'
import { checkSpeechProvider } from '@/apis/media'
import { formatAliyunAsrLimit, getAliyunAsrModelCapability } from '@/constants/aliyunAsrModels'
import SpeechOptionSelect from './SpeechOptionSelect.vue'

const appStore = useAppStore()
const mediaStore = useMediaStore()
const msg = useMessage()

const isDark = computed(() => appStore.isDark)
const activeCapability = ref('stt')
const selectedProviderId = ref('local_asr')
const draft = ref(createDefaultSpeechSettings())
const loading = ref(false)
const refreshing = ref(false)
const saving = ref(false)
const dirty = ref(false)
const hydrated = ref(false)
const showSecrets = ref({})
const checkingProviderId = ref('')
const checkResults = ref({})
const REFRESH_ROTATION_MS = 600

const selectedDefinition = computed(() => SPEECH_PROVIDER_DEFINITIONS.find(item => item.id === selectedProviderId.value) || SPEECH_PROVIDER_DEFINITIONS[0])
const selectedForm = computed(() => draft.value.providers[selectedProviderId.value])
const configuredCount = computed(() => SPEECH_PROVIDER_DEFINITIONS.filter(item => speechProviderReady(item.id, draft.value)).length)
const defaultProvider = computed(() => SPEECH_PROVIDER_DEFINITIONS.find(item => item.id === draft.value.defaultProviderId) || SPEECH_PROVIDER_DEFINITIONS[0])

const providerIcons = Object.freeze({
  local_asr: 'local-asr',
  openai_whisper_compatible: 'openai',
  aliyun_bailian_asr: 'bailian',
})

const languageOptions = [
  { value: 'auto', label: '自动识别', description: '由服务商判断音频中的主要语言' },
  { value: 'zh', label: '中文', description: '优先按中文语音进行识别' },
  { value: 'en', label: '英文', description: '优先按英文语音进行识别' },
  { value: 'ja', label: '日文', description: '优先按日文语音进行识别' },
]

const timestampOptions = [
  { value: 'none', label: '不支持', description: '只返回整段转录文本' },
  { value: 'segment', label: '句段级', description: '返回句段开始与结束时间' },
  { value: 'word', label: '词级', description: '返回更细粒度的词语时间戳' },
]

const regionOptions = [
  { value: 'cn-beijing', label: '中国大陆（北京）', description: '适用于中国大陆百炼工作空间' },
  { value: 'ap-southeast-1', label: '国际（新加坡）', description: '适用于国际站百炼工作空间' },
]

const ALIYUN_CUSTOM_MODEL_VALUE = '__custom__'
const aliyunPresetModelIds = new Set(ALIYUN_ASR_MODELS.map(model => model.id))
const customAliyunModelId = ref('')
const aliyunModelOptions = [
  ...ALIYUN_ASR_MODELS.map(model => ({
    value: model.id,
    label: model.name,
    description: `${model.description} · ${formatAliyunAsrLimit(model)}`,
    badge: model.recommended ? '推荐' : '',
  })),
  {
    value: ALIYUN_CUSTOM_MODEL_VALUE,
    label: '自定义模型 ID',
    description: '填写百炼新增模型或工作空间内可用的模型 ID',
    badge: '未验证',
  },
]
const aliyunModelSelection = computed({
  get() {
    const model = String(draft.value.providers.aliyun_bailian_asr?.model || '').trim()
    return aliyunPresetModelIds.has(model) ? model : ALIYUN_CUSTOM_MODEL_VALUE
  },
  set(value) {
    const form = draft.value.providers.aliyun_bailian_asr
    const currentModel = String(form.model || '').trim()
    if (value === ALIYUN_CUSTOM_MODEL_VALUE) {
      form.model = customAliyunModelId.value || ''
      return
    }
    if (currentModel && !aliyunPresetModelIds.has(currentModel)) customAliyunModelId.value = currentModel
    form.model = value
  },
})
const selectedAliyunCapability = computed(() => getAliyunAsrModelCapability(selectedForm.value?.model))
const aliyunDiarizationUnsupported = computed(() => selectedAliyunCapability.value?.supportsDiarization === false)
const customAliyunModelHint = computed(() => selectedAliyunCapability.value
  ? `已识别为 ${selectedAliyunCapability.value.name}：${formatAliyunAsrLimit(selectedAliyunCapability.value)}。`
  : '自定义模型按百炼异步录音文件识别接口调用；若模型使用其他协议，将直接显示百炼返回的错误。')
const aliyunProviderNote = computed(() => {
  const capability = selectedAliyunCapability.value
  if (!capability) return '自定义模型默认按百炼异步录音文件识别接口调用，需要公网可访问的文件直链；模型能力由服务商实际响应决定。'
  const inputText = capability.inputModes.includes('local_file')
    ? '支持公网 URL 或本地文件输入'
    : '仅支持公网可访问的音视频文件直链'
  const diarizationText = capability.supportsDiarization
    ? '；启用说话人分离时建议音频不超过 2 小时'
    : '；不支持说话人分离'
  return `${capability.name}：${inputText}，${formatAliyunAsrLimit(capability)}${diarizationText}。系统不会静默切片或替换模型。`
})

onMounted(loadSettings)

watch(draft, () => {
  if (hydrated.value) {
    dirty.value = true
    checkResults.value = { ...checkResults.value, [selectedProviderId.value]: null }
  }
}, { deep: true, flush: 'sync' })

watch(() => draft.value.providers.aliyun_bailian_asr?.model, (value) => {
  const model = String(value || '').trim()
  if (model && !aliyunPresetModelIds.has(model)) customAliyunModelId.value = model
  if (getAliyunAsrModelCapability(model)?.supportsDiarization === false) {
    draft.value.providers.aliyun_bailian_asr.enableDiarization = false
  }
})

function toggleAliyunDiarization() {
  if (aliyunDiarizationUnsupported.value) return
  selectedForm.value.enableDiarization = !selectedForm.value.enableDiarization
}

async function loadSettings() {
  if (loading.value) return
  loading.value = true
  hydrated.value = false
  try {
    const settings = await mediaStore.loadSpeechSettings({ force: true })
    draft.value = normalizeSpeechSettings(settings)
    const aliyunModel = String(draft.value.providers.aliyun_bailian_asr?.model || '').trim()
    customAliyunModelId.value = aliyunPresetModelIds.has(aliyunModel) ? '' : aliyunModel
    selectedProviderId.value = draft.value.defaultProviderId || 'local_asr'
    dirty.value = false
  } catch (error) {
    msg.error(error?.message || '加载语音模型配置失败')
  } finally {
    hydrated.value = true
    loading.value = false
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function waitForRefreshFrame(ms) {
  return new Promise(resolve => window.setTimeout(resolve, Math.max(0, ms)))
}

async function refreshSettings() {
  if (loading.value || refreshing.value) return
  refreshing.value = true
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    await loadSettings()
  } finally {
    if (!prefersReducedMotion()) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const elapsed = Math.max(0, now - startedAt)
      const remainder = elapsed % REFRESH_ROTATION_MS
      const remaining = elapsed < REFRESH_ROTATION_MS
        ? REFRESH_ROTATION_MS - elapsed
        : remainder < 12 ? 0 : REFRESH_ROTATION_MS - remainder
      if (remaining > 0) await waitForRefreshFrame(remaining)
    }
    refreshing.value = false
  }
}

function providerReady(id) {
  return speechProviderReady(id, draft.value)
}

function providerStatus(id) {
  const form = draft.value.providers[id]
  if (!form?.enabled) return '未启用'
  return providerReady(id) ? '可用' : '待完善'
}

function selectProvider(id) {
  selectedProviderId.value = id
}

function providerIcon(id) {
  return providerIcons[id] || 'local-asr'
}

function toggleProvider() {
  const form = selectedForm.value
  form.enabled = !form.enabled
  if (form.enabled && !draft.value.providers[draft.value.defaultProviderId]?.enabled) {
    draft.value.defaultProviderId = selectedProviderId.value
  }
}

function setDefaultProvider(id = selectedProviderId.value) {
  draft.value.defaultProviderId = id
  draft.value.providers[id].enabled = true
}

function validate() {
  const enabledProviderIds = SPEECH_PROVIDER_DEFINITIONS
    .filter(provider => draft.value.providers[provider.id]?.enabled)
    .map(provider => provider.id)
  if (enabledProviderIds.length && !enabledProviderIds.includes(draft.value.defaultProviderId)) {
    draft.value.defaultProviderId = enabledProviderIds[0]
  }
  for (const provider of SPEECH_PROVIDER_DEFINITIONS) {
    const form = draft.value.providers[provider.id]
    if (!form.enabled) continue
    if (provider.id === 'local_asr' && (!form.baseUrl?.trim() || !form.model?.trim())) {
      throw new Error('本地 ASR 需要填写 Base URL 和模型 ID。')
    }
    if (provider.id === 'openai_whisper_compatible' && (!form.baseUrl?.trim() || !form.model?.trim())) {
      throw new Error('Whisper Compatible 需要填写 Base URL 和模型名称。')
    }
    if (provider.id === 'aliyun_bailian_asr' && (!form.apiKey?.trim() || !form.workspaceId?.trim() || !form.model?.trim())) {
      throw new Error('阿里云百炼需要填写 API Key、Workspace ID 和模型 ID。')
    }
  }
}

async function saveSettings() {
  if (saving.value) return
  try {
    validate()
    saving.value = true
    const result = await mediaStore.saveSpeechSettings(draft.value)
    if (!result.success) throw new Error(result.error)
    draft.value = normalizeSpeechSettings(result.data)
    selectedProviderId.value = draft.value.defaultProviderId || selectedProviderId.value
    dirty.value = false
    msg.success('语音模型配置已保存')
  } catch (error) {
    msg.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function toggleSecret(id) {
  showSecrets.value = { ...showSecrets.value, [id]: !showSecrets.value[id] }
}

async function checkSelectedProvider() {
  const providerId = selectedProviderId.value
  if (checkingProviderId.value) return
  checkingProviderId.value = providerId
  checkResults.value = { ...checkResults.value, [providerId]: null }
  try {
    const result = await checkSpeechProvider(providerId, { ...selectedForm.value })
    if (!result?.success) throw new Error(result?.message || '配置检查失败')
    checkResults.value = { ...checkResults.value, [providerId]: { success: true, message: result.message || '配置可用' } }
    msg.success(result.message || '配置检查通过')
  } catch (error) {
    const message = error?.message || '配置检查失败'
    checkResults.value = { ...checkResults.value, [providerId]: { success: false, message } }
    msg.error(message)
  } finally {
    checkingProviderId.value = ''
  }
}
</script>

<template>
  <div class="speech-page max-w-6xl mx-auto px-4 lg:px-5 py-4 space-y-3">
    <section
      class="speech-intro"
      :class="isDark ? 'speech-intro--dark' : 'speech-intro--light'">
      <div class="speech-intro__icon">
        <i class="ri-mic-ai-line" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 :class="isDark ? 'text-wt-main' : 'text-lt-main'">语音模型配置</h2>
          <span class="speech-count">{{ configuredCount }} 个语音识别服务可用</span>
        </div>
        <p :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          统一管理语音相关模型与服务商。当前支持为音视频解析配置语音转文字服务，文本转语音即将支持。
        </p>
      </div>
      <button class="ghost-button refresh-button" :class="isDark ? 'ghost-button--dark' : 'ghost-button--light'" :disabled="loading || refreshing" :aria-busy="refreshing" aria-label="重新加载配置" title="重新加载配置" @click="refreshSettings">
        <i class="ri-refresh-line refresh-icon" :class="{ 'refresh-icon--spinning': refreshing }" />
      </button>
    </section>

    <div class="capability-tabs " :class="isDark ? 'capability-tabs--dark' : 'capability-tabs--light'">
      <button :class="{ active: activeCapability === 'stt' }" @click="activeCapability = 'stt'">
        <i class="ri-speech-to-text-line text-[16px]" />
        <span class="text-[15px]">语音转文本</span>
        <span class="available-badge">可配置</span>
      </button>
      <button :class="{ active: activeCapability === 'tts' }" @click="activeCapability = 'tts'">
       <i class="ri-text-to-speech-line text-[16px]"></i>
        <span class="text-[15px]">文本转语音</span>
        <span class="future-badge">即将支持</span>
      </button>
    </div>

    <template v-if="activeCapability === 'stt'">
      <div class="speech-layout">
        <aside class="provider-rail" :class="isDark ? 'panel-dark' : 'panel-light'">
          <div class="rail-heading">
            <div>
              <span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">语音识别服务商</span>
              <small :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">可同时配置多个；单次只使用媒体解析中明确选择的服务，选择“自动”时才使用默认项</small>
            </div>
          </div>

          <button
            v-for="provider in SPEECH_PROVIDER_DEFINITIONS"
            :key="provider.id"
            class="provider-card"
            :class="[
              selectedProviderId === provider.id ? 'provider-card--active' : '',
              isDark ? 'provider-card--dark' : 'provider-card--light',
            ]"
            @click="selectProvider(provider.id)">
            <span class="provider-card__icon">
              <SvgIcon :icon-class="providerIcon(provider.id)" :size="22" />
            </span>
            <span class="provider-card__copy">
              <span class="provider-card__name">
                {{ provider.name }}
                <i v-if="draft.defaultProviderId === provider.id" class="ri-star-fill default-star" title="默认服务商" />
              </span>
            </span>
            <span
              class="provider-state"
              :class="providerReady(provider.id) ? 'provider-state--ready' : draft.providers[provider.id].enabled ? 'provider-state--warn' : ''">
              {{ providerStatus(provider.id) }}
            </span>
          </button>
        </aside>

        <section class="config-panel" :class="isDark ? 'panel-dark' : 'panel-light'">
          <header class="config-header">
            <div class="config-provider-icon">
              <SvgIcon :icon-class="providerIcon(selectedProviderId)" :size="25" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selectedDefinition.name }}</h3>
                <span v-if="draft.defaultProviderId === selectedProviderId" class="default-pill">默认</span>
              </div>
              <p :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ selectedDefinition.description }}</p>
            </div>
            <button
              type="button"
              class="switch-control"
              role="switch"
              :aria-checked="selectedForm.enabled"
              :aria-label="`${selectedDefinition.name}${selectedForm.enabled ? '已启用' : '未启用'}`"
              :class="{ on: selectedForm.enabled }"
              @click="toggleProvider">
              <span />
            </button>
          </header>

          <div class="config-body" :class="{ 'config-body--disabled': !selectedForm.enabled, 'config-body--aliyun': selectedProviderId === 'aliyun_bailian_asr' }">
            <template v-if="selectedProviderId === 'local_asr'">
              <label class="field-block">
                <span>Base URL</span>
                <div class="input-with-icon"><i class="ri-links-line" /><input v-model="selectedForm.baseUrl" placeholder="http://127.0.0.1:8000/v1" /></div>
                <small>连接用户自行启动的本地或局域网服务，请求固定发送到 /audio/transcriptions。</small>
              </label>
              <div class="field-grid two-col">
                <label class="field-block"><span>模型 ID</span><input v-model="selectedForm.model" placeholder="whisper-1 / 服务端自定义模型 ID" /><small>模型安装、路径和参数量由 HTTP 服务管理。</small></label>
                <label class="field-block"><span>API Key <em>可选</em></span><div class="secret-input"><input v-model="selectedForm.apiKey" :type="showSecrets.local_asr ? 'text' : 'password'" placeholder="本地服务不鉴权时留空" /><button @click="toggleSecret('local_asr')"><i :class="showSecrets.local_asr ? 'ri-eye-off-line' : 'ri-eye-line'" /></button></div></label>
              </div>
              <div class="field-block"><span>时间戳能力</span><SpeechOptionSelect v-model="selectedForm.timestampLevel" :options="timestampOptions" :is-dark="isDark" aria-label="选择本地 ASR 时间戳能力" compact /></div>
              <div class="provider-note"><i class="ri-information-line" /><span>Reviva 只调用兼容接口，不会安装 Python、启动服务、下载模型或管理 CUDA 配置。</span></div>
            </template>

            <template v-else-if="selectedProviderId === 'openai_whisper_compatible'">
              <label class="field-block"><span>Base URL</span><div class="input-with-icon"><i class="ri-links-line" /><input v-model="selectedForm.baseUrl" placeholder="https://api.example.com/v1" /></div><small>请求固定发送到 /audio/transcriptions。</small></label>
              <div class="field-grid two-col">
                <label class="field-block"><span>模型名称</span><input v-model="selectedForm.model" placeholder="whisper-1" /></label>
                <label class="field-block"><span>API Key</span><div class="secret-input"><input v-model="selectedForm.apiKey" :type="showSecrets.openai_whisper_compatible ? 'text' : 'password'" placeholder="输入服务商 API Key" /><button @click="toggleSecret('openai_whisper_compatible')"><i :class="showSecrets.openai_whisper_compatible ? 'ri-eye-off-line' : 'ri-eye-line'" /></button></div></label>
              </div>
              <div class="field-block"><span>时间戳能力</span><SpeechOptionSelect v-model="selectedForm.timestampLevel" :options="timestampOptions" :is-dark="isDark" aria-label="选择兼容接口时间戳能力" compact /></div>
              <div class="provider-note provider-note--brand"><i class="ri-upload-cloud-2-line" /><span>本地音频或视频会按原文件直接上传到兼容接口，不会预先转换成无损 FLAC；服务端需要支持对应文件格式。</span></div>
            </template>

            <template v-else>
              <div class="field-grid two-col">
                <div class="field-block"><span>地域</span><SpeechOptionSelect v-model="selectedForm.region" :options="regionOptions" :is-dark="isDark" aria-label="选择百炼地域" /><small>API Key、Workspace 与地域需要保持一致。</small></div>
                <label class="field-block"><span>Workspace ID</span><input v-model="selectedForm.workspaceId" placeholder="输入百炼 Workspace ID" /></label>
              </div>
              <div class="field-grid two-col">
                <label class="field-block"><span>API Key</span><div class="secret-input"><input v-model="selectedForm.apiKey" :type="showSecrets.aliyun_bailian_asr ? 'text' : 'password'" placeholder="输入百炼 API Key" /><button @click="toggleSecret('aliyun_bailian_asr')"><i :class="showSecrets.aliyun_bailian_asr ? 'ri-eye-off-line' : 'ri-eye-line'" /></button></div></label>
                <div class="field-block">
                  <span>转录模型</span>
                  <SpeechOptionSelect v-model="aliyunModelSelection" :options="aliyunModelOptions" :is-dark="isDark" aria-label="选择百炼转录模型" placeholder="选择百炼转录模型" />
                  <small>平台维护常用模型，也支持自定义模型 ID。</small>
                </div>
              </div>
              <label v-if="aliyunModelSelection === ALIYUN_CUSTOM_MODEL_VALUE" class="field-block custom-model-field">
                <span>自定义模型 ID <em>未验证</em></span>
                <input v-model.trim="selectedForm.model" placeholder="例如：百炼控制台显示的模型 ID" />
                <small>{{ customAliyunModelHint }}</small>
              </label>
              <div class="field-grid two-col">
                <div class="field-block"><span>默认语言</span><SpeechOptionSelect v-model="selectedForm.language" :options="languageOptions" :is-dark="isDark" aria-label="选择百炼默认语言" /></div>
                <div class="field-block aliyun-capability-field">
                  <span>转录选项</span>
                  <div class="option-toggle-group">
                    <button type="button" class="check-control" role="checkbox" :aria-checked="selectedForm.enableTimestamps" :class="{ checked: selectedForm.enableTimestamps }" @click="selectedForm.enableTimestamps = !selectedForm.enableTimestamps">
                      <span class="check-control__box"><i class="ri-check-line" /></span>
                      <span><strong>时间戳</strong><small>句段定位</small></span>
                    </button>
                    <button type="button" class="check-control" role="checkbox" :aria-checked="selectedForm.enableDiarization" :aria-disabled="aliyunDiarizationUnsupported" :disabled="aliyunDiarizationUnsupported" :class="{ checked: selectedForm.enableDiarization, disabled: aliyunDiarizationUnsupported }" @click="toggleAliyunDiarization">
                      <span class="check-control__box"><i class="ri-check-line" /></span>
                      <span><strong>说话人分离</strong><small>{{ aliyunDiarizationUnsupported ? '当前模型不支持' : '区分发言角色' }}</small></span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="provider-note"><i class="ri-information-line" /><span>{{ aliyunProviderNote }}</span></div>
            </template>
          </div>

          <footer class="config-footer">
            <div class="config-footer__status">
              <strong :class="providerReady(selectedProviderId) ? 'text-emerald-500' : isDark ? 'text-wt-dim' : 'text-lt-aux'">
                {{ providerReady(selectedProviderId) ? '配置完整，可以用于转录' : selectedForm.enabled ? '已启用，但配置尚未完整' : '当前服务商未启用' }}
              </strong>
              <small v-if="defaultProvider.id !== selectedProviderId" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前默认：{{ defaultProvider.name }}</small>
              <small v-if="checkResults[selectedProviderId]" :class="checkResults[selectedProviderId].success ? 'check-result--success' : 'check-result--error'">{{ checkResults[selectedProviderId].message }}</small>
            </div>
            <div class="config-footer__actions">
              <button v-if="draft.defaultProviderId !== selectedProviderId" class="secondary-button" :class="isDark ? 'secondary-button--dark' : 'secondary-button--light'" @click="setDefaultProvider()"><i class="ri-star-line" />设为默认</button>
              <button class="secondary-button" :class="isDark ? 'secondary-button--dark' : 'secondary-button--light'" :disabled="Boolean(checkingProviderId)" @click="checkSelectedProvider"><i :class="checkingProviderId === selectedProviderId ? 'ri-loader-4-line animate-spin' : 'ri-pulse-line'" />{{ checkingProviderId === selectedProviderId ? '检查中' : '检查配置' }}</button>
              <button class="primary-button" :disabled="saving || !dirty" @click="saveSettings"><i :class="saving ? 'ri-loader-4-line animate-spin' : 'ri-save-3-line'" />{{ saving ? '保存中' : '保存配置' }}</button>
            </div>
          </footer>
        </section>
      </div>
    </template>

    <section v-else class="tts-future" :class="isDark ? 'panel-dark' : 'panel-light'">
      <div class="tts-future__mark"><i class="ri-volume-up-line" /></div>
      <span class="future-label">即将支持</span>
      <h3 :class="isDark ? 'text-wt-main' : 'text-lt-main'">文本转语音配置将在后续版本开放</h3>
    </section>
  </div>
</template>

<style scoped>
.speech-page { --speech-control-height: 38px; --speech-control-font-size: .8125rem; --speech-field-label-height: 16px; width: 100%; padding: clamp(12px, 2vw, 24px); overflow-x: clip; }
.speech-intro { padding: 10px 12px; border: 1px solid; border-radius: 12px; display: flex; align-items: center; gap: 10px; }
.speech-intro--dark { background: rgba(var(--brand-rgb),.065); border-color: rgba(var(--brand-rgb),.22); }
.speech-intro--light { background: rgba(var(--brand-rgb),.055); border-color: rgba(var(--brand-rgb),.18); }
.speech-intro__icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: var(--brand); background: rgba(var(--brand-rgb),.12); font-size: 16px; flex: none; }
.speech-intro h2 { margin: 0; font-size: 14px; font-weight: 700; }
.speech-intro p { margin: 3px 0 0; font-size: 10.8px; line-height: 1.5; }
.speech-count, .available-badge, .future-badge, .default-pill, .future-label { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 10px; font-weight: 650; }
.speech-count, .available-badge { color: #10B981; background: rgba(16,185,129,.1); }
.default-pill { color: var(--brand); background: rgba(var(--brand-rgb),.1); }
.future-badge, .future-label { color: #D97706; background: rgba(245,158,11,.1); }
.ghost-button, .secondary-button, .primary-button { height: 34px; padding: 0 12px; border-radius: 9px; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; transition: 150ms ease; }
.ghost-button--dark, .secondary-button--dark { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.72); }
.ghost-button--light, .secondary-button--light { background: #fff; border: 1px solid rgba(18,28,45,.1); color: #475569; }
.ghost-button:hover, .secondary-button:hover { color: var(--brand); border-color: rgba(var(--brand-rgb),.34); background: rgba(var(--brand-rgb),.07); }
.ghost-button:focus-visible, .secondary-button:focus-visible, .primary-button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.14); }
.refresh-button { width: 32px; height: 32px; min-height: 32px; padding: 0; justify-content: center; flex: none; }
.refresh-button i { font-size: 16px; }
.refresh-icon { transform: rotate(0deg); transform-origin: center; }
.refresh-icon--spinning { animation: speech-refresh-spin 600ms linear infinite; will-change: transform; }
@keyframes speech-refresh-spin { to { transform: rotate(360deg); } }
.capability-tabs { border: 1px solid; border-radius: 12px; padding: 3px; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
.capability-tabs--dark { background: rgba(255,255,255,.025); border-color: rgba(255,255,255,.08); }
.capability-tabs--light { background: rgba(18,28,45,.025); border-color: rgba(18,28,45,.08); }
.capability-tabs button { min-height: 38px; border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: inherit; opacity: .62; }
.capability-tabs button.active { background: var(--brand); color: #fff; opacity: 1; box-shadow: 0 3px 12px rgba(var(--brand-rgb),.18); }
.capability-tabs button.active .available-badge, .capability-tabs button.active .future-badge { color: inherit; background: rgba(255,255,255,.16); }
.speech-layout { display: grid; grid-template-columns: minmax(248px, 276px) minmax(0,1fr); gap: 14px; align-items: stretch; }
.panel-dark, .panel-light { border: 1px solid; border-radius: 12px; }
.panel-dark { background: rgba(255,255,255,.025); border-color: rgba(255,255,255,.08); color: rgba(255,255,255,.76); }
.panel-light { background: rgba(255,255,255,.72); border-color: rgba(18,28,45,.085); color: #334155; }
.provider-rail { padding: 12px; }
.rail-heading { padding: 3px 3px 11px; }
.rail-heading span { display: block; font-size: 12px; font-weight: 700; }
.rail-heading small { display: block; margin-top: 4px; font-size: 10px; line-height: 1.5; }
.provider-card { width: 100%; min-height: 56px; padding: 8px 9px; border: 1px solid transparent; border-radius: 10px; display: flex; align-items: center; gap: 9px; text-align: left; transition: 150ms ease; position: relative; }
.provider-card + .provider-card { margin-top: 6px; }
.provider-card--dark:hover { background: rgba(255,255,255,.035); }
.provider-card--light:hover { background: rgba(18,28,45,.03); }
.provider-card--active { border-color: rgba(var(--brand-rgb),.34); background: rgba(var(--brand-rgb),.08) !important; box-shadow: inset 3px 0 0 var(--brand); }
.provider-card:focus-visible { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.12); }
.provider-card__icon, .config-provider-icon { width: 38px; height: 38px; border: 1px solid rgba(128,140,160,.13); border-radius: 10px; display: grid; place-items: center; background: rgba(128,140,160,.055); flex: none; overflow: hidden; }
.config-provider-icon { width: 42px; height: 42px; border-radius: 12px; }
.provider-card__copy { min-width: 0; flex: 1; padding-right: 46px; }
.provider-card__name { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; }
.default-star { color: #F59E0B; font-size: 11px; }
.provider-state { position: absolute; top: 50%; right: 9px; transform: translateY(-50%); font-size: 9px; opacity: .55; }
.provider-state--ready { color: #10B981; opacity: 1; }
.provider-state--warn { color: #F59E0B; opacity: 1; }
.config-panel { overflow: visible; position: relative; }
.config-header { min-height: 72px; padding: 14px 16px; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid rgba(128,140,160,.12); }
.config-header h3 { margin: 0; font-size: 14px; font-weight: 700; }
.config-header p { margin: 4px 0 0; font-size: 10.5px; line-height: 1.5; }
.switch-control { width: 42px; height: 24px; border-radius: 999px; padding: 3px; background: rgba(128,140,160,.28); transition: background-color 160ms ease, box-shadow 160ms ease; flex: none; }
.switch-control span { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 5px rgba(0,0,0,.22); transition: transform 160ms ease; }
.switch-control:hover { background: rgba(128,140,160,.38); }
.switch-control.on { background: var(--brand); }
.switch-control.on:hover { background: var(--brand-hover); }
.switch-control.on span { transform: translateX(18px); }
.switch-control:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.14); }
.config-body { padding: 16px; display: grid; gap: 14px; }
.config-body--aliyun { padding: 14px 16px; gap: 10px; }
.config-body--aliyun .field-grid { gap: 10px; }
.config-body--aliyun .provider-note { padding: 8px 10px; }
.config-body--disabled { opacity: .48; pointer-events: none; }
.field-grid { display: grid; gap: 12px; align-items: start; }
.field-grid.two-col { grid-template-columns: repeat(2,minmax(0,1fr)); }
.field-block { display: grid; gap: 6px; }
.field-grid.two-col > .field-block { grid-template-rows: var(--speech-field-label-height) var(--speech-control-height) auto; align-content: start; }
.field-grid.two-col > .aliyun-capability-field { grid-template-rows: var(--speech-field-label-height) auto; }
.field-block > span { min-height: var(--speech-field-label-height); font-size: 10.5px; font-weight: 650; line-height: var(--speech-field-label-height); }
.field-block em { font-style: normal; font-weight: 400; opacity: .55; }
.field-block small { font-size: 9.6px; line-height: 1.45; opacity: .58; }
.field-block input { width: 100%; height: var(--speech-control-height); min-height: var(--speech-control-height); padding: 0 11px; border-radius: 8px; border: 1px solid rgba(128,140,160,.2); background: rgba(128,140,160,.045); color: inherit; font-size: var(--speech-control-font-size); outline: none; transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease; }
.field-block input:hover { border-color: rgba(var(--brand-rgb),.34); }
.field-block input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.11); background: rgba(var(--brand-rgb),.025); }
.field-block input::placeholder { color: rgba(128,140,160,.72); }
.custom-model-field { padding: 11px 12px; border: 1px solid rgba(var(--brand-rgb),.2); border-radius: 10px; background: rgba(var(--brand-rgb),.045); }
.custom-model-field > span em { margin-left: 5px; padding: 2px 6px; border-radius: 5px; color: #D97706; background: rgba(245,158,11,.11); opacity: 1; font-size: 8.5px; font-weight: 650; }
.input-with-icon { position: relative; }
.input-with-icon i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); opacity: .5; }
.input-with-icon input { padding-left: 32px; }
.secret-input { display: flex; height: var(--speech-control-height); min-height: var(--speech-control-height); border: 1px solid rgba(128,140,160,.2); background: rgba(128,140,160,.045); border-radius: 8px; overflow: hidden; transition: border-color 160ms ease, box-shadow 160ms ease; }
.secret-input:hover { border-color: rgba(var(--brand-rgb),.34); }
.secret-input:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.11); }
.secret-input input { height: 100%; flex: 1; min-width: 0; border: 0; background: transparent; box-shadow: none; }
.secret-input button { width: 40px; opacity: .55; transition: color 150ms ease, background-color 150ms ease, opacity 150ms ease; }
.secret-input button:hover { color: var(--brand); background: rgba(var(--brand-rgb),.08); opacity: 1; }
.secret-input button:focus-visible { outline: none; color: var(--brand); background: rgba(var(--brand-rgb),.08); }
.option-toggle-group { height: var(--speech-control-height); min-height: var(--speech-control-height); display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
.check-control { min-width: 0; height: var(--speech-control-height); min-height: var(--speech-control-height); padding: 3px 7px; border: 1px solid rgba(128,140,160,.16); border-radius: 8px; display: flex; align-items: center; gap: 7px; text-align: left; color: inherit; background: rgba(128,140,160,.035); transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease; }
.check-control:hover { border-color: rgba(var(--brand-rgb),.34); background: rgba(var(--brand-rgb),.045); }
.check-control.checked { border-color: rgba(var(--brand-rgb),.38); background: rgba(var(--brand-rgb),.075); }
.check-control.disabled { cursor: not-allowed; opacity: .48; border-color: rgba(128,140,160,.12); background: rgba(128,140,160,.025); }
.check-control.disabled:hover { border-color: rgba(128,140,160,.12); background: rgba(128,140,160,.025); }
.check-control:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.12); }
.check-control__box { width: 18px; height: 18px; flex: none; border: 1px solid rgba(128,140,160,.3); border-radius: 5px; display: grid; place-items: center; color: transparent; background: rgba(128,140,160,.06); font-size: 11px; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease; }
.check-control.checked .check-control__box { color: #fff; border-color: var(--brand); background: var(--brand); }
.check-control strong, .check-control small { display: block; }
.check-control > span:last-child { min-width: 0; }
.check-control strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; font-weight: 680; }
.check-control small { margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8.2px; line-height: 1.05; opacity: .56; }
.provider-note { padding: 10px 12px; border-radius: 10px; display: flex; gap: 8px; background: rgba(245,158,11,.075); color: #D97706; font-size: 10px; line-height: 1.5; }
.provider-note--brand { color: var(--brand); background: rgba(var(--brand-rgb),.075); }
.config-footer { min-height: 64px; padding: 12px 16px; border-top: 1px solid rgba(128,140,160,.12); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.config-footer__status { min-width: 0; flex: 1; }
.config-footer__actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.config-footer strong, .config-footer small { display: block; font-size: 9.8px; }
.config-footer small { margin-top: 3px; }
.check-result--success { color: #10B981; }
.check-result--error { color: #EF4444; }
.primary-button { color: #fff; border: 0; background: var(--brand); }
.primary-button:not(:disabled):hover { background: var(--brand-hover); transform: translateY(-1px); box-shadow: 0 5px 14px rgba(var(--brand-rgb),.2); }
.primary-button:not(:disabled):active { transform: translateY(0); box-shadow: none; }
.primary-button:disabled { opacity: .45; cursor: not-allowed; }
.tts-future { min-height: 430px; padding: 52px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.tts-future__mark { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: rgba(245,158,11,.1); color: #F59E0B; font-size: 28px; margin-bottom: 16px; }
.tts-future h3 { margin: 14px 0 0; font-size: 18px; font-weight: 700; }

@media (min-width: 1081px) {
  .provider-rail { border-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
}
@media (max-width: 1080px) {
  .speech-layout { grid-template-columns: minmax(0,1fr); align-items: start; }
  .provider-rail { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
  .rail-heading { grid-column: 1 / -1; }
  .provider-card + .provider-card { margin-top: 0; }
  .provider-card__copy { padding-right: 0; }
  .provider-state { display: none; }
}
@media (max-width: 820px) {
  .speech-page { padding: 14px; }
  .speech-intro { align-items: flex-start; }
  .speech-intro .refresh-button { margin-left: auto; }
  .config-footer { align-items: flex-start; flex-direction: column; }
  .config-footer__actions { width: 100%; }
  .config-footer__actions > button { min-height: 40px; }
}
@media (max-width: 680px) {
  .speech-page { --speech-control-height: 44px; padding: 10px; }
  .speech-intro { padding: 10px; }
  .speech-intro .refresh-button { width: 34px; height: 34px; min-height: 34px; margin-left: 0; }
  .capability-tabs button { min-height: 44px; padding: 0 8px; }
  .provider-rail, .field-grid.two-col, .tts-placeholder-grid, .option-toggle-group { grid-template-columns: minmax(0,1fr); }
  .provider-card { min-height: 56px; }
  .config-header { padding: 12px; }
  .config-body { padding: 12px; }
  .option-toggle-group { height: auto; min-height: 0; }
  .config-footer { padding: 12px; }
  .config-footer__actions > button { flex: 1 1 140px; justify-content: center; }
  .tts-future { min-height: 360px; padding: 36px 16px; }
}
@media (max-width: 420px) {
  .speech-page { padding: 8px; }
  .speech-count { display: none; }
  .capability-tabs button { gap: 5px; font-size: 11px; }
  .available-badge, .future-badge { display: none; }
  .config-provider-icon { width: 38px; height: 38px; }
  .config-header p { max-width: 210px; }
  .config-footer__actions { display: grid; grid-template-columns: minmax(0,1fr); }
  .config-footer__actions > button { width: 100%; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .ghost-button, .secondary-button, .primary-button, .provider-card, .switch-control, .switch-control span, .field-block input, .secret-input, .check-control, .check-control__box { transition: none; } .refresh-icon--spinning { animation: none; } }
</style>
