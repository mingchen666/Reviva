<script setup>
import RequestFormatSelect from './RequestFormatSelect.vue'

defineProps({
  provider: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  isProviderConfigured: { type: Boolean, default: false },
  showApiKey: { type: Boolean, default: false },
  canEditBaseUrl: { type: Boolean, default: true },
  isBaseUrlDefault: { type: Boolean, default: true },
  apiFormat: { type: String, default: 'openai' },
  baseUrlHelpText: { type: String, default: '' },
})

defineEmits([
  'test',
  'toggle-api-key',
  'copy-api-key',
  'api-key-input',
  'base-url-input',
  'reset-base-url',
  'select-api-format',
])
</script>

<template>
  <template v-if="provider">
    <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">API Key</label>
        <button
          class="flex items-center gap-1 text-[11px] font-medium transition-colors"
          :class="isProviderConfigured
            ? (isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-500')
            : (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')"
          :disabled="!isProviderConfigured"
          @click="$emit('test')"
        >
          <i class="ri-link text-[12px]" />测试连接
        </button>
      </div>
      <div class="flex items-center gap-2">
        <input
          :type="showApiKey ? 'text' : 'password'"
          :value="provider.apiKey"
          class="flex-1 h-9 rounded-lg px-3 text-[14px] font-mono outline-none transition-colors"
          :class="isDark ? 'bg-d0 border border-bdr text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l1 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
          :placeholder="provider.local ? '本地服务可填写任意值，例如 ollama' : '输入 API Key...'"
          @input="$emit('api-key-input', $event.target.value)"
        />
        <button
          class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          :class="isDark ? 'bg-d0 border border-bdr text-wt-aux hover:text-wt-sub hover:bg-d3' : 'bg-l1 border border-bdrF text-lt-aux hover:text-lt-sub hover:bg-l3'"
          @click="$emit('toggle-api-key')"
        >
          <i :class="showApiKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="text-[14px]" />
        </button>
        <button
          class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          :class="isDark ? 'bg-d0 border border-bdr text-wt-aux hover:text-wt-sub hover:bg-d3' : 'bg-l1 border border-bdrF text-lt-aux hover:text-lt-sub hover:bg-l3'"
          @click="$emit('copy-api-key')"
        >
          <i class="ri-file-copy-line text-[14px]" />
        </button>
      </div>
    </div>

    <RequestFormatSelect
      :model-value="apiFormat"
      :is-dark="isDark"
      @update:model-value="$emit('select-api-format', $event)"
    />

    <div class="rounded-xl p-2" :class="isDark ? 'bg-d2/60 border border-bdr' : 'bg-white border border-bdrF'">
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-[11px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">Base URL</label>
        <button
          class="flex items-center gap-1 text-[11px] font-medium transition-colors"
          :class="isBaseUrlDefault
            ? (isDark ? 'text-wt-dim/50 cursor-not-allowed' : 'text-lt-aux/50 cursor-not-allowed')
            : (isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-500')"
          :disabled="isBaseUrlDefault"
          @click="$emit('reset-base-url')"
        >
          <i class="ri-restart-line text-[12px]" />恢复默认
        </button>
      </div>
      <input
        :value="provider.baseUrl"
        :readonly="!canEditBaseUrl"
        class="w-full h-9 rounded-lg px-3 text-[14px] font-mono outline-none transition-colors"
        :class="isDark ? 'bg-d0 border border-bdr text-wt-sub focus:border-brand-400/40' : 'bg-l1 border border-bdrF text-lt-sub focus:border-brand-400'"
        @input="canEditBaseUrl && $emit('base-url-input', $event.target.value)"
      />
      <p class="text-[10px] leading-relaxed mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        {{ baseUrlHelpText }}
      </p>
    </div>
  </template>
</template>
