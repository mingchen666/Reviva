import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tool } from 'langchain'
import { z } from 'zod'
import { ToolPathGuard } from './ToolPathGuard.js'

const INPUT_EXTS = new Set(['.md', '.markdown', '.txt', '.docx', '.html', '.htm', '.tex', '.latex', '.epub'])
const OUTPUT_FORMATS = new Set(['markdown', 'html', 'docx', 'pdf', 'pptx'])
const OUTPUT_EXT = {
  markdown: 'md',
  html: 'html',
  docx: 'docx',
  pdf: 'pdf',
  pptx: 'pptx',
}
const MAX_INPUT_BYTES = 100 * 1024 * 1024

function _jsonError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

function _clip(text, max = 30000) {
  const value = String(text || '')
  return value.length > max ? value.slice(0, max) : value
}

function _run(command, args, { timeoutMs = 120000, maxBuffer = 4 * 1024 * 1024, cwd = undefined } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      finish({ code: 124, stdout: '', stderr: `${command} timeout` })
    }, timeoutMs)

    child.stdout.on('data', data => append(stdoutChunks, data))
    child.stderr.on('data', data => append(stderrChunks, data))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    }))
  })
}

export class PandocToolService {
  constructor(workDirService, options = {}) {
    this._paths = new ToolPathGuard(workDirService, options)
  }

  async invoke(input = {}, allowedOperations = []) {
    const operation = String(input.operation || '')
    if (!allowedOperations.includes(operation)) {
      return _jsonError('TOOL_OPERATION_NOT_ALLOWED', `当前 Agent 未启用 Pandoc 子工具：${operation || '(未指定)'}`)
    }

    const dependency = await this._checkDependency()
    if (!dependency.success) return JSON.stringify(dependency)

    try {
      switch (operation) {
        case 'formats':
          return await this._formats()
        case 'convert':
          return await this._convert(input)
        default:
          return _jsonError('TOOL_UNSUPPORTED_OPERATION', `不支持的 Pandoc operation：${operation}`)
      }
    } catch (err) {
      return _jsonError(err.code || 'TOOL_EXECUTION_FAILED', err.message || 'Pandoc 工具执行失败')
    }
  }

  async _checkDependency() {
    const result = await _run('pandoc', ['--version'], { timeoutMs: 5000, maxBuffer: 64 * 1024 })
    if (result.code === 127) {
      return {
        success: false,
        code: 'TOOL_DEPENDENCY_MISSING',
        message: '缺少 pandoc。请到“设置 > 环境检测”安装或修复 Pandoc。',
      }
    }
    if (result.code !== 0) {
      return {
        success: false,
        code: 'TOOL_DEPENDENCY_UNAVAILABLE',
        message: 'pandoc 当前不可用。',
        detail: _clip(result.stderr || result.stdout, 1200),
      }
    }
    return { success: true }
  }

  async _formats() {
    const [inputs, outputs] = await Promise.all([
      _run('pandoc', ['--list-input-formats'], { timeoutMs: 10000, maxBuffer: 512 * 1024 }),
      _run('pandoc', ['--list-output-formats'], { timeoutMs: 10000, maxBuffer: 512 * 1024 }),
    ])
    if (inputs.code !== 0 || outputs.code !== 0) {
      return _jsonError('TOOL_EXECUTION_FAILED', '读取 Pandoc 支持格式失败。', {
        detail: _clip(inputs.stderr || outputs.stderr || inputs.stdout || outputs.stdout, 2000),
      })
    }
    return JSON.stringify({
      success: true,
      operation: 'formats',
      inputFormats: inputs.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      outputFormats: outputs.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      recommendedOutputFormats: [...OUTPUT_FORMATS],
    })
  }

  async _convert({ path: inputPath, from, to = 'markdown', standalone = true }) {
    const resolved = this._paths.resolveInput(inputPath, { allowedExts: INPUT_EXTS, maxBytes: MAX_INPUT_BYTES })
    const target = String(to || 'markdown').toLowerCase()
    if (!OUTPUT_FORMATS.has(target)) {
      return _jsonError('TOOL_UNSUPPORTED_FORMAT', `不支持的输出格式：${target}`)
    }

    const outputPath = this._paths.makeOutputPath('pandoc', resolved, { suffix: target, ext: OUTPUT_EXT[target] })
    const args = [resolved, '-t', target, '-o', outputPath]
    if (from && /^[a-z0-9_+-]+$/i.test(from)) args.push('-f', from)
    if (standalone !== false) args.push('--standalone')

    const result = await _run('pandoc', args, {
      timeoutMs: target === 'pdf' ? 180000 : 120000,
      maxBuffer: 4 * 1024 * 1024,
      cwd: path.dirname(resolved),
    })
    if (result.code !== 0) {
      return _jsonError(result.code === 124 ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED', 'Pandoc 转换失败。', {
        detail: _clip(result.stderr || result.stdout, 3000),
      })
    }
    const exists = fs.existsSync(outputPath)
    return JSON.stringify({
      success: true,
      operation: 'convert',
      outputPath: exists ? this._paths.toVirtualPath(outputPath) : '',
      bytes: exists ? fs.statSync(outputPath).size : 0,
      stderr: _clip(result.stderr, 2000),
      note: target === 'pdf' ? 'PDF 转换依赖本机 LaTeX 环境；如果失败，请改用 docx/html 或安装 LaTeX。' : '',
    })
  }
}

export function createPandocTool(workDirService, allowedOperations = [], options = {}) {
  const service = new PandocToolService(workDirService, options)
  const allowed = [...new Set(allowedOperations)]
  return tool(
    async (input) => service.invoke(input, allowed),
    {
      name: 'pandoc_tool',
      description: [
        'Pandoc 工具集的受控路由工具。只允许当前 Agent 已启用的 operation。',
        `当前允许的 operation：${allowed.join(', ') || '无'}`,
        '适合学习场景中的讲义、笔记、论文、网页资料和报告导出。',
        '输入 path 必须位于授权工作区内；输出会写入 /agents/{agent}/outputs/YYYY-MM-DD/。',
      ].join('\n'),
      schema: z.object({
        operation: z.enum(['formats', 'convert']).describe('要执行的 Pandoc 子操作。'),
        path: z.string().optional().describe('convert 操作的输入文档路径，支持 /docs/... 或 /context/... 虚拟路径。formats 不需要。'),
        from: z.string().optional().describe('可选输入格式，例如 markdown、docx、html、latex、epub。通常可省略由 Pandoc 自动识别。'),
        to: z.enum(['markdown', 'html', 'docx', 'pdf', 'pptx']).optional().describe('输出格式，默认 markdown。'),
        standalone: z.boolean().optional().describe('是否生成独立文档，默认 true。'),
      }),
    },
  )
}
