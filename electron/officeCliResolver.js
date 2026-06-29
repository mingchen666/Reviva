import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getOfficeCliBinaryName({ platform = process.platform, arch = process.arch } = {}) {
  if (platform !== 'win32') return ''
  if (arch === 'arm64') return 'officecli-win-arm64.exe'
  if (arch === 'x64') return 'officecli-win-x64.exe'
  return ''
}

export function getBundledOfficeCliPath() {
  const binaryName = getOfficeCliBinaryName()
  if (!binaryName) return ''

  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'builtin-assets', 'bin', 'officecli', binaryName) : '',
    process.env.APP_ROOT ? path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'bin', 'officecli', binaryName) : '',
    path.join(__dirname, 'builtin-assets', 'bin', 'officecli', binaryName),
    path.join(process.cwd(), 'electron', 'builtin-assets', 'bin', 'officecli', binaryName),
  ].filter(Boolean)

  return candidates.find(p => {
    try { return fs.existsSync(p) }
    catch { return false }
  }) || ''
}

export function getOfficeCliSpawnEnv(env = process.env) {
  return {
    ...env,
    OFFICECLI_NO_AUTO_RESIDENT: env.OFFICECLI_NO_AUTO_RESIDENT || '1',
  }
}

export function getOfficeCliCommandCandidates(args = []) {
  const attempts = []

  const bundled = getBundledOfficeCliPath()
  if (bundled) {
    attempts.push({
      cmd: bundled,
      args,
      shell: false,
      source: 'bundled',
      label: `bundled officecli (${path.basename(bundled)}) ${args.join(' ')}`.trim(),
    })
  }

  attempts.push({ cmd: 'officecli', args, source: 'system', label: `officecli ${args.join(' ')}`.trim() })

  return attempts
}
