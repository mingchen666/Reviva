import path from 'node:path'
import { parseFrontmatter } from './WikiMarkdownMetadata.js'

export const WIKI_AUTO_NAV_START = '<!-- wiki:auto-navigation:start -->'
export const WIKI_AUTO_NAV_END = '<!-- wiki:auto-navigation:end -->'

const PAGE_GROUPS = [
  ['summary', 'summaries', '来源摘要'],
  ['concept', 'concepts', '概念'],
  ['entity', 'entities', '实体'],
  ['question', 'questions', '问题'],
  ['comparison', 'comparisons', '对比'],
]

function markdownLabel(value = '') {
  return String(value || '').replace(/[\[\]]/g, '').trim()
}

export function buildWikiNavigationLines(pages = []) {
  const lines = []
  for (const [type, directory, label] of PAGE_GROUPS) {
    const matches = pages.filter(page => (
      page.page_type === type ||
      (!page.page_type && String(page.path || '').startsWith(`pages/${directory}/`))
    ))
    if (!matches.length) continue
    lines.push(`### ${label}`, '')
    for (const page of matches) {
      const title = markdownLabel(page.title || path.posix.basename(String(page.path || ''), '.md'))
      lines.push(`- [${title}](${page.path})`)
    }
    lines.push('')
  }
  return lines
}

export function upsertWikiAutoNavigation(content, { heading = '知识导航', intro = '', navigationLines = [] } = {}) {
  const parsed = parseFrontmatter(content)
  const body = String(parsed.body || content || '').trim()
  const block = [
    WIKI_AUTO_NAV_START,
    `## ${heading}`,
    '',
    ...(intro ? [intro, ''] : []),
    ...navigationLines,
    WIKI_AUTO_NAV_END,
  ].join('\n').trim()
  const start = body.indexOf(WIKI_AUTO_NAV_START)
  const end = body.indexOf(WIKI_AUTO_NAV_END)
  if (start >= 0 && end >= start) {
    return `${body.slice(0, start)}${block}${body.slice(end + WIKI_AUTO_NAV_END.length)}`.trim()
  }
  return `${body}\n\n${block}`.trim()
}
