<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAgentsStore } from '@/stores/agents'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { useMessageBox } from '@/components/MsMessageBox/useMessageBox'

const appStore = useAppStore()
const agentsStore = useAgentsStore()
const isDark = computed(() => appStore.isDark)
const msg = useMessage()
const mbox = useMessageBox()

const servers = ref([])
const selectedId = ref(null)
const loading = ref(false)
const syncingIds = ref(new Set())
const activeCapabilityTab = ref('tools')

// Edit modal state
const showEditModal = ref(false)
const editing = ref(null)
const headersText = ref('{}')
const testing = ref(false)
const testResult = ref(null)
const editMode = ref('form') // 'form' | 'json'
const jsonText = ref('')
const jsonError = ref('')

const JSON_TEMPLATE = `{
  "mcpServers": {
    "my-mcp-server": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`

function buildJsonFromEditing() {
  if (!editing.value) return JSON_TEMPLATE
  const key = (editing.value.name || 'my-mcp-server').trim() || 'my-mcp-server'
  const cfg = {
    type: editing.value.transport || 'http',
    url: editing.value.url || '',
    headers: editing.value.headers || {},
  }
  return JSON.stringify({ mcpServers: { [key]: cfg } }, null, 2)
}

function _normalizeServerCfg(rawName, cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { ok: false, error: '配置不是对象' }
  if (cfg.command || cfg.args) return { ok: false, error: 'stdio 子进程暂未支持' }
  if (!cfg.url || typeof cfg.url !== 'string') return { ok: false, error: '缺少 url 字段' }
  let transport = cfg.transport || cfg.type || 'http'
  transport = String(transport).toLowerCase()
  if (transport === 'streamable_http' || transport === 'streamable-http' || transport === 'streamable') transport = 'http'
  if (transport !== 'http' && transport !== 'sse') return { ok: false, error: `不支持的 transport: ${cfg.transport || cfg.type}` }
  return {
    ok: true,
    server: {
      name: (rawName || cfg.name || '').trim(),
      transport,
      url: cfg.url.trim(),
      headers: cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers) ? cfg.headers : {},
    },
  }
}

// 支持三种粘贴形态：
//   1) { "mcpServers": { name: cfg, ... } }    ← 主流客户端导出格式
//   2) { "url": "...", "type": "...", ... }    ← 裸 server 对象
//   3) { name: cfg, name2: cfg2, ... }         ← 顶层命名映射
// 返回 { ok, servers: [...], skipped: [{name, reason}] } 或 { ok: false, error }
function parseJsonConfig(text) {
  if (!text || !text.trim()) return { ok: false, error: 'JSON 内容为空' }
  let obj
  try { obj = JSON.parse(text) }
  catch (e) { return { ok: false, error: 'JSON 格式错误：' + e.message } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: '根节点必须是 JSON 对象' }
  }

  let candidates = []
  if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
    candidates = Object.entries(obj.mcpServers)
    if (candidates.length === 0) return { ok: false, error: 'mcpServers 对象为空' }
  } else if (typeof obj.url === 'string' || obj.command || obj.args) {
    candidates = [['', obj]]
  } else {
    const entries = Object.entries(obj)
    const looksLikeServers = entries.length > 0 && entries.every(([_, v]) =>
      v && typeof v === 'object' && !Array.isArray(v) && (typeof v.url === 'string' || v.command || v.args)
    )
    if (looksLikeServers) candidates = entries
    else return { ok: false, error: '未找到有效服务器配置（需 mcpServers 包裹或包含 url 字段）' }
  }

  const servers = []
  const skipped = []
  for (const [rawName, cfg] of candidates) {
    const r = _normalizeServerCfg(rawName, cfg)
    if (r.ok) servers.push(r.server)
    else skipped.push({ name: rawName || '(未命名)', reason: r.error })
  }

  if (servers.length === 0) {
    if (skipped.length === 1) return { ok: false, error: skipped[0].reason }
    return { ok: false, error: `所有 ${skipped.length} 个服务器都无效：${skipped.map(s => `${s.name}—${s.reason}`).join('；')}` }
  }
  return { ok: true, servers, skipped }
}

function autoNameFromUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.hostname.split('.').filter(p => p && p !== 'www')
    return (parts.length >= 2 ? parts[parts.length - 2] : u.hostname) || 'mcp-server'
  } catch {
    return 'mcp-server'
  }
}

