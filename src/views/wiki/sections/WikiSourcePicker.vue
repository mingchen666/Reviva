<script setup>
import { computed, ref, watch } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  externalError: { type: String, default: '' },
})

const emit = defineEmits(['close', 'add-doc', 'add-note'])

const notesStore = useNotesStore()
const settingsStore = useSettingsStore()
const activeTab = ref('docs')
const currentPath = ref('')
const items = ref([])
const loading = ref(false)
const query = ref('')

const allowedExts = new Set(['md', 'markdown', 'txt', 'pdf', 'docx', 'pptx', 'xlsx'])

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const crumbs = [{ label: 'docs', path: '' }]
  let acc = ''
  for (const part of parts) {
    acc += (acc ? '/' : '') + part
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
})

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(item => item.name.toLowerCase().includes(q))
})

const filteredNotes = computed(() => {
  const q = query.value.trim().toLowerCase()
  const notes = notesStore.notes || []
  if (!q) return notes
  return notes.filter(note =>
    String(note.title || '').toLowerCase().includes(q) ||
    String(note.content || '').toLowerCase().includes(q)
  )
})

watch(() => props.show, async (show) => {
  if (!show) return
  activeTab.value = 'docs'
  query.value = ''
  currentPath.value = ''
  await Promise.all([loadDocs(''), notesStore.loadFromDb()])
})

function docsBase() {
  return settingsStore.getDocsPath()
}

function absPath(relPath) {
  const base = docsBase()
  if (!base) return ''
  return relPath ? `${base}/${relPath}` : base
}

function extOf(name) {
  return String(name || '').split('.').pop().toLowerCase()
}

function fileIcon(item) {
  if (item.isDirectory) return 'ri-folder-3-line'
  const ext = extOf(item.name)
  if (ext === 'pdf') return 'ri-file-pdf-2-line'
  if (ext === 'doc' || ext === 'docx') return 'ri-file-word-2-line'
  if (ext === 'pptx') return 'ri-file-ppt-2-line'
  if (ext === 'xlsx') return 'ri-file-excel-2-line'
  if (ext === 'md' || ext === 'markdown') return 'ri-markdown-line'
  return 'ri-file-text-line'
}

// Full literal class strings so UnoCSS can statically detect them (no dynamic concatenation).
function fileTile(item) {
  if (item.isDirectory) return { icon: 'ri-folder-3-line', dark: 'bg-amber-400/12 text-amber-400', light: 'bg-amber-50 text-amber-500' }
  const tones = {
    pdf: ['bg-red-400/12 text-red-400', 'bg-red-50 text-red-500'],
    doc: ['bg-blue-400/12 text-blue-400', 'bg-blue-50 text-blue-500'],
    docx: ['bg-blue-400/12 text-blue-400', 'bg-blue-50 text-blue-500'],
    pptx: ['bg-orange-400/12 text-orange-400', 'bg-orange-50 text-orange-500'],
    xlsx: ['bg-emerald-400/12 text-emerald-400', 'bg-emerald-50 text-emerald-500'],
    md: ['bg-brand-400/12 text-brand-400', 'bg-brand-50 text-brand-500'],
    markdown: ['bg-brand-400/12 text-brand-400', 'bg-brand-50 text-brand-500'],
  }
  const [dark, light] = tones[extOf(item.name)] || ['bg-slate-400/12 text-slate-400', 'bg-slate-100 text-slate-500']
  return { icon: fileIcon(item), dark, light }
}

function canAdd(item) {
  return item.isFile && allowedExts.has(extOf(item.name))
}

function extBadge(item) {
  if (item.isDirectory) return '目录'
  return extOf(item.name).toUpperCase()
}

async function loadDocs(relPath) {
  const base = docsBase()
  if (!base || !window.electronAPI?.listDir) return
  loading.value = true
  try {
    const result = await window.electronAPI.listDir(absPath(relPath))
    if (result?.success) {
      currentPath.value = relPath
      items.value = result.data
        .filter(item => !item.name.startsWith('.'))
        .filter(item => item.isDirectory || canAdd(item))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
    }
  } finally {
    loading.value = false
  }
}

