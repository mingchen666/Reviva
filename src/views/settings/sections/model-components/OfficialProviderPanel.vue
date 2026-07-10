<script setup>
defineProps({
  provider: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  userLoggedIn: { type: Boolean, default: false },
  officialStatus: { type: Object, required: true },
  officialBalanceLoading: { type: Boolean, default: false },
  officialBalance: { type: Number, default: 0 },
  officialBalanceLoaded: { type: Boolean, default: false },
  officialKeyLoading: { type: Boolean, default: false },
  officialKeyError: { type: String, default: null },
  fetchingModels: { type: Boolean, default: false },
  isProviderConfigured: { type: Boolean, default: false },
})

defineEmits(['refresh', 'reset-key', 'copy-api-key', 'test'])

function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('zh-CN')
}

function maskKey(value) {
  if (!value) return '未创建'
  const text = String(value)
  if (text.length <= 8) return '********'
  return `${text.slice(0, 3)}********${text.slice(-4)}`
}
</script>

<template>
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
        <button
          class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5 shrink-0"
          :class="userLoggedIn
            ? (isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3')
            : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
          :disabled="!userLoggedIn || officialBalanceLoading || officialKeyLoading || fetchingModels"
          @click="$emit('refresh')"
        >
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
          <button
            class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1"
            :class="userLoggedIn
              ? (isDark ? 'text-brand-400 hover:bg-brand-400/10' : 'text-brand-600 hover:bg-brand-50')
              : (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')"
            :disabled="!userLoggedIn || officialKeyLoading"
            @click="$emit('reset-key')"
          >
            <i class="ri-refresh-line text-[12px]" />{{ officialKeyLoading ? '处理中' : '重置 Key' }}
          </button>
        </div>
        <div class="h-9 rounded-lg px-3 flex items-center gap-2 font-mono text-[12px]"
          :class="isDark ? 'bg-d0 border border-bdr text-wt-sub' : 'bg-l1 border border-bdrF text-lt-sub'">
          <i class="ri-key-2-line text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
          <span class="truncate">{{ maskKey(provider.apiKey) }}</span>
        </div>
        <div class="mt-2 flex items-center gap-1.5">
          <button
            class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
            :class="isProviderConfigured
              ? (isDark ? 'text-wt-sub bg-d0 border border-bdr hover:bg-d3' : 'text-lt-sub bg-l1 border border-bdrF hover:bg-l3')
              : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
            :disabled="!isProviderConfigured"
            @click="$emit('copy-api-key')"
          >
            <i class="ri-file-copy-line text-[12px]" />复制
          </button>
          <button
            class="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1"
            :class="isProviderConfigured
              ? (isDark ? 'text-brand-400 bg-brand-400/8 hover:bg-brand-400/12' : 'text-brand-600 bg-brand-50 hover:bg-brand-100')
              : (isDark ? 'text-wt-dim/50 bg-d4 cursor-not-allowed' : 'text-lt-aux/50 bg-l4 cursor-not-allowed')"
            :disabled="!isProviderConfigured"
            @click="$emit('test')"
          >
            <i class="ri-link text-[12px]" />测试
          </button>
        </div>
        <p v-if="officialKeyError" class="text-[10px] mt-2" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ officialKeyError }}</p>
      </div>
    </div>
  </div>
</template>
