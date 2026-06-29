<script setup>
import { NPopover } from 'naive-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  kbSources: { type: Array, default: () => [] },
  isDark: Boolean,
})

const expandedKeys = ref(new Set())

const sources = computed(() => {
  const seen = new Set()
  const out = []
  for (const source of props.kbSources || []) {
    if (!source) continue
    const docName = String(source.docName || source.document_name || source.source || source.title || '知识库片段')
    const snippet = String(source.snippet || source.content || source.text || '')
    const documentId = source.documentId || source.document_id || source.metadata?.document_id || ''
    const key = [
      documentId,
      docName,
      String(snippet).replace(/\s+/g, ' ').trim().slice(0, 240),
    ].join('|').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      ...source,
      refId: source.refId || source.id || out.length + 1,
      docName,
      snippet,
      documentId,
      score: source.score ?? source.relevance_score ?? 0,
      recallType: source.recallType || source.recall_type || '',
    })
  }
  return out
})

function toggleExpand(key) {
  const set = expandedKeys.value
  if (set.has(key)) set.delete(key)
  else set.add(key)
  expandedKeys.value = new Set(set)
}

function isExpanded(key) { return expandedKeys.value.has(key) }

function kbKey(s, idx) {
  return `kb_${s.documentId || idx}_${String(s.docName || '').slice(0, 20)}_${String(s.snippet || '').slice(0, 30)}`
}

function recallLabel(type) {
  const labels = {
    vector_search: '向量',
    fulltext_search: '全文',
    graph_search: '图谱',
    summary_search: '摘要',
    vision_search: '视觉',
  }
  return labels[type] || type || ''
}
</script>

<template>
  <div v-if="sources.length" class="flex items-center gap-1.5 flex-wrap">
    <NPopover
      trigger="hover" placement="top-start" :flip="true"
      :fallback-placements="['bottom', 'top']" to="body" raw>
      <template #trigger>
        <button class="source-chip"
          :class="isDark ? 'bg-agent-400/8 text-agent-400 border-agent-400/14 hover:bg-agent-400/12' : 'bg-agent-50 text-agent-500 border-agent-100 hover:bg-agent-100'">
          <i class="ri-book-open-line text-[10px]" />
          <span>知识库 {{ sources.length }}</span>
        </button>
      </template>
      <div class="source-panel" :class="isDark ? 'bg-d3 border-bdr' : 'bg-white border-bdrL'">
        <div class="source-panel-title" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
          知识库引用（{{ sources.length }}）
        </div>
        <div class="source-list">
          <div
            v-for="(s, idx) in sources"
            :key="kbKey(s, idx)"
            class="src-item"
            :class="isDark ? 'bg-d4/60 border-d4' : 'bg-l3 border-bdrF'"
          >
            <div class="src-head">
              <div class="src-name" :title="s.docName || ''" :class="isDark ? 'text-wt-main' : 'text-lt-main'">
                <span class="src-index" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">#{{ idx + 1 }}</span>
                <span class="src-doc">{{ s.docName || `文档 ${idx + 1}` }}</span>
              </div>
              <div class="src-meta">
                <span v-if="recallLabel(s.recallType)" class="src-recall" :class="isDark ? 'text-wt-dim' : 'text-lt-aux'">
                  {{ recallLabel(s.recallType) }}
                </span>
                <span v-if="s.score > 0" class="src-score" :class="isDark ? 'bg-agent-400/10 text-agent-300 border-agent-400/15' : 'bg-agent-50 text-agent-500 border-agent-100'">
                  {{ Number(s.score).toFixed(2) }}
                </span>
              </div>
            </div>
            <div
              class="src-snippet"
              :class="[isDark ? 'text-wt-sub' : 'text-lt-sub', { expanded: isExpanded(kbKey(s, idx)) }]"
            >
              {{ s.snippet || '暂无内容' }}
            </div>
            <button v-if="(s.snippet || '').length > 80" @click.stop="toggleExpand(kbKey(s, idx))"
              class="src-toggle" :class="isDark ? 'text-agent-400' : 'text-agent-500'">
              {{ isExpanded(kbKey(s, idx)) ? '收起' : '展开' }}
            </button>
          </div>
        </div>
      </div>
    </NPopover>
  </div>
</template>

<style scoped>
.source-chip {
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s;
}
.source-panel {
  width: 420px;
  max-width: 86vw;
  /* border: 1px solid; */
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  padding: 10px;
}
.source-panel-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 8px;
}
.source-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow: auto;
  padding-right: 2px;
}
.src-item {
  border: 1px solid;
  border-radius: 10px;
  padding: 8px;
}
.src-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.src-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
}
.src-index {
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.src-doc {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.src-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.src-recall {
  font-size: 10px;
}
.src-score {
  border: 1px solid;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
}
.src-snippet {
  font-size: 11.5px;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.src-snippet.expanded {
  -webkit-line-clamp: unset;
  overflow: visible;
}
.src-toggle {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 700;
  background: transparent;
  padding: 0;
}
.src-toggle:hover {
  text-decoration: underline;
}
.source-list::-webkit-scrollbar {
  width: 10px;
}
.source-list::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.22);
  border-radius: 999px;
}
</style>
