<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const mbox = useMessageBox()

const loading = ref(true)
const saving = ref(false)
const status = ref(null)
const port = ref('1210')
const lanHost = ref('')
const visibleKey = ref('')
const showKey = ref(false)

const gateway = () => window.electronAPI?.localGateway
const available = computed(() => !!gateway())
const running = computed(() => !!status.value?.running)
const keyConfigured = computed(() => !!status.value?.apiKey?.configured)
const serviceAddress = computed(() => status.value?.address || `http://127.0.0.1:${port.value || 1210}`)
const maskedKey = computed(() => keyConfigured.value ? `msk_••••••••••••••••••••••••••••${status.value?.apiKey?.hint || ''}` : '尚未创建')
const displayedKey = computed(() => showKey.value && visibleKey.value ? visibleKey.value : maskedKey.value)

function isLanIpv4(value) {
  const parts = String(value || '').trim().split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false
  const first = Number(parts[0])
  return first !== 0 && first !== 127 && first < 224
}

async function refreshStatus() {
  if (!available.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const next = await gateway().getStatus()
    status.value = next
    port.value = String(next?.configuredPort || 1210)
    lanHost.value = next?.lanHost || ''
  } catch (error) {
    msg.error(error?.message || '无法读取本地开放服务状态')
  } finally {
    loading.value = false
  }
}

async function updateConfig(patch, successText = '') {
  if (!available.value || saving.value) return
  saving.value = true
  try {
    status.value = await gateway().updateConfig(patch)
    port.value = String(status.value?.configuredPort || 1210)
    if (successText) msg.success(successText)
  } catch (error) {
    msg.error(error?.message || '保存本地开放服务设置失败')
    await refreshStatus()
  } finally {
    saving.value = false
  }
}

async function toggleService() {
  await updateConfig({ enabled: !status.value?.enabled }, status.value?.enabled ? '本地开放服务已关闭' : '本地开放服务已开启')
}

async function savePort() {
  const value = Number(port.value)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    msg.warning('端口必须是 1 到 65535 之间的整数')
    port.value = String(status.value?.configuredPort || 1210)
    return
  }
  if (value === Number(status.value?.configuredPort || 1210)) return
  await updateConfig({ port: value }, '端口设置已保存')
}

async function toggleLan() {
  if (!status.value?.lanEnabled && !isLanIpv4(lanHost.value)) {
    msg.warning('请先填写有效的局域网 IPv4 地址，例如 192.168.1.20')
    return
  }
  await updateConfig({
    lanEnabled: !status.value?.lanEnabled,
    lanHost: lanHost.value.trim(),
  }, status.value?.lanEnabled ? '局域网访问已关闭' : '局域网访问已开启')
}

async function saveLanHost() {
  const value = lanHost.value.trim()
  if (value && !isLanIpv4(value)) {
    msg.warning('请输入有效的局域网 IPv4 地址')
    return
  }
  if (value === String(status.value?.lanHost || '')) return
  await updateConfig({ lanHost: value }, '局域网地址已保存')
}

async function createKey() {
  if (!available.value) return
  try {
    const result = await gateway().createKey()
    visibleKey.value = result.key
    showKey.value = true
    await refreshStatus()
    msg.success('API Key 已创建，可以随时显示、隐藏或复制')
  } catch (error) {
    msg.error(error?.message || '创建 API Key 失败')
  }
}

async function resetKey() {
  const confirmed = await mbox.confirm({
    title: '重新生成 API Key',
    subtitle: '所有正在使用旧 Key 的集成会立即失效',
    message: '重新生成后，完整 Key 只在当前页面显示。请及时复制并更新浏览器插件、CLI 或其他软件。',
    variant: 'warning',
    confirmText: '重新生成',
    cancelText: '取消',
  })
  if (!confirmed) return
  try {
    const result = await gateway().resetKey()
    visibleKey.value = result.key
    showKey.value = true
    await refreshStatus()
    msg.success('API Key 已重新生成')
  } catch (error) {
    msg.error(error?.message || '重新生成 API Key 失败')
  }
}

async function copyText(text, successText) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    msg.success(successText)
  } catch {
    msg.error('复制失败，请手动复制')
  }
}

async function toggleKeyVisibility() {
  if (!keyConfigured.value) return
  if (!visibleKey.value) {
    try {
      visibleKey.value = await gateway().getKey()
    } catch (error) {
      msg.error(error?.message || '读取 API Key 失败')
      return
    }
  }
  if (!visibleKey.value) {
    msg.error('当前系统无法读取已保存的 API Key，请重新生成')
    return
  }
  showKey.value = !showKey.value
}

async function restartService() {
  if (!available.value || saving.value) return
  saving.value = true
  try {
    status.value = await gateway().restart()
    msg.success('本地开放服务已重启')
  } catch (error) {
    msg.error(error?.message || '重启服务失败')
  } finally {
    saving.value = false
  }
}

