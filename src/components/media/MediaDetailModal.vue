<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MsModal from '@/components/MsModal/MsModal.vue'
import MarkdownImagePreview from '@/components/MarkdownImagePreview.vue'
import { toFileUrl } from '@/utils/fileUrl'

const props = defineProps({
  show: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  item: { type: Object, default: null },
})

const emit = defineEmits(['update:show', 'reanalyze', 'updated'])
const api = () => window.electronAPI?.media
const visible = computed({ get: () => props.show, set: value => emit('update:show', value) })
const mediaId = computed(() => props.item?.mediaId || '')
const playerUrl = computed(() => props.item?.path && !props.item?.remoteMediaReference ? toFileUrl(props.item.path) : '')
const isVideo = computed(() => props.item?.mediaType === 'video' || /\.(mp4|mov|mkv|webm|m4v|avi)$/i.test(props.item?.name || ''))
const player = ref(null)
const loading = ref(false)
const error = ref('')
const feedback = ref('')
const activeTab = ref('transcript')
const metadata = ref(null)
const transcript = ref([])
const transcriptCursor = ref(null)
const transcriptTimeline = ref(true)
const frames = ref([])
const history = ref([])
const previewImage = ref(null)
const previewLoadingFrameId = ref('')
let pollTimer = null
let previewRequestId = 0

const activeRun = computed(() => metadata.value?.activeRun || null)
const currentRun = computed(() => metadata.value?.run || null)
const availableModes = computed(() => new Set(metadata.value?.availableModes || []))
const canExportTimeline = computed(() => transcript.value.length > 0 && transcriptTimeline.value)
const statusText = computed(() => {
  const run = activeRun.value || currentRun.value || metadata.value?.latestRun
  if (!run) return '尚未解析'
  if (run.status === 'queued') return '等待解析'
  if (run.status === 'running') return `${run.message || '解析中'} · ${run.progress || 0}%`
  if (run.status === 'ready') return '解析完成'
  if (run.status === 'partial') return '部分完成'
  if (run.status === 'failed') return run.errorMessage || '解析失败'
  if (run.status === 'cancelled') return '已取消'
  return run.status
})

function clearPoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = null
}

function schedulePoll() {
  clearPoll()
  if (!props.show || !activeRun.value) return
  pollTimer = setTimeout(async () => {
    await loadMetadata()
    if (!activeRun.value) await loadPublishedData()
    schedulePoll()
  }, 2500)
}

