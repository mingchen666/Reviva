<script setup>
import md from '@/utils/markdown'
import { normalizeFilePath, toFileUrl } from '@/utils/fileUrl'
import { computed, ref, watch } from 'vue'
import MindmapPreview from '@/components/preview/MindmapPreview.vue'
import KnowledgeGraphPreview from '@/components/preview/KnowledgeGraphPreview.vue'
import FlashcardPreview from '@/components/preview/FlashcardPreview.vue'
import QuizPreview from '@/components/preview/QuizPreview.vue'
import ChartsPreview from '@/components/preview/ChartsPreview.vue'
import ReferenceContextList from './modals/ReferenceContextList.vue'

const props = defineProps({
  artifact: Object,
  task: Object,
  ctxItems: { type: Array, default: () => [] },
  isDark: Boolean,
})
const emit = defineEmits(['close', 'delete'])

const typeLabels = {
  summary: '摘要', mindmap: '思维导图', flashcard: '闪卡',
  quiz: '测验', chart: '图表', ppt: 'PPT', presentation: 'PPT', podcast: '播客', graph: '知识图谱', research: '深度研究', custom: '自定义',
}

const typeLabel = computed(() => typeLabels[props.artifact?.type] || props.artifact?.type || '')

const referenceItems = computed(() => {
  const params = props.task?.params || {}
  const savedItems = Array.isArray(params.ctxItems)
    ? params.ctxItems.filter(item => item?.name || item?.path || item?.kbId || item?.docId)
    : []
  if (savedItems.length) return savedItems

  const savedNames = Array.isArray(params.ctxNames)
    ? params.ctxNames.map(name => String(name || '').trim()).filter(Boolean)
    : []
  if (savedNames.length) {
    return savedNames.map((name, index) => ({
      type: 'reference_name',
      id: `reference_name_${index}`,
      name,
      icon: 'ri-bookmark-3-line',
    }))
  }

  if (props.task?.id) return []
  return (props.ctxItems || []).filter(item => item?.name || item?.path || item?.kbId || item?.docId)
})

const isFile = computed(() => props.artifact?.storage_type === 'file')
const isData = computed(() => props.artifact?.storage_type === 'data')
const isMindmap = computed(() => props.artifact?.type === 'mindmap')
const isGraph = computed(() => props.artifact?.type === 'graph')
const isFlashcard = computed(() => props.artifact?.type === 'flashcard')
const isQuiz = computed(() => props.artifact?.type === 'quiz')
const isChart = computed(() => props.artifact?.type === 'chart')
const isPodcast = computed(() => props.artifact?.type === 'podcast')

// For structured data renderers: parse JSON from artifact.content and adapt to preview props.
const parsedDataPayload = computed(() => {
  if (!isData.value || !props.artifact?.content) return null
  if (!isMindmap.value && !isGraph.value && !isFlashcard.value && !isQuiz.value && !isChart.value) return null
  try {
    const json = JSON.parse(props.artifact.content)
    return { result_json: { artifact_id: props.artifact.id, ...json } }
  } catch (e) {
    console.error('[ArtifactModal] failed to parse structured JSON:', e)
    return null
  }
})

const fileExt = computed(() => {
  const fp = props.artifact?.file_path || ''
  return fp.split('.').pop().toLowerCase()
})

const isMdFile = computed(() => isFile.value && ['md', 'markdown'].includes(fileExt.value))
const isHtmlFile = computed(() => isFile.value && ['html', 'htm'].includes(fileExt.value))
const isAudioFile = computed(() => isFile.value && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(fileExt.value))
const isPlainTextFile = computed(() => isFile.value && ['txt', 'json'].includes(fileExt.value))
const isPptFile = computed(() => isFile.value && ['ppt', 'pptx'].includes(fileExt.value))
const mediaFileUrl = computed(() => toFileUrl(props.artifact?.file_path))

const loadedFileContent = ref('')
const fileLoadError = ref('')
const fileLoading = ref(false)
const htmlFrameLoading = ref(false)
const renderedFileContent = computed(() => {
  if (!loadedFileContent.value) return ''
  return md.render(loadedFileContent.value)
})

const htmlBaseUrl = computed(() => {
  const fp = normalizeFilePath(props.artifact?.file_path || '')
  if (!fp) return ''
  const dir = fp.replace(/[\\/][^\\/]*$/, '')
  return dir ? toFileUrl(`${dir}/`) : ''
})

const htmlPreviewContent = computed(() => {
  if (!isHtmlFile.value || !loadedFileContent.value) return ''
  const baseUrl = htmlBaseUrl.value
  if (!baseUrl || /<base\s/i.test(loadedFileContent.value)) return loadedFileContent.value
  const baseTag = `<base href="${escapeHtmlAttr(baseUrl)}">`
  if (/<head\b[^>]*>/i.test(loadedFileContent.value)) {
    return loadedFileContent.value.replace(/<head\b[^>]*>/i, match => `${match}\n${baseTag}`)
  }
  return `${baseTag}\n${loadedFileContent.value}`
})

