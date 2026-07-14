export const WEB_IMPORT_PROVIDERS = Object.freeze({
  jina: { id: 'jina', name: 'Jina Reader', formats: ['markdown', 'html'] },
  firecrawl: { id: 'firecrawl', name: 'Firecrawl', formats: ['markdown', 'html'] },
  tavily: { id: 'tavily', name: 'Tavily Extract', formats: ['markdown'] },
})

export const WEB_IMPORT_FORMATS = Object.freeze(['markdown', 'html'])

export function normalizeRequestedFormats(formats = ['markdown']) {
  const next = []
  for (const format of Array.isArray(formats) ? formats : []) {
    const value = String(format || '').toLowerCase()
    if (WEB_IMPORT_FORMATS.includes(value) && !next.includes(value)) next.push(value)
  }
  if (!next.includes('markdown')) next.unshift('markdown')
  return next
}
