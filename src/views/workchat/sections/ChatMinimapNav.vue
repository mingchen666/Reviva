<script setup>
import { computed } from 'vue'

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

const totalRoundCount = computed(() => props.totalRounds || props.items.length || (props.hasRounds ? 1 : 0))

const renderedItems = computed(() => props.items.map((item, index) => ({
  ...item,
  localIndex: index,
  position: itemPosition(index),
  visualStyle: visualStyleFor(item),
  isNearTop: index === 0,
  isNearBottom: index === props.items.length - 1,
})))

function itemPosition(index) {
  const count = props.items.length
  if (count <= 1) return '50%'
  const inset = 7
  return `${inset + (index / (count - 1)) * (100 - inset * 2)}%`
}

function scaledWidth(source, min, max) {
  const length = String(source || '').trim().length
  if (!length) return min
  return `${Math.min(max, Math.max(min, min + Math.round(length / 4)))}%`
}

function visualStyleFor(item) {
  const summaryWidth = scaledWidth(item.summaryFull || item.summary, 38, 84)
  const summaryLength = String(summaryWidth).replace('%', '')
  return {
    '--question-line-width': scaledWidth(item.questionFull || item.question, 62, 96),
    '--summary-line-width': summaryWidth,
    '--summary-short-line-width': `${Math.max(24, Math.round(Number(summaryLength) * 0.58))}%`,
    '--summary-line-opacity': item.summary ? 1 : 0.34,
  }
}

function summaryLabel(item) {
  if (item.summary) return item.summary
  if (item.summaryState === 'streaming') return '正在生成回复…'
  if (item.summaryState === 'error') return '该轮回复未完成'
  if (item.summaryState === 'cancelled') return '该轮回复已取消'
  return '尚未生成回复摘要'
}

function roundLabel(item) {
  const index = Number.isFinite(item.directoryIndex) ? item.directoryIndex + 1 : item.localIndex + 1
  return `第 ${index} 轮，共 ${totalRoundCount.value} 轮`
}

function itemAriaLabel(item) {
  return `${roundLabel(item)}。用户提问：${item.questionFull || item.question}。${summaryLabel(item)}`
}
</script>

<template>
  <aside
    v-if="hasRounds || items.length"
    class="chat-minimap-nav"
    :class="{ 'is-dark': isDark }"
    aria-label="对话缩略导航">
    <button
      v-if="canShowOlder"
      type="button"
      class="minimap-page minimap-page-up"
      :disabled="olderLoading"
      :title="olderLoading ? '正在加载更早对话…' : olderLabel"
      :aria-label="olderLoading ? '正在加载更早对话' : olderLabel"
      @click="emit('show-older')">
      <i :class="olderLoading ? 'ri-loader-4-line minimap-spinner' : 'ri-arrow-up-s-line'" />
    </button>
    <span v-else class="minimap-page-placeholder" aria-hidden="true" />

    <nav class="minimap-track" aria-label="对话轮次">
      <button
        v-for="item in renderedItems"
        :key="item.userMessageId"
        type="button"
        class="minimap-item"
        :class="[
          { 'is-active': item.userMessageId === activeId, 'is-near-top': item.isNearTop, 'is-near-bottom': item.isNearBottom },
          item.summaryState ? `is-${item.summaryState}` : '',
        ]"
        :style="[{ top: item.position }, item.visualStyle]"
        :aria-current="item.userMessageId === activeId ? 'true' : undefined"
        :aria-label="itemAriaLabel(item)"
        @click="emit('select', item)">
        <span class="minimap-item-visual" aria-hidden="true">
          <span class="minimap-question-line" />
          <span class="minimap-summary-line" />
          <span class="minimap-summary-line minimap-summary-line-short" />
        </span>

        <span class="minimap-tooltip" role="tooltip">
          <!-- 指向节点的小三角 -->
          <span class="minimap-tooltip-caret" aria-hidden="true" />
          <span class="minimap-tooltip-meta">
            <i class="ri-user-3-line" />
            {{ roundLabel(item) }}
          </span>
          <span class="minimap-tooltip-question">{{ item.questionFull || item.question }}</span>
          <span class="minimap-tooltip-summary" :class="{ 'is-empty': !item.summary }">
            <i v-if="item.summaryState === 'streaming'" class="ri-loader-4-line minimap-spinner" />
            <i v-else-if="item.summaryState === 'error'" class="ri-error-warning-line" />
            <i v-else-if="item.summaryState === 'cancelled'" class="ri-close-circle-line" />
            <i v-else class="ri-sparkling-line" />
            <span>{{ summaryLabel(item) }}</span>
          </span>
        </span>
      </button>
    </nav>

    <button
      v-if="canShowNewer"
      type="button"
      class="minimap-page minimap-page-down"
      title="显示更新的问答"
      aria-label="显示更新的问答"
      @click="emit('show-newer')">
      <i class="ri-arrow-down-s-line" />
    </button>
    <span v-else class="minimap-page-placeholder" aria-hidden="true" />
  </aside>
