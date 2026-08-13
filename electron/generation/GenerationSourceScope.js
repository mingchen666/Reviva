const WEB_PROVIDERS = ['mcp:exa', 'web_search_bing', 'web_search_searxng', 'web_search_tavily']

function normalizeIdList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function normalizeWikiRefs(value, wikiIds) {
  const seen = new Set()
  const refs = []
  for (const item of Array.isArray(value) ? value : []) {
    const id = String(item?.id || item?.wikiId || '').trim()
    if (!id || !wikiIds.includes(id) || seen.has(id)) continue
    seen.add(id)
    refs.push({
      id,
      name: String(item?.name || id).trim() || id,
      type: 'wiki',
      icon: item?.icon || 'ri-book-2-line',
    })
  }
  for (const id of wikiIds) {
    if (!seen.has(id)) refs.push({ id, name: id, type: 'wiki', icon: 'ri-book-2-line' })
  }
  return refs
}

function normalizeWeb(value = {}, params = {}) {
  const hasExplicitObject = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
  const explicit = hasExplicitObject
    ? value
    : (params?.webSearch && typeof params.webSearch === 'object' && !Array.isArray(params.webSearch)
      ? params.webSearch
      : {})
  const raw = explicit
  const legacyEnabled = params?.enableWebSearch === true || params?.enable_web_search === true
    || params?.webSearch === true
  const enabled = raw.enabled === undefined ? legacyEnabled : raw.enabled === true
  const provider = String(raw.provider || 'auto').trim()
  return {
    enabled,
    provider: provider === 'auto' || WEB_PROVIDERS.includes(provider) ? provider : 'auto',
  }
}

export function normalizeGenerationSourceScope({ ctxItems = [], sourceScope = {}, wikiContext = {}, params = {} } = {}) {
  const raw = sourceScope && typeof sourceScope === 'object' && !Array.isArray(sourceScope) ? sourceScope : {}
  const context = Array.isArray(raw.ctxItems) ? raw.ctxItems : ctxItems
  const wikiIds = normalizeIdList(raw.wikiIds?.length ? raw.wikiIds : wikiContext?.wikiIds)
  return {
    ctxItems: Array.isArray(context) ? context : [],
    wikiIds,
    wikiRefs: normalizeWikiRefs(raw.wikiRefs, wikiIds),
    web: normalizeWeb(raw.web, params),
  }
}

export function hasGenerationSource(scope = {}) {
  const hasReadableContext = Array.isArray(scope?.ctxItems) && scope.ctxItems.some((item) => {
    const type = item?.type || ''
    if (type === 'cloud_kb' || type === 'cloud_doc') return true
    return !!item?.path && !item?.isDirectory && type !== 'folder' && type !== 'local_folder'
  })
  return hasReadableContext
    || (Array.isArray(scope?.wikiIds) && scope.wikiIds.length > 0)
}

export const GENERATION_WEB_PROVIDERS = WEB_PROVIDERS
