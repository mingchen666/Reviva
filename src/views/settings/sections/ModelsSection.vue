<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { useUserProfileStore } from '@/stores/userProfile'
import { cloudLlmApi } from '@/apis/cloudLlm'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import ProviderSidebar from './model-components/ProviderSidebar.vue'
import ProviderHeader from './model-components/ProviderHeader.vue'
import ProviderConfigPanel from './model-components/ProviderConfigPanel.vue'
import OfficialProviderPanel from './model-components/OfficialProviderPanel.vue'
import ModelList from './model-components/ModelList.vue'
import OfficialUsageRecords from './model-components/OfficialUsageRecords.vue'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const userProfileStore = useUserProfileStore()
const msg = useMessage()
const isDark = computed(() => appStore.isDark)
const accentHex = computed(() => settingsStore.currentAccentHex)

const selectedProviderId = ref(null)
const showApiKeys = ref({})
const fetchingModels = ref(false)
const fetchError = ref(null)
const hasUnsavedChanges = ref(false)

const OFFICIAL_API_KEY_DESC = 'Reviva 官方模型服务'

// Fetch modal state
const showFetchModal = ref(false)
const fetchSearchQuery = ref('')
const fetchedModels = ref([])
const fetchSelectedIds = ref([])

// Add model modal state
const showAddModal = ref(false)
const addForm = ref({ id: '', name: '', ctx: '', maxOutput: '', tier: 'balanced', capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: false }, costInput: 0, costOutput: 0, costCacheRead: 0 })

// Delete confirmation modal state
const showDeleteModal = ref(false)
const pendingDeleteModel = ref(null)

// Test connection modal state
const showTestModal = ref(false)
const testModelId = ref('')
const testLoading = ref(false)
const testResult = ref(null)

// Edit model modal state
const showEditModal = ref(false)
const editForm = ref({ providerId: '', modelId: '', name: '', ctx: '', maxOutput: '', tier: 'balanced', capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: false }, costInput: 0, costOutput: 0, costCacheRead: 0 })

// Official cloud provider state
const officialKeyLoading = ref(false)
const officialKeyError = ref(null)
const officialBalance = ref(0)
const officialBalanceLoading = ref(false)
const officialBalanceLoaded = ref(false)
const officialModelsLoaded = ref(false)
const usageRecords = ref([])
const usageRecordsLoading = ref(false)
const usageRecordsError = ref(null)
const usageRecordsPage = ref(1)
const usageRecordsTotal = ref(0)
const usageRecordsHasNext = ref(false)
const usageStatusFilter = ref('')
const usageModelFilter = ref('')

onMounted(() => {
  const first = settingsStore.providers.find(p => p.enabled)
  if (first) selectedProviderId.value = first.id
  else if (settingsStore.providers.length) selectedProviderId.value = settingsStore.providers[0].id
})

const selectedProvider = computed(() =>
  settingsStore.providers.find(p => p.id === selectedProviderId.value)
)

watch(selectedProviderId, () => {
  fetchError.value = null
  if (selectedProvider.value?.official) {
    if (userStore.isLoggedIn) loadOfficialProviderData({ silent: true })
    else resetOfficialCloudState()
  }
})

watch(() => userStore.isLoggedIn, (loggedIn) => {
  if (!selectedProvider.value?.official) return
  if (loggedIn) loadOfficialProviderData({ silent: true })
  else resetOfficialCloudState()
})

const isOfficialProvider = computed(() => !!selectedProvider.value?.official)
const canEditBaseUrl = computed(() => !!selectedProvider.value && !isOfficialProvider.value)
const isBaseUrlDefault = computed(() => selectedProvider.value?.baseUrl === settingsStore.getProviderDefaultBaseUrl(selectedProvider.value?.id))
const isProviderConfigured = computed(() => {
  if (!selectedProvider.value) return false
  return settingsStore.providerConfigured(selectedProvider.value)
})
const canFetchModels = computed(() => {
  if (!selectedProvider.value) return false
  return isOfficialProvider.value ? userStore.isLoggedIn : isProviderConfigured.value
})
const officialStatus = computed(() => {
  if (!userStore.isLoggedIn) {
    return {
      label: '未登录',
      desc: '登录后同步余额、官方 Key 和调用记录',
      icon: 'ri-user-3-line',
      className: isDark.value ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100',
    }
  }
  if (officialKeyLoading.value || officialBalanceLoading.value || fetchingModels.value) {
    return {
      label: '同步中',
      desc: '正在刷新官方服务状态',
      icon: 'ri-loader-4-line',
      className: isDark.value ? 'text-sky-400 bg-sky-400/8 border border-sky-400/20' : 'text-sky-600 bg-sky-50 border border-sky-100',
    }
  }
  if (!selectedProvider.value?.apiKey) {
    return {
      label: '待创建 Key',
      desc: '点击重置 Key 创建官方调用凭证',
      icon: 'ri-key-2-line',
      className: isDark.value ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100',
    }
  }
  if (officialBalance.value <= 0) {
    return {
      label: '余额不足',
      desc: '积分余额为 0，调用会被云端拒绝',
      icon: 'ri-error-warning-line',
      className: isDark.value ? 'text-red-400 bg-red-400/8 border border-red-400/20' : 'text-red-600 bg-red-50 border border-red-100',
    }
  }
  return {
    label: '可用',
    desc: '官方模型服务已就绪',
    icon: 'ri-checkbox-circle-line',
    className: isDark.value ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100',
  }
})
const usageRecordSummary = computed(() => {
  const rows = usageRecords.value || []
  const totalPoints = rows.reduce((sum, r) => sum + (Number(r.charged_points) || 0), 0)
  const totalTokens = rows.reduce((sum, r) => sum + (Number(r.total_tokens) || 0), 0)
  const successCount = rows.filter(r => r.status === 'succeeded').length
  const latencyRows = rows.map(r => Number(r.latency_ms)).filter(n => Number.isFinite(n) && n > 0)
  const avgLatency = latencyRows.length ? Math.round(latencyRows.reduce((sum, n) => sum + n, 0) / latencyRows.length) : 0
  return { totalPoints, totalTokens, successCount, avgLatency }
})

