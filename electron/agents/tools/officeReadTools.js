// agents/tools/officeReadTools.js — extracted from langchainTools.js
// Office document reading via officecli.

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { tool } from 'langchain'
import { z } from 'zod'
import { extractOfficeImages, queryOfficeImages } from '../../tools/officecli/OfficeImageExtractor.js'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../../officeCliResolver.js'
import { getSystemEnv } from '../../systemEnv.js'
import { _resolveVfsPath, _toVirtualWorkspacePath } from './vfsHelpers.js'
import { _workDirService, _dbService, _taskCounters, _taskLimits } from './toolContext.js'

const OFFICE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const OFFICE_MODES = new Set(['overview', 'text', 'outline', 'stats', 'issues', 'images'])
const OFFICE_DEFAULT_MAX_CHARS = 40000
const OFFICE_MAX_CHARS = 80000
const OFFICE_DEFAULT_MAX_LINES = 100
const OFFICE_MAX_LINES = 300
const OFFICE_DEFAULT_MAX_IMAGES = 200
const OFFICE_MAX_IMAGES = 500

function _clipText(text, maxChars) {
  const content = String(text || '')
  if (content.length <= maxChars) return { content, truncated: false }
  return { content: content.slice(0, maxChars), truncated: true }
}

function _parseOfficeCliOutput(stdout, stderr) {
  const raw = (stdout || stderr || '').trim()
  if (!raw) return { raw: '', structured: null }
  try {
    return { raw, structured: JSON.parse(raw) }
  } catch {
    return { raw, structured: null }
  }
}

function _safeOfficeSegment(value, fallback = 'document') {
  const raw = String(value || '').trim().toLowerCase()
  const safe = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return safe || fallback
}

async function _getOfficeCliEnv() {
  try {
    return getOfficeCliSpawnEnv(await getSystemEnv())
  } catch {
    return getOfficeCliSpawnEnv(process.env)
  }
}

async function _spawnOfficeCli(command, args, { timeoutMs = 20000, maxBuffer = 2 * 1024 * 1024, shell = true, label = '' } = {}) {
  const env = await _getOfficeCliEnv()
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell,
      windowsHide: true,
      env,
    })
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
      finish({ code: 124, stdout: '', stderr: 'officecli timeout', via: label })
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
  })
}

async function _runOfficeCli(args, options = {}) {
  const attempts = getOfficeCliCommandCandidates(args)
  let lastResult = { code: 127, stdout: '', stderr: 'officecli not found' }
  let bundledFailure = null
  for (const attempt of attempts) {
    const result = await _spawnOfficeCli(attempt.cmd, attempt.args, {
      ...options,
      shell: attempt.shell !== false,
      label: attempt.label,
    })
    lastResult = result
    if (_isOfficeCliNotFound(result)) continue
    if (attempt.source === 'bundled' && result.code !== 0) {
      bundledFailure = result
      continue
    }
    return result
  }
  return bundledFailure || lastResult
}

async function _runOfficeCliWithRetry(args, options = {}, retries = 1) {
  let result = await _runOfficeCli(args, options)
  for (let attempt = 0; attempt < retries && [124, 127].includes(result.code); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250))
    result = await _runOfficeCli(args, options)
  }
  return result
}

function _isOfficeCliNotFound(result) {
  if (result.code === 127) return true
  const out = `${result.stdout || ''}\n${result.stderr || ''}`
  return [
    /is not recognized as an internal or external command/i,
    /command not found/i,
    /不是内部或外部命令/,
    /系统找不到/,
    /no such file or directory/i,
  ].some(re => re.test(out))
}

async function _runOfficeView(resolvedPath, mode, options = {}) {
  const args = ['view', resolvedPath, mode, '--json']
  if (mode === 'text') {
    if (options.start) args.push('--start', String(options.start))
    if (options.end) args.push('--end', String(options.end))
    if (options.maxLines) args.push('--max-lines', String(options.maxLines))
  }
  if (mode === 'issues') {
    args.push('--limit', String(Math.min(Number(options.maxLines) || 50, 100)))
  }
  return _runOfficeCli(args)
}

function _officeError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

