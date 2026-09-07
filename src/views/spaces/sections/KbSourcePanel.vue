<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useMessage } from '@/components/MsMessage/useMessage'
import * as kbApi from '@/apis/kb-source'

const appStore = useAppStore()
const router = useRouter()
const settingsStore = useSettingsStore()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)

const sources = ref([])
const presets = ref([])
const activeSourceId = ref('')
const kbMode = ref('external') // 'external' | 'cloud'
const loading = ref(false)
const testing = ref('')
const saving = ref(false)
const selectedKey = ref('')
const confirmDelete = ref(null)
const deleting = ref(false)
const showAddMenu = ref(false)
const formName = ref('')
const formFields = ref({})
const formUrl = ref('')
const aiRequest = ref('')
const aiResponse = ref('')
const aiBaseUrl = ref('')
const aiHasListApi = ref(false)
const aiListRequest = ref('')
const aiListResponse = ref('')
const aiProviderId = ref('')
const aiModel = ref('')
const aiProviderOpen = ref(false)
const aiModelOpen = ref(false)
const mcpServerOpen = ref(false)
const aiAnalyzing = ref(false)
const aiResult = ref(null)
const aiResultText = ref('') // editable JSON string of aiResult
const aiResultError = ref('') // JSON parse error message
watch(aiResultText, (val) => {
  if (!val || !val.trim()) { aiResultError.value = ''; return }
  try { JSON.parse(val); aiResultError.value = '' } catch (e) { aiResultError.value = 'JSON 格式错误: ' + e.message }
})
const customApiKey = ref('') // API key for existing custom HTTP sources
const showPresetKey = ref(false)
const showCustomKey = ref(false)
const customBaseUrl = ref('') // base URL for existing custom HTTP sources
const customName = ref('')

// MCP source state
const mcpServers = ref([])
const mcpTools = ref([])
const mcpName = ref('')
const mcpSyncing = ref(false)
const mcpForm = ref({ serverId: '', searchTool: '', queryParam: 'query', topKParam: 'top_k', resultPath: 'result', contentField: 'content' })
const showMcpAddForm = ref(false)
const mcpJsonText = ref('')
const mcpAdding = ref(false)

const presetMeta = {
  dify: { svgIcon: 'dify', desc: '开源 LLM 应用开发平台，支持知识库检索', fieldLabels: { USER_TOKEN: 'API Key' }, steps: ['登录 Dify 控制台，进入「知识库」', '点击目标知识库，在「API」页面获取 API Key'] },
  fastgpt: { svgIcon: 'fastgpt', desc: '开源知识库问答系统，支持知识库检索', fieldLabels: { USER_TOKEN: 'API Key' }, steps: ['登录 FastGPT 管理后台', '进入「账号」→「API 密钥」创建或查看密钥'] },
}

const cloudActive = computed(() => {
  if (!activeSourceId.value) return false
  return sources.value.find(s => s.id === activeSourceId.value)?.type === 'builtin'
})

const sidebarItems = computed(() => {
  return sources.value.filter(s => s.type !== 'builtin').map(s => {
    const presetKey = s.preset || ''
    const meta = presetMeta[presetKey]
    return { key: 'source:' + s.id, source: s, name: s.name, isActive: activeSourceId.value === s.id, svgIcon: meta?.svgIcon || (s.type === 'mcp' ? 'mcp' : ''), firstChar: s.name.charAt(0).toUpperCase(), presetKey, sourceType: s.type }
  })
})

const selectedItem = computed(() => sidebarItems.value.find(i => i.key === selectedKey.value))
const isNewPreset = computed(() => selectedKey.value.startsWith('new:preset:'))
const isNewCustom = computed(() => selectedKey.value === 'new:custom')
const isNewMcp = computed(() => selectedKey.value === 'new:mcp')
const newPresetName = computed(() => isNewPreset.value ? selectedKey.value.replace('new:preset:', '') : '')
const currentSource = computed(() => selectedItem.value?.source)
const isConfigured = computed(() => !!currentSource.value)
const isActive = computed(() => currentSource.value && activeSourceId.value === currentSource.value.id)

const rightMode = computed(() => {
  if (isNewPreset.value) return 'new-preset'
  if (isNewCustom.value) return 'new-custom'
  if (isNewMcp.value) return 'new-mcp'
  if (selectedItem.value && selectedItem.value.sourceType === 'mcp') return 'mcp-existing'
  if (selectedItem.value && !selectedItem.value.presetKey) return 'custom-existing'
  if (selectedItem.value && selectedItem.value.presetKey) return 'preset-existing'
  return 'empty'
})

const currentPresetName = computed(() => {
  if (rightMode.value === 'new-preset') return newPresetName.value
  if (rightMode.value === 'preset-existing') return selectedItem.value?.presetKey || ''
  return ''
})
const currentPresetMeta = computed(() => presetMeta[currentPresetName.value] || null)
const currentPresetObj = computed(() => presets.value.find(p => p.preset === currentPresetName.value) || null)
const aiProviders = computed(() => (settingsStore.providers || []).filter(p => p.apiKey && p.enabled !== false))
const currentAiProvider = computed(() => aiProviders.value.find(p => p.id === aiProviderId.value))
const currentAiModels = computed(() => currentAiProvider.value?.models || [])

function getFieldLabel(presetName, fieldName) { return presetMeta[presetName]?.fieldLabels?.[fieldName] || fieldName }

// Auto-discover the most likely search tool from an MCP server's tool list
function autoDiscoverSearchTool(tools) {
  if (!tools || !tools.length) return ''
  const exact = tools.find(t => t.name === 'kb_search')
  if (exact) return exact.name
  const searchMatch = tools.find(t => /search/i.test(t.name))
  if (searchMatch) return searchMatch.name
  const retrieveMatch = tools.find(t => /retrieve/i.test(t.name))
  if (retrieveMatch) return retrieveMatch.name
  const kbMatch = tools.find(t => /kb/i.test(t.name))
  if (kbMatch) return kbMatch.name
  return tools[0].name
}

