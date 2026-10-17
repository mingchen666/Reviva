// electron/agents/langchainTools.js — LangChain tool definitions using Zod schemas
// Custom tools for DeepAgents that supplement the built-in filesystem tools
// DeepAgents provides ls/read_file/write_file/edit_file/glob/grep via FilesystemBackend natively

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { tool } from 'langchain'
import { z } from 'zod'
import { create, all } from 'mathjs'
import { ToolsetRegistry } from '../tools/ToolsetRegistry.js'
import { createFfmpegTool } from '../tools/FfmpegToolService.js'
import { createPandocTool } from '../tools/PandocToolService.js'
import { createManimTool } from '../tools/ManimToolService.js'
import { createOfficeWriteTool } from '../tools/officecli/index.js'
import { createPdfReadTool } from '../tools/pdf/PdfReadTool.js'
import { createDocumentReadTool } from '../tools/document/DocumentReadTool.js'
import { createNoteTool } from '../tools/note/NoteTool.js'
import { createMediaReadTool } from '../media/tools/MediaReadTool.js'
import { extractOfficeImages, queryOfficeImages } from '../tools/officecli/OfficeImageExtractor.js'
import { PptxExportService } from '../PptxExportService.js'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../officeCliResolver.js'
import { getSystemEnv } from '../systemEnv.js'
import { SAFE_COMMAND_TOOL_DESCRIPTION, runSafeCommand, runSafeStructuredCommand, validateSafeCommand } from '../security/SafeCommandRunner.js'
import { createVfsPathResolver } from '../security/VfsPathResolver.js'

import { createRevivaManageTool } from '../tools/reviva/RevivaManageTool.js'
import { setMainWindowRef as _setNotifierMainWindowRef } from '../tools/reviva/settingsNotifier.js'

// Restricted mathjs instance — import/createUnit/evaluate/parse banned for safety
const math = create(all)
math.import({
  import: function () { throw new Error('Function import is disabled') },
  createUnit: function () { throw new Error('Function createUnit is disabled') },
  reviver: function () { throw new Error('Function reviver is disabled') },
}, { override: true })
// === Extracted module imports (refactored for maintainability) ===
// Re-export setters from toolContext (AgentService.js imports these from langchainTools.js)
export {
  setToolProviderConfig, setWorkDirService, setDbService, setWikiService,
  setMcpService, setMediaQueryService, setNoteFileService, setSkillService,
  setThemeService, setLearningMemoryService, setMainWindowRef, setVisionAnalyzeHandler,
  setToolRunContext, setCloudContext, setKnowledgeSourceRegistry, getKnowledgeSourceRegistry,
  resetTaskCounters, setExecCommandConfig,
} from './tools/toolContext.js'

// Import state variables needed by remaining tools in this file
import {
  _mediaQueryService, _noteFileService, _toolRunContext, _dbService,
  _workDirService, _visionAnalyzeHandler, _wikiService, _themeService,
  _revivaWriteCount, _mainWindowRef, _cloudCtx,
  _mcpService, _skillService, _learningMemoryService,
  _taskCounters, _taskLimits,
  setRevivaWriteCount,
} from './tools/toolContext.js'

// Import VFS helpers used by remaining tools
import { _resolveVfsPath, _toVirtualWorkspacePath } from './tools/vfsHelpers.js'

// Import extracted tool definitions
import { execCommand, invokeCommandCompatibilityTool, hiddenCommandCompatibilityTools } from './tools/execCommandTools.js'
import { webSearchTavily, webSearchSearxng, webSearchBing } from './tools/webSearchTools.js'
import { kbSearch, createKbSearchExternal } from './tools/kbSearchTools.js'
import { officeRead, invokeOfficeRead } from './tools/officeReadTools.js'
import { mcpResourceRead, mcpPromptGet } from './tools/mcpTools.js'
import { skillInstall } from './tools/skillInstallTool.js'
import { getUserDefinedLangchainTools } from './tools/customUserTools.js'