function switchMode(target) {
  if (target === editMode.value) return
  if (target === 'json') {
    // form → json: 把当前 form 的 headers 也合并进去
    if (editing.value) {
      const headersObj = (() => {
        try { return JSON.parse(headersText.value || '{}') } catch { return editing.value.headers || {} }
      })()
      editing.value.headers = headersObj
    }
    jsonText.value = buildJsonFromEditing()
    jsonError.value = ''
  } else {
    // json → form: 解析 JSON 取第一个服务器填入字段
    const parsed = parseJsonConfig(jsonText.value)
    if (!parsed.ok) {
      jsonError.value = parsed.error
      msg.error(parsed.error)
      return
    }
    const first = parsed.servers[0]
    if (parsed.servers.length > 1) {
      msg.warning(`检测到 ${parsed.servers.length} 个服务器，分项填写仅显示第一个：${first.name || '(未命名)'}`)
    }
    if (first.name && !editing.value.name) editing.value.name = first.name
    editing.value.transport = first.transport
    editing.value.url = first.url
    editing.value.headers = first.headers
    headersText.value = JSON.stringify(first.headers, null, 2)
    jsonError.value = ''
  }
  editMode.value = target
}

const selected = computed(() => servers.value.find(s => s.id === selectedId.value) || null)
const capabilityTabs = [
  { key: 'tools', label: '工具', icon: 'ri-tools-line' },
  { key: 'resources', label: '资源', icon: 'ri-database-2-line' },
  { key: 'prompts', label: '提示', icon: 'ri-chat-quote-line' },
  { key: 'templates', label: '模板', icon: 'ri-braces-line' },
]

function capabilityCounts(server) {
  return {
    tools: (server?.tools_cache || []).length,
    resources: (server?.resources_cache || []).length,
    prompts: (server?.prompts_cache || []).length,
    templates: (server?.resource_templates_cache || []).length,
  }
}

function capabilityCount(server, key) {
  return capabilityCounts(server)[key] || 0
}

function capabilityTotal(server) {
  const counts = capabilityCounts(server)
  return counts.tools + counts.resources + counts.prompts + counts.templates
}

function promptArgsText(prompt) {
  const args = Array.isArray(prompt?.arguments) ? prompt.arguments : []
  if (!args.length) return '无参数'
  return args.map(a => `${a.name}${a.required ? '*' : ''}`).join(', ')
}

function isSyncing(serverId) {
  return syncingIds.value.has(serverId)
}

function setSyncing(serverId, value) {
  const next = new Set(syncingIds.value)
  if (value) next.add(serverId)
  else next.delete(serverId)
  syncingIds.value = next
}

async function load() {
  loading.value = true
  try {
    servers.value = await window.electronAPI.db.mcpServers.list()
    // Also refresh the agents store so AgentEdit tool picker picks up new MCP tools
    agentsStore.loadMcpServers()
  } catch (e) {
    msg.error('加载 MCP 服务器失败：' + e.message)
  } finally {
    loading.value = false
  }
}

function startCreate() {
  editing.value = {
    _isNew: true,
    name: '', transport: 'http', url: '', headers: {}, enabled: true, disabled_tools: [],
  }
  headersText.value = '{}'
  testResult.value = null
  editMode.value = 'json'
  jsonText.value = JSON_TEMPLATE
  jsonError.value = ''
  showEditModal.value = true
}

function startEdit(server) {
  editing.value = JSON.parse(JSON.stringify(server))
  headersText.value = JSON.stringify(server.headers || {}, null, 2)
  testResult.value = null
  editMode.value = 'form'
  jsonText.value = ''
  jsonError.value = ''
  showEditModal.value = true
}

function cancelEdit() {
  showEditModal.value = false
  editing.value = null
  testResult.value = null
}

function parseHeaders() {
  try {
    const obj = JSON.parse(headersText.value || '{}')
    if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('headers 必须是 JSON 对象')
    return obj
  } catch (e) {
    msg.error('Headers 格式错误：' + e.message)
    return null
  }
}

// Resolve current edit form/JSON into a single normalized config object for save/test.
// In JSON mode with multiple servers, returns the FIRST one (saveEdit handles batch separately).
// Returns null + shows error message on failure.
function resolveEditing() {
  if (editMode.value === 'json') {
    const parsed = parseJsonConfig(jsonText.value)
    if (!parsed.ok) {
      jsonError.value = parsed.error
      msg.error(parsed.error)
      return null
    }
    jsonError.value = ''
    const first = parsed.servers[0]
    return {
      name: first.name || editing.value.name || autoNameFromUrl(first.url),
      transport: first.transport,
      url: first.url,
      headers: first.headers,
    }
  }
  // form mode
  const headers = parseHeaders()
  if (headers === null) return null
  return {
    name: editing.value.name,
    transport: editing.value.transport || 'http',
    url: editing.value.url,
    headers,
  }
}

// Live detection: shown as a green chip below the textarea so user sees what will be saved.
const jsonDetection = computed(() => {
  if (editMode.value !== 'json') return null
  const txt = jsonText.value
  if (!txt?.trim() || txt === JSON_TEMPLATE) return null
  const r = parseJsonConfig(txt)
  if (!r.ok) return null
  const names = r.servers.map(s => s.name || autoNameFromUrl(s.url))
  return {
    count: r.servers.length,
    skipped: r.skipped?.length || 0,
    preview: names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : ''),
  }
})

