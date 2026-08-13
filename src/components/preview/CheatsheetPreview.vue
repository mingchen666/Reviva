<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { renderArtifactMarkdown, renderArtifactMarkdownInline } from '@/utils/artifactMarkdown'

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  isDark: { type: Boolean, default: false },
})

const payload = computed(() => props.data?.result_json || {})
const sections = computed(() => Array.isArray(payload.value?.sections) ? payload.value.sections : [])

const WIDE_PX = 820
const rootEl = ref(null)
const isWide = ref(false)
let resizeObserver = null

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const updateLayout = () => {
    isWide.value = el.clientWidth >= WIDE_PX
  }
  updateLayout()
  resizeObserver = new ResizeObserver(updateLayout)
  resizeObserver.observe(el)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

const KIND_META = {
  formula: { label: '公式', icon: 'ri-function-line', hue: 'bg-sky-400', textDark: 'text-sky-300', textLight: 'text-sky-600', chipDark: 'bg-sky-400/10 text-sky-300', chipLight: 'bg-sky-50 text-sky-700' },
  fact: { label: '事实', icon: 'ri-database-2-line', hue: 'bg-brand-400', textDark: 'text-brand-300', textLight: 'text-brand-600', chipDark: 'bg-brand-400/10 text-brand-300', chipLight: 'bg-brand-50 text-brand-600' },
  step: { label: '步骤', icon: 'ri-route-line', hue: 'bg-emerald-400', textDark: 'text-emerald-300', textLight: 'text-emerald-600', chipDark: 'bg-emerald-400/10 text-emerald-300', chipLight: 'bg-emerald-50 text-emerald-700' },
  pitfall: { label: '易错', icon: 'ri-error-warning-line', hue: 'bg-red-400', textDark: 'text-red-300', textLight: 'text-rose-600', chipDark: 'bg-red-400/10 text-red-300', chipLight: 'bg-rose-50 text-rose-700' },
  rule: { label: '规则', icon: 'ri-shield-check-line', hue: 'bg-amber-400', textDark: 'text-amber-300', textLight: 'text-amber-700', chipDark: 'bg-amber-400/10 text-amber-300', chipLight: 'bg-amber-50 text-amber-700' },
}

const kindMeta = kind => KIND_META[kind] || KIND_META.fact
const pad = n => String(n).padStart(2, '0')
const totalItems = computed(() => sections.value.reduce((total, section) => total + (Array.isArray(section.items) ? section.items.length : 0), 0))

function plain(value) {
  return String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#~]/g, '')
    .trim()
}

const scrollEl = ref(null)
const activeSection = ref(0)
const sectionRefs = ref([])
const chipRefs = ref([])

const setSectionRef = (el, index) => {
  if (el) sectionRefs.value[index] = el
}
const setChipRef = (el, index) => {
  if (el) chipRefs.value[index] = el
}
const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

function scrollToSection(index) {
  activeSection.value = index
  const scroller = scrollEl.value
  const target = sectionRefs.value[index]
  if (!scroller || !target) return
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  scroller.scrollTo({ top: Math.max(top - 16, 0), behavior: scrollBehavior() })
}

function syncActiveSection() {
  const scroller = scrollEl.value
  if (!scroller) return
  const top = scroller.getBoundingClientRect().top
  let current = 0
  sectionRefs.value.forEach((section, index) => {
    if (section && section.getBoundingClientRect().top - top <= 92) current = index
  })
  activeSection.value = current
}

let scrollTicking = false
function handleScroll() {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    syncActiveSection()
    scrollTicking = false
  })
}

watch(activeSection, index => {
  chipRefs.value[index]?.scrollIntoView({ behavior: scrollBehavior(), inline: 'center', block: 'nearest' })
})
watch(() => sections.value.length, () => nextTick(syncActiveSection))
</script>

