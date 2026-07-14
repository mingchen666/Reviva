<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import MsModal from '@/components/MsModal/MsModal.vue'
import { useMessage } from '@/components/MsMessage/useMessage'
import { saveTextFile } from '@/electron'
import ExportMessageItem from './ExportMessageItem.vue'
import {
  buildConversationMarkdown,
  isMessageExportable,
  sanitizeMarkdownFileName,
} from '../chat/markdownExport'

const props = defineProps({
  show: Boolean,
  conversation: { type: Object, default: null },
  agents: { type: Array, default: () => [] },
  isDark: Boolean,
})

const emit = defineEmits(['update:show', 'exported'])
const toast = useMessage()
const messages = ref([])
const selectedIds = ref(new Set())
const loading = ref(false)
const loadError = ref('')
const exporting = ref(false)
const listRef = ref(null)
let loadSequence = 0

const defaultExportOptions = () => ({
  includeThinking: false,
  includeToolCalls: false,
  includeSubAgents: false,
  includeMetrics: false,
})
const exportOptions = ref(defaultExportOptions())
const advancedOptionItems = [
  { key: 'includeThinking', label: '思考过程' },
  { key: 'includeToolCalls', label: '工具调用详情' },
  { key: 'includeSubAgents', label: '子智能体结果' },
  { key: 'includeMetrics', label: 'Token / 耗时' },
]

const visible = computed({
  get: () => props.show,
  set: value => emit('update:show', value),
})

const selectableMessages = computed(() => messages.value.filter(message => messageSelectable(message)))
const selectedCount = computed(() => selectedIds.value.size)
const selectedMessages = computed(() => messages.value.filter(message => selectedIds.value.has(message.id) && messageSelectable(message)))
const agentNameMap = computed(() => new Map(props.agents.map(agent => [agent.id, agent.name])))
const exportButtonLabel = computed(() => exporting.value ? '导出中...' : `导出 ${selectedCount.value} 条消息`)

const rowVirtualizer = useVirtualizer(computed(() => ({
  count: messages.value.length,
  getScrollElement: () => listRef.value,
  estimateSize: () => 116,
  overscan: 6,
  getItemKey: index => messages.value[index]?.id || index,
})))

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const virtualHeight = computed(() => rowVirtualizer.value.getTotalSize())

function agentName(message) {
  return agentNameMap.value.get(message?.meta?.agentId) || 'AI'
}

function isSelected(messageId) {
  return selectedIds.value.has(messageId)
}

function messageSelectable(message, options = exportOptions.value) {
  return isMessageExportable(message, options)
}

function replaceSelection(items) {
  selectedIds.value = new Set(items.filter(message => messageSelectable(message)).map(message => message.id))
}

function toggleMessage(messageId) {
  const next = new Set(selectedIds.value)
  if (next.has(messageId)) next.delete(messageId)
  else next.add(messageId)
  selectedIds.value = next
}

function selectAll() {
  replaceSelection(selectableMessages.value)
}

function selectRole(role) {
  replaceSelection(messages.value.filter(message => message.role === role))
}

function clearSelection() {
  selectedIds.value = new Set()
}

function updateExportOption(key, checked) {
  const previous = exportOptions.value
  const nextOptions = { ...previous, [key]: checked }
  const nextSelection = new Set(selectedIds.value)
  for (const message of messages.value) {
    const wasSelectable = messageSelectable(message, previous)
    const isSelectable = messageSelectable(message, nextOptions)
    if (!isSelectable) nextSelection.delete(message.id)
    else if (!wasSelectable) nextSelection.add(message.id)
  }
  exportOptions.value = nextOptions
  selectedIds.value = nextSelection
}

function measureRow(element) {
  if (element) rowVirtualizer.value.measureElement(element)
}

function close() {
  if (!exporting.value) visible.value = false
}

