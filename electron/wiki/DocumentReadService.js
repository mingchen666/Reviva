import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../officeCliResolver.js'
import { getSystemEnv } from '../systemEnv.js'

const OFFICE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const PDF_EXTS = new Set(['.pdf'])
const OFFICE_CHUNK_LINES = 300
const OFFICE_MAX_CHUNKS = 400
const OFFICE_MAX_IMAGES = 200
const PDF_CHUNK_PAGES = 10
const PDF_MAX_PAGES = 2000
const MAX_BUFFER = 8 * 1024 * 1024

const PDF_PYTHON_SCRIPT = String.raw`
import json
import sys

try:
    from pypdf import PdfReader
except Exception as exc:
    print(json.dumps({"success": False, "code": "PYPDF_NOT_INSTALLED", "detail": str(exc)}, ensure_ascii=False))
    raise SystemExit(2)

def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)

try:
    req = json.load(sys.stdin)
    file_path = req.get("path")
    start_page = max(int(req.get("startPage") or 1), 1)
    max_pages = min(max(int(req.get("maxPages") or 10), 1), 50)

    reader = PdfReader(file_path, strict=False)
    encrypted = bool(getattr(reader, "is_encrypted", False))
    if encrypted:
        try:
            decrypt_result = reader.decrypt("")
        except Exception as exc:
            emit({"success": False, "code": "PDF_ENCRYPTED", "detail": str(exc)}, 1)
        if not decrypt_result:
            emit({"success": False, "code": "PDF_ENCRYPTED", "detail": "PDF is encrypted and cannot be opened with an empty password."}, 1)

    page_count = len(reader.pages)
    metadata = {}
    try:
        for key, value in dict(reader.metadata or {}).items():
            metadata[str(key).lstrip("/")] = "" if value is None else str(value)
    except Exception:
        metadata = {}

    start_index = min(start_page - 1, page_count)
    end_index = min(page_count, start_index + max_pages)
    pages = []
    for index in range(start_index, end_index):
        try:
            text = reader.pages[index].extract_text() or ""
            pages.append({"page": index + 1, "text": text, "ok": True})
        except Exception as exc:
            pages.append({"page": index + 1, "text": "", "ok": False, "error": str(exc)})

    emit({
        "success": True,
        "pageCount": page_count,
        "startPage": start_page,
        "endPage": end_index,
        "encrypted": encrypted,
        "metadata": metadata,
        "pages": pages,
        "nextPage": end_index + 1 if end_index < page_count else None,
    })
except SystemExit:
    raise
except Exception as exc:
    emit({"success": False, "code": "PDF_READ_FAILED", "detail": str(exc)}, 1)
`

const PDF_PYTHON_CANDIDATES = [
  { command: 'python', args: [], label: 'python' },
  { command: 'py', args: ['-3'], label: 'py -3' },
  { command: 'py', args: [], label: 'py' },
  { command: 'python3', args: [], label: 'python3' },
]

const PDF_OCR_FALLBACK_CODES = new Set(['PDF_READ_FAILED', 'PDF_READ_TIMEOUT'])
const PDF_MIN_DOCUMENT_TEXT_CHARS = 40
const PDF_TEXT_PAGE_MIN_CHARS = 25
const PDF_MIXED_OCR_PAGE_RATIO = 0.35

function parseJsonLike(stdout, stderr = '') {
  const raw = String(stdout || stderr || '').trim()
  if (!raw) return { raw: '', data: null }
  try {
    return { raw, data: JSON.parse(raw) }
  } catch {
    const line = raw.split(/\r?\n/).find(item => item.trim().startsWith('{') || item.trim().startsWith('['))
    if (line) {
      try { return { raw, data: JSON.parse(line) } } catch {}
    }
    return { raw, data: null }
  }
}

