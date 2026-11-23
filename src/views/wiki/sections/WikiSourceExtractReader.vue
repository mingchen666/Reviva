<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { findSourceExtractLines, SOURCE_EXTRACT_PAGE_SIZE, sourceExtractSearchSegments, sourceExtractFrontmatterRange, sourceExtractHeadings } from '@/utils/wikiSourceExtract'
import WikiSourceExtractPicker from './WikiSourceExtractPicker.vue'

const props = defineProps({
  state: { type: Object, default: null },
  sources: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  returnTitle: { type: String, default: '' },
})
const emit = defineEmits(['select-source', 'retry', 'back'])

const contentPane = ref(null)
const query = ref('')
const searchTerm = ref('')
const matchIndex = ref(0)
const lineInput = ref('')
const lineError = ref('')
const rangeStart = ref(0)
const rangeEnd = ref(SOURCE_EXTRACT_PAGE_SIZE)
const activeLine = ref(0)
const activeEndLine = ref(0)
let pendingScroll = null
let navigationVersion = 0
const showDetails = ref(false)
const showFrontmatter = ref(false)
const outline = ref(null)

const selectedSource = computed(() => props.state?.source || props.sources.find(source => source.id === props.state?.sourceId) || null)
const lines = computed(() => String(props.state?.content || '').split(/\r?\n/))
const frontmatter = computed(() => sourceExtractFrontmatterRange(lines.value))
const headings = computed(() => sourceExtractHeadings(lines.value))
const visibleLines = computed(() => lines.value.slice(rangeStart.value, rangeEnd.value)
  .map((text, index) => ({ text, number: rangeStart.value + index + 1 }))
  .filter(line => showFrontmatter.value || !frontmatter.value || line.number > frontmatter.value.endLine))
const matches = computed(() => findSourceExtractLines(lines.value, searchTerm.value))
const selectedIndex = computed(() => props.sources.findIndex(source => source.id === props.state?.sourceId))
const parserStatus = computed(() => ({ complete: '已解析', pending: '待解析', running: '解析中', failed: '解析失败', needs_ocr: '等待 OCR', ocr_queued: 'OCR 排队', ocr_running: 'OCR 中', ocr_failed: 'OCR 失败' }[selectedSource.value?.parser_status] || selectedSource.value?.parser_status || selectedSource.value?.status || '未知'))

watch(() => props.state, state => {
  navigationVersion++
  clearLocatedRange()
  query.value = ''
  searchTerm.value = ''
  matchIndex.value = 0
  rangeStart.value = 0
  rangeEnd.value = SOURCE_EXTRACT_PAGE_SIZE
  lineInput.value = ''
  lineError.value = ''
  pendingScroll = null
  showDetails.value = false
  showFrontmatter.value = false
  if (state?.status === 'ready' && state.location) goToLine(state.location.startLine, state.location.endLine)
  else nextTick(() => contentPane.value?.scrollTo?.({ top: 0 }))
}, { immediate: true })
watch(() => props.active, active => {
  if (active && pendingScroll) goToLine(pendingScroll.start, pendingScroll.end)
})
watch(query, (value, previous, onCleanup) => {
  const timer = setTimeout(() => {
    const clean = value.trim()
    if (clean === searchTerm.value) return
    searchTerm.value = clean
    matchIndex.value = 0
    if (matches.value.length) goToLine(matches.value[0])
  }, 160)
  onCleanup(() => clearTimeout(timer))
})

function clearLocatedRange() {
  activeLine.value = 0
  activeEndLine.value = 0
}

onBeforeUnmount(() => {
  navigationVersion++
  clearLocatedRange()
})

