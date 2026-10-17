<script setup>
import { ref, computed, watch, toRaw } from 'vue'
import { webProviderVisuals } from './constant'
import { fetchBilibiliCookieStatus, storeBilibiliCookie } from '@/apis/media'
import './settingsControls.css'

const props = defineProps({
  webSettings: { type: Object, default: null },
  webProviders: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['save-web-settings'])

const openSelectKey = ref('')
const webApiKey = ref('')
const webApiKeyAction = ref('keep')
const webDraft = ref(null)
const providerRasterAssets = import.meta.glob('../../../assets/icons/*.{ico,png,jpg,jpeg,webp}', { eager: true, query: '?url', import: 'default' })
const webTimeoutOptions = [30, 60, 90]

function cloneWebSettings(value) { if (!value) return null; return structuredClone(toRaw(value)) }

watch(() => props.visible, (vis) => {
  if (!vis) { webDraft.value = null; return }
  webApiKey.value = ''
  webApiKeyAction.value = 'keep'
  webDraft.value = cloneWebSettings(props.webSettings)
}, { immediate: true })
watch(() => props.webSettings, (value) => { if (props.visible && !webDraft.value && value) webDraft.value = cloneWebSettings(value) })

const selectedWebProviderId = computed(() => webDraft.value?.selectedProvider || '')
const selectedWebProvider = computed(() => props.webProviders.find(i => i.id === selectedWebProviderId.value) || null)
const selectedWebConfig = computed(() => webDraft.value?.providers?.[selectedWebProviderId.value] || null)

function webProviderVisual(id) {
  return webProviderVisuals[id] || { icon: 'search-eye', desc: '网页内容解析服务', dark: 'bg-brand-400/12 text-brand-300', light: 'bg-brand-50 text-brand-600', badge: 'text-brand-500 bg-brand-400/10' }
}
function webProviderRasterSrc(id) {
  const suffixes = ['/' + id + '.ico', '/' + id + '.png', '/' + id + '.webp', '/' + id + '.jpg', '/' + id + '.jpeg']
  const entry = Object.entries(providerRasterAssets).find(([fp]) => suffixes.some(s => fp.toLowerCase().endsWith(s)))
  return entry?.[1] || ''
}
function selectWebProvider(id) { if (!webDraft.value) return; webDraft.value.selectedProvider = id; webApiKey.value = ''; webApiKeyAction.value = 'keep' }
function replaceWebKey() { webApiKeyAction.value = 'replace' }
function clearWebKey() { webApiKey.value = ''; webApiKeyAction.value = 'clear' }
function keepWebKey() { webApiKey.value = ''; webApiKeyAction.value = 'keep' }
function selectWebTimeout(value) { if (webDraft.value) webDraft.value.timeoutSeconds = value; openSelectKey.value = '' }
function toggleSelect(key) { openSelectKey.value = openSelectKey.value === key ? '' : key }
function selectorButtonClasses() { return ['compact-select__button', props.isDark ? 'compact-select__button--dark' : 'compact-select__button--light'] }
function selectorMenuClasses() { return ['compact-select__menu', props.isDark ? 'compact-select__menu--dark' : 'compact-select__menu--light'] }
function selectorOptionClasses(selected) { return ['compact-select__option', props.isDark ? 'compact-select__option--dark' : 'compact-select__option--light', selected ? 'compact-select__option--selected' : ''] }
function selectedOption(options, value) { return options.find(o => o.value === value) || options[0] || {} }

function webSettingsPatch() {
  const id = selectedWebProviderId.value
  return {
    selectedProvider: id,
    timeoutSeconds: Number(webDraft.value?.timeoutSeconds) || 60,
    providers: id ? { [id]: { baseUrl: selectedWebConfig.value?.baseUrl || '', apiKeyAction: webApiKeyAction.value, apiKey: webApiKeyAction.value === 'replace' ? webApiKey.value : '' } } : {}
  }
}

defineExpose({ webSettingsPatch })
</script>

<template>
      <div class="space-y-4">
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
</template>
