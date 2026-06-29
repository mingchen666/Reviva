import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tool } from 'langchain'
import { z } from 'zod'
import { ToolPathGuard } from './ToolPathGuard.js'

const SCRIPT_EXTS = new Set(['.py'])
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024
const SCENE_BASES = new Set(['Scene', 'MovingCameraScene', 'ThreeDScene', 'ZoomedScene', 'GraphScene', 'LinearTransformationScene'])
const QUALITY_FLAGS = {
  draft: '-ql',
  low: '-ql',
  medium: '-qm',
  high: '-qh',
}
let systemEnvPromise = null

function _jsonError(code, message, extra = {}) {
  return JSON.stringify({ success: false, code, message, ...extra })
}

function _clip(text, max = 30000) {
  const value = String(text || '')
  return value.length > max ? value.slice(0, max) : value
}

function _runRaw(command, args, { timeoutMs = 5000, maxBuffer = 128 * 1024, cwd = undefined, shell = false, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
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

function _pathKey(env) {
  return Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH'
}

function _splitPath(value) {
  return String(value || '').split(path.delimiter).map(p => p.trim()).filter(Boolean)
}

function _appendPath(parts, seen, value) {
  const expanded = _expandEnvVars(value)
  if (!expanded) return
  for (const item of _splitPath(expanded)) {
    const key = process.platform === 'win32' ? item.toLowerCase() : item
    if (!seen.has(key)) {
      seen.add(key)
      parts.push(item)
    }
  }
}

function _expandEnvVars(value, env = process.env) {
  return String(value || '').replace(/%([^%]+)%/g, (_, name) => env[name] || env[name.toUpperCase()] || env[name.toLowerCase()] || '')
}

async function _queryWindowsRegistryPath(root, subkey) {
  const result = await _runRaw('reg.exe', ['query', `${root}\\${subkey}`, '/v', 'Path'], {
    timeoutMs: 3000,
    maxBuffer: 64 * 1024,
    shell: false,
  })
  if (result.code !== 0) return ''
  const line = result.stdout.split(/\r?\n/).find(l => /\sPath\s+REG_/i.test(l))
  return line?.replace(/^\s*Path\s+REG_\w+\s+/i, '').trim() || ''
}

function _commonWindowsToolPaths() {
  const home = process.env.USERPROFILE || ''
  const local = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '')
  const roaming = process.env.APPDATA || (home ? path.join(home, 'AppData', 'Roaming') : '')
  const candidates = []
  for (let minor = 13; minor >= 8; minor--) {
    candidates.push(path.join(local, 'Programs', 'Python', `Python3${minor}`, 'Scripts'))
    candidates.push(path.join(roaming, 'Python', `Python3${minor}`, 'Scripts'))
  }
  candidates.push(
    path.join(local, 'Microsoft', 'WindowsApps'),
    path.join(home, 'miniconda3', 'Scripts'),
    path.join(home, 'miniconda3', 'condabin'),
    path.join(home, 'anaconda3', 'Scripts'),
    path.join(home, 'anaconda3', 'condabin'),
    path.join(home, 'mambaforge', 'Scripts'),
    path.join(home, 'mambaforge', 'condabin'),
  )
  return candidates
}

async function _getSystemEnv() {
  if (systemEnvPromise) return systemEnvPromise
  systemEnvPromise = (async () => {
    const env = { ...process.env }
    const key = _pathKey(env)
    const parts = []
    const seen = new Set()
    _appendPath(parts, seen, env[key])

    if (process.platform === 'win32') {
      _appendPath(parts, seen, await _queryWindowsRegistryPath('HKCU', 'Environment'))
      _appendPath(parts, seen, await _queryWindowsRegistryPath('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'))
      for (const candidate of _commonWindowsToolPaths()) _appendPath(parts, seen, candidate)
    }

    env[key] = parts.join(path.delimiter)
    env.PATH = env[key]
    env.Path = env[key]
    return env
  })()
  return systemEnvPromise
}

async function _run(command, args, { timeoutMs = 120000, maxBuffer = 4 * 1024 * 1024, cwd = undefined, shell = false } = {}) {
  const env = await _getSystemEnv()
  return _runRaw(command, args, { timeoutMs, maxBuffer, cwd, shell, env })
}

function _formatAttempt(candidate) {
  const command = [candidate.command, ...(candidate.args || [])].join(' ')
  if (candidate.powerShellCommand) return `${candidate.powerShellCommand} --version (PowerShell)`
  return candidate.shell ? `${command} (shell)` : command
}

async function _firstWorkingCommand(candidates, { timeoutMs = 5000 } = {}) {
  const attempts = []
  for (const candidate of candidates) {
    const result = await _run(candidate.command, candidate.args, {
      timeoutMs,
      maxBuffer: 64 * 1024,
      shell: !!candidate.shell,
    })
    attempts.push({
      command: _formatAttempt(candidate),
      code: result.code,
      detail: _clip(result.stderr || result.stdout, 1000),
    })
    if (result.code === 0) return { ...candidate, result }
  }
  return { missing: true, attempts }
}

function _quotePowerShellArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function _powerShellArgs(command, args) {
  return [
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `& ${command} ${args.map(_quotePowerShellArg).join(' ')}`,
  ]
}

async function _runCandidate(candidate, runtimeArgs, options) {
  if (candidate.powerShellCommand) {
    return _run('powershell.exe', _powerShellArgs(candidate.powerShellCommand, runtimeArgs), options)
  }
  return _run(candidate.command, [...(candidate.runArgsPrefix || []), ...runtimeArgs], {
    ...options,
    shell: !!candidate.shell,
  })
}

function _manimCandidates() {
  return [
    { command: 'python', args: ['-m', 'manim', '--version'], runArgsPrefix: ['-m', 'manim', 'render'], kind: 'python-module' },
    { command: 'py', args: ['-3', '-m', 'manim', '--version'], runArgsPrefix: ['-3', '-m', 'manim', 'render'], kind: 'python-module' },
    { command: 'py', args: ['-m', 'manim', '--version'], runArgsPrefix: ['-m', 'manim', 'render'], kind: 'python-module' },
    { command: 'python3', args: ['-m', 'manim', '--version'], runArgsPrefix: ['-m', 'manim', 'render'], kind: 'python-module' },
    { command: 'manim', args: ['--version'], runArgsPrefix: ['render'], kind: 'cli-wrapper' },
    { command: 'manimce', args: ['--version'], runArgsPrefix: ['render'], kind: 'cli-wrapper' },
  ]
}

function _pipInstallCandidates() {
  return [
    { command: 'python', args: ['-m', 'pip', 'install', '--user', 'manim'] },
    { command: 'py', args: ['-3', '-m', 'pip', 'install', '--user', 'manim'] },
    { command: 'py', args: ['-m', 'pip', 'install', '--user', 'manim'] },
    { command: 'python3', args: ['-m', 'pip', 'install', '--user', 'manim'] },
  ]
}

async function _installManimModule() {
  const attempts = []
  for (const candidate of _pipInstallCandidates()) {
    const result = await _run(candidate.command, candidate.args, {
      timeoutMs: 10 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    })
    attempts.push({
      command: [candidate.command, ...candidate.args].join(' '),
      code: result.code,
      detail: _clip(result.stderr || result.stdout, 4000),
    })
    if (result.code === 0) return { success: true, attempts }
  }
  return { success: false, attempts }
}

async function _ensureManimCommand({ autoInstall = false } = {}) {
  const found = await _firstWorkingCommand(_manimCandidates())
  if (!found?.missing) return found

  if (!autoInstall) return found
  const install = await _installManimModule()
  const afterInstall = await _firstWorkingCommand(_manimCandidates())
  if (!afterInstall?.missing) return { ...afterInstall, installedByPip: install.success, installAttempts: install.attempts }
  return {
    ...afterInstall,
    missing: true,
    attempts: [...(found.attempts || []), ...(afterInstall.attempts || [])],
    installAttempts: install.attempts,
  }
}

async function _findManimCommand() {
  const found = await _ensureManimCommand({ autoInstall: false })
  return found?.missing ? null : found
}

async function _diagnoseManimCommand() {
  return _ensureManimCommand({ autoInstall: false })
}

function _missingManimMessage() {
  return [
    '未检测到可用的 Manim Community Edition。',
    '请先安装 Python 包 manim（官方文档：https://docs.manim.community/en/stable/installation.html），或在已安装 Manim 的 Python/Conda/venv 环境中运行。',
    '如果系统里已经安装，请把对应 Python 可执行文件或 Scripts 目录加入系统 PATH，然后重启 MindSpace。',
  ].join(' ')
}

async function _findLatexCommand() {
  const found = await _firstWorkingCommand([
    { command: 'latex', args: ['--version'] },
    { command: 'pdflatex', args: ['--version'] },
    { command: 'xelatex', args: ['--version'] },
  ])
  return found?.missing ? null : found
}

async function _findDvisvgmCommand() {
  const found = await _firstWorkingCommand([
    { command: 'dvisvgm', args: ['--version'] },
  ])
  return found?.missing ? null : found
}

async function _findMiktexCommand() {
  const found = await _firstWorkingCommand([
    { command: 'mpm', args: ['--version'] },
  ])
  return found?.missing ? null : found
}

async function _findFfmpegCommand() {
  const found = await _firstWorkingCommand([
    { command: 'ffmpeg', args: ['-version'] },
  ])
  return found?.missing ? null : found
}

function _parseVersion(text) {
  const value = String(text || '')
  return value.match(/Manim\s+Community\s+v?([\d.\w-]+)/i)?.[1] ||
    value.match(/v?([\d]+\.[\d.]+)/)?.[1] ||
    ''
}

function _displayCommand(candidate) {
  if (!candidate) return ''
  if (candidate.powerShellCommand) return candidate.powerShellCommand
  return [candidate.command, ...(candidate.runArgsPrefix || [])].join(' ')
}

function _usesLatex(source) {
  return /\b(MathTex|Tex)\s*\(/.test(source || '')
}

function _latexMissingMessage({ miktexAvailable = false, engineAvailable = false, dvisvgmAvailable = false } = {}) {
  if (miktexAvailable && (!engineAvailable || !dvisvgmAvailable)) {
    return '检测到 MiKTeX，但公式渲染所需的 latex/pdflatex/xelatex 或 dvisvgm 不可用。请打开 MiKTeX Console 更新/安装缺失组件，确认 MiKTeX bin 目录已加入系统 PATH，然后重启 MindSpace。'
  }
  return '此脚本使用 MathTex/Tex，需要本机 LaTeX 发行版。Windows 推荐安装 MiKTeX：https://miktex.org/download；安装后确认 latex/pdflatex/xelatex、dvisvgm 和 mpm 可在 PATH 中运行，或改用 Text 标签回退。'
}

function _sceneNamesFromSource(source) {
  const names = []
  const re = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/gm
  let match
  while ((match = re.exec(source || ''))) {
    const bases = match[2].split(',').map(s => s.trim().split('.').pop())
    if (bases.some(base => SCENE_BASES.has(base))) names.push(match[1])
  }
  return [...new Set(names)]
}

function _latestMp4(dir) {
  if (!fs.existsSync(dir)) return null
  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
        files.push({ path: abs, mtimeMs: fs.statSync(abs).mtimeMs })
      }
    }
  }
  walk(dir)
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path || null
}

