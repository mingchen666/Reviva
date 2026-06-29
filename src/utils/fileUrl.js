const PERCENT_BYTES_RE = /(?:%[0-9A-Fa-f]{2})+/g
const QUOTE_BOUNDARY_RE = /^[`'"\u201c\u201d\u2018\u2019<]+|[`'"\u201c\u201d\u2018\u2019>]+$/g
const WIN_ABS_RE = /^[a-zA-Z]:\//

function decodePercentRuns(value) {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value.replace(PERCENT_BYTES_RE, seq => {
      try { return decodeURIComponent(seq) } catch { return seq }
    })
  }
}

function fromFileUrl(value) {
  if (!/^(file|reviva-file):\/\//i.test(value)) return ''
  try {
    const url = new URL(value)
    let p = decodePercentRuns(url.pathname || '')
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1)
    return p
  } catch {
    return ''
  }
}

export function normalizeFilePath(inputPath) {
  if (!inputPath) return ''
  let p = String(inputPath).trim().replace(QUOTE_BOUNDARY_RE, '')
  const urlPath = fromFileUrl(p)
  if (urlPath) p = urlPath
  return decodePercentRuns(p)
}

// Convert an absolute filesystem path to a reviva-file:// URL that media tags can load.
// Existing percent-encoded path fragments are decoded first to avoid double-encoding.
export function toFileUrl(absPath) {
  if (!absPath) return ''
  let p = normalizeFilePath(absPath).replace(/\\/g, '/')
  if (!WIN_ABS_RE.test(p) && !p.startsWith('/')) p = '/' + p
  return 'reviva-file://local/' + encodeURIComponent(p)
}
