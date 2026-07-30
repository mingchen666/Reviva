<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

/* ── 接口速查 ── */
// TODO: 替换为 Reviva 官方文档「网关接口」页面真实地址
const DOCS_URL = 'https://docs.reviva.app/zh/gateway'

const endpointGroups = [
  {
    label: 'OpenAI 兼容',
    items: [
      {
        id: 'models', method: 'GET', path: '/v1/models', name: '模型列表', auth: true,
        desc: '获取可作为 OpenAI model 调用的普通 Agent 列表，返回 OpenAI 兼容的 models list 格式。',
        requestTitle: '请求示例', requestLang: 'bash',
        request: `curl http://127.0.0.1:1210/v1/models \\
  -H "Authorization: Bearer $REVIVA_API_KEY"`,
        responseTitle: '响应示例', responseLang: 'json',
        response: `{
  "object": "list",
  "data": [
    {
      "id": "agent_123",
      "object": "model",
      "owned_by": "reviva"
    }
  ]
}`,
        notes: [
          '也支持 GET /v1/models/:agentId 查询单个模型',
        ],
      },
      {
        id: 'chat', method: 'POST', path: '/v1/chat/completions', name: '对话调用（推荐）', auth: true,
        desc: 'OpenAI 兼容的 Agent 调用入口。请求中的 model 填 Reviva 的 agentId，支持标准 messages 与 stream 字段。',
        requestTitle: '请求体', requestLang: 'json',
        request: `{
  "model": "agent_123",
  "messages": [
    { "role": "system", "content": "回答要简洁" },
    { "role": "user", "content": "介绍一下当前项目" }
  ],
  "stream": true,
  "stream_options": { "include_usage": true }
}`,
        responseTitle: '响应示例（流式）', responseLang: 'sse',
        response: `data: {"id":"chatcmpl_xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"你好"},"finish_reason":null}]}

data: [DONE]`,
        notes: [
          'model 填 Reviva 的 agentId，而非供应商模型名',
          'messages[].content 支持多模态（text + image_url），单张图片约 10 MB',
          '默认临时会话，传入 conversationId 才会长期保留对话',
          '推理内容在 reasoning_content，不混入正文 content',
          '流式返回 usage 需设置 stream_options.include_usage=true',
        ],
      },
      {
        id: 'responses', method: 'POST', path: '/v1/responses', name: 'Responses 调用', auth: true,
        desc: 'OpenAI Responses 风格的调用入口，model 同样填 agentId，支持内置 web_search 工具与推理强度控制。',
        requestTitle: '请求体', requestLang: 'json',
        request: `{
  "model": "agent_123",
  "instructions": "回答简洁并给出来源",
  "input": "搜索并总结相关资料",
  "tools": [{ "type": "web_search" }],
  "reasoning": { "effort": "high" },
  "stream": true
}`,
        responseTitle: '响应事件（流式）', responseLang: 'text',
        response: `response.created
response.reasoning_summary_text.delta
response.output_text.delta
response.output_item.added / done
response.completed   // 含 usage 与 reviva_usage
response.failed`,
        notes: [
          'web_search 仅使用 Agent 已配置的联网工具，不会扩大权限',
          'reasoning.effort 支持 minimal / low / medium / high / xhigh',
          '客户端自定义 function 工具首期不支持',
        ],
      },
    ],
  },
  {
    label: '服务调试',
    items: [
      {
        id: 'health', method: 'GET', path: '/api/v1/health', name: '健康检查', auth: false,
        desc: '返回非敏感服务信息，无需 API Key。客户端启动或排查连通性时应优先调用此接口。',
        requestTitle: '请求示例', requestLang: 'bash',
        request: `curl http://127.0.0.1:1210/api/v1/health`,
        responseTitle: '响应示例', responseLang: 'json',
        response: `{
  "service": "reviva-local-gateway",
  "status": "ok",
  "protocolVersion": "1.0",
  "appVersion": "0.2.1-beta",
  "instanceId": "public-instance-fingerprint",
  "lanEnabled": false
}`,
        notes: [
          '无需 API Key，可用于连通性探测',
          '建议客户端启动时先调用 /health，再调用 /capabilities',
        ],
      },
      {
        id: 'status', method: 'GET', path: '/api/v1/gateway/status', name: '服务状态', auth: true,
        desc: '返回当前会话的服务状态、监听地址与 API Key 的非敏感状态，不会返回完整 Key。',
        requestTitle: '请求示例', requestLang: 'bash',
        request: `curl http://127.0.0.1:1210/api/v1/gateway/status \\
  -H "Authorization: Bearer $REVIVA_API_KEY"`,
        responseTitle: '响应示例', responseLang: 'json',
        response: `{
  "running": true,
  "address": "http://127.0.0.1:1210",
  "host": "127.0.0.1",
  "port": 1210,
  "enabled": true,
  "lanEnabled": false,
  "configuredPort": 1210,
  "configuredHost": "127.0.0.1",
  "apiKey": {
    "configured": true,
    "enabled": true,
    "hint": "C8oZ",
    "status": "enabled"
  },
  "protocolVersion": "1.0"
}`,
        notes: [
          '需要 API Key',
          '不会返回完整 API Key，仅返回 hint',
          '另有 /gateway/audit-logs 与 /gateway/diagnostics 可供排查',
        ],
      },
    ],
  },
]