const enabledProvidersCount = computed(() => settingsStore.enabledProviders.length)
const availableModelsCount = computed(() => settingsStore.availableModels)

const enabledModels = computed(() => {
  if (!selectedProvider.value) return []
  return selectedProvider.value.models.filter(m => m.enabled)
})

// Capability visual map
const CAPABILITY_META = {
  tool_calling: { icon: 'ri-tools-line', label: '工具', darkClass: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', lightClass: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  vision: { icon: 'ri-eye-line', label: '视觉', darkClass: 'text-sky-400 bg-sky-400/10 border-sky-400/20', lightClass: 'text-sky-600 bg-sky-50 border-sky-200' },
  search: { icon: 'ri-search-line', label: '搜索', darkClass: 'text-amber-400 bg-amber-400/10 border-amber-400/20', lightClass: 'text-amber-600 bg-amber-50 border-amber-200' },
  vector: { icon: 'ri-database-2-line', label: '向量', darkClass: 'text-violet-400 bg-violet-400/10 border-violet-400/20', lightClass: 'text-violet-600 bg-violet-50 border-violet-200' },
  reranking: { icon: 'ri-sort-desc', label: '重排序', darkClass: 'text-pink-400 bg-pink-400/10 border-pink-400/20', lightClass: 'text-pink-600 bg-pink-50 border-pink-200' },
}

function tierLabel(tier) {
  const map = { flagship: '旗舰', balanced: '均衡', fast: '轻量', embedding: '向量' }
  return map[tier] || tier
}

function tierColor(tier) {
  const map = {
    flagship: { text: isDark.value ? '#F87171' : '#DC2626', bg: isDark.value ? 'rgba(248,113,113,.08)' : 'rgba(220,38,38,.06)', border: isDark.value ? 'rgba(248,113,113,.2)' : 'rgba(220,38,38,.12)' },
    balanced: { text: isDark.value ? '#6C8AFF' : '#4F46E5', bg: isDark.value ? 'rgba(108,138,255,.08)' : 'rgba(79,70,229,.06)', border: isDark.value ? 'rgba(108,138,255,.2)' : 'rgba(79,70,229,.12)' },
    fast: { text: isDark.value ? '#34D399' : '#059669', bg: isDark.value ? 'rgba(52,211,153,.08)' : 'rgba(5,150,105,.06)', border: isDark.value ? 'rgba(52,211,153,.2)' : 'rgba(5,150,105,.12)' },
    embedding: { text: isDark.value ? '#FACC15' : '#D97706', bg: isDark.value ? 'rgba(250,204,21,.08)' : 'rgba(217,119,6,.06)', border: isDark.value ? 'rgba(250,204,21,.2)' : 'rgba(217,119,6,.12)' },
  }
  return map[tier] || map.balanced
}

function capClass(key) {
  return isDark.value ? CAPABILITY_META[key].darkClass : CAPABILITY_META[key].lightClass
}

function getActiveCapabilities(capabilities) {
  if (!capabilities) return []
  return Object.entries(capabilities).filter(([, v]) => v).map(([k]) => k)
}

function formatCost(val) {
  if (val === 0 || val === undefined || val === null) return '0'
  if (val >= 1) return String(val)
  if (val >= 0.01) return val.toFixed(2)
  return val.toFixed(3)
}

function toggleProviderEnabled(providerId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (!p) return
  p.enabled = !p.enabled
  p.configured = settingsStore.providerConfigured(p)
  hasUnsavedChanges.value = true
  debouncedAutoSave()
}

function toggleModelEnabled(providerId, modelId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (!p) return
  const m = p.models.find(m => m.id === modelId)
  if (!m) return
  m.enabled = !m.enabled
  hasUnsavedChanges.value = true
  debouncedAutoSave()
}

function toggleApiKeyVisibility(providerId) {
  showApiKeys.value[providerId] = !showApiKeys.value[providerId]
}

function copyApiKey(providerId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (!p?.apiKey) return
  if (!navigator.clipboard?.writeText) {
    msg.error('当前环境不支持剪贴板')
    return
  }
  navigator.clipboard.writeText(p.apiKey)
    .then(() => msg.success('API Key 已复制'))
    .catch(() => msg.error('复制失败'))
}

function onApiKeyInput(providerId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (p) p.configured = settingsStore.providerConfigured(p)
  hasUnsavedChanges.value = true
  debouncedAutoSave()
}

function onBaseUrlInput() {
  if (selectedProvider.value) selectedProvider.value.configured = settingsStore.providerConfigured(selectedProvider.value)
  hasUnsavedChanges.value = true
  debouncedAutoSave()
}

let _autoSaveTimer = null
async function saveProvidersOrThrow() {
  const ok = await settingsStore.saveProviders()
  if (!ok) throw new Error('模型服务配置保存失败')
}

function debouncedAutoSave() {
  clearTimeout(_autoSaveTimer)
  _autoSaveTimer = setTimeout(async () => {
    try {
      if (selectedProvider.value) selectedProvider.value.configured = settingsStore.providerConfigured(selectedProvider.value)
      await saveProvidersOrThrow()
      hasUnsavedChanges.value = false
    } catch (e) {
      msg.error(e.message || '自动保存失败', { title: '保存失败', duration: 4000 })
    }
  }, 1500)
}

function resetOfficialCloudState() {
  officialBalance.value = 0
  officialBalanceLoaded.value = false
  officialKeyError.value = null
  usageRecords.value = []
  usageRecordsTotal.value = 0
  usageRecordsHasNext.value = false
}

function resetBaseUrlToDefault() {
  if (!selectedProvider.value) return
  if (settingsStore.resetProviderBaseUrl(selectedProvider.value.id)) {
    onBaseUrlInput()
  }
}

// Test connection
function openTestModal() {
  if (!selectedProvider.value || !isProviderConfigured.value) return
  testModelId.value = enabledModels.value.length > 0 ? enabledModels.value[0].id : (selectedProvider.value.models.length > 0 ? selectedProvider.value.models[0].id : '')
  testResult.value = null
  testLoading.value = false
  showTestModal.value = true
}

async function runTestConnection() {
  if (!selectedProvider.value || !testModelId.value || !settingsStore.providerConfigured(selectedProvider.value)) {
    testResult.value = { success: false, error: '请先填写 API Key、Base URL 并选择模型' }
    return
  }
  testLoading.value = true
  testResult.value = null
  try {
    const result = await window.electronAPI?.models?.testConnection(
      selectedProvider.value.id,
      selectedProvider.value.apiKey,
      selectedProvider.value.baseUrl,
      testModelId.value,
      providerApiFormat(selectedProvider.value)
    )
    testResult.value = result || { success: false, error: '测试失败' }
  } catch (e) {
    testResult.value = { success: false, error: e.message }
  }
  testLoading.value = false
}

async function fetchModelList() {
  if (isOfficialProvider.value) {
    await fetchOfficialModelList()
    return
  }
  if (!selectedProvider.value || !settingsStore.providerConfigured(selectedProvider.value)) {
    fetchError.value = !selectedProvider.value?.apiKey ? '请先填写 API Key' : '请先填写 Base URL'
    return
  }
  fetchingModels.value = true
  fetchError.value = null
  try {
    const result = await window.electronAPI?.models?.fetchList(
      selectedProvider.value.id,
      selectedProvider.value.apiKey,
      selectedProvider.value.baseUrl,
      providerApiFormat(selectedProvider.value)
    )
    if (!result) {
      fetchError.value = 'API 不可用'
    } else if (result.success) {
      fetchedModels.value = result.models || []
      fetchSearchQuery.value = ''
      fetchSelectedIds.value = []
      showFetchModal.value = true
    } else {
      fetchError.value = result.error || '获取失败'
    }
  } catch (e) {
    fetchError.value = e.message
  }
  fetchingModels.value = false
}

async function fetchOfficialModelList({ silent = false } = {}) {
  if (!selectedProvider.value?.official) return
  if (!userStore.isLoggedIn) {
    fetchError.value = '登录后可获取官方模型列表'
    return
  }
  const providerId = selectedProvider.value.id
  fetchingModels.value = true
  if (!silent) fetchError.value = null
  try {
    const result = await cloudLlmApi.models()
    const models = normalizeOfficialModels(result)
    settingsStore.syncFetchedModels(providerId, models, {
      replaceMissing: true,
      enableNew: true,
      addedBy: 'official',
    })
    await saveProvidersOrThrow()
    officialModelsLoaded.value = true
  } catch (e) {
    fetchError.value = e.message || '获取官方模型失败'
  } finally {
    fetchingModels.value = false
  }
}

function normalizeOfficialModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.models) ? payload.models : [])
  return rows.map((item) => {
    const id = item.id || item.name || ''
    const pricing = item.pricing || {}
    return {
      id,
      name: item.name || id,
      ctx: item.ctx || item.context_window || '?',
      maxOutput: item.maxOutput || item.max_output || '?',
      tier: settingsStore.guessTier(id),
      capabilities: inferModelCapabilities(id),
      billingUnit: pricing.billing_unit || 'points',
      costInput: numberOrZero(pricing.input_points_per_1m),
      costOutput: numberOrZero(pricing.output_points_per_1m),
      costCacheRead: numberOrZero(pricing.cached_input_points_per_1m),
      costCacheWrite: numberOrZero(pricing.cached_input_points_per_1m),
      requestMinPoints: numberOrZero(pricing.request_min_points),
      pointsPerCny: numberOrZero(pricing.points_per_cny) || 100,
      minPositiveChargePoints: numberOrZero(pricing.min_positive_charge_points) || 1,
      addedBy: 'official',
      enabled: true,
    }
  }).filter(m => m.id)
}