<template>
  <div ref="rootEl" class="w-full h-full flex flex-col overflow-hidden cheatsheet-preview" :class="isDark ? 'bg-d2' : 'bg-[#f4f3ef]'">
    <div v-if="sections.length && !isWide" class="shrink-0 px-3 pt-3 pb-2" :class="isDark ? 'bg-d2' : 'bg-[#f4f3ef]'">
      <nav class="cs-scroll-x flex items-center gap-1.5 overflow-x-auto" aria-label="章节导航">
        <button v-for="(section, index) in sections" :key="`chip-${index}`" :ref="el => setChipRef(el, index)" type="button"
          @click="scrollToSection(index)" :aria-current="activeSection === index ? 'true' : undefined"
          class="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-[10px] transition-colors"
          :class="activeSection === index
            ? (isDark ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 font-bold' : 'border-amber-400 bg-amber-50 text-amber-700 font-bold')
            : (isDark ? 'border-d4 bg-d0 text-wt-sub' : 'border-stone-200 bg-white text-stone-600')">
          <span class="font-disp text-[9px]">{{ pad(index + 1) }}</span>
          <span class="max-w-[10rem] truncate">{{ plain(section.title) }}</span>
        </button>
      </nav>
    </div>

    <div v-if="sections.length && isWide" class="flex-1 min-h-0 max-w-5xl w-full mx-auto flex gap-6 p-5">
      <aside class="w-44 shrink-0">
        <nav class="h-full rounded-lg border p-2 overflow-y-auto overscroll-contain" :class="isDark ? 'bg-d3 border-d4' : 'bg-white border-stone-200 shadow-sm'" aria-label="章节导航">
          <div class="px-2 pt-1.5 pb-2 flex items-center justify-between">
            <span class="font-disp text-[9px] font-bold tracking-[0.18em] uppercase" :class="isDark ? 'text-wt-dim' : 'text-stone-400'">目录</span>
            <span class="font-disp text-[9px] font-bold tabular-nums px-1 rounded" :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-stone-100 text-stone-500'">{{ sections.length }}</span>
          </div>
          <div class="space-y-0.5">
            <button v-for="(section, index) in sections" :key="`toc-${index}`" type="button" @click="scrollToSection(index)"
              :aria-current="activeSection === index ? 'true' : undefined"
              class="w-full text-left px-2 py-1.5 rounded-md border-l-2 transition-colors"
              :class="activeSection === index
                ? (isDark ? 'border-amber-400/80 bg-amber-400/[0.08]' : 'border-amber-500 bg-amber-50')
                : (isDark ? 'border-transparent hover:border-d4 hover:bg-white/[0.03]' : 'border-transparent hover:border-stone-200 hover:bg-stone-50')">
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="font-disp text-[9px] font-bold shrink-0 tabular-nums" :class="activeSection === index ? (isDark ? 'text-amber-300' : 'text-amber-600') : (isDark ? 'text-wt-dim' : 'text-stone-400')">{{ pad(index + 1) }}</span>
                <span class="text-[11px] truncate" :class="activeSection === index ? (isDark ? 'text-wt-main font-bold' : 'text-zinc-800 font-bold') : (isDark ? 'text-wt-sub' : 'text-stone-600')">{{ plain(section.title) }}</span>
              </span>
            </button>
          </div>
        </nav>
      </aside>

      <div ref="scrollEl" @scroll.passive="handleScroll" class="flex-1 min-w-0 overflow-y-auto pr-1">
        <main class="cs-reveal min-w-0 rounded-xl border border-t-[3px] p-6" :class="isDark ? 'bg-d3 border-d4 border-t-amber-400/80' : 'bg-white border-stone-200 border-t-amber-400 shadow-sm'">
          <header class="pb-4 border-b" :class="isDark ? 'border-d4' : 'border-stone-200'">
            <h1 class="font-disp text-[20px] sm:text-[22px] leading-snug font-extrabold tracking-tight" :class="isDark ? 'text-wt-main' : 'text-zinc-800'" v-html="renderArtifactMarkdownInline(payload.title || '速查表')"></h1>
            <div v-if="payload.summary" class="artifact-markdown mt-1 text-[12px] leading-relaxed max-w-2xl break-words" :class="isDark ? 'text-wt-sub' : 'text-stone-500'" v-html="renderArtifactMarkdown(payload.summary)"></div>
            <p class="mt-3 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-stone-400'">共 <b class="font-disp" :class="isDark ? 'text-wt-sub' : 'text-stone-500'">{{ totalItems }}</b> 条硬货 · {{ sections.length }} 个分区</p>
          </header>

          <div class="mt-5 space-y-7">
            <section v-for="(section, sectionIndex) in sections" :key="`${section.title}-${sectionIndex}`" :ref="el => setSectionRef(el, sectionIndex)"
              :id="`cs-sec-${sectionIndex}`" class="cs-reveal scroll-mt-5" :style="{ animationDelay: 60 + sectionIndex * 60 + 'ms' }">
              <div class="flex items-center gap-2.5">
                <span class="font-disp text-[11px] font-bold" :class="isDark ? 'text-amber-300' : 'text-amber-600'">{{ pad(sectionIndex + 1) }}</span>
                <h2 class="text-[14px] font-bold min-w-0" :class="isDark ? 'text-wt-main' : 'text-zinc-800'" v-html="renderArtifactMarkdownInline(section.title)"></h2>
                <span class="flex-1 h-px" :class="isDark ? 'bg-d4' : 'bg-stone-200'" />
                <span class="font-disp text-[9px] shrink-0 tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-stone-400'">{{ (section.items || []).length }}</span>
              </div>

              <div class="mt-3 space-y-2">
                <article v-for="(item, itemIndex) in (section.items || [])" :key="`${item.label}-${itemIndex}`" class="cs-entry flex gap-2.5 rounded-md px-2.5 py-2 -mx-2.5"
                  :class="item.kind === 'pitfall' ? (isDark ? 'bg-red-400/10' : 'bg-rose-50') : ''">
                  <span class="w-0.5 self-stretch rounded-full shrink-0" :class="kindMeta(item.kind).hue" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <i :class="[kindMeta(item.kind).icon, 'text-[11px]', isDark ? kindMeta(item.kind).textDark : kindMeta(item.kind).textLight]" />
                      <span class="text-[11.5px] font-bold" :class="isDark ? 'text-wt-main' : 'text-zinc-700'" v-html="renderArtifactMarkdownInline(item.label)"></span>
                      <span class="px-1 py-px rounded text-[8.5px] font-medium" :class="isDark ? kindMeta(item.kind).chipDark : kindMeta(item.kind).chipLight">{{ kindMeta(item.kind).label }}</span>
                    </div>
                    <div class="artifact-markdown cs-entry-content mt-1 leading-relaxed break-words" :class="[item.kind === 'formula' ? 'cs-formula text-[11px]' : 'text-[11.5px]', isDark ? 'text-wt-sub' : 'text-stone-600']" v-html="renderArtifactMarkdown(item.content)"></div>
                    <div v-if="item.note" class="mt-1 flex items-start gap-1 text-[10px] leading-relaxed" :class="isDark ? 'text-amber-300' : 'text-amber-700'">
                      <i class="ri-pushpin-2-line mt-0.5 shrink-0" />
                      <div class="artifact-markdown min-w-0 flex-1" v-html="renderArtifactMarkdown(item.note)"></div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>

    <div v-else-if="sections.length" ref="scrollEl" @scroll.passive="handleScroll" class="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
      <main class="cs-reveal min-w-0 rounded-xl border border-t-[3px] p-4" :class="isDark ? 'bg-d3 border-d4 border-t-amber-400/80' : 'bg-white border-stone-200 border-t-amber-400 shadow-sm'">
        <header class="pb-4 border-b" :class="isDark ? 'border-d4' : 'border-stone-200'">
          <h1 class="font-disp text-[20px] sm:text-[22px] leading-snug font-extrabold tracking-tight" :class="isDark ? 'text-wt-main' : 'text-zinc-800'" v-html="renderArtifactMarkdownInline(payload.title || '速查表')"></h1>
          <div v-if="payload.summary" class="artifact-markdown mt-1 text-[12px] leading-relaxed max-w-2xl break-words" :class="isDark ? 'text-wt-sub' : 'text-stone-500'" v-html="renderArtifactMarkdown(payload.summary)"></div>
          <p class="mt-3 text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-stone-400'">共 <b class="font-disp" :class="isDark ? 'text-wt-sub' : 'text-stone-500'">{{ totalItems }}</b> 条硬货 · {{ sections.length }} 个分区</p>
        </header>

        <div class="mt-5 space-y-7">
          <section v-for="(section, sectionIndex) in sections" :key="`${section.title}-${sectionIndex}`" :ref="el => setSectionRef(el, sectionIndex)"
            :id="`cs-sec-${sectionIndex}`" class="cs-reveal scroll-mt-5" :style="{ animationDelay: 60 + sectionIndex * 60 + 'ms' }">
            <div class="flex items-center gap-2.5">
              <span class="font-disp text-[11px] font-bold" :class="isDark ? 'text-amber-300' : 'text-amber-600'">{{ pad(sectionIndex + 1) }}</span>
              <h2 class="text-[14px] font-bold min-w-0" :class="isDark ? 'text-wt-main' : 'text-zinc-800'" v-html="renderArtifactMarkdownInline(section.title)"></h2>
              <span class="flex-1 h-px" :class="isDark ? 'bg-d4' : 'bg-stone-200'" />
              <span class="font-disp text-[9px] shrink-0 tabular-nums" :class="isDark ? 'text-wt-dim' : 'text-stone-400'">{{ (section.items || []).length }}</span>
            </div>

            <div class="mt-3 space-y-2">
              <article v-for="(item, itemIndex) in (section.items || [])" :key="`${item.label}-${itemIndex}`" class="cs-entry flex gap-2.5 rounded-md px-2.5 py-2 -mx-2.5"
                :class="item.kind === 'pitfall' ? (isDark ? 'bg-red-400/10' : 'bg-rose-50') : ''">
                <span class="w-0.5 self-stretch rounded-full shrink-0" :class="kindMeta(item.kind).hue" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <i :class="[kindMeta(item.kind).icon, 'text-[11px]', isDark ? kindMeta(item.kind).textDark : kindMeta(item.kind).textLight]" />
                    <span class="text-[11.5px] font-bold" :class="isDark ? 'text-wt-main' : 'text-zinc-700'" v-html="renderArtifactMarkdownInline(item.label)"></span>
                    <span class="px-1 py-px rounded text-[8.5px] font-medium" :class="isDark ? kindMeta(item.kind).chipDark : kindMeta(item.kind).chipLight">{{ kindMeta(item.kind).label }}</span>
                  </div>
                  <div class="artifact-markdown cs-entry-content mt-1 leading-relaxed break-words" :class="[item.kind === 'formula' ? 'cs-formula text-[11px]' : 'text-[11.5px]', isDark ? 'text-wt-sub' : 'text-stone-600']" v-html="renderArtifactMarkdown(item.content)"></div>
                  <div v-if="item.note" class="mt-1 flex items-start gap-1 text-[10px] leading-relaxed" :class="isDark ? 'text-amber-300' : 'text-amber-700'">
                    <i class="ri-pushpin-2-line mt-0.5 shrink-0" />
                    <div class="artifact-markdown min-w-0 flex-1" v-html="renderArtifactMarkdown(item.note)"></div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>
    </div>

    <div v-else class="flex-1 min-h-0 flex items-center justify-center text-center">
      <div>
        <div class="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center" :class="isDark ? 'bg-amber-400/10 text-amber-300/70' : 'bg-amber-50 text-amber-500/70'">
          <i class="ri-file-list-3-line text-[22px]" />
        </div>
        <p class="mt-3 text-[12px]" :class="isDark ? 'text-wt-aux' : 'text-stone-500'">暂无速查内容</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-disp { font-family: 'Space Grotesk', 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.cs-scroll-x { scrollbar-width: none; }
.cs-scroll-x::-webkit-scrollbar { display: none; }
.cs-reveal { animation: cs-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes cs-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .cs-reveal { animation: none; } }

.artifact-markdown :deep(p) { margin: 0; }
.artifact-markdown :deep(p + p) { margin-top: 0.45rem; }
.artifact-markdown :deep(ul),
.artifact-markdown :deep(ol) { margin: 0.35rem 0; padding-left: 1.2rem; }
.artifact-markdown :deep(pre),
.artifact-markdown :deep(.math-block) { max-width: 100%; overflow-x: auto; overflow-y: hidden; margin: 0.35rem 0; }
.artifact-markdown :deep(.math-block) { padding: 0.15rem 0; }
.artifact-markdown :deep(.katex-display) { margin: 0.4em 0; }
.cs-formula :deep(.katex) { font-size: 1.05em; }
</style>
