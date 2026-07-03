import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { runOfficeCli } from './OfficeCliRunner.js'

const DEFAULT_MAX_IMAGES = 200
const HARD_MAX_IMAGES = 500
const MANIFEST_FILENAME = '.manifest.json'

function parseJsonLike(stdout, stderr = '') {
  const raw = String(stdout || stderr || '').trim()
  if (!raw) return { raw: '', data: null }
  try {
    return { raw, data: JSON.parse(raw) }
  } catch {
    const line = raw.split(/\r?\n/).find(item => item.trim().startsWith('{') || item.trim().startsWith('['))
    if (line) {
      try {
        return { raw, data: JSON.parse(line) }
      } catch {}
    }
    return { raw, data: null }
  }
}

function compactDetail(value, max = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
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

function imageExtensionFromMime(mime = '') {
  const text = String(mime || '').toLowerCase()
  if (text.includes('png')) return '.png'
  if (text.includes('jpeg') || text.includes('jpg')) return '.jpg'
  if (text.includes('webp')) return '.webp'
  if (text.includes('gif')) return '.gif'
  if (text.includes('bmp')) return '.bmp'
  if (text.includes('svg')) return '.svg'
  if (text.includes('tiff') || text.includes('tif')) return '.tif'
  return ''
}

function imageExtensionFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return ''
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg'
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return '.gif'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp'
  if (buffer.subarray(0, 2).toString('ascii') === 'BM') return '.bmp'
  const head = buffer.subarray(0, 256).toString('utf8').trimStart().toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return '.svg'
  return ''
}

