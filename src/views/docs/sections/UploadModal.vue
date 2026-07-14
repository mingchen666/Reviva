<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'
import { ref, computed } from 'vue'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  currentPath: { type: String, default: '' },
  webSettings: { type: Object, default: null },
  webProviders: { type: Array, default: () => [] },
  webJobs: { type: Array, default: () => [] },
  webSubmitting: { type: Boolean, default: false },
})

const emit = defineEmits(['update:show', 'submit', 'open-web-settings', 'retry-web-job', 'delete-web-job', 'clear-web-jobs', 'open-web-result'])

const tab = ref('local') // 'local' | 'url'
const pickedFiles = ref([]) // [{name, path, size}]
const isDragging = ref(false)
const urlInput = ref('')
const includeHtml = ref(false)

const api = () => window.electronAPI

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})
const selectedProvider = computed(() => props.webProviders.find(item => item.id === props.webSettings?.selectedProvider) || null)
const selectedProviderConfig = computed(() => props.webSettings?.providers?.[props.webSettings?.selectedProvider] || null)
const providerReady = computed(() => !!selectedProvider.value && !!selectedProviderConfig.value?.baseUrl)
const supportsHtml = computed(() => selectedProvider.value?.formats?.includes('html') === true)
const validUrl = computed(() => /^https?:\/\/[^\s]+$/i.test(urlInput.value.trim()))
const canSubmitUrl = computed(() => providerReady.value && validUrl.value && !props.webSubmitting)
const recentWebJobs = computed(() => props.webJobs.slice(0, 5))

function jobStatusText(job) {
  const map = { pending: '排队中', running: '处理中', succeeded: '已完成', partial: '部分完成', failed: '失败', interrupted: '已中断' }
  return map[job.status] || job.status
}

function jobTone(job) {
  if (job.status === 'succeeded') return 'text-emerald-400'
  if (job.status === 'partial') return 'text-amber-400'
  if (['failed', 'interrupted'].includes(job.status)) return 'text-red-400'
  return props.isDark ? 'text-brand-400' : 'text-brand-500'
}

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
  if (tab.value === 'local') {
    if (pickedFiles.value.length === 0) return
    emit('submit', { type: 'local', files: pickedFiles.value.slice() })
    pickedFiles.value = []
    visible.value = false
    return
  }
  if (!canSubmitUrl.value) return
  emit('submit', { type: 'url', url: urlInput.value.trim(), includeHtml: includeHtml.value && supportsHtml.value })
}

function reset() {
  pickedFiles.value = []
  urlInput.value = ''
  includeHtml.value = false
  tab.value = 'local'
}

function openWebSettings() {
  visible.value = false
  emit('open-web-settings')
}
</script>

