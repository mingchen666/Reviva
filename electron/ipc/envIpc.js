import { app, dialog } from 'electron'
import { createRequire } from 'node:module'
import { getSystemEnv } from '../systemEnv.js'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../officeCliResolver.js'
import { createSettingsTransfer, parseSettingsTransfer } from '../SettingsTransferService.js'

const require = createRequire(import.meta.url)

export function registerEnvIpc(ipcMain, deps) {
  const { getWin, dbService, backupService } = deps

  function execVersion(cmd, args, parser, timeoutMs = 8000, options = {}) {
    return new Promise((resolve) => {
      try {
        const { spawn } = require('node:child_process')
        const child = spawn(cmd, args, {
          shell: options.shell !== false,
          windowsHide: true,
          env: options.env || process.env,
        })
        const stdoutChunks = []
        const stderrChunks = []
        let done = false
        const finish = (result) => { if (!done) { done = true; resolve(result) } }
        const timer = setTimeout(() => { try { child.kill() } catch {}; finish({ installed: false, error: 'timeout', raw: '' }) }, timeoutMs)
        child.stdout.on('data', (d) => { stdoutChunks.push(d) })
        child.stderr.on('data', (d) => { stderrChunks.push(d) })
        child.on('error', (err) => { clearTimeout(timer); finish({ installed: false, error: err.message, raw: '' }) })
        child.on('close', (code) => {
          clearTimeout(timer)
          const decode = (chunks) => {
            const buf = Buffer.concat(chunks)
            if (!buf.length) return ''
            if (process.platform === 'win32') {
              try {
                const gbk = new TextDecoder('gbk', { fatal: false }).decode(buf)
                const utf8 = buf.toString('utf8')
                const gbkBad = (gbk.match(/\uFFFD/g) || []).length
                const utf8Bad = (utf8.match(/\uFFFD/g) || []).length
                return gbkBad <= utf8Bad ? gbk : utf8
              } catch {
                return buf.toString('utf8')
              }
            }
            return buf.toString('utf8')
          }
          const stdout = decode(stdoutChunks)
          const stderr = decode(stderrChunks)
          const out = (stdout || stderr || '').trim()
          const rawPreview = out.split('\n').slice(0, 4).join('\n')

          const notFoundPatterns = [
            /is not recognized as an internal or external command/i,
            /command not found/i,
            /不是内部或外部命令/,
            /系统找不到/,
            /no such file or directory/i,
          ]
          if (code !== 0) {
            if (notFoundPatterns.some(re => re.test(out)) || !out) {
              return finish({ installed: false, error: out ? 'not found' : `exit ${code}`, raw: rawPreview })
            }
          }

          const version = parser ? parser(out) : out.split('\n')[0].trim()
          if (!version || /^\s*$/.test(version)) {
            return finish({ installed: false, error: 'no version', raw: rawPreview })
          }
          finish({ installed: true, version, raw: rawPreview })
        })
      } catch (err) {
        resolve({ installed: false, error: err.message, raw: '' })
      }
    })
  }

  const ALIYUN_PYPI_SIMPLE_URL = 'https://mirrors.aliyun.com/pypi/simple/'
  const PYTHON_PDF_PACKAGES = ['pymupdf']
  const PYTHON_PDF_IMPORT_MODULES = ['fitz']
  const PYTHON_OFFICE_PACKAGES = ['python-docx', 'openpyxl', 'python-pptx', 'pandas', 'xlrd', 'pymupdf']
  const PYTHON_OFFICE_IMPORT_MODULES = ['docx', 'openpyxl', 'pptx', 'pandas', 'xlrd', 'fitz']
  const PYTHON_MATH_VIZ_PACKAGES = ['matplotlib', 'numpy', 'scipy', 'sympy']
  const PYTHON_MATH_VIZ_IMPORT_MODULES = ['matplotlib', 'numpy', 'scipy', 'sympy']
  const PYTHON_PDF_IMPORT_SCRIPT = [
    'import importlib.util',
    `modules=${JSON.stringify(PYTHON_PDF_IMPORT_MODULES)}`,
    'missing=[m for m in modules if importlib.util.find_spec(m) is None]',
    "print('missing:' + ','.join(missing) if missing else 'pdf-libs-ok')",
    'raise SystemExit(1 if missing else 0)',
  ].join('; ')
  const PYTHON_OFFICE_IMPORT_SCRIPT = [
    'import importlib.util',
    `modules=${JSON.stringify(PYTHON_OFFICE_IMPORT_MODULES)}`,
    'missing=[m for m in modules if importlib.util.find_spec(m) is None]',
    "print('missing:' + ','.join(missing) if missing else 'office-libs-ok')",
    'raise SystemExit(1 if missing else 0)',
  ].join('; ')
  const PYTHON_MATH_VIZ_IMPORT_SCRIPT = [
    'import importlib',
    `modules=${JSON.stringify(PYTHON_MATH_VIZ_IMPORT_MODULES)}`,
    'missing=[]',
    'for m in modules:',
    '    try:',
    '        importlib.import_module(m)',
    '    except Exception as e:',
    '        missing.append(f"{m}:{type(e).__name__}")',
    "print('missing:' + ','.join(missing) if missing else 'math-viz-libs-ok')",
    'raise SystemExit(1 if missing else 0)',
  ].join('\n')
  const PYTHON_CANDIDATES = [
    { cmd: 'python', args: [], label: 'python' },
    { cmd: 'py', args: ['-3'], label: 'py -3' },
    { cmd: 'py', args: [], label: 'py' },
    { cmd: 'python3', args: [], label: 'python3' },
  ]

  function pythonCandidateArgs(candidate, args) {
    return [...(candidate.args || []), ...args]
  }

  function pythonOfficeImportAttempts() {
    return PYTHON_CANDIDATES.map(candidate => ({
      cmd: candidate.cmd,
      args: pythonCandidateArgs(candidate, ['-c', PYTHON_OFFICE_IMPORT_SCRIPT]),
      shell: false,
      timeoutMs: 12000,
      label: `${candidate.label} -c office-libs-check`,
    }))
  }

  function pythonPdfImportAttempts() {
    return PYTHON_CANDIDATES.map(candidate => ({
      cmd: candidate.cmd,
      args: pythonCandidateArgs(candidate, ['-c', PYTHON_PDF_IMPORT_SCRIPT]),
      shell: false,
      timeoutMs: 12000,
      label: `${candidate.label} -c pdf-libs-check`,
    }))
  }

  function pythonMathVizImportAttempts() {
    return PYTHON_CANDIDATES.map(candidate => ({
      cmd: candidate.cmd,
      args: pythonCandidateArgs(candidate, ['-c', PYTHON_MATH_VIZ_IMPORT_SCRIPT]),
      shell: false,
      timeoutMs: 20000,
      label: `${candidate.label} -c math-viz-libs-check`,
    }))
  }

  const ENV_CHECKS = {
    python: { attempts: [{ cmd: 'python', args: ['--version'] }, { cmd: 'python3', args: ['--version'] }, { cmd: 'py', args: ['--version'] }], parse: (s) => (s.match(/Python\s+([\d.]+)/i)?.[1] || '') },
    node: { attempts: [{ cmd: 'node', args: ['--version'] }], parse: (s) => (s.match(/v?([\d.]+)/)?.[1] || '') },
    npm: { attempts: [{ cmd: 'npm', args: ['--version'] }], parse: (s) => (s.match(/([\d.]+)/)?.[1] || '') },
    pnpm: { attempts: [{ cmd: 'pnpm', args: ['--version'] }], parse: (s) => (s.match(/([\d.]+)/)?.[1] || '') },
    pip: { attempts: [{ cmd: 'pip', args: ['--version'] }, { cmd: 'pip3', args: ['--version'] }, { cmd: 'python', args: ['-m', 'pip', '--version'] }], parse: (s) => (s.match(/pip\s+([\d.]+)/i)?.[1] || '') },
    pandoc: { attempts: [{ cmd: 'pandoc', args: ['--version'] }], parse: (s) => (s.match(/pandoc(?:\.exe)?\s+([\d.]+)/i)?.[1] || '') },
    manim: { attempts: [{ cmd: 'python', args: ['-m', 'manim', '--version'] }, { cmd: 'py', args: ['-3', '-m', 'manim', '--version'] }, { cmd: 'py', args: ['-m', 'manim', '--version'] }, { cmd: 'python3', args: ['-m', 'manim', '--version'] }, { cmd: 'manim', args: ['--version'] }, { cmd: 'manimce', args: ['--version'] }], parse: (s) => (s.match(/Manim\s+Community\s+v?([\d.\w-]+)/i)?.[1] || s.match(/v?([\d]+\.[\d.]+)/)?.[1] || '') },
    ffmpeg: { attempts: [{ cmd: 'ffmpeg', args: ['-version'] }], parse: (s) => (s.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || '') },
    latex: { attempts: [{ cmd: 'latex', args: ['--version'] }, { cmd: 'pdflatex', args: ['--version'] }, { cmd: 'xelatex', args: ['--version'] }], parse: (s) => (s.match(/(?:pdfTeX|XeTeX)\s+([\d.]+)/i)?.[1] || s.match(/Version\s+([\d.]+)/i)?.[1] || '') },
    dvisvgm: { attempts: [{ cmd: 'dvisvgm', args: ['--version'] }], parse: (s) => (s.match(/dvisvgm\s+([\d.]+)/i)?.[1] || s.match(/([\d]+\.[\d.]+)/)?.[1] || '') },
    miktex: { attempts: [{ cmd: 'mpm', args: ['--version'] }], parse: (s) => (s.match(/MiKTeX\s+Package\s+Manager\s+([\d.]+)/i)?.[1] || s.match(/mpm\s+([\d.]+)/i)?.[1] || s.match(/([\d]+\.[\d.]+)/)?.[1] || '') },
    git: { attempts: [{ cmd: 'git', args: ['--version'] }], parse: (s) => (s.match(/git version\s+([\d.]+)/i)?.[1] || '') },
    officecli: { attempts: getOfficeCliCommandCandidates(['--version']), parse: (s) => (s.match(/([\d]+\.[\d.]+)/)?.[1] || s.split('\n')[0].trim()) },
    pythonPdfLibs: { attempts: pythonPdfImportAttempts(), parse: (s) => (/pdf-libs-ok/i.test(s) ? '可用' : '') },
    pythonOfficeLibs: { attempts: pythonOfficeImportAttempts(), parse: (s) => (/office-libs-ok/i.test(s) ? '可用' : '') },
    pythonMathVizLibs: { attempts: pythonMathVizImportAttempts(), parse: (s) => (/math-viz-libs-ok/i.test(s) ? '可用' : '') },
  }

  async function checkOneEnv(key) {
    const def = ENV_CHECKS[key]
    if (!def) return { installed: false, error: 'unknown', raw: '' }
    let lastResult = { installed: false, error: 'not found', raw: '' }
    const baseEnv = await getSystemEnv()
    for (const attempt of def.attempts) {
      const env = attempt.source ? getOfficeCliSpawnEnv(baseEnv) : baseEnv
      const r = await execVersion(attempt.cmd, attempt.args, def.parse, attempt.timeoutMs || def.timeoutMs || 8000, { ...attempt, env })
      if (r.installed) {
        return { ...r, via: attempt.label || `${attempt.cmd} ${attempt.args.join(' ')}` }
      }
      lastResult = r
    }
    return lastResult
  }

  function runBufferedCommand(cmd, args, { timeoutMs = 600000, maxBuffer = 4 * 1024 * 1024, shell = false, env = process.env } = {}) {
    return new Promise((resolve) => {
      try {
        const { spawn } = require('node:child_process')
        const child = spawn(cmd, args, {
          shell,
          windowsHide: true,
          env: { ...env },
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
          resolve(result)
        }
        const append = (chunks, data, kind) => {
          if (kind === 'stdout') {
            stdoutSize += data.length
            if (stdoutSize <= maxBuffer) chunks.push(data)
          } else {
            stderrSize += data.length
            if (stderrSize <= maxBuffer) chunks.push(data)
          }
        }

        const timer = setTimeout(() => {
          try { child.kill() } catch {}
          finish({ code: 124, stdout: '', stderr: 'command timeout', stdoutTruncated: false, stderrTruncated: false })
        }, timeoutMs)

        child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
        child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
        child.on('error', err => finish({
          code: err.code === 'ENOENT' ? 127 : 1,
          stdout: '',
          stderr: err.message,
          stdoutTruncated: false,
          stderrTruncated: false,
        }))
        child.on('close', code => finish({
          code: code ?? 0,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          stdoutTruncated: stdoutSize > maxBuffer,
          stderrTruncated: stderrSize > maxBuffer,
        }))
      } catch (err) {
        resolve({ code: 1, stdout: '', stderr: err.message, stdoutTruncated: false, stderrTruncated: false })
      }
    })
  }

  async function findPythonPipCandidate() {
    let lastResult = null
    const baseEnv = await getSystemEnv()
    for (const candidate of PYTHON_CANDIDATES) {
      const args = pythonCandidateArgs(candidate, ['-m', 'pip', '--version'])
      const result = await runBufferedCommand(candidate.cmd, args, { timeoutMs: 12000, env: baseEnv })
      if (result.code === 0) {
        return {
          candidate,
          pipVersion: (result.stdout || result.stderr || '').trim().split('\n')[0] || 'pip',
          env: baseEnv,
        }
      }
      lastResult = { candidate, result }
    }
    return { candidate: null, lastResult }
  }

  function formatCommandForDisplay(cmd, args) {
    return [cmd, ...args.map(arg => /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)].join(' ')
  }

  async function installPythonPackages({ packages, checkKey, label }) {
    const found = await findPythonPipCandidate()
    if (!found.candidate) {
      const detail = found.lastResult?.result
      return {
        success: false,
        error: '未找到可用的 Python/pip。请先安装 Python，并确保 python -m pip 可用。',
        detail: detail ? (detail.stderr || detail.stdout || '').slice(0, 4000) : '',
      }
    }

    const installCoreArgs = [
      '-m', 'pip',
      'install',
      '--user',
      '--upgrade',
      ...packages,
      '-i', ALIYUN_PYPI_SIMPLE_URL,
      '--trusted-host', 'mirrors.aliyun.com',
    ]
    const installArgs = pythonCandidateArgs(found.candidate, installCoreArgs)
    let result = await runBufferedCommand(found.candidate.cmd, installArgs, { timeoutMs: 10 * 60 * 1000, env: found.env })
    let command = formatCommandForDisplay(found.candidate.cmd, installArgs)

    const combined = `${result.stdout || ''}\n${result.stderr || ''}`
    if (result.code !== 0 && /Can not perform a ['"]?--user['"]? install|--user install/i.test(combined)) {
      const noUserCoreArgs = installCoreArgs.filter(arg => arg !== '--user')
      const noUserArgs = pythonCandidateArgs(found.candidate, noUserCoreArgs)
      result = await runBufferedCommand(found.candidate.cmd, noUserArgs, { timeoutMs: 10 * 60 * 1000, env: found.env })
      command = formatCommandForDisplay(found.candidate.cmd, noUserArgs)
    }

    const check = await checkOneEnv(checkKey)
    const success = result.code === 0 && check.installed
    return {
      success,
      error: success ? '' : (result.code === 0 ? `安装命令已完成，但 ${label} 导入检测仍未通过。` : `pip 安装 ${label} 失败。`),
      command,
      packages,
      pip: found.pipVersion,
      stdout: (result.stdout || '').slice(-12000),
      stderr: (result.stderr || '').slice(-12000),
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
      check,
    }
  }

  async function installPythonPdfLibs() {
    return installPythonPackages({
      packages: PYTHON_PDF_PACKAGES,
      checkKey: 'pythonPdfLibs',
      label: 'PDF 本地解析库',
    })
  }

  async function installPythonOfficeLibs() {
    return installPythonPackages({
      packages: PYTHON_OFFICE_PACKAGES,
      checkKey: 'pythonOfficeLibs',
      label: 'Office Python 库',
    })
  }

  async function installPythonMathVizLibs() {
    return installPythonPackages({
      packages: PYTHON_MATH_VIZ_PACKAGES,
      checkKey: 'pythonMathVizLibs',
      label: '数学可视化 Python 库',
    })
  }

  ipcMain.handle('env:check', async (_e, keys) => {
    const targets = (Array.isArray(keys) && keys.length) ? keys : Object.keys(ENV_CHECKS)
    const results = {}
    await Promise.all(targets.map(async (key) => {
      results[key] = await checkOneEnv(key)
    }))
    return { success: true, data: results }
  })

  ipcMain.handle('env:installPythonPdfLibs', async () => {
    try { return await installPythonPdfLibs() }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('env:installPythonOfficeLibs', async () => {
    try { return await installPythonOfficeLibs() }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('env:installPythonMathVizLibs', async () => {
    try { return await installPythonMathVizLibs() }
    catch (err) { return { success: false, error: err.message } }
  })

  // Export all settings as JSON
  ipcMain.handle('app:exportSettings', async () => {
    try {
      const allSettings = dbService.getAllSettings()
      return {
        success: true,
        data: createSettingsTransfer(allSettings, { appVersion: app.getVersion() }),
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Import settings from JSON
  ipcMain.handle('app:importSettings', async (event, data) => {
    try {
      const parsed = parseSettingsTransfer(data)
      const imported = dbService.importSettings(parsed.settings)
      return {
        success: true,
        data: {
          importedCount: imported.count,
          importedKeys: Object.keys(parsed.settings),
          legacy: parsed.legacy,
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:getModes', async () => {
    try {
      if (!backupService) throw new Error('备份服务未就绪')
      return { success: true, data: backupService.getModes() }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:create', async (event, options = {}) => {
    try {
      if (!backupService) throw new Error('备份服务未就绪')
      const mode = options?.mode || 'full'
      const result = await dialog.showOpenDialog(getWin(), {
        title: '选择备份保存目录',
        defaultPath: app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true }
      const outputPath = backupService.getOutputPath(result.filePaths[0], mode)
      return await backupService.createBackup({ mode, outputPath })
    } catch (err) {
      console.error('[BackupService] create failed:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:prepareRestore', async () => {
    try {
      if (!backupService) throw new Error('备份服务未就绪')
      const result = await dialog.showOpenDialog(getWin(), {
        title: '选择 Reviva 备份包',
        defaultPath: app.getPath('documents'),
        properties: ['openFile'],
        filters: [{ name: 'Reviva Backup', extensions: ['zip'] }],
      })
      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true }
      return await backupService.prepareRestore({ packagePath: result.filePaths[0] })
    } catch (err) {
      console.error('[BackupService] prepare restore failed:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('backup:getRestoreResult', async () => {
    try {
      return { success: true, data: await backupService?.consumeRestoreResult?.() || null }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
