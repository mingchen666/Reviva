import { spawn } from 'node:child_process'
<<<<<<< HEAD
=======
import crypto from 'node:crypto'
>>>>>>> dev
import fs from 'node:fs'
import path from 'node:path'
import { getSystemEnv } from '../../systemEnv.js'

const MAX_BUFFER = 4 * 1024 * 1024

const PDF_IMAGE_SCRIPT = String.raw`
import json
import os
import sys

try:
    import fitz
except Exception as exc:
    print(json.dumps({
        "success": False,
        "code": "PYMUPDF_NOT_INSTALLED",
        "detail": str(exc),
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
    }, ensure_ascii=False))
    raise SystemExit(2)

def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)

def safe_ext(value):
    ext = str(value or "png").lower().strip().lstrip(".")
    if ext in ["jpeg"]:
        ext = "jpg"
    if ext not in ["png", "jpg", "webp", "gif", "bmp", "tif", "tiff", "jp2", "jpx"]:
        ext = "png"
    return "." + ext

try:
    req = json.load(sys.stdin)
    file_path = req.get("path")
    output_dir = req.get("outputDir")
    start_page = max(int(req.get("startPage") or 1), 1)
    max_pages = min(max(int(req.get("maxPages") or 5), 1), 50)
    max_images = min(max(int(req.get("maxImages") or 50), 1), 200)

    if not output_dir:
        emit({"success": False, "code": "PDF_IMAGE_OUTPUT_DIR_MISSING", "detail": "outputDir is required"}, 1)
    os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(file_path)
    encrypted = bool(getattr(doc, "needs_pass", False))
    if encrypted:
        try:
            decrypt_result = doc.authenticate("")
        except Exception as exc:
            emit({"success": False, "code": "PDF_ENCRYPTED", "detail": str(exc)}, 1)
        if not decrypt_result:
            emit({"success": False, "code": "PDF_ENCRYPTED", "detail": "PDF is encrypted and cannot be opened with an empty password."}, 1)

    page_count = doc.page_count
    start_index = min(start_page - 1, page_count)
    end_index = min(page_count, start_index + max_pages)
    images = []
    seen = set()

    for page_index in range(start_index, end_index):
        if len(images) >= max_images:
            break
        page_no = page_index + 1
        page = doc.load_page(page_index)
        for img_index, img in enumerate(page.get_images(full=True), start=1):
            if len(images) >= max_images:
                break
            xref = int(img[0])
            key = (page_no, xref)
            if key in seen:
                continue
            seen.add(key)
            try:
                base = doc.extract_image(xref)
                data = base.get("image") or b""
                if not data:
                    continue
                ext = safe_ext(base.get("ext"))
                file_name = f"page-{page_no:03d}-image-{len(images) + 1:03d}{ext}"
                output_path = os.path.join(output_dir, file_name)
                with open(output_path, "wb") as fh:
                    fh.write(data)
                images.append({
                    "page": page_no,
                    "xref": xref,
                    "name": file_name,
                    "width": int(base.get("width") or 0),
                    "height": int(base.get("height") or 0),
                    "ext": ext,
                    "size": len(data),
                })
            except Exception as exc:
                images.append({
                    "page": page_no,
                    "xref": xref,
                    "error": str(exc),
                })

    emit({
        "success": True,
        "pageCount": page_count,
        "startPage": start_page,
        "endPage": end_index,
        "images": images,
        "truncated": len(images) >= max_images,
        "parser": "pymupdf",
    })
except SystemExit:
    raise
except Exception as exc:
    emit({"success": False, "code": "PDF_IMAGE_EXTRACT_FAILED", "detail": str(exc)}, 1)
`

const PDF_PYTHON_CANDIDATES = [
  { command: 'python', args: [], label: 'python' },
  { command: 'py', args: ['-3'], label: 'py -3' },
  { command: 'py', args: [], label: 'py' },
  { command: 'python3', args: [], label: 'python3' },
]

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/')
}

function parseJsonLike(stdout, stderr = '') {
  const raw = String(stdout || stderr || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const line = raw.split(/\r?\n/).find(item => item.trim().startsWith('{') || item.trim().startsWith('['))
    if (line) {
      try { return JSON.parse(line) } catch {}
    }
    return null
  }
}

function spawnBuffered(command, args, { input, env, timeoutMs = 60000, maxBuffer = MAX_BUFFER, label = command } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, env })
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'process timeout', via: label })
    }, timeoutMs)

    child.stdout.on('data', d => append(stdoutChunks, d))
    child.stderr.on('data', d => append(stderrChunks, d))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message, via: label }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      via: label,
    }))

    try {
      child.stdin.end(input || '')
    } catch (err) {
      finish({ code: 1, stdout: '', stderr: err.message, via: label })
    }
  })
}

