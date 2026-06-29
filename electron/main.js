// electron/main.js
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Tray, Menu, Notification, nativeImage, protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createMenu } from './menu'
import { DatabaseService } from './DatabaseService'
import { WorkDirService } from './WorkDirService'
import { LogService } from './LogService'
import { NoteFileService } from './NoteFileService'
import { registerDbHandlers } from './db-handlers'
import { AgentService } from './AgentService'
import { AgentHealthService } from './AgentHealthService'
import { SkillService } from './SkillService'
import { OutputScanService } from './OutputScanService'
import { PptxExportService } from './PptxExportService'
import { GenerationTaskService } from './GenerationTaskService'
import { McpService } from './McpService'
import { WikiService } from './WikiService.js'
import { getOfficeCliCommandCandidates, getOfficeCliSpawnEnv } from './officeCliResolver.js'
import { getSystemEnv } from './systemEnv.js'
import path from 'node:path'
import fs from 'node:fs'
import { initAutoUpdater } from './AutoUpdater'
// Register reviva-file:// as a privileged scheme BEFORE app is ready so <img>/<audio>/<video> can load
// local files (range-request capable, CORS-enabled). Renderer uses helper toFileUrl(absPath) to build URLs.
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

let win
let dbService = null
let workDirService = null
let noteFileService = null
let logService = null
let agentService = null
let agentHealthService = null
let skillService = null
let pptxExportService = null
let outputScanService = null
let generationTaskService = null
let mcpService = null
let wikiService = null
let tray = null
let minimizeToTray = false
let forceQuit = false
let singleInstanceLocked = false

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
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    path: process.execPath,
  })
}

function focusMainWindow() {
  if (!win) return
  if (!win.isVisible()) win.show()
  if (win.isMinimized()) win.restore()
  win.focus()
}

function applySingleInstance(enabled, { quitOnFail = false } = {}) {
  if (!enabled) {
    if (singleInstanceLocked) app.releaseSingleInstanceLock()
    singleInstanceLocked = false
    return { ok: true }
  }
  if (singleInstanceLocked) return { ok: true }

  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    if (quitOnFail) app.quit()
    return { ok: false, error: `${APP_NAME} is already running` }
  }
  singleInstanceLocked = true
  return { ok: true }
}

app.on('second-instance', focusMainWindow)

