import path from 'node:path'
import {
  clampInt,
  normalizePageList,
  pageRangePages,
  pdfError,
  PDF_DEFAULT_MAX_CHARS,
  PDF_DEFAULT_MAX_PAGES,
  PDF_ERROR_CODES,
  PDF_MAX_CHARS,
  PDF_MAX_PAGES,
  PDF_OVERVIEW_SCAN_PAGES,
  PDF_TEXT_MODES,
} from './PdfTypes.js'
import { buildPdfRecommendation, detectPdfTextMode, usefulPdfTextLength } from './PdfNeedOcrDetector.js'
import { PdfCache } from './PdfCache.js'
import { PdfImageExtractor } from './PdfImageExtractor.js'
import { PdfOcrService } from './PdfOcrService.js'
import { readPdfReadSettings } from './PdfReadSettings.js'
import { PdfTextExtractor } from './PdfTextExtractor.js'

const PDF_DEFAULT_MAX_IMAGES = 50
const PDF_MAX_IMAGES = 200

function compact(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function truncateText(value, maxChars) {
  const text = String(value || '')
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars), truncated: true }
}

function pagesToMarkdown(pages = []) {
  return pages
    .sort((a, b) => Number(a.page) - Number(b.page))
    .map(page => {
      const text = page.ok === false || page.error
        ? `[Text extraction failed; OCR/layout parsing is required for this page: ${compact(page.error, 200)}]`
        : String(page.text || '').trim()
      return `## Page ${page.page}\n${text || '[No extractable text]'}`
    })
    .join('\n\n')
}

function safeOcrPages(stats, { startPage, maxPages, pages, confirmFull, fullDocument }) {
  const explicit = normalizePageList(pages, stats.pageCount)
  if (explicit.length) return { pages: explicit, explicit: true }
  if (fullDocument) return { pages: [], explicit: false, fullDocument: true }
  if (stats.pdfTextMode === PDF_TEXT_MODES.MIXED_NEEDS_OCR || stats.pdfTextMode === PDF_TEXT_MODES.TEXT_WITH_PARTIAL_GAPS) {
    const candidates = normalizePageList(stats.ocrCandidatePages || [], stats.pageCount)
    if (candidates.length && (confirmFull || candidates.length <= maxPages)) return { pages: candidates, explicit: false }
    if (candidates.length) return { pages: candidates.slice(0, maxPages), explicit: false, requiresConfirmation: true }
  }
  const rangePages = pageRangePages({ startPage, maxPages, pageCount: stats.pageCount })
  if (stats.pageCount > maxPages && !confirmFull) {
    return { pages: rangePages, explicit: false, requiresConfirmation: true }
  }
  return { pages: rangePages, explicit: false }
}

export class PdfReadService {
  constructor({ workDirService = null, dbService = null } = {}) {
    this._settings = readPdfReadSettings(dbService)
    this._cache = new PdfCache({ workDirService, dbService })
    this._textExtractor = new PdfTextExtractor()
    this._ocr = new PdfOcrService({ dbService, cache: this._cache, settings: this._settings })
    this._images = new PdfImageExtractor()
  }

  async read(input = {}) {
    const mode = input.mode || 'overview'
    const maxChars = clampInt(input.maxChars, PDF_DEFAULT_MAX_CHARS, 1000, PDF_MAX_CHARS)
    const maxPages = clampInt(input.maxPages, PDF_DEFAULT_MAX_PAGES, 1, PDF_MAX_PAGES)
    const startPage = clampInt(input.startPage, 1, 1, Number.MAX_SAFE_INTEGER)
    const maxImages = clampInt(input.maxImages, PDF_DEFAULT_MAX_IMAGES, 1, PDF_MAX_IMAGES)
    const doc = await this._cache.documentFor(input.inputPath, {
      virtualPath: input.virtualPath,
      sourceInfo: input.sourceInfo || {},
    })

    if (mode === 'metadata') return this.metadata(doc, input)
    if (mode === 'text') return this.text(doc, { ...input, startPage, maxPages, maxChars })
    if (mode === 'ocr') return this.ocr(doc, { ...input, startPage, maxPages, maxChars })
    if (mode === 'layout') return this.layout(doc, { ...input, startPage, maxPages, maxChars })
    if (mode === 'page') return this.page(doc, { ...input, startPage, maxPages, maxChars })
    if (mode === 'images') return this.images(doc, { ...input, startPage, maxPages, maxChars, maxImages })
    return this.overview(doc, { ...input, startPage, maxPages, maxChars })
  }

