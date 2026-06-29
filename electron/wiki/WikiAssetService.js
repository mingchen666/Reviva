import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { mergeAssetRecord } from './WikiAssetRegistry.js'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg'])

function nowIso() {
  return new Date().toISOString()
}

function safeSegment(value, fallback = 'asset') {
  const raw = String(value || '').trim().toLowerCase()
  const safe = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return safe || fallback
}

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
}

function decodeImageRef(value) {
  const raw = String(value || '').trim().replace(/^<|>$/g, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function isExternalRef(value) {
  return /^(https?:|data:|blob:|file:|mailto:|#)/i.test(String(value || ''))
}

function splitRef(value) {
  const text = String(value || '')
  const match = text.match(/^([^?#]*)([?#].*)?$/)
  return {
    pathPart: match?.[1] || text,
    suffix: match?.[2] || '',
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJson(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function fileHash(filePath) {
  const hash = crypto.createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

export class WikiAssetService {
  constructor({ wikiDir }) {
    this._wikiDir = wikiDir
  }

  async rewriteMarkdownLocalImages({ markdown, source, sourceFilePath, outputRelPath, docsRootPath = '' }) {
    const assets = []
    const sourceDir = path.dirname(sourceFilePath || '')
    const sourceId = safeSegment(source?.id || 'source')
    const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g
    const replacements = []

    for (const match of String(markdown || '').matchAll(pattern)) {
      const [full, label, rawRef] = match
      const { pathPart, suffix } = splitRef(rawRef)
      const decoded = decodeImageRef(pathPart)
      if (!decoded || isExternalRef(decoded)) continue

      const originalPath = this._resolveMarkdownImagePath(decoded, sourceDir, docsRootPath)
      const ext = path.extname(originalPath).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) continue
      const stat = await fs.promises.stat(originalPath).catch(() => null)
      if (!stat?.isFile?.()) continue

      const hash = await fileHash(originalPath)
      const base = safeSegment(path.basename(originalPath, ext), 'image')
      const fileName = `${base}-${hash.slice(0, 10)}${ext}`
      const assetRel = `assets/images/${sourceId}/${fileName}`
      const assetAbs = path.join(this._wikiDir, assetRel)
      await fs.promises.mkdir(path.dirname(assetAbs), { recursive: true })
      if (!fs.existsSync(assetAbs)) await fs.promises.copyFile(originalPath, assetAbs)

      const relFromOutput = path.posix.relative(
        path.posix.dirname(toPosix(outputRelPath)),
        toPosix(assetRel),
      )
      const markdownRef = relFromOutput.startsWith('.') ? relFromOutput : `./${relFromOutput}`
      const next = `![${label}](${markdownRef}${suffix})`
      replacements.push({ full, next })
      assets.push({
        id: `asset_${sourceId}_${hash.slice(0, 12)}`,
        source_id: source?.id || '',
        kind: 'source_image',
        path: assetRel,
        original_path: originalPath,
        content_hash: `sha256:${hash}`,
        size: stat.size,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
    }

    let nextMarkdown = String(markdown || '')
    for (const item of replacements) {
      nextMarkdown = nextMarkdown.split(item.full).join(item.next)
    }
    if (assets.length) await this.upsertAssets(assets)
    return { markdown: nextMarkdown, assets }
  }

  _resolveMarkdownImagePath(ref, sourceDir, docsRootPath = '') {
    const text = String(ref || '').replace(/\\/g, '/')
    const docsRoot = docsRootPath ? path.resolve(docsRootPath) : ''
    if (docsRoot && text.startsWith('/docs/')) return path.join(docsRoot, text.slice('/docs/'.length))
    if (docsRoot && text.startsWith('/')) return path.join(docsRoot, text.replace(/^\/+/, ''))
    if (docsRoot && /^docs\//i.test(text)) return path.join(docsRoot, text.replace(/^docs\//i, ''))
    return path.isAbsolute(ref) ? ref : path.resolve(sourceDir, ref)
  }

  async upsertAssets(assets) {
    const registryPath = path.join(this._wikiDir, 'assets', 'registry.json')
    const registry = await readJson(registryPath, { version: 1, assets: [] })
    const byId = new Map((Array.isArray(registry.assets) ? registry.assets : []).map(asset => [asset.id, asset]))
    for (const asset of assets) {
      byId.set(asset.id, mergeAssetRecord(byId.get(asset.id), asset))
    }
    await writeJson(registryPath, {
      version: registry.version || 1,
      assets: Array.from(byId.values()),
    })
  }
}
