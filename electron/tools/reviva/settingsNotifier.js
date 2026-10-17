// Main window reference holder + settings change notifier.

let _mainWindow = null

export function setMainWindowRef(win) {
  _mainWindow = win
}

export function getMainWindowRef() {
  return _mainWindow
}

export function notifySettingsChanged(changedKeys) {
  const win = _mainWindow
  if (!win || win.isDestroyed?.()) return
  try {
    win.webContents.send('reviva:settingsChanged', { keys: changedKeys })
  } catch {
    // Window may be in a bad state — silently skip
  }
}