function inferModelCapabilities(modelId) {
  const id = String(modelId || '').toLowerCase()
  const embedding = id.includes('embed')
  const reranking = id.includes('rerank')
  return {
    tool_calling: !embedding && !reranking,
    vision: /vision|vl|gpt-4o|gemini|claude|qwen-vl/.test(id),
    search: false,
    vector: embedding,
    reranking,
  }
}

function numberOrZero(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function loadOfficialProviderData({ silent = false } = {}) {
  if (!selectedProvider.value?.official || !userStore.isLoggedIn) return
  await Promise.allSettled([
    loadOfficialBalance(),
    loadOfficialApiKey({ silent }),
    fetchOfficialModelList({ silent: true }),
    loadUsageRecords({ page: 1, append: false, silent: true }),
  ])
}

async function loadOfficialBalance() {
  officialBalanceLoading.value = true
  try {
    const res = await userProfileStore.loadBalance()
    officialBalance.value = Number(res?.points_balance ?? userProfileStore.credits.balance ?? 0) || 0
    officialBalanceLoaded.value = true
    return res
  } catch (e) {
    officialBalance.value = 0
    return null
  } finally {
    officialBalanceLoading.value = false
  }
}

async function loadOfficialApiKey({ silent = false } = {}) {
  if (!selectedProvider.value?.official || !userStore.isLoggedIn) return
  officialKeyLoading.value = true
  if (!silent) officialKeyError.value = null
  try {
    const result = await cloudLlmApi.apiKeys()
    const item = (result?.items || []).find(k => String(k.description || '').includes(OFFICIAL_API_KEY_DESC))
    if (item?.key) {
      selectedProvider.value.apiKey = item.key
      selectedProvider.value.apiKeyId = item.id || ''
      selectedProvider.value.configured = true
      await saveProvidersOrThrow()
    }
  } catch (e) {
    officialKeyError.value = e.message || '获取官方 Key 状态失败'
  } finally {
    officialKeyLoading.value = false
  }
}

async function resetOfficialApiKey() {
  if (!selectedProvider.value?.official) return
  if (!userStore.isLoggedIn) {
    officialKeyError.value = '请先登录后再重置官方 Key'
    return
  }
  officialKeyLoading.value = true
  officialKeyError.value = null
  const provider = selectedProvider.value
  const oldKeyId = provider.apiKeyId
  try {
    const created = await cloudLlmApi.createApiKey(`${OFFICIAL_API_KEY_DESC} ${new Date().toISOString().slice(0, 10)}`)
    provider.apiKey = created.key || ''
    provider.apiKeyId = created.id || ''
    provider.configured = settingsStore.providerConfigured(provider)
    await saveProvidersOrThrow()
    if (oldKeyId && oldKeyId !== provider.apiKeyId) {
      cloudLlmApi.deleteApiKey(oldKeyId).catch(() => {})
    }
    msg.success('官方模型 Key 已重置')
  } catch (e) {
    officialKeyError.value = e.message || '重置官方 Key 失败'
    msg.error(officialKeyError.value)
  } finally {
    officialKeyLoading.value = false
  }
}

function toggleFetchSelect(modelId) {
  const idx = fetchSelectedIds.value.indexOf(modelId)
  if (idx >= 0) fetchSelectedIds.value.splice(idx, 1)
  else fetchSelectedIds.value.push(modelId)
}

function confirmFetchAdd() {
  if (!selectedProvider.value || fetchSelectedIds.value.length === 0) return
  const modelsToAdd = fetchedModels.value.filter(m => fetchSelectedIds.value.includes(m.id))
  settingsStore.addFetchedModels(selectedProvider.value.id, modelsToAdd)
  hasUnsavedChanges.value = true
  showFetchModal.value = false
  msg.info(`已添加 ${modelsToAdd.length} 个模型，点击保存生效`)
}

// Delete
function requestDeleteModel(providerId, modelId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  const m = p?.models.find(m => m.id === modelId)
  if (!p || !m) return
  pendingDeleteModel.value = { providerId, providerName: p.name, modelId, modelName: m.name }
  showDeleteModal.value = true
}

async function confirmDeleteModel() {
  if (!pendingDeleteModel.value) return
  settingsStore.removeModelFromProvider(pendingDeleteModel.value.providerId, pendingDeleteModel.value.modelId)
  try {
    await saveProvidersOrThrow()
    hasUnsavedChanges.value = false
    msg.success('模型已删除')
    pendingDeleteModel.value = null
  } catch (e) {
    hasUnsavedChanges.value = true
    msg.error(e.message || '删除后保存失败', { title: '保存失败', duration: 4000 })
  }
}

// Add model
function openAddModal() {
  if (isOfficialProvider.value || !isProviderConfigured.value) return
  addForm.value = { id: '', name: '', ctx: '', maxOutput: '', tier: 'balanced', capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: false }, costInput: 0, costOutput: 0, costCacheRead: 0 }
  showAddModal.value = true
}