async function goToLine(line, endLine = line) {
  const version = ++navigationVersion
  clearLocatedRange()
  if (line < rangeStart.value + 1 || line > rangeEnd.value) {
    rangeStart.value = Math.max(0, line - 80)
    rangeEnd.value = Math.min(lines.value.length, line + SOURCE_EXTRACT_PAGE_SIZE)
  }
  if (frontmatter.value && line <= frontmatter.value.endLine) showFrontmatter.value = true
  await nextTick()
  if (version !== navigationVersion) return
  if (!props.active) { pendingScroll = { start: line, end: endLine }; return }
  pendingScroll = null
  activeLine.value = line
  activeEndLine.value = endLine
  await nextTick()
  if (version !== navigationVersion) return
  contentPane.value?.querySelector?.(`[data-line="${line}"]`)?.scrollIntoView?.({ block: 'center' })
}

function search(direction = 1) {
  const value = query.value.trim()
  if (searchTerm.value !== value) {
    searchTerm.value = value
    matchIndex.value = direction < 0 ? matches.value.length - 1 : 0
  } else if (matches.value.length) {
    matchIndex.value = (matchIndex.value + direction + matches.value.length) % matches.value.length
  }
  if (matches.value.length) goToLine(matches.value[matchIndex.value])
}

function jump() {
  const value = Number(lineInput.value)
  if (!Number.isSafeInteger(value) || value < 1 || value > lines.value.length) {
    lineError.value = `请输入 1–${lines.value.length} 之间的行号`
    return
  }
  lineError.value = ''
  goToLine(value)
}

function loadMore() {
  rangeEnd.value = Math.min(rangeEnd.value + SOURCE_EXTRACT_PAGE_SIZE, lines.value.length)
}

async function loadPrevious() {
  const height = contentPane.value?.scrollHeight || 0
  rangeStart.value = Math.max(0, rangeStart.value - SOURCE_EXTRACT_PAGE_SIZE)
  await nextTick()
  if (contentPane.value) contentPane.value.scrollTop += contentPane.value.scrollHeight - height
}

function handleScroll() {
  const el = contentPane.value
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) loadMore()
}

function goToHeading(line) {
  goToLine(line)
  if (outline.value) outline.value.open = false
}

function stepSource(delta) {
  const source = props.sources[selectedIndex.value + delta]
  if (source) emit('select-source', source.id)
}

function clearSearch() {
  query.value = ''
  searchTerm.value = ''
  matchIndex.value = 0
}

function isCited(line) {
  return props.state?.location && line >= props.state.location.startLine && line <= props.state.location.endLine
}

</script>