function imageExtensionFromName(value = '') {
  const ext = path.extname(String(value || '').split(/[?#]/)[0]).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.svg'].includes(ext)
    ? (ext === '.jpeg' ? '.jpg' : ext)
    : ''
}

function collectOfficeImagePaths(value, results = []) {
  if (!value) return results
  if (Array.isArray(value)) {
    for (const item of value) collectOfficeImagePaths(item, results)
    return results
  }
  if (typeof value !== 'object') return results
  const itemPath = value.path || value.Path || value.domPath || value.dom_path
  const type = String(value.type || value.kind || value.nodeType || value.element || '').toLowerCase()
  if (itemPath && (!type || type.includes('picture') || type.includes('image') || type.includes('pic'))) {
    results.push({
      path: String(itemPath),
      name: String(value.name || value.alt || value.title || ''),
      width: value.width || value.w || '',
      height: value.height || value.h || '',
      relId: value.relId || value.rId || value.relationshipId || '',
      raw: value,
    })
  }
  for (const item of Object.values(value)) collectOfficeImagePaths(item, results)
  return results
}

export function parseOfficeImageQueryOutput(stdout, stderr = '', { maxImages = DEFAULT_MAX_IMAGES } = {}) {
  const parsed = parseJsonLike(stdout, stderr)
  const items = collectOfficeImagePaths(parsed.data)
  const raw = parsed.raw || String(stdout || stderr || '')
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    const match = text.match(/^(\/\S+)\s+\((picture|image|pic)\)\b/i) || text.match(/^(\/\S+)/)
    if (!match) continue
    const nameMatch = text.match(/\bname=("[^"]+"|'[^']+'|\S+)/i)
    const widthMatch = text.match(/\bwidth=([^\s]+)/i)
    const heightMatch = text.match(/\bheight=([^\s]+)/i)
    const relIdMatch = text.match(/\brelId=([^\s]+)/i)
    items.push({
      path: match[1],
      name: nameMatch ? nameMatch[1].replace(/^["']|["']$/g, '') : '',
      width: widthMatch ? widthMatch[1] : '',
      height: heightMatch ? heightMatch[1] : '',
      relId: relIdMatch ? relIdMatch[1] : '',
      raw: text,
    })
  }
  const limit = normalizeMaxImages(maxImages)
  const seen = new Set()
  return items
    .filter(item => item.path && !seen.has(item.path) && seen.add(item.path))
    .slice(0, limit)
}

function extractSavedContentType(stdout = '', stderr = '') {
  const text = `${stdout || ''}\n${stderr || ''}`
  const match = text.match(/\bsavedContentType=([^\s]+)/i) || text.match(/\bcontentType=([^\s]+)/i)
  return match ? match[1] : ''
}

async function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function hashString(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function normalizeMaxImages(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_MAX_IMAGES, 1), HARD_MAX_IMAGES)
}

function matchesImagePath(item, imagePath = '') {
  const needle = String(imagePath || '').trim()
  if (!needle) return true
  const haystacks = [item.path, item.name, item.relId].map(value => String(value || ''))
  return haystacks.some(value => value === needle || value.includes(needle))
}

async function readManifest(manifestPath) {
  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        version: 1,
        entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      }
    }
  } catch {}
  return { version: 1, entries: {} }
}

async function writeManifest(manifestPath, manifest) {
  const payload = {
    version: 1,
    updated_at: new Date().toISOString(),
    entries: manifest.entries && typeof manifest.entries === 'object' ? manifest.entries : {},
  }
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`
  await fs.promises.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf-8')
  await fs.promises.rename(tempPath, manifestPath)
}

async function sourceSignature(filePath) {
  const stat = await fs.promises.stat(filePath)
  return {
    pathHash: hashString(path.resolve(filePath).toLowerCase()),
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
  }
}

function imageCacheKey(signature, item) {
  return hashString(JSON.stringify({
    source: signature,
    domPath: item.path || '',
    name: item.name || '',
    relId: item.relId || '',
  }))
}

function isSafeCachedFileName(fileName) {
  const value = String(fileName || '')
  return !!value && value === path.basename(value) && !/[<>:"/\\|?*\x00-\x1F]/.test(value)
}

async function assetFromCache(entry, {
  outputRoot,
  outputRelDir,
  safeSourceId,
  sourceId,
  filePath,
  item,
}) {
  if (!entry || !isSafeCachedFileName(entry.fileName)) return null
  const finalPath = path.join(outputRoot, entry.fileName)
  const resolvedFinal = path.resolve(finalPath)
  if (!resolvedFinal.toLowerCase().startsWith(outputRoot.toLowerCase() + path.sep) && resolvedFinal.toLowerCase() !== outputRoot.toLowerCase()) {
    return null
  }
  let stat
  try {
    stat = await fs.promises.stat(finalPath)
    if (!stat.isFile()) return null
  } catch {
    return null
  }
  const contentHash = String(entry.content_hash || '')
  const hash = contentHash.replace(/^sha256:/i, '')
  const assetRel = toPosix(path.posix.join(toPosix(outputRelDir), entry.fileName))
  return {
    id: `asset_${safeSourceId}_${(hash || hashString(entry.fileName)).slice(0, 12)}`,
    source_id: sourceId || '',
    kind: 'office_image',
    path: assetRel,
    original_path: `${filePath}#${item.path}`,
    content_hash: contentHash,
    size: stat.size,
    page: 0,
    name: item.name || entry.name || '',
    dom_path: item.path,
    created_at: entry.created_at || new Date().toISOString(),
    updated_at: entry.updated_at || new Date().toISOString(),
  }
}

