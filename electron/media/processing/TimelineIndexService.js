export class TimelineIndexService {
  build({ segments = [], chapters = [], frames = [] } = {}) {
    const entries = [
      ...segments.map(segment => ({
        id: segment.id,
        type: 'segment',
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
        chapterId: segment.chapterId || '',
      })),
      ...chapters.map(chapter => ({
        id: chapter.id,
        type: 'chapter',
        startMs: chapter.startMs,
        endMs: chapter.endMs,
        title: chapter.title || '',
      })),
      ...frames.map(frame => ({
        id: frame.id,
        type: 'frame',
        timestampMs: frame.timestampMs,
        path: frame.imagePath || '',
        thumbnailPath: frame.thumbnailPath || '',
        linkedSegmentIds: frame.linkedSegmentIds || [],
      })),
    ]
    return entries.sort((a, b) => {
      const aTime = a.startMs ?? a.timestampMs ?? 0
      const bTime = b.startMs ?? b.timestampMs ?? 0
      return aTime - bTime || a.type.localeCompare(b.type) || String(a.id).localeCompare(String(b.id))
    })
  }
}