function flattenText(value, depth = 0) {
  if (value == null || depth > 6) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => flattenText(item, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    for (const key of ['markdown', 'content', 'text', 'plainText', 'value', 'raw']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key]
    }
    return Object.entries(value)
      .filter(([key]) => !['success', 'mode', 'next', 'metadata'].includes(key))
      .map(([key, item]) => {
        const text = flattenText(item, depth + 1)
        return text ? `### ${key}\n${text}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

function spawnBuffered(command, args, { input, env, shell = false, timeoutMs = 60000, maxBuffer = MAX_BUFFER, label = command } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell, windowsHide: true, env })
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

    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

function compactDetail(value, max = 600) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
      raw: value,
    })
  }
  for (const item of Object.values(value)) collectOfficeImagePaths(item, results)
  return results
}

function parseOfficeImageQueryOutput(stdout, stderr = '') {
  const parsed = parseJsonLike(stdout, stderr)
  const items = collectOfficeImagePaths(parsed.data)
  const raw = parsed.raw || String(stdout || stderr || '')
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue
    const match = text.match(/^(\/\S+)\s+\((picture|image|pic)\)\b/i) || text.match(/^(\/\S+)/)
    if (!match) continue
    const nameMatch = text.match(/\bname=("[^"]+"|'[^']+'|\S+)/i)
    const name = nameMatch ? nameMatch[1].replace(/^["']|["']$/g, '') : ''
    items.push({ path: match[1], name, raw: text })
  }
  const seen = new Set()
  return items
    .filter(item => item.path && !seen.has(item.path) && seen.add(item.path))
    .slice(0, OFFICE_MAX_IMAGES)
}

function extractSavedContentType(stdout = '', stderr = '') {
  const text = `${stdout || ''}\n${stderr || ''}`
  const match = text.match(/\bsavedContentType=([^\s]+)/i) || text.match(/\bcontentType=([^\s]+)/i)
  return match ? match[1] : ''
}

async function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function usefulPdfTextLength(value) {
  return String(value || '').replace(/\s+/g, '').length
}

function pdfNeedsOcrResult(message, stats = {}, detail = '') {
  return {
    success: false,
    code: 'PDF_NEEDS_OCR',
    message,
    detail: compactDetail(detail),
    stats: {
      parser: 'pypdf',
      needsOcr: true,
      ...stats,
    },
  }
}

async function runOfficeCli(args, options = {}) {
  let env
  try {
    env = getOfficeCliSpawnEnv(await getSystemEnv())
  } catch {
    env = getOfficeCliSpawnEnv(process.env)
  }

  let lastResult = { code: 127, stdout: '', stderr: 'officecli not found' }
  let bundledFailure = null
  for (const attempt of getOfficeCliCommandCandidates(args)) {
    const result = await spawnBuffered(attempt.cmd, attempt.args, {
      ...options,
      shell: attempt.shell !== false,
      env,
      label: attempt.label,
    })
    lastResult = result
    if (result.code === 0) return result
    const output = `${result.stderr || ''}\n${result.stdout || ''}`
    const notFound = /not recognized|command not found|不是内部或外部命令|系统找不到|no such file or directory/i.test(output)
    if (notFound) continue
    if (attempt.source === 'bundled') {
      bundledFailure = result
      continue
    }
    break
  }
  return bundledFailure || lastResult
}

async function runOfficeCliWithRetry(args, options = {}, retries = 1) {
  let result = await runOfficeCli(args, options)
  for (let attempt = 0; attempt < retries && [124, 127].includes(result.code); attempt += 1) {
    await sleep(250)
    result = await runOfficeCli(args, options)
  }
  return result
}

async function runPdfPython(payload) {
  let lastMissing = null
  let lastNotFound = null
  for (const candidate of PDF_PYTHON_CANDIDATES) {
    const result = await spawnBuffered(candidate.command, [...candidate.args, '-c', PDF_PYTHON_SCRIPT], {
      input: JSON.stringify(payload),
      shell: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeoutMs: 60000,
      label: candidate.label,
    })
    const parsed = parseJsonLike(result.stdout, result.stderr).data
    if (result.code === 127) {
      lastNotFound = result
      continue
    }
    if (parsed?.code === 'PYPDF_NOT_INSTALLED') {
      lastMissing = parsed
      continue
    }
    if (parsed) return parsed
    return { success: false, code: result.code === 124 ? 'PDF_READ_TIMEOUT' : 'PDF_READ_FAILED', detail: (result.stderr || result.stdout || '').slice(0, 1200) }
  }
  if (lastMissing) return { success: false, code: 'PYPDF_NOT_INSTALLED', detail: lastMissing.detail || '' }
  return { success: false, code: 'PYTHON_NOT_FOUND', detail: lastNotFound?.stderr || '' }
}

export class DocumentReadService {
  async readDocument(filePath, { sourceType = '', title = '', sourceId = '', imageOutputDir = '', imageOutputRelDir = '' } = {}) {
    const ext = path.extname(filePath || '').toLowerCase()
    if (OFFICE_EXTS.has(ext)) return this._readOffice(filePath, { ext, sourceType, title, sourceId, imageOutputDir, imageOutputRelDir })
    if (PDF_EXTS.has(ext)) return this._readPdf(filePath, { title })
    return {
      success: false,
      code: 'UNSUPPORTED_FORMAT',
      message: `暂不支持解析 ${ext || sourceType || 'unknown'} 文件。`,
    }
  }

  async _readOffice(filePath, { ext, title, sourceId, imageOutputDir, imageOutputRelDir }) {
    const versionCheck = await runOfficeCliWithRetry(['--version'], { timeoutMs: 5000, maxBuffer: 64 * 1024 }, 1)
    if (versionCheck.code === 127) {
      return { success: false, code: 'OFFICECLI_NOT_INSTALLED', message: '读取 Office 文档需要 officecli。请先在设置 > 环境检测中修复 OfficeCLI。' }
    }
    if (versionCheck.code !== 0) {
      return { success: false, code: 'OFFICECLI_UNAVAILABLE', message: 'officecli 当前不可用。', detail: (versionCheck.stderr || versionCheck.stdout || '').slice(0, 1000) }
    }

    const stats = await runOfficeCli(['view', filePath, 'stats', '--json'], { timeoutMs: 30000 })
    const outline = await runOfficeCli(['view', filePath, 'outline', '--json'], { timeoutMs: 30000 })
    const statsText = flattenText(parseJsonLike(stats.stdout, stats.stderr).data) || parseJsonLike(stats.stdout, stats.stderr).raw
    const outlineText = flattenText(parseJsonLike(outline.stdout, outline.stderr).data) || parseJsonLike(outline.stdout, outline.stderr).raw

    const chunks = []
    const seen = new Set()
    for (let index = 0; index < OFFICE_MAX_CHUNKS; index += 1) {
      const start = index * OFFICE_CHUNK_LINES + 1
      const result = await runOfficeCli([
        'view',
        filePath,
        'text',
        '--json',
        '--start',
        String(start),
        '--max-lines',
        String(OFFICE_CHUNK_LINES),
      ], { timeoutMs: 60000 })
      if (result.code !== 0) {
        if (chunks.length) break
        return { success: false, code: 'OFFICECLI_READ_FAILED', message: 'officecli 读取失败。', detail: (result.stderr || result.stdout || '').slice(0, 1200) }
      }
      const parsed = parseJsonLike(result.stdout, result.stderr)
      const text = (flattenText(parsed.data) || parsed.raw).trim()
      const signature = text.slice(0, 500)
      if (!text || seen.has(signature)) break
      seen.add(signature)
      chunks.push({ start, text })
    }

    const body = [
      `# ${title || path.basename(filePath)}`,
      '',
      '## Document Stats',
      '',
      statsText || 'No stats available.',
      '',
      '## Outline',
      '',
      outlineText || 'No outline available.',
      '',
      '## Extracted Text',
      '',
      ...chunks.map(chunk => `### Lines from ${chunk.start}\n\n${chunk.text}`),
    ].join('\n')

    const imageResult = await this._extractOfficeImages(filePath, {
      sourceId,
      imageOutputDir,
      imageOutputRelDir,
    })

    return {
      success: true,
      format: ext.slice(1),
      content: body,
      assets: imageResult.assets,
      assetErrors: imageResult.errors,
      stats: {
        parser: 'officecli',
        chunks: chunks.length,
        chars: body.length,
        asset_count: imageResult.assets.length,
        asset_error_count: imageResult.errors.length,
      },
    }
  }

  async _extractOfficeImages(filePath, { sourceId = '', imageOutputDir = '', imageOutputRelDir = '' } = {}) {
    if (!imageOutputDir || !imageOutputRelDir) return { assets: [], errors: [] }

    const outputRoot = path.resolve(imageOutputDir)
    await fs.promises.mkdir(outputRoot, { recursive: true })

    const queryItems = []
    const errors = []
    for (const selector of ['picture', 'image']) {
      const result = await runOfficeCli(['query', filePath, selector, '--json'], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
      if (result.code === 0) {
        queryItems.push(...parseOfficeImageQueryOutput(result.stdout, result.stderr))
      } else {
        const textResult = await runOfficeCli(['query', filePath, selector], { timeoutMs: 30000, maxBuffer: 2 * 1024 * 1024 })
        if (textResult.code === 0) queryItems.push(...parseOfficeImageQueryOutput(textResult.stdout, textResult.stderr))
      }
    }

    const seenPaths = new Set()
    const items = queryItems.filter(item => item.path && !seenPaths.has(item.path) && seenPaths.add(item.path)).slice(0, OFFICE_MAX_IMAGES)
    const assets = []
    const safeSourceId = safeSegment(sourceId || 'source')

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
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
        const assetRel = toPosix(path.posix.join(toPosix(imageOutputRelDir), fileName))
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } catch (error) {
        errors.push({ path: item.path, detail: compactDetail(error?.message || error) })
        await fs.promises.unlink(tempPath).catch(() => {})
      }
    }

    return { assets, errors }
  }

  async _readPdf(filePath, { title }) {
    let first = await runPdfPython({ path: filePath, startPage: 1, maxPages: PDF_CHUNK_PAGES })
    if (!first.success) {
      const code = first.code || 'PDF_READ_FAILED'
      if (PDF_OCR_FALLBACK_CODES.has(code)) {
        return pdfNeedsOcrResult(
          '本地 PDF 文本提取失败，需要 OCR/版面解析继续处理。',
          { fallbackReason: code, errorDetail: compactDetail(first.detail) },
          first.detail,
        )
      }
      const message = code === 'PYPDF_NOT_INSTALLED'
        ? '读取 PDF 需要 Python 包 pypdf。请先在设置 > 环境检测中修复 Python Office 库。'
        : (code === 'PYTHON_NOT_FOUND'
            ? '未找到可用 Python，无法读取 PDF。'
            : (code === 'PDF_ENCRYPTED' ? '该 PDF 已加密，无法进行本地文本提取。' : 'PDF 文本提取失败。'))
      return { success: false, code, message, detail: first.detail || '' }
    }

    const pageCount = Math.min(first.pageCount || 0, PDF_MAX_PAGES)
    const chunks = []
    let cursor = 1
    let textChars = 0
    let usefulTextChars = 0
    let extractedPages = 0
    let emptyPages = 0
    let thinTextPages = 0
    let failedPages = 0
    const textPages = []
    const ocrCandidatePages = []
    const pageErrors = []
    const readErrors = []

    while (cursor && cursor <= pageCount) {
      const current = cursor === 1 ? first : await runPdfPython({ path: filePath, startPage: cursor, maxPages: PDF_CHUNK_PAGES })
      if (!current.success) {
        readErrors.push({
          startPage: cursor,
          code: current.code || 'PDF_READ_FAILED',
          detail: compactDetail(current.detail),
        })
        break
      }
      for (const page of current.pages || []) {
        if (page.ok === false || page.error) {
          failedPages += 1
          pageErrors.push({ page: page.page, error: compactDetail(page.error, 240) })
          ocrCandidatePages.push(page.page)
          chunks.push(`## Page ${page.page}\n\n[Text extraction failed; OCR/layout parsing is required for this page.]`)
          continue
        }
        const text = String(page.text || '').trim()
        const usefulLength = usefulPdfTextLength(text)
        if (usefulLength >= PDF_TEXT_PAGE_MIN_CHARS) {
          extractedPages += 1
          textPages.push(page.page)
        } else if (usefulLength > 0) {
          thinTextPages += 1
          ocrCandidatePages.push(page.page)
        } else {
          emptyPages += 1
          ocrCandidatePages.push(page.page)
        }
        chunks.push(`## Page ${page.page}\n\n${text || '[No extractable text]'}`)
        textChars += text.length
        usefulTextChars += usefulLength
      }
      cursor = current.nextPage
    }

    const unreadPages = readErrors[0]?.startPage
      ? Math.max(pageCount - Number(readErrors[0].startPage) + 1, 0)
      : 0
    const uniqueOcrCandidatePages = Array.from(new Set(ocrCandidatePages)).sort((a, b) => a - b)
    const ocrCandidateCount = uniqueOcrCandidatePages.length + unreadPages
    const textCoverageRatio = pageCount > 0 ? extractedPages / pageCount : 0
    const ocrCandidateRatio = pageCount > 0 ? ocrCandidateCount / pageCount : 0
    const mixedOcrThreshold = pageCount > 0
      ? Math.max(2, Math.ceil(pageCount * PDF_MIXED_OCR_PAGE_RATIO))
      : 0
    const hasDocumentText = usefulTextChars >= PDF_MIN_DOCUMENT_TEXT_CHARS && extractedPages > 0
    const isScannedLike = pageCount > 0 && !hasDocumentText
    const isMixedNeedsOcr = pageCount > 0 && hasDocumentText && ocrCandidateCount >= mixedOcrThreshold
    const pdfTextMode = isScannedLike
      ? 'scanned_or_image'
      : (isMixedNeedsOcr ? 'mixed_needs_ocr' : (ocrCandidateCount > 0 ? 'text_with_partial_gaps' : 'text'))

    if (isScannedLike || isMixedNeedsOcr) {
      return pdfNeedsOcrResult(
        isMixedNeedsOcr
          ? '该 PDF 部分页缺少可提取文本，属于混合型 PDF，需要 OCR/版面解析补齐。'
          : (failedPages || readErrors.length
              ? 'PDF 页面文本提取失败，可能需要 OCR/版面解析。'
              : '该 PDF 没有提取到有效文本，可能是扫描件，需要 OCR 解析。'),
        {
          pageCount,
          chars: textChars,
          usefulChars: usefulTextChars,
          extractedPages,
          emptyPages,
          thinTextPages,
          failedPages,
          unreadPages,
          textPages: textPages.slice(0, 100),
          ocrCandidatePages: uniqueOcrCandidatePages.slice(0, 100),
          ocrCandidateCount,
          textCoverageRatio,
          ocrCandidateRatio,
          pdfTextMode,
          pageErrors: pageErrors.slice(0, 20),
          readErrors: readErrors.slice(0, 5),
        },
      )
    }

    const body = [
      `# ${title || path.basename(filePath)}`,
      '',
      `PDF pages: ${first.pageCount || 0}`,
      '',
      '## Extracted Text',
      '',
      ...chunks,
    ].join('\n')

    return {
      success: true,
      format: 'pdf',
      content: body,
      stats: {
        parser: 'pypdf',
        pageCount: first.pageCount || 0,
        chunks: chunks.length,
        chars: body.length,
        usefulChars: usefulTextChars,
        extractedPages,
        emptyPages,
        thinTextPages,
        failedPages,
        unreadPages,
        textPages: textPages.slice(0, 100),
        ocrCandidatePages: uniqueOcrCandidatePages.slice(0, 100),
        ocrCandidateCount,
        textCoverageRatio,
        ocrCandidateRatio,
        pdfTextMode,
        pageErrors: pageErrors.slice(0, 20),
        readErrors: readErrors.slice(0, 5),
        partial: ocrCandidateCount > 0 || failedPages > 0 || readErrors.length > 0,
        truncated: (first.pageCount || 0) > PDF_MAX_PAGES,
      },
    }
  }
}