function methodClass(method) {
  const map = {
    GET: isDark.value ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    POST: isDark.value ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600',
    DELETE: isDark.value ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-600',
  }
  return map[method] || (isDark.value ? 'bg-white/6 text-wt-aux' : 'bg-l4 text-lt-aux')
}

/* ── 代码高亮（静态示例，轻量正则即可） ── */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function highlightJson(code) {
  return escapeHtml(code).replace(
    /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g,
    (m, str, colon, bool) => {
      if (str) return colon ? `<span class="tk-key">${str}</span>${colon}` : `<span class="tk-str">${str}</span>`
      if (bool) return `<span class="tk-bool">${bool}</span>`
      return `<span class="tk-num">${m}</span>`
    },
  )
}
function highlightBash(code) {
  return escapeHtml(code).replace(
    /\b(curl(?:\.exe)?)\b|(https?:\/\/[^\s"']+)|(^|\s)(-{1,2}[A-Za-z][\w-]*)|("[^"]*")|(#[^\n]*)/g,
    (m, kw, url, pre, flag, str, cmt) => {
      if (kw) return `<span class="tk-kw">${kw}</span>`
      if (url) return `<span class="tk-url">${url}</span>`
      if (flag) return `${pre}<span class="tk-flag">${flag}</span>`
      if (str) return `<span class="tk-str">${str}</span>`
      if (cmt) return `<span class="tk-cmt">${cmt}</span>`
      return m
    },
  )
}
function highlightSse(code) {
  return escapeHtml(code)
    .replace(/^(data)(:)/gm, '<span class="tk-kw">$1</span>$2')
    .replace(/\[DONE\]/g, '<span class="tk-bool">[DONE]</span>')
}
function codeHtml(code, lang) {
  if (lang === 'json') return highlightJson(code)
  if (lang === 'bash') return highlightBash(code)
  if (lang === 'sse') return highlightSse(code)
  return escapeHtml(code)
}
function langMeta(lang) {
  const map = {
    json: { label: 'JSON', dot: '#eab308' },
    bash: { label: 'cURL', dot: '#34d399' },
    sse: { label: 'SSE', dot: '#38bdf8' },
    text: { label: 'TEXT', dot: '#9ca3af' },
  }
  return map[lang] || { label: (lang || '').toUpperCase(), dot: '#9ca3af' }
}

/* ── 接口详情抽屉 ── */
const activeEndpoint = ref(null)
function openEndpoint(ep) { activeEndpoint.value = ep }
function closeDrawer() { activeEndpoint.value = null }
function onEsc(e) { if (e.key === 'Escape') closeDrawer() }
watch(activeEndpoint, (ep) => {
  document.body.style.overflow = ep ? 'hidden' : ''
  if (ep) document.addEventListener('keydown', onEsc)
  else document.removeEventListener('keydown', onEsc)
})
const drawerBlocks = computed(() => {
  const ep = activeEndpoint.value
  if (!ep) return []
  return [
    { title: ep.requestTitle, code: ep.request, lang: ep.requestLang },
    { title: ep.responseTitle, code: ep.response, lang: ep.responseLang },
  ]
})

function openDocs() {
  window.electronAPI?.openExternal?.(DOCS_URL)
}

/* ── 测试连接 ── */
const testing = ref(false)
const testResult = ref(null)
async function testConnection() {
  if (!running.value || testing.value) return
  testing.value = true
  testResult.value = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${serviceAddress.value}/api/v1/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    testResult.value = { ok: true, message: data?.status === 'ok' ? `服务可达 · v${data.appVersion || '?'}` : '服务可达' }
  } catch (error) {
    testResult.value = { ok: false, message: error?.name === 'AbortError' ? '连接超时' : '无法连接服务' }
  } finally {
    testing.value = false
  }
}
watch([serviceAddress, running], () => { testResult.value = null })

function isLanIpv4(value) {
  const parts = String(value || '').trim().split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false
  const first = Number(parts[0])
  return first !== 0 && first !== 127 && first < 224
}

async function refreshStatus() {
  if (!available.value) { loading.value = false; return }
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
  await updateConfig({ lanEnabled: !status.value?.lanEnabled, lanHost: lanHost.value.trim() },
    status.value?.lanEnabled ? '局域网访问已关闭' : '局域网访问已开启')
}
async function saveLanHost() {
  const value = lanHost.value.trim()
  if (value && !isLanIpv4(value)) { msg.warning('请输入有效的局域网 IPv4 地址'); return }
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
  } catch (error) { msg.error(error?.message || '创建 API Key 失败') }
}
async function resetKey() {
  const confirmed = await mbox.confirm({
    title: '重新生成 API Key',
    subtitle: '所有正在使用旧 Key 的集成会立即失效',
    message: '重新生成后，完整 Key 只在当前页面显示。请及时复制并更新浏览器插件、CLI 或其他软件。',
    variant: 'warning', confirmText: '重新生成', cancelText: '取消',
  })
  if (!confirmed) return
  try {
    const result = await gateway().resetKey()
    visibleKey.value = result.key
    showKey.value = true
    await refreshStatus()
    msg.success('API Key 已重新生成')
  } catch (error) { msg.error(error?.message || '重新生成 API Key 失败') }
}
async function copyText(text, successText) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    msg.success(successText)
  } catch { msg.error('复制失败，请手动复制') }
}
async function toggleKeyVisibility() {
  if (!keyConfigured.value) return
  if (!visibleKey.value) {
    try { visibleKey.value = await gateway().getKey() }
    catch (error) { msg.error(error?.message || '读取 API Key 失败'); return }
  }
  if (!visibleKey.value) { msg.error('当前系统无法读取已保存的 API Key，请重新生成'); return }
  showKey.value = !showKey.value
}
async function restartService() {
  if (!available.value || saving.value) return
  saving.value = true
  try {
    status.value = await gateway().restart()
    msg.success('本地开放服务已重启')
  } catch (error) { msg.error(error?.message || '重启服务失败') }
  finally { saving.value = false }
}

