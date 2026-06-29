<script setup>
import { ref, computed } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useAppStore } from '@/stores/app'
import MsTreeItem from '@/components/MsTreeItem/MsTreeItem.vue'
import FolderTreeItem from './FolderTreeItem.vue'

const notesStore = useNotesStore()
const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const props = defineProps({
  showAiConfig: { type: Boolean, default: false },
})
const emit = defineEmits(['open-ai-config'])

const aiConfigured = computed(() => !!notesStore.aiSettings.noteProviderId && !!notesStore.aiSettings.noteModelId)

const searchQuery = ref('')
const showNewFolderModal = ref(false)
const newFolderName = ref('')
const newFolderParent = ref('')

// ─── Context menu ───
const ctx = ref(null) // { type, x, y, folderId|noteId, name }

// ─── Enriched tree ───
const enrichedTree = computed(() => enrichTree(notesStore.folderTree))
function enrichTree(nodes) {
  return nodes.map(node => ({
    ...node,
    _notes: notesStore.notes.filter(n => n.folder_id === node.id),
    children: enrichTree(node.children || []),
  }))
}

const filteredTree = computed(() => {
  if (!searchQuery.value) return enrichedTree.value
  const q = searchQuery.value.toLowerCase()
  return filterTree(enrichedTree.value, q)
})
function filterTree(nodes, q) {
  const result = []
  for (const node of nodes) {
    const childMatch = filterTree(node.children || [], q)
    const noteMatch = node._notes.filter(n => n.title.toLowerCase().includes(q))
    const selfMatch = node.name.toLowerCase().includes(q)
    if (selfMatch || childMatch.length || noteMatch.length) {
      result.push({ ...node, children: childMatch, _notes: noteMatch, expanded: true })
    }
  }
  return result
}

const rootNotes = computed(() => {
  const list = notesStore.notes.filter(n => !n.folder_id || n.folder_id === '')
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter(n => n.title.toLowerCase().includes(q))
})

// ─── Actions ───
function selectFolder(id) { notesStore.setCurrentFolder(id) }
function toggleFolder(id) { notesStore.toggleFolderExpand(id) }
function selectNote(id) { notesStore.setCurrentNote(id) }

async function createFolder() {
  if (!newFolderName.value.trim()) return
  await notesStore.addFolder({ parent_id: newFolderParent.value, name: newFolderName.value.trim() })
  newFolderName.value = ''
  showNewFolderModal.value = false
  if (newFolderParent.value) notesStore.toggleFolderExpand(newFolderParent.value)
}

async function createNote() {
  const folderId = notesStore.currentFolderId || ''
  await notesStore.addNote({ folder_id: folderId, title: '新笔记', content: '' })
  if (folderId) notesStore.toggleFolderExpand(folderId)
}

async function createNoteInFolder(folderId) {
  await notesStore.addNote({ folder_id: folderId, title: '新笔记', content: '' })
  notesStore.toggleFolderExpand(folderId)
  closeCtx()
}

// ─── Context Menu ───
function onFolderCtx(e, folderId, name) {
  ctx.value = { type: 'folder', x: e.clientX, y: e.clientY, folderId, name }
}
function onNoteCtx(e, noteId, noteTitle) {
  ctx.value = { type: 'note', x: e.clientX, y: e.clientY, noteId, noteTitle }
}
function onRootNoteCtx(e, note) {
  e.preventDefault()
  ctx.value = { type: 'note', x: e.clientX, y: e.clientY, noteId: note.id, noteTitle: note.title }
}
function onRootCtx(e) {
  e.preventDefault()
  ctx.value = { type: 'root', x: e.clientX, y: e.clientY }
}
function closeCtx() { ctx.value = null }

// ─── Rename ───
const showRenameModal = ref(false)
const renameValue = ref('')
const renameTarget = ref(null)

function startRename() {
  if (!ctx.value) return
  renameTarget.value = {
    type: ctx.value.type,
    id: ctx.value.type === 'folder' ? ctx.value.folderId : ctx.value.noteId,
    name: ctx.value.type === 'folder' ? ctx.value.name : ctx.value.noteTitle,
  }
  renameValue.value = renameTarget.value.name
  showRenameModal.value = true
  closeCtx()
}

async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  if (renameTarget.value.type === 'folder') {
    await notesStore.updateFolder(renameTarget.value.id, { name: renameValue.value.trim() })
  } else {
    await notesStore.updateNote(renameTarget.value.id, { title: renameValue.value.trim() })
  }
  showRenameModal.value = false
  renameTarget.value = null
}