export async function queryOfficeImages(filePath, { maxImages = DEFAULT_MAX_IMAGES } = {}) {
  const queryItems = []
  const errors = []
  for (const selector of ['picture', 'image']) {
    const result = await runOfficeCli(['query', filePath, selector, '--json'], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
    if (result.code === 0) {
      queryItems.push(...parseOfficeImageQueryOutput(result.stdout, result.stderr, { maxImages }))
    } else {
      const textResult = await runOfficeCli(['query', filePath, selector], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
      if (textResult.code === 0) queryItems.push(...parseOfficeImageQueryOutput(textResult.stdout, textResult.stderr, { maxImages }))
      else errors.push({ selector, detail: compactDetail(result.stderr || result.stdout || textResult.stderr || textResult.stdout) })
    }
  }
  const limit = normalizeMaxImages(maxImages)
  const seen = new Set()
  const images = queryItems
    .filter(item => item.path && !seen.has(item.path) && seen.add(item.path))
    .slice(0, limit)
  return { images, errors }
}

export async function extractOfficeImages(filePath, {
  outputDir = '',
  outputRelDir = '',
  sourceId = '',
  imagePath = '',
  maxImages = DEFAULT_MAX_IMAGES,
} = {}) {
  if (!outputDir || !outputRelDir) return { images: [], assets: [], errors: [] }

  const outputRoot = path.resolve(outputDir)
  await fs.promises.mkdir(outputRoot, { recursive: true })

  const queryResult = await queryOfficeImages(filePath, { maxImages })
  const items = queryResult.images.filter(item => matchesImagePath(item, imagePath))
  const errors = [...queryResult.errors]
  const assets = []
  const safeSourceId = safeSegment(sourceId || path.basename(filePath, path.extname(filePath)) || 'source')
  const manifestPath = path.join(outputRoot, MANIFEST_FILENAME)
  const manifest = await readManifest(manifestPath)
  const signature = await sourceSignature(filePath)
  let cacheHits = 0
  let cacheMisses = 0
  let manifestDirty = false

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const cacheKey = imageCacheKey(signature, item)
    const cachedAsset = await assetFromCache(manifest.entries[cacheKey], {
      outputRoot,
      outputRelDir,
      safeSourceId,
      sourceId,
      filePath,
      item,
    })
    if (cachedAsset) {
      cacheHits += 1
      assets.push(cachedAsset)
      continue
    }
    cacheMisses += 1
    const tempPath = path.join(outputRoot, `.office-image-${process.pid}-${Date.now()}-${index}.bin`)
    try {
      const saveResult = await runOfficeCli(['get', filePath, item.path, '--save', tempPath], { timeoutMs: 60000, maxBuffer: 512 * 1024 })
      if (saveResult.code !== 0) {
        errors.push({ path: item.path, detail: compactDetail(saveResult.stderr || saveResult.stdout) })
        await fs.promises.unlink(tempPath).catch(() => {})
        continue
      }
      const buffer = await fs.promises.readFile(tempPath)
      const hash = await hashBuffer(buffer)
      const contentType = extractSavedContentType(saveResult.stdout, saveResult.stderr)
      const ext = imageExtensionFromMime(contentType) || imageExtensionFromBuffer(buffer) || imageExtensionFromName(item.name) || '.png'
      const base = safeSegment(path.basename(item.name || `office-image-${index + 1}`, path.extname(item.name || '')), `office-image-${index + 1}`)
      const fileName = `${base}-${hash.slice(0, 10)}${ext}`
      const finalPath = path.join(outputRoot, fileName)
      const resolvedFinal = path.resolve(finalPath)
      if (!resolvedFinal.toLowerCase().startsWith(outputRoot.toLowerCase() + path.sep) && resolvedFinal.toLowerCase() !== outputRoot.toLowerCase()) {
        throw new Error('Resolved image path escaped asset directory')
      }
      if (!fs.existsSync(finalPath)) await fs.promises.rename(tempPath, finalPath)
      else await fs.promises.unlink(tempPath).catch(() => {})
      const stat = await fs.promises.stat(finalPath)
      const assetRel = toPosix(path.posix.join(toPosix(outputRelDir), fileName))
      const now = new Date().toISOString()
      assets.push({
        id: `asset_${safeSourceId}_${hash.slice(0, 12)}`,
        source_id: sourceId || '',
        kind: 'office_image',
        path: assetRel,
        original_path: `${filePath}#${item.path}`,
        content_hash: `sha256:${hash}`,
        size: stat.size,
        page: 0,
        name: item.name || '',
        dom_path: item.path,
        created_at: now,
        updated_at: now,
      })
      manifest.entries[cacheKey] = {
        fileName,
        content_hash: `sha256:${hash}`,
        size: stat.size,
        name: item.name || '',
        dom_path: item.path,
        relId: item.relId || '',
        source: signature,
        created_at: manifest.entries[cacheKey]?.created_at || now,
        updated_at: now,
      }
      manifestDirty = true
    } catch (error) {
      errors.push({ path: item.path, detail: compactDetail(error?.message || error) })
      await fs.promises.unlink(tempPath).catch(() => {})
    }
  }

  if (manifestDirty) {
    try {
      await writeManifest(manifestPath, manifest)
    } catch (error) {
      errors.push({ path: MANIFEST_FILENAME, detail: compactDetail(error?.message || error) })
    }
  }

  return {
    images: items,
    assets,
    errors,
    cache: {
      manifest: toPosix(path.posix.join(toPosix(outputRelDir), MANIFEST_FILENAME)),
      hits: cacheHits,
      misses: cacheMisses,
    },
  }
}
