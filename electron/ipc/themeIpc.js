import { dialog, shell } from 'electron'

export function registerThemeIpc(ipcMain, { themeService, getWin }) {
  ipcMain.handle('theme:list', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.listThemes()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:readCss', async (_event, id) => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.readCss(id)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:import', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      const result = await dialog.showOpenDialog(getWin(), {
        title: '选择主题文件夹',
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }
      return await themeService.importFromDirectory(result.filePaths[0])
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:remove', async (_event, id) => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.removeTheme(id)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:openDirectory', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      await themeService.init()
      const error = await shell.openPath(themeService.getRootPath())
      return error ? { success: false, error } : { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:readCustomCss', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.readCustomCss()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:stageCustomCss', async (_event, css) => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.stageCustomCss(css)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:commitCustomCss', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.commitCustomCss()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:discardPendingCustomCss', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.discardPendingCustomCss()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('theme:resetCustomCss', async () => {
    try {
      if (!themeService) return { success: false, error: '主题服务尚未就绪' }
      return await themeService.resetCustomCss()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