const htmlLoadingText = computed(() => {
  if (fileLoading.value) return '正在读取 HTML 文件...'
  if (htmlFrameLoading.value) return '正在渲染 PPT 预览...'
  return '正在准备 HTML 预览...'
})

let loadSeq = 0
watch(
  () => [props.artifact?.id, props.artifact?.file_path, fileExt.value],
  () => {
    loadArtifactFile()
  },
  { immediate: true }
)

watch(htmlPreviewContent, (content) => {
  htmlFrameLoading.value = !!content
})

async function loadArtifactFile() {
  const seq = ++loadSeq
  loadedFileContent.value = ''
  fileLoadError.value = ''
  fileLoading.value = false
  htmlFrameLoading.value = false
  if (!props.artifact?.file_path || !window.electronAPI?.readFile) return
  if (!isMdFile.value && !isPlainTextFile.value && !isHtmlFile.value) return

  try {
    fileLoading.value = true
    const result = await window.electronAPI.readFile(props.artifact.file_path)
    if (seq !== loadSeq) return
    if (typeof result === 'string') {
      loadedFileContent.value = result
    } else if (typeof result?.data === 'string') {
      loadedFileContent.value = result.data
    } else if (result?.success === false) {
      throw new Error(result.error || '文件读取失败')
    }
  } catch (e) {
    if (seq !== loadSeq) return
    fileLoadError.value = e?.message || '文件读取失败'
    console.error('[ArtifactModal] readFile error:', e)
  } finally {
    if (seq === loadSeq) fileLoading.value = false
  }
}

function escapeHtmlAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function handleHtmlFrameLoad() {
  htmlFrameLoading.value = false
}

const renderedContent = computed(() => {
  if (!isData.value || !props.artifact?.content) return ''
  const type = props.artifact.type
  if (['summary', 'research', 'custom'].includes(type)) return md.render(props.artifact.content)
  return ''
})

// JSON viewer for unsupported data types (not mindmap/graph)
const isRawJsonData = computed(() => {
  if (!isData.value || !props.artifact?.content) return false
  return !['summary', 'research', 'mindmap', 'graph', 'flashcard', 'quiz', 'chart'].includes(props.artifact.type)
})

function openFile() {
  if (props.artifact?.file_path && window.electronAPI?.openPath) window.electronAPI.openPath(props.artifact.file_path)
}

function showInFolder() {
  if (props.artifact?.file_path && window.electronAPI?.showItemInFolder) window.electronAPI.showItemInFolder(props.artifact.file_path)
}

function handleDelete() { emit('delete', props.artifact) }

