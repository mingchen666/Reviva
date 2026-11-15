// Unified Python environment management for Reviva.
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { getSystemEnv } from './systemEnv.js'

const PYTHON_VERSION_TARGET = '3.11'
const MIN_PYTHON_VERSION = [3, 11]
// Built-in PyPI mirror presets. Users can pick one in Settings > Python venv,
// use a custom URL, or use the official PyPI (no mirror).
const PYPI_MIRROR_PRESETS = [
  { id: 'aliyun', label: '阿里云', url: 'https://mirrors.aliyun.com/pypi/simple/', host: 'mirrors.aliyun.com' },
  { id: 'tsinghua', label: '清华大学', url: 'https://pypi.tuna.tsinghua.edu.cn/simple/', host: 'pypi.tuna.tsinghua.edu.cn' },
  { id: 'ustc', label: '中科大', url: 'https://pypi.mirrors.ustc.edu.cn/simple/', host: 'pypi.mirrors.ustc.edu.cn' },
  { id: 'douban', label: '豆瓣', url: 'https://pypi.douban.com/simple/', host: 'pypi.douban.com' },
  { id: 'none', label: '官方源（不使用镜像）', url: '', host: '' },
]

function bundledArchKey() {
  const p = process.platform
  const a = process.arch
  if (p === 'win32') return `windows-${a}`
  if (p === 'darwin') return `macos-${a}`
  return `linux-${a}`
}

function resolveBundledDir() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'builtin-assets', 'bin', 'python')
    : path.join(app.getAppPath(), 'electron', 'builtin-assets', 'bin', 'python')
  return path.join(base, bundledArchKey())
}

function bundledInterpreterPath() {
  const dir = resolveBundledDir()
  if (process.platform === 'win32') {
    return path.join(dir, 'python', 'python.exe')
  }
  return path.join(dir, 'bin', `python${PYTHON_VERSION_TARGET}`)
}

function isBundledAvailable() {
  return fs.existsSync(bundledInterpreterPath())
}

function runBuffered(cmd, args, { timeoutMs = 600000, maxBuffer = 4 * 1024 * 1024, env = process.env, cwd } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { shell: false, windowsHide: true, env: { ...env }, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ code: 1, stdout: '', stderr: err.message, stdoutTruncated: false, stderrTruncated: false })
      return
    }
    const stdoutChunks = []
    const stderrChunks = []
    let stdoutSize = 0
    let stderrSize = 0
    let done = false
    const finish = (result) => { if (done) return; done = true; clearTimeout(timer); resolve(result) }
    const append = (chunks, data, kind) => {
      if (kind === 'stdout') { stdoutSize += data.length; if (stdoutSize <= maxBuffer) chunks.push(data) }
      else { stderrSize += data.length; if (stderrSize <= maxBuffer) chunks.push(data) }
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr: 'command timeout', stdoutTruncated: stdoutSize > maxBuffer, stderrTruncated: stderrSize > maxBuffer })
    }, timeoutMs)
    child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
    child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message, stdoutTruncated: false, stderrTruncated: false }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
      stdoutTruncated: stdoutSize > maxBuffer,
      stderrTruncated: stderrSize > maxBuffer,
    }))
  })
}

function parsePythonVersion(s) {
  const m = String(s || '').match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)]
}

function isVersionGE(v, min) {
  if (!v) return false
  for (let i = 0; i < min.length; i++) {
    const a = v[i] || 0
    const b = min[i]
    if (a > b) return true
    if (a < b) return false
  }
  return true
}

const SYSTEM_CANDIDATES = [
  { cmd: 'python', args: [] },
  { cmd: 'python3', args: [] },
  { cmd: 'py', args: ['-3'] },
]

export class PythonEnvService {
  constructor(dbService, workDirService) {
    this._db = dbService
    this._workDir = workDirService || null
    this._versionCache = null
  }

  _getSetting(key, fallback) {
    try {
      const v = this._db?.getSetting?.(key)
      return v === undefined || v === null ? fallback : v
    } catch { return fallback }
  }

  _setSetting(key, value) {
    try { this._db?.setSetting?.(key, value) } catch {}
  }

  getBuiltinInterpreter() { return bundledInterpreterPath() }
  isBundledReady() { return isBundledAvailable() }