function toggleAddCapability(key) {
  addForm.value.capabilities[key] = !addForm.value.capabilities[key]
}

function confirmAddModel() {
  if (!addForm.value.id || !selectedProvider.value) return
  const cacheCost = Number(addForm.value.costCacheRead) || 0
  settingsStore.addModelToProvider(selectedProvider.value.id, {
    id: addForm.value.id,
    name: addForm.value.name || addForm.value.id,
    ctx: addForm.value.ctx || '?',
    maxOutput: addForm.value.maxOutput || '?',
    tier: addForm.value.tier,
    capabilities: { ...addForm.value.capabilities },
    costInput: Number(addForm.value.costInput) || 0,
    costOutput: Number(addForm.value.costOutput) || 0,
    costCacheRead: cacheCost,
    costCacheWrite: cacheCost,
    addedBy: 'user',
    enabled: false,
  })
  hasUnsavedChanges.value = true
  showAddModal.value = false
  msg.success('模型已添加，点击保存生效')
}

// Edit model
function openEditModal(providerId, model) {
  editForm.value = {
    providerId,
    modelId: model.id,
    name: model.name || '',
    ctx: model.ctx || '',
    maxOutput: model.maxOutput || '',
    tier: model.tier || 'balanced',
    capabilities: { ...(model.capabilities || { tool_calling: false, vision: false, search: false, vector: false, reranking: false }) },
    costInput: model.costInput ?? 0,
    costOutput: model.costOutput ?? 0,
    costCacheRead: model.costCacheRead ?? 0,
  }
  showEditModal.value = true
}

function toggleEditCapability(key) {
  editForm.value.capabilities[key] = !editForm.value.capabilities[key]
}

function confirmEditModel() {
  if (!editForm.value.modelId) return
  const cacheCost = Number(editForm.value.costCacheRead) || 0
  settingsStore.updateModelInProvider(editForm.value.providerId, editForm.value.modelId, {
    name: editForm.value.name,
    ctx: editForm.value.ctx || '?',
    maxOutput: editForm.value.maxOutput || '?',
    tier: editForm.value.tier,
    capabilities: { ...editForm.value.capabilities },
    costInput: Number(editForm.value.costInput) || 0,
    costOutput: Number(editForm.value.costOutput) || 0,
    costCacheRead: cacheCost,
    costCacheWrite: cacheCost,
  })
  hasUnsavedChanges.value = true
  showEditModal.value = false
  msg.success('模型修改已暂存，点击保存生效')
}

