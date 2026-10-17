<script setup>
import { ref, computed, watch } from 'vue'
import { mediaActionOptions, mediaPresetOptions, mediaLanguageOptions } from './constant'
import { getAliyunAsrModelTypeLabel } from '@/constants/aliyunAsrModels'
import { fetchBilibiliCookieStatus, storeBilibiliCookie } from '@/apis/media'
import './settingsControls.css'

const props = defineProps({
  model: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  configuredSpeechProviders: { type: Array, default: () => [] },
  configuredModels: { type: Array, default: () => [] },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['open-speech-settings'])

const openSelectKey = ref('')
const bilibiliCookieInput = ref('')
const bilibiliCookieVisible = ref(false)
const bilibiliCookieBusy = ref(false)
const bilibiliCookieStatus = ref(null)
const bilibiliCookieFeedback = ref('')
const bilibiliCookieFeedbackTone = ref('neutral')

const speechProviderIcons = Object.freeze({ local_asr: 'local-asr', openai_whisper_compatible: 'openai', aliyun_bailian_asr: 'bailian' })
const speechProviderOptions = computed(() => [
  { value: 'auto', icon: 'ri-route-line', title: '自动选择', desc: props.configuredSpeechProviders.length ? '优先使用已配置的默认语音转文字服务。' : '尚未配置语音转文字服务；无字幕媒体会保持部分可用。' },
  ...props.configuredSpeechProviders.map(p => ({ value: p.id, svgIcon: speechProviderIcons[p.id] || '', icon: p.icon || 'ri-mic-ai-line', title: p.name, desc: (p.modelName || p.model || '已配置') + (p.active ? ' · 当前默认' : '') }))
])
const speechProviderReady = computed(() => props.configuredSpeechProviders.length > 0)
const mediaModelOptions = computed(() => [
  { value: 'auto', icon: 'ri-route-line', title: '自动选择', desc: props.configuredModels.length ? '优先使用已配置的默认语音模型。' : '尚未配置语音模型；无字幕媒体会保持部分可用。' },
  ...props.configuredModels.filter(m => !m.realtime).map(m => ({
    value: m.ref, icon: 'ri-mic-ai-line', title: m.modelName || m.modelId,
    desc: m.providerName + (m.providerId === 'aliyun_bailian_asr' && getAliyunAsrModelTypeLabel(m.modelId) ? ' \u00b7 ' + getAliyunAsrModelTypeLabel(m.modelId) : ''),
    providerId: m.providerId, modelId: m.modelId,
  }))
])
function selectedOption(options, value) { return options.find(o => o.value === value) || options[0] || {} }
const selectedMediaModel = computed(() => selectedOption(mediaModelOptions.value, props.model?.mediaModelRef || 'auto'))
const selectedMediaProvider = computed(() => selectedOption(speechProviderOptions.value, props.model?.mediaProviderId || 'auto'))

function toggleSelect(key) { openSelectKey.value = openSelectKey.value === key ? '' : key }
function selectOption(field, value) {
  props.model[field] = value
  if (field === 'mediaModelRef') {
    if (value && value !== 'auto') { const idx = value.indexOf('::'); props.model.mediaProviderId = idx > 0 ? value.slice(0, idx) : value }
    else { props.model.mediaProviderId = 'auto' }
  }
  if (field === 'mediaPreset' && value === 'keyframe_enhanced') props.model.mediaExtractKeyframes = true
  if (field === 'mediaPreset' && value === 'local_private') {
    const localModel = props.configuredModels.find(m => m.providerId === 'local_asr')
    props.model.mediaModelRef = localModel ? localModel.ref : ''
    props.model.mediaProviderId = localModel ? 'local_asr' : 'auto'
  }
  openSelectKey.value = ''
}
function selectorButtonClasses() { return ['compact-select__button', props.isDark ? 'compact-select__button--dark' : 'compact-select__button--light'] }
function selectorMenuClasses() { return ['compact-select__menu', props.isDark ? 'compact-select__menu--dark' : 'compact-select__menu--light'] }
function selectorOptionClasses(selected) { return ['compact-select__option', props.isDark ? 'compact-select__option--dark' : 'compact-select__option--light', selected ? 'compact-select__option--selected' : ''] }

const bilibiliCookieStatusText = computed(() => {
  const status = bilibiliCookieStatus.value
  if (!status) return '正在读取'
  if (status.state === 'unavailable') return '状态读取失败'
  if (status.storageAvailable === false) return '安全存储不可用'
  if (!status.configured) return '未配置'
  if (status.valid) return status.userName ? '已登录 · ' + status.userName : '已验证'
  if (status.state === 'invalid') return '已失效'
  return '待验证'
})
const bilibiliCookieReady = computed(() => bilibiliCookieStatus.value?.valid === true)

async function loadBilibiliCookieStatus() {
  try {
    const result = await fetchBilibiliCookieStatus()
    if (!result?.success || !result.status) throw new Error(result?.message || 'Cookie 状态接口未响应')
    bilibiliCookieStatus.value = result.status
    bilibiliCookieInput.value = result.cookie || ''
  } catch (error) {
    bilibiliCookieStatus.value = { configured: false, valid: false, state: 'unavailable', storageAvailable: null, userName: '', userId: '', validatedAt: '' }
    bilibiliCookieFeedbackTone.value = 'error'
    bilibiliCookieFeedback.value = error?.message || 'Cookie 状态读取失败，请重启应用后重试'
  }
}
async function saveBilibiliCookie() {
  const cookie = bilibiliCookieInput.value.trim()
  if (!cookie || bilibiliCookieBusy.value) return
  bilibiliCookieBusy.value = true
  bilibiliCookieFeedback.value = ''
  try {
    const result = await storeBilibiliCookie(cookie)
    if (!result?.success) throw new Error(result?.message || 'B 站 Cookie 验证失败')
    bilibiliCookieStatus.value = result.status
    bilibiliCookieInput.value = cookie
    bilibiliCookieFeedbackTone.value = 'success'
    bilibiliCookieFeedback.value = 'Cookie 已验证并加密保存'
  } catch (error) {
    bilibiliCookieFeedbackTone.value = 'error'
    bilibiliCookieFeedback.value = error?.message || 'B 站 Cookie 验证失败'
  } finally {
    bilibiliCookieBusy.value = false
  }
}

watch(() => props.visible, (vis) => {
  if (vis) {
    bilibiliCookieInput.value = ''
    bilibiliCookieVisible.value = false
    bilibiliCookieStatus.value = null
    bilibiliCookieFeedback.value = ''
    loadBilibiliCookieStatus()
  }
}, { immediate: true })

</script>

<template>
      <div class="space-y-4 media-settings-tab">
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
              @click="toggleSelect('mediaModel')"
            >
              <span class="compact-select__icon compact-select__provider-icon">
                <SvgIcon
                  v-if="selectedMediaModel.svgIcon"
                  :icon-class="selectedMediaModel.svgIcon"
                  :size="17"
                  :color="isDark ? '#f5f5f5' : '#1f2937'"
                />
                <i v-else :class="selectedMediaModel.icon" />
              </span>
              <span class="compact-select__content"
                ><span class="compact-select__title">{{ selectedMediaModel.title }}</span
                ><span class="compact-select__desc">{{ selectedMediaModel.desc }}</span></span
              >
              <i
                class="ri-arrow-down-s-line compact-select__arrow"
                :class="{ 'compact-select__arrow--open': openSelectKey === 'mediaModel' }"
              />
            </button>
            <div v-if="openSelectKey === 'mediaModel'" :class="selectorMenuClasses()">
              <button
                v-for="option in mediaModelOptions"
                :key="option.value"
                type="button"
                :class="selectorOptionClasses(model.mediaModelRef === option.value)"
                @click="selectOption('mediaModelRef', option.value)"
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
                  v-if="model.mediaModelRef === option.value"
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
                ? `当前解析使用：${selectedMediaModel?.title || '自动选择'}`
                : '尚未配置语音转文字服务'
            }}</strong>
            <small :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{
              speechProviderReady
                ? `${selectedMediaModel?.desc || '无字幕媒体将按所选服务继续转录。'}${model.mediaModelRef === 'auto' || !model.mediaModelRef ? ' 仅自动模式会使用默认服务商。' : ' 显式选择不会被默认服务商覆盖。'}`
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
</template>
