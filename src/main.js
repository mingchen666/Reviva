import { createApp } from 'vue'
import './style.css'
// import '@/styles/main.scss'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'

import App from './App.vue'
import 'virtual:svg-icons-register'
import 'virtual:uno.css'

import router from './router'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import AppLayout from './components/layout/AppLayout.vue'
import MsModal from './components/MsModal/MsModal.vue'
import MsMessageContainer from './components/MsMessage/MsMessageContainer.vue'
import MsTreeItem from './components/MsTreeItem/MsTreeItem.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import "markstream-vue/index.css";
const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(router)
app.use(pinia)

app.component('AppLayout', AppLayout)
app.component('MsModal', MsModal)
app.component('MsMessageContainer', MsMessageContainer)
app.component('MsTreeItem', MsTreeItem)
app.component('SvgIcon', SvgIcon)

app.mount('#app')