// ─── Delete ───
const showDeleteModal = ref(false)
const deleteTarget = ref(null)

function startDelete() {
  if (!ctx.value) return
  deleteTarget.value = {
    type: ctx.value.type,
    id: ctx.value.type === 'folder' ? ctx.value.folderId : ctx.value.noteId,
    name: ctx.value.type === 'folder' ? ctx.value.name : ctx.value.noteTitle,
  }
  showDeleteModal.value = true
  closeCtx()
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  if (deleteTarget.value.type === 'folder') {
    await notesStore.deleteFolder(deleteTarget.value.id)
  } else {
    await notesStore.deleteNote(deleteTarget.value.id)
  }
  showDeleteModal.value = false
  deleteTarget.value = null
}

function openNewFolderModal(parentId = '') {
  newFolderParent.value = parentId
  newFolderName.value = ''
  showNewFolderModal.value = true
  closeCtx()
}

defineExpose({ createNote })
</script>

<template>
  <div class="h-full flex flex-col" :class="isDark ? 'bg-d1' : 'bg-l1'">

    <!-- Header -->
    <div class="h-12 flex items-center justify-between px-4 shrink-0"
      :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-baseline gap-2">
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">笔记</span>
        <span class="text-[11px] font-medium tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ notesStore.totalNotes }} 篇</span>
      </div>
      <button @click="emit('open-ai-config')"
        :title="aiConfigured ? 'AI 已就绪 · 点击切换模型' : '配置 AI 助手'"
        class="w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer relative"
        :class="aiConfigured
          ? (isDark ? 'text-agent-400 bg-agent-400/10 hover:bg-agent-400/18' : 'text-agent-500 bg-violet-50 hover:bg-violet-100')
          : (isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d3' : 'text-lt-aux hover:text-lt-sub hover:bg-l4')">
        <i :class="aiConfigured ? 'ri-magic-line' : 'ri-settings-3-line'" class="text-[13px]" />
        <span v-if="aiConfigured" class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
      </button>
    </div>

    <!-- Search -->
    <div class="px-3 pt-2.5 pb-2 shrink-0">
      <div class="relative flex item-center">
        <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] pointer-events-none" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
        <input v-model="searchQuery" type="text" placeholder="搜索笔记..."
          class="w-full h-8 rounded-lg py-0 pl-7 pr-2 text-[12px] outline-none transition-colors"
          :class="isDark ? 'bg-d2 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/50 focus:bg-d0' : 'bg-l2 border border-bdrL text-lt-sub placeholder-lt-aux focus:border-brand-400 focus:bg-white'" />
        <button v-if="searchQuery" @click="searchQuery = ''"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-d3' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'">
          <i class="ri-close-line text-[14px]" />
        </button>
      </div>
    </div>

    
    <!-- Tree area -->
    <div class="flex-1 overflow-y-auto px-2 pb-2 thin-scroll" @click="closeCtx">
      <!-- Root: all notes -->
      <MsTreeItem
        label="全部笔记"
        icon="ri-stack-line"
        :icon-color="!notesStore.currentFolderId ? (isDark ? 'text-brand-400' : 'text-brand-500') : (isDark ? 'text-wt-aux' : 'text-lt-aux')"
        :badge="notesStore.totalNotes"
        :active="!notesStore.currentFolderId"
        :level="0"
        :is-dark="isDark"
        :is-folder="true"
        @click="notesStore.setCurrentFolder(null)"
        @contextmenu="onRootCtx($event)"
      />

      <!-- Separator after "all notes" -->
      <div v-if="filteredTree.length || rootNotes.length" class="h-px mx-3 my-1.5" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />

      <!-- Folder tree (folders contain their own notes inside) -->
      <FolderTreeItem
        v-for="node in filteredTree" :key="node.id"
        :node="node" :is-dark="isDark"
        :active-folder-id="notesStore.currentFolderId || ''"
        :active-note-id="notesStore.currentNoteId || ''"
        :notes-in-folder="node._notes" :level="0"
        @select-folder="selectFolder"
        @toggle-folder="toggleFolder"
        @select-note="selectNote"
        @folder-contextmenu="onFolderCtx"
        @note-contextmenu="onNoteCtx"
      />

      <!-- Root-level notes (no folder) -->
      <template v-if="rootNotes.length">
        <div v-if="filteredTree.length" class="flex items-center gap-2 px-3 mt-2 mb-1">
          <span class="text-[10px] font-bold uppercase tracking-wider" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">未分类</span>
          <div class="h-px flex-1" :class="isDark ? 'bg-d4' : 'bg-bdrL'" />
        </div>
        <MsTreeItem
          v-for="note in rootNotes" :key="note.id"
          :label="note.title"
          icon="ri-markdown-line"
          :icon-color="isDark ? 'text-emerald-400' : 'text-emerald-500'"
          :active="notesStore.currentNoteId === note.id"
          :level="0"
          :is-dark="isDark"
          :is-folder="false"
          @click="selectNote(note.id)"
          @contextmenu="onRootNoteCtx($event, note)"
        />
      </template>

      <!-- Empty -->
      <div v-if="!filteredTree.length && !rootNotes.length" class="flex flex-col items-center justify-center py-10 gap-3 px-4">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center" :class="isDark ? 'bg-d3' : 'bg-l3'">
        <i 
  :class="[
    searchQuery ? 'ri-search-line' : 'ri-quill-pen-line',
    'text-[20px]',
    isDark ? 'text-wt-dim' : 'text-lt-aux'
  ]"