// Mindmap / Graph render in fullscreen modal — different sizing
const isFullscreenRenderer = computed(() => isMindmap.value || isGraph.value || isFlashcard.value || isQuiz.value || isChart.value || isHtmlFile.value)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center" @click.self="emit('close')">
    <!-- Backdrop -->
    <div class="absolute inset-0" :class="isDark ? 'bg-black/50' : 'bg-black/30'" @click="emit('close')" />

    <!-- Modal -->
    <div class="relative rounded-xl overflow-hidden shadow-2xl flex flex-col"
      :class="[
        isDark ? 'bg-d2 border border-d4' : 'bg-l2 border border-bdrF',
        isFullscreenRenderer ? 'w-[92vw] h-[88vh] max-w-[1280px]' : 'w-[560px] max-h-[80vh]'
      ]">

      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 shrink-0"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          :class="isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500'">
          <i :class="(artifact?.icon || 'ri-file-line') + ' text-[18px]'" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ artifact?.title }}</div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[10px] px-1.5 py-0.5 rounded-md"
              :class="isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500'">{{ typeLabel }}</span>
            <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ artifact?.agent_name }}</span>
          </div>
        </div>
        <button @click="emit('close')"
          class="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'">
          <i class="ri-close-line text-[16px]" />
        </button>
      </div>

      <div
        v-if="referenceItems.length"
        class="px-4 py-2.5 shrink-0"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
        <ReferenceContextList
          :items="referenceItems"
          :is-dark="isDark"
          title="生成参考"
          accent-class="text-brand-400" />
      </div>

      <!-- Content -->
      <div class="flex-1 min-h-0 overflow-hidden"
        :class="isFullscreenRenderer ? '' : 'overflow-y-auto p-4'">

        <!-- Mindmap renderer -->
        <MindmapPreview v-if="isMindmap && parsedDataPayload"
          :data="parsedDataPayload" :is-dark="isDark" />

        <!-- Knowledge Graph renderer -->
        <KnowledgeGraphPreview v-else-if="isGraph && parsedDataPayload"
          :data="parsedDataPayload" :is-dark="isDark" />

        <!-- Flashcard renderer -->
        <FlashcardPreview v-else-if="isFlashcard && parsedDataPayload"
          :data="parsedDataPayload" :is-dark="isDark" />

        <!-- Quiz renderer -->
        <QuizPreview v-else-if="isQuiz && parsedDataPayload"
          :data="parsedDataPayload" :is-dark="isDark" />

        <!-- Chart renderer -->
        <ChartsPreview v-else-if="isChart && parsedDataPayload"
          :data="parsedDataPayload" :is-dark="isDark" />

        <!-- Parse error for structured data renderers -->
        <div v-else-if="(isMindmap || isGraph || isFlashcard || isQuiz || isChart) && !parsedDataPayload"
          class="flex flex-col items-center gap-2 py-8"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-error-warning-line text-[24px]" />
          <p class="text-[12px]">数据解析失败，内容不是合法 JSON</p>
        </div>

        <!-- Audio file: inline preview -->
        <div v-else-if="isAudioFile" class="flex flex-col gap-4 py-4">
          <div class="rounded-xl p-4"
            :class="isDark ? 'bg-d3 border border-d4' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center"
                :class="isDark ? 'bg-agent-400/10 text-agent-400' : 'bg-violet-50 text-agent-500'">
                <i class="ri-music-2-line text-[20px]" />
              </div>
              <div class="min-w-0">
                <div class="text-[13px] font-semibold truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ artifact?.title }}</div>
                <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ artifact?.file_path }}</div>
              </div>
            </div>
            <audio controls :src="mediaFileUrl" class="w-full" preload="metadata" />
          </div>
        </div>

        <!-- File read error -->
        <div v-else-if="fileLoadError && (isMdFile || isPlainTextFile || isHtmlFile)" class="flex flex-col items-center gap-3 py-8 px-4">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center"
            :class="isDark ? 'bg-red-400/10 text-red-400' : 'bg-red-50 text-red-500'">
            <i class="ri-error-warning-line text-[24px]" />
          </div>
          <div class="text-center max-w-[420px]">
            <p class="text-[13px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">文件读取失败</p>
            <p class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fileLoadError }}</p>
          </div>
          <button @click="openFile"
            class="h-8 px-4 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            :class="isDark ? 'bg-brand-400 text-white hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
            <i class="ri-external-link-line text-[12px]" />用系统应用打开
          </button>
        </div>

        <!-- Markdown file: render content inline -->
        <div v-else-if="isMdFile && renderedFileContent" class="md-content rounded-lg p-4 text-[13px] leading-relaxed"
          :class="isDark ? 'bg-d3' : 'bg-l3'" v-html="renderedFileContent" />

        <!-- Text / JSON file: inline preview -->
        <pre v-else-if="isPlainTextFile && loadedFileContent"
          class="rounded-lg p-4 text-[12px] leading-relaxed overflow-auto whitespace-pre-wrap"
          :class="isDark ? 'bg-d3 text-wt-sub' : 'bg-l3 text-lt-sub'">{{ loadedFileContent }}</pre>

        <!-- HTML file: inline preview -->
        <div v-else-if="isHtmlFile" class="h-full flex flex-col">
          <div class="h-9 px-3 flex items-center gap-2 shrink-0"
            :class="isDark ? 'bg-d3 border-b border-d4' : 'bg-l3 border-b border-bdrL'">
            <i class="ri-html5-line text-[13px]" :class="isDark ? 'text-sky-400' : 'text-sky-500'" />
            <span class="text-[11px] truncate min-w-0" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ artifact?.file_path }}</span>
            <div class="ml-auto flex items-center gap-1 shrink-0">
              <button @click="openFile"
                class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
                title="用系统应用打开">
                <i class="ri-external-link-line text-[12px]" />
              </button>
              <button @click="showInFolder"
                class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-aux hover:text-wt-sub hover:bg-white/5' : 'text-lt-aux hover:text-lt-sub hover:bg-l4'"
                title="所在目录">
                <i class="ri-folder-open-line text-[12px]" />
              </button>
            </div>
          </div>
          <div class="relative flex-1 min-h-0 bg-white">
            <iframe v-if="htmlPreviewContent"
              :key="artifact?.id || artifact?.file_path"
              :srcdoc="htmlPreviewContent"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              class="absolute inset-0 h-full w-full border-0 bg-white"
              @load="handleHtmlFrameLoad" />
            <div v-if="!htmlPreviewContent || fileLoading || htmlFrameLoading"
              class="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-[1px]">
              <div class="text-center text-slate-500">
                <i class="ri-loader-4-line text-[22px] animate-spin" />
                <p class="text-[12px] mt-2">{{ htmlLoadingText }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- PPTX/PPT file: system app only -->
        <div v-else-if="isPptFile" class="flex flex-col items-center gap-4 py-8">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center"
            :class="isDark ? 'bg-brand-400/10 text-brand-400' : 'bg-brand-50 text-brand-500'">
            <i class="ri-file-ppt-line text-[28px]" />
          </div>
          <div class="text-center max-w-[420px]">
            <p class="text-[13px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ artifact?.title || 'PPT 文件' }}</p>
            <p class="text-[11px] mt-1 leading-relaxed" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
              PPTX/PPT 文件暂不支持应用内预览，请使用系统应用打开。
            </p>
            <p class="text-[10px] mt-2 truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ artifact?.file_path }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button @click="openFile"
              class="h-8 px-4 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'bg-brand-400 text-white hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
              <i class="ri-external-link-line text-[12px]" />用系统应用打开
            </button>
            <button @click="showInFolder"
              class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">
              <i class="ri-folder-open-line text-[12px]" />所在目录
            </button>
          </div>
        </div>

        <!-- Other file types: generic open -->
        <div v-else-if="isFile && !isMdFile && !isHtmlFile && !isPptFile" class="flex flex-col items-center gap-4 py-6">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center"
            :class="isDark ? 'bg-brand-400/8 text-brand-400' : 'bg-brand-50 text-brand-500'">
            <i class="ri-file-3-line text-[24px]" />
          </div>
          <div class="text-center">
            <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ artifact?.file_path }}</p>
            <p class="text-[11px] mt-1" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文件成果，点击下方按钮打开</p>
          </div>
          <div class="flex items-center gap-2">
            <button @click="openFile"
              class="h-8 px-4 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'bg-brand-400 text-white hover:bg-brand-500' : 'bg-brand-500 text-white hover:bg-brand-600'">
              <i class="ri-external-link-line text-[12px]" />打开文件
            </button>
            <button @click="showInFolder"
              class="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">
              <i class="ri-folder-open-line text-[12px]" />所在目录
            </button>
          </div>
        </div>

        <!-- Data type: Markdown rendered -->
        <div v-else-if="isData && renderedContent" class="md-content rounded-lg p-4 text-[13px] leading-relaxed"
          :class="isDark ? 'bg-d3' : 'bg-l3'" v-html="renderedContent" />

        <!-- Data type: JSON placeholder for unsupported types -->
        <div v-else-if="isRawJsonData" class="flex flex-col items-center gap-3 py-8">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center"
            :class="isDark ? 'bg-emerald-400/8 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">
            <i :class="(artifact?.icon || 'ri-file-3-line') + ' text-[24px]'" />
          </div>
          <p class="text-[13px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ typeLabel }}渲染器</p>
          <p class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">该类型的可视化渲染器将在后续版本中接入</p>
          <div class="w-full rounded-lg p-3 mt-2" :class="isDark ? 'bg-d3' : 'bg-l3'">
            <pre class="text-[11px] font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto"
              :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ artifact?.content }}</pre>
          </div>
        </div>

        <!-- Empty content -->
        <div v-else class="flex flex-col items-center gap-2 py-8"
          :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          <i class="ri-file-line text-[24px]" />
          <p class="text-[12px]">暂无内容</p>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="flex items-center justify-between px-4 py-2.5 shrink-0"
        :class="isDark ? 'border-t border-d4' : 'border-t border-bdrL'">
        <div class="flex items-center gap-2">
          <button class="text-[11px] font-medium flex items-center gap-1 transition-colors"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
            <i class="ri-share-line text-[11px]" />分享
          </button>
          <button class="text-[11px] font-medium flex items-center gap-1 transition-colors"
            :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
            <i class="ri-download-line text-[11px]" />下载
          </button>
        </div>
        <button @click="handleDelete"
          class="text-[11px] font-medium flex items-center gap-1 transition-colors"
          :class="isDark ? 'text-red-400 hover:text-red-500' : 'text-red-500 hover:text-red-600'">
          <i class="ri-delete-bin-line text-[11px]" />删除
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-content h1, .md-content h2, .md-content h3, .md-content h4 { font-weight: 700; margin: 0.6em 0 0.3em; }
.md-content h1 { font-size: 1.2em; }
.md-content h2 { font-size: 1.1em; }
.md-content p { margin: 0.4em 0; }
.md-content ul, .md-content ol { padding-left: 1.5em; margin: 0.4em 0; }
.md-content code { font-family: 'SF Mono', ui-monospace, monospace; font-size: 0.88em; padding: 2px 5px; border-radius: 4px; }
.md-content pre { border-radius: 8px; padding: 12px 16px; margin: 0.6em 0; overflow-x: auto; }
.md-content a { color: #6C8AFF; cursor: pointer; }
</style>