  async detectSystemPython() {
    const env = await getSystemEnv()
    for (const c of SYSTEM_CANDIDATES) {
      const r = await runBuffered(c.cmd, [...c.args, '--version'], { timeoutMs: 8000, env })
      if (r.code === 0) {
        const v = parsePythonVersion(r.stdout || r.stderr)
        if (v) return { found: true, version: v.join('.'), versionParts: v, cmd: c.cmd, args: c.args, ok: isVersionGE(v, MIN_PYTHON_VERSION) }
      }
    }
    return { found: false, version: null, ok: false, error: '未找到系统 Python' }
  }

  getInterpreterSource() {
    const src = this._getSetting('python_interpreter_source', 'builtin')
    return src === 'system' ? 'system' : 'builtin'
  }

  setInterpreterSource(source) {
    this._setSetting('python_interpreter_source', source === 'system' ? 'system' : 'builtin')
  }

  // Returns { id, label, url, host } for the active PyPI mirror.
  // Reads python_pypi_mirror setting; supports preset ids or "custom" with python_pypi_mirror_url.
  getPypiMirror() {
    const id = this._getSetting('python_pypi_mirror', 'aliyun')
    if (id === 'none') return PYPI_MIRROR_PRESETS.find(m => m.id === 'none')
    if (id === 'custom') {
      const url = this._getSetting('python_pypi_mirror_url', '')
      const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
      return { id: 'custom', label: '自定义', url, host }
    }
    const preset = PYPI_MIRROR_PRESETS.find(m => m.id === id)
    return preset || PYPI_MIRROR_PRESETS[0]
  }

  setPypiMirror(id, customUrl) {
    this._setSetting('python_pypi_mirror', id)
    if (id === 'custom' && customUrl) this._setSetting('python_pypi_mirror_url', customUrl)
  }

  getPypiMirrorPresets() { return PYPI_MIRROR_PRESETS }

  // Returns pip install args for the current mirror, or [] if no mirror.
  _pypiMirrorArgs() {
    const m = this.getPypiMirror()
    if (!m.url) return []
    const args = ['-i', m.url]
    // Only add --trusted-host for custom mirrors that might use self-signed certs.
    // Built-in presets (aliyun/tsinghua/ustc/douban) use proper CA-signed certs,
    // so --trusted-host is unnecessary and matches normal pip install behavior.
    if (m.id === 'custom' && m.host) args.push("--trusted-host", m.host)
    return args
  }

  async resolveInterpreter() {
    const source = this.getInterpreterSource()
    if (source === 'system') {
      const sys = await this.detectSystemPython()
      if (sys.found && sys.ok) {
        return { source: 'system', path: sys.cmd, args: sys.args, version: sys.version, versionParts: sys.versionParts, available: true }
      }
      const reason = sys.found ? `系统 Python 版本 ${sys.version} 低于 3.11，已回退内置。` : '未找到系统 Python，已回退内置。'
      if (isBundledAvailable()) {
        const v = await this._bundledVersion()
        return { source: 'builtin', path: bundledInterpreterPath(), args: [], version: v, versionParts: parsePythonVersion(v), available: true, fallbackFromSystem: true, reason }
      }
      return { source: 'system', path: null, available: false, reason }
    }
    if (isBundledAvailable()) {
      const v = await this._bundledVersion()
      return { source: 'builtin', path: bundledInterpreterPath(), args: [], version: v, versionParts: parsePythonVersion(v), available: true }
    }
    const sys = await this.detectSystemPython()
    if (sys.found && sys.ok) {
      return { source: 'system', path: sys.cmd, args: sys.args, version: sys.version, versionParts: sys.versionParts, available: true, fallbackFromBuiltin: true, reason: '内置 Python 未就绪，已回退系统 Python。' }
    }
    return { source: 'builtin', path: null, available: false, reason: '内置 Python 未就绪，且未找到可用的系统 Python。' }
  }

  async _bundledVersion() {
    if (this._versionCache) return this._versionCache
    const r = await runBuffered(bundledInterpreterPath(), ['--version'], { timeoutMs: 8000 })
    const v = parsePythonVersion(r.stdout || r.stderr)
    this._versionCache = v ? v.join('.') : PYTHON_VERSION_TARGET
    return this._versionCache
  }

