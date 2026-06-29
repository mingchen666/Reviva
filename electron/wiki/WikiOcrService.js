import fs from 'node:fs'
import path from 'node:path'
import { mergeAssetRecord } from './WikiAssetRegistry.js'
import { OcrProviderRunner } from './OcrProviderRunner.js'

const SUPPORTED_PROVIDER_TYPES = new Set(['mineru', 'paddleocr'])

function nowIso() {
  return new Date().toISOString()
}

function safeSegment(value, fallback = 'source') {
  const raw = String(value || '').trim().toLowerCase()
  const safe = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return safe || fallback
}

async function writeJsonIfMissing(filePath, data) {
  if (fs.existsSync(filePath)) return
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
}

function relFromFile(fromRelFile, toRelFile) {
  const fromDir = path.posix.dirname(toPosix(fromRelFile))
  const rel = path.posix.relative(fromDir, toPosix(toRelFile))
  return rel && !rel.startsWith('.') ? `./${rel}` : rel
}

function stripQuery(value) {
  return String(value || '').split('#')[0].split('?')[0]
}

function normalizeRef(value) {
  const raw = stripQuery(value).replace(/^<|>$/g, '').replace(/\\/g, '/')
  try {
    return decodeURIComponent(raw).replace(/^\.?\//, '')
  } catch {
    return raw.replace(/^\.?\//, '')
  }
}

function imageExtensionFromMime(mime = '') {
  const normalized = String(mime || '').toLowerCase()
  if (normalized.includes('png')) return '.png'
  if (normalized.includes('webp')) return '.webp'
  if (normalized.includes('gif')) return '.gif'
  if (normalized.includes('bmp')) return '.bmp'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg'
  if (normalized.includes('tiff')) return '.tif'
  return ''
}

function imageExtensionFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return ''
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return '.png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return '.jpg'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return '.gif'
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return '.webp'
  return ''
}

function imageExtensionFromName(value) {
  const ext = path.posix.extname(stripQuery(value).toLowerCase())
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(ext) ? ext : ''
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)?;base64,(.+)$/i)
  if (!match) return null
  return {
    mime: match[1] || '',
    base64: match[2] || '',
  }
}

function looksLikeBase64(value) {
  const text = String(value || '').replace(/\s+/g, '')
  return text.length > 24 && /^[A-Za-z0-9+/]+={0,2}$/.test(text)
}

async function imageValueToBuffer(value, originalPath = '') {
  if (Buffer.isBuffer(value)) {
    return {
      buffer: value,
      ext: imageExtensionFromBuffer(value) || imageExtensionFromName(originalPath) || '.png',
      source: 'buffer',
    }
  }
  const text = String(value || '').trim()
  const dataUrl = parseDataUrl(text)
  if (dataUrl) {
    const buffer = Buffer.from(dataUrl.base64, 'base64')
    return {
      buffer,
      ext: imageExtensionFromMime(dataUrl.mime) || imageExtensionFromBuffer(buffer) || imageExtensionFromName(originalPath) || '.png',
      source: 'data-url',
    }
  }
  if (isHttpUrl(text)) {
    if (typeof fetch !== 'function') throw new Error('Current runtime does not support downloading OCR images')
    const response = await fetch(text)
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    const mime = response.headers?.get?.('content-type') || ''
    return {
      buffer,
      ext: imageExtensionFromMime(mime) || imageExtensionFromBuffer(buffer) || imageExtensionFromName(text) || imageExtensionFromName(originalPath) || '.png',
      source: 'url',
    }
  }
  if (looksLikeBase64(text)) {
    const buffer = Buffer.from(text.replace(/\s+/g, ''), 'base64')
    return {
      buffer,
      ext: imageExtensionFromBuffer(buffer) || imageExtensionFromName(originalPath) || '.png',
      source: 'base64',
    }
  }
  throw new Error('Unsupported OCR image payload')
}

