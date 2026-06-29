<script setup>
/**
 * NotePreview — Rendered markdown content area with dark/light themes,
 * mini header label, and polished empty state.
 */
import { computed, watch } from 'vue'
import md from '@/utils/markdown'

let katexCssLoaded = false
function ensureKatexCss() {
  if (katexCssLoaded) return
  katexCssLoaded = true
  import('katex/dist/katex.min.css').catch((e) => console.warn('[notes] load katex css failed:', e))
}

const props = defineProps({
  content: { type: String, default: '' },
  isDark: { type: Boolean, default: true },
  showHeader: { type: Boolean, default: false },
  headerLabel: { type: String, default: '预览' },
  headerIcon: { type: String, default: 'ri-eye-line' },
  compact: { type: Boolean, default: false },
})

const html = computed(() => {
  if (!props.content) return ''
  if (/\$/.test(props.content)) ensureKatexCss()
  return md.render(props.content)
})

watch(() => props.content, (v) => { if (v && /\$/.test(v)) ensureKatexCss() }, { immediate: true })
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden min-w-0">
    <!-- Mini header -->
    <div v-if="showHeader" class="h-9 flex items-center px-2 gap-1.5 shrink-0"
      :class="isDark ? 'bg-d4 border-b border-bdr' : 'bg-l4 border-b border-bdrF'">
      <!-- Label slot (split mode) -->
      <slot name="label" />
      <i :class="[headerIcon, 'text-[12px]', isDark ? 'text-wt-aux' : 'text-lt-aux']" />
      <span class="text-[11px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">{{ headerLabel }}</span>
    </div>
    <!-- Content -->
    <div class="flex-1 overflow-y-auto thin-scroll">
      <div v-if="content" class="note-preview max-w-3xl mx-auto"
        :class="[isDark ? 'note-preview-dark' : 'note-preview-light', compact ? 'p-2' : 'p-3']">
        <div v-html="html" />
      </div>
      <div v-else class="flex flex-col items-center justify-center h-full gap-3">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center"
          :class="isDark ? 'bg-d4 border border-bdr' : 'bg-l4 border border-bdrF'">
         <i :class="[headerIcon, 'text-[20px]', isDark ? 'text-wt-dim' : 'text-lt-aux']" />
        </div>
        <p class="text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">笔记内容为空</p>
        <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">切换到编辑模式开始书写</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08) }
.thin-scroll::-webkit-scrollbar { width: 5px }
.thin-scroll::-webkit-scrollbar-track { background: transparent }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25) }

.note-preview-dark { color: #e8e8ed }
.note-preview-light { color: #1a1a2e }
.note-preview h1 { font-size: 24px; font-weight: 700; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #353542 }
.note-preview-light h1 { border-bottom-color: #dddcd9 }
.note-preview h2 { font-size: 20px; font-weight: 600; margin: 16px 0 10px }
.note-preview h3 { font-size: 16px; font-weight: 600; margin: 14px 0 8px }
.note-preview h4 { font-size: 14px; font-weight: 600; margin: 12px 0 6px }
.note-preview h5 { font-size: 13px; font-weight: 600; margin: 10px 0 6px }
.note-preview h6 { font-size: 12px; font-weight: 600; margin: 10px 0 4px; opacity: .7 }
.note-preview p { margin: 8px 0; line-height: 1.7 }
.note-preview ul, .note-preview ol { margin: 8px 0; padding-left: 24px }
.note-preview li { margin: 4px 0; line-height: 1.6 }
.note-preview blockquote { margin: 12px 0; padding: 10px 16px; border-left: 3px solid #6C8AFF; opacity: .85; border-radius: 0 4px 4px 0 }
.note-preview-light blockquote { border-left-color: #4A6CFF; background: rgba(74,108,255,0.04) }
.note-preview-dark blockquote { background: rgba(108,138,255,0.06) }
.note-preview code { font-family: 'Menlo','Consolas','Monaco',monospace; font-size: 13px; padding: 2px 6px; border-radius: 4px }
.note-preview-dark code { background: rgba(108,138,255,0.08); color: #e8e8ed }
.note-preview-light code { background: rgba(74,108,255,0.06); color: #1a1a2e }
.note-preview pre { margin: 12px 0; padding: 16px; border-radius: 8px; overflow-x: auto }
.note-preview-dark pre { background: #0e0e12 }
.note-preview-light pre { background: #f8f7f6 }
.note-preview pre code { padding: 0; background: transparent; font-size: 13px; line-height: 1.6 }
.note-preview a { color: #6C8AFF; text-decoration: underline; text-underline-offset: 2px }
.note-preview-light a { color: #4A6CFF }
.note-preview hr { margin: 16px 0; border: none; border-top: 1px solid #353542 }
.note-preview-light hr { border-top-color: #dddcd9 }
.note-preview img { max-width: 100%; border-radius: 8px; margin: 12px 0 }
.note-preview table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px }
.note-preview th, .note-preview td { padding: 8px 12px; text-align: left; border: 1px solid #353542 }
.note-preview-light th, .note-preview-light td { border-color: #dddcd9 }
.note-preview-dark th { background: #1a1a22; font-weight: 600 }
.note-preview-light th { background: #f0efee; font-weight: 600 }
.note-preview input[type="checkbox"] { margin-right: 6px; accent-color: #6C8AFF }
.note-preview-light input[type="checkbox"] { accent-color: #4A6CFF }

/* KaTeX math styling */
.note-preview :deep(.math-block) { margin: 14px 0; padding: 12px; border-radius: 6px; overflow-x: auto; }
.note-preview-dark :deep(.math-block) { background: rgba(108,138,255,0.06) }
.note-preview-light :deep(.math-block) { background: rgba(74,108,255,0.04) }
.note-preview :deep(.katex) { font-size: 1.05em }
.note-preview :deep(.math-err) { color: #ef4444; background: rgba(239,68,68,0.08); padding: 2px 6px; border-radius: 4px }
</style>