<template>
  <section class="source-reader" :class="{ 'is-dark': isDark }" aria-label="来源解析摘录">
    <header class="source-header">
      <div class="source-identity">
        <WikiSourceExtractPicker :sources="sources" :selected-id="state?.sourceId || ''" :selected-title="selectedSource?.title || ''" @select="emit('select-source', $event)" />
        <div class="source-subtitle">
          <span>解析摘录</span><span>·</span><span>{{ state?.status === 'ready' ? `${lines.length} 行` : '只读' }}</span><template v-if="selectedSource"><span>·</span><span>{{ parserStatus }}</span></template>
          <button v-if="state?.location && returnTitle" class="origin-link" :title="`返回知识页：${returnTitle}`" @click="emit('back')"><i class="ri-arrow-left-line" />{{ returnTitle }}</button>
        </div>
      </div>
      <div class="source-header-actions">
        <template v-if="sources.length > 1"><button class="icon-button" aria-label="上一个来源" :disabled="selectedIndex <= 0" @click="stepSource(-1)"><i class="ri-arrow-left-s-line" /></button><span class="source-position">{{ Math.max(selectedIndex + 1, 0) }} / {{ sources.length }}</span><button class="icon-button" aria-label="下一个来源" :disabled="selectedIndex < 0 || selectedIndex + 1 >= sources.length" @click="stepSource(1)"><i class="ri-arrow-right-s-line" /></button><span class="action-divider" /></template>
        <button v-if="selectedSource" class="details-toggle" type="button" :aria-expanded="showDetails" @click="showDetails = !showDetails"><i class="ri-information-line" /><span>来源信息</span><i :class="showDetails ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" /></button>
      </div>
    </header>

    <div v-if="selectedSource && showDetails" class="source-meta">
      <div><span>来源 ID</span><code>{{ state?.sourceId || selectedSource.id }}</code></div>
      <div><span>原文 URI</span><code>{{ selectedSource.original_uri || '未提供' }}</code></div>
      <div><span>解析状态</span><b>{{ parserStatus }}</b><em v-if="selectedSource.parser_message">{{ selectedSource.parser_message }}</em></div>
      <div v-if="selectedSource.extract_path"><span>摘录路径</span><code>{{ selectedSource.extract_path }}</code></div>
    </div>

    <div v-if="!state" class="state-message"><i class="ri-file-search-line state-icon" /><h3>{{ sources.length ? '选择要查看的来源' : '还没有来源文档' }}</h3><p>{{ sources.length ? '点击上方文档选择框，查看解析全文；也可以从知识页的证据引用直接定位到原文。' : '添加文档或笔记后，可在这里查看完整解析摘录。' }}</p></div>
    <p v-else-if="state.status === 'loading'" class="state-message" role="status"><i class="ri-loader-4-line spin" /> 正在读取来源摘录…</p>
    <div v-else-if="state.status === 'error'" class="state-message error-message" role="alert"><p>{{ state.error }}</p><button class="action-button" @click="emit('retry')">重新读取</button></div>
    <div v-else-if="state.status === 'empty'" class="state-message" role="status"><p>该来源暂无解析摘录。请完成来源解析后重新读取。</p><button class="action-button" @click="emit('retry')">重新读取</button></div>
    <template v-else-if="state.status === 'ready'">
      <div class="extract-toolbar">
        <form class="search-form" @submit.prevent="search(1)">
          <i class="ri-search-line search-icon" />
          <input v-model="query" type="search" aria-label="搜索完整摘录" placeholder="在全文中查找" @keydown.esc.prevent="clearSearch" @keydown.enter.shift.prevent="search(-1)" />
          <span class="match-count" :class="{ 'no-match': searchTerm && !matches.length }" role="status">{{ searchTerm ? (matches.length ? `${matchIndex + 1} / ${matches.length}` : '无匹配') : '' }}</span>
          <button v-if="query" class="icon-button" type="button" aria-label="清除搜索" @click="clearSearch"><i class="ri-close-line" /></button>
          <span class="search-divider" />
          <button class="icon-button" type="button" aria-label="上一个匹配行" title="上一个匹配行（Shift + Enter）" :disabled="!query.trim() || (searchTerm === query.trim() && !matches.length)" @click="search(-1)"><i class="ri-arrow-up-s-line" /></button>
          <button class="icon-button" type="button" aria-label="下一个匹配行" title="下一个匹配行（Enter）" :disabled="!query.trim() || (searchTerm === query.trim() && !matches.length)" @click="search(1)"><i class="ri-arrow-down-s-line" /></button>
        </form>
        <span v-if="!state.location && !state.locationWarning" class="readonly-label"><i class="ri-lock-line" />只读全文</span>
        <button v-if="state.location" class="citation-return" @click="goToLine(state.location.startLine, state.location.endLine)" :title="`回到引用第 ${state.location.startLine}–${state.location.endLine} 行`"><i class="ri-focus-3-line" />引用 {{ state.location.startLine }}–{{ state.location.endLine }} 行<i class="ri-arrow-right-up-line" /></button>
        <details v-if="headings.length" ref="outline" class="outline-menu"><summary title="跳转到章节"><i class="ri-list-unordered" /><span>章节</span></summary><nav aria-label="摘录章节"><button v-for="heading in headings" :key="heading.line" @click="goToHeading(heading.line)"><span>{{ heading.title }}</span><small>{{ heading.line }}</small></button></nav></details>
      </div>
      <p v-if="state.locationWarning" class="location-notice" role="status"><i class="ri-information-line" />{{ state.locationWarning }}</p>
      <div ref="contentPane" class="extract-lines" tabindex="0" aria-label="带行号的完整 Markdown 摘录" @scroll.passive="handleScroll">
        <button v-if="rangeStart > 0" class="load-context" @click="loadPrevious"><i class="ri-arrow-up-line" />载入前文（1–{{ rangeStart }} 行）</button>
        <button v-if="frontmatter && rangeStart === 0" class="frontmatter-toggle" :aria-expanded="showFrontmatter" @click="showFrontmatter = !showFrontmatter"><i :class="showFrontmatter ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" />文件元数据<span>第 1–{{ frontmatter.endLine }} 行</span></button>
        <div v-for="line in visibleLines" :key="line.number" :data-line="line.number" class="extract-line" :class="{ cited: isCited(line.number), located: activeLine > 0 && line.number >= activeLine && line.number <= activeEndLine }">
          <span class="line-number" aria-hidden="true">{{ line.number }}</span><pre><template v-for="(part, partIndex) in sourceExtractSearchSegments(line.text, searchTerm)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></pre>
        </div>
        <button v-if="rangeEnd < lines.length" class="load-context" @click="loadMore">继续载入正文<i class="ri-arrow-down-line" /></button>
      </div>
      <footer>
        <span class="line-range">{{ rangeStart + 1 }}–{{ Math.min(rangeEnd, lines.length) }}<span> / {{ lines.length }} 行</span></span>
        <form class="jump-form" @submit.prevent="jump"><input v-model="lineInput" inputmode="numeric" aria-label="跳转行号" placeholder="行号" :aria-invalid="!!lineError" @input="lineError = ''" /><button type="submit" class="action-button" title="跳转到指定行">跳转</button></form>
        <span class="footer-mode">连续阅读</span>
      </footer>
      <p v-if="lineError" class="line-error" role="alert">{{ lineError }}</p>
    </template>
  </section>
