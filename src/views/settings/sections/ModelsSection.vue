<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { useUserProfileStore } from '@/stores/userProfile'
import { cloudLlmApi } from '@/apis/cloudLlm'
import MsModal from '@/components/MsModal/MsModal.vue'

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const userProfileStore = useUserProfileStore()
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
}

function toggleModelEnabled(providerId, modelId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (!p) return
  const m = p.models.find(m => m.id === modelId)
  if (!m) return
  m.enabled = !m.enabled
  hasUnsavedChanges.value = true
}

function toggleApiKeyVisibility(providerId) {
  showApiKeys.value[providerId] = !showApiKeys.value[providerId]
}

function copyApiKey(providerId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (p && p.apiKey) navigator.clipboard?.writeText(p.apiKey)
}

function onApiKeyInput(providerId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  if (p) p.configured = settingsStore.providerConfigured(p)
  hasUnsavedChanges.value = true
}

function onBaseUrlInput() {
  if (selectedProvider.value) selectedProvider.value.configured = settingsStore.providerConfigured(selectedProvider.value)
  hasUnsavedChanges.value = true
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
    await settingsStore.saveProviders()
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
      await settingsStore.saveProviders()
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
    await settingsStore.saveProviders()
    if (oldKeyId && oldKeyId !== provider.apiKeyId) {
      cloudLlmApi.deleteApiKey(oldKeyId).catch(() => {})
    }
  } catch (e) {
    officialKeyError.value = e.message || '重置官方 Key 失败'
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
}

// Delete
function requestDeleteModel(providerId, modelId) {
  const p = settingsStore.providers.find(p => p.id === providerId)
  const m = p?.models.find(m => m.id === modelId)
  if (!p || !m) return
  pendingDeleteModel.value = { providerId, providerName: p.name, modelId, modelName: m.name }
  showDeleteModal.value = true
}

function confirmDeleteModel() {
  if (!pendingDeleteModel.value) return
  settingsStore.removeModelFromProvider(pendingDeleteModel.value.providerId, pendingDeleteModel.value.modelId)
  hasUnsavedChanges.value = true
  pendingDeleteModel.value = null
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
}

async function saveAll() {
  if (selectedProvider.value) selectedProvider.value.configured = settingsStore.providerConfigured(selectedProvider.value)
  await settingsStore.saveProviders()
  hasUnsavedChanges.value = false
}

