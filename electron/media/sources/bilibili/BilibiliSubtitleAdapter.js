export class BilibiliSubtitleAdapter {
  constructor({ segmentNormalizer, subtitleService } = {}) {
    this._segments = segmentNormalizer
    this._subtitles = subtitleService
  }

  normalize(payload = {}, track = {}) {
    const language = track.lan || track.lan_doc || ''
    const rawSegments = (Array.isArray(payload.body) ? payload.body : []).map(item => ({
      startMs: Math.round(Math.max(0, Number(item.from) || 0) * 1000),
      endMs: Math.round(Math.max(0, Number(item.to) || 0) * 1000),
      text: String(item.content || '').trim(),
      language,
    }))
    const segments = this._segments.normalize(rawSegments, { language })
    const text = this._segments.transcript(segments)
    return {
      language,
      text,
      segments,
      srt: this._subtitles.toSrt(segments),
      vtt: this._subtitles.toVtt(segments),
      sourceType: 'bilibili_subtitle',
      providerId: 'bilibili',
      providerModel: track.ai_type ? 'ai_subtitle' : 'platform_subtitle',
      warnings: [],
      partial: false,
    }
  }
}
