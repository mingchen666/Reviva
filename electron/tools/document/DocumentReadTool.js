import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'langchain'
import { z } from 'zod'
import {
  clampInt,
  PDF_DEFAULT_MAX_CHARS,
  PDF_DEFAULT_MAX_PAGES,
  PDF_ERROR_CODES,
  PDF_MAX_CHARS,
  PDF_MAX_PAGES,
  PDF_MODES,
  PDF_TEXT_MODES,
} from '../pdf/PdfTypes.js'
import { PdfReadService } from '../pdf/PdfReadService.js'

const PDF_EXTS = new Set(['.pdf'])
const OFFICE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const LEGACY_OFFICE_EXTS = new Set(['.doc', '.xls', '.ppt'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'])
const MEDIA_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.mp4', '.mov', '.mkv', '.webm', '.avi'])
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv',
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.css', '.scss', '.less',
  '.html', '.htm', '.xml', '.yaml', '.yml', '.toml', '.ini',
  '.py', '.java', '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.go',
  '.rs', '.php', '.rb', '.swift', '.kt', '.kts', '.sh', '.ps1',
])

function processingStatus(state, label, tone, detail = '') {
  return { state, label, tone, ...(detail ? { detail } : {}) }
}

function compactDetail(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function truncateRaw(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const out = { ...raw }
  for (const key of ['content', 'textLayer']) {
    if (typeof out[key] === 'string' && out[key].length > 1600) {
      out[key] = `${out[key].slice(0, 1600)}...`
      out[`${key}TruncatedInRaw`] = true
    }
  }
  return out
}

function safeParseJson(value) {
  if (value && typeof value === 'object') return value
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return { success: false, code: 'TOOL_OUTPUT_PARSE_FAILED', message: String(value || '').slice(0, 1200) }
  }
}

function fileMeta({ filePath, virtualPath, resolvedPath, ext, stat, fileKind }) {
  return {
    path: virtualPath || filePath,
    fileName: path.basename(resolvedPath || filePath || ''),
    extension: ext || '',
    fileKind,
    size: stat?.size || 0,
  }
}

function envelope({
  success = false,
  code = '',
  type = 'unknown',
  mode = 'route',
  content = '',
  metadata = {},
  status,
  assets = [],
  cache = {},
  next = null,
  recommendation = null,
  raw = undefined,
}) {
  return {
    success,
    ...(code ? { code } : {}),
    type,
    mode,
    content,
    metadata: metadata || {},
    processingStatus: status || processingStatus(success ? 'ready' : 'error', success ? '可读取' : '读取失败', success ? 'ready' : 'error'),
    assets: Array.isArray(assets) ? assets : [],
    cache: cache || {},
    ...(next ? { next } : {}),
    ...(recommendation ? { recommendation } : {}),
    ...(raw !== undefined ? { raw: truncateRaw(raw) } : {}),
  }
}

function unsupportedRoute(code, message, { success = false, type = 'unknown', file = {}, statusState = code, tone = 'warning', action = '', reason = '' } = {}) {
  return envelope({
    success,
    code,
    type,
    mode: 'route',
    content: message,
    metadata: file,
    status: processingStatus(statusState, message, tone),
    recommendation: {
      ...(action ? { action } : {}),
      ...(reason ? { reason } : {}),
      message,
    },
  })
}

function resolvePdfMode(args = {}) {
  const requested = args.mode && args.mode !== 'auto' ? String(args.mode) : ''
  if (PDF_MODES.has(requested)) return requested
  if (args.intent === 'ocr') return 'ocr'
  if (args.intent === 'layout') return 'layout'
  if (args.intent === 'extract_images') return 'images'
  if (args.intent === 'inspect') return 'metadata'
  return 'overview'
}

function resolveOfficeMode(args = {}) {
  if (args.intent === 'extract_images' || args.mode === 'images') return 'images'
  if (['text', 'outline', 'stats', 'issues'].includes(args.mode)) return args.mode
  if (args.mode === 'metadata' || args.intent === 'inspect') return 'stats'
  return 'overview'
}

