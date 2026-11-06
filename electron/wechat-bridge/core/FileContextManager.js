// 微信bot文件目录的上下文管理：列出文件、最近 10 个保持挂载（作为 Agent ctxPaths）。
// 挂载策略：按修改时间倒序取前 MAX_MOUNTED 个。
import path from 'node:path'
import fs from 'node:fs'
import { BOT_FILE_DIR_NAME } from './FileImporter.js'

const MAX_MOUNTED = 10

const ICON_BY_EXT = {
  '.md': 'ri-markdown-line', '.txt': 'ri-file-text-line', '.pdf': 'ri-file-pdf-2-line',
  '.doc': 'ri-file-word-2-line', '.docx': 'ri-file-word-2-line', '.xls': 'ri-file-excel-2-line',
  '.xlsx': 'ri-file-excel-2-line', '.ppt': 'ri-file-ppt-2-line', '.pptx': 'ri-file-ppt-2-line',
  '.csv': 'ri-file-text-line', '.json': 'ri-braces-line', '.html': 'ri-html5-line',
  '.zip': 'ri-file-zip-line', '.png': 'ri-image-line', '.jpg': 'ri-image-line',
  '.jpeg': 'ri-image-line', '.gif': 'ri-image-line', '.mp3': 'ri-music-line',
  '.mp4': 'ri-video-line', '.url.md': 'ri-link',
}

function iconFor(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.url.md')) return ICON_BY_EXT['.url.md']
  const ext = path.extname(lower)
  return ICON_BY_EXT[ext] || 'ri-file-3-line'
}

export class FileContextManager {
  constructor({ workDirService, logger = console } = {}) {
    this._workDir = workDirService
    this._logger = logger
  }

  _dir() {
    const wd = this._workDir
    const docs = wd && typeof wd.getDocsPath === 'function' ? wd.getDocsPath() : null
    if (!docs) return null
    return path.join(docs, BOT_FILE_DIR_NAME)
  }

  getDir() { return this._dir() }

  /** 列出目录文件（含 mounted 标记），按修改时间倒序 */
  listFiles() {
    const dir = this._dir()
    if (!dir || !fs.existsSync(dir)) return []
    let entries = []
    try {
      entries = fs.readdirSync(dir).map(name => {
        const full = path.join(dir, name)
        try {
          const st = fs.statSync(full)
          if (st.isDirectory()) return null
          return { name, path: full, size: st.size, mtime: st.mtimeMs }
        } catch (e) { return null }
      }).filter(Boolean)
    } catch (e) { return [] }
    entries.sort((a, b) => b.mtime - a.mtime)
    return entries.map((e, i) => ({
      name: e.name, path: e.path, size: e.size, mtime: e.mtime,
      mounted: i < MAX_MOUNTED, icon: iconFor(e.name),
    }))
  }

  /** 最近 MAX_MOUNTED 个文件路径，供 AgentRunner 作为 ctxPaths */
  getMountedPaths() {
    return this.listFiles().filter(f => f.mounted).map(f => f.path)
  }
}