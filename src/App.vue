<script setup>
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useSpacesStore } from '@/stores/spaces'
import { useAgentsStore } from '@/stores/agents'
import { useTasksStore } from '@/stores/tasks'
import { useOutputsStore } from '@/stores/outputs'
import { useConversationsStore } from '@/stores/conversations'
import { useRecycleBinStore } from '@/stores/recycleBin'
import { useNotesStore } from '@/stores/notes'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import StartupGuideModal from '@/components/onboarding/StartupGuideModal.vue'
import AppUpdateModal from '@/components/update/AppUpdateModal.vue'
import { useAppShortcuts } from '@/composables/useAppShortcuts'
import { useAutoUpdate } from '@/composables/useAutoUpdate'
import { useMessage } from '@/components/MsMessage/useMessage'

const appStore = useAppStore()
const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const msg = useMessage()

const commandPaletteVisible = ref(false)
const showStartupGuide = ref(false)
const showUpdateModal = ref(false)
const isDark = computed(() => appStore.isDark)
const { checking, updateInfo, downloading, downloadProgress, downloaded, error, checkForUpdate, downloadUpdate, installUpdate } =
  useAutoUpdate()
let webImportNotificationHandler = null
let trayNavigateHandler = null

async function onEmergencyCustomCssReset(event) {
  if (!(event.ctrlKey || event.metaKey) || !event.altKey || !event.shiftKey || event.key.toLowerCase() !== 'r') return
  event.preventDefault()
  event.stopImmediatePropagation()
  const result = await settingsStore.resetCustomCss()
  if (result?.success) msg.success('已清除自定义 CSS，并恢复当前主题')
  else msg.error(result?.error || '紧急恢复自定义 CSS 失败')
}

// Show modal when update is available
watch(updateInfo, (v) => {
  if (v) showUpdateModal.value = true
})

watch(error, (v) => {
  if (v) showUpdateModal.value = true
})

useAppShortcuts({
  openCommandPalette: () => {
    commandPaletteVisible.value = true
  },
})

const themeClass = computed(() => appStore.themeClass)
const activeThemeId = computed(() => appStore.themeId)
const activeColorMode = computed(() => appStore.colorMode)
const showLayout = computed(() => {
  return !route.matched.some((r) => r.meta?.noLayout)
})
const iconRailWidth = computed(() => {
  for (const r of route.matched) {
    if (r.meta?.layout?.iconRailWidth) return r.meta.layout.iconRailWidth
  }
  return 52
})

// Sound player using Web Audio API
let audioCtx = null

const SOUND_PRESETS = {
  complete: { freq: 880, dur: 0.15, type: 'sine', freq2: 1320 },
  error: { freq: 330, dur: 0.25, type: 'triangle', freq2: 220 },
  message: { freq: 660, dur: 0.1, type: 'sine', freq2: 880 },
  drop: { freq: 1200, dur: 0.06, type: 'sine', freq2: 1600 },
  chime: { freq: 1047, dur: 0.12, type: 'sine', freq2: 1319 },
}

function playSound(name) {
  if (!settingsStore.notifySound || settingsStore.notifyDND) return
  const preset = SOUND_PRESETS[name] || SOUND_PRESETS.complete
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  const now = audioCtx.currentTime

  const osc1 = audioCtx.createOscillator()
  const gain1 = audioCtx.createGain()
  osc1.type = preset.type
  osc1.frequency.value = preset.freq
  gain1.gain.setValueAtTime(0.15, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + preset.dur)
  osc1.connect(gain1).connect(audioCtx.destination)
  osc1.start(now)
  osc1.stop(now + preset.dur)

  if (preset.freq2) {
    const osc2 = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.type = preset.type
    osc2.frequency.value = preset.freq2
    gain2.gain.setValueAtTime(0.12, now + preset.dur * 0.5)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + preset.dur * 1.5)
    osc2.connect(gain2).connect(audioCtx.destination)
    osc2.start(now + preset.dur * 0.5)
    osc2.stop(now + preset.dur * 1.5)
  }
}

function onPlaySound(name) {
  playSound(name)
}

onMounted(async () => {
  window.addEventListener('keydown', onEmergencyCustomCssReset, true)
  if (!window.electronAPI?.db) return
  const spaces = useSpacesStore()
  const agents = useAgentsStore()
  const tasks = useTasksStore()
  const outputs = useOutputsStore()
  const conversations = useConversationsStore()
  const recycleBin = useRecycleBinStore()
  const notes = useNotesStore()
  await Promise.all([
    settingsStore.loadFromDb(),
    spaces.loadFromDb(),
    agents.loadFromDb(),
    tasks.loadFromDb(),
    outputs.scanAll(),
    conversations.loadFromDb(),
    recycleBin.loadFromDb(),
    notes.loadFromDb(),
  ])
  await settingsStore.loadThemes()
  const themeResult = await settingsStore.applyTheme()
  if (!themeResult?.success) await settingsStore.applyTheme('default')
  const customCssResult = await settingsStore.loadCustomCss()
  if (!customCssResult?.success) msg.warning(customCssResult?.error || '自定义 CSS 未能加载')

  // Listen for play-sound events from main process
  window.electronAPI?.onPlaySound?.(onPlaySound)
  trayNavigateHandler = window.electronAPI?.onTrayNavigate?.((path) => {
    if (typeof path === 'string' && path.startsWith('/')) router.push(path)
  })
  webImportNotificationHandler = window.electronAPI?.webImport?.onNotification?.((job) => {
    const target = job?.target_type === 'wiki' ? 'Wiki 来源' : '网页文档'
    if (job?.status === 'succeeded') msg.success(`${target}导入完成：${job.title || '未命名页面'}`, { placement: 'top-right', duration: 5000 })
    else if (job?.status === 'partial') msg.warning(`${target}部分完成：Markdown 已保存，HTML 失败。`, { placement: 'top-right', duration: 6000 })
    else if (job?.status === 'failed') msg.error(`${target}导入失败：${job.error_message || '请查看导入历史'}`, { placement: 'top-right', duration: 6000 })
  })

  // Prompt user to configure workspace root if not set
  // Skip on login/onboarding routes (noLayout pages)
  const isNoLayoutRoute = route.matched.some((r) => r.meta?.noLayout)
  if (!isNoLayoutRoute && !settingsStore.isWorkspaceReady) {
    showStartupGuide.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEmergencyCustomCssReset, true)
  window.electronAPI?.webImport?.removeNotificationListener?.(webImportNotificationHandler)
  if (typeof trayNavigateHandler === 'function') {
    window.electronAPI?.removeTrayNavigateListener?.(trayNavigateHandler)
  }
})
</script>

<template>
  <div
    :class="themeClass"
    :data-theme="activeThemeId"
    :data-color-mode="activeColorMode"
    class="h-full w-full">
    <router-view v-if="!showLayout" />
    <AppLayout v-else :icon-rail-width="iconRailWidth">
      <router-view />
    </AppLayout>
    <MsMessageContainer />
    <CommandPalette :visible="commandPaletteVisible" @close="commandPaletteVisible = false" />
    <StartupGuideModal v-model:show="showStartupGuide" />

    <AppUpdateModal
      v-model:show="showUpdateModal"
      :is-dark="isDark"
      :checking="checking"
      :update-info="updateInfo"
      :downloading="downloading"
      :download-progress="downloadProgress"
      :downloaded="downloaded"
      :error="error"
      @check="checkForUpdate"
      @download="downloadUpdate"
      @install="installUpdate" />
  </div>
</template>
