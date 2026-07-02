<script setup>
import { computed } from 'vue'
import MsModal from '@/components/MsModal/MsModal.vue'
import { BETA_RELEASE } from '@/config/beta'

const props = defineProps({
  show: Boolean,
  isDark: Boolean,
  updateInfo: Object,
  checking: Boolean,
  downloading: Boolean,
  downloadProgress: { type: Number, default: 0 },
  downloaded: Boolean,
  error: String,
})

const emit = defineEmits(['update:show', 'check', 'download', 'install'])

const fallbackUrl = computed(() => props.updateInfo?.fallbackUrl || BETA_RELEASE.downloadUrl || '')
const safeProgress = computed(() => Math.max(0, Math.min(100, Number(props.downloadProgress) || 0)))

function setShow(value) {
  emit('update:show', value)
}

function stringifyReleaseNotes(value) {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        return [item.version ? `v${item.version}` : '', item.note || item.notes || item.releaseNotes || '']
          .filter(Boolean)
          .join('\n')
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return String(value)
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function collectNodeText(node) {
  if (!node) return ''
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  if (node.tagName === 'A') return node.textContent || ''
  return Array.from(node.childNodes).map(collectNodeText).join(' ')
}

function parseHtmlNotes(raw) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, 'text/html')
  const blocks = Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li'))
  const source = blocks.length ? blocks : Array.from(doc.body.childNodes)
  return source
    .map((node) => {
      const text = normalizeText(collectNodeText(node))
      if (!text) return null
      const tag = node.tagName ? node.tagName.toLowerCase() : ''
      return {
        type: /^h[1-6]$/.test(tag) ? 'heading' : 'item',
        text,
      }
    })
    .filter(Boolean)
}

const releaseNoteItems = computed(() => {
  const raw = stringifyReleaseNotes(props.updateInfo?.releaseNotes)
  if (!raw) return []
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(raw)
  const parsed = hasHtml
    ? parseHtmlNotes(raw)
    : raw
        .split(/\r?\n+/)
        .map((line, index) => ({ type: index === 0 ? 'heading' : 'item', text: normalizeText(line) }))
        .filter((item) => item.text)

  const seen = new Set()
  return parsed.filter((item) => {
    const key = item.type + ':' + item.text
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const hasFallback = computed(() => /^https?:\/\//i.test(fallbackUrl.value))

function openFallback() {
  if (!hasFallback.value) return
  window.electronAPI?.openExternal?.(fallbackUrl.value)
}
</script>

<template>
  <MsModal :show="show" :width="420" :show-footer="true" :closable="true" @update:show="setShow">
    <template #header>
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center"
          :class="isDark ? 'bg-brand-400/12' : 'bg-brand-50'">
          <i class="ri-upload-2-line text-[18px]" :class="isDark ? 'text-brand-400' : 'text-brand-500'" />
        </div>
        <div>
          <div class="text-[14px] font-bold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
            {{ error && !updateInfo ? '更新检查失败' : '发现新版本' }}
          </div>
          <div class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
            {{ updateInfo?.version ? `v${updateInfo.version} 可用` : '可使用备用下载' }}
          </div>
        </div>
      </div>
    </template>

    <div class="space-y-3">
      <p v-if="updateInfo" class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        新版本
        <span class="font-semibold" :class="isDark ? 'text-brand-400' : 'text-brand-500'">
          v{{ updateInfo.version }}
        </span>
        已发布，建议更新以获得最新功能和修复。
      </p>
      <p v-else class="text-[12px]" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">
        自动更新需要连接 GitHub Releases。如果当前网络无法访问，可以稍后重试，或使用备用网盘下载。
      </p>

      <div
        v-if="releaseNoteItems.length"
        class="rounded-lg px-3 py-2.5 text-[11px] max-h-[180px] overflow-y-auto thin-scroll space-y-1.5"
        :class="isDark ? 'bg-d0 border border-d4 text-wt-aux' : 'bg-l2 border border-bdrF text-lt-aux'">
        <div
          v-for="(item, index) in releaseNoteItems"
          :key="index"
          class="leading-relaxed"
          :class="item.type === 'heading' ? (isDark ? 'text-wt-sub font-semibold' : 'text-lt-sub font-semibold') : ''">
          <span v-if="item.type !== 'heading'" class="mr-1.5" :class="isDark ? 'text-brand-400' : 'text-brand-500'">•</span>
          <span>{{ item.text }}</span>
        </div>
      </div>

      <div
        v-if="error"
        class="rounded-lg px-3 py-2 text-[11px] leading-relaxed"
        :class="isDark ? 'bg-amber-400/8 border border-amber-400/20 text-amber-300' : 'bg-amber-50 border border-amber-100 text-amber-700'">
        GitHub 更新连接失败或下载异常，可稍后重试，或使用备用下载链接。
      </div>

      <div v-if="downloading" class="space-y-2">
        <div class="flex items-center justify-between text-[11px]" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">
          <span>正在下载更新...</span>
          <span>{{ safeProgress }}%</span>
        </div>
        <div class="h-2 rounded-full overflow-hidden" :class="isDark ? 'bg-d4' : 'bg-l4'">
          <div
            class="h-full rounded-full bg-brand-400 transition-all duration-300"
            :style="{ width: safeProgress + '%' }" />
        </div>
        <p class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
          退出应用不会自动安装未完成的更新；下次可重新检查或继续下载。
        </p>
      </div>
    </div>

    <template #footer>
      <template v-if="!downloading && !downloaded">
        <button
          @click="setShow(false)"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors"
          :class="isDark ? 'text-wt-aux hover:text-wt-sub' : 'text-lt-aux hover:text-lt-sub'">
          稍后再说
        </button>
        <button
          v-if="error"
          @click="emit('check')"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
          :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">
          <i class="ri-refresh-line text-[11px]" />
          重试
        </button>
        <button
          v-if="hasFallback"
          @click="openFallback"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
          :class="isDark ? 'bg-d3 text-wt-sub hover:bg-d4' : 'bg-l3 text-lt-sub hover:bg-l4'">
          <i class="ri-cloud-line text-[11px]" />
          备用下载
        </button>
        <button
          v-if="updateInfo"
          @click="emit('download')"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
          :disabled="checking"
          :class="
            isDark ? 'bg-brand-400 text-d0 hover:bg-brand-500 disabled:opacity-60' : 'bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60'
          ">
          <i class="ri-download-line text-[11px]" />
          {{ checking ? '检查中' : '立即下载' }}
        </button>
      </template>
      <template v-if="downloaded">
        <button
          @click="emit('install')"
          class="h-8 px-4 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5"
          :class="
            isDark
              ? 'bg-emerald-400 text-d0 hover:bg-emerald-500'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          ">
          <i class="ri-restart-line text-[11px]" />
          重启并安装
        </button>
      </template>
    </template>
  </MsModal>
</template>