// Parse MCP server JSON config (supports mcpServers wrapper, bare server, or named map)
function parseMcpJson(text) {
  if (!text || !text.trim()) return { ok: false, error: 'JSON 内容为空' }
  let obj
  try { obj = JSON.parse(text) }
  catch (e) { return { ok: false, error: 'JSON 格式错误：' + e.message } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: '根节点必须是 JSON 对象' }
  let candidates = []
  if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
    candidates = Object.entries(obj.mcpServers)
  } else if (typeof obj.url === 'string') {
    candidates = [['', obj]]
  } else {
    const entries = Object.entries(obj)
    const looksLikeServers = entries.length > 0 && entries.every(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.url === 'string')
    if (looksLikeServers) candidates = entries
    else return { ok: false, error: '未找到有效服务器配置（需 mcpServers 包裹或包含 url 字段）' }
  }
  const servers = []
  for (const [rawName, cfg] of candidates) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue
    if (cfg.command || cfg.args) continue
    if (!cfg.url || typeof cfg.url !== 'string') continue
    let transport = cfg.transport || cfg.type || 'http'
    transport = String(transport).toLowerCase()
    if (transport === 'streamable_http' || transport === 'streamable-http' || transport === 'streamable') transport = 'http'
    if (transport !== 'http' && transport !== 'sse') continue
    servers.push({ name: (rawName || cfg.name || '').trim(), transport, url: cfg.url.trim(), headers: cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers) ? cfg.headers : {} })
  }
  if (!servers.length) return { ok: false, error: '未找到有效的 HTTP/SSE 服务器配置' }
  return { ok: true, servers }
}

function autoNameFromUrl(url) {
  try { const u = new URL(url); const parts = u.hostname.split('.').filter(p => p && p !== 'www'); return (parts.length >= 2 ? parts[parts.length - 2] : u.hostname) || 'mcp-server' }
  catch { return 'mcp-server' }
}

async function loadData() {
  if (!loadData._silent) loading.value = true
  try {
    const [list, activeId, presetList] = await Promise.all([kbApi.listSources(), kbApi.getActiveSourceId(), kbApi.getPresets()])
   sources.value = list || []
   // One-time cleanup: delete orphaned IMA preset sources (preset removed)
   for (const s of sources.value) {
     if (s.preset === 'ima') { try { await kbApi.deleteSource(s.id) } catch {} }
   }
   if (sources.value.some(s => s.preset === 'ima')) sources.value = sources.value.filter(s => s.preset !== 'ima')
  activeSourceId.value = activeId || ''
   // Sync kbMode from the active source type
   const activeSrc = (list || []).find(s => s.id === activeId)
   kbMode.value = activeSrc?.type === 'builtin' ? 'cloud' : 'external'
   presets.value = (presetList || []).filter(p => p.preset !== 'notion')
    await loadMcpServers()
  } catch (e) { msg.error(e?.message || '加载失败') } finally { if (!loadData._silent) loading.value = false }
}

/** Silent refresh — reloads data without flashing the sidebar loading spinner */
async function refreshData() {
  loadData._silent = true
  try { await loadData() } finally { loadData._silent = false }
}

async function loadMcpServers() {
  try {
    const list = await window.electronAPI?.db?.mcpServers?.list()
    mcpServers.value = list || []
  } catch { mcpServers.value = [] }
}

function selectItem(key) { selectedKey.value = key; populateForm() }

function addNewPreset(presetName) {
  selectedKey.value = 'new:preset:' + presetName
  showAddMenu.value = false
  formName.value = presets.value.find(p => p.preset === presetName)?.name || presetName
  formFields.value = {}
 formUrl.value = presets.value.find(p => p.preset === presetName)?.base_url || ''
}

function addNewCustom() {
  selectedKey.value = 'new:custom'
  showAddMenu.value = false
  customName.value = '自定义知识源'
  aiRequest.value = ''; aiResponse.value = ''; aiBaseUrl.value = ''
  aiHasListApi.value = false; aiListRequest.value = ''; aiListResponse.value = ''
  aiResult.value = null
  aiResultText.value = ''; aiResultError.value = ''
  customApiKey.value = ''
  customBaseUrl.value = ''
  if (aiProviders.value.length && !aiProviderId.value) {
    aiProviderId.value = aiProviders.value[0].id
    const models = aiProviders.value[0].models || []
    if (models.length) aiModel.value = models[0].id || models[0]
  }
}

function addNewMcp() {
  selectedKey.value = 'new:mcp'
  showAddMenu.value = false
  mcpName.value = 'MCP 知识库'
 mcpForm.value = { serverId: '', searchTool: '', queryParam: 'query', topKParam: 'top_k', resultPath: 'result', contentField: 'content' }
 mcpTools.value = []
 showMcpAddForm.value = false
 mcpJsonText.value = ''
}

async function onMcpServerChange() {
  mcpTools.value = []
  mcpForm.value.searchTool = ''
  if (!mcpForm.value.serverId) return
  const server = mcpServers.value.find(s => s.id === mcpForm.value.serverId)
  if (server?.tools_cache?.length) {
    mcpTools.value = server.tools_cache
    mcpForm.value.searchTool = autoDiscoverSearchTool(server.tools_cache)
  }
  await syncMcpTools()
}

async function syncMcpTools() {
  if (!mcpForm.value.serverId || mcpSyncing.value) return
  mcpSyncing.value = true
  try {
    const res = await window.electronAPI?.mcp?.syncServerTools(mcpForm.value.serverId)
    if (res?.success && res.tools) {
      mcpTools.value = res.tools
      mcpForm.value.searchTool = autoDiscoverSearchTool(res.tools)
      await loadMcpServers()
    }
  } catch { /* silent — UI shows discovery state */ } finally { mcpSyncing.value = false }
}

async function addMcpServerInline() {
  const parsed = parseMcpJson(mcpJsonText.value)
  if (!parsed.ok) { msg.error(parsed.error); return }
  mcpAdding.value = true
  try {
    let firstCreatedId = null
    for (const s of parsed.servers) {
      const name = (s.name || autoNameFromUrl(s.url)).trim() || 'mcp-server'
      const row = await window.electronAPI?.db?.mcpServers?.create({ name, transport: s.transport, url: s.url, headers: s.headers, enabled: 1, disabled_tools: [] })
      if (!firstCreatedId) firstCreatedId = row?.id
    }
    msg.success('已添加 ' + parsed.servers.length + ' 个 MCP 服务器')
    await loadMcpServers()
    showMcpAddForm.value = false
    mcpJsonText.value = ''
    if (firstCreatedId) { mcpForm.value.serverId = firstCreatedId; await onMcpServerChange() }
  } catch (e) { msg.error(e?.message || '添加失败') } finally { mcpAdding.value = false }
}

