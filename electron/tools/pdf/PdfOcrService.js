import crypto from 'node:crypto'
import { OcrProviderRunner } from '../../wiki/OcrProviderRunner.js'
import { pagesToRanges } from './PdfTypes.js'
import { normalizePdfReadSettings } from './PdfReadSettings.js'

function parseJson(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key])
      return acc
    }, {})
  }
  return value
}

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function rangesToProviderString(ranges = []) {
  return ranges
    .map(range => {
      const start = Math.max(Number(range.startPage || range.start || 0), 1)
      const end = Math.max(Number(range.endPage || range.end || start), start)
      return start === end ? String(start) : `${start}-${end}`
    })
    .filter(Boolean)
    .join(',')
}

function hasOcrContent(result = {}) {
  const pages = Array.isArray(result.pages) ? result.pages : []
  if (pages.some(page => (
    String(page?.text || '').trim()
    || (Array.isArray(page?.blocks) && page.blocks.length)
    || (page?.images && Object.keys(page.images).length)
  ))) {
    return true
  }
  return !!String(result.text || result.rawText || '').trim()
}

function isUsableProvider(provider, supported) {
  return !!provider
    && !!provider.enabled
    && !!String(provider.base_url || '').trim()
    && !!String(provider.api_key_ref || '').trim()
    && supported.has(String(provider.type || '').toLowerCase())
}

export class PdfOcrService {
  constructor({ dbService = null, cache = null, settings = {} } = {}) {
    this._db = dbService
    this._cache = cache
    this._settings = normalizePdfReadSettings(settings)
    this._runner = new OcrProviderRunner()
  }

  selectProvider(providerId = '', { fallbackToAuto = false } = {}) {
    const supported = new Set(['mineru', 'paddleocr'])
    const providers = this._db?.listOcrProviders?.() || []
    const autoProvider = () => providers.find(item => isUsableProvider(item, supported) && String(item.type || '').toLowerCase() === 'mineru')
      || providers.find(item => isUsableProvider(item, supported) && String(item.type || '').toLowerCase() === 'paddleocr')
      || null
    if (providerId && providerId !== 'auto') {
      const provider = this._db?.getOcrProvider?.(providerId)
      if (!isUsableProvider(provider, supported) && fallbackToAuto) {
        const fallback = autoProvider()
        if (fallback) return { provider: fallback, fallbackFromProviderId: providerId }
      }
      if (!provider) return { error: 'PDF_OCR_PROVIDER_NOT_CONFIGURED', message: '指定的 OCR provider 不存在。' }
      if (!provider.enabled) return { error: 'PDF_OCR_PROVIDER_DISABLED', message: '指定的 OCR provider 未启用。' }
      if (!String(provider.base_url || '').trim() || !String(provider.api_key_ref || '').trim()) return { error: 'PDF_OCR_PROVIDER_NOT_CONFIGURED', message: '指定的 OCR provider 尚未配置完整 URL/API Key。' }
      if (!supported.has(String(provider.type || '').toLowerCase())) {
        return { error: 'PDF_OCR_PROVIDER_NOT_CONFIGURED', message: '当前 PDF OCR 仅支持 MinerU 和 PaddleOCR。' }
      }
      return { provider }
    }
    const provider = autoProvider()
    if (!provider) return { error: 'PDF_OCR_PROVIDER_NOT_CONFIGURED', message: '请先在设置中配置并启用 MinerU 或 PaddleOCR。' }
    return { provider }
  }

  profileKey(provider, { pages = [], ranges = [] } = {}) {
    const config = parseJson(provider?.config || provider?.config_json, {})
    return `ocr_${sha({
      providerId: provider?.id || '',
      providerType: provider?.type || '',
      mode: provider?.mode || '',
      baseUrl: provider?.base_url || '',
      config,
      pages,
      ranges,
    }).slice(0, 16)}`
  }

