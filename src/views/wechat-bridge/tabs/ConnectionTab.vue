<script setup>
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useAppStore } from '@/stores/app'
import { useWechatBotStore } from '@/stores/wechatBot'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'
const appStore = useAppStore()
const botStore = useWechatBotStore()
const msg = useMessage()
const mbox = useMessageBox()
const isDark = computed(() => appStore.isDark)
const status = computed(() => botStore.connectionStatus)
const retryMin = computed(() => botStore.retryAfterMs ? Math.ceil(botStore.retryAfterMs / 60000) : null)
const qrImg = ref('')
watch(() => botStore.qrUrl, async (url) => {
  if (!url) { qrImg.value = ''; return }
  try { qrImg.value = await QRCode.toDataURL(url, { width: 280, margin: 1 }) }
  catch (e) { qrImg.value = '' }
}, { immediate: true })
async function scan() { await botStore.login(); msg.info('请用微信扫码确认绑定') }
async function disconnect() {
  const confirmed = await mbox.confirm({
    title: '退出微信登录',
    subtitle: '将断开当前微信 ClawBot 连接',
    message: '退出后需要重新扫码才能恢复，已保存的推送凭证也会清除。',
    variant: 'warning', confirmText: '退出', cancelText: '取消',
  })
  if (!confirmed) return
  await botStore.logout()
  msg.success('已退出微信ClawBot登录')
}
async function toggleService() { await botStore.setConfig({ enabled: !botStore.config.enabled }); msg.success(botStore.config.enabled ? 'Bot 已开启' : 'Bot 已关闭') }
const statusIcon = computed(() => {
  if (!botStore.config.enabled) return 'ri-shut-down-line'
  if (status.value === 'connected') return 'ri-wechat-fill'
  if (status.value === 'scanning') return 'ri-qr-scan-2-line'
  if (status.value === 'expired') return 'ri-error-warning-line'
  return 'ri-wechat-fill'
})
const statusIconBg = computed(() => {
  if (!botStore.config.enabled) return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
  if (status.value === 'connected') return isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
  if (status.value === 'scanning') return isDark.value ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'
  if (status.value === 'expired') return isDark.value ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-600'
  return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
})
const statusTitle = computed(() => {
  if (!botStore.config.enabled) return 'Bot 未启用'
  if (status.value === 'connected') return '微信已连接'
  if (status.value === 'scanning') return '扫码连接中'
  if (status.value === 'expired') return '会话已过期'
  return '微信未连接'
})
const statusDesc = computed(() => {
  if (!botStore.config.enabled) return '开启后即可扫码连接微信'
  if (status.value === 'connected') return '现在可以在微信里使用 Agent'
  if (status.value === 'scanning') return '请用微信扫码并确认登录'
  if (status.value === 'expired') return '等待暂停窗口结束后重新登录'
  return '扫码后即可在微信里使用 Agent'
})
const badgeClass = computed(() => {
  if (!botStore.config.enabled) return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
  if (status.value === 'connected') return isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
  if (status.value === 'scanning') return isDark.value ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'
  if (status.value === 'expired') return isDark.value ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-600'
  return isDark.value ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'
})

