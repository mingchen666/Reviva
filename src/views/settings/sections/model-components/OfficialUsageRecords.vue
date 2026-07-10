<script setup>
defineProps({
  isDark: { type: Boolean, default: false },
  userLoggedIn: { type: Boolean, default: false },
  records: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  hasNext: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  summary: { type: Object, required: true },
  statusFilter: { type: String, default: '' },
  modelFilter: { type: String, default: '' },
})

defineEmits(['reload', 'load-more', 'update:statusFilter', 'update:modelFilter'])

function statusLabel(status) {
  const map = { pending: '进行中', succeeded: '成功', failed: '失败', partial_failed: '部分失败' }
  return map[status] || status || '-'
}

function statusTone(status, isDark) {
  if (status === 'succeeded') return isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'
  if (status === 'failed' || status === 'partial_failed') return isDark ? 'text-red-400 bg-red-400/8 border border-red-400/20' : 'text-red-600 bg-red-50 border border-red-100'
  return isDark ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100'
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

function formatCost(value) {
  if (value === 0 || value === undefined || value === null) return '0'
  if (value >= 1) return String(value)
  if (value >= 0.01) return Number(value).toFixed(2)
  return Number(value).toFixed(3)
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
</script>

<template>
  <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
    <div class="p-4 border-0 border-b border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <i class="ri-history-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
            <span class="section-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">云端调用记录</span>
            <span class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
              {{ formatNumber(total) }}
            </span>
          </div>
          <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">只展示必要运营字段，不包含请求正文和消息内容。</p>
        </div>
        <button
          class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 shrink-0"
          :class="userLoggedIn
            ? (isDark ? 'text-brand-400 bg-brand-400/8 hover:bg-brand-400/12' : 'text-brand-600 bg-brand-50 hover:bg-brand-100')
            : (isDark ? 'text-wt-dim/40 bg-d4 cursor-not-allowed' : 'text-lt-aux/40 bg-l4 cursor-not-allowed')"
          :disabled="!userLoggedIn || loading"
          @click="$emit('reload')"
        >
          <i class="ri-refresh-line text-[12px]" :class="loading ? 'animate-spin' : ''" />{{ loading ? '刷新中' : '刷新' }}
        </button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
        <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本页消耗</div>
          <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatCost(summary.totalPoints) }} 积分</div>
        </div>
        <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">本页 Tokens</div>
          <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatNumber(summary.totalTokens) }}</div>
        </div>
        <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">成功请求</div>
          <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ summary.successCount }}</div>
        </div>
        <div class="rounded-lg px-3 py-2" :class="isDark ? 'bg-d0 border border-bdr' : 'bg-l1 border border-bdrF'">
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">平均延迟</div>
          <div class="text-[14px] font-semibold mt-0.5" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ formatLatency(summary.avgLatency) }}</div>
        </div>
      </div>

      <div class="grid gap-2 sm:grid-cols-[140px_1fr_auto] mt-3">
        <select
          :value="statusFilter"
          class="h-8 rounded-lg px-2 text-[12px] outline-none transition-colors appearance-none"
          :class="isDark ? 'bg-d0 border border-d4 text-wt-sub focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub focus:border-brand-400'"
          @change="$emit('update:statusFilter', $event.target.value); $emit('reload')"
        >
          <option value="">全部状态</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="partial_failed">部分失败</option>
          <option value="pending">进行中</option>
        </select>
        <div class="relative">
          <i class="ri-search-line absolute left-2.5 top-[8px] text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <input
            :value="modelFilter"
            type="text"
            placeholder="按模型 ID 过滤，回车查询"
            class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'"
            @input="$emit('update:modelFilter', $event.target.value)"
            @keyup.enter="$emit('reload')"
          />
        </div>
        <button class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3'"
          @click="$emit('reload')">
          查询
        </button>
      </div>
      <p v-if="error" class="text-[10px] mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ error }}</p>
    </div>

    <div v-if="loading && records.length === 0" class="flex items-center gap-2 py-8 justify-center">
      <div class="w-4 h-4 border-2 rounded-full animate-spin" :class="isDark ? 'border-brand-400 border-t-transparent' : 'border-brand-500 border-t-transparent'" />
      <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在获取调用记录...</span>
    </div>
    <div v-else-if="records.length === 0" class="flex flex-col items-center justify-center py-9 gap-2">
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
          <div v-for="record in records" :key="record.id || record.request_id"
            class="grid grid-cols-[minmax(150px,1.3fr)_84px_112px_96px_82px_110px] gap-3 px-4 py-2.5 items-center text-[11px]"
            :class="isDark ? 'hover:bg-white/4' : 'hover:bg-l2'">
            <div class="min-w-0">
              <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ record.model_alias || '-' }}</div>
              <div class="flex items-center gap-1 mt-0.5 min-w-0">
                <span class="truncate font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ shortId(record.request_id || record.id) }}</span>
                <span v-if="record.stream" class="ctx-pill shrink-0" :class="isDark ? 'text-sky-400 bg-sky-400/8 border border-sky-400/20' : 'text-sky-600 bg-sky-50 border border-sky-100'" style="font-size:9px;padding:1px 4px">流式</span>
              </div>
            </div>
            <span class="ctx-pill w-fit" :class="statusTone(record.status, isDark)">{{ statusLabel(record.status) }}</span>
            <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ usageTokenParts(record) }}</span>
            <span class="font-mono" :class="isDark ? 'text-orange-400' : 'text-orange-600'">{{ formatCost(record.charged_points || 0) }}</span>
            <span class="font-mono" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ formatLatency(record.latency_ms) }}</span>
            <span :title="record.error_message || ''" class="truncate" :class="record.error_message ? (isDark ? 'text-red-400' : 'text-red-500') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
              {{ record.error_message || formatDateTime(record.started_at || record.created) }}
            </span>
          </div>
        </div>
      </div>
      <div v-if="hasNext" class="p-3 border-0 border-t border-solid" :class="isDark ? 'border-bdr' : 'border-bdrF'">
        <button
          class="w-full h-8 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3'"
          :disabled="loading"
          @click="$emit('load-more')"
        >
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
      </div>
    </div>
  </div>
</template>
