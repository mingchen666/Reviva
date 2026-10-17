// electron/main.js
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Menu, protocol, net, safeStorage } from 'electron'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createMenu } from './menu'
import { DatabaseService } from './DatabaseService'
import { WorkDirService } from './WorkDirService'
import { WorkspaceRegistryService } from './WorkspaceRegistryService.js'
import { WorkspaceMigrationService } from './WorkspaceMigrationService.js'
import { LogService } from './LogService'
import { NoteFileService } from './NoteFileService'
import { registerDbHandlers } from './db-handlers'
import { AgentService } from './AgentService'
import { LearningMemoryService, registerLearningMemoryIpcHandlers } from './learning-memory/index.js'
import { AgentHealthService } from './AgentHealthService'
import { SkillService } from './SkillService'
import { OutputScanService } from './OutputScanService'
import { PptxExportService } from './PptxExportService'
import { GenerationTaskService } from './GenerationTaskService'
import { McpService } from './McpService'
import { KnowledgeSourceService } from './knowledge-source/KnowledgeSourceService'
import { WikiService } from './WikiService.js'
import { BackupService, applyPendingBackupRestore } from './BackupService.js'
import { ThemeService } from './ThemeService.js'
import { setThemeService as setThemeServiceForTools, setMainWindowRef as setMainWindowRefForTools } from './agents/langchainTools.js'
import { StorageCleanupService } from './StorageCleanupService.js'
import { WebImportService } from './web-import/WebImportService.js'
import { WebImportJobService } from './web-import/WebImportJobService.js'
import { DocsWebImportWriter } from './web-import/DocsWebImportWriter.js'
import { createMediaModule } from './media/index.js'
import { registerMediaIpcHandlers } from './media/ipc/mediaIpcHandlers.js'
import { PdfLifecycleService } from './tools/pdf/PdfLifecycleService.js'
import { createLocalGateway } from './local-gateway/index.js'
import { registerGatewayIpcHandlers } from './local-gateway/ipc/gatewayIpcHandlers.js'
import path from 'node:path'
import fs from 'node:fs'
import { initAutoUpdater } from './AutoUpdater'
import { registerRealtimeASRHandlers, cleanupRealtimeASRForSender } from './RealtimeASRService.js'

// IPC handler modules
import { createPathHelpers, ensureWorkspaceDirs } from './ipc/shared.js'
import { registerThemeIpc } from './ipc/themeIpc.js'
import { registerDialogIpc } from './ipc/dialogIpc.js'
import { registerFsIpc } from './ipc/fsIpc.js'
import { registerRecycleBinIpc } from './ipc/recycleBinIpc.js'
import { registerWindowIpc } from './ipc/windowIpc.js'
import { registerSkillIpc } from './ipc/skillIpc.js'
import { registerMcpPdfIpc } from './ipc/mcpPdfIpc.js'
import { registerAppSystemIpc } from './ipc/appSystemIpc.js'
import { registerEnvIpc } from './ipc/envIpc.js'
import { registerWorkspaceIpc } from './ipc/workspaceIpc.js'
import { registerTrayIpc } from './ipc/trayIpc.js'
import { registerModelsIpc } from './ipc/modelsIpc.js'
import { registerDataIpc } from './ipc/dataIpc.js'

// Register reviva-file:// as a privileged scheme BEFORE app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'reviva-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

const APP_NAME = 'Reviva'
const APP_ID = 'com.reviva.desktop'
const WORKSPACE_POINTER_FILE = 'workspace-root.json'

app.setName(APP_NAME)
if (process.platform === 'win32') app.setAppUserModelId(APP_ID)

// --- Shared mutable state (accessed by IPC modules via deps) ---
const sharedState = {
  forceQuit: false,
  minimizeToTray: false,
  singleInstanceLocked: false,
}

// --- Service variables (initialized in whenReady) ---
let win = null
let dbService = null
let workDirService = null
let workspaceRegistryService = null
let workspaceMigrationService = null
let workspaceStartupError = ''
let noteFileService = null
let logService = null
let agentService = null
let knowledgeSourceService = null
let learningMemoryService = null
let agentHealthService = null
let skillService = null
let pptxExportService = null
let outputScanService = null
let generationTaskService = null
let mcpService = null
let wikiService = null
let webImportService = null
let webImportJobService = null
let mediaModule = null
let backupService = null
let themeService = null
let pdfLifecycleService = null
let localGateway = null
const storageCleanupService = new StorageCleanupService()
const skillImportSessions = new Map()