async function testConnection() {
  const cfg = resolveEditing()
  if (!cfg) return
  if (!cfg.url) { msg.warning('请填写 URL'); return }
  testing.value = true
  testResult.value = null
  try {
    const res = await window.electronAPI.mcp.testServer({
      id: editing.value.id || 'mcp_test',
      name: cfg.name,
      transport: cfg.transport,
      url: cfg.url,
      headers: cfg.headers,
    })
    testResult.value = res
    if (res.success) {
      const counts = res.counts || { tools: res.tools?.length || res.count || 0, resources: res.resources?.length || 0, prompts: res.prompts?.length || 0, resourceTemplates: res.resourceTemplates?.length || 0 }
      msg.success(`连接成功：${counts.tools || 0} 工具 / ${counts.resources || 0} 资源 / ${counts.prompts || 0} 提示 / ${counts.resourceTemplates || 0} 模板`)
    } else {
      msg.error('连接失败：' + (res.error || '未知错误'))
    }
  } catch (e) {
    testResult.value = { success: false, error: e.message }
    msg.error('测试失败：' + e.message)
  } finally {
    testing.value = false
  }
}

async function saveEdit() {
  // 批量路径：新建 + JSON 模式 → 一次性导入 parseJsonConfig 解析出的所有服务器
  if (editing.value._isNew && editMode.value === 'json') {
    const parsed = parseJsonConfig(jsonText.value)
    if (!parsed.ok) {
      jsonError.value = parsed.error
      msg.error(parsed.error)
      return
    }
    jsonError.value = ''
    try {
      let firstCreatedId = null
      const created = []
      for (const s of parsed.servers) {
        const name = (s.name || autoNameFromUrl(s.url)).trim() || 'mcp-server'
        const payload = JSON.parse(JSON.stringify({
          name,
          transport: s.transport,
          url: s.url,
          headers: s.headers,
          enabled: 1,
          disabled_tools: [],
        }))
        const row = await window.electronAPI.db.mcpServers.create(payload)
        created.push(row)
        if (!firstCreatedId) firstCreatedId = row.id
      }
      const skippedNote = parsed.skipped?.length ? `（跳过 ${parsed.skipped.length} 个：${parsed.skipped.map(s => s.name).join(', ')}）` : ''
      msg.success(`已添加 ${created.length} 个 MCP 服务器${skippedNote}`)
      await load()
      if (firstCreatedId) selectedId.value = firstCreatedId
      // Auto-sync tools for all newly created servers
      for (const c of created) syncTools(c.id, true)
      showEditModal.value = false
      editing.value = null
    } catch (e) {
      msg.error('保存失败：' + e.message)
    }
    return
  }

  // 单服务器路径：编辑现有 server 或 form 模式
  const cfg = resolveEditing()
  if (!cfg) return
  if (!cfg.name?.trim() || !cfg.url?.trim()) {
    msg.warning('名称和 URL 不能为空')
    return
  }

  const payload = JSON.parse(JSON.stringify({
    name: cfg.name.trim(),
    transport: cfg.transport || 'http',
    url: cfg.url.trim(),
    headers: cfg.headers,
    enabled: editing.value.enabled !== false ? 1 : 0,
    disabled_tools: editing.value.disabled_tools || [],
  }))

  try {
    if (editing.value._isNew) {
      const created = await window.electronAPI.db.mcpServers.create(payload)
      msg.success('MCP 服务器已添加')
      await load()
      selectedId.value = created.id
      // Auto-sync MCP capabilities after first create
      syncTools(created.id, true)
    } else {
      await window.electronAPI.db.mcpServers.update(editing.value.id, payload)
      msg.success('保存成功')
      await load()
    }
    showEditModal.value = false
    editing.value = null
  } catch (e) {
    msg.error('保存失败：' + e.message)
  }
}

async function syncTools(serverId, silent) {
  if (!serverId || isSyncing(serverId)) return
  setSyncing(serverId, true)
  try {
    const syncFn = window.electronAPI.mcp.syncServerCapabilities || window.electronAPI.mcp.syncServerTools
    const res = await syncFn(serverId)
    if (res.success) {
      if (!silent) {
        const counts = res.counts || { tools: res.tools?.length || res.count || 0, resources: res.resources?.length || 0, prompts: res.prompts?.length || 0, resourceTemplates: res.resourceTemplates?.length || 0 }
        msg.success(`同步完成：${counts.tools || 0} 工具 / ${counts.resources || 0} 资源 / ${counts.prompts || 0} 提示 / ${counts.resourceTemplates || 0} 模板`)
      }
    } else {
      msg.error('同步失败：' + (res.error || ''))
    }
    await load()
  } catch (e) {
    msg.error('同步失败：' + e.message)
  } finally {
    setSyncing(serverId, false)
  }
}

