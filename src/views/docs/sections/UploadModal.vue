<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'
import { ref, computed } from 'vue'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  currentPath: { type: String, default: '' },
})

const emit = defineEmits(['update:show', 'submit'])

const tab = ref('local') // 'local' | 'url'
const pickedFiles = ref([]) // [{name, path, size}]
const isDragging = ref(false)
const urlInput = ref('')
const urlDepth = ref(1)

const api = () => window.electronAPI

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function fileIconFor(name) {
  const ext = (name || '').split('.').pop().toLowerCase()
  const map = {
    pdf: ['ri-file-pdf-2-line', 'text-red-400'],
    md: ['ri-markdown-line', 'text-brand-400'], markdown: ['ri-markdown-line', 'text-brand-400'],
    docx: ['ri-file-word-2-line', 'text-blue-400'], doc: ['ri-file-word-2-line', 'text-blue-400'],
    xlsx: ['ri-file-excel-2-line', 'text-emerald-400'], xls: ['ri-file-excel-2-line', 'text-emerald-400'],
    pptx: ['ri-file-ppt-2-line', 'text-orange-400'], ppt: ['ri-file-ppt-2-line', 'text-orange-400'],
    txt: ['ri-file-text-line', 'text-wt-aux'],
    png: ['ri-image-line', 'text-purple-400'], jpg: ['ri-image-line', 'text-purple-400'],
    jpeg: ['ri-image-line', 'text-purple-400'], gif: ['ri-image-line', 'text-purple-400'],
    json: ['ri-braces-line', 'text-yellow-400'],
    js: ['ri-javascript-line', 'text-yellow-400'], ts: ['ri-code-s-slash-line', 'text-blue-400'],
    py: ['ri-code-s-slash-line', 'text-emerald-400'],
    zip: ['ri-file-zip-line', 'text-gray-400'], rar: ['ri-file-zip-line', 'text-gray-400'],
  }
  return map[ext] || ['ri-file-3-line', props.isDark ? 'text-wt-aux' : 'text-lt-aux']
}