function rewriteMarkdownImageRefs(markdown, assets, fromRelFile) {
  if (!assets.length) return markdown
  const byRef = new Map()
  const byBase = new Map()
  for (const asset of assets) {
    const keys = [
      asset.original_path,
      normalizeRef(asset.original_path),
      asset.original_url,
      normalizeRef(asset.original_url),
    ].filter(Boolean)
    for (const key of keys) byRef.set(key, relFromFile(fromRelFile, asset.path))
    const base = path.posix.basename(normalizeRef(asset.original_path || asset.original_url || ''))
    if (base && !byBase.has(base)) byBase.set(base, relFromFile(fromRelFile, asset.path))
  }

  return String(markdown || '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, label, rawUrl) => {
    const clean = normalizeRef(rawUrl)
    const base = path.posix.basename(clean)
    const next = byRef.get(rawUrl) || byRef.get(clean) || byBase.get(base)
    return next ? `![${label}](${next})` : match
  })
}

export class WikiOcrService {
  constructor({ dbService = null } = {}) {
    this._db = dbService
    this._runner = new OcrProviderRunner()
  }

  relativePaths(sourceId) {
    const safeSourceId = safeSegment(sourceId)
    return {
      sourceOcrRoot: `sources/ocr/${safeSourceId}`,
      pagesDir: `sources/ocr/${safeSourceId}/pages`,
      manifestPath: `sources/ocr/${safeSourceId}/manifest.json`,
      outputExtractPath: `sources/extracts/${safeSourceId}.md`,
      assetsImagesDir: `assets/images/${safeSourceId}`,
      cachePath: `.cache/ocr/${safeSourceId}`,
      cacheImagesDir: `.cache/ocr/${safeSourceId}/images`,
      cacheRawDir: `.cache/ocr/${safeSourceId}/raw`,
    }
  }

