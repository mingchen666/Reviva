// Creation tool IDs + normalize function (copied from src/config/creationTools.js).
// Pure logic — no Vue/Electron dependencies. Keep in sync with the source file.

export const CREATION_TOOLS = Object.freeze([
  { id: 'quiz', name: '测验' },
  { id: 'flashcard', name: '闪卡' },
  { id: 'studycard', name: '知识卡片' },
  { id: 'qa', name: 'Q&A' },
  { id: 'glossary', name: '术语表' },
  { id: 'cheatsheet', name: '速查表' },
  { id: 'mindmap', name: '导图' },
  { id: 'graph', name: '图谱' },
  { id: 'chart', name: '图表' },
  { id: 'podcast', name: '播客' },
  { id: 'research', name: '深度研究' },
  { id: 'studyguide', name: '学习指南' },
  { id: 'ppt', name: 'PPT' },
])

export const CREATION_TOOL_IDS = Object.freeze(CREATION_TOOLS.map(t => t.id))

export function normalizeCreationToolPreferences(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const known = new Set(CREATION_TOOL_IDS)
  const order = []
  const seen = new Set()
  for (const id of Array.isArray(raw.order) ? raw.order : []) {
    const normalized = String(id || '').trim()
    if (!known.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    order.push(normalized)
  }
  for (const id of CREATION_TOOL_IDS) {
    if (!seen.has(id)) order.push(id)
  }
  const hiddenIds = [...new Set((Array.isArray(raw.hiddenIds) ? raw.hiddenIds : [])
    .map(id => String(id || '').trim())
    .filter(id => known.has(id)))]
  return { order, hiddenIds }
}