onMounted(refreshStatus)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEsc)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-6 lg:px-8 py-6 space-y-5">
    <div class="rounded-xl p-3" :class="isDark ? 'bg-brand-400/6 border border-brand-400/20' : 'bg-blue-50/60 border border-blue-100'">
      <div class="flex items-start gap-2.5">
        <i class="ri-server-line text-brand-400 text-[15px] mt-[1px]" />
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
          <div class="flex items-center gap-2 mb-1"><i class="ri-router-line text-brand-400 text-[15px]" /><span class="section-title text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">监听设置</span></div>
          <p class="text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本机访问始终绑定 127.0.0.1；开启局域网时需要填写本机局域网 IPv4 地址。</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">端口</label>
            <input v-model="port" type="number" min="1" max="65535" class="w-full h-8 px-3 rounded-lg text-[14px] font-mono outline-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-brand-400'" @blur="savePort">
          </div>
          <div>
            <label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">本机地址</label>
            <div class="h-8 px-3 rounded-lg flex items-center justify-between font-mono text-[14px]" :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrF text-lt-aux'">
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
            <label class="block text-[11px] font-semibold mb-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">局域网监听地址</label>
            <input v-model="lanHost" type="text" placeholder="192.168.1.20" class="w-full h-8 px-3 rounded-lg text-[14px] font-mono outline-none" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-amber-400/40' : 'bg-l2 border border-bdrF text-lt-sub focus:border-amber-400'" @blur="saveLanHost">
          </div>
        </div>
      </div>

      <div class="rounded-xl p-4 space-y-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2"><i class="ri-key-2-line text-amber-400 text-[15px]" /><span class="section-title text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key</span></div>
            <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">一个永久 Key 用于所有已公开能力。重新生成后旧 Key 会立即失效。</p>
          </div>
          <button v-if="!keyConfigured" class="h-8 px-3 rounded-lg text-[11px] font-semibold bg-brand-500 text-white hover:bg-brand-600" @click="createKey">创建 Key</button>
          <button v-else class="h-8 px-3 rounded-lg text-[11px] font-medium" :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:border-amber-400/30' : 'bg-l2 border border-bdrF text-lt-sub hover:border-amber-300'" @click="resetKey">重新生成</button>
        </div>

        <div class="h-8 px-3 rounded-lg flex items-center gap-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <code class="flex-1 min-w-0 truncate text-[14.5px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ displayedKey }}</code>
          <button v-if="keyConfigured" class="shrink-0 text-[11.5px] text-brand-400" @click="toggleKeyVisibility"><i :class="showKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="mr-1" />{{ showKey ? '隐藏' : '显示' }}</button>
          <button v-if="showKey && visibleKey" class="shrink-0 text-[11.5px] text-brand-400" @click="copyText(visibleKey, 'API Key 已复制')"><i class="ri-file-copy-line mr-1" />复制</button>
        </div>
      </div>

      <!-- ═══ 接口速查 ═══ -->
      <div class="rounded-xl p-4 space-y-3" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <i class="ri-plug-line text-brand-400 text-[15px]" />
            <span class="section-title text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">接口速查</span>
          </div>
          <div class="flex items-center gap-2">
            <Transition name="fade">
              <span v-if="testResult" class="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
                :class="testResult.ok ? (isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (isDark ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-600')">
                <span class="w-1.5 h-1.5 rounded-full" :class="testResult.ok ? 'bg-emerald-400' : 'bg-red-400'" />
                {{ testResult.message }}
              </span>
            </Transition>
            <button class="h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub hover:bg-white/5' : 'bg-l2 border border-bdrF text-lt-sub hover:bg-l4'"
              :disabled="!running || testing"
              :title="running ? '请求 /api/v1/health 验证服务可达性' : '请先开启服务'"
              @click="testConnection">
              <i :class="testing ? 'ri-loader-4-line animate-spin' : 'ri-pulse-line'" />
              {{ testing ? '检测中' : '测试连接' }}
            </button>
          </div>
        </div>

        <!-- 引导文案 -->
        <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          以下 5 个是最常用的核心接口，点击任意一行查看请求 / 响应示例。完整接口列表、参数说明与错误码请查阅官方文档。
        </p>

        <!-- 基础地址 -->
        <div class="h-9 px-3 rounded-lg flex items-center gap-2.5" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
          <span class="text-[11px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请求地址</span>
          <code class="flex-1 min-w-0 truncate text-[13px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ serviceAddress }}</code>
          <button class="shrink-0 text-[13px] transition-colors" :class="isDark ? 'text-wt-aux hover:text-brand-400' : 'text-lt-aux hover:text-brand-500'" @click="copyText(serviceAddress, '基础地址已复制')">
            <i class="ri-file-copy-line" />
          </button>
        </div>

        <!-- 端点列表 -->
        <div class="space-y-3">
          <div v-for="group in endpointGroups" :key="group.label">
            <div class="text-[10.5px] font-semibold mb-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ group.label }}</div>
            <div class="space-y-0.5">
              <button v-for="ep in group.items" :key="ep.id"
                class="group w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors"
                :class="isDark ? 'hover:bg-white/3' : 'hover:bg-l4/60'"
                @click="openEndpoint(ep)">
                <span class="w-12 shrink-0 text-center py-0.5 rounded text-[10px] font-bold font-mono" :class="methodClass(ep.method)">{{ ep.method }}</span>
                <code class="flex-1 min-w-0 truncate text-[12px] font-mono" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ ep.path }}</code>
                <span class="hidden sm:block shrink-0 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ ep.name }}</span>
                <i class="ri-arrow-right-s-line text-[16px] shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
              </button>
            </div>
          </div>
        </div>

        <!-- 官方文档 -->
        <div class="flex items-center justify-between gap-3 pt-3 border-t" :class="isDark ? 'border-d4' : 'border-bdrF'">
          <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">以上为核心接口，更多接口与错误码见文档</span>
          <button class="flex items-center gap-1 text-[11.5px] font-semibold text-brand-400 transition-colors" :class="isDark ? 'hover:text-brand-300' : 'hover:text-brand-500'" @click="openDocs">
            查看官方文档 <i class="ri-external-link-line text-[12px]" />
          </button>
        </div>
      </div>
    </template>

    <!-- ═══ 接口详情抽屉 ═══ -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="activeEndpoint" class="fixed inset-0 z-50">
          <div class="absolute inset-0 bg-black/40" @click="closeDrawer" />
          <div class="drawer-panel absolute right-0 top-0 h-full w-full max-w-lg flex flex-col shadow-2xl"
            :class="isDark ? 'bg-d2 border-l border-bdr' : 'bg-white border-l border-bdrF'">

            <!-- 头部 -->
            <div class="shrink-0 px-5 py-4 border-b" :class="isDark ? 'border-bdr' : 'border-bdrF'">
              <div class="flex items-center gap-2.5">
                <span class="w-14 shrink-0 text-center py-1 rounded text-[11px] font-bold font-mono" :class="methodClass(activeEndpoint.method)">{{ activeEndpoint.method }}</span>
                <code class="flex-1 min-w-0 truncate text-[14px] font-mono font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ activeEndpoint.path }}</code>
                <button class="w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0" :class="isDark ? 'text-wt-aux hover:bg-white/5' : 'text-lt-aux hover:bg-l4'" @click="closeDrawer">
                  <i class="ri-close-line text-[18px]" />
                </button>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                  :class="activeEndpoint.auth ? (isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-amber-50 text-amber-600') : (isDark ? 'bg-emerald-400/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')">
                  {{ activeEndpoint.auth ? '需要 API Key' : '无需 API Key' }}
                </span>
                <span class="text-[11px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ activeEndpoint.name }}</span>
              </div>
              <!-- URL 栏 -->
              <div class="mt-3 h-8 px-3 rounded-lg flex items-center gap-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                <code class="flex-1 min-w-0 truncate text-[11.5px] font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ serviceAddress + activeEndpoint.path }}</code>
                <button class="shrink-0 text-[13px] transition-colors" :class="isDark ? 'text-wt-aux hover:text-brand-400' : 'text-lt-aux hover:text-brand-500'" @click="copyText(serviceAddress + activeEndpoint.path, '接口地址已复制')">
                  <i class="ri-file-copy-line" />
                </button>
              </div>
            </div>

            <!-- 内容 -->
            <div class="flex-1 overflow-y-auto thin-scroll px-5 py-4 space-y-4">
              <p class="text-[12px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-sub'">{{ activeEndpoint.desc }}</p>

              <!-- 请求 / 响应代码块 -->
              <div v-for="b in drawerBlocks" :key="b.title">
                <div class="text-[11px] font-semibold mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ b.title }}</div>
                <div class="overflow-hidden rounded-lg border" :class="isDark ? 'border-white/8' : 'border-black/10'">
                  <div class="flex items-center gap-2 px-3 h-8" :class="isDark ? 'bg-white/5 border-b border-white/8' : 'bg-black/4 border-b border-black/8'">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ background: langMeta(b.lang).dot }" />
                    <span class="text-[10px] font-mono font-semibold tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ langMeta(b.lang).label }}</span>
                    <button class="ml-auto flex items-center gap-1 text-[10.5px] font-medium transition-colors"
                      :class="isDark ? 'text-wt-aux hover:text-wt-main' : 'text-lt-aux hover:text-lt-main'"
                      @click="copyText(b.code, '已复制到剪贴板')">
                      <i class="ri-file-copy-line text-[12px]" />复制
                    </button>
                  </div>
                  <pre class="code-pre overflow-x-auto p-3.5 text-[11.5px] leading-relaxed"
                    :class="isDark ? 'bg-[#0d0e13] text-[#c0caf5] hl-dark' : 'bg-[#f6f8fa] text-[#24292f] hl-light'"><code v-html="codeHtml(b.code, b.lang)" /></pre>
                </div>
              </div>

              <!-- 要点 -->
              <div v-if="activeEndpoint.notes?.length">
                <div class="text-[11px] font-semibold mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">要点</div>
                <ul class="space-y-1.5">
                  <li v-for="(note, i) in activeEndpoint.notes" :key="i" class="flex gap-2 text-[11.5px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                    <span class="w-1 h-1 rounded-full mt-1.5 shrink-0 bg-brand-400" />
                    <span>{{ note }}</span>
                  </li>
                </ul>
              </div>
            </div>

            <!-- 底部 -->
            <div class="shrink-0 px-5 py-3.5 border-t flex items-center justify-between gap-3" :class="isDark ? 'border-bdr' : 'border-bdrF'">
              <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">更多接口、参数与错误码</span>
              <button class="flex items-center gap-1 text-[11.5px] font-semibold text-brand-400 transition-colors" :class="isDark ? 'hover:text-brand-300' : 'hover:text-brand-500'" @click="openDocs">
                查看官方文档 <i class="ri-external-link-line text-[12px]" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.toggle{width:32px;height:18px;border-radius:9px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
.toggle::after{content:'';position:absolute;width:14px;height:14px;border-radius:50%;top:2px;left:2px;transition:transform .2s;background:#fff}
.toggle.on{background:var(--brand)}
.toggle.on::after{transform:translateX(14px)}
.toggle.off{background:#555568}
.toggle.light-off{background:#b0b0ba}

.fade-enter-active,.fade-leave-active{transition:opacity .2s ease}
.fade-enter-from,.fade-leave-to{opacity:0}

/* 抽屉动画 */
.drawer-enter-active,.drawer-leave-active{transition:opacity .25s ease}
.drawer-enter-active .drawer-panel,.drawer-leave-active .drawer-panel{transition:transform .28s cubic-bezier(.22,.8,.36,1)}
.drawer-enter-from,.drawer-leave-to{opacity:0}
.drawer-enter-from .drawer-panel,.drawer-leave-to .drawer-panel{transform:translateX(100%)}

/* 代码块 */
pre.code-pre{
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  white-space:pre;
  tab-size:2;
}
/* 深色主题 token 配色（Tokyo Night 系） */
.hl-dark :deep(.tk-key){color:#7aa2f7}
.hl-dark :deep(.tk-str){color:#9ece6a}
.hl-dark :deep(.tk-num){color:#ff9e64}
.hl-dark :deep(.tk-bool){color:#bb9af7}
.hl-dark :deep(.tk-kw){color:#7dcfff}
.hl-dark :deep(.tk-flag){color:#e0af68}
.hl-dark :deep(.tk-url){color:#73daca}
.hl-dark :deep(.tk-cmt){color:#565f89}
/* 浅色主题 token 配色（GitHub 系） */
.hl-light :deep(.tk-key){color:#0550ae}
.hl-light :deep(.tk-str){color:#116329}
.hl-light :deep(.tk-num){color:#953800}
.hl-light :deep(.tk-bool){color:#8250df}
.hl-light :deep(.tk-kw){color:#0969da}
.hl-light :deep(.tk-flag){color:#9a6700}
.hl-light :deep(.tk-url){color:#0969da}
.hl-light :deep(.tk-cmt){color:#6e7781}
</style>