<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  totalRounds: { type: Number, default: 0 },
  activeId: { type: String, default: '' },
  isDark: Boolean,
  hasRounds: Boolean,
  canShowOlder: Boolean,
  canShowNewer: Boolean,
  olderLoading: Boolean,
  olderLabel: { type: String, default: '显示更早的问答' },
})

const emit = defineEmits(['select', 'show-older', 'show-newer'])

const rootRef = ref(null)
const itemRefs = new Map()
const isExpanded = ref(false)
const panelId = 'chat-directory-panel'

const activeItem = computed(() => props.items.find(item => item.userMessageId === props.activeId) || null)

const totalRoundCount = computed(() => props.totalRounds || props.items.length || (props.hasRounds ? 1 : 0))

const roundCountLabel = computed(() => {
  const total = totalRoundCount.value
  return total > props.items.length ? `${props.items.length} / ${total} 轮` : `${total} 轮`
})

const triggerLabel = computed(() => (
  `${isExpanded.value ? '收起' : '展开'}对话目录，共 ${totalRoundCount.value} 轮问答`
))

const triggerTitle = computed(() => isExpanded.value ? '收起对话目录' : '展开对话目录')
const triggerIcon = computed(() => isExpanded.value ? 'ri-close-line' : 'ri-list-unordered')

function setItemRef(el, id) {
  if (!id) return
  if (el) itemRefs.set(id, el)
  else itemRefs.delete(id)
}

function closeDirectory() {
  isExpanded.value = false
}

function toggleDirectory() {
  isExpanded.value = !isExpanded.value
}

function selectItem(item) {
  emit('select', item)
  closeDirectory()
}

function onDocumentPointerDown(event) {
  if (!isExpanded.value || rootRef.value?.contains(event.target)) return
  closeDirectory()
}

function onDocumentKeydown(event) {
  if (event.key !== 'Escape' || !isExpanded.value) return
  closeDirectory()
}

