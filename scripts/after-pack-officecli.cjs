const fs = require('node:fs')
const path = require('node:path')

const PLATFORM_ARCH_BINARY = {
  win32: {
    x64: 'officecli-win-x64.exe',
    arm64: 'officecli-win-arm64.exe',
  },
  darwin: {
    x64: 'officecli-mac-x64',
    arm64: 'officecli-mac-arm64',
  },
  linux: {
    x64: 'officecli-linux-x64',
    arm64: 'officecli-linux-arm64',
  },
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
  const platform = context.electronPlatformName
  const arch = normalizeArch(context.arch)
  const binaryName = PLATFORM_ARCH_BINARY[platform]?.[arch]
  if (!binaryName) {
    throw new Error(`[afterPack] No bundled officecli binary is configured for platform: ${platform} arch: ${arch || context.arch}`)
  }

  const projectDir = context.packager?.projectDir || process.cwd()
  const sourceDir = path.join(projectDir, 'electron', 'builtin-assets', 'bin', 'officecli')
  const source = path.join(sourceDir, binaryName)
  if (!fs.existsSync(source)) {
    if (platform === 'win32') {
      throw new Error(`[afterPack] Required bundled officecli binary not found: ${source}`)
    }
    console.warn(`[afterPack] officecli binary not found for ${platform}/${arch}: ${binaryName}. Skipping - Office features will use system officecli if available.`)
    return
  }

  const targetDir = path.join(resourcesDirFor(context), 'builtin-assets', 'bin', 'officecli')
  fs.mkdirSync(targetDir, { recursive: true })

  // Remove any stale officecli binaries from other platforms/arches
  for (const name of fs.readdirSync(targetDir)) {
    if (!/^officecli-(?:win|mac|linux)-/i.test(name)) continue
    if (name !== binaryName) fs.rmSync(path.join(targetDir, name), { force: true })
  }

  const target = path.join(targetDir, binaryName)
  fs.copyFileSync(source, target)

  // Unix binaries need the executable bit
  if (platform !== 'win32') {
    fs.chmodSync(target, 0o755)
  }

  console.log(`[afterPack] Bundled ${binaryName} for ${platform}/${arch}.`)
}
