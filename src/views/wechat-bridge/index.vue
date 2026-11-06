<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useWechatBotStore } from '@/stores/wechatBot'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import MainContent from '@/components/layout/MainContent.vue'
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const botStore = useWechatBotStore()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)
const COLOR_BG = { brand:{d:'bg-brand-400/15',l:'bg-brand-50'}, agent:{d:'bg-agent-400/15',l:'bg-agent-50'}, blue:{d:'bg-blue-400/15',l:'bg-blue-50'}, amber:{d:'bg-amber-400/15',l:'bg-amber-50'}, emerald:{d:'bg-emerald-400/15',l:'bg-emerald-50'}, rose:{d:'bg-rose-400/15',l:'bg-rose-50'} }
const COLOR_FG = { brand:{d:'text-brand-400',l:'text-brand-500'}, agent:{d:'text-agent-400',l:'text-agent-500'}, blue:{d:'text-blue-400',l:'text-blue-500'}, amber:{d:'text-amber-400',l:'text-amber-500'}, emerald:{d:'text-emerald-400',l:'text-emerald-500'}, rose:{d:'text-rose-400',l:'text-rose-500'} }
function iconBg(c){ const m=COLOR_BG[c]; return m?(isDark.value?m.d:m.l):(isDark.value?'bg-d4':'bg-l4') }
function iconColor(c){ const m=COLOR_FG[c]; return m?(isDark.value?m.d:m.l):(isDark.value?'text-wt-aux':'text-lt-aux') }
const tabs = [
    { key: 'connection', name: '微信bot连接', icon: 'ri-link', color: 'brand', hint: '扫码连接微信后即可使用' },
    { key: 'agent', name: 'Agent助手', icon: 'ri-robot-2-line', color: 'agent', hint: '选择微信对话使用的 Agent' },
  { key: 'memory', name: '对话存储', icon: 'ri-database-2-line', color: 'blue', hint: '对话是否保存与历史轮数' },
  { key: 'files', name: '文档管理', icon: 'ri-folder-3-line', color: 'brand', hint: '图片临时目录与导入文件' },
  { key: 'reminder', name: '任务提醒', icon: 'ri-alarm-line', color: 'amber', hint: '每日、每周与一次性提醒' },
  { key: 'log', name: '消息记录', icon: 'ri-history-line', color: 'emerald', hint: '查看微信消息往来' },
    { key: 'help', name: '使用帮助', icon: 'ri-question-line', color: 'rose', hint: '快速上手与指令速查' },
]
const activeTab = computed(() => {
  const m = route.path.match(/^\/wechat-bridge\/([a-z]+)/)
  return m ? m[1] : 'connection'
})
const currentTab = computed(() => tabs.find(t => t.key === activeTab.value) || tabs[0])
const dotClass = computed(() => {
  switch (botStore.connectionStatus) {
    case 'connected': return isDark.value ? 'bg-emerald-400' : 'bg-emerald-500'
    case 'scanning': return isDark.value ? 'bg-amber-400' : 'bg-amber-500'
    case 'expired': return 'bg-red-500'
    default: return isDark.value ? 'bg-white/25' : 'bg-l4'
  }
})
const retryMin = computed(() => botStore.retryAfterMs ? Math.ceil(botStore.retryAfterMs / 60000) : null)
const statusIconClass = computed(() => botStore.connectionStatus === 'connected' ? 'ri-wechat-line' : botStore.connectionStatus === 'scanning' ? 'ri-qr-scan-2-line' : botStore.connectionStatus === 'expired' ? 'ri-error-warning-line' : 'ri-shut-down-line')
const statusIconBg = computed(() => botStore.connectionStatus === 'connected' ? (isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : botStore.connectionStatus === 'scanning' ? (isDark.value ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600') : botStore.connectionStatus === 'expired' ? (isDark.value ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-500') : (isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'))
const statusMainText = computed(() => botStore.connectionStatus === 'connected' ? '已连接' : botStore.connectionStatus === 'scanning' ? '扫码中' : botStore.connectionStatus === 'expired' ? '已过期' : '未连接')
const statusSubText = computed(() => botStore.connectionStatus === 'connected' ? '微信对话可用' : botStore.connectionStatus === 'scanning' ? '等待手机确认' : botStore.connectionStatus === 'expired' ? (retryMin.value ? retryMin.value + ' 分钟后可重试' : '可重新登录') : '点击扫码连接')
const statusTextClass = computed(() => botStore.connectionStatus === 'connected' ? (isDark.value ? 'text-emerald-400' : 'text-emerald-600') : botStore.connectionStatus === 'scanning' ? (isDark.value ? 'text-amber-400' : 'text-amber-600') : botStore.connectionStatus === 'expired' ? (isDark.value ? 'text-red-400' : 'text-red-500') : (isDark.value ? 'text-wt-sub' : 'text-lt-sub'))
const statusBtnClass = computed(() => botStore.connectionStatus === 'connected' ? (isDark.value ? 'bg-emerald-400/5 border border-emerald-400/20 hover:border-emerald-400/40' : 'bg-emerald-50/40 border border-emerald-200/60 hover:border-emerald-300') : botStore.connectionStatus === 'scanning' ? (isDark.value ? 'bg-amber-400/5 border border-amber-400/20 hover:border-amber-400/40' : 'bg-amber-50/40 border border-amber-200/60 hover:border-amber-300') : botStore.connectionStatus === 'expired' ? (isDark.value ? 'bg-red-400/5 border border-red-400/20 hover:border-red-400/40' : 'bg-red-50/40 border border-red-200/60 hover:border-red-300') : (isDark.value ? 'bg-d0 border border-d4 hover:border-d3' : 'bg-l2 border border-bdrL hover:border-bdrF'))
onMounted(() => { botStore.init() })
</script>
<template>
  <div class="wechat-bot flex h-full overflow-hidden">
    <LeftPanel :width="244" :resizable="false">
      <div class="h-10 flex items-center gap-2 px-4" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <i class="ri-wechat-line text-[15px]" :class="isDark ? 'text-emerald-400' : 'text-emerald-500'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">微信助手</span>
        <span
          class="ctx-pill font-mono"
          :class="isDark ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-100'"
        >Beta</span>
      </div>
      <div class="flex-1 overflow-y-auto px-2 py-2">
        <div class="space-y-0.5">
          <button v-for="t in tabs" :key="t.key" class="section-nav-item w-full flex items-center gap-2 px-2 py-[7px] rounded-md relative" :class="activeTab === t.key ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="router.push('/wechat-bridge/' + t.key)">
            <span v-show="activeTab === t.key" class="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r" :style="{ backgroundColor: accentHex }" />
            <div class="w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0" :class="activeTab === t.key ? (isDark ? 'bg-d0' : 'bg-l2') : ''">
              <i :class="[t.icon, 'text-[16px]', activeTab === t.key ? iconColor(t.color) : (isDark ? 'text-wt-aux' : 'text-lt-aux')]" />
            </div>
            <span class="text-[14.5px] font-medium flex-1 text-left leading-none">{{ t.name }}</span>
          </button>
        </div>
      </div>
      <button class="mx-2 my-2 rounded-lg px-2 py-2 flex items-center gap-2 text-left transition" :class="statusBtnClass" @click="router.push('/wechat-bridge/connection')">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 relative" :class="statusIconBg">
          <i :class="statusIconClass" class="text-[16px]" />
          <span v-if="botStore.isScanning" class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[12.5px] font-medium truncate" :class="statusTextClass">{{ statusMainText }}</div>
          <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ statusSubText }}</div>
        </div>
        <i class="ri-arrow-right-s-line text-[20px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      </button>
    </LeftPanel>
    <MainContent padding="p-0">
      <div class="h-full flex flex-col">
        <div class="h-10 flex items-center justify-between px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <div class="flex items-center gap-2 min-w-0">
            <i :class="[currentTab.icon, 'text-[14px]', isDark ? 'text-wt-aux' : 'text-lt-aux']" />
            <span class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ currentTab.name }}</span>
          </div>
          <span class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ currentTab.hint }}</span>
        </div>
        <div class="flex-1 overflow-y-auto">
          <router-view />
        </div>
      </div>
    </MainContent>
  </div>
</template>
<style>
.wechat-bot .toggle{width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.wechat-bot .toggle::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.wechat-bot .toggle.on{background:var(--brand)}
.wechat-bot .toggle.on::after{transform:translateX(14px)}
.wechat-bot .toggle.off{background:#555568}
.wechat-bot .toggle.light-off{background:#b0b0ba}
.wechat-bot .slider{-webkit-appearance:none;height:5px;border-radius:3px;background:var(--border-panel,#dddcd9);outline:none}
.wechat-bot .slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--brand);cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(74,108,255,.3)}
</style>