async function pickFiles() {
  const paths = await api()?.openFile?.({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有支持的文件', extensions: ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'xlsx', 'xls', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'csv', 'json', 'js', 'ts', 'py'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  if (!paths || paths.length === 0) return
  for (const p of paths) {
    const name = p.split(/[/\\]/).pop()
    if (pickedFiles.value.some(f => f.path === p)) continue
    let size = 0
    try {
      const stat = await api()?.stat?.(p)
      size = stat?.data?.size || stat?.size || 0
    } catch (e) { /* ignore */ }
    pickedFiles.value.push({ name, path: p, size })
  }
}

function removeFile(idx) {
  pickedFiles.value.splice(idx, 1)
}

function onDragEnter(e) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave(e) {
  e.preventDefault()
  if (e.currentTarget.contains(e.relatedTarget)) return
  isDragging.value = false
}
function onDragOver(e) {
  e.preventDefault()
}
async function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  for (const f of files) {
    if (pickedFiles.value.some(p => p.path === f.path)) continue
    pickedFiles.value.push({ name: f.name, path: f.path, size: f.size })
  }
}

async function handleSubmit() {
  if (tab.value !== 'local' || pickedFiles.value.length === 0) return
  emit('submit', { type: 'local', files: pickedFiles.value.slice() })
  pickedFiles.value = []
  visible.value = false
}

function reset() {
  pickedFiles.value = []
  urlInput.value = ''
  tab.value = 'local'
}
</script>

<template>
  <MsModal v-model:show="visible" :width="560" :show-footer="true" @close="reset">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
          <i class="ri-upload-cloud-2-line text-[16px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <div>
          <div class="text-[13px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">添加文档</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-folder-line text-[10px] mr-0.5" />
            {{ currentPath || '根目录' }}
          </div>
        </div>
      </div>
    </template>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 p-1 rounded-lg"
      :class="isDark ? 'bg-d0' : 'bg-l3'">
      <button @click="tab = 'local'"
        class="flex-1 h-8 rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-1.5"
        :class="tab === 'local'
          ? (isDark ? 'bg-d3 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-folder-upload-line text-[14px]" />本地文件
      </button>
      <button @click="tab = 'url'"
        class="flex-1 h-8 rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-1.5"
        :class="tab === 'url'
          ? (isDark ? 'bg-d3 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-global-line text-[14px]" />URL 爬取
        <span class="ctx-pill ml-0.5 !text-[9px] !px-1 !py-0.5"
          :class="isDark ? 'text-amber-400 bg-amber-400/12' : 'text-amber-600 bg-amber-50'">即将推出</span>
      </button>
    </div>

    <!-- LOCAL FILE TAB -->
    <div v-if="tab === 'local'">
      <!-- Drop zone -->
      <div
        @dragenter="onDragEnter" @dragleave="onDragLeave" @dragover="onDragOver" @drop="onDrop"
        @click="pickFiles"
        class="rounded-xl border-2 border-dashed transition-all cursor-pointer"
        :class="[
          isDragging
            ? (isDark ? 'border-brand-400 bg-brand-400/8' : 'border-brand-500 bg-brand-50')
            : (isDark ? 'border-d4 hover:border-brand-400/40 hover:bg-d4/50' : 'border-bdrL hover:border-brand-400/40 hover:bg-l3'),
          pickedFiles.length > 0 ? 'py-4' : 'py-8'
        ]">
        <div class="flex flex-col items-center gap-2 px-4">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center"
            :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
            <i class="ri-upload-2-line text-[20px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
          </div>
          <div class="text-center">
            <p class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
              {{ isDragging ? '松开以添加文件' : '点击选择或拖放文件到这里' }}
            </p>
            <p class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              支持 PDF、Word、Excel、PPT、Markdown、图片等格式
            </p>
          </div>
        </div>
      </div>

      <!-- Picked file list -->
      <div v-if="pickedFiles.length > 0" class="mt-3 space-y-1.5 max-h-[200px] overflow-y-auto thin-scroll">
        <div v-for="(f, idx) in pickedFiles" :key="f.path"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg group transition-colors"
          :class="isDark ? 'bg-d0 hover:bg-d0/80' : 'bg-l3 hover:bg-l4'">
          <i :class="fileIconFor(f.name)" class="text-[15px] shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12px] truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ f.name }}</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatSize(f.size) }}</div>
          </div>
          <button @click.stop="removeFile(idx)"
            class="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/12' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
            <i class="ri-close-line text-[12px]" />
          </button>
        </div>
      </div>
      <div v-if="pickedFiles.length > 0" class="mt-2 text-[10px] flex items-center gap-1"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <i class="ri-information-line text-[11px]" />
        已选择 {{ pickedFiles.length }} 个文件
      </div>
    </div>

    <!-- URL TAB (placeholder) -->
    <div v-else>
      <div class="rounded-xl p-5 mb-3"
        :class="isDark ? 'bg-amber-400/6 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-amber-400/12' : 'bg-amber-100'">
            <i class="ri-rocket-2-line text-[18px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
          </div>
          <div class="flex-1">
            <div class="text-[12px] font-semibold" :class="isDark ? 'text-amber-400' : 'text-amber-700'">URL 爬取功能即将上线</div>
            <p class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-amber-400/80' : 'text-amber-600'">
              未来你可以直接粘贴网页 URL，自动抓取并保存为 Markdown 文档，支持递归抓取整站。
            </p>
          </div>
        </div>
      </div>

      <!-- Disabled preview form -->
      <div class="space-y-3 opacity-50 pointer-events-none">
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">URL 地址</label>
          <input v-model="urlInput" type="text" placeholder="https://example.com/article"
            disabled
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux'" />
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">抓取深度</label>
          <div class="flex gap-2">
            <button v-for="d in [1, 2, 3]" :key="d" disabled
              class="flex-1 h-8 rounded-lg text-[11px] transition-colors"
              :class="urlDepth === d
                ? (isDark ? 'bg-brand-400/12 text-brand-400 border border-brand-400/30' : 'bg-brand-50 text-brand-500 border border-brand-200')
                : (isDark ? 'bg-d0 text-wt-dim border border-d4' : 'bg-l3 text-lt-aux border border-bdrF')">
              深度 {{ d }} {{ d === 1 ? '(单页)' : d === 2 ? '(一层)' : '(整站)' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="handleSubmit"
        :disabled="tab !== 'local' || pickedFiles.length === 0"
        class="px-4 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1"
        :class="(tab === 'local' && pickedFiles.length > 0)
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-upload-2-line text-[12px]" />
        <span>{{ tab === 'local' && pickedFiles.length > 0 ? `上传 ${pickedFiles.length} 个文件` : '上传' }}</span>
      </button>
    </template>
  </MsModal>
</template>

<style scoped>
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.thin-scroll::-webkit-scrollbar { width: 6px }
.thin-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.2); border-radius: 3px }
.thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.4) }
</style>
