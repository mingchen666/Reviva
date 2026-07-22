<script setup>
import MsModal from '@/components/MsModal/MsModal.vue'
import { ref, computed, onBeforeUnmount } from 'vue'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  currentPath: { type: String, default: '' },
  webSettings: { type: Object, default: null },
  webProviders: { type: Array, default: () => [] },
  webJobs: { type: Array, default: () => [] },
  webSubmitting: { type: Boolean, default: false },
  mediaSubmitting: { type: Boolean, default: false },
  mediaError: { type: String, default: '' },
  speechProvider: { type: Object, default: null },
})

const emit = defineEmits(['update:show', 'submit', 'open-web-settings', 'open-media-settings', 'retry-web-job', 'delete-web-job', 'clear-web-jobs', 'open-web-result'])

const tab = ref('local') // 'local' | 'url' | 'media'
const pickedFiles = ref([]) // [{name, path, size}]
const isDragging = ref(false)
const urlInput = ref('')
const includeHtml = ref(false)
const mediaUrlInput = ref('')
const mediaTitle = ref('')
const mediaPreset = ref('subtitle_first')
const mediaPresetRoot = ref(null)
const mediaPresetOpen = ref(false)
const mediaPresetActiveIndex = ref(-1)

const mediaPresetOptions = Object.freeze([
  {
    value: 'subtitle_first',
    title: '字幕优先',
    description: '优先读取已有字幕，无字幕时再调用语音转写。',
  },
  {
    value: 'keyframe_enhanced',
    title: '字幕 + 关键帧增强',
    description: '生成文字稿，并提取关键画面辅助理解。',
  },
])

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
const mediaSourceType = computed(() => /(?:b23\.tv|bilibili\.com\/video\/|^BV[0-9A-Za-z]+$|^av\d+$)/i.test(mediaUrlInput.value.trim())
  ? 'bilibili'
  : 'direct_url')
const validMediaUrl = computed(() => {
  const value = mediaUrlInput.value.trim()
  if (/^(BV[0-9A-Za-z]+|av\d+)$/i.test(value)) return true
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return false
  if (/(?:b23\.tv|bilibili\.com\/video\/)/i.test(value)) return true
  try {
    return /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|mov|mkv|webm|m4v|avi)$/i.test(new URL(value).pathname)
  } catch { return false }
})
const canSubmitMedia = computed(() => validMediaUrl.value && !props.mediaSubmitting)
const mediaFileExtensions = new Set(['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'])
const pickedMediaFiles = computed(() => pickedFiles.value.filter(file => mediaFileExtensions.has(String(file.name || '').split('.').pop().toLowerCase())))
const speechProviderIcons = Object.freeze({
  local_asr: 'local-asr',
  openai_whisper_compatible: 'openai',
  aliyun_bailian_asr: 'bailian',
})
const selectedSpeechCapability = computed(() => props.speechProvider?.modelCapability || null)
const aliyunRequiresPublicUrl = computed(() => props.speechProvider?.id === 'aliyun_bailian_asr'
  && !selectedSpeechCapability.value?.inputModes?.includes('local_file'))
const speechProviderTitle = computed(() => {
  if (!props.speechProvider || props.speechProvider.unavailable) return '所选语音转文字服务当前不可用'
  const model = props.speechProvider.modelName || props.speechProvider.model || ''
  return `${props.speechProvider.name}${model ? ` · ${model}` : ''}`
})
const speechProviderDescription = computed(() => {
  if (!props.speechProvider || props.speechProvider.unavailable) return '请先完善服务商配置，或在媒体解析设置中选择其他服务。'
  if (props.speechProvider.id !== 'aliyun_bailian_asr') return '本地文件或远程媒体会按媒体解析设置中明确选择的服务提交。'
  const capability = selectedSpeechCapability.value
  if (!capability) return '自定义百炼模型按异步文件转写接口调用，需要公网可访问的音视频文件直链。'
  const diarization = capability.supportsDiarization
    ? (props.speechProvider.enableDiarization ? ' · 说话人分离建议不超过 2 小时' : '')
    : ' · 不支持说话人分离'
  return `${capability.inputModes.includes('local_file') ? '支持公网 URL 或本地文件' : '需要公网可访问的文件直链'} · ${props.speechProvider.modelLimitText}${diarization}`
})
const selectedMediaPreset = computed(() => mediaPresetOptions.find(option => option.value === mediaPreset.value) || mediaPresetOptions[0])