export class ManimToolService {
  constructor(workDirService, options = {}) {
    this._paths = new ToolPathGuard(workDirService, options)
  }

  async invoke(input = {}, allowedOperations = []) {
    const operation = String(input.operation || '')
    if (!allowedOperations.includes(operation)) {
      return _jsonError('TOOL_OPERATION_NOT_ALLOWED', `当前 Agent 未启用 Manim 子工具：${operation || '(未指定)'}`)
    }

    try {
      switch (operation) {
        case 'check':
          return await this._check()
        case 'list_scenes':
          return await this._listScenes(input)
        case 'render':
          return await this._render(input)
        default:
          return _jsonError('TOOL_UNSUPPORTED_OPERATION', `不支持的 Manim operation：${operation}`)
      }
    } catch (err) {
      return _jsonError(err.code || 'TOOL_EXECUTION_FAILED', err.message || 'Manim 工具执行失败')
    }
  }

  async _check() {
    const manimDiag = await _diagnoseManimCommand()
    const manim = manimDiag?.missing ? null : manimDiag
    const ffmpeg = await _findFfmpegCommand()
    const latex = await _findLatexCommand()
    const dvisvgm = await _findDvisvgmCommand()
    const miktex = await _findMiktexCommand()
    const latexReady = !!latex && !!dvisvgm
    if (!manim) {
      return _jsonError('TOOL_DEPENDENCY_MISSING', _missingManimMessage(), {
        ffmpegAvailable: !!ffmpeg,
        latexAvailable: latexReady,
        latexEngineAvailable: !!latex,
        dvisvgmAvailable: !!dvisvgm,
        miktexAvailable: !!miktex,
        attemptedCommands: manimDiag?.attempts || [],
        installAttempts: manimDiag?.installAttempts || [],
      })
    }
    if (!ffmpeg) {
      return _jsonError('TOOL_DEPENDENCY_MISSING', '缺少 FFmpeg。Manim 渲染 MP4 需要 FFmpeg，请到“设置 > 环境检测”安装或修复 FFmpeg。', {
        manimAvailable: true,
        manimCommand: _displayCommand(manim),
        manimVersion: _parseVersion(manim.result.stdout || manim.result.stderr),
        latexAvailable: latexReady,
        latexEngineAvailable: !!latex,
        dvisvgmAvailable: !!dvisvgm,
        miktexAvailable: !!miktex,
        installedByPip: !!manim.installedByPip,
      })
    }
    return JSON.stringify({
      success: true,
      operation: 'check',
      manimAvailable: true,
      manimCommand: _displayCommand(manim),
      manimRuntime: manim.kind || '',
      manimVersion: _parseVersion(manim.result.stdout || manim.result.stderr),
      installedByPip: !!manim.installedByPip,
      ffmpegAvailable: true,
      latexAvailable: latexReady,
      latexEngineAvailable: !!latex,
      latexCommand: latex?.command || '',
      dvisvgmAvailable: !!dvisvgm,
      dvisvgmCommand: dvisvgm?.command || '',
      miktexAvailable: !!miktex,
      miktexCommand: miktex?.command || '',
      note: latexReady ? '' : '未检测到完整 LaTeX 公式渲染环境。普通形状/文字动画仍可渲染；MathTex/Tex 推荐安装 MiKTeX：https://miktex.org/download。',
    })
  }

