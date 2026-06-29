export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

export function getDateStr(isoStr) {
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDate(dateStr) {
  const today = getDateStr(new Date().toISOString())
  const yesterday = getDateStr(new Date(Date.now() - 86400000).toISOString())
  if (dateStr === today) return '今天'
  if (dateStr === yesterday) return '昨天'
  const parts = dateStr.split('-')
  return parts[1] + '月' + parts[2] + '日'
}

export function formatWeekday(dateStr) {
  const days = ['日', '一', '二', '三', '四', '五', '六']
  return '周' + days[new Date(dateStr).getDay()]
}

export function formatTime(isoStr) {
  const d = new Date(isoStr)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export const EXT_MAP = {
  md: { icon: 'ri-file-text-line', color: '#6C8AFF', label: 'Markdown' },
  txt: { icon: 'ri-file-text-line', color: '#78788a', label: 'Text' },
  json: { icon: 'ri-braces-line', color: '#FACC15', label: 'JSON' },
  js: { icon: 'ri-code-line', color: '#FACC15', label: 'JavaScript' },
  ts: { icon: 'ri-code-line', color: '#3B82F6', label: 'TypeScript' },
  py: { icon: 'ri-code-line', color: '#4ADE80', label: 'Python' },
  html: { icon: 'ri-html5-line', color: '#F97316', label: 'HTML' },
  css: { icon: 'ri-css3-line', color: '#3B82F6', label: 'CSS' },
  vue: { icon: 'ri-code-line', color: '#34D399', label: 'Vue' },
  sql: { icon: 'ri-database-2-line', color: '#0EA5E9', label: 'SQL' },
  yaml: { icon: 'ri-file-code-line', color: '#F87171', label: 'YAML' },
  yml: { icon: 'ri-file-code-line', color: '#F87171', label: 'YAML' },
  png: { icon: 'ri-image-line', color: '#EC4899', label: 'PNG' },
  jpg: { icon: 'ri-image-line', color: '#EC4899', label: 'JPG' },
  jpeg: { icon: 'ri-image-line', color: '#EC4899', label: 'JPEG' },
  svg: { icon: 'ri-image-line', color: '#F97316', label: 'SVG' },
  gif: { icon: 'ri-image-line', color: '#EC4899', label: 'GIF' },
  pdf: { icon: 'ri-file-pdf-2-line', color: '#F87171', label: 'PDF' },
  doc: { icon: 'ri-file-word-line', color: '#3B82F6', label: 'Word' },
  docx: { icon: 'ri-file-word-line', color: '#3B82F6', label: 'Word' },
  xls: { icon: 'ri-file-excel-line', color: '#4ADE80', label: 'Excel' },
  xlsx: { icon: 'ri-file-excel-line', color: '#4ADE80', label: 'Excel' },
}

export function getExtInfo(ext) {
  return EXT_MAP[ext] || { icon: 'ri-file-line', color: '#78788a', label: ext.toUpperCase() || 'File' }
}
