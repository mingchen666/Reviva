<script setup>
import { computed } from 'vue'
import { formatFileSize, formatDate, formatWeekday, formatTime, getDateStr } from '@/utils/format'

const props = defineProps({
  file: Object,
  isDark: Boolean,
  extInfo: Object,
  fileContent: { type: String, default: null },
  loadingContent: { type: Boolean, default: false },
  agentDisplayName: { type: String, default: '' },
})

const emit = defineEmits(['openFile', 'openFolder', 'delete'])

const displayAgent = computed(() => props.agentDisplayName || extractAgentFromPath())

function extractAgentFromPath() {
  if (!props.file?.path) return '未知'
  const match = props.file.path.match(/\/agents\/([^/]+)\//)
  if (!match) return '未知'
  return match[1] === '_shared' ? '共享' : match[1]
}

const dateStr = computed(() => {
  if (!props.file?.mtime) return ''
  return getDateStr(props.file.mtime)
})

const weekdayStr = computed(() => {
  if (!dateStr.value) return ''
  return formatWeekday(dateStr.value)
})

const timeStr = computed(() => {
  if (!props.file?.mtime) return ''
  return formatTime(props.file.mtime)
})

const fileSize = computed(() => {
  if (!props.file?.size) return '—'
  return formatFileSize(props.file.size)
})

const isImage = computed(() => {
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(props.file?.extension)
})

const isText = computed(() => {
  return props.file?.previewable && !isImage.value
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header bar -->
    <div class="h-11 flex items-center justify-between px-4 shrink-0" :class="isDark ? 'border-b border-d4' : 'border-b border-bdrL'">
      <div class="flex items-center gap-2.5 min-w-0">
        <i :class="`${extInfo.icon} text-[15px]`" :style="`color:${extInfo.color}`" />
        <span class="text-[14px] font-semibold truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ file.name }}</span>
        <span class="ctx-pill shrink-0" :class="isDark ? 'text-agent-400 bg-agent-400/6 border border-agent-400/20' : 'text-agent-600 bg-agent-50 border border-agent-100'">
          <i class="ri-sparkling-line text-[10px]" />{{ displayAgent }}
        </span>
        <span class="ctx-pill border shrink-0"
          :style="`color:${extInfo.color};background:${isDark ? extInfo.color + '10' : extInfo.color + '15'};border-color:${isDark ? extInfo.color + '20' : extInfo.color + '30'}`">
          {{ extInfo.label }}
        </span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button class="ctx-pill cursor-pointer"
          :class="isDark ? 'text-wt-sub bg-d3 border border-bdr hover:bg-brand-400/8 hover:text-brand-400 hover:border-brand-400/20' : 'text-lt-sub bg-l3 border border-bdrF hover:bg-brand-50 hover:text-brand-600 hover:border-brand-100'"
          @click="emit('openFile')"><i class="ri-file-line text-[10px]" /> 打开文件</button>
        <button class="ctx-pill cursor-pointer"
          :class="isDark ? 'text-wt-sub bg-d3 border border-bdr hover:bg-white/6 hover:text-wt-main' : 'text-lt-sub bg-l3 border border-bdrF hover:bg-l4 hover:text-lt-main'"
          @click="emit('openFolder')"><i class="ri-folder-open-line text-[10px]" /> 打开目录</button>
        <button v-if="isText && fileContent"
          class="ctx-pill cursor-pointer"
          :class="isDark ? 'text-wt-sub bg-d3 border border-bdr hover:bg-white/6 hover:text-wt-main' : 'text-lt-sub bg-l3 border border-bdrF hover:bg-l4 hover:text-lt-main'"
          @click="navigator.clipboard.writeText(fileContent)"><i class="ri-file-copy-line text-[10px]" /> 复制</button>
        <button class="ctx-pill cursor-pointer text-red-400"
        title="删除"
          :class="isDark ? 'text-wt-sub bg-d3 border border-bdr hover:bg-red-400/8 hover:text-red-400 hover:border-red-400/20' : 'text-lt-sub bg-l3 border border-bdrF hover:bg-red-50 hover:text-red-500 hover:border-red-100'"
          @click="emit('delete')"><i class="ri-delete-bin-line text-[12px]" /></button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto thin-scroll">
      <div class="max-w-4xl mx-auto px-7 py-6 fade-up">
        <!-- Info row: 2 columns -->
        <div class="grid gap-5 mb-6">
          <!-- Left: Source + File type -->


          <!-- Right: File info -->
          <div class="rounded-xl p-4" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
            <div class="flex items-center gap-2 mb-3"><i class="ri-information-line text-[14px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'" /><span class="section-title" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">文件信息</span></div>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <i class="ri-calendar-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <div>
                  <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">日期</div>
                  <div class="text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ dateStr }} {{ weekdayStr }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <i class="ri-time-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <div>
                  <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">时间</div>
                  <div class="text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ timeStr }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <i class="ri-hard-drive-2-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <div>
                  <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文件大小</div>
                  <div class="text-[13px] font-medium" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ fileSize }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <i class="ri-folder-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <div class="min-w-0">
                  <div class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">文件路径</div>
                  <div class="text-[13px] font-mono truncate" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ file.path }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Area (full width) -->
        <div class="rounded-xl overflow-hidden" :class="isDark ? 'bg-d3 border border-bdr' : 'bg-l3 border border-bdrF'">
          <div class="flex items-center justify-between px-4 py-2.5" :class="isDark ? 'bg-d4/50' : 'bg-l4'">
            <div class="flex items-center gap-1.5">
              <i class="ri-eye-line text-[14px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <span class="text-[12px] font-semibold" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">内容预览</span>
            </div>
          </div>
          <div class="p-5 min-h-[200px] max-h-[500px] overflow-y-auto thin-scroll">
            <!-- Loading -->
            <div v-if="loadingContent" class="flex items-center justify-center py-10">
              <i class="ri-loader-4-line text-[20px] animate-spin" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <span class="text-[12px] ml-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">加载中...</span>
            </div>
            <!-- Text preview -->
            <div v-else-if="fileContent && isText"
              class="preview-markdown whitespace-pre-wrap text-[12px] leading-relaxed"
              :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ fileContent }}</div>
            <!-- Image placeholder -->
            <div v-else-if="isImage" class="flex items-center justify-center py-10">
              <div class="w-[220px] h-[170px] rounded-xl flex flex-col items-center justify-center gap-2" :class="isDark ? 'bg-d0 border border-d4' : 'bg-l2 border border-bdrF'">
                <i class="ri-image-line text-[36px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
                <span class="text-[12px] font-medium" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ extInfo.label }}</span>
                <span class="text-[11px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fileSize }}</span>
                <button class="ctx-pill mt-1 cursor-pointer"
                  :class="isDark ? 'text-brand-400 bg-brand-400/6' : 'text-brand-600 bg-brand-50'"
                  @click="emit('openFile')"><i class="ri-eye-line text-[10px]" /> 打开查看</button>
              </div>
            </div>
            <!-- No preview -->
            <div v-else class="text-center py-10">
              <i class="ri-file-line text-[28px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'" />
              <p class="text-[12px] mt-2" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">无可预览内容，请用默认程序打开查看</p>
            </div>
          </div>
        </div>

        <div class="h-6" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-markdown :deep(h2) { font-size: 14px; font-weight: 700; margin: 6px 0 3px }
.preview-markdown :deep(h3) { font-size: 13px; font-weight: 600; margin: 4px 0 2px }
.preview-markdown :deep(ul), .preview-markdown :deep(ol) { padding-left: 16px; margin: 3px 0 }
.preview-markdown :deep(li) { margin: 2px 0 }
.preview-markdown :deep(p) { margin: 3px 0 }
.preview-markdown :deep(code) { font-family: "SF Mono", ui-monospace, monospace; font-size: 11px; padding: 1px 4px; border-radius: 3px }
.preview-markdown :deep(strong) { font-weight: 600 }
@keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
.fade-up { animation: fadeUp .2s ease-out }
</style>