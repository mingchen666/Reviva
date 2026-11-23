<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { sourceExtractLocation } from '@/utils/wikiSourceExtract'

const props = defineProps({
  wikiId: { type: String, required: true },
  passageId: { type: String, required: true },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'open-source-extract'])
const loading = ref(false)
const error = ref('')
const passage = ref(null)
const closeButton = ref(null)
const preview = ref(null)
const extractLocation = computed(() => sourceExtractLocation(passage.value))
let requestVersion = 0

function openExtract() {
  if (!passage.value?.source_id) return
  emit('open-source-extract', { sourceId: passage.value.source_id, location: extractLocation.value })
  emit('close')
}
function trapFocus(event) {
  const buttons = [...(preview.value?.querySelectorAll?.('button') || [])]
  if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
  else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
}

watch(() => [props.wikiId, props.passageId], async ([wikiId, passageId]) => {
  const version = ++requestVersion
  passage.value = null
  error.value = ''
  loading.value = true
  await nextTick()
  closeButton.value?.focus?.()
  try {
    const result = await window.electronAPI?.wiki?.wikiTool({ wikiId, action: 'read_passage', passageId })
    if (version !== requestVersion) return
    if (!result?.success || !result.data) throw new Error(result?.error || '引用片段不可用，请重新检索来源')
    if (result.data.wiki_id !== wikiId) throw new Error('引用不属于当前 Wiki')
    passage.value = result.data
  } catch (err) {
    if (version === requestVersion) error.value = err.message
  } finally {
    if (version === requestVersion) loading.value = false
  }
}, { immediate: true })
onBeforeUnmount(() => { requestVersion++ })
</script>

<template>
  <div class="citation-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <section ref="preview" class="citation-preview" :class="{ 'is-dark': isDark }" role="dialog" aria-modal="true" aria-label="来源证据片段" @keydown.tab="trapFocus">
      <header><div><h2>来源证据片段</h2><p>以下行号来自当前解析摘录，原文页码另行标注。</p></div><button ref="closeButton" type="button" aria-label="关闭来源证据" @click="emit('close')"><i class="ri-close-line" /></button></header>
      <p v-if="loading" class="citation-message" role="status">正在读取来源片段…</p>
      <p v-else-if="error" class="citation-message citation-error" role="alert">{{ error }}</p>
      <template v-else-if="passage">
        <div class="citation-location">
          <div class="citation-location-copy">
            <p>{{ passage.page_path }}</p>
            <span>摘录第 {{ passage.start_line }}–{{ passage.end_line }} 行</span>
            <span v-if="passage.pdf_page">原文第 {{ passage.pdf_page }} 页</span>
            <span v-if="passage.time_range_ms">时间范围 {{ passage.time_range_ms.start }}–{{ passage.time_range_ms.end }} ms</span>
            <p v-if="passage.source_id">来源 ID：{{ passage.source_id }}</p>
          </div>
          <button v-if="passage.source_id" class="extract-link" type="button" @click="openExtract"><i class="ri-file-search-line" /><span>查看完整摘录{{ extractLocation ? '并定位引用' : '' }}</span><i class="ri-arrow-right-up-line" /></button>
        </div>
        <pre class="citation-text">{{ passage.text }}</pre>
      </template>
    </section>
  </div>
</template>

<style scoped>
.citation-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; background: rgba(8,10,20,.4); }
.citation-preview { width: min(720px,100%); min-width: 0; max-height: 85vh; display: flex; flex-direction: column; background: var(--ui-bg-1); color: var(--ui-text-main); border: 1px solid var(--ui-border-card); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.2); container-type: inline-size; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px; border-bottom: 1px solid var(--ui-border-panel); }
h2 { margin: 0; font-size: 15px; font-weight: 650; }
header p { margin: 6px 0 0; font-size: 11px; color: var(--ui-text-aux); }
header button { width: 30px; height: 30px; flex-shrink: 0; border-radius: 6px; color: var(--ui-text-aux); font-size: 20px; }
header button:hover { background: var(--ui-bg-3); }
header button:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: 2px; }
.citation-location { display: flex; align-items: center; gap: 16px; flex-shrink: 0; padding: 14px 20px; font-size: 11px; line-height: 1.8; color: var(--ui-text-sub); }
.citation-location-copy { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.citation-location p { margin: 0; }
.citation-location-copy > span { display: inline-block; margin-right: 14px; color: var(--ui-brand-500); }
.extract-link { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 6px; margin-left: auto; min-height: 32px; padding: 5px 10px; border: 1px solid color-mix(in srgb, var(--ui-brand-500) 20%, var(--ui-border-card)); border-radius: 6px; white-space: nowrap; color: var(--ui-brand-500); background: color-mix(in srgb, var(--ui-brand-500) 7%, var(--ui-bg-1)); font-size: 11px; }
.extract-link:hover { background: color-mix(in srgb, var(--ui-brand-500) 13%, var(--ui-bg-1)); }
.extract-link:focus-visible { outline: 2px solid var(--ui-brand-400); }
.citation-text { margin: 0; padding: 18px 20px; background: var(--ui-bg-2); border-radius: 0 0 12px 12px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.8 ui-monospace, Consolas, monospace; }
.citation-message { padding: 20px; font-size: 12px; color: var(--ui-text-aux); }
.citation-error { color: #b91c1c; }
.is-dark .citation-error { color: #fca5a5; }
@container (max-width: 520px) { .citation-location { gap: 12px; padding: 12px 16px; } .extract-link { max-width: 48%; white-space: normal; text-align: left; } .extract-link > i { flex-shrink: 0; } }
@media (max-width: 520px) { .citation-backdrop { padding: 12px; } header { padding: 16px; } .citation-text { padding: 16px; } }
</style>
