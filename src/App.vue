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
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import MsModal from '@/components/MsModal/MsModal.vue'
import StartupGuideModal from '@/components/onboarding/StartupGuideModal.vue'
import BetaExpiredScreen from '@/components/BetaExpiredScreen.vue'
import { useAppShortcuts } from '@/composables/useAppShortcuts'
import { useAutoUpdate } from '@/composables/useAutoUpdate'
import { BETA_RELEASE, isBetaExpired } from '@/config/beta'

const appStore = useAppStore()
const route = useRoute()
const settingsStore = useSettingsStore()

const commandPaletteVisible = ref(false)
const showStartupGuide = ref(false)
const showUpdateModal = ref(false)
const isDark = computed(() => appStore.isDark)
const { updateInfo, downloading, downloadProgress, downloaded, checkForUpdate, downloadUpdate, installUpdate } =
  useAutoUpdate()
const betaNow = ref(new Date())
const betaExpired = computed(() => isBetaExpired(betaNow.value))
let betaTimer = null

// Show modal when update is available
watch(updateInfo, (v) => {
  if (v) showUpdateModal.value = true
})

useAppShortcuts({
  openCommandPalette: () => {
    commandPaletteVisible.value = true
  },
})

const themeClass = computed(() => appStore.themeClass)
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

function onPlaySound(_, name) {
  playSound(name)
}

onMounted(async () => {
  betaNow.value = new Date()
  betaTimer = window.setInterval(() => {
    betaNow.value = new Date()
  }, 60 * 1000)

  if (betaExpired.value) return
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
  settingsStore.applyAccentColor()
  settingsStore.applyThemeMode()

  // Listen for play-sound events from main process
  window.electronAPI?.onPlaySound?.(onPlaySound)

  // Prompt user to configure workspace root if not set
  // Skip on login/onboarding routes (noLayout pages)
  const isNoLayoutRoute = route.matched.some((r) => r.meta?.noLayout)
  if (!isNoLayoutRoute && !settingsStore.isWorkspaceReady) {
    showStartupGuide.value = true
  }
})

onBeforeUnmount(() => {
  if (betaTimer) window.clearInterval(betaTimer)
})
</script>

<template>
  <div :class="themeClass" class="h-full w-full">
    <BetaExpiredScreen v-if="betaExpired" :release="BETA_RELEASE" />
    <template v-else>
      <router-view v-if="!showLayout" />
      <AppLayout v-else :icon-rail-width="iconRailWidth">
        <router-view />
      </AppLayout>
      <MsMessageContainer />
      <CommandPalette :visible="commandPaletteVisible" @close="commandPaletteVisible = false" />
      <StartupGuideModal v-model:show="showStartupGuide" />

      <!-- Update notification -->
      <MsModal v-model:show="showUpdateModal" :width="380" :show-footer="true" :closable="true">
        <template #header>
          <div class="flex items-center gap-2.5">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center"
              :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
              <i class="ri-upload-2-line text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
            </div>
            <div>
              <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">发现新版本</div>
              <div class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                v{{ updateInfo?.version }} 可用
              </div>
            </div>
          </div>
        </template>

        <div class="space-y-3" v-if="updateInfo">
          <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            新版本
            <span class="font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-500'">
              v{{ updateInfo.version }}
            </span>
            已发布，建议更新以获得最新功能和修复。
          </p>
          <div
            v-if="updateInfo.releaseNotes"
            class="rounded-lg p-3 text-[11px] max-h-[120px] overflow-y-auto"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrF text-lt-aux'">
            {{ updateInfo.releaseNotes }}
          </div>

          <!-- Download progress -->
          <div v-if="downloading" class="space-y-2">
            <div class="flex items-center justify-between text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
              <span>正在下载更新...</span>
              <span>{{ downloadProgress }}%</span>
            </div>
            <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
              <div
                class="h-full rounded-full bg-brand-400 transition-all duration-300"
                :style="`width: ${downloadProgress}%`" />
            </div>
          </div>
        </div>

        <template #footer>
          <template v-if="!downloading && !downloaded">
            <button
              @click="showUpdateModal = false"
              class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
              稍后再说
            </button>
            <button
              @click="downloadUpdate"
              class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
              :class="
                isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'
              ">
              <i class="ri-download-line text-[11px]" />
              立即下载
            </button>
          </template>
          <template v-if="downloaded">
            <button
              @click="installUpdate"
              class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
              :class="
                isDark
                  ? 'bg-emerald-400 text-d0 hover:bg-emerald-500'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              ">
              <i class="ri-restart-line text-[11px]" />
              重启并安装
            </button>
          </template>
        </template>
      </MsModal>
    </template>
  </div>
</template>