  async ensureOverview(doc, { maxChars = PDF_DEFAULT_MAX_CHARS, force = false } = {}) {
    const cached = !force ? await this._cache.readOverview(doc) : null
    if (cached) return { ...cached, cacheHit: true }

    const run = this._cache.createParseRun({
      pdf_id: doc.id,
      mode: 'overview',
      status: 'running',
      progress: 5,
    })
    const extracted = await this._textExtractor.readAll(doc.realPath, {
      chunkPages: 10,
      maxPages: PDF_OVERVIEW_SCAN_PAGES,
    })
    if (!extracted.success) {
      if (run?.id) {
        this._cache.updateParseRun(run.id, {
          status: 'failed',
          progress: 100,
          error_code: this._mapTextError(extracted.code),
          error_message: extracted.message || extracted.detail || 'PDF 文本层读取失败。',
        })
      }
      return pdfError(this._mapTextError(extracted.code), extracted.message || 'PDF 文本层读取失败。', {
        detail: extracted.detail,
        via: extracted.via,
      })
    }

    if (run?.id && !this._cache.isParseRunWritable(run.id)) {
      return pdfError('PDF_OPERATION_CANCELLED', 'PDF 已移入回收站或被删除，本次解析结果未保存。')
    }

    await this._cache.mergeTextPages(doc, extracted.pages || [], {
      pageCount: extracted.pageCount || 0,
      encrypted: extracted.encrypted || false,
      metadata: extracted.metadata || {},
      parser: extracted.parser || 'pymupdf',
      scannedPages: extracted.scannedPages || 0,
      truncatedScan: extracted.truncatedScan || false,
      readErrors: extracted.readErrors || [],
    })
    const stats = detectPdfTextMode({
      pages: extracted.pages || [],
      pageCount: extracted.pageCount || 0,
      readErrors: extracted.readErrors || [],
    })
    const previewPages = (extracted.pages || []).slice(0, 3)
    const preview = truncateText(pagesToMarkdown(previewPages), maxChars)
    const overview = {
      success: true,
      mode: 'overview',
      pdfId: doc.id,
      path: doc.virtualPath,
      cachePath: `/${doc.cachePath}`,
      pageCount: extracted.pageCount || 0,
      encrypted: extracted.encrypted || false,
      metadata: extracted.metadata || {},
      parser: extracted.parser || 'pymupdf',
      content: preview.text,
      truncated: preview.truncated,
      scannedPages: extracted.scannedPages || 0,
      truncatedScan: extracted.truncatedScan || false,
      ...stats,
      recommendation: buildPdfRecommendation(stats, { mode: 'overview', startPage: 1, maxPages: PDF_DEFAULT_MAX_PAGES }),
      next: { mode: 'text', startPage: 1, maxPages: PDF_DEFAULT_MAX_PAGES, maxChars },
      cacheHit: false,
    }
    await this._cache.writeOverview(doc, overview)
    if (run?.id) {
      this._cache.updateParseRun(run.id, {
        status: 'completed',
        progress: 100,
        output_path: `${doc.cachePath}/text/overview.json`,
        metrics_json: {
          pageCount: overview.pageCount || 0,
          pdfTextMode: overview.pdfTextMode || '',
          scannedPages: overview.scannedPages || 0,
          textCoverageRatio: overview.textCoverageRatio || 0,
        },
      })
    }
    return overview
  }

