<script setup>
import { createMarkdownRenderer } from '@/utils/markdown'
import { parseMarkdownFrontMatter } from '@/utils/markdownFrontMatter'
import { computed } from 'vue'

const md = createMarkdownRenderer()
const renderImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('referrerpolicy', 'no-referrer')
  tokens[idx].attrSet('decoding', 'async')
  return renderImage(tokens, idx, options, env, self)
}

const props = defineProps({ content: { type: String, default: '' }, isDark: Boolean })
const api = () => window.electronAPI
function safeUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '' } catch { return '' } }
const document = computed(() => parseMarkdownFrontMatter(props.content))
const source = computed(() => { const a = document.value.attributes || {}; const sourceUrl = safeUrl(a.source_url); const finalUrl = safeUrl(a.final_url); return (!sourceUrl && !a.provider && !a.fetched_at) ? null : { title: String(a.title || ''), sourceUrl, finalUrl: finalUrl && finalUrl !== sourceUrl ? finalUrl : '', provider: String(a.provider || ''), description: String(a.description || ''), fetchedAt: String(a.fetched_at || '') } })
const provider = computed(() => ({ jina: 'Jina Reader', firecrawl: 'Firecrawl', tavily: 'Tavily Extract' })[source.value?.provider] || source.value?.provider || '网页解析')
const fetchedAt = computed(() => { const value = source.value?.fetchedAt; if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date) })
const rendered = computed(() => document.value.body ? md.render(document.value.body) : '')
function open(url) { const value = safeUrl(url); if (value) api()?.openExternal?.(value) }
</script>

<template>
  <div class="p-6"><div class="max-w-4xl mx-auto"><section v-if="source" class="web-source-card mb-4" :class="isDark ? 'web-source-card--dark' : 'web-source-card--light'"><div class="flex items-start gap-3"><div class="web-source-icon" :class="isDark ? 'bg-brand-400/12 text-brand-300' : 'bg-brand-50 text-brand-600'"><i class="ri-global-line text-[16px]" /></div><div class="min-w-0 flex-1"><div class="flex items-center gap-2 flex-wrap"><span class="text-[14px] font-semibold" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ source.title || '网页来源' }}</span><span class="web-source-provider" :class="isDark ? 'bg-white/5 text-wt-dim' : 'bg-l4 text-lt-aux'">{{ provider }}</span><span v-if="fetchedAt" class="text-[12px] ml-auto shrink-0" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ fetchedAt }}</span></div><button v-if="source.sourceUrl" class="web-source-link mt-2" :title="source.sourceUrl" @click="open(source.sourceUrl)"><i class="ri-link text-[13px]" /><span class="truncate">{{ source.sourceUrl }}</span></button><p v-if="source.description" class="text-[13px] leading-5 mt-2" :class="isDark ? 'text-wt-sub' : 'text-lt-sub'">{{ source.description }}</p><details v-if="source.finalUrl" class="web-source-details mt-2"><summary :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">查看最终跳转地址</summary><button class="web-source-link mt-1.5" @click="open(source.finalUrl)">{{ source.finalUrl }}</button></details></div></div></section><div v-if="rendered" class="rounded-xl p-6 markdown-content" :class="isDark ? 'markdown-content--dark bg-d3' : 'markdown-content--light bg-l3'" v-html="rendered" /></div></div>
</template>

<style scoped>
.web-source-card{padding:16px;border:1px solid transparent;border-radius:12px}.web-source-card--light{background:rgba(255,255,255,.72);border-color:rgba(15,23,42,.08)}.web-source-card--dark{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.08)}.web-source-icon{width:34px;height:34px;flex:0 0 34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center}.web-source-provider{display:inline-flex;align-items:center;height:22px;padding:0 7px;border-radius:6px;font-size:11px;font-weight:600}.web-source-link{width:100%;min-width:0;display:flex;align-items:center;gap:6px;color:#818cf8;font-size:12.5px;line-height:20px;text-align:left}.web-source-details summary{width:fit-content;cursor:pointer;font-size:12px;line-height:20px;user-select:none}
.markdown-content :deep(img){width:auto;max-width:min(100%,680px);max-height:560px;height:auto;object-fit:contain}
</style>
