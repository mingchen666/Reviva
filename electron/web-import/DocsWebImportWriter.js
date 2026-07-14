import fs from 'node:fs'
import path from 'node:path'
import { safeWebFileBase, webImportMarkdown } from './WebImportContent.js'
import { WEB_IMPORT_ERROR_CODES, WebImportError } from './WebImportErrors.js'

async function exists(filePath) {
  try { await fs.promises.access(filePath); return true } catch { return false }
}

export class DocsWebImportWriter {
  constructor({ workDirService } = {}) { this._workDir = workDirService }

  async _availableBase(targetDir, title, includeHtml) {
    const base = safeWebFileBase(title)
    for (let index = 1; index < 10000; index += 1) {
      const name = index === 1 ? base : `${base} (${index})`
      const markdownPath = path.join(targetDir, `${name}.md`)
      const htmlPath = path.join(targetDir, `${name}.html`)
      if (!await exists(markdownPath) && (!includeHtml || !await exists(htmlPath))) return { name, markdownPath, htmlPath }
    }
    throw new WebImportError(WEB_IMPORT_ERROR_CODES.WRITE_FAILED, '无法生成不冲突的文档名称。')
  }

  async write({ targetRef = '', document, includeHtml = false } = {}) {
    const docsRoot = this._workDir?.getDocsPath?.()
    if (!docsRoot) throw new WebImportError(WEB_IMPORT_ERROR_CODES.TARGET_MISSING, '文档工作区尚未初始化。')
    const targetDir = this._workDir.resolveAndValidate(path.join(docsRoot, String(targetRef || '')), 'docs')
    let stat
    try { stat = await fs.promises.stat(targetDir) } catch {}
    if (!stat?.isDirectory()) throw new WebImportError(WEB_IMPORT_ERROR_CODES.TARGET_MISSING, '目标文档目录已不存在。')
    const names = await this._availableBase(targetDir, document.title, includeHtml)
    const markdownTemp = `${names.markdownPath}.tmp-${process.pid}-${Date.now()}`
    try {
      await fs.promises.writeFile(markdownTemp, webImportMarkdown(document), 'utf8')
      await fs.promises.rename(markdownTemp, names.markdownPath)
    } catch (error) {
      await fs.promises.rm(markdownTemp, { force: true }).catch(() => {})
      throw error
    }
    const resultPaths = [path.relative(docsRoot, names.markdownPath).replace(/\\/g, '/')]
    let htmlError = document.htmlError || null
    if (includeHtml && document.content?.html) {
      const htmlTemp = `${names.htmlPath}.tmp-${process.pid}-${Date.now()}`
      try {
        await fs.promises.writeFile(htmlTemp, document.content.html, 'utf8')
        await fs.promises.rename(htmlTemp, names.htmlPath)
        resultPaths.push(path.relative(docsRoot, names.htmlPath).replace(/\\/g, '/'))
      } catch (error) {
        await fs.promises.rm(htmlTemp, { force: true }).catch(() => {})
        htmlError = error
      }
    } else if (includeHtml && !htmlError) {
      htmlError = new WebImportError(WEB_IMPORT_ERROR_CODES.HTML_FAILED, '服务商没有返回 HTML。')
    }
    return { title: names.name, resultPaths, htmlError }
  }
}