const scanSteps = ['用绑定的微信扫码', '在手机上确认登录', '确认后自动连接']
</script>
<template>
  <div class="max-w-5xl mx-auto px-6 py-5 space-y-4">
    <!-- 模块简介 -->
    <div class="flex items-center gap-2.5 px-1">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">
        <i class="ri-wechat-line text-[15px]" />
      </div>
      <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
        微信助手 — 扫码绑定微信后，在私聊里即可使用 AI 对话、导入文件、接收提醒，无需打开电脑。
      </p>
    </div>
    <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="px-5 py-4 flex items-center gap-3.5 border-b" :class="isDark ? 'border-d4' : 'border-bdrF'">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="statusIconBg">
          <i :class="statusIcon" class="text-[24px]" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ statusTitle }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="badgeClass">{{ botStore.statusText }}</span>
          </div>
          <div class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ statusDesc }}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0 pl-3" :class="isDark ? 'border-l border-d4' : 'border-l border-bdrF'">
          <span class="text-[15px] font-medium">是否启用Bot</span>
          <div class="toggle" :class="botStore.config.enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleService" />
        </div>
      </div>
      <div v-if="!botStore.config.enabled" class="p-6 flex flex-col items-center text-center">
        <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">
          <i class="ri-shut-down-line text-[28px]" />
        </div>
        <h4 class="text-[14px] font-semibold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Bot 功能未启用</h4>
        <p class="text-[12px] mb-4 max-w-[300px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">开启后即可扫码连接微信ClawBot，在私聊里使用 Agent 对话、接收提醒</p>
        <button class="h-9 px-4 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600" @click="toggleService">
          <i class="ri-power-line" />启用微信 ClawBot
        </button>
      </div>
      <div v-else-if="status === 'disconnected'" class="p-6 flex flex-col items-center text-center">
        <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3" :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">
          <i class="ri-qr-code-line text-[28px]" />
        </div>
        <h4 class="text-[14px] font-semibold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">扫码连接微信</h4>
        <p class="text-[12px] mb-4 max-w-[300px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">连接后即可在微信里给 Bot 发消息，使用 Agent 对话、导入文件、接收提醒</p>
        <button class="h-9 px-4 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5" :class="botStore.available ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-emerald-400/50 cursor-not-allowed'" :disabled="!botStore.available" @click="scan">
          <i class="ri-qr-code-line" />扫码登录
        </button>
        <div v-if="!botStore.available" class="mt-2.5 text-[11px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'">主进程服务尚未就绪</div>
      </div>
      <div v-else-if="status === 'scanning'" class="p-5 flex gap-5 items-start">
        <div class="w-[200px] h-[200px] rounded-xl p-2.5 shrink-0 flex items-center justify-center bg-white border" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <img v-if="qrImg" :src="qrImg" alt="QR" class="w-full h-full" />
          <div v-else class="flex flex-col items-center text-center">
            <i class="ri-loader-4-line animate-spin text-[26px] text-wt-dim" />
            <div class="text-[11px] mt-1.5 text-wt-dim">二维码获取中…</div>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h4 class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">等待微信扫码确认</h4>
          </div>
          <p class="text-[11.5px] mb-3" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">用绑定的微信扫码，并在手机上确认登录。</p>
          <div class="space-y-2">
            <div v-for="(step, i) in scanSteps" :key="i" class="flex items-center gap-2.5">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" :class="isDark ? 'bg-amber-400/15 text-amber-400' : 'bg-amber-50 text-amber-600'">{{ i + 1 }}</span>
              <span class="text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ step }}</span>
            </div>
          </div>
          <button class="mt-3.5 h-8 px-3.5 rounded-lg text-[11.5px] font-medium flex items-center gap-1.5" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:bg-white/5' : 'bg-l3 border border-bdrF text-lt-sub hover:bg-l4'" @click="scan">
            <i class="ri-refresh-line" />重新获取二维码
          </button>
        </div>
      </div>
      <div v-else-if="status === 'connected'" class="px-5 py-3.5 flex items-center gap-3">
        <i class="ri-user-3-line text-[15px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <span class="text-[12px] font-mono truncate flex-1 min-w-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ botStore.botInfo?.userId || '—' }}</span>
        <button class="h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors shrink-0" :class="isDark ? 'bg-red-500/10 border border-red-400/30 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border border-red-200 text-red-500 hover:bg-red-100'" @click="disconnect">
          <i class="ri-logout-box-r-line text-[13px]" />退出登录
        </button>
      </div>
      <div v-else-if="status === 'expired'" class="p-5 flex items-start gap-3.5">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-500'">
          <i class="ri-timer-flash-line text-[20px]" />
        </div>
        <div class="flex-1">
          <div class="text-[13px] font-semibold" :class="isDark ? 'text-red-400' : 'text-red-500'">会话已过期</div>
          <div class="text-[11.5px] mt-1 leading-relaxed" :class="isDark ? 'text-red-400/80' : 'text-red-500/80'">微信连接约 24 小时后过期。过期后约 1 小时暂停窗口，期间无法重新扫码。{{ retryMin ? '约 ' + retryMin + ' 分钟后可重新登录。' : '' }}</div>
          <button class="mt-3 h-8 px-3.5 rounded-lg text-[11.5px] font-semibold text-white flex items-center gap-1.5" :class="retryMin ? 'bg-red-400/60 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'" :disabled="!!retryMin" @click="scan">
            <i class="ri-refresh-line" />{{ retryMin ? retryMin + ' 分钟后可重试' : '重新登录' }}
          </button>
        </div>
      </div>
    </div>
    <!-- 功能介绍 -->
    <div class="rounded-xl p-5" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="text-[12px] font-semibold mb-3.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">连接后可以做什么</div>
      <div class="grid grid-cols-2 gap-3.5">
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'"><i class="ri-wechat-2-line text-[18px]" /></div>
          <div class="min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">微信对话</div>
            <div class="text-[10.5px] mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">在私聊里跟 AI 对话，不用开电脑</div>
          </div>
        </div>
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-blue-400/10 text-blue-400' : 'bg-blue-50 text-blue-500'"><i class="ri-file-upload-line text-[18px]" /></div>
          <div class="min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">文件导入</div>
            <div class="text-[10.5px] mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">发文件或链接自动导入知识库</div>
          </div>
        </div>
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600'"><i class="ri-alarm-line text-[18px]" /></div>
          <div class="min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">定时提醒</div>
            <div class="text-[10.5px] mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">到点自动推送提醒到微信</div>
          </div>
        </div>
        <div class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'"><i class="ri-image-line text-[18px]" /></div>
          <div class="min-w-0">
            <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">图片识别</div>
            <div class="text-[10.5px] mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">发图片让 AI 看图分析</div>
          </div>
        </div>
      </div>
    </div>
    <!-- 使用提示 -->
    <div class="rounded-xl p-4" :class="isDark ? 'bg-d2 border border-bdr' : 'bg-l2 border border-bdrF'">
      <div class="text-[12px] font-semibold mb-2.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">使用提示</div>
      <div class="space-y-2">
        <div class="flex items-start gap-2">
          <span class="w-4 h-4 flex items-center justify-center shrink-0 mt-px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-send-plane-line text-[13px]" /></span>
          <span class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">首次使用需先在微信里给 Bot 发一条消息，建立推送通道后才能收到主动提醒。</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="w-4 h-4 flex items-center justify-center shrink-0 mt-px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-refresh-line text-[13px]" /></span>
          <span class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">关闭 Reviva 后 Bot 自动停止；重启后若凭证有效则自动恢复连接，无需重新扫码。</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="w-4 h-4 flex items-center justify-center shrink-0 mt-px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-timer-flash-line text-[13px]" /></span>
          <span class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">微信连接约 24 小时后过期，过期后约 1 小时内无法重新扫码。</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="w-4 h-4 flex items-center justify-center shrink-0 mt-px" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"><i class="ri-settings-3-line text-[13px]" /></span>
          <span class="text-[11.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">Agent 需绑定模型，或在设置中配置默认对话模型，否则 Bot 无法回复。</span>
        </div>
      </div>
    </div>
  </div>
</template>
