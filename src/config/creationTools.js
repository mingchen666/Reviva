export const CREATION_TOOLS = Object.freeze([
  { id: 'quiz', name: '测验', icon: 'ri-questionnaire-line', color: 'emerald', desc: '生成练习测验' },
  { id: 'flashcard', name: '闪卡', icon: 'ri-stack-line', color: 'pink', desc: '生成学习闪卡' },
  { id: 'qa', name: 'Q&A', icon: 'ri-question-answer-line', color: 'brand', desc: '生成 FAQ 与思考问答' },
  { id: 'glossary', name: '术语表', icon: 'ri-book-2-line', color: 'agent', desc: '整理专业术语与定义' },
  { id: 'cheatsheet', name: '速查表', icon: 'ri-file-list-3-line', color: 'amber', desc: '浓缩公式、步骤与易错点' },
  { id: 'mindmap', name: '导图', icon: 'ri-mind-map', color: 'emerald', desc: '生成思维导图' },
  { id: 'graph', name: '图谱', icon: 'ri-node-tree', color: 'amber', desc: '生成知识图谱' },
  { id: 'chart', name: '图表', icon: 'ri-bar-chart-box-line', color: 'sky', desc: '生成 SVG 图表' },
  { id: 'podcast', name: '播客', icon: 'ri-mic-2-line', color: 'agent', desc: '生成播客音频' },
  { id: 'research', name: '深度研究', icon: 'ri-search-eye-line', color: 'sky', desc: '深度研究分析' },
  { id: 'ppt', name: 'PPT', icon: 'ri-slideshow-line', color: 'brand', desc: '生成演示文稿' },
])

export const CREATION_TOOL_IDS = Object.freeze(CREATION_TOOLS.map(tool => tool.id))
export const GENERATION_TASK_TOOL_IDS = Object.freeze([...CREATION_TOOL_IDS])
export const GENERATION_WEB_PROVIDERS = Object.freeze([
  'mcp:exa',
  'web_search_bing',
  'web_search_searxng',
  'web_search_tavily',
])

const TOOL_BY_ID = new Map(CREATION_TOOLS.map(tool => [tool.id, tool]))

export function getCreationTool(toolId) {
  return TOOL_BY_ID.get(String(toolId || '')) || null
}

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

export function resolveCreationTools(preferences = {}) {
  const normalized = normalizeCreationToolPreferences(preferences)
  const hidden = new Set(normalized.hiddenIds)
  return normalized.order.map(getCreationTool).filter(tool => tool && !hidden.has(tool.id))
}