async function saveAll() {
  clearTimeout(_autoSaveTimer)
  try {
    if (selectedProvider.value) selectedProvider.value.configured = settingsStore.providerConfigured(selectedProvider.value)
    await saveProvidersOrThrow()
    hasUnsavedChanges.value = false
    msg.success('模型服务配置已保存')
  } catch (e) {
    msg.error(e.message || '保存失败', { title: '保存失败', duration: 4000 })
  }
}

async function resetChanges() {
  await settingsStore.loadFromDb()
  showApiKeys.value = {}
  fetchError.value = null
  hasUnsavedChanges.value = false
  if (selectedProvider.value?.official) loadOfficialProviderData({ silent: true })
  msg.info('已放弃未保存改动')
}

const filteredFetchedModels = computed(() => {
  if (!fetchSearchQuery.value) return fetchedModels.value
  const q = fetchSearchQuery.value.toLowerCase()
  return fetchedModels.value.filter(m => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)))
})

const existingModelIds = computed(() => {
  if (!selectedProvider.value) return []
  return selectedProvider.value.models.map(m => m.id)
})

async function loadUsageRecords({ page = 1, append = false, silent = false } = {}) {
  if (!selectedProvider.value?.official || !userStore.isLoggedIn) return
  usageRecordsLoading.value = true
  if (!silent) usageRecordsError.value = null
  try {
    const params = { page, page_size: 10 }
    if (usageStatusFilter.value) params.status = usageStatusFilter.value
    if (usageModelFilter.value) params.model_alias = usageModelFilter.value.trim()
    const result = await cloudLlmApi.usageRecords(params)
    const items = result?.items || []
    usageRecords.value = append ? [...usageRecords.value, ...items] : items
    usageRecordsPage.value = result?.page ?? page
    usageRecordsTotal.value = result?.total ?? usageRecords.value.length
    usageRecordsHasNext.value = !!result?.has_next
  } catch (e) {
    usageRecordsError.value = e.message || '获取调用记录失败'
  } finally {
    usageRecordsLoading.value = false
  }
}

function reloadUsageRecords() {
  loadUsageRecords({ page: 1, append: false })
}

function loadMoreUsageRecords() {
  if (usageRecordsLoading.value || !usageRecordsHasNext.value) return
  loadUsageRecords({ page: usageRecordsPage.value + 1, append: true })
}

function costUnitLabel(model) {
  return model?.billingUnit === 'points' ? '积分/1M' : '元/1M'
}

function providerConfigHint() {
  if (!selectedProvider.value) return ''
  if (isOfficialProvider.value) {
    if (!userStore.isLoggedIn) return '登录后可使用官方模型服务，调用将按积分余额计费'
    if (!selectedProvider.value.apiKey) return '点击“重置 Key”创建官方调用 Key 后即可在应用内使用'
    return ''
  }
  if (!selectedProvider.value.baseUrl) return '请填写 Base URL 后即可使用全部功能'
  if (!selectedProvider.value.apiKey) return selectedProvider.value.local
    ? '请填写 API Key 后即可使用全部功能；本地服务可填写任意值，例如 ollama'
    : '请填写 API Key 后即可使用全部功能'
  return ''
}

function providerApiFormat(provider) {
  return settingsStore.normalizeProviderApiFormat
    ? settingsStore.normalizeProviderApiFormat(provider?.apiFormat, provider?.id)
    : (provider?.apiFormat || (provider?.id === 'anthropic' ? 'anthropic' : 'openai'))
}

function selectApiFormat(format) {
  if (!selectedProvider.value || isOfficialProvider.value) return
  selectedProvider.value.apiFormat = settingsStore.normalizeProviderApiFormat
    ? settingsStore.normalizeProviderApiFormat(format, selectedProvider.value.id)
    : format
  hasUnsavedChanges.value = true
  debouncedAutoSave()
}

function baseUrlHelpText(provider) {
  const format = providerApiFormat(provider)
  if (format === 'anthropic') {
    return '可填写 Claude 官方 API 或兼容 Anthropic Messages API 的代理网关地址；点击“恢复默认”可回到内置 URL。'
  }
  if (format === 'openai_responses') {
    return '可填写 OpenAI 官方 API 或兼容 Responses API 的网关地址，通常保留到 /v1；点击“恢复默认”可回到内置 URL。'
  }
  return '可填写 Ollama、LM Studio、代理网关或其他 OpenAI-compatible 服务地址；点击“恢复默认”可回到内置 URL。'
}



// Cost fields config for edit/add modals
const COST_FIELDS = [
  { key: 'costInput', label: '输入', icon: 'ri-arrow-down-line', placeholder: '0' },
  { key: 'costOutput', label: '输出', icon: 'ri-arrow-up-line', placeholder: '0' },
  { key: 'costCacheRead', label: '缓存输入', icon: 'ri-database-2-line', placeholder: '0' },
]
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <ProviderSidebar
      :providers="settingsStore.providers"
      :selected-provider-id="selectedProviderId"
      :enabled-providers-count="enabledProvidersCount"
      :available-models-count="availableModelsCount"
      :is-dark="isDark"
      :accent-hex="accentHex"
      @select-provider="selectedProviderId = $event"
      @toggle-provider="toggleProviderEnabled"
    />

    <!-- Right Panel -->
    <div class="flex-1 overflow-y-auto relative">
      <template v-if="selectedProvider">
        <!-- Sticky Save Bar -->
        <Transition name="fade">
          <div v-if="hasUnsavedChanges" class="sticky top-0 z-20 backdrop-blur-md"
            :class="isDark ? 'bg-d1/85 border-b border-bdr' : 'bg-l1/90 border-b border-bdrF'">
            <div class="max-w-4xl mx-auto px-6 lg:px-8 h-11 flex items-center gap-2.5">
              <span class="w-1.5 h-1.5 rounded-full animate-pulse" :style="{ backgroundColor: accentHex }" />
              <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">有未保存改动</span>
              <div class="flex-1" />
              <button @click="resetChanges"
                class="h-7 px-3 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1"
                :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'">
                <i class="ri-arrow-go-back-line text-[12px]" />重置
              </button>
              <button @click="saveAll"
                class="h-7 px-3.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 text-white shadow-sm hover:shadow-md"
                :style="{ backgroundColor: accentHex }">
                <i class="ri-save-line text-[12px]" />保存
              </button>
            </div>
          </div>
        </Transition>

