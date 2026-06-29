<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useTranslateStore } from '@/stores/translate'
import TranslateToolbar from './TranslateToolbar.vue'
import TranslateHistoryDrawer from './TranslateHistoryDrawer.vue'
import TranslateSettingsModal from './TranslateSettingsModal.vue'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const store = useTranslateStore()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)

function langLabel(code) {
  return store.languages.find(l => l.code === code)?.label || code
}

function langShort(code) {
  return String(code || '').toUpperCase()
}

const isErrorResult = computed(() => store.translatedText?.startsWith('错误') || store.translatedText?.startsWith('翻译失败'))

function copySource() {
  if (store.sourceText) navigator.clipboard?.writeText(store.sourceText)
}

function copyResult() {
  if (store.translatedText && !isErrorResult.value) navigator.clipboard?.writeText(store.translatedText)
}

// Click-toggle language dropdowns
const sourceDropdownOpen = ref(false)
const targetDropdownOpen = ref(false)

function closeAllDropdowns() {
  sourceDropdownOpen.value = false
  targetDropdownOpen.value = false
}

function toggleSourceDropdown() {
  targetDropdownOpen.value = false
  sourceDropdownOpen.value = !sourceDropdownOpen.value
}

function toggleTargetDropdown() {
  sourceDropdownOpen.value = false
  targetDropdownOpen.value = !targetDropdownOpen.value
}

function selectSourceLang(code) {
  store.sourceLang = code
  sourceDropdownOpen.value = false
}

function selectTargetLang(code) {
  store.targetLang = code
  targetDropdownOpen.value = false
}

function handleClickOutside(e) {
  if (!e.target.closest('.lang-dropdown-container')) {
    closeAllDropdowns()
  }
}

