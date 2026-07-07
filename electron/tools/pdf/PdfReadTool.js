import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'langchain'
import { z } from 'zod'
import {
  clampInt,
  pdfError,
  PDF_DEFAULT_MAX_CHARS,
  PDF_DEFAULT_MAX_PAGES,
  PDF_ERROR_CODES,
  PDF_MAX_CHARS,
  PDF_MAX_PAGES,
  PDF_MODES,
} from './PdfTypes.js'
import { PdfReadService } from './PdfReadService.js'

const PDF_EXTS = new Set(['.pdf'])

export function createPdfReadTool({
  getWorkDirService,
  getDbService,
  resolveVfsPath,
  incrementFileOp,
} = {}) {
  return tool(
    async (args = {}) => {
      const workDirService = typeof getWorkDirService === 'function' ? getWorkDirService() : null
      const dbService = typeof getDbService === 'function' ? getDbService() : null
      if (!workDirService) {
        return JSON.stringify(pdfError('NO_WORKSPACE', '未初始化工作空间，无法读取 PDF 文档。'))
      }
      const service = new PdfReadService({ workDirService, dbService })
      const limitError = incrementFileOp?.()
      if (limitError) return JSON.stringify(limitError)

      const filePath = args.path
      if (!filePath) return JSON.stringify(pdfError('MISSING_PATH', 'pdf_read 缺少 path 参数。'))

      let resolved
      let virtualPath
      try {
        const vfsPath = resolveVfsPath(filePath, 'read', 'pdf_read')
        resolved = vfsPath.realPath
        virtualPath = vfsPath.virtualPath
      } catch (err) {
        return JSON.stringify(pdfError(PDF_ERROR_CODES.PATH_NOT_ALLOWED, `安全限制：${err.message}，只能读取授权目录内的文件。`))
      }

      if (!PDF_EXTS.has(path.extname(resolved).toLowerCase())) {
        return JSON.stringify(pdfError(PDF_ERROR_CODES.UNSUPPORTED_FORMAT, 'pdf_read 仅支持 .pdf 文件。', { path: filePath }))
      }
      if (!fs.existsSync(resolved)) {
        return JSON.stringify(pdfError(PDF_ERROR_CODES.FILE_NOT_FOUND, '文件不存在。', { path: filePath }))
      }

      const mode = PDF_MODES.has(args.mode) ? args.mode : 'overview'
      const result = await service.read({
        ...args,
        mode,
        inputPath: resolved,
        virtualPath,
        startPage: clampInt(args.startPage, 1, 1, Number.MAX_SAFE_INTEGER),
        maxPages: clampInt(args.maxPages, PDF_DEFAULT_MAX_PAGES, 1, PDF_MAX_PAGES),
        maxChars: clampInt(args.maxChars, PDF_DEFAULT_MAX_CHARS, 1000, PDF_MAX_CHARS),
      })
      return JSON.stringify(result)
    },
    {
      name: 'pdf_read',
      description: [
        '读取 PDF 文档的底层精确工具，支持文本层、OCR、版面结果、单页读取和图片清单。常规 PDF/Office 资料读取优先使用 document_read；只有需要 PDF 专属模式、精确诊断或用户明确要求底层工具时才直接调用 pdf_read。',
        '默认 mode=overview，先判断页数、文本覆盖率、是否需要 OCR，并返回推荐下一步。',
        '文本型 PDF 用 mode=text 按页段读取；扫描/混合 PDF 可用 mode=ocr 后再用 layout/page 读取。',
        '如果全局策略为本地快速解析，mode=ocr 会先要求确认；只有用户明确需要 OCR/版面/图片/表格/公式时再带 confirmFull=true 执行。',
        '大 PDF 必须按页段读取或 OCR；工具会返回 next/recommendation。',
      ].join('\n'),
      schema: z.object({
        path: z.string().describe('PDF 文件路径，必须位于授权工作空间内。'),
        mode: z.enum(['overview', 'text', 'metadata', 'ocr', 'layout', 'page', 'images']).optional().describe('读取模式，默认 overview。'),
        startPage: z.number().optional().describe('起始页码，默认 1。'),
        maxPages: z.number().optional().describe('最多读取页数，默认 5，最大 20。'),
        maxChars: z.number().optional().describe('返回内容最大字符数，默认 40000，最大 80000。'),
        pages: z.array(z.number()).optional().describe('ocr 模式可指定页码列表。'),
        page: z.number().optional().describe('page 模式读取的单页页码。'),
        provider: z.string().optional().describe('ocr 模式 provider，默认 auto；可传具体 provider id。'),
        ocrProfileKey: z.string().optional().describe('layout/page 模式读取指定 OCR 缓存 profile。'),
        confirmFull: z.boolean().optional().describe('明确确认可执行 OCR；本地快速策略下需要用户确认后才应传 true。'),
        fullDocument: z.boolean().optional().describe('ocr 模式明确解析整份 PDF，适合文档模块后台任务；对话中优先按需页段处理。'),
      }),
    },
  )
}
