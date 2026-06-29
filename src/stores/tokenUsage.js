import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useTokenUsageStore = defineStore('tokenUsage', () => {
  const summary = ref(null)
  const byModel = ref([])
  const byAgent = ref([])
  const daily = ref([])
  const range = ref('month')

  const totalTokens = computed(() => summary.value?.total_tokens ?? 0)
  const totalCost = computed(() => summary.value?.total_cost ?? 0)
  const callCount = computed(() => summary.value?.call_count ?? 0)
  const avgLatency = computed(() => summary.value?.avg_latency ?? 0)

  async function fetchSummary(r) {
    if (r) range.value = r
    try {
      const res = await window.electronAPI?.tokenUsage?.summary(range.value)
      if (res) summary.value = res
    } catch (e) { console.error('fetchSummary error:', e) }
  }

  async function fetchByModel(r) {
    if (r) range.value = r
    try {
      const res = await window.electronAPI?.tokenUsage?.byModel(range.value)
      if (res) byModel.value = res
    } catch (e) { console.error('fetchByModel error:', e) }
  }

  async function fetchByAgent(r) {
    if (r) range.value = r
    try {
      const res = await window.electronAPI?.tokenUsage?.byAgent(range.value)
      if (res) byAgent.value = res
    } catch (e) { console.error('fetchByAgent error:', e) }
  }

  async function fetchDaily(r) {
    if (r) range.value = r
    try {
      const res = await window.electronAPI?.tokenUsage?.daily(range.value)
      if (res) daily.value = res
    } catch (e) { console.error('fetchDaily error:', e) }
  }

  async function recordUsage(data) {
    try {
      await window.electronAPI?.tokenUsage?.create(data)
    } catch (e) { console.error('recordUsage error:', e) }
  }

  async function fetchAll(r) {
    if (r) range.value = r
    await Promise.all([fetchSummary(), fetchByModel(), fetchByAgent(), fetchDaily()])
  }

  return {
    summary, byModel, byAgent, daily, range,
    totalTokens, totalCost, callCount, avgLatency,
    fetchSummary, fetchByModel, fetchByAgent, fetchDaily, fetchAll, recordUsage,
  }
})