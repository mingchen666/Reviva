import fs from 'node:fs'
import path from 'node:path'

const THEME_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const MAX_CSS_BYTES = 1024 * 1024
const CUSTOM_CSS_FILE = 'custom.css'
const PENDING_CUSTOM_CSS_FILE = 'custom.pending.css'

function decodeCssEscapes(value) {
  return value.replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, hex) => {
    const codePoint = Number.parseInt(hex, 16)
    return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
  })
}

export class ThemeService {
  constructor(themesRoot, { reservedIds = [], guidePath = '' } = {}) {
    this.themesRoot = path.resolve(themesRoot)
    this.reservedIds = new Set(reservedIds)
    this.guidePath = guidePath ? path.resolve(guidePath) : ''
    this.initialized = false
    this.customCssOperationQueue = Promise.resolve()
  }

  async init() {
    await fs.promises.mkdir(this.themesRoot, { recursive: true })
    if (!this.initialized) {
      await Promise.all([
        fs.promises.rm(this._customCssPath(true), { force: true }),
        fs.promises.rm(`${this._customCssPath()}.tmp`, { force: true }),
        fs.promises.rm(`${this._customCssPath(true)}.tmp`, { force: true }),
      ])
      this.initialized = true
    }
    const targetGuide = path.join(this.themesRoot, 'THEMING.md')
    if (this.guidePath && fs.existsSync(this.guidePath) && !fs.existsSync(targetGuide)) {
      try { await fs.promises.copyFile(this.guidePath, targetGuide) } catch { /* Guide copy is best-effort. */ }
    }
    return this.themesRoot
  }

  getRootPath() {
    return this.themesRoot
  }

  _customCssPath(pending = false) {
    return path.join(this.themesRoot, pending ? PENDING_CUSTOM_CSS_FILE : CUSTOM_CSS_FILE)
  }

