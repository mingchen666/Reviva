import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { formatStorageSize } from '../StorageCleanupService.js'

export function registerAppSystemIpc(ipcMain, deps) {
  const { getWin, workDirService, storageCleanupService, sharedState } = deps

  function getRendererSession(event) {
    const rendererSession = event?.sender?.session || getWin()?.webContents?.session
    if (!rendererSession) throw new Error('当前窗口会话不可用')
    return rendererSession
  }

  // Chromium HTTP cache
  ipcMain.handle('app:getCacheSize', async (event) => {
    try {
      const bytes = await getRendererSession(event).getCacheSize()
      return { success: true, data: { bytes, formatted: formatStorageSize(bytes) } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:clearCache', async (event) => {
    try {
      const rendererSession = getRendererSession(event)
      const beforeBytes = await rendererSession.getCacheSize()
      await rendererSession.clearCache()
      const bytes = await rendererSession.getCacheSize()
      return {
        success: true,
        data: {
          bytes,
          formatted: formatStorageSize(bytes),
          clearedBytes: Math.max(0, beforeBytes - bytes),
        },
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // Workspace temporary files (/tmp)
  ipcMain.handle('app:getTempSize', async () => {
    try {
      const data = await storageCleanupService.getTempSize(workDirService?.getRootPath?.() || '')
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:clearTempFiles', async () => {
    try {
      const data = await storageCleanupService.clearTempFiles(workDirService?.getRootPath?.() || '')
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:relaunch', async () => {
    try {
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:quit', () => {
    if (sharedState) sharedState.forceQuit = true
    app.quit()
    return { success: true }
  })

  ipcMain.handle('app:getDataSize', async () => {
    try {
      const dataRoot = workDirService?.getRootPath?.() || app.getPath('userData')
      function calcDirSize(dirPath) {
        let total = 0
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory()) {
              total += calcDirSize(fullPath)
            } else {
              try { total += fs.statSync(fullPath).size } catch { /* skip */ }
            }
          }
        } catch { /* skip */ }
        return total
      }
      const totalBytes = calcDirSize(dataRoot)
      function fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
      }
      return { success: true, data: { total: fmtSize(totalBytes), raw: totalBytes } }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('app:getSysInfo', () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      arch: process.arch,
    }
  })
}
