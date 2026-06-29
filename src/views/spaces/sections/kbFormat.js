const DOC_STATUS_META = {
  UPLOADED: { label: '等待处理', tone: 'slate', icon: 'ri-time-line' },
  PENDING: { label: '等待处理', tone: 'slate', icon: 'ri-time-line' },
  RUNNING: { label: '处理中', tone: 'brand', icon: 'ri-loader-4-line' },
  COMPLETE: { label: '已入库', tone: 'emerald', icon: 'ri-checkbox-circle-line' },
  FAILED: { label: '失败', tone: 'red', icon: 'ri-error-warning-line' },
  EXPIRED: { label: '已过期', tone: 'amber', icon: 'ri-alarm-warning-line' },
  DELETED: { label: '已删除', tone: 'slate', icon: 'ri-delete-bin-line' },
}

const STATUS_ALIASES = {
  indexed: 'COMPLETE',
  active: 'COMPLETE',
  parsing: 'RUNNING',
  uploading: 'RUNNING',
  running: 'RUNNING',
  pending: 'PENDING',
  uploaded: 'UPLOADED',
  failed: 'FAILED',
  error: 'FAILED',
  expired: 'EXPIRED',
  deleted: 'DELETED',
}

const FILE_ICON_MAP = {
  pdf: { icon: 'ri-file-pdf-line', cls: 'text-red-400' },
  md: { icon: 'ri-markdown-line', cls: 'text-emerald-400' },
  markdown: { icon: 'ri-markdown-line', cls: 'text-emerald-400' },
  doc: { icon: 'ri-file-word-line', cls: 'text-blue-400' },
  docx: { icon: 'ri-file-word-line', cls: 'text-blue-400' },
  xls: { icon: 'ri-file-excel-line', cls: 'text-emerald-400' },
  xlsx: { icon: 'ri-file-excel-line', cls: 'text-emerald-400' },
  ppt: { icon: 'ri-file-ppt-line', cls: 'text-orange-400' },
  pptx: { icon: 'ri-file-ppt-line', cls: 'text-orange-400' },
  txt: { icon: 'ri-file-text-line', cls: 'text-brand-400' },
}

export const DOC_STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'COMPLETE', label: '已入库' },
  { value: 'RUNNING', label: '处理中' },
  { value: 'PENDING', label: '等待' },
  { value: 'FAILED', label: '失败' },
]

export function normalizeDocStatus(status) {
  if (!status) return 'PENDING'
  const raw = String(status).trim()
  const lower = raw.toLowerCase()
  return STATUS_ALIASES[lower] || raw.toUpperCase()
}

export function docStatusMeta(status) {
  const normalized = normalizeDocStatus(status)
  return DOC_STATUS_META[normalized] || { label: normalized || '未知', tone: 'slate', icon: 'ri-question-line' }
}

export function docStatusClass(status, isDark) {
  const tone = docStatusMeta(status).tone
  if (tone === 'emerald') return isDark ? 'text-emerald-400 bg-emerald-400/8 border-emerald-400/18' : 'text-emerald-600 bg-emerald-50 border-emerald-100'
  if (tone === 'brand') return isDark ? 'text-brand-400 bg-brand-400/8 border-brand-400/18' : 'text-brand-600 bg-brand-50 border-brand-100'
  if (tone === 'red') return isDark ? 'text-red-400 bg-red-400/8 border-red-400/18' : 'text-red-600 bg-red-50 border-red-100'
  if (tone === 'amber') return isDark ? 'text-amber-400 bg-amber-400/8 border-amber-400/18' : 'text-amber-600 bg-amber-50 border-amber-100'
  return isDark ? 'text-wt-aux bg-d3 border-bdr' : 'text-lt-aux bg-l3 border-bdrF'
}

export function docStatusDotClass(status) {
  const tone = docStatusMeta(status).tone
  if (tone === 'emerald') return 'bg-emerald-400'
  if (tone === 'brand') return 'bg-brand-400'
  if (tone === 'red') return 'bg-red-400'
  if (tone === 'amber') return 'bg-amber-400'
  return 'bg-zinc-400'
}

export function docStatusTextClass(status, isDark) {
  const tone = docStatusMeta(status).tone
  if (tone === 'emerald') return isDark ? 'text-emerald-400' : 'text-emerald-700'
  if (tone === 'brand') return isDark ? 'text-brand-300' : 'text-blue-700'
  if (tone === 'red') return isDark ? 'text-red-400' : 'text-red-700'
  if (tone === 'amber') return isDark ? 'text-amber-400' : 'text-amber-700'
  return isDark ? 'text-wt-aux' : 'text-lt-aux'
}

export function fileIcon(type) {
  const normalized = String(type || '').toLowerCase()
  return FILE_ICON_MAP[normalized]?.icon || 'ri-file-line'
}

export function fileIconClass(type) {
  const normalized = String(type || '').toLowerCase()
  return FILE_ICON_MAP[normalized]?.cls || 'text-brand-400'
}

export function fmtBytes(n) {
  if (!n && n !== 0) return '--'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function fmtDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isReadonlyKb(kb) {
  return kb?.isReadonly === true || kb?.isSystem === true
}
