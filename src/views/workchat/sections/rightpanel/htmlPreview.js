import { normalizeFilePath, toFileUrl } from '@/utils/fileUrl'

function escapeHtmlAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export function getHtmlBaseUrl(filePath) {
  const fp = normalizeFilePath(filePath || '')
  if (!fp) return ''
  const dir = fp.replace(/[\\/][^\\/]*$/, '')
  return dir ? toFileUrl(`${dir}/`) : ''
}

export function buildHtmlPreviewContent(content, filePath) {
  if (typeof content !== 'string') return ''

  const baseUrl = getHtmlBaseUrl(filePath)
  if (!baseUrl || /<base\s/i.test(content)) return content

  const baseTag = `<base href="${escapeHtmlAttr(baseUrl)}">`
  if (/<head\b[^>]*>/i.test(content)) {
    return content.replace(/<head\b[^>]*>/i, match => `${match}\n${baseTag}`)
  }
  return `${baseTag}\n${content}`
}
