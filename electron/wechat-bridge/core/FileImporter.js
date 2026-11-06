// 微信文件导入：把微信 FILE 消息的媒体下载到「微信bot文件」目录。
// 纯链接也导入为 .url.md 文件，供 Agent 作为上下文读取。
// 图片不走目录——按设计转临时文件给 Agent（本步暂未接 Agent 附件，留待后续）。
import path from 'node:path'
import fs from 'node:fs'

export const BOT_FILE_DIR_NAME = '微信bot文件'
const MAX_NAME_LEN = 90

function sanitizeFileName(name) {
  let n = String(name || '未命名文件').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim()
  if (!n) n = '未命名文件'
  if (n.length > MAX_NAME_LEN) n = n.slice(0, MAX_NAME_LEN)
  return n
}

function uniquePath(target) {
  if (!fs.existsSync(target)) return target
  const ext = path.extname(target)
  const base = path.basename(target, ext)
  const dir = path.dirname(target)
  for (let i = 1; i < 999; i++) {
    const p = path.join(dir, base + ' (' + i + ')' + ext)
    if (!fs.existsSync(p)) return p
  }
  return target + '.' + Date.now()
}

function urlToName(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '') || 'link'
    const tail = u.pathname.split('/').filter(Boolean).pop() || ''
    return (host + (tail ? '-' + tail : '')).slice(0, 60)
  } catch (e) {
    return 'link'
  }
}

export class FileImporter {
  constructor({ workDirService, logger = console } = {}) {
    this._workDir = workDirService
    this._client = null
    this._logger = logger
  }

  setClient(client) { this._client = client }

  _dir() {
    const wd = this._workDir
    const docs = wd && typeof wd.getDocsPath === 'function' ? wd.getDocsPath() : null
    if (!docs) return null
    const dir = path.join(docs, BOT_FILE_DIR_NAME)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!this._migrated) { this._migrated = true; this._migrateLegacy(wd, dir) }
    return dir
  }

  _migrateLegacy(wd, newDir) {
    try {
      const root = typeof wd.getRootPath === 'function' ? wd.getRootPath() : null
      if (!root) return
      const legacy = path.join(root, BOT_FILE_DIR_NAME)
      if (legacy === newDir || !fs.existsSync(legacy)) return
      for (const name of fs.readdirSync(legacy)) {
        const src = path.join(legacy, name)
        const dst = path.join(newDir, name)
        if (fs.existsSync(dst)) continue
        try { fs.renameSync(src, dst) } catch (e) { this._logger.warn && this._logger.warn('[FileImporter] migrate', name, e.message) }
      }
      if (fs.readdirSync(legacy).length === 0) fs.rmdirSync(legacy)
    } catch (e) { this._logger.warn && this._logger.warn('[FileImporter] migrate legacy failed', e.message) }
  }

  /** 下载微信文件消息到目录，返回 { path, name, size } 或 null */
  async importFileMessage(fileItem) {
    if (!fileItem || !this._client) return null
    const media = fileItem.media
    if (!media) return null
    const dir = this._dir()
    if (!dir) return null
    const rawName = String(fileItem.file_name || '未命名文件')
    const target = uniquePath(path.join(dir, sanitizeFileName(rawName)))
    const buf = await this._client.downloadMedia(media)
    const data = Buffer.from(buf || [])
    fs.writeFileSync(target, data)
    this._logger.info && this._logger.info('[FileImporter] saved', path.basename(target), data.length)
    return { path: target, name: path.basename(target), size: data.length }
  }

  /** 纯链接导入为 .url.md，返回 { path, name, size } 或 null */
  async importUrl(url) {
    const dir = this._dir()
    if (!dir) return null
    const content = '# 微信导入链接\n\n来源：微信消息\n\n' + String(url) + '\n'
    const target = uniquePath(path.join(dir, sanitizeFileName(urlToName(url)) + '.url.md'))
    fs.writeFileSync(target, content, 'utf-8')
    return { path: target, name: path.basename(target), size: Buffer.byteLength(content) }
  }

  /** 图片下载到授权根目录下的临时目录（.reviva/wxbot-img），方便查看与清理 */
  async downloadImageToTemp(imageItem) {
    if (!imageItem || !this._client) return null
    const media = imageItem.media
    if (!media) return null
    const dir = this._imgDir()
    if (!dir) return null
    const tmp = path.join(dir, 'wxbot_img_' + Date.now() + '.jpg')
    const buf = await this._client.downloadMedia(media)
    fs.writeFileSync(tmp, Buffer.from(buf || []))
    return tmp
  }

  _imgDir() {
    const root = this._workDir && typeof this._workDir.getRootPath === 'function' ? this._workDir.getRootPath() : null
    if (!root) return null
    const dir = path.join(root, '.reviva', 'wxbot-img')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  listImages() {
    const dir = this._imgDir()
    if (!dir || !fs.existsSync(dir)) return []
    try {
      return fs.readdirSync(dir).filter(n => /\.(jpg|jpeg|png|gif|webp)$/i.test(n)).map(n => {
        const full = path.join(dir, n)
        try {
          const buf = fs.readFileSync(full)
          const ext = path.extname(n).slice(1).toLowerCase()
          const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/' + ext
          return { name: n, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'), size: buf.length }
        } catch (e) { return null }
      }).filter(Boolean)
    } catch (e) { return [] }
  }

  deleteImage(name) {
    const dir = this._imgDir()
    if (!dir) return false
    const full = path.join(dir, path.basename(String(name || '')))
    try { fs.unlinkSync(full); return true } catch (e) { return false }
  }
}

export function isPureUrl(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (/\s/.test(t)) return false
  return /^https?:\/\/\S+$/i.test(t)
}