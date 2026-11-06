<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  providers: { type: Array, default: () => [] },
  selectedProviderId: { type: String, default: null },
  enabledProvidersCount: { type: Number, default: 0 },
  availableModelsCount: { type: Number, default: 0 },
  isDark: { type: Boolean, default: false },
  accentHex: { type: String, default: '#4A6CFF' },
})

const emit = defineEmits(['select-provider', 'toggle-provider', 'add-provider'])

const searchQuery = ref('')
const filteredProviders = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.providers
  return props.providers.filter(p =>
    (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q)
  )
})
</script>

<template>
  <div class="w-[280px] shrink-0 flex flex-col h-full border-0 border-r-2 border-solid" :class="isDark ? 'border-r border-d4' : 'border-r border-bdrL'">
    <!-- Header -->
    <div class="px-4 py-2 shrink-0" :class="isDark ? 'bg-d3/50' : 'bg-l3'">
      <div class="flex items-center gap-2">
        <i class="ri-server-line text-[14px]" style="color: #A78BFA" />
        <span class="section-title text-[12.5px]" :class="isDark ? 'text-wt-main' : 'text-lt-main'">模型服务商列表</span>
        <span class="ctx-pill ml-auto" :class="isDark ? 'text-wt-dim bg-d0 border border-bdr' : 'text-lt-aux bg-l2 border border-bdrF'">
          {{ providers.length }}
        </span>
      </div>

      <div class="flex items-center gap-3 mt-0.5">
        <div class="flex items-center gap-1.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {{ enabledProvidersCount }} 已启用
        </div>
        <div class="flex items-center gap-1.5 text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-cpu-line text-[11px]" style="color: #A78BFA" />
          {{ availableModelsCount }} 模型
        </div>
      </div>

      <div class="relative mt-2">
        <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="searchQuery" type="text" placeholder="搜索服务商..."
          class="w-full h-7 rounded-md py-0 pl-7 pr-2 text-[12.5px] outline-none transition-colors"
          :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400'" />
      </div>
    </div>

    <!-- List (scrollable) -->
    <div class="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
      <button
        v-for="provider in filteredProviders"
        :key="provider.id"
        class="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md relative"
        :class="selectedProviderId === provider.id
          ? (isDark ? 'bg-white/6 text-wt-main' : 'bg-l3 text-lt-main')
          : (isDark ? 'text-wt-sub hover:bg-white/4' : 'text-lt-sub hover:bg-l4')"
        @click="emit('select-provider', provider.id)"
      >
        <span v-show="selectedProviderId === provider.id" class="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-r" :style="{ backgroundColor: accentHex }" />
        <div v-if="provider.iconName" class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          <SvgIcon :icon-class="provider.iconName" :size="20" />
        </div>
        <div v-else class="w-7 h-7 rounded-full flex items-center justify-center text-white fs-title font-bold shrink-0" :style="{ background: provider.logoBg }">
          {{ provider.logoChar }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[13px] font-medium truncate">{{ provider.name }}</span>
            <span v-if="provider.configured" class="w-1 h-1 rounded-full bg-emerald-400" />
          </div>
          <div class="flex items-center gap-1 mt-0.5">
            <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ provider.models.length }} 模型</span>
            <span v-if="provider.official || provider.builtin || provider.custom" class="text-[11px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">·</span>
            <span v-if="provider.official" class="text-[11px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'">官方</span>
            <span v-else-if="provider.builtin" class="text-[11px]" :class="isDark ? 'text-wt-dim/70' : 'text-lt-aux/70'">内置</span>
            <span v-else-if="provider.custom" class="text-[11px]" :class="isDark ? 'text-violet-400' : 'text-violet-600'">自定义</span>
          </div>
        </div>
        <NSwitch :value="provider.enabled" size="small" :active-color="accentHex" @update:value="emit('toggle-provider', provider.id)" @click.stop />
      </button>
      <div v-if="filteredProviders.length === 0" class="text-center py-8">
        <i class="ri-search-line text-[20px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <div class="text-[12px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无匹配服务商</div>
      </div>
    </div>

    <!-- Add provider -->
    <div class="shrink-0 p-2 border-t" :class="isDark ? 'border-d4' : 'border-bdrL'">
      <button
        class="w-full flex items-center justify-center gap-1 h-8 rounded-lg text-[13px] font-500 transition-colors"
        :class="isDark ? 'text-violet-400 hover:bg-violet-400/10' : 'text-violet-600 hover:bg-violet-50'"
        @click="emit('add-provider')"
      >
        <i class="ri-add-line text-[16px]" />添加自定义模型服务商
      </button>
    </div>
  </div>
</template>
