import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { ipcMain } from 'electron'

let win = null

function initAutoUpdater(mainWindow) {
  win = mainWindow

  // 开发模式不检查更新
  if (process.env.NODE_ENV === 'development') {
    console.log('[AutoUpdater] 开发模式，跳过自动更新')
    return
  }

  // 配置
  autoUpdater.autoDownload = false // 不自动下载，先提示用户
  autoUpdater.autoInstallOnAppQuit = true // 退出时自动安装

  // 事件监听
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] 正在检查更新...')
    sendToRenderer('update:checking')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] 发现新版本:', info.version)
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] 当前已是最新版本')
    sendToRenderer('update:not-available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] 更新已下载:', info.version)
    sendToRenderer('update:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] 错误:', err.message)
    sendToRenderer('update:error', { message: err.message })
  })

  // IPC handlers
  ipcMain.handle('update:check', () => {
    try {
      return autoUpdater.checkForUpdates()
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('update:download', () => {
    try {
      return autoUpdater.downloadUpdate()
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('update:install', () => {
    // setImmediate 让 IPC response 先回去，再退出安装
    setImmediate(() => autoUpdater.quitAndInstall())
  })

  // 启动后延迟 3s 自动检查一次
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)
}

function sendToRenderer(channel, data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

export { initAutoUpdater }