  async overview(doc, input) {
    return this.ensureOverview(doc, input)
  }

  async metadata(doc, input = {}) {
    const cached = await this._cache.readOverview(doc)
    const ocrManifests = await this._cache.listOcrManifests(doc)
    const completeOcrManifests = ocrManifests.filter(item => item.status === 'complete')
    if (cached) {
      return {
        success: true,
        mode: 'metadata',
        pdfId: doc.id,
        path: doc.virtualPath,
        cachePath: `/${doc.cachePath}`,
        pageCount: cached.pageCount || 0,
        encrypted: cached.encrypted || false,
        metadata: cached.metadata || {},
        pdfTextMode: cached.pdfTextMode || '',
        ocrManifestCount: completeOcrManifests.length,
        latestOcrProfileKey: completeOcrManifests[0]?.ocrProfileKey || '',
        processingStatus: completeOcrManifests.length
          ? 'ocr_ready'
          : (cached.pdfTextMode ? 'overview_ready' : 'pending'),
        cacheHit: true,
      }
    }
    if (input.probe === false) {
      return {
        success: true,
        mode: 'metadata',
        pdfId: doc.id,
        path: doc.virtualPath,
        cachePath: `/${doc.cachePath}`,
        pageCount: 0,
        pdfTextMode: '',
        ocrManifestCount: completeOcrManifests.length,
        latestOcrProfileKey: completeOcrManifests[0]?.ocrProfileKey || '',
        processingStatus: completeOcrManifests.length ? 'ocr_ready' : 'pending',
        cacheHit: true,
      }
    }
    const extracted = await this._textExtractor.readPages(doc.realPath, { startPage: 1, maxPages: 1 })
    if (!extracted.success) {
      return pdfError(this._mapTextError(extracted.code), extracted.message || 'PDF 元数据读取失败。', {
        detail: extracted.detail,
        via: extracted.via,
      })
    }
    await this._cache.mergeTextPages(doc, extracted.pages || [], {
      pageCount: extracted.pageCount || 0,
      encrypted: extracted.encrypted || false,
      metadata: extracted.metadata || {},
      parser: extracted.parser || 'pymupdf',
    })
    return {
      success: true,
      mode: 'metadata',
      pdfId: doc.id,
      path: doc.virtualPath,
      cachePath: `/${doc.cachePath}`,
      pageCount: extracted.pageCount || 0,
      encrypted: extracted.encrypted || false,
      metadata: extracted.metadata || {},
      cacheHit: false,
    }
  }

  async text(doc, { startPage, maxPages, maxChars }) {
    const overview = await this.ensureOverview(doc, { maxChars })
    if (!overview.success) return overview

    const requested = pageRangePages({ startPage, maxPages, pageCount: overview.pageCount })
    const current = await this._cache.readTextPages(doc)
    const byPage = new Map((current.pages || []).map(page => [Number(page.page), page]))
    const missing = requested.filter(page => !byPage.has(page))
    if (missing.length) {
      const extracted = await this._textExtractor.readPages(doc.realPath, {
        startPage: Math.min(...missing),
        maxPages: Math.max(...missing) - Math.min(...missing) + 1,
      })
      if (!extracted.success) {
        return pdfError(this._mapTextError(extracted.code), extracted.message || 'PDF 文本层读取失败。', {
          detail: extracted.detail,
          via: extracted.via,
        })
      }
      const merged = await this._cache.mergeTextPages(doc, extracted.pages || [], {
        pageCount: extracted.pageCount || overview.pageCount || 0,
        encrypted: extracted.encrypted || overview.encrypted || false,
        metadata: extracted.metadata || overview.metadata || {},
        parser: extracted.parser || current.parser || 'pymupdf',
      })
      for (const page of merged.pages || []) byPage.set(Number(page.page), page)
    }

    const pages = requested.map(page => byPage.get(page)).filter(Boolean)
    const stats = detectPdfTextMode({ pages, pageCount: pages.length })
    const rendered = truncateText(pagesToMarkdown(pages), maxChars)
    const endPage = requested.length ? requested[requested.length - 1] : startPage
    const nextPage = endPage < (overview.pageCount || 0) ? endPage + 1 : null
    const noUsefulText = pages.length > 0 && pages.every(page => usefulPdfTextLength(page?.text || '') < 1)
    if (noUsefulText) {
      return pdfError(PDF_ERROR_CODES.NEEDS_OCR, '该页段没有可提取文本，建议使用 OCR/版面解析。', {
        path: doc.virtualPath,
        pdfId: doc.id,
        startPage,
        endPage,
        stats,
        nextAction: '调用 pdf_read(mode="ocr") 处理相关页面，或让用户确认是否进行 OCR。',
      })
    }
    return {
      success: true,
      mode: 'text',
      pdfId: doc.id,
      path: doc.virtualPath,
      cachePath: `/${doc.cachePath}`,
      pageCount: overview.pageCount || 0,
      startPage,
      endPage,
      content: rendered.text,
      truncated: rendered.truncated,
      pageStats: stats,
      cacheHit: missing.length === 0,
      next: nextPage ? { mode: 'text', startPage: nextPage, maxPages, maxChars } : null,
    }
  }

