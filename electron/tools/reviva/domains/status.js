
export function register(registry, _services) {
  // app_info
  registry.register({
    domain: 'status', id: 'app_info', name: '应用信息', write: false,
    params: '',
    example: {},
    execute: async (_params, _ctx) => {
      const { app } = await import('electron')
      const data = {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      }
      return { data, changedKeys: [] }
    },
  })

  // workspace_info
  registry.register({
    domain: 'status', id: 'workspace_info', name: '工作区信息', write: false,
    params: '',
    example: {},
    execute: async (_params, ctx) => {
      const data = ctx.workDirService?.getStatus?.() || { error: 'WorkDirService unavailable' }
      return { data, changedKeys: [] }
    },
  })

  // system_env
  registry.register({
    domain: 'status', id: 'system_env', name: '系统环境', write: false,
    params: '',
    example: {},
    execute: async (_params, _ctx) => {
      const { getSystemEnv } = await import('../../../systemEnv.js')
      const data = getSystemEnv()
      return { data, changedKeys: [] }
    },
  })
}
