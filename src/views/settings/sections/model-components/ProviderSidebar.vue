<script setup>
defineProps({
  providers: { type: Array, default: () => [] },
  selectedProviderId: { type: String, default: null },
  enabledProvidersCount: { type: Number, default: 0 },
  availableModelsCount: { type: Number, default: 0 },
  isDark: { type: Boolean, default: false },
  accentHex: { type: String, default: '#4A6CFF' },
})

defineEmits(['select-provider', 'toggle-provider'])
</script>

<template>
  <div class="w-[280px] border-0 border-r-2 border-solid shrink-0 overflow-y-auto" :class="isDark ? 'border-r border-d4' : 'border-r border-bdrL'">
    <div class="px-4 py-3" :class="isDark ? 'bg-d3/50' : 'bg-l3'">
      <div class="flex items-center gap-2">
        <i class="ri-server-line text-[14px]" style="color: #A78BFA" />
        <span class="section-title text-[12.5px]" :class="isDark ? 'text-wt-main' : 'text-lt-main'">服务商列表</span>
        <span class="ctx-pill ml-auto" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
          {{ providers.length }}
        </span>
      </div>
      <div class="flex items-center gap-3 mt-2">
        <div class="flex items-center gap-1.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {{ enabledProvidersCount }} 已启用
        </div>
        <div class="flex items-center gap-1.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-cpu-line text-[11px]" style="color: #A78BFA" />
          {{ availableModelsCount }} 模型
        </div>
      </div>
    </div>

    <div class="px-2 py-1 space-y-0.5">
      <button
        v-for="provider in providers"
        :key="provider.id"
        class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md relative"
        :class="selectedProviderId === provider.id
          ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main')
          : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')"
        @click="$emit('select-provider', provider.id)"
      >
        <span v-show="selectedProviderId === provider.id" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" :style="{ backgroundColor: accentHex }" />
        <div v-if="provider.iconName" class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          <SvgIcon :icon-class="provider.iconName" :size="20" />
        </div>
        <div v-else class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0" :style="{ background: provider.logoBg }">
          {{ provider.logoChar }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-medium truncate">{{ provider.name }}</span>
            <span v-if="provider.configured" class="w-1 h-1 rounded-full bg-emerald-400" />
          </div>
          <div class="flex items-center gap-1 mt-0.5">
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ provider.models.length }} 模型</span>
            <span v-if="provider.official || provider.builtin" class="text-[11px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">·</span>
            <span v-if="provider.official" class="text-[11px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'">官方</span>
            <span v-else-if="provider.builtin" class="text-[11px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">内置</span>
          </div>
        </div>
        <NSwitch :value="provider.enabled" size="small" :active-color="accentHex" @update:value="$emit('toggle-provider', provider.id)" @click.stop />
      </button>
    </div>
  </div>
</template>