async function resetChanges() {
  await settingsStore.loadFromDb()
  showApiKeys.value = {}
  fetchError.value = null
  hasUnsavedChanges.value = false
  if (selectedProvider.value?.official) loadOfficialProviderData({ silent: true })
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

function statusLabel(status) {
  const map = { pending: '进行中', succeeded: '成功', failed: '失败', partial_failed: '部分失败' }
  return map[status] || status || '-'
}

function statusTone(status) {
  if (status === 'succeeded') return isDark.value ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'
  if (status === 'failed' || status === 'partial_failed') return isDark.value ? 'text-red-400 bg-red-400/8 border border-red-400/20' : 'text-red-600 bg-red-50 border border-red-100'
  return isDark.value ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100'
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN')
}

function formatLatency(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}s`
  return `${Math.round(n)}ms`
}

function shortId(value) {
  const text = String(value || '')
  if (!text) return '-'
  return text.length > 12 ? `${text.slice(0, 6)}...${text.slice(-4)}` : text
}

function usageTokenParts(record) {
  return `${formatNumber(record.input_tokens || 0)} / ${formatNumber(record.output_tokens || 0)}`
}

function maskKey(value) {
  if (!value) return '未创建'
  const text = String(value)
  if (text.length <= 8) return '********'
  return `${text.slice(0, 3)}********${text.slice(-4)}`
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
  if (!provider) return 'openai'
  if (provider.apiFormat) return provider.apiFormat
  return provider.id === 'anthropic' ? 'anthropic' : 'openai'
}

function providerFormatLabel(provider) {
  return providerApiFormat(provider) === 'anthropic' ? 'Anthropic Messages API' : 'OpenAI-compatible'
}

function baseUrlHelpText(provider) {
  return providerApiFormat(provider) === 'anthropic'
    ? '可填写 Claude 官方 API 或兼容 Anthropic Messages API 的代理网关地址；点击“恢复默认”可回到内置 URL。'
    : '可填写 Ollama、LM Studio、代理网关或其他 OpenAI-compatible 服务地址；点击“恢复默认”可回到内置 URL。'
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
    <!-- Left Panel: Provider List -->
    <div class="w-[280px] border-0 border-r-2 border-solid shrink-0 overflow-y-auto" :class="isDark ? 'border-r border-d4' : 'border-r border-bdrL'">
      <div class="px-4 py-3" :class="isDark ? 'bg-d3/50' : 'bg-l3'">
        <div class="flex items-center gap-2">
          <i class="ri-server-line text-[14px]" style="color: #A78BFA" />
          <span class="section-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">服务商列表</span>
          <span class="ctx-pill ml-auto" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
            {{ settingsStore.providers.length }}
          </span>
        </div>
        <div class="flex items-center gap-3 mt-2">
          <div class="flex items-center gap-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {{ enabledProvidersCount }} 已启用
          </div>
          <div class="flex items-center gap-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-cpu-line text-[10px]" style="color: #A78BFA" />
            {{ availableModelsCount }} 模型
          </div>
        </div>
      </div>
      <div class="px-2 py-1 space-y-0.5">
        <button v-for="provider in settingsStore.providers" :key="provider.id"
          @click="selectedProviderId = provider.id"
          class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md relative"
          :class="selectedProviderId === provider.id
            ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main')
            : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')">
          <span v-show="selectedProviderId === provider.id" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :style="{ backgroundColor: accentHex }" />
          <div v-if="provider.iconName" class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <SvgIcon :icon-class="provider.iconName" :size="18" />
          </div>
          <div v-else class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0" :style="{ background: provider.logoBg }">
            {{ provider.logoChar }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[12px] font-medium truncate">{{ provider.name }}</span>
              <span v-if="provider.configured" class="w-1 h-1 rounded-full bg-emerald-400" />
            </div>
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ provider.models.length }} 模型</span>
              <span v-if="provider.official || provider.builtin" class="text-[10px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">·</span>
              <span v-if="provider.official" class="text-[10px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'">官方</span>
              <span v-else-if="provider.builtin" class="text-[10px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">内置</span>
            </div>
          </div>
          <NSwitch :value="provider.enabled" size="small" :active-color="accentHex" @update:value="toggleProviderEnabled(provider.id)" @click.stop />
        </button>
      </div>
    </div>

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
        <!-- Provider Header -->
        <div class="flex items-center gap-2 pb-1">
          <div v-if="selectedProvider.iconName" class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0  overflow-hidden">
            <SvgIcon :icon-class="selectedProvider.iconName" :size="26" />
          </div>
          <div v-else class="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[17px] font-bold shrink-0" :style="{ background: selectedProvider.logoBg }">
            {{ selectedProvider.logoChar }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selectedProvider.name }}</span>
              <span v-if="selectedProvider.official" class="ctx-pill" :class="isDark ? 'bg-brand-400/10 text-brand-300 border border-brand-400/15' : 'bg-brand-50 text-brand-600 border border-brand-100'">
                <i class="ri-verified-badge-line text-[10px]" />官方
              </span>
              <span v-if="selectedProvider.recommended" class="ctx-pill" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/15' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
                <i class="ri-thumb-up-line text-[10px]" />推荐
              </span>
              <span v-else-if="selectedProvider.builtin" class="ctx-pill" :class="isDark ? 'bg-violet-400/10 text-violet-300 border border-violet-400/15' : 'bg-violet-50 text-violet-600 border border-violet-100'">
                <i class="ri-shield-check-line text-[10px]" />内置
              </span>
              <span v-if="selectedProvider.configured" class="ctx-pill" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/15' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
                <span class="w-1 h-1 rounded-full" :class="isDark ? 'bg-emerald-400' : 'bg-emerald-600'" />已配置
              </span>
              <span v-else class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">未配置</span>
              <span class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
                {{ providerFormatLabel(selectedProvider) }}
              </span>
            </div>
            <div class="text-[12px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ selectedProvider.desc }}</div>
          </div>
          <NSwitch :value="selectedProvider.enabled" size="small" :active-color="accentHex" @update:value="toggleProviderEnabled(selectedProvider.id)" />
        </div>

        <template v-if="isOfficialProvider">
          <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2/70 border border-bdr' : 'bg-white border border-bdrF'">
            <div class="p-4 border-0 border-b border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1.5">
                    <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">官方模型详情</span>
                    <span class="ctx-pill" :class="officialStatus.className">
                      <i :class="[officialStatus.icon, officialStatus.label === '同步中' ? 'animate-spin' : '', 'text-[9px]']" />{{ officialStatus.label }}
                    </span>
                    <span class="ctx-pill" :class="isDark ? 'text-brand-400 bg-brand-400/8 border border-brand-400/20' : 'text-brand-600 bg-brand-50 border border-brand-100'">
                      <i class="ri-router-line text-[9px]" />OpenAI 兼容
                    </span>
                  </div>
                  <p class="text-[11px] leading-relaxed max-w-[620px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                    官方路由使用账户积分结算，模型列表可从云端同步；本地内置默认模型用于首次展示，云端返回后会自动替换为最新价格。
                  </p>
                </div>
                <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5 shrink-0"
                  :class="userStore.isLoggedIn
                    ? (isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3')
                    : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
                  :disabled="!userStore.isLoggedIn || officialBalanceLoading || officialKeyLoading || fetchingModels"
                  @click="loadOfficialProviderData()">
                  <i class="ri-refresh-line text-[12px]" :class="(officialBalanceLoading || officialKeyLoading || fetchingModels) ? 'animate-spin' : ''" />
                  刷新状态
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-[1.1fr_.9fr] gap-0">
              <div class="p-4 border-0 md:border-r border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
                <div class="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <div class="text-[10px] uppercase" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Credits</div>
                    <div class="mt-1 flex items-baseline gap-2">
                      <span class="text-[30px] leading-none font-semibold tabular-nums" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                        {{ officialBalanceLoading ? '...' : formatNumber(officialBalance) }}
                      </span>
                      <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">积分</span>
                    </div>
                  </div>
                  <span class="ctx-pill" :class="officialBalanceLoaded ? (isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100') : (isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l3 border border-bdrF')">
                    {{ officialBalanceLoaded ? '已获取余额' : '默认 0' }}
                  </span>
                </div>

              </div>

              <div class="p-4">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">官方调用 Key</div>
                    <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ officialStatus.desc }}</div>
                  </div>
                  <button class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1"
                    :class="userStore.isLoggedIn
                      ? (isDark ? 'text-brand-400 hover:bg-brand-400/10' : 'text-brand-600 hover:bg-brand-50')
                      : (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')"
                    :disabled="!userStore.isLoggedIn || officialKeyLoading" @click="resetOfficialApiKey">
                    <i class="ri-refresh-line text-[12px]" />{{ officialKeyLoading ? '处理中' : '重置 Key' }}
                  </button>
                </div>
                <div class="h-9 rounded-lg px-3 flex items-center gap-2 font-mono text-[12px]"
                  :class="isDark ? 'bg-d0 border border-bdr text-wt-sub' : 'bg-l1 border border-bdrF text-lt-sub'">
                  <i class="ri-key-2-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                  <span class="truncate">{{ maskKey(selectedProvider.apiKey) }}</span>
                </div>
                <div class="mt-2 flex items-center gap-1.5">
                  <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
                    :class="isProviderConfigured
                      ? (isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3')
                      : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
                    :disabled="!isProviderConfigured" @click="copyApiKey(selectedProvider.id)">
                    <i class="ri-file-copy-line text-[12px]" />复制
                  </button>
                  <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
                    :class="isProviderConfigured
                      ? (isDark ? 'text-brand-400 bg-brand-400/8 hover:bg-brand-400/12' : 'text-brand-600 bg-brand-50 hover:bg-brand-100')
                      : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
                    :disabled="!isProviderConfigured" @click="openTestModal">
                    <i class="ri-link text-[12px]" />测试
                  </button>
                </div>
                <p v-if="officialKeyError" class="text-[10px] mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ officialKeyError }}</p>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- API Key -->
          <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key</label>
              <button class="flex items-center gap-1 text-[11px] font-medium transition-colors"
                :class="isProviderConfigured
                  ? (isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-500')
                  : (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')"
                :disabled="!isProviderConfigured" @click="openTestModal">
                <i class="ri-link text-[12px]" />测试连接
              </button>
            </div>
            <div class="flex items-center gap-2">
              <input :type="showApiKeys[selectedProvider.id] ? 'text' : 'password'"
                :value="selectedProvider.apiKey" @input="selectedProvider.apiKey = $event.target.value; onApiKeyInput(selectedProvider.id)"
                class="flex-1 h-9 rounded-lg px-3 text-[12px] font-mono outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-bdr text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l1 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
                :placeholder="selectedProvider.local ? '本地服务可填写任意值，例如 ollama' : '输入 API Key...'" />
              <button class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                :class="isDark ? 'bg-d0 border border-bdr text-wt-aux hover:text-wt-sub hover:bg-d3' : 'bg-l1 border border-bdrF text-lt-aux hover:text-lt-sub hover:bg-l3'"
                @click="toggleApiKeyVisibility(selectedProvider.id)">
                <i :class="showApiKeys[selectedProvider.id] ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[13px]" />
              </button>
              <button class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                :class="isDark ? 'bg-d0 border border-bdr text-wt-aux hover:text-wt-sub hover:bg-d3' : 'bg-l1 border border-bdrF text-lt-aux hover:text-lt-sub hover:bg-l3'"
                @click="copyApiKey(selectedProvider.id)">
                <i class="ri-file-copy-line text-[13px]" />
              </button>
            </div>
          </div>

          <!-- Base URL -->
          <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Base URL</label>
              <button class="flex items-center gap-1 text-[11px] font-medium transition-colors"
                :class="isBaseUrlDefault
                  ? (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')
                  : (isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-500')"
                :disabled="isBaseUrlDefault" @click="resetBaseUrlToDefault">
                <i class="ri-restart-line text-[12px]" />恢复默认
              </button>
            </div>
            <input :value="selectedProvider.baseUrl"
              @input="canEditBaseUrl && (selectedProvider.baseUrl = $event.target.value, onBaseUrlInput())"
              :readonly="!canEditBaseUrl"
              class="w-full h-9 rounded-lg px-3 text-[12px] font-mono outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-bdr text-wt-sub focus:border-brand-400/40' : 'bg-l1 border border-bdrF text-lt-sub focus:border-brand-400'" />
            <p class="text-[10px] leading-relaxed mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              {{ baseUrlHelpText(selectedProvider) }}
            </p>
          </div>
        </template>

        <!-- Unconfigured hint -->
        <div v-if="!isProviderConfigured" class="rounded-lg px-3 py-2 flex items-center gap-2"
          :class="isDark ? 'bg-amber-400/6 border border-amber-400/15' : 'bg-amber-50 border border-amber-100'">
          <i class="ri-information-line text-[13px]" :class="isDark ? 'text-amber-400' : 'text-amber-500'" />
          <span class="text-[11px]" :class="isDark ? 'text-amber-400/80' : 'text-amber-600'">
            {{ providerConfigHint() }}
          </span>
        </div>

        <!-- Model Cards Grid -->
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
          <div class="flex items-center justify-between mb-3 gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <i class="ri-stack-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
              <span class="section-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ isOfficialProvider ? '官方模型列表' : '已添加模型' }}</span>
              <span class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
                {{ selectedProvider.models.length }}
              </span>
              <span v-if="isOfficialProvider && officialModelsLoaded" class="ctx-pill" :class="isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'">
                <i class="ri-check-line text-[9px]" />已同步
              </span>
              <span v-if="fetchError" class="text-[11px] ml-1 truncate" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ fetchError }}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button class="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors"
                :class="canFetchModels
                  ? (isDark ? 'text-agent-400 hover:bg-agent-400/10' : 'text-agent-600 hover:bg-agent-50')
                  : (isDark ? 'text-wt-dim/40 cursor-not-allowed' : 'text-lt-aux/40 cursor-not-allowed')"
                :disabled="!canFetchModels || fetchingModels" @click="fetchModelList">
                <i class="ri-download-cloud-line text-[12px]" />
                <span v-if="fetchingModels">获取中</span>
                <span v-else>{{ isOfficialProvider ? '同步模型' : '获取模型' }}</span>
              </button>
              <button v-if="!isOfficialProvider" class="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors"
                :class="isProviderConfigured
                  ? (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3')
                  : (isDark ? 'text-wt-dim/40 cursor-not-allowed' : 'text-lt-aux/40 cursor-not-allowed')"
                :disabled="!isProviderConfigured" @click="openAddModal">
                <i class="ri-add-line text-[12px]" />手动添加
              </button>
            </div>
          </div>

          <div v-if="selectedProvider.models.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
            <i class="ri-inbox-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ isOfficialProvider ? '登录后点击右上方按钮同步官方模型' : '暂无模型，点击右上方按钮获取或手动添加' }}</span>
          </div>

          <div v-else class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
            <div v-for="model in selectedProvider.models" :key="model.id"
              class="rounded-lg p-3 relative group transition-colors"
              :class="model.enabled
                ? (isDark ? 'bg-d3/60 border border-bdr' : 'bg-l1 border border-bdrF')
                : (isDark ? 'bg-d3/30 border border-d4' : 'bg-l3/40 border border-bdrF')">
              <!-- Actions -->
              <div v-if="!isOfficialProvider" class="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="w-5 h-5 rounded-md flex items-center justify-center"
                  :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-brand-400/10' : 'text-lt-aux hover:text-brand-600 hover:bg-brand-50'"
                  @click="openEditModal(selectedProvider.id, model)">
                  <i class="ri-edit-line text-[12px]" />
                </button>
                <button class="w-5 h-5 rounded-md flex items-center justify-center"
                  :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
                  @click="requestDeleteModel(selectedProvider.id, model.id)">
                  <i class="ri-close-line text-[12px]" />
                </button>
              </div>

              <!-- Model name -->
              <div class="flex items-center gap-1.5 mb-2 pr-12">
                <span class="text-[12px] font-medium truncate" :class="model.enabled ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ model.name }}</span>
              </div>

              <!-- Tier + Context + MaxOutput + addedBy -->
              <div class="flex items-center gap-1.5 mb-2 flex-wrap">
                <span class="ctx-pill" :style="{ color: tierColor(model.tier).text, background: tierColor(model.tier).bg, borderColor: tierColor(model.tier).border }">
                  {{ tierLabel(model.tier) }}
                </span>
                <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
                  <i class="ri-text-wrap text-[9px]" />{{ model.ctx }}
                </span>
                <span v-if="model.maxOutput && model.maxOutput !== '?'" class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
                  <i class="ri-arrow-right-down-line text-[9px]" />{{ model.maxOutput }}
                </span>
              </div>

              <!-- Capability pills -->
              <div class="flex items-center gap-1 flex-wrap mb-2">
                <span v-for="capKey in getActiveCapabilities(model.capabilities)" :key="capKey"
                  class="ctx-pill border" :class="capClass(capKey)">
                  <i :class="CAPABILITY_META[capKey].icon" class="text-[9px]" />{{ CAPABILITY_META[capKey].label }}
                </span>
              </div>

              <!-- Cost info -->
              <div v-if="(model.costInput || model.costOutput || model.costCacheRead)" class="mb-2.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="ctx-pill" :class="isDark ? 'text-orange-400 bg-orange-400/8 border border-orange-400/20' : 'text-orange-600 bg-orange-50 border border-orange-100'">
                    <i class="ri-money-cny-circle-line text-[9px]" />{{ formatCost(model.costInput) }}/{{ formatCost(model.costOutput) }} {{ costUnitLabel(model) }}
                  </span>
                  <span v-if="model.costCacheRead" class="ctx-pill" :class="isDark ? 'text-teal-400 bg-teal-400/8 border border-teal-400/20' : 'text-teal-600 bg-teal-50 border border-teal-100'">
                    <i class="ri-database-2-line text-[9px]" />缓存 {{ formatCost(model.costCacheRead) }} {{ costUnitLabel(model) }}
                  </span>
                  <span v-if="model.requestMinPoints" class="ctx-pill" :class="isDark ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100'">
                    <i class="ri-safe-2-line text-[9px]" />最低 {{ formatCost(model.requestMinPoints) }} 积分
                  </span>
                </div>
              </div>

              <!-- Enable toggle -->
              <div class="flex items-center justify-between">
                <span class="text-[10px]" :class="model.enabled ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
                  {{ model.enabled ? '已启用' : '未启用' }}
                </span>
                <NSwitch :value="model.enabled" size="small" :active-color="accentHex" @update:value="toggleModelEnabled(selectedProvider.id, model.id)" @click.stop />
              </div>
            </div>
          </div>
        </div>

        <div v-if="isOfficialProvider" class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
          <div class="p-4 border-0 border-b border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <i class="ri-history-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
                  <span class="section-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">云端调用记录</span>
                  <span class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
                    {{ formatNumber(usageRecordsTotal) }}
                  </span>
                </div>
                <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">只展示必要运营字段，不包含请求正文和消息内容。</p>
              </div>
              <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0"
                :class="userStore.isLoggedIn
                  ? (isDark ? 'text-brand-400 bg-brand-400/8 hover:bg-brand-400/12' : 'text-brand-600 bg-brand-50 hover:bg-brand-100')
                  : (isDark ? 'text-wt-dim/40 bg-d4 cursor-not-allowed' : 'text-lt-aux/40 bg-l4 cursor-not-allowed')"
                :disabled="!userStore.isLoggedIn || usageRecordsLoading" @click="reloadUsageRecords">
                <i class="ri-refresh-line text-[12px]" :class="usageRecordsLoading ? 'animate-spin' : ''" />{{ usageRecordsLoading ? '刷新中' : '刷新' }}
              </button>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
              <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本页消耗</div>
                <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatCost(usageRecordSummary.totalPoints) }} 积分</div>
              </div>
              <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本页 Tokens</div>
                <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatNumber(usageRecordSummary.totalTokens) }}</div>
              </div>
              <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">成功请求</div>
                <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ usageRecordSummary.successCount }}</div>
              </div>
              <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
                <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均延迟</div>
                <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatLatency(usageRecordSummary.avgLatency) }}</div>
              </div>
            </div>

            <div class="grid gap-2 sm:grid-cols-[140px_1fr_auto] mt-3">
              <select v-model="usageStatusFilter" @change="reloadUsageRecords"
                class="h-8 rounded-lg px-2 text-[12px] outline-none transition-colors appearance-none"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub focus:border-brand-400'">
                <option value="">全部状态</option>
                <option value="succeeded">成功</option>
                <option value="failed">失败</option>
                <option value="partial_failed">部分失败</option>
                <option value="pending">进行中</option>
              </select>
              <div class="relative">
                <i class="ri-search-line absolute left-2.5 top-[8px] text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <input v-model="usageModelFilter" type="text" placeholder="按模型 ID 过滤，回车查询"
                  class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
                  :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'"
                  @keyup.enter="reloadUsageRecords" />
              </div>
              <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors"
                :class="isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3'"
                @click="reloadUsageRecords">
                查询
              </button>
            </div>
            <p v-if="usageRecordsError" class="text-[10px] mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ usageRecordsError }}</p>
          </div>

          <div v-if="usageRecordsLoading && usageRecords.length === 0" class="flex items-center gap-2 py-8 justify-center">
            <div class="w-4 h-4 border-2 rounded-full animate-spin" :class="isDark ? 'border-brand-400 border-t-transparent' : 'border-brand-500 border-t-transparent'" />
            <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在获取调用记录...</span>
          </div>
          <div v-else-if="usageRecords.length === 0" class="flex flex-col items-center justify-center py-9 gap-2">
            <i class="ri-file-list-3-line text-[24px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">暂无云端模型调用记录</span>
          </div>
          <div v-else class="overflow-x-auto">
            <div class="min-w-[760px]">
            <div class="grid grid-cols-[minmax(150px,1.3fr)_84px_112px_96px_82px_110px] gap-3 px-4 py-2 text-[10px] border-0 border-b border-solid"
              :class="isDark ? 'text-wt-dim border-bdr bg-d0/50' : 'text-lt-aux border-bdrF bg-l1'">
              <span>模型 / 请求</span>
              <span>状态</span>
              <span>输入 / 输出</span>
              <span>积分</span>
              <span>延迟</span>
              <span>时间</span>
            </div>
            <div class="divide-y" :class="isDark ? 'divide-bdr' : 'divide-bdrF'">
              <div v-for="record in usageRecords" :key="record.id || record.request_id"
                class="grid grid-cols-[minmax(150px,1.3fr)_84px_112px_96px_82px_110px] gap-3 px-4 py-2.5 items-center text-[11px]"
                :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l2'">
                <div class="min-w-0">
                  <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ record.model_alias || '-' }}</div>
                  <div class="flex items-center gap-1 mt-0.5 min-w-0">
                    <span class="truncate font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ shortId(record.request_id || record.id) }}</span>
                    <span v-if="record.stream" class="ctx-pill shrink-0" :class="isDark ? 'text-sky-400 bg-sky-400/8 border border-sky-400/20' : 'text-sky-600 bg-sky-50 border border-sky-100'" style="font-size:9px;padding:1px 4px">流式</span>
                  </div>
                </div>
                <span class="ctx-pill w-fit" :class="statusTone(record.status)">{{ statusLabel(record.status) }}</span>
                <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ usageTokenParts(record) }}</span>
                <span class="font-mono" :class="isDark ? 'text-orange-400' : 'text-orange-600'">{{ formatCost(record.charged_points || 0) }}</span>
                <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ formatLatency(record.latency_ms) }}</span>
                <span :title="record.error_message || ''" class="truncate" :class="record.error_message ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
                  {{ record.error_message || formatDateTime(record.started_at || record.created) }}
                </span>
              </div>
            </div>
            </div>
            <div v-if="usageRecordsHasNext" class="p-3 border-0 border-t border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
              <button class="w-full h-8 rounded-lg text-[11px] font-medium transition-colors"
                :class="isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3'"
                :disabled="usageRecordsLoading" @click="loadMoreUsageRecords">
                {{ usageRecordsLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>
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
            size="small" :theme="isDark ? 'dark' : 'light'"
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
            class="w-full h-9 rounded-lg px-3 text-[12px] font-mono outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">显示名称</label>
          <input v-model="addForm.name" type="text" placeholder="如 GPT-4o (2024-08)"
            class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">上下文大小</label>
            <input v-model="addForm.ctx" type="text" placeholder="如 128K"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大输出</label>
            <input v-model="addForm.maxOutput" type="text" placeholder="如 16K"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">层级</label>
            <select v-model="addForm.tier"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors appearance-none"
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
              class="ctx-pill border cursor-pointer transition-colors"
              :class="addForm.capabilities[key] ? capClass(key) : (isDark ? 'text-wt-dim bg-d4 border-bdr' : 'text-lt-aux bg-l4 border-bdrF')">
              <i :class="meta.icon" class="text-[9px]" />{{ meta.label }}
            </button>
          </div>
        </div>
        <!-- Cost fields -->
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <i class="ri-money-cny-circle-line text-[10px]" />Token 成本（元 / 100万 tokens）
          </label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="field in COST_FIELDS" :key="field.key">
              <div class="flex items-center gap-1 mb-1">
                <i :class="[field.icon, 'text-[9px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ field.label }}</span>
              </div>
              <input v-model.number="addForm[field.key]" type="number" step="0.001" min="0" :placeholder="field.placeholder"
                class="w-full h-8 rounded-lg px-2 text-[12px] font-mono outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
            </div>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmAddModel(); close()" :disabled="!addForm.id"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
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
            class="w-full h-9 rounded-lg px-3 text-[12px] font-mono outline-none"
            :class="isDark ? 'bg-d4 text-wt-dim border border-d4' : 'bg-l4 text-lt-aux border border-l4'" />
        </div>
        <div>
          <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">显示名称</label>
          <input v-model="editForm.name" type="text" placeholder="模型显示名称"
            class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
        </div>
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">上下文大小</label>
            <input v-model="editForm.ctx" type="text" placeholder="如 128K"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">最大输出</label>
            <input v-model="editForm.maxOutput" type="text" placeholder="如 16K"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors"
              :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
          </div>
          <div class="flex-1">
            <label class="text-[11px] font-medium mb-1 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">层级</label>
            <select v-model="editForm.tier"
              class="w-full h-9 rounded-lg px-3 text-[12px] outline-none transition-colors appearance-none"
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
              class="ctx-pill border cursor-pointer transition-colors"
              :class="editForm.capabilities[key] ? capClass(key) : (isDark ? 'text-wt-dim bg-d4 border-bdr' : 'text-lt-aux bg-l4 border-bdrF')">
              <i :class="meta.icon" class="text-[9px]" />{{ meta.label }}
            </button>
          </div>
        </div>
        <!-- Cost fields -->
        <div>
          <label class="text-[11px] font-medium mb-1.5 block" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
            <i class="ri-money-cny-circle-line text-[10px]" />Token 成本（元 / 100万 tokens）
          </label>
          <div class="grid grid-cols-3 gap-2">
            <div v-for="field in COST_FIELDS" :key="field.key">
              <div class="flex items-center gap-1 mb-1">
                <i :class="[field.icon, 'text-[9px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
                <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ field.label }}</span>
              </div>
              <input v-model.number="editForm[field.key]" type="number" step="0.001" min="0" :placeholder="field.placeholder"
                class="w-full h-8 rounded-lg px-2 text-[12px] font-mono outline-none transition-colors"
                :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
            </div>
          </div>
        </div>
      </div>

      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmEditModel(); close()"
          class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
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