  _validateCustomCss(css) {
    if (typeof css !== 'string') throw new Error('自定义 CSS 必须是文本')
    if (Buffer.byteLength(css, 'utf-8') > MAX_CSS_BYTES) throw new Error('自定义 CSS 不能超过 1 MB')

    const inspected = decodeCssEscapes(css.replace(/\/\*[\s\S]*?\*\//g, ''))
    if (/@import\b/i.test(inspected)) throw new Error('自定义 CSS 不支持 @import 或语法错误')
    if (/javascript\s*:/i.test(inspected)) throw new Error('自定义 CSS 不允许脚本 URL')
    if (/(?:url|image-set|src)\s*\([^)]*(?:https?\s*:|\/\/)/i.test(inspected)) {
      throw new Error('自定义 CSS 不允许加载远程资源')
    }
    return css
  }

  async _assertCustomCssFileSafe(filePath) {
    try {
      const stat = await fs.promises.lstat(filePath)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('自定义 CSS 文件无效')
      const [realRoot, realFile] = await Promise.all([
        fs.promises.realpath(this.themesRoot),
        fs.promises.realpath(filePath),
      ])
      if (path.dirname(realFile) !== realRoot) throw new Error('自定义 CSS 文件必须位于主题目录')
      return stat
    } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async _writeCustomCss(filePath, css) {
    await this._assertCustomCssFileSafe(filePath)
    const tempPath = `${filePath}.tmp`
    await fs.promises.rm(tempPath, { force: true })
    try {
      await fs.promises.writeFile(tempPath, css, 'utf-8')
      await this._replaceCustomCssFile(tempPath, filePath)
    } finally {
      await fs.promises.rm(tempPath, { force: true })
    }
  }

  async _replaceCustomCssFile(sourcePath, targetPath) {
    await fs.promises.rename(sourcePath, targetPath)
  }

  _enqueueCustomCssOperation(operation) {
    const result = this.customCssOperationQueue.then(operation)
    this.customCssOperationQueue = result.catch(() => {})
    return result
  }

  _assertThemeId(id) {
    const normalized = String(id || '').trim().toLowerCase()
    if (!THEME_ID_PATTERN.test(normalized)) throw new Error('主题 ID 只能包含小写字母、数字和短横线')
    return normalized
  }

  _themeDir(id) {
    const normalized = this._assertThemeId(id)
    const target = path.resolve(this.themesRoot, normalized)
    if (path.dirname(target) !== this.themesRoot) throw new Error('主题目录无效')
    return target
  }

  async _readManifest(themeDir) {
    const raw = await fs.promises.readFile(path.join(themeDir, 'theme.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    const schemaVersion = Number(parsed.schemaVersion) || 1
    if (schemaVersion !== 1) throw new Error(`暂不支持主题协议版本 ${schemaVersion}`)
    const id = this._assertThemeId(parsed.id)
    const supports = Array.isArray(parsed.supports)
      ? [...new Set(parsed.supports.filter(mode => mode === 'light' || mode === 'dark'))]
      : []
    if (!supports.length) throw new Error('supports 至少需要包含 light 或 dark')

    const entry = typeof parsed.entry === 'string' && parsed.entry.trim() ? parsed.entry.trim() : 'theme.css'
    const entryPath = path.resolve(themeDir, entry)
    if (entryPath !== path.join(themeDir, path.basename(entry)) || path.dirname(entryPath) !== themeDir) {
      throw new Error('CSS 入口必须位于主题根目录')
    }

    return {
      schemaVersion,
      id,
      name: String(parsed.name || id).trim().slice(0, 80),
      description: String(parsed.description || '用户自定义主题').trim().slice(0, 160),
      version: String(parsed.version || '1.0.0').trim().slice(0, 40),
      author: String(parsed.author || 'User').trim().slice(0, 80),
      supports,
      entry: path.basename(entry),
      accentHex: HEX_COLOR_PATTERN.test(parsed.accentHex || '') ? parsed.accentHex : '#4A6CFF',
      source: 'user',
    }
  }

  async _validateThemeDirectory(themeDir) {
    const resolvedDir = path.resolve(themeDir)
    const stat = await fs.promises.stat(resolvedDir)
    if (!stat.isDirectory()) throw new Error('请选择主题文件夹')
    const manifest = await this._readManifest(resolvedDir)
    if (this.reservedIds.has(manifest.id)) throw new Error('主题 ID 与内置主题冲突')

    const cssPath = path.join(resolvedDir, manifest.entry)
    const cssStat = await fs.promises.stat(cssPath)
    if (!cssStat.isFile()) throw new Error('主题 CSS 入口不是文件')
    if (cssStat.size > MAX_CSS_BYTES) throw new Error('主题 CSS 不能超过 1 MB')

    const realDir = await fs.promises.realpath(resolvedDir)
    const realCssPath = await fs.promises.realpath(cssPath)
    if (path.dirname(realCssPath) !== realDir) throw new Error('主题 CSS 入口必须位于主题根目录')
    return manifest
  }

  async listThemes() {
    await this.init()
    const entries = await fs.promises.readdir(this.themesRoot, { withFileTypes: true })
    const themes = []
    const errors = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const themeDir = path.join(this.themesRoot, entry.name)
      try {
        const theme = await this._validateThemeDirectory(themeDir)
        if (theme.id !== entry.name) throw new Error('文件夹名称必须与主题 ID 一致')
        themes.push(theme)
      } catch (error) {
        errors.push({ directory: entry.name, error: error.message })
      }
    }
    themes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    return { success: true, themes, errors }
  }

  async readCss(id) {
    const themeDir = this._themeDir(id)
    const theme = await this._validateThemeDirectory(themeDir)
    const css = await fs.promises.readFile(path.join(themeDir, theme.entry), 'utf-8')
    return { success: true, theme, css }
  }

  async importFromDirectory(sourcePath) {
    const sourceDir = path.resolve(String(sourcePath || ''))
    const theme = await this._validateThemeDirectory(sourceDir)
    const targetDir = this._themeDir(theme.id)
    if (sourceDir === targetDir) return { success: true, theme, alreadyInstalled: true }
    if (fs.existsSync(targetDir)) throw new Error('同名主题已经存在，请先删除后再导入')

    await fs.promises.cp(sourceDir, targetDir, { recursive: true, errorOnExist: true, force: false })
    try {
      const installedTheme = await this._validateThemeDirectory(targetDir)
      return { success: true, theme: installedTheme }
    } catch (error) {
      await fs.promises.rm(targetDir, { recursive: true, force: true })
      throw error
    }
  }

  async removeTheme(id) {
    const normalized = this._assertThemeId(id)
    if (this.reservedIds.has(normalized)) throw new Error('内置主题不能删除')
    await fs.promises.rm(this._themeDir(normalized), { recursive: true, force: true })
    return { success: true }
  }

  async readCustomCss() {
    await this.init()
    const activePath = this._customCssPath()
    try {
      const stat = await this._assertCustomCssFileSafe(activePath)
      if (!stat) return { success: true, css: '', exists: false }
      if (stat.size > MAX_CSS_BYTES) throw new Error('自定义 CSS 不能超过 1 MB')
      const css = await fs.promises.readFile(activePath, 'utf-8')
      this._validateCustomCss(css)
      return { success: true, css, exists: true }
    } catch (error) { throw error }
  }

  async stageCustomCss(css) {
    return await this._enqueueCustomCssOperation(async () => {
      await this.init()
      const validated = this._validateCustomCss(css)
      await this._writeCustomCss(this._customCssPath(true), validated)
      return { success: true, css: validated }
    })
  }

  async commitCustomCss() {
    return await this._enqueueCustomCssOperation(async () => {
      await this.init()
      const pendingPath = this._customCssPath(true)
      let css
      try {
        await this._assertCustomCssFileSafe(pendingPath)
        css = await fs.promises.readFile(pendingPath, 'utf-8')
      } catch (error) {
        if (error?.code === 'ENOENT') throw new Error('没有等待确认的自定义 CSS')
        throw error
      }
      this._validateCustomCss(css)
      await this._writeCustomCss(this._customCssPath(), css)
      await fs.promises.rm(pendingPath, { force: true })
      return { success: true, css }
    })
  }

  async discardPendingCustomCss() {
    return await this._enqueueCustomCssOperation(async () => {
      await this.init()
      await fs.promises.rm(this._customCssPath(true), { force: true })
      return await this.readCustomCss()
    })
  }

  async resetCustomCss() {
    return await this._enqueueCustomCssOperation(async () => {
      await this.init()
      await Promise.all([
        fs.promises.rm(this._customCssPath(), { force: true }),
        fs.promises.rm(this._customCssPath(true), { force: true }),
      ])
      return { success: true, css: '', exists: false }
    })
  }
}