  async ocr(doc, { pages = [], startPage, maxPages, provider = 'auto', confirmFull = false, fullDocument = false, explicitPageSelection = false, sourceInfo = {} }) {
    if (this._settings.pdfEngine === 'local_fast' && !confirmFull && !fullDocument) {
      return {
        success: true,
        mode: 'ocr',
        pdfId: doc.id,
        path: doc.virtualPath,
        status: 'needs_confirmation',
        message: '当前 PDF 策略为本地快速解析，不会静默执行 OCR/文档智能解析。若用户明确需要扫描页、图片、表格、公式或版面内容，请确认后再执行 OCR。',
        recommendation: {
          action: 'confirm_ocr',
          reason: '本地快速解析只读取文本层；OCR 会调用已配置的文档智能解析服务商。',
          pages: normalizePageList(pages, Number.MAX_SAFE_INTEGER),
        },
      }
    }
    const shouldFullDocument = !!fullDocument || (this._settings.largePdfMode === 'full_document' && !explicitPageSelection)
    const serviceFirst = this._settings.pdfEngine === 'document_intelligent'
    const canSkipTextProbe = shouldFullDocument && serviceFirst && !pages?.length
    const overview = canSkipTextProbe
      ? {
          success: true,
          pageCount: 0,
          pdfTextMode: PDF_TEXT_MODES.SCANNED_OR_IMAGE,
          textCoverageRatio: 0,
          ocrCandidatePages: [],
          serviceFirst: true,
        }
      : await this.ensureOverview(doc, {})
    const missingLocalParser = !overview.success && overview.code === PDF_ERROR_CODES.TEXT_DEPENDENCY_MISSING
    const dependencyFallback = missingLocalParser
      && ['ocr_provider', 'prompt'].includes(this._settings.missingPythonFallback)
    if (!overview.success && !dependencyFallback) return overview
    if (dependencyFallback && !confirmFull && !fullDocument) {
      return {
        success: true,
        mode: 'ocr',
        pdfId: doc.id,
        path: doc.virtualPath,
        status: 'needs_confirmation',
        message: this._settings.missingPythonFallback === 'prompt'
          ? '当前环境没有可用的 Python/PyMuPDF，无法先读取 PDF 文本层。请确认是否改用 OCR 服务商解析。'
          : '当前环境没有可用的 Python/PyMuPDF，无法先读取 PDF 文本层。可按设置改用 OCR 服务商解析整份 PDF。',
        recommendation: {
          action: 'ocr_full_document',
          reason: this._settings.missingPythonFallback === 'prompt'
            ? '设置为先提示确认；用户确认后再调用 OCR 服务商。'
            : 'OCR 服务商可直接解析 PDF；建议在文档模块后台执行全文解析后再问答。',
        },
      }
    }
    const effectiveOverview = dependencyFallback
      ? {
          success: true,
          pageCount: 0,
          pdfTextMode: PDF_TEXT_MODES.SCANNED_OR_IMAGE,
          textCoverageRatio: 0,
          ocrCandidatePages: [],
          dependencyFallback: true,
        }
      : overview
    if (effectiveOverview.pdfTextMode === PDF_TEXT_MODES.TEXT && !pages?.length && !confirmFull && !fullDocument) {
      return {
        success: true,
        mode: 'ocr',
        pdfId: doc.id,
        path: doc.virtualPath,
        skipped: true,
        message: '该 PDF 已有可提取文本层，默认不执行 OCR。',
        recommendation: buildPdfRecommendation(effectiveOverview, { mode: 'ocr', startPage, maxPages }),
      }
    }

    if (shouldFullDocument && !this._settings.allowFullDocumentOcr) {
      return {
        success: false,
        code: PDF_ERROR_CODES.PAGE_RANGE_INVALID,
        message: '当前 PDF 策略不允许全文 OCR，请选择页段或在文档设置中启用全文解析。',
      }
    }

    const selected = safeOcrPages(effectiveOverview, { startPage, maxPages, pages, confirmFull, fullDocument: shouldFullDocument })
    if (selected.requiresConfirmation && !confirmFull) {
      return {
        success: true,
        mode: 'ocr',
        pdfId: doc.id,
        path: doc.virtualPath,
        status: 'needs_confirmation',
        message: '该 PDF 需要 OCR，但页数或候选页较多。请根据用户需求确认页段后再执行。',
        recommendation: {
          action: 'ocr_in_ranges',
          reason: '为控制耗时和成本，建议先 OCR 与当前问题相关的页段。',
          pages: selected.pages,
        },
      }
    }

    const explicitProvider = provider && provider !== 'auto'
    const result = await this._ocr.run({
      doc,
      inputPath: doc.realPath,
      providerId: explicitProvider ? provider : (this._settings.defaultOcrProvider || 'auto'),
      allowProviderFallback: !explicitProvider,
      pages: selected.pages,
      sourceInfo,
    })
    if (!result.success) return result
    return {
      success: true,
      mode: 'ocr',
      pdfId: doc.id,
      path: doc.virtualPath,
      cachePath: `/${doc.cachePath}`,
      cacheHit: !!result.cacheHit,
      ocrProfileKey: result.ocrProfileKey,
      provider: {
        id: result.provider?.id || '',
        type: result.provider?.type || '',
        name: result.provider?.name || '',
      },
      manifest: result.manifest,
      next: { mode: 'layout', ocrProfileKey: result.ocrProfileKey, startPage: 1, maxPages: PDF_DEFAULT_MAX_PAGES },
    }
  }