watch(() => props.activeId, async (id) => {
  if (!id) return
  await nextTick()
  itemRefs.get(id)?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <aside
    v-if="hasRounds || items.length"
    ref="rootRef"
    class="chat-directory-nav"
    :class="[{ 'is-open': isExpanded, 'is-dark': isDark }]">
    <button
      type="button"
      class="directory-trigger"
      :aria-expanded="isExpanded"
      :aria-controls="panelId"
      :aria-label="triggerLabel"
      :title="triggerTitle"
      @click="toggleDirectory">
      <i :class="[triggerIcon, 'text-[18px]']" />
      <span class="directory-trigger-label">目录</span>
      <span class="directory-trigger-count" aria-hidden="true">{{ totalRoundCount }}</span>
    </button>

    <nav :id="panelId" class="directory-panel" aria-label="对话目录">
      <div class="directory-header">
        <div class="directory-title-wrap">
<span class="directory-title-icon"><i class="ri-list-unordered" /></span>
          <p class="directory-title">对话目录</p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="directory-count">{{ roundCountLabel }}</span>
          <button type="button" class="directory-close" aria-label="收起对话目录" title="收起目录"
            @click="closeDirectory">
            <i class="ri-close-line text-[16px]" />
          </button>
        </div>
      </div>

      <div class="directory-list thin-scroll">
        <button
          v-if="canShowOlder"
          type="button"
          class="directory-more"
          :disabled="olderLoading"
          @click="emit('show-older')">
          <i :class="olderLoading ? 'ri-loader-4-line directory-spinner' : 'ri-arrow-up-s-line'" class="text-[14px]" />
          <span>{{ olderLoading ? '正在加载更早对话…' : olderLabel }}</span>
        </button>

        <button
          v-for="item in items"
          :key="item.userMessageId"
          :ref="el => setItemRef(el, item.userMessageId)"
          type="button"
          class="directory-item"
          :class="{ 'is-active': item.userMessageId === activeId }"
          :aria-current="item.userMessageId === activeId ? 'true' : undefined"
          :title="`${item.questionFull}${item.summaryFull ? `\n${item.summaryFull}` : ''}`"
          @click="selectItem(item)">
          <span class="directory-active-rail" aria-hidden="true" />
          <span class="directory-item-content">
            <span class="directory-item-meta">
              <i class="ri-user-3-line" />
              <span>用户提问</span>
            </span>
            <span class="directory-question">{{ item.question }}</span>
            <span v-if="item.summary" class="directory-summary" :class="{ 'is-streaming': item.summaryState === 'streaming' }">
              <i v-if="item.summaryState === 'streaming'" class="ri-loader-4-line directory-spinner" />
              <i v-else-if="item.summaryState === 'error'" class="ri-error-warning-line" />
              <i v-else-if="item.summaryState === 'cancelled'" class="ri-close-circle-line" />
              <i v-else class="ri-sparkling-line" />
              <span>{{ item.summary }}</span>
            </span>
          </span>
        </button>

        <button
          v-if="canShowNewer"
          type="button"
          class="directory-more directory-more-bottom"
          @click="emit('show-newer')">
          <span>显示更新的问答</span>
          <i class="ri-arrow-down-s-line text-[14px]" />
        </button>
      </div>

      <p v-if="activeItem" class="directory-live" aria-live="polite">
        当前阅读：{{ activeItem.questionFull }}
      </p>
    </nav>
  </aside>
</template>

<style scoped>
.chat-directory-nav {
  --directory-panel-height: 440px;
  --directory-bg: var(--ui-bg-2);
  --directory-border: var(--ui-border-card);
  --directory-title: var(--ui-text-main);
  --directory-subtle: var(--ui-text-aux);
  --directory-hover: var(--ui-bg-3);
  --directory-active-bg: rgba(var(--ui-brand-400-rgb), 0.11);
  --directory-active-text: var(--ui-brand-500);
  position: absolute;
  z-index: 12;
  top: 12px;
  right: 12px;
  bottom: auto;
  width: auto;
  height: auto;
  max-height: none;
  transform: none;
  pointer-events: none;
}

@media (max-height: 720px) {
  .chat-directory-nav {
    --directory-panel-height: 380px;
  }
}

.directory-trigger,
.directory-panel {
  pointer-events: auto;
}

.directory-trigger {
  position: relative;
  display: inline-flex;
  width: 44px;
  min-width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 0;
  border: 1px solid var(--directory-border);
  border-radius: 50%;
  padding: 0;
  color: var(--directory-title);
  background: color-mix(in srgb, var(--directory-bg) 94%, transparent);
  box-shadow: 0 6px 16px rgba(20, 24, 46, 0.1);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: color 160ms cubic-bezier(0.25, 1, 0.5, 1), background-color 160ms cubic-bezier(0.25, 1, 0.5, 1), transform 160ms cubic-bezier(0.25, 1, 0.5, 1);
}

.directory-trigger:hover {
  color: var(--directory-active-text);
  background: rgba(var(--ui-brand-400-rgb), 0.1);
}

.directory-trigger:active {
  transform: scale(0.96);
}

.directory-trigger-label {
  display: none;
}

.directory-trigger-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  color: var(--ui-brand-500);
  background: color-mix(in srgb, var(--directory-bg) 78%, var(--ui-brand-400));
  box-shadow: 0 0 0 2px var(--directory-bg);
}

.is-open .directory-trigger-count {
  display: none;
}

.directory-panel {
  display: none;
  position: absolute;
  top: 52px;
  right: 0;
  width: min(284px, calc(100cqw - 44px));
  height: min(var(--directory-panel-height), calc(100vh - 172px));
  max-height: min(var(--directory-panel-height), calc(100vh - 172px));
  animation: directory-pop-in 190ms cubic-bezier(0.25, 1, 0.5, 1);
}

.is-open .directory-panel {
  display: flex;
}

.directory-close {
  display: inline-flex;
}

.directory-panel {
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--directory-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--directory-bg) 94%, transparent);
  box-shadow: 0 12px 32px rgba(20, 24, 46, 0.1), 0 2px 6px rgba(20, 24, 46, 0.05);
  backdrop-filter: blur(14px) saturate(1.08);
}

.is-dark .directory-panel {
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26), 0 2px 7px rgba(0, 0, 0, 0.16);
}

.directory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  gap: 8px;
  padding: 8px 9px 8px 11px;
  border-bottom: 1px solid var(--directory-border);
}

.directory-title-wrap {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.directory-title-icon {
  display: inline-flex;
  width: 23px;
  height: 23px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--ui-brand-400-rgb), 0.2);
  border-radius: 8px;
  color: var(--ui-brand-400);
  background: rgba(var(--ui-brand-400-rgb), 0.1);
  font-size: 13px;
}