async function handleMcpSave() {
  if (!mcpName.value.trim()) { msg.warning('请填写名称'); return }
  if (!mcpForm.value.serverId) { msg.warning('请选择 MCP 服务器'); return }
  const config = { ...mcpForm.value }
 saving.value = true
 try {
   if (currentSource.value) { await kbApi.updateSource(currentSource.value.id, { name: mcpName.value.trim(), config }); msg.success('已保存') }
   else { await kbApi.addSource({ name: mcpName.value.trim(), type: 'mcp', preset: '', config }); msg.success('已添加') }
    await refreshData()
   populateForm()
 } catch (e) { msg.error(e?.message || '保存失败') } finally { saving.value = false }
}

function populateForm() {
  const item = selectedItem.value
 if (!item) return
 if (item.sourceType === 'mcp') {
    mcpName.value = item.source.name
    mcpForm.value = {
      serverId: item.source.config?.serverId || '',
      searchTool: item.source.config?.searchTool || '',
      queryParam: item.source.config?.queryParam || 'query',
      topKParam: item.source.config?.topKParam || 'top_k',
      resultPath: item.source.config?.resultPath || 'result',
      contentField: item.source.config?.contentField || 'content',
    }
     mcpTools.value = []
     if (mcpForm.value.serverId) {
       const server = mcpServers.value.find(s => s.id === mcpForm.value.serverId)
       if (server?.tools_cache?.length) {
         mcpTools.value = server.tools_cache
         if (!mcpForm.value.searchTool) mcpForm.value.searchTool = autoDiscoverSearchTool(server.tools_cache)
       }
     }
 } else if (item.presetKey) {
   formName.value = item.source.name
   formUrl.value = item.source.config?.base_url || ''
   formFields.value = { USER_TOKEN: item.source.config?._form?.USER_TOKEN || '' }
 } else {
    customName.value = item.source.name
    aiResult.value = item.source.config
    aiResultText.value = JSON.stringify(item.source.config, null, 2); aiResultError.value = ''
    customApiKey.value = item.source.config?._form?.USER_TOKEN || ''
    customBaseUrl.value = item.source.config?.base_url || ''
    aiBaseUrl.value = item.source.config?.base_url || ''
    aiRequest.value = ''; aiResponse.value = ''
    aiHasListApi.value = !!item.source.config?.endpoints?.list; aiListRequest.value = ''; aiListResponse.value = ''
  }
}

async function handlePresetSave() {
  const presetName = currentPresetName.value
  if (!presetName) return
  if (!formName.value.trim()) { msg.warning('请填写名称'); return }
  if (!formFields.value['USER_TOKEN']?.trim()) { msg.warning('请填写 API Key'); return }
  const vals = { ...formFields.value }
  let config
  try { config = await kbApi.getPresetConfig(presetName, vals) }
  catch (e) { msg.error('配置失败: ' + (e?.message ?? '')); return }
  if (formUrl.value.trim()) config.base_url = formUrl.value.trim()
  config._form = { ...formFields.value }
 saving.value = true
 try {
   if (currentSource.value) { await kbApi.updateSource(currentSource.value.id, { name: formName.value.trim(), config }); msg.success('已保存') }
   else { await kbApi.addSource({ name: formName.value.trim(), type: 'preset', preset: presetName, config }); msg.success('已配置') }
    await refreshData()
   populateForm()
 } catch (e) { msg.error(e?.message || '保存失败') } finally { saving.value = false }
}

async function handleCustomSave() {
  if (!customName.value.trim()) { msg.warning('请填写名称'); return }
  if (rightMode.value === 'custom-existing' && !customBaseUrl.value.trim()) { msg.warning('请填写服务地址'); return }
  if (!aiResultText.value.trim()) { msg.warning('请先通过 AI 解析生成配置'); return }
  // Parse edited JSON
  let parsedConfig
  try {
    parsedConfig = JSON.parse(aiResultText.value)
    aiResultError.value = ''
  } catch (e) {
    aiResultError.value = 'JSON 格式错误: ' + e.message
    msg.error('配置 JSON 格式错误，请检查')
    return
  }
  // Inject API key into config._form
  if (customApiKey.value.trim()) {
    parsedConfig._form = { ...(parsedConfig._form || {}), USER_TOKEN: customApiKey.value.trim() }
  }
  // Inject base_url from the URL input
  if (customBaseUrl.value.trim()) {
    parsedConfig.base_url = customBaseUrl.value.trim()
  }
 saving.value = true
 try {
   if (currentSource.value) { await kbApi.updateSource(currentSource.value.id, { name: customName.value.trim(), config: parsedConfig }); msg.success('已保存') }
   else { await kbApi.addSource({ name: customName.value.trim(), type: 'http', preset: '', config: parsedConfig }); msg.success('已添加') }
    await refreshData()
   populateForm()
 } catch (e) { msg.error(e?.message || '保存失败') } finally { saving.value = false }
}

async function aiAnalyze() {
  if (!aiRequest.value.trim()) { msg.warning('请粘贴请求/响应示例或 API 文档'); return }
  if (!currentAiProvider.value) { msg.warning('请先在设置中配置模型服务商'); return }
  if (!aiModel.value) { msg.warning('请选择 AI 模型'); return }
  aiAnalyzing.value = true; aiResult.value = null
  aiResultText.value = ''; aiResultError.value = ''
  try {
    const params = { requestExample: aiRequest.value, responseExample: '', baseUrl: aiBaseUrl.value, providerId: currentAiProvider.value.id, apiKey: currentAiProvider.value.apiKey, modelBaseUrl: currentAiProvider.value.baseUrl, apiFormat: currentAiProvider.value.apiFormat, model: aiModel.value }
    if (aiHasListApi.value && aiListRequest.value.trim()) {
      params.listRequestExample = aiListRequest.value
      params.listResponseExample = ''
    }
    const res = await kbApi.analyzeRequestResponse(params)
    if (res.success && res.config) {
      aiResult.value = res.config; aiResultText.value = JSON.stringify(res.config, null, 2)
      msg.success('解析成功，请确认配置后保存')
    } else {
      const errMsg = res.error || '解析失败'
      console.error('[KB AI Analyze] failed:', errMsg, res)
      aiResultError.value = errMsg
      msg.error(errMsg)
    }
  } catch (e) {
    const errMsg = e?.message || '解析失败'
    console.error('[KB AI Analyze] exception:', e)
    aiResultError.value = errMsg
    msg.error(errMsg)
  } finally { aiAnalyzing.value = false }
}