/>
        </div>
        <p class="text-[11.5px] text-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          {{ searchQuery ? `没有匹配「${searchQuery}」的笔记` : '还没有笔记，开始你的第一篇吧' }}
        </p>
        <button v-if="!searchQuery" @click="createNote()"
          class="h-7 px-3 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'">
          <i class="ri-add-line text-[12px]" />新建笔记
        </button>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-3 py-2.5 flex gap-2" :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
      <button @click="createNote()" class="flex-1 h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20 border border-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100 border border-brand-100'">
        <i class="ri-add-line text-[13px]" /> 新建笔记
      </button>
      <button @click="openNewFolderModal()" title="新建文件夹"
        class="w-8 h-8 hover:text-blue  rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        :class="isDark ? 'bg-d3 text-wt-aux hover:bg-d4 border border-bdr' : 'bg-l3 text-lt-aux hover:bg-l4 border border-bdrF'">
        <i class="ri-folder-add-line text-[14px]" />
      </button>
    </div>

    <!-- ═══ Context Menu ═══ -->
    <Teleport to="body">
      <Transition name="ctx-fade">
        <div v-if="ctx" class="ctx-backdrop fixed inset-0 z-[60]" @click="closeCtx" @contextmenu.prevent="closeCtx">
          <div class="ctx-menu fixed py-1 min-w-[200px] border"
            :class="isDark ? 'ctx-dark' : 'ctx-light'"
            :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
            <!-- Root context -->
            <template v-if="ctx.type === 'root'">
              <div @click="createNote(); closeCtx()" class="ctx-item ctx-item-accent">
                <i class="ri-add-line" /><span>新建笔记</span>
              </div>
              <div @click="openNewFolderModal()" class="ctx-item">
                <i class="ri-folder-add-line" /><span>新建文件夹</span>
              </div>
            </template>
            <!-- Folder context -->
            <template v-if="ctx.type === 'folder'">
              <div @click="createNoteInFolder(ctx.folderId)" class="ctx-item ctx-item-accent">
                <i class="ri-add-line" /><span>新建笔记</span>
              </div>
              <div @click="openNewFolderModal(ctx.folderId)" class="ctx-item">
                <i class="ri-folder-add-line" /><span>新建子文件夹</span>
              </div>
              <div @click="startRename()" class="ctx-item">
                <i class="ri-edit-line" /><span>重命名</span>
              </div>
              <div class="ctx-sep" />
              <div @click="startDelete()" class="ctx-item ctx-item-danger">
                <i class="ri-delete-bin-line" /><span>删除文件夹</span>
              </div>
            </template>
            <!-- Note context -->
            <template v-if="ctx.type === 'note'">
              <div @click="selectNote(ctx.noteId); closeCtx()" class="ctx-item ctx-item-accent">
                <i class="ri-eye-line" /><span>打开笔记</span>
              </div>
              <div @click="startRename()" class="ctx-item">
                <i class="ri-edit-line" /><span>重命名</span>
              </div>
              <div class="ctx-sep" />
              <div @click="startDelete()" class="ctx-item ctx-item-danger">
                <i class="ri-delete-bin-line" /><span>删除笔记</span>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══ Modals ═══ -->
    <MsModal v-if="showNewFolderModal" v-model:show="showNewFolderModal" :width="380" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-amber-400/8' : 'bg-amber-50'">
            <i class="ri-folder-add-line text-[16px] text-amber-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">新建文件夹</span>
        </div>
      </template>
      <div class="space-y-3">
        <div v-if="newFolderParent" class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px]"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">
          <i class="ri-folder-line text-[12px] text-amber-400" />
          <span>父级：{{ notesStore.folders.find(f => f.id === newFolderParent)?.name }}</span>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">文件夹名称</label>
          <input v-model="newFolderName" type="text" placeholder="输入文件夹名称"
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
            @keyup.enter="createFolder" />
        </div>
      </div>
      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="createFolder(); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">确认创建</button>
      </template>
    </MsModal>

    <MsModal v-if="showRenameModal" v-model:show="showRenameModal" :width="380" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-brand-400/8' : 'bg-brand-50'">
            <i class="ri-edit-line text-[16px] text-brand-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">重命名</span>
        </div>
      </template>
      <div class="space-y-3">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg" :class="isDark ? 'bg-d0' : 'bg-l3'">
          <i :class="renameTarget?.type === 'folder' ? 'ri-folder-3-line text-amber-400' : 'ri-markdown-line text-emerald-400'" class="text-[14px]" />
          <span class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ renameTarget?.name }}</span>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">新名称</label>
          <input v-model="renameValue" type="text" placeholder="输入新名称"
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none transition-colors"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim focus:border-brand-400/40' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux focus:border-brand-400'"
            @keyup.enter="confirmRename" />
        </div>
      </div>
      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmRename(); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">确认重命名</button>
      </template>
    </MsModal>

    <MsModal v-if="showDeleteModal" v-model:show="showDeleteModal" :width="360" :show-footer="true">
      <template #header>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="isDark ? 'bg-red-400/8' : 'bg-red-50'">
            <i class="ri-delete-bin-line text-[16px] text-red-400" />
          </div>
          <span class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ deleteTarget?.type === 'folder' ? '删除文件夹' : '删除笔记' }}</span>
        </div>
      </template>
      <div>
        <p class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
          确定要删除「{{ deleteTarget?.name }}」{{ deleteTarget?.type === 'folder' ? '及其所有笔记' : '' }}吗？此操作不可恢复。
        </p>
      </div>
      <template #footer="{ close }">
        <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
        <button @click="confirmDelete(); close()" class="px-4 py-2 rounded-lg text-[11px] font-medium bg-red-500 text-white hover:bg-red-600">确认删除</button>
      </template>
    </MsModal>
  </div>
