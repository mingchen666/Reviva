<script setup>
import { computed, defineComponent, h, inject, nextTick, onMounted, onUpdated, provide, ref, watch } from 'vue'
import { MarkdownRender } from 'markstream-vue'
import { MarkdownCodeBlockNode, setCustomComponents, setKaTeXWorker, setDefaultI18nMap } from 'markstream-vue'
import MarkdownImagePreview from '@/components/MarkdownImagePreview.vue'
import { normalizeFilePath, toFileUrl } from '@/utils/fileUrl'

const IMAGE_SRC_RESOLVER_KEY = 'MarkdownViewImageSrcResolver'
const MARKDOWN_VIEW_CUSTOM_ID = 'mindspace-markdown-view'

const MarkdownImageNode = defineComponent({
  name: 'MarkdownImageNode',
  props: {
    node: { type: Object, required: true },
    fallbackSrc: { type: String, default: '' },
    lazy: { type: Boolean, default: true },
    usePlaceholder: { type: Boolean, default: undefined },
  },
  emits: ['load', 'error', 'click'],
  setup(componentProps, { attrs, emit }) {
    const imageContext = inject(IMAGE_SRC_RESOLVER_KEY, {
      resolve: value => value,
      openPreview: () => {},
      workRoot: computed(() => ''),
    })
    const currentSrc = ref('')
    const failed = ref(false)
    const loaded = ref(false)
    const primarySrc = computed(() => imageContext.resolve(String(componentProps.node?.src || '')))
    const backupSrc = computed(() => (
      componentProps.fallbackSrc ? imageContext.resolve(componentProps.fallbackSrc) : ''
    ))
    watch([primarySrc, backupSrc, () => imageContext.workRoot?.value], () => {
      currentSrc.value = primarySrc.value
      failed.value = false
      loaded.value = false
    }, { immediate: true })
    return () => {
      const node = componentProps.node || {}
      const src = currentSrc.value
      if (!src || failed.value) {
        return h('span', {
          class: 'markdown-image-fallback',
          title: src,
        }, node.alt || src || 'Image failed to load')
      }
      return h('span', { class: 'image-node-container markdown-image-node' }, [
        h('img', {
          ...attrs,
          src,
          alt: node.alt || '',
          title: node.title || node.alt || '',
          loading: componentProps.lazy ? 'lazy' : 'eager',
          decoding: 'async',
          fetchpriority: componentProps.lazy ? 'low' : 'auto',
          tabindex: 0,
          'aria-label': node.alt || node.title || 'image',
          onLoad: event => {
            loaded.value = true
            failed.value = false
            emit('load', src)
            attrs.onLoad?.(event)
          },
          onError: event => {
            if (backupSrc.value && currentSrc.value !== backupSrc.value) {
              currentSrc.value = backupSrc.value
              loaded.value = false
              return
            }
            loaded.value = false
            console.warn('[MarkdownView] Image failed to load:', src)
            failed.value = true
            emit('error', src)
            attrs.onError?.(event)
          },
          onClick: event => {
            if (!loaded.value || failed.value) return
            const payload = [event, src]
            imageContext.openPreview(payload, node)
            emit('click', payload)
            attrs.onClick?.(payload)
          },
          onKeydown: event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (!loaded.value || failed.value) return
            const payload = [event, src]
            imageContext.openPreview(payload, node)
            emit('click', payload)
          },
        }),
      ])
    }
  },
})

setCustomComponents({ code_block: MarkdownCodeBlockNode, image: MarkdownImageNode })
setCustomComponents(MARKDOWN_VIEW_CUSTOM_ID, { code_block: MarkdownCodeBlockNode, image: MarkdownImageNode })
setDefaultI18nMap({
  'common.copy': '复制',
  'common.copySuccess': '已复制',
  'common.expand': '展开',
  'common.collapse': '收起',
  'common.preview': '预览',
  'common.decrease': '减小',
  'common.reset': '重置',
  'common.increase': '增大',
  'common.source': '源码',
  'common.export': '导出',
})