// Re-export tools that were previously exported from this file
export { execCommand, invokeCommandCompatibilityTool, hiddenCommandCompatibilityTools }
export { webSearchTavily, webSearchSearxng, webSearchBing }
export { kbSearch, createKbSearchExternal }
export { officeRead }
export { mcpResourceRead, mcpPromptGet }
export { skillInstall }
export { getUserDefinedLangchainTools }

const _toolsetRegistry = new ToolsetRegistry()
export const mediaRead = createMediaReadTool({
  getQueryService: () => _mediaQueryService,
  getRunContext: () => _toolRunContext,
})

export const noteTool = createNoteTool({
  getNoteService: () => _noteFileService,
  getRunContext: () => _toolRunContext,
})

function createRunScopedMediaRead() {
  const runContext = Object.freeze({
    ..._toolRunContext,
    allowedMediaIds: Object.freeze([...(_toolRunContext.allowedMediaIds || [])]),
  })
  return createMediaReadTool({
    getQueryService: () => _mediaQueryService,
    getRunContext: () => runContext,
  })
}

function createRunScopedNoteTool() {
  const runContext = Object.freeze({
    ..._toolRunContext,
    permissions: Object.freeze({ ...(_toolRunContext.permissions || {}) }),
  })
  return createNoteTool({
    getNoteService: () => _noteFileService,
    getRunContext: () => runContext,
  })
}
export const calculator = tool(
  async ({ expression }) => {
    if (!expression) throw new Error('calculator: missing expression')
    try {
      const raw = math.evaluate(expression)
      // Normalize result: BigNumber / Unit / Matrix / Complex → string via mathjs format
      let result
      if (raw === null || raw === undefined) {
        result = String(raw)
      } else if (typeof raw === 'number' || typeof raw === 'boolean') {
        result = raw
      } else if (typeof raw === 'string') {
        result = raw
      } else if (raw && typeof raw.toString === 'function') {
        result = math.format(raw, { precision: 14 })
      } else {
        result = String(raw)
      }
      return JSON.stringify({ expression, result })
    } catch (err) {
      throw new Error(`calculator error: ${err.message}`)
    }
  },
  {
    name: 'calculator',
    description: [
      '科学计算器，基于 mathjs 表达式求值。一个 expression 字段即可表达所有计算。支持：',
      '• 基础运算：2+3*4、2^10、(5-1)/2',
      '• 科学函数：sin(45 deg)、cos(pi/2)、log(100, 10)、ln(e)、exp(1)、sqrt(16)、abs(-5)、pow(2,8)',
      '• 统计与概率：mean([1,2,3,4,5])、median(...)、std(...)、variance(...)、sum(...)、min/max(...)、combinations(10,3)、permutations(10,3)、factorial(5)',
      '• 单位换算：12 inch to cm、5 km/h to m/s、100 fahrenheit to celsius、1 kJ to kcal、30 degC to K',
      '• 常量：pi、e、tau、phi、i',
      '• 矩阵与复数：[[1,2],[3,4]] * [[5],[6]]、(2+3i) * (4-i)',
      '注意角度计算需带 deg（如 sin(30 deg)），否则按弧度处理。返回 JSON {expression, result}。',
    ].join('\n'),
    schema: z.object({
      expression: z.string().describe('mathjs 表达式，如 "sin(45 deg) + sqrt(2)"、"mean([1,2,3,4])"、"12 inch to cm"'),
    }),
  },
)

// ── Vision Analyze ───────────────────────────────────────────────

