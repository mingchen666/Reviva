import { makeMediaId } from '../core/MediaTypes.js'

function finiteMs(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}

export class SegmentNormalizeService {
  normalize(segments = [], { offsetMs = 0, language = '' } = {}) {
    const normalizedOffset = finiteMs(offsetMs)
    return (Array.isArray(segments) ? segments : [])
      .map((segment) => {
        const text = String(segment?.text || '').replace(/\s+/g, ' ').trim()
        if (!text) return null
        const startMs = finiteMs(segment.start_ms ?? segment.startMs) + normalizedOffset
        const rawEnd = finiteMs(segment.end_ms ?? segment.endMs, startMs)
        const endMs = Math.max(startMs, rawEnd + normalizedOffset)
        return {
          id: segment.id || makeMediaId('segment'),
          chapterId: segment.chapter_id || segment.chapterId || '',
          startMs,
          endMs,
          text,
          language: segment.language || language || '',
          speaker: segment.speaker ?? null,
          confidence: Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id))
  }

  transcript(segments = []) {
    return segments.map(segment => segment.text).filter(Boolean).join('\n')
  }
}

