<template>
  <aside class="panel" :class="isDark ? 'dark' : ''">
    <header class="panel-header" :class="isDark ? 'dark' : ''">
      <div class="min-w-0">
        <div class="title" :class="isDark ? 'dark' : ''">
          {{ isNode ? '节点信息' : '关系信息' }}
        </div>
        <div v-if="selected?.id" class="subtitle">id: {{ selected.id }}</div>
      </div>
      <button class="close-btn" :class="isDark ? 'dark' : ''" @click="$emit('close')">
        <i class="ri-close-line text-[16px]"></i>
      </button>
    </header>

    <section class="panel-body">
      <div class="card card-muted" :class="isDark ? 'dark' : ''">
        <div class="card-label">{{ isNode ? '节点名称' : '关系名称' }}</div>
        <div class="card-value">{{ selected?.name || '—' }}</div>
        <div v-if="isNode" class="mt-2">
          <div class="card-label">实体类型</div>
          <span v-if="selected?.entityType" class="chip">
            <i class="ri-shape-2-line"></i> {{ selected.entityType }}
          </span>
          <span v-else class="text-[12px] opacity-50">—</span>
        </div>
      </div>

      <div v-if="!isNode" class="card" :class="isDark ? 'dark' : ''">
        <div class="card-label">连接</div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="node-pill" :class="isDark ? 'dark' : ''">{{ selected?.sourceName || selected?.source }}</span>
          <i class="ri-arrow-right-line opacity-60"></i>
          <span class="node-pill" :class="isDark ? 'dark' : ''">{{ selected?.targetName || selected?.target }}</span>
        </div>
      </div>

      <div v-if="isNode" class="card" :class="isDark ? 'dark' : ''">
        <div class="card-label">标签</div>
        <div v-if="tags.length" class="flex flex-wrap gap-1.5">
          <span v-for="(t, i) in tags" :key="i" class="tag-pill">{{ t }}</span>
        </div>
        <div v-else class="text-[12px] opacity-50">—</div>
      </div>

      <div class="card" :class="isDark ? 'dark' : ''">
        <div class="card-label">描述</div>
        <div v-if="selected?.description" class="desc" :class="isDark ? 'dark' : ''">
          {{ selected.description }}
        </div>
        <div v-else class="text-[12px] opacity-50">暂无描述</div>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  selected: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})
defineEmits(['close'])

const isNode = computed(() => props.selected?.type === 'node')
const tags = computed(() => Array.isArray(props.selected?.tags) ? props.selected.tags : [])
</script>

<style scoped>
.panel {
  height: 100%;
  width: 280px;
  background: #ffffff;
  border-left: 1px solid #e4e4e7;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.panel.dark {
  background: #161620;
  border-left-color: #2E2E3A;
}
.panel-header {
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid #f4f4f5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.panel-header.dark {
  border-bottom-color: #2E2E3A;
}
.title { font-size: 13px; font-weight: 800; color: #18181b; }
.title.dark { color: #E8E8EE; }
.subtitle { font-size: 10px; color: #a1a1aa; font-family: ui-monospace, monospace; }
.close-btn {
  width: 28px; height: 28px; border-radius: 8px; color: #71717a;
  display: inline-flex; align-items: center; justify-content: center;
}
.close-btn:hover { background: #f4f4f5; }
.close-btn.dark { color: #B7B7C2; }
.close-btn.dark:hover { background: #2A2B3A; }
.panel-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.card {
  border: 1px solid #e4e4e7; border-radius: 12px; background: white; padding: 10px;
}
.card.dark { border-color: #2E2E3A; background: #1A1A24; }
.card-muted { background: #fafafa; }
.card-muted.dark { background: #1F2030; }
.card-label { font-size: 10px; color: #71717a; font-weight: 700; margin-bottom: 4px; }
.card.dark .card-label { color: #93939F; }
.card-value { font-size: 14px; font-weight: 800; color: #18181b; line-height: 1.4; word-break: break-word; }
.card.dark .card-value { color: #E8E8EE; }
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;
  background: rgba(14, 165, 233, 0.08); color: #075985; border: 1px solid rgba(14, 165, 233, 0.18);
}
.tag-pill {
  display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
  background: rgba(2, 132, 199, 0.08); color: #075985; border: 1px solid rgba(2, 132, 199, 0.18);
}
.node-pill {
  display: inline-flex; padding: 4px 8px; border-radius: 8px; font-size: 11px; font-weight: 700;
  background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;
}
.node-pill.dark { background: #1F2030; color: #E8E8EE; border-color: #2E2E3A; }
.desc {
  font-size: 12px; line-height: 1.55; color: #3f3f46;
  white-space: pre-wrap; word-break: break-word;
}
.desc.dark { color: #C4C4CD; }
</style>