  async run({ doc, inputPath, providerId = 'auto', allowProviderFallback = false, pages = [], ranges = [], sourceInfo = {} } = {}) {
    const selected = this.selectProvider(providerId, { fallbackToAuto: allowProviderFallback })
    if (selected.error) {
      return { success: false, code: selected.error, message: selected.message }
    }
    const provider = selected.provider
    const providerType = String(provider.type || '').toLowerCase()
    const requestedRanges = ranges.length ? ranges : pagesToRanges(pages)
    let effectivePages = pages
    let effectiveRanges = requestedRanges
    let fullDocumentFallback = false
    if (requestedRanges.length && providerType === 'paddleocr') {
      if (!this._settings.allowPaddleFullDocumentForPageRanges) {
        return {
          success: false,
          code: 'PDF_OCR_PAGE_RANGE_UNSUPPORTED',
          message: '当前 PaddleOCR 配置不支持只解析指定页段。请改用全文解析、启用全文兜底，或切换 MinerU。',
          requestedRanges,
        }
      }
      effectivePages = []
      effectiveRanges = []
      fullDocumentFallback = true
    }
    const ocrProfileKey = this.profileKey(provider, { pages: effectivePages, ranges: effectiveRanges })
    const existing = await this._cache?.readOcrManifest?.(doc, ocrProfileKey)
    if (existing?.status === 'complete') {
      return { success: true, cacheHit: true, ocrProfileKey, manifest: existing, provider }
    }

    const run = this._cache?.createParseRun?.({
      pdf_id: doc.id,
      mode: 'ocr',
      provider_id: provider.id,
      provider_type: provider.type,
      ocr_profile_key: ocrProfileKey,
      page_ranges_json: effectiveRanges,
      status: 'running',
      progress: 5,
    })

    try {
      const runProvider = { ...provider }
      if (effectiveRanges.length && providerType === 'mineru') {
        runProvider.config = {
          ...parseJson(provider.config || provider.config_json, {}),
          page_ranges: rangesToProviderString(effectiveRanges),
        }
      }
      const result = await this._runner.run({
        provider: runProvider,
        inputPath,
        outputDir: this._cache.ocrRoot(doc, ocrProfileKey),
        cacheDir: this._cache.ocrRoot(doc, ocrProfileKey),
        source: {
          id: sourceInfo?.id || doc.id,
          title: sourceInfo?.title || doc.fileName,
        },
      })
      if (!hasOcrContent(result)) {
        const error = new Error('OCR provider returned no readable pages or text.')
        error.code = 'PDF_OCR_EMPTY_RESULT'
        throw error
      }
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
>>>>>>> dev
      if (run?.id && !this._cache?.isParseRunWritable?.(run.id)) {
        await this._cache?.removeOcrProfile?.(doc, ocrProfileKey)
        return {
          success: false,
          code: 'PDF_OPERATION_CANCELLED',
          message: 'PDF 已移入回收站或被删除，本次 OCR 结果未保存。',
        }
      }
<<<<<<< HEAD
>>>>>>> dev
=======
>>>>>>> dev
      const manifest = await this._cache.writeOcrResult(doc, ocrProfileKey, result, {
        provider,
        ranges: effectiveRanges,
        requestedRanges,
        fullDocumentFallback,
      })
      if (run?.id) this._cache.updateParseRun(run.id, { status: 'completed', progress: 100, output_path: `context/pdf/${doc.id}/ocr/${ocrProfileKey}/manifest.json`, metrics_json: result.metrics || {} })
      return { success: true, cacheHit: false, ocrProfileKey, manifest, result, provider }
    } catch (err) {
      const code = err.code || 'PDF_OCR_FAILED'
<<<<<<< HEAD
<<<<<<< HEAD
=======
      if (code === 'PDF_SOURCE_INACTIVE' || code === 'PDF_OPERATION_CANCELLED') {
        await this._cache?.removeOcrProfile?.(doc, ocrProfileKey)
      }
>>>>>>> dev
=======
      if (code === 'PDF_SOURCE_INACTIVE' || code === 'PDF_OPERATION_CANCELLED') {
        await this._cache?.removeOcrProfile?.(doc, ocrProfileKey)
      }
>>>>>>> dev
      if (run?.id) this._cache.updateParseRun(run.id, { status: 'failed', progress: 100, error_code: code, error_message: err.message || 'OCR failed' })
      return { success: false, code, message: code === 'PDF_OCR_EMPTY_RESULT' ? 'PDF OCR 未返回可读取内容。' : 'PDF OCR 失败。', detail: err.message || '' }
    }
  }
}