function openMediaPresetMenu() {
  mediaPresetOpen.value = true
  const selectedIndex = mediaPresetOptions.findIndex(option => option.value === mediaPreset.value)
  mediaPresetActiveIndex.value = selectedIndex >= 0 ? selectedIndex : 0
  document.addEventListener('pointerdown', handleMediaPresetOutside)
}

function closeMediaPresetMenu() {
  mediaPresetOpen.value = false
  mediaPresetActiveIndex.value = -1
  document.removeEventListener('pointerdown', handleMediaPresetOutside)
}

function toggleMediaPresetMenu() {
  if (mediaPresetOpen.value) closeMediaPresetMenu()
  else openMediaPresetMenu()
}

function selectMediaPreset(option) {
  if (!option) return
  mediaPreset.value = option.value
  closeMediaPresetMenu()
}

function moveMediaPresetActive(direction) {
  if (!mediaPresetOpen.value) {
    openMediaPresetMenu()
    return
  }
  mediaPresetActiveIndex.value = (mediaPresetActiveIndex.value + direction + mediaPresetOptions.length) % mediaPresetOptions.length
}

function handleMediaPresetKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveMediaPresetActive(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveMediaPresetActive(-1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (mediaPresetOpen.value && mediaPresetActiveIndex.value >= 0) selectMediaPreset(mediaPresetOptions[mediaPresetActiveIndex.value])
    else openMediaPresetMenu()
  } else if (event.key === 'Escape') {
    closeMediaPresetMenu()
  }
}

function handleMediaPresetOutside(event) {
  if (!mediaPresetRoot.value?.contains(event.target)) closeMediaPresetMenu()
}

function handleMediaPresetFocusOut(event) {
  if (!mediaPresetRoot.value?.contains(event.relatedTarget)) closeMediaPresetMenu()
}

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
    mp3: ['ri-music-2-line', 'text-cyan-400'], m4a: ['ri-music-2-line', 'text-cyan-400'],
    wav: ['ri-music-2-line', 'text-cyan-400'], flac: ['ri-music-2-line', 'text-cyan-400'],
    mp4: ['ri-movie-2-line', 'text-purple-400'], mov: ['ri-movie-2-line', 'text-purple-400'],
    mkv: ['ri-movie-2-line', 'text-purple-400'], webm: ['ri-movie-2-line', 'text-purple-400'],
    zip: ['ri-file-zip-line', 'text-gray-400'], rar: ['ri-file-zip-line', 'text-gray-400'],
  }
  return map[ext] || ['ri-file-3-line', props.isDark ? 'text-wt-aux' : 'text-lt-aux']
}