</template>

<style scoped>
.source-reader { height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; color: var(--ui-text-main); background: var(--ui-bg-1); container-type: inline-size; }
.source-header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; flex-shrink: 0; padding: 10px 20px 8px; border-bottom: 0; }
.source-identity { flex: 1; min-width: 0; }
.source-subtitle { display: flex; align-items: center; gap: 6px; margin-top: 3px; color: var(--ui-text-aux); font-size: 11px; line-height: 20px; min-width: 0; }
.origin-link { display: inline-flex; align-items: center; gap: 4px; max-width: min(42cqw, 100%); padding: 0; color: var(--ui-brand-500); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.origin-link:hover { text-decoration: underline; }
.source-header-actions { display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; gap: 2px; margin-left: auto; }
.source-position { color: var(--ui-text-aux); white-space: nowrap; font-size: 11px; font-variant-numeric: tabular-nums; }
.action-divider, .search-divider { width: 1px; height: 16px; flex-shrink: 0; background: var(--ui-border-card); margin-inline: 4px; }
.action-button, .icon-button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; white-space: nowrap; min-height: 30px; padding: 4px 8px; border-radius: 5px; color: var(--ui-text-sub); font-size: 12px; }
.icon-button { width: 28px; padding: 4px; font-size: 16px; }
.action-button:hover, .icon-button:hover { background: var(--ui-bg-3); color: var(--ui-text-main); }
.details-toggle { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; white-space: nowrap; min-height: 30px; padding: 4px 6px; border-radius: 5px; color: var(--ui-text-aux); font-size: 11px; }
.details-toggle:hover { color: var(--ui-text-main); background: var(--ui-bg-3); }
.source-meta { flex-shrink: 0; max-height: 150px; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; padding: 12px 24px; border-bottom: 1px solid var(--ui-border-panel); background: var(--ui-bg-0); font-size: 11px; }
.source-meta div { min-width: 0; display: flex; gap: 8px; line-height: 1.7; }
.source-meta span { flex: 0 0 auto; color: var(--ui-text-aux); }
.source-meta code, .source-meta b, .source-meta em { min-width: 0; overflow-wrap: anywhere; font: inherit; color: var(--ui-text-sub); }
.source-meta em { color: var(--ui-text-aux); font-style: normal; }
.extract-toolbar { flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 8px 20px 10px; border-bottom: 1px solid var(--ui-border-panel); background: var(--ui-bg-1); }
.search-form { display: flex; align-items: center; flex: 1 1 240px; min-width: 0; height: 32px; max-width: 480px; padding: 0 4px 0 10px; border: 1px solid var(--ui-border-card); border-radius: 6px; background: var(--ui-bg-2); }
.search-form:focus-within { border-color: var(--ui-brand-400); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-brand-500) 10%, transparent); }
.search-icon { flex-shrink: 0; color: var(--ui-text-aux); font-size: 15px; }
.search-form input { flex: 1; min-width: 0; width: 100%; height: 100%; padding: 0 8px; border: 0; outline: none; color: var(--ui-text-main); background: transparent; font-size: 12px; appearance: none; -webkit-appearance: none; caret-color: var(--ui-brand-500); }
.search-form input::-webkit-search-cancel-button, .search-form input::-webkit-search-results-button { display: none; }
.search-form input:focus, .search-form input:focus-visible { border: 0; outline: none; box-shadow: none; }
.match-count { flex-shrink: 0; white-space: nowrap; color: var(--ui-text-aux); font-size: 11px; font-variant-numeric: tabular-nums; }
.match-count.no-match { color: var(--ui-text-main); }
.readonly-label { display: flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap; margin-left: auto; color: var(--ui-text-aux); font-size: 10px; }
.citation-return { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-shrink: 0; white-space: nowrap; margin-left: auto; min-height: 30px; padding: 4px 8px; border-radius: 5px; background: color-mix(in srgb, var(--ui-brand-500) 8%, transparent); color: var(--ui-brand-500); font-size: 11px; }
.citation-return:hover { background: color-mix(in srgb, var(--ui-brand-500) 14%, transparent); }
.outline-menu { position: relative; flex-shrink: 0; }
.outline-menu[open]::before { content: ""; position: absolute; top: calc(100% + 3px); right: 18px; width: 10px; height: 10px; border-top: 1px solid var(--ui-border-card); border-left: 1px solid var(--ui-border-card); background: var(--ui-bg-2); transform: rotate(45deg); }
.outline-menu summary { display: flex; align-items: center; gap: 5px; min-height: 30px; padding: 4px 6px; border-radius: 5px; color: var(--ui-text-sub); font-size: 11px; list-style: none; cursor: pointer; white-space: nowrap; }
.outline-menu summary::-webkit-details-marker { display: none; }
.outline-menu summary:hover { background: var(--ui-bg-3); }
.outline-menu nav { position: absolute; z-index: 4; right: 0; top: calc(100% + 8px); width: min(300px, 70cqw); max-height: 40vh; overflow-y: auto; padding: 6px; border: 1px solid var(--ui-border-card); border-radius: 7px; background: var(--ui-bg-2); box-shadow: var(--ui-shadow-popup); clip-path: inset(0 0 0 0 round 7px); }
.outline-menu nav button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 8px; color: var(--ui-text-sub); text-align: left; border-radius: 4px; font-size: 12px; }
.outline-menu nav button:hover { background: var(--ui-bg-3); color: var(--ui-text-main); }
.outline-menu nav span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-menu nav small { color: var(--ui-text-aux); font-size: 10px; }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible, .jump-form input:focus-visible, .extract-lines:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: -2px; }
.location-notice { display: flex; align-items: center; gap: 5px; flex-shrink: 0; margin: 0; padding: 8px 24px; color: var(--ui-text-sub); font-size: 11px; background: var(--ui-bg-0); }
.extract-lines { flex: 1; min-height: 0; overflow: auto; padding: 20px 0 28px; background: var(--ui-bg-2); scrollbar-gutter: stable; }
.extract-line { display: flex; align-items: flex-start; min-width: 0; }
.line-number { box-sizing: border-box; width: 60px; flex-shrink: 0; padding: 0 14px 0 8px; text-align: right; user-select: none; color: var(--ui-text-dim); font: 11px/24px ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
.extract-line pre { margin: 0; padding-right: 24px; min-width: 0; max-width: 100ch; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; color: var(--ui-text-main); font: 13px/24px ui-monospace, Consolas, monospace; }
.extract-line mark { color: var(--ui-text-main); background: color-mix(in srgb, var(--warning) 34%, var(--ui-bg-2)); border-radius: 2px; }
.extract-line.cited { --locate-rest: color-mix(in srgb, var(--ui-brand-500) 14%, transparent); background: var(--locate-rest); }
.extract-line.located { background: color-mix(in srgb, var(--ui-brand-500) 16%, transparent); }
.extract-line.located .line-number { color: var(--ui-brand-500); background: color-mix(in srgb, var(--ui-brand-500) 12%, transparent); font-weight: 700; }
.load-context, .frontmatter-toggle { display: flex; align-items: center; gap: 8px; margin: 0 24px 12px 60px; padding: 6px 8px; border: 1px solid var(--ui-border-card); border-radius: 5px; color: var(--ui-text-aux); background: var(--ui-bg-3); font-size: 11px; }
.load-context { margin-top: 12px; }
.load-context:hover, .frontmatter-toggle:hover { color: var(--ui-text-main); border-color: var(--ui-border-panel); }
.frontmatter-toggle span { color: var(--ui-text-dim); margin-left: 6px; font-size: 10px; }
footer { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; flex-wrap: wrap; gap: 6px 10px; padding: 8px 20px; border-top: 1px solid var(--ui-border-panel); background: var(--ui-bg-1); font-size: 11px; color: var(--ui-text-aux); }
.line-range { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ui-text-sub); }
.line-range > span { color: var(--ui-text-aux); }
.jump-form { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.jump-form input { box-sizing: border-box; width: 60px; height: 27px; padding: 0 6px; border: 1px solid var(--ui-border-card); border-radius: 5px; color: var(--ui-text-main); background: var(--ui-bg-2); text-align: center; font-size: 11px; }
.footer-mode { color: var(--ui-text-aux); font-size: 10px; white-space: nowrap; }
.line-error { flex-shrink: 0; margin: 0; padding: 6px 24px; font-size: 11px; color: var(--error); background: var(--ui-bg-1); }
.state-message { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; margin: 0; overflow-y: auto; color: var(--ui-text-aux); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; text-align: center; }
.state-message p { max-width: 380px; margin: 0; }
.state-message h3 { margin: 0; color: var(--ui-text-main); font-size: 15px; font-weight: 600; }
.state-icon { font-size: 28px; margin-bottom: 4px; color: var(--ui-text-aux); }
.error-message, .extract-toolbar .error-message { color: #b91c1c; }
.is-dark .error-message { color: #fca5a5; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { display: inline-block; animation: spin 1s linear infinite; }
@container (max-width: 600px) { .source-header, .source-meta, .extract-toolbar, footer { padding-inline: 12px; } .source-header { gap: 6px 10px; } .source-meta { grid-template-columns: 1fr; } .readonly-label { display: none; } .line-number { width: 44px; padding-right: 10px; } .extract-line pre { padding-right: 12px; } .extract-toolbar { gap: 8px; } .load-context, .frontmatter-toggle { margin-left: 44px; margin-right: 12px; } .origin-link { max-width: 100%; } }
@container (max-width: 420px) { .source-header { align-items: flex-start; } .details-toggle span { display: none; } .source-header-actions { gap: 0; } .source-position { font-size: 10px; } .source-meta { max-height: 110px; } .extract-toolbar { flex-wrap: wrap; } .search-form { flex-basis: 100%; max-width: 100%; } .citation-return { margin-left: 0; } footer { gap: 4px; padding-inline: 8px; } .jump-form input { width: 44px; } .line-range { font-size: 10px; } .footer-mode { display: none; } .outline-menu nav { right: auto; left: 0; } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
