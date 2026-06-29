<script setup>
const props = defineProps({
  msg: Object,
  isDark: Boolean,
  isStreaming: Boolean,
})

const emit = defineEmits(['copy', 'edit', 'delete-request', 'retry', 'copy-md'])

const isUser = props.msg.role === 'user'
const isAssistant = props.msg.role === 'assistant'
const isError = props.msg.status === 'error'

function copyMessage() {
  const text = props.msg.content || ''
  navigator.clipboard.writeText(text).catch(() => {})
  emit('copy')
}

function copyMarkdown() {
  const text = props.msg.content || ''
  navigator.clipboard.writeText(text).catch(() => {})
  emit('copy-md')
}
</script>

<template>
  <div class="msg-actions opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5"
    :class="isDark ? 'bg-d3 border border-d4' : 'bg-l2 border border-bdrF'"
    style="position:absolute;top:-8px;right:0;border-radius:8px;padding:2px 4px;z-index:10">
    <button @click="copyMessage" title="复制"
      class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
      <i class="ri-file-copy-line text-[12px]" />
    </button>
    <!-- Copy Markdown source (assistant only) -->
    <button v-if="isAssistant" @click="copyMarkdown" title="复制 Markdown"
      class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
      <i class="ri-markdown-line text-[12px]" />
    </button>
    <!-- Edit (user messages only) -->
    <button v-if="isUser" @click="emit('edit')" title="编辑"
      class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
      <i class="ri-edit-line text-[12px]" />
    </button>
    <!-- Retry (error or assistant messages) -->
    <button v-if="isError || isAssistant" @click="emit('retry')" title="重试"
      class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-brand-400 hover:bg-brand-400/8' : 'text-lt-aux hover:text-brand-500 hover:bg-brand-50'">
      <i class="ri-refresh-line text-[12px]" />
    </button>
    <!-- Delete (two-step: emit delete-request first) -->
    <button @click="emit('delete-request')" title="删除"
      class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
      :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/8' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
      <i class="ri-delete-bin-line text-[12px]" />
    </button>
  </div>
</template>