onMounted(() => {
  if (!store.selectedModelId) {
    store.selectedModelId = settingsStore.defaultModels.translation || settingsStore.defaultModels.chat || ''
  }
  document.addEventListener('click', handleClickOutside, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden" :class="isDark ? 'bg-d0' : 'bg-l0'">
    <!-- Top toolbar -->
    <TranslateToolbar />

    <!-- Language bar -->
    <div class="shrink-0 px-5 py-2.5 flex items-center gap-2"
      :class="isDark ? 'bg-d1 border-b border-bdr' : 'bg-l1 border-b border-bdrL'">
      <!-- Source language selector -->
      <div class="lang-dropdown-container relative">
        <button @click.stop="toggleSourceDropdown()"
          class="flex items-center justify-between h-8 border border-solid w-[112px] px-2.5 rounded-1.5 text-[11px] font-semibold transition-all"
          :class="isDark ? 'text-brand-400 border border-brand-400/20 hover:border-brand-400/30' : 'text-brand-600 border-brand-200 hover:border-brand-300'">
          <span class="flex items-center gap-1.5 min-w-0">
            <span class="lang-code">{{ langShort(store.sourceLang) }}</span>
            <span class="truncate">{{ langLabel(store.sourceLang) }}</span>
          </span>
          <i class="ri-arrow-down-s-line text-[12px] shrink-0 transition-transform"
            :class="sourceDropdownOpen ? 'rotate-180' : 'opacity-60'" />
        </button>
        <Transition name="dropdown">
          <div v-if="sourceDropdownOpen"
            class="absolute left-0 top-full mt-1.5 py-1 rounded-xl shadow-xl z-50 w-[136px]"
            :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-white border border-bdrF shadow-black/10'">
            <button v-for="lang in store.languages" :key="lang.code"
              @click.stop="selectSourceLang(lang.code)"
              class="px-2.5 py-1.5 text-[11px] text-left transition-colors flex items-center gap-2 w-full"
              :class="lang.code === store.sourceLang
                ? (isDark ? 'text-brand-400' : 'text-brand-600')
                : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')">
              <span class="lang-code">{{ langShort(lang.code) }}</span>
              <span class="flex-1 min-w-0 truncate">{{ lang.label }}</span>
              <i v-if="lang.code === store.sourceLang" class="ri-check-line text-[12px] shrink-0" />
            </button>
          </div>
        </Transition>
      </div>

      <!-- Swap button -->
      <button @click="store.swapLanguages()"
        class="w-8 h-8 rounded-lg bg-transparent flex items-center justify-center transition-all shrink-0"
        :class="isDark ? 'text-wt-dim  hover:text-brand-400' : 'text-lt-aux hover:text-brand-600'">
        <i class="ri-arrow-left-right-line text-[16px]" />
      </button>

      <!-- Target language selector -->
      <div class="lang-dropdown-container relative">
        <button @click.stop="toggleTargetDropdown()"
          class="flex items-center justify-between h-8 border border-solid w-[112px] px-2.5 rounded-1.5 text-[11px] font-semibold transition-all"
          :class="isDark ? 'text-agent-400 border border-agent-400/80 hover:border-agent-400/100' : 'text-agent-600 border-brand-400/40 hover:border-agent-400'">
          <span class="flex items-center gap-1.5 min-w-0">
            <span class="lang-code">{{ langShort(store.targetLang) }}</span>
            <span class="truncate">{{ langLabel(store.targetLang) }}</span>
          </span>
          <i class="ri-arrow-down-s-line text-[12px] shrink-0 transition-transform"
            :class="targetDropdownOpen ? 'rotate-180' : 'opacity-60'" />
        </button>
        <Transition name="dropdown">
          <div v-if="targetDropdownOpen"
            class="absolute left-0 top-full mt-1.5 py-1 rounded-xl shadow-xl z-50 w-[136px]"
            :class="isDark ? 'bg-d2 border border-bdr shadow-black/50' : 'bg-white border border-bdrF shadow-black/10'">
            <button v-for="lang in store.languages" :key="lang.code"
              @click.stop="selectTargetLang(lang.code)"
              class="px-2.5 py-1.5 text-[11px] text-left transition-colors flex items-center gap-2 w-full"
              :class="lang.code === store.targetLang
                ? (isDark ? 'text-agent-400' : 'text-agent-600')
                : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')">
              <span class="lang-code">{{ langShort(lang.code) }}</span>
              <span class="flex-1 min-w-0 truncate">{{ lang.label }}</span>
              <i v-if="lang.code === store.targetLang" class="ri-check-line text-[12px] shrink-0" />
            </button>
          </div>
        </Transition>
      </div>

      <!-- Translate button -->
      <button @click="store.translate()" :disabled="store.isTranslating || !store.sourceText.trim()"
        class="flex items-center gap-1 h-8 px-4 rounded-lg text-[14px] font-semibold transition-all ml-2"
        :style="(store.isTranslating || !store.sourceText.trim()) ? {} : { backgroundColor: accentHex, color: '#fff', boxShadow: (isDark ? `0 4px 14px ${accentHex}30` : `0 4px 14px ${accentHex}25`) }"
        :class="(store.isTranslating || !store.sourceText.trim())
          ? (isDark ? 'bg-d4 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')
          : 'hover:opacity-90'">
        <i v-if="store.isTranslating" class="ri-loader-4-line animate-spin text-[16px]" />
        <i v-else class="ri-translate-2 text-[16px]" />
        {{ store.isTranslating ? '翻译中...' : '翻译' }}
      </button>

      <span class="text-[9px] ml-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <span class="px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">Ctrl</span>
        <span class="mx-0.5">+</span>
        <span class="px-1.5 py-0.5 rounded" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">Enter</span>
      </span>
      <div class="flex-1" />
    </div>

    <!-- Left-right text panels -->
    <div class="flex-1 flex min-h-0 gap-3 px-5 py-3">
      <!-- Source panel -->
      <div class="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden"
        :class="isDark ? 'bg-d1 border border-bdr' : 'bg-white border border-bdrF shadow-sm'">
        <div class="shrink-0 px-4 py-2 flex items-center gap-2"
          :class="isDark ? 'bg-d2 border-b border-bdr' : 'bg-l2 border-b border-bdrL'">
          <div class="w-5 h-5 rounded-md flex items-center justify-center"
            :class="isDark ? 'bg-brand-400/10' : 'bg-brand-50'">
            <i class="ri-edit-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">源文本</span>
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-white border border-bdrF'" style="font-size:11px;padding:1px 6px">
            {{ store.sourceText.length }} 字符
          </span>
          <div class="flex-1" />
          <button v-if="store.sourceText" @click="copySource()"
            class="h-6 px-2 rounded-md flex items-center gap-1 text-[13px] transition-all"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d3' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'">
            <i class="ri-file-copy-line text-[13px]" />复制
          </button>
        </div>
        <textarea v-model="store.sourceText" placeholder="在此输入要翻译的文本..."
          class="flex-1 w-full border-0 px-4 py-3 text-[13px] outline-none resize-none leading-relaxed overflow-y-auto min-h-0"
          :class="isDark ? 'bg-d1 text-wt-main placeholder-wt-dim' : 'bg-white text-lt-main placeholder-lt-aux'"
          @keydown.ctrl.enter="store.translate()" />
      </div>

      <!-- Output panel -->
      <div class="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden"
        :class="isDark ? 'bg-d1 border border-bdr' : 'bg-white border border-bdrF shadow-sm'">
        <div class="shrink-0 px-4 py-2 flex items-center gap-2"
          :class="isDark ? 'bg-d2 border-b border-bdr' : 'bg-l2 border-b border-bdrL'">
          <div class="w-5 h-5 rounded-md flex items-center justify-center"
            :class="isDark ? 'bg-agent-400/10' : 'bg-agent-50'">
            <i class="ri-file-text-line text-[14px]" :class="isDark ? 'text-agent-400' : 'text-agent-600'" />
          </div>
          <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">翻译结果</span>
          <div class="flex-1" />
          <button v-if="store.translatedText && !isErrorResult && !store.isTranslating" @click="store.mdPreview = !store.mdPreview"
            class="h-6 px-2 rounded-md flex items-center gap-1 text-[13px] transition-all"
            :class="store.mdPreview
              ? (isDark ? 'text-brand-400 bg-brand-400/8' : 'text-brand-600 bg-brand-50')
              : (isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d3' : 'text-lt-aux hover:text-lt-sub hover:bg-l3')">
            <i class="ri-markdown-line text-[14px]" />MD预览
          </button>
          <button v-if="store.translatedText && !store.isTranslating && !isErrorResult" @click="copyResult()"
            class="h-6 px-2 rounded-md flex items-center gap-1 text-[13px] transition-all"
            :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d3' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'">
            <i class="ri-file-copy-line text-[13px]" />复制
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div v-if="store.isTranslating && !store.translatedText" class="flex flex-col items-center justify-center py-16 gap-3">
            <div class="relative w-10 h-10">
              <div class="absolute inset-0 rounded-full border-2 animate-spin"
                :class="isDark ? 'border-brand-400/20 border-t-brand-400' : 'border-brand-500/20 border-t-brand-500'" />
              <div class="absolute inset-1.5 rounded-full border-2 animate-spin"
                style="animation-direction:reverse;animation-duration:1.5s"
                :class="isDark ? 'border-agent-400/20 border-b-agent-400' : 'border-agent-500/20 border-b-agent-500'" />
            </div>
            <span class="text-[11px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">正在翻译...</span>
          </div>
          <div v-else-if="isErrorResult" class="rounded-xl p-4 flex items-start gap-3"
            :class="isDark ? 'bg-red-400/6 border border-red-400/12' : 'bg-red-50 border border-red-100'">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              :class="isDark ? 'bg-red-400/10' : 'bg-red-100'">
              <i class="ri-error-warning-line text-red-400 text-[14px]" />
            </div>
            <span class="text-[12px] leading-relaxed" :class="isDark ? 'text-red-400' : 'text-red-600'">{{ store.translatedText }}</span>
          </div>
          <div v-else-if="store.translatedText">
            <div v-if="store.mdPreview" class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
              <div class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-main' : 'text-lt-main'" v-html="store.translatedText" />
            </div>
            <div v-else class="text-[13px] leading-relaxed whitespace-pre-wrap" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
              {{ store.translatedText }}
              <span v-if="store.isTranslating" class="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
            </div>
          </div>
          <div v-else class="flex items-center justify-center h-full">
            <div class="text-center">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                >
                <i class="ri-translate-2 text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              </div>
              <p class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">输入文本后点击翻译</p>
              <p class="text-[9px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持 12 种语言互译</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TranslateHistoryDrawer />
    <TranslateSettingsModal />
  </div>
</template>

<style scoped>
.lang-code {
  width: 22px;
  flex: 0 0 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
  opacity: 0.78;
}

.dropdown-enter-active { transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) }
.dropdown-leave-active { transition: all 0.1s ease-in }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px) scale(0.98) }
</style>
