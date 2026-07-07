import {
  PDF_MIN_DOCUMENT_TEXT_CHARS,
  PDF_MIXED_OCR_PAGE_RATIO,
  PDF_TEXT_MODES,
  PDF_TEXT_PAGE_MIN_CHARS,
} from './PdfTypes.js'

export function usefulPdfTextLength(value) {
  return String(value || '').replace(/\s+/g, '').length
}

export function detectPdfTextMode({ pages = [], pageCount = 0, readErrors = [] } = {}) {
  const totalPages = Math.max(Number(pageCount) || pages.length || 0, 0)
  let usefulTextChars = 0
  let textChars = 0
  let extractedPages = 0
  let emptyPages = 0
  let thinTextPages = 0
  let failedPages = 0
  const textPages = []
  const ocrCandidatePages = []
  const pageErrors = []

  for (const rawPage of pages || []) {
    const pageNo = Math.max(Number(rawPage?.page || 0), 1)
    if (rawPage?.ok === false || rawPage?.error) {
      failedPages += 1
      pageErrors.push({ page: pageNo, error: String(rawPage.error || '').slice(0, 240) })
      ocrCandidatePages.push(pageNo)
      continue
    }

    const text = String(rawPage?.text || '').trim()
    const usefulLength = usefulPdfTextLength(text)
    textChars += text.length
    usefulTextChars += usefulLength

    if (usefulLength >= PDF_TEXT_PAGE_MIN_CHARS) {
      extractedPages += 1
      textPages.push(pageNo)
    } else if (usefulLength > 0) {
      thinTextPages += 1
      ocrCandidatePages.push(pageNo)
    } else {
      emptyPages += 1
      ocrCandidatePages.push(pageNo)
    }
  }

  const unreadPages = readErrors?.[0]?.startPage
    ? Math.max(totalPages - Number(readErrors[0].startPage) + 1, 0)
    : 0
  const uniqueOcrCandidatePages = [...new Set(ocrCandidatePages)].sort((a, b) => a - b)
  const ocrCandidateCount = uniqueOcrCandidatePages.length + unreadPages
  const textCoverageRatio = totalPages > 0 ? extractedPages / totalPages : 0
  const ocrCandidateRatio = totalPages > 0 ? ocrCandidateCount / totalPages : 0
  const mixedOcrThreshold = totalPages > 0
    ? Math.max(2, Math.ceil(totalPages * PDF_MIXED_OCR_PAGE_RATIO))
    : 0
  const hasDocumentText = usefulTextChars >= PDF_MIN_DOCUMENT_TEXT_CHARS && extractedPages > 0
  const isScannedLike = totalPages > 0 && !hasDocumentText
  const isMixedNeedsOcr = totalPages > 0 && hasDocumentText && ocrCandidateCount >= mixedOcrThreshold
  const pdfTextMode = isScannedLike
    ? PDF_TEXT_MODES.SCANNED_OR_IMAGE
    : (isMixedNeedsOcr
        ? PDF_TEXT_MODES.MIXED_NEEDS_OCR
        : (ocrCandidateCount > 0 ? PDF_TEXT_MODES.TEXT_WITH_PARTIAL_GAPS : PDF_TEXT_MODES.TEXT))

  return {
    pageCount: totalPages,
    chars: textChars,
    usefulChars: usefulTextChars,
    extractedPages,
    emptyPages,
    thinTextPages,
    failedPages,
    unreadPages,
    textPages: textPages.slice(0, 200),
    ocrCandidatePages: uniqueOcrCandidatePages.slice(0, 500),
    ocrCandidateCount,
    textCoverageRatio,
    ocrCandidateRatio,
    pdfTextMode,
    pageErrors: pageErrors.slice(0, 50),
    readErrors: (readErrors || []).slice(0, 10),
    needsOcr: [
      PDF_TEXT_MODES.MIXED_NEEDS_OCR,
      PDF_TEXT_MODES.SCANNED_OR_IMAGE,
    ].includes(pdfTextMode),
    partial: ocrCandidateCount > 0 || failedPages > 0 || (readErrors || []).length > 0,
  }
}

export function buildPdfRecommendation(stats = {}, { mode = 'overview', startPage = 1, maxPages = 5 } = {}) {
  const pdfTextMode = stats.pdfTextMode || PDF_TEXT_MODES.TEXT
  if (pdfTextMode === PDF_TEXT_MODES.TEXT) {
    return {
      action: 'read_text',
      reason: '该 PDF 有可提取文本层。',
      next: { mode: 'text', startPage, maxPages },
    }
  }
  if (pdfTextMode === PDF_TEXT_MODES.TEXT_WITH_PARTIAL_GAPS) {
    return {
      action: 'read_text_then_optional_ocr',
      reason: '该 PDF 大部分可读，但少量页面缺少文本层。',
      pages: stats.ocrCandidatePages || [],
      next: { mode: 'text', startPage, maxPages },
    }
  }
  if (pdfTextMode === PDF_TEXT_MODES.MIXED_NEEDS_OCR) {
    return {
      action: 'ocr_candidate_pages',
      reason: '该 PDF 是混合型文档，建议优先 OCR 缺失或薄文本页面。',
      pages: stats.ocrCandidatePages || [],
    }
  }
  return {
    action: mode === 'ocr' ? 'ocr_in_ranges' : 'ask_or_run_ocr',
    reason: '该 PDF 疑似扫描件或图片型 PDF，需要 OCR/版面解析后才能稳定问答。',
    ranges: [{ startPage: 1, endPage: Math.min(Number(stats.pageCount) || maxPages, Math.max(maxPages, 1)) }],
  }
}