onMounted(refreshStatus)
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <div class="rounded-xl p-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/20' : 'bg-blue-50/60 border border-blue-100'">
      <div class="flex items-start gap-2.5">
        <i class="ri-router-line text-brand-400 text-[15px] mt-[1px]" />
        <div class="flex-1 min-w-0">
          <div class="text-[12px] font-semibold mb-0.5" :class="isDark ? 'text-brand-400' : 'text-brand-600'">Reviva 网关服务</div>
          <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">允许浏览器扩展、IDE、CLI 和其他服务通过 HTTP 调用 Reviva 已公开的能力。局域网 HTTP 为明文传输，只应在可信网络中开启。</p>
        </div>
      </div>
    </div>

    <div v-if="!available" class="rounded-xl p-4" :class="isDark ? 'bg-red-400/6 border border-red-400/20' : 'bg-red-50 border border-red-100'">
      <div class="text-[12px] font-semibold text-red-400">当前版本未加载本地开放服务</div>
    </div>

    <template v-else>
      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center" :class="running ? (isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux')">
              <i :class="running ? 'ri-wifi-line' : 'ri-wifi-off-line'" class="text-[17px]" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">服务状态</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="running ? (isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux')">{{ loading ? '读取中' : running ? '运行中' : '已停止' }}</span>
              </div>
              <div class="text-[11px] font-mono truncate mt-0.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ serviceAddress }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="h-8 px-3 rounded-lg text-[11px] font-medium disabled:opacity-40" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:bg-white/5' : 'bg-l2 border border-bdrF text-lt-sub hover:bg-l4'" :disabled="saving || !status?.enabled" @click="restartService">
              <i class="ri-refresh-line mr-1" />重启
            </button>
            <div class="toggle" :class="status?.enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleService" />
          </div>
        </div>
      </div>

      <div class="rounded-xl p-4 space-y-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div>
          <div class="flex items-center gap-2 mb-1"><i class="ri-router-line text-brand-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">监听设置</span></div>
          <p class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本机访问始终绑定 127.0.0.1；开启局域网时需要填写本机局域网 IPv4 地址。</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">端口</label>
            <input v-model="port" type="number" min="1" max="65535" class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-400'" @blur="savePort">
          </div>
          <div>
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本机地址</label>
            <div class="h-9 px-3 rounded-lg flex items-center justify-between font-mono text-[11px]" :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrF text-lt-aux'">
              <span class="truncate">http://127.0.0.1:{{ port || 1210 }}</span>
              <button class="ml-2" @click="copyText(`http://127.0.0.1:${port || 1210}`, '本机地址已复制')"><i class="ri-file-copy-line" /></button>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">允许局域网访问</div>
              <div class="text-[10px] mt-0.5" :class="isDark ? 'text-amber-400' : 'text-amber-600'">HTTP 会明文传输 Key 和内容，请勿在公共 Wi-Fi 中开启。</div>
            </div>
            <div class="toggle" :class="status?.lanEnabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleLan" />
          </div>
          <div class="mt-3">
            <label class="block text-[10px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">局域网监听地址</label>
            <input v-model="lanHost" type="text" placeholder="192.168.1.20" class="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-amber-400'" @blur="saveLanHost">
          </div>
        </div>
      </div>

      <div class="rounded-xl p-4 space-y-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2"><i class="ri-key-2-line text-amber-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key</span></div>
            <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">一个永久 Key 用于所有已公开能力。重新生成后旧 Key 会立即失效。</p>
          </div>
          <button v-if="!keyConfigured" class="h-8 px-3 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600" @click="createKey">创建 Key</button>
          <button v-else class="h-8 px-3 rounded-lg text-[11px] font-medium" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-amber-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-amber-300'" @click="resetKey">重新生成</button>
        </div>

        <div class="h-10 px-3 rounded-lg flex items-center gap-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <code class="flex-1 min-w-0 truncate text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ displayedKey }}</code>
          <button v-if="keyConfigured" class="shrink-0 text-[11px] text-brand-400" @click="toggleKeyVisibility"><i :class="showKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="mr-1" />{{ showKey ? '隐藏' : '显示' }}</button>
          <button v-if="showKey && visibleKey" class="shrink-0 text-[11px] text-brand-400" @click="copyText(visibleKey, 'API Key 已复制')"><i class="ri-file-copy-line mr-1" />复制</button>
        </div>
      </div>

      <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-2"><i class="ri-terminal-box-line text-emerald-400 text-[14px]" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">当前开放能力</span></div>
        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-aux'"><code>GET /api/v1/health</code><span class="ml-2 opacity-60">健康检查</span></div>
          <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 text-wt-aux' : 'bg-l2 text-lt-aux'"><code>GET /api/v1/capabilities</code><span class="ml-2 opacity-60">能力发现</span></div>
        </div>
        <p class="text-[10px] mt-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文档、知识库和 Agent 接口会按 Adapter 逐步接入。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toggle{width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.toggle.on{background:var(--brand)}
.toggle.on::after{transform:translateX(14px)}
.toggle.off{background:#555568}
.toggle.light-off{background:#b0b0ba}
</style>
