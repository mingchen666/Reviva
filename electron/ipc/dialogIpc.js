import { dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

export function registerDialogIpc(ipcMain, { getWin, requireFn }) {
  const require = requireFn || createRequire(import.meta.url)

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(getWin(), {
      properties: ['openDirectory'],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:openFile', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(getWin(), {
      properties: ['openFile', 'multiSelections'],
      filters: options.filters || [
        { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:saveTextFile', async (event, options = {}, content = '') => {
    try {
      if (typeof content !== 'string') return { success: false, error: 'INVALID_FILE_CONTENT' }
      const result = await dialog.showSaveDialog(getWin(), {
        title: options.title || '保存文件',
        defaultPath: options.defaultPath || '',
        filters: Array.isArray(options.filters) && options.filters.length
          ? options.filters
          : [{ name: 'Text', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }
      const extension = String(options.defaultExtension || '').replace(/[^a-zA-Z0-9]/g, '').trim()
      const existingExtension = path.extname(result.filePath)
      const basePath = existingExtension === '.' ? result.filePath.slice(0, -1) : result.filePath
      const filePath = extension && (!existingExtension || existingExtension === '.')
        ? `${basePath}.${extension}`
        : result.filePath
      await fs.promises.writeFile(filePath, content, options.encoding || 'utf-8')
      return { success: true, path: filePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('dialog:saveMarkdownDocx', async (event, options = {}, markdown = '') => {
    try {
      if (typeof markdown !== 'string' || !markdown.trim()) {
        return { success: false, error: 'INVALID_MARKDOWN_CONTENT' }
      }

      const result = await dialog.showSaveDialog(getWin(), {
        title: options.title || '导出 Word',
        defaultPath: options.defaultPath || '',
        filters: Array.isArray(options.filters) && options.filters.length
          ? options.filters
          : [{ name: 'Word 文档', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }

      const existingExtension = path.extname(result.filePath)
      const filePath = existingExtension
        ? result.filePath
        : `${result.filePath}.docx`

      const { default: markdownDocx, Packer } = require('markdown-docx')
      const doc = await markdownDocx(markdown, {
        gfm: true,
        theme: {
          bodySize: 11,
          lineSpacing: 1.35,
          margin: '2cm 2.2cm',
          heading1: '2F5597',
          heading2: '5B9BD5',
          codeBackground: 'F3F4F6',
        },
      })
      const buffer = await Packer.toBuffer(doc)
      await fs.promises.writeFile(filePath, buffer)
      return { success: true, path: filePath }
    } catch (error) {
      console.error('[Export] Failed to convert Markdown to DOCX:', error)
      return { success: false, error: error?.message || 'DOCX_EXPORT_FAILED' }
    }
  })
}
