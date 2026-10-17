export function registerDataIpc(ipcMain, deps) {
  const { dbService, logService, agentHealthService } = deps

  // ── Token Usage ──
  ipcMain.handle('tokenUsage:create', async (_, data) => {
    return dbService.createTokenUsage(data)
  })

  ipcMain.handle('tokenUsage:summary', async (_, range) => {
    return dbService.getTokenUsageSummary(range)
  })

  ipcMain.handle('tokenUsage:byModel', async (_, range) => {
    return dbService.getTokenUsageByModel(range)
  })

  ipcMain.handle('tokenUsage:byAgent', async (_, range) => {
    return dbService.getTokenUsageByAgent(range)
  })

  ipcMain.handle('tokenUsage:daily', async (_, range) => {
    return dbService.getTokenUsageDaily(range)
  })

  ipcMain.handle('tokenUsage:cleanup', async (_, beforeDate) => {
    return dbService.deleteOldTokenUsage(beforeDate)
  })

  // ── Logs ──
  ipcMain.handle('logs:read', async (_, date, filters) => {
    return logService ? logService.readLogs(date, filters) : []
  })

  ipcMain.handle('logs:listDates', async () => {
    return logService ? logService.listLogDates() : []
  })

  ipcMain.handle('logs:cleanup', async (_, beforeDate) => {
    return logService ? { deleted: logService.deleteOldLogs(beforeDate) } : { deleted: 0 }
  })

  // ── Agent Health ──
  ipcMain.handle('agent:healthCheck', async (_, agentIds, options = {}) => {
    if (!agentHealthService) return []
    return agentHealthService.checkAgents(agentIds, options)
  })
}
