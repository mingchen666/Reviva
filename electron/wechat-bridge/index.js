import { WeChatBridgeService } from './core/WeChatBridgeService.js'

export function createWeChatBridge(options) {
  const opts = options || {}
  const service = new WeChatBridgeService({
    dbService: opts.dbService,
    secretStore: opts.secretStore,
    agentService: opts.agentService || null,
    workDirService: opts.workDirService || null,
    getWin: opts.getWin,
    logger: opts.logger || console,
  })
  return {
    start: () => service.start(),
    stop: () => service.stop(),
    login: () => service.login(),
    logout: () => service.logout(),
    getStatus: () => service.getStatus(),
    getConfig: () => service.getConfig(),
    setConfig: (patch) => service.setConfig(patch),
    getAgents: () => service.getAgents(),
    listFiles: () => service.listFiles(),
    listImages: () => service.listImages(),
    deleteImage: (name) => service.deleteImage(name),
    clearPendingImages: () => service.clearPendingImages(),
    listReminders: () => service.listReminders(),
    addReminder: (r) => service.addReminder(r),
    deleteReminder: (id) => service.deleteReminder(id),
    updateReminder: (id, data) => service.updateReminder(id, data),
    listReminderLogs: (opts) => service.listReminderLogs(opts),
    clearReminderLogs: () => service.clearReminderLogs(),
  }
}

export { WeChatBridgeService }
