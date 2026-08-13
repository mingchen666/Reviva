<script setup>
import { computed, ref, watch } from 'vue'
import { renderArtifactMarkdown, renderArtifactMarkdownInline } from '@/utils/artifactMarkdown'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const payload = computed(() => props.data?.result_json || {})
const terms = computed(() => Array.isArray(payload.value?.terms) ? payload.value.terms : [])
const query = ref('')
const activeCategory = ref('all')
const expandedId = ref('')

const categories = computed(() => [...new Set(terms.value.map(t => String(t.category || '').trim()).filter(Boolean))])

const categoryStats = computed(() => {
  const map = new Map()
  terms.value.forEach((t) => {
    const c = String(t.category || '').trim()
    if (c) map.set(c, (map.get(c) || 0) + 1)
  })
  return [...map.entries()].map(([name, count]) => ({ name, count }))
})

const filteredTerms = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  return terms.value.filter((term) => {
    const inCategory = activeCategory.value === 'all' || term.category === activeCategory.value
    if (!inCategory) return false
    if (!q) return true
    return [term.term, ...(term.aliases || []), term.definition, term.context, term.category]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(q)
  })
})

const isFiltering = computed(() => !!query.value.trim() || activeCategory.value !== 'all')

function termId(term, index) {
  return String(term?.id || `term-${index}`)
}

function importanceMeta(value) {
  if (value === 'high') return { label: '重点', dotDark: 'bg-red-400', dotLight: 'bg-rose-500' }
  if (value === 'low') return { label: '了解', dotDark: 'bg-white/25', dotLight: 'bg-slate-300' }
  return { label: '常用', dotDark: 'bg-agent-400', dotLight: 'bg-violet-500' }
}

const importanceLegend = [
  { label: '重点', dotDark: 'bg-red-400', dotLight: 'bg-rose-500' },
  { label: '常用', dotDark: 'bg-agent-400', dotLight: 'bg-violet-500' },
  { label: '了解', dotDark: 'bg-white/25', dotLight: 'bg-slate-300' },
]

function resetFilters() {
  query.value = ''
  activeCategory.value = 'all'
  expandedId.value = ''
}

watch(() => [payload.value?.artifact_id, payload.value?.title, terms.value.length], resetFilters, { immediate: true })
</script>

