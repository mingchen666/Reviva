import fs from 'node:fs'
import path from 'node:path'
import {
  WIKI_PAGE_STATUSES,
  WIKI_PAGE_TYPES,
  pageContentHash,
  parseFrontmatter,
} from './WikiMarkdownMetadata.js'

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
}

function isInside(parent, child) {
  const root = path.resolve(parent).toLowerCase()
  const target = path.resolve(child).toLowerCase()
  return target === root || target.startsWith(root + path.sep)
}

async function walkMarkdown(absDir, relDir, out) {
  if (!fs.existsSync(absDir)) return
  const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name)
    const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/')
    if (entry.isDirectory()) await walkMarkdown(abs, rel, out)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push({ abs, rel })
  }
}

function issue(severity, code, message, extra = {}) {
  return { severity, code, message, fixable: false, ...extra }
}

function markdownLinks(content = '') {
  const links = []
  const md = /(?<!!)\[([^\]]{1,200})\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
  let match
  while ((match = md.exec(content))) links.push({ kind: 'markdown', label: match[1], target: match[2] })
  const wiki = /\[\[([^\]]{1,240})\]\]/g
  while ((match = wiki.exec(content))) {
    const [target, label] = String(match[1] || '').split('|')
    links.push({ kind: 'wikilink', label: label || target, target })
  }
  return links
}

function markdownImages(content = '') {
  const out = []
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = re.exec(content))) out.push({ label: match[1], target: match[2] })
  return out
}

function cleanTarget(value = '') {
  const raw = String(value || '').trim().replace(/^<|>$/g, '').split('#')[0].split('?')[0]
  try { return decodeURIComponent(raw).replace(/\\/g, '/') } catch { return raw.replace(/\\/g, '/') }
}