// IPC module return values (populated in whenReady)
let trayMgr = null
let workspaceIpcApi = null
let skillIpcApi = null

// --- Helper functions ---

function getWin() { return win }

function getWorkspacePointerPath() {
  return path.join(app.getPath('userData'), WORKSPACE_POINTER_FILE)
}

function readWorkspaceRootPointer() {
  try {
    const pointerPath = getWorkspacePointerPath()
    if (!fs.existsSync(pointerPath)) return ''
    const data = JSON.parse(fs.readFileSync(pointerPath, 'utf-8'))
    return typeof data.rootPath === 'string' ? data.rootPath : ''
  } catch (err) {
    console.warn('[Workspace] Failed to read workspace pointer:', err.message)
    return ''
  }
}

async function writeWorkspaceRootPointer(rootPath) {
  const pointerPath = getWorkspacePointerPath()
  await fs.promises.mkdir(path.dirname(pointerPath), { recursive: true })
  await fs.promises.writeFile(
    pointerPath,
    JSON.stringify({ rootPath: path.resolve(rootPath), updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  )
}

function applyStartupSetting(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath })
}

function focusMainWindow() {
  if (!win) return
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function isMainWindowActivelyVisible() {
  try {
    return !!(win && !win.isDestroyed() && win.isFocused() && win.isVisible() && !win.isMinimized())
  } catch { return false }
}

function playNotificationSoundFromMain(soundName, { fallbackBeep = false } = {}) {
  let sentToRenderer = false
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send('play-sound', soundName || 'complete')
      sentToRenderer = true
    }
  } catch (e) {
    console.warn('[Notification] Failed to send play-sound:', e.message)
  }
  if (fallbackBeep && !isMainWindowActivelyVisible()) {
    try { shell.beep() } catch { /* best-effort */ }
  }
  return { ok: sentToRenderer || fallbackBeep, sentToRenderer }
}

function notifyAgentTaskSoundFromMain({ kind } = {}) {
  try {
    if (!dbService) return { ok: false, error: 'Database service is not ready' }
    if (dbService.getSetting('notifyDND') === true) return { ok: true, skipped: 'dnd' }
    if (kind === 'done' && dbService.getSetting('notifyTaskDone') !== true) return { ok: true, skipped: 'done-disabled' }
    if (kind === 'failed' && dbService.getSetting('notifyTaskFailed') !== true) return { ok: true, skipped: 'failed-disabled' }
    if (isMainWindowActivelyVisible()) return { ok: true, skipped: 'active-window' }
    if (dbService.getSetting('notifySound') !== true) return { ok: true, skipped: 'sound-disabled' }
    const soundName = kind === 'failed' ? 'error' : (dbService.getSetting('notifySoundType') || 'complete')
    return playNotificationSoundFromMain(soundName, { fallbackBeep: true })
  } catch (e) {
    console.warn('[Notification] Agent task sound failed:', e.message)
    return { ok: false, error: e.message }
  }
}

function applySingleInstance(enabled, { quitOnFail = false } = {}) {
  if (!enabled) {
    if (sharedState.singleInstanceLocked) app.releaseSingleInstanceLock()
    sharedState.singleInstanceLocked = false
    return { ok: true }
  }
  if (sharedState.singleInstanceLocked) return { ok: true }
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    if (quitOnFail) app.quit()
    return { ok: false, error: APP_NAME + ' is already running' }
  }
  sharedState.singleInstanceLocked = true
  return { ok: true }
}

app.on('second-instance', focusMainWindow)