async function toggleEnabled(server) {
  try {
    await window.electronAPI.db.mcpServers.update(server.id, { enabled: server.enabled ? 0 : 1 })
    await load()
  } catch (e) {
    msg.error('切换失败：' + e.message)
  }
}

async function toggleToolDisabled(server, toolName) {
  const set = new Set(server.disabled_tools || [])
  if (set.has(toolName)) set.delete(toolName)
  else set.add(toolName)
  try {
    await window.electronAPI.db.mcpServers.update(server.id, { disabled_tools: Array.from(set) })
    await load()
  } catch (e) {
    msg.error('切换失败：' + e.message)
  }
}

async function removeServer(server) {
  const ok = await mbox.confirm({
    title: '删除 MCP 服务器',
    content: `确定删除 "${server.name}"? 该服务器配置和缓存的能力列表会被移除。`,
    variant: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await window.electronAPI.db.mcpServers.delete(server.id)
    if (selectedId.value === server.id) selectedId.value = null
    await load()
    msg.success('已删除')
  } catch (e) {
    msg.error('删除失败：' + e.message)
  }
}

onMounted(load)
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <!-- Left: server list -->
    <div class="w-[260px] shrink-0 flex flex-col border-0 border-r-2 border-solid" :class="isDark ? 'border-d4' : 'border-bdrL'">
      <div class="h-10 flex items-center px-4 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
         <svg-icon icon-class="mcp" size="16" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="ml-2 text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">MCP 服务器</span>
        <span class="ml-auto text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ servers.length }}</span>
      </div>

      <div class="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <div v-if="!servers.length" class="px-3 py-6 text-center">
          <svg-icon icon-class="mcp" size="28" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"/>
          <p class="text-[11px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">尚未添加 MCP 服务器</p>
        </div>
        <div v-for="s in servers" :key="s.id" @click="selectedId = s.id"
          class="px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="selectedId === s.id ? (isDark ? 'bg-white/6' : 'bg-l3') : (isDark ? 'hover:bg-white/3' : 'hover:bg-l4')">
          <div class="flex items-center gap-2">
            <svg-icon icon-class="mcp" size="14" :class="s.enabled ? 'text-emerald-400' : (isDark ? 'text-wt-dim' : 'text-lt-aux')"/>
            <span class="text-[12px] font-medium truncate flex-1 min-w-0" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ s.name }}</span>
            <span class="text-[9px] uppercase font-bold tracking-wider px-1.5 rounded"
              :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux'">{{ s.transport }}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span v-if="s.last_status === 'connected'" class="text-[9px] flex items-center gap-1"
              :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">
              <i class="ri-checkbox-circle-line text-[10px]" /> 已同步 · {{ capabilityTotal(s) }} 能力
            </span>
            <span v-else-if="s.last_status === 'error'" class="text-[9px] flex items-center gap-1 text-red-400">
              <i class="ri-error-warning-line text-[10px]" /> 连接错误
            </span>
            <span v-else class="text-[9px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未同步</span>
          </div>
        </div>
      </div>

      <div class="px-3 py-2.5" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
        <button @click="startCreate" class="w-full h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors"
          :class="isDark ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/18 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'">
          <i class="ri-add-line text-[14px]" /> 添加 MCP 服务器
        </button>
      </div>
    </div>

    <!-- Right: detail -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div v-if="!selected" class="flex-1 overflow-y-auto px-6 py-4">
        <div class="max-w-6xl mx-auto fade-up">
          <!-- Hero -->
          <div class="flex items-start gap-4 mb-4">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                 :class="isDark ? 'bg-gradient-to-br from-emerald-400/20 to-brand-400/10 border border-emerald-400/20' : 'bg-gradient-to-br from-emerald-50 to-brand-50 border border-emerald-100'">
              <svg-icon icon-class="mcp" size="28" class="text-emerald-400"/>
            </div>
            <div class="flex-1 min-w-0">
              <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">MCP 服务器</h1>
              <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                Model Context Protocol (MCP) 是一个开放标准，让 Agent 安全调用第三方提供的远程工具。一次接入，多个 Agent 共用。
              </p>
            </div>
          </div>

          <!-- What is MCP -->
          <div class="rounded-xl p-4 mb-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-2 mb-3">
              <i class="ri-question-line text-brand-400 text-[14px]" />
              <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">什么是 MCP？跟普通工具有什么区别？</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <div class="flex items-center gap-1.5 mb-1.5">
                  <i class="ri-tools-line text-emerald-400 text-[12px]" />
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">本地内置工具</span>
                </div>
                <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                  代码里写死的工具（文件读写、搜索、计算器等），跑在主进程沙箱里，无需联网即可用。
                </p>
              </div>
              <div class="rounded-lg p-3" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <div class="flex items-center gap-1.5 mb-1.5">
                  <svg-icon icon-class="mcp" size="14" class="text-emerald-400"/>
                  <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MCP 远程工具</span>
                </div>
                <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                  别人部署在云端的工具服务器（天气、数据库、GitHub 等），通过 HTTP 接入。一个地址 = 一组工具。
                </p>
              </div>
            </div>
          </div>

          <!-- How to use -->
          <div class="rounded-xl p-4 mb-2" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-2 mb-3">
              <i class="ri-route-line text-amber-400 text-[14px]" />
              <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">三步上手</span>
            </div>
            <div class="space-y-2.5">
              <div class="flex items-start gap-3">
                <div class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  :class="isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">1</div>
                <div class="flex-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  点击左下角 <span class="ctx-pill text-[10px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">+ 添加 MCP 服务器</span>，填入服务商提供的 URL 和鉴权（如果需要）。
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  :class="isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">2</div>
                <div class="flex-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  点 <span class="ctx-pill text-[10px]" :class="isDark ? 'bg-d0 text-wt-sub border border-bdr' : 'bg-l2 text-lt-sub border border-bdrF'">测试连接</span>，确认能拉到 MCP 能力后保存。可勾选/取消单个工具控制是否暴露给 Agent。
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  :class="isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">3</div>
                <div class="flex-1 text-[12px] leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                  打开任意 Agent 的编辑器，工具选择里会出现 <span class="ctx-pill text-[10px]" :class="isDark ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">MCP</span> 标记的服务器，勾选即可让 Agent 使用其工具、资源和提示词。
                </div>
              </div>
            </div>
          </div>

          <!-- Supported transports + limitations -->
          <div class="rounded-xl p-4 mb-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-2 mb-3">
              <i class="ri-broadcast-line text-brand-400 text-[14px]" />
              <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">支持的接入方式</span>
            </div>
            <div class="space-y-2 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <div class="flex items-start gap-2">
                <i class="ri-check-line text-emerald-400 text-[12px] mt-0.5" />
                <div><span class="font-semibold">HTTP (Streamable)</span> — 现代 MCP 服务器主流方式，无状态、性能好。推荐</div>
              </div>
              <div class="flex items-start gap-2">
                <i class="ri-check-line text-emerald-400 text-[12px] mt-0.5" />
                <div><span class="font-semibold">SSE</span> — Server-Sent Events，老版本 MCP 服务器常用，支持自动重连</div>
              </div>
              <div class="flex items-start gap-2">
                <i class="ri-time-line text-amber-400 text-[12px] mt-0.5" />
                <div><span class="font-semibold">stdio 本地子进程</span> — 暂未支持，未来开放</div>
              </div>
            </div>
          </div>

          <!-- Security tip -->
          <div class="rounded-md px-3 py-2.5 flex items-start gap-2" :class="isDark ? 'bg-amber-400/8 border border-amber-400/20' : 'bg-amber-50 border border-amber-100'">
            <i class="ri-shield-keyhole-line text-amber-400 text-[14px] mt-0.5 shrink-0" />
            <p class="text-[11px] leading-relaxed" :class="isDark ? 'text-amber-300' : 'text-amber-700'">
              MCP 服务器拥有 Agent 的部分调用权限，仅添加你信任的服务方。Authorization headers 会存储在本地数据库（明文），不会上传任何位置。
            </p>
          </div>

          <div v-if="servers.length" class="mt-6 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-arrow-left-line text-[12px] mr-1" />从左侧选择已配置的 MCP 服务器查看能力列表
          </div>
        </div>
      </div>

      <template v-else>
        <div class="h-10 flex items-center px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
          <svg-icon icon-class="mcp" size="16" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
          <span class="ml-2 text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selected.name }}</span>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ selected.enabled ? '已启用' : '已停用' }}</span>
            <div class="toggle shrink-0" :class="selected.enabled ? 'on' : (isDark ? 'off' : 'light-off')" @click="toggleEnabled(selected)" />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <!-- Connection info -->
          <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center justify-between mb-3">
              <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">连接信息</span>
              <div class="flex items-center gap-2">
                <button @click="syncTools(selected.id)" :disabled="isSyncing(selected.id)"
                  class="ctx-pill sync-tools-btn cursor-pointer disabled:cursor-wait disabled:opacity-70"
                  :aria-busy="isSyncing(selected.id)"
                  :class="isDark ? 'bg-brand-400/10 text-brand-400 border border-brand-400/20 hover:bg-brand-400/16 disabled:hover:bg-brand-400/10' : 'bg-brand-50 text-brand-500 border border-brand-100 hover:bg-brand-100 disabled:hover:bg-brand-50'">
                  <i class="ri-refresh-line text-[10px] sync-icon" :class="{ 'is-spinning': isSyncing(selected.id) }" /> 同步能力
                </button>
                <button @click="startEdit(selected)" class="ctx-pill cursor-pointer"
                  :class="isDark ? 'text-wt-aux bg-d0 border border-bdr hover:text-wt-sub' : 'text-lt-aux bg-l2 border border-bdrF hover:text-lt-sub'">
                  <i class="ri-edit-line text-[10px]" /> 编辑
                </button>
                <button @click="removeServer(selected)" class="ctx-pill cursor-pointer text-red-400"
                  :class="isDark ? 'bg-red-400/8 border border-red-400/20 hover:bg-red-400/14' : 'bg-red-50 border border-red-100 hover:bg-red-100'">
                  <i class="ri-delete-bin-line text-[10px]" /> 删除
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div class="text-[10px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Transport</div>
                <div :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ selected.transport.toUpperCase() }}</div>
              </div>
              <div>
                <div class="text-[10px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">状态</div>
                <div class="flex items-center gap-1.5">
                  <i class="ri-checkbox-blank-circle-fill text-[8px]"
                    :class="selected.last_status === 'connected' ? 'text-emerald-400' : (selected.last_status === 'error' ? 'text-red-400' : 'text-amber-400')" />
                  <span :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
                    {{ selected.last_status === 'connected' ? '已连接' : (selected.last_status === 'error' ? '错误' : '未同步') }}
                  </span>
                </div>
              </div>
              <div class="col-span-2">
                <div class="text-[10px] mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">URL</div>
                <div class="font-mono text-[11px] truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ selected.url }}</div>
              </div>
              <div v-if="selected.last_error" class="col-span-2">
                <div class="text-[10px] mb-1 text-red-400">最后错误</div>
                <div class="text-[11px] text-red-400">{{ selected.last_error }}</div>
              </div>
            </div>
          </div>

          <!-- Capabilities list -->
          <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-2">
                <i class="ri-node-tree text-emerald-400 text-[14px]" />
                <span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MCP 能力</span>
                <span class="text-[10px] ml-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ capabilityTotal(selected) }}</span>
              </div>
              <div class="flex gap-1 p-0.5 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
                <button v-for="tab in capabilityTabs" :key="tab.key" @click="activeCapabilityTab = tab.key"
                  class="h-7 px-2 rounded-md text-[10px] font-medium flex items-center gap-1.5 transition-colors"
                  :class="activeCapabilityTab === tab.key ? (isDark ? 'bg-d3 text-wt-main shadow' : 'bg-l1 text-lt-main shadow') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
                  <i :class="`${tab.icon} text-[11px]`" />
                  {{ tab.label }}
                  <span class="font-mono" :class="activeCapabilityTab === tab.key ? '' : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ capabilityCount(selected, tab.key) }}</span>
                </button>
              </div>
            </div>

            <template v-if="activeCapabilityTab === 'tools'">
            <div v-if="!selected.tools_cache?.length" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              尚未同步工具，请点击「同步能力」拉取列表
            </div>
            <div v-else class="space-y-1.5">
              <div v-for="t in selected.tools_cache" :key="t.name"
                class="flex items-start gap-2.5 py-2 px-2 rounded-lg"
                :class="isDark ? 'bg-d0' : 'bg-l2'">
                <input type="checkbox" class="mcp-tool-checkbox" :class="isDark ? 'checkbox' : 'light-checkbox'"
                  :checked="!(selected.disabled_tools || []).includes(t.name)"
                  @change="toggleToolDisabled(selected, t.name)">
                <div class="flex-1 min-w-0">
                  <div class="text-[12px] font-medium font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.name }}</div>
                  <div v-if="t.description" class="text-[11px] leading-snug line-clamp-2 mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.description }}</div>
                </div>
              </div>
            </div>
            <p v-if="selected.tools_cache?.length" class="text-[10px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              取消勾选可在 Agent 运行时跳过该工具
            </p>
            </template>

            <template v-else-if="activeCapabilityTab === 'resources'">
              <div v-if="!selected.resources_cache?.length" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                暂无资源。Agent 绑定该服务器后，可通过 mcp_resource_read 读取已同步资源 URI。
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="r in selected.resources_cache" :key="r.uri" class="py-2 px-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
                  <div class="flex items-center gap-2">
                    <i class="ri-file-text-line text-emerald-400 text-[12px]" />
                    <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ r.name || r.uri }}</div>
                    <span v-if="r.mimeType" class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">{{ r.mimeType }}</span>
                  </div>
                  <div class="font-mono text-[10px] truncate mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ r.uri }}</div>
                  <div v-if="r.description" class="text-[11px] leading-snug line-clamp-2 mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ r.description }}</div>
                </div>
              </div>
            </template>

            <template v-else-if="activeCapabilityTab === 'prompts'">
              <div v-if="!selected.prompts_cache?.length" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                暂无提示模板。Agent 绑定该服务器后，可通过 mcp_prompt_get 按名称和参数获取 prompt。
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="p in selected.prompts_cache" :key="p.name" class="py-2 px-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
                  <div class="flex items-center gap-2">
                    <i class="ri-chat-quote-line text-emerald-400 text-[12px]" />
                    <div class="text-[12px] font-medium font-mono truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ p.name }}</div>
                  </div>
                  <div class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">参数：{{ promptArgsText(p) }}</div>
                  <div v-if="p.description" class="text-[11px] leading-snug line-clamp-2 mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ p.description }}</div>
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="!selected.resource_templates_cache?.length" class="text-[11px] py-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                暂无资源模板。模板需要填入参数形成具体 URI 后，再由 Agent 读取。
              </div>
              <div v-else class="space-y-1.5">
                <div v-for="t in selected.resource_templates_cache" :key="t.uriTemplate" class="py-2 px-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
                  <div class="flex items-center gap-2">
                    <i class="ri-braces-line text-emerald-400 text-[12px]" />
                    <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ t.name || t.uriTemplate }}</div>
                    <span v-if="t.mimeType" class="ctx-pill text-[9px]" :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-bdrF'">{{ t.mimeType }}</span>
                  </div>
                  <div class="font-mono text-[10px] truncate mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ t.uriTemplate }}</div>
                  <div v-if="t.description" class="text-[11px] leading-snug line-clamp-2 mt-1" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ t.description }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Edit Modal -->
    <MsModal v-if="showEditModal && editing"
      :show="true"
      :show-footer="true"
      max-height="80vh"
      @update:show="cancelEdit"
      @close="cancelEdit">
      <template #header>
        <h3 class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          {{ editing._isNew ? '添加 MCP 服务器' : '编辑 MCP 服务器' }}
        </h3>
      </template>
      <template #default>
        <div class="space-y-4 p-1">
          <!-- Mode tabs -->
          <div class="flex gap-1 p-0.5 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l2'">
            <button @click="switchMode('json')" type="button"
              class="flex-1 h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              :class="editMode === 'json' ? (isDark ? 'bg-d3 text-wt-main shadow' : 'bg-l1 text-lt-main shadow') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <i class="ri-braces-line text-[12px]" /> 粘贴 JSON
            </button>
            <button @click="switchMode('form')" type="button"
              class="flex-1 h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              :class="editMode === 'form' ? (isDark ? 'bg-d3 text-wt-main shadow' : 'bg-l1 text-lt-main shadow') : (isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub')">
              <i class="ri-list-check-2 text-[12px]" /> 分项填写
            </button>
          </div>

          <!-- JSON mode -->
          <template v-if="editMode === 'json'">
            <div class="rounded-md px-3 py-2 flex items-start gap-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
              <i class="ri-information-line text-brand-400 text-[12px] mt-0.5 shrink-0" />
              <p class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                粘贴服务商提供的 JSON 片段。兼容 <code class="px-1 rounded" :class="isDark ? 'bg-d4 text-emerald-400' : 'bg-l3 text-emerald-600'">mcpServers</code> 包裹格式、裸 server 对象、顶层命名映射。<span class="font-semibold">多服务器配置会一次性全部导入</span>。仅支持 <span class="font-semibold">http</span> / <span class="font-semibold">sse</span>，stdio 暂不支持。
              </p>
            </div>
            <div>
              <textarea v-model="jsonText" rows="12"
                spellcheck="false"
                @input="jsonError = ''"
                class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none resize-none transition-colors leading-relaxed"
                :class="[
                  jsonError ? 'border-red-400/60' : '',
                  isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'
                ]" />
              <div v-if="jsonError" class="text-[10px] mt-1.5 text-red-400 flex items-center gap-1">
                <i class="ri-error-warning-line text-[11px]" />{{ jsonError }}
              </div>
              <div v-else-if="jsonDetection" class="text-[10px] mt-1.5 flex items-center gap-2 flex-wrap" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                <i class="ri-checkbox-circle-line text-emerald-400 text-[11px]" />
                <span>检测到 <span class="font-semibold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">{{ jsonDetection.count }}</span> 个服务器</span>
                <span v-if="jsonDetection.skipped" class="text-amber-400">· 跳过 {{ jsonDetection.skipped }} 个</span>
                <span class="font-mono truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">· {{ jsonDetection.preview }}</span>
              </div>
            </div>
          </template>

          <!-- Form mode -->
          <template v-else>
          <div>
            <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
            <input v-model="editing.name" placeholder="如：Weather MCP" class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
          </div>

          <div>
            <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">传输方式</label>
            <div class="flex gap-2">
              <button @click="editing.transport = 'http'" class="flex-1 h-9 rounded-lg text-[12px] font-medium transition-colors"
                :class="editing.transport === 'http' ? (isDark ? 'bg-emerald-400/12 text-emerald-400 border border-emerald-400/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200') : (isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub')">
                HTTP (Streamable)
              </button>
              <button @click="editing.transport = 'sse'" class="flex-1 h-9 rounded-lg text-[12px] font-medium transition-colors"
                :class="editing.transport === 'sse' ? (isDark ? 'bg-emerald-400/12 text-emerald-400 border border-emerald-400/30' : 'bg-emerald-50 text-emerald-600 border border-emerald-200') : (isDark ? 'bg-d0 text-wt-aux border border-d4 hover:text-wt-sub' : 'bg-l2 text-lt-aux border border-bdrF hover:text-lt-sub')">
                SSE
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">URL</label>
            <input v-model="editing.url" placeholder="https://example.com/mcp"
              class="w-full h-9 px-3 rounded-lg text-[12px] outline-none font-mono transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'">
          </div>

          <div>
            <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              请求头 (JSON)
              <span class="ml-1 font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">用于鉴权，如 Authorization: Bearer xxx</span>
            </label>
            <textarea v-model="headersText" rows="3"
              placeholder='{ "Authorization": "Bearer YOUR_TOKEN" }'
              class="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none resize-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-emerald-400/40' : 'bg-l2 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-emerald-400'" />
          </div>
 </template>
          <!-- Test result preview -->
          <div v-if="testResult" class="rounded-lg p-3"
            :class="testResult.success ? (isDark ? 'bg-emerald-400/8 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100') : (isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-100')">
            <div class="flex items-center gap-2 mb-2">
              <i :class="testResult.success ? 'ri-checkbox-circle-line text-emerald-400' : 'ri-error-warning-line text-red-400'" class="text-[12px]" />
              <span class="text-[11px] font-medium" :class="testResult.success ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : 'text-red-400'">
                {{ testResult.success ? `连接成功 · ${testResult.counts?.tools || testResult.count || 0} 工具 · ${testResult.counts?.resources || 0} 资源 · ${testResult.counts?.prompts || 0} 提示 · ${testResult.counts?.resourceTemplates || 0} 模板` : '连接失败' }}
              </span>
            </div>
            <div v-if="testResult.success && testResult.tools?.length" class="space-y-1">
              <div v-for="t in testResult.tools.slice(0, 5)" :key="t.name" class="text-[10px] font-mono" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
                · {{ t.name }}<span v-if="t.description" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"> — {{ t.description.substring(0, 60) }}{{ t.description.length > 60 ? '…' : '' }}</span>
              </div>
              <div v-if="testResult.tools.length > 5" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">还有 {{ testResult.tools.length - 5 }} 个…</div>
            </div>
            <div v-else-if="!testResult.success" class="text-[11px] text-red-400 font-mono">{{ testResult.error }}</div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between items-center w-full gap-2">
          <button @click="testConnection" :disabled="testing"
            class="px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
            :class="isDark ? 'bg-d0 text-wt-sub border border-bdr hover:border-emerald-400/30' : 'bg-l2 text-lt-sub border border-bdrF hover:border-emerald-300'">
            <i :class="testing ? 'ri-loader-4-line animate-spin' : 'ri-plug-line'" class="text-[12px]" />
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <div class="flex gap-2">
            <button @click="cancelEdit" class="px-4 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
            <button @click="saveEdit" class="px-4 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
              :class="isDark ? 'bg-emerald-400 text-d0 hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'">
              <i class="ri-check-line text-[12px]" /> 保存
            </button>
          </div>
        </div>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.sync-tools-btn {
  min-width: 74px;
}