.directory-title {
  margin: 0;
  color: var(--directory-title);
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.15;
}

.directory-count,
.directory-trigger-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--directory-subtle);
  background: rgba(var(--ui-text-main-rgb), 0.055);
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.directory-count {
  min-height: 20px;
  padding: 0 7px;
}

.directory-close {
  display: none;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  color: var(--directory-subtle);
  background: transparent;
  cursor: pointer;
  transition: color 140ms cubic-bezier(0.25, 1, 0.5, 1), background-color 140ms cubic-bezier(0.25, 1, 0.5, 1);
}

.directory-close:hover {
  color: var(--directory-title);
  background: var(--directory-hover);
}

.directory-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
  padding: 7px 6px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.directory-item {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  border: 0;
  border-radius: 9px;
  padding: 8px 8px 8px 10px;
  color: var(--directory-title);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 160ms cubic-bezier(0.25, 1, 0.5, 1), color 160ms cubic-bezier(0.25, 1, 0.5, 1), transform 160ms cubic-bezier(0.25, 1, 0.5, 1);
}

.directory-item:hover {
  background: var(--directory-hover);
}

.directory-item:active {
  transform: scale(0.985);
}

.directory-item:focus-visible,
.directory-more:focus-visible,
.directory-trigger:focus-visible,
.directory-close:focus-visible {
  outline: 2px solid rgba(var(--ui-brand-400-rgb), 0.82);
  outline-offset: 2px;
}

.directory-item.is-active {
  color: var(--directory-active-text);
  background: var(--directory-active-bg);
}

.directory-active-rail {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  border-radius: 0 99px 99px 0;
  background: var(--ui-brand-400);
  opacity: 0;
  transform: scaleY(0.5);
  transition: opacity 160ms cubic-bezier(0.25, 1, 0.5, 1), transform 180ms cubic-bezier(0.25, 1, 0.5, 1);
}

.directory-item.is-active .directory-active-rail {
  opacity: 1;
  transform: scaleY(1);
}

.directory-item-content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.directory-item-meta,
.directory-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.directory-item-meta {
  color: var(--directory-subtle);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.025em;
  line-height: 1;
}

.directory-item.is-active .directory-item-meta {
  color: var(--ui-brand-400);
}

.directory-question {
  display: -webkit-box;
  overflow: hidden;
  color: inherit;
  font-size: 11px;
  font-weight: 620;
  line-height: 1.38;
  text-wrap: pretty;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.directory-summary {
  color: var(--directory-subtle);
  font-size: 10px;
  line-height: 1.4;
}

.directory-summary > i {
  flex: 0 0 auto;
  color: var(--ui-agent-400);
  font-size: 11px;
}

.directory-summary.is-streaming > i {
  color: var(--ui-brand-400);
}

.directory-summary > span {
  display: -webkit-box;
  overflow: hidden;
  text-wrap: pretty;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.directory-item.is-active .directory-summary {
  color: color-mix(in srgb, var(--directory-active-text) 78%, var(--directory-subtle));
}

.directory-more {
  display: flex;
  width: 100%;
  min-height: 29px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  border-radius: 8px;
  padding: 5px 7px;
  color: var(--directory-subtle);
  background: transparent;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: color 140ms cubic-bezier(0.25, 1, 0.5, 1), background-color 140ms cubic-bezier(0.25, 1, 0.5, 1);
}

.directory-more:hover:not(:disabled) {
  color: var(--directory-active-text);
  background: rgba(var(--ui-brand-400-rgb), 0.08);
}

.directory-more:disabled {
  cursor: wait;
  opacity: 0.72;
}

.directory-more-bottom {
  margin-top: 1px;
}

.directory-spinner {
  animation: directory-spin 760ms linear infinite;
}

.directory-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes directory-spin {
  to { transform: rotate(360deg); }
}

@keyframes directory-pop-in {
  from {
    opacity: 0;
    transform: translateY(-5px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .directory-item,
  .directory-active-rail,
  .directory-more,
  .directory-trigger,
  .directory-close {
    transition-duration: 1ms;
  }
  .directory-panel,
  .directory-spinner {
    animation: none;
  }
}
</style>