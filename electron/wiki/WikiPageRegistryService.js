import fs from 'node:fs'
import path from 'node:path'
import { pageContentHash, parseFrontmatter } from './WikiMarkdownMetadata.js'

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

async function writeJson(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function walkMarkdown(absDir, relDir, out) {
  if (!fs.existsSync(absDir)) return
  for (const entry of await fs.promises.readdir(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name)
    const rel = `${relDir}/${entry.name}`.replace(/\\/g, '/')
    if (entry.isDirectory()) await walkMarkdown(abs, rel, out)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push({ abs, rel })
  }
}

export class WikiPageRegistryService {
  constructor({ wikiDir }) {
    this._wikiDir = wikiDir
    this._registryPath = path.join(wikiDir, 'pages', 'registry.json')
    this._writeChain = Promise.resolve()
  }

  async _mutate(operation) {
    const run = this._writeChain.catch(() => {}).then(operation)
    this._writeChain = run.catch(() => {})
    return run
  }

  async load() {
    const registry = await readJson(this._registryPath, { version: 1, pages: {} })
    if (!registry.pages || typeof registry.pages !== 'object' || Array.isArray(registry.pages)) registry.pages = {}
    return registry
  }

  async save(registry) {
    await writeJson(this._registryPath, {
      version: registry.version || 1,
      pages: registry.pages || {},
    })
  }

  async upsert(relPath, metadata, content) {
    return this._mutate(async () => {
      const registry = await this.load()
      registry.pages[relPath] = {
        id: metadata.id,
        type: metadata.type,
        title: metadata.title,
        status: metadata.status,
        source_ids: Array.isArray(metadata.source_ids) ? metadata.source_ids : [],
        schema_version: metadata.schema_version || 1,
        content_hash: pageContentHash(content),
        updated_at: metadata.updated_at || new Date().toISOString(),
      }
      await this.save(registry)
      return registry.pages[relPath]
    })
  }

  async remove(relPath) {
    return this._mutate(async () => {
      const registry = await this.load()
      if (!registry.pages[relPath]) return false
      delete registry.pages[relPath]
      await this.save(registry)
      return true
    })
  }

  async recordsForSource(sourceId) {
    const registry = await this.load()
    return Object.entries(registry.pages)
      .filter(([, record]) => Array.isArray(record.source_ids) && record.source_ids.includes(sourceId))
      .map(([pagePath, record]) => ({ pagePath, ...record }))
  }

  async rebuild() {
    return this._mutate(async () => {
      const files = []
      for (const rootFile of ['index.md', 'overview.md']) {
        const abs = path.join(this._wikiDir, rootFile)
        if (fs.existsSync(abs)) files.push({ abs, rel: rootFile })
      }
      await walkMarkdown(path.join(this._wikiDir, 'pages'), 'pages', files)
      const pages = {}
      for (const file of files) {
        const content = await fs.promises.readFile(file.abs, 'utf-8').catch(() => '')
        const meta = parseFrontmatter(content).attributes || {}
        if (!meta.id || !meta.type) continue
        pages[file.rel] = {
          id: String(meta.id),
          type: String(meta.type),
          title: String(meta.title || path.basename(file.rel, '.md')),
          status: String(meta.status || 'active'),
          source_ids: Array.isArray(meta.source_ids) ? meta.source_ids.map(String) : [],
          schema_version: Number(meta.schema_version || 1),
          content_hash: pageContentHash(content),
          updated_at: String(meta.updated_at || ''),
        }
      }
      const registry = { version: 1, pages }
      await this.save(registry)
      return registry
    })
  }
}
