import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/apis/auth'
import { pointsApi } from '@/apis/points'
import { kbApi } from '@/apis/kb'

// Mock cloud-enhancement features. `cost` = credits charged per single successful generation.
// These are pay-per-use features (no monthly quota) — cloud-only because they need server-side
// rendering / heavy compute / proprietary models.
export const CLOUD_FEATURES = [
  { key: 'ppt', name: 'PPT 创建', icon: 'ri-presentation-line', color: 'amber', cost: 80, unit: '次', desc: '智能生成结构化幻灯片（含设计排版）' },
  { key: 'podcast', name: '播客生成', icon: 'ri-mic-line', color: 'rose', cost: 50, unit: '期', desc: '将文章/笔记转为多人对话播客音频' },
  { key: 'mindmap', name: '思维导图', icon: 'ri-mind-map', color: 'emerald', cost: 30, unit: '张', desc: '从内容自动生成可编辑思维导图' },
  { key: 'knowledgeGraph', name: '知识图谱', icon: 'ri-share-line', color: 'agent', cost: 60, unit: '张', desc: '实体关系抽取生成可视化知识图谱' },
  { key: 'videoSummary', name: '视频解读', icon: 'ri-video-line', color: 'blue', cost: 100, unit: '条', desc: '上传视频自动生成摘要+章节+笔记' },
  { key: 'webSearch', name: '深度联网搜索', icon: 'ri-global-line', color: 'brand', cost: 5, unit: '次', desc: '高质量来源 + 多步骤研究' },
  { key: 'imageGen', name: 'AI 配图', icon: 'ri-image-line', color: 'agent', cost: 20, unit: '张', desc: '为文档/笔记/PPT 生成插图' },
  { key: 'translate', name: '专业翻译', icon: 'ri-translate-2', color: 'brand', cost: 2, unit: '千字', desc: '段落级专业领域术语翻译' },
]

const RECHARGE_PLANS = [
  { id: 'starter', name: '入门包', credits: 1000, bonus: 0, price: 9.9, popular: false, tagline: '尝鲜体验', features: ['约 12 次 PPT 生成', '约 33 张思维导图', '永久有效'] },
  { id: 'standard', name: '标准包', credits: 5000, bonus: 500, price: 49, popular: true, tagline: '日常首选', features: ['约 68 次 PPT 生成', '赠送 500 积分', '7×24 客服支持'] },
  { id: 'pro', name: '专业包', credits: 12000, bonus: 2000, price: 99, popular: false, tagline: '高频创作', features: ['约 175 次 PPT 生成', '赠送 2000 积分', '优先生成队列'] },
  { id: 'team', name: '团队包', credits: 50000, bonus: 12000, price: 399, popular: false, tagline: '团队/工作室', features: ['约 775 次 PPT 生成', '赠送 12000 积分', '专属商务对接'] },
]