  getDefaultVenvPath() { return path.join(app.getPath('userData'), 'python-venv') }
  getVenvPath() { return this._getSetting('python_venv_path', this.getDefaultVenvPath()) }
  setVenvPath(p) {
    const cleaned = this._normalizeVenvPath(p)
    this._setSetting('python_venv_path', cleaned)
  }

  // Reject drive roots (e.g. "D:\") — venv cannot live directly on a drive root.
  // Auto-append a subdir if the user picks a root.
  _normalizeVenvPath(p) {
    if (!p || typeof p !== 'string') return this.getDefaultVenvPath()
    const trimmed = p.trim()
    if (!trimmed) return this.getDefaultVenvPath()
    // Detect Windows drive root like "D:\", "D:/", "D:"
    if (/^[a-zA-Z]:[\\/]?$/i.test(trimmed)) {
      return path.join(trimmed, 'Reviva-venv')
    }
    // Detect POSIX root
    if (trimmed === '/') return path.join(trimmed, 'Reviva-venv')
    return path.resolve(trimmed)
  }

  // Validate that a venv path does NOT fall inside the workspace directory,
  // which would collide with workspace data (e.g. the SQLite db lock).
  // Returns { ok: boolean, error?: string }
  validateVenvPath(p) {
    const normalized = this._normalizeVenvPath(p)
    const wsRoot = this._workDir?.getRootPath?.()
    if (wsRoot) {
      const wsResolved = path.resolve(wsRoot)
      const rel = path.relative(wsResolved, normalized)
      const isInside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
      if (isInside) {
        return { ok: false, error: '虚拟环境路径不能放在授权工作目录内（会与工作区数据冲突）。请选择其他位置。' }
      }
    }
    return { ok: true }
  }

  getVenvInterpreter() {
    const venv = this.getVenvPath()
    if (process.platform === 'win32') return path.join(venv, 'Scripts', 'python.exe')
    return path.join(venv, 'bin', 'python')
  }

  // Synchronous venv readiness check: verifies the venv interpreter binary exists.
  // Used by sync code paths (e.g. exec_command transparent rewrite) where awaiting
  // the full async isVenvReady (which also reads meta JSON) is not feasible.
  isVenvReadySync() {
    const py = this.getVenvInterpreter()
    return fs.existsSync(py)
  }

  // Returns the venv interpreter path if the venv is ready (sync check), or null.
  // Convenience for consumers that want a simple "give me venv python or null".
  getVenvPythonCommand() {
    return this.isVenvReadySync() ? this.getVenvInterpreter() : null
  }

  _metaPath() { return path.join(this.getVenvPath(), 'reviva-venv-meta.json') }

  async readVenvMeta() {
    try {
      const raw = await fs.promises.readFile(this._metaPath(), 'utf-8')
      return JSON.parse(raw)
    } catch { return null }
  }

  async _writeVenvMeta(meta) {
    const dir = this.getVenvPath()
    await fs.promises.mkdir(dir, { recursive: true })
    const tmp = `${this._metaPath()}.tmp-${process.pid}-${Date.now()}`
    await fs.promises.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf-8')
    await fs.promises.rename(tmp, this._metaPath())
  }

  async isVenvReady() {
    const py = this.getVenvInterpreter()
    if (!fs.existsSync(py)) return false
    const meta = await this.readVenvMeta()
    if (!meta) return false
    const source = this.getInterpreterSource()
    if (meta.baseSource && meta.baseSource !== source) return false
    return true
  }

