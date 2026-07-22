export const PDF_READ_SETTINGS_KEY = 'pdfReadStrategy'

export const DEFAULT_PDF_READ_SETTINGS = {
  version: 1,
  pdfEngine: 'auto',
  uploadAction: 'ask',
  defaultOcrProvider: 'auto',
  missingPythonFallback: 'ocr_provider',
  largePdfMode: 'adaptive',
  allowFullDocumentOcr: true,
  allowPaddleFullDocumentForPageRanges: true,
  mediaAction: 'ask',
  mediaPreset: 'subtitle_first',
  mediaPreferredLanguage: 'auto',
  mediaProviderId: 'auto',
  mediaPreferSubtitle: true,
  mediaExtractKeyframes: false,
  mediaKeyframeLimit: 12,
}

const ENUMS = {
  pdfEngine: new Set(['auto', 'local_fast', 'document_intelligent']),
  uploadAction: new Set(['ask', 'preflight', 'full', 'none']),
  defaultOcrProvider: null,
  missingPythonFallback: new Set(['ocr_provider', 'prompt', 'error']),
  largePdfMode: new Set(['adaptive', 'full_document']),
  mediaAction: new Set(['manual', 'ask', 'low_cost_auto']),
  mediaPreset: new Set(['subtitle_first', 'standard', 'transcript_only', 'keyframe_enhanced', 'local_private']),
  mediaPreferredLanguage: new Set(['auto', 'zh', 'en', 'ja']),
  mediaProviderId: new Set(['auto', 'local_asr', 'openai_whisper_compatible', 'aliyun_bailian_asr']),
}

function enumValue(value, fallback, allowed) {
  const normalized = String(value || '').trim()
  if (!allowed) return normalized || fallback
  return allowed.has(normalized) ? normalized : fallback
}

function normalizePdfEngine(value) {
  const raw = String(value || '').trim()
  if (raw === 'document_ocr_first') return 'document_intelligent'
  if (raw === 'text_layer_first') return 'local_fast'
  return enumValue(raw, DEFAULT_PDF_READ_SETTINGS.pdfEngine, ENUMS.pdfEngine)
}

export function normalizePdfReadSettings(value = {}) {
  const raw = value && typeof value === 'object' ? value : {}
  return {
    ...DEFAULT_PDF_READ_SETTINGS,
    ...raw,
    version: 1,
    pdfEngine: normalizePdfEngine(raw.pdfEngine),
    uploadAction: enumValue(raw.uploadAction, DEFAULT_PDF_READ_SETTINGS.uploadAction, ENUMS.uploadAction),
    defaultOcrProvider: enumValue(raw.defaultOcrProvider, DEFAULT_PDF_READ_SETTINGS.defaultOcrProvider, ENUMS.defaultOcrProvider),
    missingPythonFallback: enumValue(raw.missingPythonFallback, DEFAULT_PDF_READ_SETTINGS.missingPythonFallback, ENUMS.missingPythonFallback),
    largePdfMode: enumValue(raw.largePdfMode, DEFAULT_PDF_READ_SETTINGS.largePdfMode, ENUMS.largePdfMode),
    mediaAction: enumValue(raw.mediaAction, DEFAULT_PDF_READ_SETTINGS.mediaAction, ENUMS.mediaAction),
    mediaPreset: enumValue(raw.mediaPreset, DEFAULT_PDF_READ_SETTINGS.mediaPreset, ENUMS.mediaPreset),
    mediaPreferredLanguage: enumValue(raw.mediaPreferredLanguage, DEFAULT_PDF_READ_SETTINGS.mediaPreferredLanguage, ENUMS.mediaPreferredLanguage),
    mediaProviderId: enumValue(raw.mediaProviderId, DEFAULT_PDF_READ_SETTINGS.mediaProviderId, ENUMS.mediaProviderId),
    mediaPreferSubtitle: raw.mediaPreferSubtitle !== false,
    mediaExtractKeyframes: raw.mediaExtractKeyframes === true,
    mediaKeyframeLimit: Math.min(60, Math.max(4, Math.trunc(Number(raw.mediaKeyframeLimit) || DEFAULT_PDF_READ_SETTINGS.mediaKeyframeLimit))),
    allowFullDocumentOcr: raw.allowFullDocumentOcr !== false,
    allowPaddleFullDocumentForPageRanges: raw.allowPaddleFullDocumentForPageRanges !== false,
  }
}

export function readPdfReadSettings(dbService) {
  try {
    return normalizePdfReadSettings(dbService?.getSetting?.(PDF_READ_SETTINGS_KEY) || {})
  } catch {
    return normalizePdfReadSettings()
  }
}
