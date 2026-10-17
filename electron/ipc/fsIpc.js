import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'

export function registerFsIpc(ipcMain, { validateFsPath, validateShellPath, pdfLifecycleService, mediaModule }) {
  ipcMain.handle('fs:readFile', async (event, filePath, options = {}) => {
    try {
      const validatedPath = validateFsPath(filePath)
      const content = await fs.promises.readFile(validatedPath, options.encoding || 'utf-8')
      return { success: true, data: content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
    try {
      const validatedPath = validateFsPath(filePath)
      const dir = path.dirname(validatedPath)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      await fs.promises.writeFile(validatedPath, content, options.encoding || 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:listDir', async (event, dirPath, options = {}) => {
    try {
      const validatedPath = validateFsPath(dirPath)
      const entries = await fs.promises.readdir(validatedPath, { withFileTypes: true })
      let results = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(validatedPath, entry.name)
        let size = 0
        try {
          const stat = await fs.promises.stat(entryPath)
          size = stat.size
        } catch {
          // The entry may disappear between readdir and stat; keep it listable.
        }
        return {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size,
        }
      }))
      if (options.pattern) {
        const regex = new RegExp(options.pattern.replace('*', '.*'))
        results = results.filter(f => regex.test(f.name))
      }
      return { success: true, data: results }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
    try {
      const vOld = validateFsPath(oldPath)
      const vNew = validateFsPath(newPath)
      const oldStat = await fs.promises.stat(vOld)
      if (oldStat.isFile()) {
        const oldExt = path.extname(vOld).toLowerCase()
        const newExt = path.extname(vNew).toLowerCase()
        if (oldExt !== newExt) {
          return { success: false, error: '不能修改文件扩展名，仅支持修改文件名。' }
        }
      }
      if (fs.existsSync(vNew) && path.resolve(vOld).toLowerCase() !== path.resolve(vNew).toLowerCase()) {
        return { success: false, error: '目标名称已存在。' }
      }
      await fs.promises.rename(vOld, vNew)
      if (pdfLifecycleService) {
        try {
          await pdfLifecycleService.onRenamed(vOld, vNew, { isDirectory: oldStat.isDirectory() })
        } catch (error) {
          console.error('[PdfLifecycle] Failed to update renamed PDF references:', error)
        }
      }
      if (mediaModule?.lifecycle) {
        try {
          mediaModule.lifecycle.onRenamed(vOld, vNew, { isDirectory: oldStat.isDirectory() })
        } catch (error) {
          console.error('[MediaLifecycle] Failed to update renamed media references:', error)
        }
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:deleteFile', async (event, filePath) => {
    try {
      const validatedPath = validateFsPath(filePath)
      let mediaSnapshot = null
      try { mediaSnapshot = mediaModule?.lifecycle?.prepareMoveToTrash?.(validatedPath, { isDirectory: false }) || null }
      catch (error) { console.error('[MediaLifecycle] Failed to snapshot deleted file:', error) }
      await fs.promises.unlink(validatedPath)
      if (mediaSnapshot) {
        await mediaModule.lifecycle.onPermanentlyDeleted({ payload_json: JSON.stringify({ mediaLifecycle: mediaSnapshot }) })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:mkdir', async (event, dirPath, options = {}) => {
    try {
      const validatedPath = validateFsPath(dirPath)
      await fs.promises.mkdir(validatedPath, { recursive: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:removeDir', async (event, dirPath) => {
    try {
      const validatedPath = validateFsPath(dirPath)
      let mediaSnapshot = null
      try { mediaSnapshot = mediaModule?.lifecycle?.prepareMoveToTrash?.(validatedPath, { isDirectory: true }) || null }
      catch (error) { console.error('[MediaLifecycle] Failed to snapshot deleted directory:', error) }
      await fs.promises.rm(validatedPath, { recursive: true, force: true })
      if (mediaSnapshot) {
        await mediaModule.lifecycle.onPermanentlyDeleted({ payload_json: JSON.stringify({ mediaLifecycle: mediaSnapshot }) })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:copyFile', async (event, src, dest) => {
    try {
      const vDest = validateFsPath(dest)
      const dir = path.dirname(vDest)
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
      await fs.promises.copyFile(src, vDest)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('fs:exists', async (event, filePath) => {
    try {
      const validatedPath = validateFsPath(filePath)
      return fs.existsSync(validatedPath)
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:stat', async (event, filePath) => {
    try {
      const validatedPath = validateFsPath(filePath)
      const stat = await fs.promises.stat(validatedPath)
      return {
        success: true,
        data: {
          size: stat.size,
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          mtime: stat.mtime.toISOString(),
          birthtime: stat.birthtime.toISOString(),
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('shell:openPath', async (event, filePath) => {
    try {
      const validatedPath = validateShellPath(filePath)
      const error = await shell.openPath(validatedPath)
      if (error) return { success: false, error }
      return { success: true }
    } catch (err) {
      console.error('shell:openPath rejected:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
    try {
      const validatedPath = validateShellPath(filePath)
      shell.showItemInFolder(validatedPath)
      return { success: true }
    } catch (err) {
      console.error('shell:showItemInFolder rejected:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('shell:openExternal', async (_, url) => {
    if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL' }
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return { success: false, error: 'Invalid URL' }
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return { success: false, error: 'Only http(s) and mailto URLs allowed' }
    }
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}