export const visionAnalyze = tool(
  async ({ path: imagePath, paths = [], question = '', context = '', mode = 'auto', detail = 'auto', maxImages }) => {
    if (!_visionAnalyzeHandler) {
      return JSON.stringify({
        success: false,
        code: 'VISION_UNAVAILABLE',
        message: '当前运行环境未启用图片理解工具。',
      })
    }
    return JSON.stringify(await _visionAnalyzeHandler({ path: imagePath, paths, question, context, mode, detail, maxImages }, _toolRunContext))
  },
  {
    name: 'vision_analyze',
    description: [
      '按需理解工作区内图片内容。当前主模型支持视觉或已配置默认视觉理解模型时可用。',
      '用于分析 document_read/office_read 导出的文档图片、PDF 截图、视频关键帧或用户提供的图片；普通文字读取不要调用本工具。',
      '当用户要求分析图表、解释图片、比较多张图、提取图片中的文字/结构/视觉信息时调用；少量图片 OCR 也可以使用本工具。',
      '支持单图 path 或多图 paths；question 可由你根据用户问题和上下文生成，留空时会使用默认问题。默认最多 4 张，maxImages 硬上限 8 张。',
      '不要为了“图文并茂展示”而默认调用；只展示图片时使用 Markdown 图片路径即可。',
    ].join('\n'),
    schema: z.object({
      path: z.string().optional().describe('单张图片路径，支持工作区虚拟路径，如 /context/office-images/.../chart.png。'),
      paths: z.array(z.string()).optional().describe('多张图片路径。与 path 可同时传，工具会合并去重。默认最多分析 4 张，硬上限 8 张。'),
      question: z.string().optional().describe('希望视觉模型回答的问题；通常由 Agent 根据用户需求生成。为空时默认描述图片并提取与任务相关的信息。'),
      context: z.string().optional().describe('可选上下文，如图片来自哪个文档、页面、幻灯片或用户当前任务。'),
      mode: z.enum(['auto', 'per_image', 'compare']).optional().describe('分析模式：auto 综合分析；per_image 逐图说明；compare 多图对比。默认 auto。'),
      detail: z.enum(['auto', 'low', 'high']).optional().describe('视觉细节偏好，预留给支持该参数的模型。默认 auto。'),
      maxImages: z.number().int().min(1).max(8).optional().describe('最多分析图片数，默认 4，硬上限 8。'),
    }),
  },
)

// ── Delete File (with safety constraints) ───────────────────────

function _hasPathSegment(filePath, segment) {
  const expected = String(segment || '').toLowerCase()
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .some(part => part.toLowerCase() === expected)
}

export const deleteFile = tool(
  async ({ path: filePath }) => {
    if (!_workDirService) return JSON.stringify({ error: 'No workspace initialized' })

    // Check file op limit
    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return JSON.stringify({ error: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` })
    }

    // Check global security settings from DB
    const allowFileDelete = _dbService?.getSetting('allowFileDelete') ?? true
    if (!allowFileDelete) {
      return JSON.stringify({ error: '安全限制：文件删除功能已被全局禁用。请在设置 > 沙箱保护 > Agent 安全策略中开启"允许文件删除"。' })
    }

    const deleteScope = _dbService?.getSetting('deleteScope') ?? 'outputs-only'

    let resolved
    let virtualPath = filePath
    try {
      const vfsPath = _resolveVfsPath(filePath, 'delete', 'delete_file')
      resolved = vfsPath.realPath
      virtualPath = vfsPath.virtualPath
    } catch (e) {
      return JSON.stringify({ error: `安全限制：${e.message}，只能删除当前 Agent 输出目录内的文件` })
    }

    const normalized = resolved.replace(/\\/g, '/').toLowerCase()

    // Safety: protect app metadata, memory, skills, memories directories — always enforced
    if (normalized.includes('/.reviva/') || normalized.includes('/memory/') || normalized.includes('/skills/') || normalized.includes('/memories/')) {
      return JSON.stringify({ error: '安全限制：不能删除系统目录、记忆目录或技能目录下的文件' })
    }

    // Enforce deleteScope setting
    if (deleteScope === 'outputs-only') {
      // Allow deleting files under authorized outputs/ or tmp/ directories.
      if (!_hasPathSegment(resolved, 'outputs') && !_hasPathSegment(resolved, 'tmp')) {
        return JSON.stringify({ error: '安全限制：当前删除范围设置为"仅 outputs/tmp 目录"，只能删除授权 outputs/ 或 tmp/ 目录内的文件或目录。如需更宽范围请在设置中调整。' })
      }
    }
    // VFS policy keeps Agent deletes scoped to this agent's outputs even if the legacy setting says workspace.

    try {
      const stat = fs.statSync(resolved)
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true })
      } else {
        fs.unlinkSync(resolved)
      }
      return JSON.stringify({ success: true, path: virtualPath, message: `已删除: ${virtualPath}` })
    } catch (err) {
      return JSON.stringify({ error: `删除失败: ${err.message}` })
    }
  },
  {
    name: 'delete_file',
    description: '删除当前 Agent 输出目录内的文件或目录。受全局安全设置约束，系统目录、记忆目录、技能目录始终受保护。此操作需要用户授权确认。',
    schema: z.object({
      path: z.string().describe('要删除的文件路径'),
    }),
  },
)

// ── Office Read (officecli, read-only) ──────────────────────────
export const pdfRead = createPdfReadTool({
  getWorkDirService: () => _workDirService,
  getDbService: () => _dbService,
  resolveVfsPath: (inputPath, op, toolName) => _resolveVfsPath(inputPath, op, toolName),
  incrementFileOp: () => {
    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return { success: false, code: 'FILE_OP_LIMIT_REACHED', message: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` }
    }
    return null
  },
})

