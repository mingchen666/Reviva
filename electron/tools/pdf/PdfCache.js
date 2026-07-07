import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg'])
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
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

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

function imageExtFromMime(mime = '') {
  const value = String(mime || '').toLowerCase().split(';')[0].trim()
  if (value.includes('jpeg')) return '.jpg'
  if (value.includes('png')) return '.png'
  if (value.includes('webp')) return '.webp'
  if (value.includes('gif')) return '.gif'
  if (value.includes('bmp')) return '.bmp'
  if (value.includes('tiff')) return '.tiff'
  if (value.includes('svg')) return '.svg'
  return ''
}

async function downloadRemoteImage(url, { timeoutMs = 30000, maxBytes = MAX_REMOTE_IMAGE_BYTES } = {}) {
  if (typeof fetch !== 'function') return { externalUrl: url, source: 'remote_url' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return { externalUrl: url, source: 'remote_url', downloadError: `HTTP ${response.status}` }
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxBytes) return { externalUrl: url, source: 'remote_url', downloadError: 'remote image too large' }
    const contentType = response.headers.get('content-type') || ''
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > maxBytes) return { externalUrl: url, source: 'remote_url', downloadError: 'remote image too large' }
    const extFromUrl = path.extname(new URL(url).pathname).toLowerCase()
    const ext = IMAGE_EXTS.has(extFromUrl) ? extFromUrl : (imageExtFromMime(contentType) || '.png')
    return { buffer: Buffer.from(arrayBuffer), ext, source: 'remote_download', originalUrl: url }
  } catch (err) {
    return { externalUrl: url, source: 'remote_url', downloadError: err.message || 'download failed' }
  } finally {
    clearTimeout(timer)
  }
}

function dataUrlToBuffer(value) {
  const match = String(value || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) return null
  const mime = match[1] || 'image/png'
  const isBase64 = !!match[2]
  const body = match[3] || ''
  const ext = mime.includes('jpeg') ? '.jpg' : (mime.includes('/') ? `.${mime.split('/').pop().replace(/[^a-z0-9]/gi, '')}` : '.png')
  const buffer = isBase64 ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
  return { buffer, ext: IMAGE_EXTS.has(ext.toLowerCase()) ? ext : '.png', source: 'data_url' }
}

function isWithinAnyRoot(filePath, roots = []) {
  const resolved = path.resolve(filePath)
  return roots
    .filter(Boolean)
    .map(root => path.resolve(root))
    .some(root => resolved === root || resolved.startsWith(root + path.sep))
}

async function imageValueToFile(value, originalRef = '', { allowedLocalRoots = [] } = {}) {
  if (Buffer.isBuffer(value)) {
    const ext = path.extname(originalRef).toLowerCase()
    return { buffer: value, ext: IMAGE_EXTS.has(ext) ? ext : '.png', source: 'buffer' }
  }
  if (value instanceof Uint8Array) {
    const ext = path.extname(originalRef).toLowerCase()
    return { buffer: Buffer.from(value), ext: IMAGE_EXTS.has(ext) ? ext : '.png', source: 'uint8array' }
  }
  if (typeof value === 'string') {
    if (isHttpUrl(value)) return downloadRemoteImage(value)
    const dataUrl = dataUrlToBuffer(value)
    if (dataUrl) return dataUrl
    const ext = path.extname(value).toLowerCase()
    if (IMAGE_EXTS.has(ext) && isWithinAnyRoot(value, allowedLocalRoots) && fs.existsSync(value)) {
      return { buffer: await fs.promises.readFile(value), ext, source: 'local_file' }
    }
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 64) {
      return { buffer: Buffer.from(value, 'base64'), ext: '.png', source: 'base64' }
    }
  }
  if (value && typeof value === 'object') {
    const data = value.data || value.buffer || value.base64 || value.content
    if (data) return imageValueToFile(data, originalRef || value.name || value.path || '', { allowedLocalRoots })
    if (value.url && isHttpUrl(value.url)) return downloadRemoteImage(value.url)
  }
  throw new Error('Unsupported OCR image value')
}

