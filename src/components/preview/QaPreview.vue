<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderArtifactMarkdown, renderArtifactMarkdownInline } from '@/utils/artifactMarkdown'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const payload = computed(() => props.data?.result_json || {})
const mode = computed(() => payload.value?.mode === 'thinking' ? 'thinking' : 'faq')
const items = computed(() => Array.isArray(payload.value?.items) ? payload.value.items : [])

const query = ref('')
const openIds = ref(new Set())
const searchRef = ref(null)
const copiedId = ref('')
let copyTimer = null

/* ══ 布局：list / grid，偏好跨 artifact 持久化 ══ */
const layout = ref('list')
try { if (localStorage.getItem('qa-card-layout') === 'grid') layout.value = 'grid' } catch {}
function setLayout(v) {
  layout.value = v
  try { localStorage.setItem('qa-card-layout', v) } catch {}
}

/* ══ 稳定编号 / id：以全量顺序为准，筛选后不漂移、展开状态不错位 ══ */
const indexByItem = computed(() => {
  const m = new Map()
  items.value.forEach((item, i) => m.set(item, i))
  return m
})
const origIndex = (item) => indexByItem.value.get(item) ?? 0
const itemId = (item) => String(item?.id ?? `qa-${origIndex(item)}`)
const uid = computed(() => String(payload.value?.artifact_id ?? 'qa'))
const qId = (item) => `${uid.value}-q-${itemId(item)}`
const ansId = (item) => `${uid.value}-ans-${itemId(item)}`

const filteredItems = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  if (!q) return items.value
  return items.value.filter(item => [item.question, item.answer, item.key_point, ...(item.tags || [])]
    .filter(Boolean).join(' ').toLocaleLowerCase().includes(q))
})

const isFiltering = computed(() => !!query.value.trim())
const pad = (n) => String(n).padStart(2, '0')

