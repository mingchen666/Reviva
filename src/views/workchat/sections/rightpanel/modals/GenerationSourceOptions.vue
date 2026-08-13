<script setup>
import { computed } from 'vue'
import ReferenceContextList from './ReferenceContextList.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  wikiItems: { type: Array, default: () => [] },
  isDark: Boolean,
  accentClass: { type: String, default: 'text-brand-400' },
  activeClass: { type: String, default: 'bg-brand-500' },
  webEnabled: Boolean,
})

const emit = defineEmits(['update:webEnabled'])

const mergedItems = computed(() => {
  const existingWikiIds = new Set((props.items || [])
    .filter(item => item?.type === 'wiki')
    .map(item => String(item.id || item.wikiId || '').trim())
    .filter(Boolean))
  const wikiItems = (props.wikiItems || [])
    .map(item => ({
      ...item,
      id: item?.id || item?.wikiId,
      name: item?.name || item?.id || item?.wikiId,
      type: 'wiki',
      icon: item?.icon || 'ri-book-2-line',
    }))
    .filter(item => item.id && !existingWikiIds.has(String(item.id)))
  return [...(props.items || []), ...wikiItems]
})

const webEnabled = computed({
  get: () => props.webEnabled === true,
  set: value => emit('update:webEnabled', value === true),
})
</script>

<template>
  <ReferenceContextList
    :items="mergedItems"
    :is-dark="isDark"
    :accent-class="accentClass"
    empty-text="未选择资料；可在左侧勾选文件、知识库或 Wiki"
  />

  <div class="rounded-xl p-3" :class="isDark ? 'bg-d2 border border-bdr/50' : 'bg-l2 border border-bdrF/50'">
    <div class="flex items-center gap-3">
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center"
        :class="webEnabled ? (isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600') : (isDark ? 'bg-d0 text-wt-dim' : 'bg-white text-lt-aux')"
      >
        <i class="ri-global-line text-[15px]" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">联网补充</div>
        <div class="text-[9px] mt-0.5 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          默认关闭。开启后会在已选资料、知识库和 Wiki 之后调用当前 Agent 已绑定的联网搜索工具，结果只作补充。
        </div>
      </div>
      <button
        type="button"
        :aria-pressed="webEnabled"
        @click="webEnabled = !webEnabled"
        class="w-9 h-5 rounded-full relative transition-colors shrink-0"
        :class="webEnabled ? activeClass : (isDark ? 'bg-d4' : 'bg-l4')"
      >
        <span
          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          :style="{ transform: webEnabled ? 'translateX(16px)' : 'translateX(0)' }"
        />
      </button>
    </div>
  </div>
</template>