function resolveMarkdownTarget(pagePath, target) {
  const clean = cleanTarget(target)
  if (!clean || /^(https?:|mailto:|data:|blob:|file:|#)/i.test(clean)) return ''
  const baseDir = path.posix.dirname(toPosix(pagePath))
  let resolved = path.posix.normalize(path.posix.join(clean.startsWith('/') || baseDir === '.' ? '' : baseDir, clean.replace(/^\/+/, '')))
  if (!path.posix.extname(resolved)) resolved += '.md'
  if (resolved === 'pages/index.md') resolved = 'index.md'
  if (resolved === 'pages/overview.md') resolved = 'overview.md'
  return resolved.startsWith('../') ? '' : resolved
}

function resolveWikiTarget(target, pageByPath, pageByTitle) {
  const clean = cleanTarget(String(target || '').split('|')[0])
  if (!clean) return ''
  const candidates = [clean, clean.endsWith('.md') ? clean : `${clean}.md`, clean.replace(/^wiki\//, '')]
  for (const candidate of candidates) {
    if (pageByPath.has(candidate)) return candidate
  }
  const key = path.posix.basename(clean, '.md').toLowerCase()
  return pageByTitle.get(key) || ''
}

function summaryCounts(issues) {
  return issues.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1
    return acc
  }, { error: 0, warning: 0, info: 0 })
}

export class WikiLintService {
  constructor({ wikiDir, pageRegistry }) {
    this._wikiDir = wikiDir
    this._pageRegistry = pageRegistry
  }

  async run({ sources = [], reason = 'manual' } = {}) {
    const startedAt = Date.now()
    const issues = []
    const schemaPath = path.join(this._wikiDir, 'schema.md')
    const schemaStat = await fs.promises.stat(schemaPath).catch(() => null)
    if (!schemaStat?.isFile()) {
      issues.push(issue('error', 'SCHEMA_MISSING', 'schema.md is missing', { page_path: 'schema.md', fixable: true }))
    } else if (schemaStat.size > 12000) {
      issues.push(issue('warning', 'SCHEMA_TOO_LARGE', 'schema.md exceeds the 12000 character runtime budget', { page_path: 'schema.md' }))
    }

    const files = []
    for (const rootFile of ['index.md', 'overview.md']) {
      const abs = path.join(this._wikiDir, rootFile)
      if (fs.existsSync(abs)) files.push({ abs, rel: rootFile })
      else issues.push(issue('error', 'REQUIRED_PAGE_MISSING', `${rootFile} is missing`, { page_path: rootFile }))
    }
    await walkMarkdown(path.join(this._wikiDir, 'pages'), 'pages', files)

    const registry = await this._pageRegistry.load()
    const validSourceIds = new Set((sources || []).map(source => String(source.id || '')).filter(Boolean))
    const completeSources = (sources || []).filter(source => source.status === 'ingested' && source.parser_status === 'complete')
    const pageByPath = new Map()
    const pageByTitle = new Map()
    const pageIds = new Map()
    const titles = new Map()
    const inbound = new Map()

    for (const file of files) {
      const content = await fs.promises.readFile(file.abs, 'utf-8').catch(() => '')
      const parsed = parseFrontmatter(content)
      const meta = parsed.attributes || {}
      const title = String(meta.title || path.posix.basename(file.rel, '.md'))
      const record = { ...file, content, meta, title }
      pageByPath.set(file.rel, record)
      const titleKey = title.toLowerCase()
      if (!pageByTitle.has(titleKey)) pageByTitle.set(titleKey, file.rel)
      if (!pageByTitle.has(path.posix.basename(file.rel, '.md').toLowerCase())) {
        pageByTitle.set(path.posix.basename(file.rel, '.md').toLowerCase(), file.rel)
      }
      inbound.set(file.rel, 0)

      if (!parsed.hasFrontmatter || parsed.invalid) {
        issues.push(issue('error', 'FRONTMATTER_INVALID', 'Page is missing valid YAML frontmatter', { page_path: file.rel, fixable: true }))
      }
      if (!meta.id) issues.push(issue('error', 'PAGE_ID_MISSING', 'Page frontmatter is missing id', { page_path: file.rel, fixable: true }))
      if (!WIKI_PAGE_TYPES.has(String(meta.type || ''))) {
        issues.push(issue('error', 'PAGE_TYPE_INVALID', `Invalid page type: ${meta.type || '(missing)'}`, { page_path: file.rel, fixable: true }))
      }
      if (!WIKI_PAGE_STATUSES.has(String(meta.status || ''))) {
        issues.push(issue('warning', 'PAGE_STATUS_INVALID', `Invalid page status: ${meta.status || '(missing)'}`, { page_path: file.rel, fixable: true }))
      }
      if (!Array.isArray(meta.source_ids)) {
        issues.push(issue('warning', 'SOURCE_IDS_INVALID', 'source_ids must be a YAML list', { page_path: file.rel, fixable: true }))
      } else {
        for (const sourceId of meta.source_ids) {
          if (!validSourceIds.has(String(sourceId))) {
            issues.push(issue('error', 'SOURCE_REFERENCE_MISSING', `Referenced source does not exist: ${sourceId}`, { page_path: file.rel, source_id: String(sourceId) }))
          }
        }
      }
      if (meta.type === 'summary' && (!Array.isArray(meta.source_ids) || !meta.source_ids.length)) {
        issues.push(issue('error', 'SUMMARY_SOURCE_MISSING', 'Summary page has no source_ids', { page_path: file.rel }))
      } else if (['concept', 'entity', 'question', 'comparison'].includes(meta.type) && (!Array.isArray(meta.source_ids) || !meta.source_ids.length)) {
        issues.push(issue('warning', 'PAGE_SOURCE_MISSING', 'Knowledge page has no source_ids and requires evidence review', { page_path: file.rel }))
      }
      if (meta.id) {
        const id = String(meta.id)
        if (pageIds.has(id)) issues.push(issue('error', 'PAGE_ID_DUPLICATE', `Duplicate page id also used by ${pageIds.get(id)}`, { page_path: file.rel }))
        else pageIds.set(id, file.rel)
      }
      if (titleKey) {
        if (titles.has(titleKey)) issues.push(issue('warning', 'PAGE_TITLE_DUPLICATE', `Duplicate page title also used by ${titles.get(titleKey)}`, { page_path: file.rel }))
        else titles.set(titleKey, file.rel)
      }

      const registryRecord = registry.pages?.[file.rel]
      if (!registryRecord) {
        issues.push(issue('warning', 'PAGE_REGISTRY_MISSING', 'Page is missing from pages/registry.json', { page_path: file.rel, fixable: true }))
      } else if (registryRecord.content_hash !== pageContentHash(content)) {
        issues.push(issue('warning', 'PAGE_REGISTRY_STALE', 'Page registry content hash is stale', { page_path: file.rel, fixable: true }))
      }
    }

    for (const [pagePath, record] of pageByPath) {
      for (const link of markdownLinks(record.content)) {
        const resolved = link.kind === 'markdown'
          ? resolveMarkdownTarget(pagePath, link.target)
          : resolveWikiTarget(link.target, pageByPath, pageByTitle)
        if (!resolved) {
          const clean = cleanTarget(link.target)
          if (clean && !/^(https?:|mailto:|data:|blob:|file:|#)/i.test(clean)) {
            issues.push(issue('warning', 'LINK_BROKEN', `Unresolved ${link.kind} link: ${link.target}`, { page_path: pagePath }))
          }
          continue
        }
        if (!pageByPath.has(resolved)) {
          issues.push(issue('warning', 'LINK_BROKEN', `Linked page does not exist: ${resolved}`, { page_path: pagePath }))
        } else {
          inbound.set(resolved, (inbound.get(resolved) || 0) + 1)
        }
      }

      for (const image of markdownImages(record.content)) {
        const clean = cleanTarget(image.target)
        if (!clean || /^(https?:|data:|blob:|file:)/i.test(clean)) continue
        const abs = path.resolve(this._wikiDir, path.posix.dirname(pagePath), clean)
        if (!isInside(this._wikiDir, abs) || !fs.existsSync(abs)) {
          issues.push(issue('warning', 'ASSET_MISSING', `Image asset does not exist: ${clean}`, { page_path: pagePath }))
        }
      }
    }

    const indexContent = pageByPath.get('index.md')?.content || ''
    for (const [pagePath] of pageByPath) {
      if (['index.md', 'overview.md'].includes(pagePath)) continue
      const basename = path.posix.basename(pagePath, '.md')
      if (!indexContent.includes(pagePath) && !indexContent.toLowerCase().includes(basename.toLowerCase())) {
        issues.push(issue('warning', 'INDEX_COVERAGE_MISSING', 'Page is not referenced by index.md', { page_path: pagePath }))
      }
      if (!(inbound.get(pagePath) || 0)) {
        issues.push(issue('warning', 'PAGE_ORPHAN', 'Page has no inbound Wiki links', { page_path: pagePath }))
      }
    }

    const summarySources = new Set()
    for (const record of pageByPath.values()) {
      if (record.meta.type !== 'summary' || !Array.isArray(record.meta.source_ids)) continue
      for (const sourceId of record.meta.source_ids) summarySources.add(String(sourceId))
    }
    for (const source of completeSources) {
      if (!summarySources.has(String(source.id))) {
        issues.push(issue('error', 'SOURCE_SUMMARY_MISSING', `Complete source has no summary page: ${source.title || source.id}`, { source_id: source.id }))
      }
    }

    for (const registryPath of Object.keys(registry.pages || {})) {
      if (!pageByPath.has(registryPath)) {
        issues.push(issue('warning', 'PAGE_REGISTRY_ORPHAN', 'Registry references a missing page', { page_path: registryPath, fixable: true }))
      }
    }

    const report = {
      version: 1,
      reason,
      status: issues.some(item => item.severity === 'error') ? 'error' : (issues.length ? 'warning' : 'healthy'),
      summary: summaryCounts(issues),
      page_count: files.length,
      source_count: sources.length,
      issues,
      duration_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    }
    const reportPath = path.join(this._wikiDir, '.cache', 'lint', 'latest.json')
    await fs.promises.mkdir(path.dirname(reportPath), { recursive: true })
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    return report
  }

  async latest() {
    const reportPath = path.join(this._wikiDir, '.cache', 'lint', 'latest.json')
    try { return JSON.parse(await fs.promises.readFile(reportPath, 'utf-8')) } catch { return null }
  }
}
