import { spawn } from 'node:child_process'
import path from 'node:path'

let systemEnvPromise = null

function runRaw(command, args, { timeoutMs = 3000, maxBuffer = 64 * 1024, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    let collected = 0
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    const append = (target, data) => {
      collected += data.length
      if (collected <= maxBuffer) target.push(data)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch {}
      finish({ code: 124, stdout: '', stderr: 'timeout' })
    }, timeoutMs)
    child.stdout.on('data', data => append(stdout, data))
    child.stderr.on('data', data => append(stderr, data))
    child.on('error', err => finish({ code: err.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: err.message }))
    child.on('close', code => finish({
      code: code ?? 0,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }))
  })
}

function pathKey(env) {
  return Object.keys(env).find(k => k.toLowerCase() === 'path') || 'PATH'
}

function expandEnvVars(value, env = process.env) {
  return String(value || '').replace(/%([^%]+)%/g, (_, name) => env[name] || env[name.toUpperCase()] || env[name.toLowerCase()] || '')
}

function appendPath(parts, seen, value) {
  const expanded = expandEnvVars(value)
  if (!expanded) return
  for (const item of expanded.split(path.delimiter).map(p => p.trim()).filter(Boolean)) {
    const key = process.platform === 'win32' ? item.toLowerCase() : item
    if (!seen.has(key)) {
      seen.add(key)
      parts.push(item)
    }
  }
}

async function queryWindowsRegistryPath(root, subkey) {
  const result = await runRaw('reg.exe', ['query', `${root}\\${subkey}`, '/v', 'Path'])
  if (result.code !== 0) return ''
  const line = result.stdout.split(/\r?\n/).find(l => /\sPath\s+REG_/i.test(l))
  return line?.replace(/^\s*Path\s+REG_\w+\s+/i, '').trim() || ''
}

function commonWindowsToolPaths() {
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

export async function getSystemEnv() {
  if (systemEnvPromise) return systemEnvPromise
  systemEnvPromise = (async () => {
    const env = { ...process.env }
    const key = pathKey(env)
    const parts = []
    const seen = new Set()
    appendPath(parts, seen, env[key])
    if (process.platform === 'win32') {
      appendPath(parts, seen, await queryWindowsRegistryPath('HKCU', 'Environment'))
      appendPath(parts, seen, await queryWindowsRegistryPath('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'))
      for (const candidate of commonWindowsToolPaths()) appendPath(parts, seen, candidate)
    }
    env[key] = parts.join(path.delimiter)
    env.PATH = env[key]
    env.Path = env[key]
    return env
  })()
  return systemEnvPromise
}
