<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'

const appStore = useAppStore()
const ss = useSettingsStore()
const isDark = computed(() => appStore.isDark)

const SOUND_OPTIONS = [
  { value: 'complete', label: '完成' },
  { value: 'chime', label: '风铃' },
  { value: 'message', label: '消息' },
  { value: 'drop', label: '水滴' },
  { value: 'error', label: '错误' },
]

const notificationItems = [
  { key: 'notifyTaskDone', label: '任务完成通知', desc: 'Agent 完成任务时发送桌面通知', icon: 'ri-checkbox-circle-line', color: 'emerald' },
  { key: 'notifyTaskFailed', label: '任务失败通知', desc: 'Agent 任务执行失败时发送桌面通知', icon: 'ri-error-warning-line', color: 'red' },
  { key: 'notifySound', label: '通知声音', desc: '收到通知时播放提示音', icon: 'ri-volume-up-line', color: 'blue' },
  { key: 'notifyDND', label: '勿扰模式', desc: '暂停所有桌面通知和声音', icon: 'ri-moon-line', color: 'amber' },
]

const startupItems = [
  { key: 'autoStart', label: '开机自启动', desc: '系统启动时自动运行 Reviva', icon: 'ri-rocket-line', color: 'brand' },
  { key: 'minimizeToTray', label: '关闭时最小化到托盘', desc: '关闭窗口时保持后台运行', icon: 'ri-arrow-down-s-line', color: 'agent' },
  { key: 'trayIcon', label: '显示托盘图标', desc: '在系统托盘区显示 Reviva 图标', icon: 'ri-layout-bottom-line', color: 'emerald' },
  { key: 'singleInstance', label: '单实例运行', desc: '禁止同时运行多个 Reviva 进程', icon: 'ri-shield-check-line', color: 'amber' },
]

function toggle(key) { ss.savePreference(key, !ss[key]) }

function previewSound() {
  if (window.electronAPI?.playSound) {
    window.electronAPI.playSound(ss.notifySoundType || 'complete')
  }
}

function getIconBg(item, isDarkMode) {
  const colorMap = {
    emerald: isDarkMode ? 'bg-emerald-400/15' : 'bg-emerald-50',
    red: isDarkMode ? 'bg-red-400/15' : 'bg-red-50',
    blue: isDarkMode ? 'bg-blue-400/15' : 'bg-blue-50',
    amber: isDarkMode ? 'bg-amber-400/15' : 'bg-amber-50',
    brand: isDarkMode ? 'bg-brand-400/15' : 'bg-brand-50',
    agent: isDarkMode ? 'bg-agent-400/15' : 'bg-agent-50',
  }
  return colorMap[item.color] || (isDarkMode ? 'bg-d4' : 'bg-l4')
}

function getIconColor(item, isDarkMode) {
  const colorMap = {
    emerald: isDarkMode ? 'text-emerald-400' : 'text-emerald-500',
    red: isDarkMode ? 'text-red-400' : 'text-red-500',
    blue: isDarkMode ? 'text-blue-400' : 'text-blue-500',
    amber: isDarkMode ? 'text-amber-400' : 'text-amber-500',
    brand: isDarkMode ? 'text-brand-400' : 'text-brand-500',
    agent: isDarkMode ? 'text-agent-400' : 'text-agent-500',
  }
  return colorMap[item.color] || (isDarkMode ? 'text-wt-aux' : 'text-lt-aux')
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-2 lg:px-6 py-4 space-y-3">
    <!-- Desktop Notifications Card -->
    <section class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="section-title flex items-center gap-2 px-4 pt-4 pb-2.5">
        <span class="w-[3px] h-3.5 rounded-full bg-amber-400 shrink-0" />
        <i class="ri-notification-3-line text-[14px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">桌面通知</span>
      </div>

      <div class="px-4 pb-3.5 space-y-0.5">
        <div
          v-for="item in notificationItems"
          :key="item.key"
          class="row flex items-center gap-2.5 rounded-lg px-3 py-3"
          :class="isDark ? 'hover:bg-d3/50' : 'hover:bg-l3/50'"
        >
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="getIconBg(item, isDark)">
            <i :class="`${item.icon} text-[13px] ${getIconColor(item, isDark)}`" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-[12.5px] font-medium leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.label }}</div>
            <div class="text-[11px] mt-0.5 leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div>
          </div>

          <button
            class="toggle shrink-0"
            :class="ss[item.key] ? 'on' : (isDark ? 'off' : 'light-off')"
            @click="toggle(item.key)"
          />
        </div>

        <!-- Sound type selector (only visible when sound is enabled) -->
        <div v-if="ss.notifySound && !ss.notifyDND"
          class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 ml-9.5"
          :class="isDark ? 'bg-d3/30' : 'bg-l3/30'"
        >
          <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">提示音风格</span>
          <div class="flex items-center gap-1.5 flex-1">
            <button
              v-for="opt in SOUND_OPTIONS"
              :key="opt.value"
              class="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
              :class="(ss.notifySoundType || 'complete') === opt.value
                ? (isDark ? 'bg-brand-400/15 text-brand-400 border border-brand-400/30' : 'bg-brand-50 text-brand-600 border border-brand-200')
                : (isDark ? 'bg-d4 text-wt-dim border border-transparent hover:border-bdr' : 'bg-l4 text-lt-aux border border-transparent hover:border-bdrF')"
              @click="ss.savePreference('notifySoundType', opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button
            class="w-5 h-5 rounded-md flex items-center justify-center transition-all"
            :class="isDark ? 'hover:bg-d4 text-wt-dim hover:text-wt-sub' : 'hover:bg-l4 text-lt-aux hover:text-lt-sub'"
            @click="previewSound"
            title="试听"
          >
            <i class="ri-play-mini-fill text-[11px]" />
          </button>
        </div>
      </div>
    </section>

    <!-- Startup & Tray Card -->
    <section class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="section-title flex items-center gap-2 px-4 pt-4 pb-2.5">
        <span class="w-[3px] h-3.5 rounded-full bg-brand-400 shrink-0" />
        <i class="ri-shut-down-line text-[14px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">启动与托盘</span>
      </div>

      <div class="px-4 pb-3.5 space-y-0.5">
        <div
          v-for="item in startupItems"
          :key="item.key"
          class="row flex items-center gap-2.5 rounded-lg px-3 py-3"
          :class="isDark ? 'hover:bg-d3/50' : 'hover:bg-l3/50'"
        >
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="getIconBg(item, isDark)">
            <i :class="`${item.icon} text-[13px] ${getIconColor(item, isDark)}`" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="text-[12.5px] font-medium leading-tight" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item.label }}</div>
            <div class="text-[11px] mt-0.5 leading-tight" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.desc }}</div>
          </div>

          <button
            class="toggle shrink-0"
            :class="ss[item.key] ? 'on' : (isDark ? 'off' : 'light-off')"
            @click="toggle(item.key)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.toggle{width:30px;height:17px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle::after{content:'';position:absolute;width:13px;height:13px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.toggle.on{background:var(--brand)}
.toggle.on::after{transform:translateX(13px)}
.toggle.off{background:#555568}
.toggle.light-off{background:#b0b0ba}
</style>