async function pickFiles() {
  const paths = await api()?.openFile?.({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有支持的文件', extensions: ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown', 'xlsx', 'xls', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'gif', 'csv', 'json', 'js', 'ts', 'py', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'] },
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
  if (tab.value === 'url') {
    if (!canSubmitUrl.value) return
    emit('submit', { type: 'url', url: urlInput.value.trim(), includeHtml: includeHtml.value && supportsHtml.value })
    return
  }
  if (!canSubmitMedia.value) return
  emit('submit', {
    type: 'media',
    url: mediaUrlInput.value.trim(),
    title: mediaTitle.value.trim(),
    sourceType: mediaSourceType.value,
    presetId: mediaPreset.value,
  })
}

function reset() {
  pickedFiles.value = []
  urlInput.value = ''
  includeHtml.value = false
  mediaUrlInput.value = ''
  mediaTitle.value = ''
  mediaPreset.value = 'subtitle_first'
  closeMediaPresetMenu()
  tab.value = 'local'
}

function openWebSettings() {
  visible.value = false
  emit('open-web-settings')
}

function openMediaSettings() {
  visible.value = false
  emit('open-media-settings')
}

function switchToMediaLink() {
  tab.value = 'media'
}

onBeforeUnmount(closeMediaPresetMenu)
</script>

<template>
  <MsModal v-model:show="visible" :width="600" :show-footer="true" @close="reset">
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
      <button @click="tab = 'media'"
        class="flex-1 h-8 rounded-md text-[14px] font-medium transition-all flex items-center justify-center gap-1.5"
        :class="tab === 'media'
          ? (isDark ? 'bg-d3 text-wt-main shadow-sm' : 'bg-white text-lt-main shadow-sm')
          : (isDark ? 'text-wt-dim hover:text-wt-aux' : 'text-lt-aux hover:text-lt-sub')">
        <i class="ri-movie-2-ai-line text-[14px]" />音视频链接
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
              支持 PDF、Office、Markdown、图片，以及常见音频和视频格式
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
      <div
        v-if="pickedMediaFiles.length && aliyunRequiresPublicUrl"
        class="media-route-notice mt-3"
        :class="isDark ? 'media-route-notice--dark' : 'media-route-notice--light'">
        <i class="ri-link-unlink-m" />
        <div class="min-w-0 flex-1">
          <strong>当前百炼模型不能直接接收本地文件</strong>
          <span>文件仍可保存到文档库；自动转录请改用公网音视频直链，或在媒体解析设置中选择支持文件上传的服务。</span>
        </div>
        <button type="button" @click="switchToMediaLink">使用音视频链接</button>
      </div>
    </div>

    <!-- URL TAB -->
    <div v-else-if="tab === 'url'">
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

    <!-- REMOTE MEDIA TAB -->
    <div v-else class="space-y-2">
      <div class="rounded-xl border p-2" :class="isDark ? 'border-d4 bg-d0' : 'border-bdrF bg-l3'">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
            <i class="ri-link-m text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-600'" />
          </div>
          <div class="min-w-0">
            <div class="text-[12px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">远程音视频解析</div>
            <p class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              支持B站BV/b23 链接和音视频文件url。B 站优先读取当前分P字幕，无字幕时再下载音轨。
            </p>
          </div>
        </div>
      </div>

      <div
        class="speech-provider-summary"
        :class="isDark ? 'speech-provider-summary--dark' : 'speech-provider-summary--light'">
        <span class="speech-provider-summary__icon">
          <SvgIcon
            v-if="speechProvider && speechProviderIcons[speechProvider.id]"
            :icon-class="speechProviderIcons[speechProvider.id]"
            :size="20" />
          <i v-else class="ri-mic-ai-line" />
        </span>
        <div class="min-w-0 flex-1">
          <strong>{{ speechProviderTitle }}</strong>
          <small>{{ speechProviderDescription }}</small>
        </div>
        <button type="button" @click="openMediaSettings">更改</button>
      </div>

      <div>
        <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
          :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">音视频地址</label>
        <input v-model="mediaUrlInput" type="text" placeholder="BV1xx...、https://b23.tv/... 或 https://.../video.mp4"
          class="w-full h-9 px-3 rounded-lg text-[12px] outline-none"
          :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux'" />
        <div v-if="mediaUrlInput && !validMediaUrl" class="text-[10px] mt-1.5 text-red-400">请输入 B 站视频链接，或带受支持扩展名的公网音视频直链。</div>
      </div>

      <div>
        <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
          :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">显示标题（可选）</label>
        <input v-model="mediaTitle" type="text" placeholder="留空则读取来源标题或文件名"
          class="w-full h-9 px-3 rounded-lg text-[12px] outline-none"
          :class="isDark ? 'bg-d0 border border-d4 text-wt-sub placeholder-wt-dim' : 'bg-l3 border border-bdrF text-lt-sub placeholder-lt-aux'" />
      </div>

      <div class="media-preset-row grid grid-cols-[1fr_auto] gap-3 items-end">
        <div ref="mediaPresetRoot" class="media-preset-select" @focusout="handleMediaPresetFocusOut">
          <label class="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
            :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">解析方式</label>
          <button
            type="button"
            class="media-preset-select__trigger"
            :class="[
              isDark ? 'media-preset-select__trigger--dark' : 'media-preset-select__trigger--light',
              { 'media-preset-select__trigger--open': mediaPresetOpen },
            ]"
            role="combobox"
            aria-haspopup="listbox"
            aria-label="选择媒体解析方式"
            :aria-expanded="mediaPresetOpen"
            @click="toggleMediaPresetMenu"
            @keydown="handleMediaPresetKeydown">
            <span class="media-preset-select__copy">
              <strong>{{ selectedMediaPreset.title }}</strong>
              <small>{{ selectedMediaPreset.description }}</small>
            </span>
            <i class="ri-arrow-down-s-line media-preset-select__chevron" />
          </button>

          <Transition name="media-preset-menu">
            <div
              v-if="mediaPresetOpen"
              class="media-preset-select__menu"
              :class="isDark ? 'media-preset-select__menu--dark' : 'media-preset-select__menu--light'"
              role="listbox">
              <button
                v-for="(option, index) in mediaPresetOptions"
                :key="option.value"
                type="button"
                class="media-preset-select__option"
                :class="{
                  'media-preset-select__option--selected': mediaPreset === option.value,
                  'media-preset-select__option--active': mediaPresetActiveIndex === index,
                }"
                role="option"
                :aria-selected="mediaPreset === option.value"
                @mouseenter="mediaPresetActiveIndex = index"
                @click="selectMediaPreset(option)">
                <span class="media-preset-select__option-copy">
                  <strong>{{ option.title }}</strong>
                  <small>{{ option.description }}</small>
                </span>
                <span class="media-preset-select__check"><i class="ri-check-line" /></span>
              </button>
            </div>
          </Transition>
        </div>
        <div class="h-9 px-3 rounded-lg flex items-center gap-1.5 text-[10.5px] border"
          :class="isDark ? 'border-d4 text-wt-aux bg-d0' : 'border-bdrF text-lt-aux bg-l3'">
          <i :class="mediaSourceType === 'bilibili' ? 'ri-bilibili-line' : 'ri-download-cloud-2-line'" class="text-[14px]" />
          {{ mediaSourceType === 'bilibili' ? 'B 站来源' : '公网直链' }}
        </div>
      </div>

      <div class="text-[10.5px] leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
        将使用媒体解析设置中显示的语音转文字服务；只有选择“自动”时才使用默认服务商。文档目录只保存安全的媒体引用，不写入原始或签名 URL。
      </div>
      <div v-if="mediaError" class="rounded-lg px-3 py-2 text-[11px] border"
        :class="isDark ? 'border-red-400/25 bg-red-400/8 text-red-300' : 'border-red-200 bg-red-50 text-red-600'">
        {{ mediaError }}
      </div>
    </div>

    <template #footer="{ close }">
      <button @click="close()" class="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
        :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">取消</button>
      <button @click="handleSubmit"
        :disabled="tab === 'local' ? pickedFiles.length === 0 : (tab === 'url' ? !canSubmitUrl : !canSubmitMedia)"
        class="px-4 py-2 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1"
        :class="((tab === 'local' && pickedFiles.length > 0) || (tab === 'url' && canSubmitUrl) || (tab === 'media' && canSubmitMedia))
          ? (isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600')
          : (isDark ? 'bg-d0 text-wt-dim cursor-not-allowed' : 'bg-l4 text-lt-aux cursor-not-allowed')">
        <i class="ri-upload-2-line text-[13px]" />
        <span>{{ tab === 'local'
          ? (pickedFiles.length > 0 ? `上传 ${pickedFiles.length} 个文件` : '上传')
          : tab === 'url'
            ? (webSubmitting ? '创建任务中' : '导入网页')
            : (mediaSubmitting ? '正在登记' : '添加并解析') }}</span>
      </button>
    </template>
  </MsModal>
</template>

<style scoped>
.ctx-pill { font-size: 11px; border-radius: 6px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px; transition: all .15s }
.media-route-notice { padding: 10px 11px; border: 1px solid; border-radius: 10px; display: flex; align-items: flex-start; gap: 9px; font-size: 10.5px; line-height: 1.45; }
.media-route-notice--dark { color: #fbbf24; border-color: rgba(251,191,36,.22); background: rgba(251,191,36,.065); }
.media-route-notice--light { color: #b45309; border-color: rgba(217,119,6,.22); background: rgba(251,191,36,.09); }
.media-route-notice > i { margin-top: 1px; font-size: 15px; flex: none; }
.media-route-notice strong, .media-route-notice span { display: block; }
.media-route-notice strong { font-size: 11px; }
.media-route-notice span { margin-top: 2px; opacity: .82; }
.media-route-notice button, .speech-provider-summary button { flex: none; color: var(--brand); font-weight: 650; }
.media-route-notice button { margin-top: 1px; font-size: 10px; }
.speech-provider-summary { min-height: 58px; padding: 9px 10px; border: 1px solid; border-radius: 10px; display: flex; align-items: center; gap: 9px; }
.speech-provider-summary--dark { border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.025); }
.speech-provider-summary--light { border-color: rgba(18,28,45,.09); background: rgba(18,28,45,.025); }
.speech-provider-summary__icon { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--brand); background: rgba(var(--brand-rgb),.1); flex: none; }
.speech-provider-summary strong, .speech-provider-summary small { display: block; }
.speech-provider-summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.speech-provider-summary small { margin-top: 3px; font-size: 9.8px; line-height: 1.4; opacity: .68; }
.speech-provider-summary button { font-size: 10px; }
.media-preset-select { position: relative; min-width: 0; }
.media-preset-select__trigger { width: 100%; height: 38px; min-height: 38px; padding: 3px 9px 3px 10px; border: 1px solid; border-radius: 8px; display: flex; align-items: center; gap: 8px; text-align: left; color: inherit; transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease; }
.media-preset-select__trigger--dark { border-color: rgba(255,255,255,.09); background: rgba(255,255,255,.025); }
.media-preset-select__trigger--light { border-color: rgba(18,28,45,.1); background: rgba(18,28,45,.025); }
.media-preset-select__trigger:hover { border-color: rgba(var(--brand-rgb),.42); background: rgba(var(--brand-rgb),.045); }
.media-preset-select__trigger:focus-visible, .media-preset-select__trigger--open { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(var(--brand-rgb),.11); }
.media-preset-select__copy, .media-preset-select__option-copy { min-width: 0; flex: 1; }
.media-preset-select__copy strong, .media-preset-select__copy small, .media-preset-select__option-copy strong, .media-preset-select__option-copy small { display: block; }
.media-preset-select__copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.8px; line-height: 1.1; font-weight: 680; }
.media-preset-select__copy small { margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8.8px; line-height: 1.1; opacity: .62; }
.media-preset-select__chevron { flex: none; font-size: 17px; opacity: .56; transition: transform 160ms ease, color 160ms ease; }
.media-preset-select__trigger--open .media-preset-select__chevron { transform: rotate(180deg); color: var(--brand); opacity: 1; }
.media-preset-select__menu { position: absolute; z-index: 90; top: calc(100% + 6px); left: 0; right: 0; max-height: min(260px, 38vh); overflow-y: auto; overscroll-behavior: contain; padding: 5px; border: 1px solid; border-radius: 10px; box-shadow: 0 16px 38px rgba(0,0,0,.18); scrollbar-width: thin; scrollbar-color: rgba(var(--brand-rgb),.46) rgba(128,140,160,.08); }
.media-preset-select__menu--dark, .media-preset-select__menu--light { border-color: var(--border-card); background: var(--bg-l2); }
.media-preset-select__menu::-webkit-scrollbar { width: 7px; }
.media-preset-select__menu::-webkit-scrollbar-track { margin: 5px 0; border-radius: 999px; background: rgba(128,140,160,.08); }
.media-preset-select__menu::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(var(--brand-rgb),.48); background-clip: padding-box; }
.media-preset-select__menu::-webkit-scrollbar-thumb:hover { background: var(--brand-hover); background-clip: padding-box; }
.media-preset-select__option { width: 100%; min-height: 44px; padding: 5px 8px; border-radius: 7px; display: flex; align-items: center; gap: 8px; text-align: left; color: inherit; transition: color 140ms ease, background-color 140ms ease; }
.media-preset-select__option:hover, .media-preset-select__option--active:not(.media-preset-select__option--selected) { background: rgba(128,140,160,.09); }
.media-preset-select__option--selected { color: var(--brand); background: rgba(var(--brand-rgb),.1); }
.media-preset-select__option:focus-visible { outline: none; box-shadow: inset 0 0 0 2px rgba(var(--brand-rgb),.34); }
.media-preset-select__option-copy strong { font-size: 11px; font-weight: 680; }
.media-preset-select__option-copy small { margin-top: 2px; font-size: 9px; line-height: 1.3; opacity: .64; }
.media-preset-select__check { width: 20px; height: 20px; border: 1px solid rgba(128,140,160,.22); border-radius: 50%; display: grid; place-items: center; color: transparent; flex: none; font-size: 11px; }
.media-preset-select__option--selected .media-preset-select__check { color: #fff; border-color: var(--brand); background: var(--brand); }
.media-preset-menu-enter-active, .media-preset-menu-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.media-preset-menu-enter-from, .media-preset-menu-leave-to { opacity: 0; transform: translateY(-4px); }
.thin-scroll::-webkit-scrollbar { width: 6px }
.thin-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.2); border-radius: 3px }
.thin-scroll::-webkit-scrollbar-thumb:hover { background: rgba(127,127,127,.4) }
@media (max-width: 560px) {
  .media-route-notice { align-items: flex-start; flex-wrap: wrap; }
  .media-route-notice button { margin-left: 24px; }
  .speech-provider-summary { align-items: flex-start; }
  .media-preset-row { grid-template-columns: minmax(0,1fr); }
  .media-preset-row > div:last-child { width: 100%; justify-content: center; }
  .media-preset-select__trigger { height: 44px; min-height: 44px; }
  .media-preset-select__copy small { white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .media-preset-select__trigger, .media-preset-select__chevron, .media-preset-select__option, .media-preset-menu-enter-active, .media-preset-menu-leave-active { transition: none; }
}
</style>