export async function invokeOfficeRead(input = {}, { countFileOp = true, toolName = 'office_read' } = {}) {
    const { path: filePath, mode = 'overview', start, end, maxLines, maxChars, exportImages = false, imagePath = '', maxImages } = input || {}
    const readToolLabel = toolName === 'document_read' ? 'document_read' : 'office_read'
    if (!_workDirService) {
      return _officeError('NO_WORKSPACE', '未初始化工作空间，无法读取 Office 文档。')
    }

    if (countFileOp) {
      _taskCounters.file_op++
      if (_taskCounters.file_op > _taskLimits.file_op) {
        return _officeError('FILE_OP_LIMIT_REACHED', `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。`)
      }
    }

    if (!filePath) return _officeError('MISSING_PATH', 'office_read 缺少 path 参数。')

    let resolved
    let virtualPath
    try {
      const vfsPath = _resolveVfsPath(filePath, 'read', toolName)
      resolved = vfsPath.realPath
      virtualPath = vfsPath.virtualPath
    } catch (e) {
      return _officeError('PATH_NOT_ALLOWED', `安全限制：${e.message}，只能读取授权目录内的文件。`)
    }

    const ext = path.extname(resolved).toLowerCase()
    if (!OFFICE_EXTS.has(ext)) {
      return _officeError('UNSUPPORTED_OFFICE_FORMAT', 'office_read 仅支持 .docx、.xlsx、.pptx 文件。', { path: filePath })
    }
    if (!fs.existsSync(resolved)) {
      return _officeError('FILE_NOT_FOUND', '文件不存在。', { path: filePath })
    }

    const safeMode = OFFICE_MODES.has(mode) ? mode : 'overview'
    const safeMaxChars = Math.min(Math.max(Number(maxChars) || OFFICE_DEFAULT_MAX_CHARS, 1000), OFFICE_MAX_CHARS)
    const safeMaxLines = Math.min(Math.max(Number(maxLines) || OFFICE_DEFAULT_MAX_LINES, 1), OFFICE_MAX_LINES)
    const safeMaxImages = Math.min(Math.max(Number(maxImages) || OFFICE_DEFAULT_MAX_IMAGES, 1), OFFICE_MAX_IMAGES)
    const safeStart = Math.max(Number(start) || 1, 1)
    const safeEnd = end ? Math.max(Number(end), safeStart) : undefined
    const format = ext.slice(1)

    const versionCheck = await _runOfficeCliWithRetry(['--version'], { timeoutMs: 5000, maxBuffer: 64 * 1024 }, 1)
    if (versionCheck.code === 127) {
      return _officeError(
        'OFFICECLI_NOT_INSTALLED',
        '读取 Office 文档需要 officecli。请到 设置 > 环境检测 检查本机或内置 officecli。',
        { path: virtualPath, format },
      )
    }
    if (versionCheck.code !== 0) {
      return _officeError('OFFICECLI_UNAVAILABLE', 'officecli 当前不可用，无法读取 Office 文档。', {
        path: virtualPath,
        format,
        detail: (versionCheck.stderr || versionCheck.stdout || '').slice(0, 1000),
      })
    }

    if (safeMode === 'overview') {
      const stats = await _runOfficeView(resolved, 'stats')
      const outline = await _runOfficeView(resolved, 'outline')
      if (stats.code !== 0 && outline.code !== 0) {
        return _officeError('OFFICECLI_READ_FAILED', 'officecli 无法读取该 Office 文档。', {
          path: virtualPath,
          format,
          detail: (stats.stderr || outline.stderr || '').slice(0, 1200),
        })
      }

      const parsedStats = _parseOfficeCliOutput(stats.stdout, stats.stderr)
      const parsedOutline = _parseOfficeCliOutput(outline.stdout, outline.stderr)
      const combined = [
        parsedStats.raw ? `## Stats\n${parsedStats.raw}` : '',
        parsedOutline.raw ? `## Outline\n${parsedOutline.raw}` : '',
      ].filter(Boolean).join('\n\n')
      const clipped = _clipText(combined, safeMaxChars)
      return JSON.stringify({
        success: true,
        path: virtualPath,
        format,
        mode: safeMode,
        content: clipped.content,
        structured: clipped.truncated ? null : { stats: parsedStats.structured, outline: parsedOutline.structured },
        truncated: clipped.truncated,
        next: { mode: 'text', start: 1, maxLines: safeMaxLines, maxChars: safeMaxChars },
        note: `默认只返回结构概览。需要正文时请按 next 分段调用 ${readToolLabel}(mode="text")，不要一次性读取全文。`,
      })
    }

    if (safeMode === 'images') {
      const listed = await queryOfficeImages(resolved, { maxImages: safeMaxImages })
      const imageNeedle = String(imagePath || '').trim()
      const images = imageNeedle
        ? listed.images.filter(item => [item.path, item.name, item.relId].some(value => String(value || '') === imageNeedle || String(value || '').includes(imageNeedle)))
        : listed.images
      let exportResult = null
      if (exportImages === true) {
        const root = _workDirService.getRootPath()
        const docBase = _safeOfficeSegment(path.basename(resolved, ext), 'document')
        const outputDir = path.join(root, 'context', 'office-images', docBase)
        const outputRelDir = _toVirtualWorkspacePath(outputDir)
        exportResult = await extractOfficeImages(resolved, {
          outputDir,
          outputRelDir,
          sourceId: docBase,
          imagePath: imageNeedle,
          maxImages: safeMaxImages,
        })
      }
      return JSON.stringify({
        success: true,
        path: virtualPath,
        format,
        mode: safeMode,
        images,
        image_count: images.length,
        exported: exportResult ? exportResult.assets : [],
        exported_count: exportResult ? exportResult.assets.length : 0,
        cache: exportResult ? exportResult.cache : null,
        errors: exportResult ? exportResult.errors : listed.errors,
        note: exportImages === true
          ? '已通过 officecli get --save 导出文档内图片。exported[].path 可作为工作区图片路径供支持视觉的模型读取。'
          : `图片路径是 officecli DOM path；需要本地图片文件时再次调用 ${readToolLabel}(mode="images", exportImages=true)，可用 imagePath 指定单张图片。`,
      })
    }

    const result = await _runOfficeView(resolved, safeMode, {
      start: safeStart,
      end: safeEnd,
      maxLines: safeMaxLines,
    })
    if (result.code !== 0) {
      return _officeError('OFFICECLI_READ_FAILED', 'officecli 读取失败。', {
        path: virtualPath,
        format,
        mode: safeMode,
        detail: (result.stderr || result.stdout || '').slice(0, 1200),
      })
    }

    const parsed = _parseOfficeCliOutput(result.stdout, result.stderr)
    const clipped = _clipText(parsed.raw, safeMaxChars)
    const nextStart = safeMode === 'text' ? safeStart + safeMaxLines : null
    const hasContent = clipped.content.trim().length > 0
    return JSON.stringify({
      success: true,
      path: virtualPath,
      format,
      mode: safeMode,
      content: clipped.content,
      structured: clipped.truncated ? null : parsed.structured,
      truncated: clipped.truncated,
      next: safeMode === 'text' && hasContent && (clipped.truncated || safeMaxLines)
        ? { mode: 'text', start: nextStart, maxLines: safeMaxLines, maxChars: safeMaxChars }
        : null,
    })
}