  async ensureVenv({ onProgress } = {}) {
    const interp = await this.resolveInterpreter()
    if (!interp.available) {
      return { success: false, error: interp.reason || '没有可用的 Python 解释器来创建虚拟环境。' }
    }
    const venvPath = this.getVenvPath()
    const pathCheck = this.validateVenvPath(venvPath)
    if (!pathCheck.ok) {
      return { success: false, error: pathCheck.error }
    }
    const ready = await this.isVenvReady()
    if (!ready && fs.existsSync(venvPath)) {
      const py = this.getVenvInterpreter()
      if (fs.existsSync(py) || fs.existsSync(this._metaPath())) {
        await fs.promises.rm(venvPath, { recursive: true, force: true }).catch(() => {})
      }
    }
    if (ready) return { success: true, alreadyReady: true, venvPath, interpreter: interp }
    onProgress?.('creating', '正在创建虚拟环境…')
    const parentDir = path.dirname(venvPath)
    // Don't mkdir a drive root or "/" — they always exist and mkdir may EPERM.
    const isRoot = /^[a-zA-Z]:[\\/]?$/i.test(parentDir) || parentDir === '/'
    if (!isRoot) {
      await fs.promises.mkdir(parentDir, { recursive: true })
    }
    // Use --without-pip to avoid standalone Python's ensurepip subprocess failure
    // (known issue with python-build-standalone when paths contain non-ASCII or on some Windows setups).
    // We bootstrap pip manually afterwards via the base interpreter.
    const args = [...(interp.args || []), '-m', 'venv', '--clear', '--without-pip', venvPath]
    const env = await getSystemEnv()
    const r = await runBuffered(interp.path, args, { timeoutMs: 120000, env })
    if (r.code !== 0) return { success: false, error: '创建虚拟环境失败。', stderr: r.stderr, stdout: r.stdout }
    await this._writeVenvMeta({
      baseSource: interp.source, basePath: interp.path, baseVersion: interp.version,
      createdAt: new Date().toISOString(), appVersion: app.getVersion(),
    })
    onProgress?.('pip', '正在安装 pip…')
    const venvPy = this.getVenvInterpreter()
    // Bootstrap pip into the venv using the base interpreter, which has a working pip.
    // `base -m pip install pip --target <venv-site-packages>` places pip where the venv can find it.
    const venvSitePackages = process.platform === 'win32'
      ? path.join(venvPath, 'Lib', 'site-packages')
      : path.join(venvPath, 'lib', `python${PYTHON_VERSION_TARGET}`, 'site-packages')
    await fs.promises.mkdir(venvSitePackages, { recursive: true })
    const bootstrapR = await runBuffered(interp.path, [...(interp.args || []), '-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', '--target', venvSitePackages, ...this._pypiMirrorArgs()], { timeoutMs: 120000, env })
    // Write the venv's pyvenv.cfg is already created by venv module; verify pip works.
    const verifyR = await runBuffered(venvPy, ['-m', 'pip', '--version'], { timeoutMs: 20000, env })
    const pipOk = verifyR.code === 0
    return { success: true, venvPath, interpreter: interp, pipBootstrapped: pipOk, bootstrapError: pipOk ? '' : (bootstrapR.stderr || verifyR.stderr || '').slice(-1000) }
  }

  async rebuildVenv({ onProgress } = {}) {
    const venvPath = this.getVenvPath()
    if (fs.existsSync(venvPath)) {
      await fs.promises.rm(venvPath, { recursive: true, force: true }).catch(() => {})
    }
    return this.ensureVenv({ onProgress })
  }

  // Remove the venv directory entirely without re-creating it.
  // Unlike rebuildVenv, this leaves the environment uninitialized.
  async deleteVenv() {
    const venvPath = this.getVenvPath()
    let removed = false
    if (fs.existsSync(venvPath)) {
      await fs.promises.rm(venvPath, { recursive: true, force: true }).catch(() => {})
      removed = !fs.existsSync(venvPath)
    }
    return { success: true, removed, venvPath }
  }

  async installPackages({ packages, checkScript, label } = {}) {
    const ready = await this.isVenvReady()
    if (!ready) return { success: false, error: '虚拟环境未就绪，请先初始化虚拟环境。' }
    const venvPy = this.getVenvInterpreter()
    const env = await getSystemEnv()
    const installArgs = ['-m', 'pip', 'install', '--upgrade', ...packages, ...this._pypiMirrorArgs()]
    const r = await runBuffered(venvPy, installArgs, { timeoutMs: 10 * 60 * 1000, env })
    const command = formatCommand(venvPy, installArgs)
    let check = null
    if (checkScript) check = await this._runImportCheck(checkScript)
    const success = r.code === 0 && (!check || check.installed)
    return {
      success,
      error: success ? '' : (r.code !== 0 ? `pip 安装${label ? ' ' + label : ''}失败。` : `安装命令已完成，但${label ? label + ' ' : ''}导入检测未通过。`),
      command, packages,
      stdout: (r.stdout || '').slice(-12000), stderr: (r.stderr || '').slice(-12000),
      stdoutTruncated: r.stdoutTruncated, stderrTruncated: r.stderrTruncated, check,
    }
  }