.sync-icon {
  display: inline-flex;
  transform-origin: 50% 50%;
  transition: transform 180ms cubic-bezier(0.25, 1, 0.5, 1);
}

.sync-icon.is-spinning {
  animation: mcp-sync-spin 800ms linear infinite;
}

@keyframes mcp-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

.mcp-tool-checkbox {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  display: grid;
  place-content: center;
  width: 14px;
  height: 14px;
  min-width: 14px;
  margin: 2px 0 0;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background-color 140ms cubic-bezier(0.25, 1, 0.5, 1),
    border-color 140ms cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 140ms cubic-bezier(0.25, 1, 0.5, 1);
}

.mcp-tool-checkbox.checkbox {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
}

.mcp-tool-checkbox.light-checkbox {
  border: 1px solid rgba(15, 23, 42, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.mcp-tool-checkbox::after {
  content: "";
  position: static;
  left: auto;
  top: auto;
  box-sizing: border-box;
  width: 4px;
  height: 7px;
  border: solid currentColor;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) scale(0);
  transform-origin: 50% 50%;
  transition: transform 120ms cubic-bezier(0.25, 1, 0.5, 1);
}

.mcp-tool-checkbox:checked {
  border-color: #34d399;
  background: #34d399;
  color: #062c24;
}

.mcp-tool-checkbox:checked::after {
  transform: rotate(45deg) scale(1);
}

.mcp-tool-checkbox:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.22);
}

@media (prefers-reduced-motion: reduce) {
  .sync-icon,
  .sync-icon.is-spinning,
  .mcp-tool-checkbox,
  .mcp-tool-checkbox::after {
    animation: none;
    transition-duration: 0.01ms;
  }
}
</style>