  _resolveScript(inputPath) {
    return this._paths.resolveInput(inputPath, { allowedExts: SCRIPT_EXTS, maxBytes: MAX_SCRIPT_BYTES })
  }

  _readScript(inputPath) {
    const resolved = this._resolveScript(inputPath)
    return { resolved, source: fs.readFileSync(resolved, 'utf-8') }
  }

  async _listScenes({ path: inputPath }) {
    const { resolved, source } = this._readScript(inputPath)
    return JSON.stringify({
      success: true,
      operation: 'list_scenes',
      path: this._paths.toVirtualPath(resolved),
      scenes: _sceneNamesFromSource(source),
      usesLatex: _usesLatex(source),
    })
  }

  async _render({ path: inputPath, sceneName = '', quality = 'low', transparent = false }) {
    const { resolved, source } = this._readScript(inputPath)
    const manimDiag = await _diagnoseManimCommand()
    const manim = manimDiag?.missing ? null : manimDiag
    if (!manim) {
      return _jsonError('TOOL_DEPENDENCY_MISSING', _missingManimMessage(), {
        attemptedCommands: manimDiag?.attempts || [],
        installAttempts: manimDiag?.installAttempts || [],
      })
    }
    if (!await _findFfmpegCommand()) {
      return _jsonError('TOOL_DEPENDENCY_MISSING', '缺少 FFmpeg。Manim 渲染 MP4 需要 FFmpeg，请到“设置 > 环境检测”安装或修复 FFmpeg。')
    }

    const usesLatex = _usesLatex(source)
    if (usesLatex) {
      const latex = await _findLatexCommand()
      const dvisvgm = await _findDvisvgmCommand()
      const miktex = await _findMiktexCommand()
      if (!latex || !dvisvgm) return _jsonError('TOOL_DEPENDENCY_MISSING', _latexMissingMessage({
        miktexAvailable: !!miktex,
        engineAvailable: !!latex,
        dvisvgmAvailable: !!dvisvgm,
      }), {
        usesLatex: true,
        latexEngineAvailable: !!latex,
        dvisvgmAvailable: !!dvisvgm,
        miktexAvailable: !!miktex,
      })
    }

    const scenes = _sceneNamesFromSource(source)
    const targetScene = String(sceneName || '').trim() || (scenes.length === 1 ? scenes[0] : '')
    if (!targetScene) {
      return _jsonError('TOOL_INVALID_ARGUMENT', '脚本包含多个或未识别到 Scene，请指定 sceneName。', { scenes })
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(targetScene)) {
      return _jsonError('TOOL_INVALID_ARGUMENT', 'sceneName 必须是合法 Python 类名。')
    }

    const qualityFlag = QUALITY_FLAGS[String(quality || 'low')] || QUALITY_FLAGS.low
    const outputDir = this._paths.ensureOutputDir('manim')
    const renderDir = path.join(outputDir, `${path.parse(resolved).name}_${targetScene}_${Date.now()}`)
    fs.mkdirSync(renderDir, { recursive: true })

    const args = [
      qualityFlag,
      resolved,
      targetScene,
      '--media_dir',
      renderDir,
    ]
    if (transparent) args.push('--transparent')

    const result = await _runCandidate(manim, args, {
      timeoutMs: 5 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      cwd: path.dirname(resolved),
    })
    if (result.code !== 0) {
      return _jsonError(result.code === 124 ? 'TOOL_TIMEOUT' : 'TOOL_EXECUTION_FAILED', 'Manim 渲染失败。', {
        sceneName: targetScene,
        detail: _clip(result.stderr || result.stdout, 4000),
      })
    }

    const mp4 = _latestMp4(renderDir)
    let finalMp4 = mp4
    if (mp4) {
      const finalPath = this._paths.makeOutputPath('manim', `${path.parse(resolved).name}_${targetScene}.mp4`, { suffix: 'render', ext: 'mp4' })
      fs.copyFileSync(mp4, finalPath)
      finalMp4 = finalPath
    }
    return JSON.stringify({
      success: true,
      operation: 'render',
      path: this._paths.toVirtualPath(resolved),
      sceneName: targetScene,
      quality: String(quality || 'low'),
      usesLatex,
      manimCommand: _displayCommand(manim),
      outputDir: this._paths.toVirtualPath(renderDir),
      outputPath: finalMp4 ? this._paths.toVirtualPath(finalMp4) : '',
      renderOutputPath: mp4 ? this._paths.toVirtualPath(mp4) : '',
      bytes: finalMp4 ? fs.statSync(finalMp4).size : 0,
      stderr: _clip(result.stderr, 3000),
    })
  }
}