function filterImages(images = [], { startPage = 1, maxPages = 5, maxImages = 50 } = {}) {
  const endPage = startPage + maxPages - 1
  return (images || [])
    .filter(item => Number(item.page) >= startPage && Number(item.page) <= endPage)
    .slice(0, maxImages)
}

function requestedRange({ startPage = 1, maxPages = 5 } = {}) {
  const start = Math.max(Number(startPage) || 1, 1)
  const pages = Math.max(Number(maxPages) || 1, 1)
  return { startPage: start, endPage: start + pages - 1 }
}

function coverageCovers(coverage = [], request = {}) {
  const range = requestedRange(request)
  return (coverage || []).some(item => (
    !item?.truncated
    && Number(item.startPage) <= range.startPage
    && Number(item.endPage) >= range.endPage
  ))
}

function mergeCoverage(current = [], entry = null) {
  const items = Array.isArray(current) ? current.filter(Boolean) : []
  if (entry) items.push(entry)
  return items.slice(-50)
}

export class PdfImageExtractor {
  constructor({ envProvider = getSystemEnv } = {}) {
    this._envProvider = envProvider
  }

  async _pythonEnv() {
    let base = null
    if (typeof this._envProvider === 'function') {
      try {
        base = await this._envProvider()
      } catch {
        base = null
      }
    }
    return { ...(base || process.env), PYTHONIOENCODING: 'utf-8' }
  }

<<<<<<< HEAD
  async _extract(doc, { startPage = 1, maxPages = 5, maxImages = 50 } = {}) {
    const outputDir = path.join(doc.cacheRoot, 'assets', 'embedded')
=======
  async _extract(doc, { startPage = 1, maxPages = 5, maxImages = 50, outputDir: requestedOutputDir = '' } = {}) {
    const outputDir = requestedOutputDir || path.join(doc.cacheRoot, 'assets', 'embedded')
>>>>>>> dev
    await fs.promises.mkdir(outputDir, { recursive: true })
    const env = await this._pythonEnv()
    let lastMissing = null
    let lastNotFound = null
    let lastFailure = null
    for (const candidate of PDF_PYTHON_CANDIDATES) {
      const result = await spawnBuffered(candidate.command, [...candidate.args, '-c', PDF_IMAGE_SCRIPT], {
        input: JSON.stringify({ path: doc.realPath, outputDir, startPage, maxPages, maxImages }),
        env,
        timeoutMs: 60000,
        label: candidate.label,
      })
      const parsed = parseJsonLike(result.stdout, result.stderr)
      if (result.code === 127) {
        lastNotFound = result
        continue
      }
      if (parsed?.code === 'PYMUPDF_NOT_INSTALLED') {
        lastMissing = { ...parsed, via: result.via }
        continue
      }
      if (parsed?.success) return { ...parsed, via: result.via, outputDir }
      lastFailure = {
        success: false,
        code: parsed?.code || (result.code === 124 ? 'PDF_IMAGE_EXTRACT_TIMEOUT' : 'PDF_IMAGE_EXTRACT_FAILED'),
        message: parsed?.message || (result.code === 124 ? 'PDF 图片抽取超时。' : 'PDF 图片抽取失败。'),
        detail: parsed?.detail || (result.stderr || result.stdout || '').slice(0, 1200),
        via: result.via,
      }
      if (result.code === 124) break
    }
    if (lastMissing) {
      return {
        success: false,
        code: 'PYMUPDF_NOT_INSTALLED',
        message: '已找到 Python，但当前环境缺少 PyMuPDF，无法抽取 PDF 原始内嵌图片。',
        detail: lastMissing.detail || '',
        via: lastMissing.via,
      }
    }
    return lastFailure || {
      success: false,
      code: 'PYTHON_NOT_FOUND',
      message: '未找到可用的 Python，无法抽取 PDF 原始内嵌图片。',
      detail: lastNotFound?.stderr || '',
    }
  }

<<<<<<< HEAD
=======
  async extractToDirectory(filePath, {
    outputDir = '',
    outputRelDir = '',
    sourceId = '',
    maxPages = 2000,
    maxImages = 40,
  } = {}) {
    if (!filePath || !outputDir || !outputRelDir) {
      return { success: false, assets: [], errors: [], code: 'PDF_IMAGE_OUTPUT_DIR_MISSING', message: 'PDF 图片输出目录不完整。' }
    }
    const limit = Math.min(Math.max(Number(maxImages) || 40, 1), 200)
    const pageLimit = Math.min(Math.max(Number(maxPages) || 1, 1), 2000)
    const rawImages = []
    const errors = []
    let startPage = 1
    let pageCount = pageLimit
    let truncated = false

    while (startPage <= Math.min(pageCount, pageLimit) && rawImages.length < limit) {
      const extracted = await this._extract({ realPath: filePath, cacheRoot: outputDir }, {
        startPage,
        maxPages: Math.min(50, pageLimit - startPage + 1),
        maxImages: limit - rawImages.length,
        outputDir,
      })
      if (!extracted.success) {
        errors.push({ page: startPage, code: extracted.code || 'PDF_IMAGE_EXTRACT_FAILED', detail: extracted.detail || extracted.message || '' })
        break
      }
      pageCount = Math.min(Number(extracted.pageCount) || pageLimit, pageLimit)
      rawImages.push(...(extracted.images || []).filter(item => {
        if (item?.error || !item?.name) {
          if (item?.error) errors.push({ page: item.page || startPage, detail: item.error })
          return false
        }
        return true
      }))
      truncated = truncated || !!extracted.truncated
      if (Number(extracted.endPage || 0) < startPage) break
      startPage = Number(extracted.endPage || startPage + 49) + 1
    }

    const assets = []
    const safeSourceId = String(sourceId || path.basename(filePath, path.extname(filePath)) || 'pdf').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80)
    for (const image of rawImages.slice(0, limit)) {
      const absPath = path.join(outputDir, image.name)
      try {
        const buffer = await fs.promises.readFile(absPath)
        const hash = crypto.createHash('sha256').update(buffer).digest('hex')
        assets.push({
          id: `asset_${safeSourceId}_${hash.slice(0, 12)}`,
          source_id: sourceId || '',
          kind: 'pdf_embedded_image',
          path: toPosix(path.posix.join(toPosix(outputRelDir), image.name)),
          original_path: `${filePath}#page=${image.page || 0}&xref=${image.xref || 0}`,
          content_hash: `sha256:${hash}`,
          size: buffer.length,
          page: Number(image.page) || 0,
          name: image.name,
          width: Number(image.width) || 0,
          height: Number(image.height) || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } catch (error) {
        errors.push({ page: image.page || 0, name: image.name, detail: error.message || String(error) })
      }
    }
    return { success: true, assets, errors, pageCount, truncated: truncated || rawImages.length >= limit }
  }

>>>>>>> dev
  async listEmbeddedImages(cache, doc, { startPage = 1, maxPages = 5, maxImages = 50 } = {}) {
    const current = await cache.readEmbeddedImagesIndex(doc)
    const coverage = Array.isArray(current.coverage) ? current.coverage : []
    const cachedImages = filterImages(current.images || [], { startPage, maxPages, maxImages })
    const covered = coverageCovers(coverage, { startPage, maxPages })
    if (covered || cachedImages.length >= maxImages) {
      return {
        success: true,
        images: cachedImages,
        cacheHit: true,
        note: covered
          ? '返回已缓存的 PDF 原始内嵌图片索引。'
          : '返回已缓存的 PDF 原始内嵌图片索引；结果已达到本次 maxImages 限制。',
      }
    }

    const extracted = await this._extract(doc, { startPage, maxPages, maxImages })
    if (!extracted.success) {
      return {
        success: false,
        images: [],
        cacheHit: false,
        code: extracted.code,
        note: extracted.message || 'PDF 原始内嵌图片抽取失败。',
        detail: extracted.detail || '',
      }
    }

    const images = (extracted.images || [])
      .filter(item => item.name && !item.error)
      .map((item, index) => ({
        id: `pdf_embedded_${doc.id}_${String(item.page).padStart(3, '0')}_${String(index + 1).padStart(3, '0')}`,
        type: 'pdf_embedded_image',
        page: Number(item.page) || undefined,
        xref: item.xref || undefined,
        path: `/${toPosix(path.join(doc.cachePath, 'assets', 'embedded', item.name))}`,
        relativePath: toPosix(path.join('assets', 'embedded', item.name)),
        width: item.width || 0,
        height: item.height || 0,
        ext: item.ext || path.extname(item.name),
        size: item.size || 0,
      }))
    const byPath = new Map()
    for (const item of current.images || []) {
      if (item?.path) byPath.set(item.path, item)
    }
    for (const item of images) {
      if (item?.path) byPath.set(item.path, item)
    }
    const range = requestedRange({ startPage, maxPages })
    const nextCoverage = mergeCoverage(coverage, {
      ...range,
      maxImages,
      imageCount: images.length,
      truncated: !!extracted.truncated,
      updatedAt: new Date().toISOString(),
    })
    await cache.writeEmbeddedImagesIndex(doc, [...byPath.values()], { coverage: nextCoverage })

    return {
      success: true,
      images,
      cacheHit: false,
      note: images.length
        ? `已抽取 ${images.length} 张 PDF 原始内嵌图片。`
        : '未在指定页段发现 PDF 原始内嵌图片；扫描页整页图像请使用 OCR 或 vision_analyze 分析页面截图。',
      truncated: !!extracted.truncated,
    }
  }
}
