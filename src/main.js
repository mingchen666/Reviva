import { createApp } from 'vue'
import './style.css'
import './styles/themes/index.scss'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'

import App from './App.vue'
import 'virtual:svg-icons-register'
import 'virtual:uno.css'

import router from './router'
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import AppLayout from './components/layout/AppLayout.vue'
import MsModal from './components/MsModal/MsModal.vue'
import MsMessageContainer from './components/MsMessage/MsMessageContainer.vue'
import MsTreeItem from './components/MsTreeItem/MsTreeItem.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import "markstream-vue/index.css";

const PERSISTED_STORE_KEYS = [
  'app', 'agents', 'tasks', 'spaces', 'wiki', 'recycleBin', 'notes',
  'conversations', 'user', 'userProfile', 'translate', 'cloudSpaces', 'settings',
]

function migrateLegacyPersistedState(namespace) {
  if (namespace === 'unconfigured') return
  const marker = 'reviva:legacy-persist-migrated-to-workspace'
  if (localStorage.getItem(marker)) return
  for (const storeKey of PERSISTED_STORE_KEYS) {
    const targetKey = `workspace:${namespace}:${storeKey}`
    const legacyValue = localStorage.getItem(storeKey)
    if (legacyValue !== null && localStorage.getItem(targetKey) === null) localStorage.setItem(targetKey, legacyValue)
  }
  for (const legacyKey of ['reviva:note-ai-settings', 'reviva:note-split-ratio']) {
    const targetKey = `workspace:${namespace}:${legacyKey}`
    const legacyValue = localStorage.getItem(legacyKey)
    if (legacyValue !== null && localStorage.getItem(targetKey) === null) localStorage.setItem(targetKey, legacyValue)
  }
  localStorage.setItem(marker, JSON.stringify({ workspaceId: namespace, migratedAt: new Date().toISOString() }))
}

async function bootstrap() {
  let workspaceId = 'unconfigured'
  try {
    const state = await window.electronAPI?.workspace?.getBootstrapState?.()
    if (state?.activeWorkspaceId) workspaceId = state.activeWorkspaceId
  } catch (error) {
    console.warn('Failed to resolve workspace persistence namespace:', error)
  }
  window.__REVIVA_WORKSPACE_ID__ = workspaceId
  migrateLegacyPersistedState(workspaceId)

  const app = createApp(App)
  const pinia = createPinia()
  pinia.use(createPersistedState({ key: storeKey => `workspace:${workspaceId}:${storeKey}` }))
  app.use(router)
  app.use(pinia)

  app.component('AppLayout', AppLayout)
  app.component('MsModal', MsModal)
  app.component('MsMessageContainer', MsMessageContainer)
  app.component('MsTreeItem', MsTreeItem)
  app.component('SvgIcon', SvgIcon)

  app.mount('#app')
}

bootstrap()