</template>

<style scoped>
.chat-minimap-nav {
  --minimap-bg: var(--ui-bg-2);
  --minimap-border: var(--ui-border-card);
  --minimap-main: var(--ui-text-main);
  --minimap-subtle: var(--ui-text-aux);
  --minimap-hover: var(--ui-bg-3);
  --minimap-active: var(--ui-brand-400);
  position: absolute;
  z-index: 12;
  top: 50%;
  right: 10px;
  display: flex;
  width: 38px;
  height: min(360px, 75%, calc(100% - 24px));
  min-height: 0;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 5px 4px;
  border: 1px solid color-mix(in srgb, var(--minimap-border) 82%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--minimap-bg) 88%, transparent);
  box-shadow: 0 8px 22px rgba(20, 24, 46, 0.08);
  backdrop-filter: blur(12px) saturate(1.06);
  transform: translateY(-50%);
}

.is-dark.chat-minimap-nav {
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22);
}

.minimap-track {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: 1;
}

.minimap-track::before {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 1px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--minimap-border) 78%, transparent);
  content: '';
  transform: translateX(-50%);
}

.minimap-item {
  position: absolute;
  left: 50%;
  display: flex;
  width: 30px;
  height: 17px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  padding: 2px 3px;
  background: transparent;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: background-color 150ms cubic-bezier(0.25, 1, 0.5, 1), transform 150ms cubic-bezier(0.25, 1, 0.5, 1);
}

.minimap-item:hover,
.minimap-item:focus-visible {
  z-index: 2;
  background: rgba(var(--ui-brand-400-rgb), 0.1);
  outline: none;
  transform: translate(-50%, -50%) scale(1.08);
}

.minimap-item:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--ui-brand-400-rgb), 0.62);
}

.minimap-item.is-active {
  z-index: 1;
  background: rgba(var(--ui-brand-400-rgb), 0.13);
}

.minimap-item.is-active::before {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: -3px;
  width: 2px;
  border-radius: 99px;
  background: var(--minimap-active);
  box-shadow: 0 0 8px rgba(var(--ui-brand-400-rgb), 0.48);
  content: '';
}

.minimap-item-visual {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 1.5px;
}

.minimap-question-line,
.minimap-summary-line {
  display: block;
  height: 2px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--minimap-main) 50%, transparent);
  transition: width 150ms cubic-bezier(0.25, 1, 0.5, 1), background-color 150ms cubic-bezier(0.25, 1, 0.5, 1), opacity 150ms cubic-bezier(0.25, 1, 0.5, 1);
}

.minimap-question-line {
  width: var(--question-line-width);
  background: color-mix(in srgb, var(--minimap-main) 66%, transparent);
}

.minimap-summary-line {
  width: var(--summary-line-width);
  opacity: var(--summary-line-opacity);
}

.minimap-summary-line-short {
  width: var(--summary-short-line-width);
  opacity: calc(var(--summary-line-opacity) * 0.74);
}

.minimap-item.is-active .minimap-question-line,
.minimap-item:hover .minimap-question-line,
.minimap-item:focus-visible .minimap-question-line {
  width: 100%;
  background: var(--minimap-active);
}

.minimap-item.is-active .minimap-summary-line,
.minimap-item:hover .minimap-summary-line,
.minimap-item:focus-visible .minimap-summary-line {
  background: color-mix(in srgb, var(--minimap-active) 76%, transparent);
  opacity: 0.86;
}

.minimap-item.is-streaming .minimap-summary-line {
  background: var(--ui-brand-400);
}

/* ---- Tooltip ---- */
.minimap-tooltip {
  position: absolute;
  top: 50%;
  right: calc(100% + 10px);
  display: flex;
  width: min(254px, calc(100cqw - 58px));
  min-width: 150px;
  flex-direction: column;
  gap: 5px;
  border: 1px solid var(--minimap-border);
  border-radius: 10px;
  padding: 9px 10px;
  color: var(--minimap-main);
  background: color-mix(in srgb, var(--minimap-bg) 96%, transparent);
  box-shadow: 0 11px 28px rgba(20, 24, 46, 0.14);
  backdrop-filter: blur(14px) saturate(1.08);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(4px);
  visibility: hidden;
  transition: opacity 150ms cubic-bezier(0.25, 1, 0.5, 1), transform 150ms cubic-bezier(0.25, 1, 0.5, 1), visibility 150ms linear;
}

.is-dark .minimap-tooltip {
  box-shadow: 0 13px 30px rgba(0, 0, 0, 0.28);
}

.minimap-item:hover .minimap-tooltip,
.minimap-item:focus-visible .minimap-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  visibility: visible;
}

/* near-top: tooltip 顶边贴齐 item 顶边，防止溢出容器顶部 */
.minimap-item.is-near-top .minimap-tooltip {
  top: 0;
  transform: translateX(4px);
}

