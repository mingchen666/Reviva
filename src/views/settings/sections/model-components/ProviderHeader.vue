<script setup>
defineProps({
  provider: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  accentHex: { type: String, default: '#4A6CFF' },
})

defineEmits(['toggle-provider'])
</script>

<template>
  <div class="flex items-center gap-2 pb-1">
    <div v-if="provider.iconName" class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
      <SvgIcon :icon-class="provider.iconName" :size="26" />
    </div>
    <div v-else class="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[17px] font-bold shrink-0" :style="{ background: provider.logoBg }">
      {{ provider.logoChar }}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-[15px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ provider.name }}</span>
        <span v-if="provider.official" class="ctx-pill" :class="isDark ? 'bg-brand-400/10 text-brand-300 border border-brand-400/15' : 'bg-brand-50 text-brand-600 border border-brand-100'">
          <i class="ri-verified-badge-line text-[10px]" />官方
        </span>
        <span v-if="provider.recommended" class="ctx-pill" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/15' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
          <i class="ri-thumb-up-line text-[10px]" />推荐
        </span>
        <span v-else-if="provider.builtin" class="ctx-pill" :class="isDark ? 'bg-violet-400/10 text-violet-300 border border-violet-400/15' : 'bg-violet-50 text-violet-600 border border-violet-100'">
          <i class="ri-shield-check-line text-[10px]" />内置
        </span>
        <span v-if="provider.configured" class="ctx-pill" :class="isDark ? 'bg-emerald-400/8 text-emerald-400 border border-emerald-400/15' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'">
          <span class="w-1 h-1 rounded-full" :class="isDark ? 'bg-emerald-400' : 'bg-emerald-600'" />已配置
        </span>
        <span v-else class="ctx-pill" :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">未配置</span>
      </div>
      <div class="text-[12px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ provider.desc }}</div>
    </div>
    <NSwitch :value="provider.enabled" size="small" :active-color="accentHex" @update:value="$emit('toggle-provider', provider.id)" />
  </div>
</template>