export const useUserProfileStore = defineStore('userProfile', () => {
  // Mock profile data
  const profile = ref({
    uid: '285094',
    nickname: '明心',
    avatar: '',
    email: 'mingxin@reviva.app',
    registeredAt: '2024-03-15',
    bio: '专注于知识管理与 AI 应用探索',
  })

  // Credits balance + monthly stats
  const credits = ref({
    balance: 8240,
    lifetimeRecharged: 22000,
    lifetimeConsumed: 13760,
    monthlyConsumed: 1860,
    monthlyBudget: 3000,
  })

  // Knowledge base / cloud storage quotas (套餐内固定额度，非按次计费)
  const kbQuota = ref({
    spaces: { used: 5, limit: 20, label: '云端知识知识库', unit: '个', icon: 'ri-database-2-line', color: 'brand' },
    docs: { used: 248, limit: 5000, label: '云端文档', unit: '篇', icon: 'ri-file-text-line', color: 'emerald' },
    storage: { used: 1.24, limit: 10, label: '云端存储', unit: 'GB', icon: 'ri-hard-drive-2-line', color: 'agent' },
    vectorStorage: { used: 320, limit: 2000, label: '向量索引', unit: '万条', icon: 'ri-node-tree', color: 'rose' },
    embedTokens: { used: 1.28, limit: 5, label: '本月嵌入 Token', unit: 'M', icon: 'ri-magic-line', color: 'amber' },
    syncDevices: { used: 2, limit: 5, label: '同步设备', unit: '台', icon: 'ri-device-line', color: 'blue' },
  })

  // Usage per feature (this month)
  const featureUsage = ref({
    ppt: { used: 8, lastAt: '2026-05-19 14:32' },
    podcast: { used: 3, lastAt: '2026-05-18 09:11' },
    mindmap: { used: 24, lastAt: '2026-05-20 22:05' },
    knowledgeGraph: { used: 5, lastAt: '2026-05-17 16:40' },
    videoSummary: { used: 2, lastAt: '2026-05-15 11:00' },
    webSearch: { used: 132, lastAt: '2026-05-21 08:20' },
    imageGen: { used: 14, lastAt: '2026-05-20 13:45' },
    translate: { used: 240, lastAt: '2026-05-21 10:00' },
  })

  // Recent transactions (mock)
  const transactions = ref([
    { id: 1, type: 'consume', feature: 'ppt', amount: -80, balance: 8240, time: '2026-05-21 14:32', desc: 'PPT 生成 · 《Q2 产品复盘汇报》' },
    { id: 2, type: 'consume', feature: 'mindmap', amount: -30, balance: 8320, time: '2026-05-21 13:05', desc: '思维导图 · 学习计划梳理' },
    { id: 3, type: 'consume', feature: 'webSearch', amount: -5, balance: 8350, time: '2026-05-21 11:20', desc: '深度搜索 · AI Agent 行业趋势' },
    { id: 4, type: 'consume', feature: 'translate', amount: -2, balance: 8355, time: '2026-05-21 10:00', desc: '专业翻译 · 论文摘要 1.2 千字' },
    { id: 5, type: 'consume', feature: 'imageGen', amount: -20, balance: 8357, time: '2026-05-20 22:18', desc: 'AI 配图 · 笔记封面图' },
    { id: 6, type: 'consume', feature: 'mindmap', amount: -30, balance: 8377, time: '2026-05-20 16:42', desc: '思维导图 · 项目架构图' },
    { id: 7, type: 'consume', feature: 'knowledgeGraph', amount: -60, balance: 8407, time: '2026-05-19 21:11', desc: '知识图谱 · 团队成员关系' },
    { id: 8, type: 'consume', feature: 'ppt', amount: -80, balance: 8467, time: '2026-05-19 15:33', desc: 'PPT 生成 · 周会汇报' },
    { id: 9, type: 'consume', feature: 'podcast', amount: -120, balance: 8547, time: '2026-05-18 09:11', desc: '播客生成 · 本周精选笔记播报' },
    { id: 10, type: 'consume', feature: 'videoSummary', amount: -100, balance: 8667, time: '2026-05-17 14:00', desc: '视频解读 · WWDC 主旨演讲' },
    { id: 11, type: 'reward', feature: null, amount: 100, balance: 8767, time: '2026-05-17 09:00', desc: '连续 7 天签到奖励' },
    { id: 12, type: 'consume', feature: 'webSearch', amount: -5, balance: 8667, time: '2026-05-16 19:25', desc: '深度搜索 · 行业报告检索' },
    { id: 13, type: 'consume', feature: 'imageGen', amount: -20, balance: 8672, time: '2026-05-16 11:40', desc: 'AI 配图 · PPT 插画 4 张' },
    { id: 14, type: 'recharge', feature: null, amount: 5500, balance: 8692, time: '2026-05-15 09:00', desc: '充值标准包（含赠送 500 积分）' },
    { id: 15, type: 'consume', feature: 'knowledgeGraph', amount: -60, balance: 3192, time: '2026-05-14 16:40', desc: '知识图谱 · 项目复盘实体' },
    { id: 16, type: 'consume', feature: 'translate', amount: -10, balance: 3252, time: '2026-05-13 13:20', desc: '专业翻译 · 技术文档 5 千字' },
    { id: 17, type: 'reward', feature: null, amount: 50, balance: 3262, time: '2026-05-12 09:00', desc: '每日签到' },
    { id: 18, type: 'consume', feature: 'ppt', amount: -80, balance: 3212, time: '2026-05-11 20:15', desc: 'PPT 生成 · 培训课件' },
    { id: 19, type: 'consume', feature: 'mindmap', amount: -30, balance: 3292, time: '2026-05-10 22:00', desc: '思维导图 · 读书笔记' },
    { id: 20, type: 'reward', feature: null, amount: 200, balance: 3322, time: '2026-05-08 10:00', desc: '新人首充奖励' },
    { id: 21, type: 'recharge', feature: null, amount: 1000, balance: 3122, time: '2026-05-08 09:55', desc: '充值入门包' },
    { id: 22, type: 'consume', feature: 'webSearch', amount: -5, balance: 2122, time: '2026-05-06 18:30', desc: '深度搜索 · 竞品分析' },
    { id: 23, type: 'consume', feature: 'podcast', amount: -120, balance: 2127, time: '2026-05-05 11:00', desc: '播客生成 · 商业洞察' },
    { id: 24, type: 'consume', feature: 'ppt', amount: -80, balance: 2247, time: '2026-05-03 14:20', desc: 'PPT 生成 · 月度规划' },
    { id: 25, type: 'consume', feature: 'imageGen', amount: -20, balance: 2327, time: '2026-05-02 09:45', desc: 'AI 配图 · 公众号封面' },
  ])

  const monthlyUsagePercent = computed(() => {
    if (!credits.value.monthlyBudget) return 0
    return Math.min(100, Math.round(credits.value.monthlyConsumed / credits.value.monthlyBudget * 100))
  })

  const totalGenerations = computed(() => {
    return Object.values(featureUsage.value).reduce((sum, f) => sum + (f?.used || 0), 0)
  })

  function getFeature(key) {
    return CLOUD_FEATURES.find(f => f.key === key)
  }

  function getRechargePlans() { return RECHARGE_PLANS }

  function updateProfile(patch) {
    if (!patch || typeof patch !== 'object') return false
    const next = { ...profile.value }
    const allowedKeys = ['nickname', 'bio', 'email', 'avatar']
    for (const k of allowedKeys) {
      if (k in patch && typeof patch[k] === 'string') {
        next[k] = patch[k].trim()
      }
    }
    profile.value = next
    return true
  }

  function consumeCredits(featureKey, count = 1) {
    const f = getFeature(featureKey)
    if (!f) return false
    const cost = f.cost * count
    if (credits.value.balance < cost) return false
    credits.value.balance -= cost
    credits.value.monthlyConsumed += cost
    credits.value.lifetimeConsumed += cost
    const usage = featureUsage.value[featureKey] || { used: 0 }
    usage.used += count
    usage.lastAt = new Date().toLocaleString('zh-CN')
    featureUsage.value = { ...featureUsage.value, [featureKey]: usage }
    transactions.value.unshift({
      id: Date.now(),
      type: 'consume',
      feature: featureKey,
      amount: -cost,
      balance: credits.value.balance,
      time: new Date().toLocaleString('zh-CN'),
      desc: `${f.name} × ${count}`,
    })
    return true
  }

  function rechargeCredits(planId) {
    const plan = RECHARGE_PLANS.find(p => p.id === planId)
    if (!plan) return false
    const total = plan.credits + plan.bonus
    credits.value.balance += total
    credits.value.lifetimeRecharged += total
    transactions.value.unshift({
      id: Date.now(),
      type: 'recharge',
      feature: null,
      amount: total,
      balance: credits.value.balance,
      time: new Date().toLocaleString('zh-CN'),
      desc: `充值${plan.name}${plan.bonus ? `（含赠送 ${plan.bonus}）` : ''}`,
    })
    return true
  }

  // ── Real API: 用户信息 / 余额 / 积分明细 ──
  const recordsTotal = ref(0)
  const recordsLoading = ref(false)
  const recordsPage = ref(1)
  const recordsPageSize = ref(20)
  const profileLoading = ref(false)

  // change_type → 前端 type
  function mapChangeType(t) {
    const up = String(t || '').toUpperCase()
    if (up === 'RECHARGE') return 'recharge'
    if (up === 'CONSUME') return 'consume'
    if (up === 'REFUND' || up === 'ADJUST') return 'reward'
    return 'consume'
  }

  function mapSourceToFeature(sourceType) {
    const raw = String(sourceType || '').toLowerCase()
    if (raw === 'business_task') return null
    return null
  }

  function inferBusinessFeature(raw) {
    const text = `${raw.source_id || ''} ${raw.remark || ''}`.toLowerCase()
    if (text.includes('podcast')) return 'podcast'
    if (text.includes('ppt')) return 'ppt'
    if (text.includes('research')) return 'webSearch'
    return mapSourceToFeature(raw.source_type)
  }

  function fallbackRecordDesc(raw) {
    const sourceType = String(raw.source_type || '').toLowerCase()
    if (sourceType === 'redeem_code') return '兑换码兑换'
    if (sourceType === 'order') return '充值订单'
    if (sourceType === 'business_task') return '云端任务'
    if (sourceType === 'manual') return '手动调整'
    return `${raw.change_type || ''}`
  }

  function normalizeRecord(raw) {
    return {
      id: raw.id,
      type: mapChangeType(raw.change_type),
      feature: inferBusinessFeature(raw),
      amount: raw.change_amount ?? 0,
      balance: raw.balance_after ?? 0,
      time: raw.created || '',
      desc: raw.remark || fallbackRecordDesc(raw),
      sourceType: raw.source_type,
      sourceId: raw.source_id,
      raw,
    }
  }

  async function loadProfile() {
    profileLoading.value = true
    try {
      const me = await authApi.me()
      profile.value = {
        ...profile.value,
        uid: me.id,
        nickname: me.username || profile.value.nickname,
        email: me.email || profile.value.email,
        registeredAt: (me.date_joined || '').slice(0, 10) || profile.value.registeredAt,
      }
      credits.value.balance = me.points_balance ?? credits.value.balance
      return me
    } finally {
      profileLoading.value = false
    }
  }

  async function loadBalance() {
    try {
      const res = await pointsApi.balance()
      credits.value.balance = res?.points_balance ?? credits.value.balance
      return res
    } catch (e) {
      return null
    }
  }

  async function loadRecords({ page = 1, pageSize = 20, append = false } = {}) {
    recordsLoading.value = true
    try {
      const res = await pointsApi.records({ page, pageSize })
      const items = (res?.items || []).map(normalizeRecord)
      recordsTotal.value = res?.total ?? items.length
      recordsPage.value = res?.page ?? page
      recordsPageSize.value = res?.page_size ?? pageSize
      transactions.value = append ? [...transactions.value, ...items] : items
      return res
    } finally {
      recordsLoading.value = false
    }
  }

  async function loadLatestRecords() {
    recordsLoading.value = true
    try {
      const res = await pointsApi.latest()
      const items = (res?.items || []).map(normalizeRecord)
      recordsTotal.value = res?.total ?? items.length
      recordsPage.value = res?.page ?? 1
      recordsPageSize.value = res?.page_size ?? 10
      transactions.value = items
      return res
    } finally {
      recordsLoading.value = false
    }
  }

  async function loadMoreRecords() {
    if (recordsLoading.value) return
    const next = recordsPage.value + 1
    const maxPage = Math.ceil(recordsTotal.value / recordsPageSize.value)
    if (next > maxPage) return
    return loadRecords({ page: next, pageSize: recordsPageSize.value, append: true })
  }

  async function redeemCode(code) {
    const res = await pointsApi.redeem(code)
    credits.value.balance = res?.points_balance ?? credits.value.balance
    // 刷新一次明细
    loadRecords({ page: 1, pageSize: recordsPageSize.value }).catch(() => { })
    return res
  }

  async function loadKbOverview() {
    try {
      const res = await kbApi.overview()
      const kbCount = res?.kb_count ?? 0
      const docCount = res?.doc_count ?? 0
      const usedBytes = res?.used_bytes ?? 0
      kbQuota.value.spaces.used = kbCount
      kbQuota.value.docs.used = docCount
      // bytes → GB (2 decimals)
      kbQuota.value.storage.used = +(usedBytes / (1024 * 1024 * 1024)).toFixed(2)
      return res
    } catch (e) {
      return null
    }
  }

  function reset() {
    transactions.value = []
    recordsTotal.value = 0
    recordsPage.value = 1
  }

  return {
    profile,
    credits,
    kbQuota,
    featureUsage,
    transactions,
    monthlyUsagePercent,
    totalGenerations,
    getFeature,
    getRechargePlans,
    updateProfile,
    consumeCredits,
    rechargeCredits,
    // real API
    recordsTotal,
    recordsLoading,
    recordsPage,
    recordsPageSize,
    profileLoading,
    loadProfile,
    loadBalance,
    loadLatestRecords,
    loadRecords,
    loadMoreRecords,
    redeemCode,
    loadKbOverview,
    reset,
  }
}, {
  persist: {
    pick: ['profile', 'credits', 'kbQuota', 'featureUsage', 'transactions'],
  },
})
