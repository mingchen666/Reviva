export function fileIcon(name, isDir, isExpanded) {
  if (isDir) return isExpanded ? 'ri-folder-open-line' : 'ri-folder-3-line'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    // 文档
    pdf: 'ri-file-pdf-2-line',
    md: 'ri-markdown-line',
    markdown: 'ri-markdown-line',
    docx: 'ri-file-word-2-line',
    txt: 'ri-file-text-line',
    csv: 'ri-file-text-line',
    xlsx: 'ri-file-excel-2-line',
    pptx: 'ri-file-ppt-2-line',
    json: 'ri-code-line',
    // 图片
    png: 'ri-image-line',
    jpg: 'ri-image-line',
    jpeg: 'ri-image-line',
    webp: 'ri-image-line',
    // 🎵 音频
    mp3: 'ri-music-line',
    wav: 'ri-music-line',
    flac: 'ri-music-line',
    aac: 'ri-music-line',
    ogg: 'ri-music-line',
    wma: 'ri-music-line',
    // 🎬 视频
    mp4: 'ri-movie-line',
    avi: 'ri-movie-line',
    mkv: 'ri-movie-line',
    mov: 'ri-movie-line',
    webm: 'ri-movie-line',
    flv: 'ri-movie-line',
    wmv: 'ri-movie-line',
  }
  return map[ext] || 'ri-file-line'
}

export function fileIconColor(name, isDir, isDark) {
  if (isDir) return isDark ? 'text-amber-400' : 'text-amber-500'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    // 文档
    pdf: 'text-red-400',
    md: 'text-emerald-400',
    docx: 'text-blue-400',
    xlsx: 'text-emerald-400',
    pptx: 'text-orange-400',
    // 图片
    png: 'text-pink-400',
    jpg: 'text-pink-400',
    jpeg: 'text-pink-400',
    webp: 'text-pink-400',
    // 🎵 音频
    mp3: 'text-cyan-400',
    wav: 'text-cyan-400',
    flac: 'text-cyan-400',
    aac: 'text-cyan-400',
    ogg: 'text-cyan-400',
    wma: 'text-cyan-400',
    // 🎬 视频（紫色）
    mp4: 'text-purple-400',
    avi: 'text-purple-400',
    mkv: 'text-purple-400',
    mov: 'text-purple-400',
    webm: 'text-purple-400',
    flv: 'text-purple-400',
    wmv: 'text-purple-400',
  }
  return map[ext] || (isDark ? 'text-wt-aux' : 'text-lt-aux')
}