function pdfStatus(raw = {}) {
  if (raw.status === 'needs_confirmation') {
    return processingStatus('needs_confirmation', '需要确认', 'warning', raw.message)
  }
  if (raw.success === false) {
    if (raw.code === PDF_ERROR_CODES.NEEDS_OCR) {
      return processingStatus('needs_ocr', '需要 OCR', 'warning', raw.message || raw.nextAction)
    }
    if (raw.code === PDF_ERROR_CODES.TEXT_DEPENDENCY_MISSING) {
      return processingStatus('dependency_missing', '缺少本地 PDF 解析依赖', 'error', raw.message)
    }
    return processingStatus(raw.code || 'error', 'PDF 读取失败', 'error', raw.message || raw.detail)
  }
  if (raw.mode === 'ocr' && raw.ocrProfileKey) {
    return processingStatus('ocr_ready', '智能解析完成', 'ready')
  }
  if (raw.mode === 'ocr' && raw.skipped) {
    return processingStatus('text_readable', '文本可读', 'ready', raw.message)
  }
  if (raw.mode === 'overview') {
    if (raw.pdfTextMode === PDF_TEXT_MODES.TEXT) return processingStatus('text_readable', '文本可读', 'ready')
    if (raw.pdfTextMode === PDF_TEXT_MODES.SCANNED_OR_IMAGE) return processingStatus('needs_ocr', '需要 OCR', 'warning')
    if ([PDF_TEXT_MODES.MIXED_NEEDS_OCR, PDF_TEXT_MODES.TEXT_WITH_PARTIAL_GAPS].includes(raw.pdfTextMode)) {
      return processingStatus('partial_ocr_recommended', '部分页面建议 OCR', 'warning')
    }
  }
  if (raw.processingStatus === 'ocr_ready') return processingStatus('ocr_ready', '智能解析完成', 'ready')
  if (raw.processingStatus === 'pending') return processingStatus('pending', '等待解析', 'pending')
  return processingStatus('ready', 'PDF 可读取', 'ready')
}

function adaptPdfResult(raw = {}, { mode, file }) {
  const assets = [
    ...(raw.embedded || []).map(item => ({
      type: 'pdf_embedded_image',
      path: item.path || item.filePath || '',
      page: Number(item.page) || undefined,
    })),
    ...(raw.ocrAssets || []).map(item => ({
      type: item.kind || item.type || 'pdf_ocr_asset',
      path: item.path || item.url || '',
      page: Number(item.page) || undefined,
    })),
  ].filter(item => item.path)

  return envelope({
    success: raw.success !== false,
    code: raw.success === false ? (raw.code || 'PDF_READ_FAILED') : '',
    type: 'pdf',
    mode: raw.mode || mode || 'overview',
    content: raw.content || raw.message || raw.note || '',
    metadata: {
      ...file,
      pdfId: raw.pdfId,
      pageCount: raw.pageCount,
      encrypted: raw.encrypted,
      parser: raw.parser,
      pdfTextMode: raw.pdfTextMode,
      scannedPages: raw.scannedPages,
      textCoverageRatio: raw.textCoverageRatio,
      ocrCandidatePages: raw.ocrCandidatePages,
      startPage: raw.startPage,
      endPage: raw.endPage,
      page: raw.page,
      truncated: raw.truncated,
      status: raw.status,
    },
    status: pdfStatus(raw),
    assets,
    cache: {
      cachePath: raw.cachePath,
      profileKey: raw.ocrProfileKey || raw.latestOcrProfileKey,
      cacheHit: raw.cacheHit,
    },
    next: raw.next ? { tool: 'document_read', path: file.path, ...raw.next } : null,
    recommendation: raw.recommendation,
    raw,
  })
}