  async _runImportCheck(checkScript) {
    const venvPy = this.getVenvInterpreter()
    const env = await getSystemEnv()
    const r = await runBuffered(venvPy, ['-c', checkScript], { timeoutMs: 20000, env })
    const out = (r.stdout || '').trim()
    const ok = r.code === 0 && !/missing/i.test(out)
    return { installed: ok, version: ok ? '可用' : '', raw: out || r.stderr || '', via: 'venv' }
  }

  async runScript(scriptPath, args = [], { timeoutMs = 120000, env, cwd } = {}) {
    const ready = await this.isVenvReady()
    if (!ready) return { code: 1, stdout: '', stderr: '虚拟环境未就绪。' }
    const venvPy = this.getVenvInterpreter()
    const baseEnv = await getSystemEnv()
    return runBuffered(venvPy, [scriptPath, ...args], { timeoutMs, env: env || baseEnv, cwd })
  }

  // ---- package management ----

  // List installed packages in the venv. Returns { success, packages }
  async listPackages() {
    const ready = await this.isVenvReady()
    if (!ready) return { success: false, error: '虚拟环境未就绪。', packages: [] }
    const venvPy = this.getVenvInterpreter()
    const env = await getSystemEnv()
    const r = await runBuffered(venvPy, ['-m', 'pip', 'list', '--format=json'], { timeoutMs: 30000, env })
    if (r.code !== 0) {
      return { success: false, error: '获取已安装包列表失败。', stderr: r.stderr, packages: [] }
    }
    let packages = []
    try {
      packages = JSON.parse(r.stdout || '[]')
        .map(item => ({ name: item.name, version: item.version }))
        .filter(item => item.name)
        .filter(item => !['pip', 'setuptools', 'wheel', 'pkg-resources'].includes(item.name.toLowerCase()))
    } catch {
      return { success: false, error: '解析包列表失败。', packages: [] }
    }
    return { success: true, packages }
  }

  // Uninstall a package from the venv. Returns { success, error }
  async uninstallPackage(name) {
    const ready = await this.isVenvReady()
    if (!ready) return { success: false, error: '虚拟环境未就绪。' }
    if (!name || typeof name !== 'string') return { success: false, error: '缺少包名。' }
    const venvPy = this.getVenvInterpreter()
    const env = await getSystemEnv()
    const r = await runBuffered(venvPy, ['-m', 'pip', 'uninstall', '-y', name], { timeoutMs: 120000, env })
    return {
      success: r.code === 0,
      error: r.code === 0 ? '' : `卸载 ${name} 失败。`,
      stdout: (r.stdout || '').slice(-4000),
      stderr: (r.stderr || '').slice(-4000),
    }
  }

  // Show info for a single package. Returns { success, info }
  async getPackageInfo(name) {
    const ready = await this.isVenvReady()
    if (!ready) return { success: false, error: '虚拟环境未就绪。' }
    if (!name || typeof name !== 'string') return { success: false, error: '缺少包名。' }
    const venvPy = this.getVenvInterpreter()
    const env = await getSystemEnv()
    const r = await runBuffered(venvPy, ['-m', 'pip', 'show', name], { timeoutMs: 15000, env })
    if (r.code !== 0 || !r.stdout.trim()) {
      return { success: false, error: `未找到包 ${name}。` }
    }
    const info = {}
    for (const line of r.stdout.split('\n')) {
      const m = line.match(/^([\w-]+):\s*(.*)$/)
      if (m) info[m[1].toLowerCase()] = m[2].trim()
    }
    return { success: true, info }
  }

  async getStatus() {
    const interp = await this.resolveInterpreter()
    const venvReady = await this.isVenvReady()
    const meta = await this.readVenvMeta()
    return {
      interpreter: {
        source: interp.source, path: interp.path, version: interp.version,
        available: interp.available, reason: interp.reason,
        fallback: !!interp.fallbackFromSystem || !!interp.fallbackFromBuiltin,
      },
      bundled: { path: bundledInterpreterPath(), available: isBundledAvailable() },
      venv: {
        path: this.getVenvPath(), defaultPath: this.getDefaultVenvPath(), ready: venvReady,
        baseSource: meta?.baseSource || null, baseVersion: meta?.baseVersion || null, createdAt: meta?.createdAt || null,
      },
      targetVersion: PYTHON_VERSION_TARGET,
    }
  }
}

function formatCommand(cmd, args) {
  return [cmd, ...args.map(arg => /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)].join(' ')
}
