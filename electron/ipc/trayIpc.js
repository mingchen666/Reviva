import { app, Menu, Tray, nativeImage, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TRAY_MENU = [
  { id: 'show-window', type: 'builtin', action: 'showWindow', label: '显示主窗口', enabled: true },
  { id: 'separator-default', type: 'separator', enabled: true },
  { id: 'settings', type: 'route', path: '/settings/notifications', label: '设置', enabled: true },
  { id: 'quit', type: 'builtin', action: 'quit', label: '退出', enabled: true },
]

export function registerTrayIpc(ipcMain, deps) {
  const { getWin, sharedState, playNotificationSound } = deps

  let tray = null
  let trayMenuConfig = DEFAULT_TRAY_MENU.map(item => ({ ...item }))

  function normalizeTrayMenuConfig(items) {
    if (!Array.isArray(items)) return DEFAULT_TRAY_MENU.map(item => ({ ...item }))
    const normalized = []
    for (const raw of items.slice(0, 30)) {
      if (!raw) continue
      const id = String(raw.id || `tray-${normalized.length}`)
      const enabled = raw.enabled !== false
      if (raw.type === 'separator') normalized.push({ id, type: 'separator', enabled })
      else if (raw.type === 'builtin' && ['showWindow', 'quit'].includes(raw.action)) normalized.push({ id, type: 'builtin', action: raw.action, label: String(raw.label || (raw.action === 'quit' ? '退出' : '显示主窗口')).slice(0, 40), enabled: raw.action === 'quit' ? true : enabled })
      else if (raw.type === 'route' && typeof raw.path === 'string' && raw.path.startsWith('/')) normalized.push({ id, type: 'route', path: raw.path.slice(0, 200), label: String(raw.label || '打开页面').slice(0, 40), enabled })
      else if (raw.type === 'url' && typeof raw.url === 'string') {
        try {
          const url = new URL(raw.url)
          if (['http:', 'https:'].includes(url.protocol)) normalized.push({ id, type: 'url', url: url.toString(), label: String(raw.label || url.hostname).slice(0, 40), enabled })
        } catch {}
      }
    }
    if (!normalized.some(item => item.type === 'builtin' && item.action === 'quit')) normalized.push({ ...DEFAULT_TRAY_MENU.at(-1) })
    return normalized.length ? normalized : DEFAULT_TRAY_MENU.map(item => ({ ...item }))
  }

  function showMainWindow() {
    const win = getWin()
    if (!win) return
    win.show()
    win.focus()
  }

  function buildTrayContextMenu() {
    return Menu.buildFromTemplate(trayMenuConfig.filter(item => item.enabled !== false).map(item => {
      if (item.type === 'separator') return { type: 'separator' }
      if (item.type === 'builtin' && item.action === 'quit') return { label: item.label, click: () => { sharedState.forceQuit = true; app.quit() } }
      if (item.type === 'builtin') return { label: item.label, click: showMainWindow }
      if (item.type === 'route') return { label: item.label, click: () => { showMainWindow(); getWin()?.webContents.send('tray:navigate', item.path) } }
      return { label: item.label, click: () => shell.openExternal(item.url) }
    }))
  }

  function rebuildTrayMenu() {
    if (tray) tray.setContextMenu(buildTrayContextMenu())
  }

  function createTray() {
    if (tray) return true
    let trayIcon = null
    const candidates = [
      path.join(process.env.VITE_PUBLIC, 'logo.png'),
      path.join(process.env.VITE_PUBLIC, 'logo.ico'),
      path.join(process.env.APP_ROOT, 'build', 'icon.png'),
      path.join(process.env.APP_ROOT, 'build', 'icon.ico'),
    ]
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue
      const source = nativeImage.createFromPath(p)
      const image = path.extname(p).toLowerCase() === '.png'
        ? source.resize({ width: 32, height: 32, quality: 'best' })
        : source
      if (!image.isEmpty()) {
        trayIcon = image
        break
      }
    }
    if (!trayIcon) {
      console.error('[Tray] Failed to load a non-empty icon. Tried:', candidates)
      return false
    }
    tray = new Tray(trayIcon)
    tray.setToolTip('Reviva')
    tray.setContextMenu(buildTrayContextMenu())
    tray.on('click', () => { const win = getWin(); if (win) { win.isVisible() ? win.focus() : win.show() } })
    return true
  }

  function destroyTray() {
    if (tray) { tray.destroy(); tray = null }
  }

  // ── Notification & Startup IPC ──
  ipcMain.handle('app:setStartup', (_e, enabled) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath,
      })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('app:setMinimizeToTray', (_e, enabled) => {
    sharedState.minimizeToTray = !!enabled
    return { ok: true }
  })

  ipcMain.handle('app:setTrayIcon', (_e, enabled) => {
    if (enabled) {
      if (!createTray()) return { ok: false, error: '托盘图标资源加载失败' }
    } else {
      destroyTray()
    }
    return { ok: true }
  })

  ipcMain.handle('app:setTrayMenu', (_e, items) => {
    trayMenuConfig = normalizeTrayMenuConfig(items)
    rebuildTrayMenu()
    return { ok: true, items: trayMenuConfig }
  })

  ipcMain.handle('app:setSingleInstance', (_e, enabled) => {
    return deps.applySingleInstance(enabled)
  })

  ipcMain.handle('app:playSound', (_e, soundName) => {
    try {
      return playNotificationSound(soundName || 'complete', { fallbackBeep: true })
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  return {
    createTray, destroyTray, rebuildTrayMenu,
    normalizeTrayMenuConfig,
    loadTrayConfig: (dbService) => {
      trayMenuConfig = normalizeTrayMenuConfig(dbService?.getSetting?.('trayMenuItems'))
    },
    createTrayFromConfig: (dbService) => {
      trayMenuConfig = normalizeTrayMenuConfig(dbService?.getSetting?.('trayMenuItems'))
      return createTray()
    },
  }
}