function officeStatus(raw = {}) {
  if (raw.success === false) {
    if (raw.code === 'OFFICECLI_NOT_INSTALLED' || raw.code === 'OFFICECLI_UNAVAILABLE') {
      return processingStatus('dependency_missing', '缺少 Office 解析依赖', 'error', raw.message)
    }
    if (raw.code === 'UNSUPPORTED_OFFICE_FORMAT') {
      return processingStatus('unsupported_format', 'Office 格式暂不支持', 'warning', raw.message)
    }
    return processingStatus(raw.code || 'error', 'Office 读取失败', 'error', raw.message || raw.detail)
  }
  if (raw.mode === 'images') return processingStatus('assets_ready', '图片资源可用', 'ready', raw.note)
  return processingStatus('ready', 'Office 可读取', 'ready')
}

function adaptOfficeResult(raw = {}, { mode, file }) {
  const exported = Array.isArray(raw.exported) ? raw.exported : []
  const assets = exported.map(item => ({
    type: item.kind || 'office_image',
    path: item.path,
    page: Number(item.page) || undefined,
  })).filter(item => item.path)

  return envelope({
    success: raw.success !== false,
    code: raw.success === false ? (raw.code || 'OFFICE_READ_FAILED') : '',
    type: 'office',
    mode: raw.mode || mode || 'overview',
    content: raw.content || raw.message || raw.note || '',
    metadata: {
      ...file,
      format: raw.format,
      structured: raw.structured,
      imageCount: raw.image_count,
      exportedCount: raw.exported_count,
      truncated: raw.truncated,
    },
    status: officeStatus(raw),
    assets,
    cache: raw.cache || {},
    next: raw.next ? { tool: 'document_read', path: file.path, ...raw.next } : null,
    recommendation: raw.success === false
      ? { action: 'check_office_read', reason: raw.message || raw.detail || '', message: raw.message || '' }
      : null,
    raw,
  })
}

