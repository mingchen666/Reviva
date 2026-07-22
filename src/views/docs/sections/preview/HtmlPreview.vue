<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ source: { type: String, default: '' }, filePath: { type: String, default: '' }, isDark: Boolean })
const view = ref('preview')
watch(() => props.filePath, () => { view.value = 'preview' })
</script>

<template>
  <div class="h-full min-h-0 flex flex-col p-4 gap-3">
    <div class="flex items-center justify-between gap-3 shrink-0">
      <div class="inline-flex rounded-lg p-0.5" :class="isDark ? 'bg-d4' : 'bg-l4'">
        <button class="h-7 px-3 rounded-md text-[11px]" :class="view === 'preview' ? (isDark ? 'bg-d2 text-wt-main' : 'bg-white text-lt-main shadow-sm') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" @click="view = 'preview'">页面预览</button>
        <button class="h-7 px-3 rounded-md text-[11px]" :class="view === 'source' ? (isDark ? 'bg-d2 text-wt-main' : 'bg-white text-lt-main shadow-sm') : (isDark ? 'text-wt-dim' : 'text-lt-aux')" @click="view = 'source'">查看源码</button>
      </div>
      <span class="text-[10px]" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">安全沙箱 · 禁止脚本、表单与弹窗</span>
    </div>
    <iframe v-if="view === 'preview'" :srcdoc="source" sandbox="" referrerpolicy="no-referrer" class="w-full flex-1 min-h-[420px] rounded-xl border bg-white" :class="isDark ? 'border-d4' : 'border-bdrL'" />
    <pre v-else class="flex-1 min-h-[420px] overflow-auto rounded-xl border p-4 text-[12px] font-mono whitespace-pre-wrap break-all" :class="isDark ? 'border-d4 bg-d3 text-wt-sub' : 'border-bdrL bg-l3 text-lt-sub'">{{ source }}</pre>
  </div>
</template>
