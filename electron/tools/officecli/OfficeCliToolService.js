import fs from 'node:fs'
import path from 'node:path'
import { ToolPathGuard } from '../ToolPathGuard.js'
import { checkOfficeCli, clipText, runOfficeCli } from './OfficeCliRunner.js'
import { compileOfficeActions, compileOfficeBatchActions } from './OfficeActionCompiler.js'
import { readOfficeCliSchema } from './OfficeCliSchemaCache.js'

const OFFICE_EXTS = new Set(['.docx', '.pptx', '.xlsx'])
const OFFICE_FORMATS = new Set(['docx', 'pptx', 'xlsx'])
const MAX_INPUT_BYTES = 200 * 1024 * 1024

function jsonError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

function safeName(name) {
  const parsed = path.parse(String(name || 'office-output'))
  const base = (parsed.name || 'office-output')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'office-output'
  return { base, ext: parsed.ext.toLowerCase() }
}

function uniquePath(dir, filename) {
  const parsed = path.parse(filename)
  let candidate = path.join(dir, filename)
  let index = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}_${index}${parsed.ext}`)
    index += 1
  }
  return candidate
}

function formatFrom(filename, format) {
  const requested = String(format || '').trim().toLowerCase().replace(/^\./, '')
  if (requested && !OFFICE_FORMATS.has(requested)) {
    const err = new Error(`不支持的 Office 输出格式：${requested}`)
    err.code = 'OFFICE_UNSUPPORTED_FORMAT'
    throw err
  }
  const ext = path.extname(String(filename || '')).toLowerCase().replace(/^\./, '')
  const resolved = requested || ext
  if (!OFFICE_FORMATS.has(resolved)) {
    const err = new Error('缺少 Office 输出格式，请传 format 或带 .docx/.pptx/.xlsx 的 filename。')
    err.code = 'OFFICE_UNSUPPORTED_FORMAT'
    throw err
  }
  return resolved
}

function buildOutputPath(paths, filename, { format = '', suffix = '' } = {}) {
  const resolvedFormat = formatFrom(filename, format)
  const dir = paths.ensureOutputDir('officecli')
  const { base } = safeName(filename || `office-output.${resolvedFormat}`)
  const cleanSuffix = suffix ? `_${safeName(suffix).base}` : ''
  return uniquePath(dir, `${base}${cleanSuffix}.${resolvedFormat}`)
}

function summarizeResult(result, max = 4000) {
  return {
    code: result.code,
    via: result.via,
    stdout: clipText(result.stdout, max),
    stderr: clipText(result.stderr, max),
  }
}

export class OfficeCliToolService {
  constructor(workDirService, options = {}) {
    this._paths = new ToolPathGuard(workDirService, options)
    this._permissions = options.permissions || {}
  }

  async invoke(input = {}, allowedOperations = []) {
    const operation = String(input.operation || '').trim()
    if (!allowedOperations.includes(operation)) {
      return jsonError('TOOL_OPERATION_NOT_ALLOWED', `当前 Agent 未启用 Office 写入子能力：${operation || '(未指定)'}`)
    }

    if (operation !== 'help' && this._permissions.fileWrite !== true && this._permissions.fileWrite !== 1) {
      return jsonError('TOOL_PERMISSION_REQUIRED', 'office_write 需要当前 Agent 开启“文件写入”权限。')
    }

    const dependency = await checkOfficeCli()
    if (!dependency.success) return JSON.stringify(dependency)

    try {
      switch (operation) {
        case 'help':
          return await this._help(input)
        case 'create':
          return await this._create(input)
        case 'edit':
          return await this._edit(input)
        default:
          return jsonError('TOOL_UNSUPPORTED_OPERATION', `不支持的 Office operation：${operation}`)
      }
    } catch (err) {
      return jsonError(err.code || 'OFFICE_WRITE_FAILED', err.message || 'Office 写入失败。', {
        actionIndex: Number.isInteger(err.actionIndex) ? err.actionIndex : undefined,
      })
    }
  }

  async _help({ format, element, verb, json = true }) {
    const fmt = String(format || '').trim().toLowerCase().replace(/^\./, '')
    if (fmt) {
      if (!OFFICE_FORMATS.has(fmt)) {
        return jsonError('OFFICE_UNSUPPORTED_FORMAT', `不支持的 Office 格式：${fmt}`)
      }
    }
    const cleanVerb = String(verb || '').trim()
    const cleanElement = String(element || '').trim()
    const result = await readOfficeCliSchema({ format: fmt, element: cleanElement, verb: cleanVerb, json })
    return JSON.stringify(result)
  }

  async _create({ filename, format, actions = [], runChecks = true, useBatch = false, allowRawXml = false }) {
    const outputPath = buildOutputPath(this._paths, filename, { format })
    const createResult = await runOfficeCli(['create', outputPath], {
      timeoutMs: 60000,
      maxBuffer: 1024 * 1024,
      cwd: path.dirname(outputPath),
    })
    if (createResult.code !== 0) {
      return jsonError(createResult.code === 124 ? 'OFFICECLI_TIMEOUT' : 'OFFICE_CREATE_FAILED', '创建 Office 文件失败。', summarizeResult(createResult, 3000))
    }

    const actionResults = await this._runActions(outputPath, actions, { useBatch, allowRawXml })
    if (!actionResults.success) return JSON.stringify(actionResults)
    const checks = this._shouldRunChecks({ runChecks, useBatch, allowRawXml }) ? await this._runChecks(outputPath) : []

    return JSON.stringify({
      success: true,
      operation: 'create',
      outputPath: this._paths.toVirtualPath(outputPath),
      format: path.extname(outputPath).slice(1).toLowerCase(),
      actionCount: actionResults.actions.length,
      actions: actionResults.actions,
      warnings: checks,
      create: summarizeResult(createResult, 1200),
    })
  }

  async _edit({ path: inputPath, filename, actions = [], runChecks = true, useBatch = false, allowRawXml = false }) {
    const sourcePath = this._paths.resolveInput(inputPath, { allowedExts: OFFICE_EXTS, maxBytes: MAX_INPUT_BYTES })
    const ext = path.extname(sourcePath).slice(1).toLowerCase()
    const outputPath = buildOutputPath(this._paths, filename || path.basename(sourcePath), { format: ext, suffix: 'edited' })
    fs.copyFileSync(sourcePath, outputPath)

    const actionResults = await this._runActions(outputPath, actions, { useBatch, allowRawXml })
    if (!actionResults.success) return JSON.stringify(actionResults)
    const checks = this._shouldRunChecks({ runChecks, useBatch, allowRawXml }) ? await this._runChecks(outputPath) : []

    return JSON.stringify({
      success: true,
      operation: 'edit',
      inputPath: this._paths.toVirtualPath(sourcePath),
      outputPath: this._paths.toVirtualPath(outputPath),
      format: ext,
      actionCount: actionResults.actions.length,
      actions: actionResults.actions,
      warnings: checks,
      note: '默认已生成编辑副本，未覆盖原文件。',
    })
  }

  async _runActions(filePath, actions, { useBatch = false, allowRawXml = false } = {}) {
    if (useBatch === true && actions?.length) {
      return await this._runBatchActions(filePath, actions, { allowRawXml })
    }

    let compiled
    try {
      compiled = compileOfficeActions(filePath, actions || [], {
        allowRawXml,
        allowBatch: false,
      })
    } catch (err) {
      return {
        success: false,
        code: err.code || 'OFFICE_ACTION_COMPILE_FAILED',
        message: err.message,
        actionIndex: Number.isInteger(err.actionIndex) ? err.actionIndex : undefined,
      }
    }

    const results = []
    for (const item of compiled) {
      const result = await runOfficeCli(item.args, {
        timeoutMs: 120000,
        maxBuffer: 4 * 1024 * 1024,
        cwd: path.dirname(filePath),
      })
      results.push({
        index: item.index,
        command: item.command,
        success: result.code === 0,
        ...summarizeResult(result, result.code === 0 ? 1200 : 3000),
      })
      if (result.code !== 0) {
        return {
          success: false,
          code: result.code === 124 ? 'OFFICECLI_TIMEOUT' : 'OFFICE_ACTION_FAILED',
          message: `Office action 执行失败：${item.command}`,
          actionIndex: item.index,
          outputPath: this._paths.toVirtualPath(filePath),
          actions: results,
        }
      }
    }
    return { success: true, actions: results }
  }

  async _runBatchActions(filePath, actions, { allowRawXml = false } = {}) {
    let compiled
    try {
      compiled = compileOfficeBatchActions(filePath, actions || [], {
        allowRawXml,
        allowBatch: true,
      })
    } catch (err) {
      return {
        success: false,
        code: err.code || 'OFFICE_BATCH_COMPILE_FAILED',
        message: err.message,
        actionIndex: Number.isInteger(err.actionIndex) ? err.actionIndex : undefined,
      }
    }

    const input = JSON.stringify(compiled.map(item => item.batchEntry), null, 2)
    const result = await runOfficeCli(['batch', filePath], {
      timeoutMs: Math.max(120000, compiled.length * 10000),
      maxBuffer: 8 * 1024 * 1024,
      cwd: path.dirname(filePath),
      input,
    })
    const actionsResult = compiled.map(item => ({
      index: item.index,
      command: item.command,
      success: result.code === 0,
    }))
    if (result.code !== 0) {
      return {
        success: false,
        code: result.code === 124 ? 'OFFICECLI_TIMEOUT' : 'OFFICE_BATCH_FAILED',
        message: 'Office batch 执行失败。',
        outputPath: this._paths.toVirtualPath(filePath),
        actions: actionsResult,
        batch: summarizeResult(result, 5000),
      }
    }
    return {
      success: true,
      mode: 'batch',
      actions: actionsResult,
      batch: summarizeResult(result, 5000),
    }
  }

  _shouldRunChecks({ runChecks = true, useBatch = false, allowRawXml = false } = {}) {
    return runChecks !== false || useBatch === true || allowRawXml === true
  }

  async _runChecks(filePath) {
    const warnings = []
    const issues = await runOfficeCli(['view', filePath, 'issues', '--limit', '50'], {
      timeoutMs: 30000,
      maxBuffer: 1024 * 1024,
      cwd: path.dirname(filePath),
    })
    if (issues.code === 0 && String(issues.stdout || '').trim()) {
      warnings.push({ type: 'issues', content: clipText(issues.stdout, 5000) })
    } else if (issues.code !== 0 && issues.code !== 127) {
      warnings.push({ type: 'issues_check_failed', content: clipText(issues.stderr || issues.stdout, 1600) })
    }

    const validate = await runOfficeCli(['validate', filePath], {
      timeoutMs: 30000,
      maxBuffer: 1024 * 1024,
      cwd: path.dirname(filePath),
    })
    if (validate.code !== 0 && validate.code !== 127) {
      warnings.push({ type: 'validate_failed', content: clipText(validate.stderr || validate.stdout, 3000) })
    }
    return warnings
  }
}
