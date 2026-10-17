import { dialog, globalShortcut } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function registerWorkspaceIpc(ipcMain, deps) {
  const {
    getWin, workspaceRegistryService, workspaceMigrationService,
    workDirService, DatabaseService, dbService, sharedState,
  } = deps

  let workspaceStartupError = deps.initialStartupError || ''

  async function createWorkspaceAt(rootPath, name) {
    if (!workspaceRegistryService) throw new Error('工作空间服务未就绪')
    const normalizedRoot = workspaceRegistryService.normalizeRoot(rootPath)
    if (!normalizedRoot) throw new Error('工作空间路径无效')
    workspaceRegistryService.assertNoWorkspaceNesting(normalizedRoot)
    if (fs.existsSync(path.join(normalizedRoot, '.reviva'))) throw new Error('目标目录已包含 .reviva，请使用"打开已有工作空间"')
    if (fs.existsSync(normalizedRoot)) {
      const entries = await fs.promises.readdir(normalizedRoot)
      if (entries.length) throw new Error('新建独立授权根目录需要选择空目录')
    }
    let config = null
    const tempDb = new DatabaseService()
    try {
      config = await workspaceRegistryService.prepareWorkspace(normalizedRoot, { name })
      tempDb.init(DatabaseService.workspaceDbPath(normalizedRoot))
    } catch (error) {
      await fs.promises.rm(path.join(normalizedRoot, '.reviva'), { recursive: true, force: true }).catch(() => {})
      for (const dirName of ['docs', 'notes', 'wikis', 'context', 'agents', 'skills']) {
        await fs.promises.rm(path.join(normalizedRoot, dirName), { recursive: true, force: true }).catch(() => {})
      }
      throw error
    } finally {
      tempDb.close()
    }
    return workspaceRegistryService.registerWorkspace({
      id: config.workspaceId,
      name: config.name,
      rootPath: normalizedRoot,
      createdAt: config.createdAt,
    }, { setPending: true })
  }

  async function openWorkspaceAt(rootPath) {
    if (!workspaceRegistryService) throw new Error('工作空间服务未就绪')
    workspaceRegistryService.assertNoWorkspaceNesting(rootPath, { allowSamePath: true })
    const validation = await workspaceRegistryService.validateWorkspace(rootPath, { allowLegacyConfig: true })
    if (!validation.valid) throw new Error(validation.error)
    const registeredAtPath = workspaceRegistryService.findByPath(validation.rootPath)
    if (registeredAtPath && validation.config?.workspaceId && registeredAtPath.id !== validation.config.workspaceId) {
      throw new Error('该路径的工作空间 ID 与已注册记录不一致，请先从列表移除旧记录')
    }
    const integrity = DatabaseService.checkDatabaseIntegrity(validation.dbPath)
    if (!integrity.ok) throw new Error(`数据库验证失败: ${integrity.error}`)
    const config = await workspaceRegistryService.ensureWorkspaceConfig(validation.rootPath, {
      workspaceId: registeredAtPath?.id || validation.config?.workspaceId,
      name: validation.config?.name || registeredAtPath?.name,
      createdAt: validation.config?.createdAt || registeredAtPath?.createdAt,
    })
    return workspaceRegistryService.registerWorkspace({
      id: config.workspaceId,
      name: config.name,
      rootPath: validation.rootPath,
      createdAt: config.createdAt,
    }, { setPending: true })
  }

  async function getWorkspaceStateWithAvailability() {
    if (!workspaceRegistryService) return { error: '工作空间服务未就绪', workspaces: [] }
    const state = workspaceRegistryService.getState()
    const workspaces = await Promise.all(state.workspaces.map(async workspace => {
      const validation = await workspaceRegistryService.validateRegisteredWorkspace(workspace)
      if (!validation.valid) return { ...workspace, available: false, error: validation.error }
      const integrity = DatabaseService.checkDatabaseIntegrity(validation.dbPath)
      return { ...workspace, available: integrity.ok, error: integrity.ok ? '' : integrity.error }
    }))
    return {
      ...state,
      startupError: workspaceStartupError,
      workspaces,
      activeWorkspace: workspaces.find(item => item.id === state.activeWorkspaceId) || null,
      pendingWorkspace: workspaces.find(item => item.id === state.pendingWorkspaceId) || null,
    }
  }

  ipcMain.handle('workdir:init', async (event, rootPath) => {
    try {
      const workspace = await createWorkspaceAt(rootPath)
      return { rootPath: workspace.rootPath, workspace, pendingRestart: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('workdir:getStatus', () => {
    if (!workDirService) return { initialized: false, rootPath: null, docsPath: null }
    return workDirService.getStatus()
  })

  ipcMain.handle('workdir:selectRoot', async () => {
    if (!getWin()) return { error: '应用未就绪' }
    const result = await dialog.showOpenDialog(getWin(), {
      properties: ['openDirectory'],
      title: '选择工作目录',
    })
    if (result.canceled) return null
    try {
      const workspace = await createWorkspaceAt(result.filePaths[0])
      return { rootPath: workspace.rootPath, workspace, pendingRestart: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('workdir:selectDir', async () => {
    if (!getWin()) return { error: '应用未就绪' }
    const result = await dialog.showOpenDialog(getWin(), {
      properties: ['openDirectory'],
      title: '选择工作目录',
    })
    if (result.canceled) return null
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('workspace:list', () => getWorkspaceStateWithAvailability())
  ipcMain.handle('workspace:getBootstrapState', () => workspaceRegistryService?.getState() || { activeWorkspaceId: null, workspaces: [] })

  ipcMain.handle('workspace:selectDirectory', async (event, options = {}) => {
    if (!getWin()) return { error: '应用未就绪' }
    const result = await dialog.showOpenDialog(getWin(), {
      properties: ['openDirectory', 'createDirectory'],
      title: options?.title || '选择工作空间目录',
      defaultPath: options?.defaultPath || undefined,
    })
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true }
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('workspace:create', async (event, data = {}) => {
    try {
      const workspace = await createWorkspaceAt(data.rootPath, data.name)
      const state = await getWorkspaceStateWithAvailability()
      return { success: true, workspace, state, pendingRestart: !!state.pendingWorkspaceId }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:open', async (event, data = {}) => {
    try {
      const workspace = await openWorkspaceAt(data.rootPath)
      const state = await getWorkspaceStateWithAvailability()
      return { success: true, workspace, state, pendingRestart: !!state.pendingWorkspaceId }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:setPending', async (event, id) => {
    try {
      const workspace = workspaceRegistryService?.findById(id)
      if (!workspace) throw new Error('工作空间不存在')
      const validation = await workspaceRegistryService.validateRegisteredWorkspace(workspace)
      if (!validation.valid) throw new Error(validation.error)
      const integrity = DatabaseService.checkDatabaseIntegrity(validation.dbPath)
      if (!integrity.ok) throw new Error(`数据库验证失败: ${integrity.error}`)
      await workspaceRegistryService.setPending(id)
      return { success: true, state: await getWorkspaceStateWithAvailability(), pendingRestart: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:cancelPending', async () => {
    try {
      await workspaceRegistryService?.cancelPending()
      return { success: true, state: await getWorkspaceStateWithAvailability() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:rename', async (event, data = {}) => {
    try {
      const workspace = await workspaceRegistryService?.renameWorkspace(data.id, data.name)
      return { success: true, workspace, state: await getWorkspaceStateWithAvailability() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:remove', async (event, id) => {
    try {
      await workspaceRegistryService?.removeWorkspace(id)
      return { success: true, state: await getWorkspaceStateWithAvailability() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('workspace:migrate', async (event, data = {}) => {
    if (!workspaceMigrationService || !workDirService?.getRootPath()) return { success: false, error: '当前工作空间未就绪' }
    return workspaceMigrationService.migrate({
      sourceRoot: workDirService.getRootPath(),
      targetRoot: data.targetRoot,
      name: data.name,
    })
  })

  ipcMain.handle('workspace:cleanupFailedMigration', async (event, targetRoot) => {
    try {
      if (!workspaceMigrationService) throw new Error('迁移服务未就绪')
      return await workspaceMigrationService.cleanupFailed(targetRoot)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Shortcut registration
  const activeGlobalAccelerators = new Map()

  function acceleratorFromCombo(combo) {
    if (!Array.isArray(combo)) return ''
    return combo.map(k => {
      const map = {
        Ctrl: 'CmdOrCtrl', Control: 'CmdOrCtrl', Meta: 'CmdOrCtrl',
        Spacebar: 'Space', ' ': 'Space',
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
        Escape: 'Esc',
      }
      return map[k] || k
    }).join('+')
  }

  async function registerGlobalShortcuts(bindings) {
    const globalKeys = ['global_invoke']
    const previous = new Map(activeGlobalAccelerators)
    for (const accelerator of previous.values()) {
      try { globalShortcut.unregister(accelerator) } catch (_) {}
    }
    activeGlobalAccelerators.clear()

    const failed = []
    const registeredAccelerators = []
    for (const key of globalKeys) {
      const candidate = bindings?.[key]
      const combo = Array.isArray(candidate) && acceleratorFromCombo(candidate)
        ? candidate
        : ['Ctrl', 'Alt', 'Space']
      if (!combo) continue
      const accel = acceleratorFromCombo(combo)
      if (!accel) continue
      try {
        const didRegister = globalShortcut.register(accel, () => {
          const win = getWin()
          if (!win) return
          if (win.isVisible()) win.hide()
          else { win.show(); win.focus() }
        })
        if (!didRegister) {
          console.warn(`[Shortcut] Failed to register: ${accel} (${key})`)
          failed.push({ key, accel, reason: 'conflict' })
        } else {
          activeGlobalAccelerators.set(key, accel)
          registeredAccelerators.push(accel)
        }
      } catch (e) {
        console.warn(`[Shortcut] Error registering ${key}:`, e.message)
        failed.push({ key, accel, reason: e.message })
      }
    }

    if (failed.length) {
      for (const accelerator of registeredAccelerators) {
        try { globalShortcut.unregister(accelerator) } catch (_) {}
      }
      activeGlobalAccelerators.clear()
      for (const [key, accelerator] of previous.entries()) {
        try {
          const restored = globalShortcut.register(accelerator, () => {
            const win = getWin()
            if (!win) return
            if (win.isVisible()) win.hide()
            else { win.show(); win.focus() }
          })
          if (restored) activeGlobalAccelerators.set(key, accelerator)
        } catch (_) {}
      }
    }
    return failed
  }

  ipcMain.handle('shortcuts:register', async (_e, bindings) => {
    try {
      const failed = await registerGlobalShortcuts(bindings)
      return { ok: true, failed }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  return { registerGlobalShortcuts, getWorkspaceStateWithAvailability, setWorkspaceStartupError: (v) => { workspaceStartupError = v }, acceleratorFromCombo }
}
