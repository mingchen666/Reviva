// agents/tools/customUserTools.js — extracted from langchainTools.js
// User-defined custom tools: API and script type.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { tool } from 'langchain'
import { z } from 'zod'
import { validateSafeCommand } from '../../security/SafeCommandRunner.js'
import { _validateCommand } from './execCommandTools.js'
import { _workDirService, _toolRunContext, _cloudCtx } from './toolContext.js'


const CUSTOM_SCRIPT_TOOLS_ENABLED = false
const CUSTOM_TOOL_OUTPUT_LIMIT = 30000
const CUSTOM_SCRIPT_MAX_BUFFER = 1024 * 1024
const CUSTOM_SCRIPT_TIMEOUT_MS = 30000
const CUSTOM_SCRIPT_EXTS = new Set(['.py', '.js', '.mjs', '.cjs'])

function _clipOutput(value, limit = CUSTOM_TOOL_OUTPUT_LIMIT) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text || text.length <= limit) return { text: text || '', truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

function _normalizeCustomToolRecord(row) {
  return {
    id: row?.id || '',
    name: row?.name || row?.id || '自定义工具',
    description: row?.description || row?.desc || '',
    type: row?.type || 'api',
    apiUrl: row?.apiUrl || row?.api_url || '',
    method: String(row?.method || 'POST').toUpperCase(),
    headers: row?.headers || {},
    params: Array.isArray(row?.params) ? row.params : [],
    responseFormat: row?.responseFormat || row?.response_format || 'JSON',
    scriptPath: row?.scriptPath || row?.script_path || '',
    permReq: row?.permReq || row?.perm_required || '',
    enabled: row?.enabled !== false && row?.enabled !== 0,
  }
}

function _customToolSchema(params = []) {
  const shape = {}
  for (const p of params) {
    const name = String(p?.name || '').trim()
    if (!name) continue
    let schema = z.any()
    if (p?.desc) schema = schema.describe(String(p.desc))
    shape[name] = p?.required ? schema : schema.optional()
  }
  return z.object(shape).passthrough()
}

function _normalizeHeaders(headers) {
  const parsed = typeof headers === 'string'
    ? (() => { try { return JSON.parse(headers) } catch { return {} } })()
    : headers
  const out = {}
  for (const [key, value] of Object.entries(parsed || {})) {
    if (!key || value === undefined || value === null || value === '') continue
    out[key] = String(value)
  }
  return out
}

function _hasToolPermission(required) {
  if (!required) return true
  const permissions = _toolRunContext.permissions
  if (!permissions || !Object.prototype.hasOwnProperty.call(permissions, required)) return true
  return !!permissions[required]
}

async function _runApiCustomTool(def, input = {}) {
  if (!def.apiUrl) {
    return JSON.stringify({ success: false, code: 'CUSTOM_TOOL_NOT_CONFIGURED', message: '自定义 API 工具缺少 API URL。' })
  }
  if (!_hasToolPermission(def.permReq)) {
    return JSON.stringify({ success: false, code: 'TOOL_PERMISSION_DENIED', message: `当前 Agent 未开启 ${def.permReq} 权限。` })
  }

  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(def.method) ? def.method : 'POST'

  try {
    const url = new URL(def.apiUrl)
    const headers = _normalizeHeaders(def.headers)
    const init = {
      method,
      headers,
      signal: AbortSignal.timeout(30000),
    }

    if (method === 'GET') {
      for (const [key, value] of Object.entries(args)) {
        if (value === undefined || value === null) continue
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
      }
    } else {
      if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json'
      }
      init.body = JSON.stringify(args)
    }

    const resp = await fetch(url, init)
    const contentType = resp.headers.get('content-type') || ''
    const raw = await resp.text()
    let body = raw
    if (contentType.includes('application/json')) {
      try { body = JSON.parse(raw) } catch { body = raw }
    }
    const clipped = _clipOutput(body)
    return JSON.stringify({
      success: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      contentType,
      body: clipped.text,
      truncated: clipped.truncated,
    })
  } catch (e) {
    return JSON.stringify({ success: false, code: 'CUSTOM_API_TOOL_FAILED', message: e.message })
  }
}

function _scriptRunnerFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.py') return { command: 'python', args: [filePath], kind: 'python' }
  if (['.js', '.mjs', '.cjs'].includes(ext)) return { command: 'node', args: [filePath], kind: 'node' }
  return null
}

