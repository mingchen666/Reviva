<script setup>
import { ref, computed, watch } from 'vue'
import MsModal from '@/components/MsModal/MsModal.vue'
import PdfSettingsTab from './PdfSettingsTab.vue'
import WebImportSettingsTab from './WebImportSettingsTab.vue'
import MediaSettingsTab from './MediaSettingsTab.vue'

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
  configuredSpeechProviders: { type: Array, default: () => [] },
  configuredModels: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:show', 'save', 'save-web-settings', 'open-ocr-settings', 'open-speech-settings', 'install-local-parser'])

const activeTab = ref('pdf')
const pdfTabRef = ref(null)
const webTabRef = ref(null)

const show = computed({ get: () => props.show, set: (v) => emit('update:show', v) })

watch(() => props.show, (visible) => {
  if (!visible) return
  activeTab.value = ['pdf', 'web', 'media'].includes(props.initialTab) ? props.initialTab : 'pdf'
}, { immediate: true })

function saveCurrent(close) {
  if (activeTab.value === 'web') {
    emit('save-web-settings', webTabRef.value?.webSettingsPatch?.() || {}, close)
  } else {
    if (activeTab.value === 'pdf' && props.settings && props.enabledOcrProviders.length) {
      const draftId = pdfTabRef.value?.effectiveDraftOcrProviderId
      if (draftId) props.settings.defaultOcrProvider = draftId
    }
    emit('save', close)
  }
}
</script>

<template>
  <MsModal v-model:show="show" :width="720" height="min(820px, 85vh)" max-height="85vh" :show-footer="true">
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

      <div v-show="activeTab === 'pdf'">
        <PdfSettingsTab
          ref="pdfTabRef"
          :model="settings"
          :is-dark="isDark"
          :pdf-environment="pdfEnvironment"
          :pdf-environment-status-text="pdfEnvironmentStatusText"
          :effective-ocr-provider="effectiveOcrProvider"
          :enabled-ocr-providers="enabledOcrProviders"
          :ocr-provider-status-text="ocrProviderStatusText"
          :pdf-local-parser-install-result="pdfLocalParserInstallResult"
          :installing-pdf-local-parser="installingPdfLocalParser"
          @install-local-parser="emit('install-local-parser')"
          @open-ocr-settings="emit('open-ocr-settings')"
        />
      </div>
      <div v-show="activeTab === 'web'">
        <WebImportSettingsTab
          ref="webTabRef"
          :web-settings="webSettings"
          :web-providers="webProviders"
          :is-dark="isDark"
          :visible="show"
          @save-web-settings="(patch, close) => emit('save-web-settings', patch, close)"
        />
      </div>
      <div v-show="activeTab === 'media'">
        <MediaSettingsTab
          :model="settings"
          :is-dark="isDark"
          :configured-speech-providers="configuredSpeechProviders"
          :configured-models="configuredModels"
          :visible="show"
          @open-speech-settings="emit('open-speech-settings')"
        />
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
