import { spawn } from 'node:child_process'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from '../../officeCliResolver.js'
import { getSystemEnv } from '../../systemEnv.js'

export function clipText(text, max = 30000) {
  const value = String(text || '')
  return value.length > max ? value.slice(0, max) : value
}

function runCandidate(candidate, { timeoutMs = 120000, maxBuffer = 4 * 1024 * 1024, cwd = undefined, input = undefined } = {}) {
  return new Promise((resolve) => {
    const stdoutChunks = []
    const stderrChunks = []
    let collected = 0
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ...result, via: candidate.source || candidate.cmd, label: candidate.label || candidate.cmd })
    }
    const append = (chunks, data) => {
      collected += data.length
      if (collected <= maxBuffer) chunks.push(data)
    }

    let child
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'officecli timeout' })
    }, timeoutMs)

    try {
      child = spawn(candidate.cmd, candidate.args || [], {
        cwd,
        shell: !!candidate.shell,
        windowsHide: true,
        env: candidate.env || process.env,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      clearTimeout(timer)
      resolve({
        code: err.code === 'ENOENT' ? 127 : 1,
        stdout: '',
        stderr: err.message,
        via: candidate.source || candidate.cmd,
        label: candidate.label || candidate.cmd,
      })
      return
    }

    if (input !== undefined) {
      child.stdin.end(String(input))
    }
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

export async function runOfficeCli(args = [], options = {}) {
  const baseEnv = await getSystemEnv().catch(() => process.env)
  const attempts = getOfficeCliCommandCandidates(args).map(candidate => ({
    ...candidate,
    env: getOfficeCliSpawnEnv(baseEnv),
  }))

  let lastResult = { code: 127, stdout: '', stderr: 'officecli not found', via: 'none', label: 'officecli' }
  for (const candidate of attempts) {
    const result = await runCandidate(candidate, options)
    lastResult = result
    if (result.code === 0) return result
    if (result.code !== 127) return result
  }
  return lastResult
}

export async function checkOfficeCli() {
  const result = await runOfficeCli(['--version'], { timeoutMs: 5000, maxBuffer: 64 * 1024 })
  if (result.code === 127) {
    return {
      success: false,
      code: 'OFFICECLI_NOT_INSTALLED',
      message: '创建或编辑 Office 文档需要 officecli。请到“设置 > 环境检测”安装或修复 OfficeCLI。',
      detail: clipText(result.stderr || result.stdout, 1200),
    }
  }
  if (result.code !== 0) {
    return {
      success: false,
      code: result.code === 124 ? 'OFFICECLI_TIMEOUT' : 'OFFICECLI_UNAVAILABLE',
      message: 'officecli 当前不可用，无法创建或编辑 Office 文档。',
      detail: clipText(result.stderr || result.stdout, 1200),
    }
  }
  return { success: true, version: clipText(result.stdout || result.stderr, 200), via: result.via }
}