async function readJson(filePath, fallback = null) {
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

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function manifestMatchesDoc(manifest, doc) {
  if (!manifest || !doc) return false
  return manifest.pdfId === doc.id
    && Number(manifest.fileSize || 0) === Number(doc.fileSize || 0)
    && Number(manifest.mtimeMs || 0) === Number(doc.mtimeMs || 0)
    && String(manifest.realPathHash || '') === String(doc.realPathHash || '')
}

export class PdfCache {
  constructor({ workDirService = null, dbService = null } = {}) {
    this._workDirService = workDirService
    this._db = dbService
  }

  async documentFor(filePath, { virtualPath = '', sourceInfo = {} } = {}) {
    const root = this._workDirService?.getRootPath?.()
    if (!root) throw new Error('No workspace initialized')
    const stat = await fs.promises.stat(filePath)
    const realPath = path.resolve(filePath)
    const realPathHash = hashText(realPath)
    const id = `pdf_${hashText([root, realPath, stat.size, stat.mtimeMs].join('|')).slice(0, 16)}`
    const relCachePath = `context/pdf/${id}`
    const cacheRoot = path.join(root, relCachePath)
    await fs.promises.mkdir(cacheRoot, { recursive: true })

    const doc = {
      id,
      fileName: path.basename(realPath),
      realPath,
      virtualPath,
      realPathHash,
      fileSize: stat.size,
      mtimeMs: stat.mtimeMs,
      cachePath: toPosix(relCachePath),
      cacheRoot,
      owners: sourceInfo?.owner ? [sourceInfo.owner] : [],
    }

    const existingManifest = await this.readManifest(cacheRoot)
    await this._writeManifest(doc, {
      status: existingManifest?.status || 'pending',
      sourceInfo: existingManifest?.sourceInfo || sourceInfo,
    })
    this._upsertDocument(doc, sourceInfo)
    return doc
  }

  async _writeManifest(doc, extra = {}) {
    const existing = await this.readManifest(doc.cacheRoot)
    await writeJson(path.join(doc.cacheRoot, 'manifest.json'), {
      ...existing,
      version: 1,
      pdfId: doc.id,
      fileName: doc.fileName,
      virtualPath: doc.virtualPath,
      realPathHash: doc.realPathHash,
      fileSize: doc.fileSize,
      mtimeMs: doc.mtimeMs,
      cachePath: doc.cachePath,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extra,
    })
  }

  async readManifest(cacheRoot) {
    return readJson(path.join(cacheRoot, 'manifest.json'), null)
  }

  async writeOverview(doc, overview) {
    await writeJson(path.join(doc.cacheRoot, 'text', 'overview.json'), overview)
    await this._writeManifest(doc, {
      status: 'overview_ready',
      pageCount: overview.pageCount || 0,
      pdfTextMode: overview.pdfTextMode || '',
      textCoverageRatio: overview.textCoverageRatio || 0,
    })
    this._updateDocument(doc.id, {
      page_count: overview.pageCount || 0,
      pdf_text_mode: overview.pdfTextMode || '',
      status: overview.pdfTextMode ? 'overview_ready' : 'pending',
      last_accessed_at: new Date().toISOString(),
    })
  }

  async readOverview(doc) {
    const manifest = await this.readManifest(doc.cacheRoot)
    if (!manifestMatchesDoc(manifest, doc)) return null
    return readJson(path.join(doc.cacheRoot, 'text', 'overview.json'), null)
  }

  async readTextPages(doc) {
    return readJson(path.join(doc.cacheRoot, 'text', 'pages.json'), { version: 1, pages: [] })
  }

  async writeTextPages(doc, payload) {
    await writeJson(path.join(doc.cacheRoot, 'text', 'pages.json'), {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...(payload || {}),
    })
  }

  async mergeTextPages(doc, incoming = [], meta = {}) {
    const current = await this.readTextPages(doc)
    const byPage = new Map((current.pages || []).map(page => [Number(page.page), page]))
    for (const page of incoming || []) {
      if (!page?.page) continue
      byPage.set(Number(page.page), page)
    }
    const pages = [...byPage.values()].sort((a, b) => Number(a.page) - Number(b.page))
    await this.writeTextPages(doc, {
      ...current,
      ...meta,
      pages,
    })
    return { ...current, ...meta, pages }
  }

  ocrRoot(doc, ocrProfileKey) {
    return path.join(doc.cacheRoot, 'ocr', ocrProfileKey)
  }

  async readOcrManifest(doc, ocrProfileKey) {
    return readJson(path.join(this.ocrRoot(doc, ocrProfileKey), 'manifest.json'), null)
  }

  async listOcrManifests(doc) {
    const root = path.join(doc.cacheRoot, 'ocr')
    try {
      const entries = await fs.promises.readdir(root, { withFileTypes: true })
      const manifests = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const manifest = await readJson(path.join(root, entry.name, 'manifest.json'), null)
        if (manifest) manifests.push({ ...manifest, ocrProfileKey: manifest.ocrProfileKey || entry.name })
      }
      return manifests.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    } catch {
      return []
    }
  }

  async writeOcrResult(doc, ocrProfileKey, result, { provider, ranges = [], requestedRanges = [], fullDocumentFallback = false } = {}) {
    const root = this.ocrRoot(doc, ocrProfileKey)
    const pagesDir = path.join(root, 'pages')
    const assetsDir = path.join(root, 'assets', 'images')
    await fs.promises.mkdir(pagesDir, { recursive: true })
    await fs.promises.mkdir(assetsDir, { recursive: true })
    const pages = []
    const allAssets = []
    for (const page of result.pages || []) {
      const pageNo = Math.max(Number(page.page || pages.length + 1), 1)
      const name = `page-${String(pageNo).padStart(3, '0')}`
      const mdRel = `pages/${name}.md`
      const jsonRel = `pages/${name}.json`
      const pageAssets = await this._writeOcrPageImages({
        doc,
        root,
        assetsDir,
        ocrProfileKey,
        page,
        pageNo,
      })
      allAssets.push(...pageAssets)
      await fs.promises.writeFile(path.join(root, mdRel), String(page.text || '').trim(), 'utf-8')
      await writeJson(path.join(root, jsonRel), {
        page: pageNo,
        text: page.text || '',
        markdown: page.markdown || page.text || '',
        blocks: page.blocks || [],
        assets: pageAssets,
        confidence: page.confidence || 0,
      })
      pages.push({
        page: pageNo,
        markdownPath: mdRel,
        jsonPath: jsonRel,
        charCount: String(page.text || '').length,
        assets: pageAssets.map(asset => asset.path || asset.original_url || asset.original_path).filter(Boolean),
      })
    }
    if (result.text || result.rawText) {
      await fs.promises.writeFile(path.join(root, 'full.md'), result.rawText || result.text || '', 'utf-8')
    }
    const manifest = {
      version: 1,
      pdfId: doc.id,
      providerId: provider?.id || result.provider_id || '',
      providerType: provider?.type || result.provider_type || '',
      ocrProfileKey,
      status: 'complete',
      ranges,
      requestedRanges,
      fullDocumentFallback: !!fullDocumentFallback,
      pages,
      assets: allAssets,
      metrics: result.metrics || {},
      updatedAt: new Date().toISOString(),
    }
    await writeJson(path.join(root, 'manifest.json'), manifest)
    return manifest
  }

  async _writeOcrPageImages({ doc, root, assetsDir, ocrProfileKey, page, pageNo }) {
    const images = page?.images && typeof page.images === 'object' ? page.images : {}
    const assets = []
    let index = 0
    for (const [originalRef, value] of Object.entries(images)) {
      index += 1
      try {
        const image = await imageValueToFile(value, originalRef, { allowedLocalRoots: [root, assetsDir] })
        const id = `pdf_asset_${doc.id}_${safeSegment(ocrProfileKey)}_${String(pageNo).padStart(3, '0')}_${String(index).padStart(3, '0')}`
        if (image.externalUrl) {
          assets.push({
            id,
            page: pageNo,
            type: 'ocr_asset',
            original_path: originalRef,
            original_url: image.externalUrl,
            source: image.source,
            error: image.downloadError || '',
            size: 0,
          })
          continue
        }
        const ext = image.ext || '.png'
        const fileName = `page-${String(pageNo).padStart(3, '0')}-image-${String(index).padStart(3, '0')}${ext}`
        const absPath = path.join(assetsDir, fileName)
        await fs.promises.writeFile(absPath, image.buffer)
        const relPath = toPosix(path.relative(root, absPath))
        assets.push({
          id,
          page: pageNo,
          type: 'ocr_asset',
          path: relPath,
          original_path: originalRef,
          original_url: image.originalUrl || '',
          source: image.source,
          size: image.buffer.length,
        })
      } catch (err) {
        assets.push({
          id: `pdf_asset_error_${doc.id}_${String(pageNo).padStart(3, '0')}_${String(index).padStart(3, '0')}`,
          page: pageNo,
          type: 'ocr_asset_error',
          original_path: originalRef,
          error: String(err.message || err).slice(0, 300),
        })
      }
    }
    return assets
  }

  async readOcrPage(doc, ocrProfileKey, pageNo) {
    const name = `page-${String(pageNo).padStart(3, '0')}`
    return readJson(path.join(this.ocrRoot(doc, ocrProfileKey), 'pages', `${name}.json`), null)
  }

  async readOcrFullMarkdown(doc, ocrProfileKey) {
    try {
      return await fs.promises.readFile(path.join(this.ocrRoot(doc, ocrProfileKey), 'full.md'), 'utf-8')
    } catch {
      return ''
    }
  }

  async readOcrMarkdownPages(doc, ocrProfileKey, pageRefs = []) {
    const root = this.ocrRoot(doc, ocrProfileKey)
    const chunks = []
    for (const ref of pageRefs || []) {
      const rel = String(ref?.markdownPath || '').replace(/\\/g, '/')
      if (!rel || rel.startsWith('../') || path.isAbsolute(rel)) continue
      const abs = path.resolve(root, rel)
      if (!isWithinAnyRoot(abs, [root])) continue
      try {
        const text = await fs.promises.readFile(abs, 'utf-8')
        chunks.push(`## Page ${ref.page}\n${text.trim() || '[No OCR content]'}`)
      } catch {}
    }
    return chunks.join('\n\n')
  }

  async writeEmbeddedImagesIndex(doc, images = []) {
    await writeJson(path.join(doc.cacheRoot, 'assets', 'embedded', 'images.json'), {
      version: 1,
      images,
      updatedAt: new Date().toISOString(),
    })
  }

  async readEmbeddedImagesIndex(doc) {
    return readJson(path.join(doc.cacheRoot, 'assets', 'embedded', 'images.json'), { version: 1, images: [] })
  }

  _upsertDocument(doc, sourceInfo = {}) {
    if (!this._db?.upsertPdfDocument) return
    const existing = this._db?.getPdfDocument?.(doc.id)
    this._db.upsertPdfDocument({
      id: doc.id,
      file_name: doc.fileName,
      real_path_hash: doc.realPathHash,
      file_size: doc.fileSize,
      mtime_ms: doc.mtimeMs,
      cache_path: doc.cachePath,
      owners_json: existing?.owners?.length ? existing.owners : (sourceInfo?.owners || doc.owners || []),
      status: existing?.status || 'pending',
      last_accessed_at: new Date().toISOString(),
    })
  }

  _updateDocument(id, data) {
    if (!this._db?.updatePdfDocument) return
    this._db.updatePdfDocument(id, data)
  }

  createParseRun(data) {
    return this._db?.createPdfParseRun?.(data) || null
  }

  updateParseRun(id, data) {
    return this._db?.updatePdfParseRun?.(id, data) || null
  }
}
