const READABLE_LOCAL_EXTS = new Set([
  'md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'yaml', 'yml', 'log',
  'html', 'htm', 'xml', 'js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp',
  'h', 'sql', 'docx', 'xlsx', 'pptx', 'pdf',
])

function fileExt(value) {
  return String(value || '').split('.').pop().toLowerCase()
}

export function isReadableGenerationContext(item) {
  if (!item) return false
  if (item.type === 'cloud_kb' || item.type === 'cloud_doc') return true
  if (item.isDirectory || item.type === 'folder' || item.type === 'local_folder') return false
  if (!item.path) return false
  return READABLE_LOCAL_EXTS.has(fileExt(item.path || item.name))
}

export function readableGenerationContexts(items) {
  return (items || []).filter(isReadableGenerationContext)
}