function createWindow() {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
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
    // Register global shortcuts from saved config
    try {
      if (dbService) {
        const saved = dbService.getSetting('shortcutBindings')
        const bindings = saved || {
          global_invoke: ['Ctrl', 'Shift', 'Space'],
        }
        await registerGlobalShortcuts(bindings)
        // Apply saved notification/startup settings
        const mt = dbService.getSetting('minimizeToTray')
        minimizeToTray = mt === true
        const autoStart = dbService.getSetting('autoStart')
        applyStartupSetting(autoStart === true)
        const showTray = dbService.getSetting('trayIcon') !== false
        if (showTray) createTray()
      }
    } catch (e) { console.warn('[Shortcut] Failed to register on load:', e.message) }
  })

  // Intercept window close: minimize to tray or quit
  win.on('close', (e) => {
    if (!forceQuit && minimizeToTray) {
      e.preventDefault()
      win.hide()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    const loadDevServer = (retries = 10) => {
      win.loadURL(VITE_DEV_SERVER_URL).catch(() => {
        if (retries > 0) {
          setTimeout(() => loadDevServer(retries - 1), 1000)
        }
      })
    }
    loadDevServer()
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ========== Helper: Validate path against workspace ==========

const PERCENT_BYTES_RE = /(?:%[0-9A-Fa-f]{2})+/g
const QUOTE_BOUNDARY_RE = /^[`'"\u201c\u201d\u2018\u2019<]+|[`'"\u201c\u201d\u2018\u2019>]+$/g

function decodePercentRuns(value) {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value.replace(PERCENT_BYTES_RE, seq => {
      try { return decodeURIComponent(seq) } catch { return seq }
    })
  }
}

function normalizeIncomingPath(inputPath) {
  if (typeof inputPath !== 'string') return inputPath
  let p = inputPath.trim().replace(QUOTE_BOUNDARY_RE, '')
  if (/^(file|reviva-file):\/\//i.test(p)) {
    try {
      const url = new URL(p)
      p = decodePercentRuns(url.pathname || '')
      if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1)
    } catch {
      // Keep the original value and still try percent-decoding below.
    }
  }
  return decodePercentRuns(p)
}

function validateFsPath(inputPath) {
  const normalizedPath = normalizeIncomingPath(inputPath)
  // No sandbox when workspace not configured — sandbox only activates after setup
  if (!workDirService || !workDirService.getRootPath()) return normalizedPath
  return workDirService.resolveAndValidate(normalizedPath, 'any')
}

function validateShellPath(inputPath) {
  const normalizedPath = normalizeIncomingPath(inputPath)
  // Shell actions may open the workspace root itself; file I/O remains limited to scoped subdirs.
  if (!workDirService || !workDirService.getRootPath()) return normalizedPath
  const resolved = path.resolve(normalizedPath)
  const root = path.resolve(workDirService.getRootPath())
  if (resolved.toLowerCase() === root.toLowerCase()) return resolved
  return workDirService.resolveAndValidate(normalizedPath, 'any')
}

async function ensureWorkspaceDirs() {
  const rootPath = workDirService?.getRootPath?.()
  if (!rootPath) return
  const dirs = [
    path.join(rootPath, 'docs'),
    path.join(rootPath, 'notes'),
    path.join(rootPath, 'wikis'),
    path.join(rootPath, 'agents'),
    path.join(rootPath, 'skills'),
    path.join(rootPath, '.reviva'),
    path.join(rootPath, '.reviva', 'trash'),
    path.join(rootPath, '.reviva', 'logs'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })
  }
}

// ========== IPC Handlers ==========

// Open directory dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Open file dialog
ipcMain.handle('dialog:openFile', async (event, options = {}) => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: options.filters || [
      { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled) return []
  return result.filePaths
})

// Read file
ipcMain.handle('fs:readFile', async (event, filePath, options = {}) => {
  try {
    const validatedPath = validateFsPath(filePath)
    const content = await fs.promises.readFile(validatedPath, options.encoding || 'utf-8')
    return { success: true, data: content }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Write file
ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
  try {
    const validatedPath = validateFsPath(filePath)
    const dir = path.dirname(validatedPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    await fs.promises.writeFile(validatedPath, content, options.encoding || 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// List directory
ipcMain.handle('fs:listDir', async (event, dirPath, options = {}) => {
  try {
    const validatedPath = validateFsPath(dirPath)
    const entries = await fs.promises.readdir(validatedPath, { withFileTypes: true })
    let results = entries.map(entry => ({
      name: entry.name,
      path: path.join(validatedPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }))
    if (options.pattern) {
      const regex = new RegExp(options.pattern.replace('*', '.*'))
      results = results.filter(f => regex.test(f.name))
    }
    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Rename file
ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
  try {
    const vOld = validateFsPath(oldPath)
    const vNew = validateFsPath(newPath)
    await fs.promises.rename(vOld, vNew)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Delete file
ipcMain.handle('fs:deleteFile', async (event, filePath) => {
  try {
    const validatedPath = validateFsPath(filePath)
    await fs.promises.unlink(validatedPath)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Create directory
ipcMain.handle('fs:mkdir', async (event, dirPath, options = {}) => {
  try {
    const validatedPath = validateFsPath(dirPath)
    await fs.promises.mkdir(validatedPath, { recursive: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Remove directory recursively
ipcMain.handle('fs:removeDir', async (event, dirPath) => {
  try {
    const validatedPath = validateFsPath(dirPath)
    await fs.promises.rm(validatedPath, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Copy file
ipcMain.handle('fs:copyFile', async (event, src, dest) => {
  try {
    const vDest = validateFsPath(dest)
    const dir = path.dirname(vDest)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    await fs.promises.copyFile(src, vDest)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Check if path exists
ipcMain.handle('fs:exists', async (event, filePath) => {
  try {
    const validatedPath = validateFsPath(filePath)
    return fs.existsSync(validatedPath)
  } catch {
    // If sandbox rejects, path is outside workspace
    return false
  }
})

// Get file stats
ipcMain.handle('fs:stat', async (event, filePath) => {
  try {
    const validatedPath = validateFsPath(filePath)
    const stat = await fs.promises.stat(validatedPath)
    return {
      success: true,
      data: {
        size: stat.size,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        mtime: stat.mtime.toISOString(),
        birthtime: stat.birthtime.toISOString(),
      },
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Open file in default application
ipcMain.handle('shell:openPath', async (event, filePath) => {
  try {
    const validatedPath = validateShellPath(filePath)
    const error = await shell.openPath(validatedPath)
    if (error) return { success: false, error }
    return { success: true }
  } catch (err) {
    console.error('shell:openPath rejected:', err.message)
    return { success: false, error: err.message }
  }
})

// Show file in folder
ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
  try {
    const validatedPath = validateShellPath(filePath)
    shell.showItemInFolder(validatedPath)
    return { success: true }
  } catch (err) {
    console.error('shell:showItemInFolder rejected:', err.message)
    return { success: false, error: err.message }
  }
})

// Open external URL in system browser
ipcMain.handle('shell:openExternal', async (_, url) => {
  if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL' }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { success: false, error: 'Invalid URL' }
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    return { success: false, error: 'Only http(s) and mailto URLs allowed' }
  }
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ========== Recycle Bin IPC Handlers ==========

// Helper: restore a file-type item (FS rename trash_path → original_path)
async function _restoreFileItem(record) {
  const originalDir = path.dirname(record.original_path)
  if (!fs.existsSync(originalDir)) await fs.promises.mkdir(originalDir, { recursive: true })
  let restorePath = record.original_path
  if (fs.existsSync(restorePath)) {
    const ext = path.extname(restorePath)
    const base = path.basename(restorePath, ext)
    restorePath = path.join(originalDir, base + '_restored' + ext)
  }
  if (fs.existsSync(record.trash_path)) {
    await fs.promises.rename(record.trash_path, restorePath)
  }
  return restorePath
}

// Helper: restore a DB-type item (re-INSERT into original table)
async function _restoreDbItem(record) {
  const payload = record.payload_json ? JSON.parse(record.payload_json) : {}
  if (record.item_type === 'conversation') {
    const conv = payload.conv
    const messages = payload.messages || []
    if (!conv) throw new Error('Conversation payload missing')
    // Group fallback: if original group was deleted, fall back to 'default'
    const groupExists = conv.group_id === 'default' || dbService.listConvGroups().some(g => g.id === conv.group_id)
    if (!groupExists) conv.group_id = 'default'
    // ID conflict: re-generate
    if (dbService.getConv(conv.id)) conv.id = 'conv_' + Date.now()
    dbService.createConv(conv)
    for (const m of messages) {
      m.conversation_id = conv.id
      if (m.id) m.id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
      dbService.createMsg(m)
    }
    return { restoredId: conv.id }
  }
  if (record.item_type === 'note') {
    if (noteFileService) return await noteFileService.restoreNote(record)
    const note = payload.note
    if (!note) throw new Error('Note payload missing')
    if (note.folder_id && !dbService.getNoteFolder(note.folder_id)) note.folder_id = ''
    if (dbService.getNote(note.id)) note.id = 'nt_' + Date.now()
    dbService.createNote(note)
    return { restoredId: note.id }
  }
  if (record.item_type === 'note_folder') {
    const folder = payload.folder
    if (!folder) throw new Error('Folder payload missing')
    if (folder.parent_id && !dbService.getNoteFolder(folder.parent_id)) folder.parent_id = ''
    if (dbService.getNoteFolder(folder.id)) folder.id = 'nf_' + Date.now()
    dbService.createNoteFolder(folder)
    return { restoredId: folder.id }
  }
  if (record.item_type === 'artifact') {
    const artifact = payload.artifact
    const taskSnapshot = payload.task
    if (!artifact) throw new Error('Artifact payload missing')
    const originalArtifactId = artifact.id
    if (artifact.group_id && artifact.group_id !== 'default') {
      const groupExists = dbService.listConvGroups().some(g => g.id === artifact.group_id)
      if (!groupExists) artifact.group_id = 'default'
    }
    if (artifact.storage_type === 'file' && record.trash_path && record.original_path) {
      artifact.file_path = await _restoreFileItem(record)
    }
    if (dbService.getArtifact(artifact.id)) artifact.id = 'art_' + Date.now()
    const restored = dbService.createArtifact(artifact)
    let restoredTaskId = ''
    if (taskSnapshot && typeof taskSnapshot === 'object') {
      const baseParams = taskSnapshot.params && typeof taskSnapshot.params === 'object' ? taskSnapshot.params : {}
      const originalIds = Array.isArray(baseParams.artifactIds) ? baseParams.artifactIds : []
      const artifactIds = originalIds
        .map(id => id === originalArtifactId ? restored.id : id)
        .filter(Boolean)
      if (!artifactIds.includes(restored.id)) artifactIds.push(restored.id)

      const taskId = taskSnapshot.id || 'task_' + Date.now()
      const existingTask = dbService.getTask(taskId)
      if (existingTask) {
        const params = existingTask.params && typeof existingTask.params === 'object' ? existingTask.params : {}
        const mergedIds = new Set(Array.isArray(params.artifactIds) ? params.artifactIds : [])
        if (existingTask.artifact_id) mergedIds.add(existingTask.artifact_id)
        mergedIds.add(restored.id)
        dbService.updateTask(taskId, {
          status: 'completed',
          progress: 100,
          artifact_id: existingTask.artifact_id || restored.id,
          params: { ...params, artifactIds: [...mergedIds].filter(Boolean) },
        })
      } else {
        dbService.createTask({
          ...taskSnapshot,
          id: taskId,
          name: taskSnapshot.name || artifact.title || '生成结果',
          status: 'completed',
          progress: 100,
          error: '',
          group_id: artifact.group_id || taskSnapshot.group_id || 'default',
          conversation_id: artifact.conversation_id || taskSnapshot.conversation_id || '',
          artifact_id: taskSnapshot.artifact_id && taskSnapshot.artifact_id !== originalArtifactId ? taskSnapshot.artifact_id : restored.id,
          params: { ...baseParams, artifactIds },
          steps: Array.isArray(taskSnapshot.steps) ? taskSnapshot.steps : [],
        })
      }
      restoredTaskId = taskId
    }
    return { restoredId: restored.id, restoredTaskId }
  }
  throw new Error('Unknown item_type: ' + record.item_type)
}

// Helper: permanently delete (FS for files, no-op for DB items — data already gone)
async function _permanentlyDeleteItem(record) {
  if (record.item_type === 'file' || record.item_type === 'note' || record.item_type === 'artifact' || !record.item_type) {
    if (record.trash_path && fs.existsSync(record.trash_path)) {
      if (record.is_directory) {
        await fs.promises.rm(record.trash_path, { recursive: true, force: true })
      } else {
        await fs.promises.unlink(record.trash_path)
      }
    }
  }
  // DB items: nothing to delete on disk; data was already removed from origin table at trash time
}

ipcMain.handle('recycleBin:moveToTrash', async (event, itemPath, itemMeta) => {
  try {
    const validatedPath = validateFsPath(itemPath)
    const rootPath = workDirService?.getRootPath()
    if (!rootPath) return { success: false, error: 'No workspace initialized' }

    const trashDir = path.join(rootPath, '.reviva', 'trash')
    if (!fs.existsSync(trashDir)) {
      await fs.promises.mkdir(trashDir, { recursive: true })
    }

    const timestamp = Date.now()
    const originalName = path.basename(validatedPath)
    const trashName = timestamp + '_' + originalName
    const trashPath = path.join(trashDir, trashName)

    let stat = null
    try { stat = await fs.promises.stat(validatedPath) } catch { /* ignore */ }

    await fs.promises.rename(validatedPath, trashPath)

    const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : ''
    const isDir = stat ? stat.isDirectory() : (itemMeta?.isDirectory || false)
    let category = 'other'
    if (isDir) category = 'folder'
    else if (['pdf', 'docx', 'doc', 'md', 'markdown', 'txt', 'xlsx', 'xls', 'pptx', 'ppt', 'csv'].includes(ext)) category = 'document'
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) category = 'image'
    else if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) category = 'video'
    else if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) category = 'audio'
    else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) category = 'archive'
    else if (['js', 'py', 'json', 'java', 'cpp', 'ts', 'html', 'css'].includes(ext)) category = 'code'

    const record = dbService.createTrashItem({
      original_path: validatedPath,
      original_name: originalName,
      trash_path: trashPath,
      is_directory: isDir,
      size: stat ? (isDir ? 0 : stat.size) : 0,
      file_type: ext,
      category,
      item_type: 'file',
    })

    return { success: true, data: record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Soft-delete a generated artifact: file artifacts move their file to trash; data artifacts keep a DB snapshot.
ipcMain.handle('recycleBin:trashArtifact', async (event, artifactId, options = {}) => {
  try {
    const artifact = dbService.getArtifact(artifactId)
    if (!artifact) return { success: false, error: 'Artifact not found' }
    const titleOverride = typeof options?.title === 'string' ? options.title.trim() : ''
    const artifactSnapshot = { ...artifact, title: titleOverride || artifact.title }
    const taskSnapshot = options?.task && typeof options.task === 'object'
      ? {
        id: options.task.id || '',
        name: options.task.name || titleOverride || artifact.title || '',
        type: options.task.type || 'agent',
        status: options.task.status || 'completed',
        architecture: options.task.architecture || '',
        space_id: options.task.space_id || '',
        agent_id: options.task.agent_id || '',
        skill_type: options.task.skill_type || '',
        progress: options.task.progress || 100,
        steps: Array.isArray(options.task.steps) ? options.task.steps : [],
        result: options.task.result || '',
        error: options.task.error || '',
        tool_id: options.task.tool_id || artifact.type || '',
        mode: options.task.mode || 'local',
        conversation_id: options.task.conversation_id || artifact.conversation_id || '',
        group_id: options.task.group_id || artifact.group_id || 'default',
        params: options.task.params && typeof options.task.params === 'object' ? options.task.params : {},
        artifact_id: options.task.artifact_id || artifact.id,
        cloud_task_id: options.task.cloud_task_id || '',
      }
      : null

    let originalPath = artifact.file_path || ''
    let trashPath = ''
    let size = (artifactSnapshot.content || '').length
    let fileType = artifact.type || 'artifact'

    if (artifact.storage_type === 'file' && artifact.file_path) {
      const validatedPath = validateFsPath(artifact.file_path)
      originalPath = validatedPath
      const originalName = path.basename(validatedPath)
      const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : ''
      fileType = ext || artifact.type || 'artifact'

      if (fs.existsSync(validatedPath)) {
        const rootPath = workDirService?.getRootPath()
        if (!rootPath) return { success: false, error: 'No workspace initialized' }
        const trashDir = path.join(rootPath, '.reviva', 'trash')
        if (!fs.existsSync(trashDir)) {
          await fs.promises.mkdir(trashDir, { recursive: true })
        }

        const stat = await fs.promises.stat(validatedPath)
        size = stat.isDirectory() ? 0 : stat.size
        const trashName = `${Date.now()}_${artifact.id}_${originalName}`
        trashPath = path.join(trashDir, trashName)
        await fs.promises.rename(validatedPath, trashPath)
      }
    }

    const record = dbService.createTrashItem({
      original_path: originalPath,
      original_name: artifactSnapshot.title || (originalPath ? path.basename(originalPath) : 'Untitled artifact'),
      trash_path: trashPath,
      is_directory: 0,
      size,
      file_type: fileType,
      category: 'artifact',
      item_type: 'artifact',
      item_id: artifactId,
      payload_json: JSON.stringify({ artifact: artifactSnapshot, task: taskSnapshot, fileMoved: !!trashPath }),
    })
    dbService.deleteArtifact(artifactId)
    return { success: true, data: record }
  } catch (err) {
    console.error('[RecycleBin] trashArtifact failed:', err)
    return { success: false, error: err.message }
  }
})

// Soft-delete a conversation: snapshot conv + messages → recycle_bin → hard delete from origin
ipcMain.handle('recycleBin:trashConversation', async (event, convId) => {
  try {
    const conv = dbService.getConv(convId)
    if (!conv) return { success: false, error: 'Conversation not found' }
    const messages = dbService.listMsgs(convId)
    const record = dbService.createTrashItem({
      original_path: '', trash_path: '',
      original_name: conv.title || '未命名对话',
      is_directory: 0, size: messages.length, file_type: 'chat',
      category: 'chat',
      item_type: 'conversation', item_id: convId,
      payload_json: JSON.stringify({ conv, messages }),
    })
    dbService.deleteConv(convId) // ON DELETE CASCADE clears messages
    console.log(`[RecycleBin] Trashed conversation ${convId} → ${record.id} (${messages.length} msgs)`)
    return { success: true, data: record }
  } catch (err) {
    console.error('[RecycleBin] trashConversation failed:', err)
    return { success: false, error: err.message }
  }
})

// Soft-delete a single note
ipcMain.handle('recycleBin:trashNote', async (event, noteId) => {
  try {
    if (noteFileService) return await noteFileService.trashNote(noteId)
    const note = dbService.getNote(noteId)
    if (!note) return { success: false, error: 'Note not found' }
    const record = dbService.createTrashItem({
      original_path: '', trash_path: '',
      original_name: note.title || '未命名笔记',
      is_directory: 0, size: (note.content || '').length, file_type: 'note',
      category: 'note',
      item_type: 'note', item_id: noteId,
      payload_json: JSON.stringify({ note }),
    })
    dbService.deleteNote(noteId)
    return { success: true, data: record }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Soft-delete a note folder (recursive: each note and sub-folder becomes its own trash entry)
ipcMain.handle('recycleBin:trashNoteFolder', async (event, folderId) => {
  try {
    const records = []
    async function trashRecursive(fid) {
      const folder = dbService.getNoteFolder(fid)
      if (!folder) return
      const childNotes = dbService.listNotes(fid)
      const childFolders = dbService.listNoteFolders(fid)
      // Depth-first: recurse into subfolders before trashing self
      for (const sub of childFolders) await trashRecursive(sub.id)
      // Each child note becomes its own trash entry
      for (const n of childNotes) {
        if (noteFileService) {
          const result = await noteFileService.trashNote(n.id)
          if (result?.data) records.push(result.data)
        } else {
          records.push(dbService.createTrashItem({
            original_path: '', trash_path: '',
            original_name: n.title || '未命名笔记',
            is_directory: 0, size: (n.content || '').length, file_type: 'note',
            category: 'note',
            item_type: 'note', item_id: n.id,
            payload_json: JSON.stringify({ note: n }),
          }))
          dbService.deleteNote(n.id)
        }
      }
      // The folder itself
      records.push(dbService.createTrashItem({
        original_path: '', trash_path: '',
        original_name: folder.name,
        is_directory: 1, size: 0, file_type: 'folder',
        category: 'note',
        item_type: 'note_folder', item_id: fid,
        payload_json: JSON.stringify({ folder }),
      }))
      dbService.deleteNoteFolder(fid)
    }
    await trashRecursive(folderId)
    return { success: true, data: records, count: records.length }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recycleBin:restore', async (event, trashId) => {
  try {
    const record = dbService.getTrashItem(trashId)
    if (!record) return { success: false, error: 'Item not found in recycle bin' }

    if (record.item_type === 'file' || !record.item_type) {
      const restoredPath = await _restoreFileItem(record)
      dbService.deleteTrashItem(trashId)
      return { success: true, data: { restoredPath } }
    } else {
      const result = await _restoreDbItem(record)
      dbService.deleteTrashItem(trashId)
      return { success: true, data: result }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recycleBin:restoreBatch', async (event, trashIds) => {
  const results = []
  for (const id of trashIds) {
    const record = dbService.getTrashItem(id)
    if (!record) { results.push({ id, success: false, error: 'Not found' }); continue }
    try {
      if (record.item_type === 'file' || !record.item_type) {
        const restoredPath = await _restoreFileItem(record)
        dbService.deleteTrashItem(id)
        results.push({ id, success: true, restoredPath })
      } else {
        const res = await _restoreDbItem(record)
        dbService.deleteTrashItem(id)
        results.push({ id, success: true, ...res })
      }
    } catch (err) {
      results.push({ id, success: false, error: err.message })
    }
  }
  return { success: true, results }
})

ipcMain.handle('recycleBin:deletePermanently', async (event, trashId) => {
  try {
    const record = dbService.getTrashItem(trashId)
    if (!record) return { success: false, error: 'Item not found' }
    await _permanentlyDeleteItem(record)
    dbService.deleteTrashItem(trashId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('recycleBin:deleteBatchPermanently', async (event, trashIds) => {
  for (const id of trashIds) {
    const record = dbService.getTrashItem(id)
    if (!record) continue
    try {
      await _permanentlyDeleteItem(record)
      dbService.deleteTrashItem(id)
    } catch (err) {
      console.error('Failed to permanently delete trash item:', id, err)
    }
  }
  return { success: true }
})

ipcMain.handle('recycleBin:emptyTrash', async () => {
  try {
    const items = dbService.listTrash()
    for (const item of items) {
      try { await _permanentlyDeleteItem(item) } catch (e) { console.error('emptyTrash item failed:', item.id, e.message) }
    }
    dbService.emptyTrash()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// App info
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPath', (event, name) => {
  return app.getPath(name)
})

// Window controls (frameless title bar on Win/Linux)
ipcMain.handle('window:minimize', () => { win?.minimize() })
ipcMain.handle('window:maximize', () => {
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.handle('window:close', () => { win?.close() })
ipcMain.handle('window:isMaximized', () => !!win?.isMaximized())

// ── Skill directory IPC ──
ipcMain.handle('skill:install', async (event, skillId, skillData) => {
  try {
    return await skillService.installSkill(skillId, skillData)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('skill:uninstall', async (event, skillId) => {
  try {
    return await skillService.uninstallSkill(skillId)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('skill:listFiles', async (event, skillId) => {
  try {
    const files = await skillService.listSkillFiles(skillId)
    return { success: true, data: files }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('skill:readFile', async (event, skillId, relativePath) => {
  try {
    return await skillService.readSkillFile(skillId, relativePath)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('skill:isInstalled', async (event, skillId) => {
  try {
    return { success: true, data: skillService.isInstalled(skillId) }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('skill:listBuiltin', async () => {
  try {
    const data = await skillService.listBuiltinSkills()
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── MCP Server runtime IPC ───
ipcMain.handle('mcp:testServer', async (_, config) => {
  try {
    return await mcpService.testServer(config)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('mcp:syncServerTools', async (_, serverId) => {
  try {
    return await mcpService.syncServerTools(serverId)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('mcp:syncServerCapabilities', async (_, serverId) => {
  try {
    return await mcpService.syncServerTools(serverId)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('mcp:readResource', async (_, serverId, uri) => {
  try {
    return await mcpService.readResource(serverId, uri)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('mcp:getPrompt', async (_, serverId, name, args) => {
  try {
    return await mcpService.getPrompt(serverId, name, args)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── Outputs Scan ───
ipcMain.handle('outputs:scanAll', async () => {
  try {
    return await outputScanService.scanAll()
  } catch (err) {
    console.error('[OutputScan] scanAll error:', err.message)
    return []
  }
})

ipcMain.handle('outputs:scanDateFiles', async (_, agentDirName, date) => {
  try {
    return await outputScanService.scanDateFiles(agentDirName, date)
  } catch (err) {
    console.error('[OutputScan] scanDateFiles error:', err.message)
    return []
  }
})

ipcMain.handle('outputs:readFile', async (_, virtualPath) => {
  try {
    return await outputScanService.readOutputFile(virtualPath)
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── PPTX Export ───
ipcMain.handle('pptx:exportLocal', async (_, htmlPath, outputPath) => {
  try {
    return await pptxExportService.exportLocal(htmlPath, outputPath)
  } catch (err) {
    console.error('[PptxExport] exportLocal error:', err.message)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('pptx:exportCloud', async (_, htmlPath, outputPath) => {
  try {
    return await pptxExportService.exportCloud(htmlPath, outputPath)
  } catch (err) {
    console.error('[PptxExport] exportCloud error:', err.message)
    return { success: false, error: err.message }
  }
})

// Clear cache
ipcMain.handle('app:clearCache', async () => {
  try {
    if (win) await win.webContents.session.clearCache()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Relaunch app (used after workspace root change)
ipcMain.handle('app:relaunch', async () => {
  try {
    app.relaunch()
    app.exit(0)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('app:quit', () => {
  forceQuit = true
  app.quit()
  return { success: true }
})

// Get data directory size
ipcMain.handle('app:getDataSize', async () => {
  try {
    const dataRoot = workDirService?.getRootPath?.() || app.getPath('userData')
    function calcDirSize(dirPath) {
      let total = 0
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)
          if (entry.isDirectory()) {
            total += calcDirSize(fullPath)
          } else {
            try { total += fs.statSync(fullPath).size } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
      return total
    }
    const totalBytes = calcDirSize(dataRoot)
    function fmtSize(bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    }
    return { success: true, data: { total: fmtSize(totalBytes), raw: totalBytes } }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Get system info
ipcMain.handle('app:getSysInfo', () => {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    os: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
    arch: process.arch,
  }
})

// ========== Environment Detection IPC ==========

// Run a command and capture version output
function execVersion(cmd, args, parser, timeoutMs = 8000, options = {}) {
  return new Promise((resolve) => {
    try {
      const { spawn } = require('node:child_process')
      const child = spawn(cmd, args, {
        shell: options.shell !== false,
        windowsHide: true,
        env: options.env || process.env,
      })
      const stdoutChunks = []
      const stderrChunks = []
      let done = false
      const finish = (result) => { if (!done) { done = true; resolve(result) } }
      const timer = setTimeout(() => { try { child.kill() } catch { }; finish({ installed: false, error: 'timeout', raw: '' }) }, timeoutMs)
      child.stdout.on('data', (d) => { stdoutChunks.push(d) })
      child.stderr.on('data', (d) => { stderrChunks.push(d) })
      child.on('error', (err) => { clearTimeout(timer); finish({ installed: false, error: err.message, raw: '' }) })
      child.on('close', (code) => {
        clearTimeout(timer)
        const decode = (chunks) => {
          const buf = Buffer.concat(chunks)
          if (!buf.length) return ''
          if (process.platform === 'win32') {
            try {
              const gbk = new TextDecoder('gbk', { fatal: false }).decode(buf)
              const utf8 = buf.toString('utf8')
              const gbkBad = (gbk.match(/\uFFFD/g) || []).length
              const utf8Bad = (utf8.match(/\uFFFD/g) || []).length
              return gbkBad <= utf8Bad ? gbk : utf8
            } catch {
              return buf.toString('utf8')
            }
          }
          return buf.toString('utf8')
        }
        const stdout = decode(stdoutChunks)
        const stderr = decode(stderrChunks)
        const out = (stdout || stderr || '').trim()
        const rawPreview = out.split('\n').slice(0, 4).join('\n')

        // Only flag as "not found" when exit code != 0 AND output matches not-found patterns.
        // (Some tools print warnings matching these patterns on stderr but still succeed.)
        const notFoundPatterns = [
          /is not recognized as an internal or external command/i,
          /command not found/i,
          /不是内部或外部命令/,
          /系统找不到/,
          /no such file or directory/i,
        ]
        if (code !== 0) {
          if (notFoundPatterns.some(re => re.test(out)) || !out) {
            return finish({ installed: false, error: out ? 'not found' : `exit ${code}`, raw: rawPreview })
          }
        }

        const version = parser ? parser(out) : out.split('\n')[0].trim()
        // Sanity: parser should return a version string; otherwise treat as failure
        if (!version || /^\s*$/.test(version)) {
          return finish({ installed: false, error: 'no version', raw: rawPreview })
        }
        finish({ installed: true, version, raw: rawPreview })
      })
    } catch (err) {
      resolve({ installed: false, error: err.message, raw: '' })
    }
  })
}

const ALIYUN_PYPI_SIMPLE_URL = 'https://mirrors.aliyun.com/pypi/simple/'
const PYTHON_OFFICE_PACKAGES = ['python-docx', 'openpyxl', 'python-pptx', 'pandas', 'xlrd', 'pypdf']
const PYTHON_OFFICE_IMPORT_MODULES = ['docx', 'openpyxl', 'pptx', 'pandas', 'xlrd', 'pypdf']
const PYTHON_OFFICE_IMPORT_SCRIPT = [
  'import importlib.util',
  `modules=${JSON.stringify(PYTHON_OFFICE_IMPORT_MODULES)}`,
  'missing=[m for m in modules if importlib.util.find_spec(m) is None]',
  "print('missing:' + ','.join(missing) if missing else 'office-libs-ok')",
  'raise SystemExit(1 if missing else 0)',
].join('; ')
const PYTHON_CANDIDATES = [
  { cmd: 'python', args: [], label: 'python' },
  { cmd: 'py', args: ['-3'], label: 'py -3' },
  { cmd: 'py', args: [], label: 'py' },
  { cmd: 'python3', args: [], label: 'python3' },
]

function pythonCandidateArgs(candidate, args) {
  return [...(candidate.args || []), ...args]
}

function pythonOfficeImportAttempts() {
  return PYTHON_CANDIDATES.map(candidate => ({
    cmd: candidate.cmd,
    args: pythonCandidateArgs(candidate, ['-c', PYTHON_OFFICE_IMPORT_SCRIPT]),
    shell: false,
    timeoutMs: 12000,
    label: `${candidate.label} -c office-libs-check`,
  }))
}

const ENV_CHECKS = {
  python: { attempts: [{ cmd: 'python', args: ['--version'] }, { cmd: 'python3', args: ['--version'] }, { cmd: 'py', args: ['--version'] }], parse: (s) => (s.match(/Python\s+([\d.]+)/i)?.[1] || '') },
  node: { attempts: [{ cmd: 'node', args: ['--version'] }], parse: (s) => (s.match(/v?([\d.]+)/)?.[1] || '') },
  npm: { attempts: [{ cmd: 'npm', args: ['--version'] }], parse: (s) => (s.match(/([\d.]+)/)?.[1] || '') },
  pnpm: { attempts: [{ cmd: 'pnpm', args: ['--version'] }], parse: (s) => (s.match(/([\d.]+)/)?.[1] || '') },
  pip: { attempts: [{ cmd: 'pip', args: ['--version'] }, { cmd: 'pip3', args: ['--version'] }, { cmd: 'python', args: ['-m', 'pip', '--version'] }], parse: (s) => (s.match(/pip\s+([\d.]+)/i)?.[1] || '') },
  pandoc: { attempts: [{ cmd: 'pandoc', args: ['--version'] }], parse: (s) => (s.match(/pandoc(?:\.exe)?\s+([\d.]+)/i)?.[1] || '') },
  manim: { attempts: [{ cmd: 'python', args: ['-m', 'manim', '--version'] }, { cmd: 'py', args: ['-3', '-m', 'manim', '--version'] }, { cmd: 'py', args: ['-m', 'manim', '--version'] }, { cmd: 'python3', args: ['-m', 'manim', '--version'] }, { cmd: 'manim', args: ['--version'] }, { cmd: 'manimce', args: ['--version'] }], parse: (s) => (s.match(/Manim\s+Community\s+v?([\d.\w-]+)/i)?.[1] || s.match(/v?([\d]+\.[\d.]+)/)?.[1] || '') },
  ffmpeg: { attempts: [{ cmd: 'ffmpeg', args: ['-version'] }], parse: (s) => (s.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || '') },
  latex: { attempts: [{ cmd: 'latex', args: ['--version'] }, { cmd: 'pdflatex', args: ['--version'] }, { cmd: 'xelatex', args: ['--version'] }], parse: (s) => (s.match(/(?:pdfTeX|XeTeX)\s+([\d.]+)/i)?.[1] || s.match(/Version\s+([\d.]+)/i)?.[1] || '') },
  dvisvgm: { attempts: [{ cmd: 'dvisvgm', args: ['--version'] }], parse: (s) => (s.match(/dvisvgm\s+([\d.]+)/i)?.[1] || s.match(/([\d]+\.[\d.]+)/)?.[1] || '') },
  miktex: { attempts: [{ cmd: 'mpm', args: ['--version'] }], parse: (s) => (s.match(/MiKTeX\s+Package\s+Manager\s+([\d.]+)/i)?.[1] || s.match(/mpm\s+([\d.]+)/i)?.[1] || s.match(/([\d]+\.[\d.]+)/)?.[1] || '') },
  git: { attempts: [{ cmd: 'git', args: ['--version'] }], parse: (s) => (s.match(/git version\s+([\d.]+)/i)?.[1] || '') },
  officecli: { attempts: getOfficeCliCommandCandidates(['--version']), parse: (s) => (s.match(/([\d]+\.[\d.]+)/)?.[1] || s.split('\n')[0].trim()) },
  pythonOfficeLibs: { attempts: pythonOfficeImportAttempts(), parse: (s) => (/office-libs-ok/i.test(s) ? '可用' : '') },
}

async function checkOneEnv(key) {
  const def = ENV_CHECKS[key]
  if (!def) return { installed: false, error: 'unknown', raw: '' }
  let lastResult = { installed: false, error: 'not found', raw: '' }
  const baseEnv = await getSystemEnv()
  for (const attempt of def.attempts) {
    const env = attempt.source ? getOfficeCliSpawnEnv(baseEnv) : baseEnv
    const r = await execVersion(attempt.cmd, attempt.args, def.parse, attempt.timeoutMs || def.timeoutMs || 8000, { ...attempt, env })
    if (r.installed) {
      return { ...r, via: attempt.label || `${attempt.cmd} ${attempt.args.join(' ')}` }
    }
    lastResult = r
  }
  return lastResult
}

ipcMain.handle('env:check', async (_e, keys) => {
  const targets = (Array.isArray(keys) && keys.length) ? keys : Object.keys(ENV_CHECKS)
  const results = {}
  await Promise.all(targets.map(async (key) => {
    results[key] = await checkOneEnv(key)
  }))
  return { success: true, data: results }
})

function runBufferedCommand(cmd, args, { timeoutMs = 600000, maxBuffer = 4 * 1024 * 1024, shell = false } = {}) {
  return new Promise((resolve) => {
    try {
      const { spawn } = require('node:child_process')
      const child = spawn(cmd, args, {
        shell,
        windowsHide: true,
        env: { ...process.env },
      })
      const stdoutChunks = []
      const stderrChunks = []
      let stdoutSize = 0
      let stderrSize = 0
      let done = false

      const finish = (result) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(result)
      }
      const append = (chunks, data, kind) => {
        if (kind === 'stdout') {
          stdoutSize += data.length
          if (stdoutSize <= maxBuffer) chunks.push(data)
        } else {
          stderrSize += data.length
          if (stderrSize <= maxBuffer) chunks.push(data)
        }
      }

      const timer = setTimeout(() => {
        try { child.kill() } catch {}
        finish({ code: 124, stdout: '', stderr: 'command timeout', stdoutTruncated: false, stderrTruncated: false })
      }, timeoutMs)

      child.stdout.on('data', d => append(stdoutChunks, d, 'stdout'))
      child.stderr.on('data', d => append(stderrChunks, d, 'stderr'))
      child.on('error', err => finish({
        code: err.code === 'ENOENT' ? 127 : 1,
        stdout: '',
        stderr: err.message,
        stdoutTruncated: false,
        stderrTruncated: false,
      }))
      child.on('close', code => finish({
        code: code ?? 0,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdoutTruncated: stdoutSize > maxBuffer,
        stderrTruncated: stderrSize > maxBuffer,
      }))
    } catch (err) {
      resolve({ code: 1, stdout: '', stderr: err.message, stdoutTruncated: false, stderrTruncated: false })
    }
  })
}

async function findPythonPipCandidate() {
  let lastResult = null
  for (const candidate of PYTHON_CANDIDATES) {
    const args = pythonCandidateArgs(candidate, ['-m', 'pip', '--version'])
    const result = await runBufferedCommand(candidate.cmd, args, { timeoutMs: 12000 })
    if (result.code === 0) {
      return {
        candidate,
        pipVersion: (result.stdout || result.stderr || '').trim().split('\n')[0] || 'pip',
      }
    }
    lastResult = { candidate, result }
  }
  return { candidate: null, lastResult }
}

function formatCommandForDisplay(cmd, args) {
  return [cmd, ...args.map(arg => /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)].join(' ')
}

async function installPythonOfficeLibs() {
  const found = await findPythonPipCandidate()
  if (!found.candidate) {
    const detail = found.lastResult?.result
    return {
      success: false,
      error: '未找到可用的 Python/pip。请先安装 Python，并确保 python -m pip 可用。',
      detail: detail ? (detail.stderr || detail.stdout || '').slice(0, 4000) : '',
    }
  }

  const installCoreArgs = [
    '-m', 'pip',
    'install',
    '--user',
    '--upgrade',
    ...PYTHON_OFFICE_PACKAGES,
    '-i', ALIYUN_PYPI_SIMPLE_URL,
    '--trusted-host', 'mirrors.aliyun.com',
  ]
  const installArgs = pythonCandidateArgs(found.candidate, installCoreArgs)
  let result = await runBufferedCommand(found.candidate.cmd, installArgs, { timeoutMs: 10 * 60 * 1000 })
  let command = formatCommandForDisplay(found.candidate.cmd, installArgs)

  const combined = `${result.stdout || ''}\n${result.stderr || ''}`
  if (result.code !== 0 && /Can not perform a ['"]?--user['"]? install|--user install/i.test(combined)) {
    const noUserCoreArgs = installCoreArgs.filter(arg => arg !== '--user')
    const noUserArgs = pythonCandidateArgs(found.candidate, noUserCoreArgs)
    result = await runBufferedCommand(found.candidate.cmd, noUserArgs, { timeoutMs: 10 * 60 * 1000 })
    command = formatCommandForDisplay(found.candidate.cmd, noUserArgs)
  }

  const check = await checkOneEnv('pythonOfficeLibs')
  const success = result.code === 0 && check.installed
  return {
    success,
    error: success ? '' : (result.code === 0 ? '安装命令已完成，但 Office Python 库导入检测仍未通过。' : 'pip 安装 Office Python 库失败。'),
    command,
    packages: PYTHON_OFFICE_PACKAGES,
    pip: found.pipVersion,
    stdout: (result.stdout || '').slice(-12000),
    stderr: (result.stderr || '').slice(-12000),
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
    check,
  }
}

ipcMain.handle('env:installPythonOfficeLibs', async () => {
  try {
    return await installPythonOfficeLibs()
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Export all settings as JSON
ipcMain.handle('app:exportSettings', async () => {
  try {
    const allSettings = dbService.getAllSettings()
    const agents = dbService.listAgents()
    const skills = dbService.listSkills()
    const tools = dbService.listTools()
    return { success: true, data: { settings: allSettings, agents, skills, tools } }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Import settings from JSON
ipcMain.handle('app:importSettings', async (event, data) => {
  try {
    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        dbService.setSetting(key, value)
      }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ========== WorkDir IPC Handlers (module-scope) ==========

ipcMain.handle('workdir:init', async (event, rootPath) => {
  if (!workDirService) return { error: '应用未就绪' }
  try {
    const result = await workDirService.initWorkspace(rootPath)
    if (dbService && result && !result.error) {
      await dbService.relocateToWorkspace(result.rootPath)
      dbService.setSetting('workdir_root', result.rootPath)
      workDirService.loadFromDb()
      await writeWorkspaceRootPointer(result.rootPath)
    }
    await ensureWorkspaceDirs()
    return result
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('workdir:getStatus', () => {
  if (!workDirService) return { initialized: false, rootPath: null, docsPath: null }
  return workDirService.getStatus()
})

ipcMain.handle('workdir:selectRoot', async () => {
  if (!win || !workDirService) return { error: '应用未就绪' }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: '选择工作目录',
  })
  if (result.canceled) return null
  try {
    const initResult = await workDirService.initWorkspace(result.filePaths[0])
    if (dbService && initResult && !initResult.error) {
      await dbService.relocateToWorkspace(initResult.rootPath)
      dbService.setSetting('workdir_root', initResult.rootPath)
      workDirService.loadFromDb()
      await writeWorkspaceRootPointer(initResult.rootPath)
    }
    await ensureWorkspaceDirs()
    return initResult
  } catch (err) {
    return { error: err.message }
  }
})

// Select directory only — returns path without initializing
ipcMain.handle('workdir:selectDir', async () => {
  if (!win) return { error: '应用未就绪' }
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: '选择工作目录',
  })
  if (result.canceled) return null
  return { path: result.filePaths[0] }
})

// Shortcut registration
function acceleratorFromCombo(combo) {
  if (!Array.isArray(combo)) return ''
  return combo.map(k => {
    const map = { Ctrl: 'CmdOrCtrl', Space: 'Space' }
    return map[k] || k
  }).join('+')
}

async function registerGlobalShortcuts(bindings) {
  globalShortcut.unregisterAll()
  const globalKeys = ['global_invoke']
  const failed = []
  for (const key of globalKeys) {
    const combo = bindings[key]
    if (!combo) continue
    const accel = acceleratorFromCombo(combo)
    if (!accel) continue
    try {
      const registered = globalShortcut.register(accel, () => {
        if (!win) return
        if (win.isVisible()) win.hide()
        else { win.show(); win.focus() }
      })
      if (!registered) {
        console.warn(`[Shortcut] Failed to register: ${accel} (${key})`)
        failed.push({ key, accel, reason: 'conflict' })
      }
    } catch (e) {
      console.warn(`[Shortcut] Error registering ${key}:`, e.message)
      failed.push({ key, accel, reason: e.message })
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

// ========== Tray ==========

function createTray() {
  if (tray) return
  // Try icon paths in order: build/icon.png → public/favicon → empty nativeImage
  let trayIcon = nativeImage.createEmpty()
  const candidates = [
    path.join(process.env.APP_ROOT, 'build', 'icon.png'),
    path.join(process.env.APP_ROOT, 'build', 'icon.ico'),
    path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) { trayIcon = nativeImage.createFromPath(p); break }
  }
  tray = new Tray(trayIcon)
  tray.setToolTip(APP_NAME)
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { if (win) { win.show(); win.focus() } } },
    { type: 'separator' },
    { label: '退出', click: () => { forceQuit = true; app.quit() } },
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', () => { if (win) { win.isVisible() ? win.focus() : win.show() } })
}

function destroyTray() {
  if (tray) { tray.destroy(); tray = null }
}

// ========== Notification & Startup IPC ==========

ipcMain.handle('app:setStartup', (_e, enabled) => {
  try {
    applyStartupSetting(enabled)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('app:setMinimizeToTray', (_e, enabled) => {
  minimizeToTray = !!enabled
  return { ok: true }
})

ipcMain.handle('app:setTrayIcon', (_e, enabled) => {
  if (enabled) createTray()
  else destroyTray()
  return { ok: true }
})

ipcMain.handle('app:setSingleInstance', (_e, enabled) => {
  return applySingleInstance(enabled)
})

ipcMain.handle('app:notify', (_e, opts) => {
  try {
    if (Notification.isSupported()) {
      const n = new Notification({ title: opts.title || APP_NAME, body: opts.body || '', silent: !opts.sound })
      n.show()
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('app:playSound', (_e, soundName) => {
  try {
    if (!win) return { ok: false }
    const soundFile = soundName || 'complete'
    win.webContents.send('play-sound', soundFile)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ========== Model Info Map ==========

const MODEL_INFO = {
  'claude-opus-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 540, costCacheRead: 10.8, costCacheWrite: 135 },
  'claude-4-7-opus': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 540, costCacheRead: 10.8, costCacheWrite: 135 },
  'claude-sonnet-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 21.6, costOutput: 108, costCacheRead: 2.16, costCacheWrite: 27 },
  'claude-4-6-sonnet': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 21.6, costOutput: 108, costCacheRead: 2.16, costCacheWrite: 27 },
  'claude-haiku-4': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 5.76, costOutput: 28.8, costCacheRead: 0.576, costCacheWrite: 7.2 },
  'claude-4-5-haiku': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 5.76, costOutput: 28.8, costCacheRead: 0.576, costCacheWrite: 7.2 },
  'gpt-4o': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 18, costOutput: 72, costCacheRead: 1.8, costCacheWrite: 9 },
  'gpt-4o-mini': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '16k', costInput: 1.08, costOutput: 4.32, costCacheRead: 0.108, costCacheWrite: 0.54 },
  'o1': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '32k', costInput: 108, costOutput: 432, costCacheRead: 0, costCacheWrite: 0 },
  'o3-mini': { capabilities: { tool_calling: true, vision: true, search: false, vector: false, reranking: false }, maxOutput: '100k', costInput: 10.8, costOutput: 43.2, costCacheRead: 1.08, costCacheWrite: 5.4 },
  'text-embedding-3-large': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '8k', costInput: 0.94, costOutput: 0.94, costCacheRead: 0, costCacheWrite: 0 },
  'text-embedding-3-small': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '8k', costInput: 0.14, costOutput: 0.14, costCacheRead: 0, costCacheWrite: 0 },
  'deepseek-chat': { capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 1, costOutput: 2, costCacheRead: 0.1, costCacheWrite: 0.5 },
  'deepseek-reasoner': { capabilities: { tool_calling: true, vision: false, search: false, vector: false, reranking: false }, maxOutput: '8k', costInput: 4, costOutput: 16, costCacheRead: 0.4, costCacheWrite: 2 },
  'gemini-2.0-flash': { capabilities: { tool_calling: true, vision: true, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
  'gemini-2.0-pro': { capabilities: { tool_calling: true, vision: true, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
  'qwen-max': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 20, costOutput: 60, costCacheRead: 2, costCacheWrite: 10 },
  'qwen-plus': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: false }, maxOutput: '8k', costInput: 4, costOutput: 12, costCacheRead: 0.4, costCacheWrite: 2 },
  'text-embedding-v3': { capabilities: { tool_calling: false, vision: false, search: false, vector: true, reranking: false }, maxOutput: '?', costInput: 0.7, costOutput: 0.7, costCacheRead: 0, costCacheWrite: 0 },
  'command-r-plus': { capabilities: { tool_calling: true, vision: false, search: true, vector: false, reranking: true }, maxOutput: '4k', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
  'rerank-v3': { capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: true }, maxOutput: '?', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 },
}

const DEFAULT_MODEL_INFO = { capabilities: { tool_calling: false, vision: false, search: false, vector: false, reranking: false }, maxOutput: '?', costInput: 0, costOutput: 0, costCacheRead: 0, costCacheWrite: 0 }

// ========== Models Fetch IPC Handler ==========

function isAnthropicFormat(providerId, apiFormat) {
  return (apiFormat || '').toLowerCase() === 'anthropic' || (providerId || '').toLowerCase() === 'anthropic'
}

ipcMain.handle('models:fetchList', async (event, providerId, apiKey, baseUrl, apiFormat = '') => {
  if (!apiKey) return { success: false, error: '缺少 API Key' }
  if (!baseUrl) return { success: false, error: '缺少 Base URL' }
  try {
    const base = baseUrl.replace(/\/$/, '')
    let url = base + '/models'
    const headers = { 'Content-Type': 'application/json' }
    if (isAnthropicFormat(providerId, apiFormat)) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    const response = await fetch(url, { headers })
    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` }
    }
    const data = await response.json()
    const models = (data.data || data.models || data).map(m => {
      const id = m.id || m.name || m
      const info = MODEL_INFO[id] || DEFAULT_MODEL_INFO
      return { id, name: m.id || m.name || m, capabilities: info.capabilities, maxOutput: info.maxOutput, costInput: info.costInput, costOutput: info.costOutput, costCacheRead: info.costCacheRead, costCacheWrite: info.costCacheWrite }
    })
    return { success: true, models }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ========== Model Test Connection IPC Handler ==========

ipcMain.handle('models:testConnection', async (_, providerId, apiKey, baseUrl, modelId, apiFormat = '') => {
  if (!modelId) return { success: false, error: '缺少模型 ID' }
  if (!baseUrl) return { success: false, error: '缺少 Base URL' }
  if (!apiKey) return { success: false, error: '缺少 API Key' }
  const startTime = Date.now()
  try {
    const base = baseUrl.replace(/\/$/, '')
    const headers = { 'Content-Type': 'application/json' }
    let body, url

    if (isAnthropicFormat(providerId, apiFormat)) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      url = base + '/messages'
      body = JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
      url = base + '/chat/completions'
      body = JSON.stringify({ model: modelId, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
    }

    const response = await fetch(url, { method: 'POST', headers, body })
    const latencyMs = Date.now() - startTime
    if (!response.ok) {
      const text = await response.text()
      return { success: false, latencyMs, error: `HTTP ${response.status}: ${text.slice(0, 200)}` }
    }
    return { success: true, latencyMs }
  } catch (err) {
    const latencyMs = Date.now() - startTime
    return { success: false, latencyMs, error: err.message }
  }
})

// ========== Token Usage IPC Handlers ==========

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

// ========== Logs IPC Handlers ==========

ipcMain.handle('logs:read', async (_, date, filters) => {
  return logService ? logService.readLogs(date, filters) : []
})

ipcMain.handle('logs:listDates', async () => {
  return logService ? logService.listLogDates() : []
})

ipcMain.handle('logs:cleanup', async (_, beforeDate) => {
  return logService ? { deleted: logService.deleteOldLogs(beforeDate) } : { deleted: 0 }
})

ipcMain.handle('agent:healthCheck', async (_, agentIds, options = {}) => {
  if (!agentHealthService) return []
  return agentHealthService.checkAgents(agentIds, options)
})

// ========== App Lifecycle ==========

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})

app.on('window-all-closed', () => {
  if (dbService) dbService.close()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  // Handle reviva-file:// → stream local files to <img>/<audio>/<video> bypassing webSecurity
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

  dbService = new DatabaseService()
  const savedWorkspaceRoot = readWorkspaceRootPointer()
  if (savedWorkspaceRoot) {
    dbService.init(DatabaseService.workspaceDbPath(savedWorkspaceRoot))
  } else {
    dbService.init()
  }
  const singleInstance = dbService.getSetting('singleInstance') !== false
  const singleInstanceResult = applySingleInstance(singleInstance, { quitOnFail: true })
  if (singleInstance && !singleInstanceResult.ok) return

  workDirService = new WorkDirService(dbService)
  if (savedWorkspaceRoot) {
    await workDirService.initWorkspace(savedWorkspaceRoot)
    dbService.setSetting('workdir_root', savedWorkspaceRoot)
    await writeWorkspaceRootPointer(savedWorkspaceRoot)
  } else {
    workDirService.loadFromDb()
  }
  noteFileService = new NoteFileService(dbService, workDirService)
  ensureWorkspaceDirs().catch(err => console.error('[Workspace] Failed to ensure workspace dirs:', err.message))

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

  agentService = new AgentService(dbService, () => win, workDirService, mcpService)
  agentService.init()

  skillService = new SkillService(workDirService, {
    builtinSkillsDir: app.isPackaged
      ? path.join(process.resourcesPath, 'builtin-assets', 'skills')
      : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'skills'),
  })

  agentHealthService = new AgentHealthService(dbService, skillService)

  pptxExportService = new PptxExportService()

  outputScanService = new OutputScanService(workDirService, dbService)

  generationTaskService = new GenerationTaskService(dbService, () => win, workDirService, agentService)
  generationTaskService.init()

  wikiService = new WikiService(workDirService, dbService, agentService)
  wikiService.init()
  agentService.setWikiService?.(wikiService)

  // Ensure agents directory exists in workspace
  const workspaceRoot = workDirService.getRootPath()
  if (workspaceRoot) {
    const agentsDir = path.join(workspaceRoot, 'agents')
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }
    const sharedAgentDir = path.join(agentsDir, '_shared')
    if (!fs.existsSync(sharedAgentDir)) {
      fs.mkdirSync(sharedAgentDir, { recursive: true })
    }
  }

  // Install all platform skills to disk on startup
  skillService.installAllBuiltinSkills().catch(err => {
    console.error('[SkillService] Failed to install builtin skills:', err.message)
  })

  // Install all built-in conversational agents into DB
  const builtinAgentsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'builtin-assets', 'agents')
    : path.join(process.env.APP_ROOT, 'electron', 'builtin-assets', 'agents')
  try {
    await agentService.installAllBuiltinAgents(builtinAgentsDir)
  } catch (err) {
    console.error('[AgentService] Failed to install builtin agents:', err.message)
  }

  registerDbHandlers(dbService, { notes: noteFileService, noteFolders: noteFileService })
  createWindow()
  if (VITE_DEV_SERVER_URL) {
    createMenu(win)
  } else {
    Menu.setApplicationMenu(null)
    initAutoUpdater(win)
  }
})