async function loadMessages() {
  const conversationId = props.conversation?.id
  if (!conversationId) return
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = ''
  messages.value = []
  selectedIds.value = new Set()
  try {
    if (!window.electronAPI?.db?.msgs?.list) throw new Error('MESSAGE_API_UNAVAILABLE')
    const result = await window.electronAPI.db.msgs.list(conversationId)
    if (sequence !== loadSequence) return
    messages.value = Array.isArray(result) ? result : []
    selectAll()
    await nextTick()
    rowVirtualizer.value.scrollToOffset(0)
    rowVirtualizer.value.measure()
  } catch (error) {
    if (sequence !== loadSequence) return
    console.error('[ConversationExport] Failed to load messages:', error)
    loadError.value = '读取对话消息失败'
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function exportMarkdown() {
  if (!selectedMessages.value.length || exporting.value) return
  exporting.value = true
  try {
    const exportedAt = new Date()
    const markdown = buildConversationMarkdown({
      conversation: props.conversation,
      messages: selectedMessages.value,
      agents: props.agents,
      exportedAt,
      options: exportOptions.value,
    })
    const result = await saveTextFile({
      title: '导出 Markdown',
      defaultPath: sanitizeMarkdownFileName(props.conversation?.title, exportedAt),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultExtension: 'md',
      encoding: 'utf-8',
    }, markdown)
    if (result?.canceled) return
    if (!result?.success) throw new Error(result?.error || 'EXPORT_WRITE_FAILED')
    toast.success('Markdown 已导出')
    emit('exported', { path: result.path, messageCount: selectedMessages.value.length, options: { ...exportOptions.value } })
    visible.value = false
  } catch (error) {
    console.error('[ConversationExport] Failed to export:', error)
    toast.error('导出失败，请检查保存位置后重试')
  } finally {
    exporting.value = false
  }
}

watch(
  () => [props.show, props.conversation?.id],
  ([show, conversationId]) => {
    if (show && conversationId) {
      exportOptions.value = defaultExportOptions()
      loadMessages()
    }
    if (!show) {
      loadSequence += 1
      messages.value = []
      selectedIds.value = new Set()
      loadError.value = ''
      exportOptions.value = defaultExportOptions()
    }
  },
  { immediate: true },
)
</script>

<template>
  <MsModal v-model:show="visible" :width="920" max-height="88vh"
    :show-footer="false" :closable="!exporting" :close-on-overlay="!exporting">
    <template #header>
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">
          <i class="ri-markdown-line text-[16px]" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <h3 class="text-[14px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">导出对话</h3>
            <span v-if="messages.length" class="text-[10.5px] tabular-nums shrink-0"
              :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ messages.length }} 条消息</span>
          </div>
          <p class="mt-0.5 text-[10.5px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ conversation?.title }}</p>
        </div>
      </div>
    </template>

    <div class="h-[min(70vh,650px)] min-h-[420px] flex flex-col gap-3">
      <div class="shrink-0 flex items-center gap-2 flex-wrap">
        <button type="button" @click="selectAll"
          class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35"
          :class="isDark ? 'bg-white/5 text-wt-sub hover:bg-white/9' : 'bg-l3 text-lt-sub hover:bg-l4'">全选</button>
        <button type="button" @click="selectRole('user')"
          class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35"
          :class="isDark ? 'bg-white/5 text-wt-sub hover:bg-white/9' : 'bg-l3 text-lt-sub hover:bg-l4'">仅用户</button>
        <button type="button" @click="selectRole('assistant')"
          class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35"
          :class="isDark ? 'bg-white/5 text-wt-sub hover:bg-white/9' : 'bg-l3 text-lt-sub hover:bg-l4'">仅 AI</button>
        <button type="button" @click="clearSelection"
          class="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'">清空</button>
        <span class="ml-auto text-[11px] font-medium tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">已选择 {{ selectedCount }} / {{ selectableMessages.length }}</span>
      </div>

      <div class="shrink-0 rounded-lg border px-3 py-2.5"
        :class="isDark ? 'bg-d2/45 border-d4' : 'bg-l2 border-bdrF'">
        <div class="flex items-baseline gap-2">
          <span class="text-[11px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">附加内容</span>
          <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">默认不导出</span>
        </div>
        <div class="mt-1.5 grid grid-cols-4 gap-x-2">
          <label v-for="item in advancedOptionItems" :key="item.key"
            class="export-option-label grid grid-cols-[14px_minmax(0,1fr)] items-center gap-1.5 min-h-7 px-1.5 rounded-md text-[11px] select-none transition-colors"
            :class="[
              exporting ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
              isDark
                ? (exporting ? 'text-wt-aux' : 'text-wt-aux hover:bg-white/5')
                : (exporting ? 'text-lt-aux' : 'text-lt-aux hover:bg-l3/80'),
            ]">
            <input type="checkbox" class="export-option-checkbox block m-0 h-3.5 w-3.5 shrink-0"
              :checked="exportOptions[item.key]"
              :disabled="exporting"
              @change="updateExportOption(item.key, $event.target.checked)">
            <span class="min-w-0 leading-none whitespace-nowrap">{{ item.label }}</span>
          </label>
        </div>
        <p class="mt-1.5 text-[10px] leading-[1.55]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          附加内容可能包含内部路径或工具返回数据，分享导出文件前请先检查。
        </p>
      </div>

      <div ref="listRef" class="relative flex-1 min-h-0 overflow-y-auto thin-scroll pr-1">
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <i class="ri-loader-4-line animate-spin text-[22px] text-brand-400" />
            <p class="mt-2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">正在读取全部消息...</p>
          </div>
        </div>

        <div v-else-if="loadError" class="absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <i class="ri-error-warning-line text-[24px]" :class="isDark ? 'text-red-400' : 'text-red-500'" />
            <p class="mt-2 text-[13px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ loadError }}</p>
            <button type="button" @click="loadMessages" class="mt-3 h-8 px-3 rounded-lg text-[12px] font-medium bg-brand-500 text-white hover:bg-brand-600">重新加载</button>
          </div>
        </div>

        <div v-else-if="!messages.length" class="absolute inset-0 flex items-center justify-center">
          <div class="text-center">
            <i class="ri-chat-off-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
            <p class="mt-2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">这个对话还没有可导出的消息</p>
          </div>
        </div>

        <div v-else class="relative w-full" :style="{ height: virtualHeight + 'px' }">
          <div v-for="row in virtualRows" :key="row.key" :data-index="row.index" :ref="measureRow"
            class="absolute left-0 right-0 pb-2 will-change-transform"
            :style="{ transform: `translateY(${row.start}px)` }">
            <ExportMessageItem
              :message="messages[row.index]"
              :selected="isSelected(messages[row.index].id)"
              :selectable="messageSelectable(messages[row.index])"
              :agent-name="agentName(messages[row.index])"
              :options="exportOptions"
              :is-dark="isDark"
              @toggle="toggleMessage" />
          </div>
        </div>
      </div>

      <div class="shrink-0 flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-3 pt-3 border-t"
        :class="isDark ? 'border-d4' : 'border-bdrL'">
        <span class="text-[11px] xs:text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">导出后可在系统窗口修改文件名和保存位置</span>
        <div class="w-full xs:w-auto xs:ml-auto flex items-center justify-end gap-2">
          <button type="button" @click="close" :disabled="exporting"
            class="h-8 px-3 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/35"
            :class="isDark ? 'text-wt-sub hover:bg-white/6' : 'text-lt-sub hover:bg-l3'">取消</button>
          <button type="button" @click="exportMarkdown" :disabled="!selectedCount || exporting"
            class="h-8 min-w-[116px] px-3.5 rounded-lg text-[12px] font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/45 focus-visible:ring-offset-2"
            :class="isDark ? 'focus-visible:ring-offset-d3' : 'focus-visible:ring-offset-l1'">
            <i :class="exporting ? 'ri-loader-4-line animate-spin' : 'ri-download-line'" class="text-[13px]" />
            {{ exportButtonLabel }}
          </button>
        </div>
      </div>
    </div>
  </MsModal>
</template>

<style scoped>
.export-option-checkbox {
  accent-color: var(--brand, #4A6CFF);
}

.export-option-label:focus-within {
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb, 74, 108, 255), 0.22);
}
</style>
