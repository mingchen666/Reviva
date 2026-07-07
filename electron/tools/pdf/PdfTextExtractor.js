import { spawn } from 'node:child_process'
import { getSystemEnv } from '../../systemEnv.js'

const MAX_BUFFER = 8 * 1024 * 1024

const PDF_PYTHON_SCRIPT = String.raw`
import json
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
            page = doc.load_page(index)
            text = page.get_text("text") or ""
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
        "pymupdfVersion": getattr(fitz, "version", [""])[0] if getattr(fitz, "version", None) else ""
    })
except SystemExit:
    raise
except Exception as exc:
    emit({"success": False, "code": "PDF_READ_FAILED", "detail": str(exc)}, 1)
`

const PDF_DEPENDENCY_SCRIPT = String.raw`
import json
import sys
try:
    import fitz
    print(json.dumps({
        "success": True,
        "parser": "pymupdf",
        "pymupdfVersion": getattr(fitz, "version", [""])[0] if getattr(fitz, "version", None) else "",
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
    }, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({
        "success": False,
        "code": "PYMUPDF_NOT_INSTALLED",
        "detail": str(exc),
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
    }, ensure_ascii=False))
    raise SystemExit(2)
`

const PDF_PYTHON_CANDIDATES = [
  { command: 'python', args: [], label: 'python' },
  { command: 'py', args: ['-3'], label: 'py -3' },
  { command: 'py', args: [], label: 'py' },
  { command: 'python3', args: [], label: 'python3' },
]

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

    try {
      if (input) child.stdin.end(input)
      else child.stdin.end()
    } catch (err) {
      finish({ code: 1, stdout: '', stderr: err.message, via: label })
    }
  })
}

export class PdfTextExtractor {
  constructor({ envProvider = getSystemEnv } = {}) {
    this._envProvider = envProvider
  }

  async _pythonEnv(env) {
    let base = env
    if (!base && typeof this._envProvider === 'function') {
      try {
        base = await this._envProvider()
      } catch {
        base = null
      }
    }
    return { ...(base || process.env), PYTHONIOENCODING: 'utf-8' }
  }

  async checkEnvironment({ timeoutMs = 10000, env = null } = {}) {
    let lastMissing = null
    let lastNotFound = null
    let lastFailure = null
    const pythonEnv = await this._pythonEnv(env)
    for (const candidate of PDF_PYTHON_CANDIDATES) {
      const result = await spawnBuffered(candidate.command, [...candidate.args, '-c', PDF_DEPENDENCY_SCRIPT], {
        shell: false,
        env: pythonEnv,
        timeoutMs,
        label: candidate.label,
      })
      const parsed = parseJsonLike(result.stdout, result.stderr)
      if (result.code === 127) {
        lastNotFound = result
        continue
      }
      if (parsed?.success) return { ...parsed, success: true, parser: parsed.parser || 'pymupdf', via: result.via }
      if (parsed?.code === 'PYMUPDF_NOT_INSTALLED' || parsed?.code === 'PYPDF_NOT_INSTALLED') {
        lastMissing = { ...parsed, via: result.via }
        continue
      }
      lastFailure = {
        code: result.code === 124 ? 'PDF_READ_TIMEOUT' : 'PDF_READ_FAILED',
        message: result.code === 124 ? '本地 PDF 文本层检测超时。' : '本地 PDF 文本层检测失败。',
        detail: (result.stderr || result.stdout || '').slice(0, 1200),
        via: result.via,
      }
      if (result.code === 124) break
    }
    if (lastMissing) {
      return {
        success: false,
        code: 'PYMUPDF_NOT_INSTALLED',
        message: '已找到 Python，但当前环境缺少 PyMuPDF。',
        detail: lastMissing.detail || '',
        via: lastMissing.via,
        pythonExecutable: lastMissing.pythonExecutable || '',
        pythonVersion: lastMissing.pythonVersion || '',
      }
    }
    if (lastFailure) {
      return {
        success: false,
        ...lastFailure,
      }
    }
    return {
      success: false,
      code: 'PYTHON_NOT_FOUND',
      message: '未找到可用的 Python。',
      detail: lastNotFound?.stderr || '',
    }
  }

  async readPages(filePath, { startPage = 1, maxPages = 10, timeoutMs = 60000, env = null } = {}) {
    let lastMissing = null
    let lastNotFound = null
    let lastFailure = null
    const pythonEnv = await this._pythonEnv(env)
    for (const candidate of PDF_PYTHON_CANDIDATES) {
      const result = await spawnBuffered(candidate.command, [...candidate.args, '-c', PDF_PYTHON_SCRIPT], {
        input: JSON.stringify({ path: filePath, startPage, maxPages }),
        shell: false,
        env: pythonEnv,
        timeoutMs,
        label: candidate.label,
      })
      const parsed = parseJsonLike(result.stdout, result.stderr)
      if (result.code === 127) {
        lastNotFound = result
        continue
      }
      if (parsed?.code === 'PYMUPDF_NOT_INSTALLED' || parsed?.code === 'PYPDF_NOT_INSTALLED') {
        lastMissing = { ...parsed, via: result.via }
        continue
      }
      if (parsed) return { ...parsed, via: result.via }
      lastFailure = {
        code: result.code === 124 ? 'PDF_READ_TIMEOUT' : 'PDF_READ_FAILED',
        detail: (result.stderr || result.stdout || '').slice(0, 1200),
        via: result.via,
      }
      if (result.code === 124) break
    }
    if (lastMissing) {
      return {
        success: false,
        code: 'PYMUPDF_NOT_INSTALLED',
        message: '已找到 Python，但当前环境缺少 PyMuPDF。',
        detail: lastMissing.detail || '',
        via: lastMissing.via,
        pythonExecutable: lastMissing.pythonExecutable || '',
        pythonVersion: lastMissing.pythonVersion || '',
      }
    }
    if (lastFailure) {
      return {
        success: false,
        ...lastFailure,
      }
    }
    return {
      success: false,
      code: 'PYTHON_NOT_FOUND',
      message: '未找到可用的 Python。',
      detail: lastNotFound?.stderr || '',
    }
  }

  async readAll(filePath, { chunkPages = 10, maxPages = 2000 } = {}) {
    const first = await this.readPages(filePath, { startPage: 1, maxPages: chunkPages })
    if (!first.success) return first
    const pageCount = Math.min(first.pageCount || 0, maxPages)
    const pages = [...(first.pages || [])]
    const readErrors = []
    let cursor = first.nextPage
    while (cursor && cursor <= pageCount) {
      const current = await this.readPages(filePath, { startPage: cursor, maxPages: chunkPages })
      if (!current.success) {
        readErrors.push({
          startPage: cursor,
          code: current.code || 'PDF_READ_FAILED',
          detail: String(current.detail || '').slice(0, 600),
        })
        break
      }
      pages.push(...(current.pages || []))
      cursor = current.nextPage
    }
    return {
      ...first,
      pages,
      readErrors,
      scannedPages: pages.length,
      truncatedScan: (first.pageCount || 0) > pageCount,
    }
  }
}
