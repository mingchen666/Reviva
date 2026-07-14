import sanitizeHtmlLibrary from 'sanitize-html'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from './WebImportErrors.js'

export async function readResponseText(response, { maxBytes = 10 * 1024 * 1024 } = {}) {
  const declared = Number(response.headers?.get?.('content-length') || 0)
  if (declared > maxBytes) throw new WebImportError(WEB_IMPORT_ERROR_CODES.RESPONSE_TOO_LARGE, '网页内容超过允许的大小。')
  if (!response.body?.getReader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new WebImportError(WEB_IMPORT_ERROR_CODES.RESPONSE_TOO_LARGE, '网页内容超过允许的大小。')
    return text
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new WebImportError(WEB_IMPORT_ERROR_CODES.RESPONSE_TOO_LARGE, '网页内容超过允许的大小。')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
}

export function titleFromMarkdown(markdown, fallback = 'Web Page') {
  const heading = String(markdown || '').match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

export function normalizeMarkdown(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim() + '\n'
}

export function safeWebFileBase(value, fallback = 'Web Page') {
  const cleaned = String(value || fallback)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || fallback
}

export function webImportMarkdown(document) {
  const meta = document.metadata || {}
  return [
    '---',
    `title: ${JSON.stringify(document.title || '')}`,
    `source_url: ${JSON.stringify(document.requestedUrl || '')}`,
    `final_url: ${JSON.stringify(document.finalUrl || document.requestedUrl || '')}`,
    `provider: ${JSON.stringify(document.provider || '')}`,
    `fetched_at: ${JSON.stringify(document.fetchedAt || new Date().toISOString())}`,
    meta.description ? `description: ${JSON.stringify(meta.description)}` : '',
    '---',
    '',
    normalizeMarkdown(document.content?.markdown || '').trimEnd(),
    '',
  ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n')
}

export function sanitizeWebHtml(html, finalUrl) {
  const baseUrl = new URL(finalUrl)
  const absolute = value => {
    if (!value) return ''
    try { return new URL(value, baseUrl).toString() } catch { return '' }
  }
  const cleaned = sanitizeHtmlLibrary(String(html || ''), {
    allowedTags: sanitizeHtmlLibrary.defaults.allowedTags.concat(['html', 'head', 'body', 'main', 'article', 'section', 'figure', 'figcaption', 'picture', 'source', 'img', 'meta', 'title']),
    disallowedTagsMode: 'discard',
    allowedAttributes: {
      '*': ['class', 'id', 'title', 'aria-label', 'role'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
      source: ['src', 'srcset', 'type', 'media'],
      meta: ['charset', 'name', 'content'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], source: ['http', 'https'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: absolute(attribs.href), target: '_blank', rel: 'noopener noreferrer' } }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: absolute(attribs.src), loading: 'lazy' } }),
      source: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: absolute(attribs.src) } }),
    },
    exclusiveFilter(frame) {
      return ['form', 'iframe', 'object', 'embed', 'script', 'noscript', 'base'].includes(frame.tag)
    },
  })
  const csp = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https: http: data:; media-src https: http:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  if (/<head\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<head\b[^>]*>/i, match => `${match}${meta}`)
  return `<!doctype html><html><head>${meta}<meta charset="utf-8"></head><body>${cleaned}</body></html>`
}
