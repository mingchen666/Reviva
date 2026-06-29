<script setup>
/**
 * NoteEmptyState — Hero + stats + features overview shown when no note is selected.
 */
import { computed } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useAppStore } from '@/stores/app'

const notesStore = useNotesStore()
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const features = [
  { icon: 'ri-edit-line', color: 'text-brand-400', text: '编辑/预览/分屏三种模式自由切换' },
  { icon: 'ri-folder-3-line', color: 'text-amber-400', text: '文件夹嵌套分组，右键快速操作' },
  { icon: 'ri-save-line', color: 'text-emerald-400', text: '内容自动保存，实时状态反馈' },
  { icon: 'ri-tools-line', color: 'text-agent-400', text: '工具栏快捷插入 Markdown 语法' },
]
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden" :class="isDark ? 'bg-d2' : 'bg-l2'">
    <div class="h-10 flex items-center px-5 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2">
        <i class="ri-note-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" />
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">笔记 · 总览</span>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto thin-scroll">
      <div class="max-w-4xl mx-auto px-8 py-10 fade-up">
        <!-- Hero -->
        <div class="flex items-start gap-4 mb-8">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-gradient-to-br from-brand-400/20 to-emerald-400/10 border border-brand-400/20' : 'bg-gradient-to-br from-brand-50 to-emerald-50 border border-brand-100'">
            <i class="ri-booklet-line text-[26px] text-brand-400" />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-[20px] font-bold mb-1" :class="isDark ? 'text-wt-main' : 'text-lt-main'">Markdown 笔记</h1>
            <p class="text-[13px] leading-relaxed" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">创建和管理你的 Markdown 笔记，支持文件夹分组、实时预览和编辑/预览/分屏三种模式。</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3 mb-8">
          <div class="stat-card rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-1.5 mb-1.5"><i class="ri-note-line text-brand-400 text-[12px]" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">总笔记</span></div>
            <div class="text-[22px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ notesStore.totalNotes }}</div>
          </div>
          <div class="stat-card rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-1.5 mb-1.5"><i class="ri-folder-3-line text-amber-400 text-[12px]" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">文件夹</span></div>
            <div class="text-[22px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ notesStore.totalFolders }}</div>
          </div>
          <div class="stat-card rounded-xl p-3.5" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-1.5 mb-1.5"><i class="ri-markdown-line text-emerald-400 text-[12px]" /><span class="text-[10px] font-medium" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">格式</span></div>
            <div class="text-[22px] font-bold leading-none" :class="isDark ? 'text-wt-main' : 'text-lt-main'">MD</div>
            <div class="text-[10px] mt-1.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">Markdown 格式</div>
          </div>
        </div>

        <!-- Features -->
        <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 rounded-full bg-brand-400" />
            <span class="section-title" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">功能特性</span>
          </div>
          <div class="space-y-2.5">
            <div v-for="f in features" :key="f.icon"
              class="flex items-center gap-2.5 text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              <i :class="[f.icon, f.color]" class="text-[14px]" />
              <span>{{ f.text }}</span>
            </div>
          </div>
        </div>

        <div class="mt-6 text-center text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-arrow-left-line text-[12px] mr-1" />从左侧选择笔记，或点击「新建笔记」开始书写
        </div>
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
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em }
</style>