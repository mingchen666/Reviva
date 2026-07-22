export function registerGatewayIpcHandlers(ipcMain, gateway) {
  if (!ipcMain || !gateway) return
  ipcMain.handle('localGateway:getStatus', () => gateway.getStatus())
  ipcMain.handle('localGateway:createKey', () => gateway.createKey())
  ipcMain.handle('localGateway:resetKey', () => gateway.resetKey())
  ipcMain.handle('localGateway:getKey', () => gateway.getKey())
  ipcMain.handle('localGateway:updateConfig', async (_, patch) => gateway.updateConfig(patch))
  ipcMain.handle('localGateway:restart', () => gateway.restart())
}