export const documentRead = createDocumentReadTool({
  getWorkDirService: () => _workDirService,
  getDbService: () => _dbService,
  resolveVfsPath: (inputPath, op, toolName) => _resolveVfsPath(inputPath, op, toolName),
  incrementFileOp: () => {
    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return { success: false, code: 'FILE_OP_LIMIT_REACHED', message: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` }
    }
    return null
  },
  readOffice: (input = {}) => invokeOfficeRead(input, { countFileOp: false, toolName: 'document_read' }),
})

// ── PPTX Export (local, pptxgenjs) ───────────────────────────────

function _isInsideDir(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function _resolvePptxOutputPath(htmlPath, outputPath) {
  const requested = String(outputPath || '').trim()
  if (!requested) {
    return path.join(path.dirname(htmlPath), `${path.basename(htmlPath, path.extname(htmlPath))}.pptx`)
  }

  const resolved = _resolveVfsPath(requested, 'tool_output', 'pptx_export_local').realPath
  const ext = path.extname(resolved).toLowerCase()
  if (!ext) return `${resolved}.pptx`
  if (ext !== '.pptx') throw new Error('outputPath 必须是 .pptx 文件路径')
  return resolved
}

export const pptxExportLocal = tool(
  async ({ htmlPath, outputPath }) => {
    if (!_workDirService) {
      return JSON.stringify({ success: false, code: 'NO_WORKSPACE', message: '未初始化工作空间，无法导出 PPTX。' })
    }

    _taskCounters.file_op++
    if (_taskCounters.file_op > _taskLimits.file_op) {
      return JSON.stringify({ success: false, code: 'FILE_OP_LIMIT_REACHED', message: `本任务文件操作次数已达上限 (${_taskLimits.file_op} 次)，请减少文件操作。` })
    }

    if (!htmlPath) {
      return JSON.stringify({ success: false, code: 'MISSING_HTML_PATH', message: 'pptx_export_local 缺少 htmlPath 参数。' })
    }

    let resolvedHtml
    let resolvedOutput
    try {
      resolvedHtml = _resolveVfsPath(htmlPath, 'read', 'pptx_export_local').realPath
      const htmlExt = path.extname(resolvedHtml).toLowerCase()
      if (!['.html', '.htm'].includes(htmlExt)) {
        return JSON.stringify({ success: false, code: 'UNSUPPORTED_INPUT', message: 'pptx_export_local 仅支持 .html / .htm 输入。', path: htmlPath })
      }
      if (!fs.existsSync(resolvedHtml)) {
        return JSON.stringify({ success: false, code: 'HTML_NOT_FOUND', message: 'HTML 文件不存在。', path: htmlPath })
      }

      resolvedOutput = _resolvePptxOutputPath(resolvedHtml, outputPath)
      const agentsRoot = path.join(_workDirService.getRootPath(), 'agents')
      if (!_isInsideDir(resolvedOutput, agentsRoot)) {
        return JSON.stringify({ success: false, code: 'OUTPUT_SCOPE_DENIED', message: 'PPTX 导出只能写入 /agents/ 下的 Agent 输出目录。' })
      }
      fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true })
      _resolveVfsPath(resolvedOutput, 'tool_output', 'pptx_export_local')
    } catch (e) {
      return JSON.stringify({ success: false, code: 'PATH_NOT_ALLOWED', message: `安全限制：${e.message}` })
    }

    try {
      const exporter = new PptxExportService()
      const result = await exporter.exportLocal(resolvedHtml, resolvedOutput)
      return JSON.stringify({
        success: true,
        path: _toVirtualWorkspacePath(resolvedOutput),
        slideCount: result.slideCount || 0,
      })
    } catch (e) {
      return JSON.stringify({ success: false, code: 'PPTX_EXPORT_FAILED', message: e.message })
    }
  },
  {
    name: 'pptx_export_local',
    description: [
      '将 Agent 输出目录中的 HTML 演示文稿导出为可编辑的 PPTX 文件。',
      'htmlPath 必须是授权工作空间内的 .html/.htm 文件；outputPath 可省略，默认与 HTML 同目录同名 .pptx。',
      '输出路径只能位于当前 Agent 的 /agents/{agent}/outputs/ 下，返回 JSON {success, path, slideCount}。',
    ].join('\n'),
    schema: z.object({
      htmlPath: z.string().describe('HTML 演示文稿路径，如 /agents/ppt-generator/outputs/2026-06-03/demo.html'),
      outputPath: z.string().optional().describe('输出 PPTX 路径，必须位于 /agents/ 下；省略则与 HTML 同目录同名 .pptx'),
    }),
  },
)

export const wikiTool = tool(
  async (input = {}) => {
    if (!_wikiService?.wikiTool) {
      return JSON.stringify({
        success: false,
        code: 'WIKI_NOT_AVAILABLE',
        message: '本地 LLM-Wiki 服务不可用或工作区尚未初始化。',
      })
    }
    const runWikiContext = _toolRunContext.wikiContext || {}
    const allowedWikiIds = Array.isArray(runWikiContext.wikiIds)
      ? runWikiContext.wikiIds.filter(Boolean)
      : []
    const result = await _wikiService.wikiTool({
      ...(input || {}),
      wikiContext: runWikiContext,
      allowedWikiIds,
      enforceWikiSelection: true,
      allowWrite: false,
    })
    return JSON.stringify(result)
  },
  {
    name: 'wiki_tool',
    description: [
      '只读查询本地 LLM-Wiki 的统一工具。普通聊天 Agent 不能写入 Wiki。',
      '只能访问用户在本轮聊天输入区选择的 Wiki；未选择 Wiki 时不能读取任何 Wiki。模型传入 wikiIds 只能在已选择范围内缩小，不能扩大到全部 Wiki。',
      '先用 action=list_wikis 查看本轮允许访问的 Wiki；聊天界面选择了 Wiki 时，可直接用 search_wikis/query_wikis，系统会使用默认范围。',
      '常用动作：query_wikis 会先读取 index.md/overview.md 导航页，返回导航链接、优先页面和兜底搜索结果；search_wikis 是显式关键词兜底搜索；read_page/read_source 用于深读具体页面或来源。',
      '回答用户问题时必须引用 wiki_name、页面路径、source_id 或图片路径。',
    ].join('\n'),
    schema: z.object({
      action: z.enum([
        'list_wikis',
        'search',
        'search_wikis',
        'query_wikis',
        'list_pages',
        'read_page',
        'list_sources',
        'read_source',
        'list_assets',
        'recent_changes',
      ]).describe('要执行的 Wiki 动作。'),
      wikiId: z.string().optional().describe('Wiki id。action=list_wikis 不需要。'),
      wikiIds: z.array(z.string()).optional().describe('跨 Wiki 查询的 Wiki id 列表；不传时使用聊天界面选择的默认范围。'),
      query: z.string().optional().describe('search 动作的检索问题。'),
      scope: z.enum(['all', 'pages', 'sources', 'wiki', 'source', 'assets']).optional().describe('search 范围。'),
      limit: z.number().optional().describe('返回数量上限。'),
      maxChars: z.number().optional().describe('query_wikis 返回上下文最大字符数。'),
      pagePath: z.string().optional().describe('read_page 的相对 Markdown 路径，如 index.md 或 pages/concepts/topic.md。'),
      sourceId: z.string().optional().describe('read_source 的来源 id。'),
      kind: z.string().optional().describe('list_assets 的资产类型过滤，例如 ocr_image 或 source_image。'),
    }),
  },
)

// ── Aggregate custom tools ──────────────────────────────────────

function _buildRevivaManageTool() {
  return createRevivaManageTool({
    getDbService: () => _dbService,
    getThemeService: () => _themeService,
    getLearningMemoryService: () => _learningMemoryService,
    getWorkDirService: () => _workDirService,
    getSkillService: () => _skillService,
    getMcpService: () => _mcpService,
    getMainWindowRef: () => _mainWindowRef,
    getPermissions: () => _toolRunContext.permissions || {},
    getWriteCount: () => _revivaWriteCount,
    setWriteCount: (n) => { setRevivaWriteCount(n) },
  })
}

const CUSTOM_TOOLS = [execCommand, webSearchTavily, webSearchSearxng, webSearchBing, kbSearch, wikiTool, noteTool, calculator, deleteFile, documentRead, mediaRead, officeRead, pdfRead, visionAnalyze, pptxExportLocal, mcpResourceRead, mcpPromptGet, skillInstall, _buildRevivaManageTool()]
const TOOL_ID_ALIASES = {
  file_delete: 'delete_file',
}

function _normalizeToolIds(toolIds) {
  const normalized = new Set()
  for (const id of toolIds || []) {
    normalized.add(id)
    if (TOOL_ID_ALIASES[id]) normalized.add(TOOL_ID_ALIASES[id])
    if (typeof id === 'string' && id.startsWith('mcp:')) {
      normalized.add('mcp_resource_read')
      normalized.add('mcp_prompt_get')
    }
  }
  return normalized
}

function _createRouterTool(toolset) {
  const options = { agentDirName: _toolRunContext.agentEnglishName || '_shared', permissions: _toolRunContext.permissions || {} }
  if (toolset.id === 'ffmpeg') return createFfmpegTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'pandoc') return createPandocTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'manim') return createManimTool(_workDirService, toolset.allowedOperations, options)
  if (toolset.id === 'office') return createOfficeWriteTool(_workDirService, toolset.allowedOperations, options)
  return null
}

function _createToolsetTools(toolIds) {
  return _toolsetRegistry
    .resolveRouterTools(toolIds)
    .map(_createRouterTool)
    .filter(Boolean)
}

/**
 * Get custom LangChain tool instances by tool IDs
 * Note: DeepAgents provides filesystem tools (ls/read_file/write_file/edit_file/glob/grep) via FilesystemBackend
 * These custom tools supplement the built-in ones
 * @param {string[]} toolIds - Optional filter by tool ID
 * @returns {StructuredTool[]} LangChain tool instances
 */
export function getLangchainTools(toolIds) {
  const mediaReadAvailable = (_toolRunContext.allowedMediaIds || []).length > 0
  const bindRunScopedTools = tools => tools.flatMap((item) => {
    if (item === mediaRead) return mediaReadAvailable ? [createRunScopedMediaRead()] : []
    if (item === noteTool) return [createRunScopedNoteTool()]
   return [item]
 })
  // Swap kb_search tool based on whether an external knowledge source is active
  const useExternalKb = !!_cloudCtx.activeSourceId
  const effectiveTools = useExternalKb
    ? CUSTOM_TOOLS.map(t => t === kbSearch ? createKbSearchExternal() : t)
    : CUSTOM_TOOLS
  if (!toolIds?.length) return bindRunScopedTools(effectiveTools)
  const toolsetTools = _createToolsetTools(toolIds)
  const idSet = _normalizeToolIds(toolIds)
  return bindRunScopedTools([
    ...effectiveTools.filter(t => idSet.has(t.name)),
    ...toolsetTools,
  ])
}

export { CUSTOM_TOOLS }