.minimap-item.is-near-top:hover .minimap-tooltip,
.minimap-item.is-near-top:focus-visible .minimap-tooltip {
  transform: translateX(0);
}

/* near-bottom: tooltip 底边贴齐 item 底边，防止溢出容器底部 */
.minimap-item.is-near-bottom .minimap-tooltip {
  top: auto;
  bottom: 0;
  transform: translateX(4px);
}

.minimap-item.is-near-bottom:hover .minimap-tooltip,
.minimap-item.is-near-bottom:focus-visible .minimap-tooltip {
  transform: translateX(0);
}

/* ---- 指向节点的小三角 ---- */
/* 默认：tooltip 垂直居中于 item，三角也垂直居中 */
.minimap-tooltip-caret {
  position: absolute;
  top: 50%;
  right: -5px;
  width: 8px;
  height: 8px;
  border-top: 1px solid var(--minimap-border);
  border-right: 1px solid var(--minimap-border);
  border-bottom: none;
  border-left: none;
  background: color-mix(in srgb, var(--minimap-bg) 96%, transparent);
  transform: translateY(-50%) rotate(45deg);
  pointer-events: none;
}

/* near-top: tooltip top:0 贴 item 顶边，节点中心 = item 高度 17px / 2 = 8.5px */
.minimap-item.is-near-top .minimap-tooltip-caret {
  top: 8.5px;
  transform: rotate(45deg);
}

/* near-bottom: tooltip bottom:0 贴 item 底边，节点中心从底部算 8.5px */
.minimap-item.is-near-bottom .minimap-tooltip-caret {
  top: auto;
  bottom: 8.5px;
  transform: rotate(45deg);
}

/* ---- Tooltip 内容 ---- */
.minimap-tooltip-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--minimap-active);
  font-size: 9px;
  font-weight: 650;
  line-height: 1.2;
}

.minimap-tooltip-question {
  display: -webkit-box;
  overflow: hidden;
  color: var(--minimap-main);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.45;
  text-align: left;
  text-wrap: pretty;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.minimap-tooltip-summary {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 4px;
  color: var(--minimap-subtle);
  font-size: 10px;
  line-height: 1.4;
  text-align: left;
}

.minimap-tooltip-summary > i {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--ui-agent-400);
  font-size: 11px;
}

.minimap-tooltip-summary > span {
  display: -webkit-box;
  overflow: hidden;
  text-wrap: pretty;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.minimap-tooltip-summary.is-empty {
  color: color-mix(in srgb, var(--minimap-subtle) 78%, transparent);
}

.minimap-tooltip-summary.is-empty > i {
  color: var(--minimap-subtle);
}

/* ---- 翻页按钮 ---- */
.minimap-page,
.minimap-page-placeholder {
  display: inline-flex;
  width: 20px;
  height: 20px;
  min-height: 20px;
  align-items: center;
  justify-content: center;
}

.minimap-page {
  border: 0;
  border-radius: 7px;
  color: var(--minimap-subtle);
  background: transparent;
  cursor: pointer;
  transition: color 140ms cubic-bezier(0.25, 1, 0.5, 1), background-color 140ms cubic-bezier(0.25, 1, 0.5, 1), transform 140ms cubic-bezier(0.25, 1, 0.5, 1);
}

.minimap-page > i {
  font-size: 15px;
}

.minimap-page:hover:not(:disabled) {
  color: var(--minimap-active);
  background: rgba(var(--ui-brand-400-rgb), 0.1);
}

.minimap-page:active:not(:disabled) {
  transform: scale(0.93);
}

.minimap-page:focus-visible {
  outline: 2px solid rgba(var(--ui-brand-400-rgb), 0.72);
  outline-offset: 2px;
}

.minimap-page:disabled {
  cursor: wait;
  opacity: 0.7;
}

.minimap-spinner {
  animation: minimap-spin 760ms linear infinite;
}

@keyframes minimap-spin {
  to { transform: rotate(360deg); }
}

@container chat-area (max-width: 520px) {
  .chat-minimap-nav {
    right: 6px;
    width: 34px;
    padding-right: 3px;
    padding-left: 3px;
  }

  .minimap-item {
    width: 27px;
  }

  .minimap-tooltip {
    right: calc(100% + 7px);
    width: min(228px, calc(100cqw - 50px));
  }
}

@media (max-height: 640px) {
  .chat-minimap-nav {
    height: min(286px, 75%, calc(100% - 16px));
    min-height: 0;
    gap: 3px;
    padding-top: 3px;
    padding-bottom: 3px;
  }

  .minimap-page,
  .minimap-page-placeholder {
    width: 18px;
    height: 18px;
    min-height: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .minimap-item,
  .minimap-question-line,
  .minimap-summary-line,
  .minimap-tooltip,
  .minimap-page {
    transition-duration: 1ms;
  }

  .minimap-spinner {
    animation: none;
  }
}
</style>