<template>
  <div class="w-full h-full flex flex-col" :class="isDark ? 'bg-d2' : 'bg-slate-50'">

    <div class="flex-1 min-h-0 overflow-y-auto p-5">
      <div class="max-w-4xl mx-auto lg:grid lg:grid-cols-[150px_1fr] lg:gap-8">

        <!-- 左栏：分类索引（词典的字母页码） -->
        <aside v-if="terms.length" class="hidden lg:block">
          <div class="sticky top-1">
            <div class="text-[9px] font-disp font-bold uppercase tracking-[0.18em] px-2.5 mb-1.5" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">索引</div>
            <div class="space-y-0.5">
              <button @click="activeCategory = 'all'"
                class="w-full flex items-center justify-between gap-2 px-2.5 h-7 rounded-md text-[11px] transition-colors"
                :class="activeCategory === 'all'
                  ? (isDark ? 'bg-agent-400/10 text-agent-300 font-semibold' : 'bg-violet-50 text-violet-700 font-semibold')
                  : (isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/4' : 'text-zinc-500 hover:text-zinc-800 hover:bg-slate-100')">
                全部 <b class="font-disp text-[10px] opacity-60">{{ terms.length }}</b>
              </button>
              <button v-for="c in categoryStats" :key="c.name" @click="activeCategory = c.name"
                class="w-full flex items-center justify-between gap-2 px-2.5 h-7 rounded-md text-[11px] transition-colors"
                :class="activeCategory === c.name
                  ? (isDark ? 'bg-agent-400/10 text-agent-300 font-semibold' : 'bg-violet-50 text-violet-700 font-semibold')
                  : (isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/4' : 'text-zinc-500 hover:text-zinc-800 hover:bg-slate-100')">
                <span class="truncate">{{ c.name }}</span> <b class="font-disp text-[10px] opacity-60">{{ c.count }}</b>
              </button>
            </div>
            <div class="mt-4 pt-3 border-t space-y-1.5" :class="isDark ? 'border-d4' : 'border-slate-200'">
              <div v-for="imp in importanceLegend" :key="imp.label" class="flex items-center gap-1.5 px-2.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
                <span class="w-1.5 h-1.5 rounded-full" :class="isDark ? imp.dotDark : imp.dotLight" />{{ imp.label }}
              </div>
            </div>
          </div>
        </aside>

        <!-- 右栏：词条流 -->
        <div class="min-w-0">
          <!-- 移动端分类 chips -->
          <div v-if="terms.length" class="lg:hidden mb-3 flex flex-wrap gap-1.5">
            <button @click="activeCategory = 'all'"
              class="h-7 px-2.5 rounded-lg text-[10px] font-medium border transition-colors"
              :class="activeCategory === 'all'
                ? (isDark ? 'bg-agent-400/10 border-agent-400/30 text-agent-300' : 'bg-violet-50 border-violet-200 text-violet-700')
                : (isDark ? 'border-d4 text-wt-dim' : 'border-zinc-200 text-zinc-500')">全部</button>
            <button v-for="c in categoryStats" :key="c.name" @click="activeCategory = c.name"
              class="h-7 px-2.5 rounded-lg text-[10px] font-medium border transition-colors"
              :class="activeCategory === c.name
                ? (isDark ? 'bg-agent-400/10 border-agent-400/30 text-agent-300' : 'bg-violet-50 border-violet-200 text-violet-700')
                : (isDark ? 'border-d4 text-wt-dim' : 'border-zinc-200 text-zinc-500')">{{ c.name }}</button>
          </div>

          <div class="sticky top-0 z-10 pb-3 -mx-1 px-1" :class="isDark ? 'bg-d2' : 'bg-slate-50'">
            <div class="relative">
              <i class="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'" />
              <input v-model="query" type="search" placeholder="查个词：搜术语、别名或定义"
                class="w-full h-9 pl-8 pr-8 rounded-lg text-[12px] outline-none border transition-colors"
                :class="isDark ? 'bg-d0 border-d4 text-wt-sub placeholder:text-wt-dim focus:border-agent-400/40' : 'bg-white border-zinc-200 text-zinc-700 placeholder:text-zinc-400 focus:border-agent-300'" />
              <button v-if="query" @click="query = ''" aria-label="清空搜索"
                class="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center transition-colors"
                :class="isDark ? 'text-wt-dim hover:text-wt-sub hover:bg-white/5' : 'text-zinc-400 hover:text-zinc-600 hover:bg-slate-100'">
                <i class="ri-close-line text-[13px]" />
              </button>
            </div>
            <div v-if="isFiltering" class="mt-1.5 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
              匹配 <b class="font-disp">{{ filteredTerms.length }}</b> / {{ terms.length }} 个词条
            </div>
          </div>

          <!-- 词条：细线分隔的流动列表，不是卡片 -->
          <div v-if="filteredTerms.length" class="divide-y" :class="isDark ? 'divide-d4' : 'divide-stone-200/70'">
            <article v-for="(term, index) in filteredTerms" :key="termId(term, index)"
              class="gl-reveal py-3.5 first:pt-1.5"
              :style="{ animationDelay: Math.min(index, 10) * 35 + 'ms' }">
              <div class="flex items-start gap-2.5">
                <span class="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0"
                  :title="importanceMeta(term.importance).label"
                  :class="isDark ? importanceMeta(term.importance).dotDark : importanceMeta(term.importance).dotLight" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <h3 class="text-[15px] font-extrabold tracking-tight" :class="isDark ? 'text-wt-main' : 'text-zinc-800'"
                      v-html="renderArtifactMarkdownInline(term.term)"></h3>
                    <span v-if="term.aliases?.length" class="text-[10.5px]" :class="isDark ? 'text-wt-dim' : 'text-zinc-400'">
                      也称 <span class="font-disp" v-html="renderArtifactMarkdownInline(term.aliases.join('、'))"></span>
                    </span>
                  </div>
                  <div class="artifact-markdown mt-1 text-[12px] leading-relaxed break-words"
                    :class="isDark ? 'text-wt-sub' : 'text-slate-600'"
                    v-html="renderArtifactMarkdown(term.definition)"></div>

                  <div class="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    :class="expandedId === termId(term, index) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
                    <div class="overflow-hidden">
                      <div class="artifact-markdown mt-2.5 rounded-r-md border-l-2 px-3 py-2 text-[11px] leading-relaxed break-words"
                        :class="isDark ? 'border-agent-400/50 bg-agent-400/6 text-wt-aux' : 'border-violet-300 bg-violet-50/60 text-slate-600'"
                        v-html="renderArtifactMarkdown(term.context)"></div>
                    </div>
                  </div>
                </div>
                <div class="shrink-0 flex items-center gap-1 pt-0.5">
                  <span v-if="term.category" class="font-disp text-[9px] font-semibold tracking-wider px-1.5 py-0.5 rounded"
                    :class="isDark ? 'text-agent-300/80 bg-agent-400/8' : 'text-violet-600 bg-violet-50'"
                    v-html="renderArtifactMarkdownInline(term.category)"></span>
                  <button v-if="term.context"
                    @click="expandedId = expandedId === termId(term, index) ? '' : termId(term, index)"
                    :title="expandedId === termId(term, index) ? '收起语境' : '原文语境'"
                    class="h-6 w-6 rounded-md flex items-center justify-center transition-colors"
                    :class="isDark ? 'text-wt-dim hover:text-agent-300 hover:bg-white/5' : 'text-zinc-400 hover:text-violet-600 hover:bg-violet-50'">
                    <i class="ri-arrow-down-s-line text-[15px] transition-transform duration-300"
                      :class="expandedId === termId(term, index) ? 'rotate-180' : ''" />
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="py-14 text-center">
            <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
              :class="isDark ? 'bg-agent-400/10 text-agent-300/70' : 'bg-violet-50 text-violet-400'">
              <i class="ri-book-2-line text-[22px]" />
            </div>
            <p class="mt-3 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-slate-500'">{{ isFiltering ? '词典里没查到这个词' : '暂无术语内容' }}</p>
            <button v-if="isFiltering" @click="resetFilters" class="mt-2 text-[11px] font-medium transition-colors"
              :class="isDark ? 'text-agent-300 hover:text-agent-400' : 'text-violet-600 hover:text-violet-700'">清除筛选条件</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-disp { font-family: 'Space Grotesk', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
input[type='search']::-webkit-search-cancel-button { -webkit-appearance: none; }

.gl-reveal { animation: gl-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes gl-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .gl-reveal { animation: none; } }

.artifact-markdown :deep(p) { margin: 0; }
.artifact-markdown :deep(p + p) { margin-top: 0.45rem; }
.artifact-markdown :deep(ul),
.artifact-markdown :deep(ol) { margin: 0.35rem 0; padding-left: 1.2rem; }
.artifact-markdown :deep(pre),
.artifact-markdown :deep(.math-block) { max-width: 100%; overflow-x: auto; overflow-y: hidden; margin: 0.35rem 0; }
.artifact-markdown :deep(.math-block) { padding: 0.15rem 0; }
.artifact-markdown :deep(.katex-display) { margin: 0.4em 0; }
</style>
