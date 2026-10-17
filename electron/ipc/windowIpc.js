import { app } from 'electron'

export function registerWindowIpc(ipcMain, { getWin }) {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:getPath', (event, name) => app.getPath(name))

  ipcMain.handle('window:minimize', () => { getWin()?.minimize() })

  ipcMain.handle('window:maximize', () => {
    const win = getWin()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle('window:close', () => { getWin()?.close() })

  ipcMain.handle('window:isMaximized', () => !!getWin()?.isMaximized())

  ipcMain.handle('app:getWindowPresence', () => ({
    ok: true,
    isFocused: !!getWin()?.isFocused(),
    isVisible: !!getWin()?.isVisible(),
    isMinimized: !!getWin()?.isMinimized(),
  }))
}