  async ensureLayout(wikiDir, source) {
    const sourceId = source?.id || 'source'
    const rel = this.relativePaths(sourceId)
    const dirs = [
      rel.sourceOcrRoot,
      rel.pagesDir,
      rel.assetsImagesDir,
      rel.cachePath,
      rel.cacheImagesDir,
      rel.cacheRawDir,
    ]
    for (const dir of dirs) {
      await fs.promises.mkdir(path.join(wikiDir, dir), { recursive: true })
    }

    await writeJsonIfMissing(path.join(wikiDir, rel.manifestPath), {
      version: 1,
      source_id: sourceId,
      source_title: source?.title || '',
      status: 'pending',
      provider_id: '',
      pages: [],
      output_extract_path: rel.outputExtractPath,
      assets_images_dir: rel.assetsImagesDir,
      cache_path: rel.cachePath,
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    return rel
  }

  async registerPendingJob({ wikiId, wikiDir, source, providerId = '' }) {
    if (!wikiId || !wikiDir || !source?.id) return null
    const rel = await this.ensureLayout(wikiDir, source)
    const existing = this._db?.listWikiOcrJobs?.(wikiId, source.id)
      ?.find(job => ['pending', 'running'].includes(job.status))
    if (existing) return existing

    const job = {
      id: `ocr_${Date.now().toString(36)}_${safeSegment(source.id)}`,
      wiki_id: wikiId,
      source_id: source.id,
      provider_id: providerId || null,
      status: 'pending',
      progress: 0,
      pages_total: source.meta?.parse_stats?.pageCount || 0,
      pages_done: 0,
      input_path: source.original_uri || source.original_path || '',
      output_manifest_path: rel.manifestPath,
      output_extract_path: rel.outputExtractPath,
      cache_path: rel.cachePath,
      error_message: source.parser_message || '',
      metrics: {
        parser_status: source.parser_status || '',
        needs_ocr: true,
        parse_stats: source.meta?.parse_stats || {},
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    return this._db?.createWikiOcrJob?.(job) || job
  }

  _selectProvider(providerId = '') {
    if (providerId) {
      const provider = this._db?.getOcrProvider?.(providerId)
      if (!provider) throw new Error('OCR provider not found')
      if (!provider.enabled) throw new Error('OCR provider is disabled')
      if (!SUPPORTED_PROVIDER_TYPES.has(String(provider.type || '').toLowerCase())) {
        throw new Error('当前仅支持 MinerU 和 PaddleOCR OCR 服务商')
      }
      return provider
    }
    const provider = this._db?.listOcrProviders?.()
      .find(item => item.enabled && SUPPORTED_PROVIDER_TYPES.has(String(item.type || '').toLowerCase()))
    if (!provider) throw new Error('请先配置并启用 OCR 服务商')
    return provider
  }

  async runJob({ wikiId, wikiDir, source, providerId = '' }) {
    if (!wikiId || !wikiDir || !source?.id) throw new Error('OCR job requires wiki and source')
    const provider = this._selectProvider(providerId)
    const rel = await this.ensureLayout(wikiDir, source)
    const existing = this._db?.listWikiOcrJobs?.(wikiId, source.id)
      ?.find(job => ['pending', 'running', 'failed'].includes(job.status))
    const job = existing || await this.registerPendingJob({ wikiId, wikiDir, source, providerId: provider.id })
    this._db?.updateWikiOcrJob?.(job.id, {
      provider_id: provider.id,
      status: 'running',
      progress: 5,
      error_message: '',
      updated_at: nowIso(),
    })

    try {
      const result = await this._runner.run({
        provider,
        inputPath: source.original_path,
        outputDir: path.join(wikiDir, rel.sourceOcrRoot),
        cacheDir: path.join(wikiDir, rel.cachePath),
        source,
      })
      const written = await this.writeResult({ wikiDir, source, provider, rel, result })
      const metrics = {
        ...(job.metrics || {}),
        ...(result.metrics || {}),
        ...(written.manifest?.metrics || {}),
        needs_ocr: true,
        completed_at: nowIso(),
      }
      const completedJob = this._db?.updateWikiOcrJob?.(job.id, {
        status: 'completed',
        progress: 100,
        pages_total: written.pages.length,
        pages_done: written.pages.length,
        output_manifest_path: rel.manifestPath,
        output_extract_path: rel.outputExtractPath,
        cache_path: rel.cachePath,
        metrics,
        updated_at: nowIso(),
      }) || { ...job, status: 'completed', progress: 100, metrics }
      return {
        job: completedJob,
        extract_path: rel.outputExtractPath,
        manifest_path: rel.manifestPath,
        pages: written.pages,
        metrics,
      }
    } catch (err) {
      this._db?.updateWikiOcrJob?.(job.id, {
        status: 'failed',
        progress: 100,
        error_message: err.message || 'OCR failed',
        updated_at: nowIso(),
      })
      throw err
    }
  }

  async writeResult({ wikiDir, source, provider, rel, result }) {
    const rawPath = path.join(wikiDir, rel.cacheRawDir, 'response.json')
    await fs.promises.mkdir(path.dirname(rawPath), { recursive: true })
    await fs.promises.writeFile(rawPath, JSON.stringify(result.raw || {}, null, 2), 'utf-8')

    const pages = []
    const allAssets = []
    const assetErrors = []
    for (const page of result.pages || []) {
      const pageNo = Math.max(Number(page.page || pages.length + 1), 1)
      const pageName = `page-${String(pageNo).padStart(3, '0')}`
      const pageMdRel = `${rel.pagesDir}/${pageName}.md`
      const pageJsonRel = `${rel.pagesDir}/${pageName}.json`
      const pageMdPath = path.join(wikiDir, pageMdRel)
      const pageJsonPath = path.join(wikiDir, pageJsonRel)
      await fs.promises.mkdir(path.dirname(pageMdPath), { recursive: true })
      const pageAssets = await this._writePageImages({
        wikiDir,
        rel,
        page,
        pageNo,
        source,
        errors: assetErrors,
      })
      allAssets.push(...pageAssets)
      const text = rewriteMarkdownImageRefs(String(page.text || '').trim(), pageAssets, pageMdRel)
      await fs.promises.writeFile(pageMdPath, [
        `# Page ${pageNo}`,
        '',
        text || '[No OCR text]',
        '',
      ].join('\n'), 'utf-8')
      await fs.promises.writeFile(pageJsonPath, JSON.stringify({
        page: pageNo,
        text,
        blocks: page.blocks || [],
        assets: pageAssets.map(asset => ({
          id: asset.id,
          path: asset.path,
          original_path: asset.original_path,
          source: asset.source,
          size: asset.size,
        })),
        confidence: page.confidence || 0,
      }, null, 2), 'utf-8')
      pages.push({
        page: pageNo,
        text_path: pageMdRel,
        json_path: pageJsonRel,
        char_count: text.length,
        assets: pageAssets.map(asset => asset.path),
        confidence: page.confidence || 0,
      })
    }
    if (allAssets.length) await this._updateAssetRegistry(wikiDir, allAssets)

    const manifest = {
      version: 1,
      source_id: source.id,
      source_title: source.title || '',
      status: 'complete',
      provider_id: provider.id,
      provider_type: provider.type,
      pages,
      assets: allAssets.map(asset => ({
        id: asset.id,
        path: asset.path,
        original_path: asset.original_path,
        page: asset.page,
        size: asset.size,
      })),
      asset_errors: assetErrors,
      output_extract_path: rel.outputExtractPath,
      cache_path: rel.cachePath,
      raw_response_path: `${rel.cacheRawDir}/response.json`,
      metrics: {
        ...(result.metrics || {}),
        asset_count: allAssets.length,
        asset_error_count: assetErrors.length,
      },
      updated_at: nowIso(),
    }
    await fs.promises.writeFile(path.join(wikiDir, rel.manifestPath), JSON.stringify(manifest, null, 2), 'utf-8')

    const extractPath = path.join(wikiDir, rel.outputExtractPath)
    await fs.promises.mkdir(path.dirname(extractPath), { recursive: true })
    const pagesByNo = new Map((result.pages || []).map(page => [Math.max(Number(page.page || 0), 1), page]))
    const body = [
      '---',
      `source_id: ${source.id}`,
      'source_type: ocr',
      `title: ${JSON.stringify(source.title || source.id)}`,
      `provider_id: ${JSON.stringify(provider.id)}`,
      `manifest: ${JSON.stringify(rel.manifestPath)}`,
      '---',
      '',
      `# ${source.title || source.id}`,
      '',
      ...pages.map(item => {
        const originalPage = pagesByNo.get(item.page) || {}
        const pageAssets = allAssets.filter(asset => asset.page === item.page)
        const text = rewriteMarkdownImageRefs(String(originalPage.text || '').trim(), pageAssets, rel.outputExtractPath)
        return `## Page ${item.page}\n\n${text || '[No OCR text]'}`
      }),
      '',
    ].join('\n')
    await fs.promises.writeFile(extractPath, body, 'utf-8')
    return { pages, manifest }
  }

  async _writePageImages({ wikiDir, rel, page, pageNo, source, errors }) {
    const images = page?.images && typeof page.images === 'object' ? page.images : {}
    const assets = []
    let index = 0
    for (const [originalPath, value] of Object.entries(images)) {
      index += 1
      try {
        const image = await imageValueToBuffer(value, originalPath)
        const fileName = `page-${String(pageNo).padStart(3, '0')}-image-${String(index).padStart(3, '0')}${image.ext || '.png'}`
        const assetRel = `${rel.assetsImagesDir}/${fileName}`
        const assetPath = path.join(wikiDir, assetRel)
        await fs.promises.mkdir(path.dirname(assetPath), { recursive: true })
        await fs.promises.writeFile(assetPath, image.buffer)
        assets.push({
          id: `asset_${safeSegment(source?.id || 'source')}_${String(pageNo).padStart(3, '0')}_${String(index).padStart(3, '0')}`,
          source_id: source?.id || '',
          page: pageNo,
          kind: 'ocr_image',
          path: assetRel,
          original_path: originalPath,
          original_url: isHttpUrl(String(value || '')) ? String(value || '') : '',
          source: image.source,
          size: image.buffer.length,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
      } catch (err) {
        errors.push({
          page: pageNo,
          original_path: originalPath,
          message: err.message || 'Image write failed',
        })
      }
    }
    return assets
  }

  async _updateAssetRegistry(wikiDir, assets) {
    const registryPath = path.join(wikiDir, 'assets', 'registry.json')
    const registry = await readJson(registryPath, { version: 1, assets: [] })
    const current = Array.isArray(registry.assets) ? registry.assets : []
    const byId = new Map(current.map(asset => [asset.id, asset]))
    for (const asset of assets) {
      byId.set(asset.id, mergeAssetRecord(byId.get(asset.id), asset))
    }
    await fs.promises.mkdir(path.dirname(registryPath), { recursive: true })
    await fs.promises.writeFile(registryPath, JSON.stringify({
      version: registry.version || 1,
      assets: Array.from(byId.values()),
    }, null, 2), 'utf-8')
  }
}
