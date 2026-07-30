import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isDark = ref(false)
  const themeId = ref('default')
  const leftPanelWidth = ref(260)
  const rightPanelVisible = ref(false)
  const rightPanelWidth = ref(320)
  const currentRoute = ref('dashboard')
  const importModalVisible = ref(false)

  const colorMode = computed(() => isDark.value ? 'dark' : 'light')
  const themeClass = computed(() => `theme-${themeId.value} theme-${colorMode.value}`)
  let documentThemeClasses = []

  function syncDocumentThemeRoot() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (documentThemeClasses.length) root.classList.remove(...documentThemeClasses)
    documentThemeClasses = []
    root.removeAttribute('data-theme')
    root.removeAttribute('data-color-mode')

    // The document root only carries non-default themes so Teleport content is
    // covered without changing the Classic theme's existing portal styling.
    if (themeId.value === 'default') return
    documentThemeClasses = [`theme-${themeId.value}`, `theme-${colorMode.value}`]
    root.classList.add(...documentThemeClasses)
    root.dataset.theme = themeId.value
    root.dataset.colorMode = colorMode.value
  }

  watch([themeId, colorMode], syncDocumentThemeRoot, { immediate: true })

  function applyTheme(theme) {
    const normalized = String(theme || '').trim().toLowerCase()
    themeId.value = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(normalized) ? normalized : 'default'
  }

  function toggleTheme() {
    isDark.value = !isDark.value
  }

  function toggleRightPanel() {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  return {
    isDark,
    themeId,
    leftPanelWidth,
    rightPanelVisible,
    rightPanelWidth,
    currentRoute,
    importModalVisible,
    themeClass,
    colorMode,
    applyTheme,
    toggleTheme,
    toggleRightPanel,
  }
}, {
  persist: {
    pick: ['isDark', 'leftPanelWidth', 'rightPanelWidth'],
  },
})
