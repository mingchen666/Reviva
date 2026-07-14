<script setup>
import { computed } from 'vue'
import {
  formatExportMessageTime,
  getMessageAttachments,
  messagePreviewText,
} from '../chat/markdownExport'

const props = defineProps({
  message: { type: Object, required: true },
  selected: Boolean,
  selectable: Boolean,
  agentName: { type: String, default: 'AI' },
  options: { type: Object, default: () => ({}) },
  isDark: Boolean,
})

const emit = defineEmits(['toggle'])

const isUser = computed(() => props.message?.role === 'user')
const roleLabel = computed(() => isUser.value ? '用户' : props.agentName || 'AI')
const preview = computed(() => messagePreviewText(props.message, props.options))
const time = computed(() => formatExportMessageTime(props.message?.createdAt))
const attachments = computed(() => getMessageAttachments(props.message))
const visibleAttachments = computed(() => attachments.value.slice(0, 2))

function attachmentName(item) {
  return String(item?.name || item?.title || item?.path || '未命名附件').split(/[\\/]/).pop()
}

function attachmentIcon(item) {
  const type = String(item?.type || '').toLowerCase()
  if (type === 'image' || String(item?.dataUrl || '').startsWith('data:image/')) return 'ri-image-line'
  if (type === 'cloud_doc') return 'ri-file-text-line'
  if (type === 'cloud_kb' || type === 'kb') return 'ri-book-open-line'
  return 'ri-attachment-2'
}

function toggle() {
  if (props.selectable) emit('toggle', props.message.id)
}
</script>

<template>
  <button type="button"
    class="export-message-button w-full min-h-[104px] rounded-xl border px-3 py-2.5 text-left flex items-start gap-3 transition-colors focus:outline-none"
    :class="[
      selected
        ? ''
        : (isDark ? 'bg-d2/55 border-d4 hover:bg-d2 hover:border-white/12' : 'bg-l2 border-bdrF hover:bg-l3 hover:border-bdrL'),
      selectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-55',
    ]"
    :style="selected ? {
      backgroundColor: `rgba(var(--brand-rgb, 74, 108, 255), ${isDark ? 0.1 : 0.07})`,
      borderColor: `rgba(var(--brand-rgb, 74, 108, 255), ${isDark ? 0.35 : 0.3})`,
    } : undefined"
    :aria-pressed="selected"
    :aria-disabled="!selectable"
    :disabled="!selectable"
    @click="toggle">
    <span class="mt-1 h-5 w-5 rounded-full border flex items-center justify-center shrink-0 transition-colors"
      :class="selected
        ? 'text-white'
        : (isDark ? 'border-wt-dim/60 text-transparent' : 'border-lt-aux/60 text-transparent')"
      :style="selected ? {
        backgroundColor: 'var(--brand, #4A6CFF)',
        borderColor: 'var(--brand, #4A6CFF)',
      } : undefined">
      <i class="ri-check-line text-[13px]" />
    </span>

    <span class="mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0"
      :class="isUser
        ? 'bg-brand-500/12 text-brand-400'
        : (isDark ? 'bg-agent-400/12 text-agent-400' : 'bg-agent-50 text-agent-500')">
      <i :class="isUser ? 'ri-user-3-line' : 'ri-robot-2-line'" class="text-[13px]" />
    </span>

    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-2 min-w-0">
        <span class="text-[12px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ roleLabel }}</span>
        <span v-if="time" class="text-[10px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ time }}</span>
        <span v-if="!selectable" class="ml-auto text-[10px] shrink-0" :class="isDark ? 'text-amber-400' : 'text-amber-600'">暂不可导出</span>
      </span>
      <span class="export-message-preview block mt-1 text-[12px] leading-[1.55]"
        :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ preview }}</span>
      <span v-if="attachments.length" class="mt-1.5 flex items-center gap-1.5 min-w-0 overflow-hidden">
        <span v-for="item in visibleAttachments" :key="item.id || item.path || item.name"
          class="inline-flex items-center gap-1 min-w-0 max-w-[180px] rounded-md px-1.5 py-0.5 text-[10px]"
          :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">
          <i :class="attachmentIcon(item)" class="text-[10px] shrink-0" />
          <span class="truncate">{{ attachmentName(item) }}</span>
        </span>
        <span v-if="attachments.length > visibleAttachments.length" class="text-[10px] shrink-0"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">+{{ attachments.length - visibleAttachments.length }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped>
.export-message-button:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--brand-rgb, 74, 108, 255), 0.5);
}

.export-message-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
</style>
