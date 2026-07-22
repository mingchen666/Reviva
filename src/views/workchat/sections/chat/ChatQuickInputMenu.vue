<script setup>
defineProps({
  isDark: Boolean,
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  emptyText: { type: String, default: '暂无可用快捷输入' },
  maxHeight: { type: Number, default: 280 },
})

const emit = defineEmits(['select', 'hover'])
</script>

<template>
  <div
    class="quick-input-menu rounded-lg overflow-hidden shadow-2xl"
    :class="isDark ? 'theme-dark is-dark' : 'theme-light is-light'">
    <div class="quick-input-header h-8 px-2.5 flex items-center gap-1.5">
      <i class="ri-at-line quick-input-header-icon text-[12px]" />
      <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-sub'">快捷输入</span>
    </div>

    <div class="overflow-y-auto thin-scroll p-1.5" :style="{ maxHeight: `${maxHeight}px` }">
      <button
        v-for="(item, index) in items"
        :key="`${item.type}:${item.id}`"
        type="button"
        class="quick-input-row w-full min-h-[48px] rounded-md px-2.5 py-2 flex items-center gap-2 text-left"
        :class="[
          isDark ? 'is-dark' : 'is-light',
          index === activeIndex ? 'is-active' : '',
        ]"
        @mouseenter="emit('hover', index)"
        @mousedown.prevent="emit('select', item)">
        <div class="quick-input-icon w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-[15px]">
          <i :class="item.icon || 'ri-flashlight-line'" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <strong class="quick-input-title min-w-0 truncate">{{ item.label }}</strong>
            <span class="min-w-0 text-[11px] font-medium truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ item.name }}
            </span>
          </div>
          <p
            v-if="item.description"
            class="mt-0.5 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-snug"
            :class="isDark ? 'text-wt-sub' : 'text-lt-aux'"
            :title="item.description">
            {{ item.description }}
          </p>
        </div>

        <span
          v-if="item.typeLabel"
          class="quick-input-type shrink-0 rounded px-1.5 py-0.5 text-[9px]">
          {{ item.typeLabel }}
        </span>
      </button>

      <div v-if="!items.length" class="px-3 py-5 text-center text-[11px]" :class="isDark ? 'text-wt-sub' : 'text-lt-aux'">
        {{ emptyText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-input-menu { border-width: 1px; border-style: solid; }
.quick-input-menu.is-dark { background: #1c1c26; border-color: #353542; box-shadow: 0 25px 50px -12px rgba(0,0,0,.45); }
.quick-input-menu.is-light { background: #fff; border-color: #e2e1de; box-shadow: 0 25px 50px -12px rgba(0,0,0,.15); }
.quick-input-header { border-bottom: 1px solid #e2e1de; }
.is-dark .quick-input-header { border-bottom-color: #2e2e3a; }
.quick-input-header-icon { color: #3a56d4; }
.is-dark .quick-input-header-icon { color: #9aa8ff; }
.quick-input-row { transition: background .14s ease, box-shadow .14s ease; }
.quick-input-row.is-light:hover { background: rgba(74,108,255,.07); }
.quick-input-row.is-dark:hover { background: rgba(112,132,255,.09); }
.quick-input-row.is-light.is-active { background: rgba(74,108,255,.13); box-shadow: inset 0 0 0 1px rgba(74,108,255,.18); }
.quick-input-row.is-dark.is-active { background: rgba(112,132,255,.16); box-shadow: inset 0 0 0 1px rgba(143,160,255,.22); }
.quick-input-icon { color: #3a56d4; background: rgba(74,108,255,.1); }
.is-dark .quick-input-icon { color: #9aa8ff; background: rgba(112,132,255,.12); }
.quick-input-title { color: #3a56d4; font-size: 12px; font-weight: 700; line-height: 1.25; }
.is-dark .quick-input-title { color: #9aa8ff; }
.quick-input-type { color: #3a56d4; background: rgba(74,108,255,.09); }
.is-dark .quick-input-type { color: #b9c4ff; background: rgba(112,132,255,.11); }
</style>