async function _runScriptCustomTool(def, input = {}) {
  if (!CUSTOM_SCRIPT_TOOLS_ENABLED) {
    return JSON.stringify({ success: false, code: 'CUSTOM_SCRIPT_TOOL_DISABLED', message: '自定义脚本工具暂未开放运行。' })
  }
  const required = def.permReq || 'execCommand'
  if (!_hasToolPermission(required)) {
    return JSON.stringify({ success: false, code: 'TOOL_PERMISSION_DENIED', message: `当前 Agent 未开启 ${required} 权限。` })
  }
  if (!_workDirService) {
    return JSON.stringify({ success: false, code: 'NO_WORKSPACE', message: '未初始化工作空间，无法执行自定义脚本工具。' })
  }
  if (!def.scriptPath) {
    return JSON.stringify({ success: false, code: 'CUSTOM_TOOL_NOT_CONFIGURED', message: '自定义脚本工具缺少脚本路径。' })
  }

  let resolved
  try {
    resolved = _workDirService.resolveAndValidate(def.scriptPath, 'any')
  } catch (e) {
    return JSON.stringify({ success: false, code: 'TOOL_INPUT_NOT_ALLOWED', message: `安全限制：${e.message}` })
  }

  const normalized = resolved.replace(/\\/g, '/').toLowerCase()
  if (normalized.includes('/.reviva/')) {
    return JSON.stringify({ success: false, code: 'TOOL_INPUT_NOT_ALLOWED', message: '安全限制：自定义脚本不能位于系统元数据目录。' })
  }
  if (!fs.existsSync(resolved)) {
    return JSON.stringify({ success: false, code: 'FILE_NOT_FOUND', message: '自定义脚本文件不存在。' })
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!CUSTOM_SCRIPT_EXTS.has(ext)) {
    return JSON.stringify({ success: false, code: 'UNSUPPORTED_SCRIPT_TYPE', message: '自定义脚本工具当前仅支持 .py、.js、.mjs、.cjs。' })
  }

  const runner = _scriptRunnerFor(resolved)
  const validationError = _validateCommand(`${runner.command} ${resolved}`)
  if (validationError) {
    return JSON.stringify({ success: false, exitCode: 126, stdout: '', stderr: validationError })
  }

  return new Promise((resolve) => {
    const child = spawn(runner.command, runner.args, {
      cwd: path.dirname(resolved),
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    })
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutSize = 0
    let stderrSize = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(JSON.stringify(result))
    }

    const append = (chunks, data, kind) => {
      if (kind === 'stdout') {
        stdoutSize += data.length
        if (stdoutSize <= CUSTOM_SCRIPT_MAX_BUFFER) chunks.push(data)
      } else {
        stderrSize += data.length
        if (stderrSize <= CUSTOM_SCRIPT_MAX_BUFFER) chunks.push(data)
      }
    }

    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ success: false, exitCode: 124, stdout: '', stderr: 'custom script timeout' })
    }, CUSTOM_SCRIPT_TIMEOUT_MS)

    child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
    child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
    child.on('error', err => finish({ success: false, exitCode: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      finish({
        success: code === 0,
        exitCode: code ?? 0,
        stdout: _clipOutput(stdout).text,
        stderr: _clipOutput(stderr, 8000).text,
        stdoutTruncated: stdoutSize > CUSTOM_SCRIPT_MAX_BUFFER,
        stderrTruncated: stderrSize > CUSTOM_SCRIPT_MAX_BUFFER,
      })
    })

    try {
      child.stdin.write(JSON.stringify(input && typeof input === 'object' ? input : {}))
      child.stdin.end()
    } catch (e) {
      finish({ success: false, exitCode: 1, stdout: '', stderr: e.message })
    }
  })
}

function _createUserDefinedTool(row) {
  const def = _normalizeCustomToolRecord(row)
  const typeText = def.type === 'script'
    ? '本地脚本工具暂未开放运行。'
    : '工具会把参数作为 HTTP 请求参数发送，并返回响应正文。'
  return tool(
    async (input) => {
      if (def.type === 'script') return _runScriptCustomTool(def, input)
      return _runApiCustomTool(def, input)
    },
    {
      name: def.id,
      description: [
        def.description || def.name,
        typeText,
        def.params.length ? `参数：${def.params.map(p => `${p.name}${p.required ? '(必填)' : ''}`).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
      schema: _customToolSchema(def.params),
    },
  )
}

export function getUserDefinedLangchainTools(toolIds, customToolRows = []) {
  if (!toolIds?.length || !customToolRows?.length) return []
  const idSet = new Set((toolIds || []).filter(id => typeof id === 'string'))
  return customToolRows
    .map(_normalizeCustomToolRecord)
    .filter(t => t.enabled && idSet.has(t.id) && (CUSTOM_SCRIPT_TOOLS_ENABLED || t.type !== 'script'))
    .map(_createUserDefinedTool)
}