  async layout(doc, { ocrProfileKey = '', startPage = 1, maxPages = PDF_DEFAULT_MAX_PAGES, maxChars }) {
    const manifests = await this._cache.listOcrManifests(doc)
    const requestedPages = pageRangePages({ startPage, maxPages })
    const matchingManifest = !ocrProfileKey
      ? manifests.find(manifest => {
          const manifestPages = new Set((manifest.pages || []).map(page => Number(page.page)))
          return requestedPages.some(page => manifestPages.has(page))
        })
      : null
    const profileKey = ocrProfileKey || matchingManifest?.ocrProfileKey || manifests[0]?.ocrProfileKey || ''
    if (!profileKey) {
      const overview = await this.ensureOverview(doc, {})
      return pdfError(PDF_ERROR_CODES.NEEDS_OCR, '尚未找到 OCR/layout 缓存。', {
        path: doc.virtualPath,
        pdfId: doc.id,
        recommendation: buildPdfRecommendation(overview, { mode: 'layout' }),
        nextAction: '先调用 pdf_read(mode="ocr") 或在文档模块后台执行 OCR/版面解析。',
      })
    }
    const manifest = await this._cache.readOcrManifest(doc, profileKey)
    const pageRefs = (manifest?.pages || [])
      .filter(page => Number(page.page) >= startPage && Number(page.page) < startPage + maxPages)
    if (!pageRefs.length) {
      return pdfError(PDF_ERROR_CODES.NEEDS_OCR, '现有 OCR/layout 缓存不包含请求页段。', {
        path: doc.virtualPath,
        pdfId: doc.id,
        ocrProfileKey: profileKey,
        recommendation: {
          action: 'ocr_in_ranges',
          reason: '请先对当前问题需要的页段执行 OCR/版面解析。',
          pages: requestedPages,
        },
        nextAction: '调用 pdf_read(mode="ocr", pages=[...]) 或 document_read(mode="ocr", pages=[...], confirm=true)。',
      })
    }
    let markdown = pageRefs.length
      ? await this._cache.readOcrMarkdownPages(doc, profileKey, pageRefs)
      : ''
    if (!markdown && startPage === 1 && maxPages >= PDF_MAX_PAGES) {
      markdown = await this._cache.readOcrFullMarkdown(doc, profileKey)
    }
    const rendered = truncateText(markdown, maxChars)
    return {
      success: true,
      mode: 'layout',
      pdfId: doc.id,
      path: doc.virtualPath,
      ocrProfileKey: profileKey,
      manifest,
      content: rendered.text,
      truncated: rendered.truncated,
      cacheHit: true,
    }
  }