const PREVIEW_EXTENSIONS = new Set([
  'md', 'txt', 'py', 'js', 'ts', 'jsx', 'tsx', 'vue', 'css', 'scss', 'less',
  'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm', 'svg',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1',
  'c', 'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
  'sql', 'graphql', 'proto', 'ini', 'cfg', 'conf', 'env', 'gitignore',
  'log', 'csv', 'tsv',
])

const props = defineProps({
  content: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
  final: { type: Boolean, default: undefined },
  customId: { type: String, default: '' },
  /** Absolute path of the authorized project root, used to resolve relative file links. */
  workRoot: { type: String, default: '' },
})

const emit = defineEmits(['file-click', 'link-click'])

const isFinal = computed(() => {
  if (props.final !== undefined) return props.final
  return !props.isStreaming
})

const smoothMode = computed(() => (props.isStreaming ? 'auto' : false))
const fadeMode = computed(() => !props.isStreaming)
const rendererCustomId = computed(() => props.customId || MARKDOWN_VIEW_CUSTOM_ID)
const previewImage = ref(null)

const EXTERNAL_SCHEME_RE = /^(https?:|mailto:|tel:|ftp:|data:|javascript:|blob:)/i
const LOADABLE_IMAGE_SCHEME_RE = /^(https?:|blob:|reviva-file:)/i
const BLOCKED_IMAGE_SCHEME_RE = /^(javascript:|mailto:|tel:|ftp:|#)/i
const DATA_IMAGE_RE = /^data:image\//i
const WIN_ABS_RE = /^[a-zA-Z]:[\\/]/
const FILE_URI_RE = /^file:\/\/\/?/i

// Matches strings that look like file paths:
// - Windows absolute: C:\foo, D:/bar
// - Unix absolute: /usr/local, /agents/_shared/outputs/...
// - Home-relative: ~/foo, ~\bar
// - Relative: ./src/main.js, ../config/env, agents/_shared/outputs/xxx.md
// - Path with extension: src/utils/markdown.js, components/App.vue
// Excludes: plain words, URLs, email-like strings
const FILE_PATH_RE = /^([a-zA-Z]:[\\\/].+|[\/~][\\\/]?.+|[.][.\/\\~][\\\/].+|[a-zA-Z0-9_\-]+[\\\/].+\.[a-zA-Z0-9]+)$/

function normalize(p) {
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
}

function resolveToAbsolute(href) {
  let raw = href.trim()
  // Decode file:// URIs before resolving. The renderer still loads them through reviva-file://.
  if (FILE_URI_RE.test(raw)) raw = normalizeFilePath(raw)
  // Windows absolute (C:\, D:/) — return as-is
  if (WIN_ABS_RE.test(raw)) return normalize(raw)
  // Home directory ~
  if (raw.startsWith('~')) {
    const home = (typeof process !== 'undefined' && process.env?.HOME) || ''
    if (home) return normalize(home + '/' + raw.replace(/^~[\\\/]*/, ''))
    return normalize(raw)
  }
  // Relative path (including /agents/... style) — resolve against workRoot
  const root = (props.workRoot || '').replace(/[/\\]+$/, '')
  if (!root) return normalize(raw)
  // Strip leading ./ or .\
  const cleaned = raw.replace(/^[.][\\\/]/, '')
  return normalize(root + '/' + cleaned)
}

function splitPathSuffix(value) {
  const text = String(value || '')
  const match = text.match(/^([^?#]*)([?#].*)?$/)
  return {
    pathPart: match?.[1] || text,
    suffix: match?.[2] || '',
  }
}

function resolveImageSrc(src) {
  const raw = String(src || '').trim()
  if (!raw || LOADABLE_IMAGE_SCHEME_RE.test(raw) || DATA_IMAGE_RE.test(raw)) return raw
  if (BLOCKED_IMAGE_SCHEME_RE.test(raw)) return ''

  const { pathPart, suffix } = splitPathSuffix(raw)
  if (!pathPart) return raw
  return toFileUrl(resolveToAbsolute(pathPart)) + suffix
}

function openImagePreview(payload, node = {}) {
  const src = Array.isArray(payload) ? payload[1] : ''
  const resolved = src || resolveImageSrc(String(node.src || ''))
  if (!resolved) return
  previewImage.value = {
    src: resolved,
    alt: node.alt || basename(resolved),
    title: node.title || node.alt || basename(resolved),
  }
}

function closeImagePreview() {
  previewImage.value = null
}

provide(IMAGE_SRC_RESOLVER_KEY, {
  resolve: resolveImageSrc,
  openPreview: openImagePreview,
  workRoot: computed(() => props.workRoot || ''),
})

function basename(p) {
  const norm = normalize(p)
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}

function getExt(path) {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function isPreviewable(ext) {
  return PREVIEW_EXTENSIONS.has(ext)
}

function isFilePath(href) {
  if (!href) return false
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (EXTERNAL_SCHEME_RE.test(trimmed)) return false
  if (trimmed.startsWith('kb:')) return false
  return true
}

// Unified click handler — handles both <a> links and inline code file paths
function onClickCapture(e) {
  // 1. Check <a> links
  const anchor = e.target?.closest?.('a')
  if (anchor) {
    const href = anchor.getAttribute('href') || ''
    if (href.startsWith('kb:')) {
      e.preventDefault()
      e.stopPropagation()
      emit('link-click', { href, text: anchor.textContent || '' })
    } else if (isFilePath(href)) {
      e.preventDefault()
      e.stopPropagation()
      const path = resolveToAbsolute(href)
      const ext = getExt(path)
      emit('file-click', { path, name: basename(path), href, previewable: isPreviewable(ext) })
    }
    return
  }

  // 2. Check inline code that looks like a file path
  const code = e.target?.closest?.('.inline-code.is-file-path')
  if (code) {
    e.preventDefault()
    e.stopPropagation()
    const raw = code.getAttribute('data-file-path') || code.textContent?.trim() || ''
    const path = resolveToAbsolute(raw)
    const ext = getExt(path)
    emit('file-click', { path, name: basename(path), href: raw, previewable: isPreviewable(ext) })
  }
}

// Scan inline code elements and mark those that look like file paths
function markFilePathCodes() {
  const container = refContainer.value
  if (!container) return
  const codes = container.querySelectorAll('.inline-code')
  for (const code of codes) {
    const text = code.textContent?.trim() || ''
    if (FILE_PATH_RE.test(text)) {
      code.classList.add('is-file-path')
      code.setAttribute('data-file-path', text)
    } else {
      code.classList.remove('is-file-path')
      code.removeAttribute('data-file-path')
    }
  }
}

function rewriteRenderedImageSources() {
  const container = refContainer.value
  if (!container) return
  const images = container.querySelectorAll('img[src]')
  for (const image of images) {
    const src = image.getAttribute('src') || ''
    const nextSrc = resolveImageSrc(src)
    if (nextSrc && nextSrc !== src) image.setAttribute('src', nextSrc)
  }
}

function processRenderedMarkdown() {
  markFilePathCodes()
  rewriteRenderedImageSources()
}

const refContainer = ref(null)

onMounted(() => nextTick(processRenderedMarkdown))
onUpdated(() => nextTick(processRenderedMarkdown))
</script>

<template>
  <div ref="refContainer" class="chat-markdown" :class="{ 'chat-markdown--dark': isDark }" @click.capture="onClickCapture">
    <MarkdownRender
      :content="content"
      :final="isFinal"
      :is-dark="isDark"
      :smooth-streaming="smoothMode"
      :fade="fadeMode"
      :typewriter="isStreaming"
      :custom-id="rendererCustomId"
      html-policy="safe"
      :code-block-props="{
        showHeader: true,
        showCopyButton: true,
        showExpandButton: false,
        showPreviewButton: true,
        showCollapseButton: true,
        showFontSizeButtons: false,
        showTooltips: true,
      }" />
    <MarkdownImagePreview :image="previewImage" @close="closeImagePreview" />
  </div>
</template>

<style scoped lang="scss">
@import '@/styles/chat-markdown.scss';
</style>
