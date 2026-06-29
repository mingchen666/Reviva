<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { formatBetaDate } from '@/config/beta'

const props = defineProps({
  release: { type: Object, required: true },
})

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const expiredAtText = computed(() => formatBetaDate(props.release.expiresAt))

async function openDownload() {
  const url = props.release.downloadUrl
  const result = await window.electronAPI?.openExternal?.(url)
  if (!result || result.success === false) window.open(url, '_blank', 'noopener,noreferrer')
}

function quitApp() {
  if (window.electronAPI?.quit) {
    window.electronAPI.quit()
    return
  }
  window.electronAPI?.window?.close?.()
}
</script>

<template>
  <div class="h-full w-full flex items-center justify-center px-6"
    :class="isDark ? 'bg-d0 text-wt-main' : 'bg-l0 text-lt-main'">
    <section class="w-full max-w-[460px] rounded-xl p-5"
      :class="isDark ? 'bg-d3 border border-bdr shadow-2xl shadow-black/50' : 'bg-l2 border border-bdrF shadow-2xl shadow-black/10'">
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-600'">
          <i class="ri-time-line text-[20px]" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-[16px] font-bold leading-tight">当前内测版本已过期</h1>
          <p class="mt-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">
            请下载最新版 {{ release.productName }} 后继续使用。
          </p>
        </div>
      </div>

      <div class="mt-4 rounded-lg p-3 space-y-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-3 text-[11px]">
          <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">内测批次</span>
          <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ release.batch }}</span>
        </div>
        <div class="flex items-center justify-between gap-3 text-[11px]">
          <span :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">到期时间</span>
          <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ expiredAtText }}</span>
        </div>
      </div>

      <p class="mt-3 text-[11px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        内测包按批次开放使用。到期后旧版本将停止进入主界面，请安装新批次版本。
      </p>

      <div class="mt-5 flex items-center justify-end gap-2">
        <button
          class="h-8 px-3.5 rounded-lg text-[12px] font-medium transition-colors"
          :class="isDark ? 'bg-d4 text-wt-sub border border-bdr hover:bg-d0 hover:text-wt-main' : 'bg-l3 text-lt-sub border border-bdrF hover:bg-l4 hover:text-lt-main'"
          @click="quitApp"
        >
          退出应用
        </button>
        <button
          class="h-8 px-4 rounded-lg text-[12px] font-semibold transition-colors flex items-center gap-1.5"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'"
          @click="openDownload"
        >
          <i class="ri-download-line text-[13px]" />
          下载最新版
        </button>
      </div>
    </section>
  </div>
</template>