function createWindow() {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 960, minHeight: 600,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    frame: isMac,
    titleBarStyle: isMac ? 'default' : 'hidden',
    backgroundColor: '#0e0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('maximize', () => win?.webContents.send('window:maximizedChanged', true))
  win.on('unmaximize', () => win?.webContents.send('window:maximizedChanged', false))

  win.webContents.on('did-finish-load', async () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
    try {
      if (dbService) {
        const saved = dbService.getSetting('shortcutBindings')
        const legacyDefault = 'CmdOrCtrl+Shift+Space'
        const defaultGlobalInvoke = ['Ctrl', 'Alt', 'Space']
        const bindings = saved && typeof saved === 'object' ? { ...saved } : {}
        if (!Array.isArray(bindings.global_invoke)
          || workspaceIpcApi?.acceleratorFromCombo(bindings.global_invoke) === legacyDefault) {
          bindings.global_invoke = defaultGlobalInvoke
          if (saved && typeof saved === 'object') dbService.setSetting('shortcutBindings', bindings)
        }
        await workspaceIpcApi?.registerGlobalShortcuts(bindings)
        sharedState.minimizeToTray = dbService.getSetting('minimizeToTray') === true
        applyStartupSetting(dbService.getSetting('autoStart') === true)
        trayMgr?.loadTrayConfig(dbService)
        const showTray = dbService.getSetting('trayIcon') !== false
        if (showTray) trayMgr?.createTray()
      }
    } catch (e) { console.warn('[Startup] did-finish-load settings:', e.message) }
  })

  win.on('close', (e) => {
    if (!sharedState.forceQuit && sharedState.minimizeToTray) {
      e.preventDefault()
      win.hide()
    }
  })

  const wc = win.webContents
  win.on('closed', () => {
    cleanupRealtimeASRForSender(wc)
    win = null
  })

  if (VITE_DEV_SERVER_URL) {
    const loadDevServer = (retries = 10) => {
      win.loadURL(VITE_DEV_SERVER_URL).catch(() => {
        if (retries > 0) setTimeout(() => loadDevServer(retries - 1), 1000)
      })
    }
    loadDevServer()
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- App Lifecycle ---

app.on('will-quit', () => {
  void localGateway?.stop?.()
  learningMemoryService?.dispose?.()
  mediaModule?.runner?.stop?.()
  mediaModule?.maintenance?.stop?.()
  globalShortcut.unregisterAll()
  trayMgr?.destroyTray?.()
})

app.on('window-all-closed', () => {
  learningMemoryService?.dispose?.()
  mediaModule?.runner?.stop?.()
  mediaModule?.maintenance?.stop?.()
  if (dbService) dbService.close()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(async () => {
  await applyPendingBackupRestore({ stateRoot: app.getPath('userData') })
  themeService = new ThemeService(path.join(app.getPath('userData'), 'themes'), {
    reservedIds: ['default', 'clarity', 'serene', 'contrast', 'neon-protocol', 'vermilion-archive', 'amber-terminal'],
    guidePath: app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-assets', 'themes', 'THEMING.md')
      : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'themes', 'THEMING.md'),
  })
  await themeService.init()
  setThemeServiceForTools(themeService)

  workspaceRegistryService = new WorkspaceRegistryService(app.getPath('userData'))
  await workspaceRegistryService.init()
  let startupWorkspace = null
  const startupCandidates = workspaceRegistryService.getStartupCandidates()
  for (const candidate of startupCandidates) {
    const validation = await workspaceRegistryService.validateRegisteredWorkspace(candidate)
    if (!validation.valid) {
      workspaceStartupError = '\u65e0\u6cd5\u6253\u5f00"' + candidate.name + '": ' + validation.error
      continue
    }
    const integrity = DatabaseService.checkDatabaseIntegrity(validation.dbPath)
    if (!integrity.ok) {
      workspaceStartupError = '\u65e0\u6cd5\u6253\u5f00"' + candidate.name + '": ' + integrity.error
      continue
    }
    startupWorkspace = candidate
    break
  }
  if (workspaceRegistryService.getState().pendingWorkspaceId && startupWorkspace?.id !== workspaceRegistryService.getState().pendingWorkspaceId) {
    await workspaceRegistryService.cancelPending()
  }

  dbService = new DatabaseService()
  if (startupWorkspace) dbService.init(DatabaseService.workspaceDbPath(startupWorkspace.rootPath))
  else dbService.init()
  const singleInstance = dbService.getSetting('singleInstance') !== false
  const singleInstanceResult = applySingleInstance(singleInstance, { quitOnFail: true })
  if (singleInstance && !singleInstanceResult.ok) return

  workDirService = new WorkDirService(dbService)
  if (startupWorkspace) {
    workDirService.setRootPath(startupWorkspace.rootPath)
    dbService.setSetting('workdir_root', startupWorkspace.rootPath)
    await workspaceRegistryService.ensureWorkspaceConfig(startupWorkspace.rootPath, {
      workspaceId: startupWorkspace.id,
      name: startupWorkspace.name,
      createdAt: startupWorkspace.createdAt,
    })
    await workspaceRegistryService.markActive(startupWorkspace.id)
  } else {
    workDirService.loadFromDb()
  }

  // Path helpers (need workDirService ready)
  const { validateFsPath, validateShellPath, toWorkspaceVirtualPath } = createPathHelpers(workDirService)

  // Handle reviva-file:// protocol
  protocol.handle('reviva-file', (request) => {
    try {
      const url = new URL(request.url)
      let filePath = ''
      if (url.hostname === 'local') {
        filePath = decodeURIComponent(String(url.pathname || '').replace(/^\/+/, ''))
      } else {
        filePath = decodeURIComponent(url.pathname || '')
        if (/^\/[a-zA-Z]:/.test(filePath)) filePath = filePath.slice(1)
      }
      if (filePath.startsWith('//') && !/^\/\/[a-zA-Z]:/i.test(filePath)) filePath = filePath.slice(1)
      const validatedPath = validateFsPath(filePath)
      return net.fetch(pathToFileURL(validatedPath).toString())
    } catch (e) {
      return new Response('bad reviva-file URL: ' + e.message, { status: 400 })
    }
  })

  mediaModule = createMediaModule({ database: dbService, workDirService, secretStore: safeStorage })
  registerMediaIpcHandlers(ipcMain, mediaModule)
  mediaModule.runner?.start?.().catch(err => console.error('[MediaJobRunner] Failed to start:', err.message))
  mediaModule.maintenance?.start?.().catch(err => console.error('[MediaMaintenance] Failed to start:', err.message))
  workspaceMigrationService = new WorkspaceMigrationService({
    dbService, registryService: workspaceRegistryService, getWin: () => win,
  })
  noteFileService = new NoteFileService(dbService, workDirService)
  pdfLifecycleService = new PdfLifecycleService({ dbService, workDirService })
  const interruptedPdfRuns = dbService.cancelInterruptedPdfParseRuns?.()
  if (interruptedPdfRuns?.changes) console.warn('[PdfLifecycle] Cancelled ' + interruptedPdfRuns.changes + ' interrupted PDF parse run(s).')
  ensureWorkspaceDirs(workDirService).catch(err => console.error('[Workspace] Failed to ensure workspace dirs:', err.message))

  logService = new LogService(workDirService)

  mcpService = new McpService(dbService)
  const builtinMcpServersDir = app.isPackaged
    ? path.join(process.resourcesPath, 'builtin-assets', 'mcp-servers')
    : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'mcp-servers')
  try {
    const result = mcpService.installAllBuiltinServers(builtinMcpServersDir)
    console.log('[McpService] Builtin MCP install result:', result)
  } catch (err) {
    console.error('[McpService] Failed to install builtin MCP servers:', err.message)
  }

  agentService = new AgentService(dbService, () => win, workDirService, mcpService, {
    notifyTask: notifyAgentTaskSoundFromMain,
  }, noteFileService)
  agentService.init()
  agentService.setMediaModule?.(mediaModule)

  knowledgeSourceService = new KnowledgeSourceService(dbService, agentService._kbRegistry)
  knowledgeSourceService.setCreateModel((...args) => agentService._createModel(...args))
  knowledgeSourceService.registerIpc(ipcMain)

  learningMemoryService = new LearningMemoryService({ dbService, workDirService, getWin: () => win })
  learningMemoryService.init()
  agentService.setLearningMemoryService(learningMemoryService)
  registerLearningMemoryIpcHandlers(learningMemoryService)

  skillService = new SkillService(workDirService, {
    builtinSkillsDir: app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-assets', 'skills')
      : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'skills'),
  })
  agentService.setSkillService(skillService)
  agentHealthService = new AgentHealthService(dbService, skillService)
  pptxExportService = new PptxExportService()
  outputScanService = new OutputScanService(workDirService, dbService)
  generationTaskService = new GenerationTaskService(dbService, () => win, workDirService, agentService)
  generationTaskService.init()
  wikiService = new WikiService(workDirService, dbService, agentService, mediaModule)
  wikiService.init()
  agentService.setWikiService?.(wikiService)

  webImportService = new WebImportService({ dbService })
  webImportJobService = new WebImportJobService({
    dbService, webImportService,
    docsWriter: new DocsWebImportWriter({ workDirService }),
    wikiService, getWin: () => win, ipcMain,
  })
  webImportJobService.init()
  setTimeout(() => webImportJobService.restorePendingJobs().catch(err => {
    console.warn('[WebImportJobService] Failed to restore jobs:', err.message)
  }), 0)

  localGateway = createLocalGateway({
    dbService, agentService, wikiService, workDirService,
    webImportJobService, mediaModule, noteFileService,
    secretStore: safeStorage, appVersion: app.getVersion(), logger: console,
  })
  registerGatewayIpcHandlers(ipcMain, localGateway)

  backupService = new BackupService(dbService, workDirService, {
    appVersion: app.getVersion(), restoreStateRoot: app.getPath('userData'),
  })

  // Ensure agents directory exists in workspace
  const workspaceRoot = workDirService.getRootPath()
  if (workspaceRoot) {
    const agentsDir = path.join(workspaceRoot, 'agents')
    if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true })
    const sharedAgentDir = path.join(agentsDir, '_shared')
    if (!fs.existsSync(sharedAgentDir)) fs.mkdirSync(sharedAgentDir, { recursive: true })
  }

  // ── Register IPC handlers ──
  registerThemeIpc(ipcMain, { themeService, getWin })
  registerDialogIpc(ipcMain, { getWin })
  registerFsIpc(ipcMain, { validateFsPath, validateShellPath, pdfLifecycleService, mediaModule })
  registerRecycleBinIpc(ipcMain, { dbService, workDirService, noteFileService, pdfLifecycleService, mediaModule, learningMemoryService, validateFsPath })
  registerWindowIpc(ipcMain, { getWin })
  skillIpcApi = registerSkillIpc(ipcMain, { dbService, skillService, getWin, skillImportSessions })
  registerMcpPdfIpc(ipcMain, { mcpService, dbService, workDirService, validateFsPath, toWorkspaceVirtualPath, outputScanService, pptxExportService })
  registerAppSystemIpc(ipcMain, { getWin, workDirService, storageCleanupService, sharedState })
  registerEnvIpc(ipcMain, { getWin, dbService, backupService })
  workspaceIpcApi = registerWorkspaceIpc(ipcMain, { getWin, workspaceRegistryService, workspaceMigrationService, workDirService, DatabaseService, dbService, sharedState, initialStartupError: workspaceStartupError })
  trayMgr = registerTrayIpc(ipcMain, { getWin, sharedState, playNotificationSound: playNotificationSoundFromMain, applySingleInstance })
  registerModelsIpc(ipcMain)
  registerDataIpc(ipcMain, { dbService, logService, agentHealthService })

  // Preserve custom Skills when an update introduces a builtin with the same ID
  try {
    await skillIpcApi.migrateCustomSkillBuiltinCollisions()
    await skillService.installAllBuiltinSkills()
  } catch (err) {
    console.error('[SkillService] Failed to install builtin skills:', err.message)
  }

  // Install all built-in conversational agents into DB
  const builtinAgentsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'builtin-assets', 'agents')
    : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'agents')
  try {
    await agentService.installAllBuiltinAgents(builtinAgentsDir)
  } catch (err) {
    console.error('[AgentService] Failed to install builtin agents:', err.message)
  }

  registerDbHandlers(dbService, {
    notes: noteFileService, noteFolders: noteFileService,
    mediaLifecycle: mediaModule?.lifecycle, learningMemory: learningMemoryService,
  })
  registerRealtimeASRHandlers(ipcMain)
  createWindow()
  setMainWindowRefForTools(win)
  initAutoUpdater(win)
  if (VITE_DEV_SERVER_URL) {
    createMenu(win)
  } else {
    Menu.setApplicationMenu(null)
  }
}).catch((error) => {
  console.error('[Startup] Application initialization failed:', error)
  try {
    dialog.showErrorBox('Reviva \u542f\u52a8\u5931\u8d25', error?.message || String(error))
  } catch { /* the app may already be shutting down */ }
  app.quit()
})