export function createManimTool(workDirService, allowedOperations = [], options = {}) {
  const service = new ManimToolService(workDirService, options)
  const allowed = [...new Set(allowedOperations)]
  return tool(
    async (input) => service.invoke(input, allowed),
    {
      name: 'manim_tool',
      description: [
        'Manim 工具集的受控路由工具。只允许当前 Agent 已启用的 operation。',
        `当前允许的 operation：${allowed.join(', ') || '无'}`,
        '适合学习场景中的数学、物理、几何、算法和抽象概念动画：检查环境、列出 Scene、渲染 MP4。',
        '输入 path 必须是授权工作区内的 .py Manim 脚本；最终 MP4 输出写入 /agents/{agent}/outputs/YYYY-MM-DD/。',
        '不开放 raw command。脚本使用 MathTex/Tex 时需要本机 LaTeX；普通 Text/形状动画通常不需要 LaTeX。',
      ].join('\n'),
      schema: z.object({
        operation: z.enum(['check', 'list_scenes', 'render']).describe('要执行的 Manim 子操作。'),
        path: z.string().optional().describe('Manim .py 脚本路径。check 不需要；list_scenes/render 必须提供。'),
        sceneName: z.string().optional().describe('要渲染的 Scene 类名。若脚本只有一个 Scene 可省略。'),
        quality: z.enum(['draft', 'low', 'medium', 'high']).optional().describe('渲染质量。draft/low 使用 -ql，medium 使用 -qm，high 使用 -qh。默认 low。'),
        transparent: z.boolean().optional().describe('是否渲染透明背景。默认 false。'),
      }),
    },
  )
}
