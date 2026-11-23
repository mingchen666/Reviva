<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  selectedTitle: { type: String, default: '' },
})
const emit = defineEmits(['select'])
const picker = ref(null)
const searchInput = ref(null)
const query = ref('')
const selected = computed(() => props.sources.find(source => source.id === props.selectedId))
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle ? props.sources.filter(source => [source.title, source.id, source.original_uri].some(value => String(value || '').toLowerCase().includes(needle))) : props.sources
})
watch(() => props.selectedId, () => { query.value = '' })
function select(sourceId) {
  if (sourceId !== props.selectedId) emit('select', sourceId)
  close()
}
function close() {
  if (picker.value) picker.value.open = false
  picker.value?.querySelector?.('summary')?.focus?.()
}
async function handleToggle() {
  if (!picker.value?.open) return
  query.value = ''
  await nextTick()
  searchInput.value?.focus?.()
}
function handleOutside(event) {
  if (picker.value?.open && !picker.value.contains(event.target)) picker.value.open = false
}
onMounted(() => document.addEventListener?.('pointerdown', handleOutside))
onBeforeUnmount(() => document.removeEventListener?.('pointerdown', handleOutside))
function handleKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  const buttons = [...(picker.value?.querySelectorAll?.('.source-picker__list button') || [])]
  if (!buttons.length) return
  event.preventDefault()
  if (!picker.value?.open) picker.value.open = true
  const index = buttons.indexOf(document.activeElement)
  const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
</script>

<template>
  <details ref="picker" class="source-picker" @keydown="handleKeydown" @toggle="handleToggle">
    <summary aria-label="选择摘录来源" title="切换来源文档"><i class="ri-file-text-line" /><span>{{ selectedTitle || selected?.title || selected?.id || selectedId || '选择来源文档' }}</span><i class="ri-arrow-down-s-line picker-chevron" /></summary>
    <div class="source-picker__menu" @click.stop>
      <div class="source-picker__caption"><b>切换来源</b><span>{{ sources.length }} 个文档</span></div>
      <input ref="searchInput" v-model="query" type="search" aria-label="搜索摘录来源" placeholder="搜索标题、来源 ID 或原文 URI" />
      <div class="source-picker__list" aria-label="来源选择结果">
        <button v-for="source in filtered" :key="source.id" type="button" :aria-pressed="source.id === selectedId" :aria-label="`选择来源 ${source.title || source.id}`" @click="select(source.id)">
          <i :class="source.id === selectedId ? 'ri-checkbox-circle-line' : 'ri-file-text-line'" /><span><b>{{ source.title || source.id }}</b><small>{{ source.original_uri || source.id }}</small></span>
        </button>
        <p v-if="!sources.length">当前 Wiki 暂无来源，请先添加文档或笔记。</p>
        <p v-else-if="!filtered.length">没有匹配的来源</p>
      </div>
    </div>
  </details>
</template>

<style scoped>
.source-picker { position: relative; box-sizing: border-box; min-width: 0; width: 100%; max-width: 440px; font-size: 12px; }
summary { display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; min-height: 34px; padding: 5px 6px; border: 1px solid var(--ui-border-card); border-radius: 7px; color: var(--ui-text-main); background: var(--ui-bg-2); cursor: pointer; list-style: none; transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease; }
summary::-webkit-details-marker { display: none; }
summary > span { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; font-weight: 600; }
summary > i { flex-shrink: 0; color: var(--ui-text-aux); font-size: 17px; }
summary > .picker-chevron { font-size: 16px; }
summary:hover { background: var(--ui-bg-3); border-color: var(--ui-border-panel); }
summary:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--ui-brand-400); outline-offset: -2px; }
.source-picker__menu { position: absolute; top: calc(100% + 8px); left: 0; box-sizing: border-box; z-index: 5; width: 100%; padding: 12px; border: 1px solid var(--ui-border-card); border-radius: 8px; background: var(--ui-bg-2); box-shadow: var(--ui-shadow-popup, 0 8px 24px rgba(0,0,0,.12)); }
.source-picker__menu::before { content: ""; position: absolute; top: -6px; left: 18px; width: 10px; height: 10px; border-top: 1px solid var(--ui-border-card); border-left: 1px solid var(--ui-border-card); background: var(--ui-bg-2); transform: rotate(45deg); }
.source-picker__caption { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: var(--ui-text-main); font-size: 12px; }
.source-picker__caption span { color: var(--ui-text-aux); font-size: 11px; }
.source-picker[open] summary { border-color: var(--ui-brand-400); color: var(--ui-text-main); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-brand-500) 10%, transparent); }
input { box-sizing: border-box; width: 100%; min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--ui-border-card); border-radius: 5px; color: var(--ui-text-main); background: var(--ui-bg-2); }
.source-picker__list { max-height: min(260px, 35vh); overflow-y: auto; padding-top: 6px; }
button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; border-radius: 5px; text-align: left; color: var(--ui-text-sub); }
button:hover { background: var(--ui-bg-3); }
button[aria-pressed="true"] { color: var(--ui-brand-500); background: color-mix(in srgb, var(--ui-brand-500) 10%, var(--ui-bg-1)); }
button > span { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
b, button small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
b { font-weight: 500; }
button small { color: var(--ui-text-aux); font-size: 10px; }
p { margin: 8px; color: var(--ui-text-aux); font-size: 11px; line-height: 1.6; }
@container (max-width: 420px) {
  .source-picker__menu {
    left: 0;
    width: 100%;
  }
}
</style>