<template>
  <MsModal v-model:show="visible" :width="560" :show-footer="true" @close="reset">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
          <i class="ri-upload-cloud-2-line text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <div>
          <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">添加文档</div>
          <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            <i class="ri-folder-line text-[12px] mr-0.5" />
            {{ currentPath || '根目录' }}
          </div>
        </div>
      </div>
    </template>

    <!-- Tabs -->
    <div class="flex gap-1 mb-4 p-1 rounded-lg"
      :class="isDark ? 'bg-d0' : 'bg-l3'">
      <button @click="tab = 'local'"
        class="flex-1 h-8 rounded-md text-[14px] font-medium transition-all flex items-center justify-center gap-1.5"
        :class="tab === 'local'
          ? (isDark ? 'bg-d3 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-folder-upload-line text-[14px]" />本地文件
      </button>
      <button @click="tab = 'url'"
        class="flex-1 h-8 rounded-md text-[14px] font-medium transition-all flex items-center justify-center gap-1.5"
        :class="tab === 'url'
          ? (isDark ? 'bg-d3 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-global-line text-[14px]" />网页 URL
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
              支持 PDF、DOCX、Excel、PPTX、Markdown、TXT等格式
            </p>
          </div>
        </div>
      </div>

      <!-- Picked file list -->
      <div v-if="pickedFiles.length > 0" class="mt-3 space-y-1.5 max-h-[200px] overflow-y-auto thin-scroll">
        <div v-for="(f, idx) in pickedFiles" :key="f.path"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg group transition-colors"
          :class="isDark ? 'bg-d0 hover:bg-d0/80' : 'bg-l3 hover:bg-l4'">
          <i :class="fileIconFor(f.name)" class="text-[18px] shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[13px] truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ f.name }}</div>
            <div class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ formatSize(f.size) }}</div>
          </div>
          <button @click.stop="removeFile(idx)"
            class="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            :class="isDark ? 'text-wt-dim hover:text-red-400 hover:bg-red-400/12' : 'text-lt-aux hover:text-red-500 hover:bg-red-50'">
            <i class="ri-close-line text-[13px]" />
          </button>
        </div>
      </div>
      <div v-if="pickedFiles.length > 0" class="mt-2 text-[12px] flex items-center gap-1"
        :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        <i class="ri-information-line text-[14px]" />
        已选择 {{ pickedFiles.length }} 个文件
      </div>
    </div>

    <!-- URL TAB -->
    <div v-else>
      <div v-if="!providerReady" class="rounded-xl p-4 mb-3"
        :class="isDark ? 'bg-amber-400/6 border border-amber-400/20' : 'bg-amber-50 border border-amber-200'">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-amber-400/12' : 'bg-amber-100'">
            <i class="ri-settings-3-line text-[18px]" :class="isDark ? 'text-amber-400' : 'text-amber-600'" />
          </div>
          <div class="flex-1">
            <div class="text-[12px] font-semibold" :class="isDark ? 'text-amber-400' : 'text-amber-700'">尚未选择网页解析引擎</div>
            <p class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-amber-400/80' : 'text-amber-600'">
              请先在文档解析设置中选择 Jina Reader、Firecrawl 或 Tavily Extract。
            </p>
            <button class="mt-2 text-[10.5px] font-medium" :class="isDark ? 'text-brand-400' : 'text-brand-600'" @click="openWebSettings">去解析设置</button>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">URL 地址</label>
          <input v-model="urlInput" type="text" placeholder="https://example.com/article"
            class="w-full h-9 px-3 rounded-lg text-[12px] outline-none"
            :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux'" />
        </div>
        <div v-if="selectedProvider" class="rounded-lg border p-3" :class="isDark ? 'border-d4 bg-d0' : 'border-bdrF bg-l3'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-[11.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ selectedProvider.name }}</div>
              <div class="text-[10px] mt-0.5" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ selectedProviderConfig?.apiKeyConfigured ? `已配置 Key ${selectedProviderConfig.apiKeyMasked}` : '未配置 API Key' }}</div>
            </div>
            <button class="text-[10.5px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" @click="openWebSettings">解析设置</button>
          </div>
        </div>
        <label class="flex items-start gap-2 text-[11px]" :class="supportsHtml ? (isDark ? 'text-wt-sub' : 'text-lt-sub') : (isDark ? 'text-wt-dim' : 'text-lt-aux')">
          <input v-model="includeHtml" type="checkbox" class="mt-0.5" :disabled="!supportsHtml" />
          <span>同时保存 HTML <span v-if="!supportsHtml">（{{ selectedProvider?.name || '当前引擎' }} 仅支持 Markdown）</span><span v-else-if="selectedProvider?.id === 'jina'">（可能额外发起一次请求）</span></span>
        </label>
        <div class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">仅导入当前页面；Markdown 中的远程图片 URL 保持不变，不下载到本地。</div>

        <div v-if="webJobs.length" class="pt-2 border-t" :class="isDark ? 'border-d4' : 'border-bdrL'">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[10.5px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">最近导入</span>
            <button class="text-[10px]" :class="isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'" @click="emit('clear-web-jobs')">清除已完成记录</button>
          </div>
          <div class="max-h-[150px] overflow-y-auto thin-scroll space-y-1.5">
            <div v-for="job in recentWebJobs" :key="job.id" class="rounded-lg px-2.5 py-2 flex items-center gap-2" :class="isDark ? 'bg-d0' : 'bg-l3'">
              <i :class="['text-[13px]',jobTone(job),job.status === 'running' || job.status === 'pending' ? 'ri-loader-4-line animate-spin' : job.status === 'succeeded' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line']"  />
              <div class="flex-1 min-w-0">
                <div class="text-[10.5px] truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ job.title || job.requested_url }}</div>
                <div class="text-[9.5px]" :class="jobTone(job)">{{ jobStatusText(job) }} · {{ job.progress || 0 }}%</div>
                <div v-if="job.error_message" class="text-[9.5px] mt-0.5 truncate" :class="isDark ? 'text-red-300/80' : 'text-red-500'" :title="job.error_message">{{ job.error_message }}</div>
              </div>
              <button v-if="job.status === 'succeeded' || job.status === 'partial'" class="text-[10px] text-brand-400" @click="emit('open-web-result', job)">打开</button>
              <button v-if="job.status === 'failed' || job.status === 'interrupted'" class="text-[10px] text-brand-400" @click="emit('retry-web-job', job.id)">重试</button>
              <button v-if="!['pending','running'].includes(job.status)" class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" @click="emit('delete-web-job', job.id)"><i class="ri-close-line" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="handleSubmit"
<<<<<<< HEAD
<<<<<<< HEAD
        :disabled="tab !== 'local' || pickedFiles.length === 0"
        class="px-4 py-2 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1"
        :class="(tab === 'local' && pickedFiles.length > 0)
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-upload-2-line text-[13px]" />
        <span>{{ tab === 'local' && pickedFiles.length > 0 ? `上传 ${pickedFiles.length} 个文件` : '上传' }}</span>
=======
        :disabled="tab === 'local' ? pickedFiles.length === 0 : !canSubmitUrl"
        class="px-4 py-2 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1"
        :class="((tab === 'local' && pickedFiles.length > 0) || (tab === 'url' && canSubmitUrl))
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-upload-2-line text-[13px]" />
        <span>{{ tab === 'local' ? (pickedFiles.length > 0 ? `上传 ${pickedFiles.length} 个文件` : '上传') : (webSubmitting ? '创建任务中' : '导入网页') }}</span>
>>>>>>> dev
=======
        :disabled="tab === 'local' ? pickedFiles.length === 0 : !canSubmitUrl"
        class="px-4 py-2 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1"
        :class="((tab === 'local' && pickedFiles.length > 0) || (tab === 'url' && canSubmitUrl))
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-upload-2-line text-[13px]" />
        <span>{{ tab === 'local' ? (pickedFiles.length > 0 ? `上传 ${pickedFiles.length} 个文件` : '上传') : (webSubmitting ? '创建任务中' : '导入网页') }}</span>
>>>>>>> dev
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