export const officeRead = tool(
  async (input = {}) => invokeOfficeRead(input, { countFileOp: true, toolName: 'office_read' }),
  {
    name: 'office_read',
    description: [
      '读取 Office 文档的底层精确工具，支持 .docx、.xlsx、.pptx。常规 Office/PDF 资料读取优先使用 document_read；只有需要 Office 专属模式、精确诊断或用户明确要求底层工具时才直接调用 office_read。',
      '默认 mode=overview，只返回结构概览和下一步建议，避免长文档撑爆上下文。',
      '需要正文时使用 mode=text，并用 start/maxLines 分段读取。还支持 outline、stats、issues。',
      '需要文档内图片或图文并茂回答时，使用 mode=images；需要把图片保存为可渲染本地 Markdown 图片时传 exportImages=true，返回 exported[].path，可写成 ![说明](/context/office-images/.../xxx.png)。',
      '图片导出会在对应目录写入 .manifest.json 缓存；同一文档同一 DOM path 再次导出会优先返回已有图片路径。',
      '只需要定位图片时先用 mode=images；只需要单张图片时传 imagePath 匹配 DOM path、图片名或 relId。',
      '依赖本机或随应用内置的 officecli；不可用时会返回 OFFICECLI_NOT_INSTALLED。',
    ].join('\n'),
    schema: z.object({
      path: z.string().describe('Office 文件路径，必须位于授权工作空间内。'),
      mode: z.enum(['overview', 'text', 'outline', 'stats', 'issues', 'images']).optional().describe('读取模式。默认 overview；正文用 text 分段读取；images 默认只列出嵌入图片 DOM 路径。'),
      start: z.number().optional().describe('text/html 等支持分页/分段模式的起始位置，默认 1。'),
      end: z.number().optional().describe('text/html 等支持分页/分段模式的结束位置。'),
      maxLines: z.number().optional().describe('text 模式最多读取行数，默认 100，最大 300。'),
      maxChars: z.number().optional().describe('返回内容最大字符数，默认 40000，最大 80000。'),
      exportImages: z.boolean().optional().describe('仅 mode=images 有效。true 时通过 officecli get --save 将文档内图片导出到 /context/office-images/...。默认 false。'),
      imagePath: z.string().optional().describe('仅 mode=images 有效。可传 officecli DOM path、图片名称或 relId 片段，只列出/导出匹配图片。'),
      maxImages: z.number().optional().describe('仅 mode=images 有效。最多列出/导出图片数，默认 200，最大 500。'),
    }),
  },
)

// ── PDF Read (shared PDF service) ───────────────────────────────