export function createDocumentReadTool({
  getWorkDirService,
  getDbService,
  resolveVfsPath,
  incrementFileOp,
  readOffice,
} = {}) {
  return tool(
    async (args = {}) => {
      const workDirService = typeof getWorkDirService === 'function' ? getWorkDirService() : null
      const dbService = typeof getDbService === 'function' ? getDbService() : null
      if (!workDirService) {
        return JSON.stringify(envelope({
          success: false,
          code: 'NO_WORKSPACE',
          content: '未初始化工作空间，无法读取文档。',
          status: processingStatus('no_workspace', '未初始化工作空间', 'error'),
        }))
      }

      const limitError = incrementFileOp?.()
      if (limitError) {
        return JSON.stringify(envelope({
          success: false,
          code: limitError.code || 'FILE_OP_LIMIT_REACHED',
          content: limitError.message || '文件操作次数已达上限。',
          status: processingStatus(limitError.code || 'file_op_limited', '文件操作次数已达上限', 'warning', limitError.message),
          raw: limitError,
        }))
      }

      const filePath = args.path
      if (!filePath) {
        return JSON.stringify(envelope({
          success: false,
          code: 'MISSING_PATH',
          content: 'document_read 缺少 path 参数。',
          status: processingStatus('missing_path', '缺少文件路径', 'error'),
        }))
      }

      let resolved
      let virtualPath
      try {
        const vfsPath = resolveVfsPath(filePath, 'read', 'document_read')
        resolved = vfsPath.realPath
        virtualPath = vfsPath.virtualPath
      } catch (err) {
        return JSON.stringify(envelope({
          success: false,
          code: 'PATH_NOT_ALLOWED',
          content: `安全限制：${err.message}，只能读取授权目录内的文件。`,
          status: processingStatus('path_not_allowed', '路径不允许', 'error', err.message),
        }))
      }

      const ext = path.extname(resolved).toLowerCase()
      if (!fs.existsSync(resolved)) {
        return JSON.stringify(envelope({
          success: false,
          code: 'FILE_NOT_FOUND',
          content: '文件不存在。',
          metadata: { path: virtualPath || filePath, extension: ext },
          status: processingStatus('file_not_found', '文件不存在', 'error'),
        }))
      }
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) {
        return JSON.stringify(envelope({
          success: false,
          code: 'NOT_A_FILE',
          content: '输入路径必须是文件。',
          metadata: { path: virtualPath || filePath, extension: ext },
          status: processingStatus('not_a_file', '输入不是文件', 'error'),
        }))
      }

      const baseFile = (fileKind) => fileMeta({ filePath, virtualPath, resolvedPath: resolved, ext, stat, fileKind })

      if (PDF_EXTS.has(ext)) {
        const mode = resolvePdfMode(args)
        const service = new PdfReadService({ workDirService, dbService })
        const raw = await service.read({
          ...args,
          mode,
          inputPath: resolved,
          virtualPath,
          startPage: clampInt(args.startPage, 1, 1, Number.MAX_SAFE_INTEGER),
          maxPages: clampInt(args.maxPages, PDF_DEFAULT_MAX_PAGES, 1, PDF_MAX_PAGES),
          maxChars: clampInt(args.maxChars, PDF_DEFAULT_MAX_CHARS, 1000, PDF_MAX_CHARS),
          provider: args.provider,
          ocrProfileKey: args.profileKey || args.ocrProfileKey,
          confirmFull: args.confirm === true || args.confirmFull === true,
        })
        return JSON.stringify(adaptPdfResult(raw, { mode, file: baseFile('pdf') }))
      }

      if (OFFICE_EXTS.has(ext)) {
        if (typeof readOffice !== 'function') {
          return JSON.stringify(envelope({
            success: false,
            code: 'OFFICE_READ_UNAVAILABLE',
            type: 'office',
            content: '当前运行时未注册 office_read 能力。',
            metadata: baseFile('office'),
            status: processingStatus('dependency_missing', 'Office 读取能力不可用', 'error'),
          }))
        }
        const mode = resolveOfficeMode(args)
        const rawText = await readOffice({
          path: virtualPath || filePath,
          mode,
          start: args.start ?? args.startPage,
          end: args.end,
          maxLines: args.maxLines,
          maxChars: args.maxChars,
          exportImages: args.exportImages === true || args.intent === 'extract_images',
          imagePath: args.imagePath || '',
          maxImages: args.maxImages,
        })
        return JSON.stringify(adaptOfficeResult(safeParseJson(rawText), { mode, file: baseFile('office') }))
      }

      if (LEGACY_OFFICE_EXTS.has(ext)) {
        return JSON.stringify(unsupportedRoute(
          'OFFICE_LEGACY_FORMAT_UNSUPPORTED',
          `当前 Office 读取能力暂不支持旧版 ${ext} 格式，请先转换为 .docx/.xlsx/.pptx 后再读取。`,
          {
            type: 'office',
            file: baseFile('office'),
            statusState: 'unsupported_format',
            action: 'convert_to_modern_office',
            reason: '现有 office_read 依赖 officecli，只支持 .docx/.xlsx/.pptx。',
          },
        ))
      }

      if (IMAGE_EXTS.has(ext)) {
        return JSON.stringify(unsupportedRoute(
          'VISION_TOOL_RECOMMENDED',
          '这是图片文件，请使用 vision_analyze 进行图片理解。',
          {
            success: true,
            type: 'unknown',
            file: baseFile('image'),
            statusState: 'vision_tool_recommended',
            action: 'vision_analyze',
            reason: '图片属于视觉理解路径，不纳入 document_read 主读取流程。',
          },
        ))
      }

      if (TEXT_EXTS.has(ext)) {
        return JSON.stringify(unsupportedRoute(
          'TEXT_TOOL_RECOMMENDED',
          '这是普通文本或代码文件，请使用默认文本读取工具 read_file。',
          {
            success: true,
            type: 'unknown',
            file: baseFile('text'),
            statusState: 'text_tool_recommended',
            action: 'read_file',
            reason: '普通文本不需要结构化文档解析路由；前端工具 ID 为 file_read，运行时工具名为 read_file。',
          },
        ))
      }

      if (MEDIA_EXTS.has(ext)) {
        return JSON.stringify(unsupportedRoute(
          'MEDIA_READ_PENDING',
          '音视频解析工具尚未接入，当前返回待支持状态。',
          {
            success: true,
            type: 'media',
            file: baseFile('media'),
            statusState: 'media_read_pending',
            tone: 'future',
            action: 'media_read',
            reason: '未来接入 media_read 后会由 document_read 分发。',
          },
        ))
      }

      return JSON.stringify(unsupportedRoute(
        'UNSUPPORTED_FORMAT',
        `暂不支持该文件格式：${ext || '(无扩展名)'}`,
        {
          type: 'unknown',
          file: baseFile('unknown'),
          statusState: 'unsupported_format',
          action: 'convert_or_use_specific_tool',
          reason: 'document_read 第一版只路由 PDF、Office 和未来媒体解析文件。',
        },
      ))
    },
    {
      name: 'document_read',
      description: [
        '结构化文档读取路由工具。PDF、Word、Excel、PPT 优先使用本工具，它会按文件类型分发到 pdf_read / office_read 并返回统一状态。',
        '普通文本、代码、Markdown、JSON、CSV 不用本工具，使用默认文本读取工具。',
        '图片不由本工具解析；需要理解图片、截图、图表图片时使用 vision_analyze。',
        '默认 mode=overview；需要 OCR、版面、单页、图片导出时传 mode/intent，并遵守 needs_confirmation。',
      ].join('\n'),
      schema: z.object({
        path: z.string().describe('文件路径，必须位于授权工作空间内。'),
        mode: z.enum(['auto', 'overview', 'text', 'metadata', 'page', 'layout', 'images', 'ocr', 'transcript', 'outline', 'stats', 'issues']).optional().describe('读取模式，默认 overview/auto。'),
        intent: z.enum(['read', 'inspect', 'ask', 'extract_images', 'layout', 'ocr', 'transcribe']).optional().describe('任务意图，用于选择底层读取模式。'),
        startPage: z.number().optional().describe('PDF 起始页码；Office text 可作为 start 兼容。'),
        maxPages: z.number().optional().describe('PDF 最多读取页数。'),
        page: z.number().optional().describe('PDF page 模式读取的单页页码。'),
        pages: z.array(z.number()).optional().describe('PDF OCR 可指定页码列表。'),
        maxChars: z.number().optional().describe('返回内容最大字符数。'),
        confirm: z.boolean().optional().describe('用户已确认可能耗时或消耗服务商额度的解析。'),
        confirmFull: z.boolean().optional().describe('兼容 pdf_read：用户已确认可执行 OCR。'),
        fullDocument: z.boolean().optional().describe('兼容 pdf_read：明确处理整份 PDF。'),
        provider: z.string().optional().describe('OCR 或未来媒体解析服务商。'),
        profileKey: z.string().optional().describe('OCR/layout 缓存 profile key。'),
        ocrProfileKey: z.string().optional().describe('兼容 pdf_read：OCR/layout 缓存 profile key。'),
        start: z.number().optional().describe('Office text 起始位置。'),
        end: z.number().optional().describe('Office text 结束位置。'),
        maxLines: z.number().optional().describe('Office text 最多读取行数。'),
        exportImages: z.boolean().optional().describe('Office images 模式是否导出图片文件。'),
        imagePath: z.string().optional().describe('Office images 模式匹配单张图片的 DOM path、名称或 relId。'),
        maxImages: z.number().optional().describe('Office images 模式最多列出或导出图片数。'),
      }),
    },
  )
}