<div class="max-w-4xl mx-auto px-4 lg:px-6 py-4 space-y-4">
  <ProviderHeader
    :provider="selectedProvider"
    :is-dark="isDark"
    :accent-hex="accentHex"
    @toggle-provider="toggleProviderEnabled"
  />

  <!-- [占位] 官方服务商 -  -->
  <div v-if="isOfficialProvider"
    class="rounded-xl border py-16 flex flex-col items-center justify-center gap-3 select-none"
    :class="isDark ? 'border-bdr' : 'border-bdrF'">
    <div class="w-14 h-14 rounded-2xl flex items-center justify-center"
      :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
      <i class="ri-rocket-2-line text-[26px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
    </div>
    <p class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
      官方模型服务即将上线
    </p>
    <p class="text-[12px] max-w-[280px] text-center leading-relaxed"
      :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
      我们正在打磨云端模型调用、积分计费与用量统计等能力，敬请期待。
    </p>
    <span class="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
      :class="isDark ? 'bg-amber-400/8 text-amber-400 border border-amber-400/20' : 'bg-amber-50 text-amber-600 border border-amber-200'">
      <i class="ri-time-line text-[12px]" />Coming Soon
    </span>
  </div>

  <!--  
  <OfficialProviderPanel
    v-if="isOfficialProvider"
    :provider="selectedProvider"
    :is-dark="isDark"
    :user-logged-in="userStore.isLoggedIn"
    :official-status="officialStatus"
    :official-balance-loading="officialBalanceLoading"
    :official-balance="officialBalance"
    :official-balance-loaded="officialBalanceLoaded"
    :official-key-loading="officialKeyLoading"
    :official-key-error="officialKeyError"
    :fetching-models="fetchingModels"
    :is-provider-configured="isProviderConfigured"
    @refresh="loadOfficialProviderData()"
    @reset-key="resetOfficialApiKey"
    @copy-api-key="copyApiKey(selectedProvider.id)"
    @test="openTestModal"
  />
  -->

  <ProviderConfigPanel
    v-if="!isOfficialProvider"
    :provider="selectedProvider"
    :is-dark="isDark"
    :is-provider-configured="isProviderConfigured"
    :show-api-key="!!showApiKeys[selectedProvider.id]"
    :can-edit-base-url="canEditBaseUrl"
    :is-base-url-default="isBaseUrlDefault"
    :api-format="providerApiFormat(selectedProvider)"
    :base-url-help-text="baseUrlHelpText(selectedProvider)"
    @test="openTestModal"
    @toggle-api-key="toggleApiKeyVisibility(selectedProvider.id)"
    @copy-api-key="copyApiKey(selectedProvider.id)"
    @api-key-input="value => { selectedProvider.apiKey = value; onApiKeyInput(selectedProvider.id) }"
    @base-url-input="value => { selectedProvider.baseUrl = value; onBaseUrlInput() }"
    @reset-base-url="resetBaseUrlToDefault"
    @select-api-format="selectApiFormat"
  />

  <!-- Unconfigured hint -->
  <div v-if="!isOfficialProvider && !isProviderConfigured" class="rounded-lg px-3 py-2 flex items-center gap-2"
    :class="isDark ? 'bg-amber-400/6 border border-amber-400/15' : 'bg-amber-50 border border-amber-100'">
    <i class="ri-information-line text-[13px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
    <span class="text-[11px]" :class="isDark ? 'text-amber-400/80' : 'text-amber-600'">
      {{ providerConfigHint() }}
    </span>
  </div>

  <!-- 官方模式下隐藏模型列表 -->
  <ModelList
    v-if="!isOfficialProvider"
    :provider="selectedProvider"
    :is-dark="isDark"
    :accent-hex="accentHex"
    :is-official-provider="false"
    :official-models-loaded="false"
    :fetch-error="fetchError"
    :can-fetch-models="canFetchModels"
    :fetching-models="fetchingModels"
    :is-provider-configured="isProviderConfigured"
    :capability-meta="CAPABILITY_META"
    :tier-label="tierLabel"
    :tier-color="tierColor"
    :cap-class="capClass"
    :get-active-capabilities="getActiveCapabilities"
    :format-cost="formatCost"
    :cost-unit-label="costUnitLabel"
    @fetch-models="fetchModelList"
    @add-model="openAddModal"
    @edit-model="openEditModal"
    @delete-model="requestDeleteModel"
    @toggle-model="toggleModelEnabled"
  />

  <!-- 
  <OfficialUsageRecords
    v-if="isOfficialProvider"
    v-model:status-filter="usageStatusFilter"
    v-model:model-filter="usageModelFilter"
    :is-dark="isDark"
    :user-logged-in="userStore.isLoggedIn"
    :records="usageRecords"
    :total="usageRecordsTotal"
    :has-next="usageRecordsHasNext"
    :loading="usageRecordsLoading"
    :error="usageRecordsError"
    :summary="usageRecordSummary"
    @reload="reloadUsageRecords"
    @load-more="loadMoreUsageRecords"
  />
  -->