function openItem(item) {
  if (!item.isDirectory) return
  const next = currentPath.value ? `${currentPath.value}/${item.name}` : item.name
  loadDocs(next)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/35" @click.self="!busy && emit('close')">
      <div class="source-modal w-[800px] h-[580px] rounded-xl border shadow-2xl flex flex-col overflow-hidden" :class="isDark ? 'bg-d2 border-bdr text-wt-main' : 'bg-white border-bdrF text-lt-main'">
        <div class="px-5 py-4 flex items-center gap-3 border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-brand-400/12 text-brand-400' : 'bg-brand-50 text-brand-500'">
            <i class="ri-book-ai-line text-[18px]" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-[14px] font-semibold">添加 Wiki知识库来源</h2>
            <p class="text-[11px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">从已授权 docs 和笔记库引用内容</p>
          </div>
          <button class="h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0" :class="isDark ? 'text-wt-dim hover:text-wt-main hover:bg-white/5' : 'text-lt-aux hover:text-lt-main hover:bg-l4'" :disabled="busy" @click="emit('close')">
            <i class="ri-close-line text-[18px]" />
          </button>
        </div>

        <div class="px-5 pt-3 pb-2.5 border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div class="seg" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrL'">
            <button class="seg-btn" :class="activeTab === 'docs' ? (isDark ? 'bg-brand-400 text-d0' : 'bg-brand-500 text-white') : (isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main')" @click="activeTab = 'docs'; query = ''">
              <i class="ri-folder-3-line text-[14px]" /><span>文档</span>
            </button>
            <button class="seg-btn" :class="activeTab === 'notes' ? (isDark ? 'bg-brand-400 text-d0' : 'bg-brand-500 text-white') : (isDark ? 'text-wt-sub hover:text-wt-main' : 'text-lt-sub hover:text-lt-main')" @click="activeTab = 'notes'; query = ''">
              <i class="ri-booklet-line text-[14px]" /><span>笔记</span>
            </button>
            <button class="seg-btn seg-soon" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" disabled title="即将支持">
              <i class="ri-link text-[14px]" /><span>链接</span><span class="soon" :class="isDark ? 'bg-white/8 text-wt-dim' : 'bg-lt-aux/10 text-lt-aux'">即将</span>
            </button>
            <button class="seg-btn seg-soon" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" disabled title="即将支持">
              <i class="ri-movie-2-line text-[14px]" /><span>音视频</span><span class="soon" :class="isDark ? 'bg-white/8 text-wt-dim' : 'bg-lt-aux/10 text-lt-aux'">即将</span>
            </button>
          </div>
        </div>

        <div class="px-5 py-2.5 flex items-center gap-3 border-b shrink-0" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div v-if="activeTab === 'docs'" class="flex items-center gap-1 min-w-0 overflow-x-auto thin-scroll">
            <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
              <i v-if="index > 0" class="ri-arrow-right-s-line text-[12px] shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <button
                class="text-[11px] truncate max-w-[140px] shrink-0 px-1.5 h-6 rounded-md transition-colors"
                :class="index === breadcrumbs.length - 1 ? (isDark ? 'text-wt-main font-semibold' : 'text-lt-main font-semibold') : (isDark ? 'text-wt-sub hover:bg-white/5' : 'text-lt-sub hover:bg-l3')"
                @click="loadDocs(crumb.path)">
                {{ crumb.label }}
              </button>
            </template>
          </div>
          <div v-else class="text-[12px] font-medium shrink-0" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">全部笔记</div>

          <div class="relative ml-auto w-[220px] max-w-[46%] shrink-0">
            <!-- <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" /> -->
            <input
              v-model="query"
              class="w-full h-8 pl-2.5 pr-1 rounded-1.5 text-[12px] outline-none border transition-colors"
              :class="isDark ? 'bg-d0 border-d4 text-wt-main placeholder-wt-dim focus:border-brand-400/50' : 'bg-l2 border-bdrL text-lt-main placeholder-lt-aux focus:border-brand-400'"
              :placeholder="activeTab === 'docs' ? '搜索文档' : '搜索笔记'" />
          </div>
        </div>

        <div v-if="externalError" class="mx-5 mt-3 px-3 py-2 rounded-lg text-[12px] shrink-0" :class="isDark ? 'bg-red-400/10 text-red-300' : 'bg-red-50 text-red-600'">
          {{ externalError }}
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-2 min-h-0 thin-scroll">
          <div v-if="activeTab === 'docs'" class="space-y-0.5">
            <div v-if="loading" class="py-16 flex justify-center" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              <i class="ri-loader-4-line pulse text-[22px]" />
            </div>
            <template v-else>
              <div
                v-for="item in filteredItems"
                :key="item.path"
                class="source-row"
                :class="isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l3 text-lt-sub'"
                @dblclick="openItem(item)">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? fileTile(item).dark : fileTile(item).light">
                  <i :class="fileTile(item).icon" class="text-[15px]" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] font-medium truncate">{{ item.name }}</p>
                  <p class="mt-0.5 text-[10px] truncate font-mono" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ item.path }}</p>
                </div>
                <span class="ext-pill" :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l2 text-lt-aux'">{{ extBadge(item) }}</span>
                <button
                  v-if="canAdd(item)"
                  class="add-btn"
                  :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'"
                  :disabled="busy"
                  @click.stop="emit('add-doc', item.path)">
                  <i :class="busy ? 'ri-loader-4-line pulse' : 'ri-add-line'" class="text-[12px]" />{{ busy ? '添加中' : '添加' }}
                </button>
                <button
                  v-else
                  class="open-hint"
                  :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l3'"
                  @click.stop="openItem(item)">
                  <i class="ri-folder-open-line text-[12px]" />打开
                </button>
              </div>
              <div v-if="filteredItems.length === 0" class="py-16 text-center">
                <i class="ri-folder-2-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <p class="mt-2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">当前目录没有可添加的文档</p>
              </div>
            </template>
          </div>

          <div v-else class="space-y-0.5">
            <div
              v-for="note in filteredNotes"
              :key="note.id"
              class="source-row"
              :class="isDark ? 'hover:bg-white/5 text-wt-sub' : 'hover:bg-l3 text-lt-sub'">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-amber-50 text-amber-500'">
                <i class="ri-sticky-note-line text-[15px]" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[12px] font-medium truncate">{{ note.title || '未命名笔记' }}</p>
                <p class="mt-0.5 text-[10.5px] line-clamp-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ note.content || '空笔记' }}</p>
              </div>
              <button
                class="add-btn"
                :class="isDark ? 'bg-brand-400/12 text-brand-400 hover:bg-brand-400/20' : 'bg-brand-50 text-brand-500 hover:bg-brand-100'"
                :disabled="busy"
                @click.stop="emit('add-note', note.id)">
                <i :class="busy ? 'ri-loader-4-line pulse' : 'ri-add-line'" class="text-[12px]" />{{ busy ? '添加中' : '添加' }}
              </button>
            </div>
            <div v-if="filteredNotes.length === 0" class="py-16 text-center">
              <i class="ri-sticky-note-line text-[26px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <p class="mt-2 text-[12px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">没有可添加的笔记</p>
            </div>
            
          </div>
        </div>

        <div class="px-5 py-2.5 flex items-center gap-2 border-t shrink-0 text-[10.5px] leading-relaxed" :class="isDark ? 'border-d4 text-wt-dim' : 'border-bdrL text-lt-aux'">
          <i class="ri-information-line text-[13px] shrink-0" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          <span>当前支持 文档(MD / TXT / PDF / DOCX / PPTX / XLSX等) 与笔记;链接、音视频等来源即将支持。</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1 }
  50% { opacity: .5 }
}
.pulse { animation: pulse 1.4s ease-in-out infinite }
.seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 10px;
  gap: 2px;
}
.seg-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color .15s, color .15s;
}
.seg-soon {
  cursor: not-allowed;
}
.soon {
  font-size: 8.5px;
  line-height: 1;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: 4px;
  margin-left: 1px;
}
.source-row {
  width: 100%;
  min-height: 46px;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  transition: background-color .15s;
}
.ext-pill {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 500;
}
.add-btn {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color .15s, color .15s;
}
.add-btn:disabled { opacity: .6; cursor: default; }
.open-hint {
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  white-space: nowrap;
  transition: background-color .15s, color .15s;
}
.source-modal {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
}
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.thin-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
.thin-scroll:hover { scrollbar-color: rgba(108,138,255,0.25) rgba(108,138,255,0.08); }
.thin-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.thin-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
.thin-scroll:hover::-webkit-scrollbar-thumb { background: rgba(108,138,255,0.25); }
@media (max-width: 640px) {
  .source-modal {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
  }
  .ext-pill { display: none; }
}
</style>