function formatTime(ms) {
  if (ms === null || ms === undefined) return '无时间戳'
  const value = Math.max(0, Math.round(Number(ms) || 0))
  const hours = Math.floor(value / 3600000)
  const minutes = Math.floor((value % 3600000) / 60000)
  const seconds = Math.floor((value % 60000) / 1000)
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function seekTo(ms) {
  if (!player.value || ms === null || ms === undefined) return
  player.value.currentTime = Math.max(0, Number(ms) || 0) / 1000
  player.value.play?.().catch(() => {})
}

function closeFramePreview() {
  previewRequestId += 1
  previewImage.value = null
  previewLoadingFrameId.value = ''
}

async function openFramePreview(frame) {
  if (!frame?.id || !frame.dataUrl || previewLoadingFrameId.value) return
  const requestId = ++previewRequestId
  const requestedMediaId = mediaId.value
  previewLoadingFrameId.value = frame.id

  try {
    let asset = null
    try {
      asset = await api()?.readFrame?.(requestedMediaId, frame.id, { thumbnail: false })
    } catch {
      // The loaded thumbnail remains a usable preview when the original frame is unavailable.
    }
    if (requestId !== previewRequestId || !props.show || requestedMediaId !== mediaId.value) return
    const timestamp = formatTime(frame.timestampMs)
    const title = props.item?.name || metadata.value?.media?.title || '视频关键帧'
    previewImage.value = {
      src: asset?.success && asset.dataUrl ? asset.dataUrl : frame.dataUrl,
      alt: `${title} ${timestamp}`,
      title: `${title} · ${timestamp}`,
    }
  } finally {
    if (requestId === previewRequestId) previewLoadingFrameId.value = ''
  }
}

async function loadMetadata() {
  if (!mediaId.value) return
  const result = await api()?.query?.({ mediaId: mediaId.value, mode: 'metadata' })
  if (!result?.success) throw new Error(result?.message || '媒体状态读取失败')
  metadata.value = result
}

async function loadTranscript({ append = false } = {}) {
  if (!availableModes.value.has('transcript')) { transcript.value = []; transcriptCursor.value = null; return }
  const result = await api()?.query?.({
    mediaId: mediaId.value,
    mode: 'transcript',
    limit: 100,
    maxChars: 20000,
    ...(append && transcriptCursor.value ? { cursor: transcriptCursor.value } : {}),
  })
  if (!result?.success) throw new Error(result?.message || '转录读取失败')
  transcript.value = append ? [...transcript.value, ...(result.segments || [])] : (result.segments || [])
  transcriptCursor.value = result.nextCursor || null
  transcriptTimeline.value = result.timelineAvailable !== false
}

async function loadFrames() {
  if (!availableModes.value.has('frames')) { frames.value = []; return }
  const result = await api()?.query?.({ mediaId: mediaId.value, mode: 'frames', limit: 24 })
  if (!result?.success) throw new Error(result?.message || '关键帧读取失败')
  const loaded = await Promise.all((result.frames || []).map(async frame => {
    const asset = await api()?.readFrame?.(mediaId.value, frame.id, { thumbnail: true })
    return { ...frame, dataUrl: asset?.success ? asset.dataUrl : '' }
  }))
  frames.value = loaded
}

async function loadHistory() {
  const result = await api()?.history?.(mediaId.value, { limit: 50 })
  if (!result?.success) throw new Error(result?.message || '解析历史读取失败')
  history.value = result.runs || []
}

async function loadPublishedData() {
  await Promise.all([loadTranscript(), loadFrames(), loadHistory()])
}

async function loadAll() {
  clearPoll()
  if (!mediaId.value) { error.value = '该媒体尚未登记。'; return }
  loading.value = true
  error.value = ''
  feedback.value = ''
  try {
    await loadMetadata()
    await loadPublishedData()
  } catch (e) {
    error.value = e?.message || '媒体详情加载失败'
  } finally {
    loading.value = false
    schedulePoll()
  }
}

async function restoreRun(runId) {
  feedback.value = ''
  const result = await api()?.restoreRun?.(mediaId.value, runId)
  if (!result?.success) { feedback.value = result?.message || '恢复失败'; return }
  emit('updated', props.item)
  await loadAll()
  feedback.value = '已恢复该解析版本'
}

async function exportTranscript(format) {
  feedback.value = ''
  const result = await api()?.exportTranscript?.(mediaId.value, { format })
  if (!result?.success) { feedback.value = result?.message || '导出失败'; return }
  const filters = {
    txt: [{ name: 'Text', extensions: ['txt'] }],
    json: [{ name: 'JSON', extensions: ['json'] }],
    srt: [{ name: 'SubRip', extensions: ['srt'] }],
    vtt: [{ name: 'WebVTT', extensions: ['vtt'] }],
  }
  const saved = await window.electronAPI?.saveTextFile?.({
    title: '导出媒体转录',
    defaultPath: result.fileName,
    defaultExtension: format,
    filters: filters[format],
  }, result.content)
  feedback.value = saved?.success ? '转录已导出' : (saved?.canceled ? '' : saved?.error || '保存失败')
}

function requestReanalyze() {
  emit('reanalyze', props.item)
  setTimeout(() => loadAll(), 600)
}

watch(() => [props.show, mediaId.value], ([show]) => {
  closeFramePreview()
  if (show) loadAll()
  else clearPoll()
}, { immediate: true })

onBeforeUnmount(() => {
  clearPoll()
  closeFramePreview()
})
</script>

<template>
  <MsModal v-model:show="visible" :width="980" :show-footer="false" :closable="!previewImage">
    <template #header>
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" :class="isDark ? 'bg-violet-400/10 text-violet-300' : 'bg-violet-50 text-violet-600'">
          <i :class="isVideo ? 'ri-movie-2-line' : 'ri-music-2-line'" class="text-[18px]" />
        </div>
        <div class="min-w-0">
          <div class="text-[13px] font-bold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ item?.name || metadata?.media?.title || '媒体详情' }}</div>
          <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ statusText }}</div>
        </div>
      </div>
    </template>

    <div class="media-detail" :class="isDark ? 'media-detail--dark' : 'media-detail--light'">
      <div v-if="loading" class="empty-state"><i class="ri-loader-4-line animate-spin" /><span>正在加载媒体详情</span></div>
      <div v-else-if="error" class="empty-state text-red-400"><i class="ri-error-warning-line" /><span>{{ error }}</span><button @click="loadAll">重试</button></div>
      <template v-else>
        <section class="media-summary">
          <div class="media-player">
            <video v-if="isVideo && playerUrl" ref="player" controls :src="playerUrl" />
            <audio v-else-if="playerUrl" ref="player" controls :src="playerUrl" />
            <div v-else class="remote-placeholder"><i class="ri-cloud-line" /><span>公网媒体仅保存解析结果，不缓存原片</span></div>
          </div>
          <div class="summary-grid">
            <div><span>类型</span><strong>{{ metadata?.media?.mediaType || '-' }}</strong></div>
            <div><span>时长</span><strong>{{ metadata?.media?.durationMs ? formatTime(metadata.media.durationMs) : '-' }}</strong></div>
            <div><span>解析版本</span><strong>{{ currentRun?.pipelineVersion || '-' }}</strong></div>
            <div><span>语音模型</span><strong>{{ currentRun?.sttModelId || '字幕/未使用' }}</strong></div>
          </div>
          <div class="summary-actions">
            <button @click="loadAll"><i class="ri-refresh-line" />刷新</button>
            <button @click="requestReanalyze"><i class="ri-loop-right-line" />重新解析</button>
            <div class="export-actions">
              <button @click="exportTranscript('txt')">TXT</button>
              <button @click="exportTranscript('json')">JSON</button>
              <button :disabled="!canExportTimeline" @click="exportTranscript('srt')">SRT</button>
              <button :disabled="!canExportTimeline" @click="exportTranscript('vtt')">VTT</button>
            </div>
          </div>
          <div v-if="feedback" class="feedback">{{ feedback }}</div>
        </section>

        <nav class="detail-tabs">
          <button :class="{ active: activeTab === 'transcript' }" @click="activeTab = 'transcript'">转录 <span>{{ transcript.length }}</span></button>
          <button :class="{ active: activeTab === 'frames' }" @click="activeTab = 'frames'">关键帧 <span>{{ frames.length }}</span></button>
          <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">历史 <span>{{ history.length }}</span></button>
        </nav>

        <section v-if="activeTab === 'transcript'" class="detail-body">
          <div v-if="!transcript.length" class="empty-state"><i class="ri-file-text-line" /><span>暂无可读转录</span></div>
          <button v-for="segment in transcript" :key="segment.id + ':' + segment.text" class="transcript-row" :disabled="segment.startMs === null" @click="seekTo(segment.startMs)">
            <time>{{ formatTime(segment.startMs) }}</time>
            <span>{{ segment.text }}</span>
            <em v-if="segment.speaker">{{ segment.speaker }}</em>
          </button>
          <button v-if="transcriptCursor" class="load-more" @click="loadTranscript({ append: true })">继续加载</button>
        </section>

        <section v-else-if="activeTab === 'frames'" class="detail-body">
          <div v-if="!frames.length" class="empty-state"><i class="ri-gallery-line" /><span>暂无关键帧</span></div>
          <div v-else class="frame-grid">
            <button
              v-for="frame in frames"
              :key="frame.id"
              type="button"
              :disabled="!frame.dataUrl || Boolean(previewLoadingFrameId)"
              :title="frame.dataUrl ? `预览 ${formatTime(frame.timestampMs)} 关键帧` : '关键帧图片不可用'"
              @click.stop="openFramePreview(frame)">
              <img v-if="frame.dataUrl" :src="frame.dataUrl" :alt="`${formatTime(frame.timestampMs)} 关键帧`" />
              <div v-else class="frame-missing"><i class="ri-image-line" /></div>
              <div v-if="previewLoadingFrameId === frame.id" class="frame-loading"><i class="ri-loader-4-line animate-spin" /></div>
              <span>{{ formatTime(frame.timestampMs) }}</span>
            </button>
          </div>
        </section>

        <section v-else class="detail-body">
          <div v-if="!history.length" class="empty-state"><i class="ri-history-line" /><span>暂无解析历史</span></div>
          <div v-for="run in history" :key="run.id" class="history-row">
            <div><strong>{{ run.status === 'ready' ? '解析完成' : run.status === 'partial' ? '部分完成' : run.status }}</strong><span>{{ run.sttProviderId || '字幕解析' }} · {{ run.sttModelId || '无模型' }}</span><small>{{ run.finishedAt || run.createdAt }}</small></div>
            <button v-if="['ready','partial'].includes(run.status) && run.id !== metadata?.media?.currentRunId" @click="restoreRun(run.id)">恢复此版本</button>
            <span v-else-if="run.id === metadata?.media?.currentRunId" class="current-badge">当前</span>
          </div>
        </section>
      </template>
    </div>
  </MsModal>
  <MarkdownImagePreview v-if="previewImage" :image="previewImage" @close="closeFramePreview" />
