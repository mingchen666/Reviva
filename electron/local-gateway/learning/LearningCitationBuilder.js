function displayFor(item) {
  const label = String(item?.label || '')
  const locator = item?.locator
  if (!locator) return label
  if (locator.kind === 'page' && Number.isFinite(Number(locator.page))) return `${label} p.${locator.page}`
  if (locator.kind === 'time' && Number.isFinite(Number(locator.startMs))) return `${label} ${formatTime(locator.startMs)}${Number.isFinite(Number(locator.endMs)) ? `–${formatTime(locator.endMs)}` : ''}`
  return label
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000))
  const parts = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
  return parts[0] ? `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:${String(parts[2]).padStart(2, '0')}` : `${String(parts[1]).padStart(2, '0')}:${String(parts[2]).padStart(2, '0')}`
}

export class LearningCitationBuilder {
  build(markdown, citationMap = {}, sourceStyle = 'footnotes') {
    const map = citationMap && typeof citationMap === 'object' && !Array.isArray(citationMap) ? citationMap : {}
    const citations = []
    const citationByMarker = new Map()
    const usedMarkers = []
    let nextId = 1
    const body = String(markdown || '').replace(/\[\[ms-cite:([^\]]*)\]\]/g, (_match, marker) => {
      const source = map[marker]
      if (!source) return ''
      let citation = citationByMarker.get(marker)
      if (!citation) {
        citation = {
          id: `cite_${nextId++}`,
          sourceRef: source.sourceRef,
          label: String(source.label || ''),
          locator: source.locator || null,
          display: displayFor(source),
        }
        citationByMarker.set(marker, citation)
        citations.push(citation)
        usedMarkers.push(marker)
      }
      if (sourceStyle === 'footnotes') return `[^ms${citation.id.slice(5)}]`
      if (sourceStyle === 'inline') return `（来源：${citation.display}）`
      return ''
    })
    const cleaned = body.replace(/\[\[ms-cite:[^\]]*\]\]/g, '')
    if (sourceStyle === 'footnotes' && citations.length) {
      return { markdown: `${cleaned.trimEnd()}\n\n${citations.map(citation => `[^ms${citation.id.slice(5)}]: ${citation.display}`).join('\n')}`, citations, usedMarkers }
    }
    if (sourceStyle === 'sources' && citations.length) {
      return { markdown: `${cleaned.trimEnd()}\n\n## 资料来源\n${citations.map(citation => `- ${citation.display}`).join('\n')}`, citations, usedMarkers }
    }
    return { markdown: cleaned, citations, usedMarkers }
  }
}