async function sidebarToggle(e, item) {
  e.stopPropagation()
  if (!item.source) return
  const newId = item.isActive ? '' : item.source.id
  if (newId) kbMode.value = 'external'
  try { await kbApi.setActiveSource(newId); activeSourceId.value = newId; msg.success(newId ? '已启用' : '已停用') }
  catch (e2) { msg.error(e2?.message || '操作失败') }
}

async function testConn() {
  if (!currentSource.value) return
  testing.value = currentSource.value.id
  try {
    const res = await kbApi.testConnection(currentSource.value.id)
    if (res.success) msg.success('连接成功')
   else msg.error('连接失败: ' + (res.error || res.message || ''))
    await refreshData()
 } catch (e) { msg.error(e?.message || '测试失败') } finally { testing.value = '' }
}

function askDelete() { if (currentSource.value) confirmDelete.value = currentSource.value }

async function confirmDeleteSource() {
  if (!confirmDelete.value || deleting.value) return
  deleting.value = true
  try {
    await kbApi.deleteSource(confirmDelete.value.id)
    if (activeSourceId.value === confirmDelete.value.id) { await kbApi.setActiveSource(''); activeSourceId.value = '' }
   msg.success('已删除'); confirmDelete.value = null; selectedKey.value = ''
    await refreshData()
 } catch (e) { msg.error(e?.message || '删除失败') } finally { deleting.value = false }
}

watch(sidebarItems, (items) => { if (!selectedKey.value && items.length) selectItem(items[0].key) })
onMounted(async () => { await loadData(); if (sidebarItems.value.length) selectItem(sidebarItems.value[0].key) })
onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

