const fs = require('node:fs')
const path = require('node:path')

const ARCH_BINARY = {
  x64: 'officecli-win-x64.exe',
  arm64: 'officecli-win-arm64.exe',
}

function normalizeArch(arch) {
  if (typeof arch === 'string') return arch
  // electron-builder passes builder-util Arch enum numbers in many versions.
  const byEnum = {
    0: 'ia32',
    1: 'x64',
    2: 'armv7l',
    3: 'arm64',
    4: 'universal',
  }
  return byEnum[arch] || String(arch || '')
}

function resourcesDirFor(context) {
  if (context.electronPlatformName === 'darwin') {
    const appInfo = context.packager?.appInfo
    const productFilename = appInfo?.productFilename || appInfo?.productName || 'Reviva'
    return path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Resources')
  }
  return path.join(context.appOutDir, 'resources')
}

module.exports = async function afterPackOfficeCli(context) {
  if (context.electronPlatformName !== 'win32') return

  const arch = normalizeArch(context.arch)
  const binaryName = ARCH_BINARY[arch]
  if (!binaryName) {
    throw new Error(`[afterPack] No bundled officecli binary is configured for Windows arch: ${arch || context.arch}`)
  }

  const projectDir = context.packager?.projectDir || process.cwd()
  const sourceDir = path.join(projectDir, 'electron', 'builtin-assets', 'bin', 'officecli')
  const source = path.join(sourceDir, binaryName)
  if (!fs.existsSync(source)) {
    throw new Error(`[afterPack] Required bundled officecli binary not found: ${source}`)
  }

  const targetDir = path.join(resourcesDirFor(context), 'builtin-assets', 'bin', 'officecli')
  fs.mkdirSync(targetDir, { recursive: true })

  for (const name of fs.readdirSync(targetDir)) {
    if (!/^officecli-win-.*\.exe(?:\..*)?$/i.test(name)) continue
    if (name !== binaryName) fs.rmSync(path.join(targetDir, name), { force: true })
  }

  const target = path.join(targetDir, binaryName)
  fs.copyFileSync(source, target)
  console.log(`[afterPack] Bundled ${binaryName} for ${arch}.`)
}