</template>

<style scoped>
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08) }
.thin-scroll::-webkit-scrollbar { width: 5px }
.thin-scroll::-webkit-scrollbar-track { background: transparent }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25) }

/* ─── Context Menu ─── */
.ctx-backdrop { background: transparent }
.ctx-dark {
  background: rgba(30,30,42,0.95);
  border-color: rgba(108,138,255,0.15);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(108,138,255,0.08);
  backdrop-filter: blur(12px);
}
.ctx-light {
  background: rgba(255,255,255,0.96);
  border-color: rgba(0,0,0,0.08);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04);
  backdrop-filter: blur(16px);
}
.ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 14px; margin: 2px 4px;
  border-radius: 6px; font-size: 12px; font-weight: 500;
  cursor: pointer; transition: background .12s;
}
.ctx-dark .ctx-item { color: #b0b0ba }
.ctx-dark .ctx-item:hover { background: rgba(108,138,255,0.12); color: #e8e8ed }
.ctx-light .ctx-item { color: #5a5a6e }
.ctx-light .ctx-item:hover { background: rgba(108,138,255,0.08); color: #1a1a2e }
.ctx-item i { font-size: 15px; width: 18px; text-align: center; flex-shrink: 0 }
.ctx-dark .ctx-item-accent { color: #6C8AFF }
.ctx-dark .ctx-item-accent:hover { background: rgba(108,138,255,0.18); color: #8aa4ff }
.ctx-light .ctx-item-accent { color: #4A6CFF }
.ctx-light .ctx-item-accent:hover { background: rgba(108,138,255,0.12); color: #3a5cee }
.ctx-dark .ctx-item-danger { color: #f87171 }
.ctx-dark .ctx-item-danger:hover { background: rgba(248,113,113,0.12); color: #ff9999 }
.ctx-light .ctx-item-danger { color: #ef4444 }
.ctx-light .ctx-item-danger:hover { background: rgba(239,68,68,0.08); color: #dc2626 }
.ctx-sep { height: 1px; margin: 4px 12px }
.ctx-dark .ctx-sep { background: rgba(108,138,255,0.1) }
.ctx-light .ctx-sep { background: rgba(0,0,0,0.06) }
.ctx-fade-enter-active { transition: opacity .12s ease }
.ctx-fade-leave-active { transition: opacity .08s ease }
.ctx-fade-enter-from, .ctx-fade-leave-to { opacity: 0 }
</style>