function handleClickOutside(e) {
  if (aiProviderOpen.value && !e.target.closest('[data-ai-provider-trigger]') && !e.target.closest('#ai-provider-menu')) {
    aiProviderOpen.value = false
  }
  if (aiModelOpen.value && !e.target.closest('[data-ai-model-trigger]') && !e.target.closest('#ai-model-menu')) {
    aiModelOpen.value = false
  }
  if (mcpServerOpen.value && !e.target.closest('[data-mcp-server-trigger]') && !e.target.closest('#mcp-server-menu')) {
    mcpServerOpen.value = false
  }
}
defineExpose({ refresh: loadData })
</script>
<template>
 <div class="relative h-full min-h-0 flex flex-col" :class="isDark ? 'bg-d2' : 'bg-l2'">
   <!-- External sources panel -->
   <div class="flex-1 min-h-0 flex">
     <!-- Left sidebar -->
      <div class="w-64 shrink-0 flex flex-col min-h-0" :class="isDark ? 'border-r border-d4 bg-d1' : 'border-r border-bdrL bg-l1'">
        <div class="flex-1 min-h-0 overflow-y-auto py-2 px-2 thin-scroll">
          <div v-if="loading" class="flex items-center justify-center py-8">
            <i class="ri-loader-4-line text-[18px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          </div>
          <template v-else>
            <div class="text-[12px] font-bold uppercase tracking-[0.1em] px-2.5 pt-1 pb-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">知识源列表</div>
            <div v-if="!sidebarItems.length" class="px-2.5 py-4 text-center">
              <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无外部知识源</p>
              <p class="text-[10px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">点击下方按钮添加</p>
            </div>
            <button v-for="item in sidebarItems" :key="item.key" class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md relative transition-colors text-left" :class="selectedKey === item.key ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main') : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')" @click="selectItem(item.key)">
              <span v-show="selectedKey === item.key" class="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r" :class="isDark ? 'bg-brand-400' : 'bg-brand-500'" />
              <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0" :class="isDark ? 'bg-d4' : 'bg-l4'">
                <SvgIcon v-if="item.svgIcon" :icon-class="item.svgIcon" :size="18" />
                <span v-else class="text-[14px] font-bold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ item.firstChar }}</span>
              </div>
              <span class="text-[13px] font-medium flex-1 truncate">{{ item.name }}</span>
              <span class="relative w-8 h-[18px] rounded-full transition-colors shrink-0" :class="item.isActive ? 'bg-brand-400' : (isDark ? 'bg-d4' : 'bg-l4')" @click="sidebarToggle($event, item)">
                <span class="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all" :class="item.isActive ? 'left-[16px]' : 'left-[2px]'" />
              </span>
            </button>
          </template>
        </div>
        <div class="relative p-2" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
          <button class="w-full h-8 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors" :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'" @click="showAddMenu = !showAddMenu">
            <i class="ri-add-line text-[16px]" />添加知识源
          </button>
          <div v-if="showAddMenu" class="absolute bottom-[calc(100%+4px)] left-2 right-2 rounded-lg overflow-hidden shadow-lg z-50" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <button v-for="p in presets" :key="p.preset" class="w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left" :class="isDark ? 'hover:bg-d4 text-wt-sub' : 'hover:bg-l4 text-lt-sub'" @click="addNewPreset(p.preset)">
              <div class="w-6 h-6 rounded flex items-center justify-center shrink-0"><SvgIcon :icon-class="presetMeta[p.preset]?.svgIcon || 'dify'" :size="16" /></div>
              <span class="text-[12px]">{{ p.name }}</span>
            </button>
            <div class="h-px" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
            <button class="w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left" :class="isDark ? 'hover:bg-d4 text-wt-sub' : 'hover:bg-l4 text-lt-sub'" @click="addNewCustom">
              <div class="w-6 h-6 rounded flex items-center justify-center shrink-0"><i class="ri-global-line text-[16px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /></div>
              <span class="text-[12px]">自定义知识库</span>
            </button>
            <div class="h-px" :class="isDark ? 'bg-bdr' : 'bg-bdrF'" />
            <button class="w-full flex items-center gap-2.5 px-3 py-2 transition-colors text-left" :class="isDark ? 'hover:bg-d4 text-wt-sub' : 'hover:bg-l4 text-lt-sub'" @click="addNewMcp">
              <div class="w-6 h-6 rounded flex items-center justify-center shrink-0">
                <SvgIcon icon-class="mcp"  class="ri-server-line text-[16px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'"/>
                </div>
              <span class="text-[12px]">MCP 知识库</span>
            </button>
          </div>
        </div>
      </div>
      <!-- Right config panel -->
      <div class="flex-1 min-h-0 overflow-y-auto thin-scroll" @click="showAddMenu = false">
        <!-- Empty -->
        <div v-if="rightMode === 'empty'" class="h-full flex items-center justify-center">
          <div class="text-center">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" :class="isDark ? 'bg-d4' : 'bg-l4'"><i class="ri-database-2-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /></div>
            <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择知识源或添加新源</p>
            <p class="mt-1 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持 Dify、FastGPT 及自定义知识库</p>
            <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">也支持通过 MCP 协议接入</p>
          </div>
        </div>
        <!-- Preset config -->
        <div v-else-if="rightMode === 'new-preset' || rightMode === 'preset-existing'" class="max-w-[800px] mx-auto px-10 py-6">
          <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d1' : 'bg-l1'"><SvgIcon v-if="currentPresetMeta?.svgIcon" :icon-class="currentPresetMeta.svgIcon" :size="24" /></div>
              <div class="min-w-0 flex-1"><span class="text-[16px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formName }}</span><p class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ currentPresetMeta?.desc || '' }}</p></div>
              <span v-if="isConfigured" class="text-[10px] px-2 py-0.5 rounded font-medium shrink-0" :class="isActive ? 'bg-emerald-400/15 text-emerald-400' : (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')">{{ isActive ? '已启用' : '已配置' }}</span>
            </div>
          </div>
          <div class="space-y-4 mb-5">
            <div>
              <label class="block text-[12px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
              <input v-model="formName" class="w-full h-8 px-3 rounded-lg text-[14px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" />
            </div>
             <div>
               <label class="block text-[14px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key<span class="ml-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">(密钥)</span></label>
                <div class="relative">
                  <input v-model="formFields['USER_TOKEN']" :type="showPresetKey ? 'text' : 'password'" class="w-full h-8 px-3 pr-9 rounded-lg text-[14px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="粘贴 API Key" />
                  <button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'" @click="showPresetKey = !showPresetKey"><i :class="showPresetKey ? 'ri-eye-off-line' : 'ri-eye-line'" /></button>
                </div>
            </div>
             <div>
               <label class="block text-[12px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">服务地址</label>
              <input v-model="formUrl" class="w-full h-8 px-3 rounded-lg text-[14px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="https://..." />
             <p class="mt-1 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">自托管部署可修改，默认 {{ currentPresetObj?.base_url || '' }}</p>
          </div>
        </div>
          <!-- Help steps -->
          <div class="rounded-lg px-4 py-3 mb-5" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
             <div class="flex items-center gap-1.5 mb-2"><i class="ri-book-open-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /><span class="text-[10px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">获取方式</span></div>
              <p class="text-[10px] mb-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">填写 API Key 即可保存，知识库可在对话侧边栏中选择。</p>
             <div class="space-y-1.5">
              <div v-for="(step, idx) in (currentPresetMeta?.steps || [])" :key="idx" class="flex items-start gap-2">
                <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ idx + 1 }}</span>
                <span class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ step }}</span>
              </div>
            </div>
          </div>
          <!-- Actions -->
          <div class="flex items-center gap-2">
            <button v-if="isConfigured" class="h-9 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" :disabled="!!testing" @click="testConn"><i :class="[testing ? 'ri-loader-4-line animate-spin' : 'ri-plug-line', 'text-[13px]']" />测试连接</button>
            <div class="flex-1" />
            <button v-if="isConfigured" class="h-9 px-3.5 rounded-lg text-[12px] inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-dim hover:text-red-400' : 'bg-l4 text-lt-aux hover:text-red-500'" @click="askDelete"><i class="ri-delete-bin-line text-[13px]" />删除</button>
            <button class="h-9 px-5 rounded-lg text-[13px] font-medium" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" :disabled="saving" @click="handlePresetSave">{{ saving ? '保存中...' : (isConfigured ? '保存' : '配置并保存') }}</button>
          </div>
        </div>
        <!-- Custom HTTP -->
        <div v-else-if="rightMode === 'new-custom' || rightMode === 'custom-existing'" class="max-w-[800px] mx-auto px-10 py-6">
          <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d1' : 'bg-l1'"><span class="text-[18px] font-bold" :class="isDark ? 'text-brand-400' : 'text-brand-500'">{{ (rightMode === 'custom-existing' ? selectedItem.name : customName).charAt(0).toUpperCase() }}</span></div>
              <div class="min-w-0 flex-1"><span class="text-[16px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ rightMode === 'custom-existing' ? selectedItem.name : '自定义知识源' }}</span><p class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ rightMode === 'custom-existing' ? '自定义知识库 知识源' : '通过 AI 解析 API 示例自动生成协议配置' }}</p></div>
              <span v-if="isConfigured" class="text-[10px] px-2 py-0.5 rounded font-medium shrink-0" :class="isActive ? 'bg-emerald-400/15 text-emerald-400' : (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')">{{ isActive ? '已启用' : '已配置' }}</span>
            </div>
          </div>
          <div class="mb-5">
            <label class="block text-[12px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
            <input v-model="customName" class="w-full h-8 px-3 rounded-lg text-[14px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="给知识源起个名字" />
          </div>
          <!-- Smart parsing - only for new sources -->
          <div v-if="rightMode === 'new-custom'" class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
            <div class="flex items-center gap-1.5 mb-3"><i class="ri-magic-line text-[14px]" :class="isDark ? 'text-agent-400' : 'text-agent-500'" /><span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">智能解析</span></div>
            <p class="text-[12px] mb-1.5 leading-relaxed" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">粘贴知识库 API 的请求/响应示例或接口文档，AI 会自动解析并生成协议配置</p>
            <p class="text-[11px] mb-4 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">支持 curl 命令、HTTP 请求文本、JSON 响应示例，或 API 接口文档片段。建议同时提供请求和响应示例，解析更准确。</p>
            <div v-if="aiProviders.length" class="flex items-center gap-2 mb-3">
             <div class="relative w-[200px] shrink-0">
              <button type="button" data-ai-provider-trigger @click="aiProviderOpen = !aiProviderOpen" class="w-full h-8 pl-2.5 pr-7 rounded-lg text-[15px] outline-none cursor-pointer transition-colors flex items-center" :class="[isDark ? 'bg-d2 border border-bdr text-wt-main' : 'bg-l2 border border-bdrF text-lt-main', aiProviderOpen ? (isDark ? 'border-brand-400/40' : 'border-brand-400') : '']">
                <span class="truncate text-left">{{ currentAiProvider?.name || '选择服务商' }}</span>
                <i class="ri-arrow-down-s-line text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </button>
                <div v-if="aiProviderOpen" id="ai-provider-menu" class="absolute left-0 top-[34px] w-full rounded-lg overflow-hidden z-30 shadow-lg" :class="isDark ? 'bg-d3 shadow-black/40 border border-d4' : 'bg-l2 shadow-xl border border-bdrF'">
                  <button v-for="p in aiProviders" :key="p.id" type="button" @click="aiProviderId = p.id; aiProviderOpen = false" class="w-full flex items-center gap-2 px-3 py-2 text-[15px] transition-colors" :class="aiProviderId === p.id ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-main hover:bg-white/5' : 'text-lt-main hover:bg-l4')">
                    <span class="truncate flex-1 text-left">{{ p.name }}</span>
                    <i v-if="aiProviderId === p.id" class="ri-check-line text-[15px]" />
                  </button>
                </div>
              </div>
              <div v-if="currentAiModels.length" class="relative flex-1 min-w-0">
                <button type="button" data-ai-model-trigger @click="aiModelOpen = !aiModelOpen" class="w-full h-8 pl-2.5 pr-7 rounded-lg text-[15px] outline-none cursor-pointer transition-colors flex items-center" :class="[isDark ? 'bg-d2 border border-bdr text-wt-main' : 'bg-l2 border border-bdrF text-lt-main', aiModelOpen ? (isDark ? 'border-brand-400/40' : 'border-brand-400') : '']">
                  <span class="truncate">{{ currentAiModels.find(m => (m.id || m) === aiModel)?.name || currentAiModels.find(m => (m.id || m) === aiModel)?.id || '选择模型' }}</span>
                  <i class="ri-arrow-down-s-line text-[16px] absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </button>
                <div v-if="aiModelOpen" id="ai-model-menu" class="absolute left-0 top-[34px] w-full rounded-lg overflow-hidden z-30 shadow-lg max-h-[200px] overflow-y-auto thin-scroll" :class="isDark ? 'bg-d3 shadow-black/40 border border-d4' : 'bg-l2 shadow-xl border border-bdrF'">
                  <button v-for="m in currentAiModels" :key="m.id || m" type="button" @click="aiModel = m.id || m; aiModelOpen = false" class="w-full flex items-center gap-2 px-3 py-2 text-[15px] transition-colors" :class="aiModel === (m.id || m) ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-main hover:bg-white/5' : 'text-lt-main hover:bg-l4')">
                    <span class="truncate flex-1 text-left">{{ m.name || m.id || m }}</span>
                    <i v-if="aiModel === (m.id || m)" class="ri-check-line text-[15px]" />
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="rounded-lg px-3 py-2.5 flex items-center gap-2 mb-3" :class="isDark ? 'bg-d3 border border-d4' : 'bg-l3 border border-bdrF'"><i class="ri-error-warning-line text-[13px] shrink-0" :class="isDark ? 'text-amber-400' : 'text-amber-500'" /><p class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请先在设置 → 模型服务中配置 AI 模型</p></div>
             <div class="mb-3"><label class="block text-[12px] font-medium mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">API 地址（可选）</label><input v-model="aiBaseUrl" class="w-full h-8 px-3 rounded-lg text-[14px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="https://api.example.com" /></div>
              <div class="text-[12px] font-medium mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">检索接口</div>
              <div class="mb-3">
                <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请求与响应示例</label>
                <p class="text-[10px] mb-1.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">粘贴 curl 命令、HTTP 请求/响应文本或 API 文档片段，AI 会自动识别请求和响应</p>
                <textarea v-model="aiRequest" rows="8" class="w-full px-2.5 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" spellcheck="false" placeholder="curl -X POST https://api.example.com/search &#10; -H 'Authorization: Bearer xxx' &#10; -d '{&quot;query&quot;:&quot;test&quot;}' &#10;&#10; {&quot;results&quot;:[{&quot;content&quot;:&quot;...&quot;,&quot;title&quot;:&quot;...&quot;}]}" />
              </div>
              <button class="text-[11px] inline-flex items-center gap-1 transition-colors mb-2" :class="isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-500 hover:text-brand-600'" @click="aiHasListApi = !aiHasListApi">
                <i :class="[aiHasListApi ? 'ri-subtract-line' : 'ri-add-line', 'text-[11px]']" />{{ aiHasListApi ? '关闭该列表接口' : '有获取知识库列表的接口？' }}
              </button>
              <div v-if="aiHasListApi" class="mb-3">
                <div class="text-[12px] font-medium mb-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">列表接口（获取知识库列表）</div>
                <div>
                  <label class="block text-[11px] font-medium mb-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请求与响应示例</label>
                  <p class="text-[10px] mb-1.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">粘贴列表接口的请求/响应或文档片段</p>
                  <textarea v-model="aiListRequest" rows="8" class="w-full px-2.5 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" spellcheck="false" placeholder="curl -X GET https://api.example.com/datasets &#10; -H 'Authorization: Bearer xxx' &#10;&#10; {&quot;data&quot;:[{&quot;id&quot;:&quot;1&quot;,&quot;name&quot;:&quot;KB1&quot;}]}" />
                </div>
              </div>
            <button v-if="!aiResult" class="w-full h-9 mt-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5" :class="isDark ? 'bg-agent-400 text-d0 hover:bg-agent-500' : 'bg-agent-500 text-white hover:bg-agent-600'" :disabled="aiAnalyzing" @click="aiAnalyze"><i :class="[aiAnalyzing ? 'ri-loader-4-line animate-spin' : 'ri-magic-line', 'text-[14px]']" />{{ aiAnalyzing ? '解析中...' : 'AI 解析生成配置' }}</button>
            <div v-if="aiResultError && !aiResult" class="mt-2 px-3 py-2 rounded-lg flex items-center gap-1.5" :class="isDark ? 'bg-red-400/10 border border-red-400/20' : 'bg-red-50 border border-red-100'">
              <i class="ri-error-warning-line text-[12px] shrink-0" :class="isDark ? 'text-red-400' : 'text-red-500'" />
              <p class="text-[11px] leading-tight" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ aiResultError }}</p>
            </div>
            <div v-if="aiResult" class="mt-3">
              <div class="flex items-center justify-between mb-1.5"><span class="text-[11px] font-medium" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">配置（可编辑确认后保存）</span><button class="text-[11px] inline-flex items-center gap-1" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'" @click="aiResult = null; aiResultText = ''; aiResultError = ''"><i class="ri-refresh-line text-[11px]" />重新解析</button></div>
              <textarea v-model="aiResultText" rows="9" class="w-full px-2.5 py-2 rounded-lg text-[11px] font-mono outline-none resize-none thin-scroll" :class="[aiResultError ? (isDark ? 'bg-d2 border border-red-400/50 text-wt-main' : 'bg-l2 border border-red-400/50 text-lt-main') : (isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500')]" spellcheck="false" />
              <p v-if="aiResultError" class="text-[10px] mt-1" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ aiResultError }}</p>
            </div>
         </div>
          <!-- Edit existing: API key + config -->
         <div v-if="rightMode === 'custom-existing'" class="mb-5 space-y-4">
           <div>
              <label class="block text-[12px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">服务地址 <span :class="isDark ? 'text-red-400' : 'text-red-500'">*</span></label>
              <input v-model="customBaseUrl" class="w-full h-8 px-3 rounded-lg text-[14px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="https://api.example.com" />
            </div>
            <div>
             <label class="block text-[12px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key <span class="text-[10px] font-normal" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">（可选）</span></label>
              <div class="relative">
                <input v-model="customApiKey" :type="showCustomKey ? 'text' : 'password'" class="w-full h-8 px-3 pr-9 rounded-lg text-[14px] font-mono outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" placeholder="粘贴 API Key" />
                <button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[15px]" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'" @click="showCustomKey = !showCustomKey"><i :class="showCustomKey ? 'ri-eye-off-line' : 'ri-eye-line'" /></button>
              </div>
           </div>
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">协议配置</label>
                <span class="text-[11px] inline-flex items-center gap-1" :class="isDark ? 'text-amber-400' : 'text-amber-500'"><i class="ri-error-warning-line text-[11px]" />请谨慎修改</span>
              </div>
              <textarea v-model="aiResultText" rows="12" class="w-full px-2.5 py-2 rounded-lg text-[12px] font-mono outline-none resize-none thin-scroll" :class="[aiResultError ? (isDark ? 'bg-d2 border border-red-400/50 text-wt-main' : 'bg-l2 border border-red-400/50 text-lt-main') : (isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500')]" spellcheck="false" />
              <p v-if="aiResultError" class="text-[11px] mt-1" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ aiResultError }}</p>
              <p v-else-if="aiResultText.trim() && !aiResultError" class="text-[11px] mt-1" :class="isDark ? 'text-emerald-400' : 'text-emerald-500'"><i class="ri-check-line text-[12px]" />JSON 格式正确</p>
            </div>
          </div>
          <div v-if="aiResultText || isConfigured" class="flex items-center gap-2">
            <button v-if="isConfigured" class="h-8 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" :disabled="!!testing" @click="testConn"><i :class="[testing ? 'ri-loader-4-line animate-spin' : 'ri-plug-line', 'text-[13px]']" />测试连接</button>
            <div class="flex-1" />
            <button v-if="isConfigured" class="h-8 px-3.5 rounded-lg text-[12px] inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-dim hover:text-red-400' : 'bg-l4 text-lt-aux hover:text-red-500'" @click="askDelete"><i class="ri-delete-bin-line text-[13px]" />删除</button>
            <button class="h-8 px-5 rounded-lg text-[13px] font-medium" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" :disabled="saving || !aiResultText" @click="handleCustomSave">{{ saving ? '保存中...' : (isConfigured ? '保存' : '添加') }}</button>
          </div>
        </div>
        <!-- MCP config -->
        <div v-else-if="rightMode === 'new-mcp' || rightMode === 'mcp-existing'" class="max-w-[800px] mx-auto px-10 py-6">
          <div class="rounded-xl p-4 mb-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-d1' : 'bg-l1'"><i class="ri-server-line text-[20px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" /></div>
              <div class="min-w-0 flex-1"><span class="text-[16px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ mcpName }}</span><p class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">通过 MCP 协议接入外部知识库检索工具</p></div>
              <span v-if="isConfigured" class="text-[11px] px-2 py-0.5 rounded font-medium shrink-0" :class="isActive ? 'bg-emerald-400/15 text-emerald-400' : (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')">{{ isActive ? '已启用' : '已配置' }}</span>
            </div>
          </div>
          <div class="space-y-4 mb-5">
            <div>
              <label class="block text-[11px] font-medium mb-1.5" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">名称</label>
              <input v-model="mcpName" class="w-full h-8 px-3 rounded-lg text-[13px] outline-none transition-colors" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" />
            </div>
            <div class="rounded-xl p-3 mb-4" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">MCP 服务器</label>
                <button class="text-[11px] inline-flex items-center gap-1 transition-colors" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'" @click="router.push('/tools')">
                  <i class="ri-settings-3-line text-[12px]" />工具 / MCP管理
                </button>
              </div>
              <div class="relative">
                <button type="button" data-mcp-server-trigger @click="mcpServerOpen = !mcpServerOpen" class="w-full h-9 pl-3 pr-8 rounded-lg text-[14px] outline-none cursor-pointer transition-colors flex items-center" :class="[isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500', mcpServerOpen ? (isDark ? 'border-brand-400/40' : 'border-brand-400') : '']">
                  <span class="truncate">{{ mcpServers.find(s => s.id === mcpForm.serverId)?.name || '请选择 MCP 服务器' }}</span>
                  <i class="ri-arrow-down-s-line text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                </button>
                <div v-if="mcpServerOpen" id="mcp-server-menu" class="absolute left-0 right-0 top-[34px] rounded-lg overflow-hidden z-30 shadow-lg" :class="isDark ? 'bg-d3 shadow-black/40 border border-d4' : 'bg-l2 shadow-xl border border-bdrF'">
                  <button type="button" @click="mcpForm.serverId = ''; mcpServerOpen = false; onMcpServerChange()" class="w-full flex items-center gap-2 px-3 py-2 text-[15px] transition-colors" :class="!mcpForm.serverId ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l4')">
                    <span class="flex-1 text-left">请选择 MCP 服务器</span>
                    <i v-if="!mcpForm.serverId" class="ri-check-line text-[15px]" />
                  </button>
                  <button v-for="s in mcpServers" :key="s.id" type="button" @click="mcpForm.serverId = s.id; mcpServerOpen = false; onMcpServerChange()" class="w-full flex items-center gap-2 px-3 py-2 text-[15px] transition-colors" :class="mcpForm.serverId === s.id ? (isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500') : (isDark ? 'text-wt-main hover:bg-white/5' : 'text-lt-main hover:bg-l4')">
                    <span class="truncate flex-1 text-left">{{ s.name }}</span>
                    <i v-if="mcpForm.serverId === s.id" class="ri-check-line text-[15px]" />
                  </button>
                </div>
              </div>
                <button class="mt-1.5 text-[11px] inline-flex items-center gap-1 transition-colors" :class="isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-500 hover:text-brand-600'" @click="showMcpAddForm = !showMcpAddForm">
                  <i class="ri-add-line text-[11px]" />{{ showMcpAddForm ? '取消添加' : '添加新MCP服务器' }}
                </button>
                <div v-if="showMcpAddForm" class="mt-1 rounded-lg" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
                  <p class="text-[11px] mb-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">粘贴 MCP 服务器 JSON 配置（支持 mcpServers 格式）</p>
                  <textarea v-model="mcpJsonText" rows="6" class="w-full px-2.5 py-2 rounded-lg text-[11px] font-mono outline-none transition-colors resize-none thin-scroll" :class="isDark ? 'bg-d2 border border-bdr text-wt-main focus:border-brand-400' : 'bg-l2 border border-bdrF text-lt-main focus:border-brand-500'" spellcheck="false" placeholder='{ "mcpServers": { "my-server": { "url": "https://", "type": "http", "headers": {} } } }' />
                  <button class="w-full h-8 mt-2 rounded-lg text-[12px] font-medium inline-flex items-center justify-center gap-1.5" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" :disabled="mcpAdding" @click="addMcpServerInline">
                    <i :class="[mcpAdding ? 'ri-loader-4-line animate-spin' : 'ri-add-line', 'text-[13px]']" />{{ mcpAdding ? '添加中...' : '添加服务器' }}
                  </button>
                </div>
             </div>
              <!-- Auto-discovered search tool -->
              <div v-if="mcpForm.serverId" class="rounded-lg p-3" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
                 <div class="flex items-center gap-1.5 mb-1.5">
                    <i :class="[mcpSyncing ? 'ri-loader-4-line animate-spin' : 'ri-search-line', 'text-[12px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
                    <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">检索工具</span>
                </div>
                <div v-if="mcpSyncing" class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在发现工具...</div>
                <div v-else-if="mcpForm.searchTool" class="flex items-center gap-2">
                  <span class="text-[12px] font-mono px-2 py-0.5 rounded" :class="isDark ? 'bg-d3 text-wt-main' : 'bg-l3 text-lt-main'">{{ mcpForm.searchTool }}</span>
                  <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已自动选择（共 {{ mcpTools.length }} 个工具）</span>
                </div>
                <div v-else class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未发现可用工具，将使用默认 kb_search</div>
             </div>
          </div>
          <div class="rounded-lg px-4 py-3 mb-5" :class="isDark ? 'bg-d1 border border-d4' : 'bg-l1 border border-bdrL'">
            <div class="flex items-center gap-1.5 mb-2"><i class="ri-book-open-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /><span class="text-[10px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">使用说明</span></div>
             <div class="space-y-1.5">
               <div class="flex items-start gap-2"><span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">1</span><span class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择已有 MCP 服务器，或点击「添加新服务器」通过 JSON 配置添加</span></div>
                <div class="flex items-start gap-2"><span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">2</span><span class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">系统自动发现并选择检索工具，无需手动配置</span></div>
                <div class="flex items-start gap-2"><span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5" :class="isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux'">3</span><span class="text-[10px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Agent 对话时会自动调用该工具进行知识库检索</span></div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button v-if="isConfigured" class="h-8 px-3.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" :disabled="!!testing" @click="testConn"><i :class="[testing ? 'ri-loader-4-line animate-spin' : 'ri-plug-line', 'text-[13px]']" />测试连接</button>
            <div class="flex-1" />
             <button v-if="isConfigured" class="h-8 px-3.5 rounded-lg text-[12px] inline-flex items-center gap-1.5" :class="isDark ? 'bg-d4 text-wt-dim hover:text-red-400' : 'bg-l4 text-lt-aux hover:text-red-500'" @click="askDelete"><i class="ri-delete-bin-line text-[13px]" />删除</button>
              <button class="h-8 px-5 rounded-lg text-[13px] font-medium" :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'" :disabled="saving || !mcpForm.serverId" @click="handleMcpSave">{{ saving ? '保存中...' : (isConfigured ? '保存' : '添加') }}</button>
            </div>
        </div>
      </div>
   </div>
   <!-- Delete confirm -->
    <div v-if="confirmDelete" class="fixed inset-0 z-[80] flex items-center justify-center" @click.self="confirmDelete = null">
      <div class="absolute inset-0 bg-black/40" />
      <div class="relative z-10 w-[360px] rounded-xl p-5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
        <div class="flex items-center gap-2 mb-3"><i class="ri-error-warning-line text-[18px] text-red-400" /><span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">删除知识源</span></div>
        <p class="text-[12px] mb-4" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">确定删除 "{{ confirmDelete.name }}" 吗？此操作不可撤销。</p>
        <div class="flex justify-end gap-2">
          <button class="h-8 px-3 rounded-lg text-[12px]" :class="isDark ? 'bg-d4 text-wt-sub hover:bg-d1' : 'bg-l4 text-lt-sub hover:bg-l1'" @click="confirmDelete = null">取消</button>
          <button class="h-8 px-3 rounded-lg text-[12px] font-medium bg-red-500 text-white hover:bg-red-600" :disabled="deleting" @click="confirmDeleteSource">{{ deleting ? '删除中...' : '删除' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