  async page(doc, { page, startPage, ocrProfileKey = '' }) {
    const pageNo = clampInt(page, startPage || 1, 1, Number.MAX_SAFE_INTEGER)
    const textResult = await this.text(doc, { startPage: pageNo, maxPages: 1, maxChars: PDF_MAX_CHARS })
    const profileKey = ocrProfileKey || (await this._cache.listOcrManifests(doc))[0]?.ocrProfileKey || ''
    const ocrPage = profileKey ? await this._cache.readOcrPage(doc, profileKey, pageNo) : null
    return {
      success: true,
      mode: 'page',
      pdfId: doc.id,
      path: doc.virtualPath,
      page: pageNo,
      textLayer: textResult.success ? textResult.content : '',
      textStatus: textResult.success ? 'available' : textResult.code,
      ocrProfileKey: profileKey,
      ocr: ocrPage,
      cacheHit: true,
    }
  }

  async images(doc, { startPage = 1, maxPages = PDF_DEFAULT_MAX_PAGES, maxImages = PDF_DEFAULT_MAX_IMAGES } = {}) {
    const embedded = await this._images.listEmbeddedImages(this._cache, doc, { startPage, maxPages, maxImages })
    const ocrManifests = await this._cache.listOcrManifests(doc)
    const ocrAssets = ocrManifests.flatMap(manifest => manifest.assets || [])
    const hasAssets = !!(embedded.images?.length || ocrAssets.length)
    const success = embedded.success !== false || hasAssets
    return {
      success,
      ...(success ? {} : { code: embedded.code || 'PDF_IMAGE_EXTRACT_FAILED', message: embedded.note || 'PDF 图片资源不可用。' }),
      mode: 'images',
      pdfId: doc.id,
      path: doc.virtualPath,
      embedded: embedded.images || [],
      ocrAssets,
      cacheHit: !!embedded.cacheHit,
      embeddedStatus: embedded.success === false ? 'unavailable' : 'ready',
      note: embedded.note,
    }
  }

  _mapTextError(code) {
    if (code === 'PDF_ENCRYPTED') return PDF_ERROR_CODES.ENCRYPTED
    if (code === 'PYMUPDF_NOT_INSTALLED' || code === 'PYPDF_NOT_INSTALLED' || code === 'PYTHON_NOT_FOUND') return PDF_ERROR_CODES.TEXT_DEPENDENCY_MISSING
    return PDF_ERROR_CODES.TEXT_EXTRACT_FAILED
  }
}
