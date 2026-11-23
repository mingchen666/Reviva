// Pure path policy shared by the renderer, lint and proposal normalization.
// Known Wiki directories are root-relative; ./ and ../ remain page-relative.
export function resolveWikiMarkdownPath(href, pagePath = 'index.md') {
  const raw = String(href || '').trim()
  if (!raw || raw.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(raw) || /^(?:\/\/|\\\\)/.test(raw)) return ''
  let target
  try { target = decodeURIComponent(raw.split(/[?#]/)[0]).replace(/\\/g, '/') } catch { return '' }
  if (!/\.md$/i.test(target) || /[\0\r\n:]/.test(target) || target.startsWith('//')) return ''
  const rootRelative = target.startsWith('/') || /^(?:pages|sources)\//.test(target)
  const base = rootRelative ? '' : String(pagePath).replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  const parts = []
  for (const part of `${base}/${target}`.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return ''
      parts.pop()
    } else parts.push(part)
  }
  const resolved = parts.join('/')
  if (resolved === 'pages/index.md') return 'index.md'
  if (resolved === 'pages/overview.md') return 'overview.md'
  return resolved
}

export function normalizeWikiMarkdownLinks(markdown, pagePath) {
  const from = String(pagePath || 'index.md').replace(/\\/g, '/').split('/').slice(0, -1)
  let fence = null
  return String(markdown || '').split(/(\r?\n)/).map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      return line
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return line
    // Leave code spans and images untouched; only normalize explicit Wiki roots.
    return line.split(/(`+[^`]*`+)/g).map((part, index) => index % 2 ? part : part.replace(
      /(?<!!)(\[[^\]\r\n]+\]\()(\/?(?:pages|sources)\/[^\s)]+\.md(?:[?#][^\s)]*)?)(\s*(?:["'][^\r\n]*?["'])?\))/g,
      (match, before, target, after) => {
        const resolved = resolveWikiMarkdownPath(target, pagePath)
        if (!resolved) return match
        const to = resolved.split('/')
        let shared = 0
        while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++
        const relative = [...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/')
        const suffix = target.match(/[?#].*$/)?.[0] || ''
        return `${before}${relative.replace(/ /g, '%20')}${suffix}${after}`
      },
    )).join('')
  }).join('')
}
