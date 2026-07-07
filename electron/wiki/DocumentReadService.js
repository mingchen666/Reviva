import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../officeCliResolver.js'
import { getSystemEnv } from '../systemEnv.js'
import { extractOfficeImages } from '../tools/officecli/OfficeImageExtractor.js'
import { detectPdfTextMode } from '../tools/pdf/PdfNeedOcrDetector.js'

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
    import fitz
except Exception as exc:
    print(json.dumps({"success": False, "code": "PYMUPDF_NOT_INSTALLED", "detail": str(exc)}, ensure_ascii=False))
    raise SystemExit(2)

def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)

try:
    req = json.load(sys.stdin)
    file_path = req.get("path")
    start_page = max(int(req.get("startPage") or 1), 1)
    max_pages = min(max(int(req.get("maxPages") or 10), 1), 50)

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
    metadata = {}
    try:
        for key, value in dict(doc.metadata or {}).items():
            metadata[str(key).lstrip("/")] = "" if value is None else str(value)
    except Exception:
        metadata = {}

    start_index = min(start_page - 1, page_count)
    end_index = min(page_count, start_index + max_pages)
    pages = []
    for index in range(start_index, end_index):
        try:
            text = doc.load_page(index).get_text("text") or ""
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
        "parser": "pymupdf",
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
      parser: 'pymupdf',
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
      env: { ...(await getSystemEnv()), PYTHONIOENCODING: 'utf-8' },
      timeoutMs: 60000,
      label: candidate.label,
    })
    const parsed = parseJsonLike(result.stdout, result.stderr).data
    if (result.code === 127) {
      lastNotFound = result
      continue
    }
    if (parsed?.code === 'PYMUPDF_NOT_INSTALLED' || parsed?.code === 'PYPDF_NOT_INSTALLED') {
      lastMissing = parsed
      continue
    }
    if (parsed) return parsed
    return { success: false, code: result.code === 124 ? 'PDF_READ_TIMEOUT' : 'PDF_READ_FAILED', detail: (result.stderr || result.stdout || '').slice(0, 1200) }
  }
  if (lastMissing) return { success: false, code: 'PYMUPDF_NOT_INSTALLED', detail: lastMissing.detail || '' }
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
        asset_cache_hits: imageResult.cache?.hits || 0,
        asset_cache_misses: imageResult.cache?.misses || 0,
      },
    }
  }

  async _extractOfficeImages(filePath, { sourceId = '', imageOutputDir = '', imageOutputRelDir = '' } = {}) {
    const result = await extractOfficeImages(filePath, {
      sourceId,
      outputDir: imageOutputDir,
      outputRelDir: imageOutputRelDir,
      maxImages: OFFICE_MAX_IMAGES,
    })
    return { assets: result.assets, errors: result.errors, cache: result.cache }
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
      const message = (code === 'PYMUPDF_NOT_INSTALLED' || code === 'PYPDF_NOT_INSTALLED')
        ? '读取 PDF 需要 Python 包 PyMuPDF。请先在文档解析设置中自动安装，或到设置 > 环境检测中修复 Python 环境。'
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
    const detectedPages = []

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
        detectedPages.push(page)
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

    const sharedStats = detectPdfTextMode({ pages: detectedPages, pageCount, readErrors })
    textChars = sharedStats.chars
    usefulTextChars = sharedStats.usefulChars
    extractedPages = sharedStats.extractedPages
    emptyPages = sharedStats.emptyPages
    thinTextPages = sharedStats.thinTextPages
    failedPages = sharedStats.failedPages
    const unreadPages = sharedStats.unreadPages
    const uniqueOcrCandidatePages = sharedStats.ocrCandidatePages || []
    const ocrCandidateCount = sharedStats.ocrCandidateCount
    const textCoverageRatio = sharedStats.textCoverageRatio
    const ocrCandidateRatio = sharedStats.ocrCandidateRatio
    const pdfTextMode = sharedStats.pdfTextMode
    const isScannedLike = pdfTextMode === 'scanned_or_image'
    const isMixedNeedsOcr = pdfTextMode === 'mixed_needs_ocr'

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
        parser: first.parser || 'pymupdf',
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
