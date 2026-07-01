import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isDark = ref(false)
  const leftPanelWidth = ref(260)
  const rightPanelVisible = ref(false)
  const rightPanelWidth = ref(320)
  const currentRoute = ref('dashboard')
  const importModalVisible = ref(false)

  const themeClass = computed(() => isDark.value ? 'theme-dark' : 'theme-light')

  function toggleTheme() {
    isDark.value = !isDark.value
  }

  function toggleRightPanel() {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  return {
    isDark,
    leftPanelWidth,
    rightPanelVisible,
    rightPanelWidth,
    currentRoute,
    importModalVisible,
    themeClass,
    toggleTheme,
    toggleRightPanel,
  }
}, {
  persist: {
    pick: ['isDark', 'leftPanelWidth', 'rightPanelWidth'],
  },
})