</div>
      </template>

      <!-- Empty State -->
      <div v-else class="flex items-center justify-center h-full">
        <div class="text-center">
          <i class="ri-cpu-line text-[40px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <p class="text-[13px] mt-3" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">请从左侧选择一个服务商</p>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <MsModal v-if="showDeleteModal" v-model:show="showDeleteModal" :width="360" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
            <i class="ri-delete-bin-line text-[16px] text-red-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">删除模型</span>
        </div>
      </template>
      <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        确定要从 {{ pendingDeleteModel?.providerName }} 删除模型 <strong>{{ pendingDeleteModel?.modelName }}</strong> 吗？删除后需要重新获取或手动添加。
      </p>
      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmDeleteModel(); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors bg-red-500 text-white hover:bg-red-600">确认删除</button>
      </template>
    </MsModal>

    <!-- Test Connection Modal -->
    <MsModal v-if="showTestModal" v-model:show="showTestModal" :width="400" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-link text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">测试模型连接</span>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">选择测试模型</label>
          <NSelect :value="testModelId" @update:value="v => testModelId = v"
            :options="enabledModels.map(m => ({ label: m.name, value: m.id }))"
            size="small"
            placeholder="选择一个已启用的模型" />
        </div>

        <div v-if="testLoading" class="flex items-center gap-2 py-3">
          <div class="w-5 h-5 border-2 rounded-full animate-spin" :class="isDark ? 'border-brand-400 border-t-transparent' : 'border-brand-500 border-t-transparent'" />
          <span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">正在测试...</span>
        </div>

        <div v-else-if="testResult" class="rounded-lg p-3" :class="testResult.success
          ? (isDark ? 'bg-emerald-400/8 border border-emerald-400/20' : 'bg-emerald-50 border border-emerald-100')
          : (isDark ? 'bg-red-400/8 border border-red-400/20' : 'bg-red-50 border border-red-100')">
          <div class="flex items-center gap-2 mb-1">
            <i :class="testResult.success ? 'ri-checkbox-circle-line text-emerald-400' : 'ri-error-warning-line text-red-400'" class="text-[16px]" />
            <span class="text-[13px] font-semibold" :class="testResult.success ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')">
              {{ testResult.success ? '连接成功' : '连接失败' }}
            </span>
            <span v-if="testResult.latencyMs" class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
              {{ testResult.latencyMs }}ms
            </span>
          </div>
          <p v-if="!testResult.success && testResult.error" class="text-[11px]" :class="isDark ? 'text-red-400/80' : 'text-red-500'">{{ testResult.error }}</p>
        </div>

        <div v-else class="flex items-center justify-center py-4">
          <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">选择模型后点击测试</span>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">关闭</button>
        <button @click="runTestConnection" :disabled="testLoading || !testModelId" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="(testLoading || !testModelId)
            ? (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')
            : (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')">
          {{ testLoading ? '测试中...' : '开始测试' }}
        </button>
      </template>
    </MsModal>

    <!-- Fetch Models Modal -->
    <MsModal v-if="showFetchModal" v-model:show="showFetchModal" :width="560" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-agent-400/8' : 'bg-agent-50'">
            <i class="ri-download-cloud-line text-[16px] text-agent-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">获取模型列表</span>
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          从 {{ selectedProvider?.name }} 获取到 {{ fetchedModels.length }} 个模型，选择要添加的模型：
        </p>
        <div class="relative">
          <i class="ri-search-line absolute left-2.5 top-[8px] text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <input v-model="fetchSearchQuery" type="text" placeholder="搜索模型..."
            class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div class="max-h-[300px] overflow-y-auto space-y-0.5">
          <div v-for="model in filteredFetchedModels" :key="model.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
            :class="existingModelIds.includes(model.id)
              ? (isDark ? 'bg-d3/50 text-wt-dim' : 'bg-l3/50 text-lt-aux')
              : (fetchSelectedIds.includes(model.id)
                ? (isDark ? 'bg-brand-400/8' : 'bg-brand-50')
                : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4'))"
            @click="!existingModelIds.includes(model.id) && toggleFetchSelect(model.id)">
            <div class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0"
              :class="existingModelIds.includes(model.id)
                ? (isDark ? 'bg-d4 border-d4' : 'bg-l4 border-l4')
                : (fetchSelectedIds.includes(model.id)
                  ? (isDark ? 'bg-brand-400 border-brand-400' : 'bg-brand-500 border-brand-500')
                  : (isDark ? 'border-d4' : 'border-bdrF'))">
              <i v-if="fetchSelectedIds.includes(model.id)" class="ri-check-line text-[12px] text-white" />
              <i v-else-if="existingModelIds.includes(model.id)" class="ri-check-line text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-[12px] truncate block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ model.id }}</span>
              <div class="flex items-center gap-1 flex-wrap mt-0.5">
                <span v-for="capKey in getActiveCapabilities(model.capabilities)" :key="capKey"
                  class="ctx-pill border" :class="capClass(capKey)" style="font-size:9px;padding:1px 4px">
                  <i :class="CAPABILITY_META[capKey].icon" class="text-[7px]" />{{ CAPABILITY_META[capKey].label }}
                </span>
                <span v-if="model.maxOutput && model.maxOutput !== '?'"
                  class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'"
                  style="font-size:9px;padding:1px 4px">
                  {{ model.maxOutput }}
                </span>
              </div>
            </div>
            <span v-if="existingModelIds.includes(model.id)" class="ctx-pill shrink-0" :class="isDark ? 'text-wt-dim bg-d4 border border-bdr' : 'text-lt-aux bg-l4 border border-bdrF'">已添加</span>
          </div>
          <div v-if="filteredFetchedModels.length === 0" class="text-center py-6">
            <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无匹配模型</span>
          </div>
        </div>
        <p v-if="fetchSelectedIds.length > 0" class="text-[11px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'">
          已选择 {{ fetchSelectedIds.length }} 个模型
        </p>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmFetchAdd(); close()" :disabled="fetchSelectedIds.length === 0"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="fetchSelectedIds.length === 0
            ? (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')
            : (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')">
          添加选中 ({{ fetchSelectedIds.length }})
        </button>
      </template>
    </MsModal>

    <!-- Add Model Modal -->
    <MsModal v-if="showAddModal" v-model:show="showAddModal" :width="460" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-violet-400/8' : 'bg-violet-50'">
            <i class="ri-add-line text-[16px] text-violet-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">手动添加模型</span>
        </div>
      </template>

      <div class="space-y-3">
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型 ID</label>
          <input v-model="addForm.id" type="text" placeholder="如 gpt-4o-2024-08-06"
            class="w-full h-8 rounded-lg px-3 text-[13.5px] font-mono outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">显示名称</label>
          <input v-model="addForm.name" type="text" placeholder="如 GPT-4o (2024-08)"
            class="w-full h-8 rounded-lg px-3 text-[13.5px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">上下文大小</label>
            <input v-model="addForm.ctx" type="text" placeholder="如 128K"
              class="w-full h-8 rounded-lg px-3 text-[13.5px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大输出</label>
            <input v-model="addForm.maxOutput" type="text" placeholder="如 16K"
              class="w-full h-8 rounded-lg px-3 text-[13.5px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">层级</label>
            <select v-model="addForm.tier"
              class="w-full h-8 rounded-lg px-3 text-[13px] outline-none transition-colors appearance-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub focus:border-brand-400'">
              <option value="flagship">旗舰</option>
              <option value="balanced">均衡</option>
              <option value="fast">轻量</option>
              <option value="embedding">向量</option>
            </select>
          </div>
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型能力</label>
          <div class="flex items-center gap-2 flex-wrap">
            <button v-for="(meta, key) in CAPABILITY_META" :key="key" @click="toggleAddCapability(key)"
              class="flex items-center ctx-pill border cursor-pointer transition-colors"
              :class="addForm.capabilities[key] ? capClass(key) : (isDark ? 'text-wt-dim bg-d4 border-bdr' : 'text-lt-aux bg-l4 border-bdrF')">
              <i :class="meta.icon" class="text-[12px]" /><span>{{ meta.label }}</span>
            </button>
          </div>
        </div>
        <!-- Cost fields -->
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <i class="ri-money-cny-circle-line text-[12.5px]" />Token 成本（元 / 100万 tokens）
          </label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="field in COST_FIELDS" :key="field.key">
              <div class="flex items-center gap-1 mb-1">
                <i :class="[field.icon, 'text-[13px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
                <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ field.label }}</span>
              </div>
              <input v-model.number="addForm[field.key]" type="number" step="0.001" min="0" :placeholder="field.placeholder"
                class="w-full h-8 rounded-lg px-2 text-[13.5px] font-mono outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
            </div>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmAddModel(); close()" :disabled="!addForm.id"
          class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
          :class="addForm.id
            ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
            : (isDark ? 'bg-d4 text-wt-dim' : 'bg-l4 text-lt-aux')">
          添加
        </button>
      </template>
    </MsModal>

    <!-- Edit Model Modal -->
    <MsModal v-if="showEditModal" v-model:show="showEditModal" :width="460" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-edit-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">编辑模型</span>
        </div>
      </template>

      <div class="space-y-3">
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型 ID</label>
          <input :value="editForm.modelId" type="text" disabled
            class="w-full h-8 rounded-lg px-3 text-[13.5px] font-mono outline-none"
            :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-l4'" />
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">显示名称</label>
          <input v-model="editForm.name" type="text" placeholder="模型显示名称"
            class="w-full h-8 rounded-lg px-3 text-[13.5px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">上下文大小</label>
            <input v-model="editForm.ctx" type="text" placeholder="如 128K"
              class="w-full h-8 rounded-lg px-3 text-[13px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大输出</label>
            <input v-model="editForm.maxOutput" type="text" placeholder="如 16K"
              class="w-full h-8 rounded-lg px-3 text-[13px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">层级</label>
            <select v-model="editForm.tier"
              class="w-full h-8 rounded-lg px-3 text-[13px] outline-none transition-colors appearance-none"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub focus:border-brand-400'">
              <option value="flagship">旗舰</option>
              <option value="balanced">均衡</option>
              <option value="fast">轻量</option>
              <option value="embedding">向量</option>
            </select>
          </div>
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">模型能力</label>
          <div class="flex items-center gap-2 flex-wrap">
            <button v-for="(meta, key) in CAPABILITY_META" :key="key" @click="toggleEditCapability(key)"
              class="ctx-pill flex items-center border cursor-pointer transition-colors"
              :class="editForm.capabilities[key] ? capClass(key) : (isDark ? 'text-wt-dim bg-d4 border-bdr' : 'text-lt-aux bg-l4 border-bdrF')">
              <i :class="meta.icon" class="text-[13px]" /><span>{{ meta.label }}</span>
            </button>
          </div>
        </div>
        <!-- Cost fields -->
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <i class="ri-money-cny-circle-line text-[12.5px]" />Token 成本（元 / 100万 tokens）
          </label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="field in COST_FIELDS" :key="field.key">
              <div class="flex items-center gap-1 mb-1">
                <i :class="[field.icon, 'text-[12px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ field.label }}</span>
              </div>
              <input v-model.number="editForm[field.key]" type="number" step="0.001" min="0" :placeholder="field.placeholder"
                class="w-full h-8 rounded-lg px-2 text-[12px] font-mono outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
            </div>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmEditModel(); close()"
          class="px-4 py-2 rounded-lg text-[12px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
          保存修改
        </button>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
