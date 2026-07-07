export const PDF_MODES = new Set(['overview', 'text', 'metadata', 'ocr', 'layout', 'page', 'images'])

export const PDF_TEXT_MODES = {
  TEXT: 'text',
  TEXT_WITH_PARTIAL_GAPS: 'text_with_partial_gaps',
  MIXED_NEEDS_OCR: 'mixed_needs_ocr',
  SCANNED_OR_IMAGE: 'scanned_or_image',
}

export const PDF_DEFAULT_MAX_CHARS = 40000
export const PDF_MAX_CHARS = 80000
export const PDF_DEFAULT_MAX_PAGES = 5
export const PDF_MAX_PAGES = 20
export const PDF_OVERVIEW_SCAN_PAGES = 50
export const PDF_TEXT_PAGE_MIN_CHARS = 25
export const PDF_MIN_DOCUMENT_TEXT_CHARS = 40
export const PDF_MIXED_OCR_PAGE_RATIO = 0.35

export const PDF_ERROR_CODES = {
  FILE_NOT_FOUND: 'PDF_FILE_NOT_FOUND',
  PATH_NOT_ALLOWED: 'PDF_PATH_NOT_ALLOWED',
  UNSUPPORTED_FORMAT: 'PDF_UNSUPPORTED_FORMAT',
  ENCRYPTED: 'PDF_ENCRYPTED',
  TEXT_DEPENDENCY_MISSING: 'PDF_TEXT_DEPENDENCY_MISSING',
  TEXT_EXTRACT_FAILED: 'PDF_TEXT_EXTRACT_FAILED',
  NEEDS_OCR: 'PDF_NEEDS_OCR',
  OCR_PROVIDER_NOT_CONFIGURED: 'PDF_OCR_PROVIDER_NOT_CONFIGURED',
  OCR_PROVIDER_DISABLED: 'PDF_OCR_PROVIDER_DISABLED',
  OCR_FAILED: 'PDF_OCR_FAILED',
  OCR_TIMEOUT: 'PDF_OCR_TIMEOUT',
  CACHE_READ_FAILED: 'PDF_CACHE_READ_FAILED',
  CACHE_WRITE_FAILED: 'PDF_CACHE_WRITE_FAILED',
  PAGE_RANGE_INVALID: 'PDF_PAGE_RANGE_INVALID',
}

export function pdfError(code, message, extra = {}) {
  return {
    success: false,
    code,
    message,
    ...extra,
    detail: extra.detail ? String(extra.detail).slice(0, 1200) : extra.detail,
  }
}

export function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

export function normalizePageList(pages, pageCount = 0) {
  if (!Array.isArray(pages)) return []
  const max = Number(pageCount) || Number.MAX_SAFE_INTEGER
  return [...new Set(pages
    .map(page => Math.trunc(Number(page)))
    .filter(page => Number.isFinite(page) && page >= 1 && page <= max))]
    .sort((a, b) => a - b)
}

export function pagesToRanges(pages = []) {
  const sorted = normalizePageList(pages)
  if (!sorted.length) return []
  const ranges = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const page of sorted.slice(1)) {
    if (page === prev + 1) {
      prev = page
      continue
    }
    ranges.push({ startPage: start, endPage: prev })
    start = page
    prev = page
  }
  ranges.push({ startPage: start, endPage: prev })
  return ranges
}

export function pageRangePages({ startPage = 1, maxPages = PDF_DEFAULT_MAX_PAGES, pageCount = 0 } = {}) {
  const start = Math.max(Math.trunc(Number(startPage) || 1), 1)
  const count = Math.max(Math.trunc(Number(maxPages) || PDF_DEFAULT_MAX_PAGES), 1)
  const end = pageCount ? Math.min(pageCount, start + count - 1) : start + count - 1
  const pages = []
  for (let page = start; page <= end; page += 1) pages.push(page)
  return pages
}
