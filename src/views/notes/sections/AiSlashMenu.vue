<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import { NOTE_AI_COMMANDS } from '@/composables/useNoteAi'

const props = defineProps({
  show: { type: Boolean, default: false },
  // Position relative to viewport
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  // Filter typed after the `/`
  query: { type: String, default: '' },
})
const emit = defineEmits(['select', 'close'])

const appStore = useAppStore()
const isDark = computed(() => appStore.isDark)

const COMMANDS = [
  { key: 'continue', ...NOTE_AI_COMMANDS.continue },
  { key: 'polish', ...NOTE_AI_COMMANDS.polish },
  { key: 'expand', ...NOTE_AI_COMMANDS.expand },
  { key: 'shorten', ...NOTE_AI_COMMANDS.shorten },
  { key: 'translate', ...NOTE_AI_COMMANDS.translate },
  { key: 'translate-zh', ...NOTE_AI_COMMANDS['translate-zh'] },
  { key: 'summarize', ...NOTE_AI_COMMANDS.summarize },
  { key: 'outline', ...NOTE_AI_COMMANDS.outline },
  { key: 'explain', ...NOTE_AI_COMMANDS.explain },
  { key: 'formula', ...NOTE_AI_COMMANDS.formula },
]

const filtered = computed(() => {
  const q = props.query.trim().toLowerCase()
  if (!q) return COMMANDS
  return COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.key.includes(q) || c.desc.toLowerCase().includes(q))
})

const activeIdx = ref(0)
watch(filtered, () => { activeIdx.value = 0 })
watch(() => props.show, (v) => { if (v) activeIdx.value = 0 })

function move(delta) {
  if (!filtered.value.length) return
  activeIdx.value = (activeIdx.value + delta + filtered.value.length) % filtered.value.length
  nextTick(() => {
    const el = document.querySelector(`.slash-item[data-idx="${activeIdx.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function pick(idx) {
  const item = filtered.value[idx ?? activeIdx.value]
  if (!item) return
  emit('select', item.key)
}

function onKeydown(e) {
  if (!props.show) return
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); pick() }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
}

defineExpose({ onKeydown, hasItems: computed(() => filtered.value.length > 0) })

const COLOR_TEXT = {
  brand: { dark: 'text-brand-400', light: 'text-brand-500' },
  agent: { dark: 'text-agent-400', light: 'text-agent-500' },
  emerald: { dark: 'text-emerald-400', light: 'text-emerald-600' },
  amber: { dark: 'text-amber-400', light: 'text-amber-600' },
  blue: { dark: 'text-blue-400', light: 'text-blue-500' },
  rose: { dark: 'text-rose-400', light: 'text-rose-500' },
}
function colorCls(c) { return isDark.value ? COLOR_TEXT[c]?.dark : COLOR_TEXT[c]?.light }
</script>

<template>
  <Teleport to="body">
    <div v-if="show && filtered.length"
      class="slash-menu fixed z-[80] rounded-lg shadow-2xl backdrop-blur-md"
      :class="isDark ? 'bg-d3/95 border border-bdr' : 'bg-l1/95 border border-bdrL'"
      :style="{ left: x + 'px', top: y + 'px', width: '280px', maxHeight: '320px' }">
      <div class="flex items-center gap-1.5 px-3 py-2"
        :class="isDark ? 'border-b border-d4' : 'border-b border-bdrF'">
        <i class="ri-magic-line text-[12px] text-agent-400" />
        <span class="text-[10.5px] font-semibold" :class="isDark ? 'text-wt-aux' : 'text-lt-aux'">AI 笔记助手</span>
        <span v-if="query" class="ml-auto text-[10px] font-mono px-1.5 py-[1px] rounded"
          :class="isDark ? 'bg-d0 text-wt-dim' : 'bg-l3 text-lt-aux'">/{{ query }}</span>
      </div>
      <div class="overflow-y-auto thin-scroll py-1" style="max-height: 270px">
        <button v-for="(c, i) in filtered" :key="c.key"
          :data-idx="i"
          @mouseenter="activeIdx = i"
          @mousedown.prevent="pick(i)"
          class="slash-item w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
          :class="activeIdx === i
            ? (isDark ? 'bg-brand-400/12' : 'bg-brand-50')
            : (isDark ? 'hover:bg-white/4' : 'hover:bg-l4')">
          <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-d0' : 'bg-l3'">
            <i :class="[c.icon, 'text-[14px]', colorCls(c.color)]" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[12px] font-medium truncate" :class="isDark ? 'text-wt-main' : 'text-lt-main'">{{ c.label }}</div>
            <div class="text-[10px] truncate" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">{{ c.desc }}</div>
          </div>
          <span v-if="activeIdx === i" class="text-[9px] font-mono px-1 py-[1px] rounded shrink-0"
            :class="isDark ? 'bg-d0 text-wt-dim border border-bdr' : 'bg-l3 text-lt-aux border border-bdrF'">↵</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.thin-scroll::-webkit-scrollbar { width: 5px }
.thin-scroll::-webkit-scrollbar-thumb { background: rgba(127,127,127,.25); border-radius: 3px }
</style>