</template>

<style scoped>
.media-detail { min-height: 580px; color: #334155; }
.media-detail--dark { color: rgba(255,255,255,.76); }
.media-summary { display: grid; grid-template-columns: minmax(260px,360px) 1fr; gap: 14px; padding-bottom: 14px; }
.media-player { min-height: 124px; border-radius: 12px; overflow: hidden; background: rgba(0,0,0,.85); display: grid; place-items: center; }
.media-player video { width: 100%; max-height: 210px; }
.media-player audio { width: calc(100% - 28px); }
.remote-placeholder { display: grid; place-items: center; gap: 7px; color: rgba(255,255,255,.62); font-size: 10.5px; }
.remote-placeholder i { font-size: 25px; }
.summary-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; align-content: start; }
.summary-grid > div { min-height: 54px; padding: 10px 12px; border: 1px solid rgba(128,140,160,.14); border-radius: 10px; background: rgba(128,140,160,.045); }
.summary-grid span,.summary-grid strong { display: block; }
.summary-grid span { font-size: 9.5px; opacity: .55; }
.summary-grid strong { margin-top: 5px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-actions { grid-column: 1/-1; display: flex; align-items: center; gap: 7px; }
.summary-actions button,.load-more,.history-row button,.empty-state button { min-height: 30px; padding: 0 10px; border: 1px solid rgba(128,140,160,.16); border-radius: 8px; font-size: 10px; display: inline-flex; align-items: center; gap: 5px; }
.summary-actions button:disabled { opacity: .35; }
.export-actions { display: flex; gap: 4px; margin-left: auto; }
.feedback { grid-column: 1/-1; font-size: 10px; color: #10B981; }
.detail-tabs { height: 42px; display: flex; gap: 3px; border-top: 1px solid rgba(128,140,160,.13); border-bottom: 1px solid rgba(128,140,160,.13); }
.detail-tabs button { padding: 0 15px; font-size: 11px; opacity: .58; position: relative; }
.detail-tabs button.active { opacity: 1; color: #6C8AFF; }
.detail-tabs button.active::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; background: #6C8AFF; }
.detail-tabs span { margin-left: 4px; font-size: 9px; opacity: .6; }
.detail-body { max-height: 390px; overflow-y: auto; padding: 12px 2px; }
.transcript-row { width: 100%; display: grid; grid-template-columns: 58px minmax(0,1fr) auto; gap: 10px; padding: 9px 10px; border-radius: 9px; text-align: left; }
.transcript-row:hover { background: rgba(108,138,255,.07); }
.transcript-row:disabled { cursor: default; }
.transcript-row time { color: #6C8AFF; font-size: 10px; font-variant-numeric: tabular-nums; }
.transcript-row > span { font-size: 11px; line-height: 1.6; }
.transcript-row em { font-size: 9px; font-style: normal; opacity: .5; }
.load-more { margin: 10px auto; display: flex; }
.frame-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; }
.frame-grid button { position: relative; overflow: hidden; border-radius: 10px; background: rgba(0,0,0,.72); aspect-ratio: 16/9; }
.frame-grid button:disabled { cursor: default; }
.frame-grid img { width: 100%; height: 100%; object-fit: cover; }
.frame-grid span { position: absolute; right: 5px; bottom: 5px; padding: 2px 5px; border-radius: 5px; background: rgba(0,0,0,.68); color: #fff; font-size: 9px; }
.frame-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; background: rgba(0,0,0,.38); font-size: 22px; }
.frame-missing { height: 100%; display: grid; place-items: center; color: rgba(255,255,255,.5); font-size: 22px; }
.history-row { min-height: 62px; display: flex; align-items: center; gap: 12px; padding: 9px 11px; border-bottom: 1px solid rgba(128,140,160,.1); }
.history-row > div { min-width: 0; flex: 1; }
.history-row strong,.history-row span,.history-row small { display: block; }
.history-row strong { font-size: 11px; }
.history-row span { margin-top: 3px; font-size: 9.5px; opacity: .62; }
.history-row small { margin-top: 2px; font-size: 9px; opacity: .42; }
.current-badge { padding: 3px 7px; border-radius: 6px; background: rgba(16,185,129,.1); color: #10B981; font-size: 9px; }
.empty-state { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; font-size: 11px; opacity: .7; }
.empty-state i { font-size: 25px; }
@media (max-width: 760px) { .media-summary { grid-template-columns: 1fr; } .frame-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .summary-actions { flex-wrap: wrap; } .export-actions { margin-left: 0; } }
</style>
