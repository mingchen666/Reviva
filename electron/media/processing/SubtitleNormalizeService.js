import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_ERROR_CODES, MediaError } from '../core/MediaErrors.js'
import { SegmentNormalizeService } from './SegmentNormalizeService.js'

function parseTimestamp(value) {
  const normalized = String(value || '').trim().replace(',', '.')
  const parts = normalized.split(':').map(Number)
  if (parts.some(part => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null
  const seconds = parts.pop()
  const minutes = parts.pop()
  const hours = parts.pop() || 0
  return Math.round((((hours * 60) + minutes) * 60 + seconds) * 1000)
}

function formatTimestamp(ms, separator = ',') {
  const value = Math.max(0, Math.round(Number(ms) || 0))
  const hours = Math.floor(value / 3600000)
  const minutes = Math.floor((value % 3600000) / 60000)
  const seconds = Math.floor((value % 60000) / 1000)
  const millis = value % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`
}

function cleanCueText(lines) {
  return lines.join('\n')
    .replace(/<\/?(?:c(?:\.[^>]*)?|v|ruby|rt|b|i|u|font)(?:\s[^>]*)?>/gi, '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export class SubtitleNormalizeService {
  constructor({ segmentNormalizer = new SegmentNormalizeService() } = {}) {
    this._segments = segmentNormalizer
  }

  parse(content, { format = '', language = '' } = {}) {
    const text = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    const normalizedFormat = String(format || '').toLowerCase()
    const isVtt = normalizedFormat === 'vtt' || /^WEBVTT(?:\s|$)/i.test(text)
    const body = isVtt ? text.replace(/^WEBVTT[^\n]*\n+/i, '') : text
    const blocks = body.split(/\n{2,}/)
    const cues = []

    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      if (!lines.length || /^NOTE(?:\s|$)/i.test(lines[0])) continue
      const timingIndex = lines.findIndex(line => line.includes('-->'))
      if (timingIndex < 0) continue
      const [rawStart, rawEndWithSettings] = lines[timingIndex].split('-->').map(part => part.trim())
      const rawEnd = rawEndWithSettings?.split(/\s+/)[0]
      const startMs = parseTimestamp(rawStart)
      const endMs = parseTimestamp(rawEnd)
      const cueText = cleanCueText(lines.slice(timingIndex + 1))
      if (startMs === null || endMs === null || !cueText) continue
      cues.push({ startMs, endMs: Math.max(startMs, endMs), text: cueText, language })
    }

    const segments = this._segments.normalize(cues, { language })
    if (!segments.length) {
      throw new MediaError(MEDIA_ERROR_CODES.SUBTITLE_INVALID, '字幕文件中没有可识别的时间轴内容。', { stage: 'subtitle' })
    }
    return {
      format: isVtt ? 'vtt' : 'srt',
      language,
      text: this._segments.transcript(segments),
      segments,
      srt: this.toSrt(segments),
      vtt: this.toVtt(segments),
    }
  }

  async fromFile(filePath, options = {}) {
    const format = options.format || path.extname(filePath).slice(1).toLowerCase()
    const content = await fs.promises.readFile(filePath, 'utf8')
    return this.parse(content, { ...options, format })
  }

  toSrt(segments = []) {
    return segments.map((segment, index) => [
      String(index + 1),
      `${formatTimestamp(segment.startMs, ',')} --> ${formatTimestamp(segment.endMs, ',')}`,
      segment.text,
    ].join('\n')).join('\n\n') + (segments.length ? '\n' : '')
  }

  toVtt(segments = []) {
    const body = segments.map(segment => [
      `${formatTimestamp(segment.startMs, '.')} --> ${formatTimestamp(segment.endMs, '.')}`,
      segment.text,
    ].join('\n')).join('\n\n')
    return `WEBVTT\n\n${body}${segments.length ? '\n' : ''}`
  }
}

export { parseTimestamp, formatTimestamp }

