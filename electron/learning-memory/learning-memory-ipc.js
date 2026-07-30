import { ipcMain } from 'electron'

function handle(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await handler(...args)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error?.message || String(error) }
    }
  })
}

export function registerLearningMemoryIpcHandlers(service) {
  handle('learningMemory:getSettings', () => service.getSettings())
  handle('learningMemory:updateSettings', patch => service.updateSettings(patch || {}))
  handle('learningMemory:getOverview', () => service.getOverview())
  handle('learningMemory:getRuntimeStatus', () => service.getRuntimeStatus())
  handle('learningMemory:retractEvent', traceId => service.retractEvent(traceId))
  handle('learningMemory:clearAll', () => service.clearAll())
}
