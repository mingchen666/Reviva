<script setup>
defineProps({
  provider: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  accentHex: { type: String, default: '#4A6CFF' },
  isOfficialProvider: { type: Boolean, default: false },
  officialModelsLoaded: { type: Boolean, default: false },
  fetchError: { type: String, default: null },
  canFetchModels: { type: Boolean, default: false },
  fetchingModels: { type: Boolean, default: false },
  isProviderConfigured: { type: Boolean, default: false },
  capabilityMeta: { type: Object, required: true },
  tierLabel: { type: Function, required: true },
  tierColor: { type: Function, required: true },
  capClass: { type: Function, required: true },
  getActiveCapabilities: { type: Function, required: true },
  formatCost: { type: Function, required: true },
  costUnitLabel: { type: Function, required: true },
})

defineEmits(['fetch-models', 'add-model', 'edit-model', 'delete-model', 'toggle-model'])
</script>

<template>
  <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
    <div class="flex items-center justify-between mb-2 gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <i class="ri-stack-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="section-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ isOfficialProvider ? '官方模型列表' : '已添加模型' }}</span>
        <span class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">
          {{ provider.models.length }}
        </span>
        <span v-if="isOfficialProvider && officialModelsLoaded" class="ctx-pill" :class="isDark ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-100'">
          <i class="ri-check-line text-[9px]" />已同步
        </span>
        <span v-if="fetchError" class="text-[11px] ml-1 truncate" :class="isDark ? 'text-red-400' : 'text-red-500'">{{ fetchError }}</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          class="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors"
          :class="canFetchModels
            ? (isDark ? 'text-agent-400 hover:bg-agent-400/10' : 'text-agent-600 hover:bg-agent-50')
            : (isDark ? 'text-wt-dim/40 cursor-not-allowed' : 'text-lt-aux/40 cursor-not-allowed')"
          :disabled="!canFetchModels || fetchingModels"
          @click="$emit('fetch-models')"
        >
          <i class="ri-download-cloud-line text-[12px]" />
          <span v-if="fetchingModels">获取中</span>
          <span v-else>{{ isOfficialProvider ? '同步模型' : '获取模型' }}</span>
        </button>
        <button
          v-if="!isOfficialProvider"
          class="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors"
          :class="isProviderConfigured
            ? (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3')
            : (isDark ? 'text-wt-dim/40 cursor-not-allowed' : 'text-lt-aux/40 cursor-not-allowed')"
          :disabled="!isProviderConfigured"
          @click="$emit('add-model')"
        >
          <i class="ri-add-line text-[12px]" />手动添加
        </button>
      </div>
    </div>

    <div v-if="provider.models.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
      <i class="ri-inbox-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
      <span class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ isOfficialProvider ? '登录后点击右上方按钮同步官方模型' : '暂无模型，点击右上方按钮获取或手动添加' }}</span>
    </div>

    <div v-else class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))">
      <div
        v-for="model in provider.models"
        :key="model.id"
        class="rounded-lg p-3 relative group transition-colors"
        :class="model.enabled
          ? (isDark ? 'bg-d3/60 border border-bdr' : 'bg-l1 border border-bdrF')
          : (isDark ? 'bg-d3/30 border border-d4' : 'bg-l3/40 border border-bdrF')"
      >
        <div v-if="!isOfficialProvider" class="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            class="w-5 h-5 rounded-md flex items-center justify-center"
            :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-brand-400/10' : 'text-lt-aux hover:text-brand-600 hover:bg-brand-50'"
            @click="$emit('edit-model', provider.id, model)"
          >
            <i class="ri-edit-line text-[12px]" />
          </button>
          <button
            class="w-5 h-5 rounded-md flex items-center justify-center"
            :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/10' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'"
            @click="$emit('delete-model', provider.id, model.id)"
          >
            <i class="ri-close-line text-[12px]" />
          </button>
        </div>

        <div class="flex items-center gap-1.5 mb-2 pr-12">
          <span class="text-[14px] font-medium truncate" :class="model.enabled ? (isDark ? 'text-wt-main' : 'text-lt-main') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">{{ model.name }}</span>
        </div>

        <div class="flex items-center gap-1.5 mb-2 flex-wrap">
          <span class="ctx-pill" :style="{ color: tierColor(model.tier).text, background: tierColor(model.tier).bg, borderColor: tierColor(model.tier).border }">
            {{ tierLabel(model.tier) }}
          </span>
          <span class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
            <i class="ri-text-wrap text-[10px]" />{{ model.ctx }}
          </span>
          <span v-if="model.maxOutput && model.maxOutput !== '?'" class="ctx-pill" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
            <i class="ri-arrow-right-down-line text-[10px]" />{{ model.maxOutput }}
          </span>
        </div>

        <div class="flex items-center gap-1 flex-wrap mb-2">
          <span v-for="capKey in getActiveCapabilities(model.capabilities)" :key="capKey"
            class="ctx-pill border" :class="capClass(capKey)">
            <i :class="capabilityMeta[capKey].icon" class="text-[10px]" />{{ capabilityMeta[capKey].label }}
          </span>
        </div>

        <div v-if="(model.costInput || model.costOutput || model.costCacheRead)" class="mb-2.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="ctx-pill" :class="isDark ? 'text-orange-400 bg-orange-400/8 border border-orange-400/20' : 'text-orange-600 bg-orange-50 border border-orange-100'">
              <i class="ri-money-cny-circle-line text-[10px]" />{{ formatCost(model.costInput) }}/{{ formatCost(model.costOutput) }} {{ costUnitLabel(model) }}
            </span>
            <span v-if="model.costCacheRead" class="ctx-pill" :class="isDark ? 'text-teal-400 bg-teal-400/8 border border-teal-400/20' : 'text-teal-600 bg-teal-50 border border-teal-100'">
              <i class="ri-database-2-line text-[10px]" />缓存 {{ formatCost(model.costCacheRead) }} {{ costUnitLabel(model) }}
            </span>
            <span v-if="model.requestMinPoints" class="ctx-pill" :class="isDark ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20' : 'text-amber-600 bg-amber-50 border border-amber-100'">
              <i class="ri-safe-2-line text-[10px]" />最低 {{ formatCost(model.requestMinPoints) }} 积分
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-[12px]" :class="model.enabled ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
            {{ model.enabled ? '已启用' : '未启用' }}
          </span>
          <NSwitch :value="model.enabled" size="small" :active-color="accentHex" @update:value="$emit('toggle-model', provider.id, model.id)" @click.stop />
        </div>
      </div>
    </div>
  </div>
</template>