/* ══ 宫格答案预览：剥掉 markdown 语法取纯文本 ══ */
function plainSnippet(raw, max = 96) {
  const t = String(raw ?? '')
    .replace(/```[\s\S]*?```/g, ' 〈代码〉 ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

/* ══ 标签语义色：同名标签永远同色（静态类名，Tailwind 可扫描） ══ */
const TAG_PALETTE = [
  { l: 'bg-sky-50 text-sky-700 ring-sky-600/20', d: 'bg-sky-400/10 text-sky-300 ring-sky-400/25' },
  { l: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', d: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25' },
  { l: 'bg-violet-50 text-violet-700 ring-violet-600/20', d: 'bg-violet-400/10 text-violet-300 ring-violet-400/25' },
  { l: 'bg-rose-50 text-rose-700 ring-rose-600/20', d: 'bg-rose-400/10 text-rose-300 ring-rose-400/25' },
  { l: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20', d: 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/25' },
  { l: 'bg-orange-50 text-orange-700 ring-orange-600/20', d: 'bg-orange-400/10 text-orange-300 ring-orange-400/25' },
  { l: 'bg-teal-50 text-teal-700 ring-teal-600/20', d: 'bg-teal-400/10 text-teal-300 ring-teal-400/25' },
  { l: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20', d: 'bg-fuchsia-400/10 text-fuchsia-300 ring-fuchsia-400/25' },
]
function tagColor(tag) {
  let h = 0
  const s = String(tag)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
function tagHit(tag) {
  const q = query.value.trim().toLocaleLowerCase()
  return !!q && String(tag).toLocaleLowerCase().includes(q)
}
function applyTag(tag) {
  const t = String(tag).replace(/[*_`#[\]]/g, '').trim()
  query.value = query.value.trim() === t ? '' : t   // 再点一次取消
}

/* ══ 展开 / 收起 ══ */
const isOpen = (item) => openIds.value.has(itemId(item))
function toggle(item) {
  const id = itemId(item)
  const next = new Set(openIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openIds.value = next
}

const openCount = computed(() =>
  items.value.filter(item => openIds.value.has(itemId(item))).length)
const allOpen = computed(() =>
  items.value.length > 0 && items.value.every(item => openIds.value.has(itemId(item))))
const progress = computed(() =>
  items.value.length ? Math.round(openCount.value / items.value.length * 100) : 0)

function toggleAll() {
  openIds.value = allOpen.value ? new Set() : new Set(items.value.map(item => itemId(item)))
}
function resetAll() {
  query.value = ''
  openIds.value = new Set()
}

async function copyAnswer(item) {
  const text = String(item.answer ?? '')
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copiedId.value = itemId(item)
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copiedId.value = ''), 1600)
}

/* ══ 快捷键：/ 聚焦筛选，G 切换布局 ══ */
function onGlobalKeydown(e) {
  const inInput = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')
  if (inInput) return
  if (e.key === '/') {
    e.preventDefault()
    searchRef.value?.focus()
  } else if (e.key === 'g' || e.key === 'G') {
    setLayout(layout.value === 'list' ? 'grid' : 'list')
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

watch(() => [payload.value?.artifact_id, payload.value?.title, mode.value, items.value.length],
  () => { query.value = ''; openIds.value = new Set() }, { immediate: true })
</script>

<template>
  <!-- qa-dark：深色钩子，供下方 :deep 正文兜底样式识别 -->
  <div class="relative w-full h-full flex flex-col overflow-hidden"
    :class="isDark ? 'bg-d2 qa-dark' : 'bg-slate-50'">

    <div class="relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">
      <div class="max-w-4xl mx-auto">

        <!-- ══ 吸顶工具栏 ══ -->
        <div v-if="items.length" class="sticky top-0 z-10 relative -mx-3 px-3 sm:-mx-5 sm:px-5 pt-1 pb-2"
          :class="isDark ? 'bg-d2' : 'bg-slate-50'">
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <i class="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] transition-colors"
                :class="isFiltering ? (isDark ? 'text-brand-300' : 'text-brand-600') : (isDark ? 'text-wt-dim' : 'text-zinc-400')" />
              <input ref="searchRef" v-model="query" type="search" placeholder="筛选问题、答案或标签"
                class="w-full h-9 sm:h-8 pl-7 pr-7 rounded-lg text-[12px] outline-none border transition-all"
                :class="isDark
                  ? 'bg-d0 border-d4 text-wt-sub placeholder:text-wt-dim focus:border-brand-400/50 focus:ring-2 focus:ring-brand-400/15'
                  : 'bg-white border-zinc-200 text-zinc-700 placeholder:text-zinc-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20'"
                @keydown.esc="query = ''" />
              <button v-if="query" type="button" @click="query = ''" aria-label="清空搜索"
                class="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-zinc-400 hover:text-zinc-600 hover:bg-slate-100'">
                <i class="ri-close-line text-[12px]" />
              </button>
            </div>

            <!-- 布局切换：显式位移滑块 -->
            <div class="relative flex items-center shrink-0 rounded-lg border p-0.5"
              :class="isDark ? 'border-d4 bg-d0' : 'border-zinc-200 bg-white'" role="radiogroup" aria-label="布局切换">
              <span aria-hidden="true"
                class="absolute top-0.5 left-0.5 h-7 w-7 rounded-md transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                :class="[layout === 'grid' ? 'translate-x-7' : 'translate-x-0',
                  isDark ? 'bg-brand-400/25' : 'bg-brand-600 shadow-sm shadow-brand-600/30']" />
              <button type="button" role="radio" :aria-checked="layout === 'list'" title="列表视图（G）"
                @click="setLayout('list')"
                class="relative z-10 h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                :class="layout === 'list'
                  ? (isDark ? 'text-brand-300' : 'text-white')
                  : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-zinc-400 hover:text-zinc-600')">
                <i class="ri-list-unordered text-[14px]" />
              </button>
              <button type="button" role="radio" :aria-checked="layout === 'grid'" title="宫格视图（G）"
                @click="setLayout('grid')"
                class="relative z-10 h-7 w-7 flex items-center justify-center rounded-md transition-colors"
                :class="layout === 'grid'
                  ? (isDark ? 'text-brand-300' : 'text-white')
                  : (isDark ? 'text-wt-dim hover:text-wt-sub' : 'text-zinc-400 hover:text-zinc-600')">
                <i class="ri-grid-line text-[13px]" />
              </button>
            </div>

            <button type="button" @click="toggleAll" title="展开/收起全部"
              class="shrink-0 h-9 sm:h-8 px-2.5 rounded-lg border text-[11px] font-medium whitespace-nowrap transition-all hover:-translate-y-px active:translate-y-0"
              :class="isDark
                ? 'border-brand-400/30 bg-brand-400/15 text-brand-300 hover:bg-brand-400/25'
                : 'border-transparent bg-brand-600 text-white shadow-sm shadow-brand-600/30 hover:shadow-md'">
              <i :class="allOpen ? 'ri-fold-up-line' : 'ri-expand-down-line'" /><span class="hidden min-[420px]:inline ml-0.5">{{ allOpen ? '收起全部' : '展开全部' }}</span>
            </button>

            <button v-if="isFiltering || openCount" type="button" @click="resetAll" title="清空筛选并收起全部" aria-label="重置"
              class="shrink-0 h-9 sm:h-8 w-9 sm:w-8 rounded-lg border flex items-center justify-center transition-colors"
              :class="isDark ? 'border-d4 bg-d0 text-wt-dim hover:text-wt-sub hover:border-brand-400/40' : 'border-zinc-200 bg-white text-zinc-400 hover:text-zinc-600 hover:border-brand-300'">
              <i class="ri-refresh-line text-[13px]" />
            </button>
          </div>

          <div class="mt-1.5 flex items-center justify-between gap-3 text-[10px] flex-wrap"
            :class="isDark ? 'text-wt-main' : 'text-zinc-400'">
            <!-- 模式迷你徽章：标题区删除后，这里保留唯一的双色模式锚点 -->
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="inline-flex items-center gap-1 shrink-0 h-4 px-1 rounded font-disp text-[8px] font-bold tracking-wider uppercase border"
                :class="mode === 'thinking'
                  ? (isDark ? 'bg-amber-400/10 text-amber-300 border-amber-400/25' : 'bg-amber-50 text-amber-700 border-amber-600/20')
                  : (isDark ? 'bg-brand-400/10 text-brand-300 border-brand-400/25' : 'bg-brand-50 text-brand-600 border-brand-600/15')">
                <i :class="mode === 'thinking' ? 'ri-lightbulb-flash-line' : 'ri-question-answer-line'" class="text-[9px]" />
                {{ mode === 'thinking' ? '思考' : 'FAQ' }}
              </span>
              <span class="truncate">{{ mode === 'thinking' ? '先自己想，再点开核对' : '点开问题查看答案' }} · / 筛选 · G 切换布局</span>
            </span>
            <span class="shrink-0 tabular-nums">
              <template v-if="isFiltering">
                <b class="font-disp" :class="isDark ? 'text-amber-300' : 'text-amber-600'">{{ filteredItems.length }}</b>/{{ items.length }} 匹配 ·
              </template>
              已展开 <b class="font-disp transition-colors"
                :class="openCount ? (isDark ? 'text-brand-300' : 'text-brand-600') : ''">{{ openCount }}</b>/{{ items.length }}
            </span>
          </div>

          <!-- 展开进度：随模式变色 -->
          <div class="absolute left-0 right-0 bottom-0 h-[3px]" :class="isDark ? 'bg-d4/40' : 'bg-zinc-200/70'">
            <div class="h-full rounded-r-full transition-[width] duration-300 ease-out"
              :class="mode === 'thinking'
                ? (isDark ? 'bg-amber-400/80' : 'bg-amber-500/70')
                : (isDark ? 'bg-brand-400/80' : 'bg-brand-600/70')"
              :style="{ width: progress + '%' }" />
          </div>
        </div>

        <!-- ══ 单一列表：两种布局共用同一批 article 节点，切换=重排而非重建 ══ -->
        <div v-if="filteredItems.length" class="mt-3"
          :class="layout === 'list' ? 'space-y-2.5' : 'qa-grid'">

          <article v-for="item in filteredItems" :key="itemId(item)"
            class="group qa-reveal border overflow-hidden transition-all duration-200"
            :style="{ animationDelay: Math.min(origIndex(item), 10) * 30 + 'ms' }"
            :class="[
              layout === 'list' ? 'rounded-lg hover:-translate-y-0.5' : 'rounded-xl flex flex-col hover:-translate-y-1',
              isOpen(item)
                ? (isDark ? 'border-brand-400/40 bg-d3 shadow-md shadow-black/20' : 'border-brand-300 bg-white shadow-md shadow-brand-600/[0.07]')
                : (isDark ? 'border-d4 bg-d3 hover:border-brand-400/30 hover:shadow-md hover:shadow-black/20' : 'border-zinc-200 bg-white shadow-sm hover:border-brand-300 hover:shadow-md'),
            ]">

            <!-- 题头：列表=横排 / 宫格=竖排 -->
            <div role="button" tabindex="0" :aria-expanded="isOpen(item)" :aria-controls="ansId(item)"
              @click="toggle(item)" @keydown.enter.prevent="toggle(item)" @keydown.space.prevent="toggle(item)"
              class="w-full text-left transition-colors cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/40"
              :class="[
                layout === 'list' ? 'px-3 sm:px-3.5 py-3 flex items-start gap-2.5 sm:gap-3' : 'p-3.5 flex flex-col gap-2 flex-1',
                isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70',
              ]">

              <!-- 宫格：序号与箭头分列两端 -->
              <div v-if="layout === 'grid'" class="flex items-center justify-between">
                <span class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 font-disp text-[10px] font-bold tabular-nums transition-all duration-300"
                  :class="isOpen(item)
                    ? (isDark ? 'bg-brand-400 text-white shadow-sm shadow-brand-400/40' : 'bg-brand-600 text-white shadow-sm shadow-brand-600/40')
                    : (isDark ? 'bg-d0 text-wt-dim' : 'bg-slate-100 text-slate-500')">
                  {{ pad(origIndex(item) + 1) }}
                </span>
                <span class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300"
                  :class="isOpen(item)
                    ? (isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-50 text-brand-600')
                    : (isDark ? 'text-wt-dim group-hover:bg-white/5' : 'text-zinc-400 group-hover:bg-slate-100')">
                  <i class="ri-arrow-down-s-line text-[15px] transition-transform duration-300" :class="isOpen(item) ? 'rotate-180' : ''" />
                </span>
              </div>

              <!-- 列表：序号在左 -->
              <span v-else class="w-6 h-6 rounded-md flex items-center justify-center shrink-0 font-disp text-[10px] font-bold tabular-nums transition-all duration-300"
                :class="isOpen(item)
                  ? (isDark ? 'bg-brand-400 text-white shadow-sm shadow-brand-400/40' : 'bg-brand-600 text-white shadow-sm shadow-brand-600/40')
                  : (isDark ? 'bg-d0 text-wt-dim' : 'bg-slate-100 text-slate-500')">
                {{ pad(origIndex(item) + 1) }}
              </span>

              <span class="min-w-0 flex-1" :class="layout === 'grid' ? 'flex flex-col gap-2' : ''">
                <span :id="qId(item)" class="block text-[13px] sm:text-sm font-bold leading-relaxed transition-colors"
                  :class="isOpen(item) ? (isDark ? 'text-wt-main' : 'text-zinc-900') : (isDark ? 'text-wt-sub' : 'text-zinc-800')"
                  v-html="renderArtifactMarkdownInline(item.question)"></span>

                <!-- 思考提示：琥珀胶囊 -->
                <span v-if="mode === 'thinking' && item.key_point"
                  class="flex items-start gap-1.5 text-[11px] leading-relaxed rounded-md px-2 py-1 ring-1 ring-inset self-start"
                  :class="[
                    isDark ? 'bg-amber-400/[0.08] text-amber-300/90 ring-amber-400/20' : 'bg-amber-50 text-amber-800 ring-amber-600/15',
                    layout === 'list' ? 'mt-1.5' : '',
                  ]">
                  <i class="ri-lightbulb-flash-line mt-0.5 shrink-0" />
                  <span class="artifact-markdown artifact-markdown-inline" v-html="renderArtifactMarkdownInline(item.key_point)"></span>
                </span>

                <!-- 宫格专属：答案预览（thinking 模式刻意不预览，保护思考过程） -->
                <p v-if="layout === 'grid' && !isOpen(item) && mode === 'faq' && item.answer"
                  class="qa-clamp text-[11px] leading-relaxed"
                  :class="isDark ? 'text-wt-dim' : 'text-zinc-500'">{{ plainSnippet(item.answer) }}</p>

                <!-- 语义色标签：点击筛选，再点取消 -->
                <span v-if="item.tags?.length" class="flex flex-wrap gap-1"
                  :class="layout === 'list' ? 'mt-2' : 'mt-auto pt-1'">
                  <button v-for="tag in item.tags" :key="tag" type="button" @click.stop="applyTag(tag)" :title="`点击筛选：${tag}`"
                    class="px-1.5 py-0.5 rounded text-[9px] font-medium ring-inset transition-all"
                    :class="[isDark ? tagColor(tag).d : tagColor(tag).l, tagHit(tag) ? 'ring-2 font-bold' : 'ring-1']"
                    v-html="renderArtifactMarkdownInline(tag)"></button>
                </span>
              </span>

              <!-- 列表：箭头在右 -->
              <span v-if="layout === 'list'" class="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300"
                :class="isOpen(item)
                  ? (isDark ? 'bg-brand-400/15 text-brand-300' : 'bg-brand-50 text-brand-600')
                  : (isDark ? 'text-wt-dim group-hover:bg-white/5' : 'text-zinc-400 group-hover:bg-slate-100')">
                <i class="ri-arrow-down-s-line text-[15px] transition-transform duration-300" :class="isOpen(item) ? 'rotate-180' : ''" />
              </span>
            </div>

            <!-- 答案区：列表保留缩进对齐，宫格通栏 -->
            <div class="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              :class="isOpen(item) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
              <div class="overflow-hidden">
                <div :id="ansId(item)" role="region" :aria-labelledby="qId(item)" class="px-3 sm:px-3.5 pb-3.5">
                  <div :class="layout === 'list' ? 'sm:ml-9' : ''">
                    <div class="rounded-lg border-l-[3px] py-2.5 pl-3 pr-2.5"
                      :class="isDark ? 'border-brand-400/70 bg-brand-400/[0.07]' : 'border-brand-400 bg-brand-50/80'">
                      <div class="mb-1.5 flex items-center justify-between gap-2">
                        <span class="inline-flex items-center gap-1 font-disp text-[9px] font-bold tracking-[0.14em] uppercase"
                          :class="isDark ? 'text-brand-300/90' : 'text-brand-600'">
                          <i class="ri-chat-quote-line text-[10px]" />{{ mode === 'thinking' ? '参考答案' : '答案' }}
                        </span>
                        <button type="button" @click="copyAnswer(item)"
                          class="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[9px] transition-colors"
                          :class="copiedId === itemId(item)
                            ? (isDark ? 'text-emerald-300 bg-emerald-400/10' : 'text-emerald-600 bg-emerald-50')
                            : (isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-zinc-400 hover:text-zinc-600 hover:bg-slate-200/60')">
                          <i :class="copiedId === itemId(item) ? 'ri-check-double-line' : 'ri-file-copy-line'" class="text-[10px]" />
                          {{ copiedId === itemId(item) ? '已复制' : '复制' }}
                        </button>
                      </div>
                      <div class="artifact-markdown qa-answer text-[12.5px] sm:text-[13px] leading-relaxed break-words"
                        :class="isDark ? 'text-wt-main' : 'text-slate-700'"
                        v-html="renderArtifactMarkdown(item.answer)"></div>
                    </div>

                    <div v-if="mode === 'faq' && item.key_point"
                      class="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed rounded-md px-2 py-1.5 border"
                      :class="isDark ? 'border-brand-400/20 bg-brand-400/[0.06] text-wt-main' : 'border-brand-600/15 bg-brand-50 text-brand-600'">
                      <i class="ri-pushpin-2-line mt-0.5 shrink-0" />
                      <span class="font-bold shrink-0">核心：</span>
                      <span class="artifact-markdown artifact-markdown-inline min-w-0 flex-1" v-html="renderArtifactMarkdownInline(item.key_point)"></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- 空状态 -->
        <div v-else class="py-10 sm:py-14 text-center">
          <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg ring-1 ring-inset ring-white/20"
            :class="isDark ? 'bg-gradient-to-br from-brand-400/70 to-brand-600/70 shadow-brand-400/20' : 'bg-gradient-to-br from-brand-400 to-brand-600 shadow-brand-600/25'">
            <i class="ri-question-answer-line text-[22px]" />
          </div>
          <p class="mt-3 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-slate-500'">{{ isFiltering ? '没有匹配的问答' : '暂无问答内容' }}</p>
          <button v-if="isFiltering" type="button" @click="query = ''" class="mt-2 text-[11px] font-medium transition-colors"
            :class="isDark ? 'text-brand-300 hover:text-brand-400' : 'text-brand-600 hover:text-brand-400'">清除搜索</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-disp { font-family: 'Space Grotesk', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
input[type='search']::-webkit-search-cancel-button { -webkit-appearance: none; }

/* 宫格：列数随容器宽度自适应（与视口断点无关）
   窄容器自动 1 列，≥610px 2 列，超宽 3 列；
   想让窄面板也出 2 列，把 300px 调成 240px */
.qa-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 0.625rem;
  align-items: start; /* 展开某张卡时不拉高同行邻居 */
}

/* 宫格答案预览：三行截断（不依赖 line-clamp 插件） */
.qa-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 深色正文兜底：v-html 的 markdown 内容走全局样式，
      这里保证深色下行内代码、标题、表格、引用可读。
      若你的全局 .artifact-markdown 已有完整深色分支，可整段删除 ── */
.qa-dark :deep(code) { background: rgb(255 255 255 / 0.08); color: #e4e4e7; }
.qa-dark :deep(pre) { background: rgb(0 0 0 / 0.25); }
.qa-dark :deep(pre code) { background: transparent; color: inherit; }
.qa-dark .artifact-markdown :deep(h1),
.qa-dark .artifact-markdown :deep(h2),
.qa-dark .artifact-markdown :deep(h3),
.qa-dark .artifact-markdown :deep(h4) { color: #f4f4f5; }
.qa-dark .artifact-markdown :deep(strong) { color: #fafafa; }
.qa-dark .artifact-markdown :deep(a) { color: inherit; text-decoration-color: rgb(255 255 255 / 0.35); }
.qa-dark .artifact-markdown :deep(blockquote) { border-color: rgb(255 255 255 / 0.15); color: #a1a1aa; }
.qa-dark .artifact-markdown :deep(th),
.qa-dark .artifact-markdown :deep(td) { border-color: rgb(255 255 255 / 0.12); }
.qa-dark .artifact-markdown :deep(hr) { border-color: rgb(255 255 255 / 0.12); }

.qa-reveal { animation: qa-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes qa-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .qa-reveal { animation: none; }
  .grid, .transition-\[width\] { transition: none; }
}

.artifact-markdown :deep(p) { margin: 0; }
.artifact-markdown :deep(p + p) { margin-top: 0.5rem; }
.artifact-markdown :deep(ul),
.artifact-markdown :deep(ol) { margin: 0.4rem 0; padding-left: 1.25rem; }
.artifact-markdown :deep(pre),
.artifact-markdown :deep(.math-block) { max-width: 100%; overflow-x: auto; overflow-y: hidden; margin: 0.4rem 0; }
.artifact-markdown :deep(.math-block) { padding: 0.2rem 0; }
.artifact-markdown :deep(.katex-display) { margin: 0.45em 